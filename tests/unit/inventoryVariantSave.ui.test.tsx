// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useInventoryState } from '../../src/components/inventory/hooks/useInventoryState';
import { useInventorySave } from '../../src/components/inventory/hooks/useInventorySave';
import { createProduct, updateProduct, setProductPricing } from '../../src/data/products';
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../src/data/products', () => ({ createProduct: vi.fn(), updateProduct: vi.fn(), setProductPricing: vi.fn() }));
vi.mock('../../src/data/grades', () => ({ listGrades: vi.fn().mockResolvedValue([]), createGrade: vi.fn() }));
vi.mock('../../src/data/purchases', () => ({ purchasesApi: { addPurchaseBill: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createProduct).mockResolvedValue({ success: true });
  vi.mocked(updateProduct).mockResolvedValue({ success: true });
  vi.mocked(setProductPricing).mockResolvedValue({ success: true });
});
const loadProducts = vi.fn().mockResolvedValue(undefined);
function useForm() {
  const inv = useInventoryState();
  return { inv, ...useInventorySave({ inv, encodePurchasePriceCode: () => '', existingCategories: ['Clothing'], loadProducts, tenantId: 'tenant' }) };
}
it('retains parent and successful child identities after a tier failure, then retries with updates', async () => {
  const { result } = renderHook(useForm);
  act(() => {
    result.current.inv.setView('add');
    result.current.inv.setFormData(previous => ({ ...previous, name: 'Shirt', category: 'Clothing', sku_barcode: 'SHIRT', base_price: 100 }));
    result.current.inv.setVariants([{ id: 'draft-s', variant_name: 'S', sku_barcode: 'SHIRT-S', purchase_price: 50, base_price: 100, offer_price: '', current_stock: 12, tierPrices: { wholesale: '80' } }]);
  });
  vi.mocked(setProductPricing).mockResolvedValueOnce({ success: false, error: 'Tier unavailable' });
  await act(async () => { await result.current.handleSave(); });
  expect(result.current.inv.view).toBe('edit');
  expect(result.current.inv.loading).toBe(false);
  expect(result.current.inv.statusMessage?.text).toBe('Tier unavailable');
  const parentId = result.current.inv.editingProduct?.product_id;
  const childId = result.current.inv.variants[0].product_id;
  expect(parentId).toBeTruthy(); expect(childId).toBeTruthy();
  expect(createProduct).toHaveBeenCalledTimes(2);
  await act(async () => { await result.current.handleSave(); });
  expect(createProduct).toHaveBeenCalledTimes(2);
  expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ product_id: parentId }));
  expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ product_id: childId }));
  expect(result.current.inv.view).toBe('list');
});
it('reports a parent tier failure without trying child writes or closing the draft', async () => {
  const { result } = renderHook(useForm);
  act(() => {
    result.current.inv.setView('add');
    result.current.inv.setFormData(previous => ({ ...previous, name: 'Shirt', category: 'Clothing', sku_barcode: 'SHIRT', base_price: 100 }));
    result.current.inv.setTierPrices({ wholesale: '75' });
  });
  vi.mocked(setProductPricing).mockResolvedValueOnce({ success: false, error: 'Product tier failed' });
  await act(async () => { await result.current.handleSave(); });
  await waitFor(() => expect(result.current.inv.statusMessage?.text).toBe('Product tier failed'));
  expect(result.current.inv.view).toBe('edit');
  expect(result.current.inv.loading).toBe(false);
  expect(createProduct).toHaveBeenCalledTimes(1);
});
