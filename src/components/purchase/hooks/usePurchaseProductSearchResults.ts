import React, { useEffect } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { purchasesApi } from '../../../data/purchases';
import { cleanSearchText, sortProductsBySearchPriority } from '../../../utils/productSort';
import { type Product } from '../purchaseTypes';

export interface UsePurchaseProductSearchResultsContext {
  productSearch: string;
  setHighlightedProductIndex: React.Dispatch<React.SetStateAction<number>>;
  setIsSearchingProducts: React.Dispatch<React.SetStateAction<boolean>>;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  tenantId: string;
}

/**
 * Filters and ranks the product search results of the purchase form as the query changes.
 */
export function usePurchaseProductSearchResults(ctx: UsePurchaseProductSearchResultsContext) {
  const { productSearch, setHighlightedProductIndex, setIsSearchingProducts, setProducts, tenantId } = ctx;
  useEffect(() => {
    const query = productSearch.trim();
    if (!isDesktopRuntime() || !tenantId || !query) {
      setProducts([]);
      setHighlightedProductIndex(0);
      setIsSearchingProducts(false);
      return;
    }

    let isCurrentSearch = true;
    setIsSearchingProducts(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await purchasesApi.getPurchaseBillProducts({
          tenant_id: tenantId,
          search: query,
          limit: 500,
        });
        if (!isCurrentSearch) return;

        const rawProducts = Array.isArray(result) ? result : [];
        const q = query.toLowerCase();
        const qNoSpace = q.replace(/\s+/g, '');
        const qClean = cleanSearchText(q);
        const sortedProducts = sortProductsBySearchPriority(rawProducts, query);
        const matchedProducts = sortedProducts.filter(p => {
          const fields = [p.sku_barcode, p.item_code, p.name, p.brand_manufacturer, p.category, p.hsn_sac_code]
            .map(value => String(value || '').trim().toLowerCase());
          return fields.some(value => {
            const noSpace = value.replace(/\s+/g, '');
            const clean = cleanSearchText(value);
            return value.includes(q) || noSpace.includes(qNoSpace) || (qClean.length > 0 && clean.includes(qClean));
          });
        });

        const deduped: Product[] = [];
        let serviceChargeFound = false;
        for (const product of matchedProducts) {
          const isServiceCharge = Number(product.is_service_item) === 1 || String(product.name || '').trim().toLowerCase() === 'service charge';
          if (isServiceCharge) {
            if (serviceChargeFound) continue;
            serviceChargeFound = true;
          }
          deduped.push(product);
        }

        setProducts(deduped);
        setHighlightedProductIndex(0);
        setIsSearchingProducts(false);
      } catch (error) {
        if (isCurrentSearch) {
          console.error('[PurchaseBillManager] Product search error:', error);
          setProducts([]);
          setIsSearchingProducts(false);
        }
      }
    }, 150);

    return () => {
      isCurrentSearch = false;
      window.clearTimeout(timer);
    };
  }, [productSearch, tenantId, setHighlightedProductIndex, setIsSearchingProducts, setProducts]);

}
