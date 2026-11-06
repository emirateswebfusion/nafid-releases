import { expect, it } from 'vitest';
import { getComboStock } from '../../src/utils/pricing/comboStock';
it('combines repeated product requirements before finding the limiting stock', () => {
  expect(getComboStock([{ product_id: 'a', product_stock: 12, quantity: 1 }, { product_id: 'a', product_stock: 12, quantity: 1 }])).toBe(6);
  expect(getComboStock([null])).toBe(0);
  expect(getComboStock([])).toBe(0);
});
