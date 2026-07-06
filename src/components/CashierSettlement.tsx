import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Banknote, Wallet, Smartphone, CreditCard, SplitSquareHorizontal, CheckCircle2, Plus, Minus, History, ShieldAlert, X, ChevronRight, Receipt, Clock, DollarSign } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'SPLIT';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote; }[] = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'BANK_TRANSFER', label: 'Bank', icon: Wallet },
  { value: 'SPLIT', label: 'Split', icon: SplitSquareHorizontal },
];

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(d: string): string {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

interface CashierSettlementProps {
  onClose: () => void;
}

export function CashierSettlement({ onClose }: CashierSettlementProps) {
  const { tenantId, userId, userName } = useAuthStore();
  const settleRowRef = useRef<HTMLDivElement>(null);

  const [drawer, setDrawer] = useState<any>(null);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedInv, setSelectedInv] = useState<any>(null);
  const [receivedAmt, setReceivedAmt] = useState<number>(0);
  const [discountAmt, setDiscountAmt] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [settling, setSettling] = useState(false);
  const [settleOk, setSettleOk] = useState(false);

  const [showOpeningBal, setShowOpeningBal] = useState(false);
  const [openingBalInput, setOpeningBalInput] = useState<number>(0);

  const [expAmt, setExpAmt] = useState<number>(0);
  const [expCat, setExpCat] = useState('');
  const [expNote, setExpNote] = useState('');
  const [expSubmitting, setExpSubmitting] = useState(false);

  const [showDayClose, setShowDayClose] = useState(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [closeRemarks, setCloseRemarks] = useState('');
  const [closeResult, setCloseResult] = useState<any>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!window.electronAPI || !tenantId) return;
    const [d, invs, txs] = await Promise.all([
      window.electronAPI.dbCashierGetDrawer({ tenant_id: tenantId }),
      window.electronAPI.dbCashierGetPendingInvoices({ tenant_id: tenantId, search: searchQuery || undefined }),
      window.electronAPI.dbCashierGetTransactions({ tenant_id: tenantId }),
    ]);
    if (d && !d.error) setDrawer(d);
    if (Array.isArray(invs)) setPendingInvoices(invs);
    if (Array.isArray(txs)) setExpenses(txs.filter((t: any) => t.type === 'CASH_OUT'));
  }, [tenantId, searchQuery]);

  useEffect(() => { Promise.all([load()]).finally(() => setLoading(false)); }, [load]);

  const handleSelect = (inv: any) => {
    setSelectedInv(inv);
    setReceivedAmt(inv.grand_total);
    setDiscountAmt(0);
    setPayMethod('CASH');
    setSettleOk(false);
    setTimeout(() => settleRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  const handleSettle = async () => {
    if (!selectedInv || !tenantId || !userId || receivedAmt <= 0) return;
    setSettling(true);
    const r = await window.electronAPI!.dbCashierSettlePayment({
      tenant_id: tenantId, invoice_id: selectedInv.invoice_id,
      received_amount: receivedAmt, payment_method: payMethod,
      user_id: userId, user_name: userName || undefined,
    });
    setSettling(false);
    if (r.success) {
      setSettleOk(true);
      setSelectedInv(null);
      await load();
      setTimeout(() => setSettleOk(false), 1500);
    }
  };

  const handleSetOpening = async () => {
    if (!tenantId || !userId) return;
    const r = await window.electronAPI!.dbCashierSetOpeningBalance({
      tenant_id: tenantId, opening_balance: openingBalInput,
      user_id: userId, user_name: userName || undefined,
    });
    if (r.success) { setShowOpeningBal(false); await load(); }
  };

  const handleAddExpense = async () => {
    if (!tenantId || !userId || expAmt <= 0) return;
    setExpSubmitting(true);
    const r = await window.electronAPI!.dbCashierAddTransaction({
      tenant_id: tenantId, type: 'CASH_OUT', amount: expAmt,
      category: expCat || undefined, notes: expNote || undefined,
      user_id: userId, user_name: userName || undefined,
    });
    setExpSubmitting(false);
    if (r.success) { setExpAmt(0); setExpCat(''); setExpNote(''); await load(); }
  };

  const handleDayClose = async () => {
    if (!tenantId || !userId || actualCash < 0) return;
    setCloseSubmitting(true);
    const r = await window.electronAPI!.dbCashierDayClosing({
      tenant_id: tenantId, actual_cash: actualCash,
      closing_remarks: closeRemarks || undefined,
      user_id: userId, user_name: userName || undefined,
    });
    setCloseSubmitting(false);
    if (r.success) { setCloseResult(r); await load(); }
  };

  const openAudit = async () => {
    if (!tenantId) return;
    const r = await window.electronAPI!.dbCashierGetAuditLog({ tenant_id: tenantId, limit: 100 });
    if (Array.isArray(r)) { setAuditLog(r); setShowAudit(true); }
  };

  const openHistory = async () => {
    if (!tenantId) return;
    const r = await window.electronAPI!.dbCashierGetHistory({ tenant_id: tenantId, limit: 50 });
    if (Array.isArray(r)) { setHistory(r); setShowHist(true); }
  };

  const drawerOpen = drawer?.status === 'OPEN';
  const drawerClosed = drawer?.status === 'CLOSED';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden text-foreground">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Banknote className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold text-foreground tracking-tight truncate">Cash Settlement</h1>
            <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5">
              <span className={clsx("w-1.5 h-1.5 rounded-full", drawerOpen ? "bg-emerald-500 animate-pulse" : drawerClosed ? "bg-muted-foreground" : "bg-amber-500")} />
              {drawerOpen ? 'Open' : drawerClosed ? 'Closed' : 'Not Started'} &middot; {drawer?.business_date || todayStr()}
              {drawer && <><span className="w-px h-3 bg-border/60" />Bal: <span className="font-black text-foreground">{formatCurrency(drawer.current_cash || 0)}</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openHistory} className="px-3 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> History
          </button>
          <button onClick={openAudit} className="px-3 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Audit
          </button>
          {!drawerClosed && (
            <button onClick={() => { setOpeningBalInput(drawer?.opening_balance || 0); setShowOpeningBal(true); }}
              className="px-3 py-2 rounded-xl text-xs font-bold text-primary hover:bg-primary/10 transition-all duration-200 active:scale-95 cursor-pointer">
              Opening Balance
            </button>
          )}
          {drawerOpen && !closeResult && (
            <button onClick={() => { setActualCash(drawer?.expected_closing || 0); setCloseResult(null); setShowDayClose(true); }}
              className="px-3 py-2 rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10 border border-destructive/20 transition-all duration-200 active:scale-95 cursor-pointer">
              Close Day
            </button>
          )}
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex min-h-0">
        {/* ═══ LEFT: Bill Settlement ═══ */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border">
          {/* Search + actions */}
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border/60 bg-muted/20 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" placeholder="Search invoice or customer..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border/80 rounded-xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 shadow-sm" />
            </div>
            <div className="flex flex-col items-center px-3 py-1 rounded-xl bg-muted/40 border border-border/60 min-w-[56px]">
              <span className="text-lg font-black text-foreground leading-none tabular-nums">{pendingInvoices.length}</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">Pending</span>
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[0.9fr_1.1fr_0.55fr_0.5fr_0.55fr_0.55fr_0.55fr] gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-muted/30">
            <span>Invoice</span>
            <span>Customer</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Disc</span>
            <span className="text-right font-black text-primary">Net</span>
            <span className="text-center">Pay</span>
            <span className="text-right">Time</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {pendingInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <CheckCircle2 className="w-12 h-12 mb-3 text-emerald-500/30" />
                <p className="text-sm font-bold">All settled</p>
                <p className="text-xs text-muted-foreground/60 mt-1">No pending invoices</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {pendingInvoices.map((inv) => (
                  <button key={inv.invoice_id} onClick={() => handleSelect(inv)}
                    className={clsx(
                      "w-full grid grid-cols-[0.9fr_1.1fr_0.55fr_0.5fr_0.55fr_0.55fr_0.55fr] gap-2 px-6 py-3 text-left bg-card hover:bg-muted/20 transition-all duration-200 active:scale-[0.99] cursor-pointer",
                      selectedInv?.invoice_id === inv.invoice_id && "bg-primary/5 border-l-2 border-l-primary"
                    )}>
                    <span className="text-sm font-bold text-foreground truncate">{inv.invoice_number}</span>
                    <span className="text-sm text-muted-foreground truncate">{inv.customer_name || '—'}</span>
                    <span className="text-sm font-black text-foreground text-right tabular-nums">{formatCurrency(inv.grand_total)}</span>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400 text-right tabular-nums">{inv.discount_total > 0 ? `-${formatCurrency(inv.discount_total)}` : '\u2014'}</span>
                    <span className="text-sm font-black text-primary text-right tabular-nums">{formatCurrency(inv.grand_total - (inv.discount_total || 0))}</span>
                    <span className="flex items-center justify-center">
                      <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20">PEND</span>
                    </span>
                    <span className="text-xs text-muted-foreground text-right tabular-nums">{formatTime(inv.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settle bar */}
          {selectedInv && (
            <div ref={settleRowRef} className="border-t-2 border-primary/30 bg-muted/10 px-6 py-4 shrink-0">
              {settleOk ? (
                <div className="flex items-center gap-3 py-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{selectedInv.invoice_number} — Payment Complete</p>
                    <p className="text-[10px] text-muted-foreground font-semibold">{formatCurrency(selectedInv.grand_total)} received via {payMethod}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Receipt className="w-4 h-4 text-primary" />
                      <span className="text-sm font-extrabold text-foreground">{selectedInv.invoice_number}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{selectedInv.customer_name || 'Walk-in'}</span>
                    </div>
                    <span className="text-lg font-black text-foreground tabular-nums">{formatCurrency(selectedInv.grand_total)}</span>
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="w-44">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block mb-1">Received Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{'\u20B9'}</span>
                        <input type="number" value={receivedAmt} onChange={e => { const v = Number(e.target.value); setReceivedAmt(v); setDiscountAmt(Math.max(0, selectedInv.grand_total - v)); }}
                          className="w-full pl-8 pr-3 py-2 text-sm font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all duration-200"
                          step="0.01" min="0" autoFocus />
                      </div>
                    </div>
                    <div className="w-28">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block mb-1">Discount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{'\u20B9'}</span>
                        <input type="number" value={discountAmt} onChange={e => { const v = Number(e.target.value); setDiscountAmt(v); setReceivedAmt(Math.max(0, selectedInv.grand_total - v)); }}
                          className="w-full pl-8 pr-3 py-2 text-sm font-black bg-card border-2 border-amber-500/30 rounded-2xl outline-none focus:border-amber-500 text-foreground tabular-nums shadow-sm transition-all duration-200"
                          step="0.01" min="0" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block mb-1">Payment Method</label>
                      <div className="flex gap-1.5">
                        {PAYMENT_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => setPayMethod(opt.value)}
                            className={clsx(
                              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer",
                              payMethod === opt.value
                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                : "border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground bg-card"
                            )}>
                            <opt.icon className="w-3.5 h-3.5" />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-5">
                      <button onClick={() => setSelectedInv(null)}
                        className="px-4 py-2 text-xs font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all duration-200 active:scale-95 cursor-pointer">
                        Cancel
                      </button>
                      <button onClick={handleSettle} disabled={settling || receivedAmt <= 0}
                        className="px-6 py-2 text-xs font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                        {settling ? 'Processing...' : `Pay ${formatCurrency(receivedAmt)}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Expenses ═══ */}
        <div className="w-[440px] min-w-0 flex flex-col bg-card shadow-2xl z-10">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/10">
                <Minus className="w-4 h-4 text-rose-500" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-foreground tracking-tight">Expenses</h2>
                <p className="text-[10px] font-semibold text-muted-foreground">Cash Out</p>
              </div>
            </div>
            <button onClick={async () => {
              if (!drawerOpen) return;
              const r = await window.electronAPI!.dbCashierAddTransaction({
                tenant_id: tenantId!, type: 'CASH_OUT', amount: expAmt || 1,
                category: expCat || undefined, notes: expNote || undefined,
                user_id: userId!, user_name: userName || undefined,
              });
              if (r.success) { setExpAmt(0); setExpCat(''); setExpNote(''); await load(); }
            }}
              className="px-3 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Expense
            </button>
          </div>

          {/* Inline Add Expense */}
          <div className="px-6 py-3 border-b border-border/60 bg-rose-500/[0.02] space-y-2.5">
            <div className="grid grid-cols-[1fr_1.2fr_0.7fr] gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{'\u20B9'}</span>
                <input type="number" value={expAmt} onChange={e => setExpAmt(Number(e.target.value))}
                  placeholder="Amount"
                  className="w-full pl-7 pr-3 py-2 text-sm font-black bg-card border border-border/80 rounded-xl outline-none focus:border-rose-500/30 text-foreground placeholder:text-muted-foreground/40 tabular-nums shadow-sm transition-all"
                  step="0.01" min="0" />
              </div>
              <select value={expCat} onChange={e => setExpCat(e.target.value)}
                className="px-3 py-2 text-sm bg-card border border-border/80 rounded-xl outline-none focus:border-rose-500/30 text-foreground shadow-sm transition-all">
                <option value="">Category</option>
                <option value="Petty Cash">Petty Cash</option>
                <option value="Electricity">Electricity</option>
                <option value="Rent">Rent</option>
                <option value="Salary">Salary</option>
                <option value="Transport">Transport</option>
                <option value="Stationery">Stationery</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Other">Other</option>
              </select>
              <input type="text" value={expNote} onChange={e => setExpNote(e.target.value)} placeholder="Notes"
                className="px-3 py-2 text-sm bg-card border border-border/80 rounded-xl outline-none focus:border-rose-500/30 text-foreground placeholder:text-muted-foreground/40 shadow-sm transition-all" />
            </div>
            <div className="flex justify-end gap-1.5">
              <button onClick={async () => {
                if (!tenantId || !userId || expAmt <= 0) return;
                setExpSubmitting(true);
                const r = await window.electronAPI!.dbCashierAddTransaction({
                  tenant_id: tenantId, type: 'CASH_OUT', amount: expAmt,
                  category: expCat || undefined, notes: expNote || undefined,
                  user_id: userId, user_name: userName || undefined,
                });
                setExpSubmitting(false);
                if (r.success) { setExpAmt(0); setExpCat(''); setExpNote(''); await load(); }
              }} disabled={expSubmitting || expAmt <= 0}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-500 rounded-xl hover:bg-rose-600 shadow-sm transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40">
                {expSubmitting ? 'Saving...' : 'Record Expense'}
              </button>
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[0.7fr_1fr_0.7fr_0.7fr] gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-muted/30">
            <span>Time</span>
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span>By</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <Minus className="w-10 h-10 mb-2 text-muted-foreground/30" />
                <p className="text-sm font-bold">No expenses</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Cash out entries appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {expenses.map((tx: any) => (
                  <div key={tx.transaction_id}
                    className="grid grid-cols-[0.7fr_1fr_0.7fr_0.7fr] gap-2 px-6 py-2.5 bg-card hover:bg-muted/20 transition-colors">
                    <span className="text-xs text-muted-foreground tabular-nums">{formatTime(tx.transaction_date)}</span>
                    <span className="text-sm text-foreground truncate font-medium">{tx.category || 'Other'}</span>
                    <span className="text-sm font-black text-destructive text-right tabular-nums">-{formatCurrency(tx.amount)}</span>
                    <span className="text-xs text-muted-foreground truncate">{tx.entered_by_name || '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Bottom: Cash Summary Bar ─── */}
      {drawer && (
        <div className="flex items-center gap-6 px-6 py-3 border-t border-border bg-card shadow-sm shrink-0 text-xs">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="font-extrabold text-foreground">{formatCurrency(drawer.opening_balance || 0)}</span>
            <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Open</span>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 font-black">+{formatCurrency(drawer.cash_sales || 0)}</span>
            <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Sales</span>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <div className="flex items-center gap-1.5">
            <span className="text-blue-500 font-black">+{formatCurrency(drawer.cash_in || 0)}</span>
            <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">In</span>
          </div>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <div className="flex items-center gap-1.5">
            <span className="text-rose-500 font-black">-{formatCurrency(drawer.cash_out || 0)}</span>
            <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Out</span>
          </div>
          <div className="w-px h-5 bg-border/60" />
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-black text-foreground">{formatCurrency(drawer.current_cash || 0)}</span>
            <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Current</span>
          </div>
          <div className="w-px h-5 bg-border/60" />
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-amber-600 dark:text-amber-400">{formatCurrency(drawer.expected_closing || 0)}</span>
            <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Expected</span>
          </div>
          {drawerClosed && drawer.actual_cash !== null && (
            <>
              <div className="w-px h-5 bg-border/60" />
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-foreground">{formatCurrency(drawer.actual_cash)}</span>
                <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Actual</span>
              </div>
              {drawer.cash_short > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs font-black text-rose-500">
                  Short -{formatCurrency(drawer.cash_short)}
                </span>
              )}
              {drawer.cash_excess > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs font-black text-emerald-500">
                  Excess +{formatCurrency(drawer.cash_excess)}
                </span>
              )}
              {drawer.cash_short === 0 && drawer.cash_excess === 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs font-black text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Matched
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Day Closing Modal ─── */}
      {showDayClose && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => { if (!closeSubmitting) setShowDayClose(false); }}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-xl w-[480px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-extrabold text-foreground">End of Day Closing</h2>
              <button onClick={() => { if (!closeSubmitting) setShowDayClose(false); }} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {closeResult ? (
                <>
                  <div className="flex flex-col items-center py-6 bg-primary/5 border border-primary/20 rounded-2xl shadow-inner">
                    <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-3" />
                    <p className="text-lg font-black text-foreground">Day Closed</p>
                    <p className="text-xs text-muted-foreground font-semibold mt-1">{drawer?.business_date}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/30 rounded-xl text-center">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Expected</p>
                      <p className="text-lg font-black text-foreground">{formatCurrency(closeResult.expected_closing)}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-xl text-center">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Actual</p>
                      <p className="text-lg font-black text-foreground">{formatCurrency(closeResult.actual_cash)}</p>
                    </div>
                    {closeResult.cash_short > 0 && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center col-span-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Cash Short</p>
                        <p className="text-xl font-black text-rose-500">-{formatCurrency(closeResult.cash_short)}</p>
                      </div>
                    )}
                    {closeResult.cash_excess > 0 && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center col-span-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Cash Excess</p>
                        <p className="text-xl font-black text-emerald-500">+{formatCurrency(closeResult.cash_excess)}</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setShowDayClose(false); setCloseResult(null); }}
                    className="w-full py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer">
                    Done
                  </button>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-muted/30 rounded-xl text-center">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Expected Cash</p>
                      <p className="text-lg font-black text-foreground">{formatCurrency(drawer?.expected_closing || 0)}</p>
                    </div>
                    <div className="p-4 bg-primary/5 border-2 border-primary/20 rounded-2xl text-center">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Current Cash</p>
                      <p className="text-lg font-black text-primary">{formatCurrency(drawer?.current_cash || 0)}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Actual Cash Count</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{'\u20B9'}</span>
                      <input type="number" value={actualCash} onChange={e => setActualCash(Number(e.target.value))}
                        className="w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all"
                        step="0.01" min="0" placeholder="Enter physical cash count" autoFocus />
                    </div>
                  </div>
                  <textarea value={closeRemarks} onChange={e => setCloseRemarks(e.target.value)}
                    placeholder="Closing remarks (optional)"
                    className="w-full px-4 py-2.5 text-sm bg-card border border-border/80 rounded-xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all" />
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setShowDayClose(false)}
                      className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer">
                      Cancel
                    </button>
                    <button onClick={handleDayClose} disabled={closeSubmitting || actualCash < 0}
                      className="flex-1 py-3 text-sm font-black text-white bg-destructive rounded-xl hover:bg-destructive/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-40">
                      {closeSubmitting ? 'Processing...' : 'Complete Day Closing'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Opening Balance Modal ─── */}
      {showOpeningBal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowOpeningBal(false)}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-xl w-80" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-extrabold text-foreground">Opening Balance</h2>
              <button onClick={() => setShowOpeningBal(false)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground font-medium">Cash at start of day</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{'\u20B9'}</span>
                <input type="number" value={openingBalInput} onChange={e => setOpeningBalInput(Number(e.target.value))}
                  className="w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all"
                  step="0.01" min="0" autoFocus />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOpeningBal(false)}
                  className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer">
                  Cancel
                </button>
                <button onClick={handleSetOpening}
                  className="flex-1 py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Audit Modal ─── */}
      {showAudit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowAudit(false)}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-xl w-[600px] max-w-[90vw] max-h-[75vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-extrabold text-foreground">Audit Log</h2>
              <button onClick={() => setShowAudit(false)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(75vh-64px)]">
              {auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No entries</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {auditLog.map((e: any) => (
                    <div key={e.audit_id} className="px-6 py-3 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-foreground">{e.action}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{new Date(e.performed_at).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">by <span className="font-semibold text-foreground">{e.performed_by_name || e.performed_by || 'System'}</span></p>
                      {e.details && (
                        <pre className="mt-1.5 text-[10px] text-muted-foreground/70 bg-muted/30 p-2 rounded-xl overflow-x-auto border border-border/40">{JSON.stringify(JSON.parse(e.details), null, 1)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── History Modal ─── */}
      {showHist && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowHist(false)}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-xl w-[560px] max-w-[90vw] max-h-[75vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-extrabold text-foreground">History</h2>
              <button onClick={() => setShowHist(false)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(75vh-64px)]">
              {history.length === 0 ? <p className="text-sm text-muted-foreground text-center py-12">No history</p> : (
                <div>
                  <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-muted/30">
                    <span>Date</span>
                    <span className="text-right">Opening</span>
                    <span className="text-right">Sales</span>
                    <span className="text-right">Closing</span>
                    <span className="text-center">Status</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {history.map((d: any) => (
                      <div key={d.drawer_id} className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-2 px-6 py-3 bg-card hover:bg-muted/20 transition-colors items-center">
                        <span className="text-sm font-bold text-foreground">{d.business_date}</span>
                        <span className="text-sm text-right tabular-nums text-muted-foreground">{formatCurrency(d.opening_balance)}</span>
                        <span className="text-sm text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">{formatCurrency(d.cash_sales)}</span>
                        <span className="text-sm text-right tabular-nums text-foreground font-black">{formatCurrency(d.expected_closing)}</span>
                        <span className="text-center">
                          <span className={clsx("text-[10px] font-black px-2 py-1 rounded-md", d.status === 'CLOSED' ? 'text-muted-foreground bg-muted' : 'text-emerald-500 bg-emerald-500/10')}>{d.status}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
