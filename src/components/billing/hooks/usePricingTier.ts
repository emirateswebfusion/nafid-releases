import type * as B from '../billingTypes';
import React, { useCallback, useEffect } from 'react';
import { useCartStore } from '../../../store/cartStore';
import type { MatchedParty } from '../customerDirectory';


export interface UsePricingTierContext {
  findMatchingParty: (name?: string, phone?: string) => MatchedParty | null;
  pricingTiers: B.Tier[];
  productPricingMap: Record<string, Record<string, number>>;
  productPricingMapLoaded: boolean;
  selectedTierId: string;
  setSelectedTierId: React.Dispatch<React.SetStateAction<string>>;
  syncActiveSnapshot: () => void;
}

/**
 * Pricing tiers in billing: tier price lookup for a product, re-pricing the cart when the tier changes (also once the
 * per-product tier price map has loaded), and picking a matched party's tier (or the default tier) for a customer.
 */
export function usePricingTier(ctx: UsePricingTierContext) {
  const { findMatchingParty, pricingTiers, productPricingMap, productPricingMapLoaded, selectedTierId, setSelectedTierId, syncActiveSnapshot } = ctx;
  const getTierPriceForProduct = (product: Pick<B.BillingProduct, 'product_id' | 'tier_prices'>): number | undefined => {
    if (!selectedTierId || !product) return undefined;
    if (!pricingTiers.some(t => t.pricing_tier_id === selectedTierId)) return undefined;
    const v = productPricingMap[product.product_id]?.[selectedTierId]
      ?? product.tier_prices?.[selectedTierId];
    const price = Number(v);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  };

  const applyPricingTierToCart = useCallback((tierId: string) => {
    const tier = pricingTiers.find(t => t.pricing_tier_id === tierId);
    let itemsChanged = false;
    const nextItems = useCartStore.getState().items.map(item => {
      if (item.isScrap || item.isReturnItem || item.isCombo || item.isServiceItem || item.is_tier_overridden) {
        return item;
      }

      const tierPrice = Number(productPricingMap[item.product_id]?.[tierId]);
      const hasTierPrice = Boolean(tierId) && Number.isFinite(tierPrice) && tierPrice > 0;
      const originalPricingMode = item.original_pricing_mode ?? item.pricing_mode;
      const basePrice = hasTierPrice ? tierPrice : (item.original_base_price ?? item.base_price);
      const pricingMode = hasTierPrice ? 'FIXED_PRICE' : originalPricingMode;
      const tierName = tierId ? (tier?.name || null) : null;
      const originalGradeId = item.original_grade_id ?? item.grade_id ?? null;
      const originalGradeRate = item.original_grade_rate ?? item.grade_rate ?? null;
      const tierPriceStateIsCurrent = !hasTierPrice || (
        item.offer_price == null &&
        item.discount_percent == null &&
        item.discount_flat == null &&
        item.catalog_offer_price == null &&
        item.catalog_discount_percent == null &&
        item.catalog_discount_flat == null
      );

      if (
        item.base_price === basePrice &&
        item.pricing_mode === pricingMode &&
        item.pricing_tier_id === (tierId || null) &&
        item.pricing_tier_name === tierName &&
        item.original_pricing_mode === originalPricingMode &&
        item.original_grade_id === originalGradeId &&
        item.original_grade_rate === originalGradeRate &&
        tierPriceStateIsCurrent
      ) {
        return item;
      }

      itemsChanged = true;

      return {
        ...item,
        base_price: basePrice,
        pricing_mode: pricingMode,
        original_pricing_mode: originalPricingMode,
        original_grade_id: originalGradeId,
        original_grade_rate: originalGradeRate,
        pricing_tier_id: tierId || null,
        pricing_tier_name: tierName,
        ...(hasTierPrice ? {
          offer_price: null,
          discount_percent: null,
          discount_flat: null,
          catalog_offer_price: null,
          catalog_discount_percent: null,
          catalog_discount_flat: null,
        } : {}),
      };
    });
    if (itemsChanged) {
      useCartStore.setState({ items: nextItems });
      syncActiveSnapshot();
    }
  }, [pricingTiers, productPricingMap, syncActiveSnapshot]);

  const handlePricingTierChange = useCallback((tierId: string) => {
    setSelectedTierId(tierId);
    applyPricingTierToCart(tierId);
  }, [applyPricingTierToCart, setSelectedTierId]);

  useEffect(() => {
    if (productPricingMapLoaded) {
      applyPricingTierToCart(selectedTierId);
    }
  }, [productPricingMapLoaded, productPricingMap, selectedTierId, applyPricingTierToCart]);

  const applyPartyTier = (name: string, phone: string) => {
    const defaultTier = pricingTiers.find(t => t.is_default === 1 || t.is_default === true || t.is_default === '1');
    const defaultTierId = defaultTier ? defaultTier.pricing_tier_id : '';
    if (!name && !phone) {
      if (!selectedTierId) handlePricingTierChange(defaultTierId);
      return;
    }
    const match = findMatchingParty(name, phone);
    if (match?.pricing_tier_id && pricingTiers.some(t => t.pricing_tier_id === match.pricing_tier_id)) {
      handlePricingTierChange(match.pricing_tier_id);
    }
  };

  return { getTierPriceForProduct, handlePricingTierChange, applyPartyTier };
}
