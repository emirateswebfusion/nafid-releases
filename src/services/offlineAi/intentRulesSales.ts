import type { ParsedOfflineIntent } from './types';
import type { IntentParseContext } from './intentParser';

/** Intent rules, part 3: sales and revenue questions, ending with the UNKNOWN fallback. */
export function parseSalesIntent({ message, text, lastUserMsg, dateExtraction }: IntentParseContext): ParsedOfflineIntent {
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
  if (
    text.includes('unique customers') ||
    text.includes('വ്യത്യസ്ത കസ്റ്റമർമാർ') ||
    (text.includes('how many') && (text.includes('customers purchased') || text.includes('customers made purchases') || text.includes('customers bought') || text.includes('customers today')))
  ) {
    let rangeType = 'today';
    if (text.includes('this month') || text.includes('ഈ മാസം')) rangeType = 'this_month';
    return { intent: 'SALES_UNIQUE_CUSTOMERS', domain: 'SALES', params: { rangeType } };
  }

  // Highest / Lowest Month
  if (
    /(which|what) month.*(highest|most|best|peak|maximum|lowest|worst|least) sales?/.test(text) ||
    /(which|what) month.*(highest|most|best|peak|maximum|lowest|worst|least)/.test(text) ||
    /(highest|lowest|best|worst|peak|maximum|most) (sales|revenue|sale) month/.test(text) ||
    /(best|top|peak) month for (sales|revenue|sale)/.test(text) ||
    /month (with|of) (the )?(highest|lowest|best|worst|peak|maximum|most) (sales|revenue|sale)/.test(text) ||
    ((text.includes('month') || text.includes('മാസം') || text.includes('masam') || text.includes('masathil')) &&
      (text.includes('highest sales') || text.includes('highest sale') || text.includes('best sales') || text.includes('most sales') || text.includes('lowest sales') || text.includes('worst sales') || text.includes('least sales')) &&
      !text.includes('day') && !text.includes('ദിവസം') && !text.includes('daily') && !text.includes('this month') && !text.includes('ee masam')) ||
    ((text.includes('ഏറ്റവും കൂടുതൽ') || text.includes('ഏറ്റവും കുറഞ്ഞ') || text.includes('കൂടുതൽ വിൽപ്പന') || text.includes('കുറഞ്ഞ വിൽപ്പന')) && (text.includes('സെയിൽസ്') || text.includes('വിൽപ്പന')) && (text.includes('മാസം') || text.includes('month')) && !text.includes('ദിവസം') && !text.includes('day')) ||
    ((text.includes('ethu') || text.includes('ഏത്') || text.includes('ഏതു')) && (text.includes('masam') || text.includes('masathil') || text.includes('month') || text.includes('മാസം')) && (text.includes('highest') || text.includes('kooduthal') || text.includes('best') || text.includes('കൂടുതൽ') || text.includes('lowest') || text.includes('kuranja') || text.includes('കുറഞ്ഞ')))
  ) {
    const isLowest = text.includes('lowest') || text.includes('worst') || text.includes('least') || text.includes('കുറഞ്ഞ') || text.includes('kuranja');
    let year: string | undefined = undefined;
    const yearMatch = text.match(/\b(20\d\d)\b/);
    if (yearMatch) {
      year = yearMatch[1];
    } else if (text.includes('this year') || text.includes('ഈ വർഷം')) {
      year = String(new Date().getFullYear());
    } else if (text.includes('last year') || text.includes('കഴിഞ്ഞ വർഷം')) {
      year = String(new Date().getFullYear() - 1);
    }
    return { intent: 'SALES_HIGHEST_MONTH', domain: 'SALES', params: { isLowest, year } };
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
      (text.includes('purchased the most') || text.includes('spent the most') || text.includes('top spending') || text.includes('invoices generated for') || text.includes('sales history of a specific customer') || text.includes('sales grouped by customer') || text.includes('by sales amount') || text.includes('top five') || text.includes('top 5'))) ||
    text.includes('spent the most money this month') ||
    text.includes('top spending customers') ||
    text.includes('top five customers') ||
    text.includes('top 5 customers') ||
    text.includes('spent the most')
  ) {
    let rangeType = 'this_month';
    if (text.includes('today') || text.includes('ഇന്ന്')) rangeType = 'today';
    return { intent: 'SALES_CUSTOMER_LEVEL', domain: 'SALES', params: { rangeType, limit: (text.includes('top five') || text.includes('top 5')) ? 5 : 10 } };
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
    text.includes('sales quantity and revenue') ||
    text.includes('product-wise sales') ||
    text.includes('product wise sales') ||
    text.includes('highest quantity sold') ||
    text.includes('highest sales amount')
  ) {
    const numMatch = text.match(/\b(\d+)\b/);
    const limit = numMatch ? parseInt(numMatch[1], 10) : (text.includes('highest quantity sold') || text.includes('highest sales amount')) ? 1 : 5;
    const isLowest = text.includes('lowest') || text.includes('കുറഞ്ഞ');
    const isRevenue = text.includes('revenue') || text.includes('വരുമാനം') || text.includes('sales amount') || text.includes('amount');

    let rangeType = 'today';
    if (dateExtraction.fromDate && dateExtraction.toDate) rangeType = 'custom';
    else if (text.includes('this month') || text.includes('ഈ മാസം') || (text.includes('month') && !text.includes('today'))) rangeType = 'this_month';
    else if (text.includes('last month') || text.includes('കഴിഞ്ഞ മാസം')) rangeType = 'last_month';
    else if (text.includes('yesterday') || text.includes('ഇന്നലെ')) rangeType = 'yesterday';

    return {
      intent: 'TOP_SELLING_PRODUCTS',
      domain: 'SALES',
      params: {
        limit,
        isLowest,
        isRevenue,
        rangeType,
        customFrom: dateExtraction.fromDate,
        customTo: dateExtraction.toDate,
        customLabel: dateExtraction.label,
      },
    };
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

  // Bills containing product
  if (text.includes('bills containing') || text.includes('invoices containing') || text.includes('bills with product') || text.includes('invoices with product')) {
    const prodPart = text.replace(/.*(?:bills containing|invoices containing|bills with|invoices with)\s+/i, '').replace(/[?.,!]/g, '').trim();
    if (!prodPart || prodPart.includes('specific') || prodPart.includes('particular')) {
      return {
        intent: 'CLARIFICATION_REQUIRED',
        domain: 'HELP',
        params: {
          topic: 'bills_product',
          message: 'Which product would you like to search bills for? Example: *Show bills containing Mixi Jar*.',
          messageMal: 'ഏത് ഉൽപ്പന്നം അടങ്ങിയ ബില്ലുകളാണ് പരിശോധിക്കേണ്ടത്? ഉദാഹരണം: *Show bills containing Mixi Jar*',
        },
        clarificationRequired: true,
      };
    }
    return { intent: 'SALES_BILLS_CONTAINING_PRODUCT', domain: 'SALES', params: { productName: prodPart } };
  }

  // Latest Invoice Number
  if (text.includes('latest invoice number') || text.includes('last invoice number') || text.includes('recent invoice number') || text.includes('current invoice number')) {
    return { intent: 'SALES_LATEST_INVOICE_NUMBER', domain: 'SALES', params: {} };
  }

  // List of today's invoices
  if (
    text.includes('all invoices generated today') ||
    text.includes('show all invoices today') ||
    text.includes('list of invoices today') ||
    text.includes('show all invoices generated') ||
    text.includes('list today\'s invoices')
  ) {
    return { intent: 'SALES_INVOICE_LIST', domain: 'SALES', params: { rangeType: 'today' } };
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
    if (text.includes('supplier') || text.includes('customer') || text.includes('product') || text.includes('register') || text.includes('counter') || text.includes('settlement')) {
      return { intent: 'UNKNOWN', params: { searchQuery: message } };
    }
    return { intent: 'SALES_TODAY', domain: 'SALES', params: { rangeType: 'today' } };
  }

  return { intent: 'UNKNOWN', params: { searchQuery: message } };
}
