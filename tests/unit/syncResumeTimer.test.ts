import { afterEach, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/sync/localHostServer', () => ({ startLocalHostServer: vi.fn() }));
vi.mock('../../electron/sync/syncCycle', () => ({ runSyncCycle: vi.fn(), pullLightweightPendingBills: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({ tableContentHashes: {}, getSyncEndpoints: vi.fn(), checkSyncConnectivity: vi.fn(), clearAuthAndNotify: vi.fn(), cursorKey: vi.fn() }));
vi.mock('../../electron/sync/syncConfig', () => ({ getSyncIntervalMs: () => 30000, getAuthConfig: () => null }));
vi.mock('../../electron/sync/outboxSync', () => ({ outboxEnabled: () => false }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: vi.fn() }));
vi.mock('../../electron/sync/syncProgress', () => ({ getTotalPendingRecords: vi.fn(), notifyOnlineStatus: vi.fn(), notifyRenderer: vi.fn() }));
vi.mock('../../electron/sync/entities/cashSync', () => ({}));
vi.mock('../../electron/sync/entities/salesDocsSync', () => ({}));
import { setSyncActive } from '../../electron/sync/syncWorker';
import { syncState } from '../../electron/sync/syncState';
import { runSyncCycle } from '../../electron/sync/syncCycle';
afterEach(() => { vi.useRealTimers(); syncState.syncCycleTimerId = null; syncState.isWorkerInitialized = false; });
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
