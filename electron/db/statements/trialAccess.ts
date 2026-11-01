import type { Db } from './types.js';

export const findTrial = (db: Db) => db.prepare('SELECT tenant_id FROM trial_access_registry WHERE tenant_id = ?');
export const rememberTrial = (db: Db) => db.prepare('INSERT OR IGNORE INTO trial_access_registry (tenant_id) VALUES (?)');
