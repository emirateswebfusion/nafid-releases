import { BrowserWindow, type WebContents } from 'electron';
import { getDb } from '../db/localDb.js';
import { syncState } from './syncState.js';
import { getAuthConfig } from './syncConfig.js';
import * as syncProgressSql from '../db/statements/sync/syncProgress.js';
import { accountSyncNotice } from './accountMetadata.js';

/** Sync progress and renderer notifications: phases, percent / label updates, cycle completion and online status. */
export function getTotalPendingRecords(db: import('better-sqlite3').Database, tenantId: string): number {
  const tables = ['products', 'invoices', 'product_grades', 'pricing_tiers', 'product_pricing', 'parties', 'party_ledger', 'scrap_categories', 'scrap_transactions', 'purchase_bills', 'purchase_bill_items', 'cash_drawer', 'cash_transactions', 'cashier_audit_log', 'cash_categories', 'returns', 'return_items', 'combo_offers', 'quotations', 'quotation_items', 'staff', 'staff_salaries', 'staff_transactions', 'staff_ledger', 'staff_attendance'];
  const rows = syncProgressSql.countPendingRows(db, tables).all(...tables.map(() => tenantId)) as { cnt: number }[];
  return rows.reduce((sum, r) => sum + r.cnt, 0);
}

export const SYNC_PHASES = [
  'Checking connection...',
  'Uploading grades...',
  'Uploading pricing tiers...',
  'Uploading product pricing...',
  'Uploading products...',
  'Uploading invoices...',
  'Uploading settings...',
  'Uploading parties...',
  'Uploading ledger entries...',
  'Uploading scrap categories...',
  'Uploading scrap transactions...',
  'Uploading purchase bills...',
  'Uploading cash drawer...',
  'Uploading cash transactions...',
  'Uploading combo offers...',
  'Uploading quotations...',
  'Updating grades...',
  'Updating pricing tiers...',
  'Updating product pricing...',
  'Updating products...',
  'Updating invoices...',
  'Updating users...',
  'Updating settings...',
  'Updating parties...',
  'Updating ledger entries...',
  'Updating scrap categories...',
  'Updating scrap transactions...',
  'Updating purchase bills...',
  'Updating cash drawer...',
  'Uploading returns...',
  'Updating returns...',
  'Updating combo offers...',
  'Updating quotations...',
];

export function notifyProgress(phaseIndex: number, sender?: WebContents, recordsSynced?: number, totalRecords?: number) {
  if (phaseIndex >= 0 && phaseIndex < SYNC_PHASES.length) {
    const percent = Math.round(((phaseIndex + 1) / SYNC_PHASES.length) * 100);
    const db = getDb();
    const config = getAuthConfig();
    const tenantId = config?.tenant_id;
    const remaining = tenantId ? getTotalPendingRecords(db, tenantId) : 0;
    const synced = totalRecords !== undefined ? totalRecords - remaining : (recordsSynced ?? 0);
    const total = totalRecords ?? remaining + synced;
    syncState.currentSyncProgress = { percent, label: SYNC_PHASES[phaseIndex], recordsSynced: synced, totalRecords: total };
    const target = sender ?? BrowserWindow.getAllWindows()[0]?.webContents;
    if (target && !target.isDestroyed()) {
      target.send('sync:progress', syncState.currentSyncProgress);
    }
  }
}

// Percent-driven progress used during the parallel pull phase, where per-table
// phase indices would otherwise bounce around as tables finish out of order.
export function notifyPercent(percent: number, label: string, sender?: WebContents, recordsSynced?: number, totalRecords?: number) {
  syncState.currentSyncProgress = {
    percent: Math.min(100, Math.max(0, Math.round(percent))),
    label,
    recordsSynced: recordsSynced ?? 0,
    totalRecords: totalRecords ?? 0,
  };
  const target = sender ?? BrowserWindow.getAllWindows()[0]?.webContents;
  if (target && !target.isDestroyed()) {
    target.send('sync:progress', syncState.currentSyncProgress);
  }
}

export function getSyncProgress(): { percent: number; label: string; recordsSynced: number; totalRecords: number } | null {
  return syncState.currentSyncProgress;
}

export function notifyRenderer(reason?: string) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    console.log(`[SyncWorker] 🔔 Notifying renderer (sync:data-updated)${reason ? ` — reason: ${reason}` : ''}`);
    win.webContents.send('sync:data-updated');
  } else {
    console.warn('[SyncWorker] ⚠️ No BrowserWindow found — renderer notification skipped!');
  }
}

export function notifyCycleComplete(sender?: WebContents, includeDownloads = true) {
  void import('./supportReport.js').then(module => module.reportSyncSupport()).catch(() => {});
  const target = sender ?? BrowserWindow.getAllWindows()[0]?.webContents;
  if (target && !target.isDestroyed()) {
    try {
      const tenant = getAuthConfig()?.tenant_id;
      const notice = tenant ? accountSyncNotice(getDb(), tenant, includeDownloads) : null;
      if (notice) notifyPercent(100, notice, target);
    } catch (error) {
      console.error('[SyncWorker] Account completion check failed:', error);
      notifyPercent(100, 'Account sync check failed; changes kept on this computer.', target);
    }
    target.send('sync:cycle-complete');
  }
}

export function notifyOnlineStatus(online: boolean, route?: 'LAN' | 'CLOUD' | 'NONE') {
  if (route) syncState.currentActiveRoute = online ? route : 'NONE';
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:online-status', online, route || (online ? syncState.currentActiveRoute : 'NONE'));
  }
}

// Progress reporter shared by all pull wrappers during the parallel phase.
export function notifyPullProgress(label: string, fetched: number) {
  if (syncState.pullProgressCtx && syncState.pullProgressCtx.total > 0) {
    const percent = 38 + 55 * ((syncState.pullProgressCtx.done + 0.5) / syncState.pullProgressCtx.total);
    notifyPercent(percent, `Downloading ${label}… ${fetched.toLocaleString()} rows`);
  }
}
