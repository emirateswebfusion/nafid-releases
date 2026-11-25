import type { Db } from '../types.js';
import { ALL_SYNCED_TABLES } from '../../migrations/syncedTables.js';

export const MANUAL_SYNC_TABLES = [...ALL_SYNCED_TABLES, 'staff', 'staff_salaries', 'staff_transactions', 'staff_ledger', 'staff_attendance'] as const;

/** Count upload rows, not nested item tables without tenant ownership; outbox operations include nested writes. */
export function pendingUploadRows(db: Db, tenant: string): number {
  let count = 0;
  for (const table of MANUAL_SYNC_TABLES) {
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
    if (!columns.length) throw new Error('A required sync table is missing');
    if (!columns.some(column => column.name === 'tenant_id') || !columns.some(column => column.name === 'sync_status')) continue;
    count += Number((db.prepare(`SELECT COUNT(*) n FROM "${table}" WHERE (tenant_id=? OR tenant_id IN ('global','unset') OR tenant_id IS NULL) AND sync_status IN ('PENDING','FAILED')`).get(tenant) as { n: number }).n);
  }
  return count;
}
export const pendingOperations = (db: Db) => db.prepare(`SELECT COUNT(*) n,
  COALESCE(SUM(CASE WHEN attempts>=10 THEN 1 ELSE 0 END),0) exhausted FROM sync_outbox WHERE tenant_id=? AND sent_at IS NULL`);
export const retryCandidates = (db: Db) => db.prepare(`SELECT op_id,entity,last_error FROM sync_outbox
  WHERE tenant_id=? AND sent_at IS NULL AND attempts>=10 ORDER BY rowid LIMIT 200`);
/** Exactly one additional attempt, preserving operation identity, payload and financial ordering. */
export const retryTransportOperation = (db: Db) => db.prepare(`UPDATE sync_outbox SET attempts=9
  WHERE tenant_id=? AND op_id=? AND sent_at IS NULL AND attempts>=10 AND last_error IS ?`);
