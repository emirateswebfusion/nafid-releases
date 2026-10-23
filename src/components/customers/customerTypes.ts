/** Row and view types of the customers screen (customer, party, loyalty transaction, invoice and item, combo offer). */
export interface PricingTier {
  pricing_tier_id: string;
  name: string;
}

export interface Customer {
  customer_id: string;
  name: string;
  phone: string;
  address: string;
  total_points_earned: number;
  total_points_redeemed: number;
  current_points_balance: number;
  last_purchase_date: string;
  created_at: string;
  party_balance?: number;
  credit_limit?: number;
  credit_period_enabled?: boolean | number;
  credit_period_days?: number;
  credit_period_basis?: 'BILL_BASED' | 'OLDEST_UNPAID' | string;
  restrict_on_credit_expiry?: boolean | number;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
  oldest_overdue_days?: number;
  pricing_tier_id?: string;
  pricing_tier_name?: string;
}

export interface Party {
  party_id: string;
  name: string;
  phone: string;
  balance: number;
  gst_balance?: number;
  estimate_balance?: number;
  balance_type: 'RECEIVABLE' | 'PAYABLE';
  credit_limit?: number;
  credit_period_enabled?: boolean | number;
  credit_period_days?: number;
  credit_period_basis?: 'BILL_BASED' | 'OLDEST_UNPAID' | string;
  restrict_on_credit_expiry?: boolean | number;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
}

export interface LoyaltyTx {
  transaction_id: string;
  customer_id: string;
  invoice_id: string;
  transaction_type: 'EARNED' | 'REDEEMED' | 'ADJUSTED';
  points: number;
  points_balance_before: number;
  points_balance_after: number;
  reference_number: string;
  description: string;
  created_by: string;
  created_at: string;
}

export interface InvoiceRecord {
  invoice_id: string;
  invoice_number: string;
  grand_total: number;
  created_at: string;
  points_earned: number;
  points_redeemed: number;
  points_redeemed_discount: number;
  payment_method?: string;
  invoice_type?: string;
  customer_gstin?: string;
  subtotal?: number;
  tax_total?: number;
  discount_total?: number;
  received_amount?: number;
  balance_amount?: number;
  discount_value?: number;
  scrap_deduction?: number;
  scrap_invoice_number?: string;
  return_deduction?: number;
  return_invoice_number?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_state?: string;
  biller_name?: string;
  description?: string;
  notes?: string;
  discount_type?: string;
  split_details?: string;
  due_date?: string | null;
  is_credit_bill?: boolean;
  outstanding_amount?: number;
  is_overdue?: boolean;
  overdue_days?: number;
  remaining_days?: number;
  credit_status?: 'OVERDUE' | 'DUE_SOON' | 'ACTIVE' | 'PAID' | 'NON_CREDIT' | string;
}

export interface InvoiceItemRow {
  item_id?: string;
  tax_amount?: number | null;
  name?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  billing_type?: string;
  pieces_sold?: number;
  pieces_override?: number;
  unit?: string;
  uom?: string;
  brand_manufacturer?: string;
  hsn_code?: string;
  tax_rate_percent?: number;
  product_id?: string;
  combo_id?: string;
  combo_details?: string;
}

export type InvoiceStyle = 'standard' | 'boxed' | 'modern' | 'classic' | 'half-a4';

export type ComboItemLine = { product_id: string; quantity: number; product_name?: string };

export type ComboOffer = { combo_id?: string; name?: string; items?: ComboItemLine[] };

export type View = 'list' | 'detail';

export type DetailTab = 'purchases' | 'points';
