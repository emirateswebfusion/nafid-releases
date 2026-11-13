import { outboxEnabled, runOutboxSync } from './outboxSync.js';
import { type WebContents } from 'electron';
import { getDb } from '../db/localDb.js';
import { pollEmergencyCommands } from './emergencyCommands.js';
import { cloudTokenUnusable } from './syncAuth.js';
import { syncState } from './syncState.js';
import { calculateEffectiveCloudAccess } from './cloudAccess.js';
import { pullCashCategories, pullCashDrawer, pullCashTransactions, pullCashierAuditLog, pullPaymentSourceTransactions, pullPaymentSources, syncCashCategories, syncCashDrawer, syncCashTransactions, syncCashierAuditLog, syncPaymentSourceTransactions, syncPaymentSources } from './entities/cashSync.js';
import { pullComboOffers, pullGrades, pullPricingTiers, pullProductPricing, pullProducts, syncComboOffers, syncGrades, syncPricingTiers, syncProductPricing, syncProducts } from './entities/catalogSync.js';
import { pullCustomers, pullLoyaltyTransactions, pullParties, pullPartyLedger, pullUsers, pushCustomers, pushLoyaltyTransactions, syncParties, syncPartyLedger } from './entities/partiesSync.js';
import { pullInvoices, pullQuotations, pullWarranties, syncInvoices, syncWarranties } from './entities/salesDocsSync.js';
import { pullSettings, syncSettings } from './entities/settingsSync.js';
import { syncEinvoices } from './einvoiceSync.js';
import { pullPurchaseBills, pullReturns, pullScrapCategories, pullScrapTransactions, syncPurchaseBills, syncReturns, syncScrapCategories, syncScrapTransactions } from './entities/stockDocsSync.js';
import { PULL_CONCURRENCY, getAuthConfig, toSqliteDate } from './syncConfig.js';
import { getTotalPendingRecords, notifyCycleComplete, notifyOnlineStatus, notifyPercent, notifyProgress, notifyRenderer } from './syncProgress.js';
import { clearAuthAndNotify, cursorKey, fetchWithFallback, getMeta, getSyncEndpoints, replaySince, setMeta } from './syncTransport.js';
import * as syncCycleSql from '../db/statements/sync/syncCycle.js';
import { withSyncApplyGuard } from '../db/statements/outbox.js';
import { syncRestaurant } from './entities/restaurantSync.js';

/** One sync cycle: cloud status check, lightweight pending-bill pull, unified delta pull and the full push / pull sequence. */
export async function checkCloudStatus(token: string, tenantId: string, sinceTimestamp: string | null): Promise<{ success: boolean; hasChanges: boolean; maxUpdatedAt?: string | null }> {
  try {
    const urlPath = sinceTimestamp ? `/api/sync/check-status?since=${encodeURIComponent(sinceTimestamp)}` : '/api/sync/check-status';
    const { response } = await fetchWithFallback(urlPath, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { success: false, hasChanges: true };
    const res = await response.json();
    if (!res.success) return { success: false, hasChanges: true };
    return { success: true, hasChanges: res.hasChanges !== false, maxUpdatedAt: res.maxUpdatedAt };
  } catch {
    return { success: false, hasChanges: true };
  }
}

export async function pullLightweightPendingBills(token: string, tenantId: string): Promise<{ success: boolean; updated: boolean }> {
  const db = getDb();
  const cursorTs = getMeta(cursorKey(tenantId, 'pending_bills_lightweight_ts')) || null;
  const cursorId = getMeta(cursorKey(tenantId, 'pending_bills_lightweight_id')) || null;
  
  let urlPath = '/api/sync/pending-bills-lightweight';
  if (cursorTs) {
    urlPath += `?since=${encodeURIComponent(cursorTs)}`;
    if (cursorId) {
      urlPath += `&last_id=${encodeURIComponent(cursorId)}`;
    }
  }

  try {
    const { response } = await fetchWithFallback(urlPath, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return { success: false, updated: false };
    const res = await response.json();
    if (!res.success || !Array.isArray(res.bills)) return { success: false, updated: false };
    if (res.bills.length === 0) return { success: true, updated: false };

    let hasInsertedNew = false;
    let lastTs = cursorTs;
    let lastId = cursorId;

    const upsertLightweightInv = syncCycleSql.insertInvoices(db);

    const tx = db.transaction((bills: Record<string, unknown>[]) => {
      for (const b of bills) {
        if (!b.invoice_id) continue;
        upsertLightweightInv.run({
          invoice_id: b.invoice_id,
          tenant_id: tenantId,
          invoice_number: b.invoice_number,
          customer_name: b.customer_name || null,
          grand_total: Number(b.grand_total) || 0,
          payment_method: b.payment_method || 'PENDING',
          user_id: b.user_id || null,
          created_at: toSqliteDate((b.created_at as string | number | Date | null | undefined)),
          updated_at: toSqliteDate((b.updated_at as string | number | Date | null | undefined as string | number | Date | null | undefined) || (b.created_at as string | number | Date | null | undefined as string | number | Date | null | undefined)),
        });
        hasInsertedNew = true;
        if (b.created_at) {
          lastTs = new Date((b.created_at as string | number)).toISOString();
          lastId = (b.invoice_id as string | null);
        }
      }
    });

    withSyncApplyGuard(db, () => tx(res.bills));
    if (lastTs && lastId) {
      setMeta(cursorKey(tenantId, 'pending_bills_lightweight_ts'), lastTs);
      setMeta(cursorKey(tenantId, 'pending_bills_lightweight_id'), lastId);
    }
    return { success: true, updated: hasInsertedNew };
  } catch {
    return { success: false, updated: false };
  }
}

export async function unifiedDeltaPull(token: string, tenantId: string): Promise<{ success: boolean; dataUpdated: boolean }> {
  const tables = [
    'product_grades', 'pricing_tiers', 'products', 'product_pricing', 'settings',
    'parties', 'party_ledger', 'customers', 'loyalty_transactions', 'scrap_categories',
    'scrap_transactions', 'purchase_bills', 'cash_drawer', 'cash_transactions',
    'cashier_audit_log', 'cash_categories', 'returns', 'payment_sources',
    'payment_source_transactions', 'combo_offers', 'quotations', 'invoices', 'users'
  ];

  const sinceMap: Record<string, string | null> = {};
  for (const t of tables) {
    sinceMap[t] = replaySince(getMeta(cursorKey(tenantId, t)));
  }

  try {
    const { response } = await fetchWithFallback('/api/sync/delta-pull', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ since: sinceMap }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return { success: false, dataUpdated: false };
    const result = await response.json();
    if (!result.success || !result.data) return { success: false, dataUpdated: false };

    const data = result.data;
    let anyHasRows = false;
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        anyHasRows = true;
        break;
      }
    }

    if (!anyHasRows) {
      return { success: true, dataUpdated: false };
    }

    let dataUpdated = false;
    if (data.product_grades?.length) if (await pullGrades(token, tenantId)) dataUpdated = true;
    if (data.pricing_tiers?.length) if (await pullPricingTiers(token, tenantId)) dataUpdated = true;
    if (data.products?.length) if (await pullProducts(token, tenantId)) dataUpdated = true;
    if (data.product_pricing?.length) if (await pullProductPricing(token, tenantId)) dataUpdated = true;
    if (data.settings?.length) if (await pullSettings(token, tenantId)) dataUpdated = true;
    if (data.parties?.length) if (await pullParties(token, tenantId)) dataUpdated = true;
    if (data.party_ledger?.length) if (await pullPartyLedger(token, tenantId)) dataUpdated = true;
    if (data.customers?.length) if (await pullCustomers(token, tenantId)) dataUpdated = true;
    if (data.invoices?.length) if (await pullInvoices(token, tenantId)) dataUpdated = true;
    if (data.loyalty_transactions?.length) if (await pullLoyaltyTransactions(token, tenantId)) dataUpdated = true;
    if (data.scrap_categories?.length) if (await pullScrapCategories(token, tenantId)) dataUpdated = true;
    if (data.scrap_transactions?.length) if (await pullScrapTransactions(token, tenantId)) dataUpdated = true;
    if (data.purchase_bills?.length) if (await pullPurchaseBills(token, tenantId)) dataUpdated = true;
    if (data.cash_drawer?.length) if (await pullCashDrawer(token, tenantId)) dataUpdated = true;
    if (data.cash_transactions?.length) if (await pullCashTransactions(token, tenantId)) dataUpdated = true;
    if (data.cashier_audit_log?.length) if (await pullCashierAuditLog(token, tenantId)) dataUpdated = true;
    if (data.cash_categories?.length) if (await pullCashCategories(token, tenantId)) dataUpdated = true;
    if (data.returns?.length) if (await pullReturns(token, tenantId)) dataUpdated = true;
    if (data.payment_sources?.length) if (await pullPaymentSources(token, tenantId)) dataUpdated = true;
    if (data.payment_source_transactions?.length) if (await pullPaymentSourceTransactions(token, tenantId)) dataUpdated = true;
    if (data.combo_offers?.length) if (await pullComboOffers(token, tenantId)) dataUpdated = true;
    if (data.quotations?.length) if (await pullQuotations(token, tenantId)) dataUpdated = true;
    if (data.warranties?.length) if (await pullWarranties(token, tenantId)) dataUpdated = true;
    if (data.users?.length) if (await pullUsers(token, tenantId)) dataUpdated = true;

    return { success: true, dataUpdated };
  } catch (err) {
    console.warn('[SyncWorker] Unified delta pull error, falling back to standard pull:', (err as Error).message);
    return { success: false, dataUpdated: false };
  }
}

export async function runSyncCycle(sender?: WebContents): Promise<void> {
  if (syncState.syncInProgress) {
    return syncState.syncPromise ?? Promise.resolve();
  }

  syncState.syncInProgress = true;
  syncState.currentSyncProgress = null;
  syncState.lastCycleAt = Date.now();

  syncState.syncPromise = (async () => {
    try {
      notifyProgress(0, sender);
      const endpoints = getSyncEndpoints();
      const effective = calculateEffectiveCloudAccess();

      if (endpoints.primaryRoute === 'CLOUD' && !effective.isCloudAllowed) {
        console.log(`[SyncWorker] Cloud sync access is disabled (${effective.activeReason}). Skipping Cloud sync cycle. Local DB operation continues. (State: ${effective.stateName})`);
        notifyCycleComplete(sender);
        return;
      }

      let healthOk = false;
      let activeRoute: 'LAN' | 'CLOUD' = endpoints.primaryRoute;

      if (endpoints.primaryRoute === 'CLOUD') {
        // In Cloud Mode (Vercel), skip recurring /health pings to eliminate serverless function wakeups
        healthOk = true;
        activeRoute = 'CLOUD';
      } else {
        try {
          const res = await fetch(endpoints.primaryUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            healthOk = true;
            activeRoute = endpoints.primaryRoute;
          }
        } catch {
          // Primary LAN server unreachable
        }

        if (!healthOk && endpoints.fallbackUrl && effective.isCloudAllowed) {
          try {
            console.log(`[SyncWorker] LAN Primary Master (${endpoints.primaryUrl}) unreachable. Falling back to Cloud API (${endpoints.fallbackUrl})...`);
            const res = await fetch(endpoints.fallbackUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(5000) });
            if (res.ok) {
              healthOk = true;
              activeRoute = endpoints.fallbackRoute!;
            }
          } catch {
            // Fallback Cloud API also unreachable
          }
        }
      }

      if (!healthOk) {
        notifyOnlineStatus(false);
        return;
      }

      if (endpoints.primaryRoute === 'LAN' && endpoints.primaryUrl.includes('127.0.0.1')) {
        notifyOnlineStatus(true, activeRoute);
        console.log('[SyncWorker] Primary Master in LAN mode active. Local SQLite database is master for LAN terminals.');
        notifyCycleComplete(sender);
        return;
      }

      const config = getAuthConfig();
      if (!config) {
        console.warn('[SyncWorker] No JWT token found. Please log in to enable cloud sync.');
        notifyOnlineStatus(false, 'NONE');
        return;
      }

      const { jwt_token, tenant_id } = config;

      if (activeRoute === 'CLOUD' && cloudTokenUnusable(jwt_token)) {
        console.warn('[SyncWorker] JWT token has expired on Cloud route. Clearing auth...');
        await clearAuthAndNotify(jwt_token);
        return;
      }

      notifyOnlineStatus(true, activeRoute);
      if (activeRoute === 'CLOUD' && outboxEnabled(tenant_id)) {
        try {
          const uploadedRecords = getTotalPendingRecords(getDb(), tenant_id) > 0;
          if (await runOutboxSync(jwt_token, tenant_id, sender)) notifyRenderer('outbox-sync');
          if (await syncEinvoices(jwt_token, tenant_id, { force: uploadedRecords })) notifyRenderer('sync-cycle-completed-with-changes');
          await pollEmergencyCommands(jwt_token, (p, init) => fetchWithFallback(p, init).then(r => r.response), () => { syncState.isSyncActive = false; });
        } finally { notifyCycleComplete(sender); }
        return;
      }
      let dataUpdated = false;
      const db = getDb();

      // One-time auto-heal: reset pull cursors so invalid local-time/truncated cursors are wiped and fresh exact-precision cursors take over
      const healingKey = `utc_cursor_fix_v7:${tenant_id}`;
      if (!getMeta(healingKey)) {
        try {
          syncCycleSql.deleteSyncMeta(db).run(`pull_cursor:${tenant_id}:%`);
          setMeta(healingKey, 'true');
          console.log('[SyncWorker] One-time reset of all pull cursors applied to migrate to ISO UTC cursors.');
        } catch (e) {
          console.error('[SyncWorker] Error performing one-time cursor reset:', (e as Error).message);
        }
      }

      // One-time auto-heal: reset parties pull cursor so all terminals pull latest party types (e.g. suppliers)
      const partyHealingKey = `party_type_cursor_heal_v2:${tenant_id}`;
      if (!getMeta(partyHealingKey)) {
        try {
          syncCycleSql.deleteSyncMeta2(db).run(`pull_cursor:${tenant_id}:parties`);
          syncCycleSql.updateParties(db).run(tenant_id);
          setMeta(partyHealingKey, 'true');
          console.log('[SyncWorker] One-time reset of parties cursor applied to re-sync all latest party types.');
        } catch (e) {
          console.error('[SyncWorker] Error performing party cursor reset:', (e as Error).message);
        }
      }

      // One-time auto-heal: reset products pull cursor so all terminals re-sync any missing products from cloud
      const productHealingKey = `product_cursor_heal_v1:${tenant_id}`;
      if (!getMeta(productHealingKey)) {
        try {
          syncCycleSql.deleteSyncMeta2(db).run(`pull_cursor:${tenant_id}:products`);
          setMeta(productHealingKey, 'true');
          console.log('[SyncWorker] One-time reset of products cursor applied to re-sync all products from cloud.');
        } catch (e) {
          console.error('[SyncWorker] Error performing product cursor reset:', (e as Error).message);
        }
      }

      const totalRecords = getTotalPendingRecords(db, tenant_id);

      try {
        notifyProgress(1, sender, 0, totalRecords); await syncGrades(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(1.1, sender, undefined, totalRecords); await syncPricingTiers(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(1.2, sender, undefined, totalRecords); await syncProducts(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(2, sender, undefined, totalRecords); await syncProductPricing(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(2.9, sender, undefined, totalRecords); await pushCustomers(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(3, sender, undefined, totalRecords); await syncInvoices(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(4, sender, undefined, totalRecords); await syncSettings(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(5, sender, undefined, totalRecords); await syncParties(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(5.1, sender, undefined, totalRecords); await pushCustomers(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(5.2, sender, undefined, totalRecords); await pushLoyaltyTransactions(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(6, sender, undefined, totalRecords); await syncPartyLedger(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(7, sender, undefined, totalRecords); await syncScrapCategories(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(8, sender, undefined, totalRecords); await syncScrapTransactions(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(9, sender, undefined, totalRecords); await syncPurchaseBills(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(10, sender, undefined, totalRecords); await syncCashDrawer(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(11, sender, undefined, totalRecords); await syncCashTransactions(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(11.1, sender, undefined, totalRecords); await syncCashierAuditLog(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(12, sender, undefined, totalRecords); await syncCashCategories(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(12.1, sender, undefined, totalRecords); await syncReturns(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(12.2, sender, undefined, totalRecords); await syncPaymentSources(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(12.3, sender, undefined, totalRecords); await syncPaymentSourceTransactions(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(12.4, sender, undefined, totalRecords); await syncComboOffers(jwt_token, tenant_id);
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        notifyProgress(12.5, sender, undefined, totalRecords); await syncWarranties(jwt_token, tenant_id);
        if (await syncRestaurant(jwt_token, tenant_id)) notifyRenderer('restaurant-sync');
        // UAE e-invoicing runs after documents and customers are pushed; it is cloud-only and never blocks the cycle.
        if (activeRoute === 'CLOUD' && await syncEinvoices(jwt_token, tenant_id, { force: totalRecords > 0 })) dataUpdated = true;
        if (activeRoute === 'CLOUD') await pollEmergencyCommands(jwt_token, (p, init) => fetchWithFallback(p, init).then((r) => r.response), () => { syncState.isSyncActive = false; });
        if (!syncState.isSyncActive) { notifyCycleComplete(sender); return; }
        // Pre-check if cloud has any new changes before running pull requests
        const syncCheckTables = [
          'product_grades', 'pricing_tiers', 'product_pricing', 'products', 'settings',
          'parties', 'party_ledger', 'customers', 'loyalty_transactions', 'scrap_categories',
          'scrap_transactions', 'purchase_bills', 'cash_drawer', 'cash_transactions',
          'cashier_audit_log', 'cash_categories', 'returns', 'payment_sources',
          'payment_source_transactions', 'combo_offers', 'quotations', 'warranties', 'invoices', 'users'
        ];
        let latestPulledTs: string | null = null;
        let hasMissingCatalogCursor = false;
        const catalogTables = ['pricing_tiers', 'product_pricing', 'product_grades', 'products', 'settings'];
        for (const t of catalogTables) {
          if (!getMeta(cursorKey(tenant_id, t))) {
            hasMissingCatalogCursor = true;
            break;
          }
        }

        for (const t of syncCheckTables) {
          const ts = getMeta(cursorKey(tenant_id, t));
          if (ts) {
            if (!latestPulledTs || new Date(ts).getTime() > new Date(latestPulledTs).getTime()) {
              latestPulledTs = ts;
            }
          }
        }
        if (latestPulledTs && !hasMissingCatalogCursor) {
          const statusCheck = await checkCloudStatus(jwt_token, tenant_id, latestPulledTs);
          if (statusCheck.success && !statusCheck.hasChanges) {
            console.log(`[SyncWorker] ⚡ Cloud check-status: 0 changes detected since ${latestPulledTs}. Skipping pull phase.`);
            notifyPercent(100, 'Sync completed', sender);
            notifyCycleComplete(sender);
            return;
          }
        }

        // Try unified delta pull first (1 request for all datasets)
        const deltaRes = await unifiedDeltaPull(jwt_token, tenant_id);
        if (deltaRes.success) {
          if (deltaRes.dataUpdated) dataUpdated = true;
          notifyPercent(100, 'Sync completed', sender);
        } else {
          // Fallback to legacy parallel pull if unified delta-pull endpoint is unavailable
          const pullTasks: { run: () => Promise<boolean> }[] = [
            { run: () => pullGrades(jwt_token, tenant_id) },
            { run: () => pullPricingTiers(jwt_token, tenant_id) },
            { run: () => pullProducts(jwt_token, tenant_id) },
            { run: () => pullProductPricing(jwt_token, tenant_id) },
            { run: () => pullInvoices(jwt_token, tenant_id) },
            { run: () => pullUsers(jwt_token, tenant_id) },
            { run: () => pullSettings(jwt_token, tenant_id) },
            { run: () => pullParties(jwt_token, tenant_id) },
            { run: () => pullPartyLedger(jwt_token, tenant_id) },
            { run: () => pullCustomers(jwt_token, tenant_id) },
            { run: () => pullLoyaltyTransactions(jwt_token, tenant_id) },
            { run: () => pullScrapCategories(jwt_token, tenant_id) },
            { run: () => pullScrapTransactions(jwt_token, tenant_id) },
            { run: () => pullPurchaseBills(jwt_token, tenant_id) },
            { run: () => pullCashDrawer(jwt_token, tenant_id) },
            { run: () => pullCashTransactions(jwt_token, tenant_id) },
            { run: () => pullCashierAuditLog(jwt_token, tenant_id) },
            { run: () => pullCashCategories(jwt_token, tenant_id) },
            { run: () => pullReturns(jwt_token, tenant_id) },
            { run: () => pullPaymentSources(jwt_token, tenant_id) },
            { run: () => pullPaymentSourceTransactions(jwt_token, tenant_id) },
            { run: () => pullComboOffers(jwt_token, tenant_id) },
            { run: () => pullQuotations(jwt_token, tenant_id) },
            { run: () => pullWarranties(jwt_token, tenant_id) },
          ];

          syncState.pullProgressCtx = { done: 0, total: pullTasks.length };
          for (let i = 0; i < pullTasks.length; i += PULL_CONCURRENCY) {
            const batch = pullTasks.slice(i, i + PULL_CONCURRENCY);
            const results = await Promise.all(batch.map(async (t) => {
              const ok = await t.run();
              syncState.pullProgressCtx!.done++;
              notifyPercent(38 + 55 * (syncState.pullProgressCtx!.done / syncState.pullProgressCtx!.total),
                `Downloaded ${syncState.pullProgressCtx!.done}/${syncState.pullProgressCtx!.total} datasets`, sender);
              return ok;
            }));
            if (results.some(Boolean)) dataUpdated = true;
          }
        }
      } catch (err) {
        console.error('[SyncWorker] Sync cycle error:', (err as Error).message);
      } finally {
        syncState.pullProgressCtx = null;
      }

      if (dataUpdated) {
        notifyRenderer('sync-cycle-completed-with-changes');
      }
      notifyCycleComplete(sender);
    } finally {
      syncState.syncInProgress = false;
      syncState.syncPromise = null;
    }
  })();

  return syncState.syncPromise;
}
