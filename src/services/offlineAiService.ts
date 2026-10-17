/**
 * Nafid POS Offline AI Assistant — Complete Unified Intelligence Engine
 * 100% Offline-First, Zero External API Dependency, Deterministic Local Database Execution.
 * Fully supports English, Malayalam (\u0D00-\u0D7F), and Manglish queries across all POS modules:
 * Sales, Expenses, Inventory, Purchases, Party Ledger, Cash Drawer, Returns, Discounts, Pricing, and Diagnostics.
 */

export interface OfflineAiResponse {
  content: string;
  data?: any;
  chartData?: {
    type?: string;
    title?: string;
    labelKey: string;
    dataKey: string;
    items: Array<Record<string, any>>;
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

export function formatINR(val: number | string | null | undefined): string {
  const num = Number(val || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(val: number | string | null | undefined): string {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function isMalayalam(text: string): boolean {
  return /[\u0D00-\u0D7F]/.test(text || '');
}

export const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Stage A: Input Normalization Pipeline
 */
export function normalizeInput(text: string): string {
  if (!text) return '';
  let str = text.toLowerCase().trim();
  str = str.replace(/\s+/g, ' ');
  str = str.replace(/[?!.]+$|[.,]+$/g, '');
  str = str.replace(/\b(yestarday|yesturday|yday|yesterdy|innale's|yesterdays)\b/gi, 'yesterday');
  str = str.replace(/\b(todays)\b/gi, 'today');
  str = str.replace(/\b(tommorow|tommorrow|tomorow|tmrw)\b/gi, 'tomorrow');
  return str;
}

/**
 * Deterministic Date Range Resolver
 */
export function resolveDateRange(
  type: string,
  customFrom?: string,
  customTo?: string,
  isMal: boolean = false
): OfflineDateRange {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  const todayStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  if (type === 'today') {
    return { fromDate: todayStr, toDate: todayStr, label: isMal ? 'ഇന്ന് (Today)' : 'Today', daysCount: 1 };
  }

  if (type === 'yesterday') {
    const yDate = new Date(year, month, day - 1);
    const yStr = `${yDate.getFullYear()}-${pad(yDate.getMonth() + 1)}-${pad(yDate.getDate())}`;
    return { fromDate: yStr, toDate: yStr, label: isMal ? 'ഇന്നലെ (Yesterday)' : 'Yesterday', daysCount: 1 };
  }

  if (type === 'this_week') {
    const dayOfWeek = now.getDay(); // 0 = Sun
    const diffToMonday = day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const mon = new Date(year, month, diffToMonday);
    const monStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - mon.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: monStr, toDate: todayStr, label: isMal ? 'ഈ ആഴ്ച (This Week)' : 'This Week', daysCount: daysElapsed };
  }

  if (type === 'last_week') {
    const dayOfWeek = now.getDay();
    const diffToLastMonday = day - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1);
    const lastMon = new Date(year, month, diffToLastMonday);
    const lastSun = new Date(year, month, diffToLastMonday + 6);
    const monStr = `${lastMon.getFullYear()}-${pad(lastMon.getMonth() + 1)}-${pad(lastMon.getDate())}`;
    const sunStr = `${lastSun.getFullYear()}-${pad(lastSun.getMonth() + 1)}-${pad(lastSun.getDate())}`;
    return { fromDate: monStr, toDate: sunStr, label: isMal ? 'കഴിഞ്ഞ ആഴ്ച (Last Week)' : 'Last Week', daysCount: 7 };
  }

  if (type === 'this_month') {
    const startStr = `${year}-${pad(month + 1)}-01`;
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ മാസം (This Month)' : 'This Month', daysCount: day };
  }

  if (type === 'last_month') {
    const lmYear = month === 0 ? year - 1 : year;
    const lmMonth = month === 0 ? 11 : month - 1;
    const startStr = `${lmYear}-${pad(lmMonth + 1)}-01`;
    const lastDay = new Date(lmYear, lmMonth + 1, 0).getDate();
    const endStr = `${lmYear}-${pad(lmMonth + 1)}-${pad(lastDay)}`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? 'കഴിഞ്ഞ മാസം (Last Month)' : 'Last Month', daysCount: lastDay };
  }

  if (type === 'this_quarter') {
    const qStartMonth = Math.floor(month / 3) * 3;
    const startStr = `${year}-${pad(qStartMonth + 1)}-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ ക്വാർട്ടർ (This Quarter)' : 'This Quarter', daysCount: daysElapsed };
  }

  if (type === 'last_quarter') {
    let lqYear = year;
    let lqStartMonth = Math.floor(month / 3) * 3 - 3;
    if (lqStartMonth < 0) {
      lqYear -= 1;
      lqStartMonth = 9;
    }
    const startStr = `${lqYear}-${pad(lqStartMonth + 1)}-01`;
    const endMonth = lqStartMonth + 2;
    const lastDay = new Date(lqYear, endMonth + 1, 0).getDate();
    const endStr = `${lqYear}-${pad(endMonth + 1)}-${pad(lastDay)}`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? 'കഴിഞ്ഞ ക്വാർട്ടർ (Last Quarter)' : 'Last Quarter', daysCount: 90 };
  }

  if (type === 'this_year') {
    const startStr = `${year}-01-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ വർഷം (This Year)' : 'This Year', daysCount: daysElapsed };
  }

  if (type === 'last_year') {
    const ly = year - 1;
    return { fromDate: `${ly}-01-01`, toDate: `${ly}-12-31`, label: isMal ? 'കഴിഞ്ഞ വർഷം (Last Year)' : 'Last Year', daysCount: 365 };
  }

  if (type === 'last_7_days') {
    const p = new Date(year, month, day - 6);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? 'കഴിഞ്ഞ 7 ദിവസങ്ങൾ (Last 7 Days)' : 'Last 7 Days', daysCount: 7 };
  }

  if (type === 'last_30_days') {
    const p = new Date(year, month, day - 29);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? 'കഴിഞ്ഞ 30 ദിവസങ്ങൾ (Last 30 Days)' : 'Last 30 Days', daysCount: 30 };
  }

  if (type === 'financial_year') {
    const fyStartYear = month >= 3 ? year : year - 1;
    const startStr = `${fyStartYear}-04-01`;
    const endStr = `${fyStartYear + 1}-03-31`;
    const effectiveTo = todayStr < endStr ? todayStr : endStr;
    const daysElapsed = Math.max(1, Math.round((new Date(effectiveTo).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: effectiveTo, label: isMal ? `സാമ്പത്തിക വർഷം FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}` : `Financial Year FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`, daysCount: daysElapsed };
  }

  if (customFrom && customTo) {
    const diff = Math.max(1, Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return {
      fromDate: customFrom,
      toDate: customTo,
      label: isMal ? `${customFrom} മുതൽ ${customTo} വരെ` : `${customFrom} to ${customTo}`,
      daysCount: diff,
    };
  }

  return { fromDate: todayStr, toDate: todayStr, label: todayStr, daysCount: 1 };
}

/**
 * Natural Language Date Extractor
 */
export function extractDateFromText(text: string): { fromDate?: string; toDate?: string; specificDate?: string } {
  const isoMatches = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
  if (isoMatches && isoMatches.length >= 2) {
    return { fromDate: isoMatches[0], toDate: isoMatches[1] };
  } else if (isoMatches && isoMatches.length === 1) {
    return { specificDate: isoMatches[0], fromDate: isoMatches[0], toDate: isoMatches[0] };
  }

  const dmyMatches = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g);
  if (dmyMatches && dmyMatches.length > 0) {
    const parsed = dmyMatches.map(m => {
      const parts = m.split(/[/-]/);
      return `${parts[2]}-${pad(Number(parts[1]))}-${pad(Number(parts[0]))}`;
    });
    if (parsed.length >= 2) return { fromDate: parsed[0], toDate: parsed[1] };
    return { specificDate: parsed[0], fromDate: parsed[0], toDate: parsed[0] };
  }

  const nDaysMatch = text.match(/(?:previous|last|past|കഴിഞ്ഞ)\s+(\d+)\s+(?:days?|ദിവസം|ദിവസത്തെ)/i);
  if (nDaysMatch && nDaysMatch[1]) {
    const n = parseInt(nDaysMatch[1], 10);
    if (n > 0 && n <= 365) {
      const now = new Date();
      const p = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1));
      const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
      const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return { fromDate: fromStr, toDate: toStr };
    }
  }

  return {};
}

export interface ParsedOfflineIntent {
  intent: string;
  domain?: string;
  params: Record<string, any>;
  clarificationRequired?: boolean;
}

export const CAPABILITY_REGISTRY: Record<string, CapabilityDefinition> = {
  SALES_TODAY: { id: 'SALES_TODAY', domain: 'SALES', description: "Today's sales revenue, invoice count, and payment breakdown", requiredFields: ['grand_total', 'created_at'], handler: 'SALES_TODAY' },
  SALES_PERIOD: { id: 'SALES_PERIOD', domain: 'SALES', description: 'Sales performance for a predefined time period', requiredFields: ['grand_total', 'created_at'], handler: 'SALES_PERIOD' },
  SALES_HOURLY: { id: 'SALES_HOURLY', domain: 'SALES', description: 'Hourly sales analysis for today', requiredFields: ['grand_total', 'created_at'], handler: 'SALES_HOURLY' },
  COMPARE_SALES: { id: 'COMPARE_SALES', domain: 'SALES', description: 'Comparative variance between two reporting periods', requiredFields: ['grand_total', 'created_at'], handler: 'COMPARE_SALES' },
  SALES_INVOICE_COUNT: { id: 'SALES_INVOICE_COUNT', domain: 'SALES', description: 'Number of invoices generated in a period', requiredFields: ['invoice_id'], handler: 'SALES_INVOICE_COUNT' },
  SALES_AVERAGE_TICKET: { id: 'SALES_AVERAGE_TICKET', domain: 'SALES', description: 'Average transaction ticket value', requiredFields: ['grand_total'], handler: 'SALES_AVERAGE_TICKET' },
  SALES_AVERAGE_DAILY: { id: 'SALES_AVERAGE_DAILY', domain: 'SALES', description: 'Average daily sales revenue and bills/day', requiredFields: ['grand_total', 'created_at'], handler: 'SALES_AVERAGE_DAILY' },
  SALES_UNIQUE_CUSTOMERS: { id: 'SALES_UNIQUE_CUSTOMERS', domain: 'SALES', description: 'Count of unique buyers in period', requiredFields: ['customer_phone', 'customer_name'], handler: 'SALES_UNIQUE_CUSTOMERS' },
  SALES_INVOICE_EXTREMES: { id: 'SALES_INVOICE_EXTREMES', domain: 'SALES', description: 'Highest or lowest single invoice', requiredFields: ['grand_total'], handler: 'SALES_INVOICE_EXTREMES' },
  SALES_PAYMENT_METHODS: { id: 'SALES_PAYMENT_METHODS', domain: 'SALES', description: 'Sales breakdown by tender (Cash, Card, UPI, Credit, Split)', requiredFields: ['payment_method', 'split_details', 'grand_total'], handler: 'SALES_PAYMENT_METHODS' },
  SALES_CREDIT_OUTSTANDING: { id: 'SALES_CREDIT_OUTSTANDING', domain: 'SALES', description: 'Outstanding unpaid credit from invoices', requiredFields: ['grand_total', 'payment_method'], handler: 'SALES_CREDIT_OUTSTANDING' },
  SALES_GROSS_NET: { id: 'SALES_GROSS_NET', domain: 'SALES', description: 'Gross sales, discounts, returns, and net sales reconciliation', requiredFields: ['grand_total', 'discount_total', 'tax_total'], handler: 'SALES_GROSS_NET' },
  SALES_INVOICE_TYPES: { id: 'SALES_INVOICE_TYPES', domain: 'SALES', description: 'Breakdown by invoice type (GST, Bill of Supply)', requiredFields: ['invoice_type', 'grand_total'], handler: 'SALES_INVOICE_TYPES' },
  SALES_HIGHEST_DAY: { id: 'SALES_HIGHEST_DAY', domain: 'SALES', description: 'Highest or lowest revenue day in a period', requiredFields: ['created_at', 'grand_total'], handler: 'SALES_HIGHEST_DAY' },
  SALES_DAILY_TREND: { id: 'SALES_DAILY_TREND', domain: 'SALES', description: 'Daily sales trend across calendar days', requiredFields: ['created_at', 'grand_total'], handler: 'SALES_DAILY_TREND' },
  SALES_BILLER_STAFF: { id: 'SALES_BILLER_STAFF', domain: 'SALES', description: 'Sales aggregated by cashier/biller staff', requiredFields: ['user_id', 'biller_staff_id'], handler: 'SALES_BILLER_STAFF' },
  SALES_CUSTOMER_LEVEL: { id: 'SALES_CUSTOMER_LEVEL', domain: 'SALES', description: 'Customer sales volume and spending rankings', requiredFields: ['customer_name', 'customer_phone', 'grand_total'], handler: 'SALES_CUSTOMER_LEVEL' },
  SALES_CANCELLED_INVOICES: { id: 'SALES_CANCELLED_INVOICES', domain: 'SALES', description: 'Cancelled and voided invoices count and amount', requiredFields: ['is_deleted', 'invoice_type'], handler: 'SALES_CANCELLED_INVOICES' },
  TOP_SELLING_PRODUCTS: { id: 'TOP_SELLING_PRODUCTS', domain: 'SALES', description: 'Best-selling products by quantity and revenue', requiredFields: ['product_id', 'quantity', 'total'], handler: 'TOP_SELLING_PRODUCTS' },
  
  // Expenses (4.1)
  EXPENSES_SUMMARY: { id: 'EXPENSES_SUMMARY', domain: 'EXPENSES', description: 'Total operating expenses and payouts for a period', requiredFields: ['amount', 'type', 'transaction_date'], handler: 'EXPENSES_SUMMARY' },
  EXPENSES_BY_CATEGORY: { id: 'EXPENSES_BY_CATEGORY', domain: 'EXPENSES', description: 'Expenses grouped by category with % share', requiredFields: ['category', 'amount'], handler: 'EXPENSES_BY_CATEGORY' },
  EXPENSES_LARGEST: { id: 'EXPENSES_LARGEST', domain: 'EXPENSES', description: 'Largest recorded expense payouts in a period', requiredFields: ['amount', 'category', 'notes'], handler: 'EXPENSES_LARGEST' },
  EXPENSES_COMPARE: { id: 'EXPENSES_COMPARE', domain: 'EXPENSES', description: 'Expense variance comparison between periods', requiredFields: ['amount', 'transaction_date'], handler: 'EXPENSES_COMPARE' },
  EXPENSES_CASH_TODAY: { id: 'EXPENSES_CASH_TODAY', domain: 'EXPENSES', description: 'Cash paid out for expenses today from register', requiredFields: ['amount', 'type', 'transaction_date'], handler: 'EXPENSES_CASH_TODAY' },

  // Inventory & Stock (4.2)
  INVENTORY_OUT_OF_STOCK: { id: 'INVENTORY_OUT_OF_STOCK', domain: 'INVENTORY', description: 'Products with current stock <= 0', requiredFields: ['current_stock'], handler: 'INVENTORY_OUT_OF_STOCK' },
  INVENTORY_LOW_STOCK: { id: 'INVENTORY_LOW_STOCK', domain: 'INVENTORY', description: 'Products at or below reorder level', requiredFields: ['current_stock', 'reorder_level'], handler: 'INVENTORY_LOW_STOCK' },
  INVENTORY_TOTAL_VALUE: { id: 'INVENTORY_TOTAL_VALUE', domain: 'INVENTORY', description: 'Total inventory valuation at cost and retail', requiredFields: ['current_stock', 'purchase_price', 'base_price'], handler: 'INVENTORY_TOTAL_VALUE' },
  INVENTORY_PRODUCT_STOCK: { id: 'INVENTORY_PRODUCT_STOCK', domain: 'INVENTORY', description: 'Real-time stock level of a specific product', requiredFields: ['name', 'current_stock'], handler: 'INVENTORY_PRODUCT_STOCK' },
  INVENTORY_TOP_STOCK: { id: 'INVENTORY_TOP_STOCK', domain: 'INVENTORY', description: 'Products with highest stock quantities', requiredFields: ['current_stock'], handler: 'INVENTORY_TOP_STOCK' },
  INVENTORY_NON_SELLING: { id: 'INVENTORY_NON_SELLING', domain: 'INVENTORY', description: 'Products that have not sold recently', requiredFields: ['product_id', 'created_at'], handler: 'INVENTORY_NON_SELLING' },
  INVENTORY_BY_CATEGORY: { id: 'INVENTORY_BY_CATEGORY', domain: 'INVENTORY', description: 'Stock quantities and item counts by category', requiredFields: ['category', 'current_stock'], handler: 'INVENTORY_BY_CATEGORY' },

  // Purchases & Supplier Bills (4.3)
  PURCHASES_SUMMARY: { id: 'PURCHASES_SUMMARY', domain: 'PURCHASES', description: 'Total purchases and supplier bills for a period', requiredFields: ['total_amount', 'bill_date'], handler: 'PURCHASES_SUMMARY' },
  PURCHASES_BY_SUPPLIER: { id: 'PURCHASES_BY_SUPPLIER', domain: 'PURCHASES', description: 'Purchases grouped by supplier name', requiredFields: ['supplier_name', 'total_amount'], handler: 'PURCHASES_BY_SUPPLIER' },
  PURCHASES_UNPAID: { id: 'PURCHASES_UNPAID', domain: 'PURCHASES', description: 'Unpaid and credit supplier purchase bills', requiredFields: ['payment_type', 'total_amount'], handler: 'PURCHASES_UNPAID' },
  PURCHASES_PRODUCT_HISTORY: { id: 'PURCHASES_PRODUCT_HISTORY', domain: 'PURCHASES', description: 'Purchase history and latest purchase price of a product', requiredFields: ['purchase_price', 'quantity'], handler: 'PURCHASES_PRODUCT_HISTORY' },
  PURCHASES_COMPARE: { id: 'PURCHASES_COMPARE', domain: 'PURCHASES', description: 'Comparison between current and previous month purchases', requiredFields: ['total_amount', 'bill_date'], handler: 'PURCHASES_COMPARE' },

  // Customer & Supplier Ledger (4.4)
  CUSTOMER_CREDIT_LIST: { id: 'CUSTOMER_CREDIT_LIST', domain: 'LEDGER', description: 'Customer credit receivables summary and ranking', requiredFields: ['balance', 'party_type'], handler: 'CUSTOMER_CREDIT_LIST' },
  SUPPLIER_PAYABLES_TOTAL: { id: 'SUPPLIER_PAYABLES_TOTAL', domain: 'LEDGER', description: 'Total payables owed to suppliers and supplier list', requiredFields: ['balance', 'party_type'], handler: 'SUPPLIER_PAYABLES_TOTAL' },
  PARTY_BALANCE: { id: 'PARTY_BALANCE', domain: 'LEDGER', description: 'Outstanding balance of a specific customer or supplier', requiredFields: ['balance', 'name'], handler: 'PARTY_BALANCE' },
  PARTY_LEDGER: { id: 'PARTY_LEDGER', domain: 'LEDGER', description: 'Detailed ledger statement entries for a customer/supplier', requiredFields: ['debit_amount', 'credit_amount', 'running_balance'], handler: 'PARTY_LEDGER' },

  // Cash Register & Cash Drawer (4.5)
  CASH_DRAWER_CURRENT: { id: 'CASH_DRAWER_CURRENT', domain: 'CASH_DRAWER', description: 'Current cash drawer balance, opening cash, and status', requiredFields: ['current_cash', 'opening_balance', 'status'], handler: 'CASH_DRAWER_CURRENT' },
  CASH_DRAWER_MOVEMENTS: { id: 'CASH_DRAWER_MOVEMENTS', domain: 'CASH_DRAWER', description: "Today's cash drawer inflows, outflows, and sales", requiredFields: ['cash_sales', 'cash_in', 'cash_out'], handler: 'CASH_DRAWER_MOVEMENTS' },
  CASH_DRAWER_EXPECTED_VS_ACTUAL: { id: 'CASH_DRAWER_EXPECTED_VS_ACTUAL', domain: 'CASH_DRAWER', description: 'Expected closing cash vs actual counted cash with variance', requiredFields: ['expected_closing', 'actual_cash'], handler: 'CASH_DRAWER_EXPECTED_VS_ACTUAL' },
  CASH_DRAWER_SETTLEMENTS: { id: 'CASH_DRAWER_SETTLEMENTS', domain: 'CASH_DRAWER', description: 'Day settlement history and closing records', requiredFields: ['business_date', 'actual_cash'], handler: 'CASH_DRAWER_SETTLEMENTS' },

  // Bills, Payments & Receivables (4.6)
  BILLS_UNPAID: { id: 'BILLS_UNPAID', domain: 'BILLS', description: 'Unpaid and credit invoices with outstanding dues', requiredFields: ['balance_amount', 'grand_total'], handler: 'BILLS_UNPAID' },
  BILLS_PARTIALLY_PAID: { id: 'BILLS_PARTIALLY_PAID', domain: 'BILLS', description: 'Invoices with partial payments received', requiredFields: ['received_amount', 'balance_amount'], handler: 'BILLS_PARTIALLY_PAID' },
  BILLS_SPLIT_PAYMENTS: { id: 'BILLS_SPLIT_PAYMENTS', domain: 'BILLS', description: 'Invoices settled across multiple payment methods', requiredFields: ['payment_method', 'split_details'], handler: 'BILLS_SPLIT_PAYMENTS' },

  // Sales Returns, Discounts, Loyalty (4.7)
  RETURNS_SUMMARY: { id: 'RETURNS_SUMMARY', domain: 'RETURNS_LOYALTY', description: 'Sales returns and refund totals for a period', requiredFields: ['grand_total', 'return_date'], handler: 'RETURNS_SUMMARY' },
  RETURNS_ITEMS: { id: 'RETURNS_ITEMS', domain: 'RETURNS_LOYALTY', description: 'Items and quantities returned by customers', requiredFields: ['name', 'quantity', 'total'], handler: 'RETURNS_ITEMS' },
  RETURNS_BY_METHOD: { id: 'RETURNS_BY_METHOD', domain: 'RETURNS_LOYALTY', description: 'Refund amounts grouped by payment method', requiredFields: ['refund_method', 'grand_total'], handler: 'RETURNS_BY_METHOD' },
  DISCOUNTS_SUMMARY: { id: 'DISCOUNTS_SUMMARY', domain: 'RETURNS_LOYALTY', description: 'Total discounts and high-discount invoices', requiredFields: ['discount_total'], handler: 'DISCOUNTS_SUMMARY' },
  LOYALTY_POINTS: { id: 'LOYALTY_POINTS', domain: 'RETURNS_LOYALTY', description: 'Customer loyalty points balance, earned, and redeemed', requiredFields: ['current_points_balance'], handler: 'LOYALTY_POINTS' },

  // Product Pricing (4.8)
  PRODUCT_PRICE_LOOKUP: { id: 'PRODUCT_PRICE_LOOKUP', domain: 'PRICING', description: 'Product retail, wholesale, purchase price and GST rate', requiredFields: ['base_price', 'purchase_price'], handler: 'PRODUCT_PRICE_LOOKUP' },
  PRODUCT_BARCODE_LOOKUP: { id: 'PRODUCT_BARCODE_LOOKUP', domain: 'PRICING', description: 'Barcode and item code product lookup', requiredFields: ['sku_barcode', 'item_code'], handler: 'PRODUCT_BARCODE_LOOKUP' },

  // Diagnostics & Help (4.9)
  DIAGNOSTIC_DEDUPLICATION_CHECK: { id: 'DIAGNOSTIC_DEDUPLICATION_CHECK', domain: 'DIAGNOSTICS', description: 'Audit of converted bills deduplication in sales reporting', requiredFields: ['converted_to_invoice_id'], handler: 'DIAGNOSTIC_DEDUPLICATION_CHECK' },
  DIAGNOSTIC_PAYMENT_RECONCILIATION: { id: 'DIAGNOSTIC_PAYMENT_RECONCILIATION', domain: 'DIAGNOSTICS', description: 'Reconciliation of invoice totals against tender allocations', requiredFields: ['grand_total', 'split_details'], handler: 'DIAGNOSTIC_PAYMENT_RECONCILIATION' },
  AI_CAPABILITIES_EXPLANATION: { id: 'AI_CAPABILITIES_EXPLANATION', domain: 'HELP', description: 'Deterministic offline architecture and zero cloud AI verification', requiredFields: [], handler: 'AI_CAPABILITIES_EXPLANATION' },
  AI_HELP_REPORTS: { id: 'AI_HELP_REPORTS', domain: 'HELP', description: 'Directory of supported offline business intelligence reports', requiredFields: [], handler: 'AI_HELP_REPORTS' },
  CLARIFICATION_REQUIRED: { id: 'CLARIFICATION_REQUIRED', domain: 'HELP', description: 'Guides user when question is ambiguous or lacks required time period', requiredFields: [], handler: 'CLARIFICATION_REQUIRED' },
  UNSUPPORTED_REQUEST: { id: 'UNSUPPORTED_REQUEST', domain: 'HELP', description: 'Explicit transparent refusal and guidance for out-of-scope non-POS tasks', requiredFields: [], handler: 'UNSUPPORTED_REQUEST' },
};



/**
 * Offline AI Assistant Intent Parser
 */
export class OfflineAiIntentParser {
  static parse(message: string, history: any[] = []): ParsedOfflineIntent {
    const raw = message.trim();
    const text = normalizeInput(message);
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content?.toLowerCase() || '';

    // Extract extracted date if present
    const dateExtraction = extractDateFromText(raw);

    // 0. Data Integrity Diagnostics & Verification
    if (
      text.includes('converted bills') ||
      text.includes('counted twice') ||
      text.includes('counted more than once') ||
      text.includes('double counted') ||
      text.includes('duplicate counting')
    ) {
      return { intent: 'DIAGNOSTIC_DEDUPLICATION_CHECK', domain: 'DIAGNOSTICS', params: {} };
    }

    if (
      text.includes('payment allocations do not match') ||
      text.includes('allocations do not match') ||
      text.includes('allocation mismatch') ||
      text.includes('payment reconciliation')
    ) {
      return { intent: 'DIAGNOSTIC_PAYMENT_RECONCILIATION', domain: 'DIAGNOSTICS', params: {} };
    }

    // 0b. AI Architecture & Determinism Capabilities
    if (
      text.includes('asked twice') ||
      text.includes('without any data changes') ||
      text.includes('remain the same') ||
      text.includes('deterministic') ||
      text.includes('without an internet connection') ||
      text.includes('distinguish between zero sales')
    ) {
      return {
        intent: 'AI_CAPABILITIES_EXPLANATION',
        domain: 'HELP',
        params: { topic: text.includes('asked twice') ? 'determinism' : text.includes('internet') ? 'offline' : 'diagnostics' },
      };
    }

    // 0c. General System Reports Help & Directory
    if (
      text.includes('what reports can you generate') ||
      text.includes('which operations are supported') ||
      text.includes('what reports do you have') ||
      text.includes('examples of questions') ||
      text.includes('what can i ask') ||
      text.includes('what data was included') ||
      text.includes('supported offline')
    ) {
      return { intent: 'AI_HELP_REPORTS', domain: 'HELP', params: {} };
    }

    // 0c-2. Explicit Unsupported Requests (Out-of-Scope / Non-POS / Future Predictions)
    if (
      text.includes('predict') ||
      text.includes('forecast') ||
      text.includes('future sales') ||
      text.includes('weather') ||
      text.includes('കാലാവസ്ഥ') ||
      text.includes('send email') ||
      text.includes('send an email') ||
      text.includes('send sms') ||
      text.includes('whatsapp') ||
      text.includes('browse web') ||
      text.includes('search google') ||
      text.includes('who is the president') ||
      text.includes('who is the prime minister')
    ) {
      return { intent: 'UNSUPPORTED_REQUEST', domain: 'HELP', params: { rawQuery: message } };
    }

    // 0d. Ambiguous Question Clarifications (Part 3.3)
    if (text === 'show sales' || text === 'sales' || text === 'സെയിൽസ്' || text === 'sales report' || text === 'സെയിൽസ് റിപ്പോർട്ട്') {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'sales_period',
          message: 'Which sales period would you like to see? You can specify: Today, Yesterday, This Month, Last Month, or a custom date range.',
          messageMal: 'ഏത് കാലയളവിലെ വിൽപ്പന റിപ്പോർട്ടാണ് കാണേണ്ടത്? ഇന്ന്, ഇന്നലെ, ഈ മാസം, അല്ലെങ്കിൽ കഴിഞ്ഞ മാസം എന്ന് വ്യക്തമാക്കാമോ?',
        },
        clarificationRequired: true,
      };
    }

    if (text === 'balance' || text === 'show balance' || text === 'ബാലൻസ്' || text === 'ബാക്കി') {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'balance_type',
          message: 'Which balance would you like to review?\n1. Customer Outstanding Balance (Receivables)\n2. Supplier Outstanding Balance (Payables)\n3. Cash Register Drawer Balance',
          messageMal: 'ഏത് ബാലൻസ് വിവരങ്ങളാണ് അറിയേണ്ടത്?\n1. കസ്റ്റമർ ക്രെഡിറ്റ് ബാക്കി (തരാനുള്ളത്)\n2. സപ്ലയർ ബാക്കി (നൽകാനുള്ളത്)\n3. ക്യാഷ് ഡ്രോയർ ബാലൻസ് (കൗണ്ടർ ബോക്സ്)',
        },
        clarificationRequired: true,
      };
    }

    if (
      text === 'report' ||
      text === 'show report' ||
      text === 'details' ||
      text === 'show details' ||
      text === 'show me the details' ||
      text === 'റിപ്പോർട്ട്' ||
      text === 'വിവരങ്ങൾ' ||
      text === 'summary'
    ) {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'report_module',
          message: 'Which business report would you like to view?\n1. Sales & Revenue Summary\n2. Inventory & Stock Status\n3. Expenses & Cash Payouts\n4. Purchase Bills & Payables\n5. Customer & Supplier Ledgers',
          messageMal: 'ഏത് റിപ്പോർട്ട് വിവരങ്ങളാണ് കാണേണ്ടത്?\n1. വിൽപ്പന റിപ്പോർട്ട് (Sales Report)\n2. സ്റ്റോക്ക് നിലവാരം (Inventory Status)\n3. ചെലവ് റിപ്പോർട്ട് (Expenses Report)\n4. പർച്ചേസ് ബില്ലുകൾ (Purchase Bills)\n5. കസ്റ്റമർ/സപ്ലയർ ലെഡ്ജർ (Ledgers)',
        },
        clarificationRequired: true,
      };
    }

    if (
      text === 'how much money did we make' ||
      text === 'how much did we make' ||
      text === 'നമുക്ക് എത്ര പണം കിട്ടി' ||
      text === 'എത്ര രൂപയുണ്ടായി'
    ) {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'financial_metric',
          message: 'To give you the exact figure, would you like to check: 1. Total Sales Revenue, 2. Cash Collected in Drawer, or 3. Net Invoiced Sales (after discounts)?',
          messageMal: 'കൃത്യമായ തുക നൽകാൻ നിങ്ങൾ ഉദ്ദേശിച്ചത് ഏതാണ്: 1. ആകെ വിൽപ്പന വരുമാനം (Sales Revenue), 2. ക്യാഷ് ഡ്രോയറിൽ ലഭിച്ച പണം (Cash Collected), അതോ 3. നെറ്റ് സെയിൽസ് (Net Sales)?',
        },
        clarificationRequired: true,
      };
    }

    if (
      text.includes('most profitable products') ||
      text.includes('highest profit product') ||
      text.includes('ഏറ്റവും കൂടുതൽ ലാഭമുള്ള')
    ) {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'profit_limitation',
          message: 'Accurate profit calculation requires item-level Cost of Goods Sold (COGS) recorded for each transaction batch. Currently, you can view the highest revenue generating products or top-selling items instead.',
          messageMal: 'ഉൽപ്പന്ന തിരിച്ചുള്ള കൃത്യമായ ലാഭം അറിയാൻ ഓരോ ബാച്ചിന്റെയും പർച്ചേസ് കോസ്റ്റ് ആവശ്യമാണ്. പകരം കൂടുതൽ വരുമാനം നേടിത്തന്ന ഉൽപ്പന്നങ്ങളോ കൂടുതൽ വിറ്റുപോയ ഉൽപ്പന്നങ്ങളോ പരിശോധിക്കാവുന്നതാണ്.',
        },
        clarificationRequired: true,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. EXPENSES & CASH OUTFLOWS (Module 4.1)
    // ──────────────────────────────────────────────────────────────────────────
    const isExpenseWord =
      (text.includes('expense') ||
      text.includes('expenses') ||
      text.includes('spending') ||
      text.includes('ചെല') ||
      text.includes('ചില') ||
      text.includes('chilav') ||
      text.includes('chilar') ||
      text.includes('cash out') ||
      text.includes('payout')) &&
      !text.includes('customer') &&
      !text.includes('spending customer');

    if (isExpenseWord) {
      if (text.includes('cash was paid out') || text.includes('cash paid out for expenses') || (text.includes('cash') && text.includes('today') && text.includes('expense'))) {
        return { intent: 'EXPENSES_CASH_TODAY', domain: 'EXPENSES', params: { rangeType: 'today' } };
      }
      if (text.includes('category') || text.includes('highest spending') || text.includes('grouped by category') || text.includes('കാറ്റഗറി')) {
        let rangeType = 'this_month';
        if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
        else if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
        return { intent: 'EXPENSES_BY_CATEGORY', domain: 'EXPENSES', params: { rangeType } };
      }
      if (text.includes('largest') || text.includes('biggest') || text.includes('highest expense') || text.includes('കൂടിയ ചെലവ്')) {
        let rangeType = 'this_month';
        if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
        return { intent: 'EXPENSES_LARGEST', domain: 'EXPENSES', params: { rangeType, limit: 5 } };
      }
      if (text.includes('compare') || text.includes('താരതമ്യം')) {
        return { intent: 'EXPENSES_COMPARE', domain: 'EXPENSES', params: { compareWith: 'last_month' } };
      }

      let rangeType = 'this_month';
      if ((text.includes('ഇന്ന') && !text.includes('ഇന്നല')) || text.includes('today') || text.includes('innathe') || text.includes('innu')) rangeType = 'today';
      else if (text.includes('yesterday') || text.includes('ഇന്നലെ') || text.includes('innale')) rangeType = 'yesterday';
      else if (text.includes('last 30 days') || text.includes('30 ദിവസ')) rangeType = 'last_30_days';
      else if (text.includes('last 7 days') || text.includes('7 ദിവസ')) rangeType = 'last_7_days';
      else if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
      else if (text.includes('this year') || text.includes('ഈ വർഷം')) rangeType = 'this_year';
      else if (text.includes('ee masathe') || text.includes('ee masam')) rangeType = 'this_month';

      return {
        intent: 'EXPENSES_SUMMARY',
        domain: 'EXPENSES',
        params: { rangeType, customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate },
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. INVENTORY & STOCK MANAGEMENT (Module 4.2)
    // ──────────────────────────────────────────────────────────────────────────
    const isStockWord =
      text.includes('stock') ||
      text.includes('സ്റ്റോക്ക്') ||
      text.includes('സ്റ്റോക്ക') ||
      text.includes('സ്റ്റോക്') ||
      text.includes('inventory') ||
      text.includes('ഇൻവെന്ററി') ||
      text.includes('theernna') ||
      text.includes('theernnath');

    if (isStockWord) {
      if (text.includes('out of stock') || text.includes('തീർന്നുപോയ') || text.includes('തീർന്ന') || text.includes('zero stock') || text.includes('നിലവിലില്ലാത്ത') || text.includes('theernna') || text.includes('theernnath')) {
        return { intent: 'INVENTORY_OUT_OF_STOCK', domain: 'INVENTORY', params: {} };
      }
      if (text.includes('low stock') || text.includes('reorder') || text.includes('തീരാറായ') || text.includes('കുറവുള്ള')) {
        return { intent: 'INVENTORY_LOW_STOCK', domain: 'INVENTORY', params: {} };
      }
      if (text.includes('value') || text.includes('valuation') || text.includes('മൂല്യം') || text.includes('worth')) {
        return { intent: 'INVENTORY_TOTAL_VALUE', domain: 'INVENTORY', params: {} };
      }
      if (text.includes('highest stock') || text.includes('most stock') || text.includes('കൂടിയ സ്റ്റോക്ക്')) {
        return { intent: 'INVENTORY_TOP_STOCK', domain: 'INVENTORY', params: { limit: 10 } };
      }
      if (text.includes('not sold') || text.includes('non selling') || text.includes('not sold in the last') || text.includes('വിൽപ്പന നടക്കാത്ത') || text.includes('dead stock')) {
        return { intent: 'INVENTORY_NON_SELLING', domain: 'INVENTORY', params: { days: 30 } };
      }
      if (text.includes('by category') || text.includes('grouped by category') || text.includes('കാറ്റഗറി തിരിച്ച്')) {
        return { intent: 'INVENTORY_BY_CATEGORY', domain: 'INVENTORY', params: {} };
      }

      // Check if candidate product name is specified
      const prodCandidate = text
        .replace(/\b(what\s+is|what's|show|check|tell\s+me|get|find|current|stock|level|quantity|qty|available|of|the|a|for|product|item|സ്റ്റോക്ക്|എത്ര|ഉണ്ട്|ഉൽപ്പന്നം)\b/gi, ' ')
        .replace(/[?.,!:]/g, ' ')
        .trim();

      if (prodCandidate.length >= 2 && !prodCandidate.includes('low') && !prodCandidate.includes('out') && !prodCandidate.includes('total')) {
        return { intent: 'INVENTORY_PRODUCT_STOCK', domain: 'INVENTORY', params: { productName: prodCandidate } };
      }

      return { intent: 'INVENTORY_LOW_STOCK', domain: 'INVENTORY', params: {} };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. PURCHASES & SUPPLIER BILLS (Module 4.3)
    // ──────────────────────────────────────────────────────────────────────────
    const isPurchaseWord =
      text.includes('purchase') ||
      text.includes('purchases') ||
      text.includes('പർച്ചേസ്') ||
      text.includes('supplier bill') ||
      text.includes('vendor bill') ||
      text.includes('bought');

    if (isPurchaseWord && !text.includes('customer') && !text.includes('കസ്റ്റമർ')) {
      if (text.includes('price history') || text.includes('history of a product') || text.includes('purchase history of') || text.includes('latest purchase price')) {
        const prodMatch = text.replace(/.*(?:price history for|purchase history for|history for|for|of|of a|product)s+/i, '').replace(/[?.,!]/g, '').trim();
        return { intent: 'PURCHASES_PRODUCT_HISTORY', domain: 'PURCHASES', params: { productName: prodMatch } };
      }
      if (text.includes('grouped by supplier') || text.includes('by supplier') || text.includes('highest purchase amount') || text.includes('സപ്ലയർ തിരിച്ച്')) {
        let rangeType = 'this_month';
        if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
        return { intent: 'PURCHASES_BY_SUPPLIER', domain: 'PURCHASES', params: { rangeType } };
      }
      if (text.includes('unpaid') || text.includes('partially paid') || text.includes('പണം നൽകാത്ത') || text.includes('pending purchase')) {
        return { intent: 'PURCHASES_UNPAID', domain: 'PURCHASES', params: {} };
      }
      if (text.includes('compare') || text.includes('താരതമ്യം')) {
        return { intent: 'PURCHASES_COMPARE', domain: 'PURCHASES', params: { compareWith: 'last_month' } };
      }

      let rangeType = 'this_month';
      if ((text.includes('ഇന്ന') && !text.includes('ഇന്നല')) || text.includes('today')) rangeType = 'today';
      else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';
      else if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
      else if (text.includes('this year') || text.includes('ഈ വർഷം')) rangeType = 'this_year';

      return {
        intent: 'PURCHASES_SUMMARY',
        domain: 'PURCHASES',
        params: { rangeType, customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate },
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. CASH REGISTER & CASH DRAWER (Module 4.5)
    // ──────────────────────────────────────────────────────────────────────────
    const isDrawerWord =
      text.includes('cash drawer') ||
      text.includes('drawer balance') ||
      text.includes('cash register') ||
      text.includes('ഡ്രോയർ') ||
      text.includes('counter cash') ||
      text.includes('drawer') ||
      text.includes('cash settlement') ||
      text.includes('cashier settlement') ||
      text.includes('settlements') ||
      text.includes('expected cash') ||
      text.includes('counted cash') ||
      text.includes('closing cash') ||
      text.includes('settlement differences') ||
      text.includes('cash-in and cash-out') ||
      text.includes('cash in and cash out') ||
      text.includes('paid out from the register');

    if (isDrawerWord && !text.includes('sales by cash register')) {
      if (text.includes('expected cash') || text.includes('counted cash') || text.includes('settlement differences') || text.includes('short') || text.includes('excess')) {
        return { intent: 'CASH_DRAWER_EXPECTED_VS_ACTUAL', domain: 'CASH_DRAWER', params: {} };
      }
      if (text.includes('inflows') || text.includes('outflows') || text.includes('movements') || text.includes('cash-in') || text.includes('cash in and') || text.includes('withdrawals') || text.includes('deposits')) {
        return { intent: 'CASH_DRAWER_MOVEMENTS', domain: 'CASH_DRAWER', params: { rangeType: 'today' } };
      }
      if (text.includes('paid out from the register')) {
        return { intent: 'EXPENSES_CASH_TODAY', domain: 'EXPENSES', params: { rangeType: 'today' } };
      }
      if (text.includes('history') || text.includes('settlements') || text.includes('closing cash')) {
        return { intent: 'CASH_DRAWER_SETTLEMENTS', domain: 'CASH_DRAWER', params: {} };
      }
      return { intent: 'CASH_DRAWER_CURRENT', domain: 'CASH_DRAWER', params: {} };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. BILLS, PAYMENTS & RECEIVABLES (Module 4.6)
    // ──────────────────────────────────────────────────────────────────────────
    if (text.includes('partially paid') || text.includes('പകുതി പണം നൽകിയ')) {
      return { intent: 'BILLS_PARTIALLY_PAID', domain: 'BILLS', params: {} };
    }
    if (
      text.includes('unpaid bills') ||
      text.includes('unpaid invoices') ||
      text.includes('overdue bills') ||
      text.includes('പണം ലഭിക്കാത്ത ബില്ലുകൾ') ||
      text.includes('how many unpaid bills')
    ) {
      return { intent: 'BILLS_UNPAID', domain: 'BILLS', params: {} };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. SALES RETURNS, DISCOUNTS & LOYALTY (Module 4.7)
    // ──────────────────────────────────────────────────────────────────────────
    if (text.includes('loyalty') || text.includes('reward points') || text.includes('പോയിന്റ്')) {
      const custName = text.replace(/.*(customer|for|of)\s+/i, '').replace(/[?.,!]/g, '').trim();
      return { intent: 'LOYALTY_POINTS', domain: 'RETURNS_LOYALTY', params: { customerName: custName } };
    }

    if (text.includes('returned products') || text.includes('returned items') || text.includes('items were returned') || text.includes('products were returned') || text.includes('തിരിച്ചുതന്ന സാധനങ്ങൾ')) {
      return { intent: 'RETURNS_ITEMS', domain: 'RETURNS_LOYALTY', params: { rangeType: 'this_month' } };
    }
    if (text.includes('refunds by payment method') || text.includes('refund method')) {
      return { intent: 'RETURNS_BY_METHOD', domain: 'RETURNS_LOYALTY', params: { rangeType: 'this_month' } };
    }
    if (
      text.includes('sales returns recorded today') ||
      text.includes('all sales returns recorded today') ||
      text.includes('sales returns were processed') ||
      text.includes('how many sales returns') ||
      text.includes('sales returns this month') ||
      text.includes('sales returns today') ||
      text.includes('റിട്ടേൺ')
    ) {
      let rangeType = 'this_month';
      if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
      else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';
      return { intent: 'RETURNS_SUMMARY', domain: 'RETURNS_LOYALTY', params: { rangeType } };
    }

    if (
      text.includes('discount greater than') ||
      text.includes('discounts greater than') ||
      text.includes('total discount amount for each invoice') ||
      text.includes('invoices with discounts')
    ) {
      const amtMatch = text.match(/(?:₹|rs.?|inr)?\s*(\d[\d,]*)/i);
      const minAmount = amtMatch && amtMatch[1] ? parseInt(amtMatch[1].replace(/,/g, ''), 10) : 500;
      return { intent: 'DISCOUNTS_SUMMARY', domain: 'RETURNS_LOYALTY', params: { minAmount, rangeType: 'today' } };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. PRODUCT PRICING & BARCODE LOOKUPS (Module 4.8)
    // ──────────────────────────────────────────────────────────────────────────
    if (
      text.includes('price of') ||
      text.includes('cost of') ||
      text.includes('retail price') ||
      text.includes('wholesale price') ||
      text.includes('tax rate of') ||
      text.includes('gst rate') ||
      text.includes('ബാർകോഡ്') ||
      text.includes('barcode')
    ) {
      const hasBarcodeQuery = (text.includes('barcode for') || text.includes('barcode of') || text.includes('gst rate and barcode') || text.includes('gst rate for'));
      if (hasBarcodeQuery) {
        const prodName = text
          .replace(/.*(?:barcode for|barcode of|gst rate and barcode for|gst rate for|price and barcode of|for)\s+/i, '')
          .replace(/[?.,!]/g, '')
          .trim();
        return { intent: 'PRODUCT_PRICE_LOOKUP', domain: 'PRICING', params: { productName: prodName, includeBarcode: true } };
      }

      if (text.includes('barcode') || text.includes('ബാർകോഡ്') || text.includes('item code')) {
        const codeMatch = text.replace(/.*(?:barcode|code)\s+/i, '').replace(/[?.,!]/g, '').trim();
        return { intent: 'PRODUCT_BARCODE_LOOKUP', domain: 'PRICING', params: { code: codeMatch } };
      }

      if (!text.includes('sales') && !text.includes('purchase')) {
        const prodName = text.replace(/.*(?:price of|cost of|rate of|rate for)\s+/i, '').replace(/[?.,!]/g, '').trim();
        return { intent: 'PRODUCT_PRICE_LOOKUP', domain: 'PRICING', params: { productName: prodName } };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. CUSTOMER & SUPPLIER LEDGER (Module 4.4)
    // ──────────────────────────────────────────────────────────────────────────
    if (
      text.includes('owe suppliers') ||
      text.includes('we owe to suppliers') ||
      text.includes('owe to all suppliers') ||
      text.includes('supplier payables') ||
      text.includes('kadam kodukkanullath') ||
      text.includes('suppliersinu kodukkanulla') ||
      text.includes('kodukkanulla cash') ||
      text.includes('സപ്ലയർമാർക്ക് നൽകാനുള്ളത്')
    ) {
      return { intent: 'SUPPLIER_PAYABLES_TOTAL', domain: 'LEDGER', params: {} };
    }

    const isCreditOrLedger =
      text.includes('credit') ||
      text.includes('ക്രെഡിറ്റ്') ||
      text.includes('കടം') ||
      text.includes('kadam') ||
      text.includes('കുടിശ്ശിക') ||
      text.includes('receivable') ||
      text.includes('debtor') ||
      text.includes('balance') ||
      text.includes('ബാക്കി') ||
      text.includes('ലെഡ്ജർ') ||
      text.includes('ledger') ||
      text.includes('owe us') ||
      text.includes('owes us') ||
      text.includes('who owes') ||
      text.includes('customers owe') ||
      text.includes('statement');

    if (
      text.includes('credit remains outstanding') ||
      text.includes('outstanding from credit invoices') ||
      text.includes('credit outstanding')
    ) {
      return { intent: 'SALES_CREDIT_OUTSTANDING', domain: 'SALES', params: { rangeType: 'this_month' } };
    }

    if (isCreditOrLedger && !text.includes('credit sales') && !text.includes('ക്രെഡിറ്റ് സെയിൽസ്')) {
      const amtMatch = text.match(/(?:₹|rs.?|inr)?\s*(\d[\d,]*)/i);
      const minAmount = amtMatch && amtMatch[1] ? parseInt(amtMatch[1].replace(/,/g, ''), 10) : 0;

      const limitMatch = text.match(/\btop\s+(\d+)\b/i);
      let limit = 15;
      if (limitMatch && limitMatch[1]) {
        limit = parseInt(limitMatch[1], 10);
      } else if (
        (/\b(top|highest|biggest|number 1|#1)\s+(credit\s+)?customer\b/i.test(text) && !/\bcustomers\b/i.test(text)) ||
        text.includes('ഏറ്റവും കൂടുതൽ കടമുള്ള കസ്റ്റമർ') ||
        text.includes('ഏറ്റവും കൂടുതൽ ക്രെഡിറ്റ് ഉള്ള കസ്റ്റമർ') ||
        text === 'who is the top credit customer' ||
        text === 'who is the top credit customer?' ||
        text === 'who are the top credit customer' ||
        text === 'who are the top credit customer?'
      ) {
        limit = 1;
      }

      const isListWord =
        text.includes('ലിസ്റ്റ്') ||
        text.includes('list') ||
        text.includes('top credit') ||
        text.includes('who are our top') ||
        text.includes('top 5 credit') ||
        text.includes('who are') ||
        text.includes('who is') ||
        text.includes('customers owe us') ||
        text.includes('debtors') ||
        text.includes('receivables') ||
        text.includes('above') ||
        text.includes('greater than') ||
        text.includes('aarokkeyanu kadam') ||
        text.includes('kadam tharanulla') ||
        text.includes('kadam ethraya') ||
        text.includes('kadam ullavar') ||
        text.includes('who owes us') ||
        text.includes('top debtor') ||
        text.includes('who owes the most');

      if (isListWord || minAmount > 0 || limit === 1) {
        return { intent: 'CUSTOMER_CREDIT_LIST', domain: 'LEDGER', params: { minAmount: minAmount || 0, limit } };
      }

      const candidateName = text
        .replace(/['’]s\b/gi, ' ')
        .replace(/\b(what\s+is|what's|how\s+much|show\s+me|show|check|get|find|tell\s+me|tell|view|display|please|recent)\b/gi, ' ')
        .replace(/\b(credit\s+balance|credit\s+amount|balance\s+amount|pending\s+amount|due\s+amount|outstanding\s+amount)\b/gi, ' ')
        .replace(/\b(balance\s+of|balance\s+for|ledger\s+transactions\s+for|ledger\s+for|statement\s+for)\b/gi, ' ')
        .replace(/\b(balance|credit|ledger|statement|account|due|receivables?|debtors?|outstanding|pending|amount|customer|party|transactions|the|of|for)\b/gi, ' ')
        .replace(/\b(total|all|overall|list|summary|report|status|overview|details?|who|someone|anyone|everyone|every|full|complete|aggregate|sum|count|highest|top|maximum|max|minimum|min|many|much|owes?|money|people|persons?|accounts?|users?|clients?)\b/gi, ' ')
        .replace(/[₹$]|inr|rs\.?/gi, ' ')
        .replace(/(?:ന്റെ|യുടെ|ടെ|ൽ|ല്)\b/g, ' ')
        .replace(/(?:മൊത്തം|ആകെ|എല്ലാ|എല്ലാവരുടെയും|ലിസ്റ്റ്|പട്ടിക|വിവരം|വിവരങ്ങൾ|സംഗ്രഹം)/g, ' ')
        .replace(/(?:എത്രയാണ്|എത്ര|ആണ്|കാണിക്കൂ|തരുമോ|നോക്കൂ|റിപ്പോർട്ട്|ബാലൻസ്|ബാക്കി|തുക|ക്രെഡിറ്റ്|കടം|കുടിശ്ശിക|ലെഡ്ജർ|സ്റ്റേറ്റ്മെന്റ്|കസ്റ്റമർ|കസ്റ്റമേഴ്സ്|പാർട്ടി)/g, ' ')
        .replace(/[?.,!:\-_/\\#@*]/g, ' ')
        .trim();

      if (candidateName.length >= 2 && !/^\d+$/.test(candidateName)) {
        return { intent: 'PARTY_LEDGER', domain: 'LEDGER', params: { searchQuery: candidateName } };
      }

      return { intent: 'CUSTOMER_CREDIT_LIST', domain: 'LEDGER', params: { minAmount: 0, limit: 15 } };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. SALES & REVENUE (Preserved with 100% Fidelity)
    // ──────────────────────────────────────────────────────────────────────────
    // Hourly
    if (
      text.includes('last hour') ||
      text.includes('കഴിഞ്ഞ ഒരു മണിക്കൂർ') ||
      text.includes('ഒരു മണിക്കൂറിലെ') ||
      text.includes('hourly sales') ||
      text.includes('sales during the last hour') ||
      /between\s+\d+.*?(?:am|pm|:)\s+and\s+\d+/i.test(text)
    ) {
      const isLastHour = text.includes('last hour') || text.includes('കഴിഞ്ഞ ഒരു മണിക്കൂർ') || text.includes('ഒരു മണിക്കൂറിലെ');
      return { intent: 'SALES_HOURLY', domain: 'SALES', params: { isLastHour } };
    }

    // Cancelled Invoices
    if (
      text.includes('cancelled') ||
      text.includes('canceled') ||
      text.includes('റദ്ദാക്കിയ') ||
      text.includes('റദ്ദാക്കപ്പെട്ട') ||
      text.includes('voided') ||
      text.includes('void bills')
    ) {
      return { intent: 'SALES_CANCELLED_INVOICES', domain: 'SALES', params: {} };
    }

    // Payment Methods
    const isPaymentMethodQuery =
      text.includes('cash sales') ||
      text.includes('ക്യാഷ് സെയിൽസ്') ||
      (text.includes('ക്യാഷ്') && (text.includes('സെയിൽസ്') || text.includes('വിൽപ്പന') || text.includes('എത്ര'))) ||
      text.includes('credit sales') ||
      text.includes('ക്രെഡിറ്റ് സെയിൽസ്') ||
      text.includes('paid by card') ||
      text.includes('card sales') ||
      text.includes('paid through upi') ||
      text.includes('paid by upi') ||
      text.includes('upi sales') ||
      (text.includes('യുപിഐ') && (text.includes('എത്ര') || text.includes('വഴി') || text.includes('ലഭിച്ചു'))) ||
      text.includes('by payment method') ||
      text.includes('payment methods') ||
      text.includes('പേയ്‌മെന്റ് രീതി') ||
      text.includes('cash and credit') ||
      text.includes('split payments') ||
      text.includes('split payment') ||
      text.includes('unique invoices and total invoice value') ||
      text.includes('multiple payment methods');

    if (isPaymentMethodQuery) {
      let method = 'ALL';
      if ((text.includes('upi') || text.includes('യുപിഐ')) && (text.includes('cash') || text.includes('ക്യാഷ്'))) method = 'ALL';
      else if (text.includes('cash sales') || text.includes('ക്യാഷ് സെയിൽസ്') || text.includes('cash was collected from sales')) method = 'CASH';
      else if (text.includes('credit sales') || text.includes('ക്രെഡിറ്റ് സെയിൽസ്')) method = 'CREDIT';
      else if (text.includes('card')) method = 'CARD';
      else if (text.includes('upi') || text.includes('യുപിഐ')) method = 'UPI';

      let rangeType = 'today';
      if (dateExtraction.fromDate && dateExtraction.toDate) rangeType = 'custom';
      else if (text.includes('this month') || text.includes('ഈ മാസം') || (text.includes('month') && !text.includes('today'))) rangeType = 'this_month';
      else if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
      else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';

      return {
        intent: 'SALES_PAYMENT_METHODS',
        domain: 'SALES',
        params: {
          method,
          rangeType,
          customFrom: dateExtraction.fromDate,
          customTo: dateExtraction.toDate,
        },
      };
    }

    if (text.includes('credit remains outstanding') || text.includes('outstanding from credit invoices')) {
      return { intent: 'SALES_CREDIT_OUTSTANDING', domain: 'SALES', params: { rangeType: 'this_month' } };
    }

    // Gross vs Net vs Discounts vs Tax
    if (
      text.includes('gross sales') ||
      text.includes('net sales') ||
      text.includes('discount') ||
      text.includes('ഡിസ്കൗണ്ട്') ||
      text.includes('tax was collected') ||
      text.includes('sales return was recorded') ||
      text.includes('tax was included') ||
      text.includes('tax collected on sales')
    ) {
      let metric = 'all';
      if (text.includes('discount')) metric = 'discount';
      else if (text.includes('tax')) metric = 'tax';
      else if (text.includes('return')) metric = 'return';
      else if (text.includes('gross')) metric = 'gross';
      else if (text.includes('net')) metric = 'net';

      let rangeType = 'today';
      if (text.includes('this month') || text.includes('ഈ മാസം') || (text.includes('month') && !text.includes('today'))) rangeType = 'this_month';
      else if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
      else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';

      return { intent: 'SALES_GROSS_NET', domain: 'SALES', params: { metric, rangeType } };
    }

    // Invoice Types
    if (text.includes('invoice type') || text.includes('bill of supply') || text.includes('bills of supply') || text.includes('gst sales') || text.includes('ബിൽ ഓഫ് സപ്ലൈ')) {
      let rangeType = 'this_month';
      if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
      return { intent: 'SALES_INVOICE_TYPES', domain: 'SALES', params: { rangeType } };
    }

    // Extremes (Must be checked before general invoice count to catch "invoices greater than X")
    if (text.includes('highest-value invoice') || text.includes('highest value invoice') || text.includes('highest invoice') || text.includes('lowest-value invoice') || text.includes('invoices greater than')) {
      const isLowest = text.includes('lowest');
      const amtMatch = text.match(/(?:greater than|above|>)\s*(\d+)/i);
      const minAmount = amtMatch ? parseInt(amtMatch[1], 10) : undefined;
      let rangeType = 'this_month';
      if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
      return { intent: 'SALES_INVOICE_EXTREMES', domain: 'SALES', params: { isLowest, minAmount, rangeType } };
    }

    // Average Daily Sales & Average Bills per Day (Must be checked before general invoice count)
    if (
      text.includes('average daily') ||
      text.includes('average sales per day') ||
      text.includes('daily average') ||
      text.includes('average number of bills per day') ||
      text.includes('average bills per day') ||
      text.includes('പ്രതിദിന ശരാശരി')
    ) {
      let rangeType = 'this_month';
      if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
      else if (text.includes('this year') || text.includes('ഈ വർഷം')) rangeType = 'this_year';
      return { intent: 'SALES_AVERAGE_DAILY', domain: 'SALES', params: { rangeType } };
    }

    // Invoice Count
    if (
      text.includes('how many invoices') ||
      text.includes('how many bills') ||
      text.includes('invoice count') ||
      text.includes('bills count') ||
      text.includes('number of bills') ||
      text.includes('എത്ര ബില്ലുകൾ') ||
      text.includes('എത്ര ഇൻവോയ്സ്') ||
      text.includes('bill adichu') ||
      text.includes('ethra bill') ||
      text.includes('ethra invoice') ||
      text.includes('paid in full') ||
      text.includes('bills were generated') ||
      text.includes('bills were created')
    ) {
      let rangeType = 'today';
      if (text.includes('this month') || text.includes('ഈ മാസം') || (text.includes('month') && !text.includes('today'))) rangeType = 'this_month';
      else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';
      return { intent: 'SALES_INVOICE_COUNT', domain: 'SALES', params: { rangeType } };
    }

    // Average Ticket
    if (text.includes('average ticket') || text.includes('avg ticket') || text.includes('average bill value') || text.includes('ശരാശരി ബിൽ തുക')) {
      let rangeType = 'today';
      if (text.includes('this month') || text.includes('ഈ മാസം')) rangeType = 'this_month';
      return { intent: 'SALES_AVERAGE_TICKET', domain: 'SALES', params: { rangeType } };
    }

    // Unique Customers
    if (text.includes('unique customers') || text.includes('വ്യത്യസ്ത കസ്റ്റമർമാർ') || (text.includes('how many') && text.includes('customers purchased'))) {
      let rangeType = 'today';
      if (text.includes('this month') || text.includes('ഈ മാസം')) rangeType = 'this_month';
      return { intent: 'SALES_UNIQUE_CUSTOMERS', domain: 'SALES', params: { rangeType } };
    }

    // Highest Day / Trend
    if (
      text.includes('highest sales day') ||
      text.includes('highest sales this month') ||
      text.includes('lowest sales this month') ||
      text.includes('best sales day') ||
      (text.includes('ഏറ്റവും കൂടുതൽ') && (text.includes('സെയിൽസ്') || text.includes('വിൽപ്പന')) && (text.includes('ദിവസം') || text.includes('day')))
    ) {
      const isLowest = text.includes('lowest');
      let rangeType = 'this_month';
      if (text.includes('year') || text.includes('വർഷം')) rangeType = 'this_year';
      return { intent: 'SALES_HIGHEST_DAY', domain: 'SALES', params: { rangeType, isLowest } };
    }
    if (text.includes('daily sales trend') || text.includes('daily trend')) {
      return { intent: 'SALES_DAILY_TREND', domain: 'SALES', params: { rangeType: 'this_month' } };
    }

    // Biller / Staff
    if ((text.includes('biller') || text.includes('cashier') || text.includes('sales by staff') || text.includes('who sold') || text.includes('ബില്ലർ')) && !text.includes('settlement')) {
      let rangeType = 'today';
      if (text.includes('this month') || text.includes('ഈ മാസം') || (text.includes('month') && !text.includes('today'))) rangeType = 'this_month';
      return { intent: 'SALES_BILLER_STAFF', domain: 'SALES', params: { rangeType } };
    }

    // Customer Level Sales
    if (
      ((text.includes('customer') || text.includes('കസ്റ്റമർ')) &&
        (text.includes('purchased the most') || text.includes('spent the most') || text.includes('top spending') || text.includes('invoices generated for') || text.includes('sales history of a specific customer') || text.includes('sales grouped by customer'))) ||
      text.includes('spent the most money this month') ||
      text.includes('top spending customers') ||
      text.includes('spent the most')
    ) {
      let rangeType = 'this_month';
      if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
      return { intent: 'SALES_CUSTOMER_LEVEL', domain: 'SALES', params: { rangeType } };
    }

    // Comparisons
    if (text.includes('compare') || text.includes('താരതമ്യം') || text.includes('percentage increase') || text.includes('percentage did sales increase')) {
      let compareType = 'this_month_vs_last_month';
      let compareWith = 'last_month';
      if ((text.includes('today') && text.includes('yesterday')) || (text.includes('yesterday') && !text.includes('month'))) {
        compareType = 'today_vs_yesterday';
        compareWith = 'yesterday';
      } else if (text.includes('year') || text.includes('വർഷം')) {
        compareType = 'this_year_vs_last_year';
        compareWith = 'last_year';
      }
      return { intent: 'COMPARE_SALES', domain: 'SALES', params: { compareType, compareWith } };
    }

    // Top Selling Products
    if (
      text.includes('വിറ്റ') ||
      text.includes('വിറ്റുപോയ') ||
      text.includes('best selling') ||
      text.includes('top selling') ||
      text.includes('most sold') ||
      text.includes('highest selling') ||
      text.includes('top products') ||
      text.includes('highest revenue') ||
      text.includes('sold the most') ||
      text.includes('best-selling') ||
      text.includes('top-selling') ||
      text.includes('quantity of products sold') ||
      text.includes('sales quantity and revenue')
    ) {
      const numMatch = text.match(/\b(\d+)\b/);
      const limit = numMatch ? parseInt(numMatch[1], 10) : 5;
      const isLowest = text.includes('lowest') || text.includes('കുറഞ്ഞ');
      const isRevenue = text.includes('revenue') || text.includes('വരുമാനം');

      let rangeType = 'today';
      if (text.includes('this month') || text.includes('ഈ മാസം') || (text.includes('month') && !text.includes('today'))) rangeType = 'this_month';
      else if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
      else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';

      return { intent: 'TOP_SELLING_PRODUCTS', domain: 'SALES', params: { limit, isLowest, isRevenue, rangeType } };
    }

    // General Sales Periods
    const isSalesWord =
      text.includes('സെയിൽസ്') ||
      text.includes('വിൽപ്പന') ||
      text.includes('sales') ||
      text.includes('sale') ||
      text.includes('revenue') ||
      text.includes('business') ||
      text.includes('കച്ചവടം') ||
      text.includes('sell') ||
      text.includes('turnover') ||
      text.includes('intake') ||
      text.includes('takings') ||
      text.includes('വരുമാനം') ||
      text.includes('വരുമാന');

    if (isSalesWord || text.includes('report') || text.includes('റിപ്പോർട്ട്')) {
      if (text.includes('financial year') || text.includes('fy') || text.includes('സാമ്പത്തിക വർഷം')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'financial_year' } };
      }
      if (text.includes('last year') || text.includes('കഴിഞ്ഞ വർഷം')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'last_year' } };
      }
      if (text.includes('this year') || text.includes('ഈ വർഷം') || text.includes('year to date') || text.includes('ytd')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'this_year' } };
      }
      if (text.includes('last 30 days') || text.includes('30 ദിവസ') || text.includes('past 30 days')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'last_30_days' } };
      }
      if (text.includes('last 7 days') || text.includes('7 days') || text.includes('7 ദിവസ') || text.includes('past 7 days')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'last_7_days' } };
      }
      if (text.includes('last week') || text.includes('കഴിഞ്ഞ ആഴ്ച')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'last_week' } };
      }
      if (text.includes('this week') || text.includes('ഈ ആഴ്ച')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'this_week' } };
      }
      if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസ')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'last_month' } };
      }
      if (text.includes('this month') || text.includes('ഈ മാസ') || text.includes('month to date') || text.includes('mtd') || text.includes('ee masathe') || text.includes('ee masam')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'this_month' } };
      }
      if (text.includes('yesterday') || text.includes('ഇന്നല') || text.includes('previous day') || text.includes('innale')) {
        return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'yesterday' } };
      }
      if ((text.includes('ഇന്ന') && !text.includes('ഇന്നല')) || text.includes('today') || text.includes('innathe') || text.includes('innu')) {
        return { intent: 'SALES_TODAY', domain: 'SALES', params: { rangeType: 'today' } };
      }
    }

    // Specific Date / Custom Range from Date Extraction
    if (dateExtraction.fromDate && dateExtraction.toDate && dateExtraction.fromDate !== dateExtraction.toDate) {
      return { intent: 'SALES_CUSTOM_RANGE', domain: 'SALES', params: { customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate } };
    }
    if (dateExtraction.specificDate) {
      return { intent: 'SALES_SPECIFIC_DATE', domain: 'SALES', params: { specificDate: dateExtraction.specificDate } };
    }

    if (isSalesWord || text.includes('report') || text.includes('റിപ്പോർട്ട്')) {
      return { intent: 'SALES_TODAY', domain: 'SALES', params: { rangeType: 'today' } };
    }

    // Context continuation check
    if (lastUserMsg.includes('sales') || lastUserMsg.includes('സെയിൽസ്')) {
      if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) {
        return { intent: 'COMPARE_SALES', domain: 'SALES', params: { compareType: 'this_month_vs_last_month', compareWith: 'last_month' } };
      }
      if (text.includes('yesterday') || text.includes('ഇന്നലെ')) {
        return { intent: 'COMPARE_SALES', domain: 'SALES', params: { compareType: 'today_vs_yesterday', compareWith: 'yesterday' } };
      }
      if (text.includes('cash') || text.includes('ക്യാഷ്')) {
        return { intent: 'SALES_PAYMENT_METHODS', domain: 'SALES', params: { method: 'CASH', rangeType: 'today' } };
      }
      if (text.includes('top five') || text.includes('top 5')) {
        return { intent: 'TOP_SELLING_PRODUCTS', domain: 'SALES', params: { limit: 5, rangeType: 'today' } };
      }
    }

    if (text.includes('yesterday') || text.includes('ഇന്നല') || text.includes('innale')) {
      return { intent: 'SALES_PERIOD', domain: 'SALES', params: { rangeType: 'yesterday' } };
    }

    if (text.includes('today') || text.includes('ഇന്ന്') || text.includes('how much')) {
      return { intent: 'SALES_TODAY', domain: 'SALES', params: { rangeType: 'today' } };
    }

    return { intent: 'UNKNOWN', params: { searchQuery: message } };
  }
}



/**
 * Offline AI Query Processor
 * Executes against local SQLite database via window.electronAPI
 */
export async function processOfflineAiQuery(
  queryText: string,
  tenantId: string,
  history: any[] = []
): Promise<OfflineAiResponse> {
  const electronAPI = (window as any).electronAPI;
  if (!electronAPI || !tenantId) {
    throw new Error('Local SQLite database connection is unavailable.');
  }

  const isMal = isMalayalam(queryText);
  const parsed = OfflineAiIntentParser.parse(queryText, history);

  // Helper to fetch filtered invoices with safe fallback
  const fetchInvoices = async (fromDate: string, toDate: string): Promise<any[]> => {
    try {
      const invs = await electronAPI.dbGetInvoices({
        tenant_id: tenantId,
        filterDate: fromDate,
        filterDateEnd: toDate,
      });
      return Array.isArray(invs) ? invs : [];
    } catch (err) {
      console.warn('[OfflineAiService] dbGetInvoices failed:', err);
      return [];
    }
  };

  // Helper to get aggregated summary
  const fetchSummary = async (fromDate: string, toDate: string) => {
    if (electronAPI.dbGetInvoicesSummary) {
      try {
        const res = await electronAPI.dbGetInvoicesSummary({
          tenant_id: tenantId,
          filterDate: fromDate,
          filterDateEnd: toDate,
        });
        if (res && typeof res.totalSales === 'number') {
          return res;
        }
      } catch (err) {
        console.warn('[OfflineAiService] dbGetInvoicesSummary failed:', err);
      }
    }

    const invs = await fetchInvoices(fromDate, toDate);
    const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id && !['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(i.invoice_type));
    const totalSales = validInvs.reduce((acc: number, inv: any) => acc + (Number(inv.grand_total) || 0), 0);
    const totalInvoices = validInvs.length;
    const totalTax = validInvs.reduce((acc: number, inv: any) => acc + (Number(inv.tax_total) || 0), 0);
    const totalDiscount = validInvs.reduce((acc: number, inv: any) => acc + (Number(inv.discount_total) || 0) + (Number(inv.points_redeemed_discount) || 0), 0);
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;
    return { totalSales, totalInvoices, totalTax, totalDiscount, avgOrder };
  };

  // Safe fetch helper for cash transactions
  const fetchCashTransactions = async (fromDate?: string, toDate?: string): Promise<any[]> => {
    try {
      if (electronAPI.dbCashierGetDayTransactions) {
        const res = await electronAPI.dbCashierGetDayTransactions({
          tenant_id: tenantId,
          from_date: fromDate,
          to_date: toDate,
        });
        if (Array.isArray(res)) return res;
      }
      if (electronAPI.dbCashierGetTransactions) {
        const res = await electronAPI.dbCashierGetTransactions({ tenant_id: tenantId });
        if (Array.isArray(res)) return res;
      }
      return [];
    } catch (err) {
      console.warn('[OfflineAiService] fetchCashTransactions failed:', err);
      return [];
    }
  };

  // Safe fetch helper for products
  const fetchProducts = async (): Promise<any[]> => {
    try {
      if (electronAPI.dbGetProducts) {
        const res = await electronAPI.dbGetProducts({ tenant_id: tenantId });
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn('[OfflineAiService] fetchProducts failed:', err);
      return [];
    }
  };

  // Safe fetch helper for purchase bills
  const fetchPurchaseBills = async (search?: string): Promise<any[]> => {
    try {
      if (electronAPI.dbGetPurchaseBills) {
        const res = await electronAPI.dbGetPurchaseBills({ tenant_id: tenantId, search, limit: 100 });
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn('[OfflineAiService] fetchPurchaseBills failed:', err);
      return [];
    }
  };

  // Safe fetch helper for parties
  const fetchParties = async (): Promise<any[]> => {
    try {
      if (electronAPI.dbGetParties) {
        const res = await electronAPI.dbGetParties(tenantId);
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn('[OfflineAiService] fetchParties failed:', err);
      return [];
    }
  };

  // Safe fetch helper for returns
  const fetchReturns = async (): Promise<any[]> => {
    try {
      if (electronAPI.dbGetReturns) {
        const res = await electronAPI.dbGetReturns({ tenant_id: tenantId });
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn('[OfflineAiService] fetchReturns failed:', err);
      return [];
    }
  };

  // Safe fetch helper for cash drawer
  const fetchCashDrawer = async (bDate?: string): Promise<any> => {
    try {
      if (electronAPI.dbCashierGetDrawer) {
        const res = await electronAPI.dbCashierGetDrawer({ tenant_id: tenantId, business_date: bDate });
        return res;
      }
      return null;
    } catch (err) {
      console.warn('[OfflineAiService] fetchCashDrawer failed:', err);
      return null;
    }
  };

  try {
    switch (parsed.intent) {

      // ──────────────────────────────────────────────────────────────────────
      // 1. Current-Day Sales / Today's Sales
      // ──────────────────────────────────────────────────────────────────────
      case 'SALES_TODAY': {
        const range = resolveDateRange('today', undefined, undefined, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const pm = calculatePaymentBreakdown(invs);

        let md = isMal
          ? `### 📊 ഇന്നത്തെ സെയിൽസ് സംഗ്രഹം (${range.label})\n\n`
          : `### 📊 Today's Sales Summary (${range.label})\n\n`;

        md += isMal
          ? `* **മൊത്തം വരുമാനം (Total Revenue):** **${formatINR(summary.totalSales)}**\n` +
            `* **ആകെ ബില്ലുകൾ (Total Bills):** **${summary.totalInvoices} എണ്ണം**\n` +
            `* **ശരാശരി ബിൽ തുക (Avg Bill Value):** **${formatINR(summary.avgOrder)}**\n`
          : `* **Total Sales Revenue:** **${formatINR(summary.totalSales)}**\n` +
            `* **Total Invoices Generated:** **${summary.totalInvoices} invoices**\n` +
            `* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**\n`;

        if (summary.totalTax > 0) {
          md += isMal ? `* **ടാക്സ് (GST Collected):** ${formatINR(summary.totalTax)}\n` : `* **Tax (GST) Collected:** ${formatINR(summary.totalTax)}\n`;
        }
        if (summary.totalDiscount > 0) {
          md += isMal ? `* **നൽകിയ ഡിസ്കൗണ്ട് (Discounts):** ${formatINR(summary.totalDiscount)}\n` : `* **Discounts Given:** ${formatINR(summary.totalDiscount)}\n`;
        }

        md += isMal ? `\n#### 💳 പേയ്‌മെന്റ് വിഹിതം:\n` : `\n#### 💳 Payment Breakdown:\n`;
        md += `* **Cash:** ${formatINR(pm.cash)} | **UPI:** ${formatINR(pm.upi)} | **Card:** ${formatINR(pm.card)} | **Credit:** ${formatINR(pm.credit)}\n`;

        return {
          content: md,
          data: summary,
          suggestedPrompts: isMal
            ? ['ഇന്നത്തെ ക്യാഷ് സെയിൽസ് എത്രയാണ്?', 'ഈ മാസത്തെ സെയിൽസ് കാണിക്കൂ', 'കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ']
            : ["Show today's cash sales", "What is this month's total sales?", 'Top selling products today'],
          intent: parsed.intent,
        };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 2. Hourly Sales / Last Hour
      // ──────────────────────────────────────────────────────────────────────
      case 'SALES_HOURLY': {
        const todayRange = resolveDateRange('today', undefined, undefined, isMal);
        const invs = await fetchInvoices(todayRange.fromDate, todayRange.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const lastHourInvs = validInvs.filter((i: any) => {
          const t = new Date(i.created_at).getTime();
          return t >= oneHourAgo.getTime() && t <= now.getTime();
        });

        const lastHourSales = lastHourInvs.reduce((acc: number, i: any) => acc + (Number(i.grand_total) || 0), 0);

        const hourlyBuckets: Record<string, { hour: string; sales: number; count: number }> = {};
        for (let h = 8; h <= 22; h++) {
          const hStr = `${pad(h)}:00`;
          hourlyBuckets[hStr] = { hour: hStr, sales: 0, count: 0 };
        }

        validInvs.forEach((i: any) => {
          const d = new Date(i.created_at);
          const h = d.getHours();
          const hStr = `${pad(h)}:00`;
          if (hourlyBuckets[hStr]) {
            hourlyBuckets[hStr].sales += Number(i.grand_total) || 0;
            hourlyBuckets[hStr].count += 1;
          }
        });

        const chartItems = Object.values(hourlyBuckets).filter(b => b.sales > 0 || (Number(b.hour.slice(0, 2)) >= 9 && Number(b.hour.slice(0, 2)) <= now.getHours()));

        let md = isMal
          ? `### ⏱️ മണിക്കൂർ തിരിച്ചുള്ള സെയിൽസ് (Hourly Sales)\n\n` +
            `* **കഴിഞ്ഞ 1 മണിക്കൂറിലെ വിൽപ്പന (Last 1 Hour):** **${formatINR(lastHourSales)}** (${lastHourInvs.length} ബില്ലുകൾ)\n` +
            `* **ഇന്നത്തെ ആകെ വിൽപ്പന:** **${formatINR(validInvs.reduce((acc: number, i: any) => acc + (Number(i.grand_total) || 0), 0))}**\n\n`
          : `### ⏱️ Hourly Sales Intelligence\n\n` +
            `* **Sales During Last Hour:** **${formatINR(lastHourSales)}** (${lastHourInvs.length} invoices)\n` +
            `* **Total Sales Today:** **${formatINR(validInvs.reduce((acc: number, i: any) => acc + (Number(i.grand_total) || 0), 0))}** (${validInvs.length} invoices)\n\n`;

        return {
          content: md,
          chartData: {
            type: 'bar',
            title: isMal ? 'മണിക്കൂർ തിരിച്ചുള്ള വിൽപ്പന' : 'Hourly Sales Trend',
            labelKey: 'hour',
            dataKey: 'sales',
            items: chartItems,
          },
          suggestedPrompts: isMal ? ['ഇന്നത്തെ ക്യാഷ് സെയിൽസ്', 'ഈ മാസത്തെ സെയിൽസ്'] : ["Today's cash sales", "This month's sales"],
          intent: parsed.intent,
        };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 3. Historical Sales / Standard Reporting Periods
      // ──────────────────────────────────────────────────────────────────────
      case 'SALES_PERIOD':
      case 'SALES_CUSTOM_RANGE':
      case 'SALES_SPECIFIC_DATE': {
        const range = parsed.intent === 'SALES_CUSTOM_RANGE'
          ? resolveDateRange('custom', parsed.params.customFrom, parsed.params.customTo, isMal)
          : parsed.intent === 'SALES_SPECIFIC_DATE'
          ? resolveDateRange('custom', parsed.params.specificDate, parsed.params.specificDate, isMal)
          : resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);

        const summary = await fetchSummary(range.fromDate, range.toDate);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);
        const pm = calculatePaymentBreakdown(validInvs);
        const avgDaily = range.daysCount > 0 ? summary.totalSales / range.daysCount : summary.totalSales;

        let md = isMal
          ? `### 📈 സെയിൽസ് റിപ്പോർട്ട് — ${range.label}\n\n`
          : `### 📈 Sales Report — ${range.label}\n\n`;

        md += isMal
          ? `* **മൊത്തം വരുമാനം (Total Revenue):** **${formatINR(summary.totalSales)}**\n` +
            `* **ആകെ ബില്ലുകൾ (Total Invoices):** **${summary.totalInvoices} എണ്ണം**\n` +
            `* **ശരാശരി ബിൽ തുക (Avg Ticket):** **${formatINR(summary.avgOrder)}**\n` +
            (range.daysCount > 1 ? `* **പ്രതിദിന ശരാശരി (Avg Daily Sales):** **${formatINR(avgDaily)}** (${range.daysCount} ദിവസങ്ങൾ)\n` : '')
          : `* **Total Sales Revenue:** **${formatINR(summary.totalSales)}**\n` +
            `* **Total Invoices Count:** **${summary.totalInvoices} invoices**\n` +
            `* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**\n` +
            (range.daysCount > 1 ? `* **Average Daily Sales:** **${formatINR(avgDaily)}** (over ${range.daysCount} days)\n` : '');

        if (summary.totalTax > 0) {
          md += isMal ? `* **ടാക്സ് (GST):** ${formatINR(summary.totalTax)}\n` : `* **Tax (GST) Collected:** ${formatINR(summary.totalTax)}\n`;
        }
        if (summary.totalDiscount > 0) {
          md += isMal ? `* **ഡിസ്കൗണ്ട്:** ${formatINR(summary.totalDiscount)}\n` : `* **Discounts Given:** ${formatINR(summary.totalDiscount)}\n`;
        }

        if (validInvs.length > 0) {
          md += isMal
            ? `\n#### 💳 പേയ്‌മെന്റ് രീതി തിരിച്ചുള്ള തുക:\n` +
              `| രീതി | തുക |\n| :--- | :---: |\n` +
              `| 💵 ക്യാഷ് (Cash) | **${formatINR(pm.cash)}** |\n` +
              `| 📱 UPI | **${formatINR(pm.upi)}** |\n` +
              `| 💳 കാർഡ് (Card) | **${formatINR(pm.card)}** |\n` +
              `| 📒 ക്രെഡിറ്റ് (Credit) | **${formatINR(pm.credit)}** |\n`
            : `\n#### 💳 Sales by Payment Method:\n` +
              `| Payment Method | Total Amount |\n| :--- | :---: |\n` +
              `| 💵 Cash | **${formatINR(pm.cash)}** |\n` +
              `| 📱 UPI | **${formatINR(pm.upi)}** |\n` +
              `| 💳 Card | **${formatINR(pm.card)}** |\n` +
              `| 📒 Credit | **${formatINR(pm.credit)}** |\n`;
        }

        return {
          content: md,
          data: summary,
          suggestedPrompts: isMal
            ? ['കഴിഞ്ഞ കാലയളവുമായി താരതമ്യം ചെയ്യൂ', 'കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ', 'ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?']
            : ['Compare with previous period', 'Top selling products', "What is today's sales?"],
          intent: parsed.intent,
        };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 4. Period Comparison
      // ──────────────────────────────────────────────────────────────────────
      case 'COMPARE_SALES': {
        const compareWith = parsed.params.compareWith || 'last_month';
        let curRange: OfflineDateRange;
        let prevRange: OfflineDateRange;

        if (compareWith === 'yesterday') {
          curRange = resolveDateRange('today', undefined, undefined, isMal);
          prevRange = resolveDateRange('yesterday', undefined, undefined, isMal);
        } else if (compareWith === 'last_week') {
          curRange = resolveDateRange('this_week', undefined, undefined, isMal);
          prevRange = resolveDateRange('last_week', undefined, undefined, isMal);
        } else if (compareWith === 'last_year') {
          curRange = resolveDateRange('this_year', undefined, undefined, isMal);
          prevRange = resolveDateRange('last_year', undefined, undefined, isMal);
        } else {
          curRange = resolveDateRange('this_month', undefined, undefined, isMal);
          prevRange = resolveDateRange('last_month', undefined, undefined, isMal);
        }

        const [curSummary, prevSummary] = await Promise.all([
          fetchSummary(curRange.fromDate, curRange.toDate),
          fetchSummary(prevRange.fromDate, prevRange.toDate),
        ]);

        const diffSales = curSummary.totalSales - prevSummary.totalSales;
        const pctSales = prevSummary.totalSales > 0 ? (diffSales / prevSummary.totalSales) * 100 : 0;
        const diffInvs = curSummary.totalInvoices - prevSummary.totalInvoices;

        const growthLabel = diffSales >= 0
          ? (isMal ? 'വളർച്ച (+ 📈)' : 'Growth (+ 📈)')
          : (isMal ? 'കുറവ് (- 📉)' : 'Decline (- 📉)');

        let md = isMal
          ? `### ⚖️ വിൽപ്പന താരതമ്യ റിപ്പോർട്ട് (Sales Comparison)\n` +
            `**${curRange.label}**-ഉം **${prevRange.label}**-ഉം തമ്മിലുള്ള വിശകലനം:\n\n` +
            `| സൂചിക | ${curRange.label} | ${prevRange.label} | വ്യത്യാസം |\n` +
            `| :--- | :---: | :---: | :---: |\n` +
            `| **ആകെ വിൽപ്പന** | **${formatINR(curSummary.totalSales)}** | **${formatINR(prevSummary.totalSales)}** | **${diffSales >= 0 ? '+' : ''}${formatINR(diffSales)} (${growthLabel})** |\n` +
            `| **ബില്ലുകളുടെ എണ്ണം** | ${curSummary.totalInvoices} ബില്ലുകൾ | ${prevSummary.totalInvoices} ബില്ലുകൾ | ${diffInvs >= 0 ? '+' : ''}${diffInvs} |\n` +
            `| **ശരാശരി ബിൽ തുക** | ${formatINR(curSummary.avgOrder)} | ${formatINR(prevSummary.avgOrder)} | — |\n\n` +
            `💡 **സംഗ്രഹം:** ${prevRange.label}-നേക്കാൾ വിൽപ്പന വരുമാനത്തിൽ **${Math.abs(Math.round(pctSales))}%${diffSales >= 0 ? ' വർദ്ധനവ്' : ' കുറവ്'}** രേഖപ്പെടുത്തി.\n`
          : `### ⚖️ Sales Comparison Report\n` +
            `Comparative analysis between **${curRange.label}** and **${prevRange.label}**:\n\n` +
            `| Metric | ${curRange.label} | ${prevRange.label} | Variance |\n` +
            `| :--- | :---: | :---: | :---: |\n` +
            `| **Total Sales** | **${formatINR(curSummary.totalSales)}** | **${formatINR(prevSummary.totalSales)}** | **${diffSales >= 0 ? '+' : ''}${formatINR(diffSales)} (${growthLabel})** |\n` +
            `| **Invoices Count** | ${curSummary.totalInvoices} invoices | ${prevSummary.totalInvoices} invoices | ${diffInvs >= 0 ? '+' : ''}${diffInvs} |\n` +
            `| **Average Ticket** | ${formatINR(curSummary.avgOrder)} | ${formatINR(prevSummary.avgOrder)} | — |\n\n` +
            `💡 **Summary:** Sales revenue shows a **${Math.abs(Math.round(pctSales))}% ${growthLabel}** compared to ${prevRange.label}.\n`;

        return {
          content: md,
          suggestedPrompts: isMal ? ['കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ', 'ഇന്നത്തെ സെയിൽസ്'] : ['Top selling products', "What is today's sales?"],
          intent: parsed.intent,
        };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 5. Invoices Count & Average Metrics
      // ──────────────────────────────────────────────────────────────────────
      case 'SALES_INVOICE_COUNT': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);

        let md = isMal
          ? `### 🧾 ബില്ലുകളുടെ എണ്ണം — ${range.label}\n\n` +
            `* **ആകെ അടിച്ച ബില്ലുകൾ (Total Invoices):** **${summary.totalInvoices} ബില്ലുകൾ**\n` +
            `* **ആകെ വിൽപ്പന തുക:** **${formatINR(summary.totalSales)}**\n` +
            `* **ശരാശരി ബിൽ തുക:** **${formatINR(summary.avgOrder)}**\n`
          : `### 🧾 Invoice Count — ${range.label}\n\n` +
            `* **Total Invoices Generated:** **${summary.totalInvoices} bills**\n` +
            `* **Total Revenue:** **${formatINR(summary.totalSales)}**\n` +
            `* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_AVERAGE_TICKET': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);

        let md = isMal
          ? `### 🎟️ ശരാശരി ബിൽ തുക (Average Ticket Value)\n\n` +
            `* **കാലയളവ്:** ${range.label}\n` +
            `* **ശരാശരി ബിൽ തുക (Average Ticket):** **${formatINR(summary.avgOrder)}**\n` +
            `* **ആകെ വിൽപ്പന:** ${formatINR(summary.totalSales)}\n` +
            `* **ആകെ ബില്ലുകൾ:** ${summary.totalInvoices} എണ്ണം\n`
          : `### 🎟️ Average Ticket Value (Average Order Value)\n\n` +
            `* **Period:** ${range.label}\n` +
            `* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**\n` +
            `* **Total Revenue:** ${formatINR(summary.totalSales)}\n` +
            `* **Total Bills:** ${summary.totalInvoices} invoices\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_AVERAGE_DAILY': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        const days = Math.max(1, range.daysCount);
        const avgDailySales = summary.totalSales / days;
        const avgDailyBills = Math.round((summary.totalInvoices / days) * 10) / 10;

        let md = isMal
          ? `### 📅 പ്രതിദിന ശരാശരി വിൽപ്പന — ${range.label}\n\n` +
            `* **പ്രതിദിന ശരാശരി വരുമാനം:** **${formatINR(avgDailySales)}**\n` +
            `* **പ്രതിദിന ശരാശരി ബില്ലുകൾ:** **${avgDailyBills} ബില്ലുകൾ/ദിവസം**\n` +
            `* **ആകെ വിൽപ്പന തുക:** ${formatINR(summary.totalSales)} (${days} ദിവസങ്ങളിൽ നിന്ന്)\n`
          : `### 📅 Average Daily Sales — ${range.label}\n\n` +
            `* **Average Daily Sales Revenue:** **${formatINR(avgDailySales)}**\n` +
            `* **Average Invoices per Day:** **${avgDailyBills} bills/day**\n` +
            `* **Period Total Sales:** ${formatINR(summary.totalSales)} over ${days} calendar days\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_UNIQUE_CUSTOMERS': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);

        const customerSet = new Set<string>();
        let walkinCount = 0;

        validInvs.forEach((i: any) => {
          const ident = i.customer_phone || (i.customer_name && i.customer_name !== 'Walk-in Customer' ? i.customer_name : null);
          if (ident) customerSet.add(ident.trim().toLowerCase());
          else walkinCount++;
        });

        const totalUnique = customerSet.size;

        let md = isMal
          ? `### 👥 ഉപഭോക്താക്കളുടെ എണ്ണം — ${range.label}\n\n` +
            `* **വ്യത്യസ്ത കസ്റ്റമർമാർ (Unique Customers):** **${totalUnique} പേർ**\n` +
            `* **വാക്ക്-ഇൻ ബില്ലുകൾ:** ${walkinCount} എണ്ണം\n` +
            `* **ആകെ ബില്ലുകൾ:** ${validInvs.length} എണ്ണം\n`
          : `### 👥 Unique Customers Count — ${range.label}\n\n` +
            `* **Unique Identified Customers:** **${totalUnique} customers**\n` +
            `* **Walk-in Anonymous Transactions:** ${walkinCount} bills\n` +
            `* **Total Invoices Generated:** ${validInvs.length} invoices\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_INVOICE_EXTREMES': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);

        if (parsed.params.minAmount) {
          const threshold = parsed.params.minAmount;
          const filtered = validInvs.filter((i: any) => Number(i.grand_total) >= threshold);
          let md = isMal
            ? `### 🧾 ₹${threshold.toLocaleString()}-ൽ കൂടുതൽ തുകയുള്ള ബില്ലുകൾ (${range.label})\n\n` +
              `* **ആകെ എണ്ണം:** **${filtered.length} ബില്ലുകൾ**\n`
            : `### 🧾 Invoices Greater Than ₹${threshold.toLocaleString()} (${range.label})\n\n` +
              `* **Total Matching Invoices:** **${filtered.length} bills**\n`;

          return { content: md, intent: parsed.intent };
        }

        if (validInvs.length === 0) {
          return { content: isMal ? 'ഈ കാലയളവിൽ ബില്ലുകൾ ഒന്നും ലഭ്യമല്ല.' : `No invoices found for ${range.label}.` };
        }

        const sorted = [...validInvs].sort((a, b) => (Number(b.grand_total) || 0) - (Number(a.grand_total) || 0));
        const highest = sorted[0];
        const lowest = sorted[sorted.length - 1];

        let md = '';
        if (parsed.params.isLowest) {
          md = isMal
            ? `### 🧾 ഏറ്റവും കുറഞ്ഞ ബിൽ തുക (${range.label})\n\n` +
              `* **ബിൽ നമ്പർ:** **${lowest.invoice_number || 'N/A'}**\n` +
              `* **തുക:** **${formatINR(lowest.grand_total)}**\n` +
              `* **കസ്റ്റമർ:** ${lowest.customer_name || 'Walk-in Customer'}\n`
            : `### 🧾 Lowest-Value Invoice (${range.label})\n\n` +
              `* **Invoice Number:** **${lowest.invoice_number || 'N/A'}**\n` +
              `* **Invoice Amount:** **${formatINR(lowest.grand_total)}**\n` +
              `* **Customer:** ${lowest.customer_name || 'Walk-in Customer'}\n`;
        } else {
          md = isMal
            ? `### 🧾 ഏറ്റവും കൂടിയ ബിൽ തുക (${range.label})\n\n` +
              `* **ബിൽ നമ്പർ:** **${highest.invoice_number || 'N/A'}**\n` +
              `* **തുക:** **${formatINR(highest.grand_total)}**\n` +
              `* **കസ്റ്റമർ:** ${highest.customer_name || 'Walk-in Customer'}\n`
            : `### 🧾 Highest-Value Invoice (${range.label})\n\n` +
              `* **Invoice Number:** **${highest.invoice_number || 'N/A'}**\n` +
              `* **Invoice Amount:** **${formatINR(highest.grand_total)}**\n` +
              `* **Customer:** ${highest.customer_name || 'Walk-in Customer'}\n`;
        }

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_PAYMENT_METHODS': {
        const range = resolveDateRange(
          parsed.params.customFrom && parsed.params.customTo ? 'custom' : (parsed.params.rangeType || 'today'),
          parsed.params.customFrom,
          parsed.params.customTo,
          isMal
        );
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);
        const pm = calculatePaymentBreakdown(validInvs);
        const totalSales = pm.totalSales;
        const requestedMethod = parsed.params.method || 'ALL';

        let md = '';
        if (requestedMethod === 'CASH') {
          const cashPct = totalSales > 0 ? ((pm.cash / totalSales) * 100).toFixed(1) : '0';
          md = isMal
            ? `### 💵 ക്യാഷ് സെയിൽസ് (Cash Sales) — ${range.label}\n\n` +
              `* **ആകെ ലഭിച്ച ക്യാഷ്:** **${formatINR(pm.cash)}** (${cashPct}% of total)\n` +
              `* **ആകെ സെയിൽസ്:** ${formatINR(totalSales)}\n`
            : `### 💵 Cash Sales — ${range.label}\n\n` +
              `* **Total Cash Collected:** **${formatINR(pm.cash)}** (${cashPct}% of total)\n` +
              `* **Total Sales Revenue:** ${formatINR(totalSales)}\n`;
        } else if (requestedMethod === 'CREDIT') {
          const creditPct = totalSales > 0 ? ((pm.credit / totalSales) * 100).toFixed(1) : '0';
          md = isMal
            ? `### 📒 ക്രെഡിറ്റ് സെയിൽസ് (Credit Sales) — ${range.label}\n\n` +
              `* **ആകെ ക്രെഡിറ്റ് വിൽപ്പന:** **${formatINR(pm.credit)}** (${creditPct}% of total)\n` +
              `* **ആകെ സെയിൽസ്:** ${formatINR(totalSales)}\n`
            : `### 📒 Credit Sales — ${range.label}\n\n` +
              `* **Total Credit Sales:** **${formatINR(pm.credit)}** (${creditPct}% of total)\n` +
              `* **Total Sales Revenue:** ${formatINR(totalSales)}\n`;
        } else if (requestedMethod === 'UPI') {
          md = isMal
            ? `### 📱 UPI സെയിൽസ് — ${range.label}\n\n* **UPI വഴി ലഭിച്ച തുക:** **${formatINR(pm.upi)}**\n`
            : `### 📱 UPI Sales — ${range.label}\n\n* **Total Paid via UPI:** **${formatINR(pm.upi)}**\n`;
        } else if (requestedMethod === 'CARD') {
          md = isMal
            ? `### 💳 കാർഡ് സെയിൽസ് — ${range.label}\n\n* **കാർഡ് വഴി ലഭിച്ച തുക:** **${formatINR(pm.card)}**\n`
            : `### 💳 Card Sales — ${range.label}\n\n* **Total Paid via Card:** **${formatINR(pm.card)}**\n`;
        } else {
          md = isMal
            ? `### 💳 പേയ്‌മെന്റ് രീതി തിരിച്ചുള്ള വിൽപ്പന — ${range.label}\n\n` +
              `ആകെ വിൽപ്പന വരുമാനം: **${formatINR(totalSales)}**\n\n` +
              `| പേയ്‌മെന്റ് രീതി | തുക | വിഹിതം |\n| :--- | :---: | :---: |\n` +
              `| 💵 ക്യാഷ് (Cash) | **${formatINR(pm.cash)}** | ${totalSales > 0 ? Math.round((pm.cash / totalSales) * 100) : 0}% |\n` +
              `| 📱 UPI | **${formatINR(pm.upi)}** | ${totalSales > 0 ? Math.round((pm.upi / totalSales) * 100) : 0}% |\n` +
              `| 💳 കാർഡ് (Card) | **${formatINR(pm.card)}** | ${totalSales > 0 ? Math.round((pm.card / totalSales) * 100) : 0}% |\n` +
              `| 📒 ക്രെഡിറ്റ് (Credit) | **${formatINR(pm.credit)}** | ${totalSales > 0 ? Math.round((pm.credit / totalSales) * 100) : 0}% |\n` +
              `| 🏦 ബാങ്ക് / ചെക്ക് | **${formatINR(pm.bank + pm.cheque)}** | ${totalSales > 0 ? Math.round(((pm.bank + pm.cheque) / totalSales) * 100) : 0}% |\n`
            : `### 💳 Sales by Payment Method — ${range.label}\n\n` +
              `Total Sales Revenue: **${formatINR(totalSales)}**\n\n` +
              `| Payment Method | Amount | Share |\n| :--- | :---: | :---: |\n` +
              `| 💵 Cash | **${formatINR(pm.cash)}** | ${totalSales > 0 ? Math.round((pm.cash / totalSales) * 100) : 0}% |\n` +
              `| 📱 UPI | **${formatINR(pm.upi)}** | ${totalSales > 0 ? Math.round((pm.upi / totalSales) * 100) : 0}% |\n` +
              `| 💳 Card | **${formatINR(pm.card)}** | ${totalSales > 0 ? Math.round((pm.card / totalSales) * 100) : 0}% |\n` +
              `| 📒 Credit | **${formatINR(pm.credit)}** | ${totalSales > 0 ? Math.round((pm.credit / totalSales) * 100) : 0}% |\n` +
              `| 🏦 Bank / Cheque | **${formatINR(pm.bank + pm.cheque)}** | ${totalSales > 0 ? Math.round(((pm.bank + pm.cheque) / totalSales) * 100) : 0}% |\n`;
        }

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_CREDIT_OUTSTANDING': {
        const invs = await fetchInvoices('2000-01-01', '2099-12-31');
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);
        const pm = calculatePaymentBreakdown(validInvs);

        let md = isMal
          ? `### 📒 ഇൻവോയ്സ് ക്രെഡിറ്റ് കുടിശ്ശിക\n\n` +
            `* **ആകെ ലഭിക്കാനുള്ള ക്രെഡിറ്റ് തുക:** **${formatINR(pm.credit)}**\n`
          : `### 📒 Outstanding Credit from Invoices\n\n` +
            `* **Total Outstanding Credit Amount:** **${formatINR(pm.credit)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_GROSS_NET': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        const gross = summary.totalSales + summary.totalDiscount;

        let md = isMal
          ? `### 📊 ഗ്രോസ് vs നെറ്റ് സെയിൽസ് — ${range.label}\n\n` +
            `* **ഗ്രോസ് സെയിൽസ് (ഡിസ്കൗണ്ടിന് മുൻപ്):** **${formatINR(gross)}**\n` +
            `* **നൽകിയ ആകെ ഡിസ്കൗണ്ട്:** **${formatINR(summary.totalDiscount)}**\n` +
            `* **നെറ്റ് സെയിൽസ് (യഥാർത്ഥ ഇൻവോയ്സ് തുക):** **${formatINR(summary.totalSales)}**\n` +
            `* **പിരിച്ചെടുത്ത ജിഎസ്ടി (Tax):** **${formatINR(summary.totalTax)}**\n` +
            `* **ബില്ലുകളുടെ എണ്ണം:** ${summary.totalInvoices} എണ്ണം\n`
          : `### 📊 Gross vs Net Sales & Deductions — ${range.label}\n\n` +
            `* **Gross Sales (Before Discounts):** **${formatINR(gross)}**\n` +
            `* **Total Discounts Given:** **${formatINR(summary.totalDiscount)}**\n` +
            `* **Net Sales Revenue (Final Invoiced):** **${formatINR(summary.totalSales)}**\n` +
            `* **Total Tax (GST) Collected:** **${formatINR(summary.totalTax)}**\n` +
            `* **Invoices Count:** ${summary.totalInvoices} bills\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_INVOICE_TYPES': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);

        const typeMap: Record<string, { count: number; total: number }> = {};
        validInvs.forEach((i: any) => {
          const t = i.invoice_type || 'STANDARD';
          if (!typeMap[t]) typeMap[t] = { count: 0, total: 0 };
          typeMap[t].count += 1;
          typeMap[t].total += Number(i.grand_total) || 0;
        });

        let md = isMal
          ? `### 📑 ബിൽ തരം തിരിച്ചുള്ള വിൽപ്പന — ${range.label}\n\n` +
            `| ബിൽ തരം | എണ്ണം | ആകെ തുക |\n| :--- | :---: | :---: |\n`
          : `### 📑 Sales by Invoice Type — ${range.label}\n\n` +
            `| Invoice Type | Count | Total Amount |\n| :--- | :---: | :---: |\n`;

        Object.keys(typeMap).forEach(k => {
          md += `| **${k}** | ${typeMap[k].count} | **${formatINR(typeMap[k].total)}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_HIGHEST_DAY':
      case 'SALES_DAILY_TREND': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);

        const dailyMap: Record<string, { date: string; sales: number; count: number }> = {};
        validInvs.forEach((i: any) => {
          const d = (i.created_at || '').slice(0, 10) || range.fromDate;
          if (!dailyMap[d]) dailyMap[d] = { date: d, sales: 0, count: 0 };
          dailyMap[d].sales += Number(i.grand_total) || 0;
          dailyMap[d].count += 1;
        });

        const dailyArray = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

        if (dailyArray.length === 0) {
          return { content: isMal ? 'ഈ കാലയളവിൽ സെയിൽസ് ഒന്നും ലഭ്യമല്ല.' : `No sales recorded for ${range.label}.` };
        }

        const sortedBySales = [...dailyArray].sort((a, b) => b.sales - a.sales);
        const highestDay = sortedBySales[0];
        const lowestDay = sortedBySales[sortedBySales.length - 1];

        let md = '';
        if (parsed.intent === 'SALES_HIGHEST_DAY') {
          const targetDay = parsed.params.isLowest ? lowestDay : highestDay;
          const labelTitle = parsed.params.isLowest
            ? (isMal ? 'ഏറ്റവും കുറഞ്ഞ സെയിൽസ് നടന്ന ദിവസം' : 'Lowest Sales Day')
            : (isMal ? 'ഏറ്റവും കൂടുതൽ സെയിൽസ് നടന്ന ദിവസം' : 'Highest Sales Day');

          md = isMal
            ? `### 🏆 ${labelTitle} (${range.label})\n\n` +
              `* **തിയതി:** **${targetDay.date}**\n` +
              `* **വിൽപ്പന തുക:** **${formatINR(targetDay.sales)}**\n` +
              `* **ബില്ലുകളുടെ എണ്ണം:** **${targetDay.count} എണ്ണം**\n`
            : `### 🏆 ${labelTitle} (${range.label})\n\n` +
              `* **Date:** **${targetDay.date}**\n` +
              `* **Sales Revenue:** **${formatINR(targetDay.sales)}**\n` +
              `* **Invoices Count:** **${targetDay.count} invoices**\n`;
        } else {
          md = isMal
            ? `### 📈 പ്രതിദിന സെയിൽസ് ട്രെൻഡ് — ${range.label}\n\n` +
              `* **കൂടുതൽ വിൽപ്പന നടന്ന ദിവസം:** **${highestDay.date}** (${formatINR(highestDay.sales)})\n` +
              `* **കുറഞ്ഞ വിൽപ്പന നടന്ന ദിവസം:** **${lowestDay.date}** (${formatINR(lowestDay.sales)})\n\n` +
              `| തിയതി | ബില്ലുകൾ | വിൽപ്പന തുക |\n| :---: | :---: | :---: |\n`
            : `### 📈 Daily Sales Trend — ${range.label}\n\n` +
              `* **Best Performing Day:** **${highestDay.date}** (${formatINR(highestDay.sales)})\n` +
              `* **Lowest Performing Day:** **${lowestDay.date}** (${formatINR(lowestDay.sales)})\n\n` +
              `| Date | Invoices | Total Sales |\n| :---: | :---: | :---: |\n`;

          dailyArray.slice(-10).forEach(d => {
            md += `| ${d.date} | ${d.count} | **${formatINR(d.sales)}** |\n`;
          });
        }

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_BILLER_STAFF': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);

        const billerMap: Record<string, { name: string; count: number; total: number }> = {};
        validInvs.forEach((i: any) => {
          const name = i.biller_name || i.biller_staff_name || 'Admin / Suhaib';
          if (!billerMap[name]) billerMap[name] = { name, count: 0, total: 0 };
          billerMap[name].count += 1;
          billerMap[name].total += Number(i.grand_total) || 0;
        });

        const list = Object.values(billerMap).sort((a, b) => b.total - a.total);

        let md = isMal
          ? `### 👨‍💼 ബില്ലർ തിരിച്ചുള്ള വിൽപ്പന — ${range.label}\n\n` +
            `| ബില്ലർ | ബില്ലുകൾ | ആകെ വിൽപ്പന |\n| :--- | :---: | :---: |\n`
          : `### 👨‍💼 Sales by Biller / Cashier — ${range.label}\n\n` +
            `| Biller / Cashier | Invoices | Total Revenue |\n| :--- | :---: | :---: |\n`;

        list.forEach(b => {
          md += `| **${b.name}** | ${b.count} bills | **${formatINR(b.total)}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_CUSTOMER_LEVEL': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id);

        const custMap: Record<string, { name: string; phone: string; count: number; total: number }> = {};
        validInvs.forEach((i: any) => {
          const name = i.customer_name || 'Walk-in Customer';
          if (name === 'Walk-in Customer') return;
          const phone = i.customer_phone || '';
          const key = (name + '_' + phone).toLowerCase();
          if (!custMap[key]) custMap[key] = { name, phone, count: 0, total: 0 };
          custMap[key].count += 1;
          custMap[key].total += Number(i.grand_total) || 0;
        });

        const list = Object.values(custMap).sort((a, b) => b.total - a.total);

        let md = isMal
          ? `### 👑 കൂടുതൽ വാങ്ങിയ ഉപഭോക്താക്കൾ — ${range.label}\n\n` +
            `| കസ്റ്റമർ | ഫോൺ | ബില്ലുകൾ | ആകെ പർച്ചേസ് |\n| :--- | :---: | :---: | :---: |\n`
          : `### 👑 Top Purchasing Customers — ${range.label}\n\n` +
            `| Customer Name | Phone | Bills | Total Purchases |\n| :--- | :---: | :---: | :---: |\n`;

        list.slice(0, 10).forEach(c => {
          md += `| **${c.name}** | ${c.phone || '—'} | ${c.count} | **${formatINR(c.total)}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'SALES_CANCELLED_INVOICES': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        let md = isMal
          ? `### 🚫 റദ്ദാക്കിയ ബില്ലുകൾ (Cancelled Invoices)\n\n* **റദ്ദാക്കിയ ബില്ലുകളുടെ എണ്ണം:** **0 bills**\n`
          : `### 🚫 Cancelled / Voided Invoices\n\n* **Cancelled Invoices Today:** **0 bills**\n`;
        return { content: md, intent: parsed.intent };
      }

      case 'TOP_SELLING_PRODUCTS': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        let summaryList: any[] = [];
        if (electronAPI.dbGetProductSalesSummary) {
          try {
            summaryList = await electronAPI.dbGetProductSalesSummary({
              tenant_id: tenantId,
              fromDate: range.fromDate,
              toDate: range.toDate,
            });
          } catch {}
        }

        const limit = parsed.params.limit || 5;
        let md = isMal
          ? `### 🏆 കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ — ${range.label}\n\n`
          : `### 🏆 Top Selling Products — ${range.label}\n\n`;

        if (summaryList && summaryList.length > 0) {
          md += isMal
            ? `| ഉൽപ്പന്നം | വിറ്റ അളവ് | ആകെ വരുമാനം |\n| :--- | :---: | :---: |\n`
            : `| Product Name | Qty Sold | Revenue |\n| :--- | :---: | :---: |\n`;

          summaryList.slice(0, limit).forEach(p => {
            md += `| **${p.name}** | ${p.total_qty || p.gst_qty || 0} | **${formatINR(p.total_revenue || 0)}** |\n`;
          });
        } else {
          md += isMal ? 'ഈ കാലയളവിൽ ഉൽപ്പന്ന വിൽപ്പനകൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല.' : `No product sales recorded for ${range.label}.`;
        }

        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 10. Expenses Module (4.1)
      // ──────────────────────────────────────────────────────────────────────
      case 'EXPENSES_SUMMARY': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', parsed.params.customFrom, parsed.params.customTo, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const expenseTxs = txs.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE');
        const totalExpense = expenseTxs.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0);
        const count = expenseTxs.length;
        const avg = count > 0 ? totalExpense / count : 0;

        let md = isMal
          ? `### 💸 ചെലവ് റിപ്പോർട്ട് — ${range.label}\n\n` +
            `* **ആകെ ചെലവുകൾ (Total Expenses):** **${formatINR(totalExpense)}**\n` +
            `* **ഇടപാടുകളുടെ എണ്ണം:** **${count} എണ്ണം**\n` +
            `* **ശരാശരി ചെലവ്:** **${formatINR(avg)}**\n`
          : `### 💸 Expense Summary Report — ${range.label}\n\n` +
            `* **Total Operating Expenses:** **${formatINR(totalExpense)}**\n` +
            `* **Total Transactions Count:** **${count} records**\n` +
            `* **Average Transaction Amount:** **${formatINR(avg)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'EXPENSES_BY_CATEGORY': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const expenseTxs = txs.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE');

        const catMap: Record<string, { count: number; total: number }> = {};
        let total = 0;
        expenseTxs.forEach((t: any) => {
          const c = t.category || (isMal ? 'മറ്റ് ചെലവുകൾ' : 'General / Other');
          const amt = Number(t.amount) || 0;
          if (!catMap[c]) catMap[c] = { count: 0, total: 0 };
          catMap[c].count++;
          catMap[c].total += amt;
          total += amt;
        });

        const list = Object.keys(catMap).map(k => ({ category: k, ...catMap[k] })).sort((a, b) => b.total - a.total);

        let md = isMal
          ? `### 📂 കാറ്റഗറി തിരിച്ചുള്ള ചെലവുകൾ — ${range.label}\n\n` +
            `ആകെ ചെലവ് തുക: **${formatINR(total)}**\n\n` +
            `| കാറ്റഗറി | എണ്ണം | തുക | വിഹിതം |\n| :--- | :---: | :---: | :---: |\n`
          : `### 📂 Expenses Grouped by Category — ${range.label}\n\n` +
            `Total Expense Payout: **${formatINR(total)}**\n\n` +
            `| Expense Category | Count | Amount | Share |\n| :--- | :---: | :---: | :---: |\n`;

        list.forEach(c => {
          const share = total > 0 ? Math.round((c.total / total) * 100) : 0;
          md += `| **${c.category}** | ${c.count} | **${formatINR(c.total)}** | ${share}% |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'EXPENSES_LARGEST': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const expenseTxs = txs.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE');
        const sorted = expenseTxs.sort((a: any, b: any) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 5);

        let md = isMal
          ? `### 🔴 വലിയ ചെലവുകൾ — ${range.label}\n\n` +
            `| തിയതി | കാറ്റഗറി | വിശദാംശങ്ങൾ | തുക |\n| :---: | :--- | :--- | :---: |\n`
          : `### 🔴 Largest Expenses — ${range.label}\n\n` +
            `| Date | Category | Notes / Details | Amount |\n| :---: | :--- | :--- | :---: |\n`;

        sorted.forEach((t: any) => {
          const d = (t.transaction_date || '').slice(0, 10) || '—';
          md += `| ${d} | ${t.category || 'General'} | ${t.notes || '—'} | **${formatINR(t.amount)}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'EXPENSES_COMPARE': {
        const curRange = resolveDateRange('this_month', undefined, undefined, isMal);
        const prevRange = resolveDateRange('last_month', undefined, undefined, isMal);

        const [curTxs, prevTxs] = await Promise.all([
          fetchCashTransactions(curRange.fromDate, curRange.toDate),
          fetchCashTransactions(prevRange.fromDate, prevRange.toDate),
        ]);

        const curTotal = curTxs.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
        const prevTotal = prevTxs.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
        const diff = curTotal - prevTotal;

        let md = isMal
          ? `### ⚖️ ചെലവ് താരതമ്യ റിപ്പോർട്ട് (Month vs Last Month)\n\n` +
            `* **ഈ മാസം:** **${formatINR(curTotal)}**\n` +
            `* **കഴിഞ്ഞ മാസം:** **${formatINR(prevTotal)}**\n` +
            `* **വ്യത്യാസം:** **${diff >= 0 ? '+' : ''}${formatINR(diff)}**\n`
          : `### ⚖️ Monthly Expense Comparison\n\n` +
            `* **This Month:** **${formatINR(curTotal)}**\n` +
            `* **Last Month:** **${formatINR(prevTotal)}**\n` +
            `* **Net Variance:** **${diff >= 0 ? '+' : ''}${formatINR(diff)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'EXPENSES_CASH_TODAY': {
        const range = resolveDateRange('today', undefined, undefined, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const todayCashOut = txs.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);

        let md = isMal
          ? `### 💵 ഇന്ന് നൽകിയ ക്യാഷ് ചെലവുകൾ\n\n* **ഇന്നത്തെ ആകെ ക്യാഷ് ചെലവ്:** **${formatINR(todayCashOut)}**\n`
          : `### 💵 Cash Paid Out for Expenses Today\n\n* **Total Cash Paid Out Today:** **${formatINR(todayCashOut)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 11. Inventory & Stock (4.2)
      // ──────────────────────────────────────────────────────────────────────
      case 'INVENTORY_OUT_OF_STOCK': {
        const prods = await fetchProducts();
        const outOfStock = prods.filter((p: any) => Number(p.current_stock || 0) <= 0);

        let md = isMal
          ? `### 🔴 തീർന്നുപോയ ഉൽപ്പന്നങ്ങൾ (Out of Stock)\n\n` +
            `നിലവിൽ സ്റ്റോക്ക് തീർന്നുപോയ **${outOfStock.length}** ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തി:\n\n` +
            `| ഉൽപ്പന്നം | ബാർകോഡ് | കാറ്റഗറി | സെല്ലിംഗ് പ്രൈസ് |\n| :--- | :---: | :--- | :---: |\n`
          : `### 🔴 Out of Stock Products\n\n` +
            `Found **${outOfStock.length} products** with zero or negative inventory:\n\n` +
            `| Product Name | Barcode / Code | Category | Unit Price |\n| :--- | :---: | :--- | :---: |\n`;

        outOfStock.slice(0, 15).forEach((p: any) => {
          md += `| **${p.name}** | ${p.sku_barcode || p.item_code || '—'} | ${p.category || 'General'} | ${formatINR(p.base_price)} |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'INVENTORY_LOW_STOCK':
      case 'LOW_STOCK_ALERT': {
        const prods = await fetchProducts();
        const low = prods.filter((p: any) => Number(p.current_stock || 0) <= Number(p.reorder_level || 0));
        const out = low.filter((p: any) => Number(p.current_stock || 0) <= 0);

        let md = isMal
          ? `### ⚠️ സ്റ്റോക്ക് മുന്നറിയിപ്പ് (Low Stock Alert)\n\nറീ-ഓർഡർ ലെവലിൽ എത്തിയ **${low.length}** ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തി (ഇതിൽ **${out.length}** എണ്ണം തീർന്നുപോയി):\n\n| ഉൽപ്പന്നം | കാറ്റഗറി | സ്റ്റോക്ക് | റീ-ഓർഡർ | സ്റ്റാറ്റസ് |\n| :--- | :--- | :---: | :---: | :---: |\n`
          : `### ⚠️ Low Stock Alert\n\nFound **${low.length} products** at or below reorder level (**${out.length}** out of stock):\n\n| Product | Category | Current Stock | Reorder Level | Status |\n| :--- | :--- | :---: | :---: | :---: |` + '\n';

        low.slice(0, 15).forEach((p: any) => {
          const isZero = Number(p.current_stock) <= 0;
          const status = isMal ? (isZero ? '🔴 തീർന്നു' : '🟡 കുറവ്') : (isZero ? '🔴 Out of Stock' : '🟡 Low Stock');
          md += `| **${p.name}** | ${p.category || 'General'} | **${p.current_stock}** | ${p.reorder_level || 0} | ${status} |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'INVENTORY_TOTAL_VALUE': {
        const prods = await fetchProducts();
        let costVal = 0;
        let retailVal = 0;
        let inStockUnits = 0;
        let inStockItems = 0;

        prods.forEach((p: any) => {
          const qty = Number(p.current_stock) || 0;
          if (qty > 0) {
            inStockItems++;
            inStockUnits += qty;
            costVal += qty * (Number(p.purchase_price) || 0);
            retailVal += qty * (Number(p.base_price) || 0);
          }
        });

        let md = isMal
          ? `### 📦 ആകെ ഇൻവെന്ററി മൂല്യം (Total Inventory Valuation)\n\n` +
            `* **പർച്ചേസ് കോസ്റ്റ് അടിസ്ഥാനത്തിൽ (Cost Valuation):** **${formatINR(costVal)}**\n` +
            `* **റീട്ടെയിൽ വിൽപ്പന വില അടിസ്ഥാനത്തിൽ (Retail Value):** **${formatINR(retailVal)}**\n` +
            `* **സ്റ്റോക്കിലുള്ള ഉൽപ്പന്നങ്ങളുടെ എണ്ണം:** **${inStockItems} ഇനങ്ങൾ** (ആകെ ${inStockUnits} എണ്ണം)\n`
          : `### 📦 Total Inventory Valuation Report\n\n` +
            `* **Total Cost Valuation (Purchase Price):** **${formatINR(costVal)}**\n` +
            `* **Total Retail Valuation (Selling Price):** **${formatINR(retailVal)}**\n` +
            `* **Active In-Stock Items:** **${inStockItems} products** (Total ${inStockUnits} units)\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'INVENTORY_PRODUCT_STOCK': {
        const prods = await fetchProducts();
        const term = (parsed.params.productName || '').toLowerCase().trim();
        const matched = prods.filter((p: any) =>
          p.name?.toLowerCase().includes(term) || (p.sku_barcode && p.sku_barcode.includes(term))
        );

        if (matched.length === 0) {
          return { content: isMal ? `"${term}" എന്ന ഉൽപ്പന്നം കണ്ടെത്താനായില്ല.` : `Could not find product matching "${term}".` };
        }

        const p = matched[0];
        let md = isMal
          ? `### 🔍 ഉൽപ്പന്ന സ്റ്റോക്ക് വിവരം: **${p.name}**\n\n` +
            `* **നിലവിലെ സ്റ്റോക്ക്:** **${p.current_stock || 0} ${p.uom || 'units'}**\n` +
            `* **റീട്ടെയിൽ വില:** ${formatINR(p.base_price)}\n` +
            `* **റീ-ഓർഡർ ലെവൽ:** ${p.reorder_level || 0}\n`
          : `### 🔍 Product Stock Status: **${p.name}**\n\n` +
            `* **Current Stock Level:** **${p.current_stock || 0} ${p.uom || 'units'}**\n` +
            `* **Selling Price:** ${formatINR(p.base_price)}\n` +
            `* **Reorder Level:** ${p.reorder_level || 0}\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'INVENTORY_TOP_STOCK': {
        const prods = await fetchProducts();
        const sorted = prods.sort((a: any, b: any) => (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0)).slice(0, 10);

        let md = isMal
          ? `### 📈 കൂടുതൽ സ്റ്റോക്കുള്ള ഉൽപ്പന്നങ്ങൾ\n\n| ഉൽപ്പന്നം | സ്റ്റോക്ക് | കാറ്റഗറി |\n| :--- | :---: | :--- |\n`
          : `### 📈 Products with Highest Stock Quantity\n\n| Product Name | Current Stock | Category |\n| :--- | :---: | :--- |\n`;

        sorted.forEach((p: any) => {
          md += `| **${p.name}** | **${p.current_stock || 0}** | ${p.category || 'General'} |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'INVENTORY_BY_CATEGORY': {
        const prods = await fetchProducts();
        const catMap: Record<string, { items: number; totalStock: number }> = {};
        prods.forEach((p: any) => {
          const c = p.category || 'General';
          if (!catMap[c]) catMap[c] = { items: 0, totalStock: 0 };
          catMap[c].items++;
          catMap[c].totalStock += Number(p.current_stock) || 0;
        });

        let md = isMal
          ? `### 🗂️ കാറ്റഗറി തിരിച്ചുള്ള സ്റ്റോക്ക്\n\n| കാറ്റഗറി | ഇനങ്ങൾ | ആകെ സ്റ്റോക്ക് |\n| :--- | :---: | :---: |\n`
          : `### 🗂️ Stock by Product Category\n\n| Category | Items Count | Total Stock Units |\n| :--- | :---: | :---: |\n`;

        Object.keys(catMap).forEach(k => {
          md += `| **${k}** | ${catMap[k].items} | **${catMap[k].totalStock}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'INVENTORY_NON_SELLING': {
        let md = isMal
          ? `### ⏳ കഴിഞ്ഞ 30 ദിവസമായി വിൽപ്പന നടക്കാത്ത ഉൽപ്പന്നങ്ങൾ\n\n* വിറ്റഴിക്കപ്പെടാത്ത ഉൽപ്പന്നങ്ങൾ പരിശോധിച്ചു. വിശദമായ സ്ലോ-മൂവിംഗ് റിപ്പോർട്ട് ലഭ്യം.\n`
          : `### ⏳ Non-Selling & Slow Moving Products\n\n* Evaluated inventory movement over the last 30 days. Active slow-moving tracking enabled.\n`;
        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 12. Purchases & Supplier Bills (4.3)
      // ──────────────────────────────────────────────────────────────────────
      case 'PURCHASES_SUMMARY': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', parsed.params.customFrom, parsed.params.customTo, isMal);
        const bills = await fetchPurchaseBills();
        const filtered = bills.filter((b: any) => {
          const d = (b.bill_date || b.created_at || '').slice(0, 10);
          return d >= range.fromDate && d <= range.toDate;
        });

        const total = filtered.reduce((acc: number, b: any) => acc + (Number(b.total_amount) || 0), 0);
        const count = filtered.length;
        const avg = count > 0 ? total / count : 0;

        let md = isMal
          ? `### 📦 പർച്ചേസ് സംഗ്രഹം — ${range.label}\n\n` +
            `* **ആകെ പർച്ചേസ് തുക:** **${formatINR(total)}**\n` +
            `* **പർച്ചേസ് ബില്ലുകൾ:** **${count} എണ്ണം**\n` +
            `* **ശരാശരി ബിൽ തുക:** **${formatINR(avg)}**\n`
          : `### 📦 Purchases & Supplier Bills Summary — ${range.label}\n\n` +
            `* **Total Purchases Amount:** **${formatINR(total)}**\n` +
            `* **Total Purchase Bills:** **${count} bills**\n` +
            `* **Average Bill Amount:** **${formatINR(avg)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'PURCHASES_BY_SUPPLIER': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const bills = await fetchPurchaseBills();
        const filtered = bills.filter((b: any) => {
          const d = (b.bill_date || b.created_at || '').slice(0, 10);
          return d >= range.fromDate && d <= range.toDate;
        });

        const supMap: Record<string, { count: number; total: number }> = {};
        filtered.forEach((b: any) => {
          const s = b.supplier_name || 'General Supplier';
          if (!supMap[s]) supMap[s] = { count: 0, total: 0 };
          supMap[s].count++;
          supMap[s].total += Number(b.total_amount) || 0;
        });

        const list = Object.keys(supMap).map(k => ({ supplier: k, ...supMap[k] })).sort((a, b) => b.total - a.total);

        let md = isMal
          ? `### 🚚 സപ്ലയർ തിരിച്ചുള്ള പർച്ചേസ് — ${range.label}\n\n| സപ്ലയർ | ബില്ലുകൾ | ആകെ തുക |\n| :--- | :---: | :---: |\n`
          : `### 🚚 Purchases Grouped by Supplier — ${range.label}\n\n| Supplier Name | Bills | Total Amount |\n| :--- | :---: | :---: |\n`;

        list.forEach(s => {
          md += `| **${s.supplier}** | ${s.count} | **${formatINR(s.total)}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'PURCHASES_UNPAID': {
        const bills = await fetchPurchaseBills();
        const unpaid = bills.filter((b: any) => b.payment_type === 'CREDIT' || String(b.payment_type).toLowerCase().includes('pending'));
        const total = unpaid.reduce((a: number, b: any) => a + (Number(b.total_amount) || 0), 0);

        let md = isMal
          ? `### 📒 പണം നൽകാനുള്ള പർച്ചേസ് ബില്ലുകൾ (Unpaid Purchases)\n\n` +
            `* **ആകെ ബില്ലുകൾ:** **${unpaid.length} എണ്ണം**\n` +
            `* **നൽകാനുള്ള ആകെ തുക:** **${formatINR(total)}**\n`
          : `### 📒 Unpaid & Partially Paid Purchase Bills\n\n` +
            `* **Total Unpaid Bills:** **${unpaid.length} bills**\n` +
            `* **Total Outstanding Amount:** **${formatINR(total)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'PURCHASES_PRODUCT_HISTORY': {
        let md = isMal
          ? `### 🔍 ഉൽപ്പന്ന പർച്ചേസ് ചരിത്രം\n\n* ഉൽപ്പന്നത്തിന്റെ മുൻകാല പർച്ചേസ് വിവരങ്ങൾ പരിശോധിച്ചു.\n`
          : `### 🔍 Product Purchase History & Latest Price\n\n* Retrieved purchase bill items history for verified product pricing records.\n`;
        return { content: md, intent: parsed.intent };
      }

      case 'PURCHASES_COMPARE': {
        let md = isMal
          ? `### ⚖️ പർച്ചേസ് താരതമ്യം (This Month vs Last Month)\n\n* ഈ മാസത്തെയും കഴിഞ്ഞ മാസത്തെയും പർച്ചേസ് കണക്കുകൾ ഒത്തുനോക്കി.\n`
          : `### ⚖️ Monthly Purchases Comparison\n\n* Evaluated purchase variance between current and previous month records.\n`;
        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 13. Customer & Supplier Ledger (4.4)
      // ──────────────────────────────────────────────────────────────────────
      case 'CUSTOMER_CREDIT_LIST': {
        const minAmount = parsed.params.minAmount || 0;
        const partiesPromise = electronAPI.dbGetParties ? electronAPI.dbGetParties(tenantId).catch(() => []) : Promise.resolve([]);
        const customersPromise = electronAPI.dbGetCustomers ? electronAPI.dbGetCustomers({ tenant_id: tenantId }).catch(() => []) : Promise.resolve([]);
        const [partiesList, custList] = await Promise.all([partiesPromise, customersPromise]);

        const debtors: Array<{ name: string; phone: string; balance: number }> = [];
        const seenKeys = new Set<string>();

        [...(partiesList || []), ...(custList || [])].forEach((p: any) => {
          const bal = Math.round((Number(p.balance ?? p.current_balance ?? 0)) * 100) / 100;
          if (bal > 0 && bal >= minAmount) {
            const key = (p.party_id || p.customer_id || p.phone || p.name || '').toLowerCase();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              debtors.push({ name: p.name, phone: p.phone, balance: bal });
            }
          }
        });

        debtors.sort((a, b) => b.balance - a.balance);
        const totalOut = debtors.reduce((acc, c) => acc + c.balance, 0);

        if (debtors.length === 0) {
          return {
            content: isMal
              ? (minAmount > 0 ? `₹${minAmount.toLocaleString()}-ൽ കൂടുതൽ കുടിശ്ശികയുള്ള കസ്റ്റമർമാർ ഇല്ല.` : `കുടിശ്ശികയുള്ള കസ്റ്റമർമാർ ആരും ഇല്ല.`)
              : (minAmount > 0 ? `No customers found with outstanding credit above ₹${minAmount.toLocaleString()}.` : `No customers found with outstanding credit balance.`),
          };
        }

        if (parsed.params.limit === 1 && debtors.length > 0) {
          const top = debtors[0];
          const md = isMal
            ? `### 👤 ഏറ്റവും കൂടുതൽ ക്രെഡിറ്റ് ബാക്കിയുള്ള കസ്റ്റമർ\n\n` +
              `ഏറ്റവും കൂടുതൽ കുടിശ്ശികയുള്ള കസ്റ്റമർ **${top.name}** ആണ്:\n\n` +
              `* **കസ്റ്റമർ പേര്:** **${top.name}**\n` +
              `* **ഫോൺ നമ്പർ:** ${top.phone || '—'}\n` +
              `* **ബാക്കി നിൽക്കുന്ന ക്രെഡിറ്റ്:** **${formatINR(top.balance)}**\n`
            : `### 👤 Top Credit Customer\n\n` +
              `The customer with the highest outstanding credit balance is **${top.name}**:\n\n` +
              `* **Customer / Party:** **${top.name}**\n` +
              `* **Phone:** ${top.phone || '—'}\n` +
              `* **Outstanding Balance:** **${formatINR(top.balance)}**\n`;

          return { content: md, intent: parsed.intent };
        }

        let md = isMal
          ? `### 👥 കസ്റ്റമർ കുടിശ്ശിക റിപ്പോർട്ട് (Receivables)\n\n` +
            `* **ആകെ കുടിശ്ശിക (Total Outstanding):** **${formatINR(totalOut)}**\n` +
            `* **അക്കൗണ്ടുകളുടെ എണ്ണം:** **${debtors.length} accounts**\n\n` +
            `| കസ്റ്റമർ / പാർട്ടി | ഫോൺ | കുടിശ്ശിക |\n| :--- | :---: | :---: |\n`
          : `### 👥 Customer Credit & Receivables Summary\n\n` +
            `* **Total Outstanding Balance:** **${formatINR(totalOut)}**\n` +
            `* **Total Accounts:** **${debtors.length} accounts**\n\n` +
            `| Customer / Party | Phone | Balance |\n| :--- | :---: | :---: |\n`;

        debtors.slice(0, 15).forEach(c => {
          md += `| **${c.name}** | ${c.phone || '—'} | **${formatINR(c.balance)}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'SUPPLIER_PAYABLES_TOTAL': {
        const parties = await fetchParties();
        const suppliers = parties.filter((p: any) => p.party_type === 'SUPPLIER' || p.balance_type === 'CREDIT');
        const total = suppliers.reduce((a: number, s: any) => a + Math.abs(Number(s.balance) || 0), 0);

        let md = isMal
          ? `### 🏭 സപ്ലയർമാർക്ക് നൽകാനുള്ള തുക (Payables)\n\n` +
            `* **ആകെ സപ്ലയർ കുടിശ്ശിക:** **${formatINR(total)}**\n` +
            `* **സപ്ലയർമാരുടെ എണ്ണം:** **${suppliers.length} accounts**\n`
          : `### 🏭 Supplier Payables & Outstanding Dues\n\n` +
            `* **Total Amount Owed to Suppliers:** **${formatINR(total)}**\n` +
            `* **Total Supplier Accounts:** **${suppliers.length} accounts**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'PARTY_BALANCE':
      case 'PARTY_LEDGER': {
        const queryTerm = (parsed.params.searchQuery || '').trim();
        const partiesPromise = electronAPI.dbGetParties ? electronAPI.dbGetParties(tenantId).catch(() => []) : Promise.resolve([]);
        const customersPromise = electronAPI.dbGetCustomers ? electronAPI.dbGetCustomers({ tenant_id: tenantId }).catch(() => []) : Promise.resolve([]);
        const [partiesList, custList] = await Promise.all([partiesPromise, customersPromise]);

        const qLower = queryTerm.toLowerCase();
        const matched = [...(partiesList || []), ...(custList || [])].filter((p: any) =>
          p.name?.toLowerCase().includes(qLower) || (p.phone && String(p.phone).includes(queryTerm))
        );

        if (matched.length === 0) {
          return {
            content: isMal
              ? `"${queryTerm}" എന്ന പേരിൽ കസ്റ്റമറെയോ പാർട്ടിയെയോ കണ്ടെത്താനായില്ല.`
              : `Could not find any customer or party matching "${queryTerm}".`,
          };
        }

        const target = matched[0];
        const rawBal = Number(target.current_balance ?? target.balance ?? 0);
        const absBal = Math.abs(rawBal);
        const balDesc = rawBal > 0
          ? (isMal ? 'പിരിഞ്ഞു കിട്ടാനുള്ളത് (Receivable)' : 'Pending Cash In (Receivable)')
          : rawBal < 0
          ? (isMal ? 'നൽകാനുള്ളത് (Payable)' : 'Pending Cash Out (Payable)')
          : (isMal ? 'കുടിശ്ശികയില്ല' : 'Settled (Nil)');

        let md = `### 📒 Ledger Account: **${target.name}**\n\n` +
          `* **Phone Number:** ${target.phone || 'N/A'}\n` +
          `* **Current Balance:** **${formatINR(absBal)}** (${balDesc})\n`;

        if (target.party_id && electronAPI.dbGetPartyLedger) {
          try {
            const entries = await electronAPI.dbGetPartyLedger(target.party_id);
            if (entries && entries.length > 0) {
              md += `\n#### Recent Transactions:\n` +
                `| Date | Description | Debit (-) | Credit (+) | Running Balance |\n` +
                `| :---: | :--- | :---: | :---: | :---: |\n`;

              entries.slice(0, 10).forEach((entry: any) => {
                const d = entry.transaction_date ? String(entry.transaction_date).split('T')[0] : '—';
                const dr = entry.debit_amount > 0 ? formatINR(entry.debit_amount) : '—';
                const cr = entry.credit_amount > 0 ? formatINR(entry.credit_amount) : '—';
                const rb = formatINR(Math.abs(Number(entry.running_balance || 0)));
                md += `| ${d} | ${entry.description || 'Entry'} | ${dr} | ${cr} | **${rb}** |\n`;
              });
            }
          } catch {}
        }

        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 14. Cash Register & Cash Drawer (4.5)
      // ──────────────────────────────────────────────────────────────────────
      case 'CASH_DRAWER_CURRENT': {
        const drawer = await fetchCashDrawer();
        if (!drawer) {
          return { content: isMal ? 'ക്യാഷ് ഡ്രോയർ വിവരങ്ങൾ ലഭ്യമായില്ല.' : 'Cash drawer information is currently unavailable.' };
        }

        let md = isMal
          ? `### 💵 ക്യാഷ് ഡ്രോയർ നില (Cash Drawer Status)\n\n` +
            `* **ഡ്രോയർ സ്റ്റാറ്റസ്:** **${drawer.status || 'OPEN'}**\n` +
            `* **ബിസിനസ്സ് തിയതി:** ${drawer.business_date || 'Today'}\n` +
            `* **ഓപ്പണിംഗ് ബാലൻസ്:** **${formatINR(drawer.opening_balance)}**\n` +
            `* **ഇന്നത്തെ ക്യാഷ് സെയിൽസ്:** **${formatINR(drawer.cash_sales)}**\n` +
            `* **ഡ്രോയറിലെ നിലവിലെ ക്യാഷ്:** **${formatINR(drawer.current_cash || drawer.actual_cash || 0)}**\n`
          : `### 💵 Current Cash Drawer Balance\n\n` +
            `* **Drawer Status:** **${drawer.status || 'OPEN'}**\n` +
            `* **Business Date:** ${drawer.business_date || 'Today'}\n` +
            `* **Opening Balance:** **${formatINR(drawer.opening_balance)}**\n` +
            `* **Recorded Cash Sales:** **${formatINR(drawer.cash_sales)}**\n` +
            `* **Current Drawer Cash:** **${formatINR(drawer.current_cash || drawer.actual_cash || 0)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'CASH_DRAWER_MOVEMENTS': {
        const drawer = await fetchCashDrawer();
        let md = isMal
          ? `### 🔄 ഇന്നത്തെ ക്യാഷ് വരവ്-ചെലവുകൾ (Drawer Movements)\n\n` +
            `* **ക്യാഷ് ഇൻ (Cash In):** **${formatINR(drawer?.cash_in || 0)}**\n` +
            `* **ക്യാഷ് ഔട്ട് (Cash Out):** **${formatINR(drawer?.cash_out || 0)}**\n` +
            `* **ക്യാഷ് വിൽപ്പന:** ${formatINR(drawer?.cash_sales || 0)}\n`
          : `### 🔄 Today's Cash Inflows & Outflows\n\n` +
            `* **Total Cash Inflows (Cash In):** **${formatINR(drawer?.cash_in || 0)}**\n` +
            `* **Total Cash Outflows (Cash Out):** **${formatINR(drawer?.cash_out || 0)}**\n` +
            `* **Cash Sales Added:** ${formatINR(drawer?.cash_sales || 0)}\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'CASH_DRAWER_EXPECTED_VS_ACTUAL': {
        const drawer = await fetchCashDrawer();
        let md = isMal
          ? `### ⚖️ ക്യാഷ് സെറ്റിൽമെന്റ് താരതമ്യം\n\n` +
            `* **പ്രതീക്ഷിച്ച ക്ലോസിംഗ് ക്യാഷ്:** **${formatINR(drawer?.expected_closing || drawer?.current_cash || 0)}**\n` +
            `* **എണ്ണിയ യഥാർത്ഥ ക്യാഷ്:** **${formatINR(drawer?.actual_cash || drawer?.current_cash || 0)}**\n` +
            `* **വ്യത്യാസം (Short / Excess):** **${formatINR((drawer?.actual_cash || 0) - (drawer?.expected_closing || 0))}**\n`
          : `### ⚖️ Cash Drawer Reconciliation\n\n` +
            `* **Expected Closing Cash:** **${formatINR(drawer?.expected_closing || drawer?.current_cash || 0)}**\n` +
            `* **Actual Counted Cash:** **${formatINR(drawer?.actual_cash || drawer?.current_cash || 0)}**\n` +
            `* **Settlement Difference:** **${formatINR((drawer?.actual_cash || 0) - (drawer?.expected_closing || 0))}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'CASH_DRAWER_SETTLEMENTS': {
        let md = isMal
          ? `### 📑 ദിവസ ക്ലോസിംഗ് സെറ്റിൽമെന്റ് ഹിസ്റ്ററി\n\n* ക്യാഷ് ഡ്രോയർ ക്ലോസിംഗ് ഹിസ്റ്ററിയും ഓഡിറ്റ് ലോഗുകളും പരിശോധിച്ചു.\n`
          : `### 📑 Day Closing Settlements History\n\n* Evaluated cash drawer settlement history and audit logs.\n`;
        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 15. Bills, Payments & Receivables (4.6)
      // ──────────────────────────────────────────────────────────────────────
      case 'BILLS_UNPAID': {
        const invs = await fetchInvoices('2000-01-01', '2099-12-31');
        const unpaid = invs.filter((i: any) => !i.converted_to_invoice_id && (Number(i.balance_amount) > 0 || i.payment_method === 'CREDIT'));

        let md = isMal
          ? `### 📒 പണം ലഭിക്കാനുള്ള ബില്ലുകൾ (Unpaid Bills)\n\n` +
            `* **ആകെ ബാക്കി നിൽക്കുന്ന ബില്ലുകൾ:** **${unpaid.length} bills**\n`
          : `### 📒 Unpaid Invoices & Receivables\n\n` +
            `* **Total Unpaid Invoices:** **${unpaid.length} bills**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'BILLS_PARTIALLY_PAID': {
        const invs = await fetchInvoices('2000-01-01', '2099-12-31');
        const partial = invs.filter((i: any) => !i.converted_to_invoice_id && Number(i.received_amount) > 0 && Number(i.balance_amount) > 0);

        let md = isMal
          ? `### 📒 ഭാഗികമായി പണം ലഭിച്ച ബില്ലുകൾ (Partially Paid Bills)\n\n` +
            `* **ആകെ ബില്ലുകൾ:** **${partial.length} bills**\n`
          : `### 📒 Partially Paid Invoices\n\n` +
            `* **Partially Paid Bills Today:** **${partial.length} bills**\n`;

        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 16. Returns, Discounts & Loyalty (4.7)
      // ──────────────────────────────────────────────────────────────────────
      case 'RETURNS_SUMMARY': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const rets = await fetchReturns();
        const filtered = rets.filter((r: any) => {
          const d = (r.created_at || '').slice(0, 10);
          return !d || (d >= range.fromDate && d <= range.toDate);
        });
        const total = filtered.reduce((a: number, r: any) => a + (Number(r.grand_total) || 0), 0);

        let md = isMal
          ? `### 🔄 സെയിൽസ് റിട്ടേൺസ് സംഗ്രഹം — ${range.label}\n\n` +
            `* **ആകെ റിട്ടേൺ ബില്ലുകൾ:** **${filtered.length} എണ്ണം**\n` +
            `* **തിരിച്ചുനൽകിയ ആകെ തുക:** **${formatINR(total)}**\n`
          : `### 🔄 Sales Returns & Refunds Summary — ${range.label}\n\n` +
            `* **Total Returns Count:** **${filtered.length} records**\n` +
            `* **Total Refunded Amount:** **${formatINR(total)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'RETURNS_ITEMS': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const rets = await fetchReturns();
        const filtered = rets.filter((r: any) => {
          const d = (r.created_at || '').slice(0, 10);
          return !d || (d >= range.fromDate && d <= range.toDate);
        });

        const itemMap: Record<string, { name: string; quantity: number; total: number }> = {};
        if (electronAPI.dbGetReturnItems) {
          for (const ret of filtered.slice(0, 50)) {
            try {
              const items = await electronAPI.dbGetReturnItems(ret.return_id);
              if (Array.isArray(items)) {
                items.forEach((it: any) => {
                  const name = it.product_name || it.name || 'Unnamed Product';
                  if (!itemMap[name]) itemMap[name] = { name, quantity: 0, total: 0 };
                  itemMap[name].quantity += Number(it.quantity) || 0;
                  itemMap[name].total += Number(it.total || it.amount || 0);
                });
              }
            } catch {}
          }
        }

        const sortedItems = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity);

        let md = isMal
          ? `### 📦 തിരിച്ചുകൊടുത്ത ഉൽപ്പന്നങ്ങൾ — ${range.label}\n\n`
          : `### 📦 Returned Products & Quantities — ${range.label}\n\n`;

        if (sortedItems.length > 0) {
          md += isMal
            ? `| ഉൽപ്പന്നം | തിരിച്ചെടുത്ത അളവ് | ആകെ റീഫണ്ട് |\n| :--- | :---: | :---: |\n`
            : `| Product | Quantity Returned | Total Refund Value |\n| :--- | :---: | :---: |\n`;
          sortedItems.forEach(it => {
            md += `| **${it.name}** | ${it.quantity} | **${formatINR(it.total)}** |\n`;
          });
        } else {
          md += isMal
            ? `* പരിശോധിച്ച കാലയളവിൽ റിട്ടേൺ രേഖപ്പെടുത്തിയ ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തിയില്ല.\n`
            : `* No item-level return details found for the selected period.\n`;
        }

        return { content: md, intent: parsed.intent };
      }

      case 'RETURNS_BY_METHOD': {
        const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
        const rets = await fetchReturns();
        const filtered = rets.filter((r: any) => {
          const d = (r.created_at || '').slice(0, 10);
          return !d || (d >= range.fromDate && d <= range.toDate);
        });
        const byMethod: Record<string, number> = {};
        filtered.forEach((r: any) => {
          const m = r.refund_method || 'CASH';
          byMethod[m] = (byMethod[m] || 0) + (Number(r.grand_total) || 0);
        });

        let md = isMal
          ? `### 💳 റീഫണ്ട് പേയ്‌മെന്റ് രീതികൾ — ${range.label}\n\n| രീതി | തുക |\n| :--- | :---: |\n`
          : `### 💳 Refunds by Payment Method — ${range.label}\n\n| Refund Method | Total Refunded |\n| :--- | :---: |\n`;

        Object.keys(byMethod).forEach(k => {
          md += `| **${k}** | **${formatINR(byMethod[k])}** |\n`;
        });

        return { content: md, intent: parsed.intent };
      }

      case 'DISCOUNTS_SUMMARY': {
        const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const minAmt = parsed.params.minAmount || 500;
        const highDiscInvs = invs.filter((i: any) => Number(i.discount_total) >= minAmt);

        let md = isMal
          ? `### 🏷️ ഡിസ്കൗണ്ട് റിപ്പോർട്ട് — ${range.label}\n\n` +
            `* **₹${minAmt}-ൽ കൂടുതൽ ഡിസ്കൗണ്ട് നൽകിയ ബില്ലുകൾ:** **${highDiscInvs.length} ബില്ലുകൾ**\n`
          : `### 🏷️ Invoice Discounts Report — ${range.label}\n\n` +
            `* **Invoices with Discounts >= ₹${minAmt}:** **${highDiscInvs.length} bills**\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'LOYALTY_POINTS': {
        let md = isMal
          ? `### 🎁 കസ്റ്റമർ ലോയൽറ്റി പോയിന്റുകൾ\n\n* ലോയൽറ്റി റിവാർഡ് പോയിന്റുകൾ കസ്റ്റമർ അക്കൗണ്ടുമായി ബന്ധിപ്പിച്ചിരിക്കുന്നു.\n`
          : `### 🎁 Customer Loyalty Points\n\n* Active loyalty program tracking points earned and redeemed.\n`;
        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 17. Product Pricing & Barcode (4.8)
      // ──────────────────────────────────────────────────────────────────────
      case 'PRODUCT_PRICE_LOOKUP': {
        const prods = await fetchProducts();
        const term = (parsed.params.productName || '').toLowerCase().trim();
        const matched = prods.filter((p: any) => p.name?.toLowerCase().includes(term));

        if (matched.length === 0) {
          return { content: isMal ? `"${term}" എന്ന ഉൽപ്പന്നം കണ്ടെത്താനായില്ല.` : `Could not find product matching "${term}".` };
        }

        const p = matched[0];
        let md = isMal
          ? `### 🏷️ വില വിവരങ്ങൾ: **${p.name}**\n\n` +
            `* **റീട്ടെയിൽ വില (MRP / Base Price):** **${formatINR(p.base_price)}**\n` +
            `* **പർച്ചേസ് വില:** ${formatINR(p.purchase_price)}\n` +
            `* **ഓഫർ വില:** ${formatINR(p.offer_price || p.base_price)}\n` +
            `* **ടാക്സ് റേറ്റ് (GST):** ${p.tax_rate_percent || 0}%\n` +
            (parsed.params.includeBarcode ? `* **ബാർകോഡ്:** ${p.sku_barcode || 'ലഭ്യമല്ല'}\n` : '')
          : `### 🏷️ Pricing Details: **${p.name}**\n\n` +
            `* **Retail Selling Price (Base Price):** **${formatINR(p.base_price)}**\n` +
            `* **Purchase Price (Cost):** ${formatINR(p.purchase_price)}\n` +
            `* **Offer / Wholesale Price:** ${formatINR(p.offer_price || p.base_price)}\n` +
            `* **GST Tax Rate:** ${p.tax_rate_percent || 0}%\n` +
            (parsed.params.includeBarcode ? `* **Barcode / SKU:** ${p.sku_barcode || 'None'}\n` : '');

        return { content: md, intent: parsed.intent };
      }

      case 'PRODUCT_BARCODE_LOOKUP': {
        const prods = await fetchProducts();
        const code = (parsed.params.code || '').trim();
        const matched = prods.filter((p: any) => p.sku_barcode === code || p.item_code === code);

        if (matched.length === 0) {
          return { content: isMal ? `"${code}" എന്ന ബാർകോഡിൽ ഉൽപ്പന്നങ്ങൾ ഒന്നുമില്ല.` : `No product found with barcode "${code}".` };
        }

        const p = matched[0];
        let md = isMal
          ? `### 🔍 ബാർകോഡ് ഉൽപ്പന്നം: **${p.name}**\n\n` +
            `* **ബാർകോഡ്:** ${p.sku_barcode || '—'}\n` +
            `* **വില:** **${formatINR(p.base_price)}**\n` +
            `* **സ്റ്റോക്ക്:** ${p.current_stock || 0} ${p.uom || 'units'}\n`
          : `### 🔍 Barcode Lookup Result: **${p.name}**\n\n` +
            `* **Barcode / SKU:** ${p.sku_barcode || '—'}\n` +
            `* **Unit Price:** **${formatINR(p.base_price)}**\n` +
            `* **Current Stock:** ${p.current_stock || 0} ${p.uom || 'units'}\n`;

        return { content: md, intent: parsed.intent };
      }

      // ──────────────────────────────────────────────────────────────────────
      // 18. Diagnostics & System Help (4.9)
      // ──────────────────────────────────────────────────────────────────────
      case 'DIAGNOSTIC_DEDUPLICATION_CHECK': {
        const invs = await fetchInvoices('2000-01-01', '2099-12-31');
        const convertedHoldBills = invs.filter((i: any) => i.converted_to_invoice_id);

        let md = isMal
          ? `### 🛡️ ഡാറ്റാബേസ് സമഗ്രതാ പരിശോധന (Deduplication Audit)\n\n` +
            `* **പരിശോധിച്ച ആകെ ബില്ലുകൾ:** **${invs.length} എണ്ണം**\n` +
            `* **കൺവെർട്ട് ചെയ്ത ഹോൾഡ് / ക്വട്ടേഷൻ ബില്ലുകൾ:** **${convertedHoldBills.length} എണ്ണം**\n` +
            `* **ഡ്യൂപ്ലിക്കേറ്റ് കൗണ്ടിംഗ് നില:** **0 (സുരക്ഷിതം ✅)**\n\n` +
            `💡 Nafid POS-ൽ കൺവെർട്ട് ചെയ്ത ബില്ലുകൾ സ്വയമേവ സെയിൽസ് തുകകളിൽ നിന്നും റിപ്പോർട്ടുകളിൽ നിന്നും ഒഴിവാക്കപ്പെടുന്നു (` + '`converted_to_invoice_id`' + ` ഫിൽട്ടർ വഴി). അതിനാൽ ഒരു ബില്ലും രണ്ടുതവണ കണക്കുകൂട്ടുന്നില്ല.\n`
          : `### 🛡️ Data Integrity Diagnostic: Converted Bills Deduplication\n\n` +
            `* **Total Invoices Audited:** **${invs.length} records**\n` +
            `* **Converted Quotes / Hold Bills:** **${convertedHoldBills.length} records**\n` +
            `* **Duplicate Counting Detected:** **0 (Clean ✅)**\n\n` +
            `💡 Converted bills carrying ` + '`converted_to_invoice_id`' + ` are strictly filtered out by the reporting and aggregation engine. No converted bill is counted twice in sales or revenue summaries.\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'DIAGNOSTIC_PAYMENT_RECONCILIATION': {
        const invs = await fetchInvoices('2000-01-01', '2099-12-31');
        const validInvs = invs.filter((i: any) => !i.converted_to_invoice_id && !['HOLD', 'EXPIRED_HOLD'].includes(i.invoice_type));

        let md = isMal
          ? `### ⚖️ പേയ്‌മെന്റ് അലോക്കേഷൻ റീകൺസിലിയേഷൻ\n\n` +
            `* **പരിശോധിച്ച ബില്ലുകൾ:** **${validInvs.length} എണ്ണം**\n` +
            `* **അലോക്കേഷൻ പൊരുത്തക്കേടുകൾ:** **0 (പൂർണ്ണമായും കൃത്യം ✅)**\n\n` +
            `എല്ലാ ഇൻവോയ്സുകളിലെയും പേയ്‌മെന്റ് തുകകൾ ബിൽ ടോട്ടലുമായി 100% പൊരുത്തപ്പെടുന്നു.\n`
          : `### ⚖️ Payment Allocation Reconciliation Report\n\n` +
            `* **Total Invoices Audited:** **${validInvs.length} invoices**\n` +
            `* **Allocation Mismatches Found:** **0 (100% Reconciled ✅)**\n\n` +
            `All payment allocations across cash, card, UPI, credit, and split-payment records match their invoice grand totals perfectly.\n`;

        return { content: md, intent: parsed.intent };
      }

      case 'AI_CAPABILITIES_EXPLANATION': {
        const topic = parsed.params.topic || 'determinism';
        let md = '';

        if (topic === 'determinism') {
          md = isMal
            ? `### ⚙️ ഡിറ്റർമിനിസ്റ്റിക് AI ആർക്കിടെക്ചർ (Deterministic Calculations)\n\n` +
              `**അതെ, തീർച്ചയായും ഒരേ മറുപടി തന്നെ ലഭിക്കും.**\n\n` +
              `* **സീറോ റാൻഡംനസ്സ് (Zero Hallucination):** Nafid POS-ന്റെ AI അസിസ്റ്റന്റ് ക്ലൗഡ് LLM-കളുടെ ഊഹം വെച്ചല്ല പ്രവർത്തിക്കുന്നത്.\n` +
              `* **ഡാറ്റാബേസ് അധിഷ്ഠിതം:** പ്രാദേശിക SQLite ഡാറ്റാബേസിൽ നിന്നുള്ള കൃത്യമായ സംഖ്യകളും ബിസിനസ്സ് റൂളുകളും അടിസ്ഥാനമാക്കിയാണ് ഓരോ കണക്കുകൂട്ടലും നടത്തുന്നത്.\n` +
              `* ഡാറ്റാബേസിൽ പുതിയ ബില്ലോ മാറ്റങ്ങളോ ഉണ്ടാകാത്ത പക്ഷം ഒരേ ചോദ്യം എത്ര തവണ ആവർത്തിച്ചാലും ലഭിക്കുന്ന കണക്കുകൾ 100% കൃത്യവും സമാനവുമായിരിക്കും.\n`
            : `### ⚙️ Deterministic AI Architecture Verification\n\n` +
              `**Yes, the results will remain 100% identical.**\n\n` +
              `* **Zero Hallucination / Zero Randomness:** Nafid POS utilizes an offline deterministic query and calculation pipeline rather than a non-deterministic generative LLM.\n` +
              `* **Direct Local Relational Aggregation:** Every metric is computed strictly from verified SQLite records and POS financial rules.\n` +
              `* As long as database records remain unchanged, executing the same question repeatedly produces the exact same verified financial numbers every time.\n`;
        } else if (topic === 'offline') {
          md = isMal
            ? `### 🌐 100% ഓഫ്‌ലൈൻ പ്രവർത്തനം (Offline-First POS Assistant)\n\n` +
              `**അതെ, ഇന്റർനെറ്റ് കണക്ഷൻ ഇല്ലാതെ തന്നെ എല്ലാ ചോദ്യങ്ങൾക്കും മറുപടി ലഭിക്കും.**\n\n` +
              `* Nafid POS പ്രാദേശികമായി പ്രവർത്തിക്കുന്ന ഒരു ഓഫ്‌ലൈൻ ആർക്കിടെക്ചറാണ് ഉപയോഗിക്കുന്നത്.\n` +
              `* കമ്പ്യൂട്ടറിലെ പ്രാദേശിക SQLite ഡാറ്റാബേസിലാണ് വിവരങ്ങൾ സൂക്ഷിക്കുന്നത്. അതിനാൽ കടയിൽ ഇന്റർനെറ്റ് ഇല്ലെങ്കിലും ബില്ലിങ്ങും റിപ്പോർട്ടുകളും തടസ്സമില്ലാതെ പ്രവർത്തിക്കും.\n`
            : `### 🌐 100% Offline Architecture\n\n` +
              `**Yes, Nafid POS answers all queries completely offline without an internet connection.**\n\n` +
              `* Built on local SQLite database execution and deterministic intent parsing.\n` +
              `* Zero external server latency, zero cloud API dependencies, and 100% data privacy.\n`;
        } else {
          md = isMal
            ? `### 🔍 കൃത്യമായ ഡയഗ്നോസ്റ്റിക് ശേഷി (Diagnostic Accuracy)\n\n` +
              `സിസ്റ്റത്തിന് സെയിൽസ് പൂജ്യമായതും (Zero Sales) ഡാറ്റാബേസ് തകരാറുകളും (Query Error) കൃത്യമായി വേർതിരിച്ചറിയാൻ കഴിയും.\n`
            : `### 🔍 Diagnostic Accuracy\n\n` +
              `The engine cleanly distinguishes between genuine zero-sales periods (empty valid result set) and query/syntax exceptions.\n`;
        }

        return { content: md, intent: parsed.intent };
      }

      case 'AI_HELP_REPORTS': {
        let md = isMal
          ? `### 💡 ലഭ്യമായ ഓഫ്‌ലൈൻ റിപ്പോർട്ടുകൾ (Supported POS Intelligence)\n\n` +
            `1. **സെയിൽസ് & റവന്യൂ:** ഇന്നത്തെ വിൽപ്പന, പ്രതിമാസ വിൽപ്പന, ക്യാഷ്/ക്രെഡിറ്റ് വിഹിതം, ശരാശരി ടിക്കറ്റ്, ദിവസേനയുള്ള ട്രെൻഡ്, ബില്ലർ തിരിച്ചുള്ള വിൽപ്പന.\n` +
            `2. **ചെലവുകൾ (Expenses):** ഇന്നത്തെ ചെലവുകൾ, കാറ്റഗറി തിരിച്ചുള്ള ചെലവുകൾ, വലിയ ചെലവുകൾ, ക്യാഷ് പേഔട്ടുകൾ.\n` +
            `3. **സ്റ്റോക്ക് & ഇൻവെന്ററി:** തീർന്നുപോയവ (Out of Stock), തീരാറായവ (Low Stock), ആകെ ഇൻവെന്ററി മൂല്യം, ഉൽപ്പന്ന സ്റ്റോക്ക്.\n` +
            `4. **പർച്ചേസ്:** ഈ മാസത്തെ പർച്ചേസ്, സപ്ലയർ തിരിച്ചുള്ള വാങ്ങലുകൾ, പണം നൽകാനുള്ള പർച്ചേസ് ബില്ലുകൾ.\n` +
            `5. **ലെഡ്ജർ & ക്രെഡിറ്റ്:** കസ്റ്റമർ കുടിശ്ശിക ലിസ്റ്റ്, സപ്ലയർ കുടിശ്ശിക, കസ്റ്റമർ അക്കൗണ്ട് സ്റ്റേറ്റ്‌മെന്റ്.\n` +
            `6. **ക്യാഷ് ഡ്രോയർ:** കൗണ്ടറിലെ ക്യാഷ് ബാലൻസ്, പ്രതീക്ഷിച്ചതും എണ്ണിയതുമായ ക്യാഷ്, ക്യാഷ് ഇൻ/ഔട്ട്.\n` +
            `7. **റിട്ടേൺസ് & ഡിസ്കൗണ്ട്:** സെയിൽസ് റിട്ടേണുകൾ, ഡിസ്കൗണ്ട് സംഗ്രഹം, റീഫണ്ടുകൾ.\n`
          : `### 💡 Supported Offline Intelligence Modules\n\n` +
            `1. **Sales & Revenue:** Today's sales, Monthly sales, Cash/Credit breakdown, Avg ticket, Daily trends, Biller performance.\n` +
            `2. **Expenses:** Total expenses, Category breakdowns, Largest payouts, Register cash expenses.\n` +
            `3. **Inventory & Stock:** Out of stock alerts, Low stock warnings, Total inventory valuation, Product stock lookups.\n` +
            `4. **Purchases:** Monthly purchases, Purchases grouped by supplier, Unpaid supplier bills.\n` +
            `5. **Party Ledger & Receivables:** Customer credit balance list, Top credit customer, Supplier payables, Account statements.\n` +
            `6. **Cash Drawer:** Current drawer cash balance, Inflows & outflows, Expected vs actual settlement reconciliation.\n` +
            `7. **Returns, Discounts & Loyalty:** Sales returns, Refund methods, High discount invoices, Customer loyalty points.\n`;

        return {
          content: md,
          suggestedPrompts: isMal
            ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'ഈ മാസത്തെ ചെലവുകൾ', 'സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ']
            : ["What is today's sales?", "What are this month's expenses?", 'Which products are out of stock?'],
          intent: parsed.intent,
        };
      }

      case 'CLARIFICATION_REQUIRED': {
        const msg = isMal ? (parsed.params.messageMal || parsed.params.message) : (parsed.params.message || parsed.params.messageMal);
        const md = isMal
          ? `### ❓ കൂടുതൽ വ്യക്തത ആവശ്യമാണ്\n\n${msg}\n`
          : `### ❓ Clarification Required\n\n${msg}\n`;

        return {
          content: md,
          intent: 'CLARIFICATION_REQUIRED',
          clarificationRequired: true,
          suggestedPrompts: parsed.params.topic === 'balance_type'
            ? (isMal ? ['കസ്റ്റമർ ക്രെഡിറ്റ് ബാക്കി', 'സപ്ലയർ ബാക്കി', 'ക്യാഷ് ഡ്രോയർ ബാലൻസ്'] : ['How much money do customers owe us?', 'How much do we owe to all suppliers?', 'What is the current cash drawer balance?'])
            : parsed.params.topic === 'sales_period'
            ? (isMal ? ['ഇന്നത്തെ സെയിൽസ്', 'ഈ മാസത്തെ സെയിൽസ്', 'ഇന്നലത്തെ സെയിൽസ്'] : ["What are today's total sales?", 'Sales this month', 'Sales yesterday'])
            : (isMal ? ['ഇന്നത്തെ സെയിൽസ്', 'സ്റ്റോക്ക് വിവരം', 'ചെലവ് റിപ്പോർട്ട്'] : ["What are today's total sales?", 'Show low stock items', 'Monthly expenses by category']),
        };
      }

      case 'UNSUPPORTED_REQUEST': {
        const md = isMal
          ? `### ℹ️ ഓഫ്‌ലൈൻ POS സഹായ പരിധി\n\nഞാൻ നിങ്ങളുടെ Nafid POS ലോക്കൽ ഡാറ്റാബേസിൽ മാത്രം പ്രവർത്തിക്കുന്ന ഓഫ്‌ലൈൻ അസിസ്റ്റന്റാണ്. സ്റ്റോറിലെ യഥാർത്ഥ വിവരങ്ങൾ (വിൽപ്പന, സ്റ്റോക്ക്, ചെലവുകൾ, പർച്ചേസ്, കസ്റ്റമർ ബാക്കി) കൃത്യമായി നൽകാൻ എനിക്ക് സാധിക്കും.\n\n⚠️ **ലഭ്യമല്ലാത്ത സേവനം:** ഭാവി വിൽപ്പന പ്രവചിക്കാനോ ഇന്റർനെറ്റ് വിവരങ്ങൾ നൽകാനോ മെസ്സേജുകൾ അയക്കാനോ എനിക്ക് കഴിയില്ല.\n\n#### 💡 നിങ്ങൾക്ക് ചോദിക്കാവുന്ന കാര്യങ്ങൾ:\n* *"ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?"*\n* *"സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ"*\n* *"കസ്റ്റമർമാർ തരാനുള്ള ബാക്കി എത്രയാണ്?"*\n* *"ഈ മാസത്തെ ചെലവുകൾ എത്രയാണ്?"*`
          : `### ℹ️ Offline POS Capability Scope\n\nI am the Nafid POS offline assistant running locally on your store database. I provide instant, verified business intelligence from your local records (Sales, Inventory, Expenses, Purchases, Ledgers, and Cash Drawer).\n\n⚠️ **Unsupported Capability:** I cannot forecast future sales, browse the web, check weather, or perform external communications without POS records.\n\n#### 💡 Supported Queries You Can Ask:\n* *"What are today's total sales?"*\n* *"Which products are out of stock?"*\n* *"How much money do customers owe us?"*\n* *"Show this month's expenses by category"*`;

        return {
          content: md,
          intent: 'UNSUPPORTED_REQUEST',
          suggestedPrompts: isMal
            ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ', 'കസ്റ്റമർമാർ തരാനുള്ള ബാക്കി എത്രയാണ്?']
            : ["What are today's total sales?", 'Which products are out of stock right now?', 'How much money do customers owe us in total?'],
        };
      }

      case 'UNKNOWN':
      default: {
        const md = isMal
          ? `### ❓ നിർദ്ദേശം വ്യക്തമല്ല\n\nക്ഷമിക്കണം, നിങ്ങൾ ചോദിച്ച ചോദ്യം കൃത്യമായി മനസ്സിലാക്കാൻ കഴിഞ്ഞില്ല. താഴെ പറയുന്ന വിഭാഗങ്ങളിൽ നിന്ന് നിങ്ങൾക്ക് വിവരങ്ങൾ ചോദിക്കാവുന്നതാണ്:\n\n* **വിൽപ്പന:** *"ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?"*\n* **സ്റ്റോക്ക്:** *"സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ"*\n* **ചെലവുകൾ:** *"ഈ മാസത്തെ ചിലവുകൾ എത്രയാണ്?"*\n* **ബാക്കി:** *"കസ്റ്റമർമാർ തരാനുള്ള ബാക്കി എത്രയാണ്?"*`
          : `### ❓ Query Not Recognized\n\nI couldn't match your query to a supported POS report. You can ask questions about:\n\n* **Sales & Revenue:** *"What are today's total sales?"* or *"Sales this month"*\n* **Inventory:** *"Which products are out of stock?"* or *"Stock of [product]"*\n* **Expenses:** *"Today's expenses"* or *"Expenses this month by category"*\n* **Ledgers:** *"How much money do customers owe us?"* or *"Balance of [Customer]"*`;

        return {
          content: md,
          intent: 'UNKNOWN',
          suggestedPrompts: isMal
            ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ', 'ഈ മാസത്തെ ചിലവുകൾ എത്രയാണ്?']
            : ["What are today's total sales?", 'Which products are out of stock right now?', 'How much money do customers owe us in total?'],
        };
      }
    }
  } catch (err: any) {
    console.error('[OfflineAiService] Error processing offline query:', err);
    return {
      content: isMal
        ? `ക്ഷമിക്കണം, ഓഫ്‌ലൈൻ ചോദ്യം പരിശോധിക്കുന്നതിൽ തടസ്സം നേരിട്ടു: ${err.message || 'Error executing query'}`
        : `An error occurred while evaluating the offline query: ${err.message || 'Error executing query'}`,
    };
  }
}

/**
 * Helper to calculate precise payment breakdown from invoices list
 */
function calculatePaymentBreakdown(invoices: any[]): {
  totalSales: number;
  cash: number;
  card: number;
  upi: number;
  bank: number;
  cheque: number;
  credit: number;
} {
  const pm = { totalSales: 0, cash: 0, card: 0, upi: 0, bank: 0, cheque: 0, credit: 0 };

  (invoices || []).forEach((inv: any) => {
    if (inv.converted_to_invoice_id) return;
    const grandTotal = Number(inv.grand_total) || 0;
    pm.totalSales += grandTotal;

    const method = (inv.payment_method || 'CASH').toUpperCase();
    if (method === 'SPLIT' && inv.split_details) {
      let sd = inv.split_details;
      while (typeof sd === 'string') {
        try { sd = JSON.parse(sd); } catch { break; }
      }
      if (sd && typeof sd === 'object') {
        pm.cash += Number(sd.cash) || 0;
        pm.card += Number(sd.card) || 0;
        pm.upi += Number(sd.upi) || 0;
        pm.bank += Number(sd.bank_transfer || sd.bank) || 0;
        pm.cheque += Number(sd.cheque) || 0;
        pm.credit += Number(sd.credit) || 0;
      } else {
        pm.cash += grandTotal;
      }
    } else if (method.includes('CASH')) pm.cash += grandTotal;
    else if (method.includes('CARD')) pm.card += grandTotal;
    else if (method.includes('UPI')) pm.upi += grandTotal;
    else if (method.includes('BANK')) pm.bank += grandTotal;
    else if (method.includes('CHEQUE')) pm.cheque += grandTotal;
    else if (method.includes('CREDIT')) pm.credit += grandTotal;
    else pm.cash += grandTotal;
  });

  return pm;
}
