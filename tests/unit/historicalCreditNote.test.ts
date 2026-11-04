import { describe, expect, it } from 'vitest';
import { creditNoteTotals } from '../../src/components/returns/creditNote';

describe('historical credit note amounts', () => {
  it('preserves the printed base and tax rather than current product prices', () => {
    const totals = creditNoteTotals([{productId:'p',name:'Carburettor',quantity:1,unitPrice:1144.07,tax:205.93}]);
    expect(totals).toMatchObject({subtotal:1144.07,tax:205.93,total:1350});
  });
  it('sums the cash return at the original line totals', () => {
    const totals = creditNoteTotals([{productId:'a',name:'14mm',quantity:1,unitPrice:118.64,tax:21.36},{productId:'b',name:'7mm',quantity:1,unitPrice:135.59,tax:24.41},{productId:'c',name:'6mm',quantity:1,unitPrice:76.27,tax:13.73}]);
    expect(totals).toMatchObject({subtotal:330.5,tax:59.5,total:390});
  });
  it.each([0,-1,NaN,Infinity])('rejects invalid quantity %s',quantity => expect(() => creditNoteTotals([{productId:'p',name:'Product',quantity,unitPrice:100,tax:18}])).toThrow());
});
