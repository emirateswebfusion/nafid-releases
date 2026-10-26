import type { Db } from './types.js';

/** SQL for services/lanPairing.ts. network_sync_config is a device-local setting (never synced). */

export const listNetworkSyncConfigRows = (db: Db) => db.prepare(`SELECT tenant_id, value FROM settings WHERE key = 'network_sync_config'`);

export const updateNetworkSyncConfigRow = (db: Db) => db.prepare(`UPDATE settings SET value = ? WHERE key = 'network_sync_config' AND tenant_id = ?`);

export const insertNetworkSyncConfig = (db: Db) => db.prepare(`INSERT INTO settings (tenant_id, key, value, sync_status) VALUES ('global', 'network_sync_config', ?, 'LOCAL')`);
