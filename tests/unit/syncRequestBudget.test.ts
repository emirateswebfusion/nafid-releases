import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ country: 'AE', idleSeconds: 0, pending: 0 }));
vi.mock('electron', () => ({
  app: { getPath: () => '' }, BrowserWindow: { getAllWindows: () => [] },
  powerMonitor: { getSystemIdleTime: () => fixture.idleSeconds },
}));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/db/statements/sync', () => ({ findTerminalCode: () => ({ get: () => ({ value: '"POS1"' }) }) }));
vi.mock('../../electron/db/statements/einvoice', () => ({ upsertEinvoiceDocument: () => ({ run: vi.fn() }) }));
vi.mock('../../electron/services/emergencyPurgeService', () => ({ dbEmergencyPurgeLocalData: vi.fn() }));
vi.mock('../../electron/services/emergencyAudit', () => ({ appendEmergencyAudit: vi.fn() }));
vi.mock('../../electron/services/authStorage', () => ({}));
vi.mock('../../electron/services/storeCountryService', () => ({ getStoreCountrySetting: () => fixture.country }));
vi.mock('../../electron/sync/syncTransport', () => ({
  fetchWithFallback: vi.fn(async () => ({ response: { ok: true, status: 200 } })),
  pullPaginated: vi.fn(async () => ({ hasChanged: false, count: 0 })),
  tableContentHashes: {}, getSyncEndpoints: () => ({ primaryRoute: 'CLOUD', primaryUrl: 'https://cloud.example' }),
  checkSyncConnectivity: vi.fn(), clearAuthAndNotify: vi.fn(), cursorKey: vi.fn(),
}));
vi.mock('../../electron/sync/localHostServer', () => ({ startLocalHostServer: vi.fn() }));
vi.mock('../../electron/sync/syncCycle', () => ({ runSyncCycle: vi.fn(), pullLightweightPendingBills: vi.fn() }));
vi.mock('../../electron/sync/syncConfig', () => ({
  getSyncIntervalMs: () => 60_000, getAuthConfig: () => ({ jwt_token: 'valid.jwt.token', tenant_id: 'shop' }), toSqliteDate: (v: unknown) => v,
}));
vi.mock('../../electron/sync/outboxSync', () => ({ outboxEnabled: () => false }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: vi.fn() }));
vi.mock('../../electron/sync/syncProgress', () => ({
  getTotalPendingRecords: () => fixture.pending, notifyOnlineStatus: vi.fn(), notifyRenderer: vi.fn(), notifyPullProgress: vi.fn(),
}));
vi.mock('../../electron/sync/entities/cashSync', () => ({}));
vi.mock('../../electron/sync/entities/salesDocsSync', () => ({}));
vi.mock('../../electron/sync/entities/restaurantSync', () => ({ restaurantModeEnabled: () => false }));

import { pollEmergencyCommands } from '../../electron/sync/emergencyCommands';
import { syncEinvoices } from '../../electron/sync/einvoiceSync';
import { fetchWithFallback } from '../../electron/sync/syncTransport';
import { runSyncCycle } from '../../electron/sync/syncCycle';
import { setSyncActive } from '../../electron/sync/syncWorker';
import { syncState } from '../../electron/sync/syncState';
import { EINVOICE_PROCESS_MS, EMERGENCY_POLL_MS, IDLE_AFTER_SECONDS, IDLE_CYCLE_MS, resetRequestBudget } from '../../electron/sync/requestBudget';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000_000); vi.clearAllMocks(); });
afterEach(() => {
  vi.useRealTimers(); resetRequestBudget(); Object.assign(fixture, { country: 'AE', idleSeconds: 0, pending: 0 });
  if (syncState.syncCycleTimerId) clearTimeout(syncState.syncCycleTimerId);
  Object.assign(syncState, { syncCycleTimerId: null, isWorkerInitialized: false, isSyncActive: false, lastCycleAt: 0 });
});

it('checks emergency commands at most every 5 minutes', async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ commands: [] })));
  await pollEmergencyCommands('t', request, vi.fn());
  await pollEmergencyCommands('t', request, vi.fn());
  expect(request).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + EMERGENCY_POLL_MS);
  await pollEmergencyCommands('t', request, vi.fn());
  expect(request).toHaveBeenCalledTimes(2);
});

it('processes UAE e-invoices every 5 minutes, or at once after an upload', async () => {
  await syncEinvoices('t', 'shop');
  await syncEinvoices('t', 'shop');
  expect(fetchWithFallback).toHaveBeenCalledTimes(1);
  await syncEinvoices('t', 'shop', { force: true });
  expect(fetchWithFallback).toHaveBeenCalledTimes(2);
  vi.setSystemTime(Date.now() + EINVOICE_PROCESS_MS);
  await syncEinvoices('t', 'shop');
  expect(fetchWithFallback).toHaveBeenCalledTimes(3);
});

it('sends no e-invoice requests for shops outside the UAE', async () => {
  fixture.country = 'IN';
  await syncEinvoices('t', 'shop', { force: true });
  expect(fetchWithFallback).not.toHaveBeenCalled();
});

it('skips background cycles while the terminal is idle and resumes when the user returns', async () => {
  syncState.isWorkerInitialized = true;
  syncState.lastCycleAt = Date.now();
  vi.mocked(runSyncCycle).mockImplementation(async () => { syncState.lastCycleAt = Date.now(); });
  fixture.idleSeconds = IDLE_AFTER_SECONDS;
  setSyncActive(true);
  await vi.advanceTimersByTimeAsync(IDLE_CYCLE_MS - 60_000);
  expect(runSyncCycle).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(runSyncCycle).toHaveBeenCalledTimes(1);
  fixture.idleSeconds = 5;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(runSyncCycle).toHaveBeenCalledTimes(2);
});

it('keeps the normal interval while records wait to be uploaded', async () => {
  syncState.isWorkerInitialized = true;
  syncState.lastCycleAt = Date.now();
  fixture.idleSeconds = IDLE_AFTER_SECONDS;
  fixture.pending = 3;
  setSyncActive(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(runSyncCycle).toHaveBeenCalledTimes(1);
});
