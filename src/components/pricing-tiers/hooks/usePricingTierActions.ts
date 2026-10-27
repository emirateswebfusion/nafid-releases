import { type RefObject } from 'react';
import { MRP_TIER_ID, type PricingTier } from '../../../utils/pricing/pricingTierHelper';
import { isTierDefault } from '../pricingTiersTypes';
import { pricingTiersApi } from '../../../data/pricingTiers';
import { settingsApi } from '../../../data/settings';
import type { PricingTiersState } from './usePricingTiersState';

export interface UsePricingTierActionsContext {
  loadData: (showFullLoading?: boolean) => Promise<void>;
  newNameRef: RefObject<HTMLInputElement | null>;
  tenantId: string | null;
  pt: PricingTiersState;
}

/** Tier actions: create, rename, enable / disable, delete, set default, drag reorder and the staff price-override switch. */
export function usePricingTierActions(ctx: UsePricingTierActionsContext) {
  const { loadData, newNameRef, tenantId } = ctx;
  const { editName, newName, setAllowBillerOverride, setConfirmDeleteId, setEditingId, setError, setNewName, setOperating, setStatusMessage, setTiers, tiers } = ctx.pt;
  const handleAddTier = async () => {
    if (!newName.trim()) return;
    setOperating(true);
    const res = await pricingTiersApi.addPricingTier({
      pricing_tier_id: crypto.randomUUID(),
      tenant_id: tenantId || 'global',
      name: newName.trim(),
      is_active: true,
      sort_order: tiers.length,
    });
    if (res.success) {
      setNewName('');
      setStatusMessage({ text: `Tier "${newName.trim()}" created!`, type: 'success' });
      await loadData(false);
      setTimeout(() => newNameRef.current?.focus(), 100);
    } else {
      setError(res.error || 'Failed to create tier');
    }
    setOperating(false);
  };

  const handleRenameTier = async (tier: PricingTier) => {
    if (!editName.trim() || tier.is_mrp) return;
    setOperating(true);
    const res = await pricingTiersApi.updatePricingTier({ ...tier, name: editName.trim() });
    if (res.success) {
      setEditingId(null);
      setStatusMessage({ text: 'Tier renamed!', type: 'success' });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to rename tier');
    }
    setOperating(false);
  };

  const toggleActive = async (tier: PricingTier) => {
    if (tier.is_mrp) return;
    setOperating(true);
    const next = !tier.is_active;
    const res = await pricingTiersApi.updatePricingTier({ ...tier, is_active: next });
    if (res.success) {
      setStatusMessage({ text: `"${tier.name}" turned ${next ? 'ON' : 'OFF'}`, type: 'success' });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to update status');
    }
    setOperating(false);
  };

  const handleDeleteTier = async (tier: PricingTier) => {
    if (tier.is_mrp) return;
    setOperating(true);
    const res = await pricingTiersApi.deletePricingTier(tier.pricing_tier_id);
    if (res.success) {
      setConfirmDeleteId(null);
      setStatusMessage({ text: `"${tier.name}" deleted!`, type: 'success' });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to delete tier');
    }
    setOperating(false);
  };

  const handleSetDefaultTier = async (tier: PricingTier) => {
    setOperating(true);
    const isAlreadyDefault = isTierDefault(tier, tiers);
    const targetId = (isAlreadyDefault || tier.is_mrp) ? '' : tier.pricing_tier_id;
    const res = await pricingTiersApi.setDefaultPricingTier({
      tenant_id: tenantId || 'global',
      pricing_tier_id: targetId,
    });
    if (res.success) {
      setStatusMessage({
        text: targetId ? `"${tier.name}" set as default viewing tier in Billing` : 'Default pricing tier unset (Base MRP selected)',
        type: 'success',
      });
      await loadData(false);
    } else {
      setError(res.error || 'Failed to set default tier');
    }
    setOperating(false);
  };

  const reorderTier = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= tiers.length || toIndex >= tiers.length) return;
    const reordered = [...tiers];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const dbPayload: Array<{ pricing_tier_id: string; sort_order: number }> = [];
    let newMrpSort = 0;

    const updated = reordered.map((t, i) => {
      const item = { ...t, sort_order: i };
      if (item.is_mrp || item.pricing_tier_id === MRP_TIER_ID) {
        newMrpSort = i;
      } else {
        dbPayload.push({ pricing_tier_id: item.pricing_tier_id, sort_order: i });
      }
      return item;
    });

    setTiers(updated);
    setOperating(true);
    try {
      await Promise.all([
        pricingTiersApi.reorderPricingTiers(dbPayload),
        settingsApi.set({ tenant_id: tenantId || 'global', key: 'mrp_sort_order', value: newMrpSort }),
      ]);
    } catch (e) {
      console.error('[PricingTiers] drag reorder error', e);
    } finally {
      setOperating(false);
    }
  };

  const toggleOverride = async (value: boolean) => {
    setAllowBillerOverride(value);
    await settingsApi.set({ tenant_id: tenantId || 'global', key: 'allow_biller_price_override', value });
    setStatusMessage({ text: `Staff price override ${value ? 'enabled' : 'disabled'}`, type: 'success' });
  };

  return { handleAddTier, handleDeleteTier, handleRenameTier, handleSetDefaultTier, reorderTier, toggleActive, toggleOverride };
}
