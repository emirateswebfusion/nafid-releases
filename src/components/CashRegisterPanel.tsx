import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  X, Plus, Minus, TrendingUp, TrendingDown, Clock, Receipt, Banknote,
  CheckCircle2, AlertTriangle, User2, DollarSign, Search
} from 'lucide-react';
import clsx from 'clsx';
import { Select } from '../components/ui/Select';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';

const formatCurrency = (v: any) => {
  const n = Number(v) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatBusinessDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  const cleanStr = String(d).split('T')[0].split(' ')[0];
  const parts = cleanStr.split('-');
  let date: Date;
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    date = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    date = new Date(d);
  }
  if (isNaN(date.getTime())) return String(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  return `${day}-${month}-${year} ${dayName}`;
};

const formatTime = (d: string) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export function CashRegisterPanel({ onClose }: { onClose: () => void }) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName } = useAuthStore();

  const [drawer, setDrawer] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showOpeningBal, setShowOpeningBal] = useState(false);
  const [openingBalInput, setOpeningBalInput] = useState<number>(0);
  const [openingBalError, setOpeningBalError] = useState('');

  const [showTxnModal, setShowTxnModal] = useState(false);
  const [txnType, setTxnType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_OUT');
  const [txnAmt, setTxnAmt] = useState<number>(0);
  const [txnCat, setTxnCat] = useState('');
  const [txnNote, setTxnNote] = useState('');
  const [txnSubmitting, setTxnSubmitting] = useState(false);

  const [showDayClose, setShowDayClose] = useState(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [closeRemarks, setCloseRemarks] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeResult, setCloseResult] = useState<any>(null);

  const [customCategories, setCustomCategories] = useState<any[]>([]);
  const [showAddCatForm, setShowAddCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  // ── Pending Invoices ──
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [pendingSearch, setPendingSearch] = useState('');
  const [rowMethods, setRowMethods] = useState<Record<string, string>>({});
  const [rowSources, setRowSources] = useState<Record<string, string>>({});
  const [paymentSources, setPaymentSources] = useState<any[]>([]);
  const [collectPaymentSaving, setCollectPaymentSaving] = useState(false);
  const [collectPaymentSuccess, setCollectPaymentSuccess] = useState(false);
  const [pendingInvoiceSelection, setPendingInvoiceSelection] = useState<string | null>(null);

  // ── Party Link for Transactions ──
  const [parties, setParties] = useState<any[]>([]);
  const [txnPartyId, setTxnPartyId] = useState('');
  const [txnPartyName, setTxnPartyName] = useState('');
  const [partySearch, setPartySearch] = useState('');

  const drawerOpen = drawer?.status === 'OPEN';
  const totalIn = transactions.filter(t => t.type === 'CASH_IN').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = transactions.filter(t => t.type === 'CASH_OUT').reduce((s, t) => s + Number(t.amount), 0);

  const load = useCallback(async () => {
    if (!window.electronAPI || !tenantId) return;
    setLoading(true);
    const [d, txs, invs, pts, srcs] = await Promise.all([
      window.electronAPI.dbCashierGetDrawer({ tenant_id: tenantId }),
      window.electronAPI.dbCashierGetTransactions({ tenant_id: tenantId }),
      window.electronAPI.dbCashierGetPendingInvoices({ tenant_id: tenantId, search: pendingSearch || undefined }),
      window.electronAPI.dbGetParties(tenantId),
      window.electronAPI.dbPaymentGetSources ? window.electronAPI.dbPaymentGetSources(tenantId) : Promise.resolve([]),
    ]);
    if (d && !d.error) { setDrawer(d); }
    else { setDrawer(null); }
    if (Array.isArray(txs)) setTransactions(txs);
    if (Array.isArray(invs)) setPendingInvoices(invs);
    if (Array.isArray(pts)) setParties(pts);
    if (Array.isArray(srcs)) setPaymentSources(srcs);
    setLoading(false);
  }, [tenantId, pendingSearch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const refresh = () => { load(); };
    const unsubscribeSync = (window.electronAPI as any)?.onSyncDataUpdated?.(refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('checkout:completed', refresh);
    window.addEventListener('cashier:closed', refresh);
    return () => {
      if (typeof unsubscribeSync === 'function') unsubscribeSync();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('checkout:completed', refresh);
      window.removeEventListener('cashier:closed', refresh);
    };
  }, [load]);

  const handleCollectPayment = async (invoiceId: string) => {
    if (!tenantId || !userId) return;
    setCollectPaymentSaving(true);
    setPendingInvoiceSelection(invoiceId);
    const method = rowMethods[invoiceId] || 'CASH';
    const inv = pendingInvoices.find((i: any) => i.invoice_id === invoiceId);
    const receivedAmount = inv ? Number(inv.grand_total) : 0;
    try {
      const r = await window.electronAPI!.dbCashierSettlePayment({
        invoice_id: invoiceId,
        tenant_id: tenantId,
        received_amount: receivedAmount,
        payment_method: method,
        payment_source_id: rowSources[invoiceId] || undefined,
        user_id: userId,
        user_name: userName || undefined,
      });
      if (r.success) {
        setCollectPaymentSuccess(true);
        setTimeout(() => setCollectPaymentSuccess(false), 2000);
        await load();
      }
    } catch (err) {
      console.error('Failed to collect payment:', err);
    }
    setCollectPaymentSaving(false);
    setPendingInvoiceSelection(null);
  };

  useEffect(() => {
    if (!drawer) {
      const timer = setTimeout(() => { if (!drawer) setShowOpeningBal(true); }, 500);
      return () => clearTimeout(timer);
    }
  }, [drawer]);

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
    if (r.success) { setTxnAmt(0); setTxnCat(''); setTxnNote(''); setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); setShowAddCatForm(false); setNewCatName(''); setShowTxnModal(false); await load(); }
  };

  const handleDayClose = async () => {
    if (!tenantId || !userId) return;
    setCloseSubmitting(true);
    const r = await window.electronAPI!.dbCashierDayClosing({
      tenant_id: tenantId, actual_cash: actualCash,
      closing_remarks: closeRemarks || undefined,
      user_id: userId, user_name: userName || undefined,
    });
    setCloseSubmitting(false);
    if (r.success) { setCloseResult(r); await load(); window.dispatchEvent(new Event('cashier:closed')); }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const form = target.closest('[data-enter-nav]');
    if (!form) return;
    e.preventDefault();
    const inputs = Array.from(form.querySelectorAll<HTMLElement>('input, select, button'));
    const idx = inputs.indexOf(target);
    if (idx >= 0 && idx < inputs.length - 1) {
      const next = inputs[idx + 1];
      if (next.tagName === 'INPUT' || next.tagName === 'SELECT') next.focus();
      else next.click();
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <Banknote className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm font-bold text-muted-foreground animate-pulse">Loading register data…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ═══ HEADER ═══ */}
      <header className="shrink-0 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <Banknote className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">Cash Register</h1>
                <span className={clsx(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  drawerOpen ? 'bg-emerald-500 animate-pulse' : drawer ? 'bg-muted-foreground' : 'bg-amber-500'
                )} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                  drawerOpen ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' :
                  drawer ? 'bg-muted text-muted-foreground border-border' :
                  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                )}>
                  {drawerOpen ? 'Open' : drawer ? 'Closed' : 'Not Started'}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold tabular-nums">
                  {formatBusinessDate(drawer?.business_date || new Date().toLocaleDateString('en-CA'))}
                </span>
                {drawer && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Sales: {formatCurrency(drawer.cash_sales || 0)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!drawerOpen && (
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
              onClick={onClose}
              className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* ═══ TWO-COLUMN MAIN CONTENT ═══ */}
      <div className="flex-1 flex min-h-0">

        {/* ═══ LEFT: Pending Invoices ═══ */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-border">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/10 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search invoice or customer…"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-card border border-border rounded-xl outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 text-foreground placeholder:text-muted-foreground/50 transition-all duration-200"
              />
            </div>
            <div className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shrink-0',
              pendingInvoices.length > 0 ? 'bg-amber-500/10 border-amber-500/25' : 'bg-emerald-500/10 border-emerald-500/25'
            )}>
              <span className={clsx('text-sm font-black tabular-nums leading-none', pendingInvoices.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                {pendingInvoices.length > 999 ? '999+' : pendingInvoices.length}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">Pending</span>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_0.8fr] gap-x-2 px-4 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20 shrink-0">
            <span className="text-center">Invoice</span>
            <span className="text-center">Customer</span>
            <span className="text-center">Amount</span>
            <span className="text-center">Payment</span>
            <span className="text-center">Action</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {collectPaymentSuccess && (
              <div className="mx-3 mt-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-600">
                <CheckCircle2 className="w-4 h-4" /> Payment collected successfully!
              </div>
            )}
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
                {pendingInvoices.map((inv: any, idx: number) => {
                  const method = rowMethods[inv.invoice_id] || 'CASH';
                  const isSaving = collectPaymentSaving && pendingInvoiceSelection === inv.invoice_id;
                  return (
                    <div
                      key={inv.invoice_id}
                      className={clsx(
                        'grid grid-cols-[1.2fr_1.2fr_1fr_1fr_0.8fr] gap-x-2 px-4 py-2.5 transition-all duration-150 items-center hover:bg-primary/5',
                        idx % 2 === 0 ? 'bg-card' : 'bg-muted/25'
                      )}
                    >
                      <span className="text-xs font-bold text-foreground truncate text-center">{inv.invoice_number}</span>
                      <span className="text-xs text-muted-foreground truncate text-center">{inv.customer_name || '—'}</span>
                      <span className="text-xs font-black text-foreground text-center tabular-nums">{formatCurrency(inv.grand_total)}</span>
                      <div className="flex flex-col items-center gap-1">
                        <select
                          value={method}
                          onChange={(e) => {
                            setRowMethods((p: any) => ({ ...p, [inv.invoice_id]: e.target.value }));
                            setRowSources((p: any) => ({ ...p, [inv.invoice_id]: '' }));
                          }}
                          className="text-[10px] font-bold bg-background border border-border rounded-lg px-1.5 py-1 text-foreground outline-none cursor-pointer"
                        >
                          <option value="CASH">Cash</option>
                          <option value="BANK_TRANSFER">Bank Transfer</option>
                          <option value="CARD">Card</option>
                          <option value="UPI">UPI</option>
                        </select>
                        {method !== 'CASH' && (
                          <select
                            value={rowSources[inv.invoice_id] || ''}
                            onChange={(e) => setRowSources((p: any) => ({ ...p, [inv.invoice_id]: e.target.value }))}
                            className="text-[10px] font-semibold bg-background border border-border rounded-lg px-1.5 py-1 text-muted-foreground outline-none cursor-pointer max-w-[140px]"
                          >
                            <option value="">{method === 'BANK_TRANSFER' ? 'Bank account...' : method === 'CARD' ? 'Card...' : 'UPI id...'}</option>
                            {paymentSources
                              .filter((s: any) =>
                                s.is_enabled === 1 &&
                                (method === 'BANK_TRANSFER' ? s.type === 'BANK' : s.type === method)
                              )
                              .map((s: any) => (
                                <option key={s.source_id} value={s.source_id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleCollectPayment(inv.invoice_id)}
                          disabled={isSaving}
                          className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-black text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                        >
                          {isSaving ? (
                            <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          {isSaving ? '' : 'Collect'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: Cash Register Feed ═══ */}
        <div className="w-[400px] shrink-0 flex flex-col bg-card z-10">
          {/* Panel header */}
          <div className="relative shrink-0">
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(217,91%,60%) 50%, transparent 100%)' }} />
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10">
                  <Receipt className="w-4 h-4 text-blue-500" />
                </div>
                <h2 className="text-sm font-extrabold text-foreground tracking-tight">Cash Register</h2>
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
          <div className="grid grid-cols-2 gap-3 px-5 py-3 border-b border-border bg-muted/5 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
              <div className="p-1.5 rounded-lg bg-emerald-500/15"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /></div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash In</p>
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">{formatCurrency(totalIn)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/20">
              <div className="p-1.5 rounded-lg bg-rose-500/15"><TrendingDown className="w-3.5 h-3.5 text-rose-500" /></div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Out</p>
                <p className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums leading-tight">{formatCurrency(totalOut)}</p>
              </div>
            </div>
          </div>

          {!drawer || !drawer.opening_balance || drawer.status === 'CLOSED' ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/60" />
              <p className="text-sm font-extrabold text-foreground">Cash Register Closed</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                Shift completed & archived in History. Set opening balance to start a new day.
              </p>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20 shrink-0">
                <span>Time</span><span>Type</span><span>Category</span><span className="text-right">Amount</span><span className="text-right">By</span>
              </div>
              {/* Transaction feed */}
              <div className="flex-1 overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                    <Banknote className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm font-bold">No entries</p>
                    <p className="text-xs text-muted-foreground/60">Use Add Entry to record cash-in or expenses</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {drawer && drawer.opening_balance != null && drawer.opening_balance >= 0 && (
                      <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/20 transition-colors items-center border-l-2 border-l-primary/50">
                        <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5"><Clock className="w-2.5 h-2.5 shrink-0" /> {drawer.opened_at ? formatTime(drawer.opened_at) : '—'}</span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md text-center w-fit text-primary bg-primary/10">OPEN</span>
                        <span className="text-xs text-foreground truncate font-bold">Opening Balance</span>
                        <span className="text-xs font-black text-right tabular-nums text-foreground">{formatCurrency(drawer.opening_balance)}</span>
                        <span className="text-[10px] text-muted-foreground truncate text-right">—</span>
                      </div>
                    )}
                    {transactions.map((tx: any) => {
                      const isIn = tx.type === 'CASH_IN';
                      return (
                        <div key={tx.transaction_id} className={clsx('grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/20 transition-colors items-center border-l-2', isIn ? 'border-l-emerald-500/50' : 'border-l-rose-500/50')}>
                          <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5"><Clock className="w-2.5 h-2.5 shrink-0" /> {formatTime(tx.transaction_date)}</span>
                          <span className={clsx('text-[9px] font-black px-1.5 py-0.5 rounded-md text-center w-fit', isIn ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10')}>{isIn ? 'IN' : 'OUT'}</span>
                          <span className="text-xs text-foreground truncate font-medium">{tx.category || 'Other'}</span>
                          <span className={clsx('text-xs font-black text-right tabular-nums', isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>{isIn ? '+' : '−'}{formatCurrency(tx.amount)}</span>
                          <span className="text-[10px] text-muted-foreground truncate text-right">{tx.entered_by_name || '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Opening Balance Modal ── */}
      {showOpeningBal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-[360px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border/60" style={{ background: 'linear-gradient(135deg, hsl(142,72%,29%,0.1) 0%, transparent 100%)' }}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15"><Banknote className="w-4 h-4 text-emerald-500" /></div>
                <h2 className="text-base font-extrabold text-foreground">Opening Balance</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground font-medium">Enter the cash amount at the start of today's shift.</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                <input type="number" value={openingBalInput || ''} onChange={e => setOpeningBalInput(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all"
                  step="0.01" min="0" placeholder="Enter opening balance" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSetOpening(); } }} />
              </div>
              {openingBalError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{openingBalError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowOpeningBal(false)} className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all active:scale-[0.98] cursor-pointer">Cancel</button>
                <button onClick={handleSetOpening} className="flex-1 py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98] cursor-pointer">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ── */}
      {showTxnModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => { if (!txnSubmitting) { setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote(''); setShowAddCatForm(false); setNewCatName(''); } }}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-[400px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={clsx('relative px-6 py-4 border-b border-border/60', txnType === 'CASH_IN' ? 'bg-emerald-500/5' : 'bg-rose-500/5')}>
              <div className="flex items-center gap-2.5">
                <div className={clsx('p-2 rounded-xl', txnType === 'CASH_IN' ? 'bg-emerald-500/15' : 'bg-rose-500/15')}>
                  {txnType === 'CASH_IN' ? <Plus className="w-4 h-4 text-emerald-500" /> : <Minus className="w-4 h-4 text-rose-500" />}
                </div>
                <h2 className="text-base font-extrabold text-foreground">{txnType === 'CASH_IN' ? 'Record Cash In' : 'Record Expense'}</h2>
              </div>
            </div>
            <div className="p-6 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
              <div className="flex rounded-xl bg-muted/40 border border-border/60 p-1 gap-1">
                <button onClick={() => setTxnType('CASH_IN')} className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer', txnType === 'CASH_IN' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <TrendingUp className="w-3.5 h-3.5" /> Cash In
                </button>
                <button onClick={() => setTxnType('CASH_OUT')} className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer', txnType === 'CASH_OUT' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <TrendingDown className="w-3.5 h-3.5" /> Expense
                </button>
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                  <input type="number" value={txnAmt || ''} onChange={e => setTxnAmt(e.target.value === '' ? 0 : Number(e.target.value))}
                    className={clsx('w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 rounded-2xl outline-none text-foreground tabular-nums shadow-sm transition-all', txnType === 'CASH_IN' ? 'border-emerald-500/25 focus:border-emerald-500' : 'border-rose-500/25 focus:border-rose-500')}
                    step="0.01" min="0" placeholder="Enter amount" autoFocus />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Category</label>
                {showAddCatForm ? (
                  <div className="flex items-center gap-2">
                    <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                      placeholder={`New ${txnType === 'CASH_IN' ? 'income' : 'expense'} category...`}
                      className="flex-1 bg-background border border-border/80 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary transition-all" autoFocus />
                    <button onClick={async () => { if (!newCatName.trim() || !tenantId) return; setAddingCat(true); const r = await window.electronAPI!.dbCashierAddCategory({ tenant_id: tenantId, name: newCatName.trim(), type: txnType }); if (r.success) { const cats = await window.electronAPI!.dbCashierGetCategories({ tenant_id: tenantId }); if (Array.isArray(cats)) setCustomCategories(cats); setTxnCat(newCatName.trim()); setShowAddCatForm(false); setNewCatName(''); } setAddingCat(false); }}
                      disabled={addingCat || !newCatName.trim()} className="px-3.5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-all active:scale-95 cursor-pointer disabled:opacity-50">{addingCat ? '...' : 'Add'}</button>
                    <button onClick={() => { setShowAddCatForm(false); setNewCatName(''); }} className="px-3 py-2.5 text-muted-foreground hover:text-foreground rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer">Cancel</button>
                  </div>
                ) : (
                  <Select value={txnCat} onChange={v => { if (v === '__ADD_NEW__') { setShowAddCatForm(true); setNewCatName(''); } else setTxnCat(v); }}
                    placeholder="Select category"
                    options={(() => {
                      const defaults = txnType === 'CASH_IN'
                        ? [{ value: 'Cash Deposit', label: 'Cash Deposit' }, { value: 'Petty Cash Return', label: 'Petty Cash Return' }, { value: 'Loan Repayment', label: 'Loan Repayment' }, { value: 'Customer Payment', label: 'Customer Payment' }, { value: 'Other Income', label: 'Other Income' }]
                        : [{ value: 'Petty Cash', label: 'Petty Cash' }, { value: 'Electricity', label: 'Electricity' }, { value: 'Rent', label: 'Rent' }, { value: 'Salary', label: 'Salary' }, { value: 'Transport', label: 'Transport' }, { value: 'Stationery', label: 'Stationery' }, { value: 'Maintenance', label: 'Maintenance' }, { value: 'Other', label: 'Other' }];
                      const defaultValues = new Set(defaults.map(d => d.value));
                      const custom = customCategories.filter(c => c.type === txnType && !defaultValues.has(c.name)).map(c => ({ value: c.name, label: c.name }));
                      return [...defaults, ...custom, { value: '__ADD_NEW__', label: '+ Add New Category' }];
                    })()} />
                )}
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Notes <span className="font-normal normal-case text-muted-foreground/50">(optional)</span></label>
                <input type="text" value={txnNote} onChange={e => setTxnNote(e.target.value)} placeholder="Add a note..." className="w-full bg-background border border-border/80 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Link to Party <span className="font-normal normal-case text-muted-foreground/50">(optional)</span></label>
                {txnPartyId ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-2xl shadow-sm">
                    <span className="text-sm font-bold text-foreground flex-1 truncate">{txnPartyName}</span>
                    <button onClick={() => { setTxnPartyId(''); setTxnPartyName(''); setPartySearch(''); }} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <User2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input type="text" value={partySearch} onChange={(e) => setPartySearch(e.target.value)} placeholder="Search party..." className="w-full pl-9 pr-3 py-2.5 text-sm bg-card border border-border rounded-2xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 shadow-sm transition-all" />
                    {partySearch && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl z-10 max-h-40 overflow-y-auto">
                        {parties.filter((p: any) => p.name.toLowerCase().includes(partySearch.toLowerCase())).slice(0, 20).map((p: any) => (
                          <button key={p.party_id} onClick={() => { setTxnPartyId(p.party_id); setTxnPartyName(p.name); setPartySearch(''); }} className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer border-b border-border last:border-0">{p.name}</button>
                        ))}
                        {parties.filter((p: any) => p.name.toLowerCase().includes(partySearch.toLowerCase())).length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground text-center">No parties found</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowTxnModal(false); setTxnAmt(0); setTxnCat(''); setTxnNote(''); setShowAddCatForm(false); setNewCatName(''); }} className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all active:scale-[0.98] cursor-pointer">Cancel</button>
                <button onClick={handleAddTransaction} disabled={txnSubmitting || txnAmt <= 0} className="flex-1 py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50">{txnSubmitting ? 'Saving...' : 'Submit'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Day Closing Modal ── */}
      {showDayClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => { if (!closeSubmitting) { setShowDayClose(false); setCloseResult(null); } }}>
          <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="relative px-6 py-4 border-b border-border/60" style={{ background: 'linear-gradient(135deg, hsl(0,72%,51%,0.08) 0%, transparent 100%)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-destructive/10"><AlertTriangle className="w-4 h-4 text-destructive" /></div>
                  <h2 className="text-base font-extrabold text-foreground">End of Day Closing</h2>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {closeResult ? (
                <>
                  <div className="flex flex-col items-center py-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2"><CheckCircle2 className="w-8 h-8 text-emerald-500" /></div>
                    <p className="text-lg font-black text-foreground">Day Closed</p>
                    <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">{formatBusinessDate(drawer?.business_date)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50"><p className="text-[10px] font-bold text-muted-foreground uppercase">Expected</p><p className="text-sm font-black text-foreground mt-0.5">{formatCurrency(closeResult.expected_closing)}</p></div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50"><p className="text-[10px] font-bold text-muted-foreground uppercase">Actual</p><p className="text-sm font-black text-foreground mt-0.5">{formatCurrency(closeResult.actual_cash)}</p></div>
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20"><p className="text-[10px] font-bold text-rose-600 uppercase">Short</p><p className="text-sm font-black text-rose-600 mt-0.5">{formatCurrency(closeResult.cash_short)}</p></div>
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"><p className="text-[10px] font-bold text-emerald-600 uppercase">Excess</p><p className="text-sm font-black text-emerald-600 mt-0.5">{formatCurrency(closeResult.cash_excess)}</p></div>
                  </div>
                  <button onClick={() => { setShowDayClose(false); setCloseResult(null); onClose(); }} className="w-full py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all cursor-pointer">Done</button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
                    <span className="text-xs font-bold text-muted-foreground">Expected Closing</span>
                    <span className="text-base font-black text-foreground tabular-nums">{formatCurrency(drawer.expected_closing)}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                    <input type="number" value={actualCash || ''} onChange={e => setActualCash(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-3.5 text-lg font-black bg-card border-2 border-destructive/25 rounded-2xl outline-none focus:border-destructive text-foreground tabular-nums shadow-sm transition-all"
                      step="0.01" min="0" placeholder="Enter actual cash in hand" autoFocus />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Remarks <span className="font-normal normal-case text-muted-foreground/50">(optional)</span></label>
                    <input type="text" value={closeRemarks} onChange={e => setCloseRemarks(e.target.value)} placeholder="Any closing notes..." className="w-full bg-background border border-border/80 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary transition-all" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => { setShowDayClose(false); }} className="flex-1 py-3 text-sm font-bold text-muted-foreground border border-border/80 rounded-xl hover:bg-muted transition-all active:scale-[0.98] cursor-pointer">Cancel</button>
                    <button onClick={handleDayClose} disabled={closeSubmitting} className="flex-1 py-3 text-sm font-black text-primary-foreground bg-destructive rounded-xl hover:bg-destructive/90 shadow-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50">{closeSubmitting ? 'Closing...' : 'Close Day'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
