import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import {
  Receipt, Search, Calendar, User, Tag, RefreshCw, Printer, Edit3, Trash2, X,
  BookOpen, IndianRupee, TrendingUp,
  CheckCircle2, Package, BarChart3, CheckCheck, ChevronRight,
  SlidersHorizontal, Clock, Layers, Banknote, Wallet, Smartphone, AlertCircle, CreditCard,
  ArrowDownRight, ShieldAlert, Building, FileText, Download, Percent
} from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData, getAppTimeFormat, parseUTCDate } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
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

const TAX_RATES = [
  { value: '', label: 'All GST %' },
  { value: '0', label: '0%' },
  { value: '3', label: '3%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  const d = parseUTCDate(dateStr);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' }),
  };
}

function formatGroupDate(dateStr?: string) {
  if (!dateStr) return '-';
  const d = parseUTCDate(dateStr);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const dayName = d.toLocaleDateString('en-IN', { weekday: 'long' });
  return `${dd}/${mm}/${yyyy} ${dayName}`;
}

function groupByDay(invoices: any[]) {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    const day = parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
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
  const gradMap: Record<string, string> = {
    'text-emerald-500': 'from-emerald-500/10 to-emerald-500/5',
    'text-blue-500': 'from-blue-500/10 to-blue-500/5',
    'text-violet-500': 'from-violet-500/10 to-violet-500/5',
    'text-rose-500': 'from-rose-500/10 to-rose-500/5',
    'text-amber-500': 'from-amber-500/10 to-amber-500/5',
  };
  const gradient = gradMap[colorClass] || 'from-primary/10 to-primary/5';

  return (
    <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none min-w-0 flex-1">
      <div className={clsx('p-3 rounded-xl shrink-0 shadow-inner bg-gradient-to-br', gradient)}>
        <Icon className={clsx('w-5 h-5', colorClass)} />
      </div>
      <div className="leading-tight text-left min-w-0 flex-1">
        <p className="text-xl font-black text-foreground font-mono truncate">{value}</p>
        <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">{label}</p>
        {sub && <p className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
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

/* ─── Invoice Type Badge ─── */
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

/* ─── Invoice Row ─── */
function InvoiceRow({ inv, isSelected, onClick, selectionMode, isChecked, onCheck, convertible }: { inv: any; isSelected: boolean; onClick: () => void; selectionMode?: boolean; isChecked?: boolean; onCheck?: () => void; convertible?: boolean }) {
  const { date, time } = formatDate(inv.created_at);
  const _isPending = inv.payment_method === 'PENDING';
  const isCredit = inv.payment_method === 'CREDIT';
  const isConvertedBos = !!inv.converted_to_invoice_id;
  const isConversionCopy = !!inv.converted_from_invoice_id;
  const canConvert = inv.invoice_type === 'BILL_OF_SUPPLY' && !isConvertedBos && !!convertible;

  return (
    <tr
      onClick={onClick}
      className={clsx(
        'group cursor-pointer transition-all duration-150 border-b border-border last:border-0',
        isSelected
          ? 'bg-primary/5'
          : 'hover:bg-muted/30',
        isConvertedBos && 'opacity-55'
      )}
    >
      {/* Invoice # */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          {selectionMode && canConvert && (
            <div onClick={(e) => { e.stopPropagation(); onCheck?.(); }} className="flex items-center justify-center cursor-pointer shrink-0">
              <input type="checkbox" checked={isChecked} readOnly
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                disabled={inv.invoice_type !== 'BILL_OF_SUPPLY' || isConvertedBos} />
            </div>
          )}
          {selectionMode && inv.invoice_type === 'BILL_OF_SUPPLY' && !canConvert && (
            <div title="No GST purchase records — cannot be converted" className="flex items-center justify-center w-4 shrink-0 text-muted-foreground/40">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
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
            {isConvertedBos && (
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-600 dark:text-amber-400 mt-0.5">
                <ArrowDownRight className="w-2.5 h-2.5" /> Converted → {inv.converted_to_invoice_number}
              </div>
            )}
            {isConversionCopy && (
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-[9px] font-black text-violet-600 dark:text-violet-400 mt-0.5">
                <ArrowDownRight className="w-2.5 h-2.5" /> From {inv.converted_from_invoice_number}
              </div>
            )}
            <div className={clsx('text-[10px] font-black uppercase', inv.sync_status === 'SYNCED' ? 'text-emerald-500' : 'text-amber-500')}>
              {inv.sync_status}
            </div>
          </div>
        </div>
      </td>
      {/* Type */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <InvoiceTypeBadge inv={inv} />
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
        {(() => {
          const scrapD = Number(inv.scrap_deduction) || 0;
          const returnD = Number(inv.return_deduction) || 0;
          const totalDeductions = scrapD + returnD;
          const sub = Number(inv.subtotal) || 0;
          const tax = Number(inv.tax_total) || 0;
          const disc = Number(inv.discount_total) || 0;
          const ptsDisc = Number(inv.points_redeemed_discount) || 0;
          const preDeductionTotal = Math.max(0, sub + tax - disc - ptsDisc);
          const refundAmount = totalDeductions > preDeductionTotal ? totalDeductions - preDeductionTotal : 0;

          if (inv.invoice_type !== 'SCRAP' && refundAmount > 0) {
            return (
              <>
                <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  -{formatCurrency(refundAmount)}
                </div>
                <div className="text-[10px] text-emerald-500 font-semibold mt-0.5">
                  Refund
                </div>
              </>
            );
          }

          return (
            <>
              <div className={clsx('text-sm font-black', isSelected ? 'text-primary' : 'text-foreground')}>
                {formatCurrency(inv.grand_total)}
              </div>
              {Number(inv.discount_total) > 0 && (
                <div className="text-[10px] text-red-500 font-semibold mt-0.5">
                  -{formatCurrency(Number(inv.discount_total))} off
                </div>
              )}
            </>
          );
        })()}
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
export function SalesHistory({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [canReturn, setCanReturn] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'bills' | 'analytics'>('bills');
  const [showGraphBanner, setShowGraphBanner] = useState(false);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('');
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [taxPercentageFilter, setTaxPercentageFilter] = useState('');
  const [reprintSuccess, setReprintSuccess] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | 'CREDIT'>('CASH');
  const [collectReceivedAmount, setCollectReceivedAmount] = useState(0);
  const [collectPaymentSaving, setCollectPaymentSaving] = useState(false);
  const [collectPaymentSuccess, setCollectPaymentSuccess] = useState(false);
  const LIMIT = 30;
  const [dbSummary, setDbSummary] = useState<{ totalSales: number; totalInvoices: number; totalTax: number; totalDiscount: number; avgOrder: number } | null>(null);

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
  const [isResyncing, setIsResyncing] = useState(false);

  const handleForceResync = async () => {
    if (!window.electronAPI) return;
    setIsResyncing(true);
    try {
      showToast('Re-syncing all cloud invoices...', 'success');
      await window.electronAPI.forceResyncInvoices();
      await loadInvoices(true);
      showToast('Invoices re-synced from cloud successfully!', 'success');
    } catch (err: any) {
      console.error('[SalesHistory] Force resync error:', err);
      showToast('Re-sync failed: ' + (err?.message || 'Error'), 'error');
    } finally {
      setIsResyncing(false);
    }
  };

  const selectedBosInvoices = useMemo(() =>
    invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY' && !i.converted_to_invoice_id && convertibleMap[i.invoice_id] && selectedInvoiceIds.has(i.invoice_id)),
    [invoices, selectedInvoiceIds, convertibleMap]
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
  }, [search, paymentFilter, invoiceTypeFilter, filterDate, filterDateEnd]);

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
    if (!selectionMode || !window.electronAPI) return;
    let cancelled = false;
    const { tenantId } = useAuthStore.getState();
    window.electronAPI.dbGetBosConvertibleInvoices(tenantId || 'global')
      .then(res => {
        if (cancelled || !Array.isArray(res)) return;
        const map: Record<string, boolean> = {};
        res.forEach(r => { map[r.invoice_id] = !!r.convertible; });
        setConvertibleMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectionMode]);

  const loadInvoices = async (reset = false) => {
    setIsFetching(true);
    if (window.electronAPI) {
      const { userId, role, tenantId } = useAuthStore.getState();
      const currentOffset = reset ? 0 : offset;
      
      try {
        const filters = {
          user_id: userId, tenant_id: tenantId, role,
          search, payment_method: paymentFilter || undefined,
          invoice_type: invoiceTypeFilter || undefined,
          filterDate: filterDate || undefined, filterDateEnd: filterDateEnd || undefined,
        };

        const promises: Promise<any>[] = [
          window.electronAPI.dbGetInvoices({ ...filters, limit: LIMIT, offset: currentOffset })
        ];
        if (reset && window.electronAPI.dbGetInvoicesSummary) {
          promises.push(window.electronAPI.dbGetInvoicesSummary(filters));
        }

        const [data, summaryRes] = await Promise.all(promises);

        if (reset && summaryRes && typeof summaryRes === 'object' && !('error' in summaryRes)) {
          setDbSummary(summaryRes);
        }

        if (Array.isArray(data)) {
          if (reset) {
            setInvoices(data);
          }
          else {
            setInvoices(prev => {
              const existingIds = new Set(prev.map(i => i.invoice_id));
              const newItems = data.filter(i => !existingIds.has(i.invoice_id));
              return [...prev, ...newItems];
            });
          }
          setOffset(currentOffset + data.length);
          setHasMore(data.length === LIMIT);
        } else if (data && typeof data === 'object' && 'error' in data) {
          console.error('[SalesHistory] dbGetInvoices returned an error object:', data);
        } else {
          console.warn('[SalesHistory] Unexpected response from dbGetInvoices:', data);
        }
      } catch (err: any) {
        console.error('[SalesHistory] Exception while calling dbGetInvoices:', err);
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    } else {
      console.warn('[SalesHistory] window.electronAPI is missing - unable to query local database.');
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
      let pcsPerKg: number | undefined;
      if (p?.domain_attributes) {
        try {
          const attrs = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
          if (attrs?.pcs_per_kg) pcsPerKg = Number(attrs.pcs_per_kg);
        } catch {}
      }
      return {
        ...item,
        originalRate,
        discountLabel,
        brand_manufacturer: p?.brand_manufacturer || item.brand_manufacturer || undefined,
        billing_type: p?.billing_type || item.billing_type || undefined,
        pieces_per_kg: pcsPerKg,
        unit: p?.uom || item.unit || undefined,
      };
    });
  };

  const handleSelectInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    setDrawerOpen(true);
    if (window.electronAPI) {
      const [data, returned] = await Promise.all([
        window.electronAPI.dbGetInvoiceItems(inv.invoice_id),
        window.electronAPI.dbGetAlreadyReturnedQuantities(inv.invoice_id),
      ]);
      const invoiceItems = Array.isArray(data) ? data : [];
      const enriched = await enrichItemsWithMrp(invoiceItems);
      setItems(enriched);
      const returnedMap: Record<string, number> = {};
      (Array.isArray(returned) ? returned : []).forEach((r: any) => {
        returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
      });
      const fullyReturned = invoiceItems.every((item: any) =>
        Number(item.quantity) - (returnedMap[item.item_id] || 0) <= 0
      );
      setCanReturn(!fullyReturned);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCanReturn(true);
    setTimeout(() => { setSelectedInvoice(null); setItems([]); }, 300);
  };

  const summary = dbSummary || {
    totalSales: invoices.filter(i => !i.converted_to_invoice_id).reduce((s, i) => s + (i.grand_total || 0), 0),
    totalInvoices: invoices.filter(i => !i.converted_to_invoice_id).length,
    totalTax: invoices.filter(i => !i.converted_to_invoice_id).reduce((s, i) => s + (i.tax_total || 0), 0),
    totalDiscount: invoices.filter(i => !i.converted_to_invoice_id).reduce((s, i) => s + (i.discount_total || 0), 0),
    avgOrder: (() => {
      const live = invoices.filter(i => !i.converted_to_invoice_id);
      return live.length > 0 ? live.reduce((s, i) => s + (i.grand_total || 0), 0) / live.length : 0;
    })(),
  };

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



  /* ── Reprint handler ── */
  const handleReprint = async () => {
    if (!selectedInvoice || !window.electronAPI) return;
    try {
      const { tenantId } = useAuthStore.getState();
      const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin, shopStateVal] = await Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_state' }),
      ]);
      const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
      const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const invoiceType = selectedInvoice.invoice_type;
      const isB2B = invoiceType === 'GST' && !!(selectedInvoice.customer_gstin);
      const useA4 = isB2B || printFmt?.format === 'a4';
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.billSettings || {}) };
      const scrapD = Number(selectedInvoice.scrap_deduction) || 0;
      const returnD = Number(selectedInvoice.return_deduction) || 0;
      
      let baseGrandTotal = Number(selectedInvoice.grand_total);
      if (invoiceType !== 'SCRAP') {
        const sub = Number(selectedInvoice.subtotal) || 0;
        const tax = Number(selectedInvoice.tax_total) || 0;
        const disc = Number(selectedInvoice.discount_total) || 0;
        const ptsDisc = Number(selectedInvoice.points_redeemed_discount) || 0;
        baseGrandTotal = Math.max(0, sub + tax - disc - ptsDisc);
      }

      const isInterState = shopStateVal && selectedInvoice.customer_state && (shopStateVal !== selectedInvoice.customer_state);
      const taxVal = Number(selectedInvoice.tax_total) || 0;
      const cgst = isInterState ? undefined : taxVal / 2;
      const sgst = isInterState ? undefined : taxVal / 2;
      const igst = isInterState ? taxVal : undefined;

      const receiptData: ReceiptData = {
        shopName: billSettings.showShopName ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: billSettings.showShopGstin ? (shopGstin || undefined) : undefined,
        shopState: billSettings.showShopState ? (shopStateVal || undefined) : undefined,
        shopAddress: billSettings.showShopAddress ? (shopAddr || undefined) : undefined,
        shopPhone: billSettings.showPhone ? (shopPh || undefined) : undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        invoiceNumber: selectedInvoice.invoice_number,
        date: formatBillDateTime(selectedInvoice.created_at),
        billerName: selectedInvoice.biller_name,
        items: items.map(item => ({
          name: item.name,
          quantity: Number(item.quantity) || 0,
          unit_price: item.unit_price,
          total: item.total,
          originalRate: item.originalRate,
          discountLabel: item.discountLabel,
          brand: item.brand_manufacturer || undefined,
          billing_type: item.billing_type,
          pieces_override: item.pieces_override,
          pieces_per_kg: item.pieces_per_kg,
          unit: item.unit,
        })),
        subtotal: selectedInvoice.subtotal,
        tax: selectedInvoice.tax_total,
        cgst: cgst,
        sgst: sgst,
        igst: igst,
        discount: selectedInvoice.discount_total,
        discountType: selectedInvoice.discount_type,
        discountValue: selectedInvoice.discount_value,
        grandTotal: baseGrandTotal,
        scrapDeduction: scrapD > 0 ? scrapD : undefined,
        scrapInvoiceNumber: selectedInvoice.scrap_invoice_number || undefined,
        returnDeduction: returnD > 0 ? returnD : undefined,
        returnInvoiceNumber: selectedInvoice.return_invoice_number || undefined,
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
        if (!printResult.success) {
          const pw = window.open('', '_blank');
          if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
        }
      } else {
        const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : receiptWidthCm;
        const thermalStyle = printFmt?.style || 'standard';
        const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
        const printResult = await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
        if ((printResult as any)?.skipped) {
          alert('No printer configured. Receipt print skipped.');
        } else if (printResult && !printResult.success) {
          alert(`Printing issue: ${printResult.error || 'check printer'}`);
        }
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
    if (['OWNER', 'ADMINISTRATOR'].includes(useAuthStore.getState().role)) useCartStore.getState().setRole('BILLER');
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 50);
  };

  const handleDeleteInvoice = async () => {
    if (!window.electronAPI || !selectedInvoice) return;
    setDeleteSaving(true);
    try {
      const result = await window.electronAPI.dbDeleteInvoice(selectedInvoice.invoice_id);
      if (result.success) {
        setDeleteConfirmOpen(false);
        setDrawerOpen(false);
        setTimeout(() => { setSelectedInvoice(null); setItems([]); }, 300);
        loadInvoices(true);
      } else {
        alert('Delete failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Delete failed: ' + (err?.message || 'Unknown error'));
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
        // Dispatch event to refresh CashierSettlement drawer cash instantly
        window.dispatchEvent(new CustomEvent('checkout:completed'));
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

  const handleExportCSV = async () => {
    if (!window.electronAPI) return;
    setIsExporting(true);
    setExportStatusMsg('Fetching all matching records…');
    try {
      const { userId, role, tenantId } = useAuthStore.getState();
      const data = await window.electronAPI.dbGetInvoices({
        user_id: userId, tenant_id: tenantId, role,
        limit: 99999, offset: 0,
        search: search || undefined,
        payment_method: paymentFilter || undefined,
        invoice_type: invoiceTypeFilter || undefined,
        filterDate: filterDate || undefined,
        filterDateEnd: filterDateEnd || undefined,
      });

      if (!Array.isArray(data) || data.length === 0) {
        setExportStatusMsg('No records to export');
        setTimeout(() => setExportStatusMsg(null), 2500);
        return;
      }

      const escape = (val: any) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };

      const getTypeLabel = (inv: any) => {
        if (inv.invoice_type === 'GST' && inv.customer_gstin) return 'B2B';
        if (inv.invoice_type === 'GST') return 'B2C';
        return 'Bill of Supply';
      };

      let csvContent: string;
      let filename: string;
      let exportedCount = 0;

      const parts: string[] = ['sales'];
      if (invoiceTypeFilter) parts.push(invoiceTypeFilter.replace('_', '-').toLowerCase());
      if (paymentFilter) parts.push(paymentFilter.toLowerCase());
      if (taxPercentageFilter) parts.push(`${taxPercentageFilter}pct`);
      if (filterDate) parts.push(filterDate);
      if (filterDateEnd && filterDateEnd !== filterDate) parts.push(`to-${filterDateEnd}`);
      parts.push(new Date().toLocaleDateString('en-CA'));
      filename = parts.join('_') + '.csv';

      if (taxPercentageFilter) {
        // Item-level CSV filtered by tax percentage
        const targetRate = Number(taxPercentageFilter);
        const itemHeaders = [
          'Invoice No.', 'Invoice Date', 'Tax Type', 'Customer Name', 'State',
          'GSTIN/UID', 'Product Name', 'HSN Code', 'Sales Rate', 'Qty.', 'UOM',
          'Discount %', 'Discount Amt', 'Taxable Amt', 'Total GST %', 'Total GST Amt',
          'CGST %', 'CGST', 'SGST %', 'SGST/UTGST', 'IGST %', 'IGST',
          'CESS %', 'CESS', 'Total Amount'
        ];
        const itemRows: string[][] = [];
        let totalTaxable = 0;
        let totalGstAmt = 0;

        for (const inv of data) {
          const invoiceDate = parseUTCDate(inv.created_at).toLocaleDateString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric'
          }) + ' ' + parseUTCDate(inv.created_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
          });
          const items = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
          if (!Array.isArray(items)) continue;

          for (const item of items) {
            const taxableAmt = Number(item.total) || 0;
            const gstAmt = Number(item.tax_amount) || 0;
            const effectiveRate = taxableAmt > 0 ? Math.round((gstAmt / taxableAmt) * 100) : 0;
            if (effectiveRate !== targetRate) continue;

            const cgstPct = effectiveRate / 2;
            const sgstPct = effectiveRate / 2;
            const cgstAmt = gstAmt / 2;
            const sgstAmt = gstAmt / 2;
            const totalAmt = taxableAmt + gstAmt;

            totalTaxable += taxableAmt;
            totalGstAmt += gstAmt;

            itemRows.push([
              escape(inv.invoice_number),
              escape(invoiceDate),
              escape(inv.invoice_type === 'GST' ? 'GST' : 'BILL_OF_SUPPLY'),
              escape(inv.customer_name || 'Cash'),
              escape(inv.customer_state || ''),
              escape(inv.customer_gstin || ''),
              escape(item.name || ''),
              escape(''),
              escape(Number(item.unit_price || 0).toFixed(2)),
              escape(Number(item.quantity || 0).toFixed(3)),
              escape('PAC'),
              escape('0.0000'),
              escape('0.00'),
              escape(taxableAmt.toFixed(2)),
              escape(effectiveRate.toFixed(2)),
              escape(gstAmt.toFixed(2)),
              escape(cgstPct.toFixed(2)),
              escape(cgstAmt.toFixed(2)),
              escape(sgstPct.toFixed(2)),
              escape(sgstAmt.toFixed(2)),
              escape('0.00'),
              escape('0.00'),
              escape('0.00'),
              escape('0.00'),
              escape(totalAmt.toFixed(2)),
            ]);
          }
        }

        if (itemRows.length > 0) {
          itemRows.push([
            escape(''), escape(''), escape(''), escape(''), escape(''),
            escape(''), escape(''), escape(''), escape(''), escape(''),
            escape(''), escape(''), escape(''), escape('TOTAL'),
            escape(''), escape(totalGstAmt.toFixed(2)),
            escape(''), escape(''), escape(''), escape(''),
            escape(''), escape(''), escape(''), escape(''),
            escape(''),
          ]);
        }

        csvContent = [itemHeaders.join(','), ...itemRows.map(r => r.join(','))].join('\n');
        exportedCount = itemRows.length;
      } else {
        // Invoice-level CSV (existing behavior)
        const headers = [
          'Invoice No', 'Date', 'Time', 'Type', 'Customer Name', 'Customer Phone',
          'Customer GSTIN', 'Payment Method', 'Subtotal (₹)', 'Tax (₹)', 'Discount (₹)',
          'Grand Total (₹)', 'Received (₹)', 'Balance (₹)', 'Biller'
        ];

        const rows = data.map((inv: any) => {
          const { date, time } = formatDate(inv.created_at);
          return [
            escape(inv.invoice_number),
            escape(date),
            escape(time),
            escape(getTypeLabel(inv)),
            escape(inv.customer_name || ''),
            escape(inv.customer_phone || ''),
            escape(inv.customer_gstin || ''),
            escape(PAYMENT_LABELS[inv.payment_method] || inv.payment_method || ''),
            escape((inv.subtotal || 0).toFixed(2)),
            escape((inv.tax_total || 0).toFixed(2)),
            escape((inv.discount_total || 0).toFixed(2)),
            escape((inv.grand_total || 0).toFixed(2)),
            escape((inv.received_amount || 0).toFixed(2)),
            escape((inv.balance_amount || 0).toFixed(2)),
            escape(inv.biller_name || ''),
          ];
        });

        csvContent = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
        exportedCount = data.length;
      }

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportStatusMsg(`✓ Exported ${exportedCount} record${exportedCount !== 1 ? 's' : ''}`);
      setTimeout(() => setExportStatusMsg(null), 3000);
    } catch (err) {
      console.error('Export failed', err);
      setExportStatusMsg('Export failed');
      setTimeout(() => setExportStatusMsg(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  /* ════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ─── TOAST ─── */}
      {reprintSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold shadow-2xl" style={{ animation: 'slideDown 0.25s ease' }}>
          <CheckCheck className="w-4 h-4 shrink-0" />
          Invoice reprinted successfully!
        </div>
      )}

      {/* ─── CONVERSION TOAST ─── */}
      {toast && (
        <div className={clsx(
          'fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl flex items-center gap-2 text-sm font-bold shadow-2xl',
          toast.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400'
        )} style={{ animation: 'slideDown 0.25s ease' }}>
          {toast.type === 'success' ? <CheckCheck className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.text}
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
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          {/* Left Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">Sales History</h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">Billing records &amp; analytics</p>
            </div>
          </div>

          {/* Center: View Mode Segmented Switcher */}
          <div className="flex items-center bg-muted/40 p-1 rounded-2xl border border-border/70 gap-1 shadow-inner">
            <button
              onClick={() => setViewMode('bills')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border',
                viewMode === 'bills'
                  ? 'bg-card text-foreground border-border shadow-xs'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-card/50'
              )}
            >
              <Receipt className="w-3.5 h-3.5 text-primary" />
              Bills List
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border',
                viewMode === 'analytics'
                  ? 'bg-card text-foreground border-border shadow-xs'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-card/50'
              )}
            >
              <BarChart3 className="w-3.5 h-3.5 text-violet-500" />
              Analytics &amp; Graph
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <DateRangeFilter
              startDate={filterDate}
              endDate={filterDateEnd}
              onChange={(start, end) => { setFilterDate(start); setFilterDateEnd(end); }}
            />

            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              title="Export filtered invoices to CSV"
              className="h-8 px-3 rounded-xl text-[11px] font-bold transition-all duration-150 cursor-pointer border flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 disabled:opacity-50 shrink-0"
            >
              {isExporting
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <Download className="w-3 h-3" />
              }
              {isExporting ? 'Exporting…' : 'CSV'}
            </button>

            <button
              onClick={handleForceResync}
              disabled={isResyncing}
              title="Force full re-sync of all historical invoices from cloud"
              className="h-8 px-3 rounded-xl text-[11px] font-bold transition-all duration-150 cursor-pointer border flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25 hover:bg-blue-500/20 disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={clsx("w-3 h-3", isResyncing && "animate-spin")} />
              {isResyncing ? 'Syncing…' : 'Sync Cloud'}
            </button>

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

      {/* ─── BODY ─── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ VIEW MODE 1: BILLS LIST (DE-CONGESTED) ══ */}
        {viewMode === 'bills' ? (
          <div className="flex flex-col flex-1 overflow-hidden w-full">

            {/* Compact Single-Row High-Density KPI Bar */}
            <div className="px-4 py-2 border-b border-border/70 bg-card/60 shrink-0">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* KPI 1: Total Revenue */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[170px]">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                      <IndianRupee className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">Total Revenue</span>
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums leading-tight block mt-0.5">
                        {loading ? '…' : formatCurrency(summary.totalSales)}
                      </span>
                    </div>
                  </div>

                  {/* KPI 2: Avg Order Value */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[160px]">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">Avg Order Value</span>
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono tabular-nums leading-tight block mt-0.5">
                        {loading ? '…' : formatCurrency(summary.avgOrder)}
                      </span>
                    </div>
                  </div>

                  {/* KPI 3: Total Tax */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[150px]">
                    <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
                      <Percent className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">Total GST Tax</span>
                      <span className="text-xs font-black text-violet-600 dark:text-violet-400 font-mono tabular-nums leading-tight block mt-0.5">
                        {loading ? '…' : formatCurrency(summary.totalTax)}
                      </span>
                    </div>
                  </div>

                  {/* KPI 4: Total Invoices / Discounts */}
                  <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 shadow-2xs min-w-[150px]">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                      <Receipt className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block leading-none">Total Invoices</span>
                      <span className="text-xs font-black text-foreground font-mono tabular-nums leading-tight block mt-0.5">
                        {loading ? '…' : `${summary.totalInvoices} Bills`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Toggle for Collapsible Trend Banner */}
                <button
                  onClick={() => setShowGraphBanner(!showGraphBanner)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-2xs shrink-0',
                    showGraphBanner
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground hover:text-foreground border-border/70'
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  {showGraphBanner ? 'Hide Trend Chart' : 'Show Trend Chart'}
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
            <div className="px-4 py-3 flex items-center gap-3 shrink-0 border-b border-border bg-card">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search invoice or customer…"
                  className="pl-9 h-8 text-xs bg-background border-border font-medium"
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
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setPaymentFilter(opt.value)}
                      className={clsx(
                        'h-7 px-3 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-150 cursor-pointer border',
                        paymentFilter === opt.value
                          ? 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/15'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <span className="w-px h-5 bg-border/60 mx-1 shrink-0" />
                {(() => {
                  const typeChipColors: Record<string, { bg: string; text: string; border: string }> = {
                    '': { bg: 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/15', text: 'text-primary', border: 'border-transparent' },
                    GST_B2B: { bg: 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/15', text: 'text-primary', border: 'border-transparent' },
                    GST_B2C: { bg: 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/15', text: 'text-primary', border: 'border-transparent' },
                    BILL_OF_SUPPLY: { bg: 'bg-primary/10 text-primary border-primary/25 dark:bg-primary/15', text: 'text-primary', border: 'border-transparent' },
                  };
                  const colors = typeChipColors[invoiceTypeFilter] || typeChipColors[''];
                  return (
                    <Select
                      value={invoiceTypeFilter}
                      onChange={setInvoiceTypeFilter}
                      options={[
                        { value: '', label: 'All Types' },
                        { value: 'GST_B2B', label: 'B2B' },
                        { value: 'GST_B2C', label: 'B2C' },
                        { value: 'BILL_OF_SUPPLY', label: 'Bill of Supply' },
                      ]}
                      size="xs"
                      className="w-40"
                      triggerClassName={clsx('rounded-full h-7 border px-3 transition-all', colors.bg, colors.text, colors.border)}
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
                {invoiceTypeFilter.startsWith('GST') && (
                  <Select
                    value={taxPercentageFilter}
                    onChange={setTaxPercentageFilter}
                    options={TAX_RATES}
                    size="xs"
                    className="w-28"
                    triggerClassName="rounded-full h-7 border px-3 transition-all bg-primary/10 text-primary border-primary/25 dark:bg-primary/15"
                    renderOption={(opt) => (
                      <span className="flex items-center gap-2 text-xs font-bold text-foreground">
                        <Percent className="w-3 h-3 text-muted-foreground" />
                        {opt.label}
                      </span>
                    )}
                  />
                )}
              </div>
              <div className="ml-auto text-[10px] text-muted-foreground font-semibold shrink-0">
                {loading ? '…' : invoices.length === summary.totalInvoices ? `${summary.totalInvoices} record${summary.totalInvoices !== 1 ? 's' : ''}` : `Showing ${invoices.length} of ${summary.totalInvoices} records`}
              </div>
              {['OWNER', 'ADMINISTRATOR'].includes(useAuthStore.getState().role) && (
                <button
                  onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) { setSelectedInvoiceIds(new Set()); } }}
                  className={clsx(
                    'h-7 px-3 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-150 cursor-pointer border',
                    selectionMode
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  )}
                >
                  <ShieldAlert className="w-3 h-3 inline -mt-0.5 mr-1" />
                  {selectionMode ? 'Cancel' : 'Convert to GST'}
                </button>
              )}
            </div>
          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
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
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invoice</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date &amp; Time</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount</th>
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
                          onClick={() => { if (!selectionMode) handleSelectInvoice(inv); }}
                          selectionMode={selectionMode}
                          isChecked={selectedInvoiceIds.has(inv.invoice_id)}
                          convertible={convertibleMap[inv.invoice_id]}
                          onCheck={() => {
                            if (inv.invoice_type !== 'BILL_OF_SUPPLY' || !convertibleMap[inv.invoice_id]) return;
                            setSelectedInvoiceIds(prev => {
                              const next = new Set(prev);
                              if (next.has(inv.invoice_id)) next.delete(inv.invoice_id);
                              else next.add(inv.invoice_id);
                              return next;
                            });
                          }}
                        />
                      ))}
                    </Fragment>
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
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 w-full">
          {/* Top Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={IndianRupee} label="Total Revenue" value={formatCurrency(summary.totalSales)} colorClass="text-emerald-500" bgClass="bg-emerald-500/10" sub={`${summary.totalInvoices} settled invoices`} />
            <StatCard icon={TrendingUp} label="Avg Order Value" value={formatCurrency(summary.avgOrder)} colorClass="text-blue-500" bgClass="bg-blue-500/10" />
            <StatCard icon={Percent} label="Total GST Tax" value={formatCurrency(summary.totalTax)} colorClass="text-violet-500" bgClass="bg-violet-500/10" />
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
      <Modal
        isOpen={drawerOpen}
        onClose={closeDrawer}
        className="max-w-4xl"
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
                {['OWNER', 'ADMINISTRATOR'].includes(useAuthStore.getState().role) && (
                  <>
                    <button onClick={handleEditBill}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 h-8 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-all text-xs font-bold border border-amber-500/20 cursor-pointer active:scale-95 whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span>Edit Bill</span>
                    </button>
                    <button onClick={() => setDeleteConfirmOpen(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 h-8 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-xl transition-all text-xs font-bold border border-red-500/20 cursor-pointer active:scale-95 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Delete</span>
                    </button>
                    <button onClick={async () => {
                      if (!canReturn) return;
                      // Store invoice ref and close — BillingPage will open in return mode
                      localStorage.setItem('returnBillData', JSON.stringify({ invoice: selectedInvoice }));
                      // Switch OWNER to BILLER so BillingPage renders (not OwnerDashboard)
                      if (['OWNER', 'ADMINISTRATOR'].includes(useAuthStore.getState().role)) {
                        useCartStore.getState().setRole('BILLER');
                      }
                      closeDrawer();
                      onClose();
                      setTimeout(() => window.dispatchEvent(new CustomEvent('open-return-mode')), 100);
                    }}
                      disabled={!canReturn}
                      title={canReturn ? undefined : 'All items in this bill have already been returned'}
                      className={clsx('flex-1 flex items-center justify-center gap-1.5 px-2.5 h-8 rounded-xl transition-all text-xs font-bold border cursor-pointer active:scale-95 whitespace-nowrap',
                        canReturn
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border-red-500/20'
                          : 'bg-muted/40 text-muted-foreground/50 border-border/60 cursor-not-allowed')}
                    >
                      <Package className="w-3.5 h-3.5 shrink-0" />
                      <span>{canReturn ? 'Return' : 'Returned'}</span>
                    </button>
                  </>
                )}
                {selectedInvoice.payment_method === 'PENDING' && (
                  <button onClick={openCollectPayment}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 h-8 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-all text-xs font-bold border border-emerald-500/20 cursor-pointer active:scale-95 whitespace-nowrap"
                  >
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    <span>Collect Payment</span>
                  </button>
                )}
                {selectedInvoice.payment_method !== 'PENDING' && ['OWNER', 'ADMINISTRATOR', 'ADMIN'].includes(useAuthStore.getState().role) && (
                  <button onClick={openCollectPayment}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 h-8 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 rounded-xl transition-all text-xs font-bold border border-violet-500/20 cursor-pointer active:scale-95 whitespace-nowrap"
                    title="Change Payment Method (Admin Only)"
                  >
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    <span>Change Payment</span>
                  </button>
                )}
                <button onClick={handleReprint}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 h-8 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-xs font-bold border border-primary/20 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Reprint</span>
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
                {selectedInvoice.customer_address && (
                  <div className="text-[10px] text-muted-foreground">{selectedInvoice.customer_address}</div>
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
                <span className="text-[10px] text-muted-foreground font-semibold">{items.length} item{items.length !== 1 ? 's' : ''}</span>
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
                  {items.length === 0 ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs font-medium">Loading items…</span>
                    </div>
                  ) : items.map((item, i) => (
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
                        <span className="text-orange-500 font-semibold flex items-center gap-1">
                          Scrap Credit
                          {selectedInvoice.scrap_invoice_number && (
                            <span className="font-bold">
                              ({selectedInvoice.scrap_invoice_number})
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-orange-500 font-bold">-{formatCurrency(scrapD)}</span>
                          {selectedInvoice.scrap_invoice_number && (
                            <button
                              type="button"
                              onClick={() => {
                                useCartStore.getState().setPendingScrapInvoiceToEdit(selectedInvoice.scrap_invoice_number);
                                useCartStore.getState().setRole('BILLER');
                                window.dispatchEvent(new CustomEvent('edit-scrap-invoice', { detail: { invoiceNumber: selectedInvoice.scrap_invoice_number } }));
                                setDrawerOpen(false);
                                onClose();
                              }}
                              className="px-2 py-0.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold text-[11px] border border-orange-500/20 transition-all cursor-pointer flex items-center gap-1"
                              title="Edit Scrap Invoice in Billing Page"
                            >
                              <Edit3 className="w-3 h-3" /> Edit Scrap
                            </button>
                          )}
                        </div>
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
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Grand Total</span>
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
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Grand Total</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(preDeductionTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                        <span className="text-xs font-black text-primary uppercase tracking-widest">Net Total</span>
                        <span className="text-lg font-black text-foreground">{formatCurrency(netPayable)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                      <span className="text-xs font-black text-primary uppercase tracking-widest">Grand Total</span>
                      <span className="text-lg font-black text-foreground">{formatCurrency(preDeductionTotal)}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

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
                            : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
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

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => setCollectPaymentOpen(false)}
                  className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors cursor-pointer"
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
        closeButton={null}
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

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
                  <div key={inv.invoice_id} className="flex items-center justify-between p-2.5 bg-card border border-border rounded-xl text-xs">
                    <span className="font-bold text-foreground">{inv.invoice_number}</span>
                    <span className="text-muted-foreground">{formatCurrency(inv.grand_total)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => setConversionOpen(false)}
                  disabled={converting}
                  className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors cursor-pointer"
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
                          const ok = result.results.filter((r: any) => r.success).length;
                          const fail = result.results.length - ok;
                          if (fail === 0) {
                            showToast(`Successfully converted ${ok} Bill of Supply invoice${ok !== 1 ? 's' : ''} to GST`, 'success');
                          } else if (ok === 0) {
                            showToast(`Conversion failed for ${fail} invoice${fail !== 1 ? 's' : ''}`, 'error');
                          } else {
                            showToast(`${ok} converted, ${fail} failed`, 'error');
                          }
                        } else {
                          setConversionResults(selectedBosInvoices.map(i => ({
                            invoice_id: i.invoice_id,
                            old_number: i.invoice_number,
                            new_number: '',
                            success: false,
                            error: result.error || 'Conversion failed',
                          })));
                          showToast(result.error || 'Conversion failed', 'error');
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
                      showToast('Conversion failed: ' + (err?.message || 'Unknown error'), 'error');
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

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => { if (!deleteSaving) setDeleteConfirmOpen(false); }}
        closeButton={null}
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
              This will permanently delete invoice <strong>{selectedInvoice?.invoice_number}</strong> 
              {selectedInvoice?.customer_name && <> for <strong>{selectedInvoice.customer_name}</strong></>}.
              Stock quantities will be restored.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteSaving}
              className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteInvoice}
              disabled={deleteSaving}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              {deleteSaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Delete Invoice</>
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

