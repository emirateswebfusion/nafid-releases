import { expect, it } from 'vitest';
import { discountChange } from '../../src/components/inventory/productDiscounts';
it('keeps percentage, flat discount and offer changes consistent for product and variants', () => {
  expect(discountChange(80, 'discount_percent', '12.5')).toEqual({ discount_percent: '12.5', discount_flat: '10.00', offer_price: '' });
  expect(discountChange(80, 'discount_flat', '10')).toEqual({ discount_percent: '12.50', discount_flat: '10', offer_price: '' });
  expect(discountChange(0, 'discount_flat', '10')).toEqual({ discount_percent: '', discount_flat: '10', offer_price: '' });
  expect(discountChange(80, 'discount_percent', '')).toEqual({ discount_percent: '', discount_flat: '' });
  expect(discountChange(80, 'offer_price', '0')).toEqual({ offer_price: '0', discount_percent: '', discount_flat: '' });
  expect(discountChange(80, 'offer_price', '')).toEqual({ offer_price: '' });
});
