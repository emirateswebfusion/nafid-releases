import type { ParsedOfflineIntent } from './types';
import type { IntentParseContext } from './intentParser';

/** Intent rules, part 1: diagnostics, assistant / help questions, clarifications, business reports and expenses. Returns undefined when no rule matches. */
export function parseGeneralIntent({ message, text, dateExtraction }: IntentParseContext): ParsedOfflineIntent | undefined {
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

  // Diagnostics: Missing transactions from daily report
  if (
    text.includes('missing from the daily report') ||
    text.includes('missing from report') ||
    text.includes('recorded today but missing') ||
    text.includes('transactions recorded today but missing')
  ) {
    return { intent: 'DIAGNOSTIC_MISSING_TRANSACTIONS', domain: 'DIAGNOSTICS', params: { rangeType: 'today' } };
  }

  // Diagnostics: Sales sum verification vs invoice totals
  if (
    (text.includes('sales total') && (text.includes('match') || text.includes('sum'))) ||
    text.includes('matches the sum of all invoice totals') ||
    text.includes('sum of all invoice totals') ||
    text.includes('sales total matches all')
  ) {
    return { intent: 'DIAGNOSTIC_SALES_SUM_VERIFICATION', domain: 'DIAGNOSTICS', params: { rangeType: 'today' } };
  }

  // Diagnostics: Expense sum verification
  if (
    (text.includes('expense total') && (text.includes('match') || text.includes('sum'))) ||
    text.includes('matches all recorded expense') ||
    text.includes('sum of all expense')
  ) {
    return { intent: 'DIAGNOSTIC_EXPENSE_SUM_VERIFICATION', domain: 'DIAGNOSTICS', params: { rangeType: 'today' } };
  }

  // Diagnostics: Invoices with missing or incorrect totals
  if (
    text.includes('missing or incorrect totals') ||
    text.includes('incorrect totals') ||
    text.includes('missing totals') ||
    text.includes('invoices with incorrect')
  ) {
    return { intent: 'DIAGNOSTIC_INVOICE_TOTALS_INTEGRITY', domain: 'DIAGNOSTICS', params: {} };
  }

  // Diagnostics: Duplicate invoices
  if (
    text.includes('duplicate invoice') ||
    text.includes('duplicate invoices') ||
    text.includes('find duplicate invoices')
  ) {
    return { intent: 'DIAGNOSTIC_DUPLICATE_INVOICES', domain: 'DIAGNOSTICS', params: {} };
  }

  // Diagnostics: Duplicate products in inventory
  if (
    text.includes('duplicate product') ||
    text.includes('duplicate records in inventory') ||
    text.includes('duplicate items in inventory') ||
    text.includes('duplicate barcode')
  ) {
    return { intent: 'DIAGNOSTIC_DUPLICATE_PRODUCTS', domain: 'DIAGNOSTICS', params: {} };
  }

  // Multi-station / Sync diagnostics
  if (
    text.includes('synchronization') ||
    text.includes('synchronized') ||
    text.includes('synchronize') ||
    text.includes('sync time') ||
    text.includes('sync status') ||
    text.includes('across computers') ||
    text.includes('across terminals')
  ) {
    return { intent: 'SYSTEM_SYNC_STATUS', domain: 'DIAGNOSTICS', params: { checkToday: text.includes('today') } };
  }

  // Business date configuration in settings
  if (
    text.includes('business date') ||
    text.includes('business date configured in settings') ||
    text.includes('configured in settings')
  ) {
    return { intent: 'SYSTEM_SETTINGS_BUSINESS_DATE', domain: 'HELP', params: {} };
  }

  // 0b. AI Architecture & Determinism Capabilities
  if (
    text.includes('sales twice') ||
    text.includes('ask twice') ||
    text.includes('asked twice') ||
    text.includes('same result') ||
    text.includes('return the same') ||
    text.includes('remain the same') ||
    text.includes('deterministic') ||
    text.includes('idempotent') ||
    text.includes('idempotency') ||
    text.includes('without any data changes') ||
    text.includes('no new transactions') ||
    text.includes('without an internet connection') ||
    text.includes('distinguish between zero sales')
  ) {
    return {
      intent: 'AI_CAPABILITIES_EXPLANATION',
      domain: 'HELP',
      params: {
        topic:
          (text.includes('twice') || text.includes('same') || text.includes('deterministic') || text.includes('idempotent') || text.includes('transactions'))
            ? 'determinism'
            : text.includes('internet')
            ? 'offline'
            : 'diagnostics',
      },
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

  // Multi-metric Business Reports (Comprehensive Summary)
  if (
    text.includes('daily business report') ||
    text.includes('complete daily report') ||
    text.includes('complete daily business report') ||
    (text.includes('sales') && text.includes('expenses') && text.includes('purchases')) ||
    (text.includes('sales') && text.includes('expenses') && (text.includes('net profit') || text.includes('profit'))) ||
    text.includes('sales, purchases, expenses') ||
    text.includes('sales, expenses, purchases') ||
    text.includes('sales purchases expenses')
  ) {
    let rangeType = 'today';
    if (text.includes('this month') || text.includes('ഈ മാസം')) rangeType = 'this_month';
    else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';
    return { intent: 'DAILY_BUSINESS_REPORT', domain: 'SALES', params: { rangeType } };
  }

  // Sales by Billing Counter
  if (
    text.includes('billing counters') ||
    text.includes('billing counter') ||
    text.includes('all counters') ||
    text.includes('across counters') ||
    text.includes('across billing counters') ||
    text.includes('across registers') ||
    text.includes('across terminals')
  ) {
    let rangeType = 'today';
    if (text.includes('this month')) rangeType = 'this_month';
    return { intent: 'SALES_BY_COUNTER', domain: 'SALES', params: { rangeType } };
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

  return undefined;
}
