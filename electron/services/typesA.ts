/**
 * Row and payload shapes shared by the core main-process services
 * (invoice editing, party ledger, BoS conversion, cash drawer, cashier,
 * parties, products and scrap). Every shape mirrors the columns these
 * services actually read from SQLite or accept from IPC payloads.
 */

export interface SettingRow {
  value: string;
}

export type ParsedSetting = Record<string, unknown> | string | number | boolean | null;

export interface SplitDetails {
  credit?: number | string | null;
  cash?: number | string | null;
  upi?: number | string | null;
  card?: number | string | null;
  bank_transfer?: number | string | null;
  bank?: number | string | null;
  cheque?: number | string | null;
  upi_source_id?: string | null;
  card_source_id?: string | null;
  bank_source_id?: string | null;
  [key: string]: unknown;
}

export interface InvoiceRow {
    stock_applied?: number;
    counts_in_revenue?: number;
    bill_purpose?: string;
  invoice_id: string;
  tenant_id?: string | null;
  invoice_number: string;
  invoice_type?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  subtotal: number;
  tax_total: number;
  discount_total?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  grand_total: number;
  payment_method?: string | null;
  payment_source_id?: string | null;
  received_amount?: number | null;
  actual_refund_paid?: number | null;
  balance_amount?: number | null;
  split_details?: SplitDetails | string | null;
  scrap_deduction?: number | null;
  scrap_invoice_number?: string | null;
  return_deduction?: number | null;
  return_invoice_number?: string | null;
  points_earned?: number | null;
  points_redeemed?: number | null;
  points_redeemed_discount?: number | null;
  previous_points_balance?: number | null;
  remaining_points_balance?: number | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_gstin?: string | null;
  customer_state?: string | null;
  is_staff?: boolean | number | null;
  isStaffCustomer?: boolean | null;
  staff_id?: string | null;
  biller_staff_id?: string | null;
  sales_staff_id?: string | null;
  created_at?: string | null;
  cgst_total?: number | null;
  sgst_total?: number | null;
  igst_total?: number | null;
  supply_type?: string | null;
  notes?: string | null;
  description?: string | null;
  converted_from_invoice_id?: string | null;
  converted_to_invoice_id?: string | null;
  converted_to_invoice_number?: string | null;
}

export interface InvoiceItemRow {
  item_id?: string | null;
  invoice_id?: string | null;
  tenant_id?: string | null;
  product_id: string;
  name: string;
  quantity: number;
  unit_price?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  tax_rate?: number | string | null;
  is_service_item?: number | boolean | null;
  hsn_sac_code?: string | null;
  uom?: string | null;
  supply_type?: string | null;
  combo_id?: string | null;
  combo_details?: string | null;
}

export interface UserRow {
  role?: string | null;
  permissions?: string | null;
}

export interface CustomerRow {
  customer_id?: string;
  current_points_balance?: number | string | null;
}

export interface PartyRow {
  party_id: string;
  tenant_id?: string | null;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  balance?: string | number | null;
  gst_balance?: string | number | null;
  estimate_balance?: string | number | null;
  current_balance?: string | number | null;
  current_gst_balance?: string | number | null;
  current_estimate_balance?: string | number | null;
  balance_type?: string | null;
  party_type?: string | null;
  custom_category?: string | null;
  notes?: string | null;
  pricing_tier_id?: string | null;
  credit_limit?: string | number | null;
  credit_period_enabled?: number | boolean | null;
  credit_period_days?: number | string | null;
  credit_period_basis?: string | null;
  restrict_on_credit_expiry?: number | boolean | null;
  whatsapp_alerts_enabled?: number | boolean | null;
  last_transaction_date?: string | null;
  is_deleted?: number | null;
}

export interface PartyInput {
  party_id: string;
  tenant_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  balance?: number | string | null;
  balance_type?: string | null;
  party_type?: string | null;
  custom_category?: string | null;
  notes?: string | null;
  pricing_tier_id?: string | null;
  credit_limit?: string | number | null;
  credit_period_enabled?: unknown;
  credit_period_days?: string | number | null;
  [key: string]: unknown;
  credit_period_basis?: string | null;
  restrict_on_credit_expiry?: unknown;
  whatsapp_alerts_enabled?: unknown;
  created_by?: string | null;
  created_by_name?: string | null;
}

export interface PartyLedgerRow {
  ledger_id: string;
  party_id: string;
  tenant_id?: string | null;
  transaction_date?: string | null;
  description?: string | null;
  credit_amount?: number | null;
  debit_amount?: number | null;
  running_balance?: number | null;
  balance_type?: string | null;
  payment_method?: string | null;
  reference_number?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  is_deleted?: number | null;
}

export interface PartyLedgerEntryInput {
  ledger_id: string;
  party_id: string;
  tenant_id: string;
  amount?: string | number;
  transaction_type?: string;
  balance_type?: string;
  payment_method?: string | null;
  transaction_date?: string;
  description?: string;
  reference_number?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  skip_cash_drawer?: boolean;
}

export interface PartyLedgerBalanceRow {
  gst?: string | number | null;
  estimate?: string | number | null;
}

export interface CreditLedgerInvoice {
  /** 0 = not revenue (filing-only / excluded): such a bill never posts to the ledger. */
  counts_in_revenue?: number | null;
  invoice_id?: string;
  tenant_id?: string | null;
  invoice_number?: string | null;
  invoice_type?: string | null;
  grand_total?: number | null;
  payment_method?: string | null;
  received_amount?: number | null;
  balance_amount?: number | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_gstin?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  split_details?: SplitDetails | string | null;
  created_at?: string | null;
  is_staff?: boolean | number | null;
  isStaffCustomer?: boolean | null;
  staff_id?: string | null;
}

export interface StaffRow {
  staff_id: string;
  name?: string | null;
  phone?: string | null;
  staff_code?: string | null;
}

export interface StaffTransactionRow {
  transaction_id: string;
  staff_id: string;
  type?: string | null;
}

export interface ReturnRow {
  return_id?: string;
  tenant_id?: string | null;
  return_number: string;
  invoice_id?: string | null;
  invoice_number?: string | null;
  orig_invoice_number?: string | null;
  customer_id?: string | null;
  orig_customer_id?: string | null;
  customer_name?: string | null;
  orig_customer_name?: string | null;
  customer_phone?: string | null;
  orig_customer_phone?: string | null;
  customer_address?: string | null;
  orig_customer_address?: string | null;
  customer_gstin?: string | null;
  orig_customer_gstin?: string | null;
  grand_total?: number | string | null;
  refund_method?: string | null;
  /** ADJUST_BILL credit already used on bills, and the last bill it was used on. */
  adjusted_amount?: number | string | null;
  adjusted_invoice_number?: string | null;
  user_id?: string;
  created_at?: string;
}

export interface ProductRow {
  product_id: string;
  tenant_id?: string | null;
  name: string;
  sku_barcode?: string | null;
  item_code?: string | null;
  category?: string | null;
  hsn_sac_code?: string | null;
  purchase_price?: number | null;
  base_price?: number | null;
  is_gst_applicable?: number | boolean | null;
  tax_rate_percent?: number | string | null;
  tax_rate?: number | string | null;
  uom?: string | null;
  brand_manufacturer?: string | null;
  current_stock?: number | null;
  reorder_level?: number | null;
  domain_attributes?: string | null;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  is_deleted?: number | null;
  billing_type?: string | null;
  grade_id?: string | null;
  pricing_mode?: string | null;
  average_weight_per_piece?: number | null;
  weight_override_allowed?: number | null;
  is_service_item?: number | boolean | null;
}

export interface ProductInput {
  product_id: string;
  tenant_id: string;
  name: string;
  sku_barcode?: string | number | null;
  item_code?: string | number | null;
  category?: string | null;
  hsn_sac_code?: string | null;
  purchase_price?: number | null;
  base_price?: number | null;
  is_gst_applicable?: unknown;
  tax_rate_percent?: number | null;
  uom?: string | null;
  brand_manufacturer?: string | null;
  current_stock?: number | null;
  reorder_level?: number | null;
  domain_attributes?: string | Record<string, unknown> | null;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  is_deleted?: number | null;
  billing_type?: string | null;
  grade_id?: string | null;
  pricing_mode?: string | null;
  average_weight_per_piece?: number | null;
  weight_override_allowed?: number | null;
  is_service_item?: number | null;
  tier_prices?: Record<string, unknown> | null;
}

export interface ProductQueryArgs {
  tenant_id?: string;
  limit?: number;
  offset?: number;
  search?: string;
  sortBy?: string;
  barcode?: string;
  filterDate?: string;
  filterDateEnd?: string;
  isGst?: unknown;
  dateField?: string;
  stockStatus?: string;
}

export interface PurchaseBillItemRow {
  item_id: string;
  product_id?: string;
  quantity?: number | string | null;
  purchase_price?: number | string | null;
  selling_price?: number | string | null;
  offer_price?: number | string | null;
  tax_rate_percent?: number | string | null;
}

export interface CashDrawerRow {
  drawer_id: string;
  tenant_id?: string | null;
  business_date: string;
  status?: string;
  opening_balance?: number | null;
  cash_sales?: number | null;
  cash_in?: number | null;
  cash_out?: number | null;
  current_cash?: number | null;
  expected_closing?: number | null;
  actual_cash?: number | null;
  cash_short?: number | null;
  cash_excess?: number | null;
  closing_remarks?: string | null;
  opened_at?: string | null;
  opened_by?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  sync_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PaymentSourceRow {
  source_id: string;
  type?: string | null;
  current_balance?: number | string | null;
}

export interface CashTransactionRow {
  transaction_id: string;
  tenant_id?: string | null;
  drawer_id: string | null;
  type?: string | null;
  amount?: number | string | null;
  category?: string | null;
  notes?: string | null;
  party_name?: string | null;
}

export interface CashCategoryRow {
  is_default?: number | string | null;
}

export interface ScrapCategoryInput {
  scrap_category_id: string;
  tenant_id: string;
  name: string;
  purchase_price?: number | null;
  selling_price?: number | null;
  current_stock?: number | null;
  unit?: string | null;
}

export interface ScrapCategoryRow {
  scrap_category_id: string;
  keep_rowid: number;
}

export interface ScrapTransactionInput {
  transaction_id: string;
  tenant_id: string;
  type: string;
  scrap_category_id: string;
  quantity?: number | string | null;
  rate?: number | string | null;
  total_amount?: number | string | null;
  payment_status?: string | null;
  party_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  scrap_invoice_number?: string | null;
}

export interface ScrapTransactionRow {
  transaction_id: string;
  tenant_id?: string | null;
  type?: string | null;
  scrap_category_id?: string | null;
  quantity?: number | null;
  rate?: number | string | null;
  total_amount: number;
  payment_status?: string | null;
  party_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  scrap_invoice_number?: string | null;
  created_at?: string | null;
  is_deleted?: number | null;
}

export interface ScrapInvoiceListRow {
  invoice_number: string;
  item_count?: number;
  total_qty?: number;
  units?: string | null;
  total_amount?: number;
  payment_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  party_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
}

export interface ScrapInvoiceItemInput {
  scrap_category_id?: string;
  product_id?: string;
  quantity?: number | string | null;
  rate?: number | string | null;
  notes?: string | null;
}

export interface ScrapTransactionUpdateInput {
  transaction_id: string;
  tenant_id: string;
  scrap_category_id?: string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  party_name?: string | null;
  notes?: string | null;
}

export interface ScrapTotalRow {
  total?: string;
}

export interface InvoiceCashFields {
    counts_in_revenue?: number;
  payment_method?: string | null;
  grand_total?: number | null;
  received_amount?: number | null;
  return_deduction?: number | null;
  scrap_deduction?: number | null;
  split_details?: SplitDetails | string | null;
}

export interface InvoicePaymentFields extends InvoiceCashFields {
  invoice_number?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  payment_source_id?: string | null;
}

export interface DomainAttributes {
  gst_type?: string;
  paper_mrp?: number | string | null;
  paper_purchase_price?: number | string | null;
  paper_base_price?: number | string | null;
  paper_offer_price?: number | string | null;
  paper_offer?: number | string | null;
  paper_stock?: number | string | null;
  gst_purchase_price?: number | string | null;
  [key: string]: unknown;
}

export interface SeriesSetting {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface BarcodeRow {
  sku_barcode: string;
}

export interface LoyaltyConfig {
  enabled?: boolean;
  earningRate?: number;
  awardPointsOnPending?: boolean;
  [key: string]: unknown;
}
