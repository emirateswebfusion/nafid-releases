/**
 * Rounding to the shop currency's minor unit: paise / fils at two decimals (INR, AED), fils at three (BHD).
 * The single place that knows the precision; never write `* 100) / 100` or `.toFixed(2)` for money.
 * For a two-decimal currency every function here performs exactly the arithmetic the old literals did.
 */
import { getCurrencyDecimals } from '../localization/storeProfile';

/** 100 for two-decimal currencies, 1000 for BHD. */
export function moneyScale(): number {
  return 10 ** getCurrencyDecimals();
}

/** `Math.round(n * 100) / 100` at the currency's precision. */
export function roundMoney(amount: number): number {
  const scale = moneyScale();
  return Math.round(amount * scale) / scale;
}

/** Fixed-point text at the currency's precision, without grouping or symbol: `12.50`, or `12.500` in BHD. */
export function moneyFixed(amount: number): string {
  return amount.toFixed(getCurrencyDecimals());
}

/** The smallest amount the currency can represent: 0.01, or 0.001 in BHD. */
export function moneyMinorUnit(): number {
  return 1 / moneyScale();
}
