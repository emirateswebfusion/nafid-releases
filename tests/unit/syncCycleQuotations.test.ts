import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  syncQuotations: vi.fn(async () => {}),
  pullWarranties: vi.fn(async () => false),
  fetchWithFallback: vi.fn(),
}));

vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/sync/accountMetadata', () => ({ accountSyncNotice: () => '' }));
vi.mock('../../electron/sync/accountRecovery', () => ({ runAccountRecovery: vi.fn(async () => {}) }));
vi.mock('../../electron/sync/sourceRecoveryRequest', () => ({ processSourceRecoveryRequest: vi.fn(async () => true) }));
vi.mock('../../electron/sync/outboxSync', () => ({ outboxEnabled: () => false, runOutboxSync: vi.fn(async () => false) }));
vi.mock('../../electron/sync/emergencyCommands', () => ({ pollEmergencyCommands: vi.fn(async () => {}) }));
vi.mock('../../electron/sync/syncAuth', () => ({ cloudTokenUnusable: () => false }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: () => ({ isCloudAllowed: true, stateName: 'OK' }) }));
vi.mock('../../electron/sync/syncConfig', () => ({
  PULL_CONCURRENCY: 4,
  getAuthConfig: () => ({ jwt_token: 'tok', tenant_id: 'shop-1' }),
  toSqliteDate: (v: string) => v,
}));
vi.mock('../../electron/sync/syncProgress', () => ({
  getTotalPendingRecords: () => 0,
  notifyCycleComplete: vi.fn(),
  notifyOnlineStatus: vi.fn(),
  notifyPercent: vi.fn(),
  notifyProgress: vi.fn(),
  notifyRenderer: vi.fn(),
}));
vi.mock('../../electron/sync/syncTransport', () => ({
  clearAuthAndNotify: vi.fn(),
  cursorKey: (t: string, tbl: string) => `pull_cursor:${t}:${tbl}`,
  fetchWithFallback: state.fetchWithFallback,
  getMeta: () => '2026-11-26T00:00:00.000Z',
  getSyncEndpoints: () => ({ primaryRoute: 'CLOUD', primaryUrl: 'https://api.test' }),
  replaySince: (v: string | null) => v,
  setMeta: vi.fn(),
}));
vi.mock('../../electron/db/statements/sync/syncCycle', () => ({
  deleteSyncMeta: () => ({ run: vi.fn() }),
  deleteSyncMeta2: () => ({ run: vi.fn() }),
  insertInvoices: () => ({ run: vi.fn() }),
}));
vi.mock('../../electron/db/statements/outbox', () => ({ withSyncApplyGuard: (_db: unknown, fn: () => unknown) => fn() }));
vi.mock('../../electron/sync/einvoiceSync', () => ({ syncEinvoices: vi.fn(async () => false) }));
vi.mock('../../electron/sync/entities/restaurantSync', () => ({ syncRestaurant: vi.fn(async () => false) }));
vi.mock('../../electron/sync/entities/cashSync', () => ({
  pullCashCategories: vi.fn(async () => false), pullCashDrawer: vi.fn(async () => false),
  pullCashTransactions: vi.fn(async () => false), pullCashierAuditLog: vi.fn(async () => false),
  pullPaymentSourceTransactions: vi.fn(async () => false), pullPaymentSources: vi.fn(async () => false),
  syncCashCategories: vi.fn(async () => {}), syncCashDrawer: vi.fn(async () => {}),
  syncCashTransactions: vi.fn(async () => {}), syncCashierAuditLog: vi.fn(async () => {}),
  syncPaymentSourceTransactions: vi.fn(async () => {}), syncPaymentSources: vi.fn(async () => {}),
}));
vi.mock('../../electron/sync/entities/catalogSync', () => ({
  pullComboOffers: vi.fn(async () => false), pullGrades: vi.fn(async () => false),
  pullPricingTiers: vi.fn(async () => false), pullProductPricing: vi.fn(async () => false),
  pullProducts: vi.fn(async () => false), syncComboOffers: vi.fn(async () => {}),
  syncGrades: vi.fn(async () => {}), syncPricingTiers: vi.fn(async () => {}),
  syncProductPricing: vi.fn(async () => {}), syncProducts: vi.fn(async () => {}),
}));
vi.mock('../../electron/sync/entities/partiesSync', () => ({
  pullCustomers: vi.fn(async () => false), pullLoyaltyTransactions: vi.fn(async () => false),
  pullParties: vi.fn(async () => false), pullPartyLedger: vi.fn(async () => false),
  pullUsers: vi.fn(async () => false), pushCustomers: vi.fn(async () => {}),
  pushLoyaltyTransactions: vi.fn(async () => {}), syncParties: vi.fn(async () => {}),
  syncPartyLedger: vi.fn(async () => {}),
}));
vi.mock('../../electron/sync/entities/settingsSync', () => ({
  pullSettings: vi.fn(async () => false), syncSettings: vi.fn(async () => {}),
}));
vi.mock('../../electron/sync/entities/stockDocsSync', () => ({
  pullPurchaseBills: vi.fn(async () => false), pullReturns: vi.fn(async () => false),
  pullScrapCategories: vi.fn(async () => false), pullScrapTransactions: vi.fn(async () => false),
  syncPurchaseBills: vi.fn(async () => {}), syncReturns: vi.fn(async () => {}),
  syncScrapCategories: vi.fn(async () => {}), syncScrapTransactions: vi.fn(async () => {}),
}));
vi.mock('../../electron/sync/entities/salesDocsSync', () => ({
  pullInvoices: vi.fn(async () => false),
  pullQuotations: vi.fn(async () => false),
  pullWarranties: state.pullWarranties,
  syncInvoices: vi.fn(async () => {}),
  syncQuotations: state.syncQuotations,
  syncWarranties: vi.fn(async () => {}),
}));

import { syncState } from '../../electron/sync/syncState';
import { runSyncCycle } from '../../electron/sync/syncCycle';

beforeEach(() => {
  vi.clearAllMocks();
  syncState.isSyncActive = true;
  syncState.syncInProgress = false;
  syncState.syncPromise = null;
});

it('pushes pending quotations and pulls warranties when delta-pull succeeds without warranties', async () => {
  state.fetchWithFallback
    .mockResolvedValueOnce({ response: { ok: true, json: async () => ({ success: true, hasChanges: true }) } })
    .mockResolvedValueOnce({ response: { ok: true, json: async () => ({ success: true, data: {} }) } });

  await runSyncCycle();

  expect(state.syncQuotations).toHaveBeenCalledWith('tok', 'shop-1');
  expect(state.pullWarranties).toHaveBeenCalledTimes(1);
  const deltaBody = JSON.parse(state.fetchWithFallback.mock.calls[1][1].body as string);
  expect(deltaBody.since).toHaveProperty('warranties');
});

it('does not pull warranties twice when delta-pull already returned warranties', async () => {
  state.fetchWithFallback
    .mockResolvedValueOnce({ response: { ok: true, json: async () => ({ success: true, hasChanges: true }) } })
    .mockResolvedValueOnce({ response: { ok: true, json: async () => ({ success: true, data: { warranties: [{ warranty_id: 'w-1' }] } }) } });

  await runSyncCycle();

  expect(state.syncQuotations).toHaveBeenCalledWith('tok', 'shop-1');
  expect(state.pullWarranties).toHaveBeenCalledTimes(1);
});
