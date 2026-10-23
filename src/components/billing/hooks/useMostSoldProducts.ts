import React, { useEffect } from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { productsApi, listProducts } from '../../../data/products';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface UseMostSoldProductsContext {
  setMostSoldProducts: React.Dispatch<React.SetStateAction<unknown[]>>;
  tenantId: string | null;
  uiConfig: BillingUIConfig;
}

/** Loads the tenant's most sold products for the 3-column express layout (desktop only). */
export function useMostSoldProducts(ctx: UseMostSoldProductsContext) {
  const { setMostSoldProducts, tenantId, uiConfig } = ctx;
  // Fetch most sold products for 3-column express layout
  useEffect(() => {
    if (!isDesktopRuntime() || !tenantId) return;
    let cancelled = false;

    const fetchMostSold = async () => {
      try {
        if (hasBridge('dbGetProductSalesSummary')) {
          const summary = await productsApi.getProductSalesSummary({ tenant_id: tenantId || 'global' });
          if (!cancelled && Array.isArray(summary) && summary.length > 0) {
            const sorted = summary
              .filter((p: any) => Number(p.is_service_item) !== 1 && String(p.name || '').trim().toLowerCase() !== 'service charge')
              .sort((a: any, b: any) => ((Number(b.gst_qty || 0) + Number(b.bos_qty || 0)) - (Number(a.gst_qty || 0) + Number(a.bos_qty || 0))));
            if (sorted.length > 0) {
              setMostSoldProducts(sorted.slice(0, 30));
              return;
            }
          }
        }
        const prods = await listProducts({ tenant_id: tenantId, limit: 30 });
        if (!cancelled && Array.isArray(prods)) {
          setMostSoldProducts(prods.filter((p: any) => Number(p.is_service_item) !== 1 && String(p.name || '').trim().toLowerCase() !== 'service charge'));
        }
      } catch (err) {
        console.error('[BillingPage] Failed to fetch most sold products:', err);
      }
    };

    fetchMostSold();
    return () => { cancelled = true; };
  }, [tenantId, uiConfig.orientation, uiConfig.showQuickCategoryBar, setMostSoldProducts]);

}
