import { expect, it } from 'vitest';
import { changeProductDiscount, recalculateProductDiscount } from '../../src/utils/pricing/productDiscounts';
it('keeps percentage, flat discount and offer changes consistent for product and variants', () => {
  expect(changeProductDiscount(80, 'discount_percent', '12.5')).toEqual({ discount_percent: '12.5', discount_flat: '10.00', offer_price: '' });
  expect(changeProductDiscount(80, 'discount_flat', '10')).toEqual({ discount_percent: '12.50', discount_flat: '10', offer_price: '' });
  expect(changeProductDiscount(0, 'discount_flat', '10')).toEqual({ discount_percent: '', discount_flat: '10', offer_price: '' });
  expect(changeProductDiscount(80, 'discount_percent', '')).toEqual({ discount_percent: '', discount_flat: '' });
  expect(changeProductDiscount(80, 'offer_price', '0')).toEqual({ offer_price: '0', discount_percent: '', discount_flat: '' });
  expect(changeProductDiscount(80, 'offer_price', '')).toEqual({ offer_price: '' });
});

it('preserves percentage recalculation on MRP changes, including zero, clearing and invalid legacy inputs', () => {
  for (const base of [0, 1, 19.99, 80, 999.95]) {
    for (const percent of ['', null, undefined, 'invalid', '0', '12.5', '100', '12.5legacy', -5]) {
      const parsed = parseFloat(String(percent));
      const expected = percent == null || percent === '' || isNaN(parsed) ? {} : { discount_flat: base ? ((base * parsed) / 100).toFixed(2) : '' };
      expect(recalculateProductDiscount(base, percent)).toEqual(expected);
    }
  }
});
