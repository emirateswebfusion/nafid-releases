import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ── Connection Pool ───────────────────────────────────────────────────────────
export const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,                   // Max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => console.log('[DB] New PostgreSQL client connected'));
pool.on('error', (err) => console.error('[DB] Idle client error:', err.message));

/**
 * Run a callback inside a transaction with RLS context set for the given tenant.
 * This ensures Row Level Security policies fire correctly.
 */
export async function withTenantContext<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Set the RLS session variable for this transaction
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run a plain query (no RLS context) — for admin/system operations only.
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
