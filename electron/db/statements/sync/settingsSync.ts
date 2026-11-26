import type { Db } from '../types.js';

/** SQL used by electron/sync/entities/settingsSync.ts. Each factory prepares its statement on the given connection. */

export const markDeviceSettingsLocal = (db: Db, placeholders: string) => db.prepare(`UPDATE settings SET sync_status = 'LOCAL' WHERE (tenant_id = ? OR tenant_id = 'global') AND key IN (${placeholders}) AND sync_status = 'PENDING'`);
export const selectSettings = (db: Db) => db.prepare(`SELECT * FROM settings WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global')`);
export const updateSettings2 = (db: Db) => db.prepare(`UPDATE settings SET sync_status = 'SYNCED' WHERE key = ? AND (tenant_id = ? OR tenant_id = 'global')`);
/** A receipt acknowledges this exact owner/value/revision, never a later edit or the other owner row. */
export const acknowledgeSettingSnapshot = (db: Db) => db.prepare(`UPDATE settings SET sync_status = 'SYNCED'
  WHERE tenant_id IS ? AND key = ? AND value IS ? AND updated_at IS ? AND row_version IS ?`);
export const insertSettings = (db: Db) => db.prepare(`
    INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
    VALUES (@tenant_id, @key, @value, 'SYNCED', @updated_at)
    ON CONFLICT(tenant_id, key) DO UPDATE SET
      value = excluded.value,
      sync_status = 'SYNCED',
      updated_at = excluded.updated_at
    WHERE settings.sync_status NOT IN ('PENDING', 'FAILED')
      AND (settings.updated_at IS NULL OR julianday(excluded.updated_at) >= julianday(settings.updated_at))
  `);

/** A push acknowledgement cannot clear a module choice edited while that push was in flight. */
export const acknowledgeFeatureFlags = (db: Db) => db.prepare(`UPDATE settings SET sync_status = 'SYNCED'
  WHERE tenant_id = ? AND key = 'feature_flags' AND value = ? AND updated_at = ?`);
