/**
 * Money formatting — the single implementation for the renderer. Amounts use the active shop currency; formatting never converts values.
 * Do not define local formatCurrency/formatINR helpers in components; import from here.
 */
import { getStoreProfile } from '../localization/storeProfile';

export interface MoneyFormatOptions {
  /** en-IN digit grouping (1,23,456.00). Default true. */
  grouping?: boolean;
  /** Fraction digits. Default 2. */
  decimals?: number;
  /** Prefix with the rupee sign. Default true. */
  symbol?: boolean;
}

function toNumber(amount: unknown): number {
  const n = typeof amount === 'number' ? amount : Number(amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** `1234.5` → `₹1,234.50`; `-50` → `-₹50.00`; null/NaN → `₹0.00`. */
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
