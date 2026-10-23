/** Scrap screen types: view names, scrap category and scrap transaction rows. */
export type View = 'list' | 'category_form' | 'transaction' | 'tx_form' | 'selling' | 'invoices' | 'invoice_detail';

export interface ScrapCategory {
  scrap_category_id: string;
  tenant_id: string;
  name: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  unit: string;
  is_deleted?: number;
}

export interface ScrapTransaction {
  transaction_id: string;
  type: 'PURCHASE' | 'SALE';
  scrap_category_id: string;
  scrap_category_name: string;
  quantity: number;
  rate: number;
  total_amount: number;
  party_name: string;
  notes: string;
  created_at: string;
}

/**
 * Loose rows of the scrap screen that have no data types yet (scrap invoices, invoice transaction lines, UPI sources).
 * Kept untyped here, in one place, until the screen is typed; use these aliases instead of writing `any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy scrap invoice row, typed later in one place
export type ScrapInvoiceRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy scrap invoice transaction line, typed later in one place
export type ScrapInvoiceTxRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy UPI source row, typed later in one place
export type ScrapUpiSourceRow = any;
