import { Pool } from 'pg';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('postgres');

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  log.error({ err }, 'Unexpected PostgreSQL pool error');
});

pool.on('connect', () => {
  log.debug('New PostgreSQL connection established');
});

/**
 * Execute a parameterized query against PostgreSQL.
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  log.debug({ query: text.substring(0, 80), duration, rows: result.rowCount }, 'Query executed');
  return result.rows as T[];
}

/**
 * Execute a parameterized query and return the first row, or null.
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

/**
 * Health check for PostgreSQL connection.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
