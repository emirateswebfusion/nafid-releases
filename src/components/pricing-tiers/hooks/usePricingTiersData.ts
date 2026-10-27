import { useEffect } from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { bridgeEvents } from '../../../data/events';
import { pricingTiersApi } from '../../../data/pricingTiers';
import { productsApi } from '../../../data/products';
import { settingsApi } from '../../../data/settings';
import { sortTiersWithMrp } from '../../../utils/pricing/pricingTierHelper';
import type { PricingTiersState } from './usePricingTiersState';

export interface UsePricingTiersDataContext {
  tenantId: string | null;
  pt: PricingTiersState;
}

/** Status toast auto-dismiss, initial / sync-driven data loading, and the tiers, products and pricing loader. */
export function usePricingTiersData(ctx: UsePricingTiersDataContext) {
  const { tenantId } = ctx;
  const { setAllowBillerOverride, setError, setInitialPricingMap, setLoading, setPricingMap, setProducts, setStatusMessage, setTiers, statusMessage } = ctx.pt;
  const loadData = async (showFullLoading = true) => {
    if (!isDesktopRuntime()) {
      setLoading(false);
      return;
    }
    if (showFullLoading) setLoading(true);
    setError(null);
    try {
      const tid = tenantId || 'global';
      const [tierRes, productRes, pricingRes, overrideRes, mrpSortRes] = await Promise.all([
        pricingTiersApi.getPricingTiers(tid),
        productsApi.getProducts({ tenant_id: tid, include_inactive: true }),
        hasBridge('dbGetProductPricing') ? pricingTiersApi.getProductPricing(tid) : Promise.resolve([]),
        settingsApi.get({ tenant_id: tid, key: 'allow_biller_price_override' }),
        settingsApi.get({ tenant_id: tid, key: 'mrp_sort_order' }),
      ]);

      const mrpSortOrder = (mrpSortRes !== null && mrpSortRes !== undefined && !isNaN(Number(mrpSortRes))) ? Number(mrpSortRes) : 0;

      if (Array.isArray(tierRes)) {
        setTiers(sortTiersWithMrp(tierRes, mrpSortOrder));
      } else if (tierRes && (tierRes as { error?: string }).error) {
        setError((tierRes as { error?: string }).error || 'Failed to load pricing tiers');
      }

      if (Array.isArray(productRes)) {
        setProducts(productRes.filter((p) => !p.is_deleted));
      } else if (productRes && (productRes as { error?: string }).error) {
        setError((productRes as { error?: string }).error || 'Failed to load products');
      }

      const map: Record<string, Record<string, string>> = {};
      if (Array.isArray(pricingRes)) {
        for (const row of pricingRes) {
          if (!map[row.product_id]) map[row.product_id] = {};
          map[row.product_id][row.pricing_tier_id] = (row.price === null || row.price === undefined) ? '' : String(row.price);
        }
      } else if (pricingRes && (pricingRes as { error?: string }).error) {
        setError((pricingRes as { error?: string }).error || 'Failed to load product pricing');
      }
      setPricingMap(map);
      setInitialPricingMap(map);
      setAllowBillerOverride(overrideRes === null || overrideRes === undefined ? true : !!overrideRes);
    } catch (e) {
      console.error('[PricingTiers] load failed', e);
      setError('Failed to load pricing data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 3000);
    return () => clearTimeout(t);
  }, [statusMessage, setStatusMessage]);

  useEffect(() => {
    loadData(true);
    if (!hasBridge('onSyncDataUpdated')) return;
    const unsub = bridgeEvents.onSyncDataUpdated(() => {
      loadData(false);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData excluded: initial and sync reloads remain attached to the original tenantId trigger.
  }, [tenantId]);

  return { loadData };
}
