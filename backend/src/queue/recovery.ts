// ============================================================================
// Recovery Sweep — Re-queue orphaned jobs
// ============================================================================
// If a worker crashes mid-job, the job will be stuck in the "processing" list
// with its lock key expired (TTL elapsed). This sweep periodically checks
// the processing list for such orphaned jobs and moves them back to the queue.
//
// This is the safety net that, combined with BRPOPLPUSH, provides at-least-once
// delivery guarantees.
// ============================================================================

import { redis } from '../db/redis.client';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('recovery-sweep');

const QUEUE_KEY = 'codesphere:jobs:queue';
const PROCESSING_KEY = 'codesphere:jobs:processing';

/**
 * Run a single recovery sweep: check all items in the processing list
 * and re-queue any that have lost their lock (worker crashed).
 */
export async function runRecoverySweep(): Promise<number> {
  const processingItems = await redis.lrange(PROCESSING_KEY, 0, -1);

  if (processingItems.length === 0) return 0;

  let recovered = 0;

  for (const raw of processingItems) {
    try {
      const job = JSON.parse(raw);
      const lockKey = `codesphere:job:${job.jobId}:lock`;

      // Check if the lock still exists
      const lockExists = await redis.exists(lockKey);

      if (!lockExists) {
        // Lock expired — worker likely crashed. Re-queue the job.
        log.warn({ jobId: job.jobId }, 'Recovering orphaned job');

        // Increment attempt ID to track retries
        const attemptNum = parseInt(job.attemptId.split('-').pop() || '1', 10) + 1;
        job.attemptId = `${job.jobId}-${attemptNum}`;

        // Move back to main queue
        await redis.lpush(QUEUE_KEY, JSON.stringify(job));

        // Remove from processing list
        await redis.lrem(PROCESSING_KEY, 1, raw);

        recovered++;
        log.info({ jobId: job.jobId, attempt: attemptNum }, 'Job re-queued after recovery');
      }
    } catch (err: any) {
      log.error({ err: err.message, raw: raw.substring(0, 100) }, 'Error during recovery sweep');
    }
  }

  if (recovered > 0) {
    log.info({ recovered, total: processingItems.length }, 'Recovery sweep completed');
  }

  return recovered;
}

/**
 * Start periodic recovery sweeps. Returns a function to stop them.
 */
export function startRecoverySweep(): () => void {
  const intervalMs = config.worker.recoverySweepIntervalS * 1000;

  log.info({ intervalS: config.worker.recoverySweepIntervalS }, 'Starting recovery sweep');

  const interval = setInterval(async () => {
    try {
      await runRecoverySweep();
    } catch (err: any) {
      log.error({ err: err.message }, 'Recovery sweep failed');
    }
  }, intervalMs);

  return () => clearInterval(interval);
}
