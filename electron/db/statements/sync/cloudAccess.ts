import type { Db } from '../types.js';

/** SQL used by electron/sync/cloudAccess.ts. Each factory prepares its statement on the given connection. */

export const selectSettings = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'cloud_access_config' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`);
export const insertSettings = (db: Db) => db.prepare(`
      INSERT INTO settings (tenant_id, key, value, updated_at)
      VALUES (?, 'cloud_access_config', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `);
