import { api, bindBridge } from './client';
import type { PricingTiersRow } from './dbRows';

/** A pricing tier as stored (`pricing_tiers`). Flag columns may hold booleans / strings written by older terminals. */
export interface PricingTier extends Omit<PricingTiersRow, 'is_active' | 'is_default' | 'is_deleted'> {
  is_active: number | boolean | string | null;
  is_default: number | boolean | string | null;
  is_deleted: number | boolean | null;
}

export async function listPricingTiers(tenantId: string): Promise<PricingTier[]> {
  return (await api().dbGetPricingTiers(tenantId)) as PricingTier[];
}

/** Pricing tiers and per-product tier prices. Channel catalog — the only way UI code reaches these IPC channels. */
export const pricingTiersApi = bindBridge({
  getPricingTiers: 'dbGetPricingTiers',
  addPricingTier: 'dbAddPricingTier',
  updatePricingTier: 'dbUpdatePricingTier',
  deletePricingTier: 'dbDeletePricingTier',
  reorderPricingTiers: 'dbReorderPricingTiers',
  setDefaultPricingTier: 'dbSetDefaultPricingTier',
  getProductPricing: 'dbGetProductPricing',
  setProductPricing: 'dbSetProductPricing',
  setTierPricing: 'dbSetTierPricing',
});
