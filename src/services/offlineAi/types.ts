/** Shared types of the offline AI assistant. */
export type AiRow = { actual_cash?: number | null; amount?: number | null; avgOrder?: number | null; balance?: number | null; balance_amount?: number | null; base_price?: number | null; cash_in?: number | null; cash_out?: number | null; cash_sales?: number | null; count?: number | null; credit_amount?: number | null; current_balance?: number | null; current_cash?: number | null; current_stock?: number | null; debit_amount?: number | null; discount_total?: number | null; expected_closing?: number | null; grand_total?: number | null; gst_qty?: number | null; min_stock_alert?: number | null; offer_price?: number | null; opening_balance?: number | null; points_redeemed_discount?: number | null; purchase_price?: number | null; quantity?: number | null; received_amount?: number | null; reorder_level?: number | null; running_balance?: number | null; selling_price?: number | null; stock_quantity?: number | null; tax_rate_percent?: number | null; tax_total?: number | null; total?: number | null; total_amount?: number | null; total_qty?: number | null; total_revenue?: number | null; balance_type?: string | null; bill_date?: string | null; biller_name?: string | null; biller_staff_name?: string | null; business_date?: string | null; category?: string | null; code?: string | null; converted_to_invoice_id?: string | null; counter_name?: string | null; created_at?: string | null; created_by_name?: string | null; customer_id?: string | null; customer_name?: string | null; customer_phone?: string | null; date?: string | null; description?: string | null; expiry_date?: string | null; invoice_date?: string | null; invoice_number?: string | null; invoice_type?: string | null; item_code?: string | null; name?: string | null; notes?: string | null; party_id?: string | null; party_type?: string | null; payment_method?: string | null; payment_type?: string | null; phone?: string | null; product_name?: string | null; refund_method?: string | null; return_date?: string | null; return_id?: string | null; sku_barcode?: string | null; status?: string | null; supplier?: string | null; supplier_name?: string | null; transaction_date?: string | null; transaction_type?: string | null; type?: string | null; uom?: string | null; items?: AiRow[]; split_details?: string | Record<string, number> | null };
export type AiHistoryMessage = { role: string; content: string };
export type AiIntentParams = { customLabel?: string; checkToday?: boolean; rawQuery?: string; message?: string; messageMal?: string; days?: number; customerName?: string; code?: string; isLastHour?: boolean; metric?: string; year?: string; compareType?: string; isRevenue?: boolean; rangeType?: string; customFrom?: string; customTo?: string; specificDate?: string; compareWith?: string; method?: string; topic?: string; searchQuery?: string; productName?: string; minAmount?: number; limit?: number; isLowest?: boolean; includeBarcode?: boolean };

export interface OfflineAiResponse {
  content: string;
  data?: unknown;
  chartData?: {
    type?: string;
    title?: string;
    labelKey: string;
    dataKey: string;
    items: Array<Record<string, unknown>>;
  };
  suggestedPrompts?: string[];
  intent?: string;
  domain?: string;
  clarificationRequired?: boolean;
}

export interface OfflineDateRange {
  fromDate: string;
  toDate: string;
  label: string;
  daysCount: number;
}

export interface CapabilityDefinition {
  id: string;
  domain: string;
  description: string;
  requiredFields: string[];
  handler: string;
}

export interface ParsedOfflineIntent {
  intent: string;
  domain?: string;
  params: AiIntentParams;
  clarificationRequired?: boolean;
}
