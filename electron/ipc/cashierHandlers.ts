import { handle } from './common.js';
import * as cashierService from '../services/cashierService.js';

export function registerCashierHandlers(): void {
  handle('db:cashier:getDrawer', cashierService.getDrawer);

  handle('db:cashier:setOpeningBalance', cashierService.setOpeningBalance, { safe: true });

  handle('db:cashier:getPendingInvoices', cashierService.getPendingInvoices);

  handle('db:cashier:settlePayment', cashierService.settlePayment, { safe: true });

  handle('db:cashier:addTransaction', cashierService.addTransaction, { safe: true });

  handle('db:cashier:dayClosing', cashierService.dayClosing, { safe: true });

  handle('db:cashier:reopenDrawer', cashierService.reopenDrawer, { safe: true });

  handle('db:cashier:deleteTransaction', cashierService.deleteTransaction, { safe: true });

  handle('db:cashier:getTransactions', cashierService.getTransactions);

  handle('db:cashier:getHistory', cashierService.getHistory);

  handle('db:cashier:getDaySettlements', cashierService.getDaySettlements);

  handle('db:cashier:getDayTransactions', cashierService.getDayTransactions);

  handle('db:cashier:getAuditLog', cashierService.getAuditLog);

  // ── Cash Categories IPC Handlers ─────────────────────────────────────────────

  handle('db:cashier:getCategories', cashierService.getCategories);

  handle('db:cashier:addCategory', cashierService.addCategory, { safe: true });

  handle('db:cashier:deleteCategory', cashierService.deleteCategory, { safe: true });

}
