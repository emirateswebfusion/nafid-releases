import type { Db } from './types.js';

/** SQL statements used by services/storeTime.ts. Each factory prepares its statement on the given connection. */

export const findOneSettingByKey = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'store_timezone' AND (tenant_id = ? OR tenant_id = 'global') ORDER BY CASE WHEN tenant_id = 'global' THEN 1 ELSE 0 END LIMIT 1`);

export const findTimeFormat = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'time_format' AND (tenant_id = ? OR tenant_id = 'global') ORDER BY CASE WHEN tenant_id = 'global' THEN 1 ELSE 0 END LIMIT 1`);
