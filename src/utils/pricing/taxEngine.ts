import { moneyScale } from './moneyRounding';
import { moneyMinorUnit } from './moneyRounding';
/**
 * Pure, deterministic tax calculation engine for Indian GST and UAE VAT.
 * Ensures exact reconciliation between line items and invoice header totals
 * under all discount, rounding, mixed rate, inclusive and exclusive pricing conditions.
 */

export interface LinePricingInput {
  id?: string;
  productId?: string;
  name?: string;
  quantity: number;
  unitPrice: number; // Unit price after line discount, before invoice discount
  taxRatePercent: number;
  isServiceItem?: boolean;
  isExempt?: boolean;
  hsnSacCode?: string | null;
  supplyType?: 'INTRA' | 'INTER';
  uom?: string | null;
}

export interface CalculatedTaxLine {
  id?: string;
  productId?: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  lineRawTotal: number;
  allocatedDiscount: number;
  taxableAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  lineTotal: number;
  isServiceItem?: boolean;
  isExempt?: boolean;
  hsnSacCode?: string | null;
  supplyType: 'INTRA' | 'INTER';
  uom?: string | null;
}

export interface InvoiceTaxSummary {
  lines: CalculatedTaxLine[];
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
}

export function round2(num: number): number {
  return Math.round((Number(num) || 0) * moneyScale()) / moneyScale();
}

export const roundCurrency = round2;

export function round1(num: number): number {
  return Math.round((Number(num) || 0) * 10) / 10;
}

/**
 * Splits intra-state tax amount into CGST and SGST preserving exact sum to the paisa.
 */
export function splitTaxAmount(tax: number): { cgst: number; sgst: number } {
  const roundedTax = round2(tax);
  const cgst = round2(roundedTax / 2);
  const sgst = round2(roundedTax - cgst);
  return { cgst, sgst };
}

/**
 * Pro-rata allocates an invoice-level discount across eligible lines.
 * Any residual rounding paisa is applied to the largest line, ensuring
 * that the sum of allocated discounts strictly equals the invoice discount.
 */
export function allocateInvoiceDiscount(
  rawLineTotals: number[],
  discountValue: number,
  discountType: 'FIXED' | 'PERCENTAGE' = 'FIXED',
): number[] {
  if (rawLineTotals.length === 0) return [];
  const totalBase = rawLineTotals.reduce((acc, val) => acc + Math.max(0, val), 0);
  if (totalBase <= 0 || discountValue <= 0) {
    return rawLineTotals.map(() => 0);
  }

  const effectiveDiscount = discountType === 'PERCENTAGE'
    ? round2((totalBase * Math.max(0, discountValue)) / 100)
    : round2(Math.min(totalBase, Math.max(0, discountValue)));

  if (effectiveDiscount <= 0) {
    return rawLineTotals.map(() => 0);
  }

  const allocations: number[] = [];
  let allocatedSum = 0;
  let maxIdx = 0;
  let maxVal = -1;

  for (let i = 0; i < rawLineTotals.length; i++) {
    const val = Math.max(0, rawLineTotals[i]);
    if (val > maxVal) {
      maxVal = val;
      maxIdx = i;
    }
    const portion = round2((val / totalBase) * effectiveDiscount);
    allocations.push(portion);
    allocatedSum += portion;
  }

  // Adjust rounding residual onto the largest line
  const residual = round2(effectiveDiscount - allocatedSum);
  if (Math.abs(residual) >= moneyMinorUnit() && maxIdx >= 0 && maxIdx < allocations.length) {
    allocations[maxIdx] = round2(allocations[maxIdx] + residual);
  }

  // Ensure no allocated discount exceeds the line amount
  for (let i = 0; i < allocations.length; i++) {
    const lineAmt = Math.max(0, rawLineTotals[i]);
    if (allocations[i] > lineAmt) {
      allocations[i] = lineAmt;
    }
  }

  return allocations;
}

export interface TaxCalculationContext {
  isInterState: boolean;
  isTaxInclusive?: boolean;
  isUaeStore?: boolean;
  discountValue?: number;
  discountType?: 'FIXED' | 'PERCENTAGE';
}

/**
 * Authoritative single tax engine calculation for an entire invoice.
 * Guarantees that:
 * 1. sum(line.taxableAmount) === invoice.taxableAmount
 * 2. sum(line.taxAmount) === invoice.taxTotal
 * 3. sum(line.cgstAmount) === invoice.cgstTotal
 * 4. sum(line.sgstAmount) === invoice.sgstTotal
 * 5. sum(line.igstAmount) === invoice.igstTotal
 * 6. invoice.cgstTotal + invoice.sgstTotal + invoice.igstTotal === invoice.taxTotal
 */
export function calculateInvoiceTax(
  items: LinePricingInput[],
  context: TaxCalculationContext,
): InvoiceTaxSummary {
  const {
    isInterState,
    isTaxInclusive = false,
    isUaeStore = false,
    discountValue = 0,
    discountType = 'FIXED',
  } = context;

  // 1. Calculate raw line amounts before invoice discount
  const rawLineTotals = items.map(item => {
    const qty = item.isServiceItem ? 1 : Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    return round2(unitPrice * qty);
  });

  const subtotal = round2(rawLineTotals.reduce((a, b) => a + b, 0));

  // 2. Allocate invoice discount
  const allocatedDiscounts = allocateInvoiceDiscount(rawLineTotals, discountValue, discountType);
  const discountTotal = round2(allocatedDiscounts.reduce((a, b) => a + b, 0));

  // 3. Process each line item
  const lines: CalculatedTaxLine[] = [];
  let totalTaxable = 0;
  let totalTax = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalGrand = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = item.isServiceItem ? 1 : Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const lineRaw = rawLineTotals[i];
    const lineDisc = allocatedDiscounts[i] || 0;
    const netBase = Math.max(0, round2(lineRaw - lineDisc));

    const rate = Math.max(0, Number(item.taxRatePercent) || 0);
    const supplyType: 'INTRA' | 'INTER' = isInterState ? 'INTER' : 'INTRA';

    let taxable: number;
    let tax: number;
    let lineTot: number;

    if (item.isServiceItem && !isUaeStore) {
      // In POS convention, unrated service items are billed without tax
      taxable = netBase;
      tax = 0;
      lineTot = netBase;
    } else if (item.isExempt || rate === 0) {
      taxable = netBase;
      tax = 0;
      lineTot = netBase;
    } else if (isTaxInclusive) {
      // Inclusive pricing: netBase includes tax
      taxable = round2(netBase / (1 + rate / 100));
      tax = round2(netBase - taxable);
      lineTot = netBase;
    } else {
      // Exclusive pricing: tax is added on top of netBase
      taxable = netBase;
      tax = round2((taxable * rate) / 100);
      lineTot = round2(taxable + tax);
    }

    let cgstR = 0, sgstR = 0, igstR = 0;
    let cgstA = 0, sgstA = 0, igstA = 0;

    if (tax > 0 && !isUaeStore) {
      if (supplyType === 'INTER') {
        igstR = rate;
        igstA = tax;
      } else {
        cgstR = round1(rate / 2);
        sgstR = round1(rate / 2);
        const split = splitTaxAmount(tax);
        cgstA = split.cgst;
        sgstA = split.sgst;
      }
    }

    lines.push({
      id: item.id,
      productId: item.productId,
      name: item.name,
      quantity: qty,
      unitPrice,
      lineRawTotal: lineRaw,
      allocatedDiscount: lineDisc,
      taxableAmount: taxable,
      taxRatePercent: rate,
      taxAmount: tax,
      cgstRate: cgstR,
      cgstAmount: cgstA,
      sgstRate: sgstR,
      sgstAmount: sgstA,
      igstRate: igstR,
      igstAmount: igstA,
      lineTotal: lineTot,
      isServiceItem: item.isServiceItem,
      isExempt: item.isExempt,
      hsnSacCode: item.hsnSacCode || null,
      supplyType,
      uom: item.uom || null,
    });

    totalTaxable += taxable;
    totalTax += tax;
    totalCgst += cgstA;
    totalSgst += sgstA;
    totalIgst += igstA;
    totalGrand += lineTot;
  }

  totalTaxable = round2(totalTaxable);
  totalTax = round2(totalTax);
  totalCgst = round2(totalCgst);
  totalSgst = round2(totalSgst);
  totalIgst = round2(totalIgst);
  totalGrand = round2(totalGrand);

  return {
    lines,
    subtotal,
    discountTotal,
    taxableAmount: totalTaxable,
    taxTotal: totalTax,
    cgstTotal: totalCgst,
    sgstTotal: totalSgst,
    igstTotal: totalIgst,
    grandTotal: totalGrand,
  };
}
