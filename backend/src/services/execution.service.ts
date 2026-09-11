// ============================================================================
// ExecutionService — Orchestrates REPL and batch execution paths
// ============================================================================
// Single entry point that:
//   - For REPL: acquires warm container, executes directly, returns result
//   - For Batch: creates job record, enqueues to Redis, returns job ID
// ============================================================================

import { Language, ExecutionMode, ExecutionResult, Job } from '../types';
import { warmPool } from '../execution/warm-pool';
import { executeInContainer } from '../execution/container.manager';
import { createJob, completeJob } from './job.service';
import { enqueueJob } from '../queue/producer';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('execution-service');

/**
 * Execute code in the specified mode.
 * 
 * REPL mode: synchronous execution with warm container, returns result directly.
 * Batch mode: enqueue for async processing, returns job record with status "queued".
 */
export async function executeCode(
  userId: string,
  language: Language,
  code: string,
  mode: ExecutionMode
): Promise<{ job: Job; result?: ExecutionResult }> {
  if (mode === 'repl') {
    return executeRepl(userId, language, code);
  } else {
    return executeBatch(userId, language, code);
  }
}

/**
 * REPL execution path:
 * 1. Create a job record (status: running)
 * 2. Acquire a warm container from the pool
 * 3. Execute code synchronously
 * 4. Record result in PostgreSQL
 * 5. Return result to caller
 */
async function executeRepl(
  userId: string,
  language: Language,
  code: string
): Promise<{ job: Job; result: ExecutionResult }> {
  const startTime = Date.now();
  log.info({ userId, language }, 'Starting REPL execution');

  // Create job record
  const job = await createJob(userId, language, code, 'repl');

  let container;
  try {
    // Acquire a warm container (or cold-start if pool empty)
    container = await warmPool.acquire(language);

    // Execute the code with REPL-specific shorter timeout (10s default for interactive use)
    const replTimeout = Math.min(config.execution.timeoutMs, 10_000);
    const result = await executeInContainer(container, language, code, replTimeout);

    // Record result
    const completedJob = await completeJob(job.id, result);

    const totalTime = Date.now() - startTime;
    log.info({ jobId: job.id, totalTime, executionTimeMs: result.executionTimeMs }, 'REPL execution completed');

    return { job: completedJob, result };
  } catch (err: any) {
    log.error({ jobId: job.id, err: err.message }, 'REPL execution failed');

    // Record failure
    const failResult: ExecutionResult = {
      stdout: '',
      stderr: `Execution error: ${err.message}`,
      exitCode: 1,
      executionTimeMs: Date.now() - startTime,
      timedOut: false,
      oomKilled: false,
    };
    const failedJob = await completeJob(job.id, failResult);
    return { job: failedJob, result: failResult };
  } finally {
    // Always release (destroy) the container after use
    if (container) {
      warmPool.release(container).catch(err => {
        log.warn({ err: err.message }, 'Failed to release container');
      });
    }
  }
}

/**
 * Batch execution path:
 * 1. Create a job record (status: queued)
 * 2. Enqueue the job in Redis
 * 3. Return job record to caller immediately (202-style)
 */
async function executeBatch(
  userId: string,
  language: Language,
  code: string
): Promise<{ job: Job }> {
  log.info({ userId, language }, 'Enqueueing batch execution');

  // Create job record
  const job = await createJob(userId, language, code, 'batch');

  // Enqueue for async processing
  await enqueueJob({
    jobId: job.id,
    userId,
    language,
    code,
    attemptId: `${job.id}-1`, // First attempt
  });

  log.info({ jobId: job.id }, 'Batch job enqueued');
  return { job };
}
