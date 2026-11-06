import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProduct, updateProduct, listProducts, getProductPricing, setProductPricing, type Product } from '../../src/data/products';
import { loadProductVariants, saveProductVariants, validateVariants, variantAttributes } from '../../src/components/inventory/variantProducts';
import type { ProductVariantItem } from '../../src/components/inventory/variantProducts';
vi.mock('../../src/data/products', () => ({ createProduct: vi.fn(), updateProduct: vi.fn(), listProducts: vi.fn(), getProductPricing: vi.fn(), setProductPricing: vi.fn() }));
const draft = (changes: Partial<ProductVariantItem> = {}): ProductVariantItem => ({ id: 'draft', variant_name: 'S', sku_barcode: 'size-s', purchase_price: '20', base_price: '50', offer_price: '', current_stock: '10', tierPrices: {}, ...changes });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(createProduct).mockResolvedValue({ success: true }); vi.mocked(updateProduct).mockResolvedValue({ success: true }); vi.mocked(setProductPricing).mockResolvedValue({ success: true }); });
describe('product variants', () => {
  it('validates names, barcodes, prices and stock before saving', () => {
    expect(validateVariants([draft({ variant_name: ' ' })])).toMatch(/name/);
    expect(validateVariants([draft(), draft({ variant_name: ' s ' })])).toMatch(/unique/);
    expect(validateVariants([draft(), draft({ variant_name: 'M' })])).toMatch(/barcode/);
    expect(validateVariants([draft()], 'size-s')).toMatch(/barcode/);
    expect(validateVariants([draft({ tierPrices: { wholesale: '-1' } })])).toMatch(/prices/);
    expect(validateVariants([draft({ base_price: 'NaN' })])).toMatch(/prices/);
    expect(validateVariants([draft({ current_stock: 'NaN' })])).toMatch(/stock/);
    expect(validateVariants([draft({ base_price: 0, offer_price: 0 })])).toBeNull();
  });
  it('loads children beyond the first catalog page, retaining metadata and zero tier prices', async () => {
    vi.mocked(listProducts).mockResolvedValueOnce(Array.from({ length: 500 }, (_, index) => ({ product_id: `other-${index}` } as Product))).mockResolvedValueOnce([
      { product_id: 'child', name: 'Shirt (S)', uom: 'Pcs', base_price: 50, current_stock: 10, domain_attributes: JSON.stringify({ parent_product_id: 'parent', variant_name: 'S', paper_mrp: 60, custom: 'keep' }) } as Product,
    ]);
    vi.mocked(getProductPricing).mockResolvedValue([{ product_id: 'child', pricing_tier_id: 'wholesale', price: 0 }]);
    const result = await loadProductVariants('tenant', 'parent');
    expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 500, tenant_id: 'tenant' }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ product_id: 'child', variant_name: 'S', paper_mrp: 60, tierPrices: { wholesale: '0' }, domain_attributes: { custom: 'keep' } });
  });
  it('saves independent tiers, preserves child fields and clears blank offers and tiers', async () => {
    await saveProductVariants({ product_id: 'parent', name: 'Shirt', tenant_id: 'tenant', base_price: 100, offer_price: 90 }, [draft({ product_id: 'child', originalProduct: { discount_percent: 5, billing_type: 'WEIGHT', average_weight_per_piece: 2 } as Product, domain_attributes: { custom: 'keep' }, tierPrices: { wholesale: '30', vip: '' } })], vi.fn());
    expect(createProduct).not.toHaveBeenCalled();
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'child', offer_price: null, current_stock: 10, discount_percent: 5, billing_type: 'WEIGHT', average_weight_per_piece: 2 }));
    expect(variantAttributes(vi.mocked(updateProduct).mock.calls[0][0].domain_attributes)).toMatchObject({ custom: 'keep', parent_product_id: 'parent', variant_name: 'S' });
    expect(setProductPricing).toHaveBeenCalledWith({ tenant_id: 'tenant', product_id: 'child', pricing: [{ pricing_tier_id: 'wholesale', price: 30 }, { pricing_tier_id: 'vip', price: null }] });
  });
  it('does not replace an explicit zero offer with the parent price', async () => {
    await saveProductVariants({ product_id: 'parent', name: 'Shirt', tenant_id: 'tenant', base_price: 100 }, [draft({ offer_price: 0 })], vi.fn());
    expect(createProduct).toHaveBeenCalledWith(expect.objectContaining({ offer_price: 0 }));
  });
  it('retains successful child IDs before a tier failure so retry does not duplicate children', async () => {
    const created = vi.fn();
    vi.mocked(setProductPricing).mockResolvedValue({ success: false, error: 'Tier failed' });
    await expect(saveProductVariants({ product_id: 'parent', tenant_id: 'tenant', name: 'Shirt' }, [draft({ tierPrices: { wholesale: '20' } }), draft({ variant_name: 'M' })], created)).rejects.toThrow('Tier failed');
    const childId = created.mock.calls[0][1] as string;
    expect(created).toHaveBeenCalledWith('draft', expect.any(String));
    expect(createProduct).toHaveBeenCalledTimes(1);
    vi.mocked(setProductPricing).mockResolvedValue({ success: true });
    await saveProductVariants({ product_id: 'parent', tenant_id: 'tenant', name: 'Shirt' }, [draft({ product_id: childId, tierPrices: { wholesale: '20' } })], created);
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ product_id: childId }));
  });
  it('does not save tier rows after a failed product write', async () => {
    vi.mocked(createProduct).mockResolvedValue({ success: false, error: 'Barcode exists' });
    await expect(saveProductVariants({ product_id: 'p', tenant_id: 'tenant' }, [draft({ tierPrices: { vip: '10' } })], vi.fn())).rejects.toThrow('Barcode exists');
    expect(setProductPricing).not.toHaveBeenCalled();
  });
  it('rejects malformed attributes safely', () => { expect(variantAttributes('[]')).toEqual({}); expect(variantAttributes('{bad')).toEqual({}); });
});

it('persists and reloads independent variant discounts and permits clearing them', async () => {
  await saveProductVariants({ product_id: 'parent', tenant_id: 'tenant', name: 'Shirt' }, [draft({ discount_percent: '10', discount_flat: '5' })], vi.fn());
  expect(createProduct).toHaveBeenCalledWith(expect.objectContaining({ discount_percent: 10, discount_flat: 5 }));
  vi.mocked(listProducts).mockResolvedValue([{ product_id: 'child', discount_percent: 10, discount_flat: 5, domain_attributes: JSON.stringify({ parent_product_id: 'parent', variant_name: 'S' }) } as Product]);
  vi.mocked(getProductPricing).mockResolvedValue([]);
  const [loaded] = await loadProductVariants('tenant', 'parent');
  expect(loaded).toMatchObject({ discount_percent: 10, discount_flat: 5 });
  await saveProductVariants({ product_id: 'parent', tenant_id: 'tenant', name: 'Shirt' }, [{ ...loaded, discount_percent: '', discount_flat: '' }], vi.fn());
  expect(updateProduct).toHaveBeenCalledWith(expect.objectContaining({ discount_percent: null, discount_flat: null }));
});
