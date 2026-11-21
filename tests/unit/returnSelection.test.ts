import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../src/data/invoices', () => ({ getInvoiceItems: vi.fn(async () => [{ item_id: 'line', product_id: 'p',
  quantity: 22, unit_price: 100, total: 2200, tax_amount: 396 }]), listInvoices: vi.fn() }));
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

  it('retains original pieces_sold for weighted items when selected for return', async () => {
    const addItem = vi.fn();
    const ctx = { productSearch: { setSearchQuery: vi.fn(), setReturnSearchResults: vi.fn() }, customerFields: {},
      addItem, clearCart: vi.fn(), reserveReturnNumberForTab: vi.fn(), setReturnMode: vi.fn(),
      setSelectedReturnInvoice: vi.fn(), updateActiveTab: vi.fn(), setReturnRefundMethod: vi.fn(), tenantId: 't' };
    const selection = useSearchSelection(ctx as unknown as UseSearchSelectionContext);

    // Mock invoice item with weight and pieces_sold
    const { getInvoiceItems } = await import('../../src/data/invoices');
    vi.mocked(getInvoiceItems).mockResolvedValueOnce([{
      item_id: 'line-weight',
      product_id: 'p-chicken',
      quantity: 2.5,
      unit_price: 200,
      total: 500,
      tax_amount: 0,
      pieces_sold: 8,
      billing_type: 'WEIGHT',
      uom: 'Kg',
    }] as unknown as Awaited<ReturnType<typeof getInvoiceItems>>);

    await selection.handleSelectReturnInvoice({ invoice_id: 'inv-w', invoice_number: 'INV-W1', subtotal: 500,
      discount_total: 0, payment_method: 'CASH' } as Parameters<typeof selection.handleSelectReturnInvoice>[0]);

    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 0,
      originalQuantity: 2.5,
      availableToReturn: 2.5,
      billing_type: 'WEIGHT',
      pieces_override: 8,
      uom: 'Kg',
    }));
  });
});
