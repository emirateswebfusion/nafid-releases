import type { ParsedOfflineIntent } from './types';
import type { IntentParseContext } from './intentParser';

/** Intent rules, part 2: inventory, purchases, cash drawer, bills, returns, pricing and party ledgers. Returns undefined when no rule matches. */
export function parseModuleIntent({ text, dateExtraction }: IntentParseContext): ParsedOfflineIntent | undefined {
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
    text.includes('theernnath') ||
    text.includes('reorder') ||
    text.includes('reordered') ||
    text.includes('not sold') ||
    text.includes('non selling') ||
    text.includes('dead stock') ||
    text.includes('expiry') ||
    text.includes('expired') ||
    text.includes('selling price lower') ||
    text.includes('added today') ||
    text.includes('new products') ||
    text.includes('products added');

  if (isStockWord) {
    if (text.includes('out of stock') || text.includes('തീർന്നുപോയ') || text.includes('തീർന്ന') || text.includes('zero stock') || text.includes('നിലവിലില്ലാത്ത') || text.includes('theernna') || text.includes('theernnath')) {
      return { intent: 'INVENTORY_OUT_OF_STOCK', domain: 'INVENTORY', params: {} };
    }
    if (text.includes('low stock') || text.includes('reorder') || text.includes('reordered') || text.includes('need to be reordered') || text.includes('തീരാറായ') || text.includes('കുറവുള്ള')) {
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
    if (text.includes('selling price lower') || text.includes('lower than purchase price') || text.includes('less than purchase price') || text.includes('negative margin')) {
      return { intent: 'INVENTORY_NEGATIVE_MARGIN', domain: 'INVENTORY', params: {} };
    }
    if (text.includes('expired') || text.includes('nearing expiry') || text.includes('expiry') || text.includes('expire')) {
      return { intent: 'INVENTORY_EXPIRY_ALERT', domain: 'INVENTORY', params: {} };
    }
    if (text.includes('how many products') || text.includes('total products') || text.includes('count of products') || text.includes('available in inventory') || text.includes('currently available')) {
      return { intent: 'INVENTORY_TOTAL_COUNT', domain: 'INVENTORY', params: {} };
    }
    if (text.includes('new products') || text.includes('added today') || text.includes('products were added')) {
      return { intent: 'INVENTORY_NEW_PRODUCTS_TODAY', domain: 'INVENTORY', params: {} };
    }

    // Check if candidate product name is specified
    const prodCandidate = text
      .replace(/\b(what\s+is|what's|show|check|tell\s+me|get|find|current|stock|level|quantity|qty|available|of|the|a|for|product|item|സ്റ്റോക്ക്|എത്ര|ഉണ്ട്|ഉൽപ്പന്നം)\b/gi, ' ')
      .replace(/[?.,!:]/g, ' ')
      .trim();

    if (!prodCandidate || /\b(specific|particular|someone|anyone)\b/i.test(prodCandidate)) {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'product_stock',
          message: 'Please specify the product name or barcode to check its stock level. (Example: *Stock of Mixi Jar* or *Stock of 064720*)',
          messageMal: 'സ്റ്റോക്ക് പരിശോധിക്കാൻ ഉൽപ്പന്നത്തിന്റെ പേര് അല്ലെങ്കിൽ ബാർകോഡ് നൽകുക. (ഉദാഹരണം: *Stock of Mixi Jar*)',
        },
        clarificationRequired: true,
      };
    }

    if (prodCandidate.length >= 2 && !prodCandidate.includes('low') && !prodCandidate.includes('out') && !prodCandidate.includes('total') && !prodCandidate.includes('inventory') && !prodCandidate.includes('reorder')) {
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
    text.includes('register') ||
    text.includes('opening cash') ||
    text.includes('closing cash') ||
    text.includes('opening balance') ||
    text.includes('cash settlement') ||
    text.includes('cashier settlement') ||
    text.includes('settlements') ||
    text.includes('expected cash') ||
    text.includes('counted cash') ||
    text.includes('cash shortages') ||
    text.includes('cash excess') ||
    text.includes('shortages and excess') ||
    text.includes('settlement differences') ||
    text.includes('cash-in and cash-out') ||
    text.includes('cash in and cash out') ||
    text.includes('paid out from the register');

  if (isDrawerWord && !text.includes('sales by cash register') && !text.includes('sales across billing counters') && !text.includes('across registers') && !text.includes('register intake')) {
    if (text.includes('pending transactions that have not been included') || text.includes('pending transactions') || text.includes('unsettled transactions')) {
      return { intent: 'CASH_DRAWER_PENDING_UNSETTLED', domain: 'CASH_DRAWER', params: {} };
    }
    if (text.includes('which cash registers have not been settled') || text.includes('not been settled') || text.includes('unsettled registers')) {
      return { intent: 'CASH_DRAWER_UNSETTLED_STATUS', domain: 'CASH_DRAWER', params: {} };
    }
    if (text.includes('settlement status for each biller') || text.includes('settlement status')) {
      return { intent: 'CASH_DRAWER_BILLER_STATUS', domain: 'CASH_DRAWER', params: {} };
    }
    if (text.includes('expected cash') || text.includes('counted cash') || text.includes('settlement differences') || text.includes('short') || text.includes('excess') || text.includes('shortages and excess')) {
      return { intent: 'CASH_DRAWER_EXPECTED_VS_ACTUAL', domain: 'CASH_DRAWER', params: {} };
    }
    if (text.includes('inflows') || text.includes('outflows') || text.includes('movements') || text.includes('cash-in') || text.includes('cash in and') || text.includes('withdrawals') || text.includes('deposits') || text.includes('register transactions') || text.includes('cash register transactions')) {
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
    text.includes('payable to suppliers') ||
    text.includes('payable to supplier') ||
    text.includes('still payable to suppliers') ||
    text.includes('money is still payable') ||
    text.includes('supplier has the highest outstanding') ||
    text.includes('supplier has the highest') ||
    text.includes('kadam kodukkanullath') ||
    text.includes('suppliersinu kodukkanulla') ||
    text.includes('kodukkanulla cash') ||
    text.includes('സപ്ലയർമാർക്ക് നൽകാനുള്ളത്')
  ) {
    const isTopSupplier = text.includes('highest') || text.includes('top') || text.includes('most');
    return { intent: 'SUPPLIER_PAYABLES_TOTAL', domain: 'LEDGER', params: { limit: isTopSupplier ? 1 : undefined } };
  }

  if (text.includes('paid to suppliers') || text.includes('paid to supplier') || text.includes('payments to suppliers') || text.includes('payments made to suppliers') || text.includes('supplier payments')) {
    return { intent: 'SUPPLIER_PAYMENTS_TODAY', domain: 'PURCHASES', params: { rangeType: 'today' } };
  }

  if (text.includes('overdue payments') || text.includes('overdue balance') || text.includes('customers have overdue') || text.includes('overdue customers') || text.includes('customer overdue') || text.includes('overdue list') || text.includes('overdue')) {
    return { intent: 'CUSTOMER_OVERDUE_LIST', domain: 'LEDGER', params: {} };
  }

  if (
    text.includes('collected from customers') ||
    text.includes('customer payments received') ||
    text.includes('payments received from customers') ||
    text.includes('collected against outstanding')
  ) {
    return { intent: 'CUSTOMER_PAYMENTS_COLLECTED_TODAY', domain: 'LEDGER', params: { rangeType: 'today' } };
  }

  if (
    text.includes('credit was given to customers') ||
    text.includes('credit given to customers') ||
    text.includes('credit given today')
  ) {
    return { intent: 'CUSTOMER_CREDIT_GIVEN_TODAY', domain: 'LEDGER', params: { rangeType: 'today' } };
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
      text.includes('highest outstanding balance') ||
      text.includes('customer has the highest') ||
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
      text.includes('unpaid balances') ||
      text.includes('customers have unpaid') ||
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
      .replace(/\b(current|present|existing|given|a|an|balance|credit|ledger|statement|account|due|receivables?|debtors?|outstanding|pending|amount|customer|party|transactions|the|of|for)\b/gi, ' ')
      .replace(/\b(total|all|overall|list|summary|report|status|overview|details?|who|someone|anyone|everyone|every|full|complete|aggregate|sum|count|highest|top|maximum|max|minimum|min|many|much|owes?|money|people|persons?|accounts?|users?|clients?)\b/gi, ' ')
      .replace(/[₹$]|inr|rs\.?/gi, ' ')
      .replace(/(?:ന്റെ|യുടെ|ടെ|ൽ|ല്)\b/g, ' ')
      .replace(/(?:മൊത്തം|ആകെ|എല്ലാ|എല്ലാവരുടെയും|ലിസ്റ്റ്|പട്ടിക|വിവരം|വിവരങ്ങൾ|സംഗ്രഹം)/g, ' ')
      .replace(/(?:എത്രയാണ്|എത്ര|ആണ്|കാണിക്കൂ|തരുമോ|നോക്കൂ|റിപ്പോർട്ട്|ബാലൻസ്|ബാക്കി|തുക|ക്രെഡിറ്റ്|കടം|കുടിശ്ശിക|ലെഡ്ജർ|സ്റ്റേറ്റ്മെന്റ്|കസ്റ്റമർ|കസ്റ്റമേഴ്സ്|പാർട്ടി)/g, ' ')
      .replace(/[?.,!:\-_/\\#@*]/g, ' ')
      .trim();

    if (!candidateName || /\b(specific|particular|someone|anyone)\b/i.test(candidateName)) {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'customer_balance',
          message: 'Please specify the customer or party name or phone number. (Example: *Balance of Suhaib* or *Ledger of 8078075855*)',
          messageMal: 'ബാലൻസ് അറിയാൻ കസ്റ്റമറുടെ പേര് അല്ലെങ്കിൽ ഫോൺ നമ്പർ നൽകുക. (ഉദാഹരണം: *Balance of Suhaib*)',
        },
        clarificationRequired: true,
      };
    }

    if (candidateName.length >= 2 && !/^\d+$/.test(candidateName)) {
      return { intent: 'PARTY_LEDGER', domain: 'LEDGER', params: { searchQuery: candidateName } };
    }

    return { intent: 'CUSTOMER_CREDIT_LIST', domain: 'LEDGER', params: { minAmount: 0, limit: 15 } };
  }

  return undefined;
}
