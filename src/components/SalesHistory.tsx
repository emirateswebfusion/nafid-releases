import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Receipt, Search, Calendar, User, Tag, RefreshCw, Printer, Edit3, X, Wallet, Banknote, Smartphone, BookOpen, IndianRupee, Percent, TrendingUp, CheckCircle2, Package, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { Input } from './ui/Input';
import { Skeleton } from './ui/Skeleton';
import { generateReceiptText, type ReceiptData } from '../utils/receiptGenerator';
import { DateRangeFilter } from './ui/DateRangeFilter';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CREDIT: 'Credit',
};

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toFixed(2)}`;
}

function groupByDay(invoices: any[]) {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    const day = new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    map.set(day, (map.get(day) || 0) + (inv.grand_total || 0));
  }
  return Array.from(map, ([date, sales]) => ({ date, sales }));
}

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
  const LIMIT = 30;

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
        console.log('[SalesHistory] Data updated via sync. Auto-refreshing...');
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
      if (e.key === 'Escape' && selectedInvoice) {
        setSelectedInvoice(null);
        setItems([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedInvoice]);

  const loadInvoices = async (reset = false) => {
    setIsFetching(true);
    if (window.electronAPI) {
      const { userId, role, tenantId } = useAuthStore.getState();
      const currentOffset = reset ? 0 : offset;

      const data = await window.electronAPI.dbGetInvoices({
        user_id: userId,
        tenant_id: tenantId,
        role: role,
        limit: LIMIT,
        offset: currentOffset,
        search: search,
        payment_method: paymentFilter || undefined,
        filterDate: filterDate || undefined,
        filterDateEnd: filterDateEnd || undefined,
      });

      if (Array.isArray(data)) {
        if (reset) {
          setInvoices(data);
        } else {
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
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isFetching || !hasMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadInvoices(false);
      }
    }, { threshold: 1.0 });

    if (node) observer.current.observe(node);
  }, [isFetching, hasMore, offset]);

  const handleSelectInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    if (window.electronAPI) {
      const data = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
      setItems(Array.isArray(data) ? data : []);
    }
  };

  const filteredInvoices = invoices;

  const summary = {
    totalSales: invoices.reduce((s, i) => s + (i.grand_total || 0), 0),
    totalInvoices: invoices.length,
    totalTax: invoices.reduce((s, i) => s + (i.tax_total || 0), 0),
    totalDiscount: invoices.reduce((s, i) => s + (i.discount_total || 0), 0),
    avgOrder: invoices.length > 0 ? invoices.reduce((s, i) => s + (i.grand_total || 0), 0) / invoices.length : 0,
  };

  const dailySales = useMemo(() => groupByDay(invoices), [invoices]);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* ─── TOP HEADER ─── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">Sales History</h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground font-semibold">View and manage past billing records</p>
              <span className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                {useAuthStore.getState().role === 'OWNER' ? 'Owner' : (useAuthStore.getState().userName || 'Staff')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose}
            className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden bg-background">
        {/* ═══ LEFT SIDE: Invoice List (38%) ═══ */}
        <div className="flex flex-col w-[38%] border-r border-border bg-muted/10 h-full">
          <div className="p-3 border-b border-border/60 space-y-2.5 bg-card">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search invoice # or customer..."
                className="pl-10 bg-background border-border/80 text-sm font-medium shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Payment method filter — modern chips */}
            <div className="flex gap-1.5 flex-wrap">
              {[
                { value: '', label: 'All', icon: Wallet },
                { value: 'CASH', label: 'Cash', icon: Banknote },
                { value: 'CARD', label: 'Card', icon: Wallet },
                { value: 'UPI', label: 'UPI', icon: Smartphone },
                { value: 'CREDIT', label: 'Credit', icon: BookOpen },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPaymentFilter(opt.value)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold tracking-wide transition-all duration-200 cursor-pointer border',
                    paymentFilter === opt.value
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20'
                      : 'bg-muted/60 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground hover:border-muted-foreground/30'
                  )}
                >
                  <opt.icon className="w-3 h-3" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 h-full relative">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`skel-${i}`} className="w-full text-left p-3.5 rounded-xl border bg-card border-border/80">
                  <div className="flex justify-between items-start mb-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3.5 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-24 mb-1.5" />
                  <div className="flex items-center justify-between mt-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))
            ) : filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-2 text-center max-w-xs mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-card border border-border/60 flex items-center justify-center text-muted-foreground shadow-sm">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>                    <p className="font-bold text-sm text-foreground/80">No records found</p>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">Try adjusting your search or filters</p>
                </div>
              </div>
            ) : (
              filteredInvoices.map((inv) => (
                <button
                  key={inv.invoice_id}
                  onClick={() => handleSelectInvoice(inv)}
                  className={clsx(
                    "w-full text-left p-3.5 rounded-xl border transition-all group cursor-pointer",
                    selectedInvoice?.invoice_id === inv.invoice_id
                      ? "bg-primary/5 border-primary shadow-sm shadow-primary/5"
                      : "bg-card border-border/80 text-muted-foreground hover:border-muted-foreground/30 hover:shadow-sm hover:-translate-y-px"
                  )}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-mono font-bold text-muted-foreground">{inv.invoice_number}</span>
                    <span className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider",
                      inv.sync_status === 'SYNCED' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                    )}>
                      {inv.sync_status}
                    </span>
                  </div>
                  <div className={clsx("font-black text-base", selectedInvoice?.invoice_id === inv.invoice_id ? "text-primary" : "text-foreground")}>
                    {formatCurrency(inv.grand_total)}
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(inv.created_at).toLocaleString()}
                    </div>
                    {inv.cashier_name && (
                      <div className="flex items-center gap-1 font-bold truncate max-w-[100px]" title={inv.cashier_name}>
                        <User className="w-3 h-3" />
                        {inv.cashier_name}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}

            {hasMore && (
              <div ref={lastElementRef} className="py-3 flex justify-center items-center shrink-0">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT SIDE: Invoice Details / Sales Overview (62%) ═══ */}
        <div className="flex-1 bg-background h-full overflow-y-auto">
          {selectedInvoice ? (
            <div className="p-6 max-w-4xl mx-auto">
              {/* ── Invoice Header ── */}
              <div className="flex items-start justify-between mb-6 pb-6 border-b border-border/60">
                <div className="space-y-3">
                  <div className="flex items-center flex-wrap gap-2.5">
                    <h2 className="text-xl font-black text-foreground tracking-tight">{selectedInvoice.invoice_number}</h2>
                    <span className={clsx(
                      'px-2 py-1 rounded-full text-xs font-black uppercase tracking-wider border',
                      selectedInvoice.sync_status === 'SYNCED'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    )}>
                      {selectedInvoice.sync_status}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                      {selectedInvoice.invoice_type === 'GST' ? 'GST Invoice' : 'Bill of Supply'}
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="font-semibold">{new Date(selectedInvoice.created_at).toLocaleString()}</span>
                    </div>
                    {selectedInvoice.cashier_name && (
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>Billed by <span className="font-bold text-foreground">{selectedInvoice.cashier_name}</span></span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {useAuthStore.getState().role === 'OWNER' && (
                    <button
                      onClick={async () => {
                        if (!window.electronAPI || !selectedInvoice) return;

                        localStorage.setItem('editBillData', JSON.stringify({
                          invoice: selectedInvoice,
                          items: items,
                        }));

                        onClose();
                        if (useAuthStore.getState().role === 'OWNER') {
                          useCartStore.getState().setRole('CASHIER');
                        }

                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('open-edit-bill'));
                        }, 100);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition-all text-sm font-bold border border-amber-500/20 hover:border-amber-500/30 active:scale-95 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Bill
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (!selectedInvoice || !window.electronAPI) return;
                      try {
                        const { tenantId } = useAuthStore.getState();
                        const [shopAddr, shopPh, upi, showQr] = await Promise.all([
                          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
                          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
                          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
                          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
                        ]);
                        const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
                        const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
                        const charsPerLine = receiptConfig?.charsPerLine ? Number(receiptConfig.charsPerLine) : undefined;

                        const receiptData: ReceiptData = {
                          shopName: useAuthStore.getState().shopName || 'My Shop',
                          shopAddress: shopAddr || undefined,
                          shopPhone: shopPh || undefined,
                          upiId: upi || undefined,
                          showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
                          invoiceNumber: selectedInvoice.invoice_number,
                          date: new Date(selectedInvoice.created_at).toLocaleString(),
                          cashierName: selectedInvoice.cashier_name,
                          items: items.map(item => ({
                            name: item.name,
                            quantity: Number(item.quantity) || 0,
                            unit_price: item.unit_price,
                            total: item.total
                          })),
                          subtotal: selectedInvoice.subtotal,
                          tax: selectedInvoice.tax_total,
                          discount: selectedInvoice.discount_total,
                          discountType: selectedInvoice.discount_type,
                          discountValue: selectedInvoice.discount_value,
                          grandTotal: selectedInvoice.grand_total,
                          isReprint: true
                        };

                        const receiptText = generateReceiptText(receiptData, receiptWidthCm, charsPerLine);
                        await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
                      } catch (err) {
                        console.error('Failed to reprint', err);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-sm font-bold border border-primary/20 hover:border-primary/30 active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Reprint
                  </button>
                </div>
              </div>

              {/* ── Customer + Payment Info Cards ── */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-4 bg-card border border-border/80 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-muted rounded-xl shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-0.5">Customer</div>
                      <div className="font-bold text-sm text-foreground">{selectedInvoice.customer_name || 'Walk-in Customer'}</div>
                      {selectedInvoice.customer_phone && (
                        <div className="text-xs text-muted-foreground mt-0.5">{selectedInvoice.customer_phone}</div>
                      )}
                      {selectedInvoice.customer_gstin && (
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono font-semibold">GSTIN: {selectedInvoice.customer_gstin}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-card border border-border/80 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-muted rounded-xl shrink-0">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-0.5">Payment</div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{PAYMENT_LABELS[selectedInvoice.payment_method] || 'Cash'}</span>
                        {selectedInvoice.payment_method !== 'CREDIT' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <BookOpen className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                      {(() => {
                        const isCredit = selectedInvoice.payment_method === 'CREDIT';
                        const received = Number(selectedInvoice.received_amount) || 0;
                        const balance = Number(selectedInvoice.balance_amount) || 0;
                        if (!isCredit && received <= 0) return null;
                        return (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <span>Received: <span className="font-bold text-foreground">{formatCurrency(received)}</span></span>
                            {isCredit && balance < 0 ? (
                              <span className="text-amber-500 ml-1 font-semibold">
                                &middot; Balance: <span className="font-bold">{formatCurrency(Math.abs(balance))}</span>
                              </span>
                            ) : !isCredit && balance > 0 ? (
                              <span className="text-emerald-500 ml-1 font-semibold">
                                &middot; Change: <span className="font-bold">{formatCurrency(balance)}</span>
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Items Table ── */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                    Order Items <span className="text-muted-foreground/60 font-normal normal-case">({items.length} item{items.length !== 1 ? 's' : ''})</span>
                  </h3>
                  {selectedInvoice.invoice_type === 'GST' && (
                    <span className="text-xs text-muted-foreground/60 font-mono font-semibold">Tax Invoice</span>
                  )}
                </div>
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm">
                  <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/40 border-b border-border/60 text-xs font-black text-muted-foreground uppercase tracking-widest">
                    <div className="col-span-5">Item</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-3 text-right">Amount</div>
                  </div>
                  <div className="divide-y divide-border/40">
                    {items.map((item, i) => (
                      <div key={item.item_id} className={clsx(
                        'grid grid-cols-12 gap-3 px-4 py-3 items-center transition-all duration-150 hover:bg-muted/20',
                        i % 2 === 0 ? 'bg-card' : 'bg-muted/[0.03]'
                      )}>
                        <div className="col-span-5 flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-muted/40 text-muted-foreground shrink-0">
                            <Package className="w-3 h-3" />
                          </div>
                          <span className="text-sm font-bold text-foreground truncate">{item.name || 'Unknown Product'}</span>
                        </div>
                        <div className="col-span-2 text-center text-sm text-muted-foreground">
                          <span className="font-bold text-foreground/70">{item.quantity}</span>
                        </div>
                        <div className="col-span-2 text-right text-sm text-muted-foreground font-semibold">
                          {formatCurrency(Number(item.unit_price))}
                        </div>
                        <div className="col-span-3 text-right text-sm font-black text-foreground">
                          {formatCurrency(Number(item.total))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Totals Summary ── */}
              <div className="flex justify-end">
                <div className="w-80">
                  <div className="bg-primary/5 border-2 border-primary/20 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-semibold">Subtotal</span>
                        <span className="font-bold text-foreground">{formatCurrency(Number(selectedInvoice.subtotal))}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-semibold">Tax</span>
                        <span className="font-bold text-foreground">{formatCurrency(Number(selectedInvoice.tax_total))}</span>
                      </div>
                      {Number(selectedInvoice.discount_total) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-destructive font-semibold">
                            Discount{selectedInvoice.discount_type === 'PERCENTAGE' && selectedInvoice.discount_value ? ` (${selectedInvoice.discount_value}%)` : ''}
                          </span>
                          <span className="text-destructive font-bold">-{formatCurrency(Number(selectedInvoice.discount_total))}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-t border-primary/20">
                      <span className="text-sm font-black text-primary uppercase tracking-widest">Grand Total</span>
                      <span className="text-xl font-black text-foreground">{formatCurrency(Number(selectedInvoice.grand_total))}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="p-6 max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-black text-foreground tracking-tight">Sales Overview</h2>
                  <DateRangeFilter
                    startDate={filterDate}
                    endDate={filterDateEnd}
                    onChange={(start, end) => {
                      setFilterDate(start);
                      setFilterDateEnd(end);
                    }}
                  />
                </div>
                {loading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-5 rounded-2xl border border-border/80 bg-card space-y-3 shadow-sm">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-7 w-28" />
                      </div>
                    ))}
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/60 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-card border border-border/60 flex items-center justify-center text-muted-foreground shadow-sm">
                      <Receipt className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-bold text-foreground/60">No sales records found</p>
                  </div>
                ) : (
                  <>
                    {/* Daily Sales Chart */}
                    <div className="mb-5 p-5 rounded-2xl border border-border/80 bg-card shadow-sm">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-xl">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Daily Sales Trend</span>
                      </div>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dailySales} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `\u20B9${v}`} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                              labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                              formatter={(value) => [formatCurrency(Number(value)), 'Sales']}
                            />
                            <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-5 rounded-2xl border border-border/80 bg-card shadow-sm">
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <IndianRupee className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Sales</span>
                        </div>
                        <div className="text-2xl font-black text-foreground">{formatCurrency(summary.totalSales)}</div>
                      </div>
                      <div className="p-5 rounded-2xl border border-border/80 bg-card shadow-sm">
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Invoices</span>
                        </div>
                        <div className="text-2xl font-black text-foreground">{summary.totalInvoices}</div>
                      </div>
                      <div className="p-5 rounded-2xl border border-border/80 bg-card shadow-sm">
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="p-2 bg-violet-500/10 text-violet-500 rounded-xl">
                            <Percent className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Tax</span>
                        </div>
                        <div className="text-2xl font-black text-foreground">{formatCurrency(summary.totalTax)}</div>
                      </div>
                      <div className="p-5 rounded-2xl border border-border/80 bg-card shadow-sm">
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                            <TrendingUp className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Avg Order Value</span>
                        </div>
                        <div className="text-2xl font-black text-foreground">{formatCurrency(summary.avgOrder)}</div>
                      </div>
                      {summary.totalDiscount > 0 && (
                        <div className="p-5 rounded-2xl border border-border/80 bg-card shadow-sm col-span-2">
                          <div className="flex items-center gap-2.5 mb-2.5">
                            <div className="p-2 bg-red-500/10 text-red-500 rounded-xl">
                              <Tag className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Discounts Given</span>
                          </div>
                          <div className="text-2xl font-black text-foreground">{formatCurrency(summary.totalDiscount)}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
