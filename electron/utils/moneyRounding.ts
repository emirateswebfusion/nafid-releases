export type StoreCountry = 'IN' | 'AE' | 'BH';

/** Unknown, missing and malformed values are India, as before Bahrain existed. */
export function parseStoreCountry(value: unknown): StoreCountry {
  let country: unknown = value;
  try { if (typeof country === 'string') country = JSON.parse(country); } catch { /* Plain settings are supported. */ }
  return country === 'AE' || country === 'BH' ? country : 'IN';
}

/** Fraction digits of the shop currency: 2, or 3 for BHD (1000 fils). */
export function storeMoneyDecimals(country?: StoreCountry | string | number | null): number {
  if (typeof country === 'number') return country;
  return country === 'BH' ? 3 : 2;
}

/**
 * `Math.round(amount * scale) / scale` at the currency precision (2 for IN/AE, 3 for BH).
 * Deliberately no `|| 0`: a missing amount stays NaN exactly as with the old `* 100) / 100`, so callers that
 * store "not counted" as NULL (cash drawer close) keep doing so. Coerce at the call site when 0 is wanted.
 */
export function roundStoreMoney(amount: number, countryOrDecimals?: StoreCountry | string | number | null): number {
  const decimals = storeMoneyDecimals(countryOrDecimals);
  const scale = 10 ** decimals;
  return Math.round(amount * scale) / scale;
}

/** Fixed-point text at the currency precision: `12.50` (IN/AE) or `12.500` (BH). */
export function storeMoneyFixed(amount: number, countryOrDecimals?: StoreCountry | string | number | null): string {
  const decimals = storeMoneyDecimals(countryOrDecimals);
  return (Number(amount) || 0).toFixed(decimals);
}

/** The smallest amount the currency can represent: 0.01 (IN/AE) or 0.001 (BH). Use it for money tolerances. */
export function storeMoneyMinorUnit(countryOrDecimals?: StoreCountry | string | number | null): number {
  return 1 / 10 ** storeMoneyDecimals(countryOrDecimals);
}
