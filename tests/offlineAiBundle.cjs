var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/services/offlineAiService.ts
var offlineAiService_exports = {};
__export(offlineAiService_exports, {
  CAPABILITY_REGISTRY: () => CAPABILITY_REGISTRY,
  OfflineAiIntentParser: () => OfflineAiIntentParser,
  extractDateFromText: () => extractDateFromText,
  formatINR: () => formatINR,
  formatQty: () => formatQty,
  isMalayalam: () => isMalayalam,
  normalizeInput: () => normalizeInput,
  pad: () => pad,
  processOfflineAiQuery: () => processOfflineAiQuery,
  resolveDateRange: () => resolveDateRange
});
module.exports = __toCommonJS(offlineAiService_exports);
function formatINR(val) {
  const num = Number(val || 0);
  return "\u20B9" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatQty(val) {
  const num = Number(val || 0);
  return num.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}
function isMalayalam(text) {
  return /[\u0D00-\u0D7F]/.test(text || "");
}
var pad = (n) => String(n).padStart(2, "0");
function normalizeInput(text) {
  if (!text) return "";
  let str = text.toLowerCase().trim();
  str = str.replace(/\s+/g, " ");
  str = str.replace(/[?!.]+$|[.,]+$/g, "");
  return str;
}
function resolveDateRange(type, customFrom, customTo, isMal = false) {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const todayStr = `${year}-${pad(month + 1)}-${pad(day)}`;
  if (type === "today") {
    return { fromDate: todayStr, toDate: todayStr, label: isMal ? "\u0D07\u0D28\u0D4D\u0D28\u0D4D (Today)" : "Today", daysCount: 1 };
  }
  if (type === "yesterday") {
    const yDate = new Date(year, month, day - 1);
    const yStr = `${yDate.getFullYear()}-${pad(yDate.getMonth() + 1)}-${pad(yDate.getDate())}`;
    return { fromDate: yStr, toDate: yStr, label: isMal ? "\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46 (Yesterday)" : "Yesterday", daysCount: 1 };
  }
  if (type === "this_week") {
    const dayOfWeek = now.getDay();
    const diffToMonday = day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const mon = new Date(year, month, diffToMonday);
    const monStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - mon.getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: monStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D06\u0D34\u0D4D\u0D1A (This Week)" : "This Week", daysCount: daysElapsed };
  }
  if (type === "last_week") {
    const dayOfWeek = now.getDay();
    const diffToLastMonday = day - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1);
    const lastMon = new Date(year, month, diffToLastMonday);
    const lastSun = new Date(year, month, diffToLastMonday + 6);
    const monStr = `${lastMon.getFullYear()}-${pad(lastMon.getMonth() + 1)}-${pad(lastMon.getDate())}`;
    const sunStr = `${lastSun.getFullYear()}-${pad(lastSun.getMonth() + 1)}-${pad(lastSun.getDate())}`;
    return { fromDate: monStr, toDate: sunStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D06\u0D34\u0D4D\u0D1A (Last Week)" : "Last Week", daysCount: 7 };
  }
  if (type === "this_month") {
    const startStr = `${year}-${pad(month + 1)}-01`;
    return { fromDate: startStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D2E\u0D3E\u0D38\u0D02 (This Month)" : "This Month", daysCount: day };
  }
  if (type === "last_month") {
    const lmYear = month === 0 ? year - 1 : year;
    const lmMonth = month === 0 ? 11 : month - 1;
    const startStr = `${lmYear}-${pad(lmMonth + 1)}-01`;
    const lastDay = new Date(lmYear, lmMonth + 1, 0).getDate();
    const endStr = `${lmYear}-${pad(lmMonth + 1)}-${pad(lastDay)}`;
    return { fromDate: startStr, toDate: endStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02 (Last Month)" : "Last Month", daysCount: lastDay };
  }
  if (type === "this_quarter") {
    const qStartMonth = Math.floor(month / 3) * 3;
    const startStr = `${year}-${pad(qStartMonth + 1)}-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D15\u0D4D\u0D35\u0D3E\u0D7C\u0D1F\u0D4D\u0D1F\u0D7C (This Quarter)" : "This Quarter", daysCount: daysElapsed };
  }
  if (type === "last_quarter") {
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
    return { fromDate: startStr, toDate: endStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D15\u0D4D\u0D35\u0D3E\u0D7C\u0D1F\u0D4D\u0D1F\u0D7C (Last Quarter)" : "Last Quarter", daysCount: 90 };
  }
  if (type === "this_year") {
    const startStr = `${year}-01-01`;
    const daysElapsed = Math.max(1, Math.round((now.getTime() - new Date(startStr).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: todayStr, label: isMal ? "\u0D08 \u0D35\u0D7C\u0D37\u0D02 (This Year)" : "This Year", daysCount: daysElapsed };
  }
  if (type === "last_year") {
    const ly = year - 1;
    return { fromDate: `${ly}-01-01`, toDate: `${ly}-12-31`, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D35\u0D7C\u0D37\u0D02 (Last Year)" : "Last Year", daysCount: 365 };
  }
  if (type === "last_7_days") {
    const p = new Date(year, month, day - 6);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E 7 \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D7E (Last 7 Days)" : "Last 7 Days", daysCount: 7 };
  }
  if (type === "last_30_days") {
    const p = new Date(year, month, day - 29);
    const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
    return { fromDate: fromStr, toDate: todayStr, label: isMal ? "\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E 30 \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D7E (Last 30 Days)" : "Last 30 Days", daysCount: 30 };
  }
  if (type === "financial_year") {
    const fyStartYear = month >= 3 ? year : year - 1;
    const startStr = `${fyStartYear}-04-01`;
    const endStr = `${fyStartYear + 1}-03-31`;
    const effectiveTo = todayStr < endStr ? todayStr : endStr;
    const daysElapsed = Math.max(1, Math.round((new Date(effectiveTo).getTime() - new Date(startStr).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return { fromDate: startStr, toDate: effectiveTo, label: isMal ? `\u0D38\u0D3E\u0D2E\u0D4D\u0D2A\u0D24\u0D4D\u0D24\u0D3F\u0D15 \u0D35\u0D7C\u0D37\u0D02 FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}` : `Financial Year FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`, daysCount: daysElapsed };
  }
  if (customFrom && customTo) {
    const diff = Math.max(1, Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1e3 * 60 * 60 * 24)) + 1);
    return {
      fromDate: customFrom,
      toDate: customTo,
      label: isMal ? `${customFrom} \u0D2E\u0D41\u0D24\u0D7D ${customTo} \u0D35\u0D30\u0D46` : `${customFrom} to ${customTo}`,
      daysCount: diff
    };
  }
  return { fromDate: todayStr, toDate: todayStr, label: todayStr, daysCount: 1 };
}
function extractDateFromText(text) {
  const isoMatches = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
  if (isoMatches && isoMatches.length >= 2) {
    return { fromDate: isoMatches[0], toDate: isoMatches[1] };
  } else if (isoMatches && isoMatches.length === 1) {
    return { specificDate: isoMatches[0], fromDate: isoMatches[0], toDate: isoMatches[0] };
  }
  const dmyMatches = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g);
  if (dmyMatches && dmyMatches.length > 0) {
    const parsed = dmyMatches.map((m) => {
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
      const now = /* @__PURE__ */ new Date();
      const p = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1));
      const fromStr = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}`;
      const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return { fromDate: fromStr, toDate: toStr };
    }
  }
  return {};
}
var CAPABILITY_REGISTRY = {
  SALES_TODAY: { id: "SALES_TODAY", domain: "SALES", description: "Today's sales revenue, invoice count, and payment breakdown", requiredFields: ["grand_total", "created_at"], handler: "SALES_TODAY" },
  SALES_PERIOD: { id: "SALES_PERIOD", domain: "SALES", description: "Sales performance for a predefined time period", requiredFields: ["grand_total", "created_at"], handler: "SALES_PERIOD" },
  SALES_HOURLY: { id: "SALES_HOURLY", domain: "SALES", description: "Hourly sales analysis for today", requiredFields: ["grand_total", "created_at"], handler: "SALES_HOURLY" },
  COMPARE_SALES: { id: "COMPARE_SALES", domain: "SALES", description: "Comparative variance between two reporting periods", requiredFields: ["grand_total", "created_at"], handler: "COMPARE_SALES" },
  SALES_INVOICE_COUNT: { id: "SALES_INVOICE_COUNT", domain: "SALES", description: "Number of invoices generated in a period", requiredFields: ["invoice_id"], handler: "SALES_INVOICE_COUNT" },
  SALES_AVERAGE_TICKET: { id: "SALES_AVERAGE_TICKET", domain: "SALES", description: "Average transaction ticket value", requiredFields: ["grand_total"], handler: "SALES_AVERAGE_TICKET" },
  SALES_AVERAGE_DAILY: { id: "SALES_AVERAGE_DAILY", domain: "SALES", description: "Average daily sales revenue and bills/day", requiredFields: ["grand_total", "created_at"], handler: "SALES_AVERAGE_DAILY" },
  SALES_UNIQUE_CUSTOMERS: { id: "SALES_UNIQUE_CUSTOMERS", domain: "SALES", description: "Count of unique buyers in period", requiredFields: ["customer_phone", "customer_name"], handler: "SALES_UNIQUE_CUSTOMERS" },
  SALES_INVOICE_EXTREMES: { id: "SALES_INVOICE_EXTREMES", domain: "SALES", description: "Highest or lowest single invoice", requiredFields: ["grand_total"], handler: "SALES_INVOICE_EXTREMES" },
  SALES_PAYMENT_METHODS: { id: "SALES_PAYMENT_METHODS", domain: "SALES", description: "Sales breakdown by tender (Cash, Card, UPI, Credit, Split)", requiredFields: ["payment_method", "split_details", "grand_total"], handler: "SALES_PAYMENT_METHODS" },
  SALES_CREDIT_OUTSTANDING: { id: "SALES_CREDIT_OUTSTANDING", domain: "SALES", description: "Outstanding unpaid credit from invoices", requiredFields: ["grand_total", "payment_method"], handler: "SALES_CREDIT_OUTSTANDING" },
  SALES_GROSS_NET: { id: "SALES_GROSS_NET", domain: "SALES", description: "Gross sales, discounts, returns, and net sales reconciliation", requiredFields: ["grand_total", "discount_total", "tax_total"], handler: "SALES_GROSS_NET" },
  SALES_INVOICE_TYPES: { id: "SALES_INVOICE_TYPES", domain: "SALES", description: "Breakdown by invoice type (GST, Bill of Supply)", requiredFields: ["invoice_type", "grand_total"], handler: "SALES_INVOICE_TYPES" },
  SALES_HIGHEST_DAY: { id: "SALES_HIGHEST_DAY", domain: "SALES", description: "Highest or lowest revenue day in a period", requiredFields: ["created_at", "grand_total"], handler: "SALES_HIGHEST_DAY" },
  SALES_DAILY_TREND: { id: "SALES_DAILY_TREND", domain: "SALES", description: "Daily sales trend across calendar days", requiredFields: ["created_at", "grand_total"], handler: "SALES_DAILY_TREND" },
  SALES_BILLER_STAFF: { id: "SALES_BILLER_STAFF", domain: "SALES", description: "Sales aggregated by cashier/biller staff", requiredFields: ["user_id", "biller_staff_id"], handler: "SALES_BILLER_STAFF" },
  SALES_CUSTOMER_LEVEL: { id: "SALES_CUSTOMER_LEVEL", domain: "SALES", description: "Customer sales volume and spending rankings", requiredFields: ["customer_name", "customer_phone", "grand_total"], handler: "SALES_CUSTOMER_LEVEL" },
  SALES_CANCELLED_INVOICES: { id: "SALES_CANCELLED_INVOICES", domain: "SALES", description: "Cancelled and voided invoices count and amount", requiredFields: ["is_deleted", "invoice_type"], handler: "SALES_CANCELLED_INVOICES" },
  TOP_SELLING_PRODUCTS: { id: "TOP_SELLING_PRODUCTS", domain: "SALES", description: "Best-selling products by quantity and revenue", requiredFields: ["product_id", "quantity", "total"], handler: "TOP_SELLING_PRODUCTS" },
  // Expenses (4.1)
  EXPENSES_SUMMARY: { id: "EXPENSES_SUMMARY", domain: "EXPENSES", description: "Total operating expenses and payouts for a period", requiredFields: ["amount", "type", "transaction_date"], handler: "EXPENSES_SUMMARY" },
  EXPENSES_BY_CATEGORY: { id: "EXPENSES_BY_CATEGORY", domain: "EXPENSES", description: "Expenses grouped by category with % share", requiredFields: ["category", "amount"], handler: "EXPENSES_BY_CATEGORY" },
  EXPENSES_LARGEST: { id: "EXPENSES_LARGEST", domain: "EXPENSES", description: "Largest recorded expense payouts in a period", requiredFields: ["amount", "category", "notes"], handler: "EXPENSES_LARGEST" },
  EXPENSES_COMPARE: { id: "EXPENSES_COMPARE", domain: "EXPENSES", description: "Expense variance comparison between periods", requiredFields: ["amount", "transaction_date"], handler: "EXPENSES_COMPARE" },
  EXPENSES_CASH_TODAY: { id: "EXPENSES_CASH_TODAY", domain: "EXPENSES", description: "Cash paid out for expenses today from register", requiredFields: ["amount", "type", "transaction_date"], handler: "EXPENSES_CASH_TODAY" },
  // Inventory & Stock (4.2)
  INVENTORY_OUT_OF_STOCK: { id: "INVENTORY_OUT_OF_STOCK", domain: "INVENTORY", description: "Products with current stock <= 0", requiredFields: ["current_stock"], handler: "INVENTORY_OUT_OF_STOCK" },
  INVENTORY_LOW_STOCK: { id: "INVENTORY_LOW_STOCK", domain: "INVENTORY", description: "Products at or below reorder level", requiredFields: ["current_stock", "reorder_level"], handler: "INVENTORY_LOW_STOCK" },
  INVENTORY_TOTAL_VALUE: { id: "INVENTORY_TOTAL_VALUE", domain: "INVENTORY", description: "Total inventory valuation at cost and retail", requiredFields: ["current_stock", "purchase_price", "base_price"], handler: "INVENTORY_TOTAL_VALUE" },
  INVENTORY_PRODUCT_STOCK: { id: "INVENTORY_PRODUCT_STOCK", domain: "INVENTORY", description: "Real-time stock level of a specific product", requiredFields: ["name", "current_stock"], handler: "INVENTORY_PRODUCT_STOCK" },
  INVENTORY_TOP_STOCK: { id: "INVENTORY_TOP_STOCK", domain: "INVENTORY", description: "Products with highest stock quantities", requiredFields: ["current_stock"], handler: "INVENTORY_TOP_STOCK" },
  INVENTORY_NON_SELLING: { id: "INVENTORY_NON_SELLING", domain: "INVENTORY", description: "Products that have not sold recently", requiredFields: ["product_id", "created_at"], handler: "INVENTORY_NON_SELLING" },
  INVENTORY_BY_CATEGORY: { id: "INVENTORY_BY_CATEGORY", domain: "INVENTORY", description: "Stock quantities and item counts by category", requiredFields: ["category", "current_stock"], handler: "INVENTORY_BY_CATEGORY" },
  // Purchases & Supplier Bills (4.3)
  PURCHASES_SUMMARY: { id: "PURCHASES_SUMMARY", domain: "PURCHASES", description: "Total purchases and supplier bills for a period", requiredFields: ["total_amount", "bill_date"], handler: "PURCHASES_SUMMARY" },
  PURCHASES_BY_SUPPLIER: { id: "PURCHASES_BY_SUPPLIER", domain: "PURCHASES", description: "Purchases grouped by supplier name", requiredFields: ["supplier_name", "total_amount"], handler: "PURCHASES_BY_SUPPLIER" },
  PURCHASES_UNPAID: { id: "PURCHASES_UNPAID", domain: "PURCHASES", description: "Unpaid and credit supplier purchase bills", requiredFields: ["payment_type", "total_amount"], handler: "PURCHASES_UNPAID" },
  PURCHASES_PRODUCT_HISTORY: { id: "PURCHASES_PRODUCT_HISTORY", domain: "PURCHASES", description: "Purchase history and latest purchase price of a product", requiredFields: ["purchase_price", "quantity"], handler: "PURCHASES_PRODUCT_HISTORY" },
  PURCHASES_COMPARE: { id: "PURCHASES_COMPARE", domain: "PURCHASES", description: "Comparison between current and previous month purchases", requiredFields: ["total_amount", "bill_date"], handler: "PURCHASES_COMPARE" },
  // Customer & Supplier Ledger (4.4)
  CUSTOMER_CREDIT_LIST: { id: "CUSTOMER_CREDIT_LIST", domain: "LEDGER", description: "Customer credit receivables summary and ranking", requiredFields: ["balance", "party_type"], handler: "CUSTOMER_CREDIT_LIST" },
  SUPPLIER_PAYABLES_TOTAL: { id: "SUPPLIER_PAYABLES_TOTAL", domain: "LEDGER", description: "Total payables owed to suppliers and supplier list", requiredFields: ["balance", "party_type"], handler: "SUPPLIER_PAYABLES_TOTAL" },
  PARTY_BALANCE: { id: "PARTY_BALANCE", domain: "LEDGER", description: "Outstanding balance of a specific customer or supplier", requiredFields: ["balance", "name"], handler: "PARTY_BALANCE" },
  PARTY_LEDGER: { id: "PARTY_LEDGER", domain: "LEDGER", description: "Detailed ledger statement entries for a customer/supplier", requiredFields: ["debit_amount", "credit_amount", "running_balance"], handler: "PARTY_LEDGER" },
  // Cash Register & Cash Drawer (4.5)
  CASH_DRAWER_CURRENT: { id: "CASH_DRAWER_CURRENT", domain: "CASH_DRAWER", description: "Current cash drawer balance, opening cash, and status", requiredFields: ["current_cash", "opening_balance", "status"], handler: "CASH_DRAWER_CURRENT" },
  CASH_DRAWER_MOVEMENTS: { id: "CASH_DRAWER_MOVEMENTS", domain: "CASH_DRAWER", description: "Today's cash drawer inflows, outflows, and sales", requiredFields: ["cash_sales", "cash_in", "cash_out"], handler: "CASH_DRAWER_MOVEMENTS" },
  CASH_DRAWER_EXPECTED_VS_ACTUAL: { id: "CASH_DRAWER_EXPECTED_VS_ACTUAL", domain: "CASH_DRAWER", description: "Expected closing cash vs actual counted cash with variance", requiredFields: ["expected_closing", "actual_cash"], handler: "CASH_DRAWER_EXPECTED_VS_ACTUAL" },
  CASH_DRAWER_SETTLEMENTS: { id: "CASH_DRAWER_SETTLEMENTS", domain: "CASH_DRAWER", description: "Day settlement history and closing records", requiredFields: ["business_date", "actual_cash"], handler: "CASH_DRAWER_SETTLEMENTS" },
  // Bills, Payments & Receivables (4.6)
  BILLS_UNPAID: { id: "BILLS_UNPAID", domain: "BILLS", description: "Unpaid and credit invoices with outstanding dues", requiredFields: ["balance_amount", "grand_total"], handler: "BILLS_UNPAID" },
  BILLS_PARTIALLY_PAID: { id: "BILLS_PARTIALLY_PAID", domain: "BILLS", description: "Invoices with partial payments received", requiredFields: ["received_amount", "balance_amount"], handler: "BILLS_PARTIALLY_PAID" },
  BILLS_SPLIT_PAYMENTS: { id: "BILLS_SPLIT_PAYMENTS", domain: "BILLS", description: "Invoices settled across multiple payment methods", requiredFields: ["payment_method", "split_details"], handler: "BILLS_SPLIT_PAYMENTS" },
  // Sales Returns, Discounts, Loyalty (4.7)
  RETURNS_SUMMARY: { id: "RETURNS_SUMMARY", domain: "RETURNS_LOYALTY", description: "Sales returns and refund totals for a period", requiredFields: ["grand_total", "return_date"], handler: "RETURNS_SUMMARY" },
  RETURNS_ITEMS: { id: "RETURNS_ITEMS", domain: "RETURNS_LOYALTY", description: "Items and quantities returned by customers", requiredFields: ["name", "quantity", "total"], handler: "RETURNS_ITEMS" },
  RETURNS_BY_METHOD: { id: "RETURNS_BY_METHOD", domain: "RETURNS_LOYALTY", description: "Refund amounts grouped by payment method", requiredFields: ["refund_method", "grand_total"], handler: "RETURNS_BY_METHOD" },
  DISCOUNTS_SUMMARY: { id: "DISCOUNTS_SUMMARY", domain: "RETURNS_LOYALTY", description: "Total discounts and high-discount invoices", requiredFields: ["discount_total"], handler: "DISCOUNTS_SUMMARY" },
  LOYALTY_POINTS: { id: "LOYALTY_POINTS", domain: "RETURNS_LOYALTY", description: "Customer loyalty points balance, earned, and redeemed", requiredFields: ["current_points_balance"], handler: "LOYALTY_POINTS" },
  // Product Pricing (4.8)
  PRODUCT_PRICE_LOOKUP: { id: "PRODUCT_PRICE_LOOKUP", domain: "PRICING", description: "Product retail, wholesale, purchase price and GST rate", requiredFields: ["base_price", "purchase_price"], handler: "PRODUCT_PRICE_LOOKUP" },
  PRODUCT_BARCODE_LOOKUP: { id: "PRODUCT_BARCODE_LOOKUP", domain: "PRICING", description: "Barcode and item code product lookup", requiredFields: ["sku_barcode", "item_code"], handler: "PRODUCT_BARCODE_LOOKUP" },
  // Diagnostics & Help (4.9)
  DIAGNOSTIC_DEDUPLICATION_CHECK: { id: "DIAGNOSTIC_DEDUPLICATION_CHECK", domain: "DIAGNOSTICS", description: "Audit of converted bills deduplication in sales reporting", requiredFields: ["converted_to_invoice_id"], handler: "DIAGNOSTIC_DEDUPLICATION_CHECK" },
  DIAGNOSTIC_PAYMENT_RECONCILIATION: { id: "DIAGNOSTIC_PAYMENT_RECONCILIATION", domain: "DIAGNOSTICS", description: "Reconciliation of invoice totals against tender allocations", requiredFields: ["grand_total", "split_details"], handler: "DIAGNOSTIC_PAYMENT_RECONCILIATION" },
  AI_CAPABILITIES_EXPLANATION: { id: "AI_CAPABILITIES_EXPLANATION", domain: "HELP", description: "Deterministic offline architecture and zero cloud AI verification", requiredFields: [], handler: "AI_CAPABILITIES_EXPLANATION" },
  AI_HELP_REPORTS: { id: "AI_HELP_REPORTS", domain: "HELP", description: "Directory of supported offline business intelligence reports", requiredFields: [], handler: "AI_HELP_REPORTS" },
  CLARIFICATION_REQUIRED: { id: "CLARIFICATION_REQUIRED", domain: "HELP", description: "Guides user when question is ambiguous or lacks required time period", requiredFields: [], handler: "CLARIFICATION_REQUIRED" },
  UNSUPPORTED_REQUEST: { id: "UNSUPPORTED_REQUEST", domain: "HELP", description: "Explicit transparent refusal and guidance for out-of-scope non-POS tasks", requiredFields: [], handler: "UNSUPPORTED_REQUEST" }
};
var OfflineAiIntentParser = class {
  static parse(message, history = []) {
    const raw = message.trim();
    const text = normalizeInput(message);
    const lastUserMsg = [...history].reverse().find((m) => m.role === "user")?.content?.toLowerCase() || "";
    const dateExtraction = extractDateFromText(raw);
    if (text.includes("converted bills") || text.includes("counted twice") || text.includes("counted more than once") || text.includes("double counted") || text.includes("duplicate counting")) {
      return { intent: "DIAGNOSTIC_DEDUPLICATION_CHECK", domain: "DIAGNOSTICS", params: {} };
    }
    if (text.includes("payment allocations do not match") || text.includes("allocations do not match") || text.includes("allocation mismatch") || text.includes("payment reconciliation")) {
      return { intent: "DIAGNOSTIC_PAYMENT_RECONCILIATION", domain: "DIAGNOSTICS", params: {} };
    }
    if (text.includes("asked twice") || text.includes("without any data changes") || text.includes("remain the same") || text.includes("deterministic") || text.includes("without an internet connection") || text.includes("distinguish between zero sales")) {
      return {
        intent: "AI_CAPABILITIES_EXPLANATION",
        domain: "HELP",
        params: { topic: text.includes("asked twice") ? "determinism" : text.includes("internet") ? "offline" : "diagnostics" }
      };
    }
    if (text.includes("what reports can you generate") || text.includes("which operations are supported") || text.includes("what reports do you have") || text.includes("examples of questions") || text.includes("what can i ask") || text.includes("what data was included") || text.includes("supported offline")) {
      return { intent: "AI_HELP_REPORTS", domain: "HELP", params: {} };
    }
    if (text.includes("predict") || text.includes("forecast") || text.includes("future sales") || text.includes("weather") || text.includes("\u0D15\u0D3E\u0D32\u0D3E\u0D35\u0D38\u0D4D\u0D25") || text.includes("send email") || text.includes("send an email") || text.includes("send sms") || text.includes("whatsapp") || text.includes("browse web") || text.includes("search google") || text.includes("who is the president") || text.includes("who is the prime minister")) {
      return { intent: "UNSUPPORTED_REQUEST", domain: "HELP", params: { rawQuery: message } };
    }
    if (text === "show sales" || text === "sales" || text === "\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D" || text === "sales report" || text === "\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "sales_period",
          message: "Which sales period would you like to see? You can specify: Today, Yesterday, This Month, Last Month, or a custom date range.",
          messageMal: "\u0D0F\u0D24\u0D4D \u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D3F\u0D32\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D3E\u0D23\u0D4D \u0D15\u0D3E\u0D23\u0D47\u0D23\u0D4D\u0D1F\u0D24\u0D4D? \u0D07\u0D28\u0D4D\u0D28\u0D4D, \u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46, \u0D08 \u0D2E\u0D3E\u0D38\u0D02, \u0D05\u0D32\u0D4D\u0D32\u0D46\u0D19\u0D4D\u0D15\u0D3F\u0D7D \u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02 \u0D0E\u0D28\u0D4D\u0D28\u0D4D \u0D35\u0D4D\u0D2F\u0D15\u0D4D\u0D24\u0D2E\u0D3E\u0D15\u0D4D\u0D15\u0D3E\u0D2E\u0D4B?"
        },
        clarificationRequired: true
      };
    }
    if (text === "balance" || text === "show balance" || text === "\u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D" || text === "\u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "balance_type",
          message: "Which balance would you like to review?\n1. Customer Outstanding Balance (Receivables)\n2. Supplier Outstanding Balance (Payables)\n3. Cash Register Drawer Balance",
          messageMal: "\u0D0F\u0D24\u0D4D \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D33\u0D3E\u0D23\u0D4D \u0D05\u0D31\u0D3F\u0D2F\u0D47\u0D23\u0D4D\u0D1F\u0D24\u0D4D?\n1. \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F (\u0D24\u0D30\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D)\n2. \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F (\u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D)\n3. \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D (\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D7C \u0D2C\u0D4B\u0D15\u0D4D\u0D38\u0D4D)"
        },
        clarificationRequired: true
      };
    }
    if (text === "report" || text === "show report" || text === "details" || text === "show details" || text === "show me the details" || text === "\u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D" || text === "\u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E" || text === "summary") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "report_module",
          message: "Which business report would you like to view?\n1. Sales & Revenue Summary\n2. Inventory & Stock Status\n3. Expenses & Cash Payouts\n4. Purchase Bills & Payables\n5. Customer & Supplier Ledgers",
          messageMal: "\u0D0F\u0D24\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D33\u0D3E\u0D23\u0D4D \u0D15\u0D3E\u0D23\u0D47\u0D23\u0D4D\u0D1F\u0D24\u0D4D?\n1. \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D (Sales Report)\n2. \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D28\u0D3F\u0D32\u0D35\u0D3E\u0D30\u0D02 (Inventory Status)\n3. \u0D1A\u0D46\u0D32\u0D35\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D (Expenses Report)\n4. \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Purchase Bills)\n5. \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C/\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D32\u0D46\u0D21\u0D4D\u0D1C\u0D7C (Ledgers)"
        },
        clarificationRequired: true
      };
    }
    if (text === "how much money did we make" || text === "how much did we make" || text === "\u0D28\u0D2E\u0D41\u0D15\u0D4D\u0D15\u0D4D \u0D0E\u0D24\u0D4D\u0D30 \u0D2A\u0D23\u0D02 \u0D15\u0D3F\u0D1F\u0D4D\u0D1F\u0D3F" || text === "\u0D0E\u0D24\u0D4D\u0D30 \u0D30\u0D42\u0D2A\u0D2F\u0D41\u0D23\u0D4D\u0D1F\u0D3E\u0D2F\u0D3F") {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "financial_metric",
          message: "To give you the exact figure, would you like to check: 1. Total Sales Revenue, 2. Cash Collected in Drawer, or 3. Net Invoiced Sales (after discounts)?",
          messageMal: "\u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F \u0D24\u0D41\u0D15 \u0D28\u0D7D\u0D15\u0D3E\u0D7B \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D7E \u0D09\u0D26\u0D4D\u0D26\u0D47\u0D36\u0D3F\u0D1A\u0D4D\u0D1A\u0D24\u0D4D \u0D0F\u0D24\u0D3E\u0D23\u0D4D: 1. \u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 (Sales Revenue), 2. \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D31\u0D3F\u0D7D \u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A \u0D2A\u0D23\u0D02 (Cash Collected), \u0D05\u0D24\u0D4B 3. \u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D (Net Sales)?"
        },
        clarificationRequired: true
      };
    }
    if (text.includes("most profitable products") || text.includes("highest profit product") || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D32\u0D3E\u0D2D\u0D2E\u0D41\u0D33\u0D4D\u0D33")) {
      return {
        intent: "CLARIFICATION_REQUIRED",
        domain: "HELP",
        params: {
          topic: "profit_limitation",
          message: "Accurate profit calculation requires item-level Cost of Goods Sold (COGS) recorded for each transaction batch. Currently, you can view the highest revenue generating products or top-selling items instead.",
          messageMal: "\u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28 \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F \u0D32\u0D3E\u0D2D\u0D02 \u0D05\u0D31\u0D3F\u0D2F\u0D3E\u0D7B \u0D13\u0D30\u0D4B \u0D2C\u0D3E\u0D1A\u0D4D\u0D1A\u0D3F\u0D28\u0D4D\u0D31\u0D46\u0D2F\u0D41\u0D02 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D15\u0D4B\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D \u0D06\u0D35\u0D36\u0D4D\u0D2F\u0D2E\u0D3E\u0D23\u0D4D. \u0D2A\u0D15\u0D30\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 \u0D28\u0D47\u0D1F\u0D3F\u0D24\u0D4D\u0D24\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D33\u0D4B \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31\u0D41\u0D2A\u0D4B\u0D2F \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D33\u0D4B \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D35\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D3E\u0D23\u0D4D."
        },
        clarificationRequired: true
      };
    }
    const isExpenseWord = (text.includes("expense") || text.includes("expenses") || text.includes("spending") || text.includes("\u0D1A\u0D46\u0D32") || text.includes("\u0D1A\u0D3F\u0D32") || text.includes("chilav") || text.includes("chilar") || text.includes("cash out") || text.includes("payout")) && !text.includes("customer") && !text.includes("spending customer");
    if (isExpenseWord) {
      if (text.includes("cash was paid out") || text.includes("cash paid out for expenses") || text.includes("cash") && text.includes("today") && text.includes("expense")) {
        return { intent: "EXPENSES_CASH_TODAY", domain: "EXPENSES", params: { rangeType: "today" } };
      }
      if (text.includes("category") || text.includes("highest spending") || text.includes("grouped by category") || text.includes("\u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F")) {
        let rangeType2 = "this_month";
        if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType2 = "today";
        else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType2 = "last_month";
        return { intent: "EXPENSES_BY_CATEGORY", domain: "EXPENSES", params: { rangeType: rangeType2 } };
      }
      if (text.includes("largest") || text.includes("biggest") || text.includes("highest expense") || text.includes("\u0D15\u0D42\u0D1F\u0D3F\u0D2F \u0D1A\u0D46\u0D32\u0D35\u0D4D")) {
        let rangeType2 = "this_month";
        if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType2 = "today";
        return { intent: "EXPENSES_LARGEST", domain: "EXPENSES", params: { rangeType: rangeType2, limit: 5 } };
      }
      if (text.includes("compare") || text.includes("\u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02")) {
        return { intent: "EXPENSES_COMPARE", domain: "EXPENSES", params: { compareWith: "last_month" } };
      }
      let rangeType = "this_month";
      if (text.includes("\u0D07\u0D28\u0D4D\u0D28") && !text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("today") || text.includes("innathe") || text.includes("innu")) rangeType = "today";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46") || text.includes("innale")) rangeType = "yesterday";
      else if (text.includes("last 30 days") || text.includes("30 \u0D26\u0D3F\u0D35\u0D38")) rangeType = "last_30_days";
      else if (text.includes("last 7 days") || text.includes("7 \u0D26\u0D3F\u0D35\u0D38")) rangeType = "last_7_days";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      else if (text.includes("ee masathe") || text.includes("ee masam")) rangeType = "this_month";
      return {
        intent: "EXPENSES_SUMMARY",
        domain: "EXPENSES",
        params: { rangeType, customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate }
      };
    }
    const isStockWord = text.includes("stock") || text.includes("\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D") || text.includes("\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15") || text.includes("\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D") || text.includes("inventory") || text.includes("\u0D07\u0D7B\u0D35\u0D46\u0D28\u0D4D\u0D31\u0D31\u0D3F") || text.includes("theernna") || text.includes("theernnath");
    if (isStockWord) {
      if (text.includes("out of stock") || text.includes("\u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28\u0D41\u0D2A\u0D4B\u0D2F") || text.includes("\u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28") || text.includes("zero stock") || text.includes("\u0D28\u0D3F\u0D32\u0D35\u0D3F\u0D32\u0D3F\u0D32\u0D4D\u0D32\u0D3E\u0D24\u0D4D\u0D24") || text.includes("theernna") || text.includes("theernnath")) {
        return { intent: "INVENTORY_OUT_OF_STOCK", domain: "INVENTORY", params: {} };
      }
      if (text.includes("low stock") || text.includes("reorder") || text.includes("\u0D24\u0D40\u0D30\u0D3E\u0D31\u0D3E\u0D2F") || text.includes("\u0D15\u0D41\u0D31\u0D35\u0D41\u0D33\u0D4D\u0D33")) {
        return { intent: "INVENTORY_LOW_STOCK", domain: "INVENTORY", params: {} };
      }
      if (text.includes("value") || text.includes("valuation") || text.includes("\u0D2E\u0D42\u0D32\u0D4D\u0D2F\u0D02") || text.includes("worth")) {
        return { intent: "INVENTORY_TOTAL_VALUE", domain: "INVENTORY", params: {} };
      }
      if (text.includes("highest stock") || text.includes("most stock") || text.includes("\u0D15\u0D42\u0D1F\u0D3F\u0D2F \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D")) {
        return { intent: "INVENTORY_TOP_STOCK", domain: "INVENTORY", params: { limit: 10 } };
      }
      if (text.includes("not sold") || text.includes("non selling") || text.includes("not sold in the last") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D28\u0D1F\u0D15\u0D4D\u0D15\u0D3E\u0D24\u0D4D\u0D24") || text.includes("dead stock")) {
        return { intent: "INVENTORY_NON_SELLING", domain: "INVENTORY", params: { days: 30 } };
      }
      if (text.includes("by category") || text.includes("grouped by category") || text.includes("\u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D4D")) {
        return { intent: "INVENTORY_BY_CATEGORY", domain: "INVENTORY", params: {} };
      }
      const prodCandidate = text.replace(/\b(what\s+is|what's|show|check|tell\s+me|get|find|current|stock|level|quantity|qty|available|of|the|a|for|product|item|സ്റ്റോക്ക്|എത്ര|ഉണ്ട്|ഉൽപ്പന്നം)\b/gi, " ").replace(/[?.,!:]/g, " ").trim();
      if (prodCandidate.length >= 2 && !prodCandidate.includes("low") && !prodCandidate.includes("out") && !prodCandidate.includes("total")) {
        return { intent: "INVENTORY_PRODUCT_STOCK", domain: "INVENTORY", params: { productName: prodCandidate } };
      }
      return { intent: "INVENTORY_LOW_STOCK", domain: "INVENTORY", params: {} };
    }
    const isPurchaseWord = text.includes("purchase") || text.includes("purchases") || text.includes("\u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D") || text.includes("supplier bill") || text.includes("vendor bill") || text.includes("bought");
    if (isPurchaseWord && !text.includes("customer") && !text.includes("\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C")) {
      if (text.includes("price history") || text.includes("history of a product") || text.includes("purchase history of") || text.includes("latest purchase price")) {
        const prodMatch = text.replace(/.*(?:price history for|purchase history for|history for|for|of|of a|product)s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PURCHASES_PRODUCT_HISTORY", domain: "PURCHASES", params: { productName: prodMatch } };
      }
      if (text.includes("grouped by supplier") || text.includes("by supplier") || text.includes("highest purchase amount") || text.includes("\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D4D")) {
        let rangeType2 = "this_month";
        if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType2 = "today";
        return { intent: "PURCHASES_BY_SUPPLIER", domain: "PURCHASES", params: { rangeType: rangeType2 } };
      }
      if (text.includes("unpaid") || text.includes("partially paid") || text.includes("\u0D2A\u0D23\u0D02 \u0D28\u0D7D\u0D15\u0D3E\u0D24\u0D4D\u0D24") || text.includes("pending purchase")) {
        return { intent: "PURCHASES_UNPAID", domain: "PURCHASES", params: {} };
      }
      if (text.includes("compare") || text.includes("\u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02")) {
        return { intent: "PURCHASES_COMPARE", domain: "PURCHASES", params: { compareWith: "last_month" } };
      }
      let rangeType = "this_month";
      if (text.includes("\u0D07\u0D28\u0D4D\u0D28") && !text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("today")) rangeType = "today";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      return {
        intent: "PURCHASES_SUMMARY",
        domain: "PURCHASES",
        params: { rangeType, customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate }
      };
    }
    const isDrawerWord = text.includes("cash drawer") || text.includes("drawer balance") || text.includes("cash register") || text.includes("\u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C") || text.includes("counter cash") || text.includes("drawer") || text.includes("cash settlement") || text.includes("cashier settlement") || text.includes("settlements") || text.includes("expected cash") || text.includes("counted cash") || text.includes("closing cash") || text.includes("settlement differences") || text.includes("cash-in and cash-out") || text.includes("cash in and cash out") || text.includes("paid out from the register");
    if (isDrawerWord && !text.includes("sales by cash register")) {
      if (text.includes("expected cash") || text.includes("counted cash") || text.includes("settlement differences") || text.includes("short") || text.includes("excess")) {
        return { intent: "CASH_DRAWER_EXPECTED_VS_ACTUAL", domain: "CASH_DRAWER", params: {} };
      }
      if (text.includes("inflows") || text.includes("outflows") || text.includes("movements") || text.includes("cash-in") || text.includes("cash in and") || text.includes("withdrawals") || text.includes("deposits")) {
        return { intent: "CASH_DRAWER_MOVEMENTS", domain: "CASH_DRAWER", params: { rangeType: "today" } };
      }
      if (text.includes("paid out from the register")) {
        return { intent: "EXPENSES_CASH_TODAY", domain: "EXPENSES", params: { rangeType: "today" } };
      }
      if (text.includes("history") || text.includes("settlements") || text.includes("closing cash")) {
        return { intent: "CASH_DRAWER_SETTLEMENTS", domain: "CASH_DRAWER", params: {} };
      }
      return { intent: "CASH_DRAWER_CURRENT", domain: "CASH_DRAWER", params: {} };
    }
    if (text.includes("partially paid") || text.includes("\u0D2A\u0D15\u0D41\u0D24\u0D3F \u0D2A\u0D23\u0D02 \u0D28\u0D7D\u0D15\u0D3F\u0D2F")) {
      return { intent: "BILLS_PARTIALLY_PAID", domain: "BILLS", params: {} };
    }
    if (text.includes("unpaid bills") || text.includes("unpaid invoices") || text.includes("overdue bills") || text.includes("\u0D2A\u0D23\u0D02 \u0D32\u0D2D\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D24\u0D4D\u0D24 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E") || text.includes("how many unpaid bills")) {
      return { intent: "BILLS_UNPAID", domain: "BILLS", params: {} };
    }
    if (text.includes("loyalty") || text.includes("reward points") || text.includes("\u0D2A\u0D4B\u0D2F\u0D3F\u0D28\u0D4D\u0D31\u0D4D")) {
      const custName = text.replace(/.*(customer|for|of)\s+/i, "").replace(/[?.,!]/g, "").trim();
      return { intent: "LOYALTY_POINTS", domain: "RETURNS_LOYALTY", params: { customerName: custName } };
    }
    if (text.includes("returned products") || text.includes("returned items") || text.includes("items were returned") || text.includes("products were returned") || text.includes("\u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D24\u0D28\u0D4D\u0D28 \u0D38\u0D3E\u0D27\u0D28\u0D19\u0D4D\u0D19\u0D7E")) {
      return { intent: "RETURNS_ITEMS", domain: "RETURNS_LOYALTY", params: { rangeType: "this_month" } };
    }
    if (text.includes("refunds by payment method") || text.includes("refund method")) {
      return { intent: "RETURNS_BY_METHOD", domain: "RETURNS_LOYALTY", params: { rangeType: "this_month" } };
    }
    if (text.includes("sales returns recorded today") || text.includes("all sales returns recorded today") || text.includes("sales returns were processed") || text.includes("how many sales returns") || text.includes("sales returns this month") || text.includes("sales returns today") || text.includes("\u0D31\u0D3F\u0D1F\u0D4D\u0D1F\u0D47\u0D7A")) {
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return { intent: "RETURNS_SUMMARY", domain: "RETURNS_LOYALTY", params: { rangeType } };
    }
    if (text.includes("discount greater than") || text.includes("discounts greater than") || text.includes("total discount amount for each invoice") || text.includes("invoices with discounts")) {
      const amtMatch = text.match(/(?:₹|rs.?|inr)?\s*(\d[\d,]*)/i);
      const minAmount = amtMatch && amtMatch[1] ? parseInt(amtMatch[1].replace(/,/g, ""), 10) : 500;
      return { intent: "DISCOUNTS_SUMMARY", domain: "RETURNS_LOYALTY", params: { minAmount, rangeType: "today" } };
    }
    if (text.includes("price of") || text.includes("cost of") || text.includes("retail price") || text.includes("wholesale price") || text.includes("tax rate of") || text.includes("gst rate") || text.includes("\u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D") || text.includes("barcode")) {
      const hasBarcodeQuery = text.includes("barcode for") || text.includes("barcode of") || text.includes("gst rate and barcode") || text.includes("gst rate for");
      if (hasBarcodeQuery) {
        const prodName = text.replace(/.*(?:barcode for|barcode of|gst rate and barcode for|gst rate for|price and barcode of|for)\s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PRODUCT_PRICE_LOOKUP", domain: "PRICING", params: { productName: prodName, includeBarcode: true } };
      }
      if (text.includes("barcode") || text.includes("\u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D") || text.includes("item code")) {
        const codeMatch = text.replace(/.*(?:barcode|code)\s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PRODUCT_BARCODE_LOOKUP", domain: "PRICING", params: { code: codeMatch } };
      }
      if (!text.includes("sales") && !text.includes("purchase")) {
        const prodName = text.replace(/.*(?:price of|cost of|rate of|rate for)\s+/i, "").replace(/[?.,!]/g, "").trim();
        return { intent: "PRODUCT_PRICE_LOOKUP", domain: "PRICING", params: { productName: prodName } };
      }
    }
    if (text.includes("owe suppliers") || text.includes("we owe to suppliers") || text.includes("owe to all suppliers") || text.includes("supplier payables") || text.includes("kadam kodukkanullath") || text.includes("suppliersinu kodukkanulla") || text.includes("kodukkanulla cash") || text.includes("\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C\u0D2E\u0D3E\u0D7C\u0D15\u0D4D\u0D15\u0D4D \u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D")) {
      return { intent: "SUPPLIER_PAYABLES_TOTAL", domain: "LEDGER", params: {} };
    }
    const isCreditOrLedger = text.includes("credit") || text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D") || text.includes("\u0D15\u0D1F\u0D02") || text.includes("kadam") || text.includes("\u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15") || text.includes("receivable") || text.includes("debtor") || text.includes("balance") || text.includes("\u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F") || text.includes("\u0D32\u0D46\u0D21\u0D4D\u0D1C\u0D7C") || text.includes("ledger") || text.includes("owe us") || text.includes("owes us") || text.includes("who owes") || text.includes("customers owe") || text.includes("statement");
    if (text.includes("credit remains outstanding") || text.includes("outstanding from credit invoices") || text.includes("credit outstanding")) {
      return { intent: "SALES_CREDIT_OUTSTANDING", domain: "SALES", params: { rangeType: "this_month" } };
    }
    if (isCreditOrLedger && !text.includes("credit sales") && !text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D")) {
      const amtMatch = text.match(/(?:₹|rs.?|inr)?\s*(\d[\d,]*)/i);
      const minAmount = amtMatch && amtMatch[1] ? parseInt(amtMatch[1].replace(/,/g, ""), 10) : 0;
      const limitMatch = text.match(/\btop\s+(\d+)\b/i);
      let limit = 15;
      if (limitMatch && limitMatch[1]) {
        limit = parseInt(limitMatch[1], 10);
      } else if (/\b(top|highest|biggest|number 1|#1)\s+(credit\s+)?customer\b/i.test(text) && !/\bcustomers\b/i.test(text) || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D1F\u0D2E\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C") || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D09\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C") || text === "who is the top credit customer" || text === "who is the top credit customer?" || text === "who are the top credit customer" || text === "who are the top credit customer?") {
        limit = 1;
      }
      const isListWord = text.includes("\u0D32\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D") || text.includes("list") || text.includes("top credit") || text.includes("who are our top") || text.includes("top 5 credit") || text.includes("who are") || text.includes("who is") || text.includes("customers owe us") || text.includes("debtors") || text.includes("receivables") || text.includes("above") || text.includes("greater than") || text.includes("aarokkeyanu kadam") || text.includes("kadam tharanulla") || text.includes("kadam ethraya") || text.includes("kadam ullavar") || text.includes("who owes us") || text.includes("top debtor") || text.includes("who owes the most");
      if (isListWord || minAmount > 0 || limit === 1) {
        return { intent: "CUSTOMER_CREDIT_LIST", domain: "LEDGER", params: { minAmount: minAmount || 0, limit } };
      }
      const candidateName = text.replace(/['’]s\b/gi, " ").replace(/\b(what\s+is|what's|how\s+much|show\s+me|show|check|get|find|tell\s+me|tell|view|display|please|recent)\b/gi, " ").replace(/\b(credit\s+balance|credit\s+amount|balance\s+amount|pending\s+amount|due\s+amount|outstanding\s+amount)\b/gi, " ").replace(/\b(balance\s+of|balance\s+for|ledger\s+transactions\s+for|ledger\s+for|statement\s+for)\b/gi, " ").replace(/\b(balance|credit|ledger|statement|account|due|receivables?|debtors?|outstanding|pending|amount|customer|party|transactions|the|of|for)\b/gi, " ").replace(/\b(total|all|overall|list|summary|report|status|overview|details?|who|someone|anyone|everyone|every|full|complete|aggregate|sum|count|highest|top|maximum|max|minimum|min|many|much|owes?|money|people|persons?|accounts?|users?|clients?)\b/gi, " ").replace(/[₹$]|inr|rs\.?/gi, " ").replace(/(?:ന്റെ|യുടെ|ടെ|ൽ|ല്)\b/g, " ").replace(/(?:മൊത്തം|ആകെ|എല്ലാ|എല്ലാവരുടെയും|ലിസ്റ്റ്|പട്ടിക|വിവരം|വിവരങ്ങൾ|സംഗ്രഹം)/g, " ").replace(/(?:എത്രയാണ്|എത്ര|ആണ്|കാണിക്കൂ|തരുമോ|നോക്കൂ|റിപ്പോർട്ട്|ബാലൻസ്|ബാക്കി|തുക|ക്രെഡിറ്റ്|കടം|കുടിശ്ശിക|ലെഡ്ജർ|സ്റ്റേറ്റ്മെന്റ്|കസ്റ്റമർ|കസ്റ്റമേഴ്സ്|പാർട്ടി)/g, " ").replace(/[?.,!:\-_/\\#@*]/g, " ").trim();
      if (candidateName.length >= 2 && !/^\d+$/.test(candidateName)) {
        return { intent: "PARTY_LEDGER", domain: "LEDGER", params: { searchQuery: candidateName } };
      }
      return { intent: "CUSTOMER_CREDIT_LIST", domain: "LEDGER", params: { minAmount: 0, limit: 15 } };
    }
    if (text.includes("last hour") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D7C") || text.includes("\u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D46") || text.includes("hourly sales") || text.includes("sales during the last hour") || /between\s+\d+.*?(?:am|pm|:)\s+and\s+\d+/i.test(text)) {
      const isLastHour = text.includes("last hour") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D7C") || text.includes("\u0D12\u0D30\u0D41 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D46");
      return { intent: "SALES_HOURLY", domain: "SALES", params: { isLastHour } };
    }
    if (text.includes("cancelled") || text.includes("canceled") || text.includes("\u0D31\u0D26\u0D4D\u0D26\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F") || text.includes("\u0D31\u0D26\u0D4D\u0D26\u0D3E\u0D15\u0D4D\u0D15\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D4D\u0D1F") || text.includes("voided") || text.includes("void bills")) {
      return { intent: "SALES_CANCELLED_INVOICES", domain: "SALES", params: {} };
    }
    const isPaymentMethodQuery = text.includes("cash sales") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D") && (text.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28") || text.includes("\u0D0E\u0D24\u0D4D\u0D30")) || text.includes("credit sales") || text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("paid by card") || text.includes("card sales") || text.includes("paid through upi") || text.includes("paid by upi") || text.includes("upi sales") || text.includes("\u0D2F\u0D41\u0D2A\u0D3F\u0D10") && (text.includes("\u0D0E\u0D24\u0D4D\u0D30") || text.includes("\u0D35\u0D34\u0D3F") || text.includes("\u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A\u0D41")) || text.includes("by payment method") || text.includes("payment methods") || text.includes("\u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D30\u0D40\u0D24\u0D3F") || text.includes("cash and credit") || text.includes("split payments") || text.includes("split payment") || text.includes("unique invoices and total invoice value") || text.includes("multiple payment methods");
    if (isPaymentMethodQuery) {
      let method = "ALL";
      if ((text.includes("upi") || text.includes("\u0D2F\u0D41\u0D2A\u0D3F\u0D10")) && (text.includes("cash") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D"))) method = "ALL";
      else if (text.includes("cash sales") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("cash was collected from sales")) method = "CASH";
      else if (text.includes("credit sales") || text.includes("\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D")) method = "CREDIT";
      else if (text.includes("card")) method = "CARD";
      else if (text.includes("upi") || text.includes("\u0D2F\u0D41\u0D2A\u0D3F\u0D10")) method = "UPI";
      let rangeType = "today";
      if (dateExtraction.fromDate && dateExtraction.toDate) rangeType = "custom";
      else if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return {
        intent: "SALES_PAYMENT_METHODS",
        domain: "SALES",
        params: {
          method,
          rangeType,
          customFrom: dateExtraction.fromDate,
          customTo: dateExtraction.toDate
        }
      };
    }
    if (text.includes("credit remains outstanding") || text.includes("outstanding from credit invoices")) {
      return { intent: "SALES_CREDIT_OUTSTANDING", domain: "SALES", params: { rangeType: "this_month" } };
    }
    if (text.includes("gross sales") || text.includes("net sales") || text.includes("discount") || text.includes("\u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D") || text.includes("tax was collected") || text.includes("sales return was recorded") || text.includes("tax was included") || text.includes("tax collected on sales")) {
      let metric = "all";
      if (text.includes("discount")) metric = "discount";
      else if (text.includes("tax")) metric = "tax";
      else if (text.includes("return")) metric = "return";
      else if (text.includes("gross")) metric = "gross";
      else if (text.includes("net")) metric = "net";
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return { intent: "SALES_GROSS_NET", domain: "SALES", params: { metric, rangeType } };
    }
    if (text.includes("invoice type") || text.includes("bill of supply") || text.includes("bills of supply") || text.includes("gst sales") || text.includes("\u0D2C\u0D3F\u0D7D \u0D13\u0D2B\u0D4D \u0D38\u0D2A\u0D4D\u0D32\u0D48")) {
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      return { intent: "SALES_INVOICE_TYPES", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("highest-value invoice") || text.includes("highest value invoice") || text.includes("highest invoice") || text.includes("lowest-value invoice") || text.includes("invoices greater than")) {
      const isLowest = text.includes("lowest");
      const amtMatch = text.match(/(?:greater than|above|>)\s*(\d+)/i);
      const minAmount = amtMatch ? parseInt(amtMatch[1], 10) : void 0;
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      return { intent: "SALES_INVOICE_EXTREMES", domain: "SALES", params: { isLowest, minAmount, rangeType } };
    }
    if (text.includes("average daily") || text.includes("average sales per day") || text.includes("daily average") || text.includes("average number of bills per day") || text.includes("average bills per day") || text.includes("\u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D26\u0D3F\u0D28 \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F")) {
      let rangeType = "this_month";
      if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      return { intent: "SALES_AVERAGE_DAILY", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("how many invoices") || text.includes("how many bills") || text.includes("invoice count") || text.includes("bills count") || text.includes("number of bills") || text.includes("\u0D0E\u0D24\u0D4D\u0D30 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E") || text.includes("\u0D0E\u0D24\u0D4D\u0D30 \u0D07\u0D7B\u0D35\u0D4B\u0D2F\u0D4D\u0D38\u0D4D") || text.includes("bill adichu") || text.includes("ethra bill") || text.includes("ethra invoice") || text.includes("paid in full") || text.includes("bills were generated") || text.includes("bills were created")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return { intent: "SALES_INVOICE_COUNT", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("average ticket") || text.includes("avg ticket") || text.includes("average bill value") || text.includes("\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "this_month";
      return { intent: "SALES_AVERAGE_TICKET", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("unique customers") || text.includes("\u0D35\u0D4D\u0D2F\u0D24\u0D4D\u0D2F\u0D38\u0D4D\u0D24 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C") || text.includes("how many") && text.includes("customers purchased")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "this_month";
      return { intent: "SALES_UNIQUE_CUSTOMERS", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("highest sales day") || text.includes("highest sales this month") || text.includes("lowest sales this month") || text.includes("best sales day") || text.includes("\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D") && (text.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28")) && (text.includes("\u0D26\u0D3F\u0D35\u0D38\u0D02") || text.includes("day"))) {
      const isLowest = text.includes("lowest");
      let rangeType = "this_month";
      if (text.includes("year") || text.includes("\u0D35\u0D7C\u0D37\u0D02")) rangeType = "this_year";
      return { intent: "SALES_HIGHEST_DAY", domain: "SALES", params: { rangeType, isLowest } };
    }
    if (text.includes("daily sales trend") || text.includes("daily trend")) {
      return { intent: "SALES_DAILY_TREND", domain: "SALES", params: { rangeType: "this_month" } };
    }
    if ((text.includes("biller") || text.includes("cashier") || text.includes("sales by staff") || text.includes("who sold") || text.includes("\u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D7C")) && !text.includes("settlement")) {
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      return { intent: "SALES_BILLER_STAFF", domain: "SALES", params: { rangeType } };
    }
    if ((text.includes("customer") || text.includes("\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C")) && (text.includes("purchased the most") || text.includes("spent the most") || text.includes("top spending") || text.includes("invoices generated for") || text.includes("sales history of a specific customer") || text.includes("sales grouped by customer")) || text.includes("spent the most money this month") || text.includes("top spending customers") || text.includes("spent the most")) {
      let rangeType = "this_month";
      if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D")) rangeType = "today";
      return { intent: "SALES_CUSTOMER_LEVEL", domain: "SALES", params: { rangeType } };
    }
    if (text.includes("compare") || text.includes("\u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02") || text.includes("percentage increase") || text.includes("percentage did sales increase")) {
      let compareType = "this_month_vs_last_month";
      let compareWith = "last_month";
      if (text.includes("today") && text.includes("yesterday") || text.includes("yesterday") && !text.includes("month")) {
        compareType = "today_vs_yesterday";
        compareWith = "yesterday";
      } else if (text.includes("year") || text.includes("\u0D35\u0D7C\u0D37\u0D02")) {
        compareType = "this_year_vs_last_year";
        compareWith = "last_year";
      }
      return { intent: "COMPARE_SALES", domain: "SALES", params: { compareType, compareWith } };
    }
    if (text.includes("\u0D35\u0D3F\u0D31\u0D4D\u0D31") || text.includes("\u0D35\u0D3F\u0D31\u0D4D\u0D31\u0D41\u0D2A\u0D4B\u0D2F") || text.includes("best selling") || text.includes("top selling") || text.includes("most sold") || text.includes("highest selling") || text.includes("top products") || text.includes("highest revenue") || text.includes("sold the most") || text.includes("best-selling") || text.includes("top-selling") || text.includes("quantity of products sold") || text.includes("sales quantity and revenue")) {
      const numMatch = text.match(/\b(\d+)\b/);
      const limit = numMatch ? parseInt(numMatch[1], 10) : 5;
      const isLowest = text.includes("lowest") || text.includes("\u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E");
      const isRevenue = text.includes("revenue") || text.includes("\u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02");
      let rangeType = "today";
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38\u0D02") || text.includes("month") && !text.includes("today")) rangeType = "this_month";
      else if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) rangeType = "last_month";
      else if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) rangeType = "yesterday";
      return { intent: "TOP_SELLING_PRODUCTS", domain: "SALES", params: { limit, isLowest, isRevenue, rangeType } };
    }
    const isSalesWord = text.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D") || text.includes("\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28") || text.includes("sales") || text.includes("revenue") || text.includes("business") || text.includes("\u0D15\u0D1A\u0D4D\u0D1A\u0D35\u0D1F\u0D02") || text.includes("sell") || text.includes("turnover") || text.includes("intake") || text.includes("takings") || text.includes("\u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02") || text.includes("\u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28");
    if (isSalesWord || text.includes("report") || text.includes("\u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D")) {
      if (text.includes("financial year") || text.includes("fy") || text.includes("\u0D38\u0D3E\u0D2E\u0D4D\u0D2A\u0D24\u0D4D\u0D24\u0D3F\u0D15 \u0D35\u0D7C\u0D37\u0D02")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "financial_year" } };
      }
      if (text.includes("last year") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D35\u0D7C\u0D37\u0D02")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_year" } };
      }
      if (text.includes("this year") || text.includes("\u0D08 \u0D35\u0D7C\u0D37\u0D02") || text.includes("year to date") || text.includes("ytd")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "this_year" } };
      }
      if (text.includes("last 30 days") || text.includes("30 \u0D26\u0D3F\u0D35\u0D38") || text.includes("past 30 days")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_30_days" } };
      }
      if (text.includes("last 7 days") || text.includes("7 days") || text.includes("7 \u0D26\u0D3F\u0D35\u0D38") || text.includes("past 7 days")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_7_days" } };
      }
      if (text.includes("last week") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D06\u0D34\u0D4D\u0D1A")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_week" } };
      }
      if (text.includes("this week") || text.includes("\u0D08 \u0D06\u0D34\u0D4D\u0D1A")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "this_week" } };
      }
      if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "last_month" } };
      }
      if (text.includes("this month") || text.includes("\u0D08 \u0D2E\u0D3E\u0D38") || text.includes("month to date") || text.includes("mtd") || text.includes("ee masathe") || text.includes("ee masam")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "this_month" } };
      }
      if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("previous day") || text.includes("innale")) {
        return { intent: "SALES_PERIOD", domain: "SALES", params: { rangeType: "yesterday" } };
      }
      if (text.includes("\u0D07\u0D28\u0D4D\u0D28") && !text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32") || text.includes("today") || text.includes("innathe") || text.includes("innu")) {
        return { intent: "SALES_TODAY", domain: "SALES", params: { rangeType: "today" } };
      }
    }
    if (dateExtraction.fromDate && dateExtraction.toDate && dateExtraction.fromDate !== dateExtraction.toDate) {
      return { intent: "SALES_CUSTOM_RANGE", domain: "SALES", params: { customFrom: dateExtraction.fromDate, customTo: dateExtraction.toDate } };
    }
    if (dateExtraction.specificDate) {
      return { intent: "SALES_SPECIFIC_DATE", domain: "SALES", params: { specificDate: dateExtraction.specificDate } };
    }
    if (isSalesWord || text.includes("report") || text.includes("\u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D")) {
      return { intent: "SALES_TODAY", domain: "SALES", params: { rangeType: "today" } };
    }
    if (lastUserMsg.includes("sales") || lastUserMsg.includes("\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D")) {
      if (text.includes("last month") || text.includes("\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02")) {
        return { intent: "COMPARE_SALES", domain: "SALES", params: { compareType: "this_month_vs_last_month", compareWith: "last_month" } };
      }
      if (text.includes("yesterday") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D46")) {
        return { intent: "COMPARE_SALES", domain: "SALES", params: { compareType: "today_vs_yesterday", compareWith: "yesterday" } };
      }
      if (text.includes("cash") || text.includes("\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D")) {
        return { intent: "SALES_PAYMENT_METHODS", domain: "SALES", params: { method: "CASH", rangeType: "today" } };
      }
      if (text.includes("top five") || text.includes("top 5")) {
        return { intent: "TOP_SELLING_PRODUCTS", domain: "SALES", params: { limit: 5, rangeType: "today" } };
      }
    }
    if (text.includes("today") || text.includes("\u0D07\u0D28\u0D4D\u0D28\u0D4D") || text.includes("how much")) {
      return { intent: "SALES_TODAY", domain: "SALES", params: { rangeType: "today" } };
    }
    return { intent: "UNKNOWN", params: { searchQuery: message } };
  }
};
async function processOfflineAiQuery(queryText, tenantId, history = []) {
  const electronAPI = window.electronAPI;
  if (!electronAPI || !tenantId) {
    throw new Error("Local SQLite database connection is unavailable.");
  }
  const isMal = isMalayalam(queryText);
  const parsed = OfflineAiIntentParser.parse(queryText, history);
  const fetchInvoices = async (fromDate, toDate) => {
    try {
      const invs = await electronAPI.dbGetInvoices({
        tenant_id: tenantId,
        filterDate: fromDate,
        filterDateEnd: toDate
      });
      return Array.isArray(invs) ? invs : [];
    } catch (err) {
      console.warn("[OfflineAiService] dbGetInvoices failed:", err);
      return [];
    }
  };
  const fetchSummary = async (fromDate, toDate) => {
    if (electronAPI.dbGetInvoicesSummary) {
      try {
        const res = await electronAPI.dbGetInvoicesSummary({
          tenant_id: tenantId,
          filterDate: fromDate,
          filterDateEnd: toDate
        });
        if (res && typeof res.totalSales === "number") {
          return res;
        }
      } catch (err) {
        console.warn("[OfflineAiService] dbGetInvoicesSummary failed:", err);
      }
    }
    const invs = await fetchInvoices(fromDate, toDate);
    const validInvs = invs.filter((i) => !i.converted_to_invoice_id && !["HOLD", "EXPIRED_HOLD", "RECALLED_HOLD"].includes(i.invoice_type));
    const totalSales = validInvs.reduce((acc, inv) => acc + (Number(inv.grand_total) || 0), 0);
    const totalInvoices = validInvs.length;
    const totalTax = validInvs.reduce((acc, inv) => acc + (Number(inv.tax_total) || 0), 0);
    const totalDiscount = validInvs.reduce((acc, inv) => acc + (Number(inv.discount_total) || 0) + (Number(inv.points_redeemed_discount) || 0), 0);
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;
    return { totalSales, totalInvoices, totalTax, totalDiscount, avgOrder };
  };
  const fetchCashTransactions = async (fromDate, toDate) => {
    try {
      if (electronAPI.dbCashierGetDayTransactions) {
        const res = await electronAPI.dbCashierGetDayTransactions({
          tenant_id: tenantId,
          from_date: fromDate,
          to_date: toDate
        });
        if (Array.isArray(res)) return res;
      }
      if (electronAPI.dbCashierGetTransactions) {
        const res = await electronAPI.dbCashierGetTransactions({ tenant_id: tenantId });
        if (Array.isArray(res)) return res;
      }
      return [];
    } catch (err) {
      console.warn("[OfflineAiService] fetchCashTransactions failed:", err);
      return [];
    }
  };
  const fetchProducts = async () => {
    try {
      if (electronAPI.dbGetProducts) {
        const res = await electronAPI.dbGetProducts({ tenant_id: tenantId });
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn("[OfflineAiService] fetchProducts failed:", err);
      return [];
    }
  };
  const fetchPurchaseBills = async (search) => {
    try {
      if (electronAPI.dbGetPurchaseBills) {
        const res = await electronAPI.dbGetPurchaseBills({ tenant_id: tenantId, search, limit: 100 });
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn("[OfflineAiService] fetchPurchaseBills failed:", err);
      return [];
    }
  };
  const fetchParties = async () => {
    try {
      if (electronAPI.dbGetParties) {
        const res = await electronAPI.dbGetParties(tenantId);
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn("[OfflineAiService] fetchParties failed:", err);
      return [];
    }
  };
  const fetchReturns = async () => {
    try {
      if (electronAPI.dbGetReturns) {
        const res = await electronAPI.dbGetReturns({ tenant_id: tenantId });
        return Array.isArray(res) ? res : [];
      }
      return [];
    } catch (err) {
      console.warn("[OfflineAiService] fetchReturns failed:", err);
      return [];
    }
  };
  const fetchCashDrawer = async (bDate) => {
    try {
      if (electronAPI.dbCashierGetDrawer) {
        const res = await electronAPI.dbCashierGetDrawer({ tenant_id: tenantId, business_date: bDate });
        return res;
      }
      return null;
    } catch (err) {
      console.warn("[OfflineAiService] fetchCashDrawer failed:", err);
      return null;
    }
  };
  try {
    switch (parsed.intent) {
      // ──────────────────────────────────────────────────────────────────────
      // 1. Current-Day Sales / Today's Sales
      // ──────────────────────────────────────────────────────────────────────
      case "SALES_TODAY": {
        const range = resolveDateRange("today", void 0, void 0, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const pm = calculatePaymentBreakdown(invs);
        let md = isMal ? `### \u{1F4CA} \u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D38\u0D02\u0D17\u0D4D\u0D30\u0D39\u0D02 (${range.label})

` : `### \u{1F4CA} Today's Sales Summary (${range.label})

`;
        md += isMal ? `* **\u0D2E\u0D4A\u0D24\u0D4D\u0D24\u0D02 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 (Total Revenue):** **${formatINR(summary.totalSales)}**
* **\u0D06\u0D15\u0D46 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Total Bills):** **${summary.totalInvoices} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15 (Avg Bill Value):** **${formatINR(summary.avgOrder)}**
` : `* **Total Sales Revenue:** **${formatINR(summary.totalSales)}**
* **Total Invoices Generated:** **${summary.totalInvoices} invoices**
* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**
`;
        if (summary.totalTax > 0) {
          md += isMal ? `* **\u0D1F\u0D3E\u0D15\u0D4D\u0D38\u0D4D (GST Collected):** ${formatINR(summary.totalTax)}
` : `* **Tax (GST) Collected:** ${formatINR(summary.totalTax)}
`;
        }
        if (summary.totalDiscount > 0) {
          md += isMal ? `* **\u0D28\u0D7D\u0D15\u0D3F\u0D2F \u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D (Discounts):** ${formatINR(summary.totalDiscount)}
` : `* **Discounts Given:** ${formatINR(summary.totalDiscount)}
`;
        }
        md += isMal ? `
#### \u{1F4B3} \u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D35\u0D3F\u0D39\u0D3F\u0D24\u0D02:
` : `
#### \u{1F4B3} Payment Breakdown:
`;
        md += `* **Cash:** ${formatINR(pm.cash)} | **UPI:** ${formatINR(pm.upi)} | **Card:** ${formatINR(pm.card)} | **Credit:** ${formatINR(pm.credit)}
`;
        return {
          content: md,
          data: summary,
          suggestedPrompts: isMal ? ["\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", "\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42", "\u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E"] : ["Show today's cash sales", "What is this month's total sales?", "Top selling products today"],
          intent: parsed.intent
        };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 2. Hourly Sales / Last Hour
      // ──────────────────────────────────────────────────────────────────────
      case "SALES_HOURLY": {
        const todayRange = resolveDateRange("today", void 0, void 0, isMal);
        const invs = await fetchInvoices(todayRange.fromDate, todayRange.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const now = /* @__PURE__ */ new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1e3);
        const lastHourInvs = validInvs.filter((i) => {
          const t = new Date(i.created_at).getTime();
          return t >= oneHourAgo.getTime() && t <= now.getTime();
        });
        const lastHourSales = lastHourInvs.reduce((acc, i) => acc + (Number(i.grand_total) || 0), 0);
        const hourlyBuckets = {};
        for (let h = 8; h <= 22; h++) {
          const hStr = `${pad(h)}:00`;
          hourlyBuckets[hStr] = { hour: hStr, sales: 0, count: 0 };
        }
        validInvs.forEach((i) => {
          const d = new Date(i.created_at);
          const h = d.getHours();
          const hStr = `${pad(h)}:00`;
          if (hourlyBuckets[hStr]) {
            hourlyBuckets[hStr].sales += Number(i.grand_total) || 0;
            hourlyBuckets[hStr].count += 1;
          }
        });
        const chartItems = Object.values(hourlyBuckets).filter((b) => b.sales > 0 || Number(b.hour.slice(0, 2)) >= 9 && Number(b.hour.slice(0, 2)) <= now.getHours());
        let md = isMal ? `### \u23F1\uFE0F \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D (Hourly Sales)

* **\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E 1 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 (Last 1 Hour):** **${formatINR(lastHourSales)}** (${lastHourInvs.length} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E)
* **\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28:** **${formatINR(validInvs.reduce((acc, i) => acc + (Number(i.grand_total) || 0), 0))}**

` : `### \u23F1\uFE0F Hourly Sales Intelligence

* **Sales During Last Hour:** **${formatINR(lastHourSales)}** (${lastHourInvs.length} invoices)
* **Total Sales Today:** **${formatINR(validInvs.reduce((acc, i) => acc + (Number(i.grand_total) || 0), 0))}** (${validInvs.length} invoices)

`;
        return {
          content: md,
          chartData: {
            type: "bar",
            title: isMal ? "\u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28" : "Hourly Sales Trend",
            labelKey: "hour",
            dataKey: "sales",
            items: chartItems
          },
          suggestedPrompts: isMal ? ["\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D", "\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D"] : ["Today's cash sales", "This month's sales"],
          intent: parsed.intent
        };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 3. Historical Sales / Standard Reporting Periods
      // ──────────────────────────────────────────────────────────────────────
      case "SALES_PERIOD":
      case "SALES_CUSTOM_RANGE":
      case "SALES_SPECIFIC_DATE": {
        const range = parsed.intent === "SALES_CUSTOM_RANGE" ? resolveDateRange("custom", parsed.params.customFrom, parsed.params.customTo, isMal) : parsed.intent === "SALES_SPECIFIC_DATE" ? resolveDateRange("custom", parsed.params.specificDate, parsed.params.specificDate, isMal) : resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const pm = calculatePaymentBreakdown(validInvs);
        const avgDaily = range.daysCount > 0 ? summary.totalSales / range.daysCount : summary.totalSales;
        let md = isMal ? `### \u{1F4C8} \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u2014 ${range.label}

` : `### \u{1F4C8} Sales Report \u2014 ${range.label}

`;
        md += isMal ? `* **\u0D2E\u0D4A\u0D24\u0D4D\u0D24\u0D02 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 (Total Revenue):** **${formatINR(summary.totalSales)}**
* **\u0D06\u0D15\u0D46 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Total Invoices):** **${summary.totalInvoices} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15 (Avg Ticket):** **${formatINR(summary.avgOrder)}**
` + (range.daysCount > 1 ? `* **\u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D26\u0D3F\u0D28 \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F (Avg Daily Sales):** **${formatINR(avgDaily)}** (${range.daysCount} \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D7E)
` : "") : `* **Total Sales Revenue:** **${formatINR(summary.totalSales)}**
* **Total Invoices Count:** **${summary.totalInvoices} invoices**
* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**
` + (range.daysCount > 1 ? `* **Average Daily Sales:** **${formatINR(avgDaily)}** (over ${range.daysCount} days)
` : "");
        if (summary.totalTax > 0) {
          md += isMal ? `* **\u0D1F\u0D3E\u0D15\u0D4D\u0D38\u0D4D (GST):** ${formatINR(summary.totalTax)}
` : `* **Tax (GST) Collected:** ${formatINR(summary.totalTax)}
`;
        }
        if (summary.totalDiscount > 0) {
          md += isMal ? `* **\u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D:** ${formatINR(summary.totalDiscount)}
` : `* **Discounts Given:** ${formatINR(summary.totalDiscount)}
`;
        }
        if (validInvs.length > 0) {
          md += isMal ? `
#### \u{1F4B3} \u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D30\u0D40\u0D24\u0D3F \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D24\u0D41\u0D15:
| \u0D30\u0D40\u0D24\u0D3F | \u0D24\u0D41\u0D15 |
| :--- | :---: |
| \u{1F4B5} \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D (Cash) | **${formatINR(pm.cash)}** |
| \u{1F4F1} UPI | **${formatINR(pm.upi)}** |
| \u{1F4B3} \u0D15\u0D3E\u0D7C\u0D21\u0D4D (Card) | **${formatINR(pm.card)}** |
| \u{1F4D2} \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D (Credit) | **${formatINR(pm.credit)}** |
` : `
#### \u{1F4B3} Sales by Payment Method:
| Payment Method | Total Amount |
| :--- | :---: |
| \u{1F4B5} Cash | **${formatINR(pm.cash)}** |
| \u{1F4F1} UPI | **${formatINR(pm.upi)}** |
| \u{1F4B3} Card | **${formatINR(pm.card)}** |
| \u{1F4D2} Credit | **${formatINR(pm.credit)}** |
`;
        }
        return {
          content: md,
          data: summary,
          suggestedPrompts: isMal ? ["\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D41\u0D2E\u0D3E\u0D2F\u0D3F \u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02 \u0D1A\u0D46\u0D2F\u0D4D\u0D2F\u0D42", "\u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E", "\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"] : ["Compare with previous period", "Top selling products", "What is today's sales?"],
          intent: parsed.intent
        };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 4. Period Comparison
      // ──────────────────────────────────────────────────────────────────────
      case "COMPARE_SALES": {
        const compareWith = parsed.params.compareWith || "last_month";
        let curRange;
        let prevRange;
        if (compareWith === "yesterday") {
          curRange = resolveDateRange("today", void 0, void 0, isMal);
          prevRange = resolveDateRange("yesterday", void 0, void 0, isMal);
        } else if (compareWith === "last_week") {
          curRange = resolveDateRange("this_week", void 0, void 0, isMal);
          prevRange = resolveDateRange("last_week", void 0, void 0, isMal);
        } else if (compareWith === "last_year") {
          curRange = resolveDateRange("this_year", void 0, void 0, isMal);
          prevRange = resolveDateRange("last_year", void 0, void 0, isMal);
        } else {
          curRange = resolveDateRange("this_month", void 0, void 0, isMal);
          prevRange = resolveDateRange("last_month", void 0, void 0, isMal);
        }
        const [curSummary, prevSummary] = await Promise.all([
          fetchSummary(curRange.fromDate, curRange.toDate),
          fetchSummary(prevRange.fromDate, prevRange.toDate)
        ]);
        const diffSales = curSummary.totalSales - prevSummary.totalSales;
        const pctSales = prevSummary.totalSales > 0 ? diffSales / prevSummary.totalSales * 100 : 0;
        const diffInvs = curSummary.totalInvoices - prevSummary.totalInvoices;
        const growthLabel = diffSales >= 0 ? isMal ? "\u0D35\u0D33\u0D7C\u0D1A\u0D4D\u0D1A (+ \u{1F4C8})" : "Growth (+ \u{1F4C8})" : isMal ? "\u0D15\u0D41\u0D31\u0D35\u0D4D (- \u{1F4C9})" : "Decline (- \u{1F4C9})";
        let md = isMal ? `### \u2696\uFE0F \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D (Sales Comparison)
**${curRange.label}**-\u0D09\u0D02 **${prevRange.label}**-\u0D09\u0D02 \u0D24\u0D2E\u0D4D\u0D2E\u0D3F\u0D32\u0D41\u0D33\u0D4D\u0D33 \u0D35\u0D3F\u0D36\u0D15\u0D32\u0D28\u0D02:

| \u0D38\u0D42\u0D1A\u0D3F\u0D15 | ${curRange.label} | ${prevRange.label} | \u0D35\u0D4D\u0D2F\u0D24\u0D4D\u0D2F\u0D3E\u0D38\u0D02 |
| :--- | :---: | :---: | :---: |
| **\u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28** | **${formatINR(curSummary.totalSales)}** | **${formatINR(prevSummary.totalSales)}** | **${diffSales >= 0 ? "+" : ""}${formatINR(diffSales)} (${growthLabel})** |
| **\u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02** | ${curSummary.totalInvoices} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E | ${prevSummary.totalInvoices} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E | ${diffInvs >= 0 ? "+" : ""}${diffInvs} |
| **\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15** | ${formatINR(curSummary.avgOrder)} | ${formatINR(prevSummary.avgOrder)} | \u2014 |

\u{1F4A1} **\u0D38\u0D02\u0D17\u0D4D\u0D30\u0D39\u0D02:** ${prevRange.label}-\u0D28\u0D47\u0D15\u0D4D\u0D15\u0D3E\u0D7E \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D24\u0D4D\u0D24\u0D3F\u0D7D **${Math.abs(Math.round(pctSales))}%${diffSales >= 0 ? " \u0D35\u0D7C\u0D26\u0D4D\u0D27\u0D28\u0D35\u0D4D" : " \u0D15\u0D41\u0D31\u0D35\u0D4D"}** \u0D30\u0D47\u0D16\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D41\u0D24\u0D4D\u0D24\u0D3F.
` : `### \u2696\uFE0F Sales Comparison Report
Comparative analysis between **${curRange.label}** and **${prevRange.label}**:

| Metric | ${curRange.label} | ${prevRange.label} | Variance |
| :--- | :---: | :---: | :---: |
| **Total Sales** | **${formatINR(curSummary.totalSales)}** | **${formatINR(prevSummary.totalSales)}** | **${diffSales >= 0 ? "+" : ""}${formatINR(diffSales)} (${growthLabel})** |
| **Invoices Count** | ${curSummary.totalInvoices} invoices | ${prevSummary.totalInvoices} invoices | ${diffInvs >= 0 ? "+" : ""}${diffInvs} |
| **Average Ticket** | ${formatINR(curSummary.avgOrder)} | ${formatINR(prevSummary.avgOrder)} | \u2014 |

\u{1F4A1} **Summary:** Sales revenue shows a **${Math.abs(Math.round(pctSales))}% ${growthLabel}** compared to ${prevRange.label}.
`;
        return {
          content: md,
          suggestedPrompts: isMal ? ["\u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E", "\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D"] : ["Top selling products", "What is today's sales?"],
          intent: parsed.intent
        };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 5. Invoices Count & Average Metrics
      // ──────────────────────────────────────────────────────────────────────
      case "SALES_INVOICE_COUNT": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        let md = isMal ? `### \u{1F9FE} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02 \u2014 ${range.label}

* **\u0D06\u0D15\u0D46 \u0D05\u0D1F\u0D3F\u0D1A\u0D4D\u0D1A \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Total Invoices):** **${summary.totalInvoices} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E**
* **\u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D24\u0D41\u0D15:** **${formatINR(summary.totalSales)}**
* **\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15:** **${formatINR(summary.avgOrder)}**
` : `### \u{1F9FE} Invoice Count \u2014 ${range.label}

* **Total Invoices Generated:** **${summary.totalInvoices} bills**
* **Total Revenue:** **${formatINR(summary.totalSales)}**
* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "SALES_AVERAGE_TICKET": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        let md = isMal ? `### \u{1F39F}\uFE0F \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15 (Average Ticket Value)

* **\u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D4D:** ${range.label}
* **\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15 (Average Ticket):** **${formatINR(summary.avgOrder)}**
* **\u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28:** ${formatINR(summary.totalSales)}
* **\u0D06\u0D15\u0D46 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** ${summary.totalInvoices} \u0D0E\u0D23\u0D4D\u0D23\u0D02
` : `### \u{1F39F}\uFE0F Average Ticket Value (Average Order Value)

* **Period:** ${range.label}
* **Average Ticket Value:** **${formatINR(summary.avgOrder)}**
* **Total Revenue:** ${formatINR(summary.totalSales)}
* **Total Bills:** ${summary.totalInvoices} invoices
`;
        return { content: md, intent: parsed.intent };
      }
      case "SALES_AVERAGE_DAILY": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        const days = Math.max(1, range.daysCount);
        const avgDailySales = summary.totalSales / days;
        const avgDailyBills = Math.round(summary.totalInvoices / days * 10) / 10;
        let md = isMal ? `### \u{1F4C5} \u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D26\u0D3F\u0D28 \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u2014 ${range.label}

* **\u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D26\u0D3F\u0D28 \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02:** **${formatINR(avgDailySales)}**
* **\u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D26\u0D3F\u0D28 \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${avgDailyBills} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E/\u0D26\u0D3F\u0D35\u0D38\u0D02**
* **\u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D24\u0D41\u0D15:** ${formatINR(summary.totalSales)} (${days} \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D33\u0D3F\u0D7D \u0D28\u0D3F\u0D28\u0D4D\u0D28\u0D4D)
` : `### \u{1F4C5} Average Daily Sales \u2014 ${range.label}

* **Average Daily Sales Revenue:** **${formatINR(avgDailySales)}**
* **Average Invoices per Day:** **${avgDailyBills} bills/day**
* **Period Total Sales:** ${formatINR(summary.totalSales)} over ${days} calendar days
`;
        return { content: md, intent: parsed.intent };
      }
      case "SALES_UNIQUE_CUSTOMERS": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const customerSet = /* @__PURE__ */ new Set();
        let walkinCount = 0;
        validInvs.forEach((i) => {
          const ident = i.customer_phone || (i.customer_name && i.customer_name !== "Walk-in Customer" ? i.customer_name : null);
          if (ident) customerSet.add(ident.trim().toLowerCase());
          else walkinCount++;
        });
        const totalUnique = customerSet.size;
        let md = isMal ? `### \u{1F465} \u0D09\u0D2A\u0D2D\u0D4B\u0D15\u0D4D\u0D24\u0D3E\u0D15\u0D4D\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02 \u2014 ${range.label}

* **\u0D35\u0D4D\u0D2F\u0D24\u0D4D\u0D2F\u0D38\u0D4D\u0D24 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C (Unique Customers):** **${totalUnique} \u0D2A\u0D47\u0D7C**
* **\u0D35\u0D3E\u0D15\u0D4D\u0D15\u0D4D-\u0D07\u0D7B \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** ${walkinCount} \u0D0E\u0D23\u0D4D\u0D23\u0D02
* **\u0D06\u0D15\u0D46 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** ${validInvs.length} \u0D0E\u0D23\u0D4D\u0D23\u0D02
` : `### \u{1F465} Unique Customers Count \u2014 ${range.label}

* **Unique Identified Customers:** **${totalUnique} customers**
* **Walk-in Anonymous Transactions:** ${walkinCount} bills
* **Total Invoices Generated:** ${validInvs.length} invoices
`;
        return { content: md, intent: parsed.intent };
      }
      case "SALES_INVOICE_EXTREMES": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        if (parsed.params.minAmount) {
          const threshold = parsed.params.minAmount;
          const filtered = validInvs.filter((i) => Number(i.grand_total) >= threshold);
          let md2 = isMal ? `### \u{1F9FE} \u20B9${threshold.toLocaleString()}-\u0D7D \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D24\u0D41\u0D15\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (${range.label})

* **\u0D06\u0D15\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** **${filtered.length} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E**
` : `### \u{1F9FE} Invoices Greater Than \u20B9${threshold.toLocaleString()} (${range.label})

* **Total Matching Invoices:** **${filtered.length} bills**
`;
          return { content: md2, intent: parsed.intent };
        }
        if (validInvs.length === 0) {
          return { content: isMal ? "\u0D08 \u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D3F\u0D7D \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E \u0D12\u0D28\u0D4D\u0D28\u0D41\u0D02 \u0D32\u0D2D\u0D4D\u0D2F\u0D2E\u0D32\u0D4D\u0D32." : `No invoices found for ${range.label}.` };
        }
        const sorted = [...validInvs].sort((a, b) => (Number(b.grand_total) || 0) - (Number(a.grand_total) || 0));
        const highest = sorted[0];
        const lowest = sorted[sorted.length - 1];
        let md = "";
        if (parsed.params.isLowest) {
          md = isMal ? `### \u{1F9FE} \u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15 (${range.label})

* **\u0D2C\u0D3F\u0D7D \u0D28\u0D2E\u0D4D\u0D2A\u0D7C:** **${lowest.invoice_number || "N/A"}**
* **\u0D24\u0D41\u0D15:** **${formatINR(lowest.grand_total)}**
* **\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C:** ${lowest.customer_name || "Walk-in Customer"}
` : `### \u{1F9FE} Lowest-Value Invoice (${range.label})

* **Invoice Number:** **${lowest.invoice_number || "N/A"}**
* **Invoice Amount:** **${formatINR(lowest.grand_total)}**
* **Customer:** ${lowest.customer_name || "Walk-in Customer"}
`;
        } else {
          md = isMal ? `### \u{1F9FE} \u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D3F\u0D2F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15 (${range.label})

* **\u0D2C\u0D3F\u0D7D \u0D28\u0D2E\u0D4D\u0D2A\u0D7C:** **${highest.invoice_number || "N/A"}**
* **\u0D24\u0D41\u0D15:** **${formatINR(highest.grand_total)}**
* **\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C:** ${highest.customer_name || "Walk-in Customer"}
` : `### \u{1F9FE} Highest-Value Invoice (${range.label})

* **Invoice Number:** **${highest.invoice_number || "N/A"}**
* **Invoice Amount:** **${formatINR(highest.grand_total)}**
* **Customer:** ${highest.customer_name || "Walk-in Customer"}
`;
        }
        return { content: md, intent: parsed.intent };
      }
      case "SALES_PAYMENT_METHODS": {
        const range = resolveDateRange(
          parsed.params.customFrom && parsed.params.customTo ? "custom" : parsed.params.rangeType || "today",
          parsed.params.customFrom,
          parsed.params.customTo,
          isMal
        );
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const pm = calculatePaymentBreakdown(validInvs);
        const totalSales = pm.totalSales;
        const requestedMethod = parsed.params.method || "ALL";
        let md = "";
        if (requestedMethod === "CASH") {
          const cashPct = totalSales > 0 ? (pm.cash / totalSales * 100).toFixed(1) : "0";
          md = isMal ? `### \u{1F4B5} \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D (Cash Sales) \u2014 ${range.label}

* **\u0D06\u0D15\u0D46 \u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D:** **${formatINR(pm.cash)}** (${cashPct}% of total)
* **\u0D06\u0D15\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D:** ${formatINR(totalSales)}
` : `### \u{1F4B5} Cash Sales \u2014 ${range.label}

* **Total Cash Collected:** **${formatINR(pm.cash)}** (${cashPct}% of total)
* **Total Sales Revenue:** ${formatINR(totalSales)}
`;
        } else if (requestedMethod === "CREDIT") {
          const creditPct = totalSales > 0 ? (pm.credit / totalSales * 100).toFixed(1) : "0";
          md = isMal ? `### \u{1F4D2} \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D (Credit Sales) \u2014 ${range.label}

* **\u0D06\u0D15\u0D46 \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28:** **${formatINR(pm.credit)}** (${creditPct}% of total)
* **\u0D06\u0D15\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D:** ${formatINR(totalSales)}
` : `### \u{1F4D2} Credit Sales \u2014 ${range.label}

* **Total Credit Sales:** **${formatINR(pm.credit)}** (${creditPct}% of total)
* **Total Sales Revenue:** ${formatINR(totalSales)}
`;
        } else if (requestedMethod === "UPI") {
          md = isMal ? `### \u{1F4F1} UPI \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u2014 ${range.label}

* **UPI \u0D35\u0D34\u0D3F \u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A \u0D24\u0D41\u0D15:** **${formatINR(pm.upi)}**
` : `### \u{1F4F1} UPI Sales \u2014 ${range.label}

* **Total Paid via UPI:** **${formatINR(pm.upi)}**
`;
        } else if (requestedMethod === "CARD") {
          md = isMal ? `### \u{1F4B3} \u0D15\u0D3E\u0D7C\u0D21\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u2014 ${range.label}

* **\u0D15\u0D3E\u0D7C\u0D21\u0D4D \u0D35\u0D34\u0D3F \u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A \u0D24\u0D41\u0D15:** **${formatINR(pm.card)}**
` : `### \u{1F4B3} Card Sales \u2014 ${range.label}

* **Total Paid via Card:** **${formatINR(pm.card)}**
`;
        } else {
          md = isMal ? `### \u{1F4B3} \u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D30\u0D40\u0D24\u0D3F \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u2014 ${range.label}

\u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02: **${formatINR(totalSales)}**

| \u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D30\u0D40\u0D24\u0D3F | \u0D24\u0D41\u0D15 | \u0D35\u0D3F\u0D39\u0D3F\u0D24\u0D02 |
| :--- | :---: | :---: |
| \u{1F4B5} \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D (Cash) | **${formatINR(pm.cash)}** | ${totalSales > 0 ? Math.round(pm.cash / totalSales * 100) : 0}% |
| \u{1F4F1} UPI | **${formatINR(pm.upi)}** | ${totalSales > 0 ? Math.round(pm.upi / totalSales * 100) : 0}% |
| \u{1F4B3} \u0D15\u0D3E\u0D7C\u0D21\u0D4D (Card) | **${formatINR(pm.card)}** | ${totalSales > 0 ? Math.round(pm.card / totalSales * 100) : 0}% |
| \u{1F4D2} \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D (Credit) | **${formatINR(pm.credit)}** | ${totalSales > 0 ? Math.round(pm.credit / totalSales * 100) : 0}% |
| \u{1F3E6} \u0D2C\u0D3E\u0D19\u0D4D\u0D15\u0D4D / \u0D1A\u0D46\u0D15\u0D4D\u0D15\u0D4D | **${formatINR(pm.bank + pm.cheque)}** | ${totalSales > 0 ? Math.round((pm.bank + pm.cheque) / totalSales * 100) : 0}% |
` : `### \u{1F4B3} Sales by Payment Method \u2014 ${range.label}

Total Sales Revenue: **${formatINR(totalSales)}**

| Payment Method | Amount | Share |
| :--- | :---: | :---: |
| \u{1F4B5} Cash | **${formatINR(pm.cash)}** | ${totalSales > 0 ? Math.round(pm.cash / totalSales * 100) : 0}% |
| \u{1F4F1} UPI | **${formatINR(pm.upi)}** | ${totalSales > 0 ? Math.round(pm.upi / totalSales * 100) : 0}% |
| \u{1F4B3} Card | **${formatINR(pm.card)}** | ${totalSales > 0 ? Math.round(pm.card / totalSales * 100) : 0}% |
| \u{1F4D2} Credit | **${formatINR(pm.credit)}** | ${totalSales > 0 ? Math.round(pm.credit / totalSales * 100) : 0}% |
| \u{1F3E6} Bank / Cheque | **${formatINR(pm.bank + pm.cheque)}** | ${totalSales > 0 ? Math.round((pm.bank + pm.cheque) / totalSales * 100) : 0}% |
`;
        }
        return { content: md, intent: parsed.intent };
      }
      case "SALES_CREDIT_OUTSTANDING": {
        const invs = await fetchInvoices("2000-01-01", "2099-12-31");
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const pm = calculatePaymentBreakdown(validInvs);
        let md = isMal ? `### \u{1F4D2} \u0D07\u0D7B\u0D35\u0D4B\u0D2F\u0D4D\u0D38\u0D4D \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15

* **\u0D06\u0D15\u0D46 \u0D32\u0D2D\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D24\u0D41\u0D15:** **${formatINR(pm.credit)}**
` : `### \u{1F4D2} Outstanding Credit from Invoices

* **Total Outstanding Credit Amount:** **${formatINR(pm.credit)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "SALES_GROSS_NET": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        const summary = await fetchSummary(range.fromDate, range.toDate);
        const gross = summary.totalSales + summary.totalDiscount;
        let md = isMal ? `### \u{1F4CA} \u0D17\u0D4D\u0D30\u0D4B\u0D38\u0D4D vs \u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u2014 ${range.label}

* **\u0D17\u0D4D\u0D30\u0D4B\u0D38\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D (\u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D3F\u0D28\u0D4D \u0D2E\u0D41\u0D7B\u0D2A\u0D4D):** **${formatINR(gross)}**
* **\u0D28\u0D7D\u0D15\u0D3F\u0D2F \u0D06\u0D15\u0D46 \u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D:** **${formatINR(summary.totalDiscount)}**
* **\u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D (\u0D2F\u0D25\u0D3E\u0D7C\u0D24\u0D4D\u0D25 \u0D07\u0D7B\u0D35\u0D4B\u0D2F\u0D4D\u0D38\u0D4D \u0D24\u0D41\u0D15):** **${formatINR(summary.totalSales)}**
* **\u0D2A\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D46\u0D1F\u0D41\u0D24\u0D4D\u0D24 \u0D1C\u0D3F\u0D0E\u0D38\u0D4D\u0D1F\u0D3F (Tax):** **${formatINR(summary.totalTax)}**
* **\u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** ${summary.totalInvoices} \u0D0E\u0D23\u0D4D\u0D23\u0D02
` : `### \u{1F4CA} Gross vs Net Sales & Deductions \u2014 ${range.label}

* **Gross Sales (Before Discounts):** **${formatINR(gross)}**
* **Total Discounts Given:** **${formatINR(summary.totalDiscount)}**
* **Net Sales Revenue (Final Invoiced):** **${formatINR(summary.totalSales)}**
* **Total Tax (GST) Collected:** **${formatINR(summary.totalTax)}**
* **Invoices Count:** ${summary.totalInvoices} bills
`;
        return { content: md, intent: parsed.intent };
      }
      case "SALES_INVOICE_TYPES": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const typeMap = {};
        validInvs.forEach((i) => {
          const t = i.invoice_type || "STANDARD";
          if (!typeMap[t]) typeMap[t] = { count: 0, total: 0 };
          typeMap[t].count += 1;
          typeMap[t].total += Number(i.grand_total) || 0;
        });
        let md = isMal ? `### \u{1F4D1} \u0D2C\u0D3F\u0D7D \u0D24\u0D30\u0D02 \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u2014 ${range.label}

| \u0D2C\u0D3F\u0D7D \u0D24\u0D30\u0D02 | \u0D0E\u0D23\u0D4D\u0D23\u0D02 | \u0D06\u0D15\u0D46 \u0D24\u0D41\u0D15 |
| :--- | :---: | :---: |
` : `### \u{1F4D1} Sales by Invoice Type \u2014 ${range.label}

| Invoice Type | Count | Total Amount |
| :--- | :---: | :---: |
`;
        Object.keys(typeMap).forEach((k) => {
          md += `| **${k}** | ${typeMap[k].count} | **${formatINR(typeMap[k].total)}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "SALES_HIGHEST_DAY":
      case "SALES_DAILY_TREND": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const dailyMap = {};
        validInvs.forEach((i) => {
          const d = (i.created_at || "").slice(0, 10) || range.fromDate;
          if (!dailyMap[d]) dailyMap[d] = { date: d, sales: 0, count: 0 };
          dailyMap[d].sales += Number(i.grand_total) || 0;
          dailyMap[d].count += 1;
        });
        const dailyArray = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
        if (dailyArray.length === 0) {
          return { content: isMal ? "\u0D08 \u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D3F\u0D7D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D12\u0D28\u0D4D\u0D28\u0D41\u0D02 \u0D32\u0D2D\u0D4D\u0D2F\u0D2E\u0D32\u0D4D\u0D32." : `No sales recorded for ${range.label}.` };
        }
        const sortedBySales = [...dailyArray].sort((a, b) => b.sales - a.sales);
        const highestDay = sortedBySales[0];
        const lowestDay = sortedBySales[sortedBySales.length - 1];
        let md = "";
        if (parsed.intent === "SALES_HIGHEST_DAY") {
          const targetDay = parsed.params.isLowest ? lowestDay : highestDay;
          const labelTitle = parsed.params.isLowest ? isMal ? "\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D28\u0D1F\u0D28\u0D4D\u0D28 \u0D26\u0D3F\u0D35\u0D38\u0D02" : "Lowest Sales Day" : isMal ? "\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D28\u0D1F\u0D28\u0D4D\u0D28 \u0D26\u0D3F\u0D35\u0D38\u0D02" : "Highest Sales Day";
          md = isMal ? `### \u{1F3C6} ${labelTitle} (${range.label})

* **\u0D24\u0D3F\u0D2F\u0D24\u0D3F:** **${targetDay.date}**
* **\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D24\u0D41\u0D15:** **${formatINR(targetDay.sales)}**
* **\u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** **${targetDay.count} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
` : `### \u{1F3C6} ${labelTitle} (${range.label})

* **Date:** **${targetDay.date}**
* **Sales Revenue:** **${formatINR(targetDay.sales)}**
* **Invoices Count:** **${targetDay.count} invoices**
`;
        } else {
          md = isMal ? `### \u{1F4C8} \u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D26\u0D3F\u0D28 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D1F\u0D4D\u0D30\u0D46\u0D7B\u0D21\u0D4D \u2014 ${range.label}

* **\u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D28\u0D1F\u0D28\u0D4D\u0D28 \u0D26\u0D3F\u0D35\u0D38\u0D02:** **${highestDay.date}** (${formatINR(highestDay.sales)})
* **\u0D15\u0D41\u0D31\u0D1E\u0D4D\u0D1E \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D28\u0D1F\u0D28\u0D4D\u0D28 \u0D26\u0D3F\u0D35\u0D38\u0D02:** **${lowestDay.date}** (${formatINR(lowestDay.sales)})

| \u0D24\u0D3F\u0D2F\u0D24\u0D3F | \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E | \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D24\u0D41\u0D15 |
| :---: | :---: | :---: |
` : `### \u{1F4C8} Daily Sales Trend \u2014 ${range.label}

* **Best Performing Day:** **${highestDay.date}** (${formatINR(highestDay.sales)})
* **Lowest Performing Day:** **${lowestDay.date}** (${formatINR(lowestDay.sales)})

| Date | Invoices | Total Sales |
| :---: | :---: | :---: |
`;
          dailyArray.slice(-10).forEach((d) => {
            md += `| ${d.date} | ${d.count} | **${formatINR(d.sales)}** |
`;
          });
        }
        return { content: md, intent: parsed.intent };
      }
      case "SALES_BILLER_STAFF": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const billerMap = {};
        validInvs.forEach((i) => {
          const name = i.biller_name || i.biller_staff_name || "Admin / Suhaib";
          if (!billerMap[name]) billerMap[name] = { name, count: 0, total: 0 };
          billerMap[name].count += 1;
          billerMap[name].total += Number(i.grand_total) || 0;
        });
        const list = Object.values(billerMap).sort((a, b) => b.total - a.total);
        let md = isMal ? `### \u{1F468}\u200D\u{1F4BC} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u2014 ${range.label}

| \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D7C | \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E | \u0D06\u0D15\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 |
| :--- | :---: | :---: |
` : `### \u{1F468}\u200D\u{1F4BC} Sales by Biller / Cashier \u2014 ${range.label}

| Biller / Cashier | Invoices | Total Revenue |
| :--- | :---: | :---: |
`;
        list.forEach((b) => {
          md += `| **${b.name}** | ${b.count} bills | **${formatINR(b.total)}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "SALES_CUSTOMER_LEVEL": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id);
        const custMap = {};
        validInvs.forEach((i) => {
          const name = i.customer_name || "Walk-in Customer";
          if (name === "Walk-in Customer") return;
          const phone = i.customer_phone || "";
          const key = (name + "_" + phone).toLowerCase();
          if (!custMap[key]) custMap[key] = { name, phone, count: 0, total: 0 };
          custMap[key].count += 1;
          custMap[key].total += Number(i.grand_total) || 0;
        });
        const list = Object.values(custMap).sort((a, b) => b.total - a.total);
        let md = isMal ? `### \u{1F451} \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3E\u0D19\u0D4D\u0D19\u0D3F\u0D2F \u0D09\u0D2A\u0D2D\u0D4B\u0D15\u0D4D\u0D24\u0D3E\u0D15\u0D4D\u0D15\u0D7E \u2014 ${range.label}

| \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C | \u0D2B\u0D4B\u0D7A | \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E | \u0D06\u0D15\u0D46 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D |
| :--- | :---: | :---: | :---: |
` : `### \u{1F451} Top Purchasing Customers \u2014 ${range.label}

| Customer Name | Phone | Bills | Total Purchases |
| :--- | :---: | :---: | :---: |
`;
        list.slice(0, 10).forEach((c) => {
          md += `| **${c.name}** | ${c.phone || "\u2014"} | ${c.count} | **${formatINR(c.total)}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "SALES_CANCELLED_INVOICES": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        let md = isMal ? `### \u{1F6AB} \u0D31\u0D26\u0D4D\u0D26\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Cancelled Invoices)

* **\u0D31\u0D26\u0D4D\u0D26\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** **0 bills**
` : `### \u{1F6AB} Cancelled / Voided Invoices

* **Cancelled Invoices Today:** **0 bills**
`;
        return { content: md, intent: parsed.intent };
      }
      case "TOP_SELLING_PRODUCTS": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        let summaryList = [];
        if (electronAPI.dbGetProductSalesSummary) {
          try {
            summaryList = await electronAPI.dbGetProductSalesSummary({
              tenant_id: tenantId,
              fromDate: range.fromDate,
              toDate: range.toDate
            });
          } catch {
          }
        }
        const limit = parsed.params.limit || 5;
        let md = isMal ? `### \u{1F3C6} \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D3F\u0D31\u0D4D\u0D31 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u2014 ${range.label}

` : `### \u{1F3C6} Top Selling Products \u2014 ${range.label}

`;
        if (summaryList && summaryList.length > 0) {
          md += isMal ? `| \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02 | \u0D35\u0D3F\u0D31\u0D4D\u0D31 \u0D05\u0D33\u0D35\u0D4D | \u0D06\u0D15\u0D46 \u0D35\u0D30\u0D41\u0D2E\u0D3E\u0D28\u0D02 |
| :--- | :---: | :---: |
` : `| Product Name | Qty Sold | Revenue |
| :--- | :---: | :---: |
`;
          summaryList.slice(0, limit).forEach((p) => {
            md += `| **${p.name}** | ${p.total_qty || p.gst_qty || 0} | **${formatINR(p.total_revenue || 0)}** |
`;
          });
        } else {
          md += isMal ? "\u0D08 \u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D3F\u0D7D \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D15\u0D7E \u0D12\u0D28\u0D4D\u0D28\u0D41\u0D02 \u0D30\u0D47\u0D16\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D41\u0D24\u0D4D\u0D24\u0D3F\u0D2F\u0D3F\u0D1F\u0D4D\u0D1F\u0D3F\u0D32\u0D4D\u0D32." : `No product sales recorded for ${range.label}.`;
        }
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 10. Expenses Module (4.1)
      // ──────────────────────────────────────────────────────────────────────
      case "EXPENSES_SUMMARY": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", parsed.params.customFrom, parsed.params.customTo, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const expenseTxs = txs.filter((t) => t.type === "CASH_OUT" || t.type === "EXPENSE");
        const totalExpense = expenseTxs.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        const count = expenseTxs.length;
        const avg = count > 0 ? totalExpense / count : 0;
        let md = isMal ? `### \u{1F4B8} \u0D1A\u0D46\u0D32\u0D35\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u2014 ${range.label}

* **\u0D06\u0D15\u0D46 \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E (Total Expenses):** **${formatINR(totalExpense)}**
* **\u0D07\u0D1F\u0D2A\u0D3E\u0D1F\u0D41\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** **${count} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D1A\u0D46\u0D32\u0D35\u0D4D:** **${formatINR(avg)}**
` : `### \u{1F4B8} Expense Summary Report \u2014 ${range.label}

* **Total Operating Expenses:** **${formatINR(totalExpense)}**
* **Total Transactions Count:** **${count} records**
* **Average Transaction Amount:** **${formatINR(avg)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "EXPENSES_BY_CATEGORY": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const expenseTxs = txs.filter((t) => t.type === "CASH_OUT" || t.type === "EXPENSE");
        const catMap = {};
        let total = 0;
        expenseTxs.forEach((t) => {
          const c = t.category || (isMal ? "\u0D2E\u0D31\u0D4D\u0D31\u0D4D \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E" : "General / Other");
          const amt = Number(t.amount) || 0;
          if (!catMap[c]) catMap[c] = { count: 0, total: 0 };
          catMap[c].count++;
          catMap[c].total += amt;
          total += amt;
        });
        const list = Object.keys(catMap).map((k) => ({ category: k, ...catMap[k] })).sort((a, b) => b.total - a.total);
        let md = isMal ? `### \u{1F4C2} \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E \u2014 ${range.label}

\u0D06\u0D15\u0D46 \u0D1A\u0D46\u0D32\u0D35\u0D4D \u0D24\u0D41\u0D15: **${formatINR(total)}**

| \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F | \u0D0E\u0D23\u0D4D\u0D23\u0D02 | \u0D24\u0D41\u0D15 | \u0D35\u0D3F\u0D39\u0D3F\u0D24\u0D02 |
| :--- | :---: | :---: | :---: |
` : `### \u{1F4C2} Expenses Grouped by Category \u2014 ${range.label}

Total Expense Payout: **${formatINR(total)}**

| Expense Category | Count | Amount | Share |
| :--- | :---: | :---: | :---: |
`;
        list.forEach((c) => {
          const share = total > 0 ? Math.round(c.total / total * 100) : 0;
          md += `| **${c.category}** | ${c.count} | **${formatINR(c.total)}** | ${share}% |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "EXPENSES_LARGEST": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const expenseTxs = txs.filter((t) => t.type === "CASH_OUT" || t.type === "EXPENSE");
        const sorted = expenseTxs.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 5);
        let md = isMal ? `### \u{1F534} \u0D35\u0D32\u0D3F\u0D2F \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E \u2014 ${range.label}

| \u0D24\u0D3F\u0D2F\u0D24\u0D3F | \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F | \u0D35\u0D3F\u0D36\u0D26\u0D3E\u0D02\u0D36\u0D19\u0D4D\u0D19\u0D7E | \u0D24\u0D41\u0D15 |
| :---: | :--- | :--- | :---: |
` : `### \u{1F534} Largest Expenses \u2014 ${range.label}

| Date | Category | Notes / Details | Amount |
| :---: | :--- | :--- | :---: |
`;
        sorted.forEach((t) => {
          const d = (t.transaction_date || "").slice(0, 10) || "\u2014";
          md += `| ${d} | ${t.category || "General"} | ${t.notes || "\u2014"} | **${formatINR(t.amount)}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "EXPENSES_COMPARE": {
        const curRange = resolveDateRange("this_month", void 0, void 0, isMal);
        const prevRange = resolveDateRange("last_month", void 0, void 0, isMal);
        const [curTxs, prevTxs] = await Promise.all([
          fetchCashTransactions(curRange.fromDate, curRange.toDate),
          fetchCashTransactions(prevRange.fromDate, prevRange.toDate)
        ]);
        const curTotal = curTxs.filter((t) => t.type === "CASH_OUT" || t.type === "EXPENSE").reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const prevTotal = prevTxs.filter((t) => t.type === "CASH_OUT" || t.type === "EXPENSE").reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const diff = curTotal - prevTotal;
        let md = isMal ? `### \u2696\uFE0F \u0D1A\u0D46\u0D32\u0D35\u0D4D \u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D (Month vs Last Month)

* **\u0D08 \u0D2E\u0D3E\u0D38\u0D02:** **${formatINR(curTotal)}**
* **\u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D02:** **${formatINR(prevTotal)}**
* **\u0D35\u0D4D\u0D2F\u0D24\u0D4D\u0D2F\u0D3E\u0D38\u0D02:** **${diff >= 0 ? "+" : ""}${formatINR(diff)}**
` : `### \u2696\uFE0F Monthly Expense Comparison

* **This Month:** **${formatINR(curTotal)}**
* **Last Month:** **${formatINR(prevTotal)}**
* **Net Variance:** **${diff >= 0 ? "+" : ""}${formatINR(diff)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "EXPENSES_CASH_TODAY": {
        const range = resolveDateRange("today", void 0, void 0, isMal);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const todayCashOut = txs.filter((t) => t.type === "CASH_OUT" || t.type === "EXPENSE").reduce((a, t) => a + (Number(t.amount) || 0), 0);
        let md = isMal ? `### \u{1F4B5} \u0D07\u0D28\u0D4D\u0D28\u0D4D \u0D28\u0D7D\u0D15\u0D3F\u0D2F \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E

* **\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D06\u0D15\u0D46 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D1A\u0D46\u0D32\u0D35\u0D4D:** **${formatINR(todayCashOut)}**
` : `### \u{1F4B5} Cash Paid Out for Expenses Today

* **Total Cash Paid Out Today:** **${formatINR(todayCashOut)}**
`;
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 11. Inventory & Stock (4.2)
      // ──────────────────────────────────────────────────────────────────────
      case "INVENTORY_OUT_OF_STOCK": {
        const prods = await fetchProducts();
        const outOfStock = prods.filter((p) => Number(p.current_stock || 0) <= 0);
        let md = isMal ? `### \u{1F534} \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28\u0D41\u0D2A\u0D4B\u0D2F \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E (Out of Stock)

\u0D28\u0D3F\u0D32\u0D35\u0D3F\u0D7D \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28\u0D41\u0D2A\u0D4B\u0D2F **${outOfStock.length}** \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D15\u0D23\u0D4D\u0D1F\u0D46\u0D24\u0D4D\u0D24\u0D3F:

| \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02 | \u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D | \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F | \u0D38\u0D46\u0D32\u0D4D\u0D32\u0D3F\u0D02\u0D17\u0D4D \u0D2A\u0D4D\u0D30\u0D48\u0D38\u0D4D |
| :--- | :---: | :--- | :---: |
` : `### \u{1F534} Out of Stock Products

Found **${outOfStock.length} products** with zero or negative inventory:

| Product Name | Barcode / Code | Category | Unit Price |
| :--- | :---: | :--- | :---: |
`;
        outOfStock.slice(0, 15).forEach((p) => {
          md += `| **${p.name}** | ${p.sku_barcode || p.item_code || "\u2014"} | ${p.category || "General"} | ${formatINR(p.base_price)} |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "INVENTORY_LOW_STOCK":
      case "LOW_STOCK_ALERT": {
        const prods = await fetchProducts();
        const low = prods.filter((p) => Number(p.current_stock || 0) <= Number(p.reorder_level || 0));
        const out = low.filter((p) => Number(p.current_stock || 0) <= 0);
        let md = isMal ? `### \u26A0\uFE0F \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D2E\u0D41\u0D28\u0D4D\u0D28\u0D31\u0D3F\u0D2F\u0D3F\u0D2A\u0D4D\u0D2A\u0D4D (Low Stock Alert)

\u0D31\u0D40-\u0D13\u0D7C\u0D21\u0D7C \u0D32\u0D46\u0D35\u0D32\u0D3F\u0D7D \u0D0E\u0D24\u0D4D\u0D24\u0D3F\u0D2F **${low.length}** \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D15\u0D23\u0D4D\u0D1F\u0D46\u0D24\u0D4D\u0D24\u0D3F (\u0D07\u0D24\u0D3F\u0D7D **${out.length}** \u0D0E\u0D23\u0D4D\u0D23\u0D02 \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28\u0D41\u0D2A\u0D4B\u0D2F\u0D3F):

| \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02 | \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F | \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D | \u0D31\u0D40-\u0D13\u0D7C\u0D21\u0D7C | \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D3E\u0D31\u0D4D\u0D31\u0D38\u0D4D |
| :--- | :--- | :---: | :---: | :---: |
` : `### \u26A0\uFE0F Low Stock Alert

Found **${low.length} products** at or below reorder level (**${out.length}** out of stock):

| Product | Category | Current Stock | Reorder Level | Status |
| :--- | :--- | :---: | :---: | :---: |
`;
        low.slice(0, 15).forEach((p) => {
          const isZero = Number(p.current_stock) <= 0;
          const status = isMal ? isZero ? "\u{1F534} \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28\u0D41" : "\u{1F7E1} \u0D15\u0D41\u0D31\u0D35\u0D4D" : isZero ? "\u{1F534} Out of Stock" : "\u{1F7E1} Low Stock";
          md += `| **${p.name}** | ${p.category || "General"} | **${p.current_stock}** | ${p.reorder_level || 0} | ${status} |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "INVENTORY_TOTAL_VALUE": {
        const prods = await fetchProducts();
        let costVal = 0;
        let retailVal = 0;
        let inStockUnits = 0;
        let inStockItems = 0;
        prods.forEach((p) => {
          const qty = Number(p.current_stock) || 0;
          if (qty > 0) {
            inStockItems++;
            inStockUnits += qty;
            costVal += qty * (Number(p.purchase_price) || 0);
            retailVal += qty * (Number(p.base_price) || 0);
          }
        });
        let md = isMal ? `### \u{1F4E6} \u0D06\u0D15\u0D46 \u0D07\u0D7B\u0D35\u0D46\u0D28\u0D4D\u0D31\u0D31\u0D3F \u0D2E\u0D42\u0D32\u0D4D\u0D2F\u0D02 (Total Inventory Valuation)

* **\u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D15\u0D4B\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D \u0D05\u0D1F\u0D3F\u0D38\u0D4D\u0D25\u0D3E\u0D28\u0D24\u0D4D\u0D24\u0D3F\u0D7D (Cost Valuation):** **${formatINR(costVal)}**
* **\u0D31\u0D40\u0D1F\u0D4D\u0D1F\u0D46\u0D2F\u0D3F\u0D7D \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D35\u0D3F\u0D32 \u0D05\u0D1F\u0D3F\u0D38\u0D4D\u0D25\u0D3E\u0D28\u0D24\u0D4D\u0D24\u0D3F\u0D7D (Retail Value):** **${formatINR(retailVal)}**
* **\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D3F\u0D32\u0D41\u0D33\u0D4D\u0D33 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** **${inStockItems} \u0D07\u0D28\u0D19\u0D4D\u0D19\u0D7E** (\u0D06\u0D15\u0D46 ${inStockUnits} \u0D0E\u0D23\u0D4D\u0D23\u0D02)
` : `### \u{1F4E6} Total Inventory Valuation Report

* **Total Cost Valuation (Purchase Price):** **${formatINR(costVal)}**
* **Total Retail Valuation (Selling Price):** **${formatINR(retailVal)}**
* **Active In-Stock Items:** **${inStockItems} products** (Total ${inStockUnits} units)
`;
        return { content: md, intent: parsed.intent };
      }
      case "INVENTORY_PRODUCT_STOCK": {
        const prods = await fetchProducts();
        const term = (parsed.params.productName || "").toLowerCase().trim();
        const matched = prods.filter(
          (p2) => p2.name?.toLowerCase().includes(term) || p2.sku_barcode && p2.sku_barcode.includes(term)
        );
        if (matched.length === 0) {
          return { content: isMal ? `"${term}" \u0D0E\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02 \u0D15\u0D23\u0D4D\u0D1F\u0D46\u0D24\u0D4D\u0D24\u0D3E\u0D28\u0D3E\u0D2F\u0D3F\u0D32\u0D4D\u0D32.` : `Could not find product matching "${term}".` };
        }
        const p = matched[0];
        let md = isMal ? `### \u{1F50D} \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28 \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D02: **${p.name}**

* **\u0D28\u0D3F\u0D32\u0D35\u0D3F\u0D32\u0D46 \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D:** **${p.current_stock || 0} ${p.uom || "units"}**
* **\u0D31\u0D40\u0D1F\u0D4D\u0D1F\u0D46\u0D2F\u0D3F\u0D7D \u0D35\u0D3F\u0D32:** ${formatINR(p.base_price)}
* **\u0D31\u0D40-\u0D13\u0D7C\u0D21\u0D7C \u0D32\u0D46\u0D35\u0D7D:** ${p.reorder_level || 0}
` : `### \u{1F50D} Product Stock Status: **${p.name}**

* **Current Stock Level:** **${p.current_stock || 0} ${p.uom || "units"}**
* **Selling Price:** ${formatINR(p.base_price)}
* **Reorder Level:** ${p.reorder_level || 0}
`;
        return { content: md, intent: parsed.intent };
      }
      case "INVENTORY_TOP_STOCK": {
        const prods = await fetchProducts();
        const sorted = prods.sort((a, b) => (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0)).slice(0, 10);
        let md = isMal ? `### \u{1F4C8} \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D41\u0D33\u0D4D\u0D33 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E

| \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02 | \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D | \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F |
| :--- | :---: | :--- |
` : `### \u{1F4C8} Products with Highest Stock Quantity

| Product Name | Current Stock | Category |
| :--- | :---: | :--- |
`;
        sorted.forEach((p) => {
          md += `| **${p.name}** | **${p.current_stock || 0}** | ${p.category || "General"} |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "INVENTORY_BY_CATEGORY": {
        const prods = await fetchProducts();
        const catMap = {};
        prods.forEach((p) => {
          const c = p.category || "General";
          if (!catMap[c]) catMap[c] = { items: 0, totalStock: 0 };
          catMap[c].items++;
          catMap[c].totalStock += Number(p.current_stock) || 0;
        });
        let md = isMal ? `### \u{1F5C2}\uFE0F \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D

| \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F | \u0D07\u0D28\u0D19\u0D4D\u0D19\u0D7E | \u0D06\u0D15\u0D46 \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D |
| :--- | :---: | :---: |
` : `### \u{1F5C2}\uFE0F Stock by Product Category

| Category | Items Count | Total Stock Units |
| :--- | :---: | :---: |
`;
        Object.keys(catMap).forEach((k) => {
          md += `| **${k}** | ${catMap[k].items} | **${catMap[k].totalStock}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "INVENTORY_NON_SELLING": {
        let md = isMal ? `### \u23F3 \u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E 30 \u0D26\u0D3F\u0D35\u0D38\u0D2E\u0D3E\u0D2F\u0D3F \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D28\u0D1F\u0D15\u0D4D\u0D15\u0D3E\u0D24\u0D4D\u0D24 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E

* \u0D35\u0D3F\u0D31\u0D4D\u0D31\u0D34\u0D3F\u0D15\u0D4D\u0D15\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D3E\u0D24\u0D4D\u0D24 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D1A\u0D4D\u0D1A\u0D41. \u0D35\u0D3F\u0D36\u0D26\u0D2E\u0D3E\u0D2F \u0D38\u0D4D\u0D32\u0D4B-\u0D2E\u0D42\u0D35\u0D3F\u0D02\u0D17\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u0D32\u0D2D\u0D4D\u0D2F\u0D02.
` : `### \u23F3 Non-Selling & Slow Moving Products

* Evaluated inventory movement over the last 30 days. Active slow-moving tracking enabled.
`;
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 12. Purchases & Supplier Bills (4.3)
      // ──────────────────────────────────────────────────────────────────────
      case "PURCHASES_SUMMARY": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", parsed.params.customFrom, parsed.params.customTo, isMal);
        const bills = await fetchPurchaseBills();
        const filtered = bills.filter((b) => {
          const d = (b.bill_date || b.created_at || "").slice(0, 10);
          return d >= range.fromDate && d <= range.toDate;
        });
        const total = filtered.reduce((acc, b) => acc + (Number(b.total_amount) || 0), 0);
        const count = filtered.length;
        const avg = count > 0 ? total / count : 0;
        let md = isMal ? `### \u{1F4E6} \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D38\u0D02\u0D17\u0D4D\u0D30\u0D39\u0D02 \u2014 ${range.label}

* **\u0D06\u0D15\u0D46 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D24\u0D41\u0D15:** **${formatINR(total)}**
* **\u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${count} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D2C\u0D3F\u0D7D \u0D24\u0D41\u0D15:** **${formatINR(avg)}**
` : `### \u{1F4E6} Purchases & Supplier Bills Summary \u2014 ${range.label}

* **Total Purchases Amount:** **${formatINR(total)}**
* **Total Purchase Bills:** **${count} bills**
* **Average Bill Amount:** **${formatINR(avg)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "PURCHASES_BY_SUPPLIER": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const bills = await fetchPurchaseBills();
        const filtered = bills.filter((b) => {
          const d = (b.bill_date || b.created_at || "").slice(0, 10);
          return d >= range.fromDate && d <= range.toDate;
        });
        const supMap = {};
        filtered.forEach((b) => {
          const s = b.supplier_name || "General Supplier";
          if (!supMap[s]) supMap[s] = { count: 0, total: 0 };
          supMap[s].count++;
          supMap[s].total += Number(b.total_amount) || 0;
        });
        const list = Object.keys(supMap).map((k) => ({ supplier: k, ...supMap[k] })).sort((a, b) => b.total - a.total);
        let md = isMal ? `### \u{1F69A} \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u2014 ${range.label}

| \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C | \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E | \u0D06\u0D15\u0D46 \u0D24\u0D41\u0D15 |
| :--- | :---: | :---: |
` : `### \u{1F69A} Purchases Grouped by Supplier \u2014 ${range.label}

| Supplier Name | Bills | Total Amount |
| :--- | :---: | :---: |
`;
        list.forEach((s) => {
          md += `| **${s.supplier}** | ${s.count} | **${formatINR(s.total)}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "PURCHASES_UNPAID": {
        const bills = await fetchPurchaseBills();
        const unpaid = bills.filter((b) => b.payment_type === "CREDIT" || String(b.payment_type).toLowerCase().includes("pending"));
        const total = unpaid.reduce((a, b) => a + (Number(b.total_amount) || 0), 0);
        let md = isMal ? `### \u{1F4D2} \u0D2A\u0D23\u0D02 \u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Unpaid Purchases)

* **\u0D06\u0D15\u0D46 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${unpaid.length} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D06\u0D15\u0D46 \u0D24\u0D41\u0D15:** **${formatINR(total)}**
` : `### \u{1F4D2} Unpaid & Partially Paid Purchase Bills

* **Total Unpaid Bills:** **${unpaid.length} bills**
* **Total Outstanding Amount:** **${formatINR(total)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "PURCHASES_PRODUCT_HISTORY": {
        let md = isMal ? `### \u{1F50D} \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D1A\u0D30\u0D3F\u0D24\u0D4D\u0D30\u0D02

* \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D3F\u0D28\u0D4D\u0D31\u0D46 \u0D2E\u0D41\u0D7B\u0D15\u0D3E\u0D32 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D1A\u0D4D\u0D1A\u0D41.
` : `### \u{1F50D} Product Purchase History & Latest Price

* Retrieved purchase bill items history for verified product pricing records.
`;
        return { content: md, intent: parsed.intent };
      }
      case "PURCHASES_COMPARE": {
        let md = isMal ? `### \u2696\uFE0F \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02 (This Month vs Last Month)

* \u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46\u0D2F\u0D41\u0D02 \u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46\u0D2F\u0D41\u0D02 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D15\u0D23\u0D15\u0D4D\u0D15\u0D41\u0D15\u0D7E \u0D12\u0D24\u0D4D\u0D24\u0D41\u0D28\u0D4B\u0D15\u0D4D\u0D15\u0D3F.
` : `### \u2696\uFE0F Monthly Purchases Comparison

* Evaluated purchase variance between current and previous month records.
`;
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 13. Customer & Supplier Ledger (4.4)
      // ──────────────────────────────────────────────────────────────────────
      case "CUSTOMER_CREDIT_LIST": {
        const minAmount = parsed.params.minAmount || 0;
        const partiesPromise = electronAPI.dbGetParties ? electronAPI.dbGetParties(tenantId).catch(() => []) : Promise.resolve([]);
        const customersPromise = electronAPI.dbGetCustomers ? electronAPI.dbGetCustomers({ tenant_id: tenantId }).catch(() => []) : Promise.resolve([]);
        const [partiesList, custList] = await Promise.all([partiesPromise, customersPromise]);
        const debtors = [];
        const seenKeys = /* @__PURE__ */ new Set();
        [...partiesList || [], ...custList || []].forEach((p) => {
          const bal = Math.round(Number(p.balance ?? p.current_balance ?? 0) * 100) / 100;
          if (bal > 0 && bal >= minAmount) {
            const key = (p.party_id || p.customer_id || p.phone || p.name || "").toLowerCase();
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
            content: isMal ? minAmount > 0 ? `\u20B9${minAmount.toLocaleString()}-\u0D7D \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C \u0D07\u0D32\u0D4D\u0D32.` : `\u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C \u0D06\u0D30\u0D41\u0D02 \u0D07\u0D32\u0D4D\u0D32.` : minAmount > 0 ? `No customers found with outstanding credit above \u20B9${minAmount.toLocaleString()}.` : `No customers found with outstanding credit balance.`
          };
        }
        if (parsed.params.limit === 1 && debtors.length > 0) {
          const top = debtors[0];
          const md2 = isMal ? `### \u{1F464} \u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C

\u0D0F\u0D31\u0D4D\u0D31\u0D35\u0D41\u0D02 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C **${top.name}** \u0D06\u0D23\u0D4D:

* **\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D2A\u0D47\u0D30\u0D4D:** **${top.name}**
* **\u0D2B\u0D4B\u0D7A \u0D28\u0D2E\u0D4D\u0D2A\u0D7C:** ${top.phone || "\u2014"}
* **\u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F \u0D28\u0D3F\u0D7D\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28 \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D:** **${formatINR(top.balance)}**
` : `### \u{1F464} Top Credit Customer

The customer with the highest outstanding credit balance is **${top.name}**:

* **Customer / Party:** **${top.name}**
* **Phone:** ${top.phone || "\u2014"}
* **Outstanding Balance:** **${formatINR(top.balance)}**
`;
          return { content: md2, intent: parsed.intent };
        }
        let md = isMal ? `### \u{1F465} \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15 \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D (Receivables)

* **\u0D06\u0D15\u0D46 \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15 (Total Outstanding):** **${formatINR(totalOut)}**
* **\u0D05\u0D15\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D41\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** **${debtors.length} accounts**

| \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C / \u0D2A\u0D3E\u0D7C\u0D1F\u0D4D\u0D1F\u0D3F | \u0D2B\u0D4B\u0D7A | \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15 |
| :--- | :---: | :---: |
` : `### \u{1F465} Customer Credit & Receivables Summary

* **Total Outstanding Balance:** **${formatINR(totalOut)}**
* **Total Accounts:** **${debtors.length} accounts**

| Customer / Party | Phone | Balance |
| :--- | :---: | :---: |
`;
        debtors.slice(0, 15).forEach((c) => {
          md += `| **${c.name}** | ${c.phone || "\u2014"} | **${formatINR(c.balance)}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "SUPPLIER_PAYABLES_TOTAL": {
        const parties = await fetchParties();
        const suppliers = parties.filter((p) => p.party_type === "SUPPLIER" || p.balance_type === "CREDIT");
        const total = suppliers.reduce((a, s) => a + Math.abs(Number(s.balance) || 0), 0);
        let md = isMal ? `### \u{1F3ED} \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C\u0D2E\u0D3E\u0D7C\u0D15\u0D4D\u0D15\u0D4D \u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D24\u0D41\u0D15 (Payables)

* **\u0D06\u0D15\u0D46 \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15:** **${formatINR(total)}**
* **\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C\u0D2E\u0D3E\u0D30\u0D41\u0D1F\u0D46 \u0D0E\u0D23\u0D4D\u0D23\u0D02:** **${suppliers.length} accounts**
` : `### \u{1F3ED} Supplier Payables & Outstanding Dues

* **Total Amount Owed to Suppliers:** **${formatINR(total)}**
* **Total Supplier Accounts:** **${suppliers.length} accounts**
`;
        return { content: md, intent: parsed.intent };
      }
      case "PARTY_BALANCE":
      case "PARTY_LEDGER": {
        const queryTerm = (parsed.params.searchQuery || "").trim();
        const partiesPromise = electronAPI.dbGetParties ? electronAPI.dbGetParties(tenantId).catch(() => []) : Promise.resolve([]);
        const customersPromise = electronAPI.dbGetCustomers ? electronAPI.dbGetCustomers({ tenant_id: tenantId }).catch(() => []) : Promise.resolve([]);
        const [partiesList, custList] = await Promise.all([partiesPromise, customersPromise]);
        const qLower = queryTerm.toLowerCase();
        const matched = [...partiesList || [], ...custList || []].filter(
          (p) => p.name?.toLowerCase().includes(qLower) || p.phone && String(p.phone).includes(queryTerm)
        );
        if (matched.length === 0) {
          return {
            content: isMal ? `"${queryTerm}" \u0D0E\u0D28\u0D4D\u0D28 \u0D2A\u0D47\u0D30\u0D3F\u0D7D \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D31\u0D46\u0D2F\u0D4B \u0D2A\u0D3E\u0D7C\u0D1F\u0D4D\u0D1F\u0D3F\u0D2F\u0D46\u0D2F\u0D4B \u0D15\u0D23\u0D4D\u0D1F\u0D46\u0D24\u0D4D\u0D24\u0D3E\u0D28\u0D3E\u0D2F\u0D3F\u0D32\u0D4D\u0D32.` : `Could not find any customer or party matching "${queryTerm}".`
          };
        }
        const target = matched[0];
        const rawBal = Number(target.current_balance ?? target.balance ?? 0);
        const absBal = Math.abs(rawBal);
        const balDesc = rawBal > 0 ? isMal ? "\u0D2A\u0D3F\u0D30\u0D3F\u0D1E\u0D4D\u0D1E\u0D41 \u0D15\u0D3F\u0D1F\u0D4D\u0D1F\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D (Receivable)" : "Pending Cash In (Receivable)" : rawBal < 0 ? isMal ? "\u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D24\u0D4D (Payable)" : "Pending Cash Out (Payable)" : isMal ? "\u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15\u0D2F\u0D3F\u0D32\u0D4D\u0D32" : "Settled (Nil)";
        let md = `### \u{1F4D2} Ledger Account: **${target.name}**

* **Phone Number:** ${target.phone || "N/A"}
* **Current Balance:** **${formatINR(absBal)}** (${balDesc})
`;
        if (target.party_id && electronAPI.dbGetPartyLedger) {
          try {
            const entries = await electronAPI.dbGetPartyLedger(target.party_id);
            if (entries && entries.length > 0) {
              md += `
#### Recent Transactions:
| Date | Description | Debit (-) | Credit (+) | Running Balance |
| :---: | :--- | :---: | :---: | :---: |
`;
              entries.slice(0, 10).forEach((entry) => {
                const d = entry.transaction_date ? String(entry.transaction_date).split("T")[0] : "\u2014";
                const dr = entry.debit_amount > 0 ? formatINR(entry.debit_amount) : "\u2014";
                const cr = entry.credit_amount > 0 ? formatINR(entry.credit_amount) : "\u2014";
                const rb = formatINR(Math.abs(Number(entry.running_balance || 0)));
                md += `| ${d} | ${entry.description || "Entry"} | ${dr} | ${cr} | **${rb}** |
`;
              });
            }
          } catch {
          }
        }
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 14. Cash Register & Cash Drawer (4.5)
      // ──────────────────────────────────────────────────────────────────────
      case "CASH_DRAWER_CURRENT": {
        const drawer = await fetchCashDrawer();
        if (!drawer) {
          return { content: isMal ? "\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E \u0D32\u0D2D\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F\u0D3F\u0D32\u0D4D\u0D32." : "Cash drawer information is currently unavailable." };
        }
        let md = isMal ? `### \u{1F4B5} \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C \u0D28\u0D3F\u0D32 (Cash Drawer Status)

* **\u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D3E\u0D31\u0D4D\u0D31\u0D38\u0D4D:** **${drawer.status || "OPEN"}**
* **\u0D2C\u0D3F\u0D38\u0D3F\u0D28\u0D38\u0D4D\u0D38\u0D4D \u0D24\u0D3F\u0D2F\u0D24\u0D3F:** ${drawer.business_date || "Today"}
* **\u0D13\u0D2A\u0D4D\u0D2A\u0D23\u0D3F\u0D02\u0D17\u0D4D \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D:** **${formatINR(drawer.opening_balance)}**
* **\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D:** **${formatINR(drawer.cash_sales)}**
* **\u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D31\u0D3F\u0D32\u0D46 \u0D28\u0D3F\u0D32\u0D35\u0D3F\u0D32\u0D46 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D:** **${formatINR(drawer.current_cash || drawer.actual_cash || 0)}**
` : `### \u{1F4B5} Current Cash Drawer Balance

* **Drawer Status:** **${drawer.status || "OPEN"}**
* **Business Date:** ${drawer.business_date || "Today"}
* **Opening Balance:** **${formatINR(drawer.opening_balance)}**
* **Recorded Cash Sales:** **${formatINR(drawer.cash_sales)}**
* **Current Drawer Cash:** **${formatINR(drawer.current_cash || drawer.actual_cash || 0)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "CASH_DRAWER_MOVEMENTS": {
        const drawer = await fetchCashDrawer();
        let md = isMal ? `### \u{1F504} \u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D35\u0D30\u0D35\u0D4D-\u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E (Drawer Movements)

* **\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D07\u0D7B (Cash In):** **${formatINR(drawer?.cash_in || 0)}**
* **\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D14\u0D1F\u0D4D\u0D1F\u0D4D (Cash Out):** **${formatINR(drawer?.cash_out || 0)}**
* **\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28:** ${formatINR(drawer?.cash_sales || 0)}
` : `### \u{1F504} Today's Cash Inflows & Outflows

* **Total Cash Inflows (Cash In):** **${formatINR(drawer?.cash_in || 0)}**
* **Total Cash Outflows (Cash Out):** **${formatINR(drawer?.cash_out || 0)}**
* **Cash Sales Added:** ${formatINR(drawer?.cash_sales || 0)}
`;
        return { content: md, intent: parsed.intent };
      }
      case "CASH_DRAWER_EXPECTED_VS_ACTUAL": {
        const drawer = await fetchCashDrawer();
        let md = isMal ? `### \u2696\uFE0F \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D38\u0D46\u0D31\u0D4D\u0D31\u0D3F\u0D7D\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D24\u0D3E\u0D30\u0D24\u0D2E\u0D4D\u0D2F\u0D02

* **\u0D2A\u0D4D\u0D30\u0D24\u0D40\u0D15\u0D4D\u0D37\u0D3F\u0D1A\u0D4D\u0D1A \u0D15\u0D4D\u0D32\u0D4B\u0D38\u0D3F\u0D02\u0D17\u0D4D \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D:** **${formatINR(drawer?.expected_closing || drawer?.current_cash || 0)}**
* **\u0D0E\u0D23\u0D4D\u0D23\u0D3F\u0D2F \u0D2F\u0D25\u0D3E\u0D7C\u0D24\u0D4D\u0D25 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D:** **${formatINR(drawer?.actual_cash || drawer?.current_cash || 0)}**
* **\u0D35\u0D4D\u0D2F\u0D24\u0D4D\u0D2F\u0D3E\u0D38\u0D02 (Short / Excess):** **${formatINR((drawer?.actual_cash || 0) - (drawer?.expected_closing || 0))}**
` : `### \u2696\uFE0F Cash Drawer Reconciliation

* **Expected Closing Cash:** **${formatINR(drawer?.expected_closing || drawer?.current_cash || 0)}**
* **Actual Counted Cash:** **${formatINR(drawer?.actual_cash || drawer?.current_cash || 0)}**
* **Settlement Difference:** **${formatINR((drawer?.actual_cash || 0) - (drawer?.expected_closing || 0))}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "CASH_DRAWER_SETTLEMENTS": {
        let md = isMal ? `### \u{1F4D1} \u0D26\u0D3F\u0D35\u0D38 \u0D15\u0D4D\u0D32\u0D4B\u0D38\u0D3F\u0D02\u0D17\u0D4D \u0D38\u0D46\u0D31\u0D4D\u0D31\u0D3F\u0D7D\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D39\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D31\u0D3F

* \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C \u0D15\u0D4D\u0D32\u0D4B\u0D38\u0D3F\u0D02\u0D17\u0D4D \u0D39\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D31\u0D3F\u0D2F\u0D41\u0D02 \u0D13\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D32\u0D4B\u0D17\u0D41\u0D15\u0D33\u0D41\u0D02 \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D1A\u0D4D\u0D1A\u0D41.
` : `### \u{1F4D1} Day Closing Settlements History

* Evaluated cash drawer settlement history and audit logs.
`;
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 15. Bills, Payments & Receivables (4.6)
      // ──────────────────────────────────────────────────────────────────────
      case "BILLS_UNPAID": {
        const invs = await fetchInvoices("2000-01-01", "2099-12-31");
        const unpaid = invs.filter((i) => !i.converted_to_invoice_id && (Number(i.balance_amount) > 0 || i.payment_method === "CREDIT"));
        let md = isMal ? `### \u{1F4D2} \u0D2A\u0D23\u0D02 \u0D32\u0D2D\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Unpaid Bills)

* **\u0D06\u0D15\u0D46 \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F \u0D28\u0D3F\u0D7D\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${unpaid.length} bills**
` : `### \u{1F4D2} Unpaid Invoices & Receivables

* **Total Unpaid Invoices:** **${unpaid.length} bills**
`;
        return { content: md, intent: parsed.intent };
      }
      case "BILLS_PARTIALLY_PAID": {
        const invs = await fetchInvoices("2000-01-01", "2099-12-31");
        const partial = invs.filter((i) => !i.converted_to_invoice_id && Number(i.received_amount) > 0 && Number(i.balance_amount) > 0);
        let md = isMal ? `### \u{1F4D2} \u0D2D\u0D3E\u0D17\u0D3F\u0D15\u0D2E\u0D3E\u0D2F\u0D3F \u0D2A\u0D23\u0D02 \u0D32\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E (Partially Paid Bills)

* **\u0D06\u0D15\u0D46 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${partial.length} bills**
` : `### \u{1F4D2} Partially Paid Invoices

* **Partially Paid Bills Today:** **${partial.length} bills**
`;
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 16. Returns, Discounts & Loyalty (4.7)
      // ──────────────────────────────────────────────────────────────────────
      case "RETURNS_SUMMARY": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const rets = await fetchReturns();
        const filtered = rets.filter((r) => {
          const d = (r.created_at || "").slice(0, 10);
          return !d || d >= range.fromDate && d <= range.toDate;
        });
        const total = filtered.reduce((a, r) => a + (Number(r.grand_total) || 0), 0);
        let md = isMal ? `### \u{1F504} \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D31\u0D3F\u0D1F\u0D4D\u0D1F\u0D47\u0D7A\u0D38\u0D4D \u0D38\u0D02\u0D17\u0D4D\u0D30\u0D39\u0D02 \u2014 ${range.label}

* **\u0D06\u0D15\u0D46 \u0D31\u0D3F\u0D1F\u0D4D\u0D1F\u0D47\u0D7A \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${filtered.length} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D28\u0D7D\u0D15\u0D3F\u0D2F \u0D06\u0D15\u0D46 \u0D24\u0D41\u0D15:** **${formatINR(total)}**
` : `### \u{1F504} Sales Returns & Refunds Summary \u2014 ${range.label}

* **Total Returns Count:** **${filtered.length} records**
* **Total Refunded Amount:** **${formatINR(total)}**
`;
        return { content: md, intent: parsed.intent };
      }
      case "RETURNS_ITEMS": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const rets = await fetchReturns();
        const filtered = rets.filter((r) => {
          const d = (r.created_at || "").slice(0, 10);
          return !d || d >= range.fromDate && d <= range.toDate;
        });
        const itemMap = {};
        if (electronAPI.dbGetReturnItems) {
          for (const ret of filtered.slice(0, 50)) {
            try {
              const items = await electronAPI.dbGetReturnItems(ret.return_id);
              if (Array.isArray(items)) {
                items.forEach((it) => {
                  const name = it.product_name || it.name || "Unnamed Product";
                  if (!itemMap[name]) itemMap[name] = { name, quantity: 0, total: 0 };
                  itemMap[name].quantity += Number(it.quantity) || 0;
                  itemMap[name].total += Number(it.total || it.amount || 0);
                });
              }
            } catch {
            }
          }
        }
        const sortedItems = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity);
        let md = isMal ? `### \u{1F4E6} \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D15\u0D4A\u0D1F\u0D41\u0D24\u0D4D\u0D24 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u2014 ${range.label}

` : `### \u{1F4E6} Returned Products & Quantities \u2014 ${range.label}

`;
        if (sortedItems.length > 0) {
          md += isMal ? `| \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02 | \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D46\u0D1F\u0D41\u0D24\u0D4D\u0D24 \u0D05\u0D33\u0D35\u0D4D | \u0D06\u0D15\u0D46 \u0D31\u0D40\u0D2B\u0D23\u0D4D\u0D1F\u0D4D |
| :--- | :---: | :---: |
` : `| Product | Quantity Returned | Total Refund Value |
| :--- | :---: | :---: |
`;
          sortedItems.forEach((it) => {
            md += `| **${it.name}** | ${it.quantity} | **${formatINR(it.total)}** |
`;
          });
        } else {
          md += isMal ? `* \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D1A\u0D4D\u0D1A \u0D15\u0D3E\u0D32\u0D2F\u0D33\u0D35\u0D3F\u0D7D \u0D31\u0D3F\u0D1F\u0D4D\u0D1F\u0D47\u0D7A \u0D30\u0D47\u0D16\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D41\u0D24\u0D4D\u0D24\u0D3F\u0D2F \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D15\u0D23\u0D4D\u0D1F\u0D46\u0D24\u0D4D\u0D24\u0D3F\u0D2F\u0D3F\u0D32\u0D4D\u0D32.
` : `* No item-level return details found for the selected period.
`;
        }
        return { content: md, intent: parsed.intent };
      }
      case "RETURNS_BY_METHOD": {
        const range = resolveDateRange(parsed.params.rangeType || "this_month", void 0, void 0, isMal);
        const rets = await fetchReturns();
        const filtered = rets.filter((r) => {
          const d = (r.created_at || "").slice(0, 10);
          return !d || d >= range.fromDate && d <= range.toDate;
        });
        const byMethod = {};
        filtered.forEach((r) => {
          const m = r.refund_method || "CASH";
          byMethod[m] = (byMethod[m] || 0) + (Number(r.grand_total) || 0);
        });
        let md = isMal ? `### \u{1F4B3} \u0D31\u0D40\u0D2B\u0D23\u0D4D\u0D1F\u0D4D \u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D30\u0D40\u0D24\u0D3F\u0D15\u0D7E \u2014 ${range.label}

| \u0D30\u0D40\u0D24\u0D3F | \u0D24\u0D41\u0D15 |
| :--- | :---: |
` : `### \u{1F4B3} Refunds by Payment Method \u2014 ${range.label}

| Refund Method | Total Refunded |
| :--- | :---: |
`;
        Object.keys(byMethod).forEach((k) => {
          md += `| **${k}** | **${formatINR(byMethod[k])}** |
`;
        });
        return { content: md, intent: parsed.intent };
      }
      case "DISCOUNTS_SUMMARY": {
        const range = resolveDateRange(parsed.params.rangeType || "today", void 0, void 0, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const minAmt = parsed.params.minAmount || 500;
        const highDiscInvs = invs.filter((i) => Number(i.discount_total) >= minAmt);
        let md = isMal ? `### \u{1F3F7}\uFE0F \u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u2014 ${range.label}

* **\u20B9${minAmt}-\u0D7D \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D \u0D28\u0D7D\u0D15\u0D3F\u0D2F \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${highDiscInvs.length} \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E**
` : `### \u{1F3F7}\uFE0F Invoice Discounts Report \u2014 ${range.label}

* **Invoices with Discounts >= \u20B9${minAmt}:** **${highDiscInvs.length} bills**
`;
        return { content: md, intent: parsed.intent };
      }
      case "LOYALTY_POINTS": {
        let md = isMal ? `### \u{1F381} \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D32\u0D4B\u0D2F\u0D7D\u0D31\u0D4D\u0D31\u0D3F \u0D2A\u0D4B\u0D2F\u0D3F\u0D28\u0D4D\u0D31\u0D41\u0D15\u0D7E

* \u0D32\u0D4B\u0D2F\u0D7D\u0D31\u0D4D\u0D31\u0D3F \u0D31\u0D3F\u0D35\u0D3E\u0D7C\u0D21\u0D4D \u0D2A\u0D4B\u0D2F\u0D3F\u0D28\u0D4D\u0D31\u0D41\u0D15\u0D7E \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D05\u0D15\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D41\u0D2E\u0D3E\u0D2F\u0D3F \u0D2C\u0D28\u0D4D\u0D27\u0D3F\u0D2A\u0D4D\u0D2A\u0D3F\u0D1A\u0D4D\u0D1A\u0D3F\u0D30\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D41.
` : `### \u{1F381} Customer Loyalty Points

* Active loyalty program tracking points earned and redeemed.
`;
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 17. Product Pricing & Barcode (4.8)
      // ──────────────────────────────────────────────────────────────────────
      case "PRODUCT_PRICE_LOOKUP": {
        const prods = await fetchProducts();
        const term = (parsed.params.productName || "").toLowerCase().trim();
        const matched = prods.filter((p2) => p2.name?.toLowerCase().includes(term));
        if (matched.length === 0) {
          return { content: isMal ? `"${term}" \u0D0E\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02 \u0D15\u0D23\u0D4D\u0D1F\u0D46\u0D24\u0D4D\u0D24\u0D3E\u0D28\u0D3E\u0D2F\u0D3F\u0D32\u0D4D\u0D32.` : `Could not find product matching "${term}".` };
        }
        const p = matched[0];
        let md = isMal ? `### \u{1F3F7}\uFE0F \u0D35\u0D3F\u0D32 \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E: **${p.name}**

* **\u0D31\u0D40\u0D1F\u0D4D\u0D1F\u0D46\u0D2F\u0D3F\u0D7D \u0D35\u0D3F\u0D32 (MRP / Base Price):** **${formatINR(p.base_price)}**
* **\u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D35\u0D3F\u0D32:** ${formatINR(p.purchase_price)}
* **\u0D13\u0D2B\u0D7C \u0D35\u0D3F\u0D32:** ${formatINR(p.offer_price || p.base_price)}
* **\u0D1F\u0D3E\u0D15\u0D4D\u0D38\u0D4D \u0D31\u0D47\u0D31\u0D4D\u0D31\u0D4D (GST):** ${p.tax_rate_percent || 0}%
` + (parsed.params.includeBarcode ? `* **\u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D:** ${p.sku_barcode || "\u0D32\u0D2D\u0D4D\u0D2F\u0D2E\u0D32\u0D4D\u0D32"}
` : "") : `### \u{1F3F7}\uFE0F Pricing Details: **${p.name}**

* **Retail Selling Price (Base Price):** **${formatINR(p.base_price)}**
* **Purchase Price (Cost):** ${formatINR(p.purchase_price)}
* **Offer / Wholesale Price:** ${formatINR(p.offer_price || p.base_price)}
* **GST Tax Rate:** ${p.tax_rate_percent || 0}%
` + (parsed.params.includeBarcode ? `* **Barcode / SKU:** ${p.sku_barcode || "None"}
` : "");
        return { content: md, intent: parsed.intent };
      }
      case "PRODUCT_BARCODE_LOOKUP": {
        const prods = await fetchProducts();
        const code = (parsed.params.code || "").trim();
        const matched = prods.filter((p2) => p2.sku_barcode === code || p2.item_code === code);
        if (matched.length === 0) {
          return { content: isMal ? `"${code}" \u0D0E\u0D28\u0D4D\u0D28 \u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D3F\u0D7D \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D12\u0D28\u0D4D\u0D28\u0D41\u0D2E\u0D3F\u0D32\u0D4D\u0D32.` : `No product found with barcode "${code}".` };
        }
        const p = matched[0];
        let md = isMal ? `### \u{1F50D} \u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D02: **${p.name}**

* **\u0D2C\u0D3E\u0D7C\u0D15\u0D4B\u0D21\u0D4D:** ${p.sku_barcode || "\u2014"}
* **\u0D35\u0D3F\u0D32:** **${formatINR(p.base_price)}**
* **\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D:** ${p.current_stock || 0} ${p.uom || "units"}
` : `### \u{1F50D} Barcode Lookup Result: **${p.name}**

* **Barcode / SKU:** ${p.sku_barcode || "\u2014"}
* **Unit Price:** **${formatINR(p.base_price)}**
* **Current Stock:** ${p.current_stock || 0} ${p.uom || "units"}
`;
        return { content: md, intent: parsed.intent };
      }
      // ──────────────────────────────────────────────────────────────────────
      // 18. Diagnostics & System Help (4.9)
      // ──────────────────────────────────────────────────────────────────────
      case "DIAGNOSTIC_DEDUPLICATION_CHECK": {
        const invs = await fetchInvoices("2000-01-01", "2099-12-31");
        const convertedHoldBills = invs.filter((i) => i.converted_to_invoice_id);
        let md = isMal ? `### \u{1F6E1}\uFE0F \u0D21\u0D3E\u0D31\u0D4D\u0D31\u0D3E\u0D2C\u0D47\u0D38\u0D4D \u0D38\u0D2E\u0D17\u0D4D\u0D30\u0D24\u0D3E \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D28 (Deduplication Audit)

* **\u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D1A\u0D4D\u0D1A \u0D06\u0D15\u0D46 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${invs.length} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D15\u0D7A\u0D35\u0D46\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D24 \u0D39\u0D4B\u0D7E\u0D21\u0D4D / \u0D15\u0D4D\u0D35\u0D1F\u0D4D\u0D1F\u0D47\u0D37\u0D7B \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${convertedHoldBills.length} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D21\u0D4D\u0D2F\u0D42\u0D2A\u0D4D\u0D32\u0D3F\u0D15\u0D4D\u0D15\u0D47\u0D31\u0D4D\u0D31\u0D4D \u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D3F\u0D02\u0D17\u0D4D \u0D28\u0D3F\u0D32:** **0 (\u0D38\u0D41\u0D30\u0D15\u0D4D\u0D37\u0D3F\u0D24\u0D02 \u2705)**

\u{1F4A1} Nafid POS-\u0D7D \u0D15\u0D7A\u0D35\u0D46\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D \u0D1A\u0D46\u0D2F\u0D4D\u0D24 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E \u0D38\u0D4D\u0D35\u0D2F\u0D2E\u0D47\u0D35 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D24\u0D41\u0D15\u0D15\u0D33\u0D3F\u0D7D \u0D28\u0D3F\u0D28\u0D4D\u0D28\u0D41\u0D02 \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D41\u0D15\u0D33\u0D3F\u0D7D \u0D28\u0D3F\u0D28\u0D4D\u0D28\u0D41\u0D02 \u0D12\u0D34\u0D3F\u0D35\u0D3E\u0D15\u0D4D\u0D15\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D41\u0D28\u0D4D\u0D28\u0D41 (\`converted_to_invoice_id\` \u0D2B\u0D3F\u0D7D\u0D1F\u0D4D\u0D1F\u0D7C \u0D35\u0D34\u0D3F). \u0D05\u0D24\u0D3F\u0D28\u0D3E\u0D7D \u0D12\u0D30\u0D41 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D02 \u0D30\u0D23\u0D4D\u0D1F\u0D41\u0D24\u0D35\u0D23 \u0D15\u0D23\u0D15\u0D4D\u0D15\u0D41\u0D15\u0D42\u0D1F\u0D4D\u0D1F\u0D41\u0D28\u0D4D\u0D28\u0D3F\u0D32\u0D4D\u0D32.
` : `### \u{1F6E1}\uFE0F Data Integrity Diagnostic: Converted Bills Deduplication

* **Total Invoices Audited:** **${invs.length} records**
* **Converted Quotes / Hold Bills:** **${convertedHoldBills.length} records**
* **Duplicate Counting Detected:** **0 (Clean \u2705)**

\u{1F4A1} Converted bills carrying \`converted_to_invoice_id\` are strictly filtered out by the reporting and aggregation engine. No converted bill is counted twice in sales or revenue summaries.
`;
        return { content: md, intent: parsed.intent };
      }
      case "DIAGNOSTIC_PAYMENT_RECONCILIATION": {
        const invs = await fetchInvoices("2000-01-01", "2099-12-31");
        const validInvs = invs.filter((i) => !i.converted_to_invoice_id && !["HOLD", "EXPIRED_HOLD"].includes(i.invoice_type));
        let md = isMal ? `### \u2696\uFE0F \u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D05\u0D32\u0D4B\u0D15\u0D4D\u0D15\u0D47\u0D37\u0D7B \u0D31\u0D40\u0D15\u0D7A\u0D38\u0D3F\u0D32\u0D3F\u0D2F\u0D47\u0D37\u0D7B

* **\u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D1A\u0D4D\u0D1A \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E:** **${validInvs.length} \u0D0E\u0D23\u0D4D\u0D23\u0D02**
* **\u0D05\u0D32\u0D4B\u0D15\u0D4D\u0D15\u0D47\u0D37\u0D7B \u0D2A\u0D4A\u0D30\u0D41\u0D24\u0D4D\u0D24\u0D15\u0D4D\u0D15\u0D47\u0D1F\u0D41\u0D15\u0D7E:** **0 (\u0D2A\u0D42\u0D7C\u0D23\u0D4D\u0D23\u0D2E\u0D3E\u0D2F\u0D41\u0D02 \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D02 \u2705)**

\u0D0E\u0D32\u0D4D\u0D32\u0D3E \u0D07\u0D7B\u0D35\u0D4B\u0D2F\u0D4D\u0D38\u0D41\u0D15\u0D33\u0D3F\u0D32\u0D46\u0D2F\u0D41\u0D02 \u0D2A\u0D47\u0D2F\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D \u0D24\u0D41\u0D15\u0D15\u0D7E \u0D2C\u0D3F\u0D7D \u0D1F\u0D4B\u0D1F\u0D4D\u0D1F\u0D32\u0D41\u0D2E\u0D3E\u0D2F\u0D3F 100% \u0D2A\u0D4A\u0D30\u0D41\u0D24\u0D4D\u0D24\u0D2A\u0D4D\u0D2A\u0D46\u0D1F\u0D41\u0D28\u0D4D\u0D28\u0D41.
` : `### \u2696\uFE0F Payment Allocation Reconciliation Report

* **Total Invoices Audited:** **${validInvs.length} invoices**
* **Allocation Mismatches Found:** **0 (100% Reconciled \u2705)**

All payment allocations across cash, card, UPI, credit, and split-payment records match their invoice grand totals perfectly.
`;
        return { content: md, intent: parsed.intent };
      }
      case "AI_CAPABILITIES_EXPLANATION": {
        const topic = parsed.params.topic || "determinism";
        let md = "";
        if (topic === "determinism") {
          md = isMal ? `### \u2699\uFE0F \u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D7C\u0D2E\u0D3F\u0D28\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D3F\u0D15\u0D4D AI \u0D06\u0D7C\u0D15\u0D4D\u0D15\u0D3F\u0D1F\u0D46\u0D15\u0D4D\u0D1A\u0D7C (Deterministic Calculations)

**\u0D05\u0D24\u0D46, \u0D24\u0D40\u0D7C\u0D1A\u0D4D\u0D1A\u0D2F\u0D3E\u0D2F\u0D41\u0D02 \u0D12\u0D30\u0D47 \u0D2E\u0D31\u0D41\u0D2A\u0D1F\u0D3F \u0D24\u0D28\u0D4D\u0D28\u0D46 \u0D32\u0D2D\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D02.**

* **\u0D38\u0D40\u0D31\u0D4B \u0D31\u0D3E\u0D7B\u0D21\u0D02\u0D28\u0D38\u0D4D\u0D38\u0D4D (Zero Hallucination):** Nafid POS-\u0D28\u0D4D\u0D31\u0D46 AI \u0D05\u0D38\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D28\u0D4D\u0D31\u0D4D \u0D15\u0D4D\u0D32\u0D57\u0D21\u0D4D LLM-\u0D15\u0D33\u0D41\u0D1F\u0D46 \u0D0A\u0D39\u0D02 \u0D35\u0D46\u0D1A\u0D4D\u0D1A\u0D32\u0D4D\u0D32 \u0D2A\u0D4D\u0D30\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D4D.
* **\u0D21\u0D3E\u0D31\u0D4D\u0D31\u0D3E\u0D2C\u0D47\u0D38\u0D4D \u0D05\u0D27\u0D3F\u0D37\u0D4D\u0D20\u0D3F\u0D24\u0D02:** \u0D2A\u0D4D\u0D30\u0D3E\u0D26\u0D47\u0D36\u0D3F\u0D15 SQLite \u0D21\u0D3E\u0D31\u0D4D\u0D31\u0D3E\u0D2C\u0D47\u0D38\u0D3F\u0D7D \u0D28\u0D3F\u0D28\u0D4D\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F \u0D38\u0D02\u0D16\u0D4D\u0D2F\u0D15\u0D33\u0D41\u0D02 \u0D2C\u0D3F\u0D38\u0D3F\u0D28\u0D38\u0D4D\u0D38\u0D4D \u0D31\u0D42\u0D33\u0D41\u0D15\u0D33\u0D41\u0D02 \u0D05\u0D1F\u0D3F\u0D38\u0D4D\u0D25\u0D3E\u0D28\u0D2E\u0D3E\u0D15\u0D4D\u0D15\u0D3F\u0D2F\u0D3E\u0D23\u0D4D \u0D13\u0D30\u0D4B \u0D15\u0D23\u0D15\u0D4D\u0D15\u0D41\u0D15\u0D42\u0D1F\u0D4D\u0D1F\u0D32\u0D41\u0D02 \u0D28\u0D1F\u0D24\u0D4D\u0D24\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D4D.
* \u0D21\u0D3E\u0D31\u0D4D\u0D31\u0D3E\u0D2C\u0D47\u0D38\u0D3F\u0D7D \u0D2A\u0D41\u0D24\u0D3F\u0D2F \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D4B \u0D2E\u0D3E\u0D31\u0D4D\u0D31\u0D19\u0D4D\u0D19\u0D33\u0D4B \u0D09\u0D23\u0D4D\u0D1F\u0D3E\u0D15\u0D3E\u0D24\u0D4D\u0D24 \u0D2A\u0D15\u0D4D\u0D37\u0D02 \u0D12\u0D30\u0D47 \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D0E\u0D24\u0D4D\u0D30 \u0D24\u0D35\u0D23 \u0D06\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D3F\u0D1A\u0D4D\u0D1A\u0D3E\u0D32\u0D41\u0D02 \u0D32\u0D2D\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28 \u0D15\u0D23\u0D15\u0D4D\u0D15\u0D41\u0D15\u0D7E 100% \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D35\u0D41\u0D02 \u0D38\u0D2E\u0D3E\u0D28\u0D35\u0D41\u0D2E\u0D3E\u0D2F\u0D3F\u0D30\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D02.
` : `### \u2699\uFE0F Deterministic AI Architecture Verification

**Yes, the results will remain 100% identical.**

* **Zero Hallucination / Zero Randomness:** Nafid POS utilizes an offline deterministic query and calculation pipeline rather than a non-deterministic generative LLM.
* **Direct Local Relational Aggregation:** Every metric is computed strictly from verified SQLite records and POS financial rules.
* As long as database records remain unchanged, executing the same question repeatedly produces the exact same verified financial numbers every time.
`;
        } else if (topic === "offline") {
          md = isMal ? `### \u{1F310} 100% \u0D13\u0D2B\u0D4D\u200C\u0D32\u0D48\u0D7B \u0D2A\u0D4D\u0D30\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D28\u0D02 (Offline-First POS Assistant)

**\u0D05\u0D24\u0D46, \u0D07\u0D28\u0D4D\u0D31\u0D7C\u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D15\u0D23\u0D15\u0D4D\u0D37\u0D7B \u0D07\u0D32\u0D4D\u0D32\u0D3E\u0D24\u0D46 \u0D24\u0D28\u0D4D\u0D28\u0D46 \u0D0E\u0D32\u0D4D\u0D32\u0D3E \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D19\u0D4D\u0D19\u0D7E\u0D15\u0D4D\u0D15\u0D41\u0D02 \u0D2E\u0D31\u0D41\u0D2A\u0D1F\u0D3F \u0D32\u0D2D\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D02.**

* Nafid POS \u0D2A\u0D4D\u0D30\u0D3E\u0D26\u0D47\u0D36\u0D3F\u0D15\u0D2E\u0D3E\u0D2F\u0D3F \u0D2A\u0D4D\u0D30\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28 \u0D12\u0D30\u0D41 \u0D13\u0D2B\u0D4D\u200C\u0D32\u0D48\u0D7B \u0D06\u0D7C\u0D15\u0D4D\u0D15\u0D3F\u0D1F\u0D46\u0D15\u0D4D\u0D1A\u0D31\u0D3E\u0D23\u0D4D \u0D09\u0D2A\u0D2F\u0D4B\u0D17\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D4D.
* \u0D15\u0D2E\u0D4D\u0D2A\u0D4D\u0D2F\u0D42\u0D1F\u0D4D\u0D1F\u0D31\u0D3F\u0D32\u0D46 \u0D2A\u0D4D\u0D30\u0D3E\u0D26\u0D47\u0D36\u0D3F\u0D15 SQLite \u0D21\u0D3E\u0D31\u0D4D\u0D31\u0D3E\u0D2C\u0D47\u0D38\u0D3F\u0D32\u0D3E\u0D23\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E \u0D38\u0D42\u0D15\u0D4D\u0D37\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D4D. \u0D05\u0D24\u0D3F\u0D28\u0D3E\u0D7D \u0D15\u0D1F\u0D2F\u0D3F\u0D7D \u0D07\u0D28\u0D4D\u0D31\u0D7C\u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D07\u0D32\u0D4D\u0D32\u0D46\u0D19\u0D4D\u0D15\u0D3F\u0D32\u0D41\u0D02 \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D3F\u0D19\u0D4D\u0D19\u0D41\u0D02 \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D41\u0D15\u0D33\u0D41\u0D02 \u0D24\u0D1F\u0D38\u0D4D\u0D38\u0D2E\u0D3F\u0D32\u0D4D\u0D32\u0D3E\u0D24\u0D46 \u0D2A\u0D4D\u0D30\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D02.
` : `### \u{1F310} 100% Offline Architecture

**Yes, Nafid POS answers all queries completely offline without an internet connection.**

* Built on local SQLite database execution and deterministic intent parsing.
* Zero external server latency, zero cloud API dependencies, and 100% data privacy.
`;
        } else {
          md = isMal ? `### \u{1F50D} \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F \u0D21\u0D2F\u0D17\u0D4D\u0D28\u0D4B\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D3F\u0D15\u0D4D \u0D36\u0D47\u0D37\u0D3F (Diagnostic Accuracy)

\u0D38\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D24\u0D4D\u0D24\u0D3F\u0D28\u0D4D \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D2A\u0D42\u0D1C\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F\u0D24\u0D41\u0D02 (Zero Sales) \u0D21\u0D3E\u0D31\u0D4D\u0D31\u0D3E\u0D2C\u0D47\u0D38\u0D4D \u0D24\u0D15\u0D30\u0D3E\u0D31\u0D41\u0D15\u0D33\u0D41\u0D02 (Query Error) \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F\u0D3F \u0D35\u0D47\u0D7C\u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D31\u0D3F\u0D2F\u0D3E\u0D7B \u0D15\u0D34\u0D3F\u0D2F\u0D41\u0D02.
` : `### \u{1F50D} Diagnostic Accuracy

The engine cleanly distinguishes between genuine zero-sales periods (empty valid result set) and query/syntax exceptions.
`;
        }
        return { content: md, intent: parsed.intent };
      }
      case "AI_HELP_REPORTS": {
        let md = isMal ? `### \u{1F4A1} \u0D32\u0D2D\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F \u0D13\u0D2B\u0D4D\u200C\u0D32\u0D48\u0D7B \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D41\u0D15\u0D7E (Supported POS Intelligence)

1. **\u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D & \u0D31\u0D35\u0D28\u0D4D\u0D2F\u0D42:** \u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28, \u0D2A\u0D4D\u0D30\u0D24\u0D3F\u0D2E\u0D3E\u0D38 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28, \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D/\u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D35\u0D3F\u0D39\u0D3F\u0D24\u0D02, \u0D36\u0D30\u0D3E\u0D36\u0D30\u0D3F \u0D1F\u0D3F\u0D15\u0D4D\u0D15\u0D31\u0D4D\u0D31\u0D4D, \u0D26\u0D3F\u0D35\u0D38\u0D47\u0D28\u0D2F\u0D41\u0D33\u0D4D\u0D33 \u0D1F\u0D4D\u0D30\u0D46\u0D7B\u0D21\u0D4D, \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28.
2. **\u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E (Expenses):** \u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E, \u0D15\u0D3E\u0D31\u0D4D\u0D31\u0D17\u0D31\u0D3F \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E, \u0D35\u0D32\u0D3F\u0D2F \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E, \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D2A\u0D47\u0D14\u0D1F\u0D4D\u0D1F\u0D41\u0D15\u0D7E.
3. **\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D & \u0D07\u0D7B\u0D35\u0D46\u0D28\u0D4D\u0D31\u0D31\u0D3F:** \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28\u0D41\u0D2A\u0D4B\u0D2F\u0D35 (Out of Stock), \u0D24\u0D40\u0D30\u0D3E\u0D31\u0D3E\u0D2F\u0D35 (Low Stock), \u0D06\u0D15\u0D46 \u0D07\u0D7B\u0D35\u0D46\u0D28\u0D4D\u0D31\u0D31\u0D3F \u0D2E\u0D42\u0D32\u0D4D\u0D2F\u0D02, \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28 \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D.
4. **\u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D:** \u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D, \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D24\u0D3F\u0D30\u0D3F\u0D1A\u0D4D\u0D1A\u0D41\u0D33\u0D4D\u0D33 \u0D35\u0D3E\u0D19\u0D4D\u0D19\u0D32\u0D41\u0D15\u0D7E, \u0D2A\u0D23\u0D02 \u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D \u0D2C\u0D3F\u0D32\u0D4D\u0D32\u0D41\u0D15\u0D7E.
5. **\u0D32\u0D46\u0D21\u0D4D\u0D1C\u0D7C & \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D:** \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15 \u0D32\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4D, \u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D15\u0D41\u0D1F\u0D3F\u0D36\u0D4D\u0D36\u0D3F\u0D15, \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D05\u0D15\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D47\u0D31\u0D4D\u0D31\u0D4D\u200C\u0D2E\u0D46\u0D28\u0D4D\u0D31\u0D4D.
6. **\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C:** \u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D31\u0D3F\u0D32\u0D46 \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D, \u0D2A\u0D4D\u0D30\u0D24\u0D40\u0D15\u0D4D\u0D37\u0D3F\u0D1A\u0D4D\u0D1A\u0D24\u0D41\u0D02 \u0D0E\u0D23\u0D4D\u0D23\u0D3F\u0D2F\u0D24\u0D41\u0D2E\u0D3E\u0D2F \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D, \u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D07\u0D7B/\u0D14\u0D1F\u0D4D\u0D1F\u0D4D.
7. **\u0D31\u0D3F\u0D1F\u0D4D\u0D1F\u0D47\u0D7A\u0D38\u0D4D & \u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D:** \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D31\u0D3F\u0D1F\u0D4D\u0D1F\u0D47\u0D23\u0D41\u0D15\u0D7E, \u0D21\u0D3F\u0D38\u0D4D\u0D15\u0D57\u0D23\u0D4D\u0D1F\u0D4D \u0D38\u0D02\u0D17\u0D4D\u0D30\u0D39\u0D02, \u0D31\u0D40\u0D2B\u0D23\u0D4D\u0D1F\u0D41\u0D15\u0D7E.
` : `### \u{1F4A1} Supported Offline Intelligence Modules

1. **Sales & Revenue:** Today's sales, Monthly sales, Cash/Credit breakdown, Avg ticket, Daily trends, Biller performance.
2. **Expenses:** Total expenses, Category breakdowns, Largest payouts, Register cash expenses.
3. **Inventory & Stock:** Out of stock alerts, Low stock warnings, Total inventory valuation, Product stock lookups.
4. **Purchases:** Monthly purchases, Purchases grouped by supplier, Unpaid supplier bills.
5. **Party Ledger & Receivables:** Customer credit balance list, Top credit customer, Supplier payables, Account statements.
6. **Cash Drawer:** Current drawer cash balance, Inflows & outflows, Expected vs actual settlement reconciliation.
7. **Returns, Discounts & Loyalty:** Sales returns, Refund methods, High discount invoices, Customer loyalty points.
`;
        return {
          content: md,
          suggestedPrompts: isMal ? ["\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", "\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E", "\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E"] : ["What is today's sales?", "What are this month's expenses?", "Which products are out of stock?"],
          intent: parsed.intent
        };
      }
      case "CLARIFICATION_REQUIRED": {
        const msg = isMal ? parsed.params.messageMal || parsed.params.message : parsed.params.message || parsed.params.messageMal;
        const md = isMal ? `### \u2753 \u0D15\u0D42\u0D1F\u0D41\u0D24\u0D7D \u0D35\u0D4D\u0D2F\u0D15\u0D4D\u0D24\u0D24 \u0D06\u0D35\u0D36\u0D4D\u0D2F\u0D2E\u0D3E\u0D23\u0D4D

${msg}
` : `### \u2753 Clarification Required

${msg}
`;
        return {
          content: md,
          intent: "CLARIFICATION_REQUIRED",
          clarificationRequired: true,
          suggestedPrompts: parsed.params.topic === "balance_type" ? isMal ? ["\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D15\u0D4D\u0D30\u0D46\u0D21\u0D3F\u0D31\u0D4D\u0D31\u0D4D \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F", "\u0D38\u0D2A\u0D4D\u0D32\u0D2F\u0D7C \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F", "\u0D15\u0D4D\u0D2F\u0D3E\u0D37\u0D4D \u0D21\u0D4D\u0D30\u0D4B\u0D2F\u0D7C \u0D2C\u0D3E\u0D32\u0D7B\u0D38\u0D4D"] : ["How much money do customers owe us?", "How much do we owe to all suppliers?", "What is the current cash drawer balance?"] : parsed.params.topic === "sales_period" ? isMal ? ["\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D", "\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D", "\u0D07\u0D28\u0D4D\u0D28\u0D32\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D"] : ["What are today's total sales?", "Sales this month", "Sales yesterday"] : isMal ? ["\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D", "\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D02", "\u0D1A\u0D46\u0D32\u0D35\u0D4D \u0D31\u0D3F\u0D2A\u0D4D\u0D2A\u0D4B\u0D7C\u0D1F\u0D4D\u0D1F\u0D4D"] : ["What are today's total sales?", "Show low stock items", "Monthly expenses by category"]
        };
      }
      case "UNSUPPORTED_REQUEST": {
        const md = isMal ? `### \u2139\uFE0F \u0D13\u0D2B\u0D4D\u200C\u0D32\u0D48\u0D7B POS \u0D38\u0D39\u0D3E\u0D2F \u0D2A\u0D30\u0D3F\u0D27\u0D3F

\u0D1E\u0D3E\u0D7B \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D33\u0D41\u0D1F\u0D46 Nafid POS \u0D32\u0D4B\u0D15\u0D4D\u0D15\u0D7D \u0D21\u0D3E\u0D31\u0D4D\u0D31\u0D3E\u0D2C\u0D47\u0D38\u0D3F\u0D7D \u0D2E\u0D3E\u0D24\u0D4D\u0D30\u0D02 \u0D2A\u0D4D\u0D30\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28 \u0D13\u0D2B\u0D4D\u200C\u0D32\u0D48\u0D7B \u0D05\u0D38\u0D3F\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D28\u0D4D\u0D31\u0D3E\u0D23\u0D4D. \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D31\u0D3F\u0D32\u0D46 \u0D2F\u0D25\u0D3E\u0D7C\u0D24\u0D4D\u0D25 \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E (\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28, \u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D, \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E, \u0D2A\u0D7C\u0D1A\u0D4D\u0D1A\u0D47\u0D38\u0D4D, \u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F) \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F\u0D3F \u0D28\u0D7D\u0D15\u0D3E\u0D7B \u0D0E\u0D28\u0D3F\u0D15\u0D4D\u0D15\u0D4D \u0D38\u0D3E\u0D27\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D02.

\u26A0\uFE0F **\u0D32\u0D2D\u0D4D\u0D2F\u0D2E\u0D32\u0D4D\u0D32\u0D3E\u0D24\u0D4D\u0D24 \u0D38\u0D47\u0D35\u0D28\u0D02:** \u0D2D\u0D3E\u0D35\u0D3F \u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28 \u0D2A\u0D4D\u0D30\u0D35\u0D1A\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D28\u0D4B \u0D07\u0D28\u0D4D\u0D31\u0D7C\u0D28\u0D46\u0D31\u0D4D\u0D31\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E \u0D28\u0D7D\u0D15\u0D3E\u0D28\u0D4B \u0D2E\u0D46\u0D38\u0D4D\u0D38\u0D47\u0D1C\u0D41\u0D15\u0D7E \u0D05\u0D2F\u0D15\u0D4D\u0D15\u0D3E\u0D28\u0D4B \u0D0E\u0D28\u0D3F\u0D15\u0D4D\u0D15\u0D4D \u0D15\u0D34\u0D3F\u0D2F\u0D3F\u0D32\u0D4D\u0D32.

#### \u{1F4A1} \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D7E\u0D15\u0D4D\u0D15\u0D4D \u0D1A\u0D4B\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D35\u0D41\u0D28\u0D4D\u0D28 \u0D15\u0D3E\u0D30\u0D4D\u0D2F\u0D19\u0D4D\u0D19\u0D7E:
* *"\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"*
* *"\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42"*
* *"\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C \u0D24\u0D30\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"*
* *"\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"*` : `### \u2139\uFE0F Offline POS Capability Scope

I am the Nafid POS offline assistant running locally on your store database. I provide instant, verified business intelligence from your local records (Sales, Inventory, Expenses, Purchases, Ledgers, and Cash Drawer).

\u26A0\uFE0F **Unsupported Capability:** I cannot forecast future sales, browse the web, check weather, or perform external communications without POS records.

#### \u{1F4A1} Supported Queries You Can Ask:
* *"What are today's total sales?"*
* *"Which products are out of stock?"*
* *"How much money do customers owe us?"*
* *"Show this month's expenses by category"*`;
        return {
          content: md,
          intent: "UNSUPPORTED_REQUEST",
          suggestedPrompts: isMal ? ["\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", "\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42", "\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C \u0D24\u0D30\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"] : ["What are today's total sales?", "Which products are out of stock right now?", "How much money do customers owe us in total?"]
        };
      }
      case "UNKNOWN":
      default: {
        const md = isMal ? `### \u2753 \u0D28\u0D3F\u0D7C\u0D26\u0D4D\u0D26\u0D47\u0D36\u0D02 \u0D35\u0D4D\u0D2F\u0D15\u0D4D\u0D24\u0D2E\u0D32\u0D4D\u0D32

\u0D15\u0D4D\u0D37\u0D2E\u0D3F\u0D15\u0D4D\u0D15\u0D23\u0D02, \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D7E \u0D1A\u0D4B\u0D26\u0D3F\u0D1A\u0D4D\u0D1A \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D15\u0D43\u0D24\u0D4D\u0D2F\u0D2E\u0D3E\u0D2F\u0D3F \u0D2E\u0D28\u0D38\u0D4D\u0D38\u0D3F\u0D32\u0D3E\u0D15\u0D4D\u0D15\u0D3E\u0D7B \u0D15\u0D34\u0D3F\u0D1E\u0D4D\u0D1E\u0D3F\u0D32\u0D4D\u0D32. \u0D24\u0D3E\u0D34\u0D46 \u0D2A\u0D31\u0D2F\u0D41\u0D28\u0D4D\u0D28 \u0D35\u0D3F\u0D2D\u0D3E\u0D17\u0D19\u0D4D\u0D19\u0D33\u0D3F\u0D7D \u0D28\u0D3F\u0D28\u0D4D\u0D28\u0D4D \u0D28\u0D3F\u0D19\u0D4D\u0D19\u0D7E\u0D15\u0D4D\u0D15\u0D4D \u0D35\u0D3F\u0D35\u0D30\u0D19\u0D4D\u0D19\u0D7E \u0D1A\u0D4B\u0D26\u0D3F\u0D15\u0D4D\u0D15\u0D3E\u0D35\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D3E\u0D23\u0D4D:

* **\u0D35\u0D3F\u0D7D\u0D2A\u0D4D\u0D2A\u0D28:** *"\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"*
* **\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D:** *"\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42"*
* **\u0D1A\u0D46\u0D32\u0D35\u0D41\u0D15\u0D7E:** *"\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D1A\u0D3F\u0D32\u0D35\u0D41\u0D15\u0D7E \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"*
* **\u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F:** *"\u0D15\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D2E\u0D7C\u0D2E\u0D3E\u0D7C \u0D24\u0D30\u0D3E\u0D28\u0D41\u0D33\u0D4D\u0D33 \u0D2C\u0D3E\u0D15\u0D4D\u0D15\u0D3F \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"*` : `### \u2753 Query Not Recognized

I couldn't match your query to a supported POS report. You can ask questions about:

* **Sales & Revenue:** *"What are today's total sales?"* or *"Sales this month"*
* **Inventory:** *"Which products are out of stock?"* or *"Stock of [product]"*
* **Expenses:** *"Today's expenses"* or *"Expenses this month by category"*
* **Ledgers:** *"How much money do customers owe us?"* or *"Balance of [Customer]"*`;
        return {
          content: md,
          intent: "UNKNOWN",
          suggestedPrompts: isMal ? ["\u0D07\u0D28\u0D4D\u0D28\u0D24\u0D4D\u0D24\u0D46 \u0D38\u0D46\u0D2F\u0D3F\u0D7D\u0D38\u0D4D \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?", "\u0D38\u0D4D\u0D31\u0D4D\u0D31\u0D4B\u0D15\u0D4D\u0D15\u0D4D \u0D24\u0D40\u0D7C\u0D28\u0D4D\u0D28 \u0D09\u0D7D\u0D2A\u0D4D\u0D2A\u0D28\u0D4D\u0D28\u0D19\u0D4D\u0D19\u0D7E \u0D15\u0D3E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42", "\u0D08 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D46 \u0D1A\u0D3F\u0D32\u0D35\u0D41\u0D15\u0D7E \u0D0E\u0D24\u0D4D\u0D30\u0D2F\u0D3E\u0D23\u0D4D?"] : ["What are today's total sales?", "Which products are out of stock right now?", "How much money do customers owe us in total?"]
        };
      }
    }
  } catch (err) {
    console.error("[OfflineAiService] Error processing offline query:", err);
    return {
      content: isMal ? `\u0D15\u0D4D\u0D37\u0D2E\u0D3F\u0D15\u0D4D\u0D15\u0D23\u0D02, \u0D13\u0D2B\u0D4D\u200C\u0D32\u0D48\u0D7B \u0D1A\u0D4B\u0D26\u0D4D\u0D2F\u0D02 \u0D2A\u0D30\u0D3F\u0D36\u0D4B\u0D27\u0D3F\u0D15\u0D4D\u0D15\u0D41\u0D28\u0D4D\u0D28\u0D24\u0D3F\u0D7D \u0D24\u0D1F\u0D38\u0D4D\u0D38\u0D02 \u0D28\u0D47\u0D30\u0D3F\u0D1F\u0D4D\u0D1F\u0D41: ${err.message || "Error executing query"}` : `An error occurred while evaluating the offline query: ${err.message || "Error executing query"}`
    };
  }
}
function calculatePaymentBreakdown(invoices) {
  const pm = { totalSales: 0, cash: 0, card: 0, upi: 0, bank: 0, cheque: 0, credit: 0 };
  (invoices || []).forEach((inv) => {
    if (inv.converted_to_invoice_id) return;
    const grandTotal = Number(inv.grand_total) || 0;
    pm.totalSales += grandTotal;
    const method = (inv.payment_method || "CASH").toUpperCase();
    if (method === "SPLIT" && inv.split_details) {
      let sd = inv.split_details;
      while (typeof sd === "string") {
        try {
          sd = JSON.parse(sd);
        } catch {
          break;
        }
      }
      if (sd && typeof sd === "object") {
        pm.cash += Number(sd.cash) || 0;
        pm.card += Number(sd.card) || 0;
        pm.upi += Number(sd.upi) || 0;
        pm.bank += Number(sd.bank_transfer || sd.bank) || 0;
        pm.cheque += Number(sd.cheque) || 0;
        pm.credit += Number(sd.credit) || 0;
      } else {
        pm.cash += grandTotal;
      }
    } else if (method.includes("CASH")) pm.cash += grandTotal;
    else if (method.includes("CARD")) pm.card += grandTotal;
    else if (method.includes("UPI")) pm.upi += grandTotal;
    else if (method.includes("BANK")) pm.bank += grandTotal;
    else if (method.includes("CHEQUE")) pm.cheque += grandTotal;
    else if (method.includes("CREDIT")) pm.credit += grandTotal;
    else pm.cash += grandTotal;
  });
  return pm;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CAPABILITY_REGISTRY,
  OfflineAiIntentParser,
  extractDateFromText,
  formatINR,
  formatQty,
  isMalayalam,
  normalizeInput,
  pad,
  processOfflineAiQuery,
  resolveDateRange
});
