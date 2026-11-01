import { stockDifference } from '../../electron/utils/stockDifference';
import { expect, it } from 'vitest';
import { stockComponents, netStockComponents } from '../../electron/utils/invoiceStock';

it('expands the saved component recipe using fractional bill quantities', () => {
  expect(stockComponents({ product_id: 'combo', quantity: 0.5, combo_id: 'combo',
    combo_details: '[{"product_id":"p","quantity":2},{"product_id":"q","quantity":0.25}]' }))
    .toEqual([{ product_id: 'p', quantity: 1 }, { product_id: 'q', quantity: 0.125 }]);
});
it('does not turn zero into one or reserve stock for a service', () => {
  expect(stockComponents({ product_id: 'p', quantity: 0 })).toEqual([]);
  expect(stockComponents({ product_id: 'p', quantity: 2, is_service_item: 1 })).toEqual([]);
});
it('fails before stock writes when a combo recipe is missing or malformed', () => {
  expect(() => stockComponents({ product_id: 'combo', quantity: 1, combo_id: 'combo' })).toThrow();
  expect(() => stockComponents({ product_id: 'combo', quantity: 1, combo_items: [{ product_id: 'p', quantity: -1 }] })).toThrow();
});


it('nets active returns and makes cancellation depend on the outstanding quantity', () => {
  const sold = [{ product_id: 'p', quantity: 2 }], returned = [{ product_id: 'p', quantity: 1 }];
  expect(netStockComponents(sold, returned)).toEqual([{ product_id: 'p', quantity: 1 }]);
  expect(stockDifference(netStockComponents(sold, []), netStockComponents(sold, returned)))
    .toEqual([{ product_id: 'p', quantity: 1 }]);
  expect(netStockComponents(sold, [{ product_id: 'p', quantity: 3 }])).toEqual([]);
  expect(stockDifference([], [])).toEqual([]);
});
