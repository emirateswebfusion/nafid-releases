import React, { useEffect } from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { getSetting } from '../../../data/settings';
import { bridgeEvents } from '../../../data/events';
import { type CodeType } from '../../../labelCodeTypes';
import { listGrades } from '../../../data/grades';
import { listPricingTiers } from '../../../data/pricingTiers';
import { listParties } from '../../../data/parties';
import { purchasesApi } from '../../../data/purchases';
import QRCode from 'qrcode';
import { useAuthStore } from '../../../store/authStore';
import { toInventoryProducts } from '../inventoryHelpers';
import { listProducts } from '../../../data/products';
import type { InventoryState } from './useInventoryState';

export interface UseInventoryEffectsContext {
  categoryContainerRef: React.RefObject<HTMLDivElement | null>;
  filterDateEndRef: React.RefObject<string>;
  filterDateRef: React.RefObject<string>;
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  hasMoreRef: React.RefObject<boolean>;
  isFetchingRef: React.RefObject<boolean>;
  lastInteractedProductId: React.RefObject<string | null>;
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  loadProducts: (reset?: boolean) => Promise<void>;
  nameContainerRef: React.RefObject<HTMLDivElement | null>;
  nameSearchTimeout: React.RefObject<NodeJS.Timeout | null>;
  offsetRef: React.RefObject<number>;
  openAdd: () => Promise<void>;
  refreshProductPricing: () => Promise<void>;
  savedScrollTop: React.RefObject<number>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQueryRef: React.RefObject<string>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  sortByRef: React.RefObject<"name" | "created_at" | "updated_at" | "stock">;
  stockFilterRef: React.RefObject<"all" | "in_stock" | "low_stock" | "out_of_stock" | "no_barcode">;
  tenantId: string | null;
  viewModeRef: React.RefObject<"estimate" | "gst" | "combined">;
  inv: InventoryState;
}

/**
 * All of the inventory screen's effects, in their original order: settings and data loading, filter refs, list
 * reloads on filter changes, scroll restore, pricing refresh, form focus and the name / category suggestion boxes.
 */
export function useInventoryEffects(ctx: UseInventoryEffectsContext) {
  const { categoryContainerRef, filterDateEndRef, filterDateRef, firstInputRef, hasMoreRef, isFetchingRef, lastInteractedProductId, listScrollRef, loadProducts, nameContainerRef, nameSearchTimeout, offsetRef, openAdd, refreshProductPricing, savedScrollTop, searchInputRef, searchQueryRef, sentinelRef, sortByRef, stockFilterRef, tenantId, viewModeRef } = ctx;
  const { debouncedSearchQuery, filterDate, filterDateEnd, formData, hasMore, labelCodeType, offset, searchQuery, setDebouncedSearchQuery, setEnableRealPaperStock, setFormData, setGrades, setHasMore, setHighlightedProductId, setIsSearching, setLabelCodeType, setNameSuggestions, setOffset, setPriceCoding, setPricingTiers, setQrPreviewUrl, setSelectedNameIndex, setShowCategorySuggestions, setShowPaperOnlyProducts, setShowPriceTiersInInventory, setShowProductGstBadge, setShowZeroPaperStock, setStatusMessage, setSuppliers, setViewMode, sortBy, statusMessage, stockFilter, view, viewMode } = ctx.inv;
  useEffect(() => {
    const loadSettings = () => {
      if (isDesktopRuntime()) {
        getSetting<boolean>({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock' }).then(val => {
          if (val !== null && val !== undefined) setEnableRealPaperStock(Boolean(val));
        }).catch(() => {});
        getSetting<boolean>({ tenant_id: tenantId || 'global', key: 'show_zero_paper_stock' }).then(val => {
          if (val !== null && val !== undefined) setShowZeroPaperStock(Boolean(val));
        }).catch(() => {});
        getSetting<boolean>({ tenant_id: tenantId || 'global', key: 'show_paper_only_products' }).then(val => {
          if (val !== null && val !== undefined) setShowPaperOnlyProducts(Boolean(val));
        }).catch(() => {});
        getSetting<boolean | string>({ tenant_id: tenantId || 'global', key: 'show_product_gst_badge' }).then(val => {
          if (val === 'false' || val === false) setShowProductGstBadge(false);
          else setShowProductGstBadge(true);
        }).catch(() => {});
        getSetting<boolean | string>({ tenant_id: tenantId || 'global', key: 'show_price_tiers_in_inventory' }).then(val => {
          if (val === 'false' || val === false) setShowPriceTiersInInventory(false);
          else setShowPriceTiersInInventory(true);
        }).catch(() => {});
      }
    };
    loadSettings();
    window.addEventListener('settings:updated', loadSettings);
    return () => window.removeEventListener('settings:updated', loadSettings);
  }, [tenantId, setEnableRealPaperStock, setShowPaperOnlyProducts, setShowPriceTiersInInventory, setShowProductGstBadge, setShowZeroPaperStock]);

  // Debounce searchQuery -> debouncedSearchQuery with 0ms instant clear
  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setIsSearching(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery, setDebouncedSearchQuery, setIsSearching]);

  useEffect(() => { searchQueryRef.current = debouncedSearchQuery; }, [debouncedSearchQuery, searchQueryRef]);

  useEffect(() => { sortByRef.current = sortBy; }, [sortBy, sortByRef]);

  useEffect(() => { stockFilterRef.current = stockFilter; }, [stockFilter, stockFilterRef]);

  useEffect(() => { filterDateRef.current = filterDate; }, [filterDate, filterDateRef]);

  useEffect(() => { filterDateEndRef.current = filterDateEnd; }, [filterDateEnd, filterDateEndRef]);

  useEffect(() => { offsetRef.current = offset; }, [offset, offsetRef]);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore, hasMoreRef]);

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode, viewModeRef]);

  // Focus search input on open / view switch
  useEffect(() => {
    if (view === 'list') {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [view, searchInputRef]);

  // Load products when debounced search or sort or stock filter or viewMode changes (reset)
  useEffect(() => {
    offsetRef.current = 0;
    setOffset(0);
    hasMoreRef.current = true;
    setHasMore(true);
    loadProducts(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProducts is a new function each render; this runs only on the listed triggers (unchanged by moving it into useInventoryLoader)
  }, [debouncedSearchQuery, sortBy, filterDate, filterDateEnd, stockFilter, viewMode, setHasMore, setOffset]);

  // Sync listener — auto-refresh silently, using refs so current search/
  // filter state is preserved even though this effect runs only once.
  useEffect(() => {
    if (isDesktopRuntime()) {
      const unsub = bridgeEvents.onSyncDataUpdated(() => {
        console.log('[InventoryManager] Data updated via sync. Auto-refreshing...');
        loadProducts(true);
      });
      return () => unsub?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProducts is a new function each render; this runs only on the listed triggers (unchanged by moving it into useInventoryLoader)
  }, []);

  // Auto-hide toast/status messages
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(t);
  }, [statusMessage, setStatusMessage]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === ' ' && view === 'list') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !isEditable) {
          e.preventDefault();
          openAdd();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view]);

  // Restore scroll position and highlight product row when returning to list
  useEffect(() => {
    if (view === 'list' && (lastInteractedProductId.current || savedScrollTop.current > 0)) {
      const targetId = lastInteractedProductId.current;
      if (targetId) {
        setHighlightedProductId(targetId);
        setTimeout(() => setHighlightedProductId(null), 3000);
      }

      const restore = () => {
        if (targetId) {
          const row = document.getElementById(`product-row-${targetId}`);
          if (row) {
            row.scrollIntoView({ block: 'center', behavior: 'instant' });
            return true;
          }
        }
        if (listScrollRef.current && savedScrollTop.current > 0) {
          listScrollRef.current.scrollTop = savedScrollTop.current;
          return true;
        }
        return false;
      };

      // Try immediately, in next animation frame, and after DOM updates
      restore();
      const raf1 = requestAnimationFrame(() => {
        if (!restore()) {
          requestAnimationFrame(restore);
        }
      });
      const t1 = setTimeout(restore, 50);
      const t2 = setTimeout(restore, 150);
      const t3 = setTimeout(restore, 300);

      return () => {
        cancelAnimationFrame(raf1);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [view, setHighlightedProductId, lastInteractedProductId, listScrollRef, savedScrollTop]);

  useEffect(() => {
    if (isDesktopRuntime()) {
      refreshProductPricing();
      getSetting<string>({ tenant_id: tenantId || 'global', key: 'inventory_default_view' })
        .then((val) => {
          if (val === 'estimate' || val === 'gst' || val === 'combined') setViewMode(val);
        })
        .catch(console.error);

      getSetting<Record<string, string>>({ tenant_id: tenantId || 'global', key: 'price_coding' })
        .then(res => {
          if (res) setPriceCoding(res);
        })
        .catch(console.error);

      getSetting<CodeType>({ tenant_id: tenantId || 'global', key: 'label_code_type' })
        .then(res => {
          if (res === 'barcode' || res === 'qrcode') setLabelCodeType(res);
        })
        .catch(console.error);

      listGrades(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setGrades(res);
        })
        .catch(console.error);

      listPricingTiers(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setPricingTiers(res);
        })
        .catch(console.error);

      listParties(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setSuppliers(res as InventoryState['suppliers']);
        })
        .catch(console.error);
    }
  }, [tenantId, setGrades, setLabelCodeType, setPriceCoding, setPricingTiers, setSuppliers, setViewMode]);

  useEffect(() => {
    if (view === 'add' && isDesktopRuntime()) {
      const getNumFn = hasBridge('dbPeekNextPurchaseBillNumber') ? purchasesApi.peekNextPurchaseBillNumber : purchasesApi.getNextPurchaseBillNumber;
      getNumFn({ tenant_id: tenantId || 'global', bill_type: 'GST' })
        .then(res => {
          if (res.success && res.billNumber) {
            setFormData(prev => ({ ...prev, gst_bill_number: res.billNumber || '' }));
          }
        })
        .catch(console.error);
    }
  }, [view, tenantId, setFormData]);

  useEffect(() => {
    if (view === 'add') {
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [view, firstInputRef]);

  // Keep GST fields in sync when "Same as Current Product" is enabled
  useEffect(() => {
    if (formData.gst_same_as_current && formData.show_gst_purchase) {
      const syncPrice = formData.purchase_price;
      const syncQty = formData.current_stock;
      if (formData.gst_purchase_price !== syncPrice || formData.gst_purchase_quantity !== syncQty) {
        setFormData(prev => ({
          ...prev,
          gst_purchase_price: syncPrice,
          gst_purchase_quantity: syncQty,
        }));
      }
    }
  }, [formData.gst_same_as_current, formData.show_gst_purchase, formData.purchase_price, formData.current_stock, formData.gst_purchase_price, formData.gst_purchase_quantity, setFormData]);

  useEffect(() => {
    if (labelCodeType === 'qrcode' && formData.sku_barcode) {
      QRCode.toDataURL(formData.sku_barcode, { width: 150, margin: 1 })
        .then(url => setQrPreviewUrl(url))
        .catch(() => setQrPreviewUrl(null));
    } else {
      setQrPreviewUrl(null);
    }
  }, [labelCodeType, formData.sku_barcode, setQrPreviewUrl]);

  useEffect(() => {
    if (!formData.name || formData.name.length < 2) {
      setNameSuggestions([]);
      return;
    }
    if (nameSearchTimeout.current) clearTimeout(nameSearchTimeout.current);
    nameSearchTimeout.current = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const { tenantId } = useAuthStore.getState();
      const products = toInventoryProducts(await listProducts({
        tenant_id: tenantId || 'global',
        search: formData.name,
        limit: 8,
        sortBy: 'name'
      }));
      if (Array.isArray(products)) {
        setNameSuggestions(products.filter((p: import('../inventoryHelpers').Product) => Number(p.is_service_item) !== 1 && String(p.name || '').trim().toLowerCase() !== 'service charge'));
        setSelectedNameIndex(0);
      }
    }, 300);
    return () => {
      if (nameSearchTimeout.current) clearTimeout(nameSearchTimeout.current);
    };
  }, [formData.name, setNameSuggestions, setSelectedNameIndex, nameSearchTimeout]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (nameContainerRef.current && !nameContainerRef.current.contains(e.target as Node)) {
        setNameSuggestions([]);
      }
      if (categoryContainerRef.current && !categoryContainerRef.current.contains(e.target as Node)) {
        setShowCategorySuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setNameSuggestions, setShowCategorySuggestions, categoryContainerRef, nameContainerRef]);

  // ── Intersection Observer & Scroll for infinite scrolling ──
  useEffect(() => {
    if (view !== 'list') return;
    const scrollContainer = listScrollRef.current;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          if (!isFetchingRef.current && hasMoreRef.current) {
            loadProducts(false);
          }
        }
      },
      {
        root: scrollContainer,
        rootMargin: '150px',
        threshold: 0.05,
      }
    );

    obs.observe(sentinel);

    return () => {
      obs.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProducts is a new function each render; this runs only on the listed triggers (unchanged by moving it into useInventoryLoader)
  }, [view]);

}
