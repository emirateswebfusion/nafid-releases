import { describe, expect, it } from 'vitest';
import { roundCurrency } from '../../src/utils/pricing/taxEngine';

interface ReturnItemInput {
  invoice_item_id?: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
}

interface OrigItem {
  item_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  hsn_sac_code?: string;
}

function calculateReturnTaxSnapshots(
  items: ReturnItemInput[],
  origItems: OrigItem[],
  supplyType: 'INTRA' | 'INTER',
) {
  const calculatedItems = items.map(item => {
    const origItem = origItems.find(
      o => (item.invoice_item_id && o.item_id === item.invoice_item_id) || o.product_id === item.product_id,
    );
    const taxableAmount = roundCurrency(item.total - item.tax_amount);
    let cgstRate = origItem?.cgst_rate ?? 0;
    let sgstRate = origItem?.sgst_rate ?? 0;
    let igstRate = origItem?.igst_rate ?? 0;
    const hsnSacCode = origItem?.hsn_sac_code || null;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (supplyType === 'INTER') {
      igstAmount = item.tax_amount;
      if (!igstRate && taxableAmount > 0) {
        igstRate = roundCurrency((igstAmount / taxableAmount) * 100);
      }
    } else {
      cgstAmount = roundCurrency(item.tax_amount / 2);
      sgstAmount = roundCurrency(item.tax_amount - cgstAmount);
      if (!cgstRate && taxableAmount > 0) {
        cgstRate = roundCurrency((cgstAmount / taxableAmount) * 100);
        sgstRate = cgstRate;
      }
    }

    return {
      ...item,
      taxableAmount,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      hsnSacCode,
    };
  });

  const cgstTotal = roundCurrency(calculatedItems.reduce((s, it) => s + it.cgstAmount, 0));
  const sgstTotal = roundCurrency(calculatedItems.reduce((s, it) => s + it.sgstAmount, 0));
  const igstTotal = roundCurrency(calculatedItems.reduce((s, it) => s + it.igstAmount, 0));

  return {
    calculatedItems,
    cgstTotal,
    sgstTotal,
    igstTotal,
  };
}

describe('Credit Note / Return Tax Snapshots', () => {
  it('correctly calculates intra-state credit note CGST and SGST', () => {
    const items: ReturnItemInput[] = [
      {
        product_id: 'prod-1',
        name: 'Item A',
        quantity: 1,
        unit_price: 100,
        tax_amount: 18,
        total: 118,
      },
    ];
    const origItems: OrigItem[] = [
      {
        item_id: 'orig-1',
        product_id: 'prod-1',
        quantity: 2,
        unit_price: 100,
        tax_amount: 36,
        total: 236,
        cgst_rate: 9,
        sgst_rate: 9,
        igst_rate: 0,
        hsn_sac_code: '8471',
      },
    ];

    const result = calculateReturnTaxSnapshots(items, origItems, 'INTRA');

    expect(result.cgstTotal).toBe(9);
    expect(result.sgstTotal).toBe(9);
    expect(result.igstTotal).toBe(0);
    expect(result.calculatedItems[0].taxableAmount).toBe(100);
    expect(result.calculatedItems[0].hsnSacCode).toBe('8471');
    expect(result.calculatedItems[0].cgstRate).toBe(9);
    expect(result.calculatedItems[0].sgstRate).toBe(9);
  });

  it('correctly calculates inter-state credit note IGST', () => {
    const items: ReturnItemInput[] = [
      {
        product_id: 'prod-2',
        name: 'Item B',
        quantity: 2,
        unit_price: 500,
        tax_amount: 180,
        total: 1180,
      },
    ];
    const origItems: OrigItem[] = [
      {
        item_id: 'orig-2',
        product_id: 'prod-2',
        quantity: 5,
        unit_price: 500,
        tax_amount: 450,
        total: 2950,
        cgst_rate: 0,
        sgst_rate: 0,
        igst_rate: 18,
        hsn_sac_code: '8528',
      },
    ];

    const result = calculateReturnTaxSnapshots(items, origItems, 'INTER');

    expect(result.cgstTotal).toBe(0);
    expect(result.sgstTotal).toBe(0);
    expect(result.igstTotal).toBe(180);
    expect(result.calculatedItems[0].taxableAmount).toBe(1000);
    expect(result.calculatedItems[0].hsnSacCode).toBe('8528');
    expect(result.calculatedItems[0].igstRate).toBe(18);
  });

  it('handles multi-item return with odd tax division without losing a paisa', () => {
    // Tax amount 4.75 -> CGST 2.38, SGST 2.37 (total 4.75)
    const items: ReturnItemInput[] = [
      {
        product_id: 'prod-3',
        name: 'Item C',
        quantity: 1,
        unit_price: 95,
        tax_amount: 4.75,
        total: 99.75,
      },
    ];
    const origItems: OrigItem[] = [];

    const result = calculateReturnTaxSnapshots(items, origItems, 'INTRA');

    expect(result.calculatedItems[0].cgstAmount).toBe(2.38);
    expect(result.calculatedItems[0].sgstAmount).toBe(2.37);
    expect(result.cgstTotal + result.sgstTotal).toBe(4.75);
  });
});
