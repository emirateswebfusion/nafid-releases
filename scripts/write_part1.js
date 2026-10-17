const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/services/offlineAiService.ts');

const parts = [];

// Part 1: Header, Types, Registry
parts.push(`/**
 * Nafid POS Offline AI Assistant — Complete Unified Intelligence Engine
 * 100% Offline-First, Zero External API Dependency, Deterministic Local Database Execution.
 * Fully supports English, Malayalam (\\u0D00-\\u0D7F), and Manglish queries across all POS modules:
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
  return /[\\u0D00-\\u0D7F]/.test(text || '');
}

export const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Stage A: Input Normalization Pipeline
 */
export function normalizeInput(text: string): string {
  if (!text) return '';
  let str = text.toLowerCase().trim();
  str = str.replace(/\\s+/g, ' ');
  str = str.replace(/[?!.]+$|[.,]+$/g, '');
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

  const todayStr = \`\${year}-\${pad(month + 1)}-\${pad(day)}\`;

  if (type === 'today') {
    return { fromDate: todayStr, toDate: todayStr, label: isMal ? 'ഇന്ന് (Today)' : 'Today', daysCount: 1 };
  }

  if (type === 'yesterday') {
    const yDate = new Date(year, month, day - 1);
    const yStr = \`\${yDate.getFullYear()}-\${pad(yDate.getMonth() + 1)}-\${pad(yDate.getDate())}\`;
    return { fromDate: yStr, toDate: yStr, label: isMal ? 'ഇന്നലെ (Yesterday)' : 'Yesterday', daysCount: 1 };
  }

  if (type === 'this_week') {
    const dayOfWeek = now.getDay(); // 0 = Sun
    const diffToMonday = day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const mon = new Date(year, month, diffToMonday);
    const monStr = \`\${mon.getFullYear()}-\${pad(mon.getMonth() + 1)}-\${pad(mon.getDate())}\`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - mon.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: monStr, toDate: todayStr, label: isMal ? 'ഈ ആഴ്ച (This Week)' : 'This Week', daysCount: daysElapsed };
  }

  if (type === 'last_week') {
    const dayOfWeek = now.getDay();
    const diffToLastMonday = day - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1);
    const lastMon = new Date(year, month, diffToLastMonday);
    const lastSun = new Date(year, month, diffToLastMonday + 6);
    const monStr = \`\${lastMon.getFullYear()}-\${pad(lastMon.getMonth() + 1)}-\${pad(lastMon.getDate())}\`;
    const sunStr = \`\${lastSun.getFullYear()}-\${pad(lastSun.getMonth() + 1)}-\${pad(lastSun.getDate())}\`;
    return { fromDate: monStr, toDate: sunStr, label: isMal ? 'കഴിഞ്ഞ ആഴ്ച (Last Week)' : 'Last Week', daysCount: 7 };
  }

  if (type === 'this_month') {
    const startStr = \`\${year}-\${pad(month + 1)}-01\`;
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ മാസം (This Month)' : 'This Month', daysCount: day };
  }

  if (type === 'last_month') {
    const lmYear = month === 0 ? year - 1 : year;
    const lmMonth = month === 0 ? 11 : month - 1;
    const startStr = \`\${lmYear}-\${pad(lmMonth + 1)}-01\`;
    const lastDay = new Date(lmYear, lmMonth + 1, 0).getDate();
    const endStr = \`\${lmYear}-\${pad(lmMonth + 1)}-\${pad(lastDay)}\`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? 'കഴിഞ്ഞ മാസം (Last Month)' : 'Last Month', daysCount: lastDay };
  }

  if (type === 'this_quarter') {
    const qStartMonth = Math.floor(month / 3) * 3;
    const startStr = \`\${year}-\${pad(qStartMonth + 1)}-01\`;
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
    const startStr = \`\${lqYear}-\${pad(lqStartMonth + 1)}-01\`;
    const endMonth = lqStartMonth + 2;
    const lastDay = new Date(lqYear, endMonth + 1, 0).getDate();
    const endStr = \`\${lqYear}-\${pad(endMonth + 1)}-\${pad(lastDay)}\`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? 'കഴിഞ്ഞ ക്വാർട്ടർ (Last Quarter)' : 'Last Quarter', daysCount: 90 };
  }

  if (type === 'this_year') {
    const startStr = \`\${year}-01-01\`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? 'ഈ വർഷം (This Year)' : 'This Year', daysCount: daysElapsed };
  }

  if (type === 'last_year') {
    const ly = year - 1;
    return { fromDate: \`\${ly}-01-01\`, toDate: \`\${ly}-12-31\`, label: isMal ? 'കഴിഞ്ഞ വർഷം (Last Year)' : 'Last Year', daysCount: 365 };
  }

  if (type === 'last_7_days') {
    const p = new Date(year, month, day - 6);
    const fromStr = \`\${p.getFullYear()}-\${pad(p.getMonth() + 1)}-\${pad(p.getDate())}\`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? 'കഴിഞ്ഞ 7 ദിവസങ്ങൾ (Last 7 Days)' : 'Last 7 Days', daysCount: 7 };
  }

  if (type === 'last_30_days') {
    const p = new Date(year, month, day - 29);
    const fromStr = \`\${p.getFullYear()}-\${pad(p.getMonth() + 1)}-\${pad(p.getDate())}\`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? 'കഴിഞ്ഞ 30 ദിവസങ്ങൾ (Last 30 Days)' : 'Last 30 Days', daysCount: 30 };
  }

  if (type === 'financial_year') {
    const fyStartYear = month >= 3 ? year : year - 1;
    const startStr = \`\${fyStartYear}-04-01\`;
    const endStr = \`\${fyStartYear + 1}-03-31\`;
    const effectiveTo = todayStr < endStr ? todayStr : endStr;
    const daysElapsed = Math.max(1, Math.round((new Date(effectiveTo).getTime() - new Date(startStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: effectiveTo, label: isMal ? \`സാമ്പത്തിക വർഷം FY \${fyStartYear}-\${String(fyStartYear + 1).slice(-2)}\` : \`Financial Year FY \${fyStartYear}-\${String(fyStartYear + 1).slice(-2)}\`, daysCount: daysElapsed };
  }

  if (customFrom && customTo) {
    const diff = Math.max(1, Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return {
      fromDate: customFrom,
      toDate: customTo,
      label: isMal ? \`\${customFrom} മുതൽ \${customTo} വരെ\` : \`\${customFrom} to \${customTo}\`,
      daysCount: diff,
    };
  }

  return { fromDate: todayStr, toDate: todayStr, label: todayStr, daysCount: 1 };
}

/**
 * Natural Language Date Extractor
 */
export function extractDateFromText(text: string): { fromDate?: string; toDate?: string; specificDate?: string } {
  const isoMatches = text.match(/\\b(\\d{4}-\\d{2}-\\d{2})\\b/g);
  if (isoMatches && isoMatches.length >= 2) {
    return { fromDate: isoMatches[0], toDate: isoMatches[1] };
  } else if (isoMatches && isoMatches.length === 1) {
    return { specificDate: isoMatches[0], fromDate: isoMatches[0], toDate: isoMatches[0] };
  }

  const dmyMatches = text.match(/\\b(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})\\b/g);
  if (dmyMatches && dmyMatches.length > 0) {
    const parsed = dmyMatches.map(m => {
      const parts = m.split(/[/-]/);
      return \`\${parts[2]}-\${pad(Number(parts[1]))}-\${pad(Number(parts[0]))}\`;
    });
    if (parsed.length >= 2) return { fromDate: parsed[0], toDate: parsed[1] };
    return { specificDate: parsed[0], fromDate: parsed[0], toDate: parsed[0] };
  }

  const nDaysMatch = text.match(/(?:previous|last|past|കഴിഞ്ഞ)\\s+(\\d+)\\s+(?:days?|ദിവസം|ദിവസത്തെ)/i);
  if (nDaysMatch && nDaysMatch[1]) {
    const n = parseInt(nDaysMatch[1], 10);
    if (n > 0 && n <= 365) {
      const now = new Date();
      const p = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1));
      const fromStr = \`\${p.getFullYear()}-\${pad(p.getMonth() + 1)}-\${pad(p.getDate())}\`;
      const toStr = \`\${now.getFullYear()}-\${pad(now.getMonth() + 1)}-\${pad(now.getDate())}\`;
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
`);

fs.writeFileSync(path.join(__dirname, 'part1.ts'), parts.join('\n'));
console.log('Part 1 written.');
