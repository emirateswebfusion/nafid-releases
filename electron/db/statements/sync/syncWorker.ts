import type { Db } from '../types.js';

/** SQL used by electron/sync/syncWorker.ts. Each factory prepares its statement on the given connection. */

export const selectSettings = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'network_sync_config' LIMIT 1`);
export const deleteSyncMeta = (db: Db) => db.prepare(`DELETE FROM sync_meta WHERE key IN (?, ?)`);

export const deleteSyncMeta2 = (db: Db) => db.prepare(`DELETE FROM sync_meta WHERE key = ?`);
