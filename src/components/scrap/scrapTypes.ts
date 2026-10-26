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
export type ScrapInvoiceRow = {
  invoice_number: string;
  scrap_invoice_number: string;
  party_name?: string;
  customer_phone?: string;
  customer_address?: string;
  created_at: string;
  payment_status?: string;
  item_count?: number;
  total_qty?: number;
  units?: string;
  total_amount: number;
  biller_name?: string;
  party_phone?: string;
  party_address?: string;
  party_state?: string;
  customer_state?: string;
};

export type ScrapInvoiceTxRow = {
  transaction_id: string;
  type?: 'PURCHASE' | 'SALE' | string;
  scrap_category_id?: string;
  scrap_category_name?: string;
  quantity: number;
  rate: number;
  total_amount: number;
  unit?: string;
  notes?: string;
  created_at: string;
  payment_status?: string;
  biller_name?: string;
  party_name?: string;
  party_phone?: string;
  party_address?: string;
  party_state?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_state?: string;
};

export type ScrapUpiSourceRow = {
  source_id: string;
  name: string;
  upi_id?: string;
};
