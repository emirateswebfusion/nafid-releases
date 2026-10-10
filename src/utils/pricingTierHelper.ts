export interface PricingTier {
  pricing_tier_id: string;
  tenant_id?: string;
  name: string;
  is_active: number | boolean;
  sort_order: number;
  is_deleted?: number | boolean;
  is_default?: number | boolean | string;
  is_mrp?: boolean;
}

export const MRP_TIER_ID = '__mrp__';

/**
 * Combines custom pricing tiers with Base (MRP) pseudo-tier using mrp_sort_order.
 * Guarantees Base (MRP) is included at its assigned sort_order position.
 */
export function sortTiersWithMrp(dbTiers: any[], mrpSortOrder: number = 0): PricingTier[] {
  const list: PricingTier[] = Array.isArray(dbTiers) ? dbTiers.filter(t => !t.is_deleted).map(t => ({ ...t })) : [];

  const hasDefaultCustomTier = list.some(t => t.is_default === 1 || t.is_default === true || t.is_default === '1');

  const existingMrpIndex = list.findIndex(t => t.is_mrp || t.pricing_tier_id === '' || t.pricing_tier_id === MRP_TIER_ID);

  if (existingMrpIndex >= 0) {
    list[existingMrpIndex].is_mrp = true;
    list[existingMrpIndex].pricing_tier_id = MRP_TIER_ID;
    list[existingMrpIndex].name = list[existingMrpIndex].name || 'Base (MRP)';
    list[existingMrpIndex].sort_order = list[existingMrpIndex].sort_order ?? mrpSortOrder;
    if (!hasDefaultCustomTier && list[existingMrpIndex].is_default === undefined) {
      list[existingMrpIndex].is_default = true;
    }
  } else {
    const mrpTier: PricingTier = {
      pricing_tier_id: MRP_TIER_ID,
      tenant_id: 'global',
      name: 'Base (MRP)',
      is_active: 1,
      sort_order: mrpSortOrder,
      is_default: !hasDefaultCustomTier,
      is_mrp: true,
    };
    list.push(mrpTier);
  }

  return list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}
