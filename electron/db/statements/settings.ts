import type { Db } from './types.js';

/** SQL statements used by services/settingsService.ts. Each factory prepares its statement on the given connection. */

export const findSettings = (db: Db) => db.prepare(`
      SELECT tenant_id, key, value FROM settings 
      WHERE tenant_id = 'global' OR tenant_id = ?
    `);

export const findSettingsByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = ?");

export const findSettingsByKeyValue = (db: Db) => db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?');

export const findOneSettingByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1");

export const upsertSetting = (db: Db) => db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) 
      ON CONFLICT(tenant_id, key) DO UPDATE SET 
        value = EXCLUDED.value, 
        sync_status = EXCLUDED.sync_status,
        updated_at = CURRENT_TIMESTAMP
    `);
