import { describe, expect, it } from 'vitest';
import {
  allocateInvoiceDiscount,
  calculateInvoiceTax,
  splitTaxAmount,
} from '../../src/utils/pricing/taxEngine';

describe('taxEngine - allocateInvoiceDiscount', () => {
  it('allocates nothing when discount is zero', () => {
    const allocations = allocateInvoiceDiscount([100, 200, 300], 0);
    expect(allocations).toEqual([0, 0, 0]);
  });

  it('allocates proportional fixed discount and adjusts residual on largest line', () => {
    // 3 items of 33.33, 33.33, 33.34 = 100.00 subtotal. Discount = 10.00
    // 33.33 / 100 * 10 = 3.33
    // 33.33 / 100 * 10 = 3.33
    // 33.34 / 100 * 10 = 3.33 + 0.01 residual = 3.34
    const allocations = allocateInvoiceDiscount([33.33, 33.33, 33.34], 10, 'FIXED');
    expect(allocations).toEqual([3.33, 3.33, 3.34]);
    expect(allocations.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('handles percentage discount correctly', () => {
    // Subtotal 200, 10% discount = 20
    const allocations = allocateInvoiceDiscount([100, 100], 10, 'PERCENTAGE');
    expect(allocations).toEqual([10, 10]);
    expect(allocations.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('clamps discount to subtotal if discount exceeds subtotal', () => {
    const allocations = allocateInvoiceDiscount([50, 50], 150, 'FIXED');
    expect(allocations).toEqual([50, 50]);
  });
});

describe('taxEngine - calculateInvoiceTax', () => {
  it('calculates intra-state GST with 50/50 CGST/SGST split', () => {
    const result = calculateInvoiceTax(
      [
        { name: 'Item A', quantity: 2, unitPrice: 100, taxRatePercent: 18 },
        { name: 'Item B', quantity: 1, unitPrice: 50, taxRatePercent: 5 },
      ],
      { isInterState: false },
    );

    // Item A: 200, 18% tax = 36.00 (CGST 18, SGST 18)
    // Item B: 50, 5% tax = 2.50 (CGST 1.25, SGST 1.25)
    expect(result.subtotal).toBe(250);
    expect(result.discountTotal).toBe(0);
    expect(result.taxableAmount).toBe(250);
    expect(result.taxTotal).toBe(38.5);
    expect(result.cgstTotal).toBe(19.25);
    expect(result.sgstTotal).toBe(19.25);
    expect(result.igstTotal).toBe(0);
    expect(result.grandTotal).toBe(288.5);

    // Verify exact line-level reconciliation
    expect(result.lines[0].cgstAmount).toBe(18);
    expect(result.lines[0].sgstAmount).toBe(18);
    expect(result.lines[0].lineTotal).toBe(236);

    expect(result.lines[1].cgstAmount).toBe(1.25);
    expect(result.lines[1].sgstAmount).toBe(1.25);
    expect(result.lines[1].lineTotal).toBe(52.5);
  });

  it('calculates inter-state GST with 100% IGST', () => {
    const result = calculateInvoiceTax(
      [{ name: 'Item Inter', quantity: 1, unitPrice: 1000, taxRatePercent: 12 }],
      { isInterState: true },
    );

    expect(result.subtotal).toBe(1000);
    expect(result.taxTotal).toBe(120);
    expect(result.igstTotal).toBe(120);
    expect(result.cgstTotal).toBe(0);
    expect(result.sgstTotal).toBe(0);
    expect(result.grandTotal).toBe(1120);
    expect(result.lines[0].igstAmount).toBe(120);
  });

  it('prorates invoice-level discount and reconciles line taxes exactly', () => {
    // 2 items:
    // Item 1: 100 @ 18% GST
    // Item 2: 100 @ 5% GST
    // Subtotal = 200
    // Invoice discount = 20 (allocated: 10 to Item 1, 10 to Item 2)
    // Item 1 taxable = 90, tax 18% = 16.20 (CGST 8.10, SGST 8.10)
    // Item 2 taxable = 90, tax 5% = 4.50 (CGST 2.25, SGST 2.25)
    // Total taxable = 180, Total tax = 20.70
    // Grand total = 180 + 20.70 = 200.70
    const result = calculateInvoiceTax(
      [
        { name: 'Item 1', quantity: 1, unitPrice: 100, taxRatePercent: 18 },
        { name: 'Item 2', quantity: 1, unitPrice: 100, taxRatePercent: 5 },
      ],
      { isInterState: false, discountValue: 20, discountType: 'FIXED' },
    );

    expect(result.subtotal).toBe(200);
    expect(result.discountTotal).toBe(20);
    expect(result.taxableAmount).toBe(180);
    expect(result.taxTotal).toBe(20.7);
    expect(result.cgstTotal).toBe(10.35);
    expect(result.sgstTotal).toBe(10.35);
    expect(result.grandTotal).toBe(200.7);

    // Sum of lines must match header totals EXACTLY
    const lineTaxableSum = result.lines.reduce((s, l) => s + l.taxableAmount, 0);
    const lineTaxSum = result.lines.reduce((s, l) => s + l.taxAmount, 0);
    const lineCgstSum = result.lines.reduce((s, l) => s + l.cgstAmount, 0);
    const lineSgstSum = result.lines.reduce((s, l) => s + l.sgstAmount, 0);
    const lineTotalSum = result.lines.reduce((s, l) => s + l.lineTotal, 0);

    expect(lineTaxableSum).toBe(result.taxableAmount);
    expect(lineTaxSum).toBe(result.taxTotal);
    expect(lineCgstSum).toBe(result.cgstTotal);
    expect(lineSgstSum).toBe(result.sgstTotal);
    expect(lineTotalSum).toBe(result.grandTotal);
  });

  it('calculates tax-inclusive pricing accurately in India', () => {
    // 1 item @ 118 inclusive (18% GST)
    // Taxable = 118 / 1.18 = 100
    // Tax = 18 (CGST 9, SGST 9)
    // Total = 118
    const result = calculateInvoiceTax(
      [{ name: 'Inclusive Item', quantity: 1, unitPrice: 118, taxRatePercent: 18 }],
      { isInterState: false, isTaxInclusive: true },
    );

    expect(result.taxableAmount).toBe(100);
    expect(result.taxTotal).toBe(18);
    expect(result.cgstTotal).toBe(9);
    expect(result.sgstTotal).toBe(9);
    expect(result.grandTotal).toBe(118);
  });

  it('splits tax amount into CGST and SGST with exact paisa preservation', () => {
    const split = splitTaxAmount(4.75);
    expect(split.cgst).toBe(2.38);
    expect(split.sgst).toBe(2.37);
    expect(split.cgst + split.sgst).toBe(4.75);
  });

  it('calculates inter-state IGST with specific sample data', () => {
    // Total taxable value ₹33,632.08, IGST @ 5% = ₹1,681.60
    const result = calculateInvoiceTax(
      [{ name: 'Sample Item', quantity: 1, unitPrice: 33632.08, taxRatePercent: 5 }],
      { isInterState: true },
    );
    expect(result.taxableAmount).toBe(33632.08);
    expect(result.igstTotal).toBe(1681.60);
    expect(result.cgstTotal).toBe(0);
    expect(result.sgstTotal).toBe(0);
    expect(result.grandTotal).toBe(35313.68); // 33632.08 + 1681.60
  });
});
