import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { listProducts, countProducts } from '../../../data/products';
import { toInventoryProducts } from '../inventoryUtils';
import { sortProductsBySearchPriority } from '../../../utils/productSort';
import type { InventoryState } from './useInventoryState';

export interface UseInventoryLoaderContext {
  filterDateEndRef: React.RefObject<string>;
  filterDateRef: React.RefObject<string>;
  hasMoreRef: React.RefObject<boolean>;
  isFetchingRef: React.RefObject<boolean>;
  lastFetchTimeRef: React.RefObject<number>;
  LIMIT: 50;
  offsetRef: React.RefObject<number>;
  searchQueryRef: React.RefObject<string>;
  sortByRef: React.RefObject<"name" | "created_at" | "updated_at" | "stock">;
  stockFilterRef: React.RefObject<"all" | "in_stock" | "low_stock" | "out_of_stock" | "no_barcode">;
  viewModeRef: React.RefObject<"estimate" | "gst" | "combined">;
  inv: InventoryState;
}

/**
 * Loads the product list page by page for the current filters and sort (`loadProducts`).
 */
export function useInventoryLoader(ctx: UseInventoryLoaderContext) {
  const { filterDateEndRef, filterDateRef, hasMoreRef, isFetchingRef, lastFetchTimeRef, LIMIT, offsetRef, searchQueryRef, sortByRef, stockFilterRef, viewModeRef } = ctx;
  const { setHasMore, setIsFetching, setOffset, setProducts, setTotalCount } = ctx.inv;
  const loadProducts = async (reset = false) => {
    // If not a reset (loading next page), guard against concurrent or rapid calls
    if (!reset) {
      if (isFetchingRef.current || !hasMoreRef.current) return;
      const now = Date.now();
      if (now - lastFetchTimeRef.current < 400) return;
      lastFetchTimeRef.current = now;
    }

    isFetchingRef.current = true;
    setIsFetching(true);

    try {
      if (isDesktopRuntime()) {
        const { tenantId } = useAuthStore.getState();
        // Always read the latest values from refs to avoid stale-closure bugs
        const currentSearch = searchQueryRef.current;
        const currentSortBy = sortByRef.current;
        const currentStockFilter = stockFilterRef.current;
        const currentFilterDate = filterDateRef.current;
        const currentFilterDateEnd = filterDateEndRef.current;
        const currentViewMode = viewModeRef.current;
        const isGstParam = currentViewMode === 'gst' ? true : currentViewMode === 'estimate' ? false : undefined;
        const currentOffset = reset ? 0 : offsetRef.current;

        const productsPromise = listProducts({
          tenant_id: tenantId || 'global',
          limit: LIMIT,
          offset: currentOffset,
          search: currentSearch,
          sortBy: currentSortBy,
          filterDate: currentFilterDate,
          filterDateEnd: currentFilterDateEnd,
          stockStatus: currentStockFilter,
          isGst: isGstParam
        }).then(toInventoryProducts);

        const countPromise = reset ? countProducts({
          tenant_id: tenantId || 'global',
          search: currentSearch,
          filterDate: currentFilterDate,
          filterDateEnd: currentFilterDateEnd,
          stockStatus: currentStockFilter,
          isGst: isGstParam
        }) : Promise.resolve(null);

        const [result, count] = await Promise.all([productsPromise, countPromise]);

        if (reset && count !== null) {
          setTotalCount(count);
        }

        if (Array.isArray(result)) {
          const sortedResult = currentSearch ? sortProductsBySearchPriority(result, currentSearch) : result;
          if (reset) {
            setProducts(sortedResult);
            const nextOffset = sortedResult.length;
            offsetRef.current = nextOffset;
            setOffset(nextOffset);
            const more = sortedResult.length === LIMIT;
            hasMoreRef.current = more;
            setHasMore(more);
          } else {
            setProducts(prev => {
              // filter out duplicates just in case
              const existingIds = new Set(prev.map(p => p.product_id));
              const newItems = sortedResult.filter(p => !existingIds.has(p.product_id));
              return [...prev, ...newItems];
            });
            const nextOffset = currentOffset + result.length;
            offsetRef.current = nextOffset;
            setOffset(nextOffset);
            const more = result.length === LIMIT;
            hasMoreRef.current = more;
            setHasMore(more);
          }
        }
      }
    } catch (err) {
      console.error('[InventoryManager] Failed to load products:', err);
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);
    }
  };

  return { loadProducts };
}
