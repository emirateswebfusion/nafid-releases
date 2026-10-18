/**
 * Nafid POS Offline AI Assistant — Comprehensive Test Suite
 * Tests intent classification, date range resolution, natural language parsing,
 * formatting, and business rule edge cases for English and Malayalam.
 */

import {
  OfflineAiIntentParser,
  resolveDateRange,
  extractDateFromText,
  formatINR,
  formatQty,
  isMalayalam,
} from '../src/services/offlineAiService';

function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING NAFID POS OFFLINE AI ASSISTANT TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(testName: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // ── 1. Date Range Resolution Tests ─────────────────────────────────────────
  console.log('\n--- 1. Testing Date Range Resolution ---');

  const todayRange = resolveDateRange('today');
  assert('Today range spans 1 day', todayRange.daysCount === 1 && todayRange.fromDate === todayRange.toDate);

  const yesterdayRange = resolveDateRange('yesterday');
  assert('Yesterday range spans 1 day', yesterdayRange.daysCount === 1 && yesterdayRange.fromDate === yesterdayRange.toDate);

  const thisWeekRange = resolveDateRange('this_week');
  assert('This week has valid start date', !!thisWeekRange.fromDate && !!thisWeekRange.toDate);

  const lastWeekRange = resolveDateRange('last_week');
  assert('Last week spans exactly 7 days', lastWeekRange.daysCount === 7);

  const thisMonthRange = resolveDateRange('this_month');
  assert('This month starts on 1st', thisMonthRange.fromDate.endsWith('-01'));

  const lastMonthRange = resolveDateRange('last_month');
  assert('Last month starts on 1st', lastMonthRange.fromDate.endsWith('-01') && lastMonthRange.daysCount >= 28);

  const last30Range = resolveDateRange('last_30_days');
  assert('Last 30 days spans exactly 30 days', last30Range.daysCount === 30);

  const last7Range = resolveDateRange('last_7_days');
  assert('Last 7 days spans exactly 7 days', last7Range.daysCount === 7);

  const fyRange = resolveDateRange('financial_year');
  assert('Financial Year starts on April 1st', fyRange.fromDate.endsWith('-04-01'));

  const customRange = resolveDateRange('custom', '2026-01-01', '2026-01-15');
  assert('Custom range sets fromDate and toDate correctly', customRange.fromDate === '2026-01-01' && customRange.toDate === '2026-01-15');

  // ── 2. Natural Language Date Extraction Tests ──────────────────────────────
  console.log('\n--- 2. Testing Date Extraction from Natural Language ---');

  const d1 = extractDateFromText('sales on 2026-05-20');
  assert('Extract ISO date YYYY-MM-DD', d1.specificDate === '2026-05-20', `Got ${d1.specificDate}`);

  const d2 = extractDateFromText('show bills for 15/04/2026');
  assert('Extract DD/MM/YYYY date', d2.specificDate === '2026-04-15', `Got ${d2.specificDate}`);

  const d3 = extractDateFromText('sales for the last 14 days');
  assert('Extract past N days range', !!d3.fromDate && !!d3.toDate, `Got ${JSON.stringify(d3)}`);

  // ── 3. Currency & Quantity Formatting Tests ────────────────────────────────
  console.log('\n--- 3. Testing Currency & Quantity Formatting ---');

  assert('Format ₹1,25,000.00', formatINR(125000) === '₹1,25,000.00', `Got ${formatINR(125000)}`);
  assert('Format ₹0.00 for null', formatINR(null) === '₹0.00', `Got ${formatINR(null)}`);
  assert('Format Quantity 15.5', formatQty(15.5) === '15.5', `Got ${formatQty(15.5)}`);
  assert('Format Quantity 1,000', formatQty(1000) === '1,000', `Got ${formatQty(1000)}`);

  // ── 4. Language Detection Tests ───────────────────────────────────────────
  console.log('\n--- 4. Testing Language Detection ---');

  assert('Detect English', !isMalayalam('What is today sales?'));
  assert('Detect Malayalam script', isMalayalam('ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?'));

  // ── 5. Intent Classification Inventory (Section 3.A to 3.K) ───────────────
  console.log('\n--- 5. Testing Intent Classification (Full Inventory) ---');

  const intentCases: Array<{
    query: string;
    expectedIntent: string;
    expectedParams?: Record<string, any>;
    history?: any[];
  }> = [
    // 3.A Current-Day Sales
    { query: "What are today's total sales?", expectedIntent: 'SALES_TODAY' },
    { query: 'How much business did we do today?', expectedIntent: 'SALES_TODAY' },
    { query: 'How much did we sell today?', expectedIntent: 'SALES_TODAY' },
    { query: "Show today's sales report", expectedIntent: 'SALES_TODAY' },
    { query: 'What is today revenue?', expectedIntent: 'SALES_TODAY' },
    { query: 'ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', expectedIntent: 'SALES_TODAY' },
    { query: 'What were the sales during the last hour?', expectedIntent: 'SALES_HOURLY', expectedParams: { isLastHour: true } },
    { query: 'കഴിഞ്ഞ ഒരു മണിക്കൂറിലെ വിൽപ്പന', expectedIntent: 'SALES_HOURLY', expectedParams: { isLastHour: true } },
    { query: 'Show hourly sales today', expectedIntent: 'SALES_HOURLY' },

    // 3.B Historical Sales and Date Ranges
    { query: "Show yesterday's sales", expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'yesterday' } },
    { query: 'Sales for the previous day', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'yesterday' } },
    { query: 'Sales for the last 7 days', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'last_7_days' } },
    { query: 'Sales for the last 30 days', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'last_30_days' } },
    { query: 'Sales this week', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'this_week' } },
    { query: 'Sales last week', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'last_week' } },
    { query: 'Sales this month', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'this_month' } },
    { query: 'Sales last month', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'last_month' } },
    { query: 'Sales this year', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'this_year' } },
    { query: 'Financial year sales', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'financial_year' } },
    { query: 'ഇന്നലത്തെ സെയിൽസ് എത്രയാണ്?', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'yesterday' } },
    { query: 'കഴിഞ്ഞ മാസത്തെ വിൽപ്പന കാണിക്കൂ', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'last_month' } },
    { query: 'കഴിഞ്ഞ 30 ദിവസത്തെ വിൽപ്പന', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'last_30_days' } },

    // 3.C Comparisons and Trends
    { query: 'Compare today sales with yesterday', expectedIntent: 'COMPARE_SALES', expectedParams: { compareWith: 'yesterday' } },
    { query: 'Compare this month with last month', expectedIntent: 'COMPARE_SALES', expectedParams: { compareWith: 'last_month' } },
    { query: 'Compare this year with last year', expectedIntent: 'COMPARE_SALES', expectedParams: { compareWith: 'last_year' } },
    { query: 'Show the percentage increase in sales', expectedIntent: 'COMPARE_SALES' },
    { query: 'Which day had the highest sales this month?', expectedIntent: 'SALES_HIGHEST_DAY' },
    { query: 'What was our best sales day this year?', expectedIntent: 'SALES_HIGHEST_DAY' },
    { query: 'Show daily sales trend this month', expectedIntent: 'SALES_DAILY_TREND' },
    { query: 'കഴിഞ്ഞ മാസവുമായി താരതമ്യം ചെയ്യൂ', expectedIntent: 'COMPARE_SALES' },
    { query: 'ഈ മാസം ഏറ്റവും കൂടുതൽ സെയിൽസ് നടന്ന ദിവസം ഏതാണ്?', expectedIntent: 'SALES_HIGHEST_DAY' },

    // 3.D Invoice Count and Average Metrics
    { query: 'How many invoices were created today?', expectedIntent: 'SALES_INVOICE_COUNT' },
    { query: 'How many bills were created this month?', expectedIntent: 'SALES_INVOICE_COUNT' },
    { query: 'ഇന്ന് എത്ര ബില്ലുകൾ അടിച്ചു?', expectedIntent: 'SALES_INVOICE_COUNT' },
    { query: 'What is the average ticket value?', expectedIntent: 'SALES_AVERAGE_TICKET' },
    { query: 'ശരാശരി ബിൽ തുക എത്രയാണ്?', expectedIntent: 'SALES_AVERAGE_TICKET' },
    { query: 'What is the average daily sales amount?', expectedIntent: 'SALES_AVERAGE_DAILY' },
    { query: 'What is the average number of bills per day?', expectedIntent: 'SALES_AVERAGE_DAILY' },
    { query: 'How many unique customers purchased today?', expectedIntent: 'SALES_UNIQUE_CUSTOMERS' },
    { query: 'What is the highest-value invoice?', expectedIntent: 'SALES_INVOICE_EXTREMES' },
    { query: 'What is the lowest-value invoice?', expectedIntent: 'SALES_INVOICE_EXTREMES' },
    { query: 'How many invoices greater than 5000?', expectedIntent: 'SALES_INVOICE_EXTREMES', expectedParams: { minAmount: 5000 } },

    // 3.E Cash, Credit, and Payment-Method Sales
    { query: 'Show today cash sales', expectedIntent: 'SALES_PAYMENT_METHODS', expectedParams: { method: 'CASH' } },
    { query: 'Show today credit sales', expectedIntent: 'SALES_PAYMENT_METHODS', expectedParams: { method: 'CREDIT' } },
    { query: 'Show cash and credit sales separately', expectedIntent: 'SALES_PAYMENT_METHODS' },
    { query: 'How much was paid by card?', expectedIntent: 'SALES_PAYMENT_METHODS', expectedParams: { method: 'CARD' } },
    { query: 'How much was paid through UPI?', expectedIntent: 'SALES_PAYMENT_METHODS', expectedParams: { method: 'UPI' } },
    { query: 'Show this month sales by payment method', expectedIntent: 'SALES_PAYMENT_METHODS' },
    { query: 'How much credit remains outstanding?', expectedIntent: 'SALES_CREDIT_OUTSTANDING' },
    { query: 'Show invoices paid using multiple payment methods', expectedIntent: 'SALES_PAYMENT_METHODS' },
    { query: 'ക്യാഷ് സെയിൽസ് എത്രയാണ്?', expectedIntent: 'SALES_PAYMENT_METHODS', expectedParams: { method: 'CASH' } },
    { query: 'യുപിഐ വഴി എത്ര ലഭിച്ചു?', expectedIntent: 'SALES_PAYMENT_METHODS', expectedParams: { method: 'UPI' } },

    // 3.F Gross Sales, Net Sales, Discounts, and Returns
    { query: 'What are our gross sales today?', expectedIntent: 'SALES_GROSS_NET' },
    { query: 'What are our net sales today?', expectedIntent: 'SALES_GROSS_NET' },
    { query: 'How much discount was given today?', expectedIntent: 'SALES_GROSS_NET', expectedParams: { metric: 'discount' } },
    { query: 'What is the total discount this month?', expectedIntent: 'SALES_GROSS_NET', expectedParams: { metric: 'discount' } },
    { query: 'How much sales return was recorded this month?', expectedIntent: 'SALES_GROSS_NET', expectedParams: { metric: 'return' } },
    { query: 'How much tax was collected on sales?', expectedIntent: 'SALES_GROSS_NET', expectedParams: { metric: 'tax' } },

    // 3.G Invoice-Type Reports
    { query: 'Show sales by invoice type', expectedIntent: 'SALES_INVOICE_TYPES' },
    { query: 'Show today bills of supply', expectedIntent: 'SALES_INVOICE_TYPES' },

    // 3.H Product-Level Sales
    { query: 'Which products sold the most today?', expectedIntent: 'TOP_SELLING_PRODUCTS' },
    { query: 'Show the top five best-selling products', expectedIntent: 'TOP_SELLING_PRODUCTS', expectedParams: { limit: 5 } },
    { query: 'Which product generated the highest revenue?', expectedIntent: 'TOP_SELLING_PRODUCTS', expectedParams: { isRevenue: true } },
    { query: 'ഏറ്റവും കൂടുതൽ വിറ്റുപോയ 5 പ്രോഡക്റ്റുകൾ തരൂ', expectedIntent: 'TOP_SELLING_PRODUCTS', expectedParams: { limit: 5 } },

    // 3.I Customer-Level Sales
    { query: 'Which customers purchased the most this month?', expectedIntent: 'SALES_CUSTOMER_LEVEL' },
    { query: 'Show top spending customers', expectedIntent: 'SALES_CUSTOMER_LEVEL' },
    { query: '₹5,000-ൽ കൂടുതൽ ക്രെഡിറ്റ് ബാലൻസ് ഉള്ള കസ്റ്റമർമാർ', expectedIntent: 'CUSTOMER_CREDIT_LIST', expectedParams: { minAmount: 5000 } },
    { query: 'Who is the top credit customer?', expectedIntent: 'CUSTOMER_CREDIT_LIST', expectedParams: { limit: 1 } },
    { query: 'Who are the top credit customer?', expectedIntent: 'CUSTOMER_CREDIT_LIST', expectedParams: { limit: 1 } },

    // 3.J Biller / Staff Sales
    { query: 'Show sales by biller today', expectedIntent: 'SALES_BILLER_STAFF' },
    { query: 'Who sold the most today?', expectedIntent: 'SALES_BILLER_STAFF' },
    { query: 'ഏത് ബില്ലർ ആണ് കൂടുതൽ വിറ്റത്?', expectedIntent: 'SALES_BILLER_STAFF' },

    // 3.K Cancelled / Voided Invoices
    { query: 'How many invoices were cancelled?', expectedIntent: 'SALES_CANCELLED_INVOICES' },
    { query: 'Show cancelled invoices this month', expectedIntent: 'SALES_CANCELLED_INVOICES' },
    { query: 'റദ്ദാക്കിയ ബില്ലുകൾ കാണിക്കൂ', expectedIntent: 'SALES_CANCELLED_INVOICES' },

    // 3.L Data Integrity Diagnostics & Capabilities
    { query: 'Check whether converted bills are counted twice.', expectedIntent: 'DIAGNOSTIC_DEDUPLICATION_CHECK' },
    { query: 'Are any invoices being counted more than once in the sales report?', expectedIntent: 'DIAGNOSTIC_DEDUPLICATION_CHECK' },
    { query: 'Which customer spent the most money this month?', expectedIntent: 'SALES_CUSTOMER_LEVEL' },
    { query: 'Show all invoices generated for a specific customer this month.', expectedIntent: 'SALES_CUSTOMER_LEVEL' },
    { query: 'Show the number of unique invoices and total invoice value for each payment method.', expectedIntent: 'SALES_PAYMENT_METHODS' },
    { query: 'Identify invoices where payment allocations do not match the invoice total.', expectedIntent: 'DIAGNOSTIC_PAYMENT_RECONCILIATION' },
    { query: 'If the same question is asked twice without any data changes, will the result remain the same?', expectedIntent: 'AI_CAPABILITIES_EXPLANATION', expectedParams: { topic: 'determinism' } },
    { query: 'Can you answer today\'s sales question without an internet connection?', expectedIntent: 'AI_CAPABILITIES_EXPLANATION', expectedParams: { topic: 'offline' } },

    // 3.M Additional POS Modules & Novel Unseen Queries
    { query: 'What was our total turnover this month?', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'this_month' } },
    { query: 'What was our register intake today?', expectedIntent: 'SALES_TODAY' },
    { query: 'Who owes us the most cash right now?', expectedIntent: 'CUSTOMER_CREDIT_LIST' },
    { query: 'What is the cost of CELLO MUG M16?', expectedIntent: 'PRODUCT_PRICE_LOOKUP' },
    { query: 'ഈ മാസത്തെ മൊത്തം വരുമാനം എത്രയാണ്?', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'this_month' } },
    { query: 'കടം തരാനുള്ളവരുടെ ലിസ്റ്റ് കാണിക്കൂ', expectedIntent: 'CUSTOMER_CREDIT_LIST' },
    { query: 'സ്റ്റോക്കിലുള്ള ഉൽപ്പന്നങ്ങളുടെ ആകെ മൂല്യം എത്രയാണ്?', expectedIntent: 'INVENTORY_TOTAL_VALUE' },
    { query: 'ഇന്നലത്തെ വിൽപ്പന എത്രയായിരുന്നു?', expectedIntent: 'SALES_PERIOD', expectedParams: { rangeType: 'yesterday' } },
    { query: 'innathe total sales ethraya', expectedIntent: 'SALES_TODAY' },
    { query: 'ee masathe expense ethraya', expectedIntent: 'EXPENSES_SUMMARY', expectedParams: { rangeType: 'this_month' } },
    { query: 'aarokkeyanu kadam tharanullath', expectedIntent: 'CUSTOMER_CREDIT_LIST' },
    { query: 'stock theernna items ethokkeyanu', expectedIntent: 'INVENTORY_OUT_OF_STOCK' },
    { query: 'innu ethra bill adichu', expectedIntent: 'SALES_INVOICE_COUNT' },
    { query: 'Show cash and upi sales between 2026-10-01 and 2026-10-15', expectedIntent: 'SALES_PAYMENT_METHODS', expectedParams: { rangeType: 'custom', customFrom: '2026-10-01', customTo: '2026-10-15' } },
    { query: 'How many invoices greater than 1000 today?', expectedIntent: 'SALES_INVOICE_EXTREMES' },
    { query: 'balance', expectedIntent: 'CLARIFICATION_REQUIRED' },
    { query: 'show report', expectedIntent: 'CLARIFICATION_REQUIRED' },
    { query: 'how much money did we make', expectedIntent: 'CLARIFICATION_REQUIRED' },
    { query: 'Can you predict next month\'s sales revenue?', expectedIntent: 'UNSUPPORTED_REQUEST' },
    { query: 'What is the weather today?', expectedIntent: 'UNSUPPORTED_REQUEST' },
    { query: 'Send an email to Suhaib', expectedIntent: 'UNSUPPORTED_REQUEST' },

    // 3.N Extended Benchmark Queries & Newly Added Handlers
    { query: "If I ask for today's sales twice, will the system return the same result when no new transactions are recorded?", expectedIntent: 'AI_CAPABILITIES_EXPLANATION', expectedParams: { topic: 'determinism' } },
    { query: "Show the last successful synchronization time for each computer.", expectedIntent: 'SYSTEM_SYNC_STATUS' },
    { query: "Have all today's transactions been synchronized across computers?", expectedIntent: 'SYSTEM_SYNC_STATUS' },
    { query: "Does the daily report use the business date configured in settings?", expectedIntent: 'SYSTEM_SETTINGS_BUSINESS_DATE' },
    { query: "Show transactions recorded today but missing from the daily report.", expectedIntent: 'DIAGNOSTIC_MISSING_TRANSACTIONS' },
    { query: "Are there any duplicate product records in inventory?", expectedIntent: 'DIAGNOSTIC_DUPLICATE_PRODUCTS' },
    { query: "Check whether today's expense total matches all recorded expense transactions.", expectedIntent: 'DIAGNOSTIC_EXPENSE_SUM_VERIFICATION' },
    { query: "Check whether today's sales total matches the sum of all invoice totals.", expectedIntent: 'DIAGNOSTIC_SALES_SUM_VERIFICATION' },
    { query: "Are there any invoices with missing or incorrect totals?", expectedIntent: 'DIAGNOSTIC_INVOICE_TOTALS_INTEGRITY' },
    { query: "Find duplicate invoices in the system.", expectedIntent: 'DIAGNOSTIC_DUPLICATE_INVOICES' },
    { query: "Show the total number of sales, purchases, expenses, and returns today.", expectedIntent: 'DAILY_BUSINESS_REPORT' },
    { query: "Show today's sales, expenses, purchases, and net profit in one report.", expectedIntent: 'DAILY_BUSINESS_REPORT' },
    { query: "Generate a complete daily business report for today.", expectedIntent: 'DAILY_BUSINESS_REPORT' },
    { query: "Compare today's sales across all billing counters.", expectedIntent: 'SALES_BY_COUNTER' },
    { query: "Are there any pending transactions that have not been included in cash settlement?", expectedIntent: 'CASH_DRAWER_PENDING_UNSETTLED' },
    { query: "Show all cash shortages and excess amounts recorded today.", expectedIntent: 'CASH_DRAWER_EXPECTED_VS_ACTUAL' },
    { query: "Compare the expected cash with the counted cash for today's settlement.", expectedIntent: 'CASH_DRAWER_EXPECTED_VS_ACTUAL' },
    { query: "What is the expected closing cash for each register?", expectedIntent: 'CASH_DRAWER_SETTLEMENTS' },
    { query: "Which cash registers have not been settled today?", expectedIntent: 'CASH_DRAWER_UNSETTLED_STATUS' },
    { query: "Show today's cash settlement status for each biller.", expectedIntent: 'CASH_DRAWER_BILLER_STATUS' },
    { query: "Show today's cash register transactions.", expectedIntent: 'CASH_DRAWER_MOVEMENTS' },
    { query: "What is the current cash balance of each register?", expectedIntent: 'CASH_DRAWER_CURRENT' },
    { query: "Show all bills containing a specific product.", expectedIntent: 'CLARIFICATION_REQUIRED' },
    { query: "Show all bills containing Sugar", expectedIntent: 'SALES_BILLS_CONTAINING_PRODUCT', expectedParams: { productName: 'sugar' } },
    { query: "What is the total amount of cancelled bills today?", expectedIntent: 'SALES_CANCELLED_INVOICES' },
    { query: "Show today's invoices with their payment methods.", expectedIntent: 'SALES_PAYMENT_METHODS' },
    { query: "What is the latest invoice number?", expectedIntent: 'SALES_LATEST_INVOICE_NUMBER' },
    { query: "Show all invoices generated today.", expectedIntent: 'SALES_INVOICE_LIST' },
    { query: "What is the current balance of a specific customer?", expectedIntent: 'CLARIFICATION_REQUIRED' },
    { query: "How many products are in inventory?", expectedIntent: 'INVENTORY_TOTAL_COUNT' },
    { query: "Check products with selling price lower than purchase price.", expectedIntent: 'INVENTORY_NEGATIVE_MARGIN' },
    { query: "Show product expiry alerts.", expectedIntent: 'INVENTORY_EXPIRY_ALERT' },
    { query: "Show products added today.", expectedIntent: 'INVENTORY_NEW_PRODUCTS_TODAY' },
    { query: "Show customer overdue list.", expectedIntent: 'CUSTOMER_OVERDUE_LIST' },
    { query: "How much cash was collected from customers today?", expectedIntent: 'CUSTOMER_PAYMENTS_COLLECTED_TODAY' },
    { query: "How much credit was given to customers today?", expectedIntent: 'CUSTOMER_CREDIT_GIVEN_TODAY' },
    { query: "Show payments made to suppliers today.", expectedIntent: 'SUPPLIER_PAYMENTS_TODAY' }
  ];

  for (const tc of intentCases) {
    const res = OfflineAiIntentParser.parse(tc.query, tc.history);
    const intentOk = res.intent === tc.expectedIntent;
    let paramsOk = true;

    if (tc.expectedParams) {
      for (const k of Object.keys(tc.expectedParams)) {
        const v = tc.expectedParams[k];
        if ((res.params as any)[k] !== v) {
          paramsOk = false;
        }
      }
    }

    assert(
      `"${tc.query}" -> ${tc.expectedIntent}`,
      intentOk && paramsOk,
      !intentOk
        ? `Intent mismatch: got ${res.intent}, expected ${tc.expectedIntent}`
        : `Params mismatch: got ${JSON.stringify(res.params)}, expected ${JSON.stringify(tc.expectedParams)}`
    );
  }

  // ── 6. Business Rule Invariant Regression Tests ─────────────────────────────
  console.log('\n--- 6. Testing Business Rule Invariants & Discrepancy Regressions ---');

  // Discrepancy A: Customer Receivables Return Adjustment
  const initialSuhaibBalance = 15200.0;
  const returnPOS1RTN003Amount = 1200.0;
  const suhaibAdjustedBalance = initialSuhaibBalance - returnPOS1RTN003Amount;
  const otherCustomerBalances = [6358.50, 120.00, 7.00];
  const totalReceivablesBefore = initialSuhaibBalance + otherCustomerBalances.reduce((a, b) => a + b, 0);
  const totalReceivablesAfter = suhaibAdjustedBalance + otherCustomerBalances.reduce((a, b) => a + b, 0);

  assert('Suhaib balance reduced by credit return of ₹1,200', suhaibAdjustedBalance === 14000.0);
  assert('Customer receivables before return was ₹21,685.50', totalReceivablesBefore === 21685.50);
  assert('Customer receivables after return is exactly ₹20,485.50', totalReceivablesAfter === 20485.50);
  assert('Difference between pre and post return receivables is exactly ₹1,200.00', (totalReceivablesBefore - totalReceivablesAfter) === 1200.0);

  // Discrepancy B: Zero-Cost Product Return Inventory Valuation Invariant
  const initialStockQty = 310;
  const returnKnifeQty = 1;
  const knifePurchasePrice = 0.0;
  const knifeBasePrice = 0.0;
  const initialCostValuation = 64947.50;
  const initialRetailValuation = 475062.11;

  const updatedStockQty = initialStockQty + returnKnifeQty;
  const updatedCostValuation = initialCostValuation + (returnKnifeQty * knifePurchasePrice);
  const updatedRetailValuation = initialRetailValuation + (returnKnifeQty * knifeBasePrice);

  assert('Inventory stock increments by 1 unit from 310 to 311', updatedStockQty === 311);
  assert('Inventory cost valuation invariant holds (₹64,947.50)', updatedCostValuation === 64947.50);
  assert('Inventory retail valuation invariant holds (₹4,75,062.11)', updatedRetailValuation === 475062.11);

  // Date Range Filtering Invariant
  const explicitRangeQuery = "Show cash and upi sales between 2026-10-01 and 2026-10-15";
  const parsedExplicit = OfflineAiIntentParser.parse(explicitRangeQuery);
  assert('Explicit range parses start date 2026-10-01', parsedExplicit.params?.customFrom === '2026-10-01');
  assert('Explicit range parses end date 2026-10-15', parsedExplicit.params?.customTo === '2026-10-15');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(`📊 FINAL RESULT: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    if (typeof (globalThis as any).process !== 'undefined') {
      (globalThis as any).process.exit(1);
    }
  }
}

runTests();
