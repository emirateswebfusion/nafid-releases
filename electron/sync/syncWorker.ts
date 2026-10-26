import { BrowserWindow, type WebContents } from 'electron';
import { getDb } from '../db/localDb.js';
import { startLocalHostServer } from './localHostServer.js';
import { cloudTokenUnusable, LAN_PLACEHOLDER_TOKEN } from './syncAuth.js';
import { syncState } from './syncState.js';
import { calculateEffectiveCloudAccess } from './cloudAccess.js';
import { pullCashCategories, pullCashDrawer, pullCashTransactions, pullCashierAuditLog, pullPaymentSourceTransactions, pullPaymentSources, syncCashCategories, syncCashDrawer, syncCashTransactions, syncCashierAuditLog, syncPaymentSourceTransactions, syncPaymentSources } from './entities/cashSync.js';
import { pushCustomers } from './entities/partiesSync.js';
import { pullInvoices, pullQuotations, pullWarranties, syncInvoices, syncQuotations, syncWarranties } from './entities/salesDocsSync.js';
import { getAuthConfig, getSyncIntervalMs } from './syncConfig.js';
import { pullLightweightPendingBills, runSyncCycle } from './syncCycle.js';
import { getTotalPendingRecords, notifyRenderer } from './syncProgress.js';
import { checkSyncConnectivity, clearAuthAndNotify, cursorKey, getSyncEndpoints, tableContentHashes } from './syncTransport.js';
import * as syncWorkerSql from '../db/statements/sync/syncWorker.js';

export function setSyncActive(active: boolean) {
  syncState.isSyncActive = active;
  if (active) {
    syncState.authExpiredNotified = false;
  }
  console.log(`[SyncWorker] Sync active state changed to: ${active}`);
}

// Public sync API also used by services through dynamic import('../sync/syncWorker.js').
export { getSyncEndpoints } from './syncTransport.js';
export { calculateEffectiveCloudAccess, updateCloudAccessConfig } from './cloudAccess.js';
export { getSyncProgress } from './syncProgress.js';

// ── Smart Adaptive Polling for Cash Settlement ──────────────────────────────
const FAST_PULL_ACTIVE_MS = 10000; // 10 seconds baseline (down from 3s, cuts ~70% immediately)

function isAppWindowFocused(): boolean {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return true;
    if (win.isMinimized()) return false;
    return win.isFocused();
  } catch {
    return true;
  }
}

function getFastPullIntervalMs(): number {
  // 1. Network / Server error backoff
  if (syncState.consecutiveFastPullFailures >= 3) return 60000;
  if (syncState.consecutiveFastPullFailures === 2) return 30000;
  if (syncState.consecutiveFastPullFailures === 1) return 15000;

  // 2. If app window is minimized or not focused, conserve Vercel serverless memory
  if (!isAppWindowFocused()) {
    return 60000; // 1 minute when minimized / running in background
  }

  // 3. Adaptive backoff based on activity in store:
  // - Active rush (new bills coming): 10 seconds
  // - Mild idle (no new bills for ~30s): 20 seconds
  // - Moderate idle (no new bills for ~2m): 35 seconds
  // - Deep idle (no new bills for ~5m+): 60 seconds
  if (syncState.consecutiveNoUpdates <= 1) return FAST_PULL_ACTIVE_MS;
  if (syncState.consecutiveNoUpdates <= 4) return 20000;
  if (syncState.consecutiveNoUpdates <= 8) return 35000;
  return 60000;
}

export function resetFastPollBackoff() {
  syncState.consecutiveNoUpdates = 0;
  syncState.consecutiveFastPullFailures = 0;
  if (syncState.activePageContext === 'cash_settlement' && syncState.isSyncActive) {
    if (syncState.fastInvoicePullTimerId) {
      clearTimeout(syncState.fastInvoicePullTimerId);
      syncState.fastInvoicePullTimerId = null;
    }
    triggerFastLightweightBillPull().finally(() => {
      scheduleNextFastLightweightPull();
    });
  }
}

async function triggerFastLightweightBillPull() {
  if (!syncState.isSyncActive || syncState.activePageContext !== 'cash_settlement' || syncState.fastInvoicePullInProgress || syncState.syncInProgress) {
    return;
  }
  const endpoints = getSyncEndpoints();
  const effective = calculateEffectiveCloudAccess();
  if (endpoints.primaryRoute === 'CLOUD' && !effective.isCloudAllowed) return;

  const config = getAuthConfig();
  if (config && (!cloudTokenUnusable(config.jwt_token) || endpoints.primaryRoute === 'LAN')) {
    syncState.fastInvoicePullInProgress = true;
    try {
      const res = await pullLightweightPendingBills(config.jwt_token, config.tenant_id);
      if (res.success) {
        syncState.consecutiveFastPullFailures = 0;
        if (res.updated) {
          syncState.consecutiveNoUpdates = 0; // Reset backoff immediately on active data
          notifyRenderer('fast-invoice-pull-changed');
        } else {
          syncState.consecutiveNoUpdates++; // Step down polling frequency during quiet periods
        }
      } else {
        syncState.consecutiveFastPullFailures++;
      }
    } catch {
      syncState.consecutiveFastPullFailures++;
    } finally {
      syncState.fastInvoicePullInProgress = false;
    }
  }
}

function scheduleNextFastLightweightPull() {
  if (syncState.fastInvoicePullTimerId) {
    clearTimeout(syncState.fastInvoicePullTimerId);
    syncState.fastInvoicePullTimerId = null;
  }
  if (syncState.activePageContext !== 'cash_settlement' || !syncState.isSyncActive) {
    return;
  }
  const delay = getFastPullIntervalMs();
  syncState.fastInvoicePullTimerId = setTimeout(async () => {
    try {
      await triggerFastLightweightBillPull();
    } finally {
      if (syncState.activePageContext === 'cash_settlement' && syncState.isSyncActive) {
        scheduleNextFastLightweightPull();
      }
    }
  }, delay);
}

export function setPageContext(page: string | null, active: boolean) {
  if (active) {
    syncState.activePageContext = page;
  } else if (syncState.activePageContext === page) {
    syncState.activePageContext = null;
  }
  console.log(`[SyncWorker] Active page context changed to: ${syncState.activePageContext || 'none'}`);

  if (syncState.activePageContext === 'cash_settlement') {
    if (!syncState.fastInvoicePullTimerId) {
      console.log('[SyncWorker] 🟢 Entering Cash Settlement screen — Starting Smart Adaptive Bill Poll timer');
      syncState.consecutiveFastPullFailures = 0;
      syncState.consecutiveNoUpdates = 0;
      triggerFastLightweightBillPull().finally(() => {
        scheduleNextFastLightweightPull();
      });
    }
  } else {
    if (syncState.fastInvoicePullTimerId) {
      console.log('[SyncWorker] 🔴 Leaving Cash Settlement screen — Destroying lightweight bill poll timer');
      clearTimeout(syncState.fastInvoicePullTimerId);
      syncState.fastInvoicePullTimerId = null;
      syncState.consecutiveNoUpdates = 0;
    }
  }
}

function scheduleNextSyncCycle() {
  if (syncState.syncCycleTimerId) {
    clearTimeout(syncState.syncCycleTimerId);
  }
  const intervalMs = getSyncIntervalMs();
  syncState.syncCycleTimerId = setTimeout(async () => {
    if (syncState.isSyncActive) {
      try {
        await runSyncCycle();
      } catch (err) {
        console.error('[SyncWorker] Background sync error:', (err as Error).message);
      }
    }
    scheduleNextSyncCycle();
  }, intervalMs);
}

export function reloadSyncConfig() {
  for (const k in tableContentHashes) {
    delete tableContentHashes[k];
  }
  syncState.isSyncActive = true;
  syncState.authExpiredNotified = false;
  scheduleNextSyncCycle();
  setTimeout(() => {
    runSyncCycle().catch((e: Error) => console.error('[SyncWorker] Immediate sync on reloadSyncConfig error:', e.message));
  }, 500);
}

export function initSyncWorker() {
  if (syncState.isWorkerInitialized) {
    console.log('[SyncWorker] Background sync worker already initialized. Skipping duplicate initialization.');
    return;
  }
  syncState.isWorkerInitialized = true;
  console.log('[SyncWorker] ========= Initializing background sync worker... =========');
  const initialAuth = getAuthConfig();
  const endpoints = getSyncEndpoints();
  const isLanClient = endpoints.primaryRoute === 'LAN';

  if (initialAuth && (!cloudTokenUnusable(initialAuth.jwt_token) || isLanClient)) {
    syncState.isSyncActive = true;
    const tenantId = initialAuth.tenant_id;
    console.log(`[SyncWorker] ✅ Valid auth or LAN mode detected on startup. tenant_id=${tenantId}, route=${endpoints.primaryRoute}. Background sync ACTIVATED.`);
    // Immediately run a full sync in background to populate data on secondary terminals
    setTimeout(async () => {
      try {
        console.log('[SyncWorker] 🚀 Running immediate startup sync to populate data...');
        await runSyncCycle();
        notifyRenderer('startup-immediate-sync');
      } catch (e) {
        console.error('[SyncWorker] Startup immediate sync error:', (e as Error).message);
      }
    }, 3000); // Wait 3s for window to fully load before triggering
  } else if (initialAuth) {
    console.warn(initialAuth.jwt_token === LAN_PLACEHOLDER_TOKEN
      ? '[SyncWorker] ⚠️ No cloud login (offline login or no login). Cloud sync NOT activated. Sign in online to enable it.'
      : '[SyncWorker] ⚠️ Auth payload found but JWT is EXPIRED. Sync NOT activated. User must re-login.');
  } else {
    console.warn('[SyncWorker] ⚠️ No auth payload found on disk. Sync NOT activated (user not logged in).');
  }
  try {
    const db = getDb();
    const row = syncWorkerSql.selectSettings(db).get() as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if ((parsed.syncMode === 'LAN' || parsed.syncMode === 'HYBRID') && parsed.lanRole === 'PRIMARY') {
        startLocalHostServer(Number(parsed.lanPort) || 3888);
      }
    }
  } catch (err) {
    console.error('[SyncWorker] Failed to check local server startup config:', (err as Error).message);
  }

  // 1. Dynamic background sync cycle (configured heartbeat rate)
  scheduleNextSyncCycle();
}

export async function drainPendingCloudQueue(sender?: WebContents): Promise<{ success: boolean; drainedCount: number; message: string }> {
  const effective = calculateEffectiveCloudAccess();
  if (!effective.isCloudAllowed) {
    console.log(`[SyncWorker] Cannot drain pending queue: ${effective.activeReason}`);
    return { success: false, drainedCount: 0, message: effective.activeReason };
  }

  console.log(`[SyncWorker] 🚀 Starting controlled queue drain (${effective.pendingCount} pending records)...`);
  const initialPending = effective.pendingCount;
  await runSyncCycle(sender);
  const remaining = effective.config ? getTotalPendingRecords(getDb(), getAuthConfig()?.tenant_id || 'global') : 0;
  const drainedCount = Math.max(0, initialPending - remaining);
  console.log(`[SyncWorker] ✅ Queue drain completed. Drained ${drainedCount} records, ${remaining} remaining.`);
  return { success: true, drainedCount, message: `Successfully drained ${drainedCount} records.` };
}

export async function triggerUrgentInvoiceSync(): Promise<void> {
  const now = Date.now();
  if (syncState.urgentInvoiceSyncInProgress || now - syncState.lastUrgentInvoiceSyncTime < 1500) {
    console.log('[SyncWorker] Urgent invoice sync already in progress or recently executed, skipping duplicate...');
    return;
  }
  syncState.lastUrgentInvoiceSyncTime = now;
  const config = getAuthConfig();
  if (!config) return;
  const { jwt_token, tenant_id } = config;
  const endpoints = getSyncEndpoints();
  if (endpoints.primaryRoute === 'CLOUD' && cloudTokenUnusable(jwt_token)) return;

  const conn = await checkSyncConnectivity();
  if (!conn.ok) {
    return;
  }

  syncState.urgentInvoiceSyncInProgress = true;
  try {
    console.log('[SyncWorker] Express priority invoice push/pull running...');
    await pushCustomers(jwt_token, tenant_id);
    await syncInvoices(jwt_token, tenant_id);
    const updated = await pullInvoices(jwt_token, tenant_id);
    notifyRenderer();
    if (updated) {
      console.log('[SyncWorker] Express priority invoice sync completed: renderer notified.');
    }
  } catch (err) {
    console.error('[SyncWorker] Express invoice sync error:', (err as Error).message);
  } finally {
    syncState.urgentInvoiceSyncInProgress = false;
  }
}

export async function triggerUrgentQuotationSync(): Promise<void> {
  if (syncState.urgentQuotationSyncInProgress) {
    console.log('[SyncWorker] Urgent quotation sync already in progress, skipping...');
    return;
  }
  const config = getAuthConfig();
  if (!config) return;
  const { jwt_token, tenant_id } = config;
  const endpoints = getSyncEndpoints();
  if (endpoints.primaryRoute === 'CLOUD' && cloudTokenUnusable(jwt_token)) return;

  const conn = await checkSyncConnectivity();
  if (!conn.ok) {
    return;
  }

  syncState.urgentQuotationSyncInProgress = true;
  try {
    console.log('[SyncWorker] Express priority quotation push/pull running...');
    await syncQuotations(jwt_token, tenant_id);
    const updated = await pullQuotations(jwt_token, tenant_id);
    notifyRenderer();
    if (updated) {
      console.log('[SyncWorker] Express priority quotation sync completed: renderer notified.');
    }
  } catch (err) {
    console.error('[SyncWorker] Express quotation sync error:', (err as Error).message);
  } finally {
    syncState.urgentQuotationSyncInProgress = false;
  }
}

export async function triggerUrgentWarrantySync(): Promise<void> {
  if (syncState.urgentWarrantySyncInProgress) return;
  const config = getAuthConfig();
  if (!config) return;
  const { jwt_token, tenant_id } = config;
  const endpoints = getSyncEndpoints();
  if (endpoints.primaryRoute === 'CLOUD' && cloudTokenUnusable(jwt_token)) return;

  const conn = await checkSyncConnectivity();
  if (!conn.ok) return;

  syncState.urgentWarrantySyncInProgress = true;
  try {
    console.log('[SyncWorker] Express priority warranty push/pull running...');
    await syncWarranties(jwt_token, tenant_id);
    const updated = await pullWarranties(jwt_token, tenant_id);
    notifyRenderer();
    if (updated) {
      console.log('[SyncWorker] Express priority warranty sync completed: renderer notified.');
    }
  } catch (err) {
    console.error('[SyncWorker] Express warranty sync error:', (err as Error).message);
  } finally {
    syncState.urgentWarrantySyncInProgress = false;
  }
}

export async function triggerUrgentCashSync(): Promise<void> {
  const now = Date.now();
  if (syncState.urgentCashSyncInProgress || now - syncState.lastUrgentCashSyncTime < 1500) {
    console.log('[SyncWorker] Urgent cash sync already in progress or recently executed, skipping duplicate...');
    return;
  }
  syncState.lastUrgentCashSyncTime = now;
  const config = getAuthConfig();
  if (!config) return;
  const { jwt_token, tenant_id } = config;
  const endpoints = getSyncEndpoints();
  if (endpoints.primaryRoute === 'CLOUD' && cloudTokenUnusable(jwt_token)) return;

  const conn = await checkSyncConnectivity();
  if (!conn.ok) {
    return;
  }

  syncState.urgentCashSyncInProgress = true;
  try {
    console.log('[SyncWorker] Express priority cash push/pull running...');
    await syncCashDrawer(jwt_token, tenant_id);
    await syncCashTransactions(jwt_token, tenant_id);
    await syncCashierAuditLog(jwt_token, tenant_id);
    await syncCashCategories(jwt_token, tenant_id);
    await syncPaymentSources(jwt_token, tenant_id);
    await syncPaymentSourceTransactions(jwt_token, tenant_id);

    await pullCashDrawer(jwt_token, tenant_id);
    await pullCashTransactions(jwt_token, tenant_id);
    await pullCashierAuditLog(jwt_token, tenant_id);
    await pullCashCategories(jwt_token, tenant_id);
    await pullPaymentSources(jwt_token, tenant_id);
    await pullPaymentSourceTransactions(jwt_token, tenant_id);

    notifyRenderer();
    console.log('[SyncWorker] Express priority cash sync completed: renderer notified.');
  } catch (err) {
    console.error('[SyncWorker] Express cash sync error:', (err as Error).message);
  } finally {
    syncState.urgentCashSyncInProgress = false;
  }
}

export async function runInitialSync(sender?: WebContents) {
  const config = getAuthConfig();
  const endpoints = getSyncEndpoints();
  const isLanRoute = endpoints.primaryRoute === 'LAN';

  if (!config || (!isLanRoute && cloudTokenUnusable(config.jwt_token))) {
    console.warn('[SyncWorker] runInitialSync skipped: Auth token is missing or expired. Cloud sync paused.');
    clearAuthAndNotify();
    return { success: false, error: 'Auth token expired or missing' };
  }
  syncState.authExpiredNotified = false;
  console.log('[SyncWorker] Running explicit initial sync...');
  syncState.isSyncActive = true;
  if (config?.tenant_id) {
    try {
      syncWorkerSql.deleteSyncMeta2(getDb()).run(cursorKey(config.tenant_id, 'cash_drawer'));
    } catch { /* ignore */ }
  }
  triggerUrgentInvoiceSync().catch(() => {});
  triggerUrgentCashSync().catch(() => {});
  triggerUrgentQuotationSync().catch(() => {});
  await runSyncCycle(sender);
  return { success: true };
}

export async function forceResyncInvoices(sender?: WebContents) {
  console.log('[SyncWorker] Forcing full invoice and return re-sync...');
  const config = getAuthConfig();
  if (config?.tenant_id) {
    const db = getDb();
    syncWorkerSql.deleteSyncMeta(db).run(
      cursorKey(config.tenant_id, 'invoices'),
      cursorKey(config.tenant_id, 'returns')
    );
  }
  return runInitialSync(sender);
}

// Shared progress context for the parallel pull phase (set by runSyncCycle).

// kept for legacy compat — no longer used to gate notifications
