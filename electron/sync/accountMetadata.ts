import type { Db } from '../db/statements/types.js';
import * as sql from '../db/statements/sync/accountMetadata.js';
import { withSyncApplyGuard } from '../db/statements/outbox.js';

type Table = 'parties' | 'party_ledger';
type Row = Record<string, unknown>;
const key = (tenant: string, table: Table, id: unknown) => `account_base:${tenant}:${table}:${String(id)}`;
const conflict = (tenant: string, table: Table, id: unknown) => `account_conflict:${tenant}:${table}:${String(id)}`;
export function accountPushRows(db: Db, tenant: string, table: Table, rows: Row[]): Row[] {
  return rows.map(row => {
    const id = row[table === 'parties' ? 'party_id' : 'ledger_id'];
    const stored = sql.read(db).get(key(tenant, table, id)) as { value: string } | undefined;
    return stored ? { ...row, _sync_base: stored.value } : { ...row };
  });
}
/** Capture only an applied cloud snapshot, never a rejected PENDING row or a LAN timestamp. */
export function rememberAccountBase(db: Db, tenant: string, table: Table, row: Row) {
  if (row.server_seq == null || !Number.isSafeInteger(Number(row.row_version))) return;
  sql.write(db).run(key(tenant, table, row[table === 'parties' ? 'party_id' : 'ledger_id']), `${row.row_version}:${row.origin ?? ''}`);
}
export function accountPushResult(db: Db, tenant: string, table: Table, sent: Row[], result: {
  synced: string[]; failed: { error: string; party_id?: string; ledger_id?: string }[]; versions?: Row[];
}) {
  for (const failed of result.failed ?? []) {
    if (failed.error?.startsWith('Sync conflict:')) sql.write(db).run(conflict(tenant, table, failed.party_id ?? failed.ledger_id), failed.error);
  }
  withSyncApplyGuard(db, () => {
    for (const receipt of result.versions ?? []) {
      if (typeof receipt.base !== 'string' || !result.synced.includes(String(receipt.id))) continue;
      const snapshot = sent.find(row => row[table === 'parties' ? 'party_id' : 'ledger_id'] === receipt.id);
      if (!snapshot) continue;
      sql.write(db).run(key(tenant, table, receipt.id), receipt.base);
      sql.remove(db).run(conflict(tenant, table, receipt.id));
      if (snapshot.row_version != null && snapshot.updated_at !== undefined) {
        sql.acknowledgeVersion(db, table).run(receipt.row_version, receipt.origin ?? null, receipt.id, tenant, snapshot.row_version, snapshot.updated_at);
      }
    }
  });
}
export function pendingAccountConflicts(db: Db, tenant: string): number {
  return Number((sql.activeAccountConflicts(db).get(tenant, tenant) as { n: number }).n);
}
export function accountSyncNotice(db: Db, tenant: string, includeDownloads = true): string | null {
  const conflicts = pendingAccountConflicts(db, tenant);
  const downloads = includeDownloads ? Number((sql.countConflicts(db).get(`account_pull_pending:${tenant}:%`) as { n: number }).n) : 0;
  const pending = Number((sql.pendingAccounts(db).get(tenant, tenant) as { n: number }).n);
  if (!conflicts && !downloads && !pending) return null;
  return [conflicts ? `${conflicts} account ${conflicts === 1 ? 'change needs' : 'changes need'} review.` : '',
    pending > conflicts ? 'Account changes are waiting to upload.' : '',
    downloads ? 'Account data is still downloading.' : '', 'Changes kept on this computer.'].filter(Boolean).join(' ');
}
