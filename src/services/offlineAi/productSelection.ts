import type { AiRow, OfflineAiResponse } from './types';

/** Never silently pick the first partial product match. Choices remain ordinary questions. */
export function clarifyProduct(matches: AiRow[], metric: 'stock' | 'price' | 'barcode', isMal: boolean): OfflineAiResponse | undefined {
  if (matches.length <= 1) return undefined;
  const choices = matches.slice(0, 8).map(p => `Show ${metric} of ${p.sku_barcode || p.name}`);
  return {
    clarificationRequired: true,
    parsedIntent: { intent: 'CLARIFICATION_REQUIRED', domain: 'HELP', clarificationRequired: true,
      params: { topic: 'product_selection' }, choices },
    content: `${isMal ? 'ഏത് ഉൽപ്പന്നമാണ് വേണ്ടത്? താഴെ നിന്നു തിരഞ്ഞെടുക്കുക; അല്ലെങ്കിൽ കൃത്യമായ barcode പറയൂ.' : 'Which product do you mean? Choose below or give the exact barcode.'}\n\n` + matches.slice(0, 8).map((p, i) => `${i + 1}. ${p.name} · ${p.sku_barcode || '—'}`).join('\n'),
    suggestedPrompts: choices,
  };
}
