import { describe, expect, it } from 'vitest';
import { buildBulkPrintItem } from '../../src/utils/print/bulkPrintItem';

const baseProduct = {
  sku_barcode: 'SKU-1',
  name: 'Ring',
  base_price: 100,
  current_stock: 3,
  pricing_mode: 'FIXED_PRICE',
  offer_price: null,
  discount_flat: null,
  discount_percent: null,
};

describe('buildBulkPrintItem', () => {
  it('carries an offer price and OFF label into the bulk print payload', () => {
    expect(buildBulkPrintItem({ ...baseProduct, offer_price: 80 }, null)).toMatchObject({
      barcode: 'SKU-1',
      quantity: 3,
      price: 100,
      sp: 80,
      spType: 'OFF',
    });
  });

  it('carries a calculated special price and label for flat and percentage discounts', () => {
    expect(buildBulkPrintItem({ ...baseProduct, discount_flat: 15 }, null)).toMatchObject({ sp: 85, spType: 'SP' });
    expect(buildBulkPrintItem({ ...baseProduct, discount_percent: 20 }, null)).toMatchObject({ sp: 80, spType: 'SP' });
  });

  it('uses the grade rate for grade priced products and omits an unchanged price', () => {
    expect(buildBulkPrintItem({ ...baseProduct, pricing_mode: 'GRADE_RATE', discount_flat: 10 }, 75)).toMatchObject({ price: 75, sp: 65 });
    expect(buildBulkPrintItem({ ...baseProduct, offer_price: 100 }, null).sp).toBeUndefined();
  });
});
