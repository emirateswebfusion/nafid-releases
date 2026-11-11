/** Country rules for new shops. Currency selection never converts stored amounts. */
export type StoreCountry = 'IN' | 'AE' | 'BH';

/**
 * One row per country. `taxRegime` picks the tax path (GST split or single-rate VAT), `currencyDecimals` the minor
 * unit (BHD has 1000 fils) and `defaultTaxRate` the rate a new product starts with. Rules that belong to one country
 * only (UAE emirates, FTA return, UAE e-invoicing) keep using `isUaeStore()`.
 */
export const STORE_PROFILES = {
  IN: { country: 'IN', name: 'India', currency: 'INR', currencyPrefix: '₹', currencyDecimals: 2, locale: 'en-IN', timezone: 'Asia/Kolkata', taxRegime: 'GST', taxName: 'GST', registrationName: 'GSTIN', defaultTaxRate: 0, phonePrefix: '+91', sampleBarcode: '8901234567890' },
  AE: { country: 'AE', name: 'United Arab Emirates', currency: 'AED', currencyPrefix: 'AED ', currencyDecimals: 2, locale: 'en-AE', timezone: 'Asia/Dubai', taxRegime: 'VAT', taxName: 'VAT', registrationName: 'TRN', defaultTaxRate: 5, phonePrefix: '+971', sampleBarcode: '6291234567894' },
  BH: { country: 'BH', name: 'Bahrain', currency: 'BHD', currencyPrefix: 'BHD ', currencyDecimals: 3, locale: 'en-BH', timezone: 'Asia/Bahrain', taxRegime: 'VAT', taxName: 'VAT', registrationName: 'VAT No.', defaultTaxRate: 10, phonePrefix: '+973', sampleBarcode: '6081234567891' },
} as const;

/**
 * Countries a shop can pick in Settings today. Bahrain joins this list only when three-decimal money, its documents
 * and its VAT return are complete; the main process (`storeCountryService.saveStoreCountry`) enforces the same list.
 */
export const SELECTABLE_STORE_COUNTRIES: readonly StoreCountry[] = ['IN', 'AE', 'BH'];

export function normalizeStoreCountry(value: unknown): StoreCountry {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* Plain settings are supported. */ }
  }
  return value === 'AE' || value === 'BH' ? value : 'IN';
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
/** UAE-only rules: emirates, FTA Form VAT 201 / audit file, UAE e-invoicing, UAE delivery channels. */
export function isUaeStore(): boolean { return getStoreCountry() === 'AE'; }
/** Any single-rate VAT country (UAE, Bahrain): VAT wording, VAT calculation and the VAT document layout. */
export function isVatStore(): boolean { return getStoreProfile().taxRegime === 'VAT'; }
export function getCurrencyPrefix(): string { return getStoreProfile().currencyPrefix; }
/** Fraction digits of the shop currency: 2, or 3 for BHD. */
export function getCurrencyDecimals(): number { return getStoreProfile().currencyDecimals; }
/** Tax rate a new product starts with (India 0, UAE 5, Bahrain 10). */
export function getDefaultTaxRate(): number { return getStoreProfile().defaultTaxRate; }
export function getStoreLocale(): string { return getStoreProfile().locale; }
/** Example EAN-13 for previews and import templates, with the country's GS1 prefix (890 India, 629 UAE, 608 Bahrain). */
export function getSampleBarcode(): string { return getStoreProfile().sampleBarcode; }
export function localizeTaxText(text: string): string {
  if (!isVatStore()) return text;
  return text.replace(/GSTIN/g, getStoreProfile().registrationName).replace(/\bGST\b/g, 'VAT').replace(/Bill of Supply/g, 'Invoice');
}
/**
 * Legacy UI strings route their currency marker (U+20B9) through the same profile as money.ts. Before a digit or at
 * the end of the string (a prefix to concatenate) the full prefix is used; elsewhere, as in `Rate (...)`, it is trimmed.
 */
export function localizeCurrencyText(text: string): string {
  const prefix = getCurrencyPrefix();
  return text.replace(/₹(?=(.?))/g, (_m, next: string) => (next === '' || /\d/.test(next) ? prefix : prefix.trim()));
}

export const UAE_EMIRATES = [
  { value: 'ABU_DHABI', label: 'Abu Dhabi' }, { value: 'DUBAI', label: 'Dubai' },
  { value: 'SHARJAH', label: 'Sharjah' }, { value: 'AJMAN', label: 'Ajman' },
  { value: 'UMM_AL_QUWAIN', label: 'Umm Al Quwain' },
  { value: 'RAS_AL_KHAIMAH', label: 'Ras Al Khaimah' }, { value: 'FUJAIRAH', label: 'Fujairah' },
];

/** India: 15-character GSTIN. UAE TRN and Bahrain VAT account number: 15 digits. Empty is allowed (unregistered). */
export function isValidTaxRegistration(value: string, country = getStoreCountry()): boolean {
  return !value.trim() || (country === 'IN' ? /^\d{2}[A-Z0-9]{13}$/.test(value.trim()) : /^\d{15}$/.test(value.trim()));
}
