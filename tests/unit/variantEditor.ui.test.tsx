// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VariantEditor } from '../../src/components/variants/views/VariantEditor';
import { loadProductVariants, saveProductVariants, type ProductVariantItem } from '../../src/components/inventory/variantProducts';
import { listPricingTiers } from '../../src/data/pricingTiers';
import { getSetting } from '../../src/data/settings';
import type { Product } from '../../src/data/products';
import { useAuthStore } from '../../src/store/authStore';
vi.mock('../../src/components/inventory/variantProducts', async importOriginal => ({ ...await importOriginal<typeof import('../../src/components/inventory/variantProducts')>(), loadProductVariants: vi.fn(), saveProductVariants: vi.fn() }));
vi.mock('../../src/data/pricingTiers', () => ({ listPricingTiers: vi.fn() }));
vi.mock('../../src/data/settings', () => ({ getSetting: vi.fn() }));
vi.mock('../../src/components/inventory/views/form/PricingSection', () => ({ PricingSection: () => <div>Inventory & Pricing</div> }));
const parent = { product_id: 'parent', tenant_id: 'tenant', name: 'Shirt', base_price: 100, purchase_price: 50, current_stock: 7, sku_barcode: 'SHIRT' } as Product;
const child: ProductVariantItem = { id: 's', product_id: 's', variant_name: 'S', sku_barcode: 'SHIRT-S', base_price: 100, purchase_price: 50, offer_price: '', current_stock: 4, tierPrices: {} };
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ role: 'ADMIN', permissions: ['*'] });
  vi.mocked(loadProductVariants).mockResolvedValue([child]);
  vi.mocked(listPricingTiers).mockResolvedValue([]);
  vi.mocked(getSetting).mockResolvedValue(false);
  vi.mocked(saveProductVariants).mockResolvedValue(undefined);
});
afterEach(cleanup);
it('creates only a child of the chosen product and rejects duplicate sibling names', async () => {
  const onSaved = vi.fn();
  render(<VariantEditor parent={parent} tenantId="tenant" onClose={vi.fn()} onSaved={onSaved} />);
  const name = await screen.findByLabelText('Variant 1 name');
  expect(screen.getByText('Inventory & Pricing')).toBeTruthy();
  expect(screen.getByText('3. Discount & Offers')).toBeTruthy();
  expect(screen.queryByLabelText('Remove variant 1')).toBeNull();
  fireEvent.change(name, { target: { value: 'S' } });
  fireEvent.click(screen.getByText('Save Variant'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Variant names must be unique within a product.');
  expect(saveProductVariants).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: 'XL' } });
  fireEvent.click(screen.getByText('Save Variant'));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(saveProductVariants).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'parent', current_stock: 7 }), [expect.objectContaining({ variant_name: 'XL', current_stock: '0' })], expect.any(Function));
});
it('edits one child with edit-only permission and retains its draft and assigned ID after a partial save failure', async () => {
  useAuthStore.setState({ role: 'STAFF', permissions: ['products.view', 'products.edit'] });
  vi.mocked(saveProductVariants).mockImplementationOnce(async (_parent, variants, created) => {
    created(variants[0].id, 's');
    throw new Error('Tier write failed');
  });
  const onSaved = vi.fn();
  render(<VariantEditor parent={parent} product={{ product_id: 's' } as Product} tenantId="tenant" onClose={vi.fn()} onSaved={onSaved} />);
  const name = await screen.findByLabelText('Variant 1 name');
  fireEvent.change(name, { target: { value: 'Small' } });
  fireEvent.click(screen.getByText('Save Variant'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Tier write failed');
  expect((name as HTMLInputElement).value).toBe('Small');
  fireEvent.click(screen.getByText('Save Variant'));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(vi.mocked(saveProductVariants).mock.calls[1][1]).toEqual([expect.objectContaining({ product_id: 's', variant_name: 'Small', current_stock: 4 })]);
});
it('blocks saving after load failure and retries without writing a blank draft', async () => {
  vi.mocked(loadProductVariants).mockRejectedValueOnce(new Error('Pricing unavailable'));
  render(<VariantEditor parent={parent} tenantId="tenant" onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Pricing unavailable'));
  expect((screen.getByText('Save Variant').closest('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Retry'));
  expect(await screen.findByLabelText('Variant 1 name')).toBeTruthy();
  expect(saveProductVariants).not.toHaveBeenCalled();
});
