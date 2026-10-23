import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { Receipt, Search, User, Tag, RefreshCw, Trash2, X, IndianRupee, TrendingUp, BarChart3, CheckCheck, SlidersHorizontal, Layers, AlertCircle, ArrowDownRight, ShieldAlert, Building, FileText, Download, Percent, Loader2 } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useAuthStore } from '../store/authStore';
import { getSetting } from '../data/settings';
import { listInvoices, getInvoiceItems } from '../data/invoices';
import { getInvoicePreDeductionTotal } from '../utils/salesHistoryAmount';
import {
  type InvoiceProductRow,
  type InvoiceProductTotals,
} from '../utils/salesHistoryTax';
import { 
  type StaffDataMaskingConfig, 
  DEFAULT_STAFF_DATA_MASKING_CONFIG, 
  STAFF_DATA_MASKING_KEY, 
  parseStaffDataMaskingConfig, 
  isStaffRole, 
  shouldApplyStaffMasking, 
  calculateMaskedSalesRevenue,
  getStaffSalesDateScope 
} from '../utils/staffDataMasking';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { getUpiPageConfig, DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../utils/upiConfig';
import { isAdminRole, hasPermission } from '../utils/permissions';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { bridgeEvents } from '../data/events';
import { invoicesApi } from '../data/invoices';
import { paymentSourcesApi } from '../data/paymentSources';
import { formatCurrency } from '../utils/money';
import { TAX_RATES, formatDate, formatGroupDate, getInvoiceRevenueForFilter, groupByDay } from './sales/salesHistoryFormat';
import { InvoiceRow } from './sales/views/InvoiceRow';
import { StatCard } from './sales/views/StatCard';
import type { InvoiceDetailsCacheEntry, SalesInvoiceItemRow, SalesInvoiceRow, UpiSourceOption } from './sales/salesTypes';
import { useSalesCsvExport } from './sales/hooks/useSalesCsvExport';
import { useInvoiceReprint } from './sales/hooks/useInvoiceReprint';
import { useInvoiceWhatsApp } from './sales/hooks/useInvoiceWhatsApp';
import { useInvoiceDetails } from './sales/hooks/useInvoiceDetails';
import { useSalesInvoiceLoader } from './sales/hooks/useSalesInvoiceLoader';
import { useConversionPreview } from './sales/hooks/useConversionPreview';
import { ConversionModal } from './sales/views/ConversionModal';
import { CollectPaymentModal } from './sales/views/CollectPaymentModal';
import { InvoiceDetailModal } from './sales/views/InvoiceDetailModal';
import { SalesHistoryHeader } from './sales/views/SalesHistoryHeader';

/* ════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
export function SalesHistory({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  const { tenantId, role, permissions } = useAuthStore();
  const [maskingConfig, setMaskingConfig] = useState<StaffDataMaskingConfig>(DEFAULT_STAFF_DATA_MASKING_CONFIG);
  const [invoices, setInvoices] = useState<SalesInvoiceRow[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoiceRow | null>(null);
  const [canReturn, setCanReturn] = useState(true);
  const [items, setItems] = useState<SalesInvoiceItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'bills' | 'analytics'>('bills');
  const [showGraphBanner, setShowGraphBanner] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('');
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState('');
  const [accountingView, setAccountingView] = useState<'REAL_SALES' | 'TAX_FILING' | 'ALL'>('REAL_SALES');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [taxPercentageFilter, setTaxPercentageFilter] = useState('');
  const [reprintSuccess, setReprintSuccess] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const selectedInvoiceIdRef = useRef<string | null>(null);

  // High-performance in-memory cache for instant zero-lag bill drawer rendering
  const invoiceDetailsCache = useRef<Map<string, InvoiceDetailsCacheEntry>>(new Map());
  const prefetchInvoiceRef = useRef<(id: string) => void>(() => {});
  const loadInvoicesRef = useRef<any>(null);
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT'>('CASH');
  const [collectReceivedAmount, setCollectReceivedAmount] = useState(0);
  const [collectPaymentSaving, setCollectPaymentSaving] = useState(false);
  const [collectPaymentSuccess, setCollectPaymentSuccess] = useState(false);

  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [upiSources, setUpiSources] = useState<UpiSourceOption[]>([]);
  const [collectUpiSourceId, setCollectUpiSourceId] = useState<string>('');
  const LIMIT = 30;
  const [dbSummary, setDbSummary] = useState<{ totalSales: number; totalSalesBeforeDeductions?: number; totalInvoices: number; totalTax: number; totalDiscount: number; avgOrder: number } | null>(null);
  const [taxProductRows, setTaxProductRows] = useState<InvoiceProductRow[]>([]);
  const [taxProductTotals, setTaxProductTotals] = useState<InvoiceProductTotals | null>(null);
  const [taxProductLoading, setTaxProductLoading] = useState(false);
  const taxProductRequestRef = useRef(0);
  const taxFilterActive = accountingView !== 'REAL_SALES' && taxPercentageFilter !== '' && taxPercentageFilter !== 'all';

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [convertibleMap, setConvertibleMap] = useState<Record<string, boolean>>({});
  const [conversionOpen, setConversionOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [conversionResults, setConversionResults] = useState<{ invoice_id: string; old_number: string; new_number: string; success: boolean; error?: string; skipped_items?: string[] }[] | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusMsg, setExportStatusMsg] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [enableConvertToGst, setEnableConvertToGst] = useState(true);
  const [conversionTaxMode, setConversionTaxMode] = useState<'EXCLUSIVE' | 'INCLUSIVE'>('EXCLUSIVE');
  const [conversionPreview, setConversionPreview] = useState<{
    total_bos_amount?: number;
    total_taxable_amount?: number;
    total_tax_amount?: number;
    total_converted_amount?: number;
    has_real_gst?: boolean;
    has_paper?: boolean;
    has_skipped?: boolean;
    invoices?: {
      invoice_id: string;
      invoice_number: string;
      bos_grand_total: number;
      taxable_amount?: number;
      tax_amount?: number;
      converted_grand_total: number;
      points_discount?: number;
      scrap_deduction?: number;
      return_deduction?: number;
      deductions_total?: number;
      has_real_gst: boolean;
      has_paper: boolean;
      skipped_items: string[];
    }[];
  } | null>(null);
  const [conversionPreviewLoading, setConversionPreviewLoading] = useState(false);

  useEffect(() => {
    const loadSettings = () => {
      if (isDesktopRuntime()) {
        getSetting({ tenant_id: tenantId || 'global', key: 'enable_convert_to_gst' }).then((v: any) => {
          if (v !== null && v !== undefined) setEnableConvertToGst(Boolean(v));
        }).catch(() => {});

        getSetting({ tenant_id: tenantId || 'global', key: 'gst_conversion_tax_inclusive' }).then((v: any) => {
          if (v !== null && v !== undefined) setConversionTaxMode(Boolean(v) ? 'INCLUSIVE' : 'EXCLUSIVE');
        }).catch(() => {});

        getSetting({ tenant_id: tenantId || 'global', key: STAFF_DATA_MASKING_KEY }).then((v: any) => {
          if (v) setMaskingConfig(parseStaffDataMaskingConfig(v));
        }).catch(() => {});
      }
    };
    loadSettings();
    window.addEventListener('settings:updated', loadSettings);
    return () => window.removeEventListener('settings:updated', loadSettings);
  }, [tenantId]);

  const convertibleInvoicesInView = useMemo(() =>
    invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY' && !i.converted_to_invoice_id && Boolean(convertibleMap[i.invoice_id])),
    [invoices, convertibleMap]
  );

  const selectedBosInvoices = useMemo(() =>
    invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY' && !i.converted_to_invoice_id && Boolean(convertibleMap[i.invoice_id]) && selectedInvoiceIds.has(i.invoice_id)),
    [invoices, selectedInvoiceIds, convertibleMap]
  );

  useConversionPreview({
    conversionOpen, conversionTaxMode, selectedBosInvoices, setConversionPreview, setConversionPreviewLoading,
    tenantId,
  });

  // Debounce search input with 0ms instant clear
  useEffect(() => {
    if (!search.trim()) {
      setDebouncedSearch('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setIsSearching(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [search]);

  const { loadInvoices } = useSalesInvoiceLoader({
    accountingView, debouncedSearch, filterDate, filterDateEnd, invoiceTypeFilter, isFetching, LIMIT,
    maskingConfig, offset, paymentFilter, prefetchInvoiceRef, setDbSummary, setHasMore, setInvoices,
    setIsFetching, setLoading, setOffset, setTaxProductLoading, setTaxProductRows, setTaxProductTotals,
    taxFilterActive, taxPercentageFilter, taxProductRequestRef,
  });

  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    loadInvoices(true);
  }, [debouncedSearch, paymentFilter, invoiceTypeFilter, filterDate, filterDateEnd, taxPercentageFilter, maskingConfig, accountingView]);

  useEffect(() => {
    if ((accountingView === 'REAL_SALES' || invoiceTypeFilter === 'BILL_OF_SUPPLY') && taxPercentageFilter !== '') {
      setTaxPercentageFilter('');
    }
  }, [accountingView, invoiceTypeFilter, taxPercentageFilter]);

  useEffect(() => {
    getUpiPageConfig(useAuthStore.getState().tenantId || 'global').then(setUpiPageConfig);
    if (hasBridge('dbPaymentGetSources')) {
      paymentSourcesApi.getSources(useAuthStore.getState().tenantId || 'global').then((sources: any[]) => {
        if (Array.isArray(sources)) {
          setUpiSources(sources.filter((s: any) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
        }
      }).catch(() => {});
    }
    if (isDesktopRuntime()) {
      const unsub = bridgeEvents.onSyncDataUpdated(() => {
        console.log('[SalesHistory] 🔄 Auto-sync data updated event received! Reloading invoices from SQLite...');
        loadInvoicesRef.current(true);
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  useEffect(() => {
    loadInvoicesRef.current = loadInvoices;
  });

  useEffect(() => {
    const initialSearch = localStorage.getItem('salesHistoryInitialSearch');
    if (initialSearch) {
      setSearch(initialSearch);
      localStorage.removeItem('salesHistoryInitialSearch');
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerOpen) { setDrawerOpen(false); setTimeout(() => { setSelectedInvoice(null); setItems([]); }, 300); }
        else { onClose?.(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen, onClose]);

  useEffect(() => {
    if (!reprintSuccess) return;
    const t = setTimeout(() => setReprintSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [reprintSuccess]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let cancelled = false;
    const { tenantId } = useAuthStore.getState();
    invoicesApi.getBosConvertibleInvoices(tenantId || 'global')
      .then(res => {
        if (cancelled || !Array.isArray(res)) return;
        const map: Record<string, boolean> = {};
        res.forEach(r => { map[r.invoice_id] = !!r.convertible; });
        setConvertibleMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectionMode, invoices.length]);

  const sentinelRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (isFetching || !hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !isFetching && hasMore) {
        loadInvoices(false);
      }
    }, { threshold: 0.1, rootMargin: '150px' });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isFetching, hasMore, offset]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 200 && !isFetching && hasMore) {
      loadInvoices(false);
    }
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
  };

  const { fetchInvoiceDetails } = useInvoiceDetails({
    invoiceDetailsCache, selectedInvoiceIdRef, setItems, withTimeout,
  });

  const prefetchInvoice = useCallback((invoiceId: string) => {
    if (!invoiceId) return;
    const cached = invoiceDetailsCache.current.get(invoiceId);
    if (!cached) {
      fetchInvoiceDetails(invoiceId).catch(() => {});
    }
  }, [fetchInvoiceDetails]);
  useEffect(() => {
    prefetchInvoiceRef.current = prefetchInvoice;
  });

  const handleSelectInvoice = async (inv: any) => {
    if (!inv || !inv.invoice_id) return;
    selectedInvoiceIdRef.current = inv.invoice_id;
    setSelectedInvoice(inv);

    const cached = invoiceDetailsCache.current.get(inv.invoice_id);
    if (cached && !cached.promise && cached.items.length > 0) {
      // 0ms INSTANT LOAD! Everything is already present in memory
      setItems(cached.items);
      setCanReturn(cached.canReturn);
      setItemsLoading(false);
      setDrawerOpen(true);
      return;
    }

    if (cached?.items && cached.items.length > 0) {
      setItems(cached.items);
      setCanReturn(cached.canReturn);
      setItemsLoading(false);
    } else {
      setItems([]);
      setItemsLoading(true);
    }
    setDrawerOpen(true);

    try {
      const details = await fetchInvoiceDetails(inv.invoice_id);
      if (selectedInvoiceIdRef.current !== inv.invoice_id) return;
      setItems(details.items);
      setCanReturn(details.canReturn);
      setItemsLoading(false);
    } catch (err) {
      console.error('[SalesHistory] handleSelectInvoice error:', err);
      if (selectedInvoiceIdRef.current === inv.invoice_id) {
        setItems([]);
      }
    } finally {
      if (selectedInvoiceIdRef.current === inv.invoice_id) {
        setItemsLoading(false);
      }
    }
  };

  const closeDrawer = () => {
    selectedInvoiceIdRef.current = null;
    setDrawerOpen(false);
    setCanReturn(true);
    setItemsLoading(false);
    setTimeout(() => { setSelectedInvoice(null); setItems([]); }, 300);
  };

  const handleViewLinkedInvoice = async (targetInvoiceId?: string, targetInvoiceNumber?: string) => {
    if (!targetInvoiceId && !targetInvoiceNumber) {
      showToast('No linked bill details found', 'error');
      return;
    }
    try {
      // 1. First check in-memory loaded invoices for instant match
      let match = invoices.find((i: any) =>
        (targetInvoiceId && i.invoice_id === targetInvoiceId) ||
        (targetInvoiceNumber && i.invoice_number === targetInvoiceNumber) ||
        (targetInvoiceNumber && i.invoice_number?.trim().toUpperCase() === targetInvoiceNumber.trim().toUpperCase())
      );

      // 2. Query by invoice_id (new main.ts direct bypass)
      if (!match && targetInvoiceId) {
        try {
          const res = await listInvoices({
            invoice_id: targetInvoiceId,
            limit: 5,
            offset: 0,
          });
          if (Array.isArray(res) && res.length > 0) {
            match = res.find((i: any) => i.invoice_id === targetInvoiceId || (targetInvoiceNumber && i.invoice_number === targetInvoiceNumber)) || res[0];
          }
        } catch (err) {
          console.warn('[handleViewLinkedInvoice] Error querying by invoice_id:', err);
        }
      }

      // 3. Fallback: Query by invoice_number with search
      const searchKey = targetInvoiceNumber || targetInvoiceId;
      if (!match && searchKey) {
        try {
          const res = await listInvoices({
            search: searchKey,
            accounting_view: 'ALL',
            limit: 25,
            offset: 0,
          });
          if (Array.isArray(res)) {
            match = res.find((i: any) =>
              (targetInvoiceId && i.invoice_id === targetInvoiceId) ||
              (targetInvoiceNumber && i.invoice_number === targetInvoiceNumber) ||
              (targetInvoiceNumber && i.invoice_number?.trim().toUpperCase() === targetInvoiceNumber.trim().toUpperCase()) ||
              (targetInvoiceId && i.invoice_number === targetInvoiceId)
            );
          }
        } catch (err) {
          console.warn('[handleViewLinkedInvoice] Error querying by search:', err);
        }
      }

      if (match) {
        // Synchronize accounting view so the underlying list matches the active document
        if (match.invoice_type === 'BILL_OF_SUPPLY' && accountingView === 'TAX_FILING') {
          setAccountingView('REAL_SALES');
        } else if (match.invoice_type === 'GST' && accountingView === 'REAL_SALES') {
          setAccountingView('TAX_FILING');
        }
        await handleSelectInvoice(match);
      } else {
        showToast(`Linked bill "${targetInvoiceNumber || targetInvoiceId}" could not be found`, 'error');
      }
    } catch (e: any) {
      console.error('[handleViewLinkedInvoice] Failed to load linked invoice:', e);
      showToast('Could not open linked bill: ' + (e?.message || 'Error'), 'error');
    }
  };

  const liveInvoicesForSummary = invoices.filter(i =>
    accountingView === 'TAX_FILING'
      ? i.invoice_type === 'GST'
      : accountingView === 'REAL_SALES'
        ? i.invoice_type === 'BILL_OF_SUPPLY'
        : !i.converted_from_invoice_id
  );
  const fallbackSummary = {
    totalSales: liveInvoicesForSummary.reduce((s, i) => s + getInvoiceRevenueForFilter(i, paymentFilter), 0),
    totalSalesBeforeDeductions: liveInvoicesForSummary.reduce((s, i) => s + getInvoicePreDeductionTotal(i), 0),
    totalInvoices: liveInvoicesForSummary.length,
    totalTax: liveInvoicesForSummary.reduce((s, i) => s + (i.tax_total || 0), 0),
    totalDiscount: liveInvoicesForSummary.reduce((s, i) => s + (i.discount_total || 0), 0),
    avgOrder: 0,
  };
  fallbackSummary.avgOrder = fallbackSummary.totalInvoices > 0
    ? fallbackSummary.totalSales / fallbackSummary.totalInvoices
    : 0;

  const baseSummary = dbSummary
    ? { ...dbSummary, totalSalesBeforeDeductions: dbSummary.totalSalesBeforeDeductions ?? fallbackSummary.totalSalesBeforeDeductions }
    : fallbackSummary;

  const summary = taxFilterActive
    ? {
        totalSales: taxProductTotals?.netRevenue ?? 0,
        totalSalesBeforeDeductions: taxProductTotals?.totalSales ?? 0,
        totalInvoices: taxProductTotals?.invoiceCount ?? 0,
        totalTax: taxProductTotals?.totalTax ?? 0,
        totalDiscount: taxProductTotals?.totalDiscount ?? 0,
        avgOrder: taxProductTotals && taxProductTotals.invoiceCount > 0
          ? taxProductTotals.netRevenue / taxProductTotals.invoiceCount
          : 0,
      }
    : baseSummary;

  const summaryLoading = loading || (taxFilterActive && taxProductLoading);

  const conversionDeductionsTotal = conversionPreview?.invoices?.reduce(
    (sum, inv) => sum + (Number(inv.deductions_total) || 0),
    0
  ) || 0;

  const isStaff = isStaffRole(role);
  const shouldMask = shouldApplyStaffMasking(role, maskingConfig);

  const maskedRevenue = useMemo(() => {
    return calculateMaskedSalesRevenue(summary.totalSales, maskingConfig, isStaff);
  }, [summary.totalSales, maskingConfig, isStaff]);

  const maskedTotalSales = useMemo(() => {
    return calculateMaskedSalesRevenue(summary.totalSalesBeforeDeductions, maskingConfig, isStaff);
  }, [summary.totalSalesBeforeDeductions, maskingConfig, isStaff]);

  const maskedAvgOrder = useMemo(() => {
    if (maskedRevenue.isHidden) return { displayAmount: 0, isHidden: true, isMasked: true };
    if (maskedRevenue.isMasked && summary.totalInvoices > 0) {
      return { displayAmount: maskedRevenue.displayAmount / summary.totalInvoices, isHidden: false, isMasked: true };
    }
    return { displayAmount: summary.avgOrder, isHidden: false, isMasked: false };
  }, [maskedRevenue, summary.avgOrder, summary.totalInvoices]);

  const staffDateScope = useMemo(() => {
    return getStaffSalesDateScope(maskingConfig, isStaff);
  }, [maskingConfig, isStaff]);

  const dailySales = useMemo(() => groupByDay(invoices), [invoices]);

  const groupedInvoices = useMemo(() => {
    const groups: { date: string; items: any[] }[] = [];
    for (const inv of invoices) {
      const key = formatGroupDate(inv.created_at);
      const last = groups[groups.length - 1];
      if (last && last.date === key) last.items.push(inv);
      else groups.push({ date: key, items: [inv] });
    }
    return groups;
  }, [invoices]);

  const { handleReprint } = useInvoiceReprint({
    items, selectedInvoice, setReprintSuccess, showToast,
  });

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const { handleSendWhatsAppInvoice } = useInvoiceWhatsApp({
    items, selectedInvoice, setIsSendingWhatsApp, showToast,
  });

  const handleEditBill = async () => {
    const { role, permissions } = useAuthStore.getState();
    if (!hasPermission({ role, permissions }, 'sales.edit')) {
      showToast('Permission Denied: You do not have permission to edit bills', 'error');
      return;
    }
    if (!isDesktopRuntime() || !selectedInvoice) return;
    let currentItems = items;
    if (!currentItems.length) {
      const data = await getInvoiceItems(selectedInvoice.invoice_id);
      currentItems = Array.isArray(data) ? data : [];
    }
    let freshInvoice = selectedInvoice;
    if (isDesktopRuntime()) {
      try {
        const fetched = await listInvoices({ search: selectedInvoice.invoice_number || selectedInvoice.invoice_id, tenant_id: selectedInvoice.tenant_id });
        if (Array.isArray(fetched) && fetched.length > 0) {
          const exact = fetched.find((i: any) => i.invoice_id === selectedInvoice.invoice_id);
          if (exact) freshInvoice = exact;
        }
      } catch {}
    }
    localStorage.setItem('editBillData', JSON.stringify({ invoice: freshInvoice, items: currentItems, originalRole: useAuthStore.getState().role }));
    invoiceDetailsCache.current.delete(selectedInvoice.invoice_id);
    onClose();
    if (isAdminRole(useAuthStore.getState().role)) useCartStore.getState().setRole('BILLER');
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 50);
  };

  const handleDeleteInvoice = async () => {
    const { role, permissions } = useAuthStore.getState();
    if (!hasPermission({ role, permissions }, 'sales.delete')) {
      showToast('Permission Denied: You do not have permission to delete bills', 'error');
      return;
    }
    if (!isDesktopRuntime() || !selectedInvoice) return;
    setDeleteSaving(true);
    try {
      const result = await invoicesApi.deleteInvoice(selectedInvoice.invoice_id);
      if (result.success) {
        invoiceDetailsCache.current.delete(selectedInvoice.invoice_id);
        setDeleteConfirmOpen(false);
        setDrawerOpen(false);
        setTimeout(() => { setSelectedInvoice(null); setItems([]); }, 300);
        loadInvoices(true);
        showToast('Invoice moved to Recycle Bin (can be restored anytime)', 'success');
      } else {
        showToast('Delete failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (err: any) {
      showToast('Delete failed: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setDeleteSaving(false);
    }
  };

  const openCollectPayment = () => {
    if (!selectedInvoice) return;
    setCollectPaymentMethod('CASH');
    setCollectReceivedAmount(Number(selectedInvoice.grand_total) || 0);
    setCollectPaymentOpen(true);
    setCollectPaymentSuccess(false);
  };

  const handleCollectPayment = async () => {
    if (!isDesktopRuntime() || !selectedInvoice) return;
    setCollectPaymentSaving(true);
    try {
      const { tenantId } = useAuthStore.getState();
      const isCreditPayment = collectPaymentMethod === 'CREDIT';
      const invGrandTotal = Number(selectedInvoice.grand_total) || 0;
      const balanceAmount = isCreditPayment
        ? Math.max(0, invGrandTotal - collectReceivedAmount)
        : (collectReceivedAmount > invGrandTotal ? (collectReceivedAmount - invGrandTotal) : 0);

      const selectedCollectSource = upiSources.find((s: any) => s.source_id === collectUpiSourceId) || upiSources[0];
      const collectSplitDetails = collectPaymentMethod === 'UPI' && selectedCollectSource
        ? { upi_id: selectedCollectSource.upi_id, upi_name: selectedCollectSource.name, upi_source_id: selectedCollectSource.source_id }
        : selectedInvoice.split_details;

      const result = await invoicesApi.updateInvoicePayment({
        invoice_id: selectedInvoice.invoice_id,
        tenant_id: tenantId || 'global',
        payment_method: collectPaymentMethod,
        received_amount: collectReceivedAmount,
        balance_amount: balanceAmount,
        split_details: collectSplitDetails,
      });

      if (result.success) {
        invoiceDetailsCache.current.delete(selectedInvoice.invoice_id);
        setCollectPaymentSuccess(true);
        // Refresh the selected invoice to show updated payment
        setSelectedInvoice({
          ...selectedInvoice,
          payment_method: collectPaymentMethod,
          received_amount: collectReceivedAmount,
          balance_amount: balanceAmount,
          split_details: collectSplitDetails && typeof collectSplitDetails === 'object' ? JSON.stringify(collectSplitDetails) : (collectSplitDetails && collectSplitDetails !== 'null' ? collectSplitDetails : null),
        });
        // Refresh the full list
        loadInvoices(true);
        // Dispatch event to refresh CashierSettlement drawer cash instantly
        window.dispatchEvent(new CustomEvent('checkout:completed'));
        setTimeout(() => {
          setCollectPaymentOpen(false);
          setCollectPaymentSuccess(false);
        }, 1500);
      } else {
        showToast('Failed to update payment: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (err: any) {
      console.error('Failed to collect payment', err);
      showToast('Failed to update payment: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setCollectPaymentSaving(false);
    }
  };

  const { handleExportCSV } = useSalesCsvExport({
    accountingView, filterDate, filterDateEnd, invoiceTypeFilter, paymentFilter, search, setExportStatusMsg,
    setIsExporting, taxFilterActive, taxPercentageFilter,
  });
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ─── TOAST ─── */}
      {reprintSuccess && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto max-w-md">
          <div className="p-2 rounded-xl bg-emerald-500/25 text-emerald-400 shrink-0">
            <CheckCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">PRINT SUCCESS</span>
            <span className="text-white font-black text-xs block truncate">Invoice reprinted successfully!</span>
          </div>
        </div>
      )}

      {/* ─── CONVERSION TOAST ─── */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto max-w-md">
          <div className={clsx("p-2 rounded-xl shrink-0", toast.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
            {toast.type === 'success' ? <CheckCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
              {toast.type === 'success' ? 'SUCCESS' : 'PRINT & ACTION ALERT'}
            </span>
            <span className="text-white font-bold text-xs block leading-tight">{toast.text}</span>
          </div>
        </div>
      )}

      {/* ─── EXPORT TOAST ─── */}
      {exportStatusMsg && (
        <div className="fixed top-4 right-4 z-[60] px-5 py-3 bg-card border border-border rounded-2xl flex items-center gap-2.5 text-sm font-bold shadow-2xl" style={{ animation: 'slideDown 0.25s ease' }}>
          {isExporting
            ? <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin shrink-0" />
            : <Download className="w-4 h-4 text-emerald-500 shrink-0" />
          }
          <span className={exportStatusMsg.startsWith('Export failed') ? 'text-destructive' : 'text-foreground'}>
            {exportStatusMsg}
          </span>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <SalesHistoryHeader
        onClose={onClose} isRestricted={isRestricted}
        filterDate={filterDate} filterDateEnd={filterDateEnd} handleExportCSV={handleExportCSV}
        isExporting={isExporting} isStaff={isStaff} maskingConfig={maskingConfig} permissions={permissions} role={role}
        setFilterDate={setFilterDate} setFilterDateEnd={setFilterDateEnd} setViewMode={setViewMode}
        shouldMask={shouldMask} staffDateScope={staffDateScope} viewMode={viewMode}
      />

      {/* ─── BODY ─── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ VIEW MODE 1: BILLS LIST (DE-CONGESTED) ══ */}
        {viewMode === 'bills' ? (
          <div className="flex flex-col flex-1 overflow-hidden w-full">

            {/* Compact Single-Row High-Density KPI Bar */}
            <div className="px-4 py-2 border-b border-border/70 bg-card/60 shrink-0">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* KPI 1: Total Revenue / GST Turnover */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[170px] transition-all">
                    <div className="p-1.5 rounded-lg shrink-0 transition-colors bg-emerald-500/10 text-emerald-500">
                      <IndianRupee className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                          {accountingView === 'TAX_FILING' ? 'GST Turnover' : accountingView === 'REAL_SALES' ? 'BOS Turnover' : 'Total Revenue'}
                        </span>
                        {maskedRevenue.isMasked && !isStaff && (
                          <span className="text-[8px] bg-primary/10 text-primary px-1 rounded font-bold leading-none">BOS</span>
                        )}
                      </div>
                      <span className="text-xs font-black font-mono tabular-nums leading-tight block mt-0.5 text-emerald-600 dark:text-emerald-400">
                        {summaryLoading ? '…' : maskedRevenue.isHidden ? '••••••••' : formatCurrency(maskedRevenue.displayAmount)}
                      </span>
                    </div>
                  </div>

                  {/* KPI: Total Sales */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[155px] transition-all">
                    <div className="p-1.5 rounded-lg shrink-0 bg-teal-500/10 text-teal-500">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                        Total Sales
                      </span>
                      <span className="text-xs font-black font-mono tabular-nums leading-tight block mt-0.5 text-teal-600 dark:text-teal-400">
                        {summaryLoading ? '…' : maskedTotalSales.isHidden ? '••••••••' : formatCurrency(maskedTotalSales.displayAmount)}
                      </span>
                    </div>
                  </div>

                  {/* KPI 2: Avg Order Value */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[160px]">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                        {accountingView === 'TAX_FILING' ? 'Avg GST Invoice' : accountingView === 'REAL_SALES' ? 'Avg BOS Order' : 'Avg Order Value'}
                      </span>
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums leading-tight block mt-0.5">
                        {summaryLoading ? '…' : maskedAvgOrder.isHidden ? '••••••••' : formatCurrency(maskedAvgOrder.displayAmount)}
                      </span>
                    </div>
                  </div>

                  {/* KPI 3: Total Tax */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[150px]">
                    <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
                      <Percent className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                        {accountingView === 'TAX_FILING' ? 'Declared GST Tax' : 'Total Tax'}
                      </span>
                      <span className="text-xs font-black text-violet-600 dark:text-violet-400 font-mono tabular-nums leading-tight block mt-0.5">
                        {summaryLoading ? '…' : maskedRevenue.isHidden ? '••••••••' : formatCurrency(summary.totalTax)}
                      </span>
                    </div>
                  </div>

                  {/* KPI 4: Total Invoices / Discounts */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[150px]">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                      <Receipt className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">
                        {accountingView === 'TAX_FILING' ? 'GST Invoices' : accountingView === 'REAL_SALES' ? 'BOS Invoices' : 'Total Invoices'}
                      </span>
                      <span className="text-xs font-black text-foreground font-mono tabular-nums leading-tight block mt-0.5">
                        {summaryLoading ? '…' : `${summary.totalInvoices} Bills`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Toggle for Collapsible Trend Banner */}
                <button
                  type="button"
                  onClick={() => setShowGraphBanner(!showGraphBanner)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border shadow-2xs shrink-0 active:scale-95',
                    showGraphBanner
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs shadow-primary/20'
                      : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 border-border/80'
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{showGraphBanner ? 'Hide Trend Chart' : 'Show Trend Chart'}</span>
                </button>
              </div>
            </div>

            {/* Smooth Collapsible Revenue Trend Banner */}
            {showGraphBanner && !loading && invoices.length > 1 && (
              <div className="p-4 border-b border-border bg-card/80 transition-all duration-300 shrink-0">
                <div className="bg-background border border-border/80 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      <span className="text-xs font-black uppercase tracking-widest text-foreground">Daily Revenue Trend</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                      {dailySales.length} Days Tracked
                    </span>
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailySales} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                          axisLine={false} tickLine={false} dy={4}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                          axisLine={false} tickLine={false} width={50}
                          tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 12, fontSize: 11, fontWeight: 800,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            padding: '6px 12px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 900, marginBottom: 2 }}
                          itemStyle={{ color: 'hsl(var(--primary))' }}
                          formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']}
                          cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                        />
                        <Area
                          type="monotone" dataKey="sales"
                          stroke="hsl(var(--primary))" strokeWidth={2}
                          fill="url(#salesGrad)"
                          dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Search + Payment Method Filter Toolbar */}
            <div className="px-4 py-3 flex items-center gap-3 shrink-0 border-b border-border bg-card flex-wrap">
              {/* Accounting View Switcher: BOS vs GST */}
              <div className="inline-flex items-center bg-muted/80 dark:bg-muted/40 p-1 rounded-2xl border border-border/80 shadow-inner gap-1 backdrop-blur-xs shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAccountingView('REAL_SALES');
                    setInvoiceTypeFilter('');
                    setTaxPercentageFilter('');
                  }}
                  className={clsx(
                    'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer active:scale-[0.97] select-none',
                    accountingView === 'REAL_SALES'
                      ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/30 border border-emerald-500/40 ring-1 ring-emerald-500/20'
                      : 'text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10'
                  )}
                  title="Bill of Supply / Counter Sales (BOS)"
                >
                  <span className="relative flex items-center justify-center">
                    <Receipt className="w-3.5 h-3.5" />
                    {accountingView === 'REAL_SALES' && (
                      <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    )}
                  </span>
                  <span>BOS</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountingView('TAX_FILING');
                    if (invoiceTypeFilter === 'BILL_OF_SUPPLY') setInvoiceTypeFilter('');
                    setTaxPercentageFilter('');
                  }}
                  className={clsx(
                    'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-[0.97] select-none',
                    accountingView === 'TAX_FILING'
                      ? 'bg-card text-foreground border border-border shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                  )}
                  title="Official Statutory GST Invoices (GST)"
                >
                  <span>GST</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountingView('ALL');
                    setTaxPercentageFilter('');
                  }}
                  className={clsx(
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer active:scale-[0.97] select-none',
                    accountingView === 'ALL'
                      ? 'bg-card text-foreground border border-border shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                  )}
                  title="All Invoices & Filing Copies"
                >
                  <span>All</span>
                </button>
              </div>

              <span className="w-px h-6 bg-border/60 mx-0.5 shrink-0" />

              <div className="relative flex-1 max-w-xs">
                {isSearching ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary animate-spin pointer-events-none" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                )}
                <Input
                  type="text"
                  placeholder="Search invoice or customer…"
                  className="pl-9 pr-8 h-8.5 text-xs bg-background border-border/80 font-medium rounded-xl"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setDebouncedSearch('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer active:scale-90"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Select
                  value={paymentFilter}
                  onChange={setPaymentFilter}
                  options={[
                    { value: '', label: 'All' },
                    { value: 'PENDING', label: 'Pending' },
                    { value: 'CASH', label: 'Cash' },
                    { value: 'CARD', label: 'Card' },
                    { value: 'UPI', label: 'UPI' },
                    { value: 'CHEQUE', label: 'Cheque' },
                    { value: 'CREDIT', label: 'Credit' },
                    { value: 'SPLIT', label: 'Split' },
                  ]}
                  size="xs"
                  className="w-36"
                  triggerClassName="rounded-xl h-8.5 border px-3 transition-all bg-background border-border/80 hover:bg-muted/30"
                />
                <span className="w-px h-5 bg-border/60 mx-1 shrink-0" />
                {accountingView !== 'REAL_SALES' && (() => {
                  const typeOptions = accountingView === 'TAX_FILING'
                    ? [
                        { value: '', label: 'All GST Types' },
                        { value: 'GST_B2B', label: 'B2B' },
                        { value: 'GST_B2C', label: 'B2C' },
                      ]
                    : [
                        { value: '', label: 'All Types' },
                        { value: 'GST_B2B', label: 'B2B' },
                        { value: 'GST_B2C', label: 'B2C' },
                        { value: 'BILL_OF_SUPPLY', label: 'Bill of Supply' },
                      ];

                  const typeChipColors: Record<string, { bg: string; text: string; border: string }> = {
                    '': { bg: 'bg-background border-border/80 hover:bg-muted/30', text: 'text-foreground', border: 'border-border/80' },
                    GST_B2B: { bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/25' },
                    GST_B2C: { bg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/25' },
                    BILL_OF_SUPPLY: { bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/25' },
                  };
                  const colors = typeChipColors[invoiceTypeFilter] || typeChipColors[''];
                  return (
                    <Select
                      value={invoiceTypeFilter}
                      onChange={setInvoiceTypeFilter}
                      options={typeOptions}
                      size="xs"
                      className="w-40"
                      triggerClassName={clsx('rounded-xl h-8.5 border px-3 transition-all font-semibold', colors.bg, colors.text, colors.border)}
                      renderOption={(opt) => {
                        const typeIcon: Record<string, any> = { '': Receipt, GST_B2B: Building, GST_B2C: User, BILL_OF_SUPPLY: FileText };
                        const typeColor: Record<string, string> = { '': 'text-foreground', GST_B2B: 'text-blue-500', GST_B2C: 'text-violet-500', BILL_OF_SUPPLY: 'text-amber-500' };
                        const Icon = typeIcon[opt.value];
                        return (
                          <span className={clsx('flex items-center gap-2 text-xs font-bold', typeColor[opt.value])}>
                            <Icon className="w-3.5 h-3.5" />
                            {opt.label}
                          </span>
                        );
                      }}
                    />
                  );
                })()}
                {accountingView !== 'REAL_SALES' && invoiceTypeFilter !== 'BILL_OF_SUPPLY' && (
                  <>
                    <Select
                      value={taxPercentageFilter}
                      onChange={setTaxPercentageFilter}
                      options={TAX_RATES}
                      size="xs"
                      className="w-28"
                      triggerClassName="rounded-xl h-8.5 border px-3 transition-all bg-background border-border/80 hover:bg-muted/30 font-semibold"
                      renderOption={(opt) => (
                        <span className="flex items-center gap-2 text-xs font-bold text-foreground">
                          <Percent className="w-3 h-3 text-muted-foreground" />
                          {opt.label}
                        </span>
                      )}
                    />
                    {taxFilterActive && (
                      <button
                        type="button"
                        onClick={() => setTaxPercentageFilter('')}
                        className="h-8.5 px-2.5 rounded-xl text-xs font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/25 hover:bg-violet-500/20 active:scale-95 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                        title="Clear GST tax rate filter and return to bills list"
                      >
                        <span>{taxPercentageFilter}% GST</span>
                        <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="ml-auto text-[10px] text-muted-foreground font-semibold shrink-0">
                {summaryLoading
                  ? '…'
                  : taxFilterActive
                    ? (
                      <span className="flex items-center gap-2">
                        <span>{`${taxProductRows.length} product${taxProductRows.length !== 1 ? 's' : ''} from ${summary.totalInvoices} bill${summary.totalInvoices !== 1 ? 's' : ''}`}</span>
                        <button
                          type="button"
                          onClick={() => setTaxPercentageFilter('')}
                          className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[10px] font-bold text-foreground hover:text-destructive transition-colors cursor-pointer border border-border/60"
                          title="Clear tax rate filter"
                        >
                          Clear
                        </button>
                      </span>
                    )
                    : invoices.length === summary.totalInvoices
                      ? `${summary.totalInvoices} record${summary.totalInvoices !== 1 ? 's' : ''}`
                      : `Showing ${invoices.length} of ${summary.totalInvoices} records`}
              </div>

              {!taxFilterActive && enableConvertToGst && isAdminRole(useAuthStore.getState().role) && (
                !selectionMode ? (
                  <button
                    type="button"
                    onClick={() => setSelectionMode(true)}
                    className="h-8.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 active:scale-95 flex items-center gap-1.5 shrink-0 shadow-2xs hover:shadow-amber-500/10"
                    title="Select eligible Bill of Supply sales to convert into statutory GST invoices"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Convert to GST</span>
                  </button>
                ) : (
                  <div className="inline-flex items-center bg-muted/80 dark:bg-muted/40 p-1 rounded-2xl border border-border/80 shadow-inner gap-1 backdrop-blur-xs shrink-0 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0) {
                          setSelectedInvoiceIds(new Set());
                        } else {
                          setSelectedInvoiceIds(new Set(convertibleInvoicesInView.map(i => i.invoice_id)));
                        }
                      }}
                      className={clsx(
                        'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.97] select-none',
                        selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0
                          ? 'bg-card text-foreground border border-border shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                      )}
                      title="Select or deselect all convertible bills"
                    >
                      <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0
                          ? 'Deselect All'
                          : `Select All (${convertibleInvoicesInView.length})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConversionOpen(true)}
                      disabled={selectedBosInvoices.length === 0}
                      className={clsx(
                        'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 select-none',
                        selectedBosInvoices.length > 0
                          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs shadow-amber-500/25 border border-amber-400/40 ring-1 ring-amber-400/20 cursor-pointer active:scale-[0.97]'
                          : 'text-muted-foreground/50 cursor-not-allowed opacity-60'
                      )}
                      title={selectedBosInvoices.length === 0 ? 'Select at least 1 Bill of Supply to convert' : 'Click to convert selected bills to GST'}
                    >
                      <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Convert Selected{selectedBosInvoices.length > 0 ? ` (${selectedBosInvoices.length})` : ''}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setSelectionMode(false); setSelectedInvoiceIds(new Set()); }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer active:scale-[0.97] select-none text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10"
                      title="Exit selection mode"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" />
                      <span>Cancel</span>
                    </button>
                  </div>
                )
              )}
            </div>
          {/* Table */}
          <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
            {taxFilterActive ? (
              taxProductLoading ? (
                <table className="w-full">
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="px-4 py-3.5"><Skeleton className="h-3 w-20" /></td>
                        <td className="px-4 py-3.5"><Skeleton className="h-3 w-24" /></td>
                        <td className="px-4 py-3.5"><Skeleton className="h-3 w-40" /></td>
                        <td className="px-4 py-3.5"><Skeleton className="h-5 w-14 rounded-full" /></td>
                        <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : taxProductRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
                  <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border flex items-center justify-center">
                    <Percent className="w-7 h-7 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground/60">No products found for {taxPercentageFilter}% GST</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your search or filters</p>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-muted/60 border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invoice</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date &amp; Time</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Product</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">GST</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Qty</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Taxable</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">GST Amt</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {taxProductRows.map((row, index) => {
                      const formatted = formatDate(row.createdAt);
                      return (
                        <tr
                          key={`${row.invoiceId}-${row.item?.item_id || index}`}
                          onClick={() => handleSelectInvoice(row.invoice)}
                          className="cursor-pointer transition-colors hover:bg-primary/5"
                        >
                          <td className="px-4 py-3">
                            <div className="font-mono font-black text-xs text-foreground">{row.invoiceNumber}</div>
                            <div className="text-[10px] text-muted-foreground font-semibold truncate max-w-[150px]">{row.invoice?.customer_name || 'Walk-in Customer'}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            <div className="font-bold text-foreground">{formatted.date}</div>
                            <div>{formatted.time}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-xs text-foreground">{row.name}</div>
                            {row.hsn && <div className="text-[10px] font-mono text-muted-foreground">HSN: {row.hsn}</div>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/25">
                              {row.gstRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-foreground">{row.quantity} <span className="text-[10px] text-muted-foreground">{row.uom}</span></td>
                          <td className="px-4 py-3 text-right text-xs font-mono font-bold text-foreground">{formatCurrency(row.taxable)}</td>
                          <td className="px-4 py-3 text-right text-xs font-mono font-bold text-violet-600 dark:text-violet-400">{formatCurrency(row.tax)}</td>
                          <td className="px-4 py-3 text-right text-xs font-mono font-black text-foreground">{formatCurrency(row.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : loading ? (
              <table className="w-full">
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><Skeleton className="w-8 h-8 rounded-xl shrink-0" /><div className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-2.5 w-16" /></div></div></td>
                      <td className="px-4 py-3.5"><Skeleton className="h-3 w-20" /></td>
                      <td className="px-4 py-3.5"><Skeleton className="h-3 w-24" /></td>
                      <td className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="px-4 py-3.5 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      <td className="px-3 py-3.5" />
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border flex items-center justify-center">
                  <Receipt className="w-7 h-7 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground/60">No records found</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your search or filters</p>
                </div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-muted/60 border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {selectionMode && convertibleInvoicesInView.length > 0 && (
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.size === convertibleInvoicesInView.length && convertibleInvoicesInView.length > 0}
                            onChange={() => {
                              if (selectedInvoiceIds.size === convertibleInvoicesInView.length) {
                                setSelectedInvoiceIds(new Set());
                              } else {
                                setSelectedInvoiceIds(new Set(convertibleInvoicesInView.map(i => i.invoice_id)));
                              }
                            }}
                            className="w-4 h-4 rounded-md border-2 border-border text-primary focus:ring-primary/20 transition-all cursor-pointer"
                            title="Select / Deselect All Convertible Bills"
                          />
                        )}
                        <span>Invoice</span>
                      </div>
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date &amp; Time</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {groupedInvoices.map((group) => (
                    <Fragment key={group.date}>
                      <tr className="sticky top-9 z-[5] bg-muted">
                        <td colSpan={7} className="px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border">
                          {group.date}
                        </td>
                      </tr>
                      {group.items.map((inv) => (
                        <InvoiceRow
                          key={inv.invoice_id}
                          inv={inv}
                          isSelected={selectedInvoice?.invoice_id === inv.invoice_id}
                          onMouseEnter={() => prefetchInvoice(inv.invoice_id)}
                          onClick={() => {
                            if (selectionMode) {
                              if (inv.invoice_type === 'BILL_OF_SUPPLY' && convertibleMap[inv.invoice_id]) {
                                setSelectedInvoiceIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(inv.invoice_id)) {
                                    next.delete(inv.invoice_id);
                                  } else {
                                    next.add(inv.invoice_id);
                                  }
                                  return next;
                                });
                              }
                            } else {
                              handleSelectInvoice(inv);
                            }
                          }}
                          selectionMode={selectionMode}
                          isChecked={selectedInvoiceIds.has(inv.invoice_id)}
                          convertible={convertibleMap[inv.invoice_id]}
                          onCheck={() => {
                            if (inv.invoice_type !== 'BILL_OF_SUPPLY' || !convertibleMap[inv.invoice_id]) return;
                            setSelectedInvoiceIds(prev => {
                              const next = new Set(prev);
                              if (next.has(inv.invoice_id)) {
                                next.delete(inv.invoice_id);
                              } else {
                                next.add(inv.invoice_id);
                              }
                              return next;
                            });
                          }}
                          upiSources={upiSources}
                        />
                      ))}
                    </Fragment>
                  ))}
                  {hasMore && (
                    <tr ref={sentinelRef}>
                      <td colSpan={7} className="py-5 text-center">
                        <button
                          type="button"
                          onClick={() => loadInvoices(false)}
                          disabled={isFetching}
                          className="h-9 px-5 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all duration-150 cursor-pointer inline-flex items-center gap-2 active:scale-95 shadow-2xs hover:shadow-xs disabled:opacity-50"
                        >
                          <RefreshCw className={clsx("w-3.5 h-3.5 text-primary", isFetching && "animate-spin")} />
                          <span>{isFetching ? 'Loading more records…' : `Load More Records (${invoices.length} of ${summary.totalInvoices} loaded)`}</span>
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 w-full">
          {/* Top Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard 
              icon={IndianRupee} 
              label="Total Revenue" 
              value={maskedRevenue.isHidden ? '••••••••' : formatCurrency(maskedRevenue.displayAmount)} 
              colorClass="text-emerald-500" 
              bgClass="bg-emerald-500/10" 
              sub={maskedRevenue.isHidden ? 'Protected' : `${summary.totalInvoices} settled invoices`} 
            />
            <StatCard 
              icon={Layers} 
              label="Total Sales" 
              value={maskedTotalSales.isHidden ? '••••••••' : formatCurrency(maskedTotalSales.displayAmount)} 
              colorClass="text-teal-500" 
              bgClass="bg-teal-500/10" 
              sub="Before scrap / returns" 
            />
            <StatCard 
              icon={TrendingUp} 
              label="Avg Order Value" 
              value={maskedAvgOrder.isHidden ? '••••••••' : formatCurrency(maskedAvgOrder.displayAmount)} 
              colorClass="text-blue-500" 
              bgClass="bg-blue-500/10" 
            />
            <StatCard 
              icon={Percent} 
              label="Total GST Tax" 
              value={maskedRevenue.isHidden ? '••••••••' : formatCurrency(summary.totalTax)} 
              colorClass="text-violet-500" 
              bgClass="bg-violet-500/10" 
            />
            {summary.totalDiscount > 0
              ? <StatCard icon={Tag} label="Discounts Given" value={formatCurrency(summary.totalDiscount)} colorClass="text-rose-500" bgClass="bg-rose-500/10" sub="Total savings" />
              : <StatCard icon={Layers} label="Invoices" value={String(summary.totalInvoices)} colorClass="text-amber-500" bgClass="bg-amber-500/10" sub="All time" />
            }
          </div>

          {/* High-Definition Daily Sales Trend Chart */}
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
              <div>
                <h2 className="text-base font-black text-foreground">Daily Revenue Analytics</h2>
                <p className="text-xs text-muted-foreground font-semibold">Revenue trend over recorded billing dates</p>
              </div>
              <div className="px-3 py-1 rounded-full text-xs font-black bg-primary/10 text-primary border border-primary/20">
                {dailySales.length} Days Recorded
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySales} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGradFull" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                    axisLine={false} tickLine={false} dy={6}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                    axisLine={false} tickLine={false} width={60}
                    tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 14, fontSize: 12, fontWeight: 800,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      padding: '8px 14px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 900, marginBottom: 4 }}
                    itemStyle={{ color: 'hsl(var(--primary))' }}
                    formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']}
                    cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone" dataKey="sales"
                    stroke="hsl(var(--primary))" strokeWidth={2.5}
                    fill="url(#salesGradFull)"
                    dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 7, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      </div>
      <InvoiceDetailModal
        onClose={onClose}
        canReturn={canReturn} closeDrawer={closeDrawer} convertibleMap={convertibleMap} drawerOpen={drawerOpen}
        enableConvertToGst={enableConvertToGst} handleEditBill={handleEditBill} handleReprint={handleReprint}
        handleSendWhatsAppInvoice={handleSendWhatsAppInvoice} handleViewLinkedInvoice={handleViewLinkedInvoice}
        isSendingWhatsApp={isSendingWhatsApp} items={items} itemsLoading={itemsLoading}
        openCollectPayment={openCollectPayment} selectedInvoice={selectedInvoice} setConversionOpen={setConversionOpen}
        setDeleteConfirmOpen={setDeleteConfirmOpen} setDrawerOpen={setDrawerOpen}
        setSelectedInvoiceIds={setSelectedInvoiceIds} upiSources={upiSources}
      />

      {/* ─── Collect Payment Modal ─── */}
      <CollectPaymentModal
        collectPaymentMethod={collectPaymentMethod}
        collectPaymentOpen={collectPaymentOpen} collectPaymentSaving={collectPaymentSaving}
        collectPaymentSuccess={collectPaymentSuccess} collectReceivedAmount={collectReceivedAmount}
        collectUpiSourceId={collectUpiSourceId} handleCollectPayment={handleCollectPayment}
        selectedInvoice={selectedInvoice} setCollectPaymentMethod={setCollectPaymentMethod}
        setCollectPaymentOpen={setCollectPaymentOpen} setCollectReceivedAmount={setCollectReceivedAmount}
        setCollectUpiSourceId={setCollectUpiSourceId} upiPageConfig={upiPageConfig} upiSources={upiSources}
      />

      {/* ─── Convert Bill of Supply → GST Modal ─── */}
      <ConversionModal
        conversionDeductionsTotal={conversionDeductionsTotal} conversionOpen={conversionOpen}
        conversionPreview={conversionPreview} conversionPreviewLoading={conversionPreviewLoading}
        conversionResults={conversionResults} conversionTaxMode={conversionTaxMode} converting={converting}
        loadInvoices={loadInvoices} selectedBosInvoices={selectedBosInvoices} setConversionOpen={setConversionOpen}
        setConversionResults={setConversionResults} setConversionTaxMode={setConversionTaxMode}
        setConverting={setConverting} setSelectedInvoiceIds={setSelectedInvoiceIds} setSelectionMode={setSelectionMode}
        showToast={showToast}
      />

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => { if (!deleteSaving) setDeleteConfirmOpen(false); }}
        closeButton={<RedCrossButton onClick={() => { if (!deleteSaving) setDeleteConfirmOpen(false); }} />}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span>Delete Invoice</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[400px] text-foreground">
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Are you sure?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This will move to Recycle Bin invoice <strong>{selectedInvoice?.invoice_number}</strong> 
              {selectedInvoice?.customer_name && <> for <strong>{selectedInvoice.customer_name}</strong></>}.
              Stock quantities will be returned. You can restore it anytime from the Recycle Bin.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteSaving}
              className="h-10 px-4 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-150 active:scale-95 cursor-pointer border border-border/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteInvoice}
              disabled={deleteSaving}
              className="h-10 px-6 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm shadow-rose-600/25 cursor-pointer flex items-center gap-2"
            >
              {deleteSaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> <span>Deleting...</span></>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> <span>Move to Recycle Bin</span></>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <style>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -12px); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
      `}</style>
    </div>
  );
}

