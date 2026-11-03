/** Country rules for new shops. Currency selection never converts stored amounts. */
export type StoreCountry = 'IN' | 'AE';

export const STORE_PROFILES = {
  IN: { country: 'IN', name: 'India', currency: 'INR', currencyPrefix: '₹', locale: 'en-IN', timezone: 'Asia/Kolkata', taxName: 'GST', registrationName: 'GSTIN', phonePrefix: '+91', sampleBarcode: '8901234567890' },
  AE: { country: 'AE', name: 'United Arab Emirates', currency: 'AED', currencyPrefix: 'AED ', locale: 'en-AE', timezone: 'Asia/Dubai', taxName: 'VAT', registrationName: 'TRN', phonePrefix: '+971', sampleBarcode: '6291234567894' },
} as const;

export function normalizeStoreCountry(value: unknown): StoreCountry {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* Plain settings are supported. */ }
  }
  return value === 'AE' ? 'AE' : 'IN';
}

let vatInclusive = false;
export function setStoreVatInclusive(value: unknown): void { vatInclusive = value === true || value === 'true'; }
export function getStoreVatInclusive(): boolean { return vatInclusive; }

let activeCountry: StoreCountry = 'IN';
export function setStoreCountry(value: unknown): void {
  activeCountry = normalizeStoreCountry(value);
}
export function getStoreCountry(): StoreCountry { return activeCountry; }
export function getStoreProfile(country: StoreCountry = getStoreCountry()) { return STORE_PROFILES[country]; }
export function isUaeStore(): boolean { return getStoreCountry() === 'AE'; }
export function getCurrencyPrefix(): string { return getStoreProfile().currencyPrefix; }
export function getStoreLocale(): string { return getStoreProfile().locale; }
/** Example EAN-13 for previews and import templates, with the country's GS1 prefix (890 India, 629 UAE). */
export function getSampleBarcode(): string { return getStoreProfile().sampleBarcode; }
export function localizeTaxText(text: string): string {
  if (!isUaeStore()) return text;
  return text.replace(/GSTIN/g, 'TRN').replace(/\bGST\b/g, 'VAT').replace(/Bill of Supply/g, 'Invoice');
}
/**
 * Legacy UI strings route their currency marker (U+20B9) through the same profile as money.ts. Before a digit or at
 * the end of the string (a prefix to concatenate) the full prefix is used; elsewhere, as in `Rate (...)`, it is trimmed.
 */
export function localizeCurrencyText(text: string): string {
  const prefix = getCurrencyPrefix();
  return text.replace(/\u20B9(?=(.?))/g, (_m, next: string) => (next === '' || /\d/.test(next) ? prefix : prefix.trim()));
}

export const UAE_EMIRATES = [
  { value: 'ABU_DHABI', label: 'Abu Dhabi' }, { value: 'DUBAI', label: 'Dubai' },
  { value: 'SHARJAH', label: 'Sharjah' }, { value: 'AJMAN', label: 'Ajman' },
  { value: 'UMM_AL_QUWAIN', label: 'Umm Al Quwain' },
  { value: 'RAS_AL_KHAIMAH', label: 'Ras Al Khaimah' }, { value: 'FUJAIRAH', label: 'Fujairah' },
];

export function isValidTaxRegistration(value: string, country = getStoreCountry()): boolean {
  return !value.trim() || (country === 'AE' ? /^\d{15}$/.test(value.trim()) : /^\d{2}[A-Z0-9]{13}$/.test(value.trim()));
}
