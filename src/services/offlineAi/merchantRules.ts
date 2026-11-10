import { parseWorkflowGuide } from './workflowGuides';
import type { IntentParseContext } from './intentParser';
import type { AiIntentParams, ParsedOfflineIntent } from './types';
import { merchantEntity, merchantPeriod, merchantWords as w } from './merchantLanguage';

/** Compositional merchant vocabulary, with specific metrics ahead of broad domain words. */
export function parseMerchantIntent({ text }: IntentParseContext): ParsedOfflineIntent | undefined {
  const guide = parseWorkflowGuide(text);
  if (guide) return guide;
  const period = merchantPeriod(text);
  const result = (intent: string, domain: string, params: AiIntentParams = {}): ParsedOfflineIntent => ({ intent, domain, params });
  const range = (fallback = 'today') => ({ rangeType: period || fallback });
  const entity = (kind: Parameters<typeof merchantEntity>[1]) => merchantEntity(text, kind);
  const sales = w.sales.test(text);
  const stock = w.stock.test(text);
  const purchase = w.purchase.test(text);
  const expense = w.expense.test(text);
  const category = w.category.test(text);
  const compare = w.compare.test(text);
  const refund = /refund|റീഫണ്ട്|പണം തിരിച്ചു നൽകിയത്|panam thirichu nalkiyathu/.test(text);

  if (/cash|ക്യാഷ/.test(text) && /counted|എണ്ണിയ|shortage|excess/.test(text)) return result('CASH_DRAWER_EXPECTED_VS_ACTUAL', 'CASH_DRAWER');
  if (/across registers|sales by cash register/.test(text)) return result('SALES_BY_COUNTER', 'SALES', range());
  if (/paid out from.*register|average.*(?:bills|number of bills).*per day|spent the most|top spending customers/.test(text)) return undefined;
  if (w.drawer.test(text)) {
    if (/expected|counted|shortage|excess|പ്രതീക്ഷിച്ച|എണ്ണിയ|കുറവും അധികവും/.test(text)) return result('CASH_DRAWER_EXPECTED_VS_ACTUAL', 'CASH_DRAWER');
    if (/history|closings|closing.*pazhaya|ചരിത്രം|അടച്ച പഴയ/.test(text)) return result('CASH_DRAWER_SETTLEMENTS', 'CASH_DRAWER');
    if (/movement|transactions|cash in(?! drawer)|cash-in|inflows|outflows|വരവും പോക്കും|ഇടലും എടുക്കലും|varavum pokkum/.test(text)) return result('CASH_DRAWER_MOVEMENTS', 'CASH_DRAWER', range());
    // More specialised legacy drawer statuses retain their existing owner.
    if (!/pending|unsettled|biller|settlement status|not.*settled/.test(text) && !sales) return result('CASH_DRAWER_CURRENT', 'CASH_DRAWER');
  }
  if (period && w.methods.test(text) && !refund && !w.returned.test(text)) return result('SALES_PAYMENT_METHODS', 'SALES', { method: 'ALL', ...range() });
  if (/unique customers|distinct customers|വ്യത്യസ്ത കസ്റ്റമ|വ്യത്യസ്ത ഉപഭോക്ത|vyathyastha customers/.test(text)) return result('SALES_UNIQUE_CUSTOMERS', 'SALES', range());
  if (w.customer.test(text) && /overdue|past.*credit period|കാലാവധി കഴിഞ്ഞ|നൽകാൻ വൈകിയ|credit period kazhinja/.test(text)) return result('CUSTOMER_OVERDUE_LIST', 'LEDGER');
  if (w.customer.test(text) && /payments? collected|old.*debt.*collected|payments.*today|അടച്ച പഴയ കടം|പിരിവ്|kadam pirivu|customer payments/.test(text)) return result('CUSTOMER_PAYMENTS_COLLECTED_TODAY', 'LEDGER', range());
  if (w.supplier.test(text) && /(?:suppliers?|vendors?) owe (?:us|me)|receivable|തരാനുള്ള|കിട്ടാനുള്ള|tharanulla|kittanulla/.test(text)) return result('SUPPLIER_RECEIVABLES', 'LEDGER');
  if (w.customer.test(text) && /(?:we|i) owe.*customers?|നൽകാനുള്ള|കൊടുക്കാനുള്ള|kodukkanulla/.test(text)) return result('CUSTOMER_PAYABLES', 'LEDGER');
  if (w.supplier.test(text) && /owe|payables|നൽകാനുള്ള|കൊടുക്കാനുള്ള|kodukkanulla/.test(text)) return result('SUPPLIER_PAYABLES_TOTAL', 'LEDGER');
  if (/^(?:show )?(?:loyalty(?: points)?|reward points|ലോയൽറ്റി(?: പോയിന്റുകൾ)?|റിവാർഡ് പോയിന്റുകൾ|പോയിന്റ്)[?!.]*$/.test(text)) return { intent: 'CLARIFICATION_REQUIRED', domain: 'HELP', clarificationRequired: true, params: { topic: 'loyalty_customer', message: 'Whose loyalty points do you need? Please give the customer name.', messageMal: 'ഏത് കസ്റ്റമറുടെ പോയിന്റുകളാണ് വേണ്ടത്? പേര് പറയൂ.' } };
  if (/loyalty|reward points|ലോയൽറ്റി|റിവാർഡ്/.test(text) && entity('loyalty')) return result('LOYALTY_POINTS', 'RETURNS_LOYALTY', { customerName: entity('loyalty') });
  if (/ledger|statement|ലെഡ്ജർ|സ്റ്റേറ്റ്മെന്റ്/.test(text) && entity('ledger')) return result('PARTY_LEDGER', 'LEDGER', { searchQuery: entity('ledger') });
  if ((w.customer.test(text) && /owe|receivable|തരാനുള്ള|tharanulla/.test(text)) || /കടം തരാനുള്ളവരുടെ|kadam tharanullavar/.test(text)) return result('CUSTOMER_CREDIT_LIST', 'LEDGER', { minAmount: 0, limit: 15 });

  if (/barcode|ബാർകോഡ്/.test(text) && entity('barcode')) return result('PRODUCT_BARCODE_LOOKUP', 'PRICING', { productName: entity('barcode') });
  if (stock && /value|valuation|worth|മൂല്യം|മൊത്തം വില|moolyam/.test(text)) return result('INVENTORY_TOTAL_VALUE', 'INVENTORY');
  if (/price|വില|vila/.test(text) && !/below|lower|negative|കുറച്ച്|കുറവ|kurachu|kurav|vilayekkal/.test(text) && entity('price')) return result('PRODUCT_PRICE_LOOKUP', 'PRICING', { productName: entity('price') });

  if (/out of stock|zero stock|തീർന്ന|നിലവിലില്ലാത്ത|theernna|theernnath/.test(text)) return result('INVENTORY_OUT_OF_STOCK', 'INVENTORY');
  if (/low.*stock|stock.*low|reorder|തീരാറായ|വീണ്ടും വാങ്ങേണ്ട|stock kuranja|veendum vangenda/.test(text)) return result('INVENTORY_LOW_STOCK', 'INVENTORY');
  if (/expiry|expired|കാലാവധി കഴി|kaalavadhi kazhinja/.test(text) && !w.customer.test(text)) return result('INVENTORY_EXPIRY_ALERT', 'INVENTORY');
  if (/dead stock|not sold|non selling|വിൽപ്പന നടക്കാത്ത|വിറ്റുപോകാത്ത|vilkkatha stock|vittupokatha/.test(text)) return result('INVENTORY_NON_SELLING', 'INVENTORY', { days: 30, ...range('last_30_days') });
  if (/negative margin|sell below purchase|വാങ്ങിയ വിലയേക്കാൾ|നഷ്ടത്തിൽ വിൽക്കുന്ന|vilayekkal kurachu/.test(text)) return result('INVENTORY_NEGATIVE_MARGIN', 'INVENTORY');
  if (stock && /highest|most stock|കൂടിയ സ്റ്റോക്ക്/.test(text)) return result('INVENTORY_TOP_STOCK', 'INVENTORY');
  if (stock) {
    if (category) return result('INVENTORY_BY_CATEGORY', 'INVENTORY');
    if (/how many products|total.*product|product.*count|എത്ര ഉൽപ്പന്ന|ഉൽപ്പന്നങ്ങളുടെ എണ്ണം|products ethra|products ennam/.test(text)) return result('INVENTORY_TOTAL_COUNT', 'INVENTORY');
    if (entity('stock')) return result('INVENTORY_PRODUCT_STOCK', 'INVENTORY', { productName: entity('stock') });
  }
  if (/units of|എത്ര എണ്ണം ബാക്കിയുണ്ട്|ethra ennam undu/.test(text) && entity('stock')) return result('INVENTORY_PRODUCT_STOCK', 'INVENTORY', { productName: entity('stock') });

  if (refund && w.methods.test(text)) return result('RETURNS_BY_METHOD', 'RETURNS_LOYALTY', range('this_month'));
  if (w.returned.test(text)) {
    if (/items|products|സാധനങ്ങൾ|ഉൽപ്പന്നങ്ങൾ|sadhanangal/.test(text)) return result('RETURNS_ITEMS', 'RETURNS_LOYALTY', range('this_month'));
    if (sales || /customers return/.test(text)) return result('RETURNS_SUMMARY', 'RETURNS_LOYALTY', range('this_month'));
  }
  if (purchase && !w.customer.test(text)) {
    if (/unpaid|pending purchas|pending.*payment|പണം നൽകാത്ത|അടയ്ക്കാനുള്ള|panam kodukkatha/.test(text)) return result('PURCHASES_UNPAID', 'PURCHASES');
    if (/by supplier|by vendor|group.*vendor|സപ്ലയർ തിരിച്ച്|വിതരണക്കാരൻ അനുസരിച്ച്|supplier thirichu|vendor anusarichu/.test(text)) return result('PURCHASES_BY_SUPPLIER', 'PURCHASES', range('this_month'));
    if (!expense && !/history|price|compare|highest|താരതമ്യം/.test(text)) return result('PURCHASES_SUMMARY', 'PURCHASES', range('this_month'));
    if (/supplier bills/.test(text) && !sales) return result('PURCHASES_SUMMARY', 'PURCHASES', range('this_month'));
  }
  if ((sales && purchase && expense) || /complete.*business report|സമഗ്ര ബിസിനസ്സ് റിപ്പോർട്ട്|വിൽപ്പന വാങ്ങൽ ചെലവ്|sales purchase chilavu/.test(text)) return result('DAILY_BUSINESS_REPORT', 'SALES', range());
  if (expense && !w.customer.test(text) && !/matches all recorded expense/.test(text)) {
    if (compare) return result('EXPENSES_COMPARE', 'EXPENSES', { compareWith: 'last_month' });
    if (category) return result('EXPENSES_BY_CATEGORY', 'EXPENSES', range('this_month'));
    if (w.largest.test(text)) return result('EXPENSES_LARGEST', 'EXPENSES', { ...range('this_month'), limit: 5 });
    if (!/cash paid out|cash.*expense|expense.*match|sum of|missing/.test(text)) return result('EXPENSES_SUMMARY', 'EXPENSES', range('this_month'));
  }
  if (/cancelled|canceled|voided|റദ്ദാക്കിയ|കാൻസൽ ചെയ്ത|cancel cheytha|raddakkiya/.test(text)) return result('SALES_CANCELLED_INVOICES', 'SALES');
  if (/discount|ഡിസ്കൗണ്ട്|കിഴിവ്|kizhivu/.test(text) && !/greater than|for each invoice|invoices with/.test(text)) return result('SALES_GROSS_NET', 'SALES', { metric: 'discount', ...range() });
  if (sales && /\bvat\b|വാറ്റ്|\btax\b/.test(text) && !/rate|product/.test(text)) return result('SALES_GROSS_NET', 'SALES', { metric: 'tax', ...range() });
  if (/average.*bill|average ticket|avg ticket|ശരാശരി ബിൽ|ബില്ലിന്റെ ശരാശരി|sharashari bill/.test(text)) return result('SALES_AVERAGE_TICKET', 'SALES', range());
  if (/average sales per day|daily average|average daily|പ്രതിദിന ശരാശരി|ദിവസേന ശരാശരി|prathidina sharashari/.test(text)) return result('SALES_AVERAGE_DAILY', 'SALES', range('this_month'));
  if (/highest value invoice|biggest bill|ഏറ്റവും വലിയ ബിൽ|ഉയർന്ന തുകയുള്ള ഇൻവോയ്സ്|valiya invoice/.test(text)) return result('SALES_INVOICE_EXTREMES', 'SALES', range());
  if (/count.*invoices|invoice.*ennam|എത്ര ബില്ലുകൾ|ബില്ലുകളുടെ എണ്ണം|ethra bill|bill.*adichu/.test(text)) return result('SALES_INVOICE_COUNT', 'SALES', range());
  if (sales) {
    if (/daily.*trend|by day|ദിവസേന|ദിവസം തിരിച്ച്|divasam thirichu/.test(text)) return result('SALES_DAILY_TREND', 'SALES', range('this_month'));
    if (/by biller|by staff|സ്റ്റാഫ് തിരിച്ച്|ബില്ലറുടെ|staff thirichu|oro biller/.test(text)) return result('SALES_BILLER_STAFF', 'SALES', range());
    if (/by.*counter|each counter|കൗണ്ടർ തിരിച്ച്|ബില്ലിംഗ് കൗണ്ടറിലും|counter thirichu|oro billing counter/.test(text)) return result('SALES_BY_COUNTER', 'SALES', range());
    if (w.methods.test(text)) return result('SALES_PAYMENT_METHODS', 'SALES', { method: 'ALL', ...range() });
    const method = /\bcash\b|ക്യാഷ്|പണമായി|panamayi/.test(text) ? 'CASH' : /\bcard\b|കാർഡ്/.test(text) ? 'CARD' : /credit|കടം വിൽപ്പന|ക്രെഡിറ്റിൽ|kadamayi/.test(text) ? 'CREDIT' : undefined;
    if (method) return result('SALES_PAYMENT_METHODS', 'SALES', { method, ...range() });
    if (/top.*(?:product|selling)|sold the most|കൂടുതൽ വിറ്റ|മികച്ച.*ഉൽപ്പന്ന|kooduthal vitta/.test(text)) return result('TOP_SELLING_PRODUCTS', 'SALES', { limit: Number(text.match(/\b(\d+)\b/)?.[1] || 5), ...range() });
    if (period && !/compar|highest|lowest|best|most|hour|match|sum|missing|താരതമ്യം/.test(text)) return result(period === 'today' ? 'SALES_TODAY' : 'SALES_PERIOD', 'SALES', range());
  }
  return undefined;
}
