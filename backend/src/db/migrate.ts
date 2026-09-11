import { pool } from './client';
import { createLogger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const log = createLogger('migrate');

async function migrate() {
  log.info('Running database migrations...');

  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    log.info({ file }, 'Executing migration');

    try {
      await pool.query(sql);
      log.info({ file }, 'Migration completed');
    } catch (err: any) {
      log.error({ file, err: err.message }, 'Migration failed');
      throw err;
    }
  }

  log.info('All migrations completed successfully');
  await pool.end();
}

migrate().catch((err) => {
  log.error({ err }, 'Migration process failed');
  process.exit(1);
});
