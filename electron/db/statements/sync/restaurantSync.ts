import type { Db } from '../types.js';

/**
 * SQL used by electron/sync/entities/restaurantSync.ts. Table names come from RESTAURANT_SYNCED_TABLES and column
 * names from PRAGMA table_info (trusted values only); row values are always bound.
 */

const LOCAL_ONLY = new Set(['row_version', 'origin', 'sync_status']);

export function tableColumns(db: Db, table: string): { columns: string[]; key: string } {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[];
  const key = info.find(c => c.pk === 1)?.name;
  if (!key) throw new Error(`No primary key on ${table}`);
  return { columns: info.map(c => c.name), key };
}

export const selectPendingRows = (db: Db, table: string) => db.prepare(
  `SELECT * FROM ${table} WHERE sync_status = 'PENDING' AND tenant_id = ? ORDER BY updated_at LIMIT 500`);

/** Marks a pushed row SYNCED unless it changed while the request was in flight (same exact `updated_at` text). */
export const markPushedRowSynced = (db: Db, table: string, key: string) => db.prepare(
  `UPDATE ${table} SET sync_status = 'SYNCED' WHERE ${key} = ? AND sync_status = 'PENDING' AND updated_at = ?`);

/**
 * Applies a row pulled from the cloud or the LAN primary. A row with unsent local changes (`PENDING`) is kept; the
 * forward-only triggers of migration 016 also refuse a stale status. Returns the column list bound by the statement.
 */
export function upsertPulledRow(db: Db, table: string): { statement: ReturnType<Db['prepare']>; columns: string[] } {
  const { columns: all, key } = tableColumns(db, table);
  const columns = all.filter(c => !LOCAL_ONLY.has(c));
  const updates = columns.filter(c => c !== key).map(c => `${c} = excluded.${c}`);
  const statement = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}, sync_status) VALUES (${columns.map(c => `@${c}`).join(', ')}, 'SYNCED')
     ON CONFLICT(${key}) DO UPDATE SET ${updates.join(', ')}, sync_status = 'SYNCED'
     WHERE ${table}.sync_status != 'PENDING'`);
  return { statement, columns };
}

export const selectFeatureFlags = (db: Db) => db.prepare(
  `SELECT value FROM settings WHERE key = 'feature_flags' AND tenant_id IN (?, 'global')
   ORDER BY CASE WHEN tenant_id = 'global' THEN 1 ELSE 0 END LIMIT 1`);
