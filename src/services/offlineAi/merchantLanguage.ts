/** Shared vocabulary/slots. Merchant names and product names are not translated. */
export function merchantPeriod(text: string): string | undefined {
  if (/last\s*7\s*days|past seven days|കഴിഞ്ഞ (7|ഏഴ്) ദിവസ|kazhinja ezhu divas/.test(text)) return 'last_7_days';
  if (/last\s*30\s*days|കഴിഞ്ഞ (30|മുപ്പത്) ദിവസ/.test(text)) return 'last_30_days';
  if (/last year|previous year|കഴിഞ്ഞ വർഷ|മുൻ വർഷ|kazhinja varsh/.test(text)) return 'last_year';
  if (/this year|year to date|ഈ വർഷ|ee varsh|ee year/.test(text)) return 'this_year';
  if (/last month|previous month|കഴിഞ്ഞ മാസ|മുൻ മാസ|kazhinja mas|mun mas/.test(text)) return 'last_month';
  if (/this month|month to date|monthly|ഈ മാസ|ee mas/.test(text)) return 'this_month';
  if (/last week|previous week|കഴിഞ്ഞ ആഴ്ച|മുൻ ആഴ്ച|kazhinja aazh/.test(text)) return 'last_week';
  if (/this week|ഈ ആഴ്ച|ee aazh|ee week/.test(text)) return 'this_week';
  if (/yesterday|previous day|ഇന്നല|innalathe|innale/.test(text)) return 'yesterday';
  if (/today|ഇന്ന്|ഇന്നത്തെ|\binnu\b|\binnathe\b/.test(text)) return 'today';
  return undefined;
}

export const merchantWords = {
  sales: /\bsales?\b|\bsell\b|\bselling\b|\bsold\b|kooduthal vitta|turnover|വിൽപ്പന|വില്പന|സെയിൽ|vilpana|vilpanay|വിൽക്കുന്ന|vilkkunna/,
  expense: /expense|spend|spent|payout|spending|ചെല|ചിലവ|chilav|chelavu|chelav/,
  purchase: /purchas|\bbuy\b|\bbought\b|supplier bills?|vendor bills?|പർച്ചേസ്|വാങ്ങൽ|വാങ്ങിയ സാധന|സാധന(?:ം|ങ്ങൾ) വാങ്ങിയ|vangal|vangiya sadhan/,
  stock: /\bstock(?:ile|il)?\b|inventory|സ്റ്റോക്ക്|സ്റ്റോക്|ഇൻവെന്ററ/,
  customer: /customer|കസ്റ്റമ|ഉപഭോക്ത/,
  supplier: /supplier|vendor|സപ്ലയ|വിതരണക്കാ/,
  returned: /\breturns?\b|returned|(?:customers?|they) brought back|റിട്ടേൺ|തിരിച്ചു ?തന്ന|തിരിച്ചു വന്ന|thirichu vanna|thirichu thanna/,
  methods: /payment method|by method|രീതി തിരിച്ച്|method venam|cash card|cash.*card.*credit|പേയ്‌മെന്റ് രീതി|ക്യാഷും കാർഡും|method thirichu/,
  category: /category|കാറ്റഗറി|വിഭാഗം|vibhagam/,
  compare: /compar|താരതമ്യം|tharatamyam|ത്തേക്കാൾ.*കൂടിയോ/,
  largest: /largest|biggest|highest|ഏറ്റവും വലിയ|ഏറ്റവും ഉയർന്ന|കൂടിയ|valiya/,
  drawer: /drawer|register|രജിസ്റ്റ|ഡ്രോയറ|ഡ്രോയർ|കൗണ്ടറിലെ.*ക്യാഷ്|counter cash|counteril.*cash|പെട്ടിയ.*കാശ/,
} as const;

export function merchantEntity(text: string, kind: 'stock' | 'price' | 'barcode' | 'ledger' | 'loyalty'): string | undefined {
  const patterns: Record<typeof kind, RegExp[]> = {
    stock: [/\b(?:stock|quantity) of\s+(.+)/, /\bunits of\s+(.+?)\s+(?:are|is)\s+available/, /^(.+?)\s+(?:സ്റ്റോക്ക്|എത്ര എണ്ണം|stock\b|ethra ennam)/],
    price: [/\b(?:price|cost) of\s+(.+)/, /^(.+?)\s+(?:വില|വിൽപ്പന വില|vila\b|selling price\b)/],
    barcode: [/\bbarcode (?:of|for)\s+(.+)/, /^(.+?)\s+(?:ന്റെ\s+|nte\s+)?(?:ബാർകോഡ്|barcode\b)/],
    ledger: [/\b(?:ledger|statement|balance) (?:of|for)\s+(.+)/, /^(.+?)\s+(?:ലെഡ്ജർ|അക്കൗണ്ട് സ്റ്റേറ്റ്മെന്റ്|ledger\b|account statement\b)/],
    loyalty: [/\b(?:loyalty points|reward points) (?:of|for)\s+(.+)/, /reward points does\s+(.+?)\s+have/, /^(.+?)\s+(?:ലോയൽറ്റി|റിവാർഡ്|loyalty points|reward points)/],
  };
  for (const pattern of patterns[kind]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const name = match[1].replace(/^(?:what is (?:the )?|show (?:the )?|how many )/i, '')
      .replace(/\s+(?:please|today|എത്ര.*|കാണിക്കൂ.*|kanikku.*|ethra.*|venam.*)$/u, '').replace(/[?!.,]+$/g, '').trim();
    if (name && !/\b(specific|particular|someone)\b/.test(name)) return name;
  }
  return undefined;
}
