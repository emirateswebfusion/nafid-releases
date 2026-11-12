import { moneyScale } from './moneyRounding';
/** UAE VAT: keep the configured zero rate; never replace it with the standard rate. */
export function calculateVat(amount: number, ratePercent: number, inclusive: boolean) {
  const rate = Math.max(0, Number(ratePercent) || 0) / 100;
  const round = (value: number) => Math.round((value + Number.EPSILON) * moneyScale()) / moneyScale();
  const tax = round(inclusive ? amount * rate / (1 + rate) : amount * rate);
  return { taxable: round(inclusive ? amount - tax : amount), tax };
}

/** Reopen a saved net rate in a cart that expects VAT-inclusive selling prices. */
export function restoreVatPrice(netPrice: number, ratePercent: number, inclusive: boolean): number {
  return inclusive ? netPrice * (1 + Math.max(0, Number(ratePercent) || 0) / 100) : netPrice;
}
