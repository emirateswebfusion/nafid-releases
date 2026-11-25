import type { ManualSyncResult, ManualSyncSummary } from '../../src/data/manualSyncTypes.js';
import { getDb } from '../db/localDb.js';
import * as sql from '../db/statements/sync/manualSync.js';
import * as accounts from '../db/statements/sync/accountMetadata.js';
import { readAuthPayload, readOfflineSession, isTerminalLocked } from './authStorage.js';
import { getAuthConfig } from '../sync/syncConfig.js';
import { cloudTokenUnusable } from '../sync/syncAuth.js';
import { calculateEffectiveCloudAccess } from '../sync/cloudAccess.js';
import { getSyncEndpoints } from '../sync/syncTransport.js';
import { checkCloudStatus, runSyncCycle } from '../sync/syncCycle.js';
import { syncState } from '../sync/syncState.js';
import { reportSyncSupport } from '../sync/supportReport.js';
import { outboxEnabled } from '../sync/outboxSync.js';

let active: { tenant: string; token: string; promise: Promise<ManualSyncResult> } | null = null;
function currentSession(): Record<string, unknown> | null {
  const offline = readOfflineSession();
  const value: unknown = offline && typeof offline === 'object' ? offline : readAuthPayload();
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function sessionMatches(tenant: string, token: string, user: unknown): boolean {
  const session = currentSession(), config = getAuthConfig();
  return !isTerminalLocked() && config?.tenant_id === tenant && config.jwt_token === token
    && session?.tenant_id === tenant && session.user_id === user && ['ADMIN', 'OWNER'].includes(String(session.role));
}
export function isRetryableSyncTransportError(error: unknown): boolean {
  return typeof error === 'string' && (/^Outbox HTTP (5\d\d|429)$/.test(error)
    || /^(TypeError: )?fetch failed$|^fetch failed$|^The operation was aborted due to timeout$|^Network request failed$/.test(error));
}
export function isSafeManualRetry(row: { entity?: string; last_error: unknown }): boolean {
  // Financial probes reuse the original op ID/payload/base. Only the existing strict server writer can
  // acknowledge an identical retry or accept a captured-current-base edit; real conflicts stay rejected.
  return isRetryableSyncTransportError(row.last_error) ||
    (['parties', 'party_ledger'].includes(row.entity ?? '') && typeof row.last_error === 'string' && row.last_error.startsWith('Sync conflict:'));
}
function inspect(tenant: string): ManualSyncSummary {
  const db = getDb();
  const outbox = outboxEnabled(tenant) ? sql.pendingOperations(db).get(tenant) as { n: number; exhausted: number } : { n: 0, exhausted: 0 };
  return { pendingRows: sql.pendingUploadRows(db, tenant), queuedOperations: Number(outbox.n), exhaustedOperations: Number(outbox.exhausted),
    conflicts: Number((accounts.activeAccountConflicts(db).get(tenant, tenant) as { n: number }).n),
    incompleteDownloads: Number((accounts.countConflicts(db).get(`account_pull_pending:${tenant}:%`) as { n: number }).n) };
}
/** No body-supplied shop, cursor resets, baseline fabrication, pending clears or cloud/local overwrite policy. */
export async function manualCloudSync(value?: unknown): Promise<ManualSyncResult> {
  const config = getAuthConfig();
  const session = currentSession();
  if (!config || !session?.user_id || !sessionMatches(config.tenant_id, config.jwt_token, session.user_id)) {
    return { status: 'BLOCKED', message: 'Sign in as the shop administrator to sync this computer.' };
  }
  if (cloudTokenUnusable(config.jwt_token)) return { status: 'BLOCKED', message: 'Reconnect cloud sign-in. Your local work is kept.' };
  if (!calculateEffectiveCloudAccess().isCloudAllowed) return { status: 'BLOCKED', message: 'Cloud sync is paused by your saved settings. Your local work is kept.' };
  if (getSyncEndpoints().primaryRoute !== 'CLOUD') return { status: 'BLOCKED', message: 'This computer uses local-network sync. Run cloud sync on the cloud-connected shop computer.' };
  if (value && typeof value === 'object' && (value as Record<string, unknown>).confirm_complete === true) {
    try {
      const { enqueueSourceRecovery } = await import('../sync/sourceRecoveryRequest.js');
      if (!sessionMatches(config.tenant_id, config.jwt_token, session.user_id)) return { status: 'BLOCKED', message: 'Please sign in again.' };
      enqueueSourceRecovery(config.tenant_id, String(session.user_id));
      // Do not make the IPC/UI await HTTP or a recovery. The existing background cycle owns execution.
      void import('../sync/syncWorker.js').then(worker => {
        if (!sessionMatches(config.tenant_id, config.jwt_token, session.user_id)) return;
        worker.setSyncActive(true); return runSyncCycle();
      }).catch(() => {});
      return { status: 'QUEUED', message: 'Request saved. You can continue working.' };
    } catch { return { status: 'FAILED', message: 'The request could not be saved. Your existing data is kept.' }; }
  }
  if (active) return active.tenant === config.tenant_id && active.token === config.jwt_token ? active.promise : { status: 'BLOCKED', message: 'Another shop sync is finishing. Try again shortly.' };
  const task = (async (): Promise<ManualSyncResult> => {
    try {
      // Join the existing cycle before inspecting/retrying its queue. Never race a second engine against it.
      if (syncState.syncInProgress) await syncState.syncPromise;
      const sameSession = () => sessionMatches(config.tenant_id, config.jwt_token, session.user_id);
      if (!sameSession()) return { status: 'BLOCKED', message: 'The session changed. Sign in again before syncing.' };
      if (!(await checkCloudStatus(config.jwt_token, config.tenant_id, null)).success) return { status: 'FAILED', message: 'Cloud sync is unavailable. Check your internet connection or reconnect cloud sign-in. Your local work is kept.' };
      if (!sameSession()) return { status: 'BLOCKED', message: 'The session changed. Sign in again before syncing.' };
      const db = getDb(); let retriedOperations = 0;
      inspect(config.tenant_id); // A failed inspection blocks the operation rather than guessing an empty queue.
      if (outboxEnabled(config.tenant_id)) db.transaction(() => {
        const retry = sql.retryTransportOperation(db);
        for (const row of sql.retryCandidates(db).all(config.tenant_id) as { op_id: string; entity: string; last_error: unknown }[]) {
          if (isSafeManualRetry(row)) retriedOperations += retry.run(config.tenant_id, row.op_id, row.last_error).changes;
        }
      })();
      await reportSyncSupport(true); // Refresh operator diagnostics and receive only already-authorized recovery jobs.
      if (!sameSession()) return { status: 'BLOCKED', message: 'The session changed. Sign in again before syncing.' };
      const { setSyncActive } = await import('../sync/syncWorker.js');
      if (!sameSession()) return { status: 'BLOCKED', message: 'The session changed. Sign in again before syncing.' };
      setSyncActive(true);
      await runSyncCycle();
      if (!sameSession()) return { status: 'BLOCKED', message: 'The session changed. No sync result was confirmed for this login.' };
      const cycleFailed = syncState.lastCycleFailed || syncState.authExpiredNotified || syncState.currentActiveRoute !== 'CLOUD';
      const summary = inspect(config.tenant_id);
      await reportSyncSupport(true);
      if (!sameSession()) return { status: 'BLOCKED', message: 'The session changed. No sync result was confirmed for this login.' };
      if (cycleFailed) return { status: 'FAILED', message: 'Cloud sync could not finish. Your local work is kept; reconnect and try again.', summary, retriedOperations };
      if (summary.conflicts || summary.exhaustedOperations) return { status: 'REVIEW', message: 'Some changes need support review. Your local data is kept; no conflicting records were overwritten automatically.', summary, retriedOperations };
      if (summary.pendingRows || summary.queuedOperations || summary.incompleteDownloads) return { status: 'PENDING', message: 'Sync was attempted. Some changes are still waiting; your local work is kept.', summary, retriedOperations };
      return { status: 'CHECKED', message: 'Sync check finished. No pending local uploads were detected.', summary, retriedOperations };
    } catch { return { status: 'FAILED', message: 'Sync could not be confirmed. All local work is kept. Check the connection and try again.' }; }
  })();
  active = { tenant: config.tenant_id, token: config.jwt_token, promise: task };
  try { return await task; } finally { if (active?.promise === task) active = null; }
}
