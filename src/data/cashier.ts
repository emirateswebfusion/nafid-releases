import { bindBridge } from './client';
import type { CashDrawerRow } from './dbRows';

/** Drawer row returned by `cashierService.getDrawer` (`SELECT * FROM cash_drawer`). */
export type CashDrawerResult = CashDrawerRow | null | { error: string };

/** Cash drawer, settlements and cash transactions. Channel catalog — the only way UI code reaches these IPC channels. */
export const cashierApi = bindBridge({
  getDrawer: 'dbCashierGetDrawer',
  setOpeningBalance: 'dbCashierSetOpeningBalance',
  getPendingInvoices: 'dbCashierGetPendingInvoices',
  settlePayment: 'dbCashierSettlePayment',
  addTransaction: 'dbCashierAddTransaction',
  dayClosing: 'dbCashierDayClosing',
  getAutoCloseStatus: 'dbCashierGetAutoCloseStatus',
  snoozeAutoClose: 'dbCashierSnoozeAutoClose',
  autoCloseNow: 'dbCashierAutoCloseNow',
  getTransactions: 'dbCashierGetTransactions',
  reopenDrawer: 'dbCashierReopenDrawer',
  deleteTransaction: 'dbCashierDeleteTransaction',
  getHistory: 'dbCashierGetHistory',
  getDaySettlements: 'dbCashierGetDaySettlements',
  getDayTransactions: 'dbCashierGetDayTransactions',
  getAuditLog: 'dbCashierGetAuditLog',
  getCategories: 'dbCashierGetCategories',
  addCategory: 'dbCashierAddCategory',
  deleteCategory: 'dbCashierDeleteCategory',
});
