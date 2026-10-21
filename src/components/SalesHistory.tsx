import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import {
  Receipt, Search, Calendar, User, Tag, RefreshCw, Printer, Edit3, Trash2, X,
  BookOpen, IndianRupee, TrendingUp, Boxes,
  CheckCircle2, Package, BarChart3, CheckCheck, ChevronRight,
  SlidersHorizontal, Clock, Layers, Banknote, Wallet, Smartphone, AlertCircle, CreditCard,
  ArrowDownRight, ShieldAlert, Building, FileText, Download, Percent, Loader2,
  Lock, Shield, EyeOff
} from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useAuthStore } from '../store/authStore';
import { getSalesHistoryAmount, getInvoiceNetTotal, getInvoicePreDeductionTotal } from '../utils/salesHistoryAmount';
import {
  buildInvoiceProductRows,
  buildTaxFilteredProductRows,
  sortInvoicesByInvoiceNumber,
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
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData, getAppTimeFormat, parseUTCDate } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { formatWhatsAppBillMessage } from '../utils/whatsappBillHelper';
import { WhatsAppIcon } from './ui/WhatsAppIcon';
import { parsePrintFormat, formatPrinterError } from '../utils/printFormatHelper';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { getUpiPageConfig, DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../utils/upiConfig';
import { isAdminRole, hasPermission } from '../utils/permissions';
import { getStoreTimezone } from '../utils/timezoneHelper';


const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CREDIT: 'Credit',
  SPLIT: 'Split',
};

const PAYMENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PENDING:{ bg: 'bg-gray-500/10',   text: 'text-gray-500',    dot: '#6b7280' },
  CASH:   { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: '#10b981' },
  CARD:   { bg: 'bg-blue-500/10',   text: 'text-blue-500',    dot: '#3b82f6' },
  UPI:    { bg: 'bg-violet-500/10', text: 'text-violet-500',  dot: '#8b5cf6' },
  CHEQUE: { bg: 'bg-indigo-500/10', text: 'text-indigo-500',  dot: '#6366f1' },
  CREDIT: { bg: 'bg-amber-500/10',  text: 'text-amber-500',   dot: '#f59e0b' },
  SPLIT:  { bg: 'bg-purple-500/10', text: 'text-purple-500',  dot: '#a855f7' },
};

const TAX_RATES = [
  { value: 'all', label: 'All GST %' },
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

function formatCurrency(amount: any): string {
  const num = Number(amount);
  if (isNaN(num)) return '\u20B90.00';
  return `\u20B9${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return { date: '-', time: '-' };
  try {
    const tz = getStoreTimezone();
    const d = parseUTCDate(dateStr);
    if (isNaN(d.getTime())) return { date: '-', time: '-' };
    return {
      date: d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' }),
    };
  } catch {
    return { date: '-', time: '-' };
  }
}

function formatGroupDate(dateStr?: string) {
  if (!dateStr) return '-';
  try {
    const tz = getStoreTimezone();
    const d = parseUTCDate(dateStr);
    if (isNaN(d.getTime())) return '-';
    const dayName = d.toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long' });
    const dateStrFormatted = d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${dateStrFormatted} ${dayName}`;
  } catch {
    return '-';
  }
}

// For SPLIT invoices filtered by a specific payment method, return only that payment's portion.
// For non-SPLIT invoices, return the net total only if payment method matches the filter.
function getInvoiceRevenueForFilter(inv: any, paymentFilter: string): number {
  if (!inv) return 0;
  const pmFilter = paymentFilter?.toUpperCase();
  const invPm = inv.payment_method?.toUpperCase() || 'PENDING';
  const singleMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];

  // If no filter, return net total for all invoices
  if (!pmFilter) return getInvoiceNetTotal(inv);

  // If invoice is SPLIT and we're filtering by a single method, return that method's portion
  if ((invPm === 'SPLIT' || invPm === 'CREDIT') && inv.split_details && singleMethods.includes(pmFilter)) {
    try {
      const sd = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
      const jsonKey = pmFilter === 'BANK_TRANSFER' ? 'bank_transfer' : pmFilter.toLowerCase();
      return Number(sd[jsonKey]) || 0;
    } catch { return 0; }
  }

  // If invoice payment method matches the filter exactly, return net total
  if (invPm === pmFilter) return getInvoiceNetTotal(inv);

  // Otherwise, this invoice doesn't match the filter - return 0
  return 0;
}


function groupByDay(invoices: any[]) {
  const tz = getStoreTimezone();
  const map = new Map<string, number>();
  for (const inv of invoices) {
    const day = parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short' });
    map.set(day, (map.get(day) || 0) + getInvoiceNetTotal(inv));
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

function parseSplitDetails(splitDetailsRaw: any) {
  if (!splitDetailsRaw || splitDetailsRaw === 'null') return null;
  let curr = splitDetailsRaw;
  let depth = 0;
  while (typeof curr === 'string' && depth < 5) {
    depth++;
    try {
      curr = JSON.parse(curr);
    } catch {
      break;
    }
  }
  return (curr && typeof curr === 'object') ? curr : null;
}

function getUpiDetailsFromInvoice(inv: any, upiSourcesList: any[] = []) {
  if (!inv) return null;
  const sd = parseSplitDetails(inv.split_details);
  if (sd?.upi_name || sd?.upi_id) {
    const name = sd.upi_name || 'UPI';
    const upiId = sd.upi_id || '';
    return {
      name,
      upiId,
      label: name && upiId ? `${name} (${upiId})` : (name || upiId)
    };
  }
  if (inv.payment_method === 'UPI' && upiSourcesList && upiSourcesList.length > 0) {
    const matched = (sd?.upi_source_id ? upiSourcesList.find((s: any) => s.source_id === sd.upi_source_id) : null)
      || upiSourcesList.find((s: any) => s.is_default === 1)
      || upiSourcesList[0];
    if (matched) {
      return {
        name: matched.name,
        upiId: matched.upi_id || '',
        label: matched.name && matched.upi_id ? `${matched.name} (${matched.upi_id})` : (matched.name || matched.upi_id || 'UPI')
      };
    }
  }
  return null;
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
function InvoiceRow({ inv, isSelected, onClick, onMouseEnter, selectionMode, isChecked, onCheck, convertible, upiSources = [], onDownload, onPrint }: { inv: any; isSelected: boolean; onClick: () => void; onMouseEnter?: () => void; selectionMode?: boolean; isChecked?: boolean; onCheck?: () => void; convertible?: boolean; upiSources?: any[]; onDownload?: (inv: any) => void; onPrint?: (inv: any) => void }) {
  const { date, time } = formatDate(inv.created_at);
  const _isPending = inv.payment_method === 'PENDING';
  const isCredit = inv.payment_method === 'CREDIT';
  const isConvertedBos = !!inv.converted_to_invoice_id;
  const isConversionCopy = !!inv.converted_from_invoice_id;
  const canConvert = inv.invoice_type === 'BILL_OF_SUPPLY' && !isConvertedBos && !!convertible;

  return (
    <tr
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={clsx(
        'group cursor-pointer transition-all duration-150 border-b border-border last:border-0',
        isSelected
          ? 'bg-primary/5'
          : isChecked
            ? 'bg-amber-500/10'
            : 'hover:bg-muted/30'
      )}
    >
      {/* Invoice # */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          {selectionMode ? (
            canConvert ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onCheck?.();
                }}
                className="flex items-center justify-center cursor-pointer shrink-0 p-0.5"
                title={isChecked ? 'Deselect bill' : 'Select bill'}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  readOnly
                  className={clsx(
                    'w-4 h-4 rounded-md border-2 transition-all cursor-pointer',
                    isChecked
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-border/80 hover:border-amber-500'
                  )}
                />
              </div>
            ) : (inv.invoice_type === 'BILL_OF_SUPPLY' && !isConvertedBos) ? (
              <div className="flex items-center justify-center shrink-0 p-0.5" title="Full Estimate Bill (cannot convert to GST)">
                <input
                  type="checkbox"
                  disabled
                  checked={false}
                  className="w-4 h-4 rounded-md border border-border/40 bg-muted/40 opacity-30 cursor-not-allowed"
                />
              </div>
            ) : null
          ) : null}
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 flex-wrap">
              <span>{inv.invoice_number}</span>
              {isConvertedBos && (
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20" title={`Converted to GST: ${inv.converted_to_invoice_number || ''}`}>
                  ⚡ GST Filed {inv.converted_to_invoice_number ? `(${inv.converted_to_invoice_number})` : ''}
                </span>
              )}
              {isConversionCopy && (
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title={`Statutory GST filing copy from BOS: ${inv.converted_from_invoice_number || ''}`}>
                  📄 Tax Copy {inv.converted_from_invoice_number ? `(From ${inv.converted_from_invoice_number})` : ''}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5 flex-wrap">
              <span>{inv.item_count || 0} item{(inv.item_count || 0) !== 1 ? 's' : ''}</span>
              {(inv.description || inv.notes) && (
                <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md max-w-[140px] truncate" title={inv.description || inv.notes}>
                  <FileText className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{inv.description || inv.notes}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      {/* Type */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <InvoiceTypeBadge inv={inv} />
      </td>
      {/* Date & Time */}
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
        <div className="flex flex-col items-start gap-0.5">
          <PaymentBadge method={inv.payment_method || 'PENDING'} />
          {(inv.payment_method === 'SPLIT' || (inv.payment_method === 'CREDIT' && inv.split_details)) && (() => {
            const sd = parseSplitDetails(inv.split_details);
            if (!sd) return null;
            const parts: string[] = [];
            if (Number(sd.cash) > 0) parts.push(`Cash: ₹${Number(sd.cash).toFixed(2)}`);
            if (Number(sd.upi) > 0) parts.push(`UPI: ₹${Number(sd.upi).toFixed(2)}`);
            if (Number(sd.card) > 0) parts.push(`Card: ₹${Number(sd.card).toFixed(2)}`);
            if (Number(sd.bank_transfer) > 0) parts.push(`Bank: ₹${Number(sd.bank_transfer).toFixed(2)}`);
            if (Number(sd.credit) > 0) parts.push(`Credit: ₹${Number(sd.credit).toFixed(2)}`);
            if (parts.length === 0) return null;
            return (
              <div className="text-[10px] font-black text-purple-700 dark:text-purple-300 mt-0.5 leading-snug">
                {parts.join(' • ')}
              </div>
            );
          })()}
          {(() => {
            const upiDetail = getUpiDetailsFromInvoice(inv, upiSources);
            if ((inv.payment_method === 'UPI' || (inv.payment_method === 'SPLIT' && (Number(parseSplitDetails(inv.split_details)?.upi) || 0) > 0)) && upiDetail) {
              return (
                <div className="text-[10px] leading-snug mt-0.5">
                  <div className="font-extrabold text-violet-700 dark:text-violet-300">{upiDetail.name}</div>
                  {upiDetail.upiId && (
                    <div className="text-[9.5px] font-bold text-violet-600/90 dark:text-violet-400/90 font-mono">
                      {upiDetail.upiId}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })()}
        </div>
        {isCredit && inv.balance_amount < 0 && (
          <div className="text-[10px] text-amber-500 font-semibold mt-0.5">
            Due: {formatCurrency(Math.abs(inv.balance_amount))}
          </div>
        )}
      </td>
      {/* Amount */}
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        {(() => {
          const summary = getSalesHistoryAmount(inv);

          if (summary.refund) {
            return (
              <>
                <div className="text-sm font-black text-rose-600 dark:text-rose-400">
                  -{formatCurrency(summary.amount)}
                </div>
                <div className="text-[10px] text-rose-500 font-semibold mt-0.5">
                  Refund
                </div>
                {Math.abs(summary.refundDifference) > 0.005 && (
                  <div
                    className={clsx('text-[10px] font-semibold mt-0.5', summary.refundDifference > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400')}
                    title={summary.refundDifference > 0 ? 'Amount paid above the calculated refund' : 'Amount paid below the calculated refund'}
                  >
                    {summary.refundDifference > 0 ? '+' : '-'}{formatCurrency(Math.abs(summary.refundDifference))}
                  </div>
                )}
              </>
            );
          }

          return (
            <>
              <div className={clsx('text-sm font-black', isSelected ? 'text-primary' : 'text-foreground')}>
                {formatCurrency(summary.amount)}
              </div>
              {summary.discount > 0 && (
                <div className="text-[10px] text-red-500 font-semibold mt-0.5">
                  -{formatCurrency(summary.discount)} off
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
  const { tenantId, role, permissions } = useAuthStore();
  const [maskingConfig, setMaskingConfig] = useState<StaffDataMaskingConfig>(DEFAULT_STAFF_DATA_MASKING_CONFIG);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [canReturn, setCanReturn] = useState(true);
  const [items, setItems] = useState<any[]>([]);
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
  const invoiceDetailsCache = useRef<Map<string, {
    items: any[];
    returned: any[];
    canReturn: boolean;
    promise?: Promise<{ items: any[]; returned: any[]; canReturn: boolean }>;
  }>>(new Map());
  const productsCacheRef = useRef<Map<string, any>>(new Map());
  const combosCacheRef = useRef<{ data: any[]; timestamp: number } | null>(null);
  const prefetchInvoiceRef = useRef<(id: string) => void>(() => {});
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT'>('CASH');
  const [collectReceivedAmount, setCollectReceivedAmount] = useState(0);
  const [collectPaymentSaving, setCollectPaymentSaving] = useState(false);
  const [collectPaymentSuccess, setCollectPaymentSuccess] = useState(false);

  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [upiSources, setUpiSources] = useState<any[]>([]);
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
  const [isResyncing, setIsResyncing] = useState(false);
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
      if (window.electronAPI?.settingsGet) {
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_convert_to_gst' }).then((v: any) => {
          if (v !== null && v !== undefined) setEnableConvertToGst(Boolean(v));
        }).catch(() => {});

        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'gst_conversion_tax_inclusive' }).then((v: any) => {
          if (v !== null && v !== undefined) setConversionTaxMode(Boolean(v) ? 'INCLUSIVE' : 'EXCLUSIVE');
        }).catch(() => {});

        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: STAFF_DATA_MASKING_KEY }).then((v: any) => {
          if (v) setMaskingConfig(parseStaffDataMaskingConfig(v));
        }).catch(() => {});
      }
    };
    loadSettings();
    window.addEventListener('settings:updated', loadSettings);
    return () => window.removeEventListener('settings:updated', loadSettings);
  }, [tenantId]);

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

  const convertibleInvoicesInView = useMemo(() =>
    invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY' && !i.converted_to_invoice_id && Boolean(convertibleMap[i.invoice_id])),
    [invoices, convertibleMap]
  );

  const selectedBosInvoices = useMemo(() =>
    invoices.filter(i => i.invoice_type === 'BILL_OF_SUPPLY' && !i.converted_to_invoice_id && Boolean(convertibleMap[i.invoice_id]) && selectedInvoiceIds.has(i.invoice_id)),
    [invoices, selectedInvoiceIds, convertibleMap]
  );

  useEffect(() => {
    if (!conversionOpen || selectedBosInvoices.length === 0) {
      setConversionPreview(null);
      return;
    }
    let cancelled = false;
    setConversionPreviewLoading(true);
    const tid = tenantId || 'global';

    const runPreview = async () => {
      // 1. Try IPC preview first
      if (window.electronAPI?.dbPreviewConvertBosToGst) {
        try {
          const res = await window.electronAPI.dbPreviewConvertBosToGst({
            invoice_ids: selectedBosInvoices.map(i => i.invoice_id),
            tenant_id: tid,
            tax_mode: conversionTaxMode,
          });
          if (res?.success && res.invoices && res.invoices.length > 0) {
            if (!cancelled) {
              setConversionPreview(res);
              setConversionPreviewLoading(false);
            }
            return;
          }
        } catch (err) {
          console.warn('[SalesHistory] IPC previewConvertBosToGst failed or not registered, using client fallback:', err);
        }
      }

      // 2. Robust Client-side fallback so preview updates immediately even before app restart
      try {
        let totalBos = 0;
        let totalTaxable = 0;
        let totalTax = 0;
        let totalConverted = 0;
        let hasRealGst = false;
        let hasPaper = false;
        const previewInvoices: any[] = [];

        const allProductIds = new Set<string>();
        const invoiceItemsMap: Record<string, any[]> = {};

        for (const inv of selectedBosInvoices) {
          if (window.electronAPI?.dbGetInvoiceItems) {
            const items = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
            invoiceItemsMap[inv.invoice_id] = Array.isArray(items) ? items : [];
            for (const itm of invoiceItemsMap[inv.invoice_id]) {
              if (itm.product_id) allProductIds.add(itm.product_id);
            }
          }
        }

        let productsMap: Record<string, any> = {};
        if (allProductIds.size > 0 && window.electronAPI?.dbGetProductsByIds) {
          try {
            const prods = await window.electronAPI.dbGetProductsByIds({
              tenant_id: tid,
              product_ids: Array.from(allProductIds)
            });
            if (Array.isArray(prods)) {
              for (const p of prods) productsMap[p.product_id] = p;
            }
          } catch {}
        }

        for (const inv of selectedBosInvoices) {
          const items = invoiceItemsMap[inv.invoice_id] || [];
          let newSubtotal = 0;
          let newTotalTax = 0;
          const skippedItems: string[] = [];
          const isTaxInclusive = conversionTaxMode === 'INCLUSIVE';

          for (const item of items) {
            const prod = productsMap[item.product_id];
            let da: any = {};
            if (prod?.domain_attributes) {
              try { da = JSON.parse(prod.domain_attributes); } catch {}
            }
            const isReal = prod ? (prod.is_gst_applicable === 1 && da.gst_type !== 'PAPER') : false;
            const isPaper = prod ? (!isReal && (da.gst_type === 'PAPER' || Number(da.paper_mrp || 0) > 0 || Number(da.paper_purchase_price || 0) > 0 || Number(da.gst_purchase_price || 0) > 0 || Number(da.paper_stock || 0) > 0)) : false;

            if (isReal) hasRealGst = true;
            if (isPaper) hasPaper = true;

            const qty = Number(item.quantity) || 1;
            const taxRate = Number(prod?.tax_rate_percent || item.tax_rate || 18);
            let unitPrice = Number(item.unit_price) || 0;

            if (isPaper) {
              if (Number(da.paper_offer_price || 0) > 0) unitPrice = Number(da.paper_offer_price);
              else if (Number(da.paper_mrp || 0) > 0) unitPrice = Number(da.paper_mrp);
            }

            if (!unitPrice) unitPrice = Number(item.unit_price) || 0;

            let itemTaxable = 0;
            let itemTax = 0;
            let itemTotal = 0;

            if (isTaxInclusive && taxRate > 0) {
              itemTotal = Math.round(unitPrice * qty * 100) / 100;
              itemTaxable = Math.round((itemTotal / (1 + taxRate / 100)) * 100) / 100;
              itemTax = Math.round((itemTotal - itemTaxable) * 100) / 100;
            } else {
              itemTaxable = Math.round(unitPrice * qty * 100) / 100;
              itemTax = Math.round(itemTaxable * (taxRate / 100) * 100) / 100;
              itemTotal = Math.round((itemTaxable + itemTax) * 100) / 100;
            }

            newSubtotal += itemTaxable;
            newTotalTax += itemTax;
          }

          let discount = 0;
          if (inv.discount_type === 'PERCENTAGE' && Number(inv.discount_value) > 0) {
            discount = Math.round(newSubtotal * (Number(inv.discount_value) / 100) * 100) / 100;
          } else if (inv.discount_type === 'FIXED' && Number(inv.discount_value) > 0) {
            discount = Math.min(Number(inv.discount_value), newSubtotal);
          }

          const taxable = newSubtotal - discount;
          const effRate = newSubtotal > 0 ? newTotalTax / newSubtotal : 0;
          const adjTax = Math.round(taxable * effRate * 100) / 100;
          const pointsDiscount = Math.max(0, Number(inv.points_redeemed_discount) || 0);
          const scrapDeduction = inv.scrap_invoice_number ? Math.max(0, Number(inv.scrap_deduction) || 0) : 0;
          const returnDeduction = inv.return_invoice_number ? Math.max(0, Number(inv.return_deduction) || 0) : 0;
          const deductionsTotal = Math.round((pointsDiscount + scrapDeduction + returnDeduction) * 100) / 100;
          const grossTotal = Math.round((taxable + adjTax) * 100) / 100;
          const convTotal = items.length > 0
            ? Math.max(0, Math.round((grossTotal - deductionsTotal) * 100) / 100)
            : Number(inv.grand_total) || 0;

          totalBos += Number(inv.grand_total) || 0;
          totalTaxable += taxable;
          totalTax += adjTax;
          totalConverted += convTotal;

          previewInvoices.push({
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number,
            bos_grand_total: Number(inv.grand_total) || 0,
            taxable_amount: taxable,
            tax_amount: adjTax,
            converted_grand_total: convTotal,
            points_discount: pointsDiscount,
            scrap_deduction: scrapDeduction,
            return_deduction: returnDeduction,
            deductions_total: deductionsTotal,
            has_real_gst: hasRealGst,
            has_paper: hasPaper,
            skipped_items: skippedItems,
          });
        }

        if (!cancelled) {
          setConversionPreview({
            invoices: previewInvoices,
            total_bos_amount: Math.round(totalBos * 100) / 100,
            total_taxable_amount: Math.round(totalTaxable * 100) / 100,
            total_tax_amount: Math.round(totalTax * 100) / 100,
            total_converted_amount: Math.round(totalConverted * 100) / 100,
            has_real_gst: hasRealGst,
            has_paper: hasPaper,
            has_skipped: false,
          });
        }
      } catch (e) {
        console.error('[SalesHistory] Client preview fallback error:', e);
      } finally {
        if (!cancelled) setConversionPreviewLoading(false);
      }
    };

    runPreview();
    return () => { cancelled = true; };
  }, [conversionOpen, conversionTaxMode, selectedBosInvoices, tenantId]);

  const COLLECT_PAYMENT_OPTIONS = [
    { value: 'CASH' as const, label: 'Cash', icon: Banknote, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500', iconBg: 'bg-emerald-500/15' },
    { value: 'CARD' as const, label: 'Card', icon: Wallet, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500', iconBg: 'bg-blue-500/15' },
    { value: 'UPI' as const, label: 'UPI', icon: Smartphone, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500', iconBg: 'bg-violet-500/15' },
    { value: 'CHEQUE' as const, label: 'Cheque', icon: FileText, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500', iconBg: 'bg-indigo-500/15' },
    { value: 'CREDIT' as const, label: 'Credit', icon: BookOpen, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500', iconBg: 'bg-amber-500/15' },
  ];

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
    if (window.electronAPI?.dbPaymentGetSources) {
      window.electronAPI.dbPaymentGetSources(useAuthStore.getState().tenantId || 'global').then((sources: any[]) => {
        if (Array.isArray(sources)) {
          setUpiSources(sources.filter((s: any) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
        }
      }).catch(() => {});
    }
    if (window.electronAPI) {
      const unsub = window.electronAPI.onSyncDataUpdated(() => {
        console.log('[SalesHistory] 🔄 Auto-sync data updated event received! Reloading invoices from SQLite...');
        loadInvoicesRef.current(true);
      });
      return () => {
        unsub?.();
      };
    }
  }, []);

  const loadInvoicesRef = useRef<any>(null);
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
    if (!window.electronAPI) return;
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
  }, [selectionMode, invoices.length]);

  const loadTaxProductRows = async (filters: any, targetRate: string) => {
    if (!window.electronAPI?.dbGetInvoices || !window.electronAPI?.dbGetInvoiceItems) return;
    const requestId = ++taxProductRequestRef.current;
    setTaxProductLoading(true);
    try {
      const data = await window.electronAPI.dbGetInvoices({ ...filters, limit: 100000, offset: 0 });
      if (!Array.isArray(data)) {
        if (requestId === taxProductRequestRef.current) {
          setTaxProductRows([]);
          setTaxProductTotals(null);
        }
        return;
      }

      const scopedData = filters?.accounting_view === 'TAX_FILING'
        ? data
        : filters?.accounting_view === 'REAL_SALES'
          ? data.filter((inv: any) => inv.invoice_type === 'BILL_OF_SUPPLY')
          : data.filter((inv: any) => !inv.converted_from_invoice_id);

      const itemsByInvoice: Record<string, any[]> = {};
      await Promise.all(scopedData.map(async (inv: any) => {
        try {
          const invoiceItems = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
          itemsByInvoice[inv.invoice_id] = Array.isArray(invoiceItems) ? invoiceItems : [];
        } catch {
          itemsByInvoice[inv.invoice_id] = [];
        }
      }));

      if (requestId !== taxProductRequestRef.current) return;
      const result = buildTaxFilteredProductRows(
        sortInvoicesByInvoiceNumber(scopedData),
        itemsByInvoice,
        Number(targetRate)
      );
      setTaxProductRows(result.rows);
      setTaxProductTotals(result.totals);
    } catch (err) {
      console.error('[SalesHistory] Failed to load GST product rows:', err);
      if (requestId === taxProductRequestRef.current) {
        setTaxProductRows([]);
        setTaxProductTotals(null);
      }
    } finally {
      if (requestId === taxProductRequestRef.current) setTaxProductLoading(false);
    }
  };

  const loadInvoices = async (reset = false) => {
    if (!reset && isFetching) return;
    setIsFetching(true);
    if (window.electronAPI) {
      const { userId, role, tenantId, restrictedPage } = useAuthStore.getState();
      const currentOffset = reset ? 0 : offset;
      
      const isBiller = role === 'BILLER';
      const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
      const hasGstInvoicesOnly = isBiller && permissions.includes('OPT_VIEW_GST_INVOICES_ONLY');
      const effectiveInvoiceType = hasGstInvoicesOnly
        ? (invoiceTypeFilter && invoiceTypeFilter !== 'BILL_OF_SUPPLY' ? invoiceTypeFilter : 'GST')
        : accountingView === 'REAL_SALES'
          ? 'BILL_OF_SUPPLY'
          : (invoiceTypeFilter || undefined);

      const isStaffUser = isStaffRole(role);
      const shouldMaskStaff = shouldApplyStaffMasking(role, maskingConfig);
      let effectiveFilterDate = filterDate || undefined;
      let effectiveFilterDateEnd = filterDateEnd || undefined;
      if (shouldMaskStaff && maskingConfig.sales_history_scope !== 'ALL') {
        const staffScope = getStaffSalesDateScope(maskingConfig, isStaffUser);
        if (staffScope.startDate) effectiveFilterDate = staffScope.startDate;
        if (staffScope.endDate) effectiveFilterDateEnd = staffScope.endDate;
      }

      try {
        const filters = {
          user_id: userId, tenant_id: tenantId, role,
          search: debouncedSearch || undefined, payment_method: paymentFilter || undefined,
          invoice_type: effectiveInvoiceType,
          tax_rate_percent: accountingView === 'REAL_SALES' ? undefined : (taxPercentageFilter || undefined),
          filterDate: effectiveFilterDate, filterDateEnd: effectiveFilterDateEnd,
          accounting_view: accountingView,
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

        if (reset) {
          if (taxFilterActive) {
            void loadTaxProductRows(filters, taxPercentageFilter);
          } else {
            taxProductRequestRef.current++;
            setTaxProductRows([]);
            setTaxProductTotals(null);
            setTaxProductLoading(false);
          }
        }

        if (Array.isArray(data)) {
          if (reset) {
            setInvoices(data);
            // Pre-warm top 5 most recent bills quietly so clicking any recent bill is 100% instant
            if (data.length > 0) {
              setTimeout(() => {
                data.slice(0, 5).forEach((item: any) => {
                  if (item?.invoice_id) prefetchInvoiceRef.current(item.invoice_id);
                });
              }, 200);
            }
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

  // Recover MRP / offer info for past invoices (invoice_items only stores the sold rate).
  // Mirrors the recovery logic used when editing a bill in BillingPage.
  const enrichItemsWithMrp = async (invoiceItems: any[]): Promise<any[]> => {
    if (!Array.isArray(invoiceItems) || invoiceItems.length === 0) return [];
    try {
      const { tenantId } = useAuthStore.getState();
      const effectiveTenantId = tenantId || 'global';
      let combosList: any[] = [];
      
      // Only query combo offers if at least one item looks like a combo
      const mightHaveCombos = invoiceItems.some((i: any) => 
        Boolean(i?.combo_id || i?.isCombo || (i?.combo_details && i.combo_details !== 'null'))
      );
      if (mightHaveCombos && window.electronAPI?.dbGetComboOffers) {
        if (combosCacheRef.current && Date.now() - combosCacheRef.current.timestamp < 60000) {
          combosList = combosCacheRef.current.data;
        } else {
          try {
            const allCombos = await withTimeout(
              window.electronAPI.dbGetComboOffers({ tenant_id: effectiveTenantId }),
              1500,
              []
            );
            if (Array.isArray(allCombos)) {
              combosList = allCombos;
              combosCacheRef.current = { data: allCombos, timestamp: Date.now() };
            }
          } catch {
            // ignore combo lookup failure
          }
        }
      }

      const nonService = invoiceItems.filter((i: any) => !i?.is_service_item);
      const productIds = [...new Set(nonService.map((i: any) => i?.product_id).filter(Boolean))] as string[];
      const missingProductIds = productIds.filter(id => !productsCacheRef.current.has(id));

      if (missingProductIds.length > 0 && window.electronAPI?.dbGetProductsByIds) {
        try {
          const products = await withTimeout(
            window.electronAPI.dbGetProductsByIds({ tenant_id: effectiveTenantId, product_ids: missingProductIds }),
            1500,
            []
          );
          if (Array.isArray(products)) {
            products.forEach((p: any) => { if (p?.product_id) productsCacheRef.current.set(p.product_id, p); });
          }
        } catch {
          // ignore product lookup failures
        }
      }

      const productMap: Record<string, any> = {};
      productIds.forEach(id => {
        const p = productsCacheRef.current.get(id);
        if (p) productMap[id] = p;
      });

      return invoiceItems.map(item => {
        try {
          let comboItemsParsed: any[] | undefined = undefined;
          if (item?.combo_details) {
            try {
              const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
              if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
            } catch {}
          }

          const itemNameClean = String(item?.name || '').toLowerCase().trim();
          const matchedCombo = combosList.find((c: any) => {
            const cNameClean = String(c?.name || '').toLowerCase().trim();
            return (item?.combo_id && c?.combo_id === item.combo_id) ||
              (cNameClean && itemNameClean && cNameClean === itemNameClean) ||
              (item?.product_id && c?.combo_id === item.product_id);
          });

          if (!comboItemsParsed && matchedCombo && matchedCombo.items) {
            comboItemsParsed = matchedCombo.items;
          }

          const isComboItem = Boolean(item?.combo_id || matchedCombo || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));

          const p = item?.is_service_item ? null : productMap[item?.product_id];
          const mrp = p ? (p.pricing_mode === 'GRADE_RATE' && Number(p.grade_rate) > 0 ? Number(p.grade_rate) : (Number(p.base_price) || 0)) : 0;
          const soldPrice = Number(item?.unit_price) || 0;
          let originalRate: number | undefined;
          let discountLabel: string | undefined;
          let isPriceOverride = false;
          if (mrp > 0 && soldPrice < mrp) {
            const offerPrice = p?.offer_price ? Number(p.offer_price) : null;
            const catalogDiscFlat = p?.discount_flat ? Number(p.discount_flat) : null;
            const catalogDiscPct = p?.discount_percent ? Number(p.discount_percent) : null;
            const catalogPrice = offerPrice !== null ? offerPrice
              : catalogDiscFlat !== null ? mrp - catalogDiscFlat
              : catalogDiscPct !== null ? mrp * (1 - catalogDiscPct / 100)
              : mrp;

            if (offerPrice !== null && Math.abs(offerPrice - soldPrice) < 0.01) {
              originalRate = mrp;
              discountLabel = 'Offer';
              isPriceOverride = false;
            } else if (catalogPrice < mrp && Math.abs(catalogPrice - soldPrice) < 0.01) {
              originalRate = mrp;
              discountLabel = catalogDiscFlat ? `-₹${catalogDiscFlat.toFixed(0)}` : catalogDiscPct ? `${catalogDiscPct}% OFF` : 'Offer';
              isPriceOverride = false;
            } else {
              const diff = mrp - soldPrice;
              if (diff >= 0.05) {
                originalRate = mrp;
                discountLabel = `-₹${diff.toFixed(0)}`;
                isPriceOverride = true;
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
            isPriceOverride,
            brand_manufacturer: p?.brand_manufacturer || item?.brand_manufacturer || undefined,
            billing_type: p?.billing_type || item?.billing_type || undefined,
            pieces_per_kg: pcsPerKg,
            hsn_sac_code: item?.hsn_sac_code || p?.hsn_sac_code || undefined,
            unit: p?.uom || item?.uom || item?.unit || undefined,
            isCombo: isComboItem,
            combo_items: comboItemsParsed,
          };
        } catch {
          return item;
        }
      });
    } catch {
      return invoiceItems;
    }
  };

  const fetchInvoiceDetails = useCallback(async (invoiceId: string): Promise<{ items: any[]; returned: any[]; canReturn: boolean }> => {
    const cached = invoiceDetailsCache.current.get(invoiceId);
    if (cached && !cached.promise) {
      return cached;
    }
    if (cached?.promise) {
      return cached.promise;
    }

    const promise = (async () => {
      if (!window.electronAPI) {
        return { items: [], returned: [], canReturn: true };
      }
      try {
        const [data, returned] = await Promise.all([
          withTimeout(
            window.electronAPI.dbGetInvoiceItems(invoiceId).catch((err: any) => {
              console.error('[SalesHistory] dbGetInvoiceItems error:', err);
              return [];
            }),
            3000,
            []
          ),
          withTimeout(
            window.electronAPI.dbGetAlreadyReturnedQuantities(invoiceId).catch((err: any) => {
              console.error('[SalesHistory] dbGetAlreadyReturnedQuantities error:', err);
              return [];
            }),
            3000,
            []
          ),
        ]);

        const invoiceItems = Array.isArray(data) ? data : [];
        const returnedMap: Record<string, number> = {};
        (Array.isArray(returned) ? returned : []).forEach((r: any) => {
          if (r?.invoice_item_id) {
            returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
          }
        });
        const fullyReturned = invoiceItems.length > 0 && invoiceItems.every((item: any) =>
          Number(item.quantity) - (returnedMap[item.item_id] || 0) <= 0
        );

        const result = {
          items: invoiceItems,
          returned: Array.isArray(returned) ? returned : [],
          canReturn: !fullyReturned,
        };

        invoiceDetailsCache.current.set(invoiceId, result);

        // Pre-enrich with MRP and combos in background
        enrichItemsWithMrp(invoiceItems).then((enriched) => {
          if (Array.isArray(enriched) && enriched.length > 0) {
            const entry = invoiceDetailsCache.current.get(invoiceId);
            if (entry) {
              entry.items = enriched;
            }
            if (selectedInvoiceIdRef.current === invoiceId) {
              setItems(enriched);
            }
          }
        }).catch(() => {});

        return result;
      } catch (e) {
        invoiceDetailsCache.current.delete(invoiceId);
        throw e;
      }
    })();

    invoiceDetailsCache.current.set(invoiceId, { items: [], returned: [], canReturn: true, promise });
    return promise;
  }, []);

  const prefetchInvoice = useCallback((invoiceId: string) => {
    if (!invoiceId) return;
    const cached = invoiceDetailsCache.current.get(invoiceId);
    if (!cached) {
      fetchInvoiceDetails(invoiceId).catch(() => {});
    }
  }, [fetchInvoiceDetails]);
  prefetchInvoiceRef.current = prefetchInvoice;

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
      if (!match && targetInvoiceId && window.electronAPI?.dbGetInvoices) {
        try {
          const res = await window.electronAPI.dbGetInvoices({
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
      if (!match && searchKey && window.electronAPI?.dbGetInvoices) {
        try {
          const res = await window.electronAPI.dbGetInvoices({
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



  /* ── Reprint handler ── */
  const handleReprint = async () => {
    if (!selectedInvoice || !window.electronAPI) return;
    try {
      const { tenantId } = useAuthStore.getState();
      const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin, shopStateVal, shopEmailVal, shopWebsiteVal] = await Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_state' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_email' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_website' }),
      ]);
      const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
      const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const invoiceType = selectedInvoice.invoice_type;
      const isB2B = Boolean(selectedInvoice.customer_gstin?.trim());
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const isHalfA4 = printFmt.format === 'half-a4';
      const isA4 = printFmt.format === 'a4';
      const useA4 = isGstOrB2B || isA4 || isHalfA4;
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };
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

      // Fetch combo offers for fallback matching on historical bill reprints
      const allCombos = await window.electronAPI.dbGetComboOffers({ tenant_id: tenantId || 'global' });
      const combosList = Array.isArray(allCombos) ? allCombos : [];

      const receiptData: ReceiptData = {
        shopName: (isGstOrB2B || billSettings.showShopName !== false) ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: (isGstOrB2B || billSettings.showShopGstin !== false) ? (shopGstin || undefined) : undefined,
        shopState: (isGstOrB2B || billSettings.showShopState !== false) ? (shopStateVal || undefined) : undefined,
        shopAddress: (isGstOrB2B || billSettings.showShopAddress !== false) ? (shopAddr || undefined) : undefined,
        shopPhone: (isGstOrB2B || billSettings.showPhone !== false) ? (shopPh || undefined) : undefined,
        shopEmail: shopEmailVal || undefined,
        shopWebsite: shopWebsiteVal || undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        showPriceOverrideMrp: printFmt?.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
        invoiceNumber: selectedInvoice.invoice_number,
        date: formatBillDateTime(selectedInvoice.created_at),
        billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (selectedInvoice.biller_name || undefined) : undefined,
        items: items.map(item => {
          let comboItemsParsed: any[] | undefined = undefined;
          if (item.combo_details) {
            try {
              const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
              if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
            } catch {}
          }
          const iName = String(item?.name || '').toLowerCase().trim();
          const matchedCombo = combosList.find((c: any) => {
            const cName = String(c?.name || '').toLowerCase().trim();
            return (item?.combo_id && c?.combo_id === item.combo_id) ||
              (cName && iName && cName === iName) ||
              (item?.product_id && c?.combo_id === item.product_id);
          });
          if (!comboItemsParsed && matchedCombo && matchedCombo.items) {
            comboItemsParsed = matchedCombo.items;
          }
          const isComboItem = Boolean(item.combo_id || matchedCombo || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));
          const itemCgstR = Number(item.cgst_rate) || 0;
          const itemSgstR = Number(item.sgst_rate) || 0;
          const itemIgstR = Number(item.igst_rate) || 0;
          const rawRate = Number(item.tax_rate) || (itemCgstR + itemSgstR + itemIgstR);
          let calcRate = rawRate;
          const iTax = Number(item.tax_amount) || 0;
          if (!calcRate || calcRate <= 0) {
            const baseVal = (Number(item.unit_price) * Number(item.quantity)) || (Number(item.total) - iTax);
            if (baseVal > 0 && iTax > 0) {
              calcRate = Math.round((iTax / baseVal) * 100 * 10) / 10;
            }
          }
          const itemTaxPct = calcRate > 0 ? calcRate : 0;
          const hsnVal = item.hsn_sac_code || item.hsn_code || item.hsn || '';

          return {
            name: item.name,
            quantity: Number(item.quantity) || 0,
            unit_price: item.unit_price,
            total: item.total,
            originalRate: item.originalRate,
            discountLabel: item.discountLabel,
            brand: item.brand_manufacturer || undefined,
            billing_type: item.billing_type,
            pieces_sold: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
            pieces_override: item.pieces_override != null ? Number(item.pieces_override) : undefined,
            pieces_per_kg: item.pieces_per_kg,
            unit: item.unit,
            hsn: hsnVal || undefined,
            hsn_code: hsnVal || undefined,
            hsn_sac_code: hsnVal || undefined,
            tax_rate_percent: itemTaxPct || undefined,
            gst_percent: itemTaxPct || undefined,
            cgst_rate: itemCgstR || (isInterState ? 0 : itemTaxPct / 2) || undefined,
            sgst_rate: itemSgstR || (isInterState ? 0 : itemTaxPct / 2) || undefined,
            igst_rate: itemIgstR || (isInterState ? itemTaxPct : 0) || undefined,
            cgst_amount: Number(item.cgst_amount) || (isInterState ? 0 : iTax / 2) || undefined,
            sgst_amount: Number(item.sgst_amount) || (isInterState ? 0 : iTax / 2) || undefined,
            igst_amount: Number(item.igst_amount) || (isInterState ? iTax : 0) || undefined,
            isCombo: isComboItem,
            combo_items: comboItemsParsed,
          };
        }),
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
        receivedAmount: selectedInvoice.received_amount != null ? Number(selectedInvoice.received_amount) : undefined,
        paymentMethod: selectedInvoice.payment_method,
        balanceAmount: (() => {
          if (selectedInvoice.balance_amount == null) return undefined;
          const rawBal = Number(selectedInvoice.balance_amount);
          const pmUpper = (selectedInvoice.payment_method || '').toUpperCase();
          if (pmUpper !== 'CREDIT' && pmUpper !== 'SPLIT' && rawBal < 0) return 0;
          return rawBal;
        })(),
        customerName: (isGstOrB2B || billSettings.showCustomerName !== false) ? (selectedInvoice.customer_name || undefined) : undefined,
        customerPhone: (isGstOrB2B || billSettings.showCustomerPhone !== false) ? (selectedInvoice.customer_phone || undefined) : undefined,
        customerAddress: (isGstOrB2B || billSettings.showCustomerAddress !== false) ? (selectedInvoice.customer_address || undefined) : undefined,
        customerGstin: selectedInvoice.customer_gstin?.trim() || undefined,
        billSettings,
        isB2B,
        a5Orientation: printFmt.a5Orientation || 'horizontal',
        customerState: (isGstOrB2B || billSettings.showCustomerState !== false) ? (selectedInvoice.customer_state || undefined) : undefined,
        description: selectedInvoice.description || selectedInvoice.notes || undefined,
        notes: selectedInvoice.notes || selectedInvoice.description || undefined,
      };
      if (useA4) {
        const invoiceStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
        const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as any);
        const printResult = await window.electronAPI.printA4Html(tenantId || 'global', invoiceHtml);
        if (!printResult.success) {
          if ((printResult as any).useDefaultDialog) {
            const pw = window.open('', '_blank');
            if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
          } else {
            showToast(formatPrinterError(printResult.error), 'error');
            return;
          }
        }
      } else {
        const thermalWidth = printFmt.width ? Number(printFmt.width) / 10 : receiptWidthCm;
        const thermalStyle = printFmt.thermalStyle || (printFmt.format === 'thermal' ? printFmt.style : undefined) || 'standard';
        const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
        const printResult = await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
        if ((printResult as any)?.skipped) {
          showToast(formatPrinterError('No printer configured'), 'error');
          return;
        } else if (printResult && !printResult.success) {
          showToast(formatPrinterError(printResult.error), 'error');
          return;
        }
      }
      setReprintSuccess(true);
    } catch (err) {
      console.error('Failed to reprint', err);
    }
  };

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const handleSendWhatsAppInvoice = async () => {
    if (!selectedInvoice || !window.electronAPI) return;
    const custPhone = (selectedInvoice.customer_phone || '').trim();
    if (!custPhone) {
      showToast('Customer does not have a phone number saved on this bill', 'error');
      return;
    }
    if (!window.electronAPI.whatsappSendInvoice) {
      showToast('WhatsApp service not available', 'error');
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const { tenantId } = useAuthStore.getState();
      const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin, shopStateVal, shopEmailVal, shopWebsiteVal] = await Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_state' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_email' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_website' }),
      ]);
      const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const invoiceType = selectedInvoice.invoice_type;
      const isB2B = Boolean(selectedInvoice.customer_gstin?.trim());
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const isHalfA4 = printFmt.format === 'half-a4';
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };
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
        shopName: (isGstOrB2B || billSettings.showShopName !== false) ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: (isGstOrB2B || billSettings.showShopGstin !== false) ? (shopGstin || undefined) : undefined,
        shopState: (isGstOrB2B || billSettings.showShopState !== false) ? (shopStateVal || undefined) : undefined,
        shopAddress: (isGstOrB2B || billSettings.showShopAddress !== false) ? (shopAddr || undefined) : undefined,
        shopPhone: (isGstOrB2B || billSettings.showPhone !== false) ? (shopPh || undefined) : undefined,
        shopEmail: shopEmailVal || undefined,
        shopWebsite: shopWebsiteVal || undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        invoiceNumber: selectedInvoice.invoice_number,
        date: formatBillDateTime(selectedInvoice.created_at),
        billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (selectedInvoice.biller_name || undefined) : undefined,
        items: items.map(item => ({
          name: item.name,
          quantity: Number(item.quantity) || 0,
          unit_price: item.unit_price,
          total: item.total,
          originalRate: item.originalRate,
          discountLabel: item.discountLabel,
          brand: item.brand_manufacturer || undefined,
          billing_type: item.billing_type,
          pieces_sold: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
          unit: item.unit,
        })),
        subtotal: selectedInvoice.subtotal,
        tax: selectedInvoice.tax_total,
        cgst,
        sgst,
        igst,
        discount: selectedInvoice.discount_total,
        discountType: selectedInvoice.discount_type,
        discountValue: selectedInvoice.discount_value,
        grandTotal: baseGrandTotal,
        scrapDeduction: scrapD > 0 ? scrapD : undefined,
        scrapInvoiceNumber: selectedInvoice.scrap_invoice_number || undefined,
        returnDeduction: returnD > 0 ? returnD : undefined,
        returnInvoiceNumber: selectedInvoice.return_invoice_number || undefined,
        invoiceType,
        receivedAmount: selectedInvoice.received_amount != null ? Number(selectedInvoice.received_amount) : undefined,
        paymentMethod: selectedInvoice.payment_method,
        balanceAmount: Number(selectedInvoice.balance_amount) || 0,
        customerName: selectedInvoice.customer_name || undefined,
        customerPhone: custPhone,
        customerAddress: selectedInvoice.customer_address || undefined,
        customerGstin: selectedInvoice.customer_gstin?.trim() || undefined,
        billSettings,
        isB2B,
      };

      const invoiceStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
      const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as any);

      const waMessage = formatWhatsAppBillMessage({
        shopName: shopNameVal || useAuthStore.getState().shopName || 'Store',
        invoiceNumber: selectedInvoice.invoice_number,
        date: formatBillDateTime(selectedInvoice.created_at),
        customerName: selectedInvoice.customer_name || undefined,
        customerPhone: custPhone,
        items: items.map(i => ({
          name: i.name,
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price) || 0,
          total: Number(i.total) || 0
        })),
        grandTotal: baseGrandTotal,
        receivedAmount: selectedInvoice.received_amount != null ? Number(selectedInvoice.received_amount) : undefined,
        balanceAmount: Number(selectedInvoice.balance_amount) || 0,
        paymentMethod: selectedInvoice.payment_method,
      });

      const res = await window.electronAPI.whatsappSendInvoice({
        phone: custPhone,
        message: waMessage,
        htmlContent: invoiceHtml,
        fileName: "Invoice_" + selectedInvoice.invoice_number + ".pdf"
      });

      if (res?.success) {
        showToast("Invoice sent via WhatsApp to " + custPhone + "!", 'success');
      } else {
        showToast("WhatsApp Send Failed: " + (res?.error || 'Unknown error'), 'error');
      }
    } catch (err: any) {
      console.error('WhatsApp send invoice error:', err);
      showToast("WhatsApp error: " + (err?.message || 'Failed to send'), 'error');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleEditBill = async () => {
    const { role, permissions } = useAuthStore.getState();
    if (!hasPermission({ role, permissions }, 'sales.edit')) {
      showToast('Permission Denied: You do not have permission to edit bills', 'error');
      return;
    }
    if (!window.electronAPI || !selectedInvoice) return;
    let currentItems = items;
    if (!currentItems.length) {
      const data = await window.electronAPI.dbGetInvoiceItems(selectedInvoice.invoice_id);
      currentItems = Array.isArray(data) ? data : [];
    }
    let freshInvoice = selectedInvoice;
    if (window.electronAPI.dbGetInvoices) {
      try {
        const fetched = await window.electronAPI.dbGetInvoices({ search: selectedInvoice.invoice_number || selectedInvoice.invoice_id, tenant_id: selectedInvoice.tenant_id });
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
    if (!window.electronAPI || !selectedInvoice) return;
    setDeleteSaving(true);
    try {
      const result = await window.electronAPI.dbDeleteInvoice(selectedInvoice.invoice_id);
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
    if (!window.electronAPI || !selectedInvoice) return;
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

      const result = await window.electronAPI.dbUpdateInvoicePayment({
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

  const handleExportCSV = async () => {
    if (!window.electronAPI) return;
    setIsExporting(true);
    setExportStatusMsg('Fetching all matching records…');
    try {
      const { userId, role, tenantId, restrictedPage } = useAuthStore.getState();
      const isBiller = role === 'BILLER';
      const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
      const hasGstInvoicesOnly = isBiller && permissions.includes('OPT_VIEW_GST_INVOICES_ONLY');
      const effectiveInvoiceType = hasGstInvoicesOnly
        ? (invoiceTypeFilter && invoiceTypeFilter !== 'BILL_OF_SUPPLY' ? invoiceTypeFilter : 'GST')
        : accountingView === 'REAL_SALES'
          ? 'BILL_OF_SUPPLY'
          : (invoiceTypeFilter || undefined);

      const data = await window.electronAPI.dbGetInvoices({
        user_id: userId, tenant_id: tenantId, role,
        limit: 99999, offset: 0,
        search: search || undefined,
        payment_method: paymentFilter || undefined,
        invoice_type: effectiveInvoiceType,
        tax_rate_percent: accountingView === 'REAL_SALES' ? undefined : (taxPercentageFilter || undefined),
        filterDate: filterDate || undefined,
        filterDateEnd: filterDateEnd || undefined,
        accounting_view: accountingView,
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
        if (inv.invoice_type === 'GST' && inv.customer_gstin) return 'GST B2B';
        if (inv.invoice_type === 'GST') return 'GST B2C';
        return 'Bill of Supply';
      };

      let csvContent: string;
      let filename: string;
      let exportedCount = 0;

      const parts: string[] = ['sales_report'];
      parts.push(accountingView.toLowerCase().replace('_', '-'));
      if (invoiceTypeFilter) parts.push(invoiceTypeFilter.replace('_', '-').toLowerCase());
      if (paymentFilter) parts.push(paymentFilter.toLowerCase());
      if (taxPercentageFilter) parts.push(`${taxPercentageFilter}pct`);
      if (filterDate) parts.push(filterDate);
      if (filterDateEnd && filterDateEnd !== filterDate) parts.push(`to-${filterDateEnd}`);
      parts.push(new Date().toLocaleDateString('en-CA'));
      filename = parts.join('_') + '.csv';

      const headers = [
        'Invoice No.',
        'Invoice Date',
        'Invoice Time',
        'Invoice Type',
        'Customer Name',
        'Customer Phone',
        'Customer GSTIN',
        'Place of Supply / State',
        'Payment Method',
        'Product / Item Name',
        'HSN / SAC Code',
        'Quantity',
        'UOM',
        'Unit Price (₹)',
        'Discount (₹)',
        'Taxable Amount (₹)',
        'Total GST %',
        'Total GST (₹)',
        'CGST %',
        'CGST (₹)',
        'SGST %',
        'SGST (₹)',
        'IGST %',
        'IGST (₹)',
        'Item Total (₹)',
        taxFilterActive ? 'Filtered Product Total (₹)' : 'Invoice Grand Total (₹)',
        'Biller Name',
        'Description / Remarks'
      ];

      const itemRows: string[][] = [];
      let totalQtySum = 0;
      let totalTaxableSum = 0;
      let totalGstSum = 0;
      let totalCgstSum = 0;
      let totalSgstSum = 0;
      let totalIgstSum = 0;
      let totalItemSum = 0;
      let totalInvoiceGrandSum = 0;

      const targetTaxRate = taxFilterActive ? Number(taxPercentageFilter) : null;
      const exportData = taxFilterActive && accountingView === 'ALL'
        ? data.filter((inv: any) => !inv.converted_from_invoice_id)
        : data;
      const sortedData = sortInvoicesByInvoiceNumber(exportData);

      for (const inv of sortedData) {
        const { date, time } = formatDate(inv.created_at);
        const typeLabel = getTypeLabel(inv);

        let items = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
        if (!Array.isArray(items)) items = [];

        const missingHsnProductIds = items.filter((it: any) => !it.hsn_sac_code && it.product_id).map((it: any) => it.product_id);
        const fallbackProductMap: Record<string, any> = {};
        if (missingHsnProductIds.length > 0) {
          try {
            const fetched = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId || 'global', product_ids: missingHsnProductIds });
            if (Array.isArray(fetched)) {
              fetched.forEach((p: any) => { if (p?.product_id) fallbackProductMap[p.product_id] = p; });
            }
          } catch {}
        }

        const productRows = buildInvoiceProductRows(inv, items);
        const rowsToExport = targetTaxRate !== null
          ? productRows.filter(row => Math.round(row.gstRate) === Math.round(targetTaxRate))
          : productRows;

        if (rowsToExport.length === 0) continue;

        if (targetTaxRate === null) {
          totalInvoiceGrandSum += getInvoiceNetTotal(inv);
        }

        for (const row of rowsToExport) {
          const item = row.item || {};
          const hsn = row.hsn || fallbackProductMap[item.product_id]?.hsn_sac_code || '';
          const uom = item.uom || item.unit || fallbackProductMap[item.product_id]?.uom || row.uom || 'PCS';
          const invoiceTotal = targetTaxRate === null ? getInvoiceNetTotal(inv) : row.total;

          totalQtySum += row.quantity;
          totalTaxableSum += row.taxable;
          totalGstSum += row.tax;
          totalCgstSum += row.cgstAmount;
          totalSgstSum += row.sgstAmount;
          totalIgstSum += row.igstAmount;
          totalItemSum += row.total;
          if (targetTaxRate !== null) totalInvoiceGrandSum += row.total;

          itemRows.push([
            escape(inv.invoice_number),
            escape(date),
            escape(time),
            escape(typeLabel),
            escape(inv.customer_name || 'Walk-in'),
            escape(inv.customer_phone || '-'),
            escape(inv.customer_gstin || '-'),
            escape(inv.customer_state || '-'),
            escape(PAYMENT_LABELS[inv.payment_method] || inv.payment_method || 'CASH'),
            escape(row.name || 'Item'),
            escape(hsn || '-'),
            escape(row.quantity.toFixed(3)),
            escape(uom),
            escape(row.unitPrice.toFixed(2)),
            escape(row.discount.toFixed(2)),
            escape(row.taxable.toFixed(2)),
            escape(row.gstRate > 0 ? `${row.gstRate}%` : '0%'),
            escape(row.tax.toFixed(2)),
            escape(row.cgstRate > 0 ? `${row.cgstRate}%` : '0%'),
            escape(row.cgstAmount.toFixed(2)),
            escape(row.sgstRate > 0 ? `${row.sgstRate}%` : '0%'),
            escape(row.sgstAmount.toFixed(2)),
            escape(row.igstRate > 0 ? `${row.igstRate}%` : '0%'),
            escape(row.igstAmount.toFixed(2)),
            escape(row.total.toFixed(2)),
            escape(invoiceTotal.toFixed(2)),
            escape(inv.biller_name || ''),
            escape(inv.description || inv.notes || ''),
          ]);
        }
      }

      if (itemRows.length > 0) {
        itemRows.push([
          escape('TOTAL'),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(`Total Records: ${itemRows.length}`),
          escape(''),
          escape(totalQtySum.toFixed(3)),
          escape(''),
          escape(''),
          escape(''),
          escape(totalTaxableSum.toFixed(2)),
          escape(''),
          escape(totalGstSum.toFixed(2)),
          escape(''),
          escape(totalCgstSum.toFixed(2)),
          escape(''),
          escape(totalSgstSum.toFixed(2)),
          escape(''),
          escape(totalIgstSum.toFixed(2)),
          escape(totalItemSum.toFixed(2)),
          escape(totalInvoiceGrandSum.toFixed(2)),
          escape(''),
          escape(''),
        ]);
      }

      csvContent = [headers.join(','), ...itemRows.map(r => r.join(','))].join('\n');
      exportedCount = itemRows.length > 0 ? itemRows.length - 1 : 0;

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
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          {/* Left Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <TrendingUp className="w-4 h-4" />
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
          <div className="flex items-center bg-muted/60 dark:bg-muted/30 p-1 rounded-2xl border border-border/80 gap-1 shadow-inner backdrop-blur-xs">
            <button
              type="button"
              onClick={() => setViewMode('bills')}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer active:scale-[0.98]',
                viewMode === 'bills'
                  ? 'bg-card text-foreground border border-border shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
              )}
            >
              <Receipt className={clsx('w-3.5 h-3.5 transition-colors', viewMode === 'bills' ? 'text-primary' : 'text-muted-foreground')} />
              <span>Bills List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('analytics')}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer active:scale-[0.98]',
                viewMode === 'analytics'
                  ? 'bg-card text-foreground border border-border shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
              )}
            >
              <BarChart3 className={clsx('w-3.5 h-3.5 transition-colors', viewMode === 'analytics' ? 'text-violet-500' : 'text-muted-foreground')} />
              <span>Analytics &amp; Graph</span>
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {maskingConfig.enabled && !isStaff && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs select-none" title="Staff masking is active for staff accounts. Genuine owner figures shown here.">
                <Shield className="w-3 h-3" /> Staff Masking Active
              </span>
            )}

            {shouldMask && maskingConfig.sales_history_scope !== 'ALL' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 shadow-2xs select-none" title="Historical date range restricted by store policy">
                <Lock className="w-3.5 h-3.5" />
                <span>Scope: {staffDateScope.scopeLabel}</span>
              </div>
            ) : (
              <DateRangeFilter
                startDate={filterDate}
                endDate={filterDateEnd}
                onChange={(start, end) => { setFilterDate(start); setFilterDateEnd(end); }}
                align="right"
                triggerClassName="h-8.5 px-3 rounded-xl text-xs font-semibold bg-background border-border/80 hover:bg-muted/40 shadow-2xs"
              />
            )}

            {hasPermission({ role, permissions }, 'sales.view') && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-recycle-bin', { detail: { initialCategory: 'SALES_BILLS' } }));
                }}
                title="Open Recycle Bin to view and restore deleted bills"
                className="h-8.5 px-3 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border flex items-center gap-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 hover:bg-rose-500/20 active:scale-95 shrink-0 shadow-2xs hover:shadow-rose-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Recycle Bin</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={isExporting}
              title="Export filtered invoices to CSV"
              className="h-8.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-2xs hover:shadow-emerald-500/10"
            >
              {isExporting
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />
              }
              <span>{isExporting ? 'Exporting…' : 'Export CSV'}</span>
            </button>

            <button
              type="button"
              onClick={isRestricted ? () => useAuthStore.getState().logout() : onClose}
              className="h-8.5 w-8.5 rounded-xl border border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/15 transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
              title="Close"
            >
              <X className="w-4 h-4" />
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
            {/* Action Buttons */}
            <div className="flex items-center justify-end p-2.5 sm:p-3 bg-muted/30 border border-border rounded-2xl">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {(() => {
                  const isBos = selectedInvoice.invoice_type === 'BILL_OF_SUPPLY';
                  const isNotConverted = !selectedInvoice.converted_to_invoice_id;
                  const isKnownExcluded = convertibleMap[selectedInvoice.invoice_id] === false;
                  const isEligible = isBos && isNotConverted && !isKnownExcluded && (
                    convertibleMap[selectedInvoice.invoice_id] === true ||
                    (items.length > 0 && items.some((it: any) => 
                      Number(it?.tax_amount) > 0 || 
                      Number(it?.cgst_rate) > 0 || 
                      Boolean(it?.hsn_sac_code) || 
                      Number(it?.product_tax_rate_percent) > 0
                    )) ||
                    (itemsLoading && convertibleMap[selectedInvoice.invoice_id] !== false)
                  );

                  if (!enableConvertToGst || !isEligible || !isAdminRole(useAuthStore.getState().role)) return null;

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInvoiceIds(new Set([selectedInvoice.invoice_id]));
                        setDrawerOpen(false);
                        setConversionOpen(true);
                      }}
                      className="flex items-center justify-center gap-1.5 px-3.5 h-8.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all text-xs font-bold border border-amber-500/40 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs shadow-amber-500/20"
                      title="Convert this eligible Bill of Supply to a GST Invoice"
                    >
                      <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      <span>Convert to GST</span>
                    </button>
                  );
                })()}
                {hasPermission(useAuthStore.getState(), 'sales.edit') && (
                  <button
                    type="button"
                    onClick={handleEditBill}
                    className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-all text-xs font-bold border border-amber-500/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
                  >
                    <Edit3 className="w-3.5 h-3.5 shrink-0" />
                    <span>Edit Bill</span>
                  </button>
                )}
                {hasPermission(useAuthStore.getState(), 'sales.delete') && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-xl transition-all text-xs font-bold border border-red-500/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Delete</span>
                  </button>
                )}
                {(isAdminRole(useAuthStore.getState().role) || hasPermission(useAuthStore.getState(), 'sales.refund')) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!canReturn) return;
                      // Store invoice ref and close — BillingPage will open in return mode
                      localStorage.setItem('returnBillData', JSON.stringify({ invoice: selectedInvoice }));
                      // Switch OWNER to BILLER so BillingPage renders (not OwnerDashboard)
                      if (isAdminRole(useAuthStore.getState().role)) {
                        useCartStore.getState().setRole('BILLER');
                      }
                      closeDrawer();
                      onClose();
                      setTimeout(() => window.dispatchEvent(new CustomEvent('open-return-mode')), 100);
                    }}
                    disabled={!canReturn}
                    title={canReturn ? undefined : 'All items in this bill have already been returned'}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 px-3 h-8.5 rounded-xl transition-all text-xs font-bold border cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs',
                      canReturn
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border-red-500/25'
                        : 'bg-muted/40 text-muted-foreground/50 border-border/60 cursor-not-allowed'
                    )}
                  >
                    <Package className="w-3.5 h-3.5 shrink-0" />
                    <span>{canReturn ? 'Return' : 'Returned'}</span>
                  </button>
                )}
                {selectedInvoice.payment_method === 'PENDING' && (
                  <button
                    type="button"
                    onClick={openCollectPayment}
                    className="flex items-center justify-center gap-1.5 px-3.5 h-8.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all text-xs font-bold border border-emerald-500/40 cursor-pointer active:scale-95 whitespace-nowrap shadow-xs shadow-emerald-600/20"
                  >
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    <span>Collect Payment</span>
                  </button>
                )}
                {selectedInvoice.payment_method !== 'PENDING' && isAdminRole(useAuthStore.getState().role) && (
                  <button
                    type="button"
                    onClick={openCollectPayment}
                    className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 rounded-xl transition-all text-xs font-bold border border-violet-500/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
                    title="Change Payment Method (Admin Only)"
                  >
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    <span>Change Payment</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleReprint}
                  className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-xs font-bold border border-primary/25 cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Reprint</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsAppInvoice}
                  disabled={isSendingWhatsApp}
                  className="flex items-center justify-center gap-1.5 px-3 h-8.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 rounded-xl transition-all text-xs font-bold border border-emerald-500/25 cursor-pointer active:scale-95 whitespace-nowrap disabled:opacity-50 shadow-2xs"
                  title="Send Invoice PDF via WhatsApp"
                >
                  {isSendingWhatsApp ? (
                    <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
                  ) : (
                    <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600 shrink-0" />
                  )}
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Linked Conversion Banner */}
            {selectedInvoice.converted_to_invoice_id && (
              <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400 shrink-0">
                    <Building className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-violet-700 dark:text-violet-300">GST Invoice Linked for Tax Filing</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Statutory GST Invoice: <span className="font-mono font-bold text-foreground">{selectedInvoice.converted_to_invoice_number || selectedInvoice.converted_to_invoice_id}</span> • Original counter sale remains your true business record.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleViewLinkedInvoice(selectedInvoice.converted_to_invoice_id, selectedInvoice.converted_to_invoice_number)}
                  className="px-3.5 h-8 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>View GST Copy</span>
                </button>
              </div>
            )}
            {selectedInvoice.converted_from_invoice_id && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-700 dark:text-emerald-300">Statutory GST Filing Invoice</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Generated from Original Counter Sale: <span className="font-mono font-bold text-foreground">{selectedInvoice.converted_from_invoice_number || selectedInvoice.converted_from_invoice_id}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleViewLinkedInvoice(selectedInvoice.converted_from_invoice_id, selectedInvoice.converted_from_invoice_number)}
                  className="px-3.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>View Original Sale</span>
                </button>
              </div>
            )}

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
                <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground space-y-0.5">
                  {(selectedInvoice.biller_staff_name || selectedInvoice.biller_name) && (
                    <div>Biller: <span className="font-bold text-foreground">{selectedInvoice.biller_staff_name || selectedInvoice.biller_name}</span></div>
                  )}
                  {selectedInvoice.created_at && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span>
                        <span className="font-bold text-foreground">{formatDate(selectedInvoice.created_at).date}</span>
                        <span className="opacity-60 mx-1">at</span>
                        <span className="font-bold text-foreground">{formatDate(selectedInvoice.created_at).time}</span>
                      </span>
                    </div>
                  )}
                  {selectedInvoice.sales_staff_name && (
                    <div>Sales Handler: <span className="font-bold text-foreground">{selectedInvoice.sales_staff_name}</span></div>
                  )}
                </div>
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
                  const upiDetail = getUpiDetailsFromInvoice(selectedInvoice, upiSources);
                  if ((selectedInvoice.payment_method === 'UPI' || (selectedInvoice.payment_method === 'SPLIT' && (Number(parseSplitDetails(selectedInvoice.split_details)?.upi) || 0) > 0)) && upiDetail) {
                    return (
                      <div className="text-xs font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1.5 pt-0.5">
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        <span>Account: <strong className="font-black text-foreground">{upiDetail.label}</strong></span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  const sd = parseSplitDetails(selectedInvoice.split_details);
                  const splitItems = sd ? [
                    { label: 'Cash', value: Number(sd.cash) || 0, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                    { label: 'Card', value: Number(sd.card) || 0, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
                    { label: 'UPI', value: Number(sd.upi) || 0, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
                    { label: 'Credit', value: Number(sd.credit) || 0, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
                    { label: 'Bank', value: Number(sd.bank_transfer || sd.bank) || 0, color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
                  ].filter(i => i.value > 0) : [];

                  const rawOldDue = sd?.old_due ?? sd?.old_balance ?? sd?.oldBalance ?? (selectedInvoice as any).old_balance ?? (selectedInvoice as any).old_due;
                  const rawNewDue = sd?.new_due ?? sd?.new_balance ?? sd?.customerBalance ?? (selectedInvoice as any).customer_balance ?? (selectedInvoice as any).new_due;
                  const received = Number(selectedInvoice.received_amount) || 0;
                  const balance = Number(selectedInvoice.balance_amount) || 0;
                  const changeReturned = Math.max(0, received - (Number(selectedInvoice.grand_total) || 0));
                  const isCredit = selectedInvoice.payment_method === 'CREDIT';
                  const isPending = selectedInvoice.payment_method === 'PENDING';
                  const customerName = String(selectedInvoice.customer_name || '').trim();
                  const hasNamedCustomer = customerName !== '' && !/^walk[- ]in customer$/i.test(customerName);
                  const isWalkInCustomer = !(
                    hasNamedCustomer ||
                    String(selectedInvoice.customer_phone || '').trim() ||
                    String(selectedInvoice.customer_address || '').trim() ||
                    String(selectedInvoice.customer_gstin || '').trim() ||
                    selectedInvoice.customer_id ||
                    selectedInvoice.party_id
                  );

                  let oldDueNum = rawOldDue != null ? Number(rawOldDue) : null;
                  const newDueNum = rawNewDue != null ? Number(rawNewDue) : (isCredit ? Math.abs(balance) : null);

                  if ((oldDueNum == null || oldDueNum === 0) && newDueNum != null && selectedInvoice) {
                    const gTotal = Number(selectedInvoice.grand_total) || 0;
                    const totalPaid = (splitItems.length > 0
                      ? splitItems.filter(i => i.label !== 'Credit').reduce((sum, i) => sum + i.value, 0)
                      : Number(selectedInvoice.received_amount) || 0);
                    const netChange = gTotal - totalPaid;
                    const calcOld = newDueNum - netChange;
                    if (calcOld !== 0 && !isNaN(calcOld)) {
                      oldDueNum = calcOld;
                    }
                  }

                  if (isPending) {
                    return <div className="text-[10px] text-gray-500 font-semibold pt-1">Awaiting payment at counter</div>;
                  }

                  return (
                    <div className="pt-2 space-y-1.5 border-t border-border/50 mt-1.5">
                      {/* Old Due */}
                      {!isWalkInCustomer && oldDueNum != null && oldDueNum !== 0 && (
                        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                          <span className="text-amber-700 dark:text-amber-300 font-extrabold uppercase tracking-wider text-[10px]">OLD DUE:</span>
                          <span className="font-mono font-black text-amber-700 dark:text-amber-300 text-sm">{formatCurrency(oldDueNum)}</span>
                        </div>
                      )}

                      {/* Split Breakdown */}
                      {splitItems.length > 0 && (
                        <div className="space-y-1 pt-0.5">
                          <div className="text-[9.5px] font-black uppercase tracking-wider text-muted-foreground">Payment Breakdown</div>
                          <div className="flex flex-wrap gap-1">
                            {splitItems.map(item => (
                              <span key={item.label} className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-extrabold', item.color)}>
                                {item.label}: {formatCurrency(item.value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Received & Change */}
                      <div className="text-[11px] text-muted-foreground space-y-0.5 font-medium">
                        {received > 0 && (
                          <div className="flex justify-between items-center">
                            <span>Received Amount:</span>
                            <span className="font-bold text-foreground">{formatCurrency(received)}</span>
                          </div>
                        )}
                        {!isCredit && changeReturned > 0 && (
                          <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-bold">
                            <span>Change Returned:</span>
                            <span>{formatCurrency(changeReturned)}</span>
                          </div>
                        )}
                      </div>

                      {/* New Due */}
                      {!isWalkInCustomer && newDueNum != null && (isCredit || selectedInvoice.payment_method === 'SPLIT' || (oldDueNum != null && oldDueNum !== 0)) && (
                        <div className="flex items-center justify-between text-xs font-extrabold text-foreground pt-1.5 border-t border-border/50 bg-amber-500/10 dark:bg-amber-500/20 px-2 py-1 rounded-lg">
                          <span className="text-amber-600 dark:text-amber-400 uppercase tracking-wider text-[10px]">New Due:</span>
                          <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-sm">{formatCurrency(newDueNum)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Bill Description / Remarks */}
            {(selectedInvoice.description || selectedInvoice.notes) && (
              <div className="p-3.5 rounded-xl border border-primary/25 bg-primary/5 space-y-1 shadow-xs">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>Bill Description / Remarks</span>
                </div>
                <div className="text-xs font-semibold text-foreground whitespace-pre-wrap leading-relaxed">
                  {selectedInvoice.description || selectedInvoice.notes}
                </div>
              </div>
            )}

            {/* Items */}
            {(() => {
              const isGstBill = selectedInvoice.invoice_type === 'GST';

              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Order Items
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="border border-border rounded-xl overflow-x-auto bg-card">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        {isGstBill ? (
                          <tr className="bg-muted/40 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground select-none">
                            <th className="px-3 py-2.5 min-w-[160px]">Item & HSN</th>
                            <th className="px-2 py-2.5 text-center whitespace-nowrap">Qty</th>
                            <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Unit Rate (Excl.)</th>
                            <th className="px-2.5 py-2.5 text-right whitespace-nowrap">CGST / SGST</th>
                            <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Taxable Value</th>
                            <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Unit Rate (Incl.)</th>
                            <th className="px-3 py-2.5 text-right whitespace-nowrap">Total</th>
                          </tr>
                        ) : (
                          <tr className="bg-muted/40 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none">
                            <th className="px-4 py-2.5 min-w-[180px]">Item</th>
                            <th className="px-2 py-2.5 text-center whitespace-nowrap">Qty</th>
                            <th className="px-3 py-2.5 text-right whitespace-nowrap">Rate</th>
                            <th className="px-4 py-2.5 text-right whitespace-nowrap">Total</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {itemsLoading ? (
                          <tr>
                            <td colSpan={isGstBill ? 7 : 4} className="py-8 text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                <span className="text-xs font-medium">Loading items…</span>
                              </div>
                            </td>
                          </tr>
                        ) : items.length === 0 ? (
                          <tr>
                            <td colSpan={isGstBill ? 7 : 4} className="py-8 text-center text-muted-foreground">
                              <p className="text-xs">No items found for this bill</p>
                            </td>
                          </tr>
                        ) : items.map((item, i) => {
                          let comboItemsParsed: any[] | undefined = item.combo_items;
                          if (!comboItemsParsed && item.combo_details) {
                            try {
                              const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
                              if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
                            } catch {}
                          }
                          const isComboItem = Boolean(item.isCombo || item.combo_id || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));

                          const itemTax = Number(item.tax_amount) || 0;
                          const itemTotal = Number(item.total) || 0;
                          const qty = Number(item.quantity) || 1;
                          const unitPriceExcl = Number(item.unit_price) || 0;
                          const itemCgstRate = Number(item.cgst_rate) || 0;
                          const itemSgstRate = Number(item.sgst_rate) || 0;
                          const itemIgstRate = Number(item.igst_rate) || 0;
                          const directRate = Number(item.tax_rate) || (itemCgstRate + itemSgstRate + itemIgstRate);

                          // Taxable base (Base Amount = Total - Tax or Qty * Unit Price)
                          const taxableBase = itemTotal > itemTax 
                            ? Math.round((itemTotal - itemTax) * 100) / 100 
                            : Math.round((qty * unitPriceExcl) * 100) / 100;

                          // Unit price including tax
                          const unitPriceIncl = qty > 0 
                            ? Math.round((itemTotal / qty) * 100) / 100 
                            : (unitPriceExcl + itemTax);

                          let calculatedRate = directRate;
                          if (!calculatedRate || calculatedRate <= 0) {
                            if (taxableBase > 0 && itemTax > 0) {
                              calculatedRate = Math.round((itemTax / taxableBase) * 100 * 10) / 10;
                            }
                          }
                          const itemTaxRate = calculatedRate > 0 ? calculatedRate : 0;
                          const itemHsn = item.hsn_sac_code || item.hsn_code || (item as any).hsn;
                          const isInterItem = selectedInvoice.supply_type === 'INTER' || itemIgstRate > 0;
                          const effCgstR = itemCgstRate || (!isInterItem && itemTaxRate > 0 ? Math.round((itemTaxRate / 2) * 10) / 10 : 0);
                          const effSgstR = itemSgstRate || (!isInterItem && itemTaxRate > 0 ? Math.round((itemTaxRate / 2) * 10) / 10 : 0);
                          const effIgstR = itemIgstRate || (isInterItem && itemTaxRate > 0 ? itemTaxRate : 0);
                          const effCgstAmt = Number(item.cgst_amount) || (!isInterItem && itemTax > 0 ? Math.round((itemTax / 2) * 100) / 100 : 0);
                          const effSgstAmt = Number(item.sgst_amount) || (!isInterItem && itemTax > 0 ? Math.round((itemTax / 2) * 100) / 100 : 0);
                          const effIgstAmt = Number(item.igst_amount) || (isInterItem && itemTax > 0 ? itemTax : 0);

                          const weightUoms = ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'];
                          const itemUnitStr = String(item.unit || item.uom || '').toLowerCase();
                          const isWeight = item.billing_type === 'WEIGHT' || 
                                           weightUoms.includes(itemUnitStr) ||
                                           (item.pieces_sold != null && item.pieces_sold > 0 && Number(item.quantity) !== Number(item.pieces_sold));
                          const pcs = item.pieces_sold ?? item.pieces_override;

                          return (
                            <tr 
                              key={item.item_id || i}
                              className={clsx(
                                'transition-colors hover:bg-muted/15',
                                i % 2 !== 0 && 'bg-muted/[0.02]'
                              )}
                            >
                              {/* 1. Item NAME & HSN CODE */}
                              <td className="px-3 py-2.5 align-middle min-w-[160px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  {isComboItem ? (
                                    <div className="p-1 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">
                                      <Boxes className="w-3.5 h-3.5" />
                                    </div>
                                  ) : (
                                    <div className="p-1 rounded-md bg-muted/60 text-muted-foreground shrink-0">
                                      <Package className="w-3 h-3" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-foreground truncate">{item.name || 'Unknown'}</span>
                                      {isComboItem && (
                                        <span className="text-[9px] font-extrabold text-purple-600 dark:text-purple-400 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded uppercase leading-none">
                                          COMBO
                                        </span>
                                      )}
                                      {itemHsn && (
                                        <span className="text-[9px] font-mono font-bold text-muted-foreground bg-muted/80 border border-border px-1.5 py-0.5 rounded leading-none" title={`HSN/SAC: ${itemHsn}`}>
                                          HSN: {itemHsn}
                                        </span>
                                      )}
                                    </div>
                                    {comboItemsParsed && comboItemsParsed.length > 0 && (
                                      <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
                                        Includes: {comboItemsParsed.filter(Boolean).map((ci: any) => typeof ci === 'string' ? ci : `${ci.product_name || ci.name || 'Product'} (x${ci.quantity ?? 1})`).join(', ')}
                                      </div>
                                    )}
                                    {item.originalRate != null && Number(item.originalRate) !== Number(item.unit_price) && (
                                      <span className="text-[9px] text-muted-foreground font-semibold block mt-0.5 truncate">
                                        MRP {formatCurrency(Number(item.originalRate))} → {formatCurrency(Number(item.unit_price))}{item.discountLabel ? ` (${item.discountLabel})` : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 2. Qty */}
                              <td className="px-2 py-2.5 text-center font-bold text-foreground/80 align-middle whitespace-nowrap">
                                {isWeight ? (
                                  pcs ? (
                                    <div className="flex flex-col items-center leading-tight">
                                      <span className="text-xs text-foreground font-black">{pcs} Pcs</span>
                                      <span className="text-[10px] text-muted-foreground font-semibold">{item.quantity} {item.unit || 'Kg'}</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-foreground font-bold">{item.quantity} {item.unit || 'Kg'}</span>
                                  )
                                ) : (
                                  <span className="text-xs text-foreground font-bold">{item.quantity} Pcs</span>
                                )}
                              </td>

                              {/* 3. Unit Rate excl. tax */}
                              <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                                <div className="text-foreground/85 font-mono font-semibold">{formatCurrency(unitPriceExcl)}</div>
                                {isGstBill && itemTaxRate > 0 && (
                                  <div className="text-[9.5px] font-medium text-muted-foreground">excl. tax</div>
                                )}
                              </td>

                              {/* 4. CGST AMOUNT % , SGST AMOUNT % (DOWN LIKE UNIT RATE) */}
                              {isGstBill && (
                                <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                                  {isInterItem ? (
                                    <div className="font-mono text-right leading-tight">
                                      <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                        IGST: {formatCurrency(effIgstAmt)}
                                      </div>
                                      <div className="text-[9.5px] text-muted-foreground font-medium">({effIgstR}%)</div>
                                    </div>
                                  ) : (effCgstAmt > 0 || effSgstAmt > 0) ? (
                                    <div className="font-mono text-right leading-tight space-y-0.5">
                                      <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                        CGST: {formatCurrency(effCgstAmt)} <span className="text-[9.5px] font-medium text-muted-foreground">({effCgstR}%)</span>
                                      </div>
                                      <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                        SGST: {formatCurrency(effSgstAmt)} <span className="text-[9.5px] font-medium text-muted-foreground">({effSgstR}%)</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground font-mono text-[11px]">-</span>
                                  )}
                                </td>
                              )}

                              {/* 5. TAXABLE VALUE */}
                              {isGstBill && (
                                <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                                  <div className="font-mono font-bold text-foreground">{formatCurrency(taxableBase)}</div>
                                  {itemTax > 0 ? (
                                    <div className="text-[10px] text-amber-700 dark:text-amber-400 font-mono font-semibold">
                                      Tax: {formatCurrency(itemTax)}
                                    </div>
                                  ) : (
                                    <div className="text-[9.5px] text-muted-foreground font-medium">Tax: ₹0.00</div>
                                  )}
                                </td>
                              )}

                              {/* 6. UNIT RATE INCL TAX */}
                              {isGstBill && (
                                <td className="px-2.5 py-2.5 text-right align-middle whitespace-nowrap">
                                  <div className="font-mono font-semibold text-foreground">{formatCurrency(unitPriceIncl)}</div>
                                  <div className="text-[9.5px] font-medium text-muted-foreground">incl. tax</div>
                                </td>
                              )}

                              {/* 7. TOTAL */}
                              <td className="px-3 py-2.5 text-right align-middle whitespace-nowrap">
                                <div className="font-mono font-black text-foreground text-sm">{formatCurrency(itemTotal)}</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

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
                      <span className="font-bold text-foreground">
                        {formatCurrency(selectedInvoice.invoice_type === 'BILL_OF_SUPPLY' ? (sub + tax) : sub)}
                      </span>
                    </div>
                    {selectedInvoice.invoice_type === 'GST' && tax > 0 && (() => {
                      const effTaxRate = sub > 0 ? Math.round((tax / sub) * 100 * 10) / 10 : 0;
                      const isInter = selectedInvoice.supply_type === 'INTER';
                      let cgst = Number(selectedInvoice.cgst_total) || 0;
                      let sgst = Number(selectedInvoice.sgst_total) || 0;
                      let igst = Number(selectedInvoice.igst_total) || 0;
                      if (!isInter && cgst === 0 && sgst === 0 && igst === 0) {
                        cgst = Math.round((tax / 2) * 100) / 100;
                        sgst = Math.round((tax / 2) * 100) / 100;
                      } else if (isInter && igst === 0) {
                        igst = tax;
                      }
                      const cgstRate = effTaxRate > 0 ? Math.round((effTaxRate / 2) * 10) / 10 : 0;
                      const sgstRate = effTaxRate > 0 ? Math.round((effTaxRate / 2) * 10) / 10 : 0;
                      const igstRate = effTaxRate;
                      return (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                              <span>Tax (GST{effTaxRate > 0 ? ` ${effTaxRate}%` : ''})</span>
                            </span>
                            <span className="font-bold text-foreground font-mono">{formatCurrency(tax)}</span>
                          </div>
                          {(cgst > 0 || sgst > 0 || igst > 0) && (
                            <div className="p-2.5 rounded-xl bg-amber-500/[0.05] dark:bg-amber-500/[0.10] border border-amber-500/20 my-1 space-y-1 text-xs">
                              <div className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center justify-between pb-1 border-b border-amber-500/15">
                                <span>GST Tax Summary</span>
                                <span className="font-mono font-bold">{formatCurrency(tax)}</span>
                              </div>
                              {cgst > 0 && (
                                <div className="flex justify-between text-muted-foreground text-[11px]">
                                  <span>Central Tax (CGST {cgstRate > 0 ? `${cgstRate}%` : ''})</span>
                                  <span className="font-mono font-bold text-foreground">{formatCurrency(cgst)}</span>
                                </div>
                              )}
                              {sgst > 0 && (
                                <div className="flex justify-between text-muted-foreground text-[11px]">
                                  <span>State Tax (SGST {sgstRate > 0 ? `${sgstRate}%` : ''})</span>
                                  <span className="font-mono font-bold text-foreground">{formatCurrency(sgst)}</span>
                                </div>
                              )}
                              {igst > 0 && (
                                <div className="flex justify-between text-muted-foreground text-[11px]">
                                  <span>Integrated Tax (IGST {igstRate > 0 ? `${igstRate}%` : ''})</span>
                                  <span className="font-mono font-bold text-foreground">{formatCurrency(igst)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
                              className="px-2.5 py-1 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold text-xs border border-orange-500/25 transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-2xs"
                              title="Edit Scrap Invoice in Billing Page"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit Scrap</span>
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
                      <div className="flex items-center justify-between px-4 py-3 bg-rose-500/10 border-t border-rose-500/20">
                        <span className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">Refund Amount</span>
                        <span className="text-lg font-black text-rose-600 dark:text-rose-400">-{formatCurrency(refundAmount)}</span>
                      </div>
                      {(() => {
                        const actualPaid = Number(selectedInvoice.actual_refund_paid) || 0;
                        if (actualPaid <= 0) return null;
                        const diff = actualPaid - refundAmount;
                        return (
                          <>
                            <div className="flex items-center justify-between px-4 py-2 bg-orange-500/10 border-t border-orange-400/20">
                              <span className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">Actual Refund Paid</span>
                              <span className="text-base font-black text-orange-600 dark:text-orange-400">{formatCurrency(actualPaid)}</span>
                            </div>
                            {Math.abs(diff) > 0.005 && (
                              <div className={`flex items-center justify-between px-4 py-1.5 border-t ${diff > 0 ? 'bg-rose-500/10 border-rose-400/20' : 'bg-sky-500/10 border-sky-400/20'}`}>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${diff > 0 ? 'text-rose-500' : 'text-sky-500'}`}>
                                  {diff > 0 ? 'Over-refunded' : 'Under-refunded'}
                                </span>
                                <span className={`text-sm font-black ${diff > 0 ? 'text-rose-500' : 'text-sky-500'}`}>
                                  {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                                </span>
                              </div>
                            )}
                          </>
                        );
                      })()}
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
        closeButton={<RedCrossButton onClick={() => setCollectPaymentOpen(false)} />}
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
                        type="button"
                        key={opt.value}
                        onClick={() => {
                          setCollectPaymentMethod(opt.value);
                          if (opt.value === 'CARD' || opt.value === 'UPI' || opt.value === 'CHEQUE') {
                            setCollectReceivedAmount(Number(selectedInvoice.grand_total) || 0);
                          }
                        }}
                        className={clsx(
                          'flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border-2 transition-all duration-150 active:scale-[0.98] cursor-pointer',
                          isActive
                            ? `${opt.bg} ${opt.border} ${opt.color} shadow-xs ring-1 ring-primary/20`
                            : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border/80'
                        )}
                      >
                        <div className={clsx(
                          'p-2 rounded-xl transition-colors',
                          isActive ? opt.iconBg : 'bg-muted'
                        )}>
                          <opt.icon className="w-4.5 h-4.5" />
                        </div>
                        <span className="text-xs font-bold">{opt.label}</span>
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
              {(collectPaymentMethod === 'CARD' || collectPaymentMethod === 'UPI' || collectPaymentMethod === 'CHEQUE') && (
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Payment will be recorded as exact amount of {formatCurrency(Number(selectedInvoice.grand_total) || 0)}
                </div>
              )}

              {/* UPI Account Selector (Page-wise Config: Sales History) */}
              {collectPaymentMethod === 'UPI' && upiPageConfig.sales_history && upiSources.length > 0 && (
                <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl space-y-1.5">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-violet-500" />
                    Select Receiving UPI Account
                  </label>
                  <Select
                    value={collectUpiSourceId || upiSources[0]?.source_id || ''}
                    onChange={(val) => setCollectUpiSourceId(val)}
                    options={upiSources.map((s: any) => ({
                      value: s.source_id,
                      label: `${s.name} (${s.upi_id || 'No UPI ID'})`
                    }))}
                    className="w-full text-xs"
                  />
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

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setCollectPaymentOpen(false)}
                  disabled={collectPaymentSaving}
                  className="h-10 px-4 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-150 active:scale-95 cursor-pointer border border-border/80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCollectPayment}
                  disabled={collectPaymentSaving || collectPaymentSuccess}
                  className="h-10 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm shadow-emerald-600/20 cursor-pointer flex items-center gap-2"
                >
                  {collectPaymentSaving ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </span>
                  ) : (
                    <span>Confirm Payment</span>
                  )}
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
        closeButton={<RedCrossButton onClick={() => { if (!converting) { setConversionOpen(false); } }} />}
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

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setConversionOpen(false);
                    setConversionResults(null);
                    setSelectedInvoiceIds(new Set());
                    setSelectionMode(false);
                    loadInvoices(true);
                  }}
                  className="h-10 px-6 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all duration-150 active:scale-95 cursor-pointer shadow-xs"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Confirm Conversion ({selectedBosInvoices.length} Bill{selectedBosInvoices.length !== 1 ? 's' : ''})</span>
                  </p>
                  {conversionPreviewLoading && (
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
                      Calculating...
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-1.5 leading-relaxed">
                  {conversionPreview?.has_real_gst && (
                    <div className="flex items-start gap-2 text-foreground/90 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl">
                      <span className="text-emerald-500 font-black text-xs shrink-0">✓ Real GST Products:</span>
                      <span className="text-[11.5px]">
                        {conversionTaxMode === 'EXCLUSIVE'
                          ? 'Original BoS price is used as Base price, and GST is added on top (Base + GST).'
                          : 'Original BoS price is maintained as the Total MRP (GST included inside).'}
                      </span>
                    </div>
                  )}

                  {conversionPreview?.has_paper && (
                    <div className="flex items-start gap-2 text-foreground/90 font-medium bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-xl">
                      <span className="text-purple-500 font-black text-xs shrink-0">📄 Paper Products:</span>
                      <span className="text-[11.5px]">Prices will use their designated Paper MRP / purchase figures.</span>
                    </div>
                  )}

                  {conversionPreview?.has_skipped && (
                    <div className="flex items-start gap-2 text-foreground/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl">
                      <span className="text-amber-500 font-black text-xs shrink-0">⚠️ Non-Paper Estimates:</span>
                      <span className="text-[11.5px]">Estimate items without GST/Paper purchase records are automatically skipped.</span>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                    {conversionTaxMode === 'EXCLUSIVE'
                      ? 'Tax Exclusive: GST is calculated and added on top of the base prices. The total invoice amount will increase by the GST amount.'
                      : 'Tax Inclusive: Grand total stays fixed, and GST is back-calculated from the price.'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-muted/30 border border-border/80 rounded-2xl space-y-2">
                <label className="text-[11px] font-bold text-foreground flex items-center justify-between">
                  <span>GST Pricing Calculation Mode</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {conversionTaxMode === 'EXCLUSIVE' ? 'Base price + GST added on top' : 'Grand total fixed, GST included'}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setConversionTaxMode('EXCLUSIVE')}
                    className={clsx(
                      'p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col active:scale-[0.98]',
                      conversionTaxMode === 'EXCLUSIVE'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-xs shadow-amber-500/10 ring-1 ring-amber-500/30'
                        : 'bg-background border-border/80 text-muted-foreground hover:border-border hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Tax Exclusive (+ GST)</span>
                      <span className={clsx("w-2 h-2 rounded-full", conversionTaxMode === 'EXCLUSIVE' ? "bg-amber-500 ring-2 ring-amber-500/30" : "bg-muted-foreground/30")} />
                    </div>
                    <span className="text-[10.5px] text-muted-foreground mt-1">Calculated base price + GST added on top</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversionTaxMode('INCLUSIVE')}
                    className={clsx(
                      'p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col active:scale-[0.98]',
                      conversionTaxMode === 'INCLUSIVE'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-xs shadow-amber-500/10 ring-1 ring-amber-500/30'
                        : 'bg-background border-border/80 text-muted-foreground hover:border-border hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Tax Inclusive (MRP)</span>
                      <span className={clsx("w-2 h-2 rounded-full", conversionTaxMode === 'INCLUSIVE' ? "bg-amber-500 ring-2 ring-amber-500/30" : "bg-muted-foreground/30")} />
                    </div>
                    <span className="text-[10.5px] text-muted-foreground mt-1">Total price already includes GST inside</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  <span>Bill / Invoice</span>
                  <span>BoS Amount ➔ Converted GST</span>
                </div>
                <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-0.5">
                  {selectedBosInvoices.map(inv => {
                    const invPreview = conversionPreview?.invoices?.find(p => p.invoice_id === inv.invoice_id);
                    return (
                      <div key={inv.invoice_id} className="flex items-center justify-between p-2.5 bg-card border border-border rounded-xl text-xs">
                        <div className="flex flex-col">
                          <span className="font-bold text-foreground">{inv.invoice_number}</span>
                          {invPreview?.skipped_items && invPreview.skipped_items.length > 0 && (
                            <span className="text-[10px] text-amber-500 font-medium">
                              {invPreview.skipped_items.length} item{invPreview.skipped_items.length > 1 ? 's' : ''} skipped
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end font-mono">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">{formatCurrency(inv.grand_total)}</span>
                            <span className="text-muted-foreground font-bold text-[10px]">➔</span>
                            <span className={clsx(
                              "font-black text-sm",
                              conversionPreviewLoading ? "opacity-50" : "",
                              conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500"
                            )}>
                              {invPreview ? formatCurrency(invPreview.converted_grand_total) : formatCurrency(inv.grand_total)}
                            </span>
                          </div>
                          {invPreview && invPreview.tax_amount !== undefined && (
                            <div className="text-[10.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <span>Base: {formatCurrency(invPreview.taxable_amount ?? (invPreview.converted_grand_total - invPreview.tax_amount))}</span>
                              <span>•</span>
                              <span className={clsx(
                                "font-bold",
                                conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500"
                              )}>
                                GST: {conversionTaxMode === 'EXCLUSIVE' ? '+' : ''}{formatCurrency(invPreview.tax_amount)}
                              </span>
                              {Number(invPreview.deductions_total) > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-rose-500 font-bold">
                                    −{formatCurrency(invPreview.deductions_total)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Summary Breakdown Footer */}
              <div className="p-3.5 bg-muted/40 border border-border rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Original BoS Total</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(conversionPreview?.total_bos_amount ?? selectedBosInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0))}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Taxable Amount (Base)</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(conversionPreview?.total_taxable_amount ?? (conversionPreview?.total_converted_amount ? Math.max(0, conversionPreview.total_converted_amount - (conversionPreview.total_tax_amount || 0)) : selectedBosInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0)))}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={clsx("font-bold flex items-center gap-1", conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500")}>
                    <span>GST Tax Amount</span>
                    <span className="text-[10px] font-normal opacity-80">
                      ({conversionTaxMode === 'EXCLUSIVE' ? '+ Added on Base' : 'Included in Total'})
                    </span>
                  </span>
                  <span className={clsx("font-mono font-black text-sm", conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500")}>
                    {conversionTaxMode === 'EXCLUSIVE' ? '+' : ''}{formatCurrency(conversionPreview?.total_tax_amount ?? 0)}
                  </span>
                </div>

                {conversionDeductionsTotal > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-rose-500">Less: Points / Scrap / Returns</span>
                    <span className="font-mono font-black text-rose-500">
                      −{formatCurrency(conversionDeductionsTotal)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/80">
                  <div>
                    <span className="text-xs font-black text-foreground uppercase tracking-wider block">Estimated GST Total</span>
                    <span className="text-[10px] text-muted-foreground">
                      {conversionTaxMode === 'EXCLUSIVE' ? 'Base + GST Amount' : 'Fixed Total (MRP)'}
                      {conversionDeductionsTotal > 0 ? ' − deductions' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "text-lg font-mono font-black",
                      conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500"
                    )}>
                      {formatCurrency(conversionPreview?.total_converted_amount ?? selectedBosInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setConversionOpen(false)}
                  disabled={converting}
                  className="h-10 px-4 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-150 active:scale-95 cursor-pointer border border-border/80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setConverting(true);
                    try {
                      const { tenantId, userId } = useAuthStore.getState();
                      if (window.electronAPI) {
                        const result = await window.electronAPI.dbConvertBosToGst({
                          invoice_ids: selectedBosInvoices.map(i => i.invoice_id),
                          tenant_id: tenantId || 'global',
                          user_id: userId || '',
                          tax_mode: conversionTaxMode,
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
                  className="h-10 px-6 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm shadow-amber-500/20 cursor-pointer flex items-center gap-2"
                >
                  {converting ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> <span>Converting...</span></>
                  ) : (
                    <><ArrowDownRight className="w-3.5 h-3.5" /> <span>Convert to GST</span></>
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

