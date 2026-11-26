import type { Db } from '../types.js';

/** SQL used by electron/sync/syncTransport.ts. Each factory prepares its statement on the given connection. */

export const selectSettings = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`);

export const selectSyncMeta = (db: Db) => db.prepare(`SELECT value FROM sync_meta WHERE key = ?`);
export const insertSyncMeta = (db: Db) => db.prepare(`INSERT INTO sync_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
