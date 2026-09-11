export type Language = 'python' | 'javascript';
export type ExecutionMode = 'repl' | 'batch';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out';

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  timedOut?: boolean;
  oomKilled?: boolean;
}

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
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface User {
  id: string;
  email: string;
}
