import { describe, expect, it } from 'vitest';
import { useCartStore } from '../../src/store/cartStore';

describe('filing-only cart reset', () => {
  it('after a filing-only bill, the next bill returns to the bill type used before', () => {
    useCartStore.setState({ invoiceType: 'GST', isFilingOnly: true, filingPreviousInvoiceType: 'BILL_OF_SUPPLY' });
    useCartStore.getState().clearCart();
    expect(useCartStore.getState()).toMatchObject({ invoiceType: 'BILL_OF_SUPPLY', isFilingOnly: false, filingPreviousInvoiceType: undefined });
  });

  it('an ordinary GST bill keeps GST for the next bill', () => {
    useCartStore.setState({ invoiceType: 'GST', isFilingOnly: false, filingPreviousInvoiceType: undefined });
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().invoiceType).toBe('GST');
  });
});
