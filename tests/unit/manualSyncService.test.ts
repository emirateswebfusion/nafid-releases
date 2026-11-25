import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  tenant: 'shop', token: 'token', role: 'ADMIN', user: 'owner', locked: false, cloud: true, route: 'CLOUD',
  pending: 0, queued: 0, exhausted: 0, conflicts: 0, downloads: 0, enabled: true,
  enqueue: vi.fn(), cycle: vi.fn(), probe: vi.fn(), report: vi.fn(), retry: vi.fn(() => ({ changes: 1 })), candidates: [] as { op_id: string; last_error: string }[],
  state: { syncInProgress: false, syncPromise: null as Promise<void> | null, lastCycleFailed: false, authExpiredNotified: false, currentActiveRoute: 'CLOUD' },
}));
vi.mock('../../electron/services/authStorage', () => ({
  readOfflineSession: () => null, isTerminalLocked: () => fixture.locked,
  readAuthPayload: () => ({ tenant_id: fixture.tenant, role: fixture.role, user_id: fixture.user }),
}));
vi.mock('../../electron/sync/syncConfig', () => ({ getAuthConfig: () => ({ tenant_id: fixture.tenant, jwt_token: fixture.token }) }));
vi.mock('../../electron/sync/syncAuth', () => ({ cloudTokenUnusable: (token: string) => token === 'expired' }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: () => ({ isCloudAllowed: fixture.cloud }) }));
vi.mock('../../electron/sync/syncTransport', () => ({ getSyncEndpoints: () => ({ primaryRoute: fixture.route }) }));
vi.mock('../../electron/sync/syncCycle', () => ({ runSyncCycle: fixture.cycle, checkCloudStatus: fixture.probe }));
vi.mock('../../electron/sync/syncState', () => ({ syncState: fixture.state }));
vi.mock('../../electron/sync/syncWorker', () => ({ setSyncActive: vi.fn() }));
vi.mock('../../electron/sync/sourceRecoveryRequest', () => ({ enqueueSourceRecovery: fixture.enqueue }));
vi.mock('../../electron/sync/supportReport', () => ({ reportSyncSupport: fixture.report }));
vi.mock('../../electron/sync/outboxSync', () => ({ outboxEnabled: () => fixture.enabled }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({ transaction: (fn: () => void) => fn }) }));
vi.mock('../../electron/db/statements/sync/manualSync', () => ({
  pendingUploadRows: () => fixture.pending,
  pendingOperations: () => ({ get: () => ({ n: fixture.queued, exhausted: fixture.exhausted }) }),
  retryCandidates: () => ({ all: () => fixture.candidates }), retryTransportOperation: () => ({ run: fixture.retry }),
}));
vi.mock('../../electron/db/statements/sync/accountMetadata', () => ({
  activeAccountConflicts: () => ({ get: () => ({ n: fixture.conflicts }) }), countConflicts: () => ({ get: () => ({ n: fixture.downloads }) }),
}));
import { manualCloudSync, isRetryableSyncTransportError, isSafeManualRetry } from '../../electron/services/manualSyncService';
beforeEach(() => {
  Object.assign(fixture, { tenant: 'shop', token: 'token', role: 'ADMIN', user: 'owner', locked: false, cloud: true, route: 'CLOUD', pending: 0, queued: 0, exhausted: 0, conflicts: 0, downloads: 0, enabled: true, candidates: [] });
  Object.assign(fixture.state, { syncInProgress: false, syncPromise: null, lastCycleFailed: false, authExpiredNotified: false, currentActiveRoute: 'CLOUD' });
  fixture.cycle.mockResolvedValue(undefined); fixture.probe.mockResolvedValue({ success: true }); fixture.report.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());
it('persists confirmed source intent and returns without awaiting a running cloud cycle', async () => {
  fixture.cycle.mockImplementationOnce(() => new Promise(() => {}));
  const result = await manualCloudSync({ confirm_complete: true });
  expect(result.status).toBe('QUEUED');
  expect(fixture.enqueue).toHaveBeenCalledWith('shop','owner');
  expect(fixture.probe).not.toHaveBeenCalled();
  expect(fixture.retry).not.toHaveBeenCalled();
});
it.each(['Outbox HTTP 500', 'Outbox HTTP 503', 'Outbox HTTP 429', 'fetch failed', 'TypeError: fetch failed'])('permits only recognized transport retries: %s', error => expect(isRetryableSyncTransportError(error)).toBe(true));
it.each(['Sync conflict: newer cloud copy', 'Outbox HTTP 409', 'Outbox HTTP 401', 'Invalid amount', 'Missing parent', 'private server failure', null])('does not reset an unsafe or unknown failure: %s', error => expect(isRetryableSyncTransportError(error)).toBe(false));
it('permits financial conflict probes only through the existing guarded account protocol, never arbitrary validation errors', () => {
  expect(isSafeManualRetry({ entity: 'parties', last_error: 'Sync conflict: missing base' })).toBe(true);
  expect(isSafeManualRetry({ entity: 'party_ledger', last_error: 'Sync conflict: newer revision' })).toBe(true);
  expect(isSafeManualRetry({ entity: 'products', last_error: 'Sync conflict: arbitrary error' })).toBe(false);
  expect(isSafeManualRetry({ entity: 'party_ledger', last_error: 'Invalid amount' })).toBe(false);
});
it('retries the same transport operation once without touching conflicts, and reports remaining review truthfully', async () => {
  fixture.candidates = [{ op_id: 'network', last_error: 'Outbox HTTP 503' }, { op_id: 'conflict', last_error: 'Sync conflict: newer cloud copy' }];
  fixture.conflicts = 1; fixture.pending = 2; fixture.queued = 2;
  const result = await manualCloudSync();
  expect(fixture.retry).toHaveBeenCalledExactlyOnceWith('shop', 'network', 'Outbox HTTP 503');
  expect(result.status).toBe('REVIEW'); expect(result.retriedOperations).toBe(1);
  expect(fixture.report).toHaveBeenCalledWith(true);
});
it('does not report completion while uploads or downloads remain', async () => {
  fixture.downloads = 1;
  expect((await manualCloudSync()).status).toBe('PENDING');
  fixture.downloads = 0;
  expect((await manualCloudSync()).status).toBe('CHECKED');
});
it('fails truthfully when a swallowed cycle error was recorded or the cloud probe fails', async () => {
  fixture.state.lastCycleFailed = true;
  expect((await manualCloudSync()).status).toBe('FAILED');
  fixture.probe.mockResolvedValueOnce({ success: false });
  fixture.cycle.mockClear();
  expect((await manualCloudSync()).status).toBe('FAILED'); expect(fixture.cycle).not.toHaveBeenCalled();
});
it.each(['STAFF', 'SUPER_ADMIN'])('denies manual cloud repair for %s sessions', async role => {
  fixture.role = role;
  expect((await manualCloudSync()).status).toBe('BLOCKED'); expect(fixture.cycle).not.toHaveBeenCalled();
});
it('preserves saved cloud policy, terminal lock and LAN routing', async () => {
  fixture.cloud = false; expect((await manualCloudSync()).status).toBe('BLOCKED');
  fixture.cloud = true; fixture.locked = true; expect((await manualCloudSync()).status).toBe('BLOCKED');
  fixture.locked = false; fixture.route = 'LAN'; expect((await manualCloudSync()).status).toBe('BLOCKED');
  expect(fixture.retry).not.toHaveBeenCalled(); expect(fixture.cycle).not.toHaveBeenCalled();
});
it('coalesces repeated clicks and never runs another engine beside an existing cycle', async () => {
  let finish!: () => void;
  fixture.state.syncInProgress = true; fixture.state.syncPromise = new Promise<void>(resolve => { finish = resolve; });
  const first = manualCloudSync(), second = manualCloudSync();
  expect(fixture.probe).not.toHaveBeenCalled(); finish();
  await Promise.all([first, second]); expect(fixture.cycle).toHaveBeenCalledTimes(1);
});
it('stops when a user changes during the cloud probe, without retrying or running a different shop', async () => {
  fixture.probe.mockImplementationOnce(async () => { fixture.user = 'other'; return { success: true }; });
  expect((await manualCloudSync()).status).toBe('BLOCKED');
  expect(fixture.retry).not.toHaveBeenCalled(); expect(fixture.cycle).not.toHaveBeenCalled();
});
