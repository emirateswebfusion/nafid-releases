import { describe, expect, it } from 'vitest';
import {
  buildInvoiceProductRows,
  buildTaxFilteredProductRows,
  sortInvoicesByInvoiceNumber,
} from '../../src/utils/pricing/salesHistoryTax';

const round2 = (value: number) => Math.round(value * 100) / 100;
const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0));

describe('buildInvoiceProductRows', () => {
  it('reconciles line taxable values to the discounted invoice subtotal', () => {
    const rows = buildInvoiceProductRows(
      {
        invoice_id: 'inv-1',
        invoice_number: 'INV-001',
        subtotal: 200,
        tax_total: 36,
        discount_total: 20,
        points_redeemed_discount: 0,
        grand_total: 216,
        supply_type: 'INTRA',
      },
      [
        { name: 'A', quantity: 2, unit_price: 50, total: 100, tax_amount: 18, tax_rate: 18, cgst_rate: 9, sgst_rate: 9 },
        { name: 'B', quantity: 1, unit_price: 100, total: 100, tax_amount: 18, tax_rate: 18, cgst_rate: 9, sgst_rate: 9 },
      ],
    );

    expect(rows).toHaveLength(2);
    expect(sum(rows.map((row) => row.taxable))).toBe(180);
    expect(sum(rows.map((row) => row.tax))).toBe(36);
    expect(sum(rows.map((row) => row.discount))).toBe(20);
    expect(sum(rows.map((row) => row.total))).toBe(216);
    expect(sum(rows.map((row) => row.cgstAmount + row.sgstAmount))).toBe(36);
  });

  it('adjusts last row rounding differences to match exact invoice taxable and tax base', () => {
    // 3 items with subtotal 100 discounted by 10 -> taxableBase 90
    // Each item 33.33 taxable * (90/100) = 29.997 -> 30.00
    // 33.33 * 3 = 99.99 != 100
    const rows = buildInvoiceProductRows(
      {
        invoice_id: 'inv-diff',
        invoice_number: 'INV-009',
        subtotal: 100,
        tax_total: 18,
        discount_total: 10,
        points_redeemed_discount: 0,
        grand_total: 108,
        supply_type: 'INTRA',
      },
      [
        { name: 'A', quantity: 1, unit_price: 33.33, total: 33.33, tax_amount: 6, tax_rate: 18 },
        { name: 'B', quantity: 1, unit_price: 33.33, total: 33.33, tax_amount: 6, tax_rate: 18 },
        { name: 'C', quantity: 1, unit_price: 33.34, total: 33.34, tax_amount: 6, tax_rate: 18 },
      ],
    );

    expect(rows).toHaveLength(3);
    expect(sum(rows.map((r) => r.taxable))).toBe(90);
    expect(sum(rows.map((r) => r.tax))).toBe(18);
  });

  it('uses IGST for inter-state supply', () => {
    const [row] = buildInvoiceProductRows(
      {
        invoice_id: 'inv-2',
        invoice_number: 'INV-002',
        subtotal: 100,
        tax_total: 18,
        discount_total: 0,
        points_redeemed_discount: 0,
        grand_total: 118,
        supply_type: 'INTER',
      },
      [{ name: 'A', quantity: 1, unit_price: 100, total: 100, tax_amount: 18, tax_rate: 18, igst_rate: 18 }],
    );

    expect(row.igstAmount).toBe(18);
    expect(row.cgstAmount).toBe(0);
    expect(row.sgstAmount).toBe(0);
  });

  it('detects inter-state supply from item igst_rate even if invoice supply_type is omitted', () => {
    const [row] = buildInvoiceProductRows(
      {
        invoice_id: 'inv-igst',
        subtotal: 100,
        tax_total: 18,
        grand_total: 118,
      },
      [{ name: 'A', quantity: 1, unit_price: 100, total: 100, tax_amount: 18, igst_rate: 18 }],
    );

    expect(row.igstAmount).toBe(18);
    expect(row.cgstAmount).toBe(0);
  });

  it('normalizes tax-inclusive line totals to an ex-tax unit price', () => {
    const [row] = buildInvoiceProductRows(
      {
        invoice_id: 'inv-3',
        invoice_number: 'INV-003',
        subtotal: 100,
        tax_total: 18,
        discount_total: 0,
        points_redeemed_discount: 0,
        grand_total: 118,
      },
      [{ name: 'Inclusive', quantity: 2, unit_price: 59, total: 118, tax_amount: 18, tax_rate: 18, cgst_rate: 9, sgst_rate: 9 }],
    );

    expect(row.taxable).toBe(100);
    expect(row.tax).toBe(18);
    expect(row.unitPrice).toBe(50);
    expect(row.total).toBe(118);
  });

  it('creates a synthetic row when an invoice has no line items', () => {
    const [row] = buildInvoiceProductRows(
      {
        invoice_id: 'inv-4',
        invoice_number: 'INV-004',
        subtotal: 100,
        tax_total: 18,
        discount_total: 0,
        points_redeemed_discount: 0,
        grand_total: 118,
      },
      [],
    );

    expect(row.name).toBe('General Bill Item');
    expect(row.taxable).toBe(100);
    expect(row.tax).toBe(18);
    expect(row.cgstAmount + row.sgstAmount).toBe(18);
  });

  it('reconciles a historical fallback split without changing the invoice tax value', () => {
    const invoice = {
      invoice_id: 'inv-odd-cent',
      subtotal: 10.5,
      tax_total: 1.05,
      grand_total: 11.55,
      supply_type: 'INTRA',
    };
    const [row] = buildInvoiceProductRows(invoice, []);

    expect(row.cgstAmount).toBe(0.53);
    expect(row.sgstAmount).toBe(0.52);
    expect(row.cgstAmount + row.sgstAmount).toBe(row.tax);
    expect(invoice.tax_total).toBe(1.05);
  });

  it('derives rate from tax and taxable when explicit rate properties are missing', () => {
    const [row] = buildInvoiceProductRows(
      {
        invoice_id: 'inv-fallback',
        subtotal: 100,
        tax_total: 12,
        grand_total: 112,
      },
      [{ name: 'Item', quantity: 1, unit_price: 100, total: 100, tax_amount: 12 }],
    );

    expect(row.gstRate).toBe(12);
  });
});

describe('buildTaxFilteredProductRows', () => {
  it('filters by rounded GST rate and totals only matching rows', () => {
    const invoices = [
      {
        invoice_id: 'a',
        invoice_number: 'INV-001',
        subtotal: 100,
        tax_total: 18,
        grand_total: 118,
        discount_total: 0,
        points_redeemed_discount: 0,
      },
      {
        invoice_id: 'b',
        invoice_number: 'INV-002',
        subtotal: 100,
        tax_total: 5,
        grand_total: 105,
        discount_total: 0,
        points_redeemed_discount: 0,
      },
    ];
    const items = {
      a: [{ name: 'A', quantity: 1, unit_price: 100, total: 100, tax_amount: 18, tax_rate: 18, cgst_rate: 9, sgst_rate: 9 }],
      b: [{ name: 'B', quantity: 1, unit_price: 100, total: 100, tax_amount: 5, tax_rate: 5, cgst_rate: 2.5, sgst_rate: 2.5 }],
    };

    const result = buildTaxFilteredProductRows(invoices, items, 18);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].invoiceNumber).toBe('INV-001');
    expect(result.totals.invoiceCount).toBe(1);
    expect(result.totals.totalSales).toBe(118);
    expect(result.totals.totalTax).toBe(18);
  });
});

describe('sortInvoicesByInvoiceNumber', () => {
  it('sorts numerically, not lexicographically', () => {
    const invoices = [{ invoice_number: 'INV-10' }, { invoice_number: 'INV-2' }, { invoice_number: 'INV-1' }];
    expect(sortInvoicesByInvoiceNumber(invoices).map((invoice) => invoice.invoice_number)).toEqual([
      'INV-1',
      'INV-2',
      'INV-10',
    ]);
  });

  it('handles non-array inputs safely', () => {
    expect(sortInvoicesByInvoiceNumber(null as never)).toEqual([]);
    expect(sortInvoicesByInvoiceNumber(undefined as never)).toEqual([]);
  });
});

import { getInvoiceTaxComponents } from '../../src/utils/pricing/salesHistoryTax';
it('preserves stored component cents and recovers legacy interstate splits', () => {
  const inv={invoice_id:'qa',tax_total:18.01,cgst_total:9,sgst_total:9.01,igst_total:0};
  expect(getInvoiceTaxComponents(inv,[])).toEqual({cgst:9,sgst:9.01,igst:0});
  expect(getInvoiceTaxComponents({...inv,cgst_total:null,sgst_total:null,supply_type:'INTER'},[])).toEqual({cgst:0,sgst:0,igst:18.01});
  expect(getInvoiceTaxComponents({...inv,cgst_total:null,sgst_total:null},[])).toEqual({cgst:9.01,sgst:9,igst:0});
});
