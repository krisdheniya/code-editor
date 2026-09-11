// ============================================================================
// Queue Consumer — Worker-side job consumption with at-least-once semantics
// ============================================================================
// Pattern: Reliable queue using BRPOPLPUSH
//
// How it works:
// 1. Worker calls BRPOPLPUSH to atomically move a job from the main queue
//    to a "processing" list. This ensures the job isn't lost if the worker
//    crashes between pop and completion.
// 2. Worker sets a visibility timeout (lock) key with TTL. If the worker
//    finishes, it removes the job from "processing" and deletes the lock.
// 3. If the worker crashes, the lock TTL expires. The recovery sweep
//    (see recovery.ts) detects this and re-queues the job.
//
// This gives us at-least-once delivery. To prevent duplicate side effects:
//    Before writing results, we check if the job already has a result
//    (idempotent completion via jobHasResult).
// ============================================================================

import { redis, redisPub } from '../db/redis.client';
import { QueuedJob } from '../types';
import { createSandboxContainer, executeInContainer, destroyContainer } from '../execution/container.manager';
import { updateJobStatus, completeJob, jobHasResult } from '../services/job.service';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('queue-consumer');

const QUEUE_KEY = 'codesphere:jobs:queue';
const PROCESSING_KEY = 'codesphere:jobs:processing';

/**
 * Start consuming jobs from the queue. This is a blocking loop.
 * Call this from the worker process entry point.
 */
export async function startConsumer(workerId: string): Promise<void> {
  log.info({ workerId }, 'Worker consumer started, waiting for jobs...');

  while (true) {
    try {
      // BRPOPLPUSH: pop from queue, push to processing list, block if empty.
      // Timeout of 5s means we periodically wake up to check for shutdown signals.
      const raw = await redis.brpoplpush(QUEUE_KEY, PROCESSING_KEY, 5);

      if (!raw) {
        // Timeout — no job available, loop again
        continue;
      }

      const job: QueuedJob = JSON.parse(raw);
      log.info({ jobId: job.jobId, workerId, language: job.language }, 'Job dequeued');

      // Set visibility timeout lock
      const lockKey = `codesphere:job:${job.jobId}:lock`;
      await redis.set(lockKey, workerId, 'EX', config.worker.visibilityTimeoutS);

      // Update job state to running
      await redis.set(`codesphere:job:${job.jobId}:state`, 'running', 'EX', 3600);
      await updateJobStatus(job.jobId, 'running');

      // Process the job
      await processJob(job, workerId);

      // Remove from processing list and delete lock on success
      await redis.lrem(PROCESSING_KEY, 1, raw);
      await redis.del(lockKey);
      await redis.del(`codesphere:job:${job.jobId}:state`);

    } catch (err: any) {
      log.error({ workerId, err: err.message }, 'Consumer loop error');
      // Brief backoff on error
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Process a single job: create container, execute, record result.
 */
async function processJob(job: QueuedJob, workerId: string): Promise<void> {
  const startTime = Date.now();

  // Idempotency check — skip if already completed by another worker
  if (await jobHasResult(job.jobId)) {
    log.warn({ jobId: job.jobId }, 'Job already has result, skipping (duplicate)');
    return;
  }

  let container;
  try {
    // Create a fresh sandboxed container
    container = await createSandboxContainer(job.language);
    await container.start();

    log.info({ jobId: job.jobId, containerId: container.id }, 'Container started for batch job');

    // Execute user code
    const result = await executeInContainer(container, job.language, job.code, config.execution.timeoutMs);

    // Another idempotency check right before writing (race condition guard)
    if (await jobHasResult(job.jobId)) {
      log.warn({ jobId: job.jobId }, 'Job completed by another worker during execution');
      return;
    }

    // Write result to PostgreSQL
    const completedJob = await completeJob(job.jobId, result);

    // Publish completion event via Redis Pub/Sub for WebSocket delivery
    await redisPub.publish(
      'codesphere:job-updates',
      JSON.stringify({
        type: 'job_update',
        jobId: job.jobId,
        data: completedJob,
      })
    );

    const totalTime = Date.now() - startTime;
    log.info({
      jobId: job.jobId,
      workerId,
      totalTime,
      executionTimeMs: result.executionTimeMs,
      status: completedJob.status,
    }, 'Batch job processed');

  } catch (err: any) {
    log.error({ jobId: job.jobId, workerId, err: err.message }, 'Batch job processing failed');

    // Record failure
    try {
      const failResult = {
        stdout: '',
        stderr: `Worker error: ${err.message}`,
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
        timedOut: false,
        oomKilled: false,
      };
      const failedJob = await completeJob(job.jobId, failResult);

      await redisPub.publish(
        'codesphere:job-updates',
        JSON.stringify({
          type: 'job_update',
          jobId: job.jobId,
          data: failedJob,
        })
      );
    } catch (writeErr: any) {
      log.error({ jobId: job.jobId, err: writeErr.message }, 'Failed to write failure result');
    }
  } finally {
    // Always clean up the container
    if (container) {
      try {
        await destroyContainer(container);
      } catch {
        // Container may be auto-removed already
      }
    }
  }
}
