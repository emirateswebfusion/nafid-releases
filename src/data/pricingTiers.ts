import { api, bindBridge } from './client';

export interface PricingTier {
  pricing_tier_id: string;
  tenant_id?: string;
  name: string;
  is_active?: number | boolean | string | null;
  is_deleted?: number | null;
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
