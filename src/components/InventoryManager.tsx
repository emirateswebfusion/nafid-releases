import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from 'react';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { PackagePlus, Pencil, Save, Printer, RefreshCw, Search, Plus, Minus, Trash, AlertTriangle, X, Package, Tag, CheckCircle2, AlertCircle, Receipt, Building2, IndianRupee, FileText, Check, BarChart3, Loader2, Layers } from 'lucide-react';
import Barcode from 'react-barcode';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
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

// ─── Types ─────────────────────────────────────────────────────────────────
interface Product {
  product_id: string;
  tenant_id: string;
  name: string;
  item_code: string;
  sku_barcode: string;
  category: string;
  brand_manufacturer: string;
  uom: string;
  purchase_price: number;
  base_price: number;
  current_stock: number;
  reorder_level: number;
  is_gst_applicable: number;
  hsn_sac_code: string;
  tax_rate_percent: number;
  domain_attributes: string; // JSON string from SQLite
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  billing_type?: string;
  grade_id?: string;
  pricing_mode?: string;
  is_service_item?: number;
  sync_status: string;
  created_at?: string;
  updated_at?: string;
  paper_stock?: number;
}

const DEFAULT_FORM = {
  item_code: '',
  sku_barcode: '',
  name: '',
  category: '',
  brand_manufacturer: '',
  uom: 'Pcs',
  purchase_price: '' as string | number,
  base_price: '' as string | number,
  current_stock: '' as string | number,
  reorder_level: '' as string | number,
  is_gst_applicable: false,
  hsn_sac_code: '',
  tax_rate_percent: 0,
  domain_attributes: {} as Record<string, any>,
  discount_percent: '' as string | number | null,
  discount_flat: '' as string | number | null,
  offer_price: '' as string | number | null,
  billing_type: 'PIECE',
  grade_id: '',
  pricing_mode: 'FIXED_PRICE',
  show_gst_purchase: false,
  gst_same_as_current: false,
  gst_purchase_price: '' as string | number,
  gst_purchase_quantity: '' as string | number,
  gst_supplier_id: '',
  gst_supplier_name: '',
  gst_bill_number: '',
  gst_bill_date: new Date().toLocaleDateString('en-CA'),
  gst_purchase_is_dummy: false,
};

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
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'updated_at' | 'stock'>('created_at');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const firstInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
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
  const searchQueryRef = useRef(searchQuery);
  const sortByRef = useRef(sortBy);
  const stockFilterRef = useRef(stockFilter);
  const filterDateRef = useRef(filterDate);
  const filterDateEndRef = useRef(filterDateEnd);
  const offsetRef = useRef(offset);

  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { sortByRef.current = sortBy; }, [sortBy]);
  useEffect(() => { stockFilterRef.current = stockFilter; }, [stockFilter]);
  useEffect(() => { filterDateRef.current = filterDate; }, [filterDate]);
  useEffect(() => { filterDateEndRef.current = filterDateEnd; }, [filterDateEnd]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // Focus search input on open / view switch
  useEffect(() => {
    if (view === 'list') {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [view]);

  // Load products when search or sort or stock filter changes (reset)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setOffset(0);
      setHasMore(true);
      loadProducts(true);
    }, 300); // debounce search
    return () => clearTimeout(timeout);
  }, [searchQuery, sortBy, filterDate, filterDateEnd, stockFilter]);

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

  useEffect(() => {
    if (window.electronAPI) {
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
      window.electronAPI.dbGetNextPurchaseBillNumber({ tenant_id: tenantId || 'global' })
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
    setIsFetching(true);
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      // Always read the latest values from refs to avoid stale-closure bugs
      // (e.g. the sync listener is registered once and must not use old state).
      const currentSearch = searchQueryRef.current;
      const currentSortBy = sortByRef.current;
      const currentStockFilter = stockFilterRef.current;
      const currentFilterDate = filterDateRef.current;
      const currentFilterDateEnd = filterDateEndRef.current;
      const currentOffset = reset ? 0 : offsetRef.current;

      const result = await window.electronAPI.dbGetProducts({
        tenant_id: tenantId,
        limit: LIMIT,
        offset: currentOffset,
        search: currentSearch,
        sortBy: currentSortBy,
        filterDate: currentFilterDate,
        filterDateEnd: currentFilterDateEnd,
        stockStatus: currentStockFilter
      });

      if (reset) {
        const count = await window.electronAPI.dbGetProductsCount({
          tenant_id: tenantId,
          search: currentSearch,
          filterDate: currentFilterDate,
          filterDateEnd: currentFilterDateEnd,
          stockStatus: currentStockFilter
        });
        setTotalCount(count);
      }

      if (Array.isArray(result)) {
        const sortedResult = currentSearch ? sortProductsBySearchPriority(result, currentSearch) : result;
        if (reset) {
          setProducts(sortedResult);
        } else {
          setProducts(prev => {
             // filter out duplicates just in case
             const existingIds = new Set(prev.map(p => p.product_id));
             const merged = [...prev, ...sortedResult.filter(p => !existingIds.has(p.product_id))];
             return currentSearch ? sortProductsBySearchPriority(merged, currentSearch) : merged;
          });
        }
        setOffset(currentOffset + result.length);
        setHasMore(result.length === LIMIT);
      }
    }
    setIsFetching(false);
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

  // ── Intersection Observer for infinite scrolling ──
  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isFetching || !hasMore || view !== 'list') return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadProducts(false);
      }
    }, { threshold: 1.0 });

    if (node) observer.current.observe(node);
  }, [isFetching, hasMore, view, offset]);

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
      reorder_level: product.reorder_level ?? '',
      is_gst_applicable: product.is_gst_applicable === 1,
      hsn_sac_code: product.hsn_sac_code || '',
      tax_rate_percent: product.tax_rate_percent || 0,
      domain_attributes: (() => {
        try {
          const da = JSON.parse(product.domain_attributes || '{}');
          const pcsVal = da.pcs !== undefined ? da.pcs : (da.pcs_stock !== undefined ? da.pcs_stock : '');
          da.pcs = pcsVal;
          da.pcs_stock = pcsVal;
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
      gst_purchase_price: '' as string | number,
      gst_purchase_quantity: '' as string | number,
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

      // Staff Operational Option Check: If biller does NOT have OPT_VIEW_GST permission, restrict viewing to GST products ONLY
      const { role, restrictedPage } = useAuthStore.getState();
      if (role === 'BILLER') {
        const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
        const hasOptViewGst = permissions.includes('OPT_VIEW_GST');
        if (!hasOptViewGst && Number(p.is_gst_applicable) !== 1) {
          return false;
        }
      }

      // GST/Estimate membership follows the manual GST Product toggle only.
      if (viewMode === 'estimate' && Number(p.is_gst_applicable) === 1) return false;
      if (viewMode === 'gst' && Number(p.is_gst_applicable) !== 1) return false;

      // Stock status filter
      if (stockFilter === 'low_stock') {
        if (!(Number(p.current_stock) <= Number(p.reorder_level) && Number(p.reorder_level) > 0 && Number(p.current_stock) > 0)) return false;
      } else if (stockFilter === 'out_of_stock') {
        if (Number(p.current_stock) > 0) return false;
      } else if (stockFilter === 'in_stock') {
        if (Number(p.current_stock) <= 0) return false;
      }

      return true;
    }),
    [products, viewMode, stockFilter]
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
      localStorage.setItem('printBarcodeName', formData.name);

      const res = await window.electronAPI.printBarcode(
        tenantId || 'global', 
        formData.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        formData.name, 
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
      localStorage.setItem('printBarcodeName', p.name);

      const res = await window.electronAPI.printBarcode(
        tenantId || 'global', 
        p.sku_barcode, 
        printPrice ? effectiveMrp : undefined, 
        p.name, 
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
      const result = await window.electronAPI.dbGetProducts({
        tenant_id: tenantId,
        filterDate: filterDate,
        filterDateEnd: filterDateEnd,
        stockStatus: stockFilterRef.current,
        limit: 100000 
      });
      if (Array.isArray(result) && result.length > 0) {
        const headers = ['Name', 'Item Code', 'Barcode', 'Category', 'Brand', 'UOM', 'Purchase Price', 'MRP', 'Discount Percentage', 'Offer Price', 'Current Stock', 'Added Date'];
        const csvContent = [
          headers.join(','),
          ...result.map(p => {
            const appliedGrade = p.grade_id ? grades.find(g => g.grade_id === p.grade_id) : null;
            const displayPurchasePrice = appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined ? Number(appliedGrade.purchase_price) : Number(p.purchase_price);
            const displayMrp = appliedGrade && p.pricing_mode === 'GRADE_RATE' ? Number(appliedGrade.rate) : Number(p.base_price);
            return `"${(p.name || '').replace(/"/g, '""')}","${p.item_code || ''}","${p.sku_barcode || ''}","${p.category || ''}","${p.brand_manufacturer || ''}","${p.uom || ''}",${displayPurchasePrice || 0},${displayMrp || 0},${p.discount_percent || 0},${p.offer_price || 0},${p.current_stock || 0},"${p.created_at || ''}"`;
          })
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const csvName = filterDateEnd ? `products_${filterDate}_${filterDateEnd}.csv` : filterDate ? `products_${filterDate}.csv` : 'products_all.csv';
        link.setAttribute('download', csvName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatusMessage({ text: 'CSV Downloaded', type: 'success' });
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

    const payload = {
      ...(editingProduct ?? { product_id: uuidv4(), tenant_id: tenantId || 'unset', sync_status: 'pending', created_at: new Date().toLocaleString('en-CA', { hour12: false }).replace(', ', 'T') }),
      ...formData,
      category: normalizedCategory,
      sku_barcode: finalBarcode,
      purchase_price: Number(formData.purchase_price) || 0,
      base_price: Number(formData.base_price) || 0,
      current_stock: (view === 'add' && formData.show_gst_purchase)
        ? 0
        : (Number(formData.current_stock) || 0),
      reorder_level: Number(formData.reorder_level) || 0,
      is_gst_applicable: formData.is_gst_applicable ? 1 : 0,
      domain_attributes: (() => {
        const da = { ...formData.domain_attributes };
        const rawPcs = Number(da?.pcs !== undefined ? da.pcs : da?.pcs_stock) || 0;
        const rawStock = (view === 'add' && formData.show_gst_purchase)
          ? 0
          : (Number(formData.current_stock) || 0);
        if (rawPcs > 0) {
          da.pcs_per_kg = rawStock > 0 ? rawPcs / rawStock : rawPcs;
        } else {
          delete da.pcs_per_kg;
        }
        da.pcs_stock = rawPcs > 0 ? rawPcs : 0;
        da.pcs = rawPcs > 0 ? rawPcs : 0;
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
              skip_stock_update: formData.gst_purchase_is_dummy ? 1 : 0,
            }],
          });
        }

        if (view === 'edit') {
          // Optimistic update for edit
          setProducts(prev => prev.map(p => p.product_id === payload.product_id ? { ...p, ...payload } as Product : p));
        } else {
          // Optimistic update for add
          const finalStock = formData.show_gst_purchase
            ? (formData.gst_purchase_is_dummy ? 0 : (Number(formData.gst_purchase_quantity) || 0))
            : (Number(formData.current_stock) || 0);
          setProducts(prev => [{ ...payload, current_stock: finalStock } as Product, ...prev]);
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
          HEADER
      ═══════════════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
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
            <RedCrossButton
              onClick={view !== 'list' ? () => setView('list') : onClose}
              title="Close"
            />
          </div>
        </div>
      </header>
      
      {/* Action Header inside page */}
      {view === 'list' && (
        <div className="w-full px-4 sm:px-6 pt-4 select-none shrink-0">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 select-none">
          <div className="relative w-full sm:max-w-xs flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, barcode, brand, or category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-destructive" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner select-none shrink-0">
            {([
              { mode: 'estimate' as const, label: 'Estimate', icon: Receipt, color: 'text-amber-500' },
              { mode: 'gst' as const,      label: 'GST',      icon: FileText, color: 'text-sky-500' },
              { mode: 'combined' as const, label: 'All',      icon: BarChart3, color: 'text-primary' },
            ]).map(({ mode, label, icon: Icon, color }) => (
              <button
                key={mode}
                onClick={() => {
                  setViewMode(mode);
                  window.electronAPI?.settingsSet({ tenant_id: tenantId || 'global', key: 'inventory_default_view', value: mode }).catch(console.error);
                }}
                className={clsx(
                  "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                  viewMode === mode
                    ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className={clsx('w-3.5 h-3.5', viewMode === mode ? 'text-primary' : color)} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter
              startDate={filterDate}
              endDate={filterDateEnd}
              onChange={(start, end) => {
                setFilterDate(start);
                setFilterDateEnd(end);
              }}
            />
            <div className="h-5 w-px bg-border" />
            <Select
              value={stockFilter}
              onChange={v => setStockFilter(v as any)}
              options={[
                { value: 'all', label: 'All Stock' },
                { value: 'low_stock', label: 'Low Stock' },
                { value: 'out_of_stock', label: 'Out of Stock' },
                { value: 'in_stock', label: 'In Stock' },
              ]}
              className="min-w-[145px]"
              triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-4 py-2.5 rounded-xl h-auto text-sm font-medium"
              renderOption={(option, isSelected) => (
                <div className="flex items-center gap-2">
                  {option.value === 'low_stock' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  {option.value === 'out_of_stock' && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  {option.value === 'in_stock' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  {option.value === 'all' && <Layers className="w-3.5 h-3.5 text-primary shrink-0" />}
                  <span className={clsx(isSelected && "font-bold")}>{option.label}</span>
                </div>
              )}
            />
            <Select
              value={sortBy}
              onChange={v => setSortBy(v as any)}
              options={[
                { value: 'name', label: 'Sort by Name' },
                { value: 'created_at', label: 'Sort by Date Added' },
                { value: 'updated_at', label: 'Sort by Date Updated' },
                { value: 'stock', label: 'Sort by Stock (Low to High)' },
              ]}
              className="min-w-[180px]"
              triggerClassName="border-border hover:border-muted-foreground/30 shadow-none px-4 py-2.5 rounded-xl h-auto text-sm font-medium"
            />
            <button onClick={downloadCsv} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-input bg-background text-foreground shadow-sm font-bold hover:bg-secondary hover:text-secondary-foreground transition-all duration-200 active:scale-95 py-2.5 px-5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0" title="Download CSV">
              <Save className="w-4 h-4" />
            </button>
            {selectedProductIds.size > 0 && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-destructive text-destructive-foreground shadow-sm font-bold hover:bg-destructive/90 transition-all duration-200 active:scale-95 py-2.5 px-4 cursor-pointer text-xs shrink-0 animate-in fade-in"
              >
                <Trash className="w-4 h-4" /> Delete ({selectedProductIds.size})
              </button>
            )}
            <button onClick={openAdd} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2.5 px-5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ── PRODUCT LIST VIEW ────────────────────────────────────────────── */}
      <div className={`flex-1 px-4 sm:px-6 pb-6 pt-3 bg-muted/[0.02] w-full select-none flex flex-col min-h-0 bg-background${view !== 'list' ? ' hidden' : ''}`}>
        <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          {/* Table Header - Fixed at Top */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3.5 bg-muted/20 dark:bg-muted/10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border select-none shrink-0">
            <div className="col-span-4 text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2.5">
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
            <div className="col-span-3 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">Stock</div>
            <div className="col-span-2 text-center text-xs font-black text-muted-foreground uppercase tracking-widest">Actions</div>
          </div>

          {/* Scrollable Rows Container */}
          <div ref={listScrollRef} className="flex-1 overflow-y-auto divide-y divide-border relative">
            {isFetching && offset === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`skel-${i}`} className="grid grid-cols-12 gap-3 px-6 py-4 items-center">
                  <div className="col-span-4">
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
                  <div className="col-span-3 flex justify-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-6 w-6 rounded-full" />
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
                  {stockFilter !== 'all' ? `No products match "${stockFilter === 'low_stock' ? 'Low Stock' : stockFilter === 'out_of_stock' ? 'Out of Stock' : 'In Stock'}" filter` : 'Click "Add Product" to seed your inventory'}
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

                  const isGstFlag = Number(p.is_gst_applicable) === 1;

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
                      <div className="col-span-4">
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
                              {/\s*\((GST|EST|Estimate)\)$/i.test(p.name) && (
                                <span className={clsx(
                                  "text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border uppercase select-none leading-none shrink-0",
                                  p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1].toUpperCase() === 'GST'
                                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                )}>
                                  {p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                                </span>
                              )}
                            </div>
                            <p className="text-muted-foreground text-xs font-mono mt-0.5 truncate">
                              {p.item_code && <span className="font-bold mr-2 text-primary">{p.item_code}</span>}
                              {p.sku_barcode}
                            </p>
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              {p.category && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.category}</span>}
                              {p.brand_manufacturer && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{p.brand_manufacturer}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-muted-foreground text-sm font-semibold flex flex-col items-end">
                        <span>₹{displayPurchasePrice.toFixed(2)}</span>
                        {appliedGrade && p.pricing_mode === 'GRADE_RATE' && appliedGrade.purchase_price !== undefined && (
                          <span className="text-[9px] text-indigo-500 font-semibold leading-tight mt-0.5">Grade Purchase</span>
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
                      </div>
                      <div className="col-span-1 text-right text-emerald-500 font-bold text-sm">
                        {finalPrice !== null ? `₹${finalPrice.toFixed(2)}` : '-'}
                      </div>

                      {/* Stock with +/- */}
                      <div className="col-span-3 flex items-center justify-center gap-1">
                        <button 
                          onClick={() => { if (['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(p.uom)) openAdjustDialog(p, 'reduce'); else applyStockAdjust(p, -1); }} 
                          disabled={adjustingStockId === p.product_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-background border border-border text-muted-foreground hover:bg-muted hover:text-destructive transition-all active:scale-90 disabled:opacity-50 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={clsx('text-sm font-black flex flex-col items-center justify-center leading-tight min-w-[72px]', isLowStock ? 'text-amber-500' : p.current_stock <= 0 ? 'text-red-500' : 'text-foreground')}>
                          {adjustingStockId === p.product_id ? (
                             <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                             <>
                               <span>{formattedStock}</span>
                               {totalPcs > 0 && <span className="text-[10px] text-muted-foreground/50 font-medium">{totalPcs} pcs</span>}
                               {isGstFlag && p.paper_stock !== undefined && (
                                 <span className="text-[10px] text-sky-600 dark:text-sky-400 font-bold mt-0.5" title="Paper Stock from Dummy GST purchases">
                                   Paper: {p.paper_stock}
                                 </span>
                               )}
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
                        >
                          <Plus className="w-3 h-3" />
                        </button>
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

            {/* Infinite Scroll Target */}
            {hasMore && (
              <div ref={lastElementRef} className="py-6 flex justify-center items-center shrink-0">
                <div className="flex gap-1 items-center text-muted-foreground text-sm font-medium">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading more items...</span>
                </div>
              </div>
            )}
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
        <div className="flex flex-col flex-1 min-h-0 bg-background" onKeyDown={handleFormKeyDown}>
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full" data-enter-nav>

            {/* Section 1: Core */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">1. Basic Details</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div ref={nameContainerRef} className="relative">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Name *</label>
                    <input ref={firstInputRef} type="text" value={formData.name} onChange={e => { handleInputChange('name', e.target.value); setSelectedNameIndex(0); }} onKeyDown={handleNameKeyDown} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                    {nameSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                        {nameSuggestions.map((p, i) => (
                          <button
                            key={p.product_id}
                            type="button"
                            onMouseDown={() => selectNameSuggestion(p)}
                            onMouseEnter={() => setSelectedNameIndex(i)}
                            className={clsx(
                              'w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border/40 last:border-0 transition-colors cursor-pointer',
                              i === selectedNameIndex ? 'bg-primary/10 text-primary' : 'bg-card text-foreground hover:bg-muted'
                            )}
                          >
                            <Package className="w-4 h-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {p.item_code && <span className="font-bold mr-1.5 text-primary">{p.item_code}</span>}
                                {p.sku_barcode}
                                {p.brand_manufacturer && <span className="ml-1.5 text-muted-foreground/60">| {p.brand_manufacturer}</span>}
                              </p>
                            </div>
                            {p.current_stock !== undefined && (
                              <span className={clsx(
                                'text-xs font-bold shrink-0 px-2 py-0.5 rounded-full',
                                Number(p.current_stock) <= 0 ? 'bg-red-500/10 text-red-500' :
                                Number(p.current_stock) <= Number(p.reorder_level) ? 'bg-amber-500/10 text-amber-500' :
                                'bg-emerald-500/10 text-emerald-500'
                              )}>
                                {Number(p.current_stock).toFixed(0)} in stock
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Code</label>
                    <input type="text" maxLength={10} value={formData.item_code} onChange={e => handleInputChange('item_code', e.target.value.toUpperCase())} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm uppercase text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div ref={categoryContainerRef} className="relative">
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formData.category}
                            onChange={e => {
                              handleInputChange('category', e.target.value);
                              setShowCategorySuggestions(true);
                              setSelectedCategoryIndex(0);
                            }}
                            onFocus={() => setShowCategorySuggestions(true)}
                            onKeyDown={handleCategoryKeyDown}
                            className="w-full bg-background border border-border rounded-xl p-3 pr-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                            placeholder="Type or select category..."
                          />
                          {formData.category && (
                            <button
                              type="button"
                              onClick={() => {
                                handleInputChange('category', '');
                                setShowCategorySuggestions(true);
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/60 hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                              title="Clear category"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {showCategorySuggestions && categorySuggestions.length > 0 && (
                          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                            {categorySuggestions.map((cat, i) => (
                              <button
                                key={cat}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectCategorySuggestion(cat);
                                }}
                                onMouseEnter={() => setSelectedCategoryIndex(i)}
                                className={clsx(
                                  'w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition-colors cursor-pointer border-b border-border/40 last:border-0',
                                  i === selectedCategoryIndex ? 'bg-primary/10 text-primary font-bold' : 'bg-card text-foreground hover:bg-muted'
                                )}
                              >
                                <span>{cat}</span>
                                {cat.toLowerCase() === (formData.category || '').trim().toLowerCase() && (
                                  <Check className="w-4 h-4 text-primary shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Brand / Mfg</label>
                      <input type="text" value={formData.brand_manufacturer} onChange={e => handleInputChange('brand_manufacturer', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                    </div>
                  </div>
                  {formData.category.trim() && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider">Grade</label>
                        {!isAddingGrade && (
                          <button
                            type="button"
                            onClick={() => setIsAddingGrade(true)}
                            className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> New Grade
                          </button>
                        )}
                      </div>
                      {categoryGrades.length > 0 && !isAddingGrade && (
                        <Select
                          value={formData.grade_id}
                          onChange={v => handleInputChange('grade_id', v)}
                          placeholder="No grade (manual pricing)"
                          searchable
                          options={categoryGrades.map(g => ({
                            value: g.grade_id,
                            label: (g.grade_name || '(General)') + ' (₹' + g.rate + ')'
                          }))}
                          renderOption={(option, isSelected) => {
                            const grade = grades.find(g => g.grade_id === option.value);
                            return (
                              <>
                                <div className="flex-1 min-w-0">
                                  <div className={clsx('text-sm truncate', isSelected && 'font-medium')}>{grade?.grade_name || '(General)'}</div>
                                  <div className="text-xs text-muted-foreground">₹{Number(grade?.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 shrink-0 text-primary" />}
                              </>
                            );
                          }}
                          triggerClassName="rounded-xl h-[46px]"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-muted/20 p-4 rounded-xl border border-border flex flex-col justify-center shadow-sm">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                      <button onClick={generateBarcode} className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all">
                        <RefreshCw className="w-3 h-3" /> Auto Generate
                      </button>
                    </div>
                    <input type="text" value={formData.sku_barcode} onChange={e => handleInputChange('sku_barcode', e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest mb-4 shadow-sm text-sm" />
                    {formData.sku_barcode && (
                      <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-border shadow-sm">
                        {labelCodeType === 'qrcode' ? (
                          <img src={qrPreviewUrl || ''} alt="QR Code" style={{ width: '100px', height: '100px', imageRendering: 'pixelated' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <Barcode value={formData.sku_barcode} height={50} displayValue={true} background="#ffffff" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Pricing */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Inventory & Pricing</span>
              </div>
              <div className="flex gap-4">
                {[
                  { label: 'Purchase Price', field: 'purchase_price', prefix: '₹' },
                  { label: 'MRP', field: 'base_price', prefix: '₹' },
                  { label: 'Current Stock', field: 'current_stock' },
                  { label: 'Low Stock Alert', field: 'reorder_level' },
                ].map(({ label, field, prefix }) => (
                  <div key={field} className="flex-1 min-w-0">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {label}
                      {(field === 'base_price' || field === 'purchase_price') && formData.grade_id && (
                        <span className="text-indigo-500 ml-1.5 font-normal normal-case">(from grade)</span>
                      )}
                    </label>
                    <div className="relative">
                      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{prefix}</span>}
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={(formData as any)[field]}
                        onChange={e => handleInputChange(field, e.target.value)}
                        className={clsx(
                          'w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm', 
                          prefix && 'pl-8', 
                          field === 'base_price' && 'text-emerald-600 dark:text-emerald-400 font-bold'
                        )}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">UOM</label>
                  <Select
                    value={formData.uom}
                    onChange={v => handleInputChange('uom', v)}
                    options={['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => ({ value: u, label: u }))}
                    triggerClassName="rounded-xl h-[46px]"
                  />
                </div>
                <div className={clsx('flex-1 min-w-0 overflow-hidden transition-all duration-500 ease-in-out', (formData.billing_type === 'WEIGHT' || ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((formData.uom || '').toLowerCase())) ? 'max-w-[250px] opacity-100' : 'max-w-0 opacity-0')}>
                  <div className="flex items-center gap-1 mb-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider">Pcs</label>
                    <span className="text-[10px] text-muted-foreground/60 font-normal normal-case">(optional)</span>
                  </div>
                  <input
                    type="number" min="1" step="1"
                    value={formData.domain_attributes?.pcs !== undefined ? formData.domain_attributes.pcs : (formData.domain_attributes?.pcs_stock ?? '')}
                    onChange={e => handleDomainAttrChange('pcs', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                    placeholder="e.g. 20"
                  />
                </div>
              </div>
              {activePricingTiers.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                      <Layers className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-violet-500 uppercase tracking-wider">Tier Prices</span>
                    <span className="text-[10px] text-muted-foreground font-normal normal-case">(blank = use MRP)</span>
                  </div>
                  <div className="flex gap-4 flex-wrap">
                    {activePricingTiers.map(tier => (
                      <div key={tier.pricing_tier_id} className="flex-1 min-w-[140px]">
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5 truncate">
                          {tier.name}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                          <input
                            type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={tierPrices[tier.pricing_tier_id] ?? ''}
                            onChange={e => setTierPrices(prev => ({ ...prev, [tier.pricing_tier_id]: e.target.value }))}
                            placeholder={formData.base_price != null && formData.base_price !== '' ? `= ${formData.base_price}` : 'MRP'}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm pl-8"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Discount & Offers */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">3. Discount & Offers</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                {/* Discount Block */}
                <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground">Discount</h4>
                    <span className="text-xs text-muted-foreground">Applies to MRP</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Percentage (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={formData.discount_percent || ''}
                        onChange={e => handleDiscountPercentChange(e.target.value)}
                        disabled={!!formData.offer_price}
                        className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Flat Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={formData.discount_flat || ''}
                        onChange={e => handleDiscountFlatChange(e.target.value)}
                        disabled={!!formData.offer_price}
                        className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Offer Block */}
                <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground">Offer</h4>
                    <span className="text-xs text-muted-foreground">Overrides MRP</span>
                  </div>
                  <div>                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Final Offer Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      value={formData.offer_price || ''}
                      onChange={e => handleOfferPriceChange(e.target.value)}
                      disabled={!!formData.discount_percent || !!formData.discount_flat}
                      className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Stock */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                  <Package className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-orange-500 uppercase tracking-wider">4. Taxes & Config</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GST Product</label>
                  <div
                    onClick={() => handleInputChange('is_gst_applicable', !formData.is_gst_applicable)}
                    onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); handleInputChange('is_gst_applicable', !formData.is_gst_applicable); } }}
                    data-focusable-checkbox
                    tabIndex={-1}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]',
                      formData.is_gst_applicable
                        ? 'bg-sky-500/10 border-sky-500/40 text-sky-600 dark:text-sky-400 shadow-sm'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                    )}
                  >
                    <input
                      type="checkbox"
                      id="gst"
                      checked={formData.is_gst_applicable}
                      onChange={e => handleInputChange('is_gst_applicable', e.target.checked)}
                      className={clsx(
                        'w-3.5 h-3.5 rounded pointer-events-none',
                        formData.is_gst_applicable ? 'accent-sky-500' : 'accent-amber-500'
                      )}
                    />
                    <label htmlFor="gst" className={clsx(
                      'font-bold text-xs cursor-pointer select-none',
                      formData.is_gst_applicable ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                    )}>
                      {formData.is_gst_applicable ? 'GST' : 'Estimate'}
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">HSN / SAC Code</label>
                  <input type="text" value={formData.hsn_sac_code} onChange={e => handleInputChange('hsn_sac_code', e.target.value)} disabled={!formData.is_gst_applicable} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none disabled:opacity-50 transition-all shadow-sm text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                  <Select
                    value={String(formData.tax_rate_percent)}
                    onChange={v => handleInputChange('tax_rate_percent', parseFloat(v))}
                    disabled={!formData.is_gst_applicable}
                    options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                    triggerClassName="rounded-xl h-[46px]"
                  />
                </div>
              </div>
            </section>

            {/* Section 4: Domain Attributes */}
            {shopDomain !== 'GENERAL' && (
              <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-amber-500 uppercase tracking-wider">4. Domain Fields — {shopDomain}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {shopDomain === 'HARDWARE' && (<>
                    <DomainField label="Dimensions (L×W×H)" value={formData.domain_attributes['dimensions'] || ''} onChange={v => handleDomainAttrChange('dimensions', v)} />
                    <DomainField label="Material" value={formData.domain_attributes['material'] || ''} onChange={v => handleDomainAttrChange('material', v)} />
                    <DomainField label="Batch Number" value={formData.domain_attributes['batch_number'] || ''} onChange={v => handleDomainAttrChange('batch_number', v)} />
                    <DomainField label="Expiry Date" type="date" value={formData.domain_attributes['expiry_date'] || ''} onChange={v => handleDomainAttrChange('expiry_date', v)} />
                  </>)}
                  {shopDomain === 'JEWELRY' && (<>
                    <DomainField label="Purity (e.g. 22K)" value={formData.domain_attributes['purity'] || ''} onChange={v => handleDomainAttrChange('purity', v)} />
                    <DomainField label="Weight (Grams)" type="number" value={formData.domain_attributes['weight_grams'] || ''} onChange={v => handleDomainAttrChange('weight_grams', v)} />
                    <DomainField label="Making Charge %" type="number" value={formData.domain_attributes['making_charge_pct'] || ''} onChange={v => handleDomainAttrChange('making_charge_pct', v)} />
                    <DomainField label="Hallmark HUID" value={formData.domain_attributes['hallmark_huid'] || ''} onChange={v => handleDomainAttrChange('hallmark_huid', v)} />
                  </>)}
                </div>
              </section>
            )}

            {/* Section 5: GST Purchase Details — only in Add mode */}
            {view === 'add' && (
              <section className="rounded-[28px] overflow-hidden shadow-sm border border-purple-500/20" style={{background: 'linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, var(--card) 96%, #a855f7) 100%)'}}>
                {/* Section Header */}
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-purple-500/15" style={{background: 'linear-gradient(90deg, color-mix(in srgb, #a855f7 12%, transparent), color-mix(in srgb, #a855f7 4%, transparent))'}}>
                  <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-purple-500/15 text-purple-500 shrink-0">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-black text-purple-500 uppercase tracking-widest">5. GST Purchase Entry</span>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">Record the purchase bill linked to this stock addition</p>
                  </div>
                  {/* Toggle Switch */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none shrink-0">
                    <span className="text-xs font-bold text-muted-foreground">{formData.show_gst_purchase ? 'Enabled' : 'Disabled'}</span>
                    <div
                      onClick={() => handleInputChange('show_gst_purchase', !formData.show_gst_purchase)}
                      className={clsx(
                        'relative w-11 h-6 rounded-full transition-all duration-300 cursor-pointer shadow-inner',
                        formData.show_gst_purchase ? 'bg-purple-500' : 'bg-muted/60 border border-border'
                      )}
                    >
                      <div className={clsx(
                        'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300',
                        formData.show_gst_purchase ? 'left-5' : 'left-0.5'
                      )} />
                    </div>
                  </label>
                </div>

                {/* Collapsed — info callout */}
                {!formData.show_gst_purchase && (
                  <div className="px-5 py-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/8 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">No purchase entry will be recorded</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Enable this to log the supplier bill, purchase price, and quantity into your GST purchase ledger for ITC (Input Tax Credit) tracking.</p>
                    </div>
                  </div>
                )}

                {/* Expanded form */}
                {formData.show_gst_purchase && (
                  <div className="px-5 py-4 space-y-5">

                    <div className="grid grid-cols-2 gap-4">
                      {/* Auto-fill toggle */}
                      <div
                        onClick={() => handleInputChange('gst_same_as_current', !formData.gst_same_as_current)}
                        className={clsx(
                          'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all duration-200',
                          formData.gst_same_as_current
                            ? 'bg-purple-500/10 border-purple-500/30 shadow-sm'
                            : 'bg-muted/10 border-border hover:bg-muted/20 hover:border-border'
                        )}
                      >
                        <div className={clsx(
                          'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200',
                          formData.gst_same_as_current ? 'bg-purple-500 border-purple-500' : 'border-border bg-background'
                        )}>
                          {formData.gst_same_as_current && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={clsx('text-sm font-bold', formData.gst_same_as_current ? 'text-purple-600 dark:text-purple-400' : 'text-foreground')}>Same as Current Product</span>
                          <p className="text-xs text-muted-foreground mt-0.5">Auto-fills price &amp; quantity</p>
                        </div>
                      </div>

                      {/* Stock Type toggle */}
                      <div
                        onClick={() => handleInputChange('gst_purchase_is_dummy', !formData.gst_purchase_is_dummy)}
                        className={clsx(
                          'flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all duration-200',
                          formData.gst_purchase_is_dummy
                            ? 'bg-amber-500/10 border-amber-500/30 shadow-sm'
                            : 'bg-emerald-500/10 border-emerald-500/30 shadow-sm'
                        )}
                      >
                        <div className={clsx(
                          'w-5 h-5 rounded-md border border-border flex items-center justify-center shrink-0 transition-all duration-200',
                          formData.gst_purchase_is_dummy ? 'bg-amber-500 border-amber-500' : 'bg-emerald-500 border-emerald-500'
                        )}>
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-foreground">Stock Type: {formData.gst_purchase_is_dummy ? 'Paper' : 'Real'}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formData.gst_purchase_is_dummy ? 'Paper stock only (tax record)' : 'Adds to physical stock'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Purchase Price & Quantity */}
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="px-4 py-2 bg-muted/20 border-b border-border/50 flex items-center gap-2">
                        <IndianRupee className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">Purchase Figures</span>
                      </div>
                      <div className="grid grid-cols-2 gap-0 divide-x divide-border/50">
                        <div className="p-4">
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Purchase Price</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm select-none">₹</span>
                            <input
                              type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={formData.gst_purchase_price}
                              onChange={e => handleInputChange('gst_purchase_price', e.target.value)}
                              disabled={formData.gst_same_as_current}
                              placeholder="0.00"
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 pl-7 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all no-spinners text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="p-4">
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Quantity</label>
                          <div className="relative">
                            <input
                              type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={formData.gst_purchase_quantity}
                              onChange={e => handleInputChange('gst_purchase_quantity', e.target.value)}
                              disabled={formData.gst_same_as_current}
                              placeholder="0"
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all no-spinners text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Supplier & Bill Reference */}
                    <div className="grid grid-cols-2 gap-4">

                      {/* Supplier Block */}
                      <div className="rounded-xl border border-border overflow-hidden">
                        <div className="px-4 py-2 bg-muted/20 border-b border-border/50 flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">Supplier</span>
                        </div>
                        <div className="p-4">
                          {showSupplierCreate ? (
                            <div className="space-y-2">
                              <input
                                type="text" placeholder="Supplier Name *"
                                value={newSupplierName}
                                onChange={e => setNewSupplierName(e.target.value)}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-1 focus:ring-purple-500/10 focus:outline-none text-sm"
                              />
                              <input
                                type="text" placeholder="Phone (optional)"
                                value={newSupplierPhone}
                                onChange={e => setNewSupplierPhone(e.target.value)}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-1 focus:ring-purple-500/10 focus:outline-none text-sm"
                              />
                              <input
                                type="text" placeholder="Address (optional)"
                                value={newSupplierAddress}
                                onChange={e => setNewSupplierAddress(e.target.value)}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-1 focus:ring-purple-500/10 focus:outline-none text-sm"
                              />
                              <div className="flex gap-2 pt-1">
                                <button onClick={handleCreateSupplier} className="flex-1 px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer">
                                  Save Supplier
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Search or select supplier..."
                                value={supplierSearch}
                                onChange={e => {
                                  setSupplierSearch(e.target.value);
                                  const match = suppliers.find(s => s.name.toLowerCase() === e.target.value.toLowerCase());
                                  if (match) {
                                    setFormData(prev => ({ ...prev, gst_supplier_id: match.party_id, gst_supplier_name: match.name }));
                                  }
                                }}
                                className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all text-sm"
                              />
                              {supplierSearch && filteredSuppliers.length > 0 && (
                                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                                  {filteredSuppliers.map(s => (
                                    <button
                                      key={s.party_id}
                                      type="button"
                                      onMouseDown={() => {
                                        setFormData(prev => ({ ...prev, gst_supplier_id: s.party_id, gst_supplier_name: s.name }));
                                        setSupplierSearch(s.name);
                                      }}
                                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted border-b border-border/40 last:border-0 transition-colors cursor-pointer flex items-center gap-2"
                                    >
                                      <span className="font-bold">{s.name}</span>
                                      {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                                      {s.balance_type === 'PAYABLE' && s.balance > 0 && (
                                        <span className="text-xs text-red-500 ml-auto font-bold">₹{Number(s.balance).toFixed(2)}</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setShowSupplierCreate(true)}
                                className="mt-2 text-xs font-bold text-purple-500 hover:text-purple-600 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Add New Supplier
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bill Reference Block */}
                      <div className="rounded-xl border border-border overflow-hidden">
                        <div className="px-4 py-2 bg-muted/20 border-b border-border/50 flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-black text-muted-foreground uppercase tracking-wider">Bill Reference</span>
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Bill / Invoice No.</label>
                            <input
                              type="text"
                              value={formData.gst_bill_number}
                              onChange={e => handleInputChange('gst_bill_number', e.target.value)}
                              placeholder="e.g. INV-2024-001"
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all font-mono tracking-wider text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Bill Date</label>
                            <input
                              type="date"
                              value={formData.gst_bill_date}
                              onChange={e => handleInputChange('gst_bill_date', e.target.value)}
                              className="w-full bg-background border border-border/70 rounded-lg p-2.5 text-foreground focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 focus:outline-none transition-all text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ITC Info strip */}
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-purple-500/6 border border-purple-500/15">
                      <div className="w-4 h-4 rounded-full bg-purple-500/15 text-purple-500 flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">i</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        This purchase entry will be recorded in your <span className="font-bold text-foreground">GST Purchase Ledger</span> and may be used for <span className="font-bold text-foreground">Input Tax Credit (ITC)</span> reconciliation.
                      </p>
                    </div>

                  </div>
                )}
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 bg-background">
            

            {/* Action row */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-xl p-0.5 px-2 shadow-sm">
                  <span className="text-muted-foreground text-sm font-bold">Qty{['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(formData.uom) ? ` (${formData.domain_attributes?.pcs ? 'Pcs' : formData.uom})` : ''}:</span>
                  <input 
                    type="number" 
                    min="1" 
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={printQuantity} 
                    onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)} 
                    className="w-10 h-7 bg-transparent text-foreground focus:outline-none text-center font-black text-sm no-spinners" 
                  />
                </div>
                <label className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-xl px-3 py-1.5 cursor-pointer hover:bg-muted transition-colors select-none shadow-sm">
                  <input 
                    type="checkbox" 
                    id="print_price" 
                    checked={printPrice} 
                    onChange={e => setPrintPrice(e.target.checked)} 
                    className="w-3.5 h-3.5 accent-primary rounded cursor-pointer" 
                  />
                  <span className="text-muted-foreground text-xs font-bold whitespace-nowrap">Price</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={printBarcode} className="flex items-center gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Printer className="w-3.5 h-3.5" />
                  Print Label
                </button>
                <button onClick={() => handleSave()} data-enter-submit disabled={loading} className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Save className="w-3.5 h-3.5" />
                  {loading ? 'Saving...' : view === 'edit' ? 'Update Product' : 'Add to Inventory'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddingGrade && (
        <Modal
          isOpen={isAddingGrade}
          onClose={() => { setIsAddingGrade(false); setNewGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
          title="Create New Grade"
          className="max-w-lg backdrop-blur-none"
          closeButton={
            <RedCrossButton
              onClick={() => { setIsAddingGrade(false); setNewGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
            />
          }
        >
          <div className="space-y-3" onKeyDown={handleFormKeyDown} data-enter-nav>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              Grade for category: <span className="font-bold text-foreground">{formData.category}</span>
            </p>
            <section className="bg-background border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">Grade Details</span>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Grade Name *</label>
                  <input
                    autoFocus
                    placeholder="e.g. Grade A, Scrap, Heavy"
                    value={newGradeForm.grade_name}
                    onChange={e => setNewGradeForm({ ...newGradeForm, grade_name: e.target.value })}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newGradeForm.purchase_price}
                        onChange={e => setNewGradeForm({ ...newGradeForm, purchase_price: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Base MRP (₹/Kg)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newGradeForm.rate}
                        onChange={e => setNewGradeForm({ ...newGradeForm, rate: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Offer (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newGradeForm.offer_price}
                        onChange={e => setNewGradeForm({ ...newGradeForm, offer_price: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                data-enter-submit
                onClick={handleCreateGrade}
                disabled={savingGrade || !newGradeForm.grade_name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/95 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                {savingGrade ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save Grade
              </button>
            </div>
          </div>
        </Modal>
      )}

      {adjustModal && (
        <Modal
          isOpen={true}
          onClose={() => setAdjustModal(null)}
          title="Adjust Stock"
          className="max-w-md"
          closeButton={null}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate">{adjustModal.product.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                  {adjustModal.product.sku_barcode || adjustModal.product.item_code}
                </p>
              </div>
              <div className="shrink-0 text-right bg-muted/40 border border-border rounded-xl px-3 py-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Current Stock</p>
                <p className="text-sm font-black text-foreground">
                  {Number(adjustModal.product.current_stock).toFixed(['Kgs', 'Grams', 'Mtrs', 'Ltrs'].includes(adjustModal.product.uom) ? 3 : 0)} {adjustModal.product.uom}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-muted/40 border border-border rounded-xl p-1">
              <button
                onClick={() => setAdjustModal({ ...adjustModal, mode: 'add' })}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer',
                  adjustModal.mode === 'add'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background'
                )}
              >
                + Add
              </button>
              <button
                onClick={() => setAdjustModal({ ...adjustModal, mode: 'reduce' })}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer',
                  adjustModal.mode === 'reduce'
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background'
                )}
              >
                − Reduce
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    {adjustModal.product.uom}
                  </label>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={adjustAmount}
                    onChange={e => setAdjustAmount(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdjustStock(); } }}
                    placeholder={`0.000`}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-black text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all no-spinners"
                  />
                  <p className="text-[10px] text-muted-foreground/70 font-semibold mt-1">
                    Current: {Number(adjustModal.product.current_stock).toFixed(3)} {adjustModal.product.uom}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Pcs
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={adjustPcs}
                    onChange={e => setAdjustPcs(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdjustStock(); } }}
                    placeholder="0"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-lg font-black text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all no-spinners"
                  />
                  <p className="text-[10px] text-muted-foreground/70 font-semibold mt-1">
                    Current: {adjustCurrentPcs} Pcs
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 font-semibold">
                {(() => {
                  const kgAmt = parseFloat(adjustAmount);
                  const pcsAmt = parseFloat(adjustPcs);
                  const hasKg = !isNaN(kgAmt) && kgAmt > 0;
                  const hasPcs = !isNaN(pcsAmt) && pcsAmt > 0;
                  if (!hasKg && !hasPcs) return 'Enter an amount in weight or pcs to see the new stock';
                  const sign = adjustModal.mode === 'add' ? 1 : -1;
                  const newKg = hasKg ? Number(adjustModal.product.current_stock) + sign * kgAmt : Number(adjustModal.product.current_stock);
                  const newPcs = hasPcs ? adjustCurrentPcs + sign * pcsAmt : adjustCurrentPcs;
                  if (newKg < 0 || newPcs < 0) return 'Resulting stock would be negative';
                  return `New stock: ${newKg.toFixed(3)} ${adjustModal.product.uom}${hasPcs ? ` • ${newPcs} Pcs` : ''}`;
                })()}
              </p>
            </div>

            <div className="flex items-center justify-end border-t border-border mt-1 pt-4">
              <button
                onClick={confirmAdjustStock}
                disabled={adjustingStockId === adjustModal.product.product_id}
                className={clsx(
                  'px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50',
                  adjustModal.mode === 'add'
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                )}
              >
                {adjustingStockId === adjustModal.product.product_id ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  adjustModal.mode === 'add' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />
                )}
                {adjustModal.mode === 'add' ? 'Add' : 'Reduce'} Stock
              </button>
            </div>
          </div>
        </Modal>
      )}

      {printModalProduct && (
        <Modal
          isOpen={true}
          onClose={() => { setPrintModalProduct(null); setStatusMessage(null); }}
          className="max-w-lg"
          closeButton={null}
        >
          <div className="flex flex-col">
            {/* ── Label Preview Card ── */}
            <div className="px-6 pt-6 pb-4">
              <div className="bg-white rounded-2xl border-2 border-dashed border-muted-foreground/25 p-6 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.02)_10px,rgba(0,0,0,0.02)_20px)]" />
                <div className="relative">
                  {labelCodeType === 'qrcode' ? (
                    <QRCodePreview barcode={printModalProduct.sku_barcode} />
                  ) : (
                    <Barcode value={printModalProduct.sku_barcode} height={50} displayValue={false} margin={0} width={1.8} background="transparent" />
                  )}
                  <p className="font-bold text-gray-800 text-lg mt-3 tracking-tight">{printModalProduct.name}</p>
                  <p className="font-mono text-sm text-gray-500 tracking-wider mt-0.5">{printModalProduct.sku_barcode}</p>
                  <div className={clsx(
                    "mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                    printPrice ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"
                  )}>
                    <span>MRP:</span>
                    <span className="text-sm">
                      ₹{(() => {
                        const g = printModalProduct.grade_id ? grades.find(gr => gr.grade_id === printModalProduct.grade_id) : null;
                        const gr = g ? Number(g.rate) : null;
                        return (gr !== null && printModalProduct.pricing_mode === 'GRADE_RATE' ? gr : Number(printModalProduct.base_price)).toFixed(2);
                      })()}
                    </span>
                  </div>
                  {!printPrice && (
                    <div className="mt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Price Hidden
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Settings ── */}
            <div className="px-6 pb-2 space-y-3">
              <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Number of Labels</label>
                  <div className="flex items-center gap-2 bg-background border border-border rounded-xl p-1 pl-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                    <span className="text-muted-foreground text-sm font-semibold shrink-0">
                      <Printer className="w-4 h-4 inline -mt-0.5 mr-1.5" />
                      ×
                    </span>
                    <input
                      type="number"
                      min="1"
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      value={printQuantity}
                      onChange={e => setPrintQuantity(e.target.value === '' ? '' : e.target.value)}
                      className="w-16 bg-transparent text-foreground focus:outline-none text-center font-bold text-lg no-spinners py-1.5"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={printPrice}
                    onChange={e => setPrintPrice(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-foreground">Show Price</span>
                </label>
              </div>
            </div>

            {/* ── Status & Actions ── */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-border mt-3">
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => printProductLabel(printModalProduct)}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Print {printQuantity !== '' && Number(printQuantity) > 1 ? `${printQuantity} Labels` : 'Label'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── CONFIRM DELETE MODAL ─── */}
      {deleteConfirmProduct && (
        <Modal
          isOpen={!!deleteConfirmProduct}
          onClose={() => !isDeleting && setDeleteConfirmProduct(null)}
          title="Confirm Delete"
          className="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <p className="font-bold text-sm">Delete Product?</p>
                <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-foreground">
              Are you sure you want to delete <span className="font-bold text-foreground">"{deleteConfirmProduct.name}"</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash className="w-4 h-4" />
                    <span>Delete Product</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── CONFIRM BULK DELETE MODAL ─── */}
      {showBulkDeleteConfirm && (
        <Modal
          isOpen={showBulkDeleteConfirm}
          onClose={() => !isBulkDeleting && setShowBulkDeleteConfirm(false)}
          title={`Confirm Bulk Delete (${selectedProductIds.size})`}
          className="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <p className="font-bold text-sm">Delete {selectedProductIds.size} Products?</p>
                <p className="text-xs text-muted-foreground mt-0.5">This action will remove all selected products from inventory.</p>
              </div>
            </div>
            <p className="text-sm text-foreground">
              Are you sure you want to permanently delete <span className="font-bold text-destructive">{selectedProductIds.size}</span> selected product(s)? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                disabled={isBulkDeleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting {selectedProductIds.size}...</span>
                  </>
                ) : (
                  <>
                    <Trash className="w-4 h-4" />
                    <span>Delete {selectedProductIds.size} Items</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

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
    </div>
  );
}

// ─── Helper sub-components ───────────────────────────────────────────────────
function QRCodePreview({ barcode }: { barcode: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(barcode, { width: 120, margin: 1 })
      .then(u => setUrl(u))
      .catch(() => setUrl(null));
  }, [barcode]);
  if (!url) return <div style={{ width: '100px', height: '50px', background: '#f0f0f0' }} />;
  return <img src={url} alt="QR" style={{ width: '100px', height: '100px', imageRendering: 'pixelated' }} />;
}

function DomainField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all shadow-sm" />
    </div>
  );
}

