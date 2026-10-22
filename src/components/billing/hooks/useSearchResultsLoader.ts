import { useEffect } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { combosApi } from '../../../data/combos';
import { listInvoices } from '../../../data/invoices';
import { listProducts } from '../../../data/products';
import { returnsApi } from '../../../data/returns';
import { scrapApi } from '../../../data/scrap';
import { useAuthStore } from '../../../store/authStore';
import { buildProductSearchResults } from '../productSearch';
import type { ProductSearchState } from './useProductSearchState';

export interface SearchResultsLoaderInput {
  search: ProductSearchState;
  tenantId: string | null;
  invoiceType: string;
  isScrapMode: boolean;
  isReturnMode: boolean;
  isQuotationMode: boolean;
  enableRealPaperStock: boolean;
  showPaperInGstSetting: boolean;
  showPaperInEstSetting: boolean;
}

/**
 * Fills the billing search dropdown for what is typed: products and combos (normal mode), scrap categories
 * (scrap mode), past bills (past bill mode) or returnable invoices (return mode). Each lookup is debounced.
 */
export function useSearchResultsLoader({
  search, tenantId, invoiceType, isScrapMode, isReturnMode, isQuotationMode,
  enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting,
}: SearchResultsLoaderInput) {
  const {
    searchQuery, isPastBillMode, setResults, setIsProductSearching, setSelectedIndex,
    setScrapSearchResults, setPastBillResults, setReturnSearchResults,
  } = search;

  useEffect(() => {
    // In scrap mode, return mode, or past bill mode, or queries under 1 char, skip product search
    const trimmed = searchQuery.trim();
    if (isScrapMode || isReturnMode || isPastBillMode || trimmed.length < 1) {
      setResults([]);
      setIsProductSearching(false);
      return;
    }
    setIsProductSearching(true);
    let isCurrent = true;
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) {
        setIsProductSearching(false);
        return;
      }
      const { tenantId } = useAuthStore.getState();
      // GST invoices: only show GST-applicable products (quotations stay unfiltered)
      const isGstFilter = !isQuotationMode && invoiceType === 'GST';
      // Fetch up to 200 results so numeric or text searches capture all matching items without UI lag
      const fetchLimit = 200;

      const backendSearch = trimmed;

      try {
        const [products, combos] = await Promise.all([
          listProducts({ tenant_id: tenantId, search: backendSearch, limit: fetchLimit, ...(isGstFilter ? { isGst: 1 } : {}) }),
          combosApi.getComboOffers({ tenant_id: tenantId, search: trimmed, only_active: true }),
        ]);

        if (!isCurrent) return;

        const rows = buildProductSearchResults(products, combos, trimmed, { invoiceType, enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting });

        if (!isCurrent) return;
        setResults(rows);
        setSelectedIndex(0);
      } catch (err) {
        if (!isCurrent) return;
        console.error('[BillingPage] Product search error:', err);
      } finally {
        if (isCurrent) setIsProductSearching(false);
      }
    }, 120);
    return () => {
      isCurrent = false;
      clearTimeout(t);
    };
  }, [searchQuery, isScrapMode, isReturnMode, isPastBillMode, invoiceType, isQuotationMode, enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting, setResults, setIsProductSearching, setSelectedIndex]);

  // Scrap category search (when scrap mode active - categories ARE items)
  useEffect(() => {
    if (!isScrapMode || searchQuery.length < 2) { setScrapSearchResults([]); return; }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const { tenantId } = useAuthStore.getState();
      const cats = await scrapApi.getScrapCategoriesBySearch({ tenant_id: tenantId || '', search: searchQuery });
      if (Array.isArray(cats)) {
        setScrapSearchResults(cats);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery, isScrapMode, setScrapSearchResults]);

  // Past bill search (when past bill mode active)
  useEffect(() => {
    if (!isPastBillMode || searchQuery.length < 2) { setPastBillResults([]); return; }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const tid = tenantId || 'global';
      const invoices = await listInvoices({
        tenant_id: tid,
        search: searchQuery.trim(),
        limit: 10,
      });
      if (Array.isArray(invoices)) {
        setPastBillResults(invoices);
        setSelectedIndex(0);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, isPastBillMode, tenantId, setPastBillResults, setSelectedIndex]);

  // Invoice search for Return Mode — feeds main search dropdown
  useEffect(() => {
    if (!isReturnMode || searchQuery.length < 2) { setReturnSearchResults([]); return; }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const tid = tenantId || 'global';
      const invoices = await returnsApi.getReturnableInvoices({
        tenant_id: tid,
        search: searchQuery.trim(),
        limit: 10,
      });
      if (Array.isArray(invoices)) {
        setReturnSearchResults(invoices);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, isReturnMode, tenantId, setReturnSearchResults]);
}
