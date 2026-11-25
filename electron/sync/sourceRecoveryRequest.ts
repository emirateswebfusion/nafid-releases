import { randomUUID } from 'node:crypto';
import { getDb } from '../db/localDb.js';
import * as meta from '../db/statements/sync/accountMetadata.js';
import { accountIssues } from '../db/statements/sync/supportReport.js';
import { prepareAccountRecoverySnapshot, queueAccountRecovery, runAccountRecovery } from './accountRecovery.js';
import type { RecoveryTarget } from '../db/statements/sync/accountRecovery.js';
import { ensureSourceDatabaseBackup } from '../services/sourceDatabaseBackup.js';
interface Request { job_id: string; terminal_id: string; confirmed_by: string; confirmed_at: string; targets: RecoveryTarget[] }
const key = (tenant: string) => `source_recovery_request:${tenant}`;
/** Durable intent only: no HTTP, uploads, database replacement or billing UI wait. */
export function enqueueSourceRecovery(tenant: string, user: string): void {
  const db = getDb();
  db.transaction(() => {
  if (meta.read(db).get(key(tenant))) return;
  if (meta.read(db).get(`account_recovery_command:${tenant}`)) throw new Error('Existing recovery requires review');
  const terminal = meta.read(db).get('origin') as { value: string } | undefined;
  if (!terminal?.value) throw new Error('Terminal identity unavailable');
  const request: Request = { job_id: randomUUID(), terminal_id: terminal.value, confirmed_by: user,
    confirmed_at: new Date().toISOString(), targets: [] };
  meta.write(db).run(key(tenant), JSON.stringify(request));
  meta.write(db).run(`source_recovery_confirmation:${tenant}`, JSON.stringify({ job_id: request.job_id, confirmed_at: request.confirmed_at,
    confirmed_by: user, scope: 'PENDING_ACCOUNTS' }));
  meta.write(db).run(`account_recovery_last:${tenant}`, request.job_id);
  })();
}
/** Existing serialized CLOUD cycle owns network work. A failed recovery does not discard source data. */
export async function processSourceRecoveryRequest(tenant: string, token: string): Promise<boolean> {
  const db = getDb(), stored = meta.read(db).get(key(tenant)) as { value: string } | undefined;
  if (!stored) return true;
  const request = JSON.parse(stored.value) as Request;
  try {
    const origin = meta.read(db).get('origin') as { value: string } | undefined;
    if (origin?.value !== request.terminal_id) throw new Error('Source terminal changed');
    const existing = meta.read(db).get(`account_recovery_command:${tenant}`) as { value: string } | undefined;
    if (existing && (JSON.parse(existing.value) as { job_id: string }).job_id !== request.job_id) throw new Error('Recovery job changed');
    if (!request.targets.length) {
      const count = (meta.pendingAccounts(db).get(tenant, tenant) as { n: number }).n;
      if (!count) {
        meta.write(db).run(`account_recovery_complete:${tenant}:${request.job_id}`, new Date().toISOString());
        meta.remove(db).run(key(tenant)); return true;
      }
      const rows = accountIssues(db).all(tenant, tenant) as { entity: RecoveryTarget['entity']; entity_id: string }[];
      if (count > 100 || rows.length !== count) throw new Error('Scope requires platform review');
      await ensureSourceDatabaseBackup(tenant, request.job_id);
      request.targets = rows.map(row => ({ entity: row.entity, id: row.entity_id })).sort((a,b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
      // This immutable source/queue backup commits before the request can activate any cloud writes.
      db.transaction(() => {
        prepareAccountRecoverySnapshot(tenant, { ...request, tenant_id: tenant, permit: '', expires_at: '2099-01-01T00:00:00Z' });
        meta.write(db).run(key(tenant), JSON.stringify(request));
      })();
    } else await ensureSourceDatabaseBackup(tenant, request.job_id);
    if (!meta.read(db).get(`account_recovery_command:${tenant}`)) {
      const base = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');
      if (!base) throw new Error('Cloud unavailable');
      const response = await fetch(`${base}/support/account-recovery/source-confirmed`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: request.job_id, terminal_id: request.terminal_id, confirm_complete: true, targets: request.targets }) });
      if (!response.ok) { meta.write(db).run(`account_recovery_error:${tenant}:${request.job_id}`, `HTTP_${response.status}`); return false; }
      const value: unknown = await response.json();
      if (value && typeof value === 'object') queueAccountRecovery(tenant, request.terminal_id, (value as Record<string, unknown>).recovery);
    }
    await runAccountRecovery(tenant, token);
    if (!meta.read(db).get(`account_recovery_complete:${tenant}:${request.job_id}`)) return false;
    meta.remove(db).run(key(tenant));
    return true;
  } catch { meta.write(db).run(`account_recovery_error:${tenant}:${request.job_id}`, 'RETRY_RETAINED'); return false; }
}
