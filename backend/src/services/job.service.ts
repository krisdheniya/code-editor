// ============================================================================
// JobService — Job CRUD and status management (PostgreSQL)
// ============================================================================

import { query, queryOne } from '../db/client';
import { Job, JobStatus, Language, ExecutionMode, ExecutionResult } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('job-service');

/**
 * Create a new job record in PostgreSQL.
 */
export async function createJob(
  userId: string,
  language: Language,
  code: string,
  mode: ExecutionMode
): Promise<Job> {
  const job = await queryOne<Job>(
    `INSERT INTO jobs (user_id, language, code, mode, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, language, code, mode, mode === 'repl' ? 'running' : 'queued']
  );

  if (!job) throw new Error('Failed to create job');
  log.info({ jobId: job.id, mode, language }, 'Job created');
  return normalizeJob(job);
}

/**
 * Update a job's status and optionally set started_at.
 */
export async function updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
  let extraSql = '';
  const params: any[] = [status, jobId];

  if (status === 'running') {
    extraSql = ', started_at = NOW()';
  } else if (['completed', 'failed', 'timed_out'].includes(status)) {
    extraSql = ', completed_at = NOW()';
  }

  await query(
    `UPDATE jobs SET status = $1${extraSql} WHERE id = $2`,
    params
  );

  log.info({ jobId, status }, 'Job status updated');
}

/**
 * Write execution results to a job record.
 */
export async function completeJob(
  jobId: string,
  result: ExecutionResult
): Promise<Job> {
  const status: JobStatus = result.timedOut
    ? 'timed_out'
    : result.exitCode === 0
      ? 'completed'
      : 'failed';

  const job = await queryOne<Job>(
    `UPDATE jobs SET
      status = $1,
      stdout = $2,
      stderr = $3,
      exit_code = $4,
      execution_time_ms = $5,
      error_message = $6,
      completed_at = NOW()
    WHERE id = $7
    RETURNING *`,
    [
      status,
      result.stdout,
      result.stderr,
      result.exitCode,
      result.executionTimeMs,
      result.oomKilled ? 'Memory limit exceeded' : result.timedOut ? 'Execution timed out' : null,
      jobId,
    ]
  );

  if (!job) throw new Error(`Job ${jobId} not found`);
  log.info({ jobId, status, executionTimeMs: result.executionTimeMs }, 'Job completed');
  return normalizeJob(job);
}

/**
 * Get a single job by ID, scoped to a user.
 */
export async function getJobById(jobId: string, userId: string): Promise<Job | null> {
  const job = await queryOne<Job>(
    'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
    [jobId, userId]
  );
  return job ? normalizeJob(job) : null;
}

/**
 * Get a user's execution history, newest first.
 */
export async function getJobHistory(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<Job[]> {
  const jobs = await query<Job>(
    'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset]
  );
  return jobs.map(normalizeJob);
}

/**
 * Check if a result already exists for a job (idempotency check for workers).
 */
export async function jobHasResult(jobId: string): Promise<boolean> {
  const job = await queryOne<{ status: string }>(
    'SELECT status FROM jobs WHERE id = $1',
    [jobId]
  );
  return job !== null && ['completed', 'failed', 'timed_out'].includes(job.status);
}

/**
 * Normalize snake_case column names from PostgreSQL to camelCase TypeScript properties.
 */
function normalizeJob(row: any): Job {
  return {
    id: row.id,
    userId: row.user_id,
    language: row.language,
    code: row.code,
    mode: row.mode,
    status: row.status,
    stdout: row.stdout,
    stderr: row.stderr,
    exitCode: row.exit_code,
    executionTimeMs: row.execution_time_ms,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
