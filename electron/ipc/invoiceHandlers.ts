import { ipcMain } from 'electron';
import { handle } from './common.js';
import * as invoicesService from '../services/invoicesService.js';
import * as paymentSourcesService from '../services/paymentSourcesService.js';
import * as returnsService from '../services/returnsService.js';
import * as quotationsService from '../services/quotationsService.js';
import * as warrantiesService from '../services/warrantiesService.js';

export function registerInvoiceHandlers(): void {
  handle('db:checkout', invoicesService.checkout, { safe: true });

  // ── Hold Bill IPC Handlers ────────────────────────────────────────────────
  // Save current cart as a HOLD invoice: deducts stock, sets held_until = now + 24h
  handle('db:holdBill', invoicesService.holdBill, { safe: true });

  // Get all active (non-expired) held bills for a tenant
  handle('db:getHeldBills', invoicesService.getHeldBills);

  // Get a specific held bill's full data for recall, restore stock, and mark as recalled
  handle('db:recallHeldBill', invoicesService.recallHeldBill);

  // Manually release a held bill — revert stock and mark as expired
  handle('db:releaseHeldBill', invoicesService.releaseHeldBill);

  // Auto-expire stale held bills — called on startup
  handle('db:expireStaleHeldBills', invoicesService.expireStaleHeldBills);

  // ── Payment Methods (BANK / CARD / UPI sources) ──────────────────────────────
  handle('db:payments:getSources', paymentSourcesService.getSources);

  handle('db:payments:addSource', paymentSourcesService.addSource, { safe: true });

  handle('db:payments:updateSource', paymentSourcesService.updateSource, { safe: true });

  handle('db:payments:deleteSource', paymentSourcesService.deleteSource);

  handle('db:payments:getTransactions', paymentSourcesService.getTransactions);

  handle('db:payments:addTransaction', paymentSourcesService.addTransaction, { safe: true });

  // ── Diagnostic: Clear stuck PENDING sync records ─────────────────────────────

  handle('db:applyInvoiceDiscount', invoicesService.applyInvoiceDiscount);

  handle('db:getInvoices', invoicesService.getInvoices);

  handle('db:getInvoicesSummary', invoicesService.getInvoicesSummary);

  handle('db:getDashboardStats', invoicesService.getDashboardStats);

  handle('db:getInvoiceItems', invoicesService.getInvoiceItems);

  handle('db:updateInvoice', invoicesService.updateInvoice);

  handle('db:updateInvoicePayment', invoicesService.updateInvoicePayment);

  // ── Return Handlers ─────────────────────────────────────────────────────
  handle('db:createReturn', returnsService.createReturn, { safe: true });

  handle('db:getAlreadyReturnedQuantities', returnsService.getAlreadyReturnedQuantities, { safe: true });

  // Return-mode invoice search — only returns bills that still have at least one
  // item with remaining returnable quantity (fully returned bills are excluded).
  handle('db:getReturnableInvoices', returnsService.getReturnableInvoices, { safe: true });

  handle('db:getReturnInvoiceByNumber', returnsService.getReturnInvoiceByNumber, { safe: true });

  handle('db:getPendingReturnInvoices', returnsService.getPendingReturnInvoices, { safe: true });

  // Accumulate partial ADJUST_BILL consumption. adjusted_amount tracks how much of
  // the return credit has been used across bills; the return stays pending until
  // adjusted_amount >= grand_total. adjusted_invoice_number records the last invoice
  // that consumed part of the credit.
  handle('db:settleReturnInvoice', returnsService.settleReturnInvoice, { safe: true });

  handle('db:getReturns', returnsService.getReturns);

  handle('db:getReturnItems', returnsService.getReturnItems);

  handle('db:deleteReturn', returnsService.deleteReturn);

  handle('db:getNextReturnNumber', returnsService.getNextReturnNumber, { safe: true });

  handle('db:peekNextReturnNumber', returnsService.peekNextReturnNumber, { safe: true });

  handle('db:previewConvertBosToGst', invoicesService.previewConvertBosToGst);

  handle('db:convertBosToGst', invoicesService.convertBosToGst);

  ipcMain.removeHandler('settings:getAll');

  handle('db:getNextServerInvoiceNumber', invoicesService.getNextServerInvoiceNumber);

  handle('db:getNextInvoiceNumber', invoicesService.getNextInvoiceNumber);

  handle('db:peekNextInvoiceNumber', invoicesService.peekNextInvoiceNumber);

  handle('db:getNextQuotationNumber', quotationsService.getNextQuotationNumber);

  handle('db:peekNextQuotationNumber', quotationsService.peekNextQuotationNumber);

  handle('db:saveQuotation', quotationsService.saveQuotation, { safe: true });

  handle('db:getQuotations', quotationsService.getQuotations);

  handle('db:getQuotationItems', quotationsService.getQuotationItems);

  handle('db:deleteQuotation', quotationsService.deleteQuotation);

  handle('db:updateQuotation', quotationsService.updateQuotation);

  handle('db:updateQuotationStatus', quotationsService.updateQuotationStatus);

  // ── Warranties IPC ─────────────────────────────────────────────
  handle('db:saveWarranty', warrantiesService.saveWarranty, { safe: true });

  handle('db:getWarranties', warrantiesService.getWarranties);

  handle('db:deleteWarranty', warrantiesService.deleteWarranty);

}
