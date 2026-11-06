import { expect, it } from 'vitest';
import type { Product } from '../../src/data/products';
import { buildVariantRows, filterVariantRows } from '../../src/components/variants/variantCatalog';

const products = [
  { product_id: 'p', name: 'Shirt', category: 'Clothing', sku_barcode: 'PARENT' },
  { product_id: 'xl', name: 'Shirt (XL)', sku_barcode: 'XL-CODE', domain_attributes: JSON.stringify({ parent_product_id: 'p', variant_name: 'XL' }) },
  { product_id: 's', name: 'Shirt (S)', sku_barcode: 'S-CODE', domain_attributes: JSON.stringify({ parent_product_id: 'p', variant_name: 'S' }) },
  { product_id: 'orphan', name: 'Unlinked pack', domain_attributes: JSON.stringify({ parent_product_id: 'missing', variant_name: 'Pack' }) },
  { product_id: 'plain', name: 'Standalone', domain_attributes: 'invalid json' },
] as Product[];
it('lists every linked child including unavailable parents, without listing ordinary products as variants', () => {
  const rows = buildVariantRows(products);
  expect(rows.map(row => row.product.product_id)).toEqual(['s', 'xl', 'orphan']);
  expect(rows[0].parent?.product_id).toBe('p');
  expect(rows[2].parent).toBeUndefined();
});
it('combines product, category, variant and barcode filters on individual rows', () => {
  const rows = buildVariantRows(products);
  expect(filterVariantRows(rows, ' xl-code ', 'Clothing', 'xl', 'p').map(row => row.product.product_id)).toEqual(['xl']);
  expect(filterVariantRows(rows, 'PARENT', '', '', '')).toHaveLength(2);
  expect(filterVariantRows(rows, '', 'Other', '', '')).toHaveLength(0);
  expect(filterVariantRows(rows, '', '', 's', 'missing')).toHaveLength(0);
});
