import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Receipt, Search, Calendar, User, Tag, RefreshCw, Printer, Edit3, X,
  BookOpen, IndianRupee, Percent, TrendingUp,
  CheckCircle2, Package, BarChart3, CheckCheck, ChevronRight,
  SlidersHorizontal, Clock, Layers, Banknote, Wallet, Smartphone, AlertCircle, CreditCard,
  ArrowDownRight, ShieldAlert
} from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { Input } from './ui/Input';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, type ReceiptData } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { DateRangeFilter } from './ui/DateRangeFilter';

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

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

function groupByDay(invoices: any[]) {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    const day = new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    map.set(day, (map.get(day) || 0) + (inv.grand_total || 0));
  }
  return Array.from(map, ([date, sales]) => ({ date, sales }));
}

/* ─── Stat Card ─── */
function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
  bgClass,
  sub,
}: {
  icon: any;
  label: string;
  value: string;
  colorClass: string;
  bgClass: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/60 bg-card shadow-sm group hover:shadow-md transition-all duration-200 min-w-0">
      <div className={clsx('p-1.5 rounded-lg shrink-0', bgClass)}>
        <Icon className={clsx('w-3.5 h-3.5', colorClass)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-0.5">{label}</div>
        <div className="text-sm font-black text-foreground leading-none truncate">{value}</div>
        {sub && <div className="text-[9px] text-muted-foreground mt-0.5 font-medium leading-none">{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Payment Badge ─── */
function PaymentBadge({ method }: { method: string }) {
  const c = PAYMENT_COLORS[method] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: '#888' };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider', c.bg, c.text)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {PAYMENT_LABELS[method] || method}
    </span>
  );
}

/* ─── Invoice Row ─── */
function InvoiceRow({ inv, isSelected, onClick, selectionMode, isChecked, onCheck }: { inv: any; isSelected: boolean; onClick: () => void; selectionMode?: boolean; isChecked?: boolean; onCheck?: () => void }) {
  const { date, time } = formatDate(inv.created_at);
  const isPending = inv.payment_method === 'PENDING';
  const isCredit = inv.payment_method === 'CREDIT';

  return (
    <tr
      onClick={onClick}
      className={clsx(
        'group cursor-pointer transition-all duration-150 border-b border-border/40 last:border-0',
        isSelected
          ? 'bg-primary/5'
          : 'hover:bg-muted/30'
      )}
    >
      {/* Invoice # */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          {selectionMode && (
            <div onClick={(e) => { e.stopPropagation(); onCheck?.(); }} className="flex items-center justify-center cursor-pointer shrink-0">
              <input type="checkbox" checked={isChecked} readOnly
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                disabled={inv.invoice_type !== 'BILL_OF_SUPPLY'} />
            </div>
          )}
          <div className={clsx(
            'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all',
            isSelected ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
          )}>
            <Receipt className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-mono font-black text-foreground">{inv.invoice_number}</div>
            <div className={clsx('text-[10px] font-black uppercase', inv.sync_status === 'SYNCED' ? 'text-emerald-500' : 'text-amber-500')}>
              {inv.sync_status}
            </div>
          </div>
        </div>
      </td>
      {/* Date / Time */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="text-xs font-semibold text-foreground/80">{date}</div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="w-2.5 h-2.5" />{time}
        </div>
      </td>
      {/* Customer */}
      <td className="px-4 py-3.5">
        <div className="text-xs font-semibold text-foreground/80 truncate max-w-[120px]">{inv.customer_name || 'Walk-in'}</div>
        {inv.biller_name && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="w-2.5 h-2.5" />{inv.biller_name}
          </div>
        )}
      </td>
      {/* Payment */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <PaymentBadge method={inv.payment_method || 'PENDING'} />
        {isCredit && inv.balance_amount < 0 && (
          <div className="text-[10px] text-amber-500 font-semibold mt-0.5">
            Due: {formatCurrency(Math.abs(inv.balance_amount))}
          </div>
        )}
      </td>
      {/* Amount */}
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        <div className={clsx('text-sm font-black', isSelected ? 'text-primary' : 'text-foreground')}>
          {formatCurrency(inv.grand_total)}
        </div>
        {Number(inv.discount_total) > 0 && (
          <div className="text-[10px] text-red-500 font-semibold mt-0.5">
            -{formatCurrency(Number(inv.discount_total))} off
          </div>
        )}
      </td>
      {/* Arrow */}
      <td className="px-3 py-3.5 text-right">
        <ChevronRight className={clsx(
          'w-4 h-4 transition-all duration-200',
          isSelected ? 'text-primary translate-x-0.5' : 'text-border group-hover:text-muted-foreground group-hover:translate-x-0.5'
        )} />
      </td>
    </tr>
  );
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
export function SalesHistory({ onClose }: { onClose: () => void }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [reprintSuccess, setReprintSuccess] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | 'CREDIT'>('CASH');
  const [collectReceivedAmount, setCollectReceivedAmount] = useState(0);
  const [collectPaymentSaving, setCollectPaymentSaving] = useState(false);
  const [collectPaymentSuccess, setCollectPaymentSuccess] = useState(false);
  const LIMIT = 30;

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [conversionOpen, setConversionOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [conversionResults, setConversionResults] = useState<{ invoice_id: string; old_number: string; new_number: string; success: boolean; error?: string; skipped_items?: string[] }[] | null>(null);

  const selectedBosInvoices = useMemo(() =>
    invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY' && selectedInvoiceIds.has(i.invoice_id)),
    [invoices, selectedInvoiceIds]
  );

  const COLLECT_PAYMENT_OPTIONS = [
    { value: 'CASH' as const, label: 'Cash', icon: Banknote, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500', iconBg: 'bg-emerald-500/15' },
    { value: 'CARD' as const, label: 'Card', icon: Wallet, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500', iconBg: 'bg-blue-500/15' },
    { value: 'UPI' as const, label: 'UPI', icon: Smartphone, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500', iconBg: 'bg-violet-500/15' },
    { value: 'CREDIT' as const, label: 'Credit', icon: BookOpen, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500', iconBg: 'bg-amber-500/15' },
  ];

  useEffect(() => {
    const timeout = setTimeout(() => {
      setOffset(0);
      setHasMore(true);
      loadInvoices(true);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, paymentFilter, filterDate, filterDateEnd]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onSyncDataUpdated(() => {
        loadInvoices(true);
      });
    }
  }, []);

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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  useEffect(() => {
    if (!reprintSuccess) return;
    const t = setTimeout(() => setReprintSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [reprintSuccess]);

  const loadInvoices = async (reset = false) => {
    setIsFetching(true);
    if (window.electronAPI) {
      const { userId, role, tenantId } = useAuthStore.getState();
      const currentOffset = reset ? 0 : offset;
      const data = await window.electronAPI.dbGetInvoices({
        user_id: userId, tenant_id: tenantId, role,
        limit: LIMIT, offset: currentOffset,
        search, payment_method: paymentFilter || undefined,
        filterDate: filterDate || undefined, filterDateEnd: filterDateEnd || undefined,
      });
      if (Array.isArray(data)) {
        if (reset) { setInvoices(data); }
        else {
          setInvoices(prev => {
            const existingIds = new Set(prev.map(i => i.invoice_id));
            return [...prev, ...data.filter(i => !existingIds.has(i.invoice_id))];
          });
        }
        setOffset(currentOffset + data.length);
        setHasMore(data.length === LIMIT);
      }
      setLoading(false);
      setIsFetching(false);
    }
  };

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLTableRowElement | null) => {
    if (isFetching || !hasMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadInvoices(false);
    }, { threshold: 1.0 });
    if (node) observer.current.observe(node);
  }, [isFetching, hasMore, offset]);

  const handleSelectInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    setDrawerOpen(true);
    if (window.electronAPI) {
      const data = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
      setItems(Array.isArray(data) ? data : []);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => { setSelectedInvoice(null); setItems([]); }, 300);
  };

  const summary = {
    totalSales: invoices.reduce((s, i) => s + (i.grand_total || 0), 0),
    totalInvoices: invoices.length,
    totalTax: invoices.reduce((s, i) => s + (i.tax_total || 0), 0),
    totalDiscount: invoices.reduce((s, i) => s + (i.discount_total || 0), 0),
    avgOrder: invoices.length > 0 ? invoices.reduce((s, i) => s + (i.grand_total || 0), 0) / invoices.length : 0,
  };

  const dailySales = useMemo(() => groupByDay(invoices), [invoices]);



  /* ── Reprint handler ── */
  const handleReprint = async () => {
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
        date: new Date(selectedInvoice.created_at).toLocaleString(),
        billerName: selectedInvoice.biller_name,
        items: items.map(item => ({ name: item.name, quantity: Number(item.quantity) || 0, unit_price: item.unit_price, total: item.total })),
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
    } catch (err) {
      console.error('Failed to reprint', err);
    }
  };

  const handleEditBill = async () => {
    if (!window.electronAPI || !selectedInvoice) return;
    let currentItems = items;
    if (!currentItems.length) {
      const data = await window.electronAPI.dbGetInvoiceItems(selectedInvoice.invoice_id);
      currentItems = Array.isArray(data) ? data : [];
    }
    if (!currentItems.length) return;
    localStorage.setItem('editBillData', JSON.stringify({ invoice: selectedInvoice, items: currentItems, originalRole: useAuthStore.getState().role }));
    onClose();
    if (useAuthStore.getState().role === 'OWNER') useCartStore.getState().setRole('BILLER');
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 100);
  };

  const openCollectPayment = () => {
    if (!selectedInvoice) return;
    setCollectPaymentMethod('CASH');
    setCollectReceivedAmount(Number(selectedInvoice.grand_total) || 0);
    setCollectPaymentOpen(true);
    setCollectPaymentSuccess(false);
  };

  const handleCollectPayment = async () => {
    if (!window.electronAPI || !selectedInvoice) return;
    setCollectPaymentSaving(true);
    try {
      const { tenantId } = useAuthStore.getState();
      const grandTotal = Number(selectedInvoice.grand_total) || 0;
      const balanceAmount = collectPaymentMethod === 'CREDIT' ? collectReceivedAmount - grandTotal : collectReceivedAmount - grandTotal;

      const result = await window.electronAPI.dbUpdateInvoicePayment({
        invoice_id: selectedInvoice.invoice_id,
        tenant_id: tenantId || 'global',
        payment_method: collectPaymentMethod,
        received_amount: collectReceivedAmount,
        balance_amount: balanceAmount,
      });

      if (result.success) {
        setCollectPaymentSuccess(true);
        // Refresh the selected invoice to show updated payment
        setSelectedInvoice({
          ...selectedInvoice,
          payment_method: collectPaymentMethod,
          received_amount: collectReceivedAmount,
          balance_amount: balanceAmount,
        });
        // Refresh the full list
        loadInvoices(true);
        setTimeout(() => {
          setCollectPaymentOpen(false);
          setCollectPaymentSuccess(false);
        }, 1500);
      } else {
        alert('Failed to update payment: ' + result.error);
      }
    } catch (err) {
      console.error('Failed to collect payment', err);
      alert('Failed to update payment');
    } finally {
      setCollectPaymentSaving(false);
    }
  };

  /* ════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ─── TOAST ─── */}
      {reprintSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 bg-emerald-500/10 backdrop-blur-sm border border-emerald-500/25 rounded-2xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold shadow-2xl" style={{ animation: 'slideDown 0.25s ease' }}>
          <CheckCheck className="w-4 h-4 shrink-0" />
          Invoice reprinted successfully!
        </div>
      )}

      {/* ─── HEADER ─── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0 gap-4 z-30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div>
            <h1 className="text-sm font-black text-foreground tracking-tight">Sales History</h1>
            <p className="text-[10px] text-muted-foreground font-semibold mt-px">Billing records &amp; analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range */}
          <DateRangeFilter
            startDate={filterDate}
            endDate={filterDateEnd}
            onChange={(start, end) => { setFilterDate(start); setFilterDateEnd(end); }}
          />
           <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
            title="Close"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ LEFT: Stats + Table (full or narrowed) ══ */}
        <div className={clsx('flex flex-col flex-1 overflow-hidden transition-all duration-300 ease-in-out', drawerOpen ? 'w-[55%]' : 'w-full')}>

          {/* Stats & Graph Side-by-Side Container */}
          <div className="px-3 py-2.5 border-b border-border/60 bg-background shrink-0">
            <div className="flex gap-3 items-stretch">
              
              {/* Left Side: Stats cards (2x2 grid) */}
              <div className={clsx(
                'grid grid-cols-2 gap-2 shrink-0 transition-all duration-300',
                drawerOpen ? 'w-full' : 'w-[45%]'
              )}>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/60 bg-card">
                      <Skeleton className="h-6 w-6 rounded-lg shrink-0" />
                      <div className="space-y-1 flex-1">
                        <Skeleton className="h-2 w-10" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    <StatCard icon={IndianRupee} label="Total Revenue" value={formatCurrency(summary.totalSales)} colorClass="text-emerald-500" bgClass="bg-emerald-500/10" sub={`${summary.totalInvoices} invoice${summary.totalInvoices !== 1 ? 's' : ''}`} />
                    <StatCard icon={TrendingUp} label="Avg Order Value" value={formatCurrency(summary.avgOrder)} colorClass="text-blue-500" bgClass="bg-blue-500/10" />
                    <StatCard icon={Percent} label="Total Tax" value={formatCurrency(summary.totalTax)} colorClass="text-violet-500" bgClass="bg-violet-500/10" />
                    {summary.totalDiscount > 0
                      ? <StatCard icon={Tag} label="Discounts Given" value={formatCurrency(summary.totalDiscount)} colorClass="text-rose-500" bgClass="bg-rose-500/10" sub="Total savings" />
                      : <StatCard icon={Layers} label="Invoices" value={String(summary.totalInvoices)} colorClass="text-amber-500" bgClass="bg-amber-500/10" sub="All time" />
                    }
                  </>
                )}
              </div>

              {/* Right Side: Graph / Chart (hides when drawer is open) */}
              {!drawerOpen && !loading && invoices.length > 1 && (
                <div className="flex-1 bg-card rounded-xl border border-border/60 p-2 flex flex-col justify-between overflow-hidden">
                  {/* Chart header inside block */}
                  <div className="flex items-center justify-between px-2 pb-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Daily Revenue Trend</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-semibold">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 inline-block" />
                        Revenue
                      </span>
                      <span className="bg-muted/60 border border-border/60 px-1 py-px rounded text-[8px] font-bold text-foreground/70">
                        {dailySales.length}d
                      </span>
                    </div>
                  </div>
                  {/* Chart body */}
                  <div className="flex-1 min-h-[75px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailySales} margin={{ top: 2, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"  stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                          axisLine={false} tickLine={false} dy={2}
                        />
                        <YAxis
                          tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                          axisLine={false} tickLine={false} width={45}
                          tickFormatter={(v: number) =>
                            v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 8, fontSize: 10, fontWeight: 700,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            padding: '4px 8px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 800, marginBottom: 1 }}
                          itemStyle={{ color: 'hsl(var(--primary))' }}
                          formatter={(v: number) => [formatCurrency(Number(v)), 'Revenue']}
                          cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area
                          type="monotone" dataKey="sales"
                          stroke="hsl(var(--primary))" strokeWidth={1.5}
                          fill="url(#salesGrad)"
                          dot={{ r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                          activeDot={{ r: 3.5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 1.5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Search + Filters */}
          <div className="px-4 py-3 flex items-center gap-3 shrink-0 border-b border-border/40 bg-card">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search invoice or customer…"
                className="pl-9 h-8 text-xs bg-background border-border/80 font-medium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {[
                { value: '', label: 'All' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'CASH', label: 'Cash' },
                { value: 'CARD', label: 'Card' },
                { value: 'UPI', label: 'UPI' },
                { value: 'CREDIT', label: 'Credit' },
              ].map(opt => {
                const c = opt.value ? PAYMENT_COLORS[opt.value] : null;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setPaymentFilter(opt.value)}
                    className={clsx(
                      'h-7 px-3 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-150 cursor-pointer border',
                      paymentFilter === opt.value
                        ? (c ? `${c.bg} ${c.text} border-current/30` : 'bg-primary text-primary-foreground border-primary/30')
                        : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto text-[10px] text-muted-foreground font-semibold shrink-0">
              {loading ? '…' : `${invoices.length} record${invoices.length !== 1 ? 's' : ''}`}
            </div>
            {useAuthStore.getState().role === 'OWNER' && (
              <button
                onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) { setSelectedInvoiceIds(new Set()); } }}
                className={clsx(
                  'h-7 px-3 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-150 cursor-pointer border',
                  selectionMode
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                    : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground'
                )}
              >
                <ShieldAlert className="w-3 h-3 inline -mt-0.5 mr-1" />
                {selectionMode ? 'Cancel' : 'Convert to GST'}
              </button>
            )}
          </div>

          {/* Conversion Selection Toolbar */}
          {selectionMode && (
            <div className="px-4 py-2.5 flex items-center gap-3 shrink-0 bg-amber-500/5 border-b border-amber-500/20">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                {selectedBosInvoices.length} Bill of Supply invoice{selectedBosInvoices.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => {
                  const allBosIds = invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY').map(i => i.invoice_id);
                  if (allBosIds.every(id => selectedInvoiceIds.has(id))) {
                    setSelectedInvoiceIds(new Set());
                  } else {
                    setSelectedInvoiceIds(new Set(allBosIds));
                  }
                }}
                className="text-[11px] font-extrabold text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
              >
                {invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY').every(i => selectedInvoiceIds.has(i.invoice_id))
                  ? 'Deselect All'
                  : `Select All (${invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY').length})`}
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => { setConversionOpen(true); setConversionResults(null); }}
                  disabled={selectedBosInvoices.length === 0 || converting}
                  className={clsx(
                    'h-7 px-4 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-150 cursor-pointer border flex items-center gap-1.5',
                    selectedBosInvoices.length > 0
                      ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 active:scale-95'
                      : 'bg-muted/50 text-muted-foreground border-border/50 cursor-not-allowed'
                  )}
                >
                  <ArrowDownRight className="w-3 h-3" />
                  Convert{selectedBosInvoices.length > 0 ? ` (${selectedBosInvoices.length})` : ''}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <table className="w-full">
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
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
                <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center">
                  <Receipt className="w-7 h-7 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground/60">No records found</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your search or filters</p>
                </div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm border-b border-border/60">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invoice</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date &amp; Time</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <InvoiceRow
                      key={inv.invoice_id}
                      inv={inv}
                      isSelected={selectedInvoice?.invoice_id === inv.invoice_id}
                      onClick={() => { if (!selectionMode) handleSelectInvoice(inv); }}
                      selectionMode={selectionMode}
                      isChecked={selectedInvoiceIds.has(inv.invoice_id)}
                      onCheck={() => {
                        if (inv.invoice_type !== 'BILL_OF_SUPPLY') return;
                        setSelectedInvoiceIds(prev => {
                          const next = new Set(prev);
                          if (next.has(inv.invoice_id)) next.delete(inv.invoice_id);
                          else next.add(inv.invoice_id);
                          return next;
                        });
                      }}
                    />
                  ))}
                  {hasMore && (
                    <tr ref={lastElementRef}>
                      <td colSpan={6} className="py-4 text-center">
                        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>


        </div>

        {/* ══ RIGHT: Invoice Detail Drawer ══ */}
        <div className={clsx(
          'flex flex-col bg-card border-l border-border/70 overflow-hidden transition-all duration-300 ease-in-out shrink-0',
          drawerOpen ? 'w-[45%] opacity-100' : 'w-0 opacity-0 pointer-events-none'
        )}>
          {selectedInvoice && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-border/60 shrink-0 bg-gradient-to-r from-card to-muted/20">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-black text-foreground">{selectedInvoice.invoice_number}</h2>
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border',
                        selectedInvoice.sync_status === 'SYNCED'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      )}>
                        {selectedInvoice.sync_status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                        {selectedInvoice.invoice_type === 'GST' ? 'GST' : 'Bill of Supply'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(selectedInvoice.created_at).date}
                        <span className="opacity-60">at</span>
                        {formatDate(selectedInvoice.created_at).time}
                      </span>
                      {selectedInvoice.biller_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {selectedInvoice.biller_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  {selectedInvoice.payment_method === 'PENDING' && (
                    <button onClick={openCollectPayment}
                      className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-all text-xs font-bold border border-emerald-500/20 cursor-pointer active:scale-95"
                    >
                      <CreditCard className="w-3.5 h-3.5" />Collect Payment
                    </button>
                  )}
                  {useAuthStore.getState().role === 'OWNER' && (
                    <button onClick={handleEditBill}
                      className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-all text-xs font-bold border border-amber-500/20 cursor-pointer active:scale-95"
                    >
                       <Edit3 className="w-3.5 h-3.5" />Edit Bill
                    </button>
                  )}
                  <button onClick={handleReprint}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-xs font-bold border border-primary/20 cursor-pointer active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5" />Reprint
                  </button>
                </div>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Customer + Payment */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl border border-border/60 bg-background space-y-1.5">
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
                  <div className="p-3.5 rounded-xl border border-border/60 bg-background space-y-1.5">
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
                    <span className="text-[10px] text-muted-foreground font-semibold">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="border border-border/60 rounded-xl overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-12 px-3 py-2 bg-muted/40 border-b border-border/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <div className="col-span-5">Item</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-2 text-right">Rate</div>
                      <div className="col-span-3 text-right">Total</div>
                    </div>
                    <div className="divide-y divide-border/30">
                      {items.length === 0 ? (
                        <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span className="text-xs font-medium">Loading items…</span>
                        </div>
                      ) : items.map((item, i) => (
                        <div key={item.item_id} className={clsx('grid grid-cols-12 px-3 py-2.5 items-center text-xs transition-colors hover:bg-muted/20', i % 2 !== 0 && 'bg-muted/[0.03]')}>
                          <div className="col-span-5 flex items-center gap-2 min-w-0">
                            <div className="p-1 rounded-md bg-muted/60 text-muted-foreground shrink-0">
                              <Package className="w-3 h-3" />
                            </div>
                            <span className="font-bold text-foreground truncate">{item.name || 'Unknown'}</span>
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
                <div className="rounded-xl border border-primary/20 overflow-hidden bg-primary/[0.02]">
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-semibold">Subtotal</span>
                      <span className="font-bold text-foreground">{formatCurrency(Number(selectedInvoice.subtotal))}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-semibold">Tax (GST)</span>
                      <span className="font-bold text-foreground">{formatCurrency(Number(selectedInvoice.tax_total))}</span>
                    </div>
                    {Number(selectedInvoice.discount_total) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-500 font-semibold">
                          Discount{selectedInvoice.discount_type === 'PERCENTAGE' && selectedInvoice.discount_value ? ` (${selectedInvoice.discount_value}%)` : ''}
                        </span>
                        <span className="text-rose-500 font-bold">-{formatCurrency(Number(selectedInvoice.discount_total))}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                    <span className="text-xs font-black text-primary uppercase tracking-widest">Grand Total</span>
                    <span className="text-lg font-black text-foreground">{formatCurrency(Number(selectedInvoice.grand_total))}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Collect Payment Modal ─── */}
      <Modal
        isOpen={collectPaymentOpen}
        onClose={() => setCollectPaymentOpen(false)}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <CreditCard className="w-5 h-5 text-emerald-500" />
            <span>Collect Payment</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[420px] text-foreground">
          {selectedInvoice && (
            <>
              <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Invoice</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{selectedInvoice.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Grand Total</p>
                  <p className="text-xl font-black text-primary mt-0.5">{formatCurrency(Number(selectedInvoice.grand_total) || 0)}</p>
                </div>
              </div>

              {/* Payment method selection */}
              <div>
                <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-2">Payment Method</p>
                <div className="grid grid-cols-2 gap-2">
                  {COLLECT_PAYMENT_OPTIONS.map(opt => {
                    const isActive = collectPaymentMethod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setCollectPaymentMethod(opt.value);
                          if (opt.value === 'CARD' || opt.value === 'UPI') {
                            setCollectReceivedAmount(Number(selectedInvoice.grand_total) || 0);
                          }
                        }}
                        className={clsx(
                          'flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer',
                          isActive
                            ? `${opt.bg} ${opt.border} ${opt.color} shadow-sm`
                            : 'border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                        )}
                      >
                        <div className={clsx(
                          'p-2 rounded-xl transition-colors',
                          isActive ? opt.iconBg : 'bg-muted'
                        )}>
                          <opt.icon className="w-4.5 h-4.5" />
                        </div>
                        <span className="text-xs font-extrabold">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Received amount — shown for CASH and CREDIT */}
              {(collectPaymentMethod === 'CASH' || collectPaymentMethod === 'CREDIT') && (
                <div>
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">
                    {collectPaymentMethod === 'CREDIT' ? 'Amount Paid' : 'Amount Received'}
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-muted-foreground/60">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={collectReceivedAmount || ''}
                      onChange={e => setCollectReceivedAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-full pl-8 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm font-black text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="Enter amount received"
                    />
                  </div>
                  {collectReceivedAmount > 0 && (
                    <div className={clsx(
                      'mt-1.5 text-xs font-bold text-right',
                      collectReceivedAmount >= (Number(selectedInvoice.grand_total) || 0)
                        ? 'text-emerald-500'
                        : 'text-amber-500'
                    )}>
                      {collectPaymentMethod === 'CREDIT' ? 'Balance Due' : 'Change'}: {formatCurrency(Math.abs(collectReceivedAmount - (Number(selectedInvoice.grand_total) || 0)))}
                    </div>
                  )}
                </div>
              )}

              {/* Exact payment notice for CARD/UPI */}
              {(collectPaymentMethod === 'CARD' || collectPaymentMethod === 'UPI') && (
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Payment will be recorded as exact amount of {formatCurrency(Number(selectedInvoice.grand_total) || 0)}
                </div>
              )}

              {/* CREDIT requires customer info */}
              {collectPaymentMethod === 'CREDIT' && !selectedInvoice.customer_name && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Customer info was not collected during billing. Credit may not be fully tracked.
                </div>
              )}

              {collectPaymentSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl text-center text-xs font-bold animate-in fade-in">
                  <CheckCheck className="w-4 h-4 inline mr-1.5" />
                  Payment recorded successfully!
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  onClick={() => setCollectPaymentOpen(false)}
                  className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border/80 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCollectPayment}
                  disabled={collectPaymentSaving || collectPaymentSuccess}
                  className="px-5 py-2.5 text-sm font-black bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                >
                  {collectPaymentSaving ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </span>
                  ) : 'Confirm Payment'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ─── Convert Bill of Supply → GST Modal ─── */}
      <Modal
        isOpen={conversionOpen}
        onClose={() => { if (!converting) { setConversionOpen(false); } }}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <ArrowDownRight className="w-5 h-5 text-amber-500" />
            <span>Convert to GST Invoice</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[480px] text-foreground">
          {conversionResults ? (
            <>
              <div className={clsx(
                'p-4 rounded-2xl border flex items-start gap-3',
                conversionResults.every(r => r.success)
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-amber-500/5 border-amber-500/20'
              )}>
                {conversionResults.every(r => r.success)
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                }
                <div>
                  <p className="text-sm font-bold">
                    {conversionResults.filter(r => r.success).length} of {conversionResults.length} invoice{conversionResults.length !== 1 ? 's' : ''} converted successfully
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {conversionResults.filter(r => r.success).map(r => `${r.old_number} → ${r.new_number}`).join(', ')}
                  </p>
                </div>
              </div>

              {conversionResults.some(r => !r.success) && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Failed conversions</p>
                  {conversionResults.filter(r => !r.success).map(r => (
                    <div key={r.invoice_id} className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-xs">
                      <span className="font-bold text-red-500">Invoice {r.old_number || r.invoice_id}:</span> {r.error}
                    </div>
                  ))}
                </div>
              )}

              {conversionResults.filter(r => r.success && r.skipped_items?.length).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Items skipped (no GST purchase record)</p>
                  {conversionResults.filter(r => r.success && r.skipped_items?.length).map(r => (
                    <div key={r.invoice_id} className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs space-y-1">
                      <p className="font-bold text-amber-600 dark:text-amber-400">{r.old_number} → {r.new_number}</p>
                      <p className="text-muted-foreground">{r.skipped_items!.join(', ')}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  onClick={() => {
                    setConversionOpen(false);
                    setConversionResults(null);
                    setSelectedInvoiceIds(new Set());
                    setSelectionMode(false);
                    loadInvoices(true);
                  }}
                  className="px-5 py-2.5 text-sm font-black bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                <p className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Confirm Conversion
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  You are about to convert <strong>{selectedBosInvoices.length}</strong> Bill of Supply invoice{selectedBosInvoices.length !== 1 ? 's' : ''} 
                  to GST Invoice{selectedBosInvoices.length !== 1 ? 's' : ''}. 
                  The sale prices will be recalculated using the configured profit percentage. 
                  GST will be applied, and new GST invoice numbers will be assigned.
                </p>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                {selectedBosInvoices.map(inv => (
                  <div key={inv.invoice_id} className="flex items-center justify-between p-2.5 bg-card border border-border/60 rounded-xl text-xs">
                    <span className="font-bold text-foreground">{inv.invoice_number}</span>
                    <span className="text-muted-foreground">{formatCurrency(inv.grand_total)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  onClick={() => setConversionOpen(false)}
                  disabled={converting}
                  className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border/80 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setConverting(true);
                    try {
                      const { tenantId, userId } = useAuthStore.getState();
                      if (window.electronAPI) {
                        const result = await window.electronAPI.dbConvertBosToGst({
                          invoice_ids: selectedBosInvoices.map(i => i.invoice_id),
                          tenant_id: tenantId || 'global',
                          user_id: userId || '',
                        });
                        if (result.success && result.results) {
                          setConversionResults(result.results);
                        } else {
                          setConversionResults(selectedBosInvoices.map(i => ({
                            invoice_id: i.invoice_id,
                            old_number: i.invoice_number,
                            new_number: '',
                            success: false,
                            error: result.error || 'Conversion failed',
                          })));
                        }
                      }
                    } catch (err: any) {
                      setConversionResults(selectedBosInvoices.map(i => ({
                        invoice_id: i.invoice_id,
                        old_number: i.invoice_number,
                        new_number: '',
                        success: false,
                        error: err?.message || 'Unknown error',
                      })));
                    } finally {
                      setConverting(false);
                      loadInvoices(true);
                    }
                  }}
                  disabled={converting}
                  className="px-5 py-2.5 text-sm font-black bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
                >
                  {converting ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Converting...</>
                  ) : (
                    <><ArrowDownRight className="w-3.5 h-3.5" /> Convert to GST</>
                  )}
                </button>
              </div>
            </>
          )}
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
