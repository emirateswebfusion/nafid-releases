import { useShallow } from 'zustand/react/shallow';
import { useMemo, useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { deleteProduct, type Product } from '../../data/products';
import { hasPermission } from '../../utils/security/permissions';
import { variantAttributes } from '../inventory/variantProducts';
import { useVariantCatalog } from './hooks/useVariantCatalog';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { VariantEditor } from './views/VariantEditor';
import { VariantProductPicker } from './views/VariantProductPicker';
import { VariantsHeader } from './views/VariantsHeader';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FloatToast } from '../ui/FloatToast';
import { buildVariantRows, filterVariantRows } from './variantCatalog';
import { VariantPriceTable } from './views/VariantPriceTable';

/** Catalog-wide variants use the shared variant editor and persistence. */
export function VariantsManager({ onClose }: { onClose: () => void }) {
  const user = useAuthStore(useShallow(state => ({ tenantId: state.tenantId, role: state.role, permissions: state.permissions })));
  const { tenantId } = user;
  return <VariantsWorkspace key={tenantId || 'global'} tenantId={tenantId || 'global'} onClose={onClose} />;
}

function VariantsWorkspace({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { products, loading, error: catalogError, refresh } = useVariantCatalog(tenantId);
  const [actionError, setActionError] = useState('');
  const error = catalogError || actionError;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [variant, setVariant] = useState('');
  const [productId, setProductId] = useState('');
  const [editor, setEditor] = useState<{ parent: Product; product?: Product } | null>(null);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = useAuthStore(state => hasPermission(state, 'products.edit'));
  const canCreate = useAuthStore(state => hasPermission(state, 'products.create'));
  const canDelete = useAuthStore(state => hasPermission(state, 'products.delete'));
  const load = () => { setActionError(''); refresh(); };
  useCloseOnEscape(deleting && !busy ? () => setDeleting(null) : null);
  const rows = useMemo(() => buildVariantRows(products), [products]);
  const filtered = filterVariantRows(rows, search, category, variant, productId);
  const parents = [...new Map(rows.flatMap(row => row.parent ? [[row.parent.product_id, row.parent] as const] : [])).values()];
  const categories = [...new Set(rows.map(row => row.parent?.category || row.product.category).filter((value): value is string => Boolean(value)))].sort();
  const variantNames = [...new Map(rows.map(row => [row.name.toLowerCase(), row.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  const resetFilters = () => { setSearch(''); setCategory(''); setVariant(''); setProductId(''); };
  const remove = async () => {
    if (!deleting || !canDelete || busy) return;
    setBusy(true);
    try {
      const result = await deleteProduct(deleting.product_id);
      if (!result.success) throw new Error(result.error || 'Could not delete variant.');
      setDeleting(null);
      load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not delete variant.'); }
    finally { setBusy(false); }
  };
  const editVariant = (product: Product) => {
    const parentId = variantAttributes(product.domain_attributes).parent_product_id;
    const parent = products.find(candidate => candidate.product_id === parentId);
    if (parent) setEditor({ parent, product });
  };
  return <div className="fixed inset-0 z-40 flex flex-col bg-background">
    <VariantsHeader count={rows.length} loading={loading} canCreate={canCreate} search={search} category={category} productId={productId}
      parents={parents} categories={categories} onSearch={setSearch} onCategory={setCategory} onProduct={setProductId}
      onReset={resetFilters} onRefresh={() => void load()} onAdd={() => setPicking(true)} onClose={onClose} />
    {rows.length > 0 && <div className="flex shrink-0 gap-2 items-center overflow-x-auto border-b border-border bg-card px-4 sm:px-6 py-2" role="group" aria-label="Variant names">
      <Button size="sm" variant={variant === '' ? 'default' : 'outline'} aria-pressed={variant === ''} onClick={() => setVariant('')}>All variants <span className="ml-2 opacity-70">{rows.length}</span></Button>
      {variantNames.map(([key, label]) => <Button key={key} size="sm" variant={variant === key ? 'default' : 'outline'} aria-pressed={variant === key} onClick={() => setVariant(key)}>{label} <span className="ml-2 opacity-70">{rows.filter(row => row.name.toLowerCase() === key).length}</span></Button>)}
      {variant && <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>}
    </div>}
    <main className="flex-1 min-h-0 flex flex-col p-3 sm:p-4 gap-3">
      {error && <p role="alert" className="rounded-xl bg-destructive/10 text-destructive p-3 text-sm">{error}</p>}
      <div className="flex items-center justify-between text-xs text-muted-foreground" aria-live="polite"><span>{loading ? 'Loading catalog…' : `Showing ${filtered.length} of ${rows.length} variants`}</span><span>{parents.length} products · {variantNames.length} variant names</span></div>
      {loading ? <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 aria-label="Loading variants" className="w-5 h-5 animate-spin" />Loading variants…</div> : filtered.length === 0 ?
        <div className="flex flex-1 items-center justify-center p-6"><div className="max-w-md text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><Layers className="w-6 h-6" /></div>
          <h2 className="font-bold text-foreground">{error ? 'Could not load variants' : rows.length ? 'No matching variants' : 'No variants yet'}</h2>
          <p className="text-sm text-muted-foreground">{error ? 'Refresh the list to try again.' : rows.length ? 'Try another search or clear the filters to see all variants.' : 'Add sizes, packs or other options to an existing product. Their prices and stock will appear here.'}</p>
          {error ? <Button variant="outline" onClick={() => void load()}>Retry</Button> : rows.length ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : canCreate && <Button onClick={() => setPicking(true)}>Add your first variant</Button>}
        </div></div> : <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-border bg-card shadow-xs"><VariantPriceTable rows={filtered} canEdit={canEdit} canDelete={canDelete} onEdit={editVariant} onDelete={setDeleting} /></div>}
    </main>
    {picking && <VariantProductPicker products={products} onClose={() => setPicking(false)} onSelect={parent => { setPicking(false); setEditor({ parent }); }} />}
    {editor && <VariantEditor {...editor} tenantId={tenantId || 'global'} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setSaved(true); void load(); }} />}
    <FloatToast message={saved ? 'Variant saved successfully.' : null} onClose={() => setSaved(false)} />
    <Modal isOpen={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }} title="Delete Variant" className="max-w-md">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-variant-title" className="space-y-4">
        <h2 id="delete-variant-title" className="font-bold">Delete {deleting?.name}?</h2>
        <p className="text-sm text-muted-foreground">The variant will move to the recycle bin. Existing invoices remain available.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete Variant'}</Button>
        </div>
      </div>
    </Modal>
  </div>;
}
