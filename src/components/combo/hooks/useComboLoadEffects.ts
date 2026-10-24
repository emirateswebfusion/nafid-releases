import { useCallback, useEffect } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { combosApi } from '../../../data/combos';
import { productsApi } from '../../../data/products';
import type { ComboManagerState } from './useComboManagerState';

export interface UseComboLoadEffectsContext {
  cm: ComboManagerState;
  tenantId: string | null;
}

/** Combo screen effects: status toast auto-dismiss, combo loading and product search inside the editor modal. */
export function useComboLoadEffects(ctx: UseComboLoadEffectsContext) {
  const { tenantId } = ctx;
  const {
    statusMessage, setStatusMessage, setLoading, setCombos, searchQuery, productSearch, setProductResults,
    setSearchingProducts,
  } = ctx.cm;

  // Auto-dismiss status toast
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [statusMessage, setStatusMessage]);

  // Load combo offers
  const loadCombos = useCallback(async () => {
    if (!isDesktopRuntime() || !tenantId) return;
    setLoading(true);
    try {
      const res = await combosApi.getComboOffers({ tenant_id: tenantId, search: searchQuery });
      if (Array.isArray(res)) {
        setCombos(res);
      }
    } catch (err: any) {
      console.error('[ComboManager] Error loading combos:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, searchQuery, setCombos, setLoading]);

  useEffect(() => {
    loadCombos();
  }, [loadCombos]);

  // Product search inside combo editor modal
  useEffect(() => {
    if (!productSearch.trim() || !isDesktopRuntime() || !tenantId) {
      setProductResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const res = await productsApi.getProducts({
          tenant_id: tenantId,
          search: productSearch,
          limit: 12,
        });
        if (Array.isArray(res)) {
          setProductResults(res);
        }
      } catch (err) {
        console.error('[ComboManager] Product search error:', err);
      } finally {
        setSearchingProducts(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [productSearch, tenantId, setProductResults, setSearchingProducts]);
  return { loadCombos };
}
