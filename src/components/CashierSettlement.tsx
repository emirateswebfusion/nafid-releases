import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Banknote, Wallet, Smartphone, CreditCard, SplitSquareHorizontal,
  CheckCircle2, Plus, Minus, History, X, Receipt, DollarSign,
  TrendingUp, TrendingDown, Clock, AlertTriangle,
  ChevronRight, ChevronDown, Printer, Package, Building, User, FileText,
  CheckCheck, Calendar, BookOpen, RefreshCw, Bell, Zap
} from 'lucide-react';
import { Select } from './ui/Select';
import { Modal } from './ui/Modal';
import { Skeleton } from './ui/Skeleton';
import { useAuthStore } from '../store/authStore';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import clsx from 'clsx';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData, getAppTimeFormat, parseUTCDate } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { loadFeatureFlags, cashierPageTitle } from '../featureFlags';

type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'SPLIT';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'CASH',          label: 'Cash',  icon: Banknote             },
  { value: 'CARD',          label: 'Card',  icon: CreditCard           },
  { value: 'UPI',           label: 'UPI',   icon: Smartphone           },
  { value: 'BANK_TRANSFER', label: 'Bank',  icon: Wallet               },
  { value: 'SPLIT',         label: 'Split', icon: SplitSquareHorizontal},
];

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '\u20B90.00';
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `-\u20B9${formatted}` : `\u20B9${formatted}`;
}

function formatTime(d: string): string {
  if (!d) return '';
  return parseUTCDate(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CREDIT: 'Credit',
};

const PAYMENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PENDING:{ bg: 'bg-gray-500/10',   text: 'text-gray-500',    dot: '#6b7280' },
  CASH:   { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: '#10b981' },
  CARD:   { bg: 'bg-blue-500/10',   text: 'text-blue-500',    dot: '#3b82f6' },
  UPI:    { bg: 'bg-violet-500/10', text: 'text-violet-500',  dot: '#8b5cf6' },
  CREDIT: { bg: 'bg-amber-500/10',  text: 'text-amber-500',   dot: '#f59e0b' },
};

function PaymentBadge({ method }: { method: string }) {
  const c = PAYMENT_COLORS[method] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: '#888' };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider', c.bg, c.text)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {PAYMENT_LABELS[method] || method}
    </span>
  );
}

function getInvoiceTypeInfo(inv: any): { label: string; icon: any; bg: string; text: string; border: string } {
  if (inv.invoice_type === 'GST' && inv.customer_gstin) {
    return { label: 'B2B', icon: Building, bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' };
  }
  if (inv.invoice_type === 'GST') {
    return { label: 'B2C', icon: User, bg: 'bg-violet-500/10', text: 'text-violet-500', border: 'border-violet-500/20' };
  }
  return { label: 'Bill of Supply', icon: FileText, bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' };
}

function InvoiceTypeBadge({ inv }: { inv: any }) {
  const info = getInvoiceTypeInfo(inv);
  const Icon = info.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border', info.bg, info.text, info.border)}>
      <Icon className="w-3 h-3" />
      {info.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  const d = parseUTCDate(dateStr);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' }),
  };
}

interface CashierSettlementProps {
  onClose: () => void;
  isRestricted?: boolean;
}

export function CashierSettlement({ onClose, isRestricted }: CashierSettlementProps) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName } = useAuthStore();
  const [drawer, setDrawer] = useState<any>(null);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean> | null>(null);

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

  const [parties, setParties] = useState<any[]>([]);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [txnType, setTxnType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_OUT');
  const [txnAmt, setTxnAmt] = useState<number>(0);
  const [txnCat, setTxnCat] = useState('');
  const [txnNote, setTxnNote] = useState('');
  const [txnSubmitting, setTxnSubmitting] = useState(false);
  const [txnPartyId, setTxnPartyId] = useState('');
  const [txnPartyName, setTxnPartyName] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const [customCategories, setCustomCategories] = useState<any[]>([]);
  const [showAddCatForm, setShowAddCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Split payment modal states
  const [splitModalInvoice, setSplitModalInvoice] = useState<any | null>(null);
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

  const openSplitModal = (inv: any) => {
    const rd = rowDiscs[inv.invoice_id] ?? 0;
    const plusVal = rowPluses[inv.invoice_id] ?? 0;
    const rawNet = getRawNet(inv);
    const net = rawNet < 0 ? rawNet + plusVal : Math.max(0, rawNet - rd);

    setSplitModalInvoice(inv);
    setSplitModalNet(net);
    setSplitCash(net);
    setSplitCard('');
    setSplitUpi('');
    setSplitBank('');
  };

  // Invoice details preview modal states
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [reprintSuccess, setReprintSuccess] = useState(false);

  const handleViewInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    setShowInvoiceModal(true);
    setLoadingItems(true);
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
        setInvoiceItems(await enrichItemsWithMrp(Array.isArray(data) ? data : []));
      }
    } catch (err) {
      console.error('Failed to load invoice items', err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Recover MRP / offer info for past invoices (invoice_items only stores the sold rate).
  // Mirrors the recovery logic used when editing a bill in BillingPage.
  const enrichItemsWithMrp = async (invoiceItems: any[]): Promise<any[]> => {
    const nonService = invoiceItems.filter((i: any) => !i.is_service_item);
    const productIds = [...new Set(nonService.map((i: any) => i.product_id).filter(Boolean))] as string[];
    const productMap: Record<string, any> = {};
    if (productIds.length > 0) {
      try {
        const { tenantId } = useAuthStore.getState();
        const products = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
        if (Array.isArray(products)) {
          products.forEach((p: any) => { productMap[p.product_id] = p; });
        }
      } catch {
        // ignore product lookup failures
      }
    }
    return invoiceItems.map(item => {
      const p = item.is_service_item ? null : productMap[item.product_id];
      if (!p) return item;
      const mrp = p.pricing_mode === 'GRADE_RATE' && Number(p.grade_rate) > 0 ? Number(p.grade_rate) : (Number(p.base_price) || 0);
      const soldPrice = Number(item.unit_price) || 0;
      let originalRate: number | undefined;
      let discountLabel: string | undefined;
      if (mrp > 0 && soldPrice < mrp) {
        const offerPrice = p.offer_price ? Number(p.offer_price) : null;
        if (offerPrice !== null && Math.abs(offerPrice - soldPrice) < 0.01) {
          originalRate = mrp;
          discountLabel = 'Offer';
        } else {
          const diff = mrp - soldPrice;
          if (diff >= 0.05) {
            originalRate = mrp;
            discountLabel = `-₹${diff.toFixed(0)}`;
          }
        }
      }
      return { ...item, originalRate, discountLabel, brand_manufacturer: p?.brand_manufacturer || item.brand_manufacturer || undefined };
    });
  };

  const handleDiscPercentChange = (invoiceId: string, val: string) => {
    setRowDiscPercentInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowDiscInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowDiscPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowDiscs((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const percent = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.max(0, rawNet);
    const flat = base && !isNaN(percent) ? Math.round(((base * percent) / 100) * 100) / 100 : 0;
    setRowDiscPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowDiscs((p) => ({ ...p, [invoiceId]: flat }));
  };

  const handleDiscFlatChange = (invoiceId: string, val: string) => {
    setRowDiscInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowDiscPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowDiscPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowDiscs((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const flat = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.max(0, rawNet);
    const percent = base && !isNaN(flat) ? Math.round(((flat / base) * 100) * 100) / 100 : 0;
    setRowDiscPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowDiscs((p) => ({ ...p, [invoiceId]: Math.max(0, flat) }));
  };

  const handlePlusPercentChange = (invoiceId: string, val: string) => {
    setRowPlusPercentInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowPlusInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowPlusPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPluses((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const percent = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.abs(rawNet);
    const flat = base && !isNaN(percent) ? Math.round(((base * percent) / 100) * 100) / 100 : 0;
    setRowPlusPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowPluses((p) => ({ ...p, [invoiceId]: flat }));
  };

  const handlePlusFlatChange = (invoiceId: string, val: string) => {
    setRowPlusInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowPlusPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowPlusPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPluses((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const flat = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.abs(rawNet);
    const percent = base && !isNaN(flat) ? Math.round(((flat / base) * 100) * 100) / 100 : 0;
    setRowPlusPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowPluses((p) => ({ ...p, [invoiceId]: isNaN(flat) ? 0 : flat }));
  };

  const handleNetChange = (invoiceId: string, val: string) => {
    setRowNetInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowPlusInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowPlusPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowDiscInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowDiscPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '' || val === '-') {
      setRowDiscPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowDiscs((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPlusPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPluses((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const netVal = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    if (!inv) return;

    const rawNet = getRawNet(inv);
    if (rawNet < 0) {
      if (!isNaN(netVal)) {
        const targetNet = netVal > 0 ? -netVal : netVal;
        const plusVal = Math.round((targetNet - rawNet) * 100) / 100;
        const base = Math.abs(rawNet);
        const percent = base ? Math.round(((plusVal / base) * 100) * 100) / 100 : 0;
        setRowPlusPercents((p) => ({ ...p, [invoiceId]: percent }));
        setRowPluses((p) => ({ ...p, [invoiceId]: plusVal }));
      }
    } else {
      if (rawNet && !isNaN(netVal)) {
        const flat = Math.max(0, Math.round((rawNet - netVal) * 100) / 100);
        const percent = Math.round(((flat / rawNet) * 100) * 100) / 100;
        setRowDiscPercents((p) => ({ ...p, [invoiceId]: percent }));
        setRowDiscs((p) => ({ ...p, [invoiceId]: flat }));
      }
    }
  };

  const [showDayClose, setShowDayClose] = useState(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [closeRemarks, setCloseRemarks] = useState('');
  const closeRemarksRef = useRef<HTMLTextAreaElement>(null);
  const [closeResult, setCloseResult] = useState<any>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  const [showHist, setShowHist] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [histSearch, setHistSearch] = useState('');
  const [histDateRange, setHistDateRange] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [daySettlements, setDaySettlements] = useState<any[]>([]);
  const [dayCashTransactions, setDayCashTransactions] = useState<any[]>([]);
  const [expandedSubTab, setExpandedSubTab] = useState<'bills' | 'cash'>('bills');
  const [loadingSettlements, setLoadingSettlements] = useState(false);

  const [yesterdayNotClosed, setYesterdayNotClosed] = useState(false);
  const [yesterdayDrawer, setYesterdayDrawer] = useState<any>(null);
  const [closingDate, setClosingDate] = useState<string | null>(null);
  const [openingBalError, setOpeningBalError] = useState('');

  // Sudden New Bill Notification & Sound Chime
  const initialLoadedRef = useRef(false);
  const knownInvoiceIdsRef = useRef<Set<string>>(new Set());
  const [latestNewBill, setLatestNewBill] = useState<any | null>(null);
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
    if (!window.electronAPI || !tenantId) return;
    const [d, invs, txs] = await Promise.all([
      window.electronAPI.dbCashierGetDrawer({ tenant_id: tenantId }),
      window.electronAPI.dbCashierGetPendingInvoices({ tenant_id: tenantId, search: searchQuery || undefined }),
      window.electronAPI.dbCashierGetTransactions({ tenant_id: tenantId }),
    ]);
    // Ignore any closed drawer for today — user must set a fresh opening balance
    if (d && !d.error && d.status === 'CLOSED') {
      setDrawer(null);
    } else if (d && !d.error) {
      setDrawer(d);
    } else {
      setDrawer(null);
    }
    if (Array.isArray(invs)) processInvoicesUpdate(invs);
    if (Array.isArray(txs)) setTransactions(txs);
  }, [tenantId, searchQuery, processInvoicesUpdate]);

  useEffect(() => { loadFeatureFlags(tenantId || 'global').then(flags => setFeatureFlags(flags)); Promise.all([load()]).finally(() => setLoading(false)); }, [load]);

  // Auto-refresh: keep the settlement page in sync with the billing counter.
  // Newly printed bills (PENDING) appear here instantly without manual reload.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const refresh = () => { loadRef.current(); };
    const unsubscribeSync = window.electronAPI?.onSyncDataUpdated?.(refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('checkout:completed', refresh);
    window.addEventListener('storage', refresh);
    const interval = setInterval(refresh, 1500);
    return () => {
      if (typeof unsubscribeSync === 'function') (unsubscribeSync as any)();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('checkout:completed', refresh);
      window.removeEventListener('storage', refresh);
      clearInterval(interval);
    };
  }, []);

  // When drawer is null (no auto-open), check if yesterday was not closed
  useEffect(() => {
    if (!drawer && tenantId && !loading) {
      window.electronAPI?.dbCashierGetHistory({ tenant_id: tenantId, limit: 2 }).then(history => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');
        const entry = Array.isArray(history) ? history.find(h => h.business_date === yesterdayStr) : null;
        if (entry && entry.status === 'OPEN') {
          setYesterdayNotClosed(true);
          setYesterdayDrawer(entry);
        }
      });
    } else {
      setYesterdayNotClosed(false);
      setYesterdayDrawer(null);
    }
  }, [drawer, tenantId, loading]);

  const handleSetOpening = async () => {
    if (!tenantId || !userId) return;
    setOpeningBalError('');
    const r = await window.electronAPI!.dbCashierSetOpeningBalance({
      tenant_id: tenantId, opening_balance: openingBalInput,
      user_id: userId, user_name: userName || undefined,
    });
    if (r.success) { setShowOpeningBal(false); await load(); }
    else if (r.error) { setOpeningBalError(r.error); }
  };

  const handleAddTransaction = async () => {
    if (!tenantId || !userId || txnAmt <= 0) return;
    setTxnSubmitting(true);
    const finalNotes = txnPartyName
      ? (txnNote ? `Party: ${txnPartyName} | ${txnNote}` : `Party: ${txnPartyName}`)
      : (txnNote || undefined);

    const r = await window.electronAPI!.dbCashierAddTransaction({
      tenant_id: tenantId, type: txnType, amount: txnAmt,
      category: txnCat || undefined, notes: finalNotes,
      user_id: userId, user_name: userName || undefined,
    });
    if (r.success && txnPartyId) {
      const partyTxnType = txnType === 'CASH_IN' ? 'DEBIT' : 'CREDIT';
      await window.electronAPI!.dbAddPartyLedgerEntry({
        party_id: txnPartyId,
        tenant_id: tenantId,
        transaction_type: partyTxnType,
        amount: txnAmt,
        description: `${txnType === 'CASH_IN' ? 'Cash received' : 'Cash paid'} - ${txnCat || 'Manual'}${txnNote ? ': ' + txnNote : ''}`,
        reference_number: null,
        created_by: userId,
        created_by_name: userName || undefined,
        ledger_id: crypto.randomUUID(),
      });
    }
    setTxnSubmitting(false);
    if (r.success) { setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setShowAddCatForm(false); setNewCatName(''); setShowTxnModal(false); await load(); }
  };

  const handleDayClose = async () => {
    if (!tenantId || !userId || actualCash < 0) return;
    setCloseSubmitting(true);
    const r = await window.electronAPI!.dbCashierDayClosing({
      tenant_id: tenantId, actual_cash: actualCash,
      closing_remarks: closeRemarks || undefined,
      user_id: userId, user_name: userName || undefined,
      business_date: closingDate || undefined,
    });
    setCloseSubmitting(false);
    if (r.success) { setCloseResult(r); await load(); }
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
    const r = await window.electronAPI!.dbCashierGetHistory({ tenant_id: tenantId, limit: 50 });
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
        window.electronAPI!.dbCashierGetDaySettlements({ tenant_id: tenantId, business_date: cleanDate }),
        window.electronAPI!.dbCashierGetDayTransactions
          ? window.electronAPI!.dbCashierGetDayTransactions({ tenant_id: tenantId, business_date: cleanDate })
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

  const drawerOpen   = drawer?.status === 'OPEN';
  const drawerClosed = drawer?.status === 'CLOSED';

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        {/* Top Header Skeleton */}
        <header className="px-5 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-10 w-44 rounded-2xl" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
        </header>

        {/* Dashboard Skeleton Body */}
        <div className="flex-1 p-5 space-y-5 overflow-hidden flex flex-col">
          {/* Summary Cards Grid Skeleton */}
          <div className="grid grid-cols-4 gap-4 shrink-0">
            {[1, 2, 3, 4].map((c) => (
              <div key={c} className="p-4 rounded-2xl border border-border bg-card space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
              </div>
            ))}
          </div>

          {/* Main Content Area Skeleton */}
          <div className="flex-1 grid grid-cols-12 gap-5 min-h-0">
            {/* Left Queue Pane Skeleton (8 cols) */}
            <div className="col-span-8 border border-border rounded-2xl bg-card p-4 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-72 rounded-xl" />
                <Skeleton className="h-9 w-28 rounded-xl" />
              </div>
              <div className="flex-1 space-y-3 overflow-hidden">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="flex items-center justify-between p-3 rounded-xl border border-border/50">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-5 h-5 rounded-md" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-8 w-24 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>

            {/* Right Pane Skeleton (4 cols) */}
            <div className="col-span-4 border border-border rounded-2xl bg-card p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
              <Skeleton className="h-4 w-32" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((tx) => (
                  <div key={tx} className="p-3 rounded-xl border border-border/40 flex justify-between items-center">
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived summary values ────────────────────────────────────────────────
  const totalIn  = transactions.filter((t: any) => t.type === 'CASH_IN' ).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalOut = transactions.filter((t: any) => t.type === 'CASH_OUT').reduce((s: number, t: any) => s + Number(t.amount), 0);

  // ── Feature-based sections ────────────────────────────────────────────────
  const showSettlement = !featureFlags || featureFlags.cash_settlement;
  const showRegister = !featureFlags || featureFlags.cash_register;
  const pageTitle = cashierPageTitle(featureFlags);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      {!showHist && (
      <header className="relative shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(217,91%,60%) 50%, transparent 100%)' }} />
        <div className="flex items-center justify-between px-5 py-3 gap-4">
          {/* Left: title + status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner shrink-0">
              <Banknote className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold text-foreground truncate tracking-tight">{pageTitle}</h1>
                <span className={clsx(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  drawerOpen ? 'bg-emerald-500 animate-pulse' : drawerClosed ? 'bg-muted-foreground' : yesterdayNotClosed ? 'bg-rose-500' : 'bg-amber-500'
                )} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                  drawerOpen   ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                  drawerClosed ? 'bg-muted text-muted-foreground border-border' :
                  yesterdayNotClosed ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' :
                                 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                )}>
                  <span className={clsx('w-1 h-1 rounded-full', drawerOpen ? 'bg-emerald-500 animate-pulse' : drawerClosed ? 'bg-muted-foreground' : yesterdayNotClosed ? 'bg-rose-500' : 'bg-amber-500')} />
                  {drawerOpen ? 'Open' : drawerClosed ? 'Closed' : yesterdayNotClosed ? 'Blocked' : 'Not Started'}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold tabular-nums">
                  {drawer?.business_date || todayStr()}
                </span>
                {drawerClosed && drawer?.actual_cash !== null && drawer?.actual_cash !== undefined && (
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border',
                    drawer.cash_short > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' :
                    drawer.cash_excess > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  )}>
                    Actual: {formatCurrency(drawer.actual_cash)}
                    {drawer.cash_short > 0 && ` Short −${formatCurrency(drawer.cash_short)}`}
                    {drawer.cash_excess > 0 && ` Excess +${formatCurrency(drawer.cash_excess)}`}
                    {drawer.cash_short === 0 && drawer.cash_excess === 0 && ' Matched'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center: current drawer cash */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className={clsx(
              'flex items-center gap-2.5 pl-2.5 pr-4 py-1.5 rounded-2xl border shadow-sm',
              drawerOpen ? 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/[0.03] border-emerald-500/25' : 'bg-muted/50 border-border'
            )}>
              <div className={clsx('p-1.5 rounded-xl', drawerOpen ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 shadow-inner' : 'bg-muted text-muted-foreground')}>
                <Banknote className="w-3.5 h-3.5" />
              </div>
              <div className="leading-tight">
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Drawer Cash</p>
                <p className="text-sm font-black tabular-nums text-foreground">{formatCurrency(drawer?.current_cash ?? 0)}</p>
              </div>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {showSettlement && (
              <>
                <button
                  onClick={() => load()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
                  title="Instant Refresh Pending Queue"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="hidden sm:inline">Syncing</span>
                </button>
                <button
                  onClick={openHistory}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" /> History
                </button>
              </>
            )}
            {!drawerClosed && (
              <button
                onClick={() => { setOpeningBalInput(drawer?.opening_balance || 0); setOpeningBalError(''); setShowOpeningBal(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-primary hover:bg-primary/10 border border-primary/20 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5" /> Opening
              </button>
            )}
            {drawerOpen && !closeResult && (
              <button
                onClick={() => { setActualCash(drawer?.expected_closing || 0); setCloseResult(null); setShowDayClose(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-destructive hover:bg-destructive/10 border border-destructive/25 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Close
              </button>
            )}
            <button
              onClick={isRestricted ? () => useAuthStore.getState().logout() : onClose}
              className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          WARNING: Yesterday not closed
      ══════════════════════════════════════════════════════════════════════ */}
      {yesterdayNotClosed && !showHist && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/25 px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="p-2 rounded-full bg-amber-500/20 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
              Yesterday's cash drawer was not closed
            </p>
            <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 font-medium mt-0.5">
              {yesterdayDrawer?.business_date} &middot; Expected closing: {formatCurrency(yesterdayDrawer?.expected_closing || 0)}
              &nbsp;&middot; Close it first or manually set today's opening balance to continue.
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
            <CheckCircle2 className="w-3.5 h-3.5" /> Close Yesterday
          </button>
          <button
            onClick={() => {
              setOpeningBalInput(0);
              setOpeningBalError('');
              setShowOpeningBal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          >
            <DollarSign className="w-3.5 h-3.5" /> Set Opening Balance
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════════════ */}
      {showHist ? (
        <div className="flex-1 flex flex-col min-h-0 bg-background">
          {/* ── Top Floating Glass Header Bar ── */}
          <div className="relative shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-xl z-20">
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, hsl(217,91%,60%) 0%, hsl(142,72%,50%) 50%, transparent 100%)' }} />
            <div className="flex items-center justify-between px-6 py-3.5 gap-4">
              {/* Left Title & Status */}
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500 shadow-inner border border-blue-500/20">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-foreground tracking-tight">Settlement History & Audit</h2>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {history.length} Shift{history.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    Review drawer closing sessions, settled bills, and cash register transaction logs
                  </p>
                </div>
              </div>

              {/* Right Controls: Search + Date Pill Filters + Close */}
              <div className="flex items-center gap-3">
                {/* Search input */}
                <div className="relative w-56 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={histSearch}
                    onChange={(e) => setHistSearch(e.target.value)}
                    placeholder="Search date or cashier..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-background border border-border rounded-xl outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50 transition-all"
                  />
                  {histSearch && (
                    <button
                      onClick={() => setHistSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Quick Date Range Selector */}
                <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border gap-0.5">
                  {(['all', 'today', '7days', '30days'] as const).map((r) => {
                    const labels: Record<string, string> = { all: 'All', today: 'Today', '7days': '7 Days', '30days': '30 Days' };
                    const active = histDateRange === r;
                    return (
                      <button
                        key={r}
                        onClick={() => setHistDateRange(r)}
                        className={clsx(
                          'px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer',
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-card'
                        )}
                      >
                        {labels[r]}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setShowHist(false)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
                  title="Close History"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Double-Bezel Executive Summary Metric Cards ── */}
          {history.length > 0 && (() => {
            const filteredHist = history.filter((d: any) => {
              const matchesSearch = !histSearch ||
                (d.business_date && d.business_date.toLowerCase().includes(histSearch.toLowerCase())) ||
                (d.opened_by_name && d.opened_by_name.toLowerCase().includes(histSearch.toLowerCase())) ||
                (d.closed_by_name && d.closed_by_name.toLowerCase().includes(histSearch.toLowerCase()));

              if (!matchesSearch) return false;
              if (histDateRange === 'today') return d.business_date && d.business_date.startsWith(todayStr());
              if (histDateRange === '7days') {
                const limit7 = new Date(); limit7.setDate(limit7.getDate() - 7);
                return new Date(d.business_date) >= limit7;
              }
              if (histDateRange === '30days') {
                const limit30 = new Date(); limit30.setDate(limit30.getDate() - 30);
                return new Date(d.business_date) >= limit30;
              }
              return true;
            });

            const totalSales = filteredHist.reduce((s: number, d: any) => s + Number(d.cash_sales || 0), 0);
            const totalCollected = filteredHist.reduce((s: number, d: any) => s + Number(d.total_collected || 0), 0);
            let totalShort = 0, totalExcess = 0;
            filteredHist.filter((d: any) => d.status === 'CLOSED').forEach((d: any) => {
              const v = Number(d.actual_cash ?? 0) - Number(d.expected_closing ?? 0);
              if (v < 0) totalShort += Math.abs(v);
              else totalExcess += v;
            });

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-4 border-b border-border bg-muted/10 shrink-0">
                {/* Metric 1: Sessions */}
                <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
                  <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Recorded Shifts</span>
                      <span className="text-2xl font-black text-foreground tabular-nums mt-0.5 block">{filteredHist.length}</span>
                      <span className="text-[10px] font-bold text-muted-foreground/70 block mt-0.5">
                        {filteredHist.filter((h: any) => h.status === 'OPEN').length} active shift open
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500 shadow-inner border border-blue-500/20">
                      <History className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Metric 2: Cash Sales */}
                <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
                  <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Direct Cash Sales</span>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">{formatCurrency(totalSales)}</span>
                      <span className="text-[10px] font-bold text-emerald-600/80 dark:text-emerald-400/80 flex items-center gap-0.5 mt-0.5">
                        <TrendingUp className="w-3 h-3" /> Drawer register cash
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 shadow-inner border border-emerald-500/20">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Metric 3: Total Revenue Collected */}
                <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
                  <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Total Revenue</span>
                      <span className="text-2xl font-black text-violet-600 dark:text-violet-400 tabular-nums mt-0.5 block">{formatCurrency(totalCollected)}</span>
                      <span className="text-[10px] font-bold text-muted-foreground/70 block mt-0.5">
                        Cash + Card + UPI + Bank
                      </span>
                    </div>
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-500 shadow-inner border border-violet-500/20">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Metric 4: Short / Excess Variance */}
                <div className="p-1.5 rounded-[1.5rem] bg-card/60 border border-border/60 shadow-sm backdrop-blur-md">
                  <div className="p-3.5 rounded-[calc(1.5rem-0.375rem)] bg-background/80 border border-border/30 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Shift Variance</span>
                      <span className={clsx(
                        'text-2xl font-black tabular-nums mt-0.5 block',
                        totalShort > 0 ? 'text-rose-500' : totalExcess > 0 ? 'text-emerald-500' : 'text-foreground'
                      )}>
                        {totalShort > 0 ? `−${formatCurrency(totalShort)}` : totalExcess > 0 ? `+${formatCurrency(totalExcess)}` : '✓ Balanced'}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground/70 block mt-0.5">
                        {totalShort > 0 ? 'Drawer cash short' : totalExcess > 0 ? 'Drawer cash excess' : 'Zero discrepancy'}
                      </span>
                    </div>
                    <div className={clsx(
                      'p-3 rounded-2xl shadow-inner border',
                      totalShort > 0 ? 'bg-gradient-to-br from-rose-500/20 to-rose-500/5 text-rose-500 border-rose-500/20' : 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/20'
                    )}>
                      {totalShort > 0 ? <TrendingDown className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Main Master History Table / Feed ── */}
          <div className="flex-1 overflow-y-auto p-5">
            {(() => {
              const filteredHistory = history.filter((d: any) => {
                const matchesSearch = !histSearch ||
                  (d.business_date && d.business_date.toLowerCase().includes(histSearch.toLowerCase())) ||
                  (d.opened_by_name && d.opened_by_name.toLowerCase().includes(histSearch.toLowerCase())) ||
                  (d.closed_by_name && d.closed_by_name.toLowerCase().includes(histSearch.toLowerCase()));

                if (!matchesSearch) return false;
                if (histDateRange === 'today') return d.business_date && d.business_date.startsWith(todayStr());
                if (histDateRange === '7days') {
                  const limit7 = new Date(); limit7.setDate(limit7.getDate() - 7);
                  return new Date(d.business_date) >= limit7;
                }
                if (histDateRange === '30days') {
                  const limit30 = new Date(); limit30.setDate(limit30.getDate() - 30);
                  return new Date(d.business_date) >= limit30;
                }
                return true;
              });

              if (filteredHistory.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-12 text-center">
                    <div className="w-16 h-16 rounded-3xl bg-muted/40 flex items-center justify-center">
                      <History className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="text-base font-extrabold text-foreground">No matching history records</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Try clearing your search query or selecting a broader date filter</p>
                    </div>
                    {histSearch && (
                      <button
                        onClick={() => setHistSearch('')}
                        className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-black transition-all cursor-pointer"
                      >
                        Clear Search Filter
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_0.8fr_0.7fr] gap-x-2 px-5 py-3 text-[9px] font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 bg-muted/30 sticky top-0 z-10">
                    <span className="flex items-center gap-1 cursor-pointer hover:text-foreground" onClick={() => setExpandedDay(null)}>
                      Shift Date <ChevronDown className="w-3 h-3 opacity-50" />
                    </span>
                    <span>Cashier</span>
                    <span className="text-right">Opening</span>
                    <span className="text-right">Sales</span>
                    <span className="text-right">In</span>
                    <span className="text-right">Out</span>
                    <span className="text-right">Expected</span>
                    <span className="text-right">Actual</span>
                    <span className="text-center">Variance</span>
                    <span className="text-center">Total Settled</span>
                    <span className="text-center">Status</span>
                  </div>

                  <div className="divide-y divide-border/30">
                    {filteredHistory.map((d: any) => {
                      const isClosed = d.status === 'CLOSED';
                      const variance = Number(d.actual_cash ?? 0) - Number(d.expected_closing ?? 0);
                      const hasVar = isClosed && d.actual_cash !== null && d.actual_cash !== undefined;
                      const isExpanded = expandedDay === d.business_date;
                      const cashierName = d.opened_by_name || d.closed_by_name || '—';
                      const formattedDate = d.business_date ? d.business_date.split('T')[0] : '';

                      return (
                        <div key={d.drawer_id}>
                          {/* Main row — Clickable to expand */}
                          <div
                            onClick={() => loadDaySettlements(d.business_date)}
                            className={clsx(
                              'grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_0.8fr_0.7fr] gap-x-2 px-5 py-3.5 items-center transition-all duration-150 cursor-pointer border-l-4 group',
                              !isClosed ? 'border-l-blue-500' :
                              variance < 0 ? 'border-l-rose-500' :
                              variance > 0 ? 'border-l-amber-500' :
                              'border-l-emerald-500',
                              isExpanded ? 'bg-primary/5 shadow-inner' : 'hover:bg-primary/5'
                            )}
                          >
                            {/* Date */}
                            <div className="flex items-center gap-2">
                              <div className={clsx(
                                'p-1 rounded-lg transition-transform duration-200',
                                isExpanded ? 'bg-primary/10 text-primary rotate-90' : 'text-muted-foreground group-hover:text-foreground'
                              )}>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-extrabold text-foreground leading-tight">{formattedDate}</span>
                                {d.settled_count > 0 && (
                                  <span className="text-[9px] text-muted-foreground font-bold flex items-center gap-1">
                                    <Receipt className="w-2.5 h-2.5 text-muted-foreground/70" />
                                    {d.settled_count} bill{d.settled_count !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Cashier */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                                <User className="w-3 h-3" />
                              </div>
                              <span className="text-[11px] text-foreground font-bold truncate">{cashierName}</span>
                            </div>

                            {/* Opening */}
                            <span className="text-xs text-right tabular-nums text-muted-foreground font-semibold">{formatCurrency(d.opening_balance)}</span>

                            {/* Sales */}
                            <span className="text-xs text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-extrabold">{formatCurrency(d.cash_sales)}</span>

                            {/* Cash In */}
                            <span className="text-xs text-right tabular-nums text-blue-500 font-bold">{formatCurrency(d.cash_in || 0)}</span>

                            {/* Cash Out */}
                            <span className="text-xs text-right tabular-nums text-rose-500 font-bold">{formatCurrency(d.cash_out || 0)}</span>

                            {/* Expected closing */}
                            <span className="text-xs text-right tabular-nums text-foreground font-black">{formatCurrency(d.expected_closing)}</span>

                            {/* Actual (if closed) */}
                            <span className={clsx('text-xs text-right tabular-nums font-extrabold', isClosed ? 'text-foreground' : 'text-muted-foreground/40')}>
                              {isClosed && d.actual_cash !== null ? formatCurrency(d.actual_cash) : '—'}
                            </span>

                            {/* Variance */}
                            <div className="flex justify-center">
                              {hasVar ? (
                                <span className={clsx(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border',
                                  variance > 0 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
                                  variance < 0 ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25' :
                                  'text-muted-foreground bg-muted/40 border-border'
                                )}>
                                  {variance > 0 ? `+${formatCurrency(variance)}` : variance < 0 ? formatCurrency(variance) : '✓ Matched'}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/40">—</span>
                              )}
                            </div>

                            {/* Settled (total collected) */}
                            <div className="flex justify-center">
                              <span className="text-xs font-black text-violet-600 dark:text-violet-400 tabular-nums">
                                {d.total_collected ? formatCurrency(d.total_collected) : '—'}
                              </span>
                            </div>

                            {/* Status */}
                            <div className="flex justify-center">
                              <span className={clsx(
                                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black border shadow-xs',
                                isClosed
                                  ? 'bg-muted/60 text-muted-foreground border-border'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              )}>
                                <span className={clsx('w-1.5 h-1.5 rounded-full', isClosed ? 'bg-muted-foreground' : 'bg-emerald-500 animate-pulse')} />
                                {isClosed ? 'Closed' : 'Open'}
                              </span>
                            </div>
                          </div>

                          {/* ── Expanded Detail Workbench: Dual Sub-Tabs ── */}
                          {isExpanded && (
                            <div className="bg-muted/15 border-t border-b border-border/40 transition-all duration-200">
                              {loadingSettlements ? (
                                <div className="flex items-center justify-center py-8 gap-2.5">
                                  <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                  <span className="text-xs text-muted-foreground font-extrabold tracking-tight">Fetching session details…</span>
                                </div>
                              ) : (
                                <div>
                                  {/* Sub-navigation tabs */}
                                  <div className="flex items-center justify-between px-8 pt-3 pb-2.5 border-b border-border/40 bg-card/80 backdrop-blur-sm">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setExpandedSubTab('bills'); }}
                                        className={clsx(
                                          'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-xs',
                                          expandedSubTab === 'bills'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background text-muted-foreground hover:text-foreground border-border'
                                        )}
                                      >
                                        <Receipt className="w-3.5 h-3.5" />
                                        Bills History
                                        <span className={clsx('px-1.5 py-0.2 rounded-full text-[9px]', expandedSubTab === 'bills' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
                                          {daySettlements.length}
                                        </span>
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setExpandedSubTab('cash'); }}
                                        className={clsx(
                                          'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-xs',
                                          expandedSubTab === 'cash'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background text-muted-foreground hover:text-foreground border-border'
                                        )}
                                      >
                                        <Banknote className="w-3.5 h-3.5" />
                                        Cash Register History
                                        <span className={clsx('px-1.5 py-0.2 rounded-full text-[9px]', expandedSubTab === 'cash' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
                                          {(d.opening_balance != null && d.opening_balance >= 0 ? 1 : 0) + dayCashTransactions.length}
                                        </span>
                                      </button>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-semibold">
                                      Session Date: <span className="font-extrabold text-foreground">{formattedDate}</span>
                                    </div>
                                  </div>

                                  {/* Subtab 1: Bills History */}
                                  {expandedSubTab === 'bills' ? (
                                    daySettlements.length === 0 ? (
                                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                                        <Receipt className="w-8 h-8 text-muted-foreground/30" />
                                        <p className="text-xs text-muted-foreground font-bold">No bills found for this date</p>
                                      </div>
                                    ) : (
                                      <div className="p-6">
                                        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                                          {/* Sub-header */}
                                          <div className="grid grid-cols-[1.2fr_1.3fr_0.9fr_0.9fr_1fr_0.9fr] gap-x-3 px-4 py-2.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
                                            <span>Invoice #</span>
                                            <span>Customer</span>
                                            <span className="text-right">Grand Total</span>
                                            <span className="text-right">Discount</span>
                                            <span className="text-center">Payment Badge</span>
                                            <span className="text-right">Biller</span>
                                          </div>
                                          <div className="divide-y divide-border/30">
                                            {daySettlements.map((inv: any) => (
                                              <div key={inv.invoice_id} className="grid grid-cols-[1.2fr_1.3fr_0.9fr_0.9fr_1fr_0.9fr] gap-x-3 px-4 py-2.5 items-center hover:bg-muted/20 transition-colors">
                                                <button
                                                  onClick={() => handleViewInvoice(inv)}
                                                  className="text-xs font-extrabold text-primary hover:underline text-left cursor-pointer flex items-center gap-1.5"
                                                  title="View bill details & reprint"
                                                >
                                                  <Receipt className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                                  {inv.invoice_number}
                                                </button>
                                                <span className="text-xs text-foreground font-medium truncate">
                                                  {inv.customer_name || 'Walk-in Customer'}
                                                </span>
                                                <span className="text-xs text-right tabular-nums text-foreground font-extrabold">
                                                  {formatCurrency(inv.grand_total)}
                                                </span>
                                                <span className="text-xs text-right tabular-nums text-amber-500 font-bold">
                                                  {inv.discount_total ? formatCurrency(inv.discount_total) : '—'}
                                                </span>
                                                <div className="flex justify-center">
                                                  <span className={clsx(
                                                    'text-[9px] font-black px-2 py-0.5 rounded-md text-center border',
                                                    inv.payment_method === 'CASH' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                                    inv.payment_method === 'CARD' ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20' :
                                                    inv.payment_method === 'UPI' ? 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20' :
                                                    'text-muted-foreground bg-muted/50 border-border'
                                                  )}>
                                                    {inv.payment_method}
                                                  </span>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground text-right truncate font-medium">{inv.biller_name || '—'}</span>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Bills Summary Footer */}
                                          {(() => {
                                            const totalAmt = daySettlements.reduce((s: number, i: any) => s + Number(i.grand_total || 0), 0);
                                            const totalDisc = daySettlements.reduce((s: number, i: any) => s + Number(i.discount_total || 0), 0);
                                            const totalRecv = daySettlements.reduce((s: number, i: any) => s + Number(i.received_amount || 0), 0);
                                            return (
                                              <div className="grid grid-cols-[1.2fr_1.3fr_0.9fr_0.9fr_1fr_0.9fr] gap-x-3 px-4 py-3 border-t border-border/80 bg-muted/40 font-bold">
                                                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Billed</span>
                                                <span />
                                                <span className="text-xs text-right font-black text-foreground tabular-nums">{formatCurrency(totalAmt)}</span>
                                                <span className="text-xs text-right font-black text-amber-500 tabular-nums">{formatCurrency(totalDisc)}</span>
                                                <div className="flex justify-center">
                                                  <span className="text-[9px] font-black text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(totalRecv)} received</span>
                                                </div>
                                                <span />
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    )
                                  ) : (
                                    /* Subtab 2: Cash Register History */
                                    dayCashTransactions.length === 0 && (!d.opening_balance || d.opening_balance < 0) ? (
                                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                                        <Banknote className="w-8 h-8 text-muted-foreground/30" />
                                        <p className="text-xs text-muted-foreground font-bold">No cash register entries recorded for this date</p>
                                      </div>
                                    ) : (
                                      <div className="p-6">
                                        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                                          {/* Sub-header */}
                                          <div className="grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-2.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
                                            <span>Timestamp</span>
                                            <span>Type</span>
                                            <span>Category & Reference Notes</span>
                                            <span className="text-right">Amount</span>
                                            <span className="text-right">Recorded By</span>
                                          </div>
                                          <div className="divide-y divide-border/30">
                                            {/* Opening Balance Row */}
                                            {d.opening_balance != null && d.opening_balance >= 0 && (
                                              <div className="grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-3 items-center hover:bg-muted/20 border-l-3 border-l-primary/70 transition-colors">
                                                <span className="text-[10px] text-muted-foreground tabular-nums font-semibold flex items-center gap-1">
                                                  <Clock className="w-3 h-3 text-muted-foreground/60" /> {d.opened_at ? formatTime(d.opened_at) : '—'}
                                                </span>
                                                <div>
                                                  <span className="text-[9px] font-black px-2 py-0.5 rounded-md text-center text-primary bg-primary/10 border border-primary/20">OPEN</span>
                                                </div>
                                                <div>
                                                  <span className="text-xs font-extrabold text-foreground block">Opening Balance</span>
                                                  <span className="text-[10px] text-muted-foreground font-medium">Shift initial drawer balance</span>
                                                </div>
                                                <span className="text-xs text-right tabular-nums font-black text-foreground">{formatCurrency(d.opening_balance)}</span>
                                                <span className="text-[10px] text-muted-foreground text-right truncate font-medium">{d.opened_by_name || '—'}</span>
                                              </div>
                                            )}

                                            {/* Cash Transactions Feed */}
                                            {dayCashTransactions.map((tx: any) => {
                                              const isIn = tx.type === 'CASH_IN';
                                              return (
                                                <div key={tx.transaction_id} className={clsx(
                                                  'grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-3 items-center hover:bg-muted/20 border-l-3 transition-colors',
                                                  isIn ? 'border-l-emerald-500' : 'border-l-rose-500'
                                                )}>
                                                  <span className="text-[10px] text-muted-foreground tabular-nums font-semibold flex items-center gap-1">
                                                    <Clock className="w-3 h-3 text-muted-foreground/60" /> {formatTime(tx.transaction_date)}
                                                  </span>
                                                  <div>
                                                    <span className={clsx(
                                                      'text-[9px] font-black px-2 py-0.5 rounded-md text-center border',
                                                      isIn ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
                                                    )}>
                                                      {isIn ? 'CASH IN' : 'EXPENSE'}
                                                    </span>
                                                  </div>
                                                  <div className="min-w-0">
                                                    <span className="text-xs font-bold text-foreground truncate block">{tx.category || 'Other'}</span>
                                                    {tx.notes && <span className="text-[10px] text-muted-foreground font-medium truncate block mt-0.5">{tx.notes}</span>}
                                                  </div>
                                                  <span className={clsx(
                                                    'text-xs text-right tabular-nums font-black',
                                                    isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                                  )}>
                                                    {isIn ? '+' : '−'}{formatCurrency(tx.amount)}
                                                  </span>
                                                  <span className="text-[10px] text-muted-foreground text-right truncate font-medium">{tx.entered_by_name || '—'}</span>
                                                </div>
                                              );
                                            })}
                                          </div>

                                          {/* Cash Movement Totals Footer */}
                                          {(() => {
                                            const cashInSum = dayCashTransactions.filter((t: any) => t.type === 'CASH_IN').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
                                            const cashOutSum = dayCashTransactions.filter((t: any) => t.type === 'CASH_OUT').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
                                            const netCash = cashInSum - cashOutSum;
                                            return (
                                              <div className="grid grid-cols-[0.8fr_0.6fr_2fr_1fr_0.8fr] gap-x-3 px-4 py-3 border-t border-border/80 bg-muted/40 font-bold">
                                                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Net Movement</span>
                                                <span />
                                                <div className="text-[10px] font-extrabold text-muted-foreground">
                                                  <span>In: <span className="text-emerald-500">{formatCurrency(cashInSum)}</span></span>
                                                  <span className="mx-2">&middot;</span>
                                                  <span>Out: <span className="text-rose-500">{formatCurrency(cashOutSum)}</span></span>
                                                </div>
                                                <span className={clsx(
                                                  'text-xs text-right font-black tabular-nums',
                                                  netCash >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                                )}>
                                                  {netCash >= 0 ? `+${formatCurrency(netCash)}` : formatCurrency(netCash)}
                                                </span>
                                                <span />
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* ─── NORMAL TWO-COLUMN SPLIT ───────────────────────────── */
        <div className="flex-1 flex min-h-0">

        {/* ═══ LEFT: Pending Invoices ═══════════════════════════════════════ */}
        {showSettlement && (
        <div className="flex-1 min-w-0 flex flex-col border-r border-border">

          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/10 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search invoice or customer…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-card border border-border rounded-xl outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 text-foreground placeholder:text-muted-foreground/50 transition-all duration-200"
              />
            </div>
            {/* Pending count badge */}
            <div className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shrink-0',
              pendingInvoices.length > 0
                ? 'bg-amber-500/10 border-amber-500/25'
                : 'bg-emerald-500/10 border-emerald-500/25'
            )}>
              <span className={clsx('text-sm font-black tabular-nums leading-none', pendingInvoices.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                {pendingInvoices.length > 999 ? '999+' : pendingInvoices.length}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">
                Pending
              </span>
            </div>
            {/* Sales badge */}
            {drawer && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 shrink-0">
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">
                  {formatCurrency(drawer.cash_sales || 0)}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">
                  Sales
                </span>
              </div>
            )}
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1.2fr_1.3fr_1fr_1.3fr_1fr_1.1fr_0.9fr] gap-x-3 px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20 shrink-0">
            <span>Invoice</span>
            <span>Customer</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Discount / Plus</span>
            <span className="text-right">Net</span>
            <span className="text-center">Payment</span>
            <span className="text-right">Action</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {pendingInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-10">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/70" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-foreground">All Settled!</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">No pending invoices for today</p>
                </div>
              </div>
            ) : (
              pendingInvoices.map((inv) => {
                const rd  = rowDiscs[inv.invoice_id] ?? 0;
                const plusVal = rowPluses[inv.invoice_id] ?? 0;
                const rm  = rowMethods[inv.invoice_id] ?? 'CASH';
                const rawNet = getRawNet(inv);
                const isMinus = rawNet < 0;
                const calculatedNet = isMinus ? rawNet + plusVal : Math.max(0, rawNet - rd);
                const net = Math.round(calculatedNet * 100) / 100;
                const absNet = Math.round(Math.abs(net) * 100) / 100;
                const absRawNet = Math.round(Math.abs(rawNet) * 100) / 100;

                const isPaying = payingRow === inv.invoice_id;
                const scrapD = Number(inv.scrap_deduction) || 0;
                const returnD = Number(inv.return_deduction) || 0;
                const totalDeductions = scrapD + returnD;
                const sub = Number(inv.subtotal) || 0;
                const tax = Number(inv.tax_total) || 0;
                const disc = Number(inv.discount_total) || 0;
                const ptsDisc = Number(inv.points_redeemed_discount) || 0;
                const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
                const refundAmount = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;
                const displayAmount = refundAmount > 0 ? preDeductionTotal : inv.grand_total;

                const isNewArrival = newArrivalIds.has(inv.invoice_id);

                return (
                  <div
                    key={inv.invoice_id}
                    className={clsx(
                      'grid grid-cols-[1.2fr_1.3fr_1fr_1.3fr_1fr_1.1fr_0.9fr] gap-x-3 px-4 py-3.5 items-center transition-all duration-150 group',
                      isPaying ? 'bg-primary/5' : 'hover:bg-primary/5',
                      isNewArrival && 'ring-2 ring-emerald-500/80 bg-emerald-500/10 animate-pulse'
                    )}
                  >
                    {/* Invoice + status */}
                    <div className="flex items-center justify-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 text-blue-500 shadow-inner shrink-0 self-center">
                        <Receipt className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex flex-col justify-center items-center text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleViewInvoice(inv)}
                            className="text-xs font-extrabold text-foreground truncate block cursor-pointer hover:text-primary hover:underline transition-colors"
                            title="View invoice"
                          >
                            {inv.invoice_number}
                          </button>
                          {isNewArrival && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-black bg-emerald-500 text-white animate-bounce shrink-0">
                              <Zap className="w-2.5 h-2.5 fill-white" /> NEW
                            </span>
                          )}
                        </div>
                        {(returnD > 0 || scrapD > 0) && (
                          <div className="flex items-center justify-center gap-1 flex-wrap mt-0.5">
                            {returnD > 0 && (
                              <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25">
                                Return ₹{returnD}
                              </span>
                            )}
                            {scrapD > 0 && (
                              <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/25">
                                Scrap ₹{scrapD}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Customer */}
                    <span className="text-xs text-muted-foreground truncate flex items-center gap-1.5 min-w-0">
                      <User className="w-3 h-3 shrink-0 opacity-50" />
                      <span className="truncate">{inv.customer_name || 'Walk-in Customer'}</span>
                    </span>

                    {/* Amount */}
                    <span className="text-xs font-bold text-foreground text-right tabular-nums block">{formatCurrency(displayAmount)}</span>

                    {/* Discount / Plus inputs grouped */}
                    {isMinus ? (
                      <div className="flex items-center border border-emerald-500/30 rounded-xl overflow-hidden focus-within:border-emerald-500 transition-all bg-card" title="Plus / Addition for minus amount">
                        <input
                          type="number"
                          value={rowPlusPercentInputs[inv.invoice_id] !== undefined ? rowPlusPercentInputs[inv.invoice_id] : (rowPlusPercents[inv.invoice_id] || '')}
                          onChange={(e) => handlePlusPercentChange(inv.invoice_id, e.target.value)}
                          onBlur={() => setRowPlusPercentInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-foreground tabular-nums text-center no-spinners"
                          step="0.01" min="0" placeholder="%"
                        />
                        <span className="w-px h-5 bg-emerald-500/20 shrink-0" />
                        <input
                          type="number"
                          value={rowPlusInputs[inv.invoice_id] !== undefined ? rowPlusInputs[inv.invoice_id] : (rowPluses[inv.invoice_id] || '')}
                          onChange={(e) => handlePlusFlatChange(inv.invoice_id, e.target.value)}
                          onBlur={() => setRowPlusInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-emerald-600 dark:text-emerald-400 tabular-nums text-center no-spinners"
                          step="0.01" placeholder="+₹"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center border border-amber-500/20 rounded-xl overflow-hidden focus-within:border-amber-500/60 transition-all bg-card">
                        <input
                          type="number"
                          value={rowDiscPercentInputs[inv.invoice_id] !== undefined ? rowDiscPercentInputs[inv.invoice_id] : (rowDiscPercents[inv.invoice_id] || '')}
                          onChange={(e) => handleDiscPercentChange(inv.invoice_id, e.target.value)}
                          onBlur={() => setRowDiscPercentInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-foreground tabular-nums text-center no-spinners"
                          step="0.01" min="0" placeholder="%"
                        />
                        <span className="w-px h-5 bg-amber-500/20 shrink-0" />
                        <input
                          type="number"
                          value={rowDiscInputs[inv.invoice_id] !== undefined ? rowDiscInputs[inv.invoice_id] : (rd || '')}
                          onChange={(e) => handleDiscFlatChange(inv.invoice_id, e.target.value)}
                          onBlur={() => setRowDiscInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full py-2 text-[10px] font-bold bg-transparent outline-none text-foreground tabular-nums text-center no-spinners"
                          step="1" min="0" placeholder="₹"
                        />
                      </div>
                    )}

                    {/* Net editable input */}
                    <span className="text-xs font-black text-right tabular-nums block">
                      {isMinus ? (
                        <div className="flex items-center justify-center">
                          <div className="flex items-center border border-emerald-500/30 rounded-lg overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all bg-card w-full max-w-[105px]">
                            <span className="pl-2 shrink-0 whitespace-nowrap text-[10px] font-black text-emerald-600 dark:text-emerald-400 select-none leading-none">-₹</span>
                            <input
                              type="number"
                              value={rowNetInputs[inv.invoice_id] !== undefined ? rowNetInputs[inv.invoice_id] : (absNet === 0 ? '' : absNet.toFixed(2))}
                              onChange={(e) => handleNetChange(inv.invoice_id, e.target.value)}
                              onBlur={() => setRowNetInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="w-full py-1 pr-2 pl-1 text-[10px] font-black bg-transparent outline-none text-emerald-600 dark:text-emerald-400 tabular-nums text-center no-spinners"
                              step="0.01" min="0" placeholder={absRawNet.toFixed(2)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <div className="flex items-center border border-primary/30 rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all bg-card w-full max-w-[90px]">
                            <span className="pl-2 shrink-0 whitespace-nowrap text-[10px] font-black text-primary select-none leading-none">₹</span>
                            <input
                              type="number"
                              value={rowNetInputs[inv.invoice_id] !== undefined ? rowNetInputs[inv.invoice_id] : (net === 0 ? '' : net.toFixed(2))}
                              onChange={(e) => handleNetChange(inv.invoice_id, e.target.value)}
                              onBlur={() => setRowNetInputs((p) => { const n = { ...p }; delete n[inv.invoice_id]; return n; })}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="w-full py-1 pr-2 pl-0.5 text-[10px] font-black bg-transparent outline-none text-primary tabular-nums text-center no-spinners"
                              step="0.01" min="0" placeholder={displayAmount.toFixed(2)}
                            />
                          </div>
                        </div>
                      )}
                    </span>

                    {/* Payment method dropdown */}
                    <div className="flex justify-center">
                      <Select
                        value={rm}
                        onChange={(v) => {
                          setRowMethods((p) => ({ ...p, [inv.invoice_id]: v as PaymentMethod }));
                          if (v === 'SPLIT') {
                            openSplitModal(inv);
                          }
                        }}
                        options={PAYMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        size="sm"
                      />
                    </div>

                    {/* Pay button */}
                    <div className="flex justify-end">
                      <button
                        onClick={async () => {
                          if (payingRow) return;
                          if (rm === 'SPLIT') {
                            openSplitModal(inv);
                            return;
                          }
                          setPayingRow(inv.invoice_id);
                          const r = await window.electronAPI!.dbCashierSettlePayment({
                            tenant_id: tenantId!, invoice_id: inv.invoice_id,
                            received_amount: net, payment_method: rm,
                            user_id: userId!, user_name: userName || undefined,
                          });
                          setPayingRow(null);
                          if (r.success) await load();
                        }}
                        disabled={isPaying}
                        className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-[10px] font-black text-white transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 shadow-sm bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-md"
                      >
                        {isPaying ? (
                          <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {isPaying ? '' : 'Settle'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        )}

        {/* ═══ RIGHT: Cash Register ═════════════════════════════════════════ */}
        {showRegister && (
        <div className={clsx('shrink-0 flex flex-col bg-card z-10', showSettlement ? 'w-[400px] border-l border-border' : 'flex-1')}>

          {/* Panel header */}
          <div className="relative shrink-0">
            <div
              className="absolute inset-x-0 top-0 h-0.5"
              style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(217,91%,60%) 50%, transparent 100%)' }}
            />
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10">
                  <Receipt className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-foreground tracking-tight">Cash Register</h2>

                </div>
              </div>
              <button
                onClick={async () => {
                  setTxnAmt(0); setTxnCat(''); setTxnNote('');
                  setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setShowAddCatForm(false); setNewCatName('');
                  setShowTxnModal(true);
                  if (!parties.length) {
                    const p = await window.electronAPI!.dbGetParties(tenantId!);
                    if (Array.isArray(p)) setParties(p);
                  }
                  const cats = await window.electronAPI!.dbCashierGetCategories({ tenant_id: tenantId! });
                  if (Array.isArray(cats)) setCustomCategories(cats);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary hover:bg-primary/10 border border-primary/20 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Entry
              </button>
            </div>
          </div>

          {/* Mini stat cards */}
          <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-border bg-muted/5 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-sm">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-500 shadow-inner shrink-0">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Cash In</p>
                  <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight truncate">{formatCurrency(totalIn)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-sm">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500/15 to-rose-500/5 text-rose-500 shadow-inner shrink-0">
                  <TrendingDown className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Cash Out</p>
                  <p className="text-xs font-black text-rose-600 dark:text-rose-400 tabular-nums leading-tight truncate">{formatCurrency(totalOut)}</p>
                </div>
              </div>
            </div>

          {/* Column headers */}
          <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20 shrink-0">
            <span>Time</span>
            <span>Type</span>
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span className="text-right">By</span>
          </div>

          {/* Transaction feed */}
          <div className="flex-1 overflow-y-auto">
            {transactions.length === 0 && (!drawer || drawer.opening_balance == null) ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center shadow-inner">
                  <Banknote className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">No manual entries</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Use Add Entry to record cash-in or expenses</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {/* Prepend Opening Balance Row */}
                {drawer && drawer.opening_balance != null && drawer.opening_balance >= 0 && (
                  <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/20 transition-colors items-center border-l-2 border-l-primary/50">
                    <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 shrink-0" /> {drawer.opened_at ? formatTime(drawer.opened_at) : '—'}
                    </span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md text-center w-fit text-primary bg-primary/10">
                      OPEN
                    </span>
                    <span className="text-xs text-foreground truncate font-bold">Opening Balance</span>
                    <span className="text-xs font-black text-right tabular-nums text-foreground">
                      {formatCurrency(drawer.opening_balance)}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate text-right">—</span>
                  </div>
                )}
                {transactions.map((tx: any) => {
                  const isIn = tx.type === 'CASH_IN';
                  const hasCustomCat = tx.category && tx.category !== 'Other';
                  const hasNotes = tx.notes && tx.notes.trim() !== '';
                  const isExpanded = expandedTxId === tx.transaction_id;

                  // If category is not selected or 'Other', but notes exist -> display notes directly!
                  const primaryText = hasCustomCat ? tx.category : (hasNotes ? tx.notes : (tx.category || 'Other'));
                  const secondaryText = (hasCustomCat && hasNotes) ? tx.notes : null;

                  return (
                    <div key={tx.transaction_id} className="border-b border-border/30 last:border-0">
                      <div
                        onClick={() => setExpandedTxId(isExpanded ? null : tx.transaction_id)}
                        className={clsx(
                          'grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/30 transition-colors items-center border-l-2 cursor-pointer select-none',
                          isIn ? 'border-l-emerald-500/50' : 'border-l-rose-500/50',
                          isExpanded && 'bg-muted/20'
                        )}
                        title="Click to view full notes & details"
                      >
                        <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 shrink-0" /> {formatTime(tx.transaction_date)}
                        </span>
                        <span className={clsx(
                          'text-[9px] font-black px-1.5 py-0.5 rounded-md text-center w-fit',
                          isIn ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
                        )}>
                          {isIn ? 'IN' : 'OUT'}
                        </span>
                        
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-foreground truncate font-semibold flex items-center gap-1">
                            {hasNotes && !hasCustomCat && <FileText className="w-3 h-3 text-primary shrink-0" />}
                            {primaryText}
                          </span>
                          {secondaryText && (
                            <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                              <FileText className="w-2.5 h-2.5 text-primary/70 shrink-0" />
                              {secondaryText}
                            </span>
                          )}
                        </div>

                        <span className={clsx('text-xs font-black text-right tabular-nums', isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
                          {isIn ? '+' : '−'}{formatCurrency(tx.amount)}
                        </span>

                        <div className="flex items-center justify-end gap-1 text-muted-foreground">
                          <span className="text-[10px] truncate max-w-[65px]">{tx.entered_by_name || '—'}</span>
                          {hasNotes && (
                            <span className={clsx('p-0.5 rounded transition-transform', isExpanded && 'rotate-180')}>
                              <ChevronDown className="w-3 h-3 text-muted-foreground/70" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded Details Card */}
                      {isExpanded && (
                        <div className="px-5 py-3 bg-muted/30 border-t border-border/40 text-xs space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-primary" /> Transaction Details
                            </span>
                            {tx.entered_by_name && <span>Entered by: {tx.entered_by_name}</span>}
                          </div>

                          {hasNotes ? (
                            <div className="p-2.5 rounded-xl bg-card border border-border/60 text-xs font-medium text-foreground whitespace-pre-wrap leading-relaxed shadow-inner">
                              <span className="text-[10px] font-black text-primary uppercase tracking-wider block mb-1">Notes:</span>
                              {tx.notes}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No additional note attached to this transaction.</p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground font-medium pt-0.5">
                            <span>Category: <strong className="text-foreground">{tx.category || 'Other'}</strong></span>
                            <span>Type: <strong className={isIn ? 'text-emerald-600' : 'text-rose-500'}>{isIn ? 'Cash In' : 'Expense'}</strong></span>
                            <span>Amount: <strong className="text-foreground">{formatCurrency(tx.amount)}</strong></span>
                            <span>Time: <strong className="text-foreground">{formatTime(tx.transaction_date)}</strong></span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )}
        {/* end right panel */}
        </div>
      )}
      {/* end main content */}




      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Day Closing
      ══════════════════════════════════════════════════════════════════════ */}
      {showDayClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => { if (!closeSubmitting) { setShowDayClose(false); setClosingDate(null); } }}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl w-[480px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="relative px-6 py-4 border-b border-border"
              style={{ background: 'linear-gradient(135deg, hsl(0,72%,51%,0.08) 0%, transparent 100%)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-destructive/10">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-foreground">End of Day Closing</h2>
                    {closingDate && (
                      <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5">
                        Closing session for {closingDate}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { if (!closeSubmitting) { setShowDayClose(false); setClosingDate(null); } }}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center"
                  title="Close"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {closeResult ? (
                <>
                  <div className="flex flex-col items-center py-8 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                      <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                    </div>
                    <p className="text-xl font-black text-foreground">Day Closed</p>
                    <p className="text-xs text-muted-foreground font-semibold mt-1">{closingDate || drawer?.business_date}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-muted/30 rounded-xl text-center border border-border">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Expected</p>
                      <p className="text-lg font-black text-foreground">{formatCurrency(closeResult.expected_closing)}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-xl text-center border border-border">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Actual</p>
                      <p className="text-lg font-black text-foreground">{formatCurrency(closeResult.actual_cash)}</p>
                    </div>
                    {closeResult.cash_short > 0 && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center col-span-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Cash Short</p>
                        <p className="text-xl font-black text-rose-500 mt-0.5">−{formatCurrency(closeResult.cash_short)}</p>
                      </div>
                    )}
                    {closeResult.cash_excess > 0 && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center col-span-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Cash Excess</p>
                        <p className="text-xl font-black text-emerald-500 mt-0.5">+{formatCurrency(closeResult.cash_excess)}</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowDayClose(false); setCloseResult(null); setClosingDate(null); setYesterdayNotClosed(false); setYesterdayDrawer(null); }}
                    className="w-full py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-muted/20 rounded-xl text-center border border-border">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Expected Cash</p>
                      <p className="text-lg font-black text-foreground">{formatCurrency(closingDate ? yesterdayDrawer?.expected_closing : drawer?.expected_closing || 0)}</p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-xl text-center border-2 border-primary/20">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Current Balance</p>
                      <p className="text-lg font-black text-primary">{formatCurrency(closingDate ? yesterdayDrawer?.current_cash : drawer?.current_cash || 0)}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Actual Cash Count
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number"
                        value={actualCash || ''}
                        onChange={(e) => setActualCash(e.target.value === '' ? 0 : Number(e.target.value))}
                        className="w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all"
                        step="0.01" min="0" placeholder="Enter physical cash count" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); closeRemarksRef.current?.focus(); } }}
                      />
                    </div>
                  </div>
                  <textarea
                    ref={closeRemarksRef}
                    value={closeRemarks}
                    onChange={(e) => setCloseRemarks(e.target.value)}
                    placeholder="Closing remarks (optional)"
                    className="w-full px-4 py-2.5 text-sm bg-card border border-border rounded-xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDayClose(); } }}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowDayClose(false); setClosingDate(null); }}
                      className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDayClose}
                      disabled={closeSubmitting || actualCash < 0}
                      className="flex-1 py-3 text-sm font-black text-white bg-destructive rounded-xl hover:bg-destructive/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-40"
                    >
                      {closeSubmitting ? 'Processing…' : 'Complete Day Closing'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowOpeningBal(false); setOpeningBalError(''); }}
                  className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetOpening}
                  className="flex-1 py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => {
            if (!txnSubmitting) {
              setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote('');
              setTxnPartyId(''); setTxnPartyName(''); setPartySearch('');
              setShowAddCatForm(false); setNewCatName('');
            }
          }}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl w-[420px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="relative px-6 py-4 border-b border-border"
              style={{
                background: txnType === 'CASH_IN'
                  ? 'linear-gradient(135deg, hsl(142,72%,29%,0.1) 0%, transparent 100%)'
                  : 'linear-gradient(135deg, hsl(0,72%,51%,0.1) 0%, transparent 100%)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className={clsx('p-2 rounded-xl', txnType === 'CASH_IN' ? 'bg-emerald-500/15' : 'bg-rose-500/15')}>
                  {txnType === 'CASH_IN'
                    ? <Plus className="w-4 h-4 text-emerald-500" />
                    : <Minus className="w-4 h-4 text-rose-500" />
                  }
                </div>
                <h2 className="text-base font-extrabold text-foreground">
                  {txnType === 'CASH_IN' ? 'Record Cash In' : 'Record Expense'}
                </h2>
              </div>
            </div>

            <div className="p-6 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
              {/* Toggle */}
              <div className="flex rounded-xl bg-muted/40 border border-border p-1 gap-1">
                <button
                  onClick={() => setTxnType('CASH_IN')}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all duration-200 cursor-pointer',
                    txnType === 'CASH_IN' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Cash In
                </button>
                <button
                  onClick={() => setTxnType('CASH_OUT')}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all duration-200 cursor-pointer',
                    txnType === 'CASH_OUT' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <TrendingDown className="w-3.5 h-3.5" /> Expense
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                  <input
                    type="number"
                    value={txnAmt || ''}
                    onChange={(e) => setTxnAmt(e.target.value === '' ? 0 : Number(e.target.value))}
                    className={clsx(
                      'w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 rounded-2xl outline-none text-foreground tabular-nums shadow-sm transition-all',
                      txnType === 'CASH_IN'
                        ? 'border-emerald-500/25 focus:border-emerald-500'
                        : 'border-rose-500/25 focus:border-rose-500'
                    )}
                    step="0.01" min="0" placeholder="Enter amount" autoFocus
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Category</label>
                {showAddCatForm ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      placeholder={`New ${txnType === 'CASH_IN' ? 'income' : 'expense'} category...`}
                      className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary transition-all"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newCatName.trim()) {
                          (e.target as HTMLInputElement).blur();
                          const btn = (e.target as HTMLInputElement).closest('div')?.querySelector('button');
                          btn?.click();
                        }
                      }}
                    />
                    <button
                      onClick={async () => {
                        if (!newCatName.trim() || !tenantId) return;
                        setAddingCat(true);
                        const r = await window.electronAPI!.dbCashierAddCategory({ tenant_id: tenantId, name: newCatName.trim(), type: txnType });
                        if (r.success) {
                          const cats = await window.electronAPI!.dbCashierGetCategories({ tenant_id: tenantId });
                          if (Array.isArray(cats)) setCustomCategories(cats);
                          setTxnCat(newCatName.trim());
                          setShowAddCatForm(false);
                          setNewCatName('');
                        }
                        setAddingCat(false);
                      }}
                      disabled={addingCat || !newCatName.trim()}
                      className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {addingCat ? '...' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setShowAddCatForm(false); setNewCatName(''); }}
                      className="px-3 py-2.5 text-muted-foreground hover:text-foreground rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        value={txnCat}
                        onChange={v => {
                          if (v === '__ADD_NEW__') { setShowAddCatForm(true); setNewCatName(''); }
                          else setTxnCat(v);
                        }}
                        placeholder="Select category"
                        options={(() => {
                          const defaults = txnType === 'CASH_IN'
                            ? [
                                { value: 'Cash Deposit',      label: 'Cash Deposit'      },
                                { value: 'Petty Cash Return', label: 'Petty Cash Return' },
                                { value: 'Loan Repayment',    label: 'Loan Repayment'    },
                                { value: 'Customer Payment',  label: 'Customer Payment'  },
                                { value: 'Other Income',      label: 'Other Income'      },
                              ]
                            : [
                                { value: 'Petty Cash',   label: 'Petty Cash'   },
                                { value: 'Electricity',  label: 'Electricity'  },
                                { value: 'Rent',         label: 'Rent'         },
                                { value: 'Salary',       label: 'Salary'       },
                                { value: 'Transport',    label: 'Transport'    },
                                { value: 'Stationery',   label: 'Stationery'   },
                                { value: 'Maintenance',  label: 'Maintenance'  },
                                { value: 'Other',        label: 'Other'        },
                              ];
                          const defaultValues = new Set(defaults.map(d => d.value));
                          const custom = customCategories
                            .filter(c => c.type === txnType && !defaultValues.has(c.name))
                            .map(c => ({ value: c.name, label: c.name }));
                          return [...defaults, ...custom, { value: '__ADD_NEW__', label: '+ Add New Category' }];
                        })()}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Link to Party */}
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Link to Party <span className="font-normal normal-case text-muted-foreground/50">(optional)</span>
                </label>
                {txnPartyId ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-2xl shadow-sm">
                    <span className="text-sm font-bold text-foreground flex-1 truncate">{txnPartyName}</span>
                    <button
                      onClick={() => { setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); }}
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={partySearch}
                      onChange={(e) => setPartySearch(e.target.value)}
                      placeholder="Search party…"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-card border border-border rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 shadow-sm transition-all"
                    />
                    {partySearch && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl z-10 max-h-40 overflow-y-auto">
                        {parties
                          .filter((p: any) => p.name.toLowerCase().includes(partySearch.toLowerCase()))
                          .slice(0, 20)
                          .map((p: any) => (
                            <button
                              key={p.party_id}
                              onClick={() => { setTxnPartyId(p.party_id); setTxnPartyName(p.name); setPartySearch(''); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer border-b border-border last:border-0"
                            >
                              <span className="font-bold">{p.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{p.phone || ''}</span>
                            </button>
                          ))
                        }
                        {parties.filter((p: any) => p.name.toLowerCase().includes(partySearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-xs text-muted-foreground text-center">No parties found</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Notes <span className="font-normal normal-case text-muted-foreground/50">(optional)</span>
                </label>
                <textarea
                  value={txnNote}
                  onChange={(e) => setTxnNote(e.target.value)}
                  placeholder="Add a note…"
                  className="w-full px-4 py-2.5 text-sm bg-card border border-border rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote('');
                    setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setShowAddCatForm(false); setNewCatName('');
                  }}
                  className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTransaction}
                  disabled={txnSubmitting || txnAmt <= 0}
                  className={clsx(
                    'flex-1 py-3 text-sm font-black text-white rounded-xl shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-40',
                    txnType === 'CASH_IN' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                  )}
                >
                  {txnSubmitting ? 'Recording…' : txnType === 'CASH_IN' ? 'Record Cash In' : 'Record Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Centered Invoice Detail Modal ─── */}
      <Modal
        isOpen={showInvoiceModal}
        onClose={() => { setShowInvoiceModal(false); setSelectedInvoice(null); setInvoiceItems([]); }}
        title={
          selectedInvoice && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-black text-foreground">{selectedInvoice.invoice_number}</span>
              <span className={clsx(
                'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0',
                selectedInvoice.sync_status === 'SYNCED'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
              )}>
                {selectedInvoice.sync_status}
              </span>
              <InvoiceTypeBadge inv={selectedInvoice} />
            </div>
          )
        }
      >
        {selectedInvoice && (
          <div className="space-y-4 text-foreground">
            {/* Toast notification inside modal */}
            {reprintSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-2 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-sm">
                <CheckCheck className="w-4 h-4 shrink-0" />
                Invoice reprinted successfully!
              </div>
            )}

            {/* Action Buttons & Time */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-muted/30 border border-border rounded-2xl">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(selectedInvoice.created_at).date}
                  <span className="opacity-60">at</span>
                  {formatDate(selectedInvoice.created_at).time}
                </span>
                {selectedInvoice.biller_name && (
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {selectedInvoice.biller_name}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={async () => {
                  if (!selectedInvoice || !window.electronAPI) return;
                  try {
                    const { tenantId } = useAuthStore.getState();
                    const [shopAddr, shopPh, upi, showQr, shopGstin] = await Promise.all([
                      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
                      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
                      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
                      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
                      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
                    ]);
                    const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
                    const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
                    const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
                    const invoiceType = selectedInvoice.invoice_type;
                    const isB2B = invoiceType === 'GST' && !!(selectedInvoice.customer_gstin);
                    const useA4 = isB2B || printFmt?.format === 'a4';
                    const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.billSettings || {}) };
                    const receiptData: ReceiptData = {
                      shopName: billSettings.showShopName ? (useAuthStore.getState().shopName || 'My Shop') : '',
                      shopGstin: billSettings.showShopGstin ? (shopGstin || undefined) : undefined,
                      shopAddress: billSettings.showShopAddress ? (shopAddr || undefined) : undefined,
                      shopPhone: billSettings.showPhone ? (shopPh || undefined) : undefined,
                      upiId: upi || undefined,
                      showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
                      showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
                      invoiceNumber: selectedInvoice.invoice_number,
                      date: formatBillDateTime(selectedInvoice.created_at),
                      billerName: selectedInvoice.biller_name,
                      items: invoiceItems.map(item => ({ name: item.name, quantity: Number(item.quantity) || 0, unit_price: item.unit_price, total: item.total, originalRate: item.originalRate, discountLabel: item.discountLabel, brand: item.brand_manufacturer || undefined })),
                      subtotal: selectedInvoice.subtotal,
                      tax: selectedInvoice.tax_total,
                      discount: selectedInvoice.discount_total,
                      discountType: selectedInvoice.discount_type,
                      discountValue: selectedInvoice.discount_value,
                      grandTotal: selectedInvoice.grand_total,
                      isReprint: true,
                      invoiceType,
                      customerName: billSettings.showCustomerName ? (selectedInvoice.customer_name || undefined) : undefined,
                      customerGstin: billSettings.showCustomerGstin ? (selectedInvoice.customer_gstin || undefined) : undefined,
                      billSettings,
                      isB2B,
                    };
                    if (useA4) {
                      const invoiceHtml = generateInvoiceHtml(receiptData, printFmt?.style || 'standard');
                      const printResult = await window.electronAPI.printA4Html(tenantId || 'global', invoiceHtml);
                      if (!printResult.success && printResult.useDefaultDialog) {
                        const pw = window.open('', '_blank');
                        if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
                      }
                    } else {
                      const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : receiptWidthCm;
                      const thermalStyle = printFmt?.style || 'standard';
                      const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
                      await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
                    }
                    setReprintSuccess(true);
                    setTimeout(() => setReprintSuccess(false), 2500);
                  } catch (err) {
                    console.error('Failed to reprint', err);
                  }
                }}
                  className="flex items-center justify-center gap-1.5 px-4 h-8 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-xs font-bold border border-primary/20 cursor-pointer active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />Print Bill
                </button>
              </div>
            </div>

            {/* Customer + Payment Split */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer</div>
                <div className="font-bold text-sm text-foreground truncate">
                  {selectedInvoice.customer_name || 'Walk-in Customer'}
                </div>
                {selectedInvoice.customer_phone && (
                  <div className="text-[10px] text-muted-foreground">{selectedInvoice.customer_phone}</div>
                )}
                {selectedInvoice.customer_gstin && (
                  <div className="text-[10px] text-muted-foreground font-mono">GSTIN: {selectedInvoice.customer_gstin}</div>
                )}
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment</div>
                <div className="flex items-center gap-2">
                  <PaymentBadge method={selectedInvoice.payment_method || 'PENDING'} />
                  {selectedInvoice.payment_method === 'PENDING' ? (
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                  ) : selectedInvoice.payment_method !== 'CREDIT' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </div>
                {(() => {
                  const received = Number(selectedInvoice.received_amount) || 0;
                  const balance = Number(selectedInvoice.balance_amount) || 0;
                  const isCredit = selectedInvoice.payment_method === 'CREDIT';
                  const isPending = selectedInvoice.payment_method === 'PENDING';
                  if (isPending) {
                    return <div className="text-[10px] text-gray-500 font-semibold">Awaiting payment at counter</div>;
                  }
                  if (!isCredit && received <= 0) return null;
                  return (
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <div>Received: <span className="font-bold text-foreground">{formatCurrency(received)}</span></div>
                      {isCredit && balance < 0 && <div className="text-amber-500 font-semibold">Due: {formatCurrency(Math.abs(balance))}</div>}
                      {!isCredit && balance > 0 && <div className="text-emerald-500 font-semibold">Change: {formatCurrency(balance)}</div>}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Order Items
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">{invoiceItems.length} item{invoiceItems.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="border border-border rounded-xl overflow-hidden bg-card">
                {/* Table header */}
                <div className="grid grid-cols-12 px-4 py-2 bg-muted/40 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-3 text-right">Total</div>
                </div>
                <div className="divide-y divide-border/30">
                  {loadingItems ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs font-medium">Loading items…</span>
                    </div>
                  ) : invoiceItems.length === 0 ? (
                    <div className="py-6 flex items-center justify-center text-muted-foreground text-xs font-semibold">
                      No items found
                    </div>
                  ) : invoiceItems.map((item, i) => (
                    <div key={item.item_id} className={clsx('grid grid-cols-12 px-4 py-2.5 items-center text-xs transition-colors hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/[0.03]')}>
                      <div className="col-span-5 flex items-center gap-2 min-w-0">
                        <div className="p-1 rounded-md bg-muted/60 text-muted-foreground shrink-0">
                          <Package className="w-3 h-3" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-foreground truncate block">{item.name || 'Unknown'}</span>
                          {item.originalRate != null && Number(item.originalRate) !== Number(item.unit_price) && (
                            <span className="text-[9px] text-muted-foreground font-semibold block mt-0.5 truncate">
                              MRP {formatCurrency(Number(item.originalRate))} → {formatCurrency(Number(item.unit_price))}{item.discountLabel ? ` (${item.discountLabel})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-bold text-foreground/70">{item.quantity}</div>
                      <div className="col-span-2 text-right text-muted-foreground font-semibold">{formatCurrency(Number(item.unit_price))}</div>
                      <div className="col-span-3 text-right font-black text-foreground">{formatCurrency(Number(item.total))}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Totals */}
            {(() => {
              const scrapD = Number(selectedInvoice.scrap_deduction) || 0;
              const returnD = Number(selectedInvoice.return_deduction) || 0;
              const totalDeductions = scrapD + returnD;
              const sub = Number(selectedInvoice.subtotal) || 0;
              const tax = Number(selectedInvoice.tax_total) || 0;
              const disc = Number(selectedInvoice.discount_total) || 0;
              const ptsDisc = Number(selectedInvoice.points_redeemed_discount) || 0;
              const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);

              const refundAmount = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;
              const netPayable = Math.max(0, preDeductionTotal - totalDeductions);

              return (
                <div className="rounded-xl border border-primary/20 overflow-hidden bg-primary/[0.02]">
                  <div className="px-4 py-3 space-y-2 bg-card">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-semibold">Subtotal</span>
                      <span className="font-bold text-foreground">{formatCurrency(sub)}</span>
                    </div>
                    {tax > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-semibold">Tax (GST)</span>
                        <span className="font-bold text-foreground">{formatCurrency(tax)}</span>
                      </div>
                    )}
                    {disc > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-500 font-semibold">
                          Discount{selectedInvoice.discount_type === 'PERCENTAGE' && selectedInvoice.discount_value ? ` (${selectedInvoice.discount_value}%)` : ''}
                        </span>
                        <span className="text-rose-500 font-bold">-{formatCurrency(disc)}</span>
                      </div>
                    )}
                    {ptsDisc > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-500 font-semibold">Points Discount</span>
                        <span className="text-rose-500 font-bold">-{formatCurrency(ptsDisc)}</span>
                      </div>
                    )}
                    {scrapD > 0 && (
                      <div className="flex justify-between text-xs items-center">
                        <span className="text-orange-500 font-semibold">
                          Scrap Credit {selectedInvoice.scrap_invoice_number ? `(${selectedInvoice.scrap_invoice_number})` : ''}
                        </span>
                        <span className="text-orange-500 font-bold">-{formatCurrency(scrapD)}</span>
                      </div>
                    )}
                    {returnD > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-500 font-semibold">
                          Return Credit {selectedInvoice.return_invoice_number ? `(${selectedInvoice.return_invoice_number})` : ''}
                        </span>
                        <span className="text-rose-500 font-bold">-{formatCurrency(returnD)}</span>
                      </div>
                    )}
                  </div>
                  {refundAmount > 0 ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-t border-primary/10">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Pre-Deduction Total</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(preDeductionTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/20">
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Refund Amount</span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(refundAmount)}</span>
                      </div>
                    </>
                  ) : totalDeductions > 0 ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-t border-primary/10">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Pre-Deduction Total</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(preDeductionTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                        <span className="text-xs font-black text-primary uppercase tracking-widest">Grand Total</span>
                        <span className="text-lg font-black text-foreground">{formatCurrency(netPayable)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Grand Total</span>
                      <span className="text-lg font-black text-foreground">{formatCurrency(Number(selectedInvoice.grand_total))}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* ═══ Split Payment Modal ═══ */}
      <Modal
        isOpen={!!splitModalInvoice}
        onClose={() => setSplitModalInvoice(null)}
        title={
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal className="w-4 h-4 text-primary" />
            <span>Split Payment Settlement</span>
          </div>
        }
      >
        {splitModalInvoice && (() => {
          const net = splitModalNet;
          const c = parseFloat(splitCash.toString()) || 0;
          const cd = parseFloat(splitCard.toString()) || 0;
          const u = parseFloat(splitUpi.toString()) || 0;
          const b = parseFloat(splitBank.toString()) || 0;
          const totalEntered = Math.round((c + cd + u + b) * 100) / 100;
          const diff = Math.round((net - totalEntered) * 100) / 100;
          const isMatched = Math.abs(diff) < 0.01;
          const isExcess = diff < -0.01;
          const isShort = diff > 0.01;

          return (
            <div className="space-y-5">
              {/* Invoice & Net Summary Card */}
              <div className="p-4 rounded-2xl bg-muted/20 border border-border flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Invoice</span>
                  <span className="text-sm font-extrabold text-foreground">{splitModalInvoice.invoice_number}</span>
                  {splitModalInvoice.customer_name && (
                    <span className="text-xs text-muted-foreground block mt-0.5">{splitModalInvoice.customer_name}</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Net Payable</span>
                  <span className="text-xl font-black text-primary tabular-nums">{formatCurrency(net)}</span>
                </div>
              </div>

              {/* Input Breakdown Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Cash */}
                <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Cash
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const rem = Math.max(0, Math.round((net - (cd + u + b)) * 100) / 100);
                        setSplitCash(rem > 0 ? rem : '');
                      }}
                      className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Fill Rem.
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                    <input
                      type="number"
                      value={splitCash}
                      onChange={(e) => setSplitCash(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="0.00"
                      step="0.01" min="0"
                      className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                    />
                  </div>
                </div>

                {/* Card */}
                <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-500" /> Card
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const rem = Math.max(0, Math.round((net - (c + u + b)) * 100) / 100);
                        setSplitCard(rem > 0 ? rem : '');
                      }}
                      className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Fill Rem.
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                    <input
                      type="number"
                      value={splitCard}
                      onChange={(e) => setSplitCard(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="0.00"
                      step="0.01" min="0"
                      className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                    />
                  </div>
                </div>

                {/* UPI */}
                <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/10 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-violet-500" /> UPI
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const rem = Math.max(0, Math.round((net - (c + cd + b)) * 100) / 100);
                        setSplitUpi(rem > 0 ? rem : '');
                      }}
                      className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Fill Rem.
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                    <input
                      type="number"
                      value={splitUpi}
                      onChange={(e) => setSplitUpi(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="0.00"
                      step="0.01" min="0"
                      className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                    />
                  </div>
                </div>

                {/* Bank */}
                <div className="p-3 rounded-xl border border-border bg-card space-y-1.5 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-amber-500" /> Bank Transfer
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const rem = Math.max(0, Math.round((net - (c + cd + u)) * 100) / 100);
                        setSplitBank(rem > 0 ? rem : '');
                      }}
                      className="text-[9px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Fill Rem.
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                    <input
                      type="number"
                      value={splitBank}
                      onChange={(e) => setSplitBank(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="0.00"
                      step="0.01" min="0"
                      className="w-full pl-7 pr-3 py-1.5 text-sm font-extrabold bg-muted/20 border border-border rounded-lg outline-none text-foreground tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Balance Status Banner */}
              <div className={clsx(
                'p-3.5 rounded-xl border flex items-center justify-between transition-all',
                isMatched ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
                isShort   ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' :
                            'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
              )}>
                <div className="flex items-center gap-2">
                  {isMatched ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <div>
                    <p className="text-xs font-extrabold leading-tight">
                      {isMatched ? 'Split Balanced & Ready' : isShort ? 'Remaining Balance' : 'Amount Exceeds Net'}
                    </p>
                    <p className="text-[10px] opacity-80 font-medium mt-0.5">
                      {isMatched ? 'Total matches net payable' : isShort ? `Add ${formatCurrency(diff)} to match net` : `Over by ${formatCurrency(Math.abs(diff))}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Total Entered</span>
                  <span className="text-base font-black tabular-nums">{formatCurrency(totalEntered)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  disabled={!isMatched || totalEntered <= 0 || splitSubmitting}
                  onClick={async () => {
                    setSplitSubmitting(true);
                    const splitDetails = { cash: c, card: cd, upi: u, bank_transfer: b };
                    const r = await window.electronAPI!.dbCashierSettlePayment({
                      tenant_id: tenantId!,
                      invoice_id: splitModalInvoice.invoice_id,
                      received_amount: net,
                      payment_method: 'SPLIT',
                      split_details: splitDetails,
                      user_id: userId!,
                      user_name: userName || undefined,
                    });
                    setSplitSubmitting(false);
                    if (r.success) {
                      setSplitModalInvoice(null);
                      await load();
                    }
                  }}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-all cursor-pointer shadow-sm"
                >
                  {splitSubmitting ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Confirm Split Settlement
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

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
    </div>
  );
}

