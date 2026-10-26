import type { Db } from '../types.js';

/** SQL used by electron/sync/syncTransport.ts. Each factory prepares its statement on the given connection. */

export const selectSettings = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`);
/** Mark a pushed row SYNCED unless it was edited again since (its timestamp still matches). */
export const markSyncedIfUnchanged = (db: Db, table: string, idColumn: string, tsColumn: string) => db.prepare(`UPDATE ${table} SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING' AND ${idColumn} = ? AND (${tsColumn} = ? OR ${tsColumn} IS NULL)`);
export const markSynced = (db: Db, table: string, idColumn: string) => db.prepare(`UPDATE ${table} SET sync_status = 'SYNCED' WHERE sync_status = 'PENDING' AND ${idColumn} = ?`);

export const selectSyncMeta = (db: Db) => db.prepare(`SELECT value FROM sync_meta WHERE key = ?`);
export const insertSyncMeta = (db: Db) => db.prepare(`INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
