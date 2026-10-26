import type { Db } from './types.js';

/** SQL statements used by hardware/weighingScale.ts. Each factory prepares its statement on the given connection. */

export const findSettingsByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE key = 'scale_config'");
