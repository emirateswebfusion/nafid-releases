import { useShallow } from 'zustand/react/shallow';
import { useEffect, useState } from 'react';
import type { Product } from '../../../data/products';
import { listPricingTiers, type PricingTier } from '../../../data/pricingTiers';
import { getSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
import { hasPermission } from '../../../utils/security/permissions';
import { createVariantDraft, variantParentForm } from '../../inventory/variantDrafts';
import { loadProductVariants, saveProductVariants, validateVariants, type ProductVariantItem } from '../../inventory/variantProducts';

export function useVariantEditor(parent: Product, product: Product | undefined, tenantId: string, onSaved: () => void) {
  const user = useAuthStore(useShallow(state => ({ role: state.role, permissions: state.permissions })));
  const canSave = hasPermission(user, product ? 'products.edit' : 'products.create');
  const [variants, setVariants] = useState<ProductVariantItem[]>([]);
  const [siblings, setSiblings] = useState<ProductVariantItem[]>([]);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [paper, setPaper] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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
    if (busy || loading || !variants.length || !canSave) return;
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
  const retry = () => { setLoading(true); setAttempt(value => value + 1); };
  return { variants, setVariants, tiers, paper, loading, busy, error, canSave, retry, save };
}
