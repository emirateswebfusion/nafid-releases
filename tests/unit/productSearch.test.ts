import { describe, it, expect } from 'vitest';
import { buildProductSearchResults, type ProductSearchOptions } from '../../src/components/billing/productSearch';

const opts: ProductSearchOptions = { invoiceType: 'BILL_OF_SUPPLY', enableRealPaperStock: true, showPaperInGstSetting: true, showPaperInEstSetting: true };
const p = (id: string, fields: Record<string, unknown> = {}) => ({ product_id: id, name: id, base_price: 10, current_stock: 1, ...fields });
const ids = (rows: { product_id: string }[]) => rows.map(r => r.product_id);

describe('product search results', () => {
  it('lists combos first, mapped into product rows', () => {
    const rows = buildProductSearchResults([p('Rice Plate')], [{ combo_id: 'c1', name: 'Rice Combo', combo_price: 99, items: [] }], 'rice', opts);
    expect(ids(rows)).toEqual(['c1', 'Rice Plate']);
    expect(rows[0]).toMatchObject({ isCombo: true, uom: 'Combo', base_price: 99, current_stock: 0 });
  });

  it('derives combo stock from the limiting component and required quantity', () => {
    const stock = (items: unknown[]) => buildProductSearchResults([], [{ combo_id: 'c', items }], 'pigeon', opts)[0].current_stock;
    expect(stock([{ product_stock: 12, quantity: 1 }, { product_stock: 11, quantity: 1 }])).toBe(11);
    expect(stock([{ product_stock: 12, quantity: 2 }, { product_stock: 11, quantity: 1 }])).toBe(6);
    expect(stock([{ product_stock: -1, quantity: 1 }])).toBe(0);
    expect(stock([{ product_stock: null, quantity: 1 }])).toBe(0);
    expect(stock([{ product_stock: 12, quantity: 0 }])).toBe(0);
  });

  it('matches barcode, item code, brand, category and HSN, not only the name', () => {
    const products = [
      p('a', { sku_barcode: '8901234' }), p('b', { item_code: 'P-0248' }), p('c', { brand_manufacturer: 'Prestige' }),
      p('d', { category: 'Steel' }), p('e', { hsn_sac_code: '7323' }), p('f'),
    ];
    expect(ids(buildProductSearchResults(products, [], '890123', opts))).toEqual(['a']);
    expect(ids(buildProductSearchResults(products, [], 'p-0248', opts))).toEqual(['b']);
    expect(ids(buildProductSearchResults(products, [], 'prestige', opts))).toEqual(['c']);
    expect(ids(buildProductSearchResults(products, [], 'steel', opts))).toEqual(['d']);
    expect(ids(buildProductSearchResults(products, [], '7323', opts))).toEqual(['e']);
  });

  it('matches words in any order and ignores spaces and special characters', () => {
    const products = [p('Steel Tumbler'), p('Ari@pa'), p('Rice Plate')];
    expect(ids(buildProductSearchResults(products, [], 'tumbler steel', opts))).toEqual(['Steel Tumbler']);
    expect(ids(buildProductSearchResults(products, [], 'riceplate', opts))).toEqual(['Rice Plate']);
    expect(ids(buildProductSearchResults(products, [], 'aripa', opts))).toEqual(['Ari@pa']);
    expect(buildProductSearchResults(products, [], 'zzz', opts)).toEqual([]);
  });

  it('hides paper-only products unless paper stock is enabled for the invoice type', () => {
    const paper = p('A4 Paper', { domain_attributes: '{"gst_type":"PAPER"}', base_price: 0, purchase_price: 0, current_stock: 0 });
    const realPaper = p('A4 Paper Real', { domain_attributes: '{"gst_type":"PAPER"}', base_price: 5, current_stock: 0 });
    const search = (o: Partial<ProductSearchOptions>) => ids(buildProductSearchResults([paper, realPaper], [], 'a4', { ...opts, ...o }));
    expect(search({})).toEqual(['A4 Paper', 'A4 Paper Real']);
    expect(search({ enableRealPaperStock: false })).toEqual(['A4 Paper Real']);
    expect(search({ invoiceType: 'GST', showPaperInGstSetting: false })).toEqual(['A4 Paper Real']);
    expect(search({ invoiceType: 'BILL_OF_SUPPLY', showPaperInEstSetting: false })).toEqual(['A4 Paper Real']);
  });

  it('keeps only one service-charge row', () => {
    const rows = buildProductSearchResults([p('s1', { name: 'Service Charge' }), p('s2', { is_service_item: 1, name: 'Service Fee' }), p('s3', { name: 'service charge' })], [], 'service', opts);
    expect(rows).toHaveLength(1);
  });

  it('returns at most 50 rows and tolerates missing lists', () => {
    const many = Array.from({ length: 80 }, (_, i) => p(`Rice ${i}`));
    expect(buildProductSearchResults(many, null, 'rice', opts)).toHaveLength(50);
    expect(buildProductSearchResults(null, undefined, 'rice', opts)).toEqual([]);
  });
});
