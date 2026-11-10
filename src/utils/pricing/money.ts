/**
 * Money formatting — the single implementation for the renderer. Amounts use the active shop currency; formatting never converts values.
 * Do not define local formatCurrency/formatINR helpers in components; import from here.
 */
import { getStoreProfile } from '../localization/storeProfile';

export interface MoneyFormatOptions {
  /** Digit grouping in the store locale (en-IN 1,23,456.00; en-AE 123,456.00). Default true. */
  grouping?: boolean;
  /** Fraction digits. Default 2. */
  decimals?: number;
  /** Prefix with the store currency (₹ or `AED `). Default true. */
  symbol?: boolean;
}

/**
 * Parse a typed/stored amount into a number — the single implementation for the renderer.
 * Accepts digit-grouping commas and a leading currency symbol (`1,250`, `₹1,250.50`, `AED 12,34,567`, ` 1250 `).
 * Returns null for empty or non-numeric input. Do not use bare Number()/parseFloat() on typed amounts:
 * `Number('1,250')` is NaN and `parseFloat('1,250')` is 1.
 */
/**
 * What an amount box may contain while the user types: digits and one decimal point, nothing else.
 * Owner rule: amount fields take numbers only (no commas, letters, signs or currency symbols, no spinner
 * arrows). Pasted text is cleaned the same way: `1,250` becomes `1250`, `₹99.50` becomes `99.50`.
 */
export function sanitizeAmountInput(raw: string): string {
  const kept = raw.replace(/[^\d.]/g, '');
  const dot = kept.indexOf('.');
  return dot === -1 ? kept : kept.slice(0, dot + 1) + kept.slice(dot + 1).replace(/\./g, '');
}

export function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/^(-?)\s*(?:₹|AED|Rs\.?|INR)\s*/i, '$1').replace(/[,\s]/g, '');
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toNumber(amount: unknown): number {
  return parseAmount(amount ?? 0) ?? 0;
}

/** India: `1234.5` → `₹1,234.50`, `-50` → `-₹50.00`, null/NaN → `₹0.00`. UAE: `AED 1,234.50`, `-AED 50.00`. */
export function formatCurrency(amount: unknown, options: MoneyFormatOptions = {}): string {
  const { grouping = true, decimals = 2, symbol = true } = options;
  const n = toNumber(amount);
  const abs = Math.abs(n);
  const digits = grouping
    ? abs.toLocaleString(getStoreProfile().locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : abs.toFixed(decimals);
  const sign = n < 0 && Number(digits.replace(/,/g, '')) !== 0 ? '-' : '';
  return `${sign}${symbol ? getStoreProfile().currencyPrefix : ''}${digits}`;
}

/** Grouped amount without the currency symbol: `1,234.50`. */
export function formatAmount(amount: unknown, decimals = 2): string {
  return formatCurrency(amount, { symbol: false, decimals });
}
