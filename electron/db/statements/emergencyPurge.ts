import type { Db } from './types.js';

/** SQL statements used by services/emergencyPurgeService.ts. Each factory prepares its statement on the given connection. */

export const findSqliteMasterByTypeAndName = (db: Db) => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?");
