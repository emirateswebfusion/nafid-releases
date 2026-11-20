import { getDb } from '../db/localDb.js';
import * as meta from '../db/statements/sync/accountMetadata.js';
import * as sql from '../db/statements/sync/accountRecovery.js';
import { withSyncApplyGuard } from '../db/statements/outbox.js';
import { accountPushResult } from './accountMetadata.js';
interface Directive { job_id: string; tenant_id: string; terminal_id: string; permit: string; expires_at: string; targets: sql.RecoveryTarget[] }
interface Snapshot { rows: sql.RecoverySource[]; balances: { party_id: string; balance: number; gst_balance: number; estimate_balance: number; money_decimals: number }[];
  through: number; operations: Record<string, unknown>[] }
interface Receipt { entity: sql.RecoveryEntity; id: string; base: string; row_version: number; origin: string | null; server_seq: string }
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const commandKey = (tenant: string) => `account_recovery_command:${tenant}`;
export function queueAccountRecovery(tenant: string, terminal: string, value: unknown): void {
  if (!object(value) || !uuid(value.job_id) || value.tenant_id !== tenant || value.terminal_id !== terminal
    || typeof value.permit !== 'string' || !/^[0-9a-f]{64}$/.test(value.permit) || typeof value.expires_at !== 'string'
    || !Number.isFinite(Date.parse(value.expires_at)) || !Array.isArray(value.targets) || value.targets.length < 1 || value.targets.length > 100) return;
  const targets: sql.RecoveryTarget[] = [];
  for (const item of value.targets) {
    if (!object(item) || !['parties','party_ledger'].includes(String(item.entity)) || !uuid(item.id)) return;
    targets.push({ entity: item.entity as sql.RecoveryEntity, id: item.id });
  }
  if (new Set(targets.map(t => `${t.entity}:${t.id}`)).size !== targets.length) return;
  // Only an allow-listed, source-bound command is retained. Never copy arbitrary server commands.
  meta.write(getDb()).run(commandKey(tenant), JSON.stringify({ job_id: value.job_id, tenant_id: tenant, terminal_id: terminal,
    permit: value.permit, expires_at: value.expires_at, targets }));
  meta.write(getDb()).run(`account_recovery_last:${tenant}`, value.job_id);
}
export function accountRecoveryStatus(tenant: string): { job_id: string; state: string; code: string } | undefined {
  const db=getDb(), last=meta.read(db).get(`account_recovery_last:${tenant}`) as {value:string}|undefined;
  if (!last || !uuid(last.value)) return;
  const error=meta.read(db).get(`account_recovery_error:${tenant}:${last.value}`) as {value:string}|undefined;
  return { job_id:last.value,state:meta.read(db).get(`account_recovery_complete:${tenant}:${last.value}`)?'COMPLETE':error?'RETRY':'PENDING',
    code:error && /^(HTTP_[0-9]{3}|RETRY_RETAINED)$/.test(error.value)?error.value:'' };
}
function snapshot(tenant: string, command: Directive): Snapshot {
  const db = getDb(), key = `account_recovery_backup:${tenant}:${command.job_id}`;
  const saved = meta.read(db).get(key) as { value: string } | undefined;
  if (saved) return JSON.parse(saved.value) as Snapshot;
  return db.transaction(() => {
    const rows = command.targets.map(target => {
      const row = (target.entity === 'parties' ? sql.readParty(db) : sql.readLedger(db)).get(tenant, target.id) as Record<string, unknown> | undefined;
      if (!row || row.tenant_id !== tenant || !Number.isSafeInteger(row.row_version)) throw new Error('Source record unavailable');
      return { entity: target.entity, row };
    });
    if (Buffer.byteLength(JSON.stringify(rows),'utf8') > 2_000_000) throw new Error('Recovery source exceeds safe bounds');
    const through = (sql.queueBoundary(db).get() as { n: number }).n;
    const operations: Record<string, unknown>[] = [];
    let historyBytes=0;
    for (const item of rows) {
      const id=item.row[item.entity === 'parties' ? 'party_id' : 'ledger_id'];
      const size=sql.historySize(db).get(tenant,item.entity,id,through) as {n:number;bytes:number};
      historyBytes+=size.bytes;
      if (operations.length+size.n>5000 || historyBytes>8_000_000) throw new Error('Recovery history exceeds safe bounds');
      const ops = sql.coveredOperations(db).all(tenant, item.entity, item.row[item.entity === 'parties' ? 'party_id' : 'ledger_id'], through) as Record<string, unknown>[];
      if (ops.some(op => Number(op.row_version) > Number(item.row.row_version))) throw new Error('Queued history is newer than source');
      if (operations.length + ops.length > 5000) throw new Error('Recovery history exceeds safe bounds');
      operations.push(...ops);
    }
    const ids = new Set(rows.map(item => String(item.row.party_id)));
    const balances = [...ids].sort().map(id => {
      const row = sql.readParent(db).get(tenant, id) as Record<string, unknown> | undefined;
      if (!row) throw new Error('Source parent unavailable');
      const balance = { party_id: id, balance: Number(row.balance ?? 0), gst_balance: Number(row.gst_balance ?? 0), estimate_balance: Number(row.estimate_balance ?? 0), money_decimals:Number(row.money_decimals) };
      if (![balance.balance,balance.gst_balance,balance.estimate_balance].every(Number.isFinite)) throw new Error('Invalid source totals');
      return balance;
    });
    const backup = { rows, balances, through, operations };
    if (Buffer.byteLength(JSON.stringify(backup),'utf8')>12_000_000) throw new Error('Recovery backup exceeds safe bounds');
    meta.write(db).run(key, JSON.stringify(backup)); // Durable source + queue backup BEFORE networking; never overwrite it on retry.
    return backup;
  })();
}
function receipts(value: unknown, rows: sql.RecoverySource[], job: string): Receipt[] {
  if (!object(value) || value.job_id !== job || !Array.isArray(value.receipts) || value.receipts.length !== rows.length) throw new Error('Incomplete recovery receipt');
  const expected = new Set(rows.map(item => `${item.entity}:${String(item.row[item.entity === 'parties' ? 'party_id' : 'ledger_id'])}`));
  const result: Receipt[] = [];
  for (const row of value.receipts) {
    if (!object(row) || !expected.delete(`${String(row.entity)}:${String(row.id)}`) || typeof row.base !== 'string'
      || !Number.isSafeInteger(row.row_version) || Number(row.row_version) < 0 || !(row.origin === null || typeof row.origin === 'string')
      || row.base !== `${row.row_version}:${row.origin ?? ''}` || !/^[0-9]+$/.test(String(row.server_seq))) throw new Error('Invalid recovery receipt');
    result.push(row as unknown as Receipt);
  }
  if (expected.size) throw new Error('Missing recovery receipt');
  return result;
}
/** Runs only inside the existing serialized CLOUD cycle. No local financial row is replaced. */
export async function runAccountRecovery(tenant: string, token: string): Promise<void> {
  let currentJob: string | undefined;
  try {
  const db = getDb(), stored = meta.read(db).get(commandKey(tenant)) as { value: string } | undefined;
  if (!stored) return;
    const command = JSON.parse(stored.value) as Directive;
    currentJob = uuid(command.job_id) ? command.job_id : undefined;
    const terminal = meta.read(db).get('origin') as { value: string } | undefined;
    if (command.tenant_id !== tenant || command.terminal_id !== terminal?.value || !uuid(command.job_id)) return;
    if (meta.read(db).get(`account_recovery_complete:${tenant}:${command.job_id}`)) return;
    if (Date.parse(command.expires_at) <= Date.now() && !meta.read(db).get(`account_recovery_backup:${tenant}:${command.job_id}`)) return;
    const saved = snapshot(tenant, command);
    const base = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');
    if (!base) return;
    const response = await fetch(`${base}/support/account-recovery/apply`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: command.job_id, terminal_id: command.terminal_id, permit: command.permit, rows: saved.rows, balances: saved.balances }) });
    if (!response.ok) { meta.write(db).run(`account_recovery_error:${tenant}:${command.job_id}`, `HTTP_${response.status}`); return; }
    const accepted = receipts(await response.json(), saved.rows, command.job_id);
    db.transaction(() => withSyncApplyGuard(db, () => {
      for (const entity of ['parties','party_ledger'] as const) {
        const sent = saved.rows.filter(row => row.entity === entity).map(row => row.row), versions = accepted.filter(row => row.entity === entity);
        accountPushResult(db, tenant, entity, sent, { synced: versions.map(v => v.id), failed: [], versions: versions.map(v => ({ ...v })) });
      }
      for (const item of saved.rows) sql.finishCoveredOperations(db).run(new Date().toISOString(), `source_recovery:${command.job_id}`,
        tenant, item.entity, item.row[item.entity === 'parties' ? 'party_id' : 'ledger_id'], saved.through, item.row.row_version);
      meta.write(db).run(`account_recovery_complete:${tenant}:${command.job_id}`, new Date().toISOString());
      meta.remove(db).run(commandKey(tenant));
      meta.remove(db).run(`account_recovery_error:${tenant}:${command.job_id}`);
    }))();
  } catch { try { if (currentJob) meta.write(getDb()).run(`account_recovery_error:${tenant}:${currentJob}`, 'RETRY_RETAINED'); } catch { /* Optional recovery must not stop ordinary sync. */ } }
}
