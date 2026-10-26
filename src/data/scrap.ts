import { bindBridge } from './client';
import type { ScrapTransactionsRow } from './dbRows';

/** A scrap transaction with its category's name and unit, as the transaction queries join them. */
export interface ScrapTransactionWithCategory extends ScrapTransactionsRow {
  scrap_category_name: string | null;
  unit: string | null;
}

/** Aggregate row returned by `scrapService.getScrapInvoiceList` / `findScrapTransactionsByScrap_AndType`. */
export interface ScrapInvoiceListItem {
  invoice_number: string;
  item_count: number;
  total_qty: number;
  units: string | null;
  total_amount: number;
  payment_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  party_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
}

/** Invoice detail returned by `scrapService.getScrapInvoiceByNumber` after its joined transaction query. */
export interface ScrapInvoiceDetails {
  transactions: ScrapTransactionWithCategory[];
  totalAmount: number;
  invoiceNumber: string;
  paymentStatus: string;
}

/** All return shapes from `scrapService.getScrapInvoiceByNumber`, including no-match and query-error results. */
export type ScrapInvoiceByNumberResult = ScrapInvoiceDetails | null | { error: string };

/** All return shapes from `scrapService.getScrapInvoiceList`, including its query-error result. */
export type ScrapInvoiceListResult = ScrapInvoiceListItem[] | { error: string };

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
