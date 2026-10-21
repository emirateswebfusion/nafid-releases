import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from 'react';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { PackagePlus, Pencil, Save, Printer, RefreshCw, Search, Plus, Minus, Trash, AlertTriangle, X, Package, Tag, CheckCircle2, AlertCircle, Receipt, Building2, IndianRupee, FileText, Check, Loader2, Layers, Upload, ChevronDown } from 'lucide-react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import Papa from 'papaparse';
import { Modal } from './ui/Modal';
import { DataUploadModal } from './DataUploadModal';
import { RedCrossButton } from './ui/RedCrossButton';
import { Skeleton } from './ui/Skeleton';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { Select } from './ui/Select';
import { ScrollText } from './ScrollText';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { formatRoleName, isAdminRole } from '../utils/permissions';
import { DEFAULT_CODE_TYPE, type CodeType } from '../labelCodeTypes';
import { sortProductsBySearchPriority } from '../utils/productSort';
import { parseUTCDate } from '../utils/receiptGenerator';
import { getStoreTimezone } from '../utils/timezoneHelper';

import { type Product, isGstProduct, DEFAULT_FORM, DomainField } from './inventory/inventoryHelpers';
import { InventoryFormView } from './inventory/views/InventoryFormView';
import { CreateGradeModal } from './inventory/modals/CreateGradeModal';
import { AdjustStockModal } from './inventory/modals/AdjustStockModal';
import { BarcodePrintModal } from './inventory/modals/BarcodePrintModal';
import { DeleteProductModal } from './inventory/modals/DeleteProductModal';
import { BulkDeleteProductsModal } from './inventory/modals/BulkDeleteProductsModal';

// ─── Main Component ─────────────────────────────────────────────────────────
export function InventoryManager({ onClose, isRestricted: _isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { shopDomain } = useCartStore();
  const { tenantId } = useAuthStore();

  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'updated_at' | 'stock'>('created_at');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'no_barcode'>('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const firstInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);
  const [showZeroPaperStock, setShowZeroPaperStock] = useState(false);
  const [showPaperOnlyProducts, setShowPaperOnlyProducts] = useState(true);
  const [showProductGstBadge, setShowProductGstBadge] = useState(true);
  const [showPriceTiersInInventory, setShowPriceTiersInInventory] = useState(true);

  useEffect(() => {
    const loadSettings = () => {
      if (window.electronAPI?.settingsGet) {
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock' }).then(val => {
          if (val !== null && val !== undefined) setEnableRealPaperStock(Boolean(val));
        }).catch(() => {});
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_zero_paper_stock' }).then(val => {
          if (val !== null && val !== undefined) setShowZeroPaperStock(Boolean(val));
        }).catch(() => {});
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_paper_only_products' }).then(val => {
          if (val !== null && val !== undefined) setShowPaperOnlyProducts(Boolean(val));
        }).catch(() => {});
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_product_gst_badge' }).then(val => {
          if (val === 'false' || val === false) setShowProductGstBadge(false);
          else setShowProductGstBadge(true);
        }).catch(() => {});
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_price_tiers_in_inventory' }).then(val => {
          if (val === 'false' || val === false) setShowPriceTiersInInventory(false);
          else setShowPriceTiersInInventory(true);
        }).catch(() => {});
      }
    };
    loadSettings();
    window.addEventListener('settings:updated', loadSettings);
    return () => window.removeEventListener('settings:updated', loadSettings);
  }, [tenantId]);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [printQuantity, setPrintQuantity] = useState<number | string>(1);
  const [printPrice, setPrintPrice] = useState(true);
  const [printModalProduct, setPrintModalProduct] = useState<Product | null>(null);
  const [adjustingStockId, setAdjustingStockId] = useState<string | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ product: Product; mode: 'add' | 'reduce' } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustPcs, setAdjustPcs] = useState('');
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);
  const [viewMode, setViewMode] = useState<'estimate' | 'gst' | 'combined'>('combined');
  const [showLowStockAlert, setShowLowStockAlert] = useState(true);
  const [labelCodeType, setLabelCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const activePricingTiers = useMemo(() => {
    return pricingTiers.filter(t => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
  }, [pricingTiers]);
  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [allProductPricingMap, setAllProductPricingMap] = useState<Record<string, Record<string, number>>>({});
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const [isAddingGrade, setIsAddingGrade] = useState(false);
  const [savingGrade, setSavingGrade] = useState(false);
  const [newGradeForm, setNewGradeForm] = useState({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
  const [nameSuggestions, setNameSuggestions] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [selectedNameIndex, setSelectedNameIndex] = useState(0);
  const nameContainerRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const lastInteractedProductId = useRef<string | null>(null);
  const savedScrollTop = useRef<number>(0);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  const existingCategories = useMemo(() => {
    const map = new Map<string, string>();
    const addCat = (raw: string | null | undefined) => {
      if (!raw) return;
      const trimmed = raw.trim().replace(/\s+/g, ' ');
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, trimmed);
      }
    };
    grades.forEach(g => addCat(g.category));
    products.forEach(p => addCat(p.category));
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [grades, products]);

  const categorySuggestions = useMemo(() => {
    const query = (formData.category || '').trim().toLowerCase();
    if (!query) {
      return existingCategories;
    }
    return existingCategories.filter(c => c.toLowerCase().includes(query));
  }, [existingCategories, formData.category]);

  const configuredCategories = existingCategories;

  const categoryGrades = grades.filter(g => (g.category || '').trim().toLowerCase() === (formData.category || '').trim().toLowerCase());

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const LIMIT = 50;

  // ── Refs to always hold the latest filter/pagination state ──────────────
  // These allow async callbacks (sync listener, intersection observer) to
  // read current values without suffering from stale closures.
  const searchQueryRef = useRef(debouncedSearchQuery);
  const sortByRef = useRef(sortBy);
  const stockFilterRef = useRef(stockFilter);
  const filterDateRef = useRef(filterDate);
  const filterDateEndRef = useRef(filterDateEnd);
  const offsetRef = useRef(offset);
  const hasMoreRef = useRef(hasMore);
  const isFetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const viewModeRef = useRef(viewMode);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
  }, [searchQuery]);

  useEffect(() => { searchQueryRef.current = debouncedSearchQuery; }, [debouncedSearchQuery]);
  useEffect(() => { sortByRef.current = sortBy; }, [sortBy]);
  useEffect(() => { stockFilterRef.current = stockFilter; }, [stockFilter]);
  useEffect(() => { filterDateRef.current = filterDate; }, [filterDate]);
  useEffect(() => { filterDateEndRef.current = filterDateEnd; }, [filterDateEnd]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  // Focus search input on open / view switch
  useEffect(() => {
    if (view === 'list') {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [view]);

  // Load products when debounced search or sort or stock filter or viewMode changes (reset)
  useEffect(() => {
    offsetRef.current = 0;
    setOffset(0);
    hasMoreRef.current = true;
    setHasMore(true);
    loadProducts(true);
  }, [debouncedSearchQuery, sortBy, filterDate, filterDateEnd, stockFilter, viewMode]);

  // Sync listener — auto-refresh silently, using refs so current search/
  // filter state is preserved even though this effect runs only once.
  useEffect(() => {
    if (window.electronAPI) {
      const unsub = window.electronAPI.onSyncDataUpdated(() => {
        console.log('[InventoryManager] Data updated via sync. Auto-refreshing...');
        loadProducts(true);
      });
      return () => unsub?.();
    }
  }, []);

  // Auto-hide toast/status messages
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(t);
  }, [statusMessage]);

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
        const timer = setTimeout(() => setHighlightedProductId(null), 3000);
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
  }, [view]);

  const refreshProductPricing = useCallback(async () => {
    if (window.electronAPI?.dbGetProductPricing) {
      try {
        const rows = await window.electronAPI.dbGetProductPricing(tenantId || 'global');
        if (Array.isArray(rows)) {
          const map: Record<string, Record<string, number>> = {};
          for (const r of rows) {
            if (!r.is_deleted && r.price != null && r.price !== '') {
              if (!map[r.product_id]) map[r.product_id] = {};
              map[r.product_id][r.pricing_tier_id] = Number(r.price);
            }
          }
          setAllProductPricingMap(map);
        }
      } catch (err) {
        console.warn('[InventoryManager] Failed to load product pricing:', err);
      }
    }
  }, [tenantId]);

  useEffect(() => {
    if (window.electronAPI) {
      refreshProductPricing();
      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'inventory_default_view' })
        .then((val: any) => {
          if (val === 'estimate' || val === 'gst' || val === 'combined') setViewMode(val);
        })
        .catch(console.error);

      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'price_coding' })
        .then(res => {
          if (res) setPriceCoding(res);
        })
        .catch(console.error);

      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'label_code_type' })
        .then(res => {
          if (res === 'barcode' || res === 'qrcode') setLabelCodeType(res);
        })
        .catch(console.error);

      window.electronAPI.dbGetGrades(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setGrades(res);
        })
        .catch(console.error);

      window.electronAPI.dbGetPricingTiers(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setPricingTiers(res);
        })
        .catch(console.error);

      window.electronAPI.dbGetParties(tenantId || 'global')
        .then(res => {
          if (Array.isArray(res)) setSuppliers(res);
        })
        .catch(console.error);
    }
  }, [tenantId]);

  useEffect(() => {
    if (view === 'add' && window.electronAPI) {
      const getNumFn = window.electronAPI.dbPeekNextPurchaseBillNumber || window.electronAPI.dbGetNextPurchaseBillNumber;
      getNumFn({ tenant_id: tenantId || 'global', bill_type: 'GST' })
        .then(res => {
          if (res.success && res.billNumber) {
            setFormData(prev => ({ ...prev, gst_bill_number: res.billNumber || '' }));
          }
        })
        .catch(console.error);
    }
  }, [view, tenantId]);

  useEffect(() => {
    if (view === 'add') {
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [view]);

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
  }, [formData.gst_same_as_current, formData.show_gst_purchase, formData.purchase_price, formData.current_stock, formData.gst_purchase_price, formData.gst_purchase_quantity]);

  useEffect(() => {
    if (labelCodeType === 'qrcode' && formData.sku_barcode) {
      QRCode.toDataURL(formData.sku_barcode, { width: 150, margin: 1 })
        .then(url => setQrPreviewUrl(url))
        .catch(() => setQrPreviewUrl(null));
    } else {
      setQrPreviewUrl(null);
    }
  }, [labelCodeType, formData.sku_barcode]);

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
      if (window.electronAPI) {
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

        const productsPromise = window.electronAPI.dbGetProducts({
          tenant_id: tenantId,
          limit: LIMIT,
          offset: currentOffset,
          search: currentSearch,
          sortBy: currentSortBy,
          filterDate: currentFilterDate,
          filterDateEnd: currentFilterDateEnd,
          stockStatus: currentStockFilter,
          isGst: isGstParam
        });

        const countPromise = reset ? window.electronAPI.dbGetProductsCount({
          tenant_id: tenantId,
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

  // ── Name autocomplete ───────────────────────────────────────────────
  const nameSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!formData.name || formData.name.length < 2) {
      setNameSuggestions([]);
      return;
    }
    if (nameSearchTimeout.current) clearTimeout(nameSearchTimeout.current);
    nameSearchTimeout.current = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      const products = await window.electronAPI.dbGetProducts({
        tenant_id: tenantId,
        search: formData.name,
        limit: 8,
        sortBy: 'name'
      });
      if (Array.isArray(products)) {
        setNameSuggestions(products.filter((p: any) => Number(p.is_service_item) !== 1 && String(p.name || '').trim().toLowerCase() !== 'service charge'));
        setSelectedNameIndex(0);
      }
    }, 300);
    return () => {
      if (nameSearchTimeout.current) clearTimeout(nameSearchTimeout.current);
    };
  }, [formData.name]);

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
  }, []);

  const handleCategoryKeyDown = (e: React.KeyboardEvent) => {
    if (!showCategorySuggestions || categorySuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedCategoryIndex(prev => Math.min(prev + 1, categorySuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedCategoryIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedCategoryIndex >= 0) {
      e.preventDefault();
      selectCategorySuggestion(categorySuggestions[selectedCategoryIndex]);
    } else if (e.key === 'Escape') {
      setShowCategorySuggestions(false);
    }
  };

  const selectCategorySuggestion = (cat: string) => {
    handleInputChange('category', cat);
    setShowCategorySuggestions(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (!nameSuggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedNameIndex(prev => Math.min(prev + 1, nameSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedNameIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedNameIndex >= 0) {
      e.preventDefault();
      selectNameSuggestion(nameSuggestions[selectedNameIndex]);
    } else if (e.key === 'Escape') {
      setNameSuggestions([]);
    }
  };

  const selectNameSuggestion = (product: Product) => {
    setNameSuggestions([]);
    openEdit(product);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-focusable-checkbox]');
    const idx = Array.from(focusable).indexOf(target as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    if (idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

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
  }, [view]);

  // Handle scroll on the list container to load next page smoothly
  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    savedScrollTop.current = el.scrollTop;

    // Trigger next page when scrolled within 200px of bottom
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 200 && !isFetchingRef.current && hasMoreRef.current) {
      loadProducts(false);
    }
  }, []);

  const openAdd = async () => {
    let nextBarcode = '';
    if (window.electronAPI) {
      try {
        const lastProduct = await window.electronAPI.dbGetProducts({
          tenant_id: tenantId,
          limit: 1,
          sortBy: 'created_at'
        });
        if (Array.isArray(lastProduct) && lastProduct.length > 0 && lastProduct[0].sku_barcode) {
          const lastBarcode = lastProduct[0].sku_barcode;
          const match = lastBarcode.match(/(\d+)[^\d]*$/);
          if (match) {
            const numStr = match[1];
            const nextNum = (BigInt(numStr) + 1n).toString();
            nextBarcode = nextNum.padStart(numStr.length, '0');
          } else {
            // If the barcode doesn't contain a number, default to '1'
            nextBarcode = '1';
          }
        }
      } catch (err) {
        console.error("Failed to fetch last barcode", err);
      }
    }

    setFormData({ ...DEFAULT_FORM, sku_barcode: nextBarcode });
    setEditingProduct(null);
    setTierPrices({});
    setView('add');
  };

  const openEdit = (product: Product) => {
    lastInteractedProductId.current = product.product_id;
    if (listScrollRef.current) {
      savedScrollTop.current = listScrollRef.current.scrollTop;
    }
    setEditingProduct(product);
    const validGradeId = product.grade_id && grades.some(g => g.grade_id === product.grade_id) ? product.grade_id : '';
    const appliedGrade = validGradeId ? grades.find(g => g.grade_id === validGradeId) : null;
    const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
    setFormData({
      item_code: product.item_code || '',
      sku_barcode: product.sku_barcode || '',
      name: product.name,
      category: product.category || '',
      brand_manufacturer: product.brand_manufacturer || '',
      uom: product.uom || 'Pcs',
      purchase_price: product.purchase_price || '',
      base_price: gradeRate !== null && product.pricing_mode === 'GRADE_RATE' ? gradeRate : (product.base_price || ''),
      current_stock: product.current_stock ?? '',
      gst_purchase_quantity: product.paper_stock !== undefined && product.paper_stock !== null ? String(product.paper_stock) : '',
      gst_purchase_price: (() => {
        try {
          const da = JSON.parse(product.domain_attributes || '{}');
          const isPaper = da.gst_type === 'PAPER' || Number(product.paper_stock || da.paper_stock || 0) > 0;
          if (!isPaper) return '';
          if ((product as any).gst_purchase_price !== undefined && (product as any).gst_purchase_price !== null && (product as any).gst_purchase_price !== '') {
            return String((product as any).gst_purchase_price);
          }
          return da.paper_purchase_price !== undefined && da.paper_purchase_price !== null ? String(da.paper_purchase_price) : (da.gst_purchase_price !== undefined && da.gst_purchase_price !== null ? String(da.gst_purchase_price) : '');
        } catch { return ''; }
      })(),
      reorder_level: product.reorder_level ?? '',
      is_gst_applicable: isGstProduct(product),
      gst_type: (() => {
        try {
          if (Number(product.current_stock || 0) > 0) return 'REAL' as 'REAL' | 'PAPER';
          const da = JSON.parse(product.domain_attributes || '{}');
          if (da.gst_type === 'PAPER') return 'PAPER';
          if (Number(product.current_stock || 0) <= 0 && Number(product.paper_stock || 0) > 0) return 'PAPER';
          return (da.gst_type === 'PAPER' ? 'PAPER' : 'REAL') as 'REAL' | 'PAPER';
        } catch { return 'REAL' as 'REAL' | 'PAPER'; }
      })(),
      hsn_sac_code: product.hsn_sac_code || '',
      tax_rate_percent: product.tax_rate_percent || 0,
      domain_attributes: (() => {
        try {
          const da = JSON.parse(product.domain_attributes || '{}');
          const pcsVal = da.pcs !== undefined ? da.pcs : (da.pcs_stock !== undefined ? da.pcs_stock : '');
          da.pcs = pcsVal;
          da.pcs_stock = pcsVal;
          const isPaper = da.gst_type === 'PAPER' || Number(product.paper_stock || da.paper_stock || 0) > 0;
          if (!isPaper) {
            delete da.paper_mrp;
            delete da.paper_base_price;
            delete da.paper_purchase_price;
            delete da.gst_purchase_price;
          } else {
            const paperMrpVal = (product as any).paper_mrp !== undefined && (product as any).paper_mrp !== null && (product as any).paper_mrp !== ''
              ? (product as any).paper_mrp
              : (da.paper_mrp !== undefined && da.paper_mrp !== null ? da.paper_mrp : (da.paper_base_price !== undefined ? da.paper_base_price : ''));
            da.paper_mrp = paperMrpVal !== '' ? String(paperMrpVal) : '';
          }
          return da;
        } catch { return {}; }
      })(),
      discount_percent: product.discount_percent ?? '',
      discount_flat: product.discount_flat ?? '',
      offer_price: product.offer_price ?? '',
      billing_type: product.billing_type || 'PIECE',
      grade_id: validGradeId,
      pricing_mode: validGradeId ? (product.pricing_mode || 'FIXED_PRICE') : 'FIXED_PRICE',
      show_gst_purchase: false,
      gst_same_as_current: false,
      gst_supplier_id: '',
      gst_supplier_name: '',
      gst_bill_number: '',
      gst_bill_date: new Date().toLocaleDateString('en-CA'),
      gst_purchase_is_dummy: false,
    });
    if (window.electronAPI) {
      window.electronAPI.dbGetProductPricing(tenantId || 'global')
        .then((rows: any[]) => {
          if (Array.isArray(rows)) {
            const mine: Record<string, string> = {};
            for (const r of rows) {
              if (r.product_id === product.product_id && r.price != null && r.price !== '') {
                mine[r.pricing_tier_id] = String(r.price);
              }
            }
            setTierPrices(mine);
          }
        })
        .catch(console.error);

      // Async fallback: if paper purchase price or paper MRP is missing or empty,
      // load it directly from purchase bill records
      const daParsed = (() => { try { return JSON.parse(product.domain_attributes || '{}'); } catch { return {}; } })();
      const isProductPaper = daParsed.gst_type === 'PAPER' || Number(product.paper_stock || daParsed.paper_stock || 0) > 0;
      const curPur = (product as any).gst_purchase_price ?? daParsed.gst_purchase_price ?? daParsed.paper_purchase_price ?? '';
      const curMrp = (product as any).paper_mrp ?? daParsed.paper_mrp ?? daParsed.paper_base_price ?? '';

      if (isProductPaper && (!curPur || !curMrp) && window.electronAPI.dbGetPurchaseBillProducts) {
        window.electronAPI.dbGetPurchaseBillProducts({
          tenant_id: tenantId || 'global',
          search: product.name,
          limit: 10
        }).then((billProds: any[]) => {
          if (Array.isArray(billProds)) {
            const match = billProds.find(bp => bp.product_id === product.product_id);
            if (match) {
              setFormData(prev => {
                const prevDa = { ...prev.domain_attributes };
                let changed = false;
                let newPur = prev.gst_purchase_price;
                if ((!newPur || Number(newPur) <= 0) && Number(match.gst_purchase_price) > 0) {
                  newPur = String(match.gst_purchase_price);
                  prevDa.gst_purchase_price = match.gst_purchase_price;
                  prevDa.paper_purchase_price = match.gst_purchase_price;
                  changed = true;
                }
                if ((!prevDa.paper_mrp || Number(prevDa.paper_mrp) <= 0) && Number(match.paper_mrp) > 0) {
                  prevDa.paper_mrp = String(match.paper_mrp);
                  prevDa.paper_base_price = match.paper_mrp;
                  changed = true;
                }
                if (changed) {
                  return { ...prev, gst_purchase_price: newPur, domain_attributes: prevDa };
                }
                return prev;
              });
            }
          }
        }).catch(console.error);
      }
    }
    setView('edit');
  };

  const handleDelete = (product: Product) => {
    setDeleteConfirmProduct(product);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmProduct) return;
    setIsDeleting(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.dbDeleteProduct(deleteConfirmProduct.product_id);
        if (res.success) {
          setProducts(prev => prev.filter(p => p.product_id !== deleteConfirmProduct.product_id));
          setTotalCount(prev => prev !== null ? Math.max(0, prev - 1) : null);
          setStatusMessage({ text: `Product "${deleteConfirmProduct.name}" deleted successfully`, type: 'success' });
        } else {
          setStatusMessage({ text: 'Delete failed: ' + res.error, type: 'error' });
        }
      }
    } catch (err: any) {
      console.error('Delete product error:', err);
      setStatusMessage({ text: 'Failed to delete product', type: 'error' });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmProduct(null);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  const filtered = useMemo(() =>
    products.filter(p => {
      // Service charge belongs on the billing page only — never in inventory
      // (flag OR literal name match — legacy/unflagged duplicates exist in old databases)
      if (Number(p.is_service_item) === 1 || String(p.name || '').trim().toLowerCase() === 'service charge') return false;
      const isGst = isGstProduct(p);

      // Staff Operational Option Check: If biller does NOT have OPT_VIEW_GST permission, restrict viewing to GST products ONLY
      const { role, restrictedPage } = useAuthStore.getState();
      if (role === 'BILLER') {
        const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
        const hasOptViewGst = permissions.includes('OPT_VIEW_GST');
        if (!hasOptViewGst && !isGst) {
          return false;
        }
      }

      // An HSN/SAC code classifies a product as GST-applicable, even at 0%.
      if (viewMode === 'estimate' && isGst) return false;
      if (viewMode === 'gst' && !isGst) return false;

      // Filter out Paper-only products if setting is OFF
      if (!showPaperOnlyProducts && Number(p.current_stock) <= 0 && Number((p as any).paper_stock || 0) > 0) {
        return false;
      }

      // Stock status filter
      if (stockFilter === 'low_stock') {
        if (!(Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0 && Number(p.current_stock) > 0)) return false;
      } else if (stockFilter === 'out_of_stock') {
        if (Number(p.current_stock) > 0 || Number((p as any).paper_stock || 0) > 0) return false;
      } else if (stockFilter === 'in_stock') {
        if (Number(p.current_stock) <= 0 && Number((p as any).paper_stock || 0) <= 0) return false;
      } else if (stockFilter === 'no_barcode') {
        if (p.sku_barcode && String(p.sku_barcode).trim() !== '') return false;
      }

      return true;
    }),
    [products, viewMode, stockFilter, showPaperOnlyProducts]
  );

  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const filteredIds = useMemo(() => filtered.map(p => p.product_id), [filtered]);

  const isAllSelected = useMemo(() => {
    if (filteredIds.length === 0) return false;
    return filteredIds.every(id => selectedProductIds.has(id));
  }, [filteredIds, selectedProductIds]);

  const isSomeSelected = useMemo(() => {
    return filteredIds.some(id => selectedProductIds.has(id)) && !isAllSelected;
  }, [filteredIds, selectedProductIds, isAllSelected]);

  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleConfirmBulkDelete = async () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.dbBulkDeleteProducts(ids);
        if (res.success) {
          const deleteSet = new Set(ids);
          setProducts(prev => prev.filter(p => !deleteSet.has(p.product_id)));
          setTotalCount(prev => prev !== null ? Math.max(0, prev - ids.length) : null);
          setSelectedProductIds(new Set());
          setStatusMessage({ text: `Successfully deleted ${ids.length} product(s)`, type: 'success' });
        } else {
          setStatusMessage({ text: 'Bulk delete failed: ' + res.error, type: 'error' });
        }
      }
    } catch (err: any) {
      console.error('Bulk delete product error:', err);
      setStatusMessage({ text: 'Failed to delete selected products', type: 'error' });
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  };

  const openAdjustDialog = (product: Product, mode: 'add' | 'reduce') => {
    setAdjustAmount('');
    setAdjustPcs('');
    setAdjustModal({ product, mode });
  };

  const applyStockAdjust = async (product: Product, delta: number, pcsDelta?: number): Promise<boolean> => {
    if (!window.electronAPI) return false;
    setAdjustingStockId(product.product_id);
    try {
      const res = await window.electronAPI.dbAdjustStock({ product_id: product.product_id, delta, pcsDelta });
      if (res.success) {
        setProducts(prev => prev.map(p => {
          if (p.product_id !== product.product_id) return p;
          const next = { ...p, current_stock: Number(p.current_stock) + delta };
          if (pcsDelta !== undefined) {
            try {
              const da = JSON.parse(p.domain_attributes || '{}');
              const cur = Number(da.pcs_stock ?? da.pcs ?? 0) || 0;
              const nextPcs = Math.max(0, cur + pcsDelta);
              da.pcs_stock = nextPcs;
              da.pcs = nextPcs;
              next.domain_attributes = JSON.stringify(da);
            } catch { /* keep as is */ }
          }
          return next;
        }));
        return true;
      }
      setStatusMessage({ text: 'Failed to adjust stock: ' + res.error, type: 'error' });
      return false;
    } catch (err: any) {
      console.error('Adjust stock error:', err);
      setStatusMessage({ text: 'Failed to adjust stock. Please try again.', type: 'error' });
      return false;
    } finally {
      setAdjustingStockId(null);
    }
  };

  const confirmAdjustStock = async () => {
    const modal = adjustModal;
    if (!modal) return;
    const kgAmt = parseFloat(adjustAmount);
    const pcsAmt = parseFloat(adjustPcs);
    const hasKg = !isNaN(kgAmt) && kgAmt > 0;
    const hasPcs = !isNaN(pcsAmt) && pcsAmt > 0;
    if (!hasKg && !hasPcs) {
      setStatusMessage({ text: 'Enter a valid amount in weight or pcs', type: 'error' });
      return;
    }
    if (hasKg && modal.mode === 'reduce' && kgAmt > Number(modal.product.current_stock)) {
      setStatusMessage({ text: 'Cannot reduce more than the current stock', type: 'error' });
      return;
    }
    if (hasPcs && modal.mode === 'reduce' && pcsAmt > adjustCurrentPcs) {
      setStatusMessage({ text: 'Cannot reduce more than the current pcs', type: 'error' });
      return;
    }
    const sign = modal.mode === 'add' ? 1 : -1;
    const ok = await applyStockAdjust(modal.product, hasKg ? sign * kgAmt : 0, hasPcs ? sign * pcsAmt : undefined);
    if (ok) {
      setAdjustModal(null);
      const parts: string[] = [];
      if (hasKg) parts.push(`${kgAmt} ${modal.product.uom}`);
      if (hasPcs) parts.push(`${pcsAmt} Pcs`);
      setStatusMessage({ text: `${modal.mode === 'add' ? 'Added' : 'Reduced'} ${parts.join(' + ')} — ${modal.product.name}`, type: 'success' });
    }
  };

  const encodePurchasePriceCode = (price: any) => {
    if (!priceCoding || price === '' || price === null || price === undefined) return '';
    const numeric = Number(price);
    if (isNaN(numeric) || numeric <= 0) return '';
    let code = '';
    for (const char of String(numeric)) {
      if (char === '.') code += '.';
      else if (priceCoding[char]) code += priceCoding[char];
    }
    return code;
  };

  const stripPurchasePriceCode = (barcode: string, price: any) => {
    const code = encodePurchasePriceCode(price);
    // Strip the new dotted format first, then the legacy dotless format
    for (const candidate of [code, code.replace(/\./g, '')]) {
      if (candidate && barcode.endsWith(candidate)) {
        return barcode.substring(0, barcode.length - candidate.length);
      }
    }
    return barcode;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      if (field === 'is_gst_applicable' && !value && String(prev.hsn_sac_code || '').trim()) {
        return prev;
      }
      const next = { ...prev, [field]: value };
      
      if (field === 'purchase_price' && priceCoding) {
        const newCode = encodePurchasePriceCode(value);

        let currentBarcode = prev.sku_barcode || '';
        
        currentBarcode = stripPurchasePriceCode(currentBarcode, prev.purchase_price);
        
        if (newCode) {
           currentBarcode = currentBarcode + newCode;
        }
        
        next.sku_barcode = currentBarcode;
      }

      if (field === 'grade_id') {
        next.pricing_mode = value ? 'GRADE_RATE' : 'FIXED_PRICE';
        if (value) {
          const selectedGrade = grades.find(g => g.grade_id === value);
          if (selectedGrade) {
            next.base_price = Number(selectedGrade.rate);
            next.purchase_price = Number(selectedGrade.purchase_price || 0);
          }
        }
      }

      if (field === 'uom') {
        const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'];
        next.billing_type = weightUoms.includes(value) ? 'WEIGHT' : 'PIECE';
        setPrintQuantity(1);
      }

      if (field === 'current_stock' && view === 'add' && !['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(prev.uom)) {
        setPrintQuantity(value === '' ? '' : value);
      }

      if (field === 'gst_same_as_current' && value) {
        next.gst_purchase_price = next.purchase_price;
        next.gst_purchase_quantity = next.current_stock;
      }

      if ((field === 'base_price' || field === 'grade_id') && next.discount_percent !== undefined && next.discount_percent !== '') {
        const pct = parseFloat(next.discount_percent as string);
        if (!isNaN(pct)) {
          const base = getEffectiveMrp(next);
          next.discount_flat = base ? ((base * pct) / 100).toFixed(2) : '';
        }
      }
      return next;
    });
  };

  const handleDomainAttrChange = (field: string, value: any) => {
    setFormData(prev => {
      const nextAttrs = { ...prev.domain_attributes, [field]: value };
      if (field === 'pcs') {
        nextAttrs.pcs_stock = value;
      }
      return {
        ...prev,
        domain_attributes: nextAttrs
      };
    });
    if (field === 'pcs') {
      setPrintQuantity(value === '' || value === 0 ? '' : Number(value));
    }
  };

  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return;
    if (window.electronAPI) {
      const partyId = uuidv4();
      const res = await window.electronAPI.dbAddParty({
        party_id: partyId,
        tenant_id: tenantId,
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || null,
        address: newSupplierAddress.trim() || null,
        balance: 0,
        balance_type: 'PAYABLE',
        notes: 'Purchase Supplier',
        created_by: useAuthStore.getState().userId,
        created_by_name: useAuthStore.getState().userName,
      });
      if (res.success) {
        const newParty = { party_id: partyId, tenant_id: tenantId, name: newSupplierName.trim(), phone: newSupplierPhone.trim() || null, address: newSupplierAddress.trim() || null, balance: 0, balance_type: 'PAYABLE' };
        setSuppliers(prev => [...prev, newParty]);
        setFormData(prev => ({ ...prev, gst_supplier_id: partyId, gst_supplier_name: newSupplierName.trim() }));
        setShowSupplierCreate(false);
        setNewSupplierName('');
        setNewSupplierPhone('');
        setNewSupplierAddress('');
      } else {
        setStatusMessage({ text: 'Failed to create supplier: ' + (res.error || ''), type: 'error' });
        setTimeout(() => setStatusMessage(null), 3000);
      }
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone && s.phone.includes(supplierSearch))
  );

  const handleCreateGrade = async () => {
    if (!formData.category.trim() || !newGradeForm.grade_name.trim()) return;
    setSavingGrade(true);
    const { tenantId } = useAuthStore.getState();
    const gradeId = uuidv4();
    const res = await window.electronAPI.dbAddGrade({
      grade_id: gradeId,
      tenant_id: tenantId || '',
      category: formData.category.trim(),
      grade_name: newGradeForm.grade_name.trim(),
      rate: Number(newGradeForm.rate) || 0,
      purchase_price: Number(newGradeForm.purchase_price) || 0,
      offer_price: newGradeForm.offer_price === '' ? null : Number(newGradeForm.offer_price),
    });
    if (res.success) {
      const fresh = await window.electronAPI.dbGetGrades(tenantId || 'global');
      if (Array.isArray(fresh)) setGrades(fresh);
      handleInputChange('grade_id', gradeId);
      handleInputChange('base_price', Number(newGradeForm.rate) || 0);
      handleInputChange('purchase_price', Number(newGradeForm.purchase_price) || 0);
      handleInputChange('offer_price', newGradeForm.offer_price === '' ? '' : Number(newGradeForm.offer_price));
      setIsAddingGrade(false);
      setNewGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
      setStatusMessage({ text: `Grade "${newGradeForm.grade_name.trim()}" created and applied.`, type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Failed to create grade: ' + (res.error || 'Operation failed'), type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
    setSavingGrade(false);
  };

  const getEffectiveMrp = (data: any = formData) => {
    const appliedGrade = data.grade_id ? grades.find(g => g.grade_id === data.grade_id) : null;
    const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
    return gradeRate !== null && data.pricing_mode === 'GRADE_RATE' 
      ? gradeRate 
      : Number(data.base_price) || 0;
  };

  const handleDiscountPercentChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, discount_percent: '', discount_flat: '' }));
      return;
    }
    const percent = parseFloat(val);
    const base = getEffectiveMrp();
    const flat = base && !isNaN(percent) ? ((base * percent) / 100).toFixed(2) : '';
    setFormData(prev => ({ ...prev, discount_percent: val, discount_flat: flat, offer_price: '' }));
  };

  const handleDiscountFlatChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, discount_percent: '', discount_flat: '' }));
      return;
    }
    const flat = parseFloat(val);
    const base = getEffectiveMrp();
    const percent = base && !isNaN(flat) ? ((flat / base) * 100).toFixed(2) : '';
    setFormData(prev => ({ ...prev, discount_percent: percent, discount_flat: val, offer_price: '' }));
  };

  const handleOfferPriceChange = (val: string) => {
    if (val === '') {
      setFormData(prev => ({ ...prev, offer_price: '' }));
      return;
    }
    setFormData(prev => ({ ...prev, offer_price: val, discount_percent: '', discount_flat: '' }));
  };

  const generateBarcode = () => {
    let prefix = formData.item_code || '';
    let priceCode = '';
    
    if (priceCoding && formData.purchase_price) {
      priceCode = encodePurchasePriceCode(formData.purchase_price);
    }

    if (prefix.length + priceCode.length > 10) {
      prefix = prefix.substring(0, Math.max(0, 10 - priceCode.length));
    }
    
    const remainingLength = 10 - prefix.length - priceCode.length;
    let randomPart = '';
    if (remainingLength > 0) {
      const min = Math.pow(10, remainingLength - 1);
      const max = Math.pow(10, remainingLength) - 1;
      randomPart = Math.floor(min + Math.random() * (max - min + 1)).toString();
    }
    
    handleInputChange('sku_barcode', prefix + randomPart + priceCode);
  };

  const printBarcode = async () => {
    if (!formData.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });
    
    if (window.electronAPI) {
      const appliedGrade = formData.grade_id ? grades.find(g => g.grade_id === formData.grade_id) : null;
      const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
      const effectiveMrp = gradeRate !== null && formData.pricing_mode === 'GRADE_RATE' 
        ? gradeRate 
        : Number(formData.base_price);

      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (formData.offer_price) {
        sp = Number(formData.offer_price);
        spType = 'OFF';
      } else if (formData.discount_flat) {
        sp = effectiveMrp - Number(formData.discount_flat);
        spType = 'SP';
      } else if (formData.discount_percent) {
        sp = effectiveMrp * (1 - Number(formData.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === effectiveMrp) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', effectiveMrp.toString());
        if (sp !== undefined) {
          localStorage.setItem('printBarcodeSp', sp.toString());
          localStorage.setItem('printBarcodeSpType', spType);
        } else {
          localStorage.removeItem('printBarcodeSp');
          localStorage.removeItem('printBarcodeSpType');
        }
      } else {
        localStorage.removeItem('printBarcodePrice');
        localStorage.removeItem('printBarcodeSp');
        localStorage.removeItem('printBarcodeSpType');
      }
      const cleanName = (formData.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
      localStorage.setItem('printBarcodeName', cleanName);

      const res = await window.electronAPI.printBarcode(
        tenantId || 'global', 
        formData.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        cleanName, 
        Math.max(1, Number(printQuantity) || 1), 
        printPrice ? sp : undefined,
        printPrice ? spType : undefined
      );
      if (res.success) {
        setStatusMessage({ text: `Barcode printed successfully (${printQuantity} label${Number(printQuantity) > 1 ? 's' : ''})!`, type: 'success' });
        setPrintQuantity(1);
      } else {
        setStatusMessage({ text: `Print Failed: ${res.error || 'Printer not connected'}`, type: 'error' });
      }
      
      // Clear message after 3 seconds
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Print command dispatched', type: 'success' });
      setPrintQuantity(1);
    }
  };

  const printProductLabel = async (p: Product) => {
    if (!p.sku_barcode) return;
    setStatusMessage({ text: 'Connecting to printer...', type: 'success' });
    
    if (window.electronAPI) {
      const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
      const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
      const effectiveMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE' 
        ? gradeRate 
        : Number(p.base_price);

      let sp: number | undefined;
      let spType: 'SP' | 'OFF' = 'SP';
      if (p.offer_price) {
        sp = Number(p.offer_price);
        spType = 'OFF';
      } else if (p.discount_flat) {
        sp = effectiveMrp - Number(p.discount_flat);
        spType = 'SP';
      } else if (p.discount_percent) {
        sp = effectiveMrp * (1 - Number(p.discount_percent) / 100);
        spType = 'SP';
      }
      if (sp !== undefined && sp === effectiveMrp) {
         sp = undefined;
      }
      if (printPrice) {
        localStorage.setItem('printBarcodePrice', effectiveMrp.toString());
        if (sp !== undefined) {
          localStorage.setItem('printBarcodeSp', sp.toString());
          localStorage.setItem('printBarcodeSpType', spType);
        } else {
          localStorage.removeItem('printBarcodeSp');
          localStorage.removeItem('printBarcodeSpType');
        }
      } else {
        localStorage.removeItem('printBarcodePrice');
        localStorage.removeItem('printBarcodeSp');
        localStorage.removeItem('printBarcodeSpType');
      }
      const cleanName = (p.name || '').replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
      localStorage.setItem('printBarcodeName', cleanName);

      const res = await window.electronAPI.printBarcode(
        tenantId || 'global', 
        p.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        cleanName, 
        Math.max(1, Number(printQuantity) || 1), 
        printPrice ? sp : undefined,
        printPrice ? spType : undefined
      );
      if (res.success) {
        setStatusMessage({ text: `Barcode printed successfully (${printQuantity} label${Number(printQuantity) > 1 ? 's' : ''})!`, type: 'success' });
        setTimeout(() => setPrintModalProduct(null), 2000);
      } else {
        setStatusMessage({ text: `Print Failed: ${res.error || 'Printer not connected'}`, type: 'error' });
      }
      
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ text: 'Print command dispatched (mock)', type: 'success' });
      setTimeout(() => {
        setPrintModalProduct(null);
        setStatusMessage(null);
      }, 2000);
    }
  };

  const downloadCsv = async () => {
    setStatusMessage({ text: 'Generating CSV...', type: 'success' });
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      const tid = tenantId || 'global';
      const [result, tiersRes, pricingRows] = await Promise.all([
        window.electronAPI.dbGetProducts({
          tenant_id: tid,
          filterDate: filterDate,
          filterDateEnd: filterDateEnd,
          stockStatus: stockFilterRef.current,
          limit: 100000 
        }),
        window.electronAPI.dbGetPricingTiers ? window.electronAPI.dbGetPricingTiers(tid) : Promise.resolve([]),
        window.electronAPI.dbGetProductPricing ? window.electronAPI.dbGetProductPricing(tid) : Promise.resolve([])
      ]);

      if (Array.isArray(result) && result.length > 0) {
        const activeTiers = Array.isArray(tiersRes)
          ? tiersRes.filter((t: any) => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted)
          : [];

        // Build product_id -> { [pricing_tier_id]: price }
        const pricingMap: Record<string, Record<string, number>> = {};
        if (Array.isArray(pricingRows)) {
          for (const row of pricingRows) {
            if (!row.is_deleted && row.price != null && row.price !== '') {
              if (!pricingMap[row.product_id]) {
                pricingMap[row.product_id] = {};
              }
              pricingMap[row.product_id][row.pricing_tier_id] = Number(row.price);
            }
          }
        }

        const dataToExport = result.map(p => {
          const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
          const displayPurchasePrice = appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined 
            ? Number(appliedGrade.purchase_price) 
            : Number(p.purchase_price);
          const displayMrp = appliedGrade && p.pricing_mode === 'GRADE_RATE' 
            ? Number(appliedGrade.rate) 
            : Number(p.base_price);

          const row: Record<string, any> = {
            'Name': p.name || '',
            'Item Code': p.item_code || '',
            'Barcode': p.sku_barcode || '',
            'Category': p.category || '',
            'Brand': p.brand_manufacturer || '',
            'UOM': p.uom || '',
            'Purchase Price': displayPurchasePrice || 0,
            'Paper Purchase': Number((p as any).gst_purchase_price || 0),
            'MRP': displayMrp || 0,
            'Paper MRP': Number((p as any).paper_mrp || 0),
          };

          // Dynamically add tier columns with their names
          for (const tier of activeTiers) {
            const tierPrice = pricingMap[p.product_id]?.[tier.pricing_tier_id];
            row[tier.name] = tierPrice != null ? tierPrice : '';
          }

          row['Discount Percentage'] = p.discount_percent || 0;
          row['Offer Price'] = p.offer_price || 0;
          row['Real Stock'] = p.current_stock || 0;
          row['Paper Stock'] = p.paper_stock || 0;
          row['Added Date'] = p.created_at || '';

          return row;
        });

        const csvContent = Papa.unparse(dataToExport);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const csvName = filterDateEnd ? `products_${filterDate}_${filterDateEnd}.csv` : filterDate ? `products_${filterDate}.csv` : 'products_all.csv';
        link.setAttribute('download', csvName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatusMessage({ text: 'CSV Downloaded with Pricing Tiers', type: 'success' });
      } else {
        setStatusMessage({ text: 'No products to download for this date', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSave = async (retries = 3) => {
    if (!formData.name) {
      setStatusMessage({ text: 'Please fill in material Name. Purchase, MRP, and Offer are optional.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    let finalBarcode = formData.sku_barcode;
    if (!finalBarcode) {
      let prefix = formData.item_code || '';
      if (prefix.length > 12) {
        prefix = prefix.substring(0, 12);
      }
      const remainingLength = 12 - prefix.length;
      let code = prefix;
      if (remainingLength > 0) {
        const min = Math.pow(10, remainingLength - 1);
        const max = Math.pow(10, remainingLength) - 1;
        const randomPart = Math.floor(min + Math.random() * (max - min + 1)).toString();
        code += randomPart;
      }
      
      let priceCode = '';
      if (priceCoding && formData.purchase_price) {
        priceCode = encodePurchasePriceCode(formData.purchase_price);
      }
      finalBarcode = code + priceCode;
      // Don't just setFormData, pass it directly to payload since state update is async
      setFormData(prev => ({ ...prev, sku_barcode: finalBarcode }));
      setStatusMessage({ text: 'Barcode auto-generated.', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
    
    setLoading(true);

    // Normalize category: clean whitespace and resolve canonical casing from existing categories
    let normalizedCategory = (formData.category || '').trim().replace(/\s+/g, ' ');
    if (normalizedCategory) {
      const match = existingCategories.find(c => c.toLowerCase() === normalizedCategory.toLowerCase());
      if (match) {
        normalizedCategory = match;
      }
    }

    const userEnteredStock = Number(formData.current_stock) || 0;
    const userEnteredPaperStock = formData.gst_purchase_quantity !== '' && formData.gst_purchase_quantity !== null
      ? (Number(formData.gst_purchase_quantity) || 0)
      : (Number(formData.domain_attributes?.paper_stock) || 0);

    const payload = {
      ...(editingProduct ?? { product_id: uuidv4(), tenant_id: tenantId || 'unset', sync_status: 'pending', created_at: new Date().toLocaleString('en-CA', { hour12: false }).replace(', ', 'T') }),
      ...formData,
      category: normalizedCategory,
      sku_barcode: finalBarcode,
      purchase_price: Number(formData.purchase_price) || 0,
      base_price: Number(formData.base_price) || 0,
      current_stock: userEnteredStock,
      paper_stock: userEnteredPaperStock,
      reorder_level: Number(formData.reorder_level) || 0,
      is_gst_applicable: formData.is_gst_applicable || String(formData.hsn_sac_code || '').trim() !== '' ? 1 : 0,
      domain_attributes: (() => {
        const da = { ...formData.domain_attributes };
        const rawPcs = Number(da?.pcs !== undefined ? da.pcs : da?.pcs_stock) || 0;
        const rawStock = userEnteredStock;
        if (rawPcs > 0) {
          da.pcs_per_kg = rawStock > 0 ? rawPcs / rawStock : rawPcs;
        } else {
          delete da.pcs_per_kg;
        }
        const hasPaperData = (formData.gst_purchase_price !== '' && Number(formData.gst_purchase_price) > 0) ||
                             (da.paper_mrp !== undefined && da.paper_mrp !== '' && Number(da.paper_mrp) > 0) ||
                             (formData.gst_purchase_quantity !== '' && Number(formData.gst_purchase_quantity) > 0);
        const hasRealData = (formData.purchase_price !== '' && Number(formData.purchase_price) > 0) ||
                            (formData.current_stock !== '' && Number(formData.current_stock) > 0);

        if (formData.gst_purchase_quantity !== '' && formData.gst_purchase_quantity !== null) {
          da.paper_stock = Number(formData.gst_purchase_quantity) || 0;
        }

        if (formData.gst_purchase_price !== '' && formData.gst_purchase_price !== null && formData.gst_purchase_price !== undefined) {
          da.gst_purchase_price = Number(formData.gst_purchase_price) || 0;
          da.paper_purchase_price = da.gst_purchase_price;
        }

        const hasRealStockOrPricing = hasRealData || (formData.base_price !== '' && Number(formData.base_price) > 0) || Number(formData.current_stock || 0) > 0;
        const isPaperChosen = !hasRealStockOrPricing && (
          (formData.gst_type === 'PAPER') ||
          (hasPaperData && !hasRealData) ||
          (Number(formData.current_stock) <= 0 && Number(da.paper_stock || 0) > 0) ||
          (formData.show_gst_purchase && (formData.gst_purchase_is_dummy || Number(formData.gst_purchase_quantity) > 0))
        );

        da.gst_type = isPaperChosen ? 'PAPER' : 'REAL';
        if (da.paper_mrp !== undefined && da.paper_mrp !== '' && da.paper_mrp !== null) {
          da.paper_mrp = Number(da.paper_mrp);
          da.paper_base_price = Number(da.paper_mrp);
        } else {
          delete da.paper_mrp;
          delete da.paper_base_price;
        }
        return JSON.stringify(da);
      })(),
      discount_percent: formData.discount_percent === '' ? null : Number(formData.discount_percent),
      discount_flat: formData.discount_flat === '' ? null : Number(formData.discount_flat),
      offer_price: formData.offer_price === '' ? null : Number(formData.offer_price),
      billing_type: formData.billing_type,
      grade_id: formData.grade_id || null,
      pricing_mode: formData.grade_id ? 'GRADE_RATE' : 'FIXED_PRICE',
    };

    if (window.electronAPI) {
      const res = view === 'edit'
        ? await window.electronAPI.dbUpdateProduct(payload)
        : await window.electronAPI.dbAddProduct(payload);

      if (res.success) {
        // If GST Purchase details provided, create a purchase bill entry
        if (view === 'add' && formData.show_gst_purchase && formData.gst_purchase_price !== '' && Number(formData.gst_purchase_price) > 0) {
          const purchaseBillId = uuidv4();
          const itemId = uuidv4();
          const gstQty = Number(formData.gst_purchase_quantity) || 0;
          const gstPrice = Number(formData.gst_purchase_price) || 0;
          const gstTotal = gstQty * gstPrice;
          const supplierName = formData.gst_supplier_name || (suppliers.find(s => s.party_id === formData.gst_supplier_id)?.name) || 'Unknown Supplier';

          await window.electronAPI.dbAddPurchaseBill({
            purchase_bill_id: purchaseBillId,
            tenant_id: tenantId,
            bill_number: formData.gst_bill_number || `TEMP-${Date.now()}`,
            supplier_id: formData.gst_supplier_id || null,
            supplier_name: supplierName,
            bill_date: formData.gst_bill_date || new Date().toLocaleDateString('en-CA'),
            invoice_number: null,
            notes: `Auto-created from product: ${formData.name}`,
            total_amount: gstTotal,
            bill_type: 'GST',
            items: [{
              item_id: itemId,
              product_id: payload.product_id,
              name: formData.name,
              quantity: gstQty,
              purchase_price: gstPrice,
              total_amount: gstTotal,
              is_gst_applicable: payload.is_gst_applicable,
              tax_rate_percent: payload.tax_rate_percent,
              hsn_sac_code: payload.hsn_sac_code,
              skip_stock_update: 1, // Paper purchase bills must have skip_stock_update = 1 so real stock is not modified
            }],
          });
        }

        if (view === 'edit') {
          // Optimistic update for edit
          setProducts(prev => prev.map(p => p.product_id === payload.product_id ? { ...p, ...payload, current_stock: userEnteredStock, paper_stock: userEnteredPaperStock } as Product : p));
        } else {
          // Optimistic update for add
          setProducts(prev => [{ ...payload, current_stock: userEnteredStock, paper_stock: userEnteredPaperStock } as Product, ...prev]);
          setTotalCount(prev => prev !== null ? prev + 1 : null);
        }

        // Persist per-tier prices (blank = use MRP / clear stored price)
        const tierRows = Object.entries(tierPrices).map(([pricing_tier_id, price]) => ({
          pricing_tier_id,
          price: price === '' ? null : Number(price),
        }));
        if (tierRows.length > 0) {
          await window.electronAPI.dbSetProductPricing({
            tenant_id: tenantId || 'unset',
            product_id: payload.product_id,
            pricing: tierRows,
          });
        }

        // Auto-register custom categories in the Categories & Grades page so they can be managed there
        if (normalizedCategory && !existingCategories.some(c => c.toLowerCase() === normalizedCategory.toLowerCase())) {
          const cat = normalizedCategory;
          const existing = await window.electronAPI.dbGetGrades(tenantId || 'global');
          if (Array.isArray(existing) && !existing.some(g => (g.category || '').trim().toLowerCase() === cat.toLowerCase() && !String(g.grade_name || '').trim())) {
            const gradeRes = await window.electronAPI.dbAddGrade({
              grade_id: uuidv4(),
              tenant_id: tenantId || '',
              category: cat,
              grade_name: '',
              rate: Number(formData.base_price) || 0,
              purchase_price: Number(formData.purchase_price) || 0,
              offer_price: formData.offer_price === '' || formData.offer_price === null || formData.offer_price === undefined ? null : Number(formData.offer_price),
            });
            if (gradeRes.success) {
              const fresh = await window.electronAPI.dbGetGrades(tenantId || 'global');
              if (Array.isArray(fresh)) setGrades(fresh);
            }
          }
        }

        setView('list');
        loadProducts(true);
      } else if (!formData.sku_barcode && res.error?.includes('sku_barcode') && retries > 0) {
        setLoading(false);
        setFormData(prev => ({ ...prev, sku_barcode: '' }));
        setTimeout(() => handleSave(retries - 1), 100);
      } else {
        let errorMessage = res.error || 'Unknown error occurred';
        if (errorMessage.includes('UNIQUE constraint failed')) {
          if (errorMessage.includes('sku_barcode')) {
            errorMessage = 'A product with this barcode already exists.';
          } else {
            errorMessage = 'A product with this exact Name and Brand already exists.';
          }
        }
        setStatusMessage({ text: 'Failed to save: ' + errorMessage, type: 'error' });
        setTimeout(() => setStatusMessage(null), 3000);
      }
    }
    setLoading(false);
  };



  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const tz = getStoreTimezone();
    const d = parseUTCDate(dateStr);
    if (isNaN(d.getTime())) return '-';
    const [dd, mm, yyyy] = d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).split('/');
    const dayName = d.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' });
    return `${dd}/${mm}/${yyyy} ${dayName}`;
  };

  const groupedByDate = filtered.reduce<Record<string, typeof products>>((acc, p) => {
    const date = formatDate(p.created_at);
    if (!acc[date]) acc[date] = [];
    acc[date].push(p);
    return acc;
  }, {});

  const adjustProduct = adjustModal?.product ?? null;
  const adjustCurrentPcs = (() => {
    if (!adjustProduct) return 0;
    try {
      const da = JSON.parse(adjustProduct.domain_attributes || '{}');
      return Number(da.pcs_stock ?? da.pcs ?? 0) || 0;
    } catch { return 0; }
  })();

return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ═══════════════════════════════════════════════════
          HEADER with Integrated Filters
      ═══════════════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        {/* Row 1: Title & Actions (Export, Import, Close) */}
        <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              {view === 'list' ? <Package className="w-4 h-4" /> : view === 'add' ? <PackagePlus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">
                  {view === 'list' ? 'Inventory' : view === 'add' ? 'Add New Product' : `Edit: ${editingProduct?.name}`}
                </h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
              {view === 'list' && <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{totalCount !== null ? totalCount : '...'} products in stock</p>}
              {view !== 'list' && (
                <span className="text-[11px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                  {isAdminRole(useAuthStore.getState().role) ? formatRoleName(useAuthStore.getState().role) : (useAuthStore.getState().userName || 'Staff')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {view === 'list' && (
              <>
                <button
                  onClick={downloadCsv}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  title="Export CSV"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="p-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  title="Import CSV/Excel"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </>
            )}
            <RedCrossButton
              onClick={view !== 'list' ? () => setView('list') : onClose}
              title="Close"
            />
          </div>
        </div>

        {/* Row 2: Search & Filters (only in list view) */}
        {view === 'list' && (
          <div className="px-4 sm:px-6 py-3 border-t border-border/50 bg-background/50">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              
              {/* Search - Full width on mobile, flex-1 on desktop */}
              <div className="relative w-full sm:max-w-xl flex-1 min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/40 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by name, barcode, brand, or category..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-11 pr-11 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-medium text-foreground"
                />
                {isSearching ? (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setDebouncedSearchQuery('');
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4 text-destructive" />
                  </button>
                ) : null}
              </div>

              {/* Filter Controls - Horizontal row */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                
                {/* View Mode */}
                <div className="relative">
                  <label className="sr-only">View Mode</label>
                  <Select
                    value={viewMode}
                    onChange={v => {
                      setViewMode(v as any);
                      window.electronAPI?.settingsSet({ tenant_id: tenantId || 'global', key: 'inventory_default_view', value: v }).catch(console.error);
                    }}
                    options={[
                      { value: 'estimate', label: 'Estimate' },
                      { value: 'gst', label: 'GST' },
                      { value: 'combined', label: 'All Products' },
                    ]}
                    className="min-w-[130px]"
                    triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-3 py-2 rounded-lg h-auto text-xs font-medium bg-background"
                    renderOption={(option, isSelected) => (
                      <div className="flex items-center gap-2 py-1">
                        <span className={clsx(
                          'w-2.5 h-2.5 rounded-full shrink-0',
                          option.value === 'estimate' && 'bg-amber-500',
                          option.value === 'gst' && 'bg-sky-500',
                          option.value === 'combined' && 'bg-primary'
                        )} />
                        <span className={clsx(isSelected && "font-semibold text-sm")}>{option.label}</span>
                      </div>
                    )}
                  />
                </div>

                {/* Date Range */}
                <div className="relative hidden sm:block">
                  <DateRangeFilter
                    startDate={filterDate}
                    endDate={filterDateEnd}
                    onChange={(start, end) => {
                      setFilterDate(start);
                      setFilterDateEnd(end);
                    }}
                  />
                </div>

                {/* Stock Status */}
                <div className="relative">
                  <label className="sr-only">Stock Status</label>
                  <Select
                    value={stockFilter}
                    onChange={v => setStockFilter(v as any)}
                    options={[
                      { value: 'all', label: 'All Stock', icon: Layers, color: 'text-primary' },
                      { value: 'in_stock', label: 'In Stock', icon: CheckCircle2, color: 'text-emerald-500' },
                      { value: 'low_stock', label: 'Low Stock', icon: AlertTriangle, color: 'text-amber-500' },
                      { value: 'out_of_stock', label: 'Out of Stock', icon: AlertCircle, color: 'text-red-500' },
                      { value: 'no_barcode', label: 'No Barcode', icon: Tag, color: 'text-orange-500' },
                    ]}
                    className="min-w-[135px]"
                    triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-3 py-2 rounded-lg h-auto text-xs font-medium bg-background"
                    renderOption={(option, isSelected) => {
                      const Icon = option.icon;
                      return (
                        <div className="flex items-center gap-2 py-1">
                          {Icon && <Icon className={clsx('w-3.5 h-3.5 shrink-0', option.color)} />}
                          <span className={clsx(isSelected && "font-semibold text-sm")}>{option.label}</span>
                        </div>
                      );
                    }}
                  />
                </div>

                {/* Sort By */}
                <div className="relative hidden md:block">
                  <label className="sr-only">Sort By</label>
                  <Select
                    value={sortBy}
                    onChange={v => setSortBy(v as any)}
                    options={[
                      { value: 'name', label: 'Sort by Name' },
                      { value: 'created_at', label: 'Sort by Date Added' },
                      { value: 'updated_at', label: 'Sort by Date Updated' },
                      { value: 'stock', label: 'Sort by Stock (Low to High)' },
                    ]}
                    className="min-w-[160px]"
                    triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-3 py-2 rounded-lg h-auto text-xs font-medium bg-background"
                  />
                </div>

                {/* Primary Action - Add Product */}
                <button
                  onClick={openAdd}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground shadow-sm font-semibold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2 px-4 cursor-pointer shrink-0 whitespace-nowrap text-sm ml-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Product</span>
                </button>

              </div>

            </div>

            {/* Secondary Actions Row - Bulk Delete only (when items selected) */}
            {selectedProductIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50 hidden sm:flex">
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive text-destructive-foreground shadow-sm font-medium hover:bg-destructive/90 transition-all duration-200 active:scale-95 py-2 px-3 cursor-pointer shrink-0 whitespace-nowrap text-xs animate-in fade-in"
                >
                  <Trash className="w-3.5 h-3.5" />
                  <span>Delete ({selectedProductIds.size})</span>
                </button>
              </div>
            )}

          </div>
        )}
      </header>

      {/* ── PRODUCT LIST VIEW ────────────────────────────────────────────── */}
      <div className={`flex-1 px-4 sm:px-6 pb-6 pt-3 bg-muted/[0.02] w-full select-none flex flex-col min-h-0 bg-background${view !== 'list' ? ' hidden' : ''}`}>
        <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          {/* Table Header - Fixed at Top */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3.5 bg-muted/20 dark:bg-muted/10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border select-none shrink-0">
            <div className="col-span-3 text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={el => {
                  if (el) el.indeterminate = isSomeSelected;
                }}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer accent-primary shrink-0"
                title={isAllSelected ? "Deselect all" : "Select all visible products"}
              />
              <span>Product</span>
            </div>
            <div className="col-span-1 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">Purchase</div>
            <div className="col-span-1 text-right text-xs font-black text-muted-foreground uppercase tracking-widest">MRP</div>
            <div className="col-span-1 text-right text-xs font-black text-emerald-500 uppercase tracking-widest">Final</div>
            <div className="col-span-2 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">Real Stock</div>
            <div className="col-span-2 text-center text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest">Paper Stock</div>
            <div className="col-span-2 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">Actions</div>
          </div>

          {/* Scrollable Rows Container */}
          <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto divide-y divide-border relative">
            {isFetching && offset === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`skel-${i}`} className="grid grid-cols-12 gap-3 px-6 py-4 items-center">
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="space-y-2 w-full">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <div className="flex gap-2 mt-1">
                          <Skeleton className="h-4 w-12" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-4 w-16" /></div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-4 w-16" /></div>
                  <div className="col-span-1 flex justify-end"><Skeleton className="h-4 w-12" /></div>
                  <div className="col-span-2 flex justify-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="col-span-2 flex justify-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                <PackagePlus className="w-12 h-12 mb-3" />
                <p className="font-medium text-foreground">No products found</p>
                <p className="text-sm mt-1">
                  {stockFilter !== 'all' ? `No products match "${stockFilter === 'low_stock' ? 'Low Stock' : stockFilter === 'out_of_stock' ? 'Out of Stock' : stockFilter === 'no_barcode' ? 'No Barcode' : 'In Stock'}" filter` : 'Click "Add Product" to seed your inventory'}
                </p>
              </div>
            ) : Object.entries(groupedByDate).map(([date, items]) => (
              <Fragment key={date}>
                <div className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border shadow-2xs">
                  {date}
                </div>
                {items.map(p => {
                  const isLowStock = p.current_stock <= p.reorder_level && p.reorder_level > 0;
                  
                  let finalPrice: number | null = null;
                  const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
                  const gradeRate = appliedGrade ? Number(appliedGrade.rate) : null;
                  const displayMrp = gradeRate !== null && p.pricing_mode === 'GRADE_RATE' 
                    ? gradeRate 
                    : Number(p.base_price);
                  const displayPurchasePrice = appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined
                    ? Number(appliedGrade.purchase_price)
                    : Number(p.purchase_price);

                  if (p.offer_price) {
                    finalPrice = Number(p.offer_price);
                  } else if (p.discount_flat) {
                    finalPrice = displayMrp - Number(p.discount_flat);
                  } else if (p.discount_percent) {
                    finalPrice = displayMrp * (1 - Number(p.discount_percent) / 100);
                  }
                  if (finalPrice !== null && isNaN(finalPrice)) finalPrice = null;

                  const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
                  const pcsPerKg = Number(da.pcs_per_kg) || 0;
                  const totalPcs = da.pcs_stock !== undefined
                    ? (Number(da.pcs_stock) || 0)
                    : (pcsPerKg > 0 ? Math.round(Number(p.current_stock) * pcsPerKg) : (Number(da.pcs) || 0));
                  const isWeightUom = ['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(p.uom);
                  const formattedStock = isWeightUom 
                    ? `${Number(p.current_stock).toFixed(3)} ${p.uom}`
                    : `${Number(p.current_stock).toFixed(0)} ${p.uom}`;

                  const hasPaperStock = Number(p.paper_stock || da.paper_stock || 0) > 0;
                  const isPaperProduct = Boolean(enableRealPaperStock) && (da.gst_type === 'PAPER' || hasPaperStock);

                  const paperPurPrice = isPaperProduct
                    ? Number(da.paper_purchase_price || (da.gst_type === 'PAPER' ? ((p as any).gst_purchase_price || da.gst_purchase_price) : 0) || (p as any).paper_purchase_price || 0)
                    : 0;
                  const paperMrpPrice = isPaperProduct
                    ? Number((p as any).paper_mrp || da.paper_mrp || da.paper_base_price || 0)
                    : 0;

                  const isGstFlag = isGstProduct(p);

                  return (
                    <div
                      id={`product-row-${p.product_id}`}
                      key={p.product_id}
                      className={clsx(
                        "border-b border-border last:border-b-0 transition-all duration-300 hover:bg-muted/10 grid grid-cols-12 gap-3 px-6 py-3.5 items-center bg-card group",
                        selectedProductIds.has(p.product_id) && "bg-primary/5 dark:bg-primary/10",
                        highlightedProductId === p.product_id && "ring-2 ring-primary/60 bg-primary/5 dark:bg-primary/10 shadow-sm"
                      )}
                    >
                      <div className="col-span-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(p.product_id)}
                            onChange={() => toggleSelectProduct(p.product_id)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer accent-primary shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ScrollText text={p.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')} className="flex-1 text-foreground font-bold text-sm min-w-0" />
                            </div>
                            <p className="text-muted-foreground text-xs font-mono mt-0.5 truncate">
                              {p.item_code && <span className="font-bold mr-2 text-primary">{p.item_code}</span>}
                              {p.sku_barcode}
                            </p>
                            <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                              {p.category && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.category}</span>}
                              {p.brand_manufacturer && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.brand_manufacturer}</span>}
                              {showPriceTiersInInventory && allProductPricingMap[p.product_id] && Object.entries(allProductPricingMap[p.product_id]).map(([tid, tPrice]) => {
                                const tier = activePricingTiers.find(t => t.pricing_tier_id === tid);
                                if (!tier) return null;
                                return (
                                  <span key={tid} className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 px-1.5 py-0.5 rounded font-bold">
                                    {tier.name}: ₹{tPrice}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-muted-foreground text-sm font-semibold flex flex-col items-end justify-center">
                        <span>₹{displayPurchasePrice.toFixed(2)}</span>
                        {appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined && (
                          <span className="text-[9px] text-indigo-500 font-semibold leading-tight mt-0.5">Grade Purchase</span>
                        )}
                        {paperPurPrice > 0 && (
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold leading-tight mt-0.5" title="Paper Purchase Price">
                            Paper: ₹{paperPurPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 flex flex-col items-end justify-center text-right">
                        <span className={clsx("text-sm", finalPrice !== null ? 'line-through text-muted-foreground/60' : 'text-primary font-bold')}>
                          ₹{displayMrp.toFixed(2)}
                        </span>
                        {gradeRate !== null && p.pricing_mode === 'GRADE_RATE' && (
                          <span className="text-[10px] text-indigo-500 font-semibold leading-tight mt-0.5 text-right">
                            Grade Rate: ₹{gradeRate}
                          </span>
                        )}
                        {paperMrpPrice > 0 && (
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold leading-tight mt-0.5" title="Paper MRP">
                            Paper: ₹{paperMrpPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 text-right text-emerald-500 font-bold text-sm">
                        {finalPrice !== null ? `₹${finalPrice.toFixed(2)}` : '-'}
                      </div>

                      {/* Real Stock with +/- */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button 
                          onClick={() => { if (['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(p.uom)) openAdjustDialog(p, 'reduce'); else applyStockAdjust(p, -1); }} 
                          disabled={adjustingStockId === p.product_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-background border border-border text-muted-foreground hover:bg-muted hover:text-destructive transition-all active:scale-90 disabled:opacity-50 cursor-pointer"
                          title="Reduce Real Stock"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={clsx('text-sm font-black flex flex-col items-center justify-center leading-tight min-w-[62px]', isLowStock ? 'text-amber-500' : p.current_stock <= 0 ? 'text-red-500' : 'text-foreground')}>
                          {adjustingStockId === p.product_id ? (
                             <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                             <>
                               <span>{formattedStock}</span>
                               {totalPcs > 0 && <span className="text-[10px] text-muted-foreground/50 font-medium">{totalPcs} pcs</span>}
                               {p.current_stock <= 0 ? (
                                 <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-bold mt-0.5">
                                   <AlertCircle className="w-2.5 h-2.5" /> Out of Stock
                                 </span>
                               ) : isLowStock ? (
                                 <span className="flex items-center gap-0.5 text-[10px] text-amber-500 font-bold mt-0.5">
                                   <AlertTriangle className="w-2.5 h-2.5" /> Low
                                 </span>
                               ) : null}
                             </>
                          )}
                        </span>
                        <button 
                          onClick={() => { if (['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(p.uom)) openAdjustDialog(p, 'add'); else applyStockAdjust(p, 1); }} 
                          disabled={adjustingStockId === p.product_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-background border border-border text-muted-foreground hover:bg-muted hover:text-emerald-500 transition-all active:scale-90 disabled:opacity-50 cursor-pointer"
                          title="Add Real Stock"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Paper Stock */}
                      <div className="col-span-2 flex flex-col items-center justify-center text-center">
                        {(() => {
                          const displayPaperStock = Number(p.paper_stock !== undefined && p.paper_stock !== null ? p.paper_stock : (da.paper_stock || 0));
                          return displayPaperStock > 0 ? (
                            <span className="text-xs font-black text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/25 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs" title="Paper Stock from Dummy GST purchases">
                              <Package className="w-3 h-3" />
                              {displayPaperStock} {p.uom}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground/35">
                              0 {p.uom}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button onClick={() => { setPrintModalProduct(p); setPrintQuantity(1); setPrintPrice(true); }} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Print Barcode">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(p)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors cursor-pointer" title="Delete">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}

            {/* Infinite Scroll Sentinel & Loader */}
            <div ref={sentinelRef} className="w-full shrink-0 min-h-[1px]">
              {isFetching && offset > 0 && (
                <div className="py-6 flex justify-center items-center">
                  <div className="flex gap-2 items-center text-muted-foreground text-sm font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Loading next 50 products...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!hasMore && products.length > 0 && (
            <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-4 text-center text-sm font-bold text-muted-foreground">
              End of inventory list &middot; {totalCount !== null ? totalCount : products.length} total products
            </div>
          )}
          
          {/* Low Stock summary bar */}
          {showLowStockAlert && products.some(p => p.current_stock <= p.reorder_level && p.reorder_level > 0) && (
            <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{products.filter(p => p.current_stock <= p.reorder_level && p.reorder_level > 0).length} item(s) at or below Low Stock Alert</span>
              {stockFilter !== 'low_stock' && (
                <button
                  onClick={() => setStockFilter('low_stock')}
                  className="px-2.5 py-1 text-xs font-extrabold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer"
                >
                  Filter Low Stock
                </button>
              )}
              <button onClick={() => setShowLowStockAlert(false)} className="p-1 rounded-md border border-amber-500/30 hover:bg-amber-500/15 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── ADD / EDIT FORM VIEW ─────────────────────────────────────────── */}
      {(view === 'add' || view === 'edit') && (
        <InventoryFormView
          view={view}
          loading={loading}
          handleFormKeyDown={handleFormKeyDown}
          firstInputRef={firstInputRef}
          formData={formData}
          handleInputChange={handleInputChange}
          handleDomainAttrChange={handleDomainAttrChange}
          generateBarcode={generateBarcode}
          categoryContainerRef={categoryContainerRef}
          showCategorySuggestions={showCategorySuggestions}
          setShowCategorySuggestions={setShowCategorySuggestions}
          categorySuggestions={categorySuggestions}
          selectedCategoryIndex={selectedCategoryIndex}
          setSelectedCategoryIndex={setSelectedCategoryIndex}
          selectCategorySuggestion={selectCategorySuggestion}
          handleCategoryKeyDown={handleCategoryKeyDown}
          nameContainerRef={nameContainerRef}
          nameSuggestions={nameSuggestions}
          selectedNameIndex={selectedNameIndex}
          setSelectedNameIndex={setSelectedNameIndex}
          selectNameSuggestion={selectNameSuggestion}
          handleNameKeyDown={handleNameKeyDown}
          categoryGrades={categoryGrades}
          isAddingGrade={isAddingGrade}
          setIsAddingGrade={setIsAddingGrade}
          grades={grades}
          handleDiscountPercentChange={handleDiscountPercentChange}
          handleDiscountFlatChange={handleDiscountFlatChange}
          handleOfferPriceChange={handleOfferPriceChange}
          activePricingTiers={activePricingTiers}
          tierPrices={tierPrices}
          setTierPrices={setTierPrices}
          enableRealPaperStock={enableRealPaperStock}
          showSupplierCreate={showSupplierCreate}
          setShowSupplierCreate={setShowSupplierCreate}
          supplierSearch={supplierSearch}
          setSupplierSearch={setSupplierSearch}
          suppliers={suppliers}
          filteredSuppliers={filteredSuppliers}
          newSupplierName={newSupplierName}
          setNewSupplierName={setNewSupplierName}
          newSupplierPhone={newSupplierPhone}
          setNewSupplierPhone={setNewSupplierPhone}
          newSupplierAddress={newSupplierAddress}
          setNewSupplierAddress={setNewSupplierAddress}
          handleCreateSupplier={handleCreateSupplier}
          labelCodeType={labelCodeType}
          qrPreviewUrl={qrPreviewUrl}
          printQuantity={printQuantity}
          setPrintQuantity={setPrintQuantity}
          printPrice={printPrice}
          setPrintPrice={setPrintPrice}
          printBarcode={printBarcode}
          handleSave={handleSave}
          setView={setView}
          setFormData={setFormData}
        />
      )}

      <CreateGradeModal
        isOpen={isAddingGrade}
        onClose={() => { setIsAddingGrade(false); setNewGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
        category={formData.category}
        newGradeForm={newGradeForm}
        setNewGradeForm={setNewGradeForm}
        handleCreateGrade={handleCreateGrade}
        savingGrade={savingGrade}
        handleFormKeyDown={handleFormKeyDown}
      />

      <AdjustStockModal
        adjustModal={adjustModal}
        setAdjustModal={setAdjustModal}
        adjustAmount={adjustAmount}
        setAdjustAmount={setAdjustAmount}
        adjustPcs={adjustPcs}
        setAdjustPcs={setAdjustPcs}
        adjustCurrentPcs={adjustCurrentPcs}
        confirmAdjustStock={confirmAdjustStock}
        adjustingStockId={adjustingStockId}
      />

      <BarcodePrintModal
        printModalProduct={printModalProduct}
        onClose={() => { setPrintModalProduct(null); setStatusMessage(null); }}
        labelCodeType={labelCodeType}
        printPrice={printPrice}
        setPrintPrice={setPrintPrice}
        printQuantity={printQuantity}
        setPrintQuantity={setPrintQuantity}
        printProductLabel={printProductLabel}
        grades={grades}
      />

      <DeleteProductModal
        deleteConfirmProduct={deleteConfirmProduct}
        onClose={() => setDeleteConfirmProduct(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      <BulkDeleteProductsModal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        selectedCount={selectedProductIds.size}
        onConfirm={handleConfirmBulkDelete}
        isBulkDeleting={isBulkDeleting}
      />

      {/* ─── FLOATING TOASTS ─── */}
      <div className="fixed bottom-5 left-5 z-[9999] flex flex-col items-start gap-2 w-full max-w-md pointer-events-none">
        {statusMessage && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className={clsx("p-2 rounded-xl shrink-0", statusMessage.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
                {statusMessage.type === 'success' ? 'INVENTORY STATUS' : 'INVENTORY ALERT'}
              </span>
              <span className="text-white font-bold text-xs block leading-tight">{statusMessage.text}</span>
            </div>
            <RedCrossButton onClick={() => setStatusMessage(null)} size="sm" />
          </div>
        )}
      </div>

      <DataUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        defaultEntity="products"
        allowedEntities={['products']}
        hideEntityTabs={true}
        onImportSuccess={() => {
          setOffset(0);
          offsetRef.current = 0;
          loadProducts(true);
          refreshProductPricing();
          setStatusMessage({ text: 'Products imported successfully!', type: 'success' });
        }}
      />
    </div>
  );
}

