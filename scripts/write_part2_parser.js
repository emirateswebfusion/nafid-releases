const fs = require('fs');
const path = require('path');

const code = `
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
          message: 'Which balance would you like to review?\\n1. Customer Outstanding Balance (Receivables)\\n2. Supplier Outstanding Balance (Payables)\\n3. Cash Register Drawer Balance',
          messageMal: 'ഏത് ബാലൻസ് വിവരങ്ങളാണ് അറിയേണ്ടത്?\\n1. കസ്റ്റമർ ക്രെഡിറ്റ് ബാക്കി (തരാനുള്ളത്)\\n2. സപ്ലയർ ബാക്കി (നൽകാനുള്ളത്)\\n3. ക്യാഷ് ഡ്രോയർ ബാലൻസ് (കൗണ്ടർ ബോക്സ്)',
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
          message: 'Which business report would you like to view?\\n1. Sales & Revenue Summary\\n2. Inventory & Stock Status\\n3. Expenses & Cash Payouts\\n4. Purchase Bills & Payables\\n5. Customer & Supplier Ledgers',
          messageMal: 'ഏത് റിപ്പോർട്ട് വിവരങ്ങളാണ് കാണേണ്ടത്?\\n1. വിൽപ്പന റിപ്പോർട്ട് (Sales Report)\\n2. സ്റ്റോക്ക് നിലവാരം (Inventory Status)\\n3. ചെലവ് റിപ്പോർട്ട് (Expenses Report)\\n4. പർച്ചേസ് ബില്ലുകൾ (Purchase Bills)\\n5. കസ്റ്റമർ/സപ്ലയർ ലെഡ്ജർ (Ledgers)',
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
        .replace(/\\b(what\\s+is|what's|show|check|tell\\s+me|get|find|current|stock|level|quantity|qty|available|of|the|a|for|product|item|സ്റ്റോക്ക്|എത്ര|ഉണ്ട്|ഉൽപ്പന്നം)\\b/gi, ' ')
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
        const prodMatch = text.replace(/.*(?:price history for|purchase history for|history for|for|of|of a|product)\s+/i, '').replace(/[?.,!]/g, '').trim();
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
      const custName = text.replace(/.*(customer|for|of)\\s+/i, '').replace(/[?.,!]/g, '').trim();
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
      const amtMatch = text.match(/(?:₹|rs\.?|inr)?\\s*(\\d[\\d,]*)/i);
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
          .replace(/.*(?:barcode for|barcode of|gst rate and barcode for|gst rate for|price and barcode of|for)\\s+/i, '')
          .replace(/[?.,!]/g, '')
          .trim();
        return { intent: 'PRODUCT_PRICE_LOOKUP', domain: 'PRICING', params: { productName: prodName, includeBarcode: true } };
      }

      if (text.includes('barcode') || text.includes('ബാർകോഡ്') || text.includes('item code')) {
        const codeMatch = text.replace(/.*(?:barcode|code)\\s+/i, '').replace(/[?.,!]/g, '').trim();
        return { intent: 'PRODUCT_BARCODE_LOOKUP', domain: 'PRICING', params: { code: codeMatch } };
      }

      if (!text.includes('sales') && !text.includes('purchase')) {
        const prodName = text.replace(/.*(?:price of|cost of|rate of|rate for)\\s+/i, '').replace(/[?.,!]/g, '').trim();
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
      const amtMatch = text.match(/(?:₹|rs\.?|inr)?\\s*(\\d[\\d,]*)/i);
      const minAmount = amtMatch && amtMatch[1] ? parseInt(amtMatch[1].replace(/,/g, ''), 10) : 0;

      const limitMatch = text.match(/\\btop\\s+(\\d+)\\b/i);
      let limit = 15;
      if (limitMatch && limitMatch[1]) {
        limit = parseInt(limitMatch[1], 10);
      } else if (
        (/\\b(top|highest|biggest|number 1|#1)\\s+(credit\\s+)?customer\\b/i.test(text) && !/\\bcustomers\\b/i.test(text)) ||
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
        .replace(/['’]s\\b/gi, ' ')
        .replace(/\\b(what\\s+is|what's|how\\s+much|show\\s+me|show|check|get|find|tell\\s+me|tell|view|display|please|recent)\\b/gi, ' ')
        .replace(/\\b(credit\\s+balance|credit\\s+amount|balance\\s+amount|pending\\s+amount|due\\s+amount|outstanding\\s+amount)\\b/gi, ' ')
        .replace(/\\b(balance\\s+of|balance\\s+for|ledger\\s+transactions\\s+for|ledger\\s+for|statement\\s+for)\\b/gi, ' ')
        .replace(/\\b(balance|credit|ledger|statement|account|due|receivables?|debtors?|outstanding|pending|amount|customer|party|transactions|the|of|for)\\b/gi, ' ')
        .replace(/\\b(total|all|overall|list|summary|report|status|overview|details?|who|someone|anyone|everyone|every|full|complete|aggregate|sum|count|highest|top|maximum|max|minimum|min|many|much|owes?|money|people|persons?|accounts?|users?|clients?)\\b/gi, ' ')
        .replace(/[₹$]|inr|rs\\.?/gi, ' ')
        .replace(/(?:ന്റെ|യുടെ|ടെ|ൽ|ല്)\\b/g, ' ')
        .replace(/(?:മൊത്തം|ആകെ|എല്ലാ|എല്ലാവരുടെയും|ലിസ്റ്റ്|പട്ടിക|വിവരം|വിവരങ്ങൾ|സംഗ്രഹം)/g, ' ')
        .replace(/(?:എത്രയാണ്|എത്ര|ആണ്|കാണിക്കൂ|തരുമോ|നോക്കൂ|റിപ്പോർട്ട്|ബാലൻസ്|ബാക്കി|തുക|ക്രെഡിറ്റ്|കടം|കുടിശ്ശിക|ലെഡ്ജർ|സ്റ്റേറ്റ്മെന്റ്|കസ്റ്റമർ|കസ്റ്റമേഴ്സ്|പാർട്ടി)/g, ' ')
        .replace(/[?.,!:\\-_/\\\\#@*]/g, ' ')
        .trim();

      if (candidateName.length >= 2 && !/^\\d+$/.test(candidateName)) {
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
      /between\\s+\\d+.*?(?:am|pm|:)\\s+and\\s+\\d+/i.test(text)
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
      const amtMatch = text.match(/(?:greater than|above|>)\\s*(\\d+)/i);
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
      const numMatch = text.match(/\\b(\\d+)\\b/);
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

    if (text.includes('today') || text.includes('ഇന്ന്') || text.includes('how much')) {
      return { intent: 'SALES_TODAY', domain: 'SALES', params: { rangeType: 'today' } };
    }

    return { intent: 'UNKNOWN', params: { searchQuery: message } };
  }
}
`;

fs.writeFileSync(path.join(__dirname, 'part2.ts'), code);
console.log('Part 2 written.');
