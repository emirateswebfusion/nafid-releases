import { bindBridge } from './client';

/** Scrap categories, scrap transactions and scrap invoices. Channel catalog — the only way UI code reaches these IPC channels. */
export const scrapApi = bindBridge({
  deduplicateScrapCategories: 'dbDeduplicateScrapCategories',
  getScrapCategories: 'dbGetScrapCategories',
  addScrapCategory: 'dbAddScrapCategory',
  updateScrapCategory: 'dbUpdateScrapCategory',
  deleteScrapCategory: 'dbDeleteScrapCategory',
  addScrapTransaction: 'dbAddScrapTransaction',
  getScrapTransactions: 'dbGetScrapTransactions',
  getScrapCategoriesBySearch: 'dbGetScrapCategoriesBySearch',
  getNextScrapInvoiceNumber: 'dbGetNextScrapInvoiceNumber',
  peekNextScrapInvoiceNumber: 'dbPeekNextScrapInvoiceNumber',
  getScrapInvoiceByNumber: 'dbGetScrapInvoiceByNumber',
  getScrapInvoiceList: 'dbGetScrapInvoiceList',
  updateScrapInvoicePaymentStatus: 'dbUpdateScrapInvoicePaymentStatus',
  updateScrapInvoiceHeader: 'dbUpdateScrapInvoiceHeader',
  updateScrapInvoiceFull: 'dbUpdateScrapInvoiceFull',
  updateScrapTransaction: 'dbUpdateScrapTransaction',
  deleteScrapTransaction: 'dbDeleteScrapTransaction',
  deleteScrapInvoice: 'dbDeleteScrapInvoice',
  upsertScrapCreditLedger: 'dbUpsertScrapCreditLedger',
});
