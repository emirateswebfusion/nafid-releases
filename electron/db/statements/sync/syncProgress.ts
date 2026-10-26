import type { Db } from '../types.js';

/** SQL used by electron/sync/syncProgress.ts. */

/** One COUNT row per table: rows of the tenant still waiting to be pushed. Params: one tenant id per table. */
export function countPendingRows(db: Db, tables: string[]) {
  const unionQueries = tables.map(t => `SELECT COUNT(*) as cnt FROM ${t} WHERE sync_status = 'PENDING' AND tenant_id = ?`).join(' UNION ALL ');
  return db.prepare(unionQueries);
}
