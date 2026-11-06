import { useEffect, useState } from 'react';
import { Layers, Loader2, Save } from 'lucide-react';
import type { Product } from '../../../data/products';
import { listPricingTiers, type PricingTier } from '../../../data/pricingTiers';
import { getSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
import { hasPermission } from '../../../utils/security/permissions';
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape';
import { createVariantDraft, variantParentForm } from '../../inventory/variantDrafts';
import { loadProductVariants, saveProductVariants, validateVariants, type ProductVariantItem } from '../../inventory/variantProducts';
import { VariantsSection } from '../../inventory/views/form/VariantsSection';
import { Button } from '../../ui/Button';
import { RedCrossButton } from '../../ui/RedCrossButton';

/** Writes only the selected child; parent and sibling inventory are never saved here. */
export function VariantEditor({ parent, product, tenantId, onClose, onSaved }: {
  parent: Product; product?: Product; tenantId: string; onClose: () => void; onSaved: () => void;
}) {
  const user = useAuthStore();
  const [variants, setVariants] = useState<ProductVariantItem[]>([]);
  const [siblings, setSiblings] = useState<ProductVariantItem[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [paper, setPaper] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const form = variantParentForm(parent);
  useCloseOnEscape(busy ? null : onClose);
  useEffect(() => {
    let active = true;
    Promise.all([loadProductVariants(tenantId, parent.product_id), listPricingTiers(tenantId), getSetting<boolean>({ tenant_id: tenantId, key: 'enable_real_paper_stock' })])
      .then(([children, pricingTiers, setting]) => {
        if (!active) return;
        const existing = product ? children.find(child => child.product_id === product.product_id) : undefined;
        if (product && !existing) throw new Error('This variant is no longer available. Refresh the list.');
        setSiblings(children);
        setVariants([existing || createVariantDraft(variantParentForm(parent))]);
        setTiers(pricingTiers.filter(tier => [1, true, '1'].includes(tier.is_active ?? false) && !tier.is_deleted));
        setPaper(setting == null ? true : Boolean(setting));
        setError('');
      }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load variant.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, parent, product, attempt]);
  const save = async () => {
    if (busy || loading || !variants.length || !hasPermission(user, product ? 'products.edit' : 'products.create')) return;
    const validation = validateVariants([...siblings.filter(sibling => sibling.product_id !== variants[0].product_id), ...variants], parent.sku_barcode || '');
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try {
      await saveProductVariants({ ...parent, tenant_id: tenantId }, variants, (draftId, productId) => {
        setVariants(previous => previous.map(variant => variant.id === draftId ? { ...variant, product_id: productId } : variant));
      });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save variant.'); }
    finally { setBusy(false); }
  };
  return <div role="dialog" aria-modal="true" aria-labelledby="variant-editor-title" className="fixed inset-0 z-50 flex flex-col bg-background">
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3 min-w-0"><div className="p-2 rounded-xl bg-primary/10 text-primary"><Layers className="w-5 h-5" /></div>
        <div className="min-w-0"><h1 id="variant-editor-title" className="text-base font-bold">{product ? 'Edit Variant' : 'Add Variant'}</h1><p className="text-xs text-muted-foreground truncate">{parent.name}</p></div></div>
      <RedCrossButton onClick={() => { if (!busy) onClose(); }} title="Close variant editor" />
    </header>
    <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 space-y-3">
      {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 text-destructive p-3 text-sm">{error}
        {!variants.length && <Button variant="outline" className="ml-3" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Retry</Button>}</div>}
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Loading variant…</div> :
        <fieldset disabled={busy} className="min-w-0"><VariantsSection variants={variants} setVariants={setVariants} formData={form} activePricingTiers={tiers} enableRealPaperStock={paper} singleVariant /></fieldset>}
    </div>
    <footer className="flex justify-end gap-2 border-t border-border bg-card px-4 sm:px-6 py-3">
      <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button disabled={busy || loading || !variants.length} onClick={() => void save()}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{busy ? 'Saving…' : 'Save Variant'}</Button>
    </footer>
  </div>;
}
