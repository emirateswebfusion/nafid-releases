import { useCallback, useEffect, useRef } from 'react';
import { pricingTiersApi } from '../../../data/pricingTiers';
import type { Product } from '../pricingTiersTypes';
import type { PricingTiersState } from './usePricingTiersState';

export interface UsePricingTierMatrixActionsContext {
  filteredProducts: Product[];
  modifiedProductIds: string[];
  tenantId: string | null;
  pt: PricingTiersState;
}

/** Price matrix editing: per-cell edits, progressive scroll loading, row / bulk save and reset. */
export function usePricingTierMatrixActions(ctx: UsePricingTierMatrixActionsContext) {
  const { filteredProducts, modifiedProductIds, tenantId } = ctx;
  const { initialPricingMap, pricingMap, searchQuery, setError, setInitialPricingMap, setOperating, setPricingMap, setStatusMessage, setVisibleCount, tierFilter } = ctx.pt;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handlePriceChange = useCallback((productId: string, tierId: string, value: string) => {
    setPricingMap(prev => ({ ...prev, [productId]: { ...(prev[productId] || {}), [tierId]: value } }));
  }, [setPricingMap]);

  // Reset pagination on search query change
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, tierFilter, setVisibleCount]);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setVisibleCount(prev => Math.min(prev + 50, filteredProducts.length));
    }
  }, [filteredProducts.length, setVisibleCount]);

  const saveProductRow = useCallback(async (productId: string) => {
    const current = pricingMap[productId] || {};
    const pricing = Object.entries(current).map(([tierId, val]) => ({
      pricing_tier_id: tierId,
      price: val === '' || isNaN(Number(val)) ? null : Number(val),
    }));
    setOperating(true);
    const res = await pricingTiersApi.setProductPricing({ tenant_id: tenantId || '', product_id: productId, pricing });
    if (res.success) {
      setStatusMessage({ text: 'Prices saved!', type: 'success' });
      setInitialPricingMap(prev => ({ ...prev, [productId]: { ...current } }));
    } else {
      setError(res.error || 'Failed to save');
    }
    setOperating(false);
  }, [pricingMap, tenantId, setError, setInitialPricingMap, setOperating, setStatusMessage]);

  const saveAllPrices = async () => {
    if (!modifiedProductIds.length) return;
    setOperating(true);
    let ok = 0; let fail = false;
    for (const pId of modifiedProductIds) {
      const current = pricingMap[pId] || {};
      const pricing = Object.entries(current).map(([tierId, val]) => ({
        pricing_tier_id: tierId,
        price: val === '' || isNaN(Number(val)) ? null : Number(val),
      }));
      const res = await pricingTiersApi.setProductPricing({ tenant_id: tenantId || '', product_id: pId, pricing });
      if (res.success) ok++;
      else fail = true;
    }
    if (!fail) {
      setStatusMessage({ text: `Saved prices for ${ok} product(s)!`, type: 'success' });
      setInitialPricingMap(pricingMap);
    } else {
      setError('Some prices could not be saved.');
    }
    setOperating(false);
  };

  const resetEdits = () => setPricingMap(initialPricingMap);

  return { handlePriceChange, handleScroll, resetEdits, saveAllPrices, saveProductRow, scrollContainerRef };
}
