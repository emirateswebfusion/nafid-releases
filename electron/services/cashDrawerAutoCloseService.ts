import crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';
import * as cashierSql from '../db/statements/cashier.js';
import type { Db } from '../db/statements/types.js';
import { closeDrawerAutomatically, reconcileCashDrawer } from './cashDrawerService.js';
import { findOpenDrawers, getAutoCloseConfig, getAutoCloseDueMs, getSessionSinceMs, snoozeDrawerAutoClose, type DrawerRow } from './cashDrawerSession.js';
import { getStoreTimezoneSetting, parseCleanDate } from './storeTime.js';
import { sendShopClosingReport } from '../whatsapp/shopClosingReportService.js';

/** Drawer auto close use-cases (IPC `db:cashier:getAutoCloseStatus`, `snoozeAutoClose`, `autoCloseNow`). */

export interface AutoCloseStatus {
  enabled: boolean;
  /** HH:MM, store timezone. */
  time: string;
  /** The oldest open drawer, if any. */
  drawer_id: string | null;
  business_date: string | null;
  /** When that drawer closes automatically (UTC ISO, includes a snooze); null when auto close is off. */
  due_at: string | null;
  /** The due time has passed: ask the cashier now. */
  is_due: boolean;
}

function statusFor(db: Db, tenantId: string): AutoCloseStatus {
  getSessionSinceMs(db, tenantId);
  const config = getAutoCloseConfig(db, tenantId);
  const drawer = findOpenDrawers(db, tenantId)[0];
  const base = {
    enabled: config.enabled,
    time: config.time,
    drawer_id: drawer?.drawer_id ?? null,
    business_date: drawer ? parseCleanDate(drawer.business_date, getStoreTimezoneSetting(db, tenantId)) : null,
  };
  if (!config.enabled || !drawer) return { ...base, due_at: null, is_due: false };
  const dueMs = getAutoCloseDueMs(db, tenantId, drawer, config);
  return { ...base, due_at: new Date(dueMs).toISOString(), is_due: Date.now() >= dueMs };
}

function notifyCashChanged() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('sync:data-updated');
  import('../sync/syncWorker.js').then(({ triggerUrgentCashSync }) => {
    triggerUrgentCashSync().catch(e => console.error('[Main] Urgent cash sync error on auto close:', e));
  }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
}

/** IPC `db:cashier:getAutoCloseStatus` */
export function getAutoCloseStatus({ tenant_id }: { tenant_id: string }): AutoCloseStatus | { error: string } {
  try {
    if (!tenant_id) return { error: 'tenant_id is required' };
    return statusFor(getDb(), tenant_id);
  } catch (error: unknown) {
    console.error('[db:cashier:getAutoCloseStatus]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:cashier:snoozeAutoClose`: the cashier needs more time; postpone the auto close by `minutes` (1–240). */
export function snoozeAutoClose({ tenant_id, drawer_id, minutes }: { tenant_id: string; drawer_id: string; minutes: number }) {
  try {
    if (!tenant_id || !drawer_id) return { success: false, error: 'tenant_id and drawer_id are required' };
    const db = getDb();
    snoozeDrawerAutoClose(db, tenant_id, drawer_id, minutes);
    return { success: true, status: statusFor(db, tenant_id) };
  } catch (error: unknown) {
    console.error('[db:cashier:snoozeAutoClose]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:cashier:autoCloseNow`: close the open drawer without a count (counted cash = expected). */
export function autoCloseNow({ tenant_id, drawer_id, user_id, user_name }: { tenant_id: string; drawer_id: string; user_id?: string; user_name?: string }) {
  try {
    if (!tenant_id || !drawer_id) return { success: false, error: 'tenant_id and drawer_id are required' };
    const db = getDb();
    let closed = false;
    let businessDate = '';
    db.transaction(() => {
      const drawer = cashierSql.findCashDrawerByDrawerId(db).get(drawer_id, tenant_id) as DrawerRow | undefined;
      if (!drawer || drawer.status !== 'OPEN') return;
      businessDate = parseCleanDate(drawer.business_date, getStoreTimezoneSetting(db, tenant_id));
      closed = closeDrawerAutomatically(db, tenant_id, drawer, new Date().toISOString(), 'Auto-closed at the auto close time', user_id || null);
      if (!closed) return;
      const after = cashierSql.findCashDrawerByDrawerId(db).get(drawer_id, tenant_id) as (DrawerRow & { expected_closing?: number }) | undefined;
      reconcileCashDrawer(db, tenant_id, after);
      cashierSql.insertCashierAuditLog(db).run(
        crypto.randomUUID(), tenant_id, drawer_id, 'AUTO_CLOSED',
        JSON.stringify({ business_date: businessDate, expected_closing: after?.expected_closing ?? null }),
        user_id || 'system', user_name || null,
      );
    })();
    if (!closed) return { success: false, error: 'Drawer is not open' };

    notifyCashChanged();
    setImmediate(() => {
      sendShopClosingReport({
        db,
        tenantId: tenant_id,
        businessDate,
        triggerType: 'SETTLEMENT_CLOSE',
        closedByName: user_name,
        reconcileCashDrawerFn: reconcileCashDrawer,
        getStoreTimezoneSettingFn: getStoreTimezoneSetting,
      }).catch(err => console.error('[Main] Shop closing WhatsApp report background error:', err));
    });
    return { success: true };
  } catch (error: unknown) {
    console.error('[db:cashier:autoCloseNow]', error);
    return { success: false, error: 'Operation failed' };
  }
}
