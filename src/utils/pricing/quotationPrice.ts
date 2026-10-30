import { calculateVat, restoreVatPrice } from './vat';

interface StoredQuotationPrice {
  quantity: number;
  rate?: number | null;
  amount?: number | null;
  taxable_amount?: number | null;
  tax_rate_percent?: number | null;
}

/** Taxable amount is authoritative, including older UAE quotes that stored a gross unit rate. */
export function quotationNetRate(item: StoredQuotationPrice): number {
  const amount = item.taxable_amount ?? item.amount;
  return amount != null && item.quantity > 0 ? Number(amount) / item.quantity : Number(item.rate) || 0;
}

/** The cart expects selling prices; persisted and printed quotation rates are net of VAT. */
export function restoreQuotationSellingPrice(item: StoredQuotationPrice, inclusive: boolean): number {
  const netRate = quotationNetRate(item);
  const rate = Number(item.tax_rate_percent) || 0;
  if (!inclusive || item.quantity <= 0) return restoreVatPrice(netRate, rate, inclusive);
  const netAmount = netRate * item.quantity;
  // Match the stored quotation's line-rounded VAT, including fractional quantities and small fils values.
  return (netAmount + calculateVat(netAmount, rate, false).tax) / item.quantity;
}
