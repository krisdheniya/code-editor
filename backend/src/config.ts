import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root when running locally
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://codesphere:codesphere@localhost:5432/codesphere',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production',
    expiry: process.env.JWT_EXPIRY || '24h',
  },

  execution: {
    timeoutMs: parseInt(process.env.EXEC_TIMEOUT_MS || '30000', 10),
    memoryLimit: process.env.EXEC_MEMORY_LIMIT || '128m',
    cpuLimit: parseFloat(process.env.EXEC_CPU_LIMIT || '0.5'),
    pidsLimit: parseInt(process.env.EXEC_PIDS_LIMIT || '50', 10),
  },

  warmPool: {
    size: parseInt(process.env.WARM_POOL_SIZE || '2', 10),
  },

  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
    visibilityTimeoutS: parseInt(process.env.JOB_VISIBILITY_TIMEOUT_S || '60', 10),
    recoverySweepIntervalS: parseInt(process.env.RECOVERY_SWEEP_INTERVAL_S || '30', 10),
  },
} as const;
