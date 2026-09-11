import { startConsumer } from './queue/consumer';
import { startRecoverySweep } from './queue/recovery';
import { logger } from './utils/logger';
import crypto from 'crypto';

const workerId = `worker-${crypto.randomBytes(4).toString('hex')}`;

async function main() {
  logger.info({ workerId }, 'Starting CodeSphere Worker Process');

  // Start periodic recovery sweep for orphaned jobs
  const stopRecovery = startRecoverySweep();

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    logger.info({ workerId }, 'Worker SIGTERM received, stopping...');
    stopRecovery();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info({ workerId }, 'Worker SIGINT received, stopping...');
    stopRecovery();
    process.exit(0);
  });

  // Start consuming jobs (blocking loop)
  await startConsumer(workerId);
}

main().catch((err) => {
  logger.error({ workerId, err: err.message }, 'Fatal worker error');
  process.exit(1);
});
