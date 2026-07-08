import { useState, useEffect, useCallback } from 'react';
import {
  Search, Banknote, Wallet, Smartphone, CreditCard, SplitSquareHorizontal,
  CheckCircle2, Plus, Minus, History, X, Receipt, DollarSign,
  TrendingUp, TrendingDown, ArrowRight, ArrowLeft, Clock, AlertTriangle,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import { Select } from './ui/Select';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

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
  let utcStr = d;
  if (d.includes(' ') && !d.includes('Z') && !d.includes('+')) {
    utcStr = d.replace(' ', 'T') + 'Z';
  } else if (!d.includes('Z') && !d.includes('+') && d.includes('T')) {
    utcStr = d + 'Z';
  }
  return new Date(utcStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

  const [showHist, setShowHist] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [daySettlements, setDaySettlements] = useState<any[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(false);

  const [yesterdayNotClosed, setYesterdayNotClosed] = useState(false);
  const [yesterdayDrawer, setYesterdayDrawer] = useState<any>(null);
  const [closingDate, setClosingDate] = useState<string | null>(null);
  const [openingBalError, setOpeningBalError] = useState('');

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
    if (Array.isArray(invs)) setPendingInvoices(invs);
    if (Array.isArray(txs)) setTransactions(txs);
  }, [tenantId, searchQuery]);

  useEffect(() => { Promise.all([load()]).finally(() => setLoading(false)); }, [load]);

  // When drawer is null (no auto-open), check if yesterday was not closed
  useEffect(() => {
    if (!drawer && tenantId && !loading) {
      window.electronAPI?.dbCashierGetHistory({ tenant_id: tenantId, limit: 2 }).then(history => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
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
      business_date: closingDate || undefined,
    });
    setCloseSubmitting(false);
    if (r.success) { setCloseResult(r); await load(); }
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
    const r = await window.electronAPI!.dbCashierGetDaySettlements({ tenant_id: tenantId, business_date: businessDate });
    if (Array.isArray(r)) setDaySettlements(r);
    else setDaySettlements([]);
    setLoadingSettlements(false);
  };

  const drawerOpen   = drawer?.status === 'OPEN';
  const drawerClosed = drawer?.status === 'CLOSED';

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-background">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <Banknote className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm font-bold text-muted-foreground animate-pulse">Loading settlement data…</p>
      </div>
    );
  }

  // ── Derived summary values ────────────────────────────────────────────────
  const totalIn  = transactions.filter((t: any) => t.type === 'CASH_IN' ).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalOut = transactions.filter((t: any) => t.type === 'CASH_OUT').reduce((s: number, t: any) => s + Number(t.amount), 0);

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden text-foreground">

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      {!showHist && (
      <header className="relative shrink-0 z-30 border-b border-border/70">
        {/* Top gradient accent strip */}
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: 'linear-gradient(90deg, var(--primary) 0%, transparent 100%)' }}
        />
        <div className="flex items-center justify-between px-6 py-3 bg-card shadow-sm gap-4">
          {/* Left: title + status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-foreground tracking-tight">Cash Settlement</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {/* Status pill */}
                <span className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border',
                  drawerOpen   ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                  drawerClosed ? 'bg-muted text-muted-foreground border-border' :
                  yesterdayNotClosed ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' :
                                 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                )}>
                  <span className={clsx(
                    'w-1.5 h-1.5 rounded-full',
                    drawerOpen ? 'bg-emerald-500 animate-pulse' : drawerClosed ? 'bg-muted-foreground' : yesterdayNotClosed ? 'bg-rose-500' : 'bg-amber-500'
                  )} />
                  {drawerOpen ? 'Open' : drawerClosed ? 'Closed' : yesterdayNotClosed ? 'Blocked' : 'Not Started'}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold tabular-nums">
                  {drawer?.business_date || todayStr()}
                </span>
                {yesterdayNotClosed && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Close yesterday first
                  </span>
                )}
                {drawerClosed && drawer?.actual_cash !== null && drawer?.actual_cash !== undefined && (
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border',
                    drawer.cash_short > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' :
                    drawer.cash_excess > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  )}>
                    Actual: {formatCurrency(drawer.actual_cash)}
                    {drawer.cash_short > 0 && ` (Short −${formatCurrency(drawer.cash_short)})`}
                    {drawer.cash_excess > 0 && ` (Excess +${formatCurrency(drawer.cash_excess)})`}
                    {drawer.cash_short === 0 && drawer.cash_excess === 0 && ' (Matched)'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Centre: balance hero (only when drawer exists) */}
          {drawer && (
            <div className="hidden md:flex flex-col items-center">
              <span className="text-xl font-black text-foreground tabular-nums tracking-tight">
                {formatCurrency(drawerClosed ? drawer.expected_closing : (drawer.current_cash || 0))}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {drawerClosed ? 'Expected Closing' : 'Current Balance'}
              </span>
            </div>
          )}

          {/* Right: action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={openHistory}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <History className="w-3.5 h-3.5" /> History
            </button>
            {!drawerClosed && (
              <button
                onClick={() => { setOpeningBalInput(drawer?.opening_balance || 0); setOpeningBalError(''); setShowOpeningBal(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary hover:bg-primary/10 border border-primary/20 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5" /> Opening Bal
              </button>
            )}
            {drawerOpen && !closeResult && (
              <button
                onClick={() => { setActualCash(drawer?.expected_closing || 0); setCloseResult(null); setShowDayClose(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10 border border-destructive/25 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Close Day
              </button>
            )}
            <span className="w-px h-6 bg-border/40 mx-1" />
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
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
          {/* ── Header ── */}
          <div className="relative shrink-0 border-b border-border/70">
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, hsl(217,91%,60%) 0%, transparent 60%)' }} />
            <div className="flex items-center justify-between px-6 py-3 bg-card">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10"><History className="w-4 h-4 text-blue-500" /></div>
                <div>
                  <h2 className="text-sm font-extrabold text-foreground tracking-tight">Settlement History</h2>
                  <p className="text-[10px] text-muted-foreground font-semibold">{history.length} session{history.length !== 1 ? 's' : ''} recorded</p>
                </div>
              </div>
              <button onClick={() => setShowHist(false)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Close">
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>
          </div>

          {/* ── Summary cards ── */}
          {history.length > 0 && (() => {
            const totalSales     = history.reduce((s: number, d: any) => s + Number(d.cash_sales       || 0), 0);
            const totalCollected = history.reduce((s: number, d: any) => s + Number(d.total_collected  || 0), 0);
            let totalShort = 0, totalExcess = 0;
            history.filter((d: any) => d.status === 'CLOSED').forEach((d: any) => {
              const v = Number(d.actual_cash ?? 0) - Number(d.expected_closing ?? 0);
              if (v < 0) totalShort += Math.abs(v);
              else totalExcess += v;
            });
            return (
              <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-border/50 bg-muted/5 shrink-0">
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/60 shadow-sm">
                  <div className="p-2.5 rounded-xl bg-blue-500/10"><History className="w-4 h-4 text-blue-500" /></div>
                  <div><p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Sessions</p><p className="text-xl font-black text-foreground tabular-nums">{history.length}</p></div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/60 shadow-sm">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10"><TrendingUp className="w-4 h-4 text-emerald-500" /></div>
                  <div><p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Cash Sales</p><p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(totalSales)}</p></div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/60 shadow-sm">
                  <div className="p-2.5 rounded-xl bg-violet-500/10"><DollarSign className="w-4 h-4 text-violet-500" /></div>
                  <div><p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Total Collected</p><p className="text-xl font-black text-violet-600 dark:text-violet-400 tabular-nums">{formatCurrency(totalCollected)}</p></div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/60 shadow-sm">
                  <div className={clsx('p-2.5 rounded-xl', totalShort > 0 ? 'bg-rose-500/10' : 'bg-emerald-500/10')}>
                    {totalShort > 0 ? <TrendingDown className="w-4 h-4 text-rose-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Short / Excess</p>
                    <p className={clsx('text-xl font-black tabular-nums', totalShort > 0 ? 'text-rose-500' : totalExcess > 0 ? 'text-emerald-500' : 'text-muted-foreground')}>
                      {totalShort > 0 ? `−${formatCurrency(totalShort)}` : totalExcess > 0 ? `+${formatCurrency(totalExcess)}` : '✓ Clean'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Table ── */}
          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-12">
                <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center"><History className="w-7 h-7 text-muted-foreground/40" /></div>
                <div className="text-center"><p className="text-sm font-bold text-foreground">No history yet</p><p className="text-xs text-muted-foreground/60 mt-1">Completed sessions will appear here</p></div>
              </div>
            ) : (
              <div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr_0.8fr_0.9fr_0.7fr_0.7fr] gap-x-2 px-4 py-2.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/20 sticky top-0 z-10">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-foreground" onClick={() => setExpandedDay(null)}>Date <ChevronDown className="w-2.5 h-2.5 opacity-40" /></span>
                  <span>Cashier</span>
                  <span className="text-right">Opening</span>
                  <span className="text-right">Sales</span>
                  <span className="text-right">In</span>
                  <span className="text-right">Out</span>
                  <span className="text-right">Closing</span>
                  <span className="text-right">Actual</span>
                  <span className="text-center">Var</span>
                  <span className="text-center">Settled</span>
                  <span className="text-center">Status</span>
                </div>

                <div className="divide-y divide-border/30">
                  {history.map((d: any, idx: number) => {
                    const isClosed  = d.status === 'CLOSED';
                    const variance  = Number(d.actual_cash ?? 0) - Number(d.expected_closing ?? 0);
                    const hasVar    = isClosed && d.actual_cash !== null && d.actual_cash !== undefined;
                    const isExpanded = expandedDay === d.business_date;
                    const cashierName = d.opened_by_name || d.closed_by_name || '—';

                    return (
                      <div key={d.drawer_id}>
                        {/* Main row — clickable to expand */}
                        <div
                          onClick={() => loadDaySettlements(d.business_date)}
                          className={clsx(
                            'grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr_0.8fr_0.9fr_0.7fr_0.7fr] gap-x-2 px-4 py-3 items-center transition-all duration-150 cursor-pointer border-l-3',
                            !isClosed ? 'border-l-blue-500/80' :
                            variance < 0 ? 'border-l-rose-500/80' :
                            variance > 0 ? 'border-l-amber-500/80' :
                            'border-l-emerald-500/80',
                            idx % 2 === 0 ? 'bg-card' : 'bg-muted/20',
                            isExpanded ? 'bg-primary/5 shadow-inner' : 'hover:bg-primary/5'
                          )}
                        >
                          {/* Date */}
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={clsx('w-3 h-3 text-muted-foreground/50 transition-transform duration-200', isExpanded && 'rotate-90')} />
                            <div className="flex flex-col gap-0">
                              <span className="text-xs font-bold text-foreground leading-tight">{d.business_date}</span>
                              {d.settled_count > 0 && <span className="text-[9px] text-muted-foreground font-medium">{d.settled_count} invoice{d.settled_count !== 1 ? 's' : ''}</span>}
                            </div>
                          </div>

                          {/* Cashier */}
                          <span className="text-[10px] text-muted-foreground truncate font-medium">{cashierName}</span>

                          {/* Opening */}
                          <span className="text-xs text-right tabular-nums text-muted-foreground font-medium">{formatCurrency(d.opening_balance)}</span>

                          {/* Sales */}
                          <span className="text-xs text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">{formatCurrency(d.cash_sales)}</span>

                          {/* Cash In */}
                          <span className="text-xs text-right tabular-nums text-blue-500 font-bold">{formatCurrency(d.cash_in || 0)}</span>

                          {/* Cash Out */}
                          <span className="text-xs text-right tabular-nums text-rose-500 font-bold">{formatCurrency(d.cash_out || 0)}</span>

                          {/* Expected closing */}
                          <span className="text-xs text-right tabular-nums text-foreground font-black">{formatCurrency(d.expected_closing)}</span>

                          {/* Actual (if closed) */}
                          <span className={clsx('text-xs text-right tabular-nums font-bold', isClosed ? 'text-foreground' : 'text-muted-foreground/40')}>
                            {isClosed && d.actual_cash !== null ? formatCurrency(d.actual_cash) : '—'}
                          </span>

                          {/* Variance */}
                          <div className="flex justify-center">
                            {hasVar ? (
                              <span className={clsx(
                                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black',
                                variance > 0 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' :
                                variance < 0 ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10' :
                                'text-muted-foreground bg-muted/40'
                              )}>
                                {variance > 0 ? `+${formatCurrency(variance)}` : variance < 0 ? formatCurrency(variance) : '✓'}
                              </span>
                            ) : (
                              <span className="text-[9px] text-muted-foreground/40">—</span>
                            )}
                          </div>

                          {/* Settled (total collected) */}
                          <div className="flex justify-center">
                            <span className="text-xs font-black text-violet-600 dark:text-violet-400 tabular-nums">{d.total_collected ? formatCurrency(d.total_collected) : '—'}</span>
                          </div>

                          {/* Status */}
                          <div className="flex justify-center">
                            <span className={clsx(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black border',
                              isClosed
                                ? 'bg-muted text-muted-foreground border-border'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                            )}>
                              <span className={clsx('w-1.5 h-1.5 rounded-full', isClosed ? 'bg-muted-foreground' : 'bg-emerald-500 animate-pulse')} />
                              {isClosed ? 'Closed' : 'Open'}
                            </span>
                          </div>
                        </div>

                        {/* ── Expanded detail row: individual settlements ── */}
                        {isExpanded && (
                          <div className="bg-muted/10 border-t border-b border-border/30">
                            {loadingSettlements ? (
                              <div className="flex items-center justify-center py-6 gap-2">
                                <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                <span className="text-xs text-muted-foreground font-medium">Loading settlements…</span>
                              </div>
                            ) : daySettlements.length === 0 ? (
                              <div className="flex items-center justify-center py-6">
                                <p className="text-xs text-muted-foreground/60 font-medium">No settlements found for this date</p>
                              </div>
                            ) : (
                              <div className="py-2 px-8">
                                {/* Sub-header */}
                                <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr_0.8fr] gap-x-3 px-3 py-2 text-[8px] font-black text-muted-foreground uppercase tracking-wider border-b border-border/40">
                                  <span>Invoice</span>
                                  <span>Customer</span>
                                  <span className="text-right">Amount</span>
                                  <span className="text-right">Disc</span>
                                  <span className="text-center">Payment</span>
                                  <span className="text-right">Cashier</span>
                                </div>
                                <div className="divide-y divide-border/20">
                                  {daySettlements.map((inv: any) => (
                                    <div key={inv.invoice_id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr_0.8fr] gap-x-3 px-3 py-2 items-center hover:bg-card/50">
                                      <span className="text-xs font-bold text-foreground truncate">{inv.invoice_number}</span>
                                      <span className="text-[10px] text-muted-foreground truncate">{inv.customer_name || '—'}</span>
                                      <span className="text-xs text-right tabular-nums text-foreground font-semibold">{formatCurrency(inv.grand_total)}</span>
                                      <span className="text-xs text-right tabular-nums text-amber-500 font-bold">{inv.discount_total ? formatCurrency(inv.discount_total) : '—'}</span>
                                      <div className="flex justify-center">
                                        <span className={clsx(
                                          'text-[9px] font-black px-1.5 py-0.5 rounded-md text-center',
                                          inv.payment_method === 'CASH' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' :
                                          inv.payment_method === 'CARD' ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10' :
                                          inv.payment_method === 'UPI' ? 'text-violet-600 dark:text-violet-400 bg-violet-500/10' :
                                          'text-muted-foreground bg-muted/40'
                                        )}>
                                          {inv.payment_method}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-muted-foreground text-right truncate">{inv.biller_name || '—'}</span>
                                    </div>
                                  ))}
                                </div>
                                {/* Settlement totals */}
                                {(() => {
                                  const totalAmt = daySettlements.reduce((s: number, i: any) => s + Number(i.grand_total || 0), 0);
                                  const totalDisc = daySettlements.reduce((s: number, i: any) => s + Number(i.discount_total || 0), 0);
                                  const totalRecv = daySettlements.reduce((s: number, i: any) => s + Number(i.received_amount || 0), 0);
                                  return (
                                    <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr_0.8fr] gap-x-3 px-3 py-2 mt-1 border-t border-border/40 bg-card/50 rounded-b-lg">
                                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Totals</span>
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
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── NORMAL TWO-COLUMN SPLIT ───────────────────────────── */
        <div className="flex-1 flex min-h-0">

        {/* ═══ LEFT: Pending Invoices ═══════════════════════════════════════ */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border/70">

          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/10 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search invoice or customer…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-card border border-border/70 rounded-xl outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 text-foreground placeholder:text-muted-foreground/50 transition-all duration-200"
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
                {pendingInvoices.length}
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
          <div className="grid grid-cols-[1.4fr_1.4fr_1fr_0.8fr_1fr_1.4fr_0.9fr] gap-x-3 px-4 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/20 shrink-0">
            <span className="text-center">Invoice</span>
            <span className="text-center">Customer</span>
            <span className="text-center">Amount</span>
            <span className="text-center">Disc</span>
            <span className="text-center">Net</span>
            <span className="text-center">Payment</span>
            <span className="text-center">Action</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {pendingInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-10">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-foreground">All Settled!</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">No pending invoices for today</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {pendingInvoices.map((inv, idx) => {
                  const rd  = rowDiscs[inv.invoice_id] ?? 0;
                  const rm  = rowMethods[inv.invoice_id] ?? 'CASH';
                  const net = Math.max(0, inv.grand_total - rd);
                  const isPaying = payingRow === inv.invoice_id;
                  return (
                    <div
                      key={inv.invoice_id}
                      className={clsx(
                        'grid grid-cols-[1.4fr_1.4fr_1fr_0.8fr_1fr_1.4fr_0.9fr] gap-x-3 px-4 py-2.5 transition-all duration-150 items-center group hover:bg-primary/5',
                        idx % 2 === 0 ? 'bg-card' : 'bg-muted/25'
                      )}
                    >
                      {/* Invoice number */}
                      <span className="text-xs font-bold text-foreground truncate text-center block">{inv.invoice_number}</span>

                      {/* Customer */}
                      <span className="text-xs text-muted-foreground truncate text-center block">{inv.customer_name || '—'}</span>

                      {/* Amount */}
                      <span className="text-xs font-black text-foreground text-center tabular-nums block">{formatCurrency(inv.grand_total)}</span>

                      {/* Discount input */}
                      <div className="flex justify-center">
                        <input
                          type="number"
                          value={rd || ''}
                          onChange={(e) =>
                            setRowDiscs((p) => ({ ...p, [inv.invoice_id]: Math.max(0, Number(e.target.value)) }))
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full py-1.5 text-[10px] font-bold bg-card border border-amber-500/20 rounded-lg outline-none focus:border-amber-500/60 text-foreground tabular-nums text-center transition-all"
                          step="1" min="0" placeholder="0"
                        />
                      </div>

                      {/* Net */}
                      <span className="text-xs font-black text-primary text-center tabular-nums block">{formatCurrency(net)}</span>

                      {/* Payment method dropdown */}
                      <div className="flex justify-center">
                        <Select
                          value={rm}
                          onChange={(v) => setRowMethods((p) => ({ ...p, [inv.invoice_id]: v as PaymentMethod }))}
                          options={PAYMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                          size="sm"
                        />
                      </div>

                      {/* Pay button */}
                      <div className="flex justify-center">
                        <button
                          onClick={async () => {
                            if (payingRow) return;
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
                          className={clsx(
                            'flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black text-white transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 shadow-sm',
                            isPaying ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md'
                          )}
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
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: Cash Register ═════════════════════════════════════════ */}
        <div className="w-[400px] shrink-0 flex flex-col bg-card border-l border-border/50 z-10">

          {/* Panel header */}
          <div className="relative shrink-0">
            <div
              className="absolute inset-x-0 top-0 h-0.5"
              style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(217,91%,60%) 50%, transparent 100%)' }}
            />
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
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
                  setTxnPartyId(''); setTxnPartyName(''); setPartySearch('');
                  setShowTxnModal(true);
                  if (!parties.length) {
                    const p = await window.electronAPI!.dbGetParties(tenantId!);
                    if (Array.isArray(p)) setParties(p);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary hover:bg-primary/10 border border-primary/20 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Entry
              </button>
            </div>
          </div>

          {/* Mini stat cards for IN / OUT */}
          <div className="grid grid-cols-2 gap-3 px-5 py-3 border-b border-border/50 bg-muted/5 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
              <div className="p-1.5 rounded-lg bg-emerald-500/15">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash In</p>
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">{formatCurrency(totalIn)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/20">
              <div className="p-1.5 rounded-lg bg-rose-500/15">
                <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Out</p>
                <p className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums leading-tight">{formatCurrency(totalOut)}</p>
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/20 shrink-0">
            <span>Time</span>
            <span>Type</span>
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span className="text-right">By</span>
          </div>

          {/* Transaction feed */}
          <div className="flex-1 overflow-y-auto">
            {transactions.length === 0 && (!drawer || !drawer.opening_balance) ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center">
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
                {drawer && drawer.opening_balance >= 0 && (
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
                  return (
                    <div
                      key={tx.transaction_id}
                      className={clsx(
                        'grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/20 transition-colors items-center border-l-2',
                        isIn ? 'border-l-emerald-500/50' : 'border-l-rose-500/50'
                      )}
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
                      <span className="text-xs text-foreground truncate font-medium">{tx.category || 'Other'}</span>
                      <span className={clsx('text-xs font-black text-right tabular-nums', isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
                        {isIn ? '+' : '−'}{formatCurrency(tx.amount)}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate text-right">{tx.entered_by_name || '—'}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
            className="bg-card border border-border/80 rounded-2xl shadow-2xl w-[480px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="relative px-6 py-4 border-b border-border/60"
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
                  className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
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
                    <div className="p-4 bg-muted/30 rounded-xl text-center border border-border/40">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Expected</p>
                      <p className="text-lg font-black text-foreground">{formatCurrency(closeResult.expected_closing)}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-xl text-center border border-border/40">
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
                    <div className="p-4 bg-muted/20 rounded-xl text-center border border-border/40">
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
                      />
                    </div>
                  </div>
                  <textarea
                    value={closeRemarks}
                    onChange={(e) => setCloseRemarks(e.target.value)}
                    placeholder="Closing remarks (optional)"
                    className="w-full px-4 py-2.5 text-sm bg-card border border-border/70 rounded-xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowDayClose(false); setClosingDate(null); }}
                      className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer"
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
            className="bg-card border border-border/80 rounded-2xl shadow-2xl w-80 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-6 py-4 border-b border-border/60"
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
                  className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer"
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
            }
          }}
        >
          <div
            className="bg-card border border-border/80 rounded-2xl shadow-2xl w-[420px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="relative px-6 py-4 border-b border-border/60"
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

            <div className="p-6 space-y-4">
              {/* Toggle */}
              <div className="flex rounded-xl bg-muted/40 border border-border/60 p-1 gap-1">
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
                <Select
                  value={txnCat}
                  onChange={setTxnCat}
                  placeholder="Select category"
                  options={
                    txnType === 'CASH_IN'
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
                        ]
                  }
                />
              </div>

              {/* Link to Party */}
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Link to Party <span className="font-normal normal-case text-muted-foreground/50">(optional)</span>
                </label>
                {txnPartyId ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/70 rounded-2xl shadow-sm">
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
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-card border border-border/70 rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 shadow-sm transition-all"
                    />
                    {partySearch && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border/80 rounded-2xl shadow-xl z-10 max-h-40 overflow-y-auto">
                        {parties
                          .filter((p: any) => p.name.toLowerCase().includes(partySearch.toLowerCase()))
                          .slice(0, 20)
                          .map((p: any) => (
                            <button
                              key={p.party_id}
                              onClick={() => { setTxnPartyId(p.party_id); setTxnPartyName(p.name); setPartySearch(''); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer border-b border-border/40 last:border-0"
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
                  className="w-full px-4 py-2.5 text-sm bg-card border border-border/70 rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote('');
                    setTxnPartyId(''); setTxnPartyName(''); setPartySearch('');
                  }}
                  className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all duration-200 active:scale-[0.98] cursor-pointer"
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
    </div>
  );
}
