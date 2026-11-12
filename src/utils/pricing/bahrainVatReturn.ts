/**
 * Bahrain NBR VAT return: maps the period figures Nafid records onto the lines of the NBR return form.
 * Line numbers and labels follow the form in use since the rate changed to 10% (5% lines 1(a), 8(a), 11(a) remain
 * for supplies under the old rate). Nafid records domestic sales and purchases only; lines for GCC sales, exports,
 * imports and reverse charge are shown at zero and must be completed on the NBR portal when they apply.
 * Totals: 7 = sales lines, 14 = purchase lines, 15 = output VAT - recoverable input VAT, 18 = 15 + 16 - 17.
 */
import type { Vat201Report } from '../../../electron/services/vatReportService';
import { roundMoney } from './moneyRounding';

export interface BahrainVatLine {
  box: string;
  label: string;
  amount: number;
  vat: number;
  /** false: Nafid does not record this kind of transaction; complete it on the NBR portal if it applies. */
  recorded: boolean;
  total?: boolean;
}

export interface BahrainVatReturn {
  sales: BahrainVatLine[];
  purchases: BahrainVatLine[];
  totals: BahrainVatLine[];
  netVat: number;
  status: 'PAYABLE' | 'RECLAIMABLE' | 'NIL';
}

const line = (box: string, label: string, amount = 0, vat = 0, recorded = true): BahrainVatLine => ({ box, label, amount: roundMoney(amount), vat: roundMoney(vat), recorded });
const sum = (lines: BahrainVatLine[], key: 'amount' | 'vat') => roundMoney(lines.reduce((total, row) => total + row[key], 0));

export function buildBahrainVatReturn(report: Pick<Vat201Report, 'section1Output' | 'section2Input'>): BahrainVatReturn {
  const output = report.section1Output;
  const input = report.section2Input;
  // Credit notes of the period are already netted: the form reports sales after adjustments.
  const standardSales = output.totalOutputTax.totalAmount - output.totalOutputTax.totalAdjustment;
  const standardVat = output.totalOutputTax.netOutputVatDue;
  const zeroRated = output.zeroRatedSupplies.amount - output.zeroRatedSupplies.adjustment;
  const exempt = output.exemptSupplies.amount - output.exemptSupplies.adjustment;
  const purchases = input.totalInputTax.totalAmount - input.totalInputTax.totalAdjustment;
  const inputVat = input.totalInputTax.netInputVatRecoverable;

  const sales = [
    line('1(a)', 'Standard rated sales at 5%', 0, 0, false),
    line('1(b)', 'Standard rated sales at 10%', standardSales, standardVat),
    line('2', 'Sales to registered VAT payers in other GCC states', 0, 0, false),
    line('3', 'Sales subject to domestic reverse charge mechanism', 0, 0, false),
    line('4', 'Zero-rated domestic sales', zeroRated, 0),
    line('5', 'Exports', 0, 0, false),
    line('6', 'Exempt sales', exempt, 0),
  ];
  const purchaseLines = [
    line('8(a)', 'Standard rated domestic purchases at 5%', 0, 0, false),
    line('8(b)', 'Standard rated domestic purchases at 10%', purchases, inputVat),
    line('9', 'Imports subject to VAT paid at customs', 0, 0, false),
    line('10', 'Imports subject to deferral at customs', 0, 0, false),
    line('11(a)', 'Imports subject to VAT accounted for through reverse charge mechanism at 5%', 0, 0, false),
    line('11(b)', 'Imports subject to VAT accounted for through reverse charge mechanism at 10%', 0, 0, false),
    line('12', 'Purchases subject to domestic reverse charge mechanism', 0, 0, false),
    line('13', 'Purchases from non-registered suppliers, zero-rated / exempt purchases', 0, 0, false),
  ];
  const totalSales = { ...line('7', 'Total sales', sum(sales, 'amount'), sum(sales, 'vat')), total: true };
  const totalPurchases = { ...line('14', 'Total purchases', sum(purchaseLines, 'amount'), sum(purchaseLines, 'vat')), total: true };
  const vatDue = roundMoney(totalSales.vat - totalPurchases.vat);
  const corrections = 0;
  const creditBroughtForward = 0;
  const netVat = roundMoney(vatDue + corrections - creditBroughtForward);

  return {
    sales: [...sales, totalSales],
    purchases: [...purchaseLines, totalPurchases],
    totals: [
      { ...line('15', 'Total VAT due for the current period', 0, vatDue), total: true },
      line('16', 'Corrections from previous period (between BHD ±5,000)', 0, corrections, false),
      line('17', 'VAT credit carried forward from previous period(s)', 0, creditBroughtForward, false),
      { ...line('18', 'Net VAT due (or reclaimed)', 0, netVat), total: true },
    ],
    netVat,
    status: netVat > 0 ? 'PAYABLE' : netVat < 0 ? 'RECLAIMABLE' : 'NIL',
  };
}
