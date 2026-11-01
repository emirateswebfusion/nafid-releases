/**
 * Pure, deterministic tax calculation engine for Electron main process.
 * Mirrors src/utils/pricing/taxEngine.ts to preserve tsconfig.electron isolation.
 */

export function round2(num: number): number {
  return Math.round((Number(num) || 0) * 100) / 100;
}

export const roundCurrency = round2;

export function round1(num: number): number {
  return Math.round((Number(num) || 0) * 10) / 10;
}

export function splitTaxAmount(tax: number): { cgst: number; sgst: number } {
  const roundedTax = round2(tax);
  const cgst = round2(roundedTax / 2);
  const sgst = round2(roundedTax - cgst);
  return { cgst, sgst };
}

export function calculateItemTax(
  taxableAmount: number,
  taxRatePercent: number,
  supplyType: 'INTRA' | 'INTER' = 'INTRA',
  isTaxInclusive = false,
): {
  taxable: number;
  tax: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  total: number;
} {
  const base = Math.max(0, round2(taxableAmount));
  const rate = Math.max(0, Number(taxRatePercent) || 0);

  let taxable: number;
  let tax: number;
  let total: number;

  if (rate === 0) {
    taxable = base;
    tax = 0;
    total = base;
  } else if (isTaxInclusive) {
    taxable = round2(base / (1 + rate / 100));
    tax = round2(base - taxable);
    total = base;
  } else {
    taxable = base;
    tax = round2((base * rate) / 100);
    total = round2(taxable + tax);
  }

  let cgstR = 0, sgstR = 0, igstR = 0;
  let cgstA = 0, sgstA = 0, igstA = 0;

  if (tax > 0) {
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

  return {
    taxable,
    tax,
    cgstRate: cgstR,
    cgstAmount: cgstA,
    sgstRate: sgstR,
    sgstAmount: sgstA,
    igstRate: igstR,
    igstAmount: igstA,
    total,
  };
}
