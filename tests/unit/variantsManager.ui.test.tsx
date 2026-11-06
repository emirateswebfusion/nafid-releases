// @vitest-environment jsdom
import { within, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';
import { VariantsManager } from '../../src/components/variants/VariantsManager';
import { loadVariantCatalog } from '../../src/components/inventory/variantProducts';
import { deleteProduct, type Product } from '../../src/data/products';
vi.mock('../../src/components/inventory/variantProducts', async importOriginal => ({ ...await importOriginal<typeof import('../../src/components/inventory/variantProducts')>(), loadVariantCatalog: vi.fn() }));
vi.mock('../../src/data/products', () => ({ deleteProduct: vi.fn() }));
vi.mock('../../src/components/variants/views/VariantEditor', () => ({ VariantEditor: ({ parent, product }: { parent: Product; product?: Product }) => <div>{product ? `Editing ${product.name}` : `Adding variant to ${parent.name}`}</div> }));
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
it('searches child barcodes and opens only the selected variant for editing', async () => {
  render(<VariantsManager onClose={vi.fn()} />);
  expect(await screen.findByRole('cell', { name: 'Cotton Shirt Clothing' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search variants'), { target: { value: 'missing' } });
  expect(screen.getByText('No matching variants')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search variants'), { target: { value: 'SHIRT-S' } });
  expect(screen.getByRole('cell', { name: 'Cotton Shirt Clothing' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Cotton Shirt (S)' }));
  expect(screen.getByText('Editing Cotton Shirt (S)')).toBeTruthy();
});
it('requires explicit confirmation and reloads the catalog after deletion', async () => {
  render(<VariantsManager onClose={vi.fn()} />);
  await screen.findByRole('cell', { name: 'Cotton Shirt Clothing' });
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
  await screen.findByRole('cell', { name: 'Cotton Shirt Clothing' });
  expect(screen.queryByRole('button', { name: 'Add Variant' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Cotton Shirt (S)' })).toBeNull();
  expect(screen.queryByLabelText('Delete Cotton Shirt (S)')).toBeNull();
});
it('shows lookup failures with a working retry action', async () => {
  vi.mocked(loadVariantCatalog).mockRejectedValueOnce(new Error('Catalog unavailable'));
  render(<VariantsManager onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Catalog unavailable');
  fireEvent.click(screen.getByLabelText('Refresh variants'));
  expect(await screen.findByRole('cell', { name: 'Cotton Shirt Clothing' })).toBeTruthy();
});

it('shows one price list, filters individual variants and clears combined filters', async () => {
  vi.mocked(loadVariantCatalog).mockResolvedValue([...catalog,
    { ...catalog[1], product_id: 'xl', name: 'Cotton Shirt (XL)', sku_barcode: 'SHIRT-XL', domain_attributes: JSON.stringify({ parent_product_id: 'parent', variant_name: 'XL' }) },
    { ...catalog[0], product_id: 'other', name: 'Work Shirt', category: 'Uniforms' },
    { ...catalog[1], product_id: 'other-s', name: 'Work Shirt (S)', domain_attributes: JSON.stringify({ parent_product_id: 'other', variant_name: 'S' }) },
  ] as Product[]);
  render(<VariantsManager onClose={vi.fn()} />);
  await screen.findByText('Showing 3 of 3 variants');
  expect(screen.getAllByRole('table')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'XL 1' }));
  expect(screen.getByText('Showing 1 of 3 variants')).toBeTruthy();
  expect(screen.queryByText('SHIRT-S')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'All variants 3' }));
  fireEvent.change(screen.getByLabelText('Filter variant category'), { target: { value: 'Uniforms' } });
  expect(screen.getByRole('cell', { name: 'Work Shirt Uniforms' })).toBeTruthy();
  expect(screen.queryByRole('cell', { name: 'Cotton Shirt Clothing' })).toBeNull();
  fireEvent.click(screen.getByText('Clear filters'));
  fireEvent.change(screen.getByLabelText('Search variants'), { target: { value: 'SHIRT-XL' } });
  expect(screen.getByText('Showing 1 of 3 variants')).toBeTruthy();
  expect(screen.queryByText('SHIRT-S')).toBeNull();
});

it('adds variants to existing products, including products without any variants', async () => {
  vi.mocked(loadVariantCatalog).mockResolvedValue([...catalog, { product_id: 'new-parent', name: 'Plain Mug', category: 'Kitchen', domain_attributes: '{}' } as Product]);
  render(<VariantsManager onClose={vi.fn()} />);
  await screen.findByText('Showing 1 of 1 variants');
  expect(screen.queryByText('Add Product')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
  fireEvent.change(screen.getByLabelText('Find product for variant'), { target: { value: 'Plain' } });
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Cotton Shirt/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Plain Mug/ }));
  expect(screen.getByText('Adding variant to Plain Mug')).toBeTruthy();
});
it('shows a useful empty state and never offers child products as variant parents', async () => {
  vi.mocked(loadVariantCatalog).mockResolvedValue([catalog[0]]);
  const view = render(<VariantsManager onClose={vi.fn()} />);
  await screen.findByText('No variants yet');
  expect(screen.queryByRole('button', { name: 'All variants 0' })).toBeNull();
  fireEvent.click(screen.getByText('Add your first variant'));
  expect(screen.getByRole('button', { name: /Cotton Shirt/ })).toBeTruthy();
  view.unmount();
  vi.mocked(loadVariantCatalog).mockResolvedValue(catalog);
  render(<VariantsManager onClose={vi.fn()} />);
  await screen.findByText('Showing 1 of 1 variants');
  fireEvent.click(screen.getByRole('button', { name: 'Add Variant' }));
  expect(within(screen.getByRole('dialog')).getAllByRole('button', { name: /Cotton Shirt/ })).toHaveLength(1);
});

it('shows the canonical discounted selling price in the variant list', async () => {
  vi.mocked(loadVariantCatalog).mockResolvedValue([catalog[0], { ...catalog[1], discount_flat: 10 }]);
  render(<VariantsManager onClose={vi.fn()} />);
  expect(await screen.findByRole('cell', { name: /90\.00/ })).toBeTruthy();
});
