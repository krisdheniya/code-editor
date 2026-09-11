// ============================================================================
// Queue Producer — Enqueue batch jobs to Redis
// ============================================================================
// Uses a Redis list as a FIFO queue. Jobs are serialized as JSON and pushed
// to the left (LPUSH). Workers pop from the right (BRPOPLPUSH).
// ============================================================================

import { redis } from '../db/redis.client';
import { QueuedJob } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('queue-producer');

const QUEUE_KEY = 'codesphere:jobs:queue';

/**
 * Enqueue a job for async processing by a worker.
 */
export async function enqueueJob(job: QueuedJob): Promise<void> {
  const serialized = JSON.stringify(job);
  await redis.lpush(QUEUE_KEY, serialized);

  // Also store the job's queued state in Redis for fast status lookups
  await redis.set(`codesphere:job:${job.jobId}:state`, 'queued', 'EX', 3600);

  log.info({ jobId: job.jobId, language: job.language }, 'Job enqueued to Redis');
}

/**
 * Get current queue depth (for monitoring).
 */
export async function getQueueDepth(): Promise<number> {
  return redis.llen(QUEUE_KEY);
}

export { QUEUE_KEY };
