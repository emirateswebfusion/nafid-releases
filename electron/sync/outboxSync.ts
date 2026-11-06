import type { WebContents } from 'electron';
import { getDb } from '../db/localDb.js';
import { enqueueLegacyPendingRows, listPendingOps, withSyncApplyGuard } from '../db/statements/outbox.js';
import { ALL_SYNCED_TABLES } from '../db/migrations/syncedTables.js';
import * as sql from '../db/statements/sync/outboxSync.js';
import { LOCAL_DEVICE_SETTING_KEYS } from './entities/settingsSync.js';
import { fetchWithFallback, getMeta, setMeta } from './syncTransport.js';
import { notifyPercent } from './syncProgress.js';
import { cloudTokenUnusable } from './syncAuth.js';
import { isRow, resultAction, usesOutbox } from './outboxResults.js';

export function outboxEnabled(tenant: string): boolean {
  const db = getDb();
  return usesOutbox(sql.setting(db, tenant, 'sync_engine'), sql.setting(db, tenant, 'network_sync_config'));
}
function localSetting(entity: string, row: Record<string, unknown>): boolean {
  return entity === 'settings' && (LOCAL_DEVICE_SETTING_KEYS.includes(String(row.key)) || row.key === 'emergency_wipe_command');
}
/** Called only by the serialized main cycle; a failed page never advances the cursor. */
export async function runOutboxSync(token: string, tenant: string, sender?: WebContents): Promise<boolean> {
  if (!outboxEnabled(tenant) || cloudTokenUnusable(token)) return false;
  const db = getDb();
  const request = async (path: string, body?: unknown) => {
    const { response } = await fetchWithFallback(path, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Outbox HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  enqueueLegacyPendingRows(db, ALL_SYNCED_TABLES);
  const through = sql.queueBoundary(db);
  let after = 0;
  for (;;) {
    const pending = listPendingOps(db, 200, { tenant, after, through });
    if (!pending.length) break;
    after = pending[pending.length - 1].queue_id!;
    const batch = pending.filter(op => {
      const payload = op.payload ? JSON.parse(op.payload) as Record<string, unknown> : { key: op.entity_id.slice(op.entity_id.indexOf(':') + 1) };
      if (localSetting(op.entity, payload)) { sql.finishOp(db, op.op_id, 'local_only'); return false; }
      return true;
    });
    if (!batch.length) continue;
    try {
      const response = await request('/api/sync/ops', { ops: batch.map(op => ({ op_id: op.op_id, tenant_id: op.tenant_id,
        entity: op.entity, entity_id: op.entity_id, op: op.op, row_version: op.row_version,
        payload: op.payload ? JSON.parse(op.payload) as unknown : null, origin: op.origin, created_at: op.created_at })) });
      if (!isRow(response) || !Array.isArray(response.results)) throw new Error('Invalid ops response');
      const results = response.results;
      for (const op of batch) {
        const matches = results.filter((r: unknown) => isRow(r) && r.op_id === op.op_id);
        const action = resultAction(matches.length === 1 ? matches[0] : undefined);
        try {
          db.transaction(() => withSyncApplyGuard(db, () => {
            if (action.current) sql.applyRow(db, op.entity, action.current, tenant);
            if (action.done) {
              sql.finishOp(db, op.op_id, action.error);
              sql.markLegacySynced(db, op);
            } else sql.failOp(db, op.op_id, action.error!);
          }))();
        } catch { sql.failOp(db, op.op_id, 'Local apply failed'); }
      }
    } catch (error) {
      for (const op of batch) sql.failOp(db, op.op_id, error instanceof Error ? error.message : 'Push failed');
      const stopped = sql.exhaustedCount(db, tenant);
      notifyPercent(0, stopped ? `${stopped} operations stopped after 10 attempts` : 'Outbox upload failed; retrying next cycle', sender);
      throw error;
    }
  }
  let updated = false;
  const cursorTenant = getMeta('server_seq_cursor_tenant');
  let since = cursorTenant === tenant ? getMeta('server_seq_cursor') || '0' : '0';
  for (;;) {
    const page = await request(`/api/sync/changes?since=${encodeURIComponent(since)}&limit=500`);
    if (!isRow(page) || !Array.isArray(page.changes) || typeof page.has_more !== 'boolean'
      || !/^[0-9]+$/.test(String(page.next_since))) throw new Error('Invalid changes response');
    const next = String(page.next_since);
    if (BigInt(next) < BigInt(since) || (page.has_more && BigInt(next) <= BigInt(since))) throw new Error('Non advancing changes cursor');
    const changes = page.changes;
    db.transaction(() => withSyncApplyGuard(db, () => {
      for (const change of changes) {
        if (!isRow(change) || typeof change.entity !== 'string' || !isRow(change.row)) throw new Error('Invalid change');
        if (localSetting(change.entity, change.row) || sql.pendingIdentity(db, change.entity, change.row, tenant)) continue;
        sql.applyRow(db, change.entity, change.row, tenant);
        updated = true;
      }
      setMeta('server_seq_cursor', next);
      setMeta('server_seq_cursor_tenant', tenant);
    }))();
    since = next;
    if (!page.has_more) break;
  }
  const exhausted = sql.exhaustedCount(db, tenant);
  notifyPercent(100, exhausted ? `Sync completed; ${exhausted} operations stopped after 10 attempts` : 'Sync completed', sender);
  return updated;
}
