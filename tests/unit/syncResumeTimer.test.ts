import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ config: null as { jwt_token: string; tenant_id: string } | null }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/sync/localHostServer', () => ({ startLocalHostServer: vi.fn() }));
vi.mock('../../electron/sync/syncCycle', () => ({ runSyncCycle: vi.fn(), pullLightweightPendingBills: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({ tableContentHashes: {}, getSyncEndpoints: vi.fn(), checkSyncConnectivity: vi.fn(), clearAuthAndNotify: vi.fn(), cursorKey: vi.fn() }));
vi.mock('../../electron/sync/syncConfig', () => ({ getSyncIntervalMs: () => 30000, getAuthConfig: () => fixture.config }));
vi.mock('../../electron/sync/outboxSync', () => ({ outboxEnabled: () => false }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: vi.fn() }));
vi.mock('../../electron/sync/syncProgress', () => ({ getTotalPendingRecords: vi.fn(), notifyOnlineStatus: vi.fn(), notifyRenderer: vi.fn() }));
vi.mock('../../electron/sync/entities/cashSync', () => ({}));
vi.mock('../../electron/sync/entities/salesDocsSync', () => ({}));
import { setSyncActive, runInitialSync } from '../../electron/sync/syncWorker';
import { getSyncEndpoints } from '../../electron/sync/syncTransport';
import { calculateEffectiveCloudAccess } from '../../electron/sync/cloudAccess';
import { syncState } from '../../electron/sync/syncState';
import { runSyncCycle } from '../../electron/sync/syncCycle';
afterEach(() => { vi.useRealTimers(); fixture.config = null; syncState.syncCycleTimerId = null; syncState.isWorkerInitialized = false; });
it('restarts the cancelled background timer after reauthentication without creating duplicates', async () => {
  vi.useFakeTimers(); syncState.isWorkerInitialized = true; syncState.syncCycleTimerId = null; syncState.authExpiredNotified = true;
  setSyncActive(true); const timer = syncState.syncCycleTimerId;
  expect(timer).not.toBeNull(); expect(syncState.authExpiredNotified).toBe(false);
  setSyncActive(true); expect(syncState.syncCycleTimerId).toBe(timer); expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(30000);
  expect(runSyncCycle).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(1);
});
it('does not start a timer before the worker has initialized', () => {
  vi.useFakeTimers(); syncState.isWorkerInitialized = false; syncState.syncCycleTimerId = null;
  setSyncActive(true); expect(vi.getTimerCount()).toBe(0);
});
it('reports disabled cloud access rather than claiming the initial sync succeeded', async () => {
  fixture.config = { jwt_token: 'valid.jwt.token', tenant_id: 'shop' };
  vi.mocked(getSyncEndpoints).mockReturnValue({ primaryRoute: 'CLOUD', primaryUrl: 'https://cloud.example' });
  vi.mocked(calculateEffectiveCloudAccess).mockReturnValue({ isCloudAllowed: false, activeReason: 'Cloud access disabled by owner' } as ReturnType<typeof calculateEffectiveCloudAccess>);
  vi.mocked(runSyncCycle).mockClear();
  expect(await runInitialSync()).toEqual({ success: false, error: 'Cloud access disabled by owner' });
  expect(runSyncCycle).not.toHaveBeenCalled();
});
