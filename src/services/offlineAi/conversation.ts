import { normalizeInput } from './format';
import type { AiHistoryMessage, ParsedOfflineIntent } from './types';

type Parse = (message: string) => ParsedOfflineIntent;

const periods: Record<string, string> = {
  today: 'today', innu: 'today', inn: 'today', 'ഇന്ന്': 'today', 'ഇന്നത്തെ': 'today',
  yesterday: 'yesterday', innale: 'yesterday', 'ഇന്നലെ': 'yesterday',
  'this month': 'this_month', 'ee masam': 'this_month', 'ഈ മാസം': 'this_month',
  'last month': 'last_month', 'kazhinja masam': 'last_month', 'കഴിഞ്ഞ മാസം': 'last_month',
  'this week': 'this_week', 'ഈ ആഴ്ച': 'this_week', 'last week': 'last_week', 'കഴിഞ്ഞ ആഴ്ച': 'last_week',
};

function clarify(topic: string, message: string, messageMal: string, choices: string[]): ParsedOfflineIntent {
  return { intent: 'CLARIFICATION_REQUIRED', domain: 'HELP', clarificationRequired: true,
    params: { topic, message, messageMal }, choices };
}

const reportChoices = ['Sales report', 'Show low stock items', 'Monthly expenses by category', 'What is the current cash drawer balance?'];

// Only these handlers read rangeType; current-state and all-time reports cannot change period.
const periodReports = new Set([
  'SALES_TODAY', 'SALES_PERIOD', 'SALES_CUSTOM_RANGE', 'SALES_SPECIFIC_DATE', 'SALES_PAYMENT_METHODS',
  'SALES_INVOICE_COUNT', 'SALES_AVERAGE_TICKET', 'SALES_AVERAGE_DAILY', 'SALES_UNIQUE_CUSTOMERS',
  'SALES_INVOICE_EXTREMES', 'SALES_GROSS_NET', 'SALES_INVOICE_TYPES', 'DAILY_BUSINESS_REPORT',
  'SALES_HIGHEST_DAY', 'SALES_DAILY_TREND', 'SALES_BILLER_STAFF', 'SALES_CUSTOMER_LEVEL',
  'TOP_SELLING_PRODUCTS', 'SALES_BY_COUNTER', 'SALES_INVOICE_LIST',
  'EXPENSES_SUMMARY', 'EXPENSES_BY_CATEGORY', 'EXPENSES_LARGEST', 'PURCHASES_SUMMARY', 'PURCHASES_BY_SUPPLIER',
  'INVENTORY_NON_SELLING', 'RETURNS_SUMMARY', 'RETURNS_ITEMS', 'RETURNS_BY_METHOD', 'DISCOUNTS_SUMMARY',
]);

function withPeriod(parsed: ParsedOfflineIntent, period: string): ParsedOfflineIntent {
  return { ...parsed, intent: ['SALES_TODAY', 'SALES_SPECIFIC_DATE', 'SALES_CUSTOM_RANGE'].includes(parsed.intent) ? 'SALES_PERIOD' : parsed.intent,
    params: { ...parsed.params, rangeType: period, customFrom: undefined, customTo: undefined, specificDate: undefined } };
}

function metricPeriod(metric: string): ParsedOfflineIntent {
  return clarify(metric === 'cash sales' ? 'cash_period' : 'sales_period',
    'Which period would you like: today, yesterday, this month or last month?',
    'ഏത് കാലയളവാണ് വേണ്ടത്: ഇന്ന്, ഇന്നലെ, ഈ മാസം, അതോ കഴിഞ്ഞ മാസം?',
    ['today', 'yesterday', 'this month', 'last month'].map(period => `${metric} ${period}`));
}

/** A bounded conversation resolver. Only the immediately preceding assistant turn supplies context. */
export function parseConversation(message: string, history: AiHistoryMessage[], parse: Parse): ParsedOfflineIntent {
  const resolve = (query: string) => parseConversation(query, [], parse);
  const text = normalizeInput(message).normalize('NFC');
  const previous = history.at(-1)?.role === 'assistant' ? history.at(-1)?.parsedIntent : undefined;
  const periodText = text.replace(/^(and |what about |how about |പിന്നെ |അപ്പോൾ )/, '').replace(/\s+(then|ആയാലോ|എത്ര)$/u, '');
  const period = periods[periodText];
  const choiceNumber = /^(?:option\s*)?([1-9])$/.exec(text)?.[1];
  const ordinal = ['first', 'second', 'third', 'fourth', 'ഒന്നാമത്തേത്', 'രണ്ടാമത്തേത്', 'മൂന്നാമത്തേത്', 'നാലാമത്തേത്', 'onnamathe', 'randamathe', 'moonnamathe'];
  const ordinalIndex = ordinal.indexOf(text);
  const selection = choiceNumber ? Number(choiceNumber) - 1 : ordinalIndex >= 0 ? ordinalIndex % 4 : -1;
  if (previous?.clarificationRequired && /^(yes|no|അതെ|അല്ല|ariyilla|അറിയില്ല)$/.test(text)) return previous;
  if (previous?.clarificationRequired && previous.choices?.length) {
    if (previous.params.topic === 'financial_metric' && /^(cash|ക്യാഷ്|cash sales|ക്യാഷ് വിൽപ്പന)$/.test(text)) {
      return previous.params.rangeType ? resolve(previous.choices[1]) : metricPeriod('cash sales');
    }
    if (previous.params.topic === 'balance_type') {
      const index = /^(customer|customers|കസ്റ്റമർ)$/.test(text) ? 0
        : /^(supplier|suppliers|സപ്ലയർ)$/.test(text) ? 1 : /^(cash|drawer|ക്യാഷ്|ഡ്രോയർ)$/.test(text) ? 2 : -1;
      if (index >= 0) return resolve(previous.choices[index]);
    }
    const choice = previous.choices[selection];
    if (choice) {
      if (previous.params.topic === 'financial_metric' && !previous.params.rangeType && selection < 2) return metricPeriod(selection === 0 ? 'sales' : 'cash sales');
      return resolve(choice);
    }
    if (selection >= 0 || /^(yes|no|അതെ|അല്ല|ariyilla|അറിയില്ല)$/.test(text)) return previous;
    if (previous.params.topic === 'sales_period' && period) {
      return { intent: period === 'today' ? 'SALES_TODAY' : 'SALES_PERIOD', domain: 'SALES', params: { rangeType: period } };
    }
    if (previous.params.topic === 'cash_period' && period) return resolve(`cash sales ${period.replaceAll('_', ' ')}`);
    if (previous.params.topic === 'financial_metric' && /^(sales|sale|വിൽപ്പന|സെയിൽസ്|total sales)$/.test(text)) {
      return resolve(`sales ${previous.params.rangeType?.replaceAll('_', ' ') || ''}`.trim());
    }
  }
  if (/^(cancel|never mind|വേണ്ട|നിർത്തൂ)$/.test(text)) {
    return clarify('report_module', 'What would you like to check next?', 'അടുത്തതായി എന്താണ് പരിശോധിക്കേണ്ടത്?', reportChoices);
  }
  if (previous?.domain === 'SALES' && periodReports.has(previous.intent) && !previous.clarificationRequired && /^(?:what about |and )?(cash|card|upi|credit|ക്യാഷ്)$/.test(text)) {
    const method = text.includes('ക്യാഷ്') ? 'CASH' : text.split(' ').at(-1)!.toUpperCase();
    return { intent: 'SALES_PAYMENT_METHODS', domain: 'SALES', params: {
      method, rangeType: previous.params.specificDate ? 'custom' : previous.params.rangeType || 'today',
      customFrom: previous.params.specificDate || previous.params.customFrom, customTo: previous.params.specificDate || previous.params.customTo,
    } };
  }
  if (period) {
    if (previous && !previous.clarificationRequired && periodReports.has(previous.intent)) {
      return withPeriod(previous, period);
    }
    return clarify('report_module', 'Which report do you want for that period: sales, expenses, purchases or sales returns?',
      'ആ കാലയളവിൽ ഏത് വിവരമാണ് വേണ്ടത്: വിൽപ്പന, ചെലവ്, പർച്ചേസ്, അതോ സെയിൽസ് റിട്ടേൺ?',
      ['Sales', 'Expenses', 'Purchase bills', 'Sales returns'].map(q => `${q} ${period.replaceAll('_', ' ')}`));
  }
  const ambiguousMoney = /(?:എത്ര.*(?:കിട്ടി|ലഭിച്ചു|വന്നു)|(?:ethra|etra).*(?:kitti|kity|vannu)|how much (?:did we (?:get|make)|money)|\b(?:collection|takings)\b|കളക്ഷൻ|കലക്ഷൻ)/u.test(text);
  const explicitMetric = /\b(?:sales|profit|drawer|invoices?|customers?|suppliers?|expenses?|receivables?|payables?)\b|വിൽപ്പന|സെയിൽസ്|ലാഭം|ഡ്രോയർ|ചെലവ്|കസ്റ്റമർ|സപ്ലയർ/u.test(text);
  if (ambiguousMoney && !explicitMetric) {
    const range = /yesterday|innale|ഇന്നലെ/.test(text) ? 'yesterday' : /last month|കഴിഞ്ഞ മാസം/.test(text) ? 'last_month' : /this month|ee masam|ഈ മാസം/.test(text) ? 'this_month' : /today|\binn(?:u)?\b|ഇന്ന്|ഇന്നത്തെ/.test(text) ? 'today' : undefined;
    const result = clarify('financial_metric',
      'Do you mean sales value, cash sales, or the current cash drawer balance? Cash sales exclude old debt collections; drawer balance is money on hand, not total collections.',
      'വിൽപ്പനത്തുകയാണോ, ക്യാഷ് വിൽപ്പനയാണോ, ഇപ്പോൾ ഡ്രോയറിലുള്ള പണമാണോ ഉദ്ദേശിച്ചത്? ക്യാഷ് വിൽപ്പനയിൽ പഴയ കടം പിരിച്ചത് ഉൾപ്പെടില്ല; ഡ്രോയർ ബാലൻസ് ആകെ പിരിവല്ല.',
      [`Sales ${range?.replaceAll('_', ' ') || ''}`.trim(), `Cash sales ${range?.replaceAll('_', ' ') || 'today'}`, 'What is the current cash drawer balance?']);
    result.params.rangeType = range;
    return result;
  }
  const bareSales = /^(?:sales?|വിൽപ്പന|സെയിൽസ്|vilpana)(?: report)?$/u.test(text);
  const parsed = parse(bareSales ? 'sales' : message);
  if (parsed.clarificationRequired) {
    if (parsed.params.topic === 'financial_metric') return resolve('how much did we get');
    const choices = parsed.params.topic === 'sales_period' ? ['Sales today', 'Sales yesterday', 'Sales this month', 'Sales last month']
      : parsed.params.topic === 'balance_type' ? ['How much money do customers owe us?', 'How much do we owe to all suppliers?', 'What is the current cash drawer balance?']
      : parsed.params.topic === 'report_module' ? ['Sales report', 'How many products are currently available in inventory?', 'Monthly expenses by category', 'Purchase bills this month', 'balance'] : undefined;
    return { ...parsed, choices };
  }
  if (parsed.intent === 'UNKNOWN' && previous?.clarificationRequired && !period && selection < 0) {
    const topic = previous.params.topic;
    if (topic === 'loyalty_customer') return { intent: 'LOYALTY_POINTS', domain: 'RETURNS_LOYALTY', params: { customerName: message.trim() } };
    if (topic === 'product_stock') return { intent: 'INVENTORY_PRODUCT_STOCK', domain: 'INVENTORY', params: { productName: message.trim() } };
    if (topic === 'customer_balance') return { intent: 'PARTY_LEDGER', domain: 'LEDGER', params: { searchQuery: message.trim() } };
    if (topic === 'bills_product') return { intent: 'SALES_BILLS_CONTAINING_PRODUCT', domain: 'SALES', params: { productName: message.trim() } };
  }
  if (parsed.intent === 'UNKNOWN' && previous?.clarificationRequired) return previous;
  if (parsed.intent === 'UNKNOWN' || selection >= 0) return clarify('report_module',
    'I could not identify the report. Do you mean sales, stock, expenses or cash drawer? You can also give a product or customer name with your question.',
    'ഏത് വിവരമാണ് വേണ്ടതെന്ന് മനസ്സിലായില്ല. വിൽപ്പന, സ്റ്റോക്ക്, ചെലവ്, അതോ ക്യാഷ് ഡ്രോയർ? ഉൽപ്പന്നത്തിന്റെയോ കസ്റ്റമറുടെയോ പേരും ചോദ്യത്തോടൊപ്പം പറയാം.', reportChoices);
  // Specific periods must win over broad legacy checks such as "month".
  const explicitPeriod = /last month|kazhinja masam|കഴിഞ്ഞ മാസ/u.test(text) ? 'last_month'
    : /yesterday|innale|ഇന്നല/u.test(text) ? 'yesterday' : undefined;
  return explicitPeriod && periodReports.has(parsed.intent) && parsed.params.rangeType && parsed.params.rangeType !== 'custom'
    ? withPeriod(parsed, explicitPeriod) : parsed;
}
