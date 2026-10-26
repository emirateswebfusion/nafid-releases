import { api, bindBridge } from './client';

export interface Invoice {
  invoice_id: string;
  tenant_id: string;
  invoice_number: string;
  invoice_type?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_gstin?: string | null;
  customer_state?: string | null;
  customer_address?: string | null;
  subtotal?: number | null;
  tax_total?: number | null;
  discount_total?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  grand_total?: number | null;
  payment_method?: string | null;
  split_details?: string | null;
  received_amount?: number | null;
  balance_amount?: number | null;
  user_id?: string | null;
  return_deduction?: number | null;
  return_invoice_number?: string | null;
  scrap_deduction?: number | null;
  scrap_invoice_number?: string | null;
  points_redeemed?: number | null;
  points_redeemed_discount?: number | null;
  converted_from_invoice_id?: string | null;
  converted_from_invoice_number?: string | null;
  converted_to_invoice_id?: string | null;
  converted_to_invoice_number?: string | null;
  actual_refund_paid?: number | null;
  supply_type?: string | null;
  cgst_total?: number | null;
  sgst_total?: number | null;
  igst_total?: number | null;
  is_deleted?: number | null;
  sync_status?: string | null;
  /** Joined by the list query (`db:getInvoices`). */
  biller_name?: string | null;
  biller_staff_name?: string | null;
  sales_staff_name?: string | null;
  item_count?: number | null;
  description?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface InvoiceItem {
  item_id: string;
  invoice_id: string;
  tenant_id?: string | null;
  product_id: string;
  name?: string | null;
  quantity: number;
  unit_price: number;
  tax_amount?: number | null;
  total: number;
  pieces_sold?: number | null;
  billing_type?: string | null;
  uom?: string | null;
  is_service_item?: number | null;
  hsn_sac_code?: string | null;
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  igst_rate?: number | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  igst_amount?: number | null;
  supply_type?: string | null;
  combo_id?: string | null;
  combo_details?: string | null;
  qty_from_paper_stock?: number | null;
  created_at?: string | null;
}

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
