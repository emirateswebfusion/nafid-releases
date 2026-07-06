import { useState, useEffect, useCallback } from 'react';
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
  const [drawer, setDrawer] = useState<any>(null);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [rowDiscs, setRowDiscs] = useState<Record<string, number>>({});
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
    if (Array.isArray(txs)) setTransactions(txs);
  }, [tenantId, searchQuery]);

  useEffect(() => { Promise.all([load()]).finally(() => setLoading(false)); }, [load]);

  const handleSetOpening = async () => {
    if (!tenantId || !userId) return;
    const r = await window.electronAPI!.dbCashierSetOpeningBalance({
      tenant_id: tenantId, opening_balance: openingBalInput,
      user_id: userId, user_name: userName || undefined,
    });
    if (r.success) { setShowOpeningBal(false); await load(); }
  };

  const handleAddTransaction = async () => {
    if (!tenantId || !userId || txnAmt <= 0) return;
    setTxnSubmitting(true);
    const r = await window.electronAPI!.dbCashierAddTransaction({
      tenant_id: tenantId, type: txnType, amount: txnAmt,
      category: txnCat || undefined, notes: txnNote || undefined,
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
    if (r.success) { setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setShowTxnModal(false); await load(); }
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
          <span className="w-px h-6 bg-border/40" />
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Close">
            <X className="w-4 h-4 text-destructive" />
          </button>
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
                {pendingInvoices.map((inv) => {
                  const rd = rowDiscs[inv.invoice_id] ?? 0;
                  const rm = rowMethods[inv.invoice_id] ?? 'CASH';
                  const net = Math.max(0, inv.grand_total - rd);
                  return (
                    <div key={inv.invoice_id}
                      className="grid grid-cols-[0.9fr_1.1fr_0.5fr_0.5fr_0.5fr_0.45fr_0.35fr] gap-1.5 px-4 py-2 bg-card hover:bg-muted/20 transition-colors items-center">
                      <span className="text-xs font-bold text-foreground truncate">{inv.invoice_number}</span>
                      <span className="text-xs text-muted-foreground truncate">{inv.customer_name || '\u2014'}</span>
                      <span className="text-xs font-black text-foreground text-right tabular-nums">{formatCurrency(inv.grand_total)}</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{'\u20B9'}</span>
                        <input type="number" value={rd} onChange={e => setRowDiscs(p => ({ ...p, [inv.invoice_id]: Math.max(0, Number(e.target.value)) }))}
                          className="w-full pl-[18px] pr-1.5 py-1.5 text-xs font-bold bg-card border border-amber-500/25 rounded-lg outline-none focus:border-amber-500 text-foreground tabular-nums text-right"
                          step="1" min="0" placeholder="0" />
                      </div>
                      <span className="text-xs font-black text-primary text-right tabular-nums">{formatCurrency(net)}</span>
                      <select value={rm} onChange={e => setRowMethods(p => ({ ...p, [inv.invoice_id]: e.target.value as PaymentMethod }))}
                        className="px-1 py-1.5 text-[10px] font-bold bg-card border border-border/60 rounded-lg outline-none text-foreground text-center">
                        {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button onClick={async () => {
                        if (payingRow) return;
                        setPayingRow(inv.invoice_id);
                        const r = await window.electronAPI!.dbCashierSettlePayment({
                          tenant_id: tenantId!, invoice_id: inv.invoice_id,
                          received_amount: net, payment_method: rm,
                          user_id: userId!, user_name: userName || undefined,
                        });
                        setPayingRow(null);
                        if (r.success) await load();
                      }} disabled={payingRow === inv.invoice_id}
                        className="px-2 py-1.5 text-[10px] font-black text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer disabled:opacity-40">
                        {payingRow === inv.invoice_id ? '...' : 'Pay'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: Cash Register ═══ */}
        <div className="w-[440px] min-w-0 flex flex-col bg-card shadow-2xl z-10">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <Banknote className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-foreground tracking-tight">Cash Register</h2>
                <p className="text-[10px] font-semibold text-muted-foreground">Manual entries</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => { setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setTxnType('CASH_IN'); setShowTxnModal(true); if (!parties.length) { const p = await window.electronAPI!.dbGetParties(tenantId); if (Array.isArray(p)) setParties(p); } }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-emerald-500 hover:bg-emerald-500/10 border border-emerald-500/20 transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Cash In
              </button>
              <button
                onClick={async () => { setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setTxnType('CASH_OUT'); setShowTxnModal(true); if (!parties.length) { const p = await window.electronAPI!.dbGetParties(tenantId); if (Array.isArray(p)) setParties(p); } }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Minus className="w-3.5 h-3.5" /> Expense
              </button>
            </div>
          </div>

          {/* Summary Bar */}
          {transactions.length > 0 && (
            <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border/60 bg-muted/10">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-xs font-black text-emerald-500 tabular-nums">
                  {formatCurrency(transactions.filter((t: any) => t.type === 'CASH_IN').reduce((s: number, t: any) => s + Number(t.amount), 0))}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">In</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <span className="text-xs font-black text-rose-500 tabular-nums">
                  {formatCurrency(transactions.filter((t: any) => t.type === 'CASH_OUT').reduce((s: number, t: any) => s + Number(t.amount), 0))}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Out</span>
              </div>
            </div>
          )}

          {/* Table header */}
          <div className="grid grid-cols-[0.6fr_0.55fr_1fr_0.7fr_auto] gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-muted/30">
            <span>Time</span>
            <span>Type</span>
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span className="text-right">By</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <Banknote className="w-10 h-10 mb-2 text-muted-foreground/30" />
                <p className="text-sm font-bold">No manual entries</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Use Cash In or Expense to record transactions</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {transactions.map((tx: any) => {
                  const isIn = tx.type === 'CASH_IN';
                  return (
                    <div key={tx.transaction_id}
                      className="grid grid-cols-[0.6fr_0.55fr_1fr_0.7fr_auto] gap-2 px-6 py-2.5 bg-card hover:bg-muted/20 transition-colors items-center">
                      <span className="text-xs text-muted-foreground tabular-nums">{formatTime(tx.transaction_date)}</span>
                      <span className={clsx("text-[10px] font-black px-1.5 py-0.5 rounded-md text-center w-fit", isIn ? "text-emerald-500 bg-emerald-500/10" : "text-rose-500 bg-rose-500/10")}>
                        {isIn ? 'IN' : 'OUT'}
                      </span>
                      <span className="text-sm text-foreground truncate font-medium">{tx.category || 'Other'}</span>
                      <span className={clsx("text-sm font-black text-right tabular-nums", isIn ? "text-emerald-500" : "text-destructive")}>
                        {isIn ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                      <span className="text-xs text-muted-foreground truncate text-right">{tx.entered_by_name || '-'}</span>
                    </div>
                  );
                })}
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
                      <input type="number" value={actualCash || ''} onChange={e => setActualCash(e.target.value === '' ? 0 : Number(e.target.value))}
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
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-base font-extrabold text-foreground">Opening Balance</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground font-medium">Cash at start of day</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{'\u20B9'}</span>
                <input type="number" value={openingBalInput || ''} onChange={e => setOpeningBalInput(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all"
                  step="0.01" min="0" placeholder="Enter opening balance" autoFocus />
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

      {/* ─── Add Transaction Modal ─── */}
      {showTxnModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => { if (!txnSubmitting) { setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); } }}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-xl w-[420px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className={clsx("p-1.5 rounded-lg", txnType === 'CASH_IN' ? "bg-emerald-500/10" : "bg-rose-500/10")}>
                  {txnType === 'CASH_IN' ? <Plus className="w-4 h-4 text-emerald-500" /> : <Receipt className="w-4 h-4 text-rose-500" />}
                </div>
                <h2 className="text-base font-extrabold text-foreground">{txnType === 'CASH_IN' ? 'Cash In' : 'Record Expense'}</h2>
              </div>
              <button onClick={() => { if (!txnSubmitting) { setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); } }}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{'\u20B9'}</span>
                  <input type="number" value={txnAmt || ''} onChange={e => setTxnAmt(e.target.value === '' ? 0 : Number(e.target.value))}
                    className={clsx("w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 rounded-2xl outline-none text-foreground tabular-nums shadow-sm transition-all", txnType === 'CASH_IN' ? "border-emerald-500/25 focus:border-emerald-500" : "border-rose-500/25 focus:border-rose-500")}
                    step="0.01" min="0" placeholder="Enter amount" autoFocus />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Category</label>
                <select value={txnCat} onChange={e => setTxnCat(e.target.value)}
                  className={clsx("w-full px-4 py-3 text-sm bg-card border border-border/80 rounded-2xl outline-none text-foreground shadow-sm transition-all", txnType === 'CASH_IN' ? "focus:border-emerald-500/30" : "focus:border-rose-500/30")}>
                  <option value="">Select category</option>
                  {txnType === 'CASH_IN' ? (
                    <>
                      <option value="Cash Deposit">Cash Deposit</option>
                      <option value="Petty Cash Return">Petty Cash Return</option>
                      <option value="Loan Repayment">Loan Repayment</option>
                      <option value="Customer Payment">Customer Payment</option>
                      <option value="Other Income">Other Income</option>
                    </>
                  ) : (
                    <>
                      <option value="Petty Cash">Petty Cash</option>
                      <option value="Electricity">Electricity</option>
                      <option value="Rent">Rent</option>
                      <option value="Salary">Salary</option>
                      <option value="Transport">Transport</option>
                      <option value="Stationery">Stationery</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Other">Other</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Link to Party <span className="font-normal normal-case text-muted-foreground/50">(optional)</span></label>
                {txnPartyId ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/80 rounded-2xl shadow-sm">
                    <span className="text-sm font-bold text-foreground flex-1 truncate">{txnPartyName}</span>
                    <button onClick={() => { setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); }}
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input type="text" value={partySearch} onChange={e => { setPartySearch(e.target.value); }}
                      placeholder="Search party..."
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-card border border-border/80 rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 shadow-sm transition-all" />
                    {partySearch && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border/80 rounded-2xl shadow-xl z-10 max-h-40 overflow-y-auto">
                        {parties.filter((p: any) => p.name.toLowerCase().includes(partySearch.toLowerCase())).slice(0, 20).map((p: any) => (
                          <button key={p.party_id} onClick={() => { setTxnPartyId(p.party_id); setTxnPartyName(p.name); setPartySearch(''); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer border-b border-border/40 last:border-0">
                            <span className="font-bold">{p.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{p.phone || ''}</span>
                          </button>
                        ))}
                        {parties.filter((p: any) => p.name.toLowerCase().includes(partySearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-xs text-muted-foreground text-center">No parties found</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Notes <span className="font-normal normal-case text-muted-foreground/50">(optional)</span></label>
                <textarea value={txnNote} onChange={e => setTxnNote(e.target.value)} placeholder="Add a note..."
                  className="w-full px-4 py-2.5 text-sm bg-card border border-border/80 rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all" />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); }}
                  className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer">
                  Cancel
                </button>
                <button onClick={handleAddTransaction} disabled={txnSubmitting || txnAmt <= 0}
                  className={clsx("flex-1 py-3 text-sm font-black text-white rounded-xl shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-40", txnType === 'CASH_IN' ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600")}>
                  {txnSubmitting ? 'Recording...' : txnType === 'CASH_IN' ? 'Record Cash In' : 'Record Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
