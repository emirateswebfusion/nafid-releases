import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../src/data/invoices', () => ({ getInvoiceItems: async () => [{ item_id: 'line', product_id: 'p',
  quantity: 22, unit_price: 100, total: 2200, tax_amount: 396 }], listInvoices: vi.fn() }));
vi.mock('../../src/data/returns', () => ({ returnsApi: { getAlreadyReturnedQuantities: async () => [{ invoice_item_id: 'line', returned_qty: 2 }] } }));
vi.mock('../../src/data/products', () => ({ getProductsByIds: async () => [], listProducts: vi.fn() }));
import { useSearchSelection, type UseSearchSelectionContext } from '../../src/components/billing/hooks/useSearchSelection';
describe('invoice selection for returns', () => {
  it('starts at zero while retaining remaining quantity and discounted invoice prices', async () => {
    const addItem = vi.fn();
    const ctx = { productSearch: { setSearchQuery: vi.fn(), setReturnSearchResults: vi.fn() }, customerFields: {},
      addItem, clearCart: vi.fn(), reserveReturnNumberForTab: vi.fn(), setReturnMode: vi.fn(),
      setSelectedReturnInvoice: vi.fn(), updateActiveTab: vi.fn(), setReturnRefundMethod: vi.fn(), tenantId: 't' };
    const selection = useSearchSelection(ctx as unknown as UseSearchSelectionContext);
    await selection.handleSelectReturnInvoice({ invoice_id: 'i', invoice_number: 'I-1', subtotal: 2200,
      discount_total: 220, payment_method: 'CASH' } as Parameters<typeof selection.handleSelectReturnInvoice>[0]);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ quantity: 0, originalQuantity: 22,
      availableToReturn: 20, alreadyReturned: 2, originalUnitPrice: 90, originalTaxAmount: expect.closeTo(356.4) }));
  });
});
