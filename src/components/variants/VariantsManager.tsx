import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Search, Plus, Pencil, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { deleteProduct, type Product } from '../../data/products';
import { hasPermission } from '../../utils/security/permissions';
import { formatCurrency } from '../../utils/pricing/money';
import { loadVariantCatalog, variantAttributes } from '../inventory/variantProducts';
import { InventoryManager } from '../inventory/InventoryManager';
import { Modal } from '../ui/Modal';
import { RedCrossButton } from '../ui/RedCrossButton';

/** Catalog-wide management uses the canonical product form for every write. */
export function VariantsManager({ onClose }: { onClose: () => void }) {
  const user = useAuthStore();
  const { tenantId } = user;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editor, setEditor] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = hasPermission(user, 'products.edit');
  const canCreate = hasPermission(user, 'products.create');
  const canDelete = hasPermission(user, 'products.delete');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setProducts(await loadVariantCatalog(tenantId || 'global')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load variants.'); }
    finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial catalog read.
    void load();
  }, [load]);
  const groups = useMemo(() => {
    const children = new Map<string, Product[]>();
    for (const product of products) {
      const parent = variantAttributes(product.domain_attributes).parent_product_id;
      if (typeof parent === 'string') children.set(parent, [...(children.get(parent) || []), product]);
    }
    return products.filter(product => children.has(product.product_id)).map(parent => ({ parent, variants: children.get(parent.product_id) || [] }));
  }, [products]);
  const filtered = groups.filter(group => (!category || group.parent.category === category) &&
    [group.parent, ...group.variants].some(product => `${product.name} ${product.sku_barcode || ''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const categories = [...new Set(groups.map(group => group.parent.category).filter(Boolean))];
  const remove = async () => {
    if (!deleting || !canDelete || busy) return;
    setBusy(true);
    try {
      const result = await deleteProduct(deleting.product_id);
      if (!result.success) throw new Error(result.error || 'Could not delete variant.');
      setDeleting(null);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete variant.'); }
    finally { setBusy(false); }
  };
  if (editor !== undefined) return <InventoryManager initialProduct={editor} onClose={() => { setEditor(undefined); void load(); }} />;
  return <div className="fixed inset-0 z-40 flex flex-col bg-background">
    <header className="border-b border-border bg-card px-6 py-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-primary/10 text-primary"><Layers className="w-5 h-5" /></div>
          <div><h1 className="text-base font-bold">Product Variants</h1><p className="text-xs text-muted-foreground">Manage sizes and packs with their own prices, stock and pricing tiers.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Refresh variants" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg hover:bg-muted"><RefreshCw className="w-4 h-4" /></button>
          {canCreate && <button type="button" onClick={() => setEditor(null)} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-bold"><Plus className="w-4 h-4" />Add Product</button>}
          <RedCrossButton onClick={onClose} title="Close Product Variants" />
        </div>
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" /><input aria-label="Search variants" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, variant or barcode" className="w-full rounded-xl bg-background border border-border pl-9 pr-3 py-2 text-sm" /></div>
        <select aria-label="Filter variant category" value={category} onChange={event => setCategory(event.target.value)} className="rounded-xl bg-background border border-border px-3 py-2 text-sm"><option value="">All categories</option>{categories.map(value => <option key={value} value={value || ''}>{value}</option>)}</select>
        <span className="text-xs text-muted-foreground">{groups.length} products · {groups.reduce((sum, group) => sum + group.variants.length, 0)} variants</span>
      </div>
    </header>
    <main className="flex-1 overflow-auto p-6 space-y-4">
      {error && <p role="alert" className="rounded-xl bg-destructive/10 text-destructive p-3 text-sm">{error}</p>}
      {loading ? <Loader2 aria-label="Loading variants" className="mx-auto my-12 w-6 h-6 animate-spin" /> : filtered.length === 0 ? <div className="text-center rounded-2xl border border-dashed border-border p-12 text-muted-foreground"><h2 className="font-bold">{groups.length ? 'No matching variants' : 'No product variants yet'}</h2><p className="text-sm mt-2">Open a product and choose Add Variant below Inventory &amp; Pricing.</p></div> : filtered.map(group => <section key={group.parent.product_id} className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 bg-muted/30 border-b border-border"><div><h2 className="font-bold text-sm">{group.parent.name}</h2><p className="text-xs text-muted-foreground">{group.parent.category || 'Uncategorized'} · {group.variants.length} variants</p></div>
          {canEdit && <button type="button" onClick={() => setEditor(group.parent)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold"><Pencil className="w-3.5 h-3.5" />Manage Variants &amp; Prices</button>}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-xs text-muted-foreground bg-muted/10"><tr>{['Variant', 'Barcode', 'Purchase', 'MRP', 'Selling price', 'Stock', 'Actions'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
          <tbody>{group.variants.map(variant => <tr key={variant.product_id} className="border-t border-border hover:bg-muted/20"><td className="px-4 py-3 font-semibold">{String(variantAttributes(variant.domain_attributes).variant_name || variant.name)}</td><td className="px-4 py-3 font-mono text-xs">{variant.sku_barcode}</td><td className="px-4 py-3">{formatCurrency(variant.purchase_price || 0)}</td><td className="px-4 py-3">{formatCurrency(variant.base_price || 0)}</td><td className="px-4 py-3">{formatCurrency(variant.offer_price ?? variant.base_price ?? 0)}</td><td className="px-4 py-3">{variant.current_stock} {variant.uom}</td><td className="px-4 py-3">{canDelete && <button type="button" aria-label={`Delete ${variant.name}`} onClick={() => setDeleting(variant)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>}</td></tr>)}</tbody>
        </table></div>
      </section>)}
    </main>
    <Modal isOpen={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }} title="Delete Variant" className="max-w-md">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-variant-title" className="space-y-4">
        <h2 id="delete-variant-title" className="font-bold">Delete {deleting?.name}?</h2>
        <p className="text-sm text-muted-foreground">The variant will move to the recycle bin. Existing invoices remain available.</p>
        <div className="flex justify-end gap-2">
          <button disabled={busy} onClick={() => setDeleting(null)} className="px-3 py-2 rounded-xl border border-border">Cancel</button>
          <button disabled={busy} onClick={() => void remove()} className="px-3 py-2 rounded-xl bg-destructive text-destructive-foreground">{busy ? 'Deleting…' : 'Delete Variant'}</button>
        </div>
      </div>
    </Modal>
  </div>;
}
