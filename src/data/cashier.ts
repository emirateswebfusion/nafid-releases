import { bindBridge } from './client';

/** Cash drawer, settlements and cash transactions. Channel catalog — the only way UI code reaches these IPC channels. */
export const cashierApi = bindBridge({
  getDrawer: 'dbCashierGetDrawer',
  setOpeningBalance: 'dbCashierSetOpeningBalance',
  getPendingInvoices: 'dbCashierGetPendingInvoices',
  settlePayment: 'dbCashierSettlePayment',
  addTransaction: 'dbCashierAddTransaction',
  dayClosing: 'dbCashierDayClosing',
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
