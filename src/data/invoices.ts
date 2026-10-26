import { api, bindBridge } from './client';
import type { InvoiceItemsRow, InvoicesRow } from './dbRows';

/** An invoice as the invoice queries return it: the stored row plus, from the list query (`db:getInvoices`), the
 * biller / staff names and the line count. */
export interface Invoice extends InvoicesRow {
  biller_name?: string | null;
  biller_staff_name?: string | null;
  sales_staff_name?: string | null;
  item_count?: number | null;
}

/** An invoice line as stored (`invoice_items`). */
export type InvoiceItem = InvoiceItemsRow;

/** An invoice line with the product columns joined by `findInvoiceItemsByInvoiceId` (held-bill recall, edit). */
export interface InvoiceItemWithProduct extends InvoiceItem {
  sku_barcode?: string | null;
  brand_manufacturer?: string | null;
  grade_id?: string | null;
  pricing_mode?: string | null;
  grade_rate?: number | null;
  grade_purchase_price?: number | null;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  purchase_price?: number | null;
  base_price?: number | null;
  /** products.tax_rate_percent, selected as gst_percent. */
  gst_percent?: number | null;
  /** Not selected by the query; read as a fallback by older code. */
  tax_rate_percent?: number | null;
  hsn?: string | null;
}

export interface InvoiceFilters {
  /** Optional: the main process falls back to the active session tenant. */
  tenant_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
  invoice_type?: string;
  payment_method?: string;
  customer_id?: string;
  invoice_id?: string;
  accounting_view?: string;
  user_id?: string;
  role?: string;
  tax_rate_percent?: string | number;
  filterDate?: string;
  filterDateEnd?: string;
  includeDeleted?: boolean;
}

export async function listInvoices(filters: InvoiceFilters): Promise<Invoice[]> {
  return (await api().dbGetInvoices(filters)) as Invoice[];
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  return (await api().dbGetInvoiceItems(invoiceId)) as InvoiceItem[];
}

/** Sales invoices, checkout, numbering and held bills. Channel catalog — the only way UI code reaches these IPC channels. */
export const invoicesApi = bindBridge({
  checkout: 'dbCheckout',
  applyInvoiceDiscount: 'dbApplyInvoiceDiscount',
  getInvoices: 'dbGetInvoices',
  getInvoicesSummary: 'dbGetInvoicesSummary',
  getDashboardStats: 'dbGetDashboardStats',
  getInvoiceItems: 'dbGetInvoiceItems',
  updateInvoice: 'dbUpdateInvoice',
  updateInvoicePayment: 'dbUpdateInvoicePayment',
  convertBosToGst: 'dbConvertBosToGst',
  previewConvertBosToGst: 'dbPreviewConvertBosToGst',
  getNextServerInvoiceNumber: 'dbGetNextServerInvoiceNumber',
  getNextInvoiceNumber: 'dbGetNextInvoiceNumber',
  peekNextInvoiceNumber: 'dbPeekNextInvoiceNumber',
  getBosConvertibleInvoices: 'dbGetBosConvertibleInvoices',
  deleteInvoice: 'dbDeleteInvoice',
  holdBill: 'dbHoldBill',
  getHeldBills: 'dbGetHeldBills',
  recallHeldBill: 'dbRecallHeldBill',
  releaseHeldBill: 'dbReleaseHeldBill',
  expireStaleHeldBills: 'dbExpireStaleHeldBills',
});
