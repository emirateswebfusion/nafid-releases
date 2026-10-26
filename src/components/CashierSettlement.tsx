import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, Plus, X, DollarSign, Clock, AlertTriangle, Bell, Zap } from 'lucide-react';
import { CustomDialog, type DialogVariant } from './ui/CustomDialog';
import { FloatToast } from './ui/FloatToast';
import { useAuthStore } from '../store/authStore';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { parseUTCDate } from '../utils/receiptGenerator';
import { cashierPageTitle, useFeatureFlagsStore } from '../featureFlags';
import { getUpiPageConfig, DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../utils/upiConfig';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { isAdminRole } from '../utils/permissions';
import { cashierApi } from '../data/cashier';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { bridgeEvents } from '../data/events';
import { paymentSourcesApi } from '../data/paymentSources';
import { settingsApi } from '../data/settings';
import { syncApi } from '../data/sync';
import { formatCurrency } from '../utils/money';
import { type PaymentMethod, todayStr, formatBusinessDate } from './cashier/cashierFormat';
import { ReopenDrawerDialog } from './cashier/views/ReopenDrawerDialog';
import { DeleteTransactionDialog } from './cashier/views/DeleteTransactionDialog';
import { SplitSettlementDialog } from './cashier/views/SplitSettlementDialog';
import { CashierInvoiceModal } from './cashier/views/CashierInvoiceModal';
import { CashTransactionModal } from './cashier/views/CashTransactionModal';
import { DayCloseDialog } from './cashier/views/DayCloseDialog';
import { CashRegisterPanel } from './cashier/views/CashRegisterPanel';
import { PendingSettlementPanel } from './cashier/views/PendingSettlementPanel';
import { SettlementHistoryView } from './cashier/views/SettlementHistoryView';
import { CashierHeader } from './cashier/views/CashierHeader';
import type { CashCategoryRow, CashDrawerRow, CashPartyRow, CashTransactionRow, CashierInvoiceItemRow, CashierInvoiceRow, CashierUpiSourceRow, DayCloseResult, DaySettlementRow } from './cashier/cashierTypes';
import { useCashDrawerActions } from './cashier/hooks/useCashDrawerActions';
import { useSettlementAmountEdit } from './cashier/hooks/useSettlementAmountEdit';
import { useCashierInvoiceView } from './cashier/hooks/useCashierInvoiceView';
import { CashierLoadingSkeleton } from './cashier/views/CashierLoadingSkeleton';
import { PreviousDrawerOpenBanner } from './cashier/views/PreviousDrawerOpenBanner';

interface CashierSettlementProps {
  onClose: () => void;
  isRestricted?: boolean;
}

export function CashierSettlement({ onClose, isRestricted }: CashierSettlementProps) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName, role } = useAuthStore();
  const isOwner = role?.toUpperCase() === 'OWNER' || role?.toUpperCase() === 'SUPER_ADMIN' || isAdminRole(role);
  const [drawer, setDrawer] = useState<CashDrawerRow | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<CashierInvoiceRow[]>([]);
  const [transactions, setTransactions] = useState<CashTransactionRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();

  useEffect(() => {
    if (hasBridge('setPageContext')) {
      syncApi.setPageContext({ page: 'cash_settlement', active: true });
    }
    return () => {
      if (hasBridge('setPageContext')) {
        syncApi.setPageContext({ page: 'cash_settlement', active: false });
      }
    };
  }, []);

  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [upiSources, setUpiSources] = useState<CashierUpiSourceRow[]>([]);
  const [selectedUpiSourceId, setSelectedUpiSourceId] = useState<string>('');

  const [rowDiscs, setRowDiscs] = useState<Record<string, number>>({});
  const [rowDiscPercents, setRowDiscPercents] = useState<Record<string, number>>({});
  const [rowPluses, setRowPluses] = useState<Record<string, number>>({});
  const [rowPlusPercents, setRowPlusPercents] = useState<Record<string, number>>({});
  const [rowNetInputs, setRowNetInputs] = useState<Record<string, string>>({});
  const [rowPlusInputs, setRowPlusInputs] = useState<Record<string, string>>({});
  const [rowPlusPercentInputs, setRowPlusPercentInputs] = useState<Record<string, string>>({});
  const [rowDiscInputs, setRowDiscInputs] = useState<Record<string, string>>({});
  const [rowDiscPercentInputs, setRowDiscPercentInputs] = useState<Record<string, string>>({});
  const [rowMethods, setRowMethods] = useState<Record<string, PaymentMethod>>({});
  const [payingRow, setPayingRow] = useState<string | null>(null);

  const [showOpeningBal, setShowOpeningBal] = useState(false);
  const [openingBalInput, setOpeningBalInput] = useState<number>(0);

  const [parties, setParties] = useState<CashPartyRow[]>([]);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [txnType, setTxnType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_OUT');
  const [txnAmt, setTxnAmt] = useState<number>(0);
  const [txnCat, setTxnCat] = useState('');
  const [txnNote, setTxnNote] = useState('');
  const [txnSubmitting, setTxnSubmitting] = useState(false);
  const [txnPartyId, setTxnPartyId] = useState('');
  const [txnPartyName, setTxnPartyName] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const [customCategories, setCustomCategories] = useState<CashCategoryRow[]>([]);
  const [showAddCatForm, setShowAddCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [txnError, setTxnError] = useState('');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  // Split payment modal states
  const [splitModalInvoice, setSplitModalInvoice] = useState<CashierInvoiceRow | null>(null);
  const [splitModalNet, setSplitModalNet] = useState<number>(0);
  const [splitCash, setSplitCash] = useState<number | ''>('');
  const [splitCard, setSplitCard] = useState<number | ''>('');
  const [splitUpi, setSplitUpi] = useState<number | ''>('');
  const [splitBank, setSplitBank] = useState<number | ''>('');
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  const getRawNet = (inv: any): number => {
    const scrapD = Number(inv.scrap_deduction) || 0;
    const returnD = Number(inv.return_deduction) || 0;
    const totalDeductions = scrapD + returnD;
    const sub = Number(inv.subtotal) || 0;
    const tax = Number(inv.tax_total) || 0;
    const disc = Number(inv.discount_total) || 0;
    const ptsDisc = Number(inv.points_redeemed_discount) || 0;
    const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
    const refundAmount = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;
    if (refundAmount > 0) return -Math.round(refundAmount * 100) / 100;
    return Math.round(Number(inv.grand_total) * 100) / 100;
  };

  const { openSplitModal, handleDiscPercentChange, handleDiscFlatChange, handlePlusPercentChange, handlePlusFlatChange, handleNetChange } = useSettlementAmountEdit({
    getRawNet, pendingInvoices, rowDiscs, rowPluses, setRowDiscInputs, setRowDiscPercentInputs,
    setRowDiscPercents, setRowDiscs, setRowNetInputs, setRowPluses, setRowPlusInputs, setRowPlusPercentInputs,
    setRowPlusPercents, setSplitBank, setSplitCard, setSplitCash, setSplitModalInvoice, setSplitModalNet,
    setSplitUpi,
  });

  // Invoice details preview modal states
  const [selectedInvoice, setSelectedInvoice] = useState<CashierInvoiceRow | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<CashierInvoiceItemRow[]>([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [reprintSuccess, setReprintSuccess] = useState(false);

  const { handleViewInvoice } = useCashierInvoiceView({
    setInvoiceItems, setLoadingItems, setSelectedInvoice, setShowInvoiceModal,
  });

  const [showDayClose, setShowDayClose] = useState(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [closeRemarks, setCloseRemarks] = useState('');
  const closeRemarksRef = useRef<HTMLTextAreaElement>(null);
  const [closeResult, setCloseResult] = useState<DayCloseResult | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  const [showHist, setShowHist] = useState(false);
  const [history, setHistory] = useState<CashDrawerRow[]>([]);
  const [histSearch, setHistSearch] = useState('');
  const [histDateRange, setHistDateRange] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [daySettlements, setDaySettlements] = useState<DaySettlementRow[]>([]);
  const [dayCashTransactions, setDayCashTransactions] = useState<CashTransactionRow[]>([]);
  const [expandedSubTab, setExpandedSubTab] = useState<'bills' | 'cash'>('bills');
  const [loadingSettlements, setLoadingSettlements] = useState(false);

  const [yesterdayNotClosed, setYesterdayNotClosed] = useState(false);
  const [yesterdayDrawer, setYesterdayDrawer] = useState<CashDrawerRow | null>(null);
  const [closingDate, setClosingDate] = useState<string | null>(null);
  const [openingBalError, setOpeningBalError] = useState('');

  // Sudden New Bill Notification & Sound Chime
  const initialLoadedRef = useRef(false);
  const knownInvoiceIdsRef = useRef<Set<string>>(new Set());
  const [latestNewBill, setLatestNewBill] = useState<CashierInvoiceRow | null>(null);
  const [newArrivalIds, setNewArrivalIds] = useState<Set<string>>(new Set());

  const playNewBillSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, []);

  const processInvoicesUpdate = useCallback((invs: any[]) => {
    if (!Array.isArray(invs)) return;
    if (!initialLoadedRef.current) {
      knownInvoiceIdsRef.current = new Set(invs.map((i: any) => i.invoice_id));
      initialLoadedRef.current = true;
    } else {
      const brandNew = invs.filter((i: any) => !knownInvoiceIdsRef.current.has(i.invoice_id));
      if (brandNew.length > 0) {
        brandNew.forEach((i: any) => knownInvoiceIdsRef.current.add(i.invoice_id));
        const newest = brandNew[0];
        setLatestNewBill(newest);
        playNewBillSound();
        setNewArrivalIds((prev) => {
          const next = new Set(prev);
          brandNew.forEach((i: any) => next.add(i.invoice_id));
          return next;
        });
        setTimeout(() => {
          setLatestNewBill((curr: any) => (curr?.invoice_id === newest.invoice_id ? null : curr));
          setNewArrivalIds((prev) => {
            const next = new Set(prev);
            brandNew.forEach((i: any) => next.delete(i.invoice_id));
            return next;
          });
        }, 3000);
      }
    }
    setPendingInvoices(invs);
  }, [playNewBillSound]);

  const load = useCallback(async () => {
    if (!isDesktopRuntime() || !tenantId) return;
    const [d, invs, txs] = await Promise.all([
      cashierApi.getDrawer({ tenant_id: tenantId }),
      cashierApi.getPendingInvoices({ tenant_id: tenantId, search: searchQuery || undefined }),
      cashierApi.getTransactions({ tenant_id: tenantId }),
    ]);
    if (d && !d.error) {
      setDrawer(d);
    } else {
      setDrawer(null);
    }
    if (Array.isArray(invs)) processInvoicesUpdate(invs);
    if (Array.isArray(txs)) setTransactions(txs);
    setLastSyncTime(Date.now());
  }, [tenantId, searchQuery, processInvoicesUpdate]);

  // Delete / Reopen Confirmation Dialog States
  const [deleteConfirmTx, setDeleteConfirmTx] = useState<CashTransactionRow | null>(null);
  const [isDeletingTx, setIsDeletingTx] = useState(false);
  const [reopenConfirmDrawer, setReopenConfirmDrawer] = useState<CashDrawerRow | null>(null);
  const [isReopeningDrawer, setIsReopeningDrawer] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string; variant?: DialogVariant } | null>(null);

  const initiateReopenDrawer = (targetDrawer: any) => {
    if (!isOwner) {
      setAlertDialog({
        title: 'Access Denied',
        message: 'Only Store Owner can reopen a closed register.',
        variant: 'warning'
      });
      return;
    }
    setReopenConfirmDrawer(typeof targetDrawer === 'string' ? { drawer_id: targetDrawer } : targetDrawer);
  };

  const initiateDeleteTransaction = (tx: any) => {
    if (!isOwner) {
      setAlertDialog({
        title: 'Access Denied',
        message: 'Only Store Owner can delete register transactions.',
        variant: 'warning'
      });
      return;
    }
    setDeleteConfirmTx(tx);
  };

  useEffect(() => {
    loadFlags(tenantId || 'global');
    getUpiPageConfig(tenantId || 'global').then(setUpiPageConfig);
    if (hasBridge('dbPaymentGetSources')) {
      paymentSourcesApi.getSources(tenantId || 'global').then((sources: any[]) => {
        if (Array.isArray(sources)) {
          setUpiSources(sources.filter((s: any) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
        }
      }).catch(() => {});
    }
    if (hasBridge('runInitialSync')) {
      syncApi.runInitialSync().catch(() => {});
    }
    Promise.all([load()]).finally(() => setLoading(false));
  }, [load, tenantId, loadFlags]);

  // Auto-refresh: keep the settlement page in sync with the billing counter.
  // Newly printed bills (PENDING) appear here instantly without manual reload.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const refresh = () => { loadRef.current(); };
    const unsubscribeSync = bridgeEvents.onSyncDataUpdated(refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('checkout:completed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      if (typeof unsubscribeSync === 'function') (unsubscribeSync as any)();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('checkout:completed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // When drawer is null (no auto-open), check if any previous shift was not closed
  useEffect(() => {
    if (!drawer && tenantId && !loading) {
      cashierApi.getHistory({ tenant_id: tenantId, limit: 10 }).then(history => {
        const today = new Date().toLocaleDateString('en-CA');
        const entry = Array.isArray(history) ? history.find(h => h.status === 'OPEN' && h.business_date < today) : null;
        if (entry) {
          setYesterdayNotClosed(true);
          setYesterdayDrawer(entry);
        } else {
          setYesterdayNotClosed(false);
          setYesterdayDrawer(null);
        }
      });
    } else {
      setYesterdayNotClosed(false);
      setYesterdayDrawer(null);
    }
  }, [drawer, tenantId, loading]);

  const handleOpenOpeningBalModal = async (currentBal?: number) => {
    let def = currentBal || 0;
    if (!def && hasBridge('settingsGet')) {
      const val = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'default_opening_balance' });
      if (val !== null && val !== undefined && val !== '') {
        def = Number(val) || 0;
      }
    }
    setOpeningBalInput(def);
    setOpeningBalError('');
    setShowOpeningBal(true);
  };

  const handleSetOpening = async () => {
    if (!tenantId || !userId) return;
    setOpeningBalError('');
    const r = await cashierApi.setOpeningBalance({
      tenant_id: tenantId, opening_balance: openingBalInput,
      user_id: userId, user_name: userName || undefined,
    });
    if (r.success) { setShowOpeningBal(false); await load(); }
    else if (r.error === 'PREVIOUS_DRAWER_OPEN') {
      const date = r.business_date ? String(r.business_date) : '';
      setOpeningBalError(r.message || (date
        ? `The cash drawer of ${date} is still open. Close it before opening today's drawer.`
        : 'The previous cash drawer is still open. Close it before opening today\'s drawer.'));
    } else if (r.error) { setOpeningBalError(r.error); }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const openHistory = async () => {
    if (!tenantId) return;
    const r = await cashierApi.getHistory({ tenant_id: tenantId, limit: 50 });
    if (Array.isArray(r)) { setHistory(r); }
    setShowHist(true);
  };

  const loadDaySettlements = async (businessDate: string) => {
    if (!tenantId) return;
    if (expandedDay === businessDate) {
      setExpandedDay(null);
      return;
    }
    setLoadingSettlements(true);
    setExpandedDay(businessDate);
    try {
      const cleanDate = businessDate ? businessDate.split('T')[0] : businessDate;
      const [invs, txs] = await Promise.all([
        cashierApi.getDaySettlements({ tenant_id: tenantId, business_date: cleanDate }),
        hasBridge('dbCashierGetDayTransactions')
          ? cashierApi.getDayTransactions({ tenant_id: tenantId, business_date: cleanDate })
          : Promise.resolve([]),
      ]);
      if (Array.isArray(invs)) setDaySettlements(invs);
      else setDaySettlements([]);
      if (Array.isArray(txs)) setDayCashTransactions(txs);
      else setDayCashTransactions([]);
    } catch (err) {
      console.error('Failed to load day settlements/transactions:', err);
      setDaySettlements([]);
      setDayCashTransactions([]);
    } finally {
      setLoadingSettlements(false);
    }
  };

  const { confirmReopenDrawer, confirmDeleteTransaction, handleAddTransaction, handleDayClose } = useCashDrawerActions({
    actualCash, closeRemarks, closingDate, deleteConfirmTx, drawer, expandedDay, isOwner, load,
    loadDaySettlements, reopenConfirmDrawer, setAlertDialog, setCloseResult, setCloseSubmitting,
    setDeleteConfirmTx, setHistory, setIsDeletingTx, setIsReopeningDrawer, setNewCatName, setPartySearch,
    setReopenConfirmDrawer, setShowAddCatForm, setShowTxnModal, setTxnAmt, setTxnCat, setTxnError, setTxnNote,
    setTxnPartyId, setTxnPartyName, setTxnSubmitting, tenantId, txnAmt, txnCat, txnNote, txnPartyId,
    txnPartyName, txnType, userId, userName,
  });

  const drawerOpen   = drawer?.status === 'OPEN';
  const drawerClosed = drawer?.status === 'CLOSED';
  const drawerBusinessDate = drawer?.business_date ? String(drawer.business_date).slice(0, 10) : '';
  const isPreviousDrawerOpen = drawerOpen && drawerBusinessDate !== '' && drawerBusinessDate < todayStr();

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <CashierLoadingSkeleton />
    );
  }

  // ── Derived summary values ────────────────────────────────────────────────
  const totalIn  = drawerClosed ? 0 : (drawer?.cash_in != null ? Number(drawer.cash_in) : transactions.filter((t: any) => t.type === 'CASH_IN' ).reduce((s: number, t: any) => s + Number(t.amount), 0));
  const totalOut = drawerClosed ? 0 : (drawer?.cash_out != null ? Number(drawer.cash_out) : transactions.filter((t: any) => t.type === 'CASH_OUT').reduce((s: number, t: any) => s + Number(t.amount), 0));

  // ── Feature-based sections ────────────────────────────────────────────────
  const showSettlement = !featureFlags || featureFlags.cash_settlement;
  const showRegister = !featureFlags || (featureFlags.cash_settlement && featureFlags.cash_register);
  const pageTitle = cashierPageTitle(featureFlags);

  // ── Date grouping (mirrors InventoryManager pattern) ─────────────────────
  const formatSettlementDate = (dateStr?: string): string => {
    if (!dateStr) return 'Unknown Date';
    const d = parseUTCDate(dateStr);
    if (isNaN(d.getTime())) return 'Unknown Date';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dayName = d.toLocaleDateString('en-IN', { timeZone: getStoreTimezone(), weekday: 'long' });
    return `${dd}/${mm}/${yyyy} ${dayName}`;
  };

  const groupedInvoicesByDate = pendingInvoices.reduce<Record<string, typeof pendingInvoices>>((acc, inv) => {
    const dateKey = formatSettlementDate(inv.created_at);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(inv);
    return acc;
  }, {});
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      {!showHist && (
      <CashierHeader
        closeResult={closeResult} drawer={drawer} drawerClosed={drawerClosed} drawerOpen={drawerOpen}
        handleOpenOpeningBalModal={handleOpenOpeningBalModal} isRestricted={isRestricted} lastSyncTime={lastSyncTime}
        load={load} onClose={onClose} openHistory={openHistory} pageTitle={pageTitle} setActualCash={setActualCash}
        setCloseResult={setCloseResult} setShowDayClose={setShowDayClose} showSettlement={showSettlement}
        yesterdayNotClosed={yesterdayNotClosed}
      />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          WARNING / INFO BANNERS
      ══════════════════════════════════════════════════════════════════════ */}
      {yesterdayNotClosed && !showHist && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/25 px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
              Previous cash drawer from {yesterdayDrawer?.business_date} was not closed
            </p>
            <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 font-medium mt-0.5">
              Expected closing: {formatCurrency(yesterdayDrawer?.expected_closing || 0)}
              &nbsp;&middot; Close previous shift first to unlock opening balance for today.
            </p>
          </div>
          <button
            onClick={() => {
              setClosingDate(yesterdayDrawer?.business_date);
              setActualCash(yesterdayDrawer?.expected_closing || 0);
              setCloseResult(null);
              setShowDayClose(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Close Previous Shift ({yesterdayDrawer?.business_date})
          </button>
          <button
            onClick={() => {
              handleOpenOpeningBalModal(); return;
              setOpeningBalError('');
              setShowOpeningBal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          >
            <DollarSign className="w-3.5 h-3.5" /> Set Today's Opening Balance
          </button>
        </div>
      )}

      {isPreviousDrawerOpen && !showHist && (
        <PreviousDrawerOpenBanner businessDate={drawerBusinessDate} />
      )}

      {!drawer && !yesterdayNotClosed && !showHist && (
        <div className="shrink-0 bg-blue-500/10 border-b border-blue-500/25 px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20 shrink-0">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-blue-700 dark:text-blue-300">
                Today's Cash Register is Not Started ({formatBusinessDate(todayStr())})
              </p>
              <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-medium mt-0.5">
                Set an opening balance to open today's drawer session and manage cash entries.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handleOpenOpeningBalModal(); return;
              setOpeningBalError('');
              setShowOpeningBal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-500 shadow-sm transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Set Opening Balance
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════════════ */}
      {showHist ? (
        <SettlementHistoryView
          dayCashTransactions={dayCashTransactions} daySettlements={daySettlements} expandedDay={expandedDay}
          expandedSubTab={expandedSubTab} handleViewInvoice={handleViewInvoice} histDateRange={histDateRange}
          history={history} histSearch={histSearch} initiateDeleteTransaction={initiateDeleteTransaction}
          initiateReopenDrawer={initiateReopenDrawer} isOwner={isOwner} loadDaySettlements={loadDaySettlements}
          loadingSettlements={loadingSettlements} setExpandedDay={setExpandedDay} setExpandedSubTab={setExpandedSubTab}
          setHistDateRange={setHistDateRange} setHistSearch={setHistSearch} setShowHist={setShowHist}
        />
      ) : (
        /* ─── NORMAL TWO-COLUMN SPLIT ───────────────────────────── */
        <div className="flex-1 flex min-h-0">

        {/* ═══ LEFT: Pending Invoices ═══════════════════════════════════════ */}
        {showSettlement && (
        <PendingSettlementPanel
          drawer={drawer} drawerClosed={drawerClosed} getRawNet={getRawNet}
          groupedInvoicesByDate={groupedInvoicesByDate} handleDiscFlatChange={handleDiscFlatChange}
          handleDiscPercentChange={handleDiscPercentChange} handleNetChange={handleNetChange}
          handlePlusFlatChange={handlePlusFlatChange} handlePlusPercentChange={handlePlusPercentChange}
          handleViewInvoice={handleViewInvoice} load={load} newArrivalIds={newArrivalIds}
          openSplitModal={openSplitModal} payingRow={payingRow} pendingInvoices={pendingInvoices}
          rowDiscInputs={rowDiscInputs} rowDiscPercentInputs={rowDiscPercentInputs} rowDiscPercents={rowDiscPercents}
          rowDiscs={rowDiscs} rowMethods={rowMethods} rowNetInputs={rowNetInputs} rowPluses={rowPluses}
          rowPlusInputs={rowPlusInputs} rowPlusPercentInputs={rowPlusPercentInputs} rowPlusPercents={rowPlusPercents}
          searchQuery={searchQuery} setPayingRow={setPayingRow} setRowDiscInputs={setRowDiscInputs}
          setRowDiscPercentInputs={setRowDiscPercentInputs} setRowMethods={setRowMethods}
          setRowNetInputs={setRowNetInputs} setRowPlusInputs={setRowPlusInputs}
          setRowPlusPercentInputs={setRowPlusPercentInputs} setSearchQuery={setSearchQuery} tenantId={tenantId}
          userId={userId} userName={userName}
        />
        )}

        {/* ═══ RIGHT: Cash Register ═════════════════════════════════════════ */}
        {showRegister && (
        <CashRegisterPanel
          drawer={drawer} expandedTxId={expandedTxId} initiateDeleteTransaction={initiateDeleteTransaction}
          initiateReopenDrawer={initiateReopenDrawer} isOwner={isOwner} parties={parties}
          setCustomCategories={setCustomCategories} setExpandedTxId={setExpandedTxId} setNewCatName={setNewCatName}
          setParties={setParties} setPartySearch={setPartySearch} setShowAddCatForm={setShowAddCatForm}
          setShowTxnModal={setShowTxnModal} setTxnAmt={setTxnAmt} setTxnCat={setTxnCat} setTxnNote={setTxnNote}
          setTxnPartyId={setTxnPartyId} setTxnPartyName={setTxnPartyName} showSettlement={showSettlement}
          tenantId={tenantId} totalIn={totalIn} totalOut={totalOut} transactions={transactions}
        />
        )}
        {/* end right panel */}
        </div>
      )}
      {/* end main content */}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Day Closing
      ══════════════════════════════════════════════════════════════════════ */}
      {showDayClose && (
        <DayCloseDialog
          actualCash={actualCash} closeRemarks={closeRemarks} closeRemarksRef={closeRemarksRef}
          closeResult={closeResult} closeSubmitting={closeSubmitting} closingDate={closingDate} drawer={drawer}
          handleDayClose={handleDayClose} setActualCash={setActualCash} setCloseRemarks={setCloseRemarks}
          setCloseResult={setCloseResult} setClosingDate={setClosingDate} setShowDayClose={setShowDayClose}
          setYesterdayDrawer={setYesterdayDrawer} setYesterdayNotClosed={setYesterdayNotClosed}
          yesterdayDrawer={yesterdayDrawer}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Opening Balance
      ══════════════════════════════════════════════════════════════════════ */}
      {showOpeningBal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setShowOpeningBal(false); setOpeningBalError(''); }}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl w-80 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-6 py-4 border-b border-border"
              style={{ background: 'linear-gradient(135deg, hsl(217,91%,60%,0.08) 0%, transparent 100%)' }}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10">
                  <DollarSign className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-base font-extrabold text-foreground">Opening Balance</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground font-medium">Enter the cash amount at the start of today's shift.</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                <input
                  type="number"
                  value={openingBalInput || ''}
                  onChange={(e) => setOpeningBalInput(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all"
                  step="0.01" min="0" placeholder="Enter opening balance" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSetOpening(); } }}
                />
              </div>
              {openingBalError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{openingBalError}</p>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handleSetOpening}
                  className="px-6 py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Add Transaction
      ══════════════════════════════════════════════════════════════════════ */}
      {showTxnModal && (
        <CashTransactionModal
          addingCat={addingCat} customCategories={customCategories} handleAddTransaction={handleAddTransaction}
          handleFormKeyDown={handleFormKeyDown} newCatName={newCatName} parties={parties} partySearch={partySearch}
          setAddingCat={setAddingCat} setCustomCategories={setCustomCategories} setNewCatName={setNewCatName}
          setPartySearch={setPartySearch} setShowAddCatForm={setShowAddCatForm} setShowTxnModal={setShowTxnModal}
          setTxnAmt={setTxnAmt} setTxnCat={setTxnCat} setTxnError={setTxnError} setTxnNote={setTxnNote}
          setTxnPartyId={setTxnPartyId} setTxnPartyName={setTxnPartyName} setTxnType={setTxnType}
          showAddCatForm={showAddCatForm} tenantId={tenantId} txnAmt={txnAmt} txnCat={txnCat} txnError={txnError}
          txnNote={txnNote} txnPartyId={txnPartyId} txnPartyName={txnPartyName} txnSubmitting={txnSubmitting}
          txnType={txnType}
        />
      )}

      {/* ─── Centered Invoice Detail Modal ─── */}
      <CashierInvoiceModal
        invoiceItems={invoiceItems} loadingItems={loadingItems} selectedInvoice={selectedInvoice}
        setInvoiceItems={setInvoiceItems} setReprintSuccess={setReprintSuccess} setSelectedInvoice={setSelectedInvoice}
        setShowInvoiceModal={setShowInvoiceModal} showInvoiceModal={showInvoiceModal}
      />

      {/* ═══ Split Payment Modal ═══ */}
      <SplitSettlementDialog
        getRawNet={getRawNet} load={load} rowDiscs={rowDiscs} selectedUpiSourceId={selectedUpiSourceId}
        setSelectedUpiSourceId={setSelectedUpiSourceId} setSplitBank={setSplitBank} setSplitCard={setSplitCard}
        setSplitCash={setSplitCash} setSplitModalInvoice={setSplitModalInvoice} setSplitSubmitting={setSplitSubmitting}
        setSplitUpi={setSplitUpi} splitBank={splitBank} splitCard={splitCard} splitCash={splitCash}
        splitModalInvoice={splitModalInvoice} splitModalNet={splitModalNet} splitSubmitting={splitSubmitting}
        splitUpi={splitUpi} tenantId={tenantId} upiPageConfig={upiPageConfig} upiSources={upiSources} userId={userId}
        userName={userName}
      />

      {/* ═══ Sudden New Bill Notification Toast Banner ═══ */}
      {latestNewBill && (
        <div className="fixed top-16 right-6 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="p-4 rounded-2xl bg-card border-2 border-emerald-500/80 shadow-2xl flex items-center gap-3.5 max-w-sm">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-500 shrink-0 animate-bounce">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-emerald-500 text-emerald-500" /> New Bill Received!
                </span>
                <button
                  onClick={() => setLatestNewBill(null)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm font-extrabold text-foreground truncate mt-0.5">
                {latestNewBill.invoice_number}
              </p>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-muted-foreground font-semibold truncate">
                  {latestNewBill.customer_name || 'Walk-in Customer'}
                </span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(Number(latestNewBill.grand_total))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Delete Transaction Confirmation Modal ── */}
      <DeleteTransactionDialog
        confirmDeleteTransaction={confirmDeleteTransaction} deleteConfirmTx={deleteConfirmTx}
        isDeletingTx={isDeletingTx} setDeleteConfirmTx={setDeleteConfirmTx}
      />

      {/* ── Custom Reopen Register Confirmation Modal ── */}
      <ReopenDrawerDialog
        confirmReopenDrawer={confirmReopenDrawer} isReopeningDrawer={isReopeningDrawer}
        reopenConfirmDrawer={reopenConfirmDrawer} setReopenConfirmDrawer={setReopenConfirmDrawer}
      />

      <CustomDialog
        isOpen={!!alertDialog}
        onClose={() => setAlertDialog(null)}
        title={alertDialog?.title || 'Notice'}
        description={alertDialog?.message}
        hideCancel
        confirmText="OK"
        onConfirm={() => setAlertDialog(null)}
        variant={alertDialog?.variant || 'warning'}
      />

      <FloatToast message={reprintSuccess ? 'Invoice reprinted successfully!' : null} onClose={() => setReprintSuccess(false)} />
    </div>
  );
}

