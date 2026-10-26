import { MRP_TIER_ID, type PricingTier } from '../../utils/pricingTierHelper';
import type { Product as DataProduct } from '../../data/products';

/** Pricing tiers screen: default-tier rule, product row and memoized matrix row props. */
export const isTierDefault = (t?: PricingTier, allTiers: PricingTier[] = []): boolean => {
  if (!t) return false;
  if (t.is_mrp || t.pricing_tier_id === MRP_TIER_ID) {
    const hasCustomDefault = allTiers.some(other => !other.is_mrp && (other.is_default === 1 || other.is_default === true || other.is_default === '1'));
    return !hasCustomDefault;
  }
  return t.is_default === 1 || t.is_default === true || t.is_default === '1' || t.is_default === 'true';
};

export interface Product extends DataProduct {
}

export interface MatrixRowProps {
  index: number;
  product: Product;
  matrixTiers: PricingTier[];
  rowPrices: Record<string, string>;
  initPrices: Record<string, string>;
  operating: boolean;
  onPriceChange: (productId: string, tierId: string, value: string) => void;
  onSaveRow: (productId: string) => void;
}
