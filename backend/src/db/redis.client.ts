import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('redis');

/**
 * Create a new Redis client. Each consumer (pub, sub, queue) should use
 * its own client instance since Redis pub/sub puts the connection in
 * subscriber mode.
 */
export function createRedisClient(label: string = 'default'): Redis {
  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,     // Required for BullMQ-style blocking reads
    enableReadyCheck: true,
    retryStrategy: (times) => {
      if (times > 10) {
        log.error({ label }, 'Redis connection failed after 10 retries');
        return null; // Stop retrying
      }
      return Math.min(times * 200, 3000);
    },
  });

  client.on('connect', () => {
    log.info({ label }, 'Redis client connected');
  });

  client.on('error', (err) => {
    log.error({ label, err: err.message }, 'Redis client error');
  });

  client.on('close', () => {
    log.warn({ label }, 'Redis connection closed');
  });

  return client;
}

// Default client for general use (queue operations, job state)
export const redis = createRedisClient('main');

// Publisher client for pub/sub notifications
export const redisPub = createRedisClient('publisher');

// Subscriber client for receiving pub/sub notifications
export const redisSub = createRedisClient('subscriber');
