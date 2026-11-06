// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';
import { VariantsManager } from '../../src/components/variants/VariantsManager';
import { loadVariantCatalog } from '../../src/components/inventory/variantProducts';
import { deleteProduct, type Product } from '../../src/data/products';
vi.mock('../../src/components/inventory/variantProducts', async importOriginal => ({ ...await importOriginal<typeof import('../../src/components/inventory/variantProducts')>(), loadVariantCatalog: vi.fn() }));
vi.mock('../../src/data/products', () => ({ deleteProduct: vi.fn() }));
vi.mock('../../src/components/inventory/InventoryManager', () => ({ InventoryManager: ({ initialProduct }: { initialProduct?: Product | null }) => <div>Editing {initialProduct?.name || 'New product'}</div> }));
const catalog = [
  { product_id: 'parent', name: 'Cotton Shirt', category: 'Clothing', domain_attributes: '{}' },
  { product_id: 's', name: 'Cotton Shirt (S)', sku_barcode: 'SHIRT-S', category: 'Clothing', current_stock: 12, base_price: 100, domain_attributes: JSON.stringify({ parent_product_id: 'parent', variant_name: 'S' }) },
] as Product[];
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ tenantId: 'tenant', role: 'ADMIN', permissions: ['*'] });
  vi.mocked(loadVariantCatalog).mockResolvedValue(catalog);
  vi.mocked(deleteProduct).mockResolvedValue({ success: true });
});
afterEach(cleanup);
it('searches child barcodes and delegates group edits to the parent form', async () => {
  render(<VariantsManager onClose={vi.fn()} />);
  expect(await screen.findByText('Cotton Shirt')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search variants'), { target: { value: 'missing' } });
  expect(screen.getByText('No matching variants')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search variants'), { target: { value: 'SHIRT-S' } });
  expect(screen.getByText('Cotton Shirt')).toBeTruthy();
  fireEvent.click(screen.getByText('Manage Variants & Prices'));
  expect(screen.getByText('Editing Cotton Shirt')).toBeTruthy();
});
it('requires explicit confirmation and reloads the catalog after deletion', async () => {
  render(<VariantsManager onClose={vi.fn()} />);
  await screen.findByText('Cotton Shirt');
  fireEvent.click(screen.getByLabelText('Delete Cotton Shirt (S)'));
  expect(deleteProduct).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
  expect(deleteProduct).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Delete Cotton Shirt (S)'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete Variant' }));
  await waitFor(() => expect(deleteProduct).toHaveBeenCalledWith('s'));
  await waitFor(() => expect(loadVariantCatalog).toHaveBeenCalledTimes(2));
});
it('hides all write actions for read-only staff', async () => {
  useAuthStore.setState({ role: 'STAFF', permissions: ['products.view'] });
  render(<VariantsManager onClose={vi.fn()} />);
  await screen.findByText('Cotton Shirt');
  expect(screen.queryByText('Add Product')).toBeNull();
  expect(screen.queryByText('Manage Variants & Prices')).toBeNull();
  expect(screen.queryByLabelText('Delete Cotton Shirt (S)')).toBeNull();
});
it('shows lookup failures with a working retry action', async () => {
  vi.mocked(loadVariantCatalog).mockRejectedValueOnce(new Error('Catalog unavailable'));
  render(<VariantsManager onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Catalog unavailable');
  fireEvent.click(screen.getByLabelText('Refresh variants'));
  expect(await screen.findByText('Cotton Shirt')).toBeTruthy();
});
