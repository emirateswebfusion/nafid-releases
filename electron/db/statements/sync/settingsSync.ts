import type { Db } from '../types.js';

/** SQL used by electron/sync/entities/settingsSync.ts. Each factory prepares its statement on the given connection. */

export const markDeviceSettingsLocal = (db: Db, placeholders: string) => db.prepare(`UPDATE settings SET sync_status = 'LOCAL' WHERE (tenant_id = ? OR tenant_id = 'global') AND key IN (${placeholders}) AND sync_status = 'PENDING'`);
export const selectSettings = (db: Db) => db.prepare(`SELECT * FROM settings WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global')`);
export const updateSettings2 = (db: Db) => db.prepare(`UPDATE settings SET sync_status = 'SYNCED' WHERE key = ? AND (tenant_id = ? OR tenant_id = 'global')`);
export const insertSettings = (db: Db) => db.prepare(`
    INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
    VALUES (@tenant_id, @key, @value, 'SYNCED', @updated_at)
    ON CONFLICT(tenant_id, key) DO UPDATE SET
      value = excluded.value,
      sync_status = 'SYNCED',
      updated_at = excluded.updated_at
    WHERE settings.sync_status != 'PENDING' OR excluded.updated_at >= settings.updated_at
  `);
