import { useState, useEffect, useRef, useCallback } from 'react';
import { Receipt, Search, Calendar, User, Phone, Tag, RefreshCw, Printer, Edit3, X, Wallet, Banknote, Smartphone, BookOpen, IndianRupee, Percent, TrendingUp, CheckCircle2, Package } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { Input } from './ui/Input';
import { Skeleton } from './ui/Skeleton';
import { generateReceiptText, type ReceiptData } from '../utils/receiptGenerator';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CREDIT: 'Credit',
};

export function SalesHistory({ onClose }: { onClose: () => void }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hasNewSyncData, setHasNewSyncData] = useState(false);

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('');
  const LIMIT = 30;

  useEffect(() => {
    const timeout = setTimeout(() => {
      setOffset(0);
      setHasMore(true);
      loadInvoices(true);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, paymentFilter]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onSyncDataUpdated(() => {
        console.log('[SalesHistory] Data updated via sync. Prompting refresh...');
        setHasNewSyncData(true);
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
        payment_method: paymentFilter || undefined
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

  const filteredInvoices = invoices; // filtering is done on backend

  const summary = {
    totalSales: invoices.reduce((s, i) => s + (i.grand_total || 0), 0),
    totalInvoices: invoices.length,
    totalTax: invoices.reduce((s, i) => s + (i.tax_total || 0), 0),
    totalDiscount: invoices.reduce((s, i) => s + (i.discount_total || 0), 0),
    avgOrder: invoices.length > 0 ? invoices.reduce((s, i) => s + (i.grand_total || 0), 0) / invoices.length : 0,
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Sales History</h1>
            <p className="text-muted-foreground text-sm font-normal">View and manage past billing records</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          title="Back"
        >
          <X className="w-5 h-5" />
        </button>
      </header>
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Invoice List */}
        <div className="w-1/3 border-r border-border flex flex-col bg-muted/10 h-full">
          <div className="p-4 border-b border-border space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Search invoice # or customer..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5">
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
                    'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    paymentFilter === opt.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}
                >
                  <opt.icon className="w-3 h-3" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 h-full relative">
            {hasNewSyncData && (
              <div className="sticky top-2 z-10 mx-2 mb-4">
                <button 
                  onClick={() => {
                    setHasNewSyncData(false);
                    setOffset(0);
                    setHasMore(true);
                    loadInvoices(true);
                  }}
                  className="w-full bg-primary text-primary-foreground font-bold text-sm py-2 px-4 rounded-xl shadow-lg border border-primary-foreground/20 flex items-center justify-center gap-2 hover:bg-primary/90 transition-all animate-in fade-in slide-in-from-top-4"
                >
                  <RefreshCw className="w-4 h-4" />
                  New data synced — Click to refresh
                </button>
              </div>
            )}
            
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`skel-${i}`} className="w-full text-left p-4 rounded-xl border bg-background border-border">
                  <div className="flex justify-between items-start mb-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-24 mb-2" />
                  <div className="flex items-center justify-between mt-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))
            ) : filteredInvoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No records found</div>
            ) : (
              filteredInvoices.map((inv) => (
                <button
                  key={inv.invoice_id}
                  onClick={() => handleSelectInvoice(inv)}
                  className={clsx(
                    "w-full text-left p-4 rounded-xl border transition-all group",
                    selectedInvoice?.invoice_id === inv.invoice_id
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-background border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/50"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-muted-foreground">{inv.invoice_number}</span>
                    <span className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                      inv.sync_status === 'SYNCED' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                    )}>
                      {inv.sync_status}
                    </span>
                  </div>
                  <div className={clsx("font-bold text-lg", selectedInvoice?.invoice_id === inv.invoice_id ? "text-primary" : "text-foreground")}>₹{inv.grand_total.toFixed(2)}</div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(inv.created_at).toLocaleString()}
                    </div>
                    {inv.cashier_name && (
                      <div className="flex items-center gap-1 font-medium truncate max-w-[100px]" title={inv.cashier_name}>
                        <User className="w-3 h-3" />
                        {inv.cashier_name}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
            
            {hasMore && (
              <div ref={lastElementRef} className="py-4 flex justify-center items-center shrink-0">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Invoice Details */}
        <div className="flex-1 overflow-y-auto bg-background h-full">
          {selectedInvoice ? (
            <div className="p-8 max-w-4xl mx-auto">
              {/* ── Invoice Header ── */}
              <div className="flex items-start justify-between mb-8 pb-8 border-b border-border">
                <div className="space-y-4">
                  <div className="flex items-center flex-wrap gap-3">
                    <h2 className="text-3xl font-black text-foreground tracking-tight">{selectedInvoice.invoice_number}</h2>
                    <span className={clsx(
                      'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                      selectedInvoice.sync_status === 'SYNCED'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    )}>
                      {selectedInvoice.sync_status}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                      {selectedInvoice.invoice_type === 'GST' ? 'GST Invoice' : 'Bill of Supply'}
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(selectedInvoice.created_at).toLocaleString()}</span>
                    </div>
                    {selectedInvoice.cashier_name && (
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>Billed by <span className="font-semibold text-foreground">{selectedInvoice.cashier_name}</span></span>
                      </div>
                    )}

                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {useAuthStore.getState().role === 'OWNER' && (
                    <button
                      onClick={async () => {
                        if (!window.electronAPI || !selectedInvoice) return;
                        
                        // Store full invoice data for billing page to load directly
                        localStorage.setItem('editBillData', JSON.stringify({
                          invoice: selectedInvoice,
                          items: items,
                        }));
                        
                        onClose();
                        if (useAuthStore.getState().role === 'OWNER') {
                          useCartStore.getState().setRole('CASHIER');
                        }
                        
                        // Notify billing page to load items into cart
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('open-edit-bill'));
                        }, 100);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 rounded-xl transition-all text-sm font-bold border border-amber-500/20 hover:border-amber-500/30"
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit Bill
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (!selectedInvoice || !window.electronAPI) return;
                      try {
                        const { tenantId } = useAuthStore.getState();
                        const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
                        const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;

                        const receiptData: ReceiptData = {
                          shopName: useAuthStore.getState().shopName || 'My Shop',
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

                        const receiptText = generateReceiptText(receiptData, receiptWidthCm);
                        await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
                      } catch (err) {
                        console.error('Failed to reprint', err);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-sm font-bold border border-primary/20 hover:border-primary/30"
                  >
                    <Printer className="w-4 h-4" />
                    Reprint
                  </button>
                </div>
              </div>

              {/* ── Customer + Payment Info Cards ── */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-5 bg-muted/20 border border-border rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-muted rounded-xl shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">Customer</div>
                      <div className="font-semibold text-foreground">{selectedInvoice.customer_name || 'Walk-in Customer'}</div>
                      {selectedInvoice.customer_phone && (
                        <div className="text-xs text-muted-foreground mt-0.5">{selectedInvoice.customer_phone}</div>
                      )}
                      {selectedInvoice.customer_gstin && (
                        <div className="text-[10px] text-muted-foreground mt-1 font-mono">GSTIN: {selectedInvoice.customer_gstin}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-5 bg-muted/20 border border-border rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-muted rounded-xl shrink-0">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-0.5">Payment</div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{PAYMENT_LABELS[selectedInvoice.payment_method] || 'Cash'}</span>
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
                        // For credit, always show. For others, only if received > 0.
                        if (!isCredit && received <= 0) return null;
                        return (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <span>Received: <span className="font-semibold text-foreground">₹{received.toFixed(2)}</span></span>
                            {isCredit && balance < 0 ? (
                              <span className="text-amber-500 ml-1">
                                · Balance: <span className="font-semibold">₹{Math.abs(balance).toFixed(2)}</span>
                              </span>
                            ) : !isCredit && balance > 0 ? (
                              <span className="text-emerald-500 ml-1">
                                · Change: <span className="font-semibold">₹{balance.toFixed(2)}</span>
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
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Order Items <span className="text-muted-foreground/60 font-normal normal-case">({items.length} item{items.length !== 1 ? 's' : ''})</span>
                  </h3>
                  {selectedInvoice.invoice_type === 'GST' && (
                    <span className="text-[10px] text-muted-foreground/60 font-mono">Tax Invoice</span>
                  )}
                </div>
                <div className="border border-border rounded-xl overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-muted/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    <div className="col-span-5">Item</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-3 text-right">Amount</div>
                  </div>
                  {/* Items */}
                  <div className="divide-y divide-border/40">
                    {items.map((item, i) => (
                      <div key={item.item_id} className={clsx(
                        'grid grid-cols-12 gap-3 px-5 py-3.5 items-center transition-colors',
                        i % 2 === 0 ? 'bg-background' : 'bg-muted/[0.03]'
                      )}>
                        <div className="col-span-5 flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-muted/40 text-muted-foreground shrink-0">
                            <Package className="w-3 h-3" />
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">{item.name || 'Unknown Product'}</span>
                        </div>
                        <div className="col-span-2 text-center text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground/70">{item.quantity}</span>
                        </div>
                        <div className="col-span-2 text-right text-sm text-muted-foreground">
                          ₹{Number(item.unit_price).toFixed(2)}
                        </div>
                        <div className="col-span-3 text-right text-sm font-bold text-foreground">
                          ₹{Number(item.total).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Totals Summary ── */}
              <div className="flex justify-end">
                <div className="w-80">
                  <div className="bg-muted/20 border border-border rounded-xl p-6 space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium text-foreground">₹{Number(selectedInvoice.subtotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="font-medium text-foreground">₹{Number(selectedInvoice.tax_total).toFixed(2)}</span>
                    </div>
                    {Number(selectedInvoice.discount_total) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-destructive">
                          Discount{selectedInvoice.discount_type === 'PERCENTAGE' && selectedInvoice.discount_value ? ` (${selectedInvoice.discount_value}%)` : ''}
                        </span>
                        <span className="text-destructive font-medium">-₹{Number(selectedInvoice.discount_total).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-3 border-t-2 border-border flex justify-between items-end">
                      <span className="text-sm font-semibold text-foreground">Grand Total</span>
                      <span className="text-2xl font-black text-primary">₹{Number(selectedInvoice.grand_total).toFixed(2)}</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="p-8 max-w-3xl mx-auto">
                <h2 className="text-2xl font-bold text-foreground mb-6">Sales Overview</h2>
                {loading ? (
                  <div className="grid grid-cols-2 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-6 rounded-2xl border border-border bg-card space-y-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-8 w-28" />
                      </div>
                    ))}
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                    <Receipt className="w-20 h-20 opacity-20" />
                    <p className="text-xl">No sales records found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 rounded-2xl border border-border bg-card">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
                          <IndianRupee className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-semibold text-muted-foreground">Total Sales</span>
                      </div>
                      <div className="text-3xl font-black text-foreground">₹{summary.totalSales.toFixed(2)}</div>
                    </div>
                    <div className="p-6 rounded-2xl border border-border bg-card">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-semibold text-muted-foreground">Invoices</span>
                      </div>
                      <div className="text-3xl font-black text-foreground">{summary.totalInvoices}</div>
                    </div>
                    <div className="p-6 rounded-2xl border border-border bg-card">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-violet-500/10 text-violet-500 rounded-xl">
                          <Percent className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-semibold text-muted-foreground">Total Tax</span>
                      </div>
                      <div className="text-3xl font-black text-foreground">₹{summary.totalTax.toFixed(2)}</div>
                    </div>
                    <div className="p-6 rounded-2xl border border-border bg-card">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-semibold text-muted-foreground">Avg Order Value</span>
                      </div>
                      <div className="text-3xl font-black text-foreground">₹{summary.avgOrder.toFixed(2)}</div>
                    </div>
                    {summary.totalDiscount > 0 && (
                      <div className="p-6 rounded-2xl border border-border bg-card col-span-2">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2.5 bg-red-500/10 text-red-500 rounded-xl">
                            <Tag className="w-5 h-5" />
                          </div>
                          <span className="text-sm font-semibold text-muted-foreground">Total Discounts Given</span>
                        </div>
                        <div className="text-3xl font-black text-foreground">₹{summary.totalDiscount.toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
