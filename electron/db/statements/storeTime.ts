import type { Db } from './types.js';

/** SQL statements used by services/storeTime.ts. Each factory prepares its statement on the given connection. */

export const findOneSettingByKey = (db: Db) => db.prepare(`SELECT value FROM settings WHERE key = 'store_timezone' AND (tenant_id = ? OR tenant_id = 'global') LIMIT 1`);
