import { expect, it } from 'vitest';
import { importNumber, parseProductRows } from '../../src/components/data-upload/productFile';
import { buildInventoryCsvRow } from '../../src/components/inventory/hooks/useInventoryExports';
import type { Product } from '../../src/components/inventory/inventoryUtils';

it.each(['1,250.50', '₹1,250.50', 'INR 1,250.50', 'AED 1250.50'])('reads formatted prices %s', value => {
  expect(importNumber(value)).toBe(1250.5);
});
it.each(['12abc', 'Infinity', '1,2,3', '1.2.3', 'NaN'])('rejects malformed number %s', value => {
  expect(Number.isNaN(importNumber(value))).toBe(true);
});
it('reads Indian and international digit grouping', () => {
  expect(importNumber('12,34,567')).toBe(1234567);
  expect(importNumber('1,234,567')).toBe(1234567);
});
it('reads Excel-style percentage displays as percentage points', () => {
  const [row] = parseProductRows([{ Name: 'Drill', MRP: 100, 'Tax Rate %': '18%', 'Discount %': '5%' }], []);
  expect(row.isValid).toBe(true);
  expect(row.data).toMatchObject({ tax_rate_percent: 18, discount_percent: 5 });
});
it('does not merge Retail Special into Retail and accepts the guide tier heading', () => {
  const [row] = parseProductRows([{ Name: 'Drill', MRP: 100, 'Retail Special': 70, 'Dealer (Tier Price)': 60 }], [{ name: 'Retail' }, { name: 'Dealer' }]);
  expect(row.data.tier_prices).toEqual({ 'Retail Special': 70, Dealer: 60 });
});
it('preserves discounts, identifiers, negative stock and formatted tier prices', () => {
  const [row] = parseProductRows([{ 'Product Name': ' Drill ', Barcode: '00123', 'Item Code': '0004',
    MRP: '1,250', 'Purchase Price': '₹900', Stock: '-2.5', 'Discount %': '10',
    'Discount Flat': '5.25', 'Offer Price': '1,100', 'Tier: Dealer': '₹1,000', 'GST Applicable': 'YES' }], []);
  expect(row.errors).toEqual([]);
  expect(row.data).toMatchObject({ name: 'Drill', sku_barcode: '00123', item_code: '0004',
    base_price: 1250, purchase_price: 900, current_stock: -2.5, discount_percent: 10,
    discount_flat: 5.25, offer_price: 1100, is_gst_applicable: 1, tier_prices: { Dealer: 1000 } });
});
it.each(['Purchase Price', 'Stock', 'Tax Rate %', 'Discount %', 'Discount Flat', 'Offer Price', 'Tier: Dealer'])('flags invalid %s instead of defaulting it', column => {
  expect(parseProductRows([{ Name: 'Drill', MRP: 100, [column]: 'bad' }], [])[0].isValid).toBe(false);
});
it('rejects repeated identity while allowing equal names from different brands', () => {
  const rows = parseProductRows([{ Name: 'Drill', Brand: 'A', MRP: 100, Barcode: '001' },
    { Name: 'Drill', Brand: 'B', MRP: 200, Barcode: '002' },
    { Name: 'Other', MRP: 300, Barcode: '001' }], []);
  expect(rows.map(r => r.isValid)).toEqual([true, true, false]);
});
it('round-trips exported core fields and does not turn metadata into price tiers', () => {
  const product = { product_id: 'p', name: 'Drill', base_price: 150, purchase_price: 95, current_stock: 7,
    discount_percent: 5, discount_flat: 3, offer_price: 130, hsn_sac_code: '8205', tax_rate_percent: 18,
    sku_barcode: '0012', item_code: '0007', uom: 'Pcs' } as Product;
  const [row] = parseProductRows([buildInventoryCsvRow({ product, grades: [], activeTiers: [{ pricing_tier_id: 'tier', name: 'Dealer' }], pricingMap: { p: { tier: 120 } } })], [{ name: 'Dealer' }]);
  expect(row.errors).toEqual([]);
  expect(row.data).toMatchObject({ base_price: 150, current_stock: 7, discount_percent: 5,
    discount_flat: 3, offer_price: 130, sku_barcode: '0012', tier_prices: { Dealer: 120 } });
});
it('retains exported paper prices and explicit weight billing', () => {
  const [row] = parseProductRows([{ Name: 'Wire', MRP: 100, 'Paper Purchase': 60, 'Paper MRP': 90,
    'Paper Stock': 5, 'Billing Type': 'WEIGHT', 'GST Applicable': 'YES' }], []);
  expect(row.errors).toEqual([]);
  expect(row.data).toMatchObject({ gst_purchase_price: 60, paper_mrp: 90, paper_stock: 5, billing_type: 'WEIGHT' });
});
