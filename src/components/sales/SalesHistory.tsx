import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, Trash2, CheckCheck, AlertCircle, Download } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getSetting } from '../../data/settings';
import { listInvoices, getInvoiceItems } from '../../data/invoices';
import {
  type InvoiceProductRow,
  type InvoiceProductTotals,
} from '../../utils/pricing/salesHistoryTax';
import { 
  type StaffDataMaskingConfig, 
  DEFAULT_STAFF_DATA_MASKING_CONFIG, 
  STAFF_DATA_MASKING_KEY, 
  parseStaffDataMaskingConfig, 
  isStaffRole, 
  shouldApplyStaffMasking, 
  calculateMaskedSalesRevenue,
  getStaffSalesDateScope 
} from '../../utils/security/staffDataMasking';
import { useCartStore } from '../../store/cartStore';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { RedCrossButton } from '../ui/RedCrossButton';
import { getUpiPageConfig, DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../../utils/print/upiConfig';
import { isAdminRole, hasPermission } from '../../utils/security/permissions';
import { hasBridge, isDesktopRuntime } from '../../data/client';
import { bridgeEvents } from '../../data/events';
import { invoicesApi } from '../../data/invoices';
import { syncApi } from '../../data/sync';
import { paymentSourcesApi } from '../../data/paymentSources';
import { formatGroupDate, groupByDay } from './salesHistoryFormat';
import type { InvoiceDetailsCacheEntry, SalesInvoiceItemRow, SalesInvoiceRow, UpiSourceOption } from './salesTypes';
import { useSalesCsvExport } from './hooks/useSalesCsvExport';
import { useInvoiceReprint } from './hooks/useInvoiceReprint';
import { useInvoiceWhatsApp } from './hooks/useInvoiceWhatsApp';
import { useInvoiceDetails } from './hooks/useInvoiceDetails';
import { useSalesInvoiceLoader } from './hooks/useSalesInvoiceLoader';
import { useSalesSummary } from './hooks/useSalesSummary';
import { useConversionPreview } from './hooks/useConversionPreview';
import { ConversionModal } from './views/ConversionModal';
import { CollectPaymentModal } from './views/CollectPaymentModal';
import { InvoiceDetailModal } from './views/InvoiceDetailModal';
import { SalesHistoryHeader } from './views/SalesHistoryHeader';
import { SalesAnalyticsView } from './views/SalesAnalyticsView';
import { SalesBillsView } from './views/SalesBillsView';
import { useLinkedInvoiceView } from './hooks/useLinkedInvoiceView';
import { useCollectPayment } from './hooks/useCollectPayment';
import { offerCardTerminalVoid } from '../billing/checkout/cardTerminalStep';

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
  const loadInvoicesRef = useRef<((reset?: boolean) => Promise<void>) | null>(null);
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT'>('CASH');
  const [collectReceivedAmount, setCollectReceivedAmount] = useState(0);
  const [collectPaymentSaving, setCollectPaymentSaving] = useState(false);
  const [collectPaymentSuccess, setCollectPaymentSuccess] = useState(false);

  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [upiSources, setUpiSources] = useState<UpiSourceOption[]>([]);
  const [collectUpiSourceId, setCollectUpiSourceId] = useState<string>('');
  const LIMIT = 30;
  const [taxProductRows, setTaxProductRows] = useState<InvoiceProductRow[]>([]);
  const [taxProductTotals, setTaxProductTotals] = useState<InvoiceProductTotals | null>(null);
  const [taxProductLoading, setTaxProductLoading] = useState(false);
  const taxProductRequestRef = useRef(0);
  const taxFilterActive = accountingView !== 'REAL_SALES' && taxPercentageFilter !== '' && taxPercentageFilter !== 'all';

  const { summary, summaryLoading, setDbSummary, setSummaryPending } = useSalesSummary({
    invoices, accountingView, paymentFilter, loading, taxFilterActive, taxProductLoading, taxProductTotals,
  });

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [convertibleMap, setConvertibleMap] = useState<Record<string, boolean>>({});
  const [conversionOpen, setConversionOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [conversionResults, setConversionResults] = useState<{ invoice_id: string; old_number: string | null; new_number: string; success: boolean; error?: string; skipped_items?: string[] }[] | null>(null);
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
        getSetting({ tenant_id: tenantId || 'global', key: 'enable_convert_to_gst' }).then((v) => {
          if (v !== null && v !== undefined) setEnableConvertToGst(Boolean(v));
        }).catch(() => {});

        getSetting({ tenant_id: tenantId || 'global', key: 'gst_conversion_tax_inclusive' }).then((v) => {
          if (v !== null && v !== undefined) setConversionTaxMode(v ? 'INCLUSIVE' : 'EXCLUSIVE');
        }).catch(() => {});

        getSetting({ tenant_id: tenantId || 'global', key: STAFF_DATA_MASKING_KEY }).then((v) => {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- search becoming empty clears the debounced filter immediately for the existing 0ms clear behavior.
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
    accountingView, debouncedSearch, filterDate, filterDateEnd, invoiceTypeFilter, LIMIT,
    maskingConfig, offset, paymentFilter, enableConvertToGst, setConvertibleMap, setDbSummary, setSummaryPending, setHasMore, setInvoices,
    setIsFetching, setLoading, setOffset, setTaxProductLoading, setTaxProductRows, setTaxProductTotals,
    taxFilterActive, taxPercentageFilter, taxProductRequestRef,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter changes reset pagination before the replacement invoice request starts.
    setOffset(0);
    setHasMore(true);
    loadInvoices(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadInvoices is recreated per render; filter and accounting values are the intended refresh triggers.
  }, [debouncedSearch, paymentFilter, invoiceTypeFilter, filterDate, filterDateEnd, taxPercentageFilter, maskingConfig, accountingView, tenantId]);

  useEffect(() => {
    if ((accountingView === 'REAL_SALES' || invoiceTypeFilter === 'BILL_OF_SUPPLY') && taxPercentageFilter !== '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- accountingView and invoiceTypeFilter clear a tax filter that is invalid in the selected view.
      setTaxPercentageFilter('');
    }
  }, [accountingView, invoiceTypeFilter, taxPercentageFilter]);

  useEffect(() => {
    getUpiPageConfig(useAuthStore.getState().tenantId || 'global').then(setUpiPageConfig);
    if (hasBridge('dbPaymentGetSources')) {
      paymentSourcesApi.getSources(useAuthStore.getState().tenantId || 'global').then((sources) => {
        if (Array.isArray(sources)) {
          setUpiSources(sources.filter((s) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
        }
      }).catch(() => {});
    }
    if (isDesktopRuntime()) {
      const unsub = bridgeEvents.onSyncDataUpdated(() => {
        console.log('[SalesHistory] 🔄 Auto-sync data updated event received! Reloading invoices from SQLite...');
        loadInvoicesRef.current!(true);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- salesHistoryInitialSearch is a one-time navigation handoff consumed after mount.
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

  const sentinelRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (isFetching || !hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !isFetching && hasMore) {
        loadInvoicesRef.current!(false);
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

  const handleSelectInvoice = async (inv: SalesInvoiceRow) => {
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

  const { handleViewLinkedInvoice } = useLinkedInvoiceView({
    accountingView, handleSelectInvoice, invoices, setAccountingView, showToast,
  });

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
    const groups: { date: string; items: SalesInvoiceRow[] }[] = [];
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
        const fetched = await listInvoices({ search: selectedInvoice.invoice_number || selectedInvoice.invoice_id, tenant_id: selectedInvoice.tenant_id as string | undefined });
        if (Array.isArray(fetched) && fetched.length > 0) {
          const exact = fetched.find((i) => i.invoice_id === selectedInvoice.invoice_id);
          if (exact) freshInvoice = exact;
        }
      } catch { /* ignore */ }
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
        await offerCardTerminalVoid(selectedInvoice.split_details);
      } else {
        showToast('Delete failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      showToast('Delete failed: ' + ((err as Error)?.message || 'Unknown error'), 'error');
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

  const { handleCollectPayment } = useCollectPayment({
    collectPaymentMethod, collectReceivedAmount, collectUpiSourceId, invoiceDetailsCache, loadInvoices,
    selectedInvoice, setCollectPaymentOpen, setCollectPaymentSaving, setCollectPaymentSuccess,
    setSelectedInvoice, showToast, upiSources,
  });

  const { handleExportCSV } = useSalesCsvExport({
    accountingView, filterDate, filterDateEnd, invoiceTypeFilter, paymentFilter, search, setExportStatusMsg,
    setIsExporting, taxFilterActive, taxPercentageFilter,
  });

  const [isResyncingBills, setIsResyncingBills] = useState(false);
  const handleResyncBills = async () => {
    setIsResyncingBills(true);
    try {
      await syncApi.forceResyncEntities(['invoices']);
      await loadInvoices(true);
      showToast('Bills re-synced from cloud!', 'success');
    } catch (e) {
      showToast('Re-sync failed: ' + (e as Error).message, 'error');
    } finally {
      setIsResyncingBills(false);
    }
  };
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
        onResyncBills={handleResyncBills} isResyncingBills={isResyncingBills}
      />

      {/* ─── BODY ─── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ VIEW MODE 1: BILLS LIST (DE-CONGESTED) ══ */}
        {viewMode === 'bills' ? (
          <SalesBillsView
            accountingView={accountingView} convertibleInvoicesInView={convertibleInvoicesInView}
            convertibleMap={convertibleMap} dailySales={dailySales} enableConvertToGst={enableConvertToGst}
            groupedInvoices={groupedInvoices} handleScroll={handleScroll} handleSelectInvoice={handleSelectInvoice}
            hasMore={hasMore} invoices={invoices} invoiceTypeFilter={invoiceTypeFilter} isFetching={isFetching}
            isSearching={isSearching} isStaff={isStaff} loading={loading} loadInvoices={loadInvoices}
            maskedAvgOrder={maskedAvgOrder} maskedRevenue={maskedRevenue} maskedTotalSales={maskedTotalSales}
            paymentFilter={paymentFilter} prefetchInvoice={prefetchInvoice} search={search}
            selectedBosInvoices={selectedBosInvoices} selectedInvoice={selectedInvoice}
            selectedInvoiceIds={selectedInvoiceIds} selectionMode={selectionMode} sentinelRef={sentinelRef}
            setAccountingView={setAccountingView} setConversionOpen={setConversionOpen}
            setDebouncedSearch={setDebouncedSearch} setInvoiceTypeFilter={setInvoiceTypeFilter}
            setPaymentFilter={setPaymentFilter} setSearch={setSearch} setSelectedInvoiceIds={setSelectedInvoiceIds}
            setSelectionMode={setSelectionMode} setShowGraphBanner={setShowGraphBanner}
            setTaxPercentageFilter={setTaxPercentageFilter} showGraphBanner={showGraphBanner} summary={summary}
            summaryLoading={summaryLoading} taxFilterActive={taxFilterActive} taxPercentageFilter={taxPercentageFilter}
            taxProductLoading={taxProductLoading} taxProductRows={taxProductRows} upiSources={upiSources}
          />
      ) : (
        <SalesAnalyticsView
          dailySales={dailySales} maskedAvgOrder={maskedAvgOrder} maskedRevenue={maskedRevenue}
          maskedTotalSales={maskedTotalSales} summary={summary} summaryLoading={summaryLoading}
        />
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

