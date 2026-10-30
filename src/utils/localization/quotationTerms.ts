import { getStoreVatInclusive, isUaeStore } from './storeProfile';

/** Default text only; a saved quotation keeps the terms entered by the shop. */
export function defaultQuotationTerms(): string {
  const tax = isUaeStore()
    ? (getStoreVatInclusive() ? 'Prices include VAT where applicable.' : 'VAT extra as applicable.')
    : 'GST extra as applicable.';
  return `1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. ${tax}`;
}

/** Upgrade only the exact legacy built-in text, never shop-authored terms. */
export function resolveQuotationTerms(terms: string | null | undefined): string {
  const legacy = '1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.';
  return !terms || (isUaeStore() && terms.replace(/\r\n/g, '\n') === legacy) ? defaultQuotationTerms() : terms;
}
