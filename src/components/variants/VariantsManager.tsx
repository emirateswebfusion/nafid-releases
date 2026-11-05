import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers, Search, Plus, Trash2, Check, X, Loader2,
  Package, AlertTriangle, Barcode, RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { productsApi, type Product, createProduct, updateProduct, deleteProduct } from '../../data/products';
import { getCurrencyPrefix } from '../../utils/localization/storeProfile';
import { RedCrossButton } from '../ui/RedCrossButton';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

export interface VariantsManagerProps {
  onClose: () => void;
  enableRealPaperStock?: boolean;
  onOpenInventoryForm?: (productId?: string) => void;
}

interface ParentProductGroup {
  parent: Product;
  variants: Product[];
}

function parseDomainAttributes(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

let skuCounter = 100000;
function nextSkuBarcode(): string {
  skuCounter += 1;
  return `SKU-${skuCounter}`;
}

export function VariantsManager({ onClose, enableRealPaperStock = true, onOpenInventoryForm }: VariantsManagerProps) {
  const { tenantId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [addingVariantForParentId, setAddingVariantForParentId] = useState<string | null>(null);
  const [newVariantForm, setNewVariantForm] = useState({
    variant_name: '',
    sku_barcode: '',
    purchase_price: '',
    base_price: '',
    offer_price: '',
    current_stock: '0',
    paper_purchase_price: '',
    paper_mrp: '',
    paper_stock: '0',
  });
  const [isSavingNewVariant, setIsSavingNewVariant] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await productsApi.getProducts({ tenant_id: tenantId || 'global', limit: 1000 });
      if (Array.isArray(res)) {
        setProducts(res);
      }
    } catch (err) {
      console.error('Failed to load products for variants manager', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadData begins the initial variant products lookup on mount.
    void loadData(false);
  }, [loadData]);

  // Group products into parent products and their variants
  const groups: ParentProductGroup[] = useMemo(() => {
    const parentMap = new Map<string, ParentProductGroup>();
    const childVariants: Product[] = [];

    products.forEach(p => {
      const da = parseDomainAttributes(p.domain_attributes);

      if (da.parent_product_id) {
        childVariants.push(p);
      } else if (da.is_parent || da.has_variants) {
        parentMap.set(p.product_id, { parent: p, variants: [] });
      }
    });

    // Attach children to parents
    childVariants.forEach(child => {
      const da = parseDomainAttributes(child.domain_attributes);
      const parentId = String(da.parent_product_id || '');
      const group = parentMap.get(parentId);
      if (group) {
        group.variants.push(child);
      } else {
        const parentProd = products.find(p => p.product_id === parentId);
        if (parentProd) {
          parentMap.set(parentId, { parent: parentProd, variants: [child] });
        }
      }
    });

    return Array.from(parentMap.values());
  }, [products]);

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    groups.forEach(g => {
      if (g.parent.category) set.add(g.parent.category);
    });
    return Array.from(set);
  }, [groups]);

  // Filter groups by search query and category
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return groups.filter(g => {
      if (selectedCategory !== 'all' && g.parent.category !== selectedCategory) return false;
      if (!q) return true;
      const matchParent = g.parent.name.toLowerCase().includes(q) ||
                          Boolean(g.parent.brand_manufacturer && g.parent.brand_manufacturer.toLowerCase().includes(q));
      const matchChild = g.variants.some(v =>
        v.name.toLowerCase().includes(q) || Boolean(v.sku_barcode && v.sku_barcode.toLowerCase().includes(q))
      );
      return matchParent || matchChild;
    });
  }, [groups, searchQuery, selectedCategory]);

  const totalVariantCount = useMemo(() => {
    return groups.reduce((acc, g) => acc + g.variants.length, 0);
  }, [groups]);

  const lowStockCount = useMemo(() => {
    let count = 0;
    groups.forEach(g => {
      g.variants.forEach(v => {
        if (Number(v.current_stock || 0) <= Number(v.reorder_level || 0)) count++;
      });
    });
    return count;
  }, [groups]);

  const handleStartAddVariant = (parent: Product) => {
    const parentDa = parseDomainAttributes(parent.domain_attributes);

    setAddingVariantForParentId(parent.product_id);
    setNewVariantForm({
      variant_name: '',
      sku_barcode: nextSkuBarcode(),
      purchase_price: parent.purchase_price ? String(parent.purchase_price) : '',
      base_price: parent.base_price ? String(parent.base_price) : '',
      offer_price: parent.offer_price ? String(parent.offer_price) : '',
      current_stock: '0',
      paper_purchase_price: parent.gst_purchase_price ? String(parent.gst_purchase_price) : (parentDa.paper_purchase_price ? String(parentDa.paper_purchase_price) : ''),
      paper_mrp: parent.paper_mrp ? String(parent.paper_mrp) : (parentDa.paper_mrp ? String(parentDa.paper_mrp) : ''),
      paper_stock: '0',
    });
    setActionError(null);
  };

  const handleSaveNewVariant = async (parent: Product) => {
    const trimmedName = newVariantForm.variant_name.trim();
    if (!trimmedName) {
      setActionError('Variant name/size is required.');
      return;
    }
    setIsSavingNewVariant(true);
    setActionError(null);
    try {
      const childPayload = {
        product_id: uuidv4(),
        tenant_id: tenantId || 'global',
        name: `${parent.name} (${trimmedName})`,
        sku_barcode: newVariantForm.sku_barcode || nextSkuBarcode(),
        category: parent.category,
        brand_manufacturer: parent.brand_manufacturer,
        hsn_sac_code: parent.hsn_sac_code,
        is_gst_applicable: parent.is_gst_applicable,
        tax_rate_percent: parent.tax_rate_percent,
        uom: parent.uom || 'Pcs',
        purchase_price: Number(newVariantForm.purchase_price) || 0,
        base_price: Number(newVariantForm.base_price) || 0,
        offer_price: newVariantForm.offer_price ? Number(newVariantForm.offer_price) : null,
        current_stock: Number(newVariantForm.current_stock) || 0,
        domain_attributes: JSON.stringify({
          parent_product_id: parent.product_id,
          variant_name: trimmedName,
          paper_mrp: Number(newVariantForm.paper_mrp) || 0,
          paper_stock: Number(newVariantForm.paper_stock) || 0,
          paper_purchase_price: Number(newVariantForm.paper_purchase_price) || 0,
        }),
        sync_status: 'pending',
      };

      const res = await createProduct(childPayload);
      if (res.success) {
        const pDa = parseDomainAttributes(parent.domain_attributes);
        pDa.is_parent = true;
        pDa.has_variants = true;
        await updateProduct({ product_id: parent.product_id, domain_attributes: JSON.stringify(pDa) });

        setAddingVariantForParentId(null);
        await loadData(false);
      } else {
        setActionError(res.error || 'Failed to create variant');
      }
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setIsSavingNewVariant(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Are you sure you want to delete this variant?')) return;
    try {
      await deleteProduct(variantId);
      await loadData(false);
    } catch (err) {
      console.error('Failed to delete variant', err);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background select-none">
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500 shadow-inner shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-foreground">Product Variants Manager</h1>
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Manage size, pack, and color variants with independent stock &amp; pricing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all cursor-pointer"
              title="Refresh Variants"
            >
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin text-sky-500')} />
            </button>
            {onOpenInventoryForm && (
              <button
                type="button"
                onClick={() => onOpenInventoryForm()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:brightness-110 transition-all cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Product with Variants</span>
              </button>
            )}
            <RedCrossButton onClick={onClose} title="Close Variants Manager" />
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search parent product or variant barcode..."
              className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-sky-500 font-medium"
            />
          </div>

          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-sky-500 font-medium cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 text-xs ml-auto font-medium">
            <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              {groups.length} Products
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {totalVariantCount} SKUs
            </span>
            {lowStockCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {lowStockCount} Low Stock
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            <span className="text-sm font-medium">Loading product variants...</span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto space-y-4">
            <div className="p-4 rounded-3xl bg-muted/60 text-muted-foreground">
              <Package className="w-10 h-10 stroke-[1.5]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">No Product Variants Found</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery
                  ? 'No variant matched your search filter.'
                  : 'You have not added any product variants yet. When adding products in Inventory, expand the "Sizes & Pack Variants" section to create sizes or pack options.'}
              </p>
            </div>
            {onOpenInventoryForm && (
              <button
                type="button"
                onClick={() => onOpenInventoryForm()}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                + Go to Inventory &amp; Add Variants
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map(group => {
              const isAddingHere = addingVariantForParentId === group.parent.product_id;
              return (
                <div
                  key={group.parent.product_id}
                  className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden transition-all duration-200"
                >
                  {/* Parent Product Header */}
                  <div className="p-4 bg-muted/30 border-b border-border flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 font-black text-xs">
                        {group.parent.category || 'General'}
                      </div>
                      <div>
                        <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                          <span>{group.parent.name}</span>
                          {group.parent.brand_manufacturer && (
                            <span className="text-xs font-semibold text-muted-foreground">
                              ({group.parent.brand_manufacturer})
                            </span>
                          )}
                        </h2>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                          <span>Base MRP: {getCurrencyPrefix()}{Number(group.parent.base_price).toFixed(2)}</span>
                          <span>•</span>
                          <span>{group.variants.length} Variants</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartAddVariant(group.parent)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Size / Variant</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline Add Variant Form */}
                  {isAddingHere && (
                    <div className="p-4 bg-sky-500/5 border-b border-sky-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                          New Variant for {group.parent.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAddingVariantForParentId(null)}
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 text-xs">
                        <div>
                          <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Size / Name *</label>
                          <input
                            type="text"
                            value={newVariantForm.variant_name}
                            onChange={e => setNewVariantForm(f => ({ ...f, variant_name: e.target.value }))}
                            placeholder="e.g. S, XL, 500g"
                            className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-foreground focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Barcode / SKU</label>
                          <input
                            type="text"
                            value={newVariantForm.sku_barcode}
                            onChange={e => setNewVariantForm(f => ({ ...f, sku_barcode: e.target.value }))}
                            className="w-full bg-background border border-border rounded-lg p-2 text-xs font-mono text-foreground focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Real MRP ({getCurrencyPrefix()}) *</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newVariantForm.base_price}
                            onChange={e => setNewVariantForm(f => ({ ...f, base_price: e.target.value }))}
                            className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Offer Price ({getCurrencyPrefix()})</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newVariantForm.offer_price}
                            onChange={e => setNewVariantForm(f => ({ ...f, offer_price: e.target.value }))}
                            placeholder="Optional"
                            className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Real Stock</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newVariantForm.current_stock}
                            onChange={e => setNewVariantForm(f => ({ ...f, current_stock: e.target.value }))}
                            className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-foreground focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        {enableRealPaperStock && (
                          <div>
                            <label className="block text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Paper Stock</label>
                            <input
                              type="number"
                              step="0.01"
                              value={newVariantForm.paper_stock}
                              onChange={e => setNewVariantForm(f => ({ ...f, paper_stock: e.target.value }))}
                              className="w-full bg-background border border-border rounded-lg p-2 text-xs font-bold text-purple-600 dark:text-purple-400 focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        )}
                      </div>

                      {actionError && (
                        <p className="text-[11px] text-destructive font-semibold">{actionError}</p>
                      )}

                      <div className="flex items-center gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setAddingVariantForParentId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNewVariant(group.parent)}
                          disabled={isSavingNewVariant}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                        >
                          {isSavingNewVariant ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Variant</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Variants Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-black tracking-wider border-b border-border">
                          <th className="py-2.5 px-4 min-w-[100px]">Size / Variant</th>
                          <th className="py-2.5 px-4 min-w-[130px]">Barcode / SKU</th>
                          <th className="py-2.5 px-4 min-w-[90px]">Purchase ({getCurrencyPrefix()})</th>
                          <th className="py-2.5 px-4 min-w-[90px]">MRP ({getCurrencyPrefix()})</th>
                          <th className="py-2.5 px-4 min-w-[90px]">Offer ({getCurrencyPrefix()})</th>
                          <th className="py-2.5 px-4 min-w-[80px]">Real Stock</th>
                          {enableRealPaperStock && (
                            <>
                              <th className="py-2.5 px-4 min-w-[90px] bg-purple-500/5 text-purple-600 dark:text-purple-400">Paper MRP</th>
                              <th className="py-2.5 px-4 min-w-[80px] bg-purple-500/5 text-purple-600 dark:text-purple-400">Paper Stock</th>
                            </>
                          )}
                          <th className="py-2.5 px-4 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.variants.map(v => {
                          const da = parseDomainAttributes(v.domain_attributes);
                          const vName = String(da.variant_name || v.name.replace(`${group.parent.name} (`, '').replace(')', ''));
                          const isLowStock = Number(v.current_stock || 0) <= Number(v.reorder_level || 0);

                          return (
                            <tr key={v.product_id} className="hover:bg-muted/20 transition-colors">
                              <td className="py-2.5 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold border border-sky-500/20 text-xs">
                                  {vName}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-mono text-muted-foreground flex items-center gap-1.5">
                                <Barcode className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                <span>{v.sku_barcode || '—'}</span>
                              </td>
                              <td className="py-2.5 px-4">
                                {Number(v.purchase_price) > 0 ? `${getCurrencyPrefix()}${Number(v.purchase_price).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                                {getCurrencyPrefix()}{Number(v.base_price).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-sky-600 dark:text-sky-400">
                                {v.offer_price != null ? `${getCurrencyPrefix()}${Number(v.offer_price).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2.5 px-4">
                                <span
                                  className={clsx(
                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-xs',
                                    isLowStock
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                      : 'text-foreground'
                                  )}
                                >
                                  {Number(v.current_stock || 0)}
                                </span>
                              </td>
                              {enableRealPaperStock && (
                                <>
                                  <td className="py-2.5 px-4 bg-purple-500/5 text-purple-600 dark:text-purple-400 font-bold">
                                    {da.paper_mrp != null && Number(da.paper_mrp) > 0 ? `${getCurrencyPrefix()}${Number(da.paper_mrp).toFixed(2)}` : '—'}
                                  </td>
                                  <td className="py-2.5 px-4 bg-purple-500/5 text-purple-600 dark:text-purple-400 font-bold">
                                    {Number(da.paper_stock ?? v.paper_stock ?? 0)}
                                  </td>
                                </>
                              )}
                              <td className="py-2.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVariant(v.product_id)}
                                  className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                                  title="Delete Variant"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
