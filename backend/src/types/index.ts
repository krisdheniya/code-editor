// ============================================================================
// CodeSphere — Shared TypeScript Types
// ============================================================================

/** Supported programming languages for code execution */
export type Language = 'python' | 'javascript';

/** Execution mode: synchronous REPL or asynchronous batch */
export type ExecutionMode = 'repl' | 'batch';

/** Job status state machine: queued -> running -> completed | failed | timed_out */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out';

/** Result of a single code execution */
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  timedOut: boolean;
  oomKilled: boolean;
}

/** A job record as stored in PostgreSQL */
export interface Job {
  id: string;
  userId: string;
  language: Language;
  code: string;
  mode: ExecutionMode;
  status: JobStatus;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  executionTimeMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** User record */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/** JWT payload */
export interface JwtPayload {
  userId: string;
  email: string;
}

/** Serialized job for Redis queue */
export interface QueuedJob {
  jobId: string;
  userId: string;
  language: Language;
  code: string;
  attemptId: string;
}

/** Language runner configuration */
export interface LanguageConfig {
  language: Language;
  dockerImage: string;
  fileExtension: string;
  runCommand: (filePath: string) => string[];
}

/** WebSocket message types */
export type WsMessageType = 'subscribe' | 'unsubscribe' | 'job_update';

export interface WsMessage {
  type: WsMessageType;
  jobId?: string;
  data?: Partial<Job>;
}
