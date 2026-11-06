/** Isolated manual regression shop. All bridge writes stay in memory; external network is disabled. */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/index.css';
import { useAuthStore } from '../../src/store/authStore';
import { useFeatureFlagsStore } from '../../src/config/featureFlags';
import { InventoryManager } from '../../src/components/inventory/InventoryManager';
import { VariantsManager } from '../../src/components/variants/VariantsManager';
import type { ProductWritePayload } from '../../src/data/products';
const products: ProductWritePayload[] = [
  { product_id: 'shirt', tenant_id: 'variant-test', name: 'Cotton Shirt', category: 'Clothing', uom: 'Pcs', sku_barcode: 'SHIRT', base_price: 100, purchase_price: 50, current_stock: 7, domain_attributes: JSON.stringify({ has_variants: true }) },
  { product_id: 'shirt-s', tenant_id: 'variant-test', name: 'Cotton Shirt (S)', category: 'Clothing', uom: 'Pcs', sku_barcode: 'SHIRT-S', base_price: 100, purchase_price: 50, current_stock: 12, domain_attributes: JSON.stringify({ parent_product_id: 'shirt', variant_name: 'S' }) },
];
const prices: { product_id: string; pricing_tier_id: string; price: number | null }[] = [{ product_id: 'shirt-s', pricing_tier_id: 'wholesale', price: 80 }];
const bridge = new Proxy({}, { get: (_target, method: string) => {
  if (method.startsWith('on')) return () => () => {};
  return async (payload?: ProductWritePayload & { pricing?: typeof prices; key?: string }) => {
    if (method === 'dbGetProducts') return products.filter(product => !product.is_deleted);
    if (method === 'dbGetProductsCount') return products.length;
    if (method === 'dbGetProductPricing') return prices;
    if (method === 'dbGetPricingTiers') return [{ pricing_tier_id: 'wholesale', tenant_id: 'variant-test', name: 'Wholesale', is_active: 1, sort_order: 0 }];
    if (method === 'dbAddProduct' && payload) { products.push(payload); return { success: true }; }
    if (method === 'dbUpdateProduct' && payload) {
      const index = products.findIndex(product => product.product_id === payload.product_id);
      if (index >= 0) products[index] = payload;
      return { success: true };
    }
    if (method === 'dbSetProductPricing' && payload) {
      for (const price of payload.pricing || []) {
        const index = prices.findIndex(row => row.product_id === payload.product_id && row.pricing_tier_id === price.pricing_tier_id);
        const row = { ...price, product_id: String(payload.product_id) };
        if (index >= 0) prices[index] = row; else prices.push(row);
      }
      return { success: true };
    }
    if (method === 'settingsGet') return payload?.key === 'enable_real_paper_stock' ? false : null;
    if (/Get|get|List|list/.test(method)) return [];
    return { success: true };
  };
} });
Object.defineProperty(window, 'electronAPI', { value: bridge, configurable: true });
window.fetch = async () => { throw new Error('Network disabled in variant test shop'); };
useAuthStore.setState({ tenantId: 'variant-test', userId: 'test-owner', userName: 'Test owner', role: 'ADMIN', permissions: ['*'], isAuthenticated: true, isLoading: false });
useFeatureFlagsStore.setState({ flags: { inventory: true, pricing_tiers: true } as NonNullable<ReturnType<typeof useFeatureFlagsStore.getState>['flags']> });
export function Workspace() {
  const [page, setPage] = useState<'home' | 'inventory' | 'variants'>('home');
  if (page === 'inventory') return <InventoryManager onClose={() => setPage('home')} />;
  if (page === 'variants') return <VariantsManager onClose={() => setPage('home')} />;
  return <main className="p-10 space-y-5"><h1 className="text-xl font-bold">Variant regression test shop</h1>
    <p>In-memory products only. Saving here cannot affect a real shop.</p>
    <div className="flex gap-3"><button className="p-3 rounded-xl border" onClick={() => setPage('inventory')}>Inventory</button>
      <button className="p-3 rounded-xl border" onClick={() => setPage('variants')}>Product Variants</button></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Workspace />);
