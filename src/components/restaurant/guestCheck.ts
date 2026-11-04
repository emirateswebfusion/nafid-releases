import type { CartItem } from '../../store/cartStore';
import { buildCheckoutLines } from '../../utils/pricing/checkoutLines';
import { formatAmount } from '../../utils/pricing/money';

/** Totals of an order as the bill will show them: the checkout line rule (tax per line) over the order's cart lines. */
export function guestCheckTotals(items: CartItem[]): { net: number; tax: number; total: number } {
  const lines = buildCheckoutLines(items, { invoiceType: 'GST', supplyType: 'INTRA', bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => '' });
  const net = lines.reduce((s, l) => s + Number(l.total || 0), 0);
  const tax = lines.reduce((s, l) => s + Number(l.tax_amount || 0), 0);
  const r = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return { net: r(net), tax: r(tax), total: r(net + tax) };
}

/** Pro-forma guest check (not a tax invoice: no invoice number; the tax invoice is issued at payment). */
export function guestCheckText(args: { shopName: string; title: string; items: CartItem[]; taxLabel: string; width?: number }): string {
  const width = args.width ?? 42;
  const rule = '-'.repeat(width);
  const row = (left: string, right: string) => {
    const l = left.length + right.length + 1 > width ? left.slice(0, Math.max(0, width - right.length - 2)) + '.' : left;
    return l + ' '.repeat(Math.max(1, width - l.length - right.length)) + right;
  };
  const center = (t: string) => ' '.repeat(Math.max(0, Math.floor((width - t.length) / 2))) + t.slice(0, width);
  const out = [center(args.shopName), center('GUEST CHECK'), center(args.title), rule];
  const lines = buildCheckoutLines(args.items, { invoiceType: 'GST', supplyType: 'INTRA', bosTaxRatePercent: 0, bosTaxInclusive: false, pcsSnapshot: {}, newId: () => '' });
  for (const line of lines) {
    const qty = line.quantity === 1 && line.isServiceItem ? '' : `${line.quantity} x `;
    out.push(row(`${qty}${line.name}`, formatAmount(Number(line.total) + Number(line.tax_amount))));
  }
  const totals = guestCheckTotals(args.items);
  out.push(rule, row('Net', formatAmount(totals.net)), row(args.taxLabel, formatAmount(totals.tax)), row('TOTAL', formatAmount(totals.total)), rule);
  out.push(center('This is not a tax invoice'));
  return out.join('\n');
}
