import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: vi.fn() }));
vi.mock('../../electron/sync/localHostServer', () => ({ startLocalHostServer: vi.fn() }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: vi.fn(), updateCloudAccessConfig: vi.fn() }));
vi.mock('../../electron/sync/outboxSync', () => ({ outboxEnabled: () => false }));
vi.mock('../../electron/sync/syncAuth', () => ({ cloudTokenUnusable: () => false, LAN_PLACEHOLDER_TOKEN: 'lan' }));
vi.mock('../../electron/sync/syncConfig', () => ({ getAuthConfig: () => ({ jwt_token: 'token', tenant_id: 't' }), getSyncIntervalMs: () => 30000 }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyRenderer: vi.fn(), getSyncProgress: vi.fn() }));
vi.mock('../../electron/sync/syncTransport', () => ({ getSyncEndpoints: () => ({ primaryRoute: 'CLOUD' }),
  checkSyncConnectivity: async () => ({ ok: true }), tableContentHashes: {} }));
vi.mock('../../electron/sync/entities/cashSync', () => ({}));
vi.mock('../../electron/sync/entities/catalogSync', () => ({ syncProducts: vi.fn(), pullProducts: vi.fn() }));
vi.mock('../../electron/sync/entities/partiesSync', () => ({ pushCustomers: vi.fn() }));
vi.mock('../../electron/sync/entities/salesDocsSync', () => ({ syncInvoices: vi.fn(), pullInvoices: vi.fn() }));
vi.mock('../../electron/sync/syncCycle', () => ({ runSyncCycle: vi.fn(async () => {}), pullLightweightPendingBills: vi.fn() }));
import { triggerUrgentInvoiceSync } from '../../electron/sync/syncWorker';
import { syncState } from '../../electron/sync/syncState';
import { runSyncCycle } from '../../electron/sync/syncCycle';
import { syncProducts } from '../../electron/sync/entities/catalogSync';
beforeEach(() => {
  vi.clearAllMocks();
  syncState.lastUrgentInvoiceSyncTime = 0;
  syncState.urgentInvoiceSyncInProgress = false;
  syncState.syncPromise = null;
});
it('checkout requests the serialized pipeline instead of a competing product upload', async () => {
  await triggerUrgentInvoiceSync();
  expect(runSyncCycle).toHaveBeenCalledTimes(1);
  expect(syncProducts).not.toHaveBeenCalled();
});
it('a checkout during an active cycle waits, then flushes changes made after its push phase', async () => {
  let finish: () => void = () => {};
  syncState.syncPromise = new Promise<void>(resolve => { finish = resolve; });
  const request = triggerUrgentInvoiceSync();
  await Promise.resolve(); await Promise.resolve();
  expect(runSyncCycle).not.toHaveBeenCalled();
  finish();
  await request;
  expect(runSyncCycle).toHaveBeenCalledTimes(1);
});
