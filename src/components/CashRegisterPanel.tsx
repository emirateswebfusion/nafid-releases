import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  X, Plus, Minus, TrendingUp, TrendingDown, Clock, Receipt, Banknote,
  CheckCircle2, AlertTriangle, AlertCircle, Search, Save
} from 'lucide-react';
import clsx from 'clsx';
import { Select } from '../components/ui/Select';

const formatCurrency = (v: any) => {
  const n = Number(v) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatTime = (d: string) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export function CashRegisterPanel({ onClose }: { onClose: () => void }) {
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

  const totalIn = transactions.filter(t => t.type === 'CASH_IN').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = transactions.filter(t => t.type === 'CASH_OUT').reduce((s, t) => s + Number(t.amount), 0);

  const load = useCallback(async () => {
    if (!window.electronAPI || !tenantId) return;
    setLoading(true);
    const [d, txs] = await Promise.all([
      window.electronAPI.dbCashierGetDrawer({ tenant_id: tenantId }),
      window.electronAPI.dbCashierGetTransactions({ tenant_id: tenantId }),
    ]);
    if (d && !d.error && d.status === 'CLOSED') { setDrawer(null); }
    else if (d && !d.error) { setDrawer(d); }
    if (Array.isArray(txs)) setTransactions(txs);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!drawer || !drawer.opening_balance) {
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
    setTxnSubmitting(false);
    if (r.success) { setTxnAmt(0); setTxnCat(''); setTxnNote(''); setShowAddCatForm(false); setNewCatName(''); setShowTxnModal(false); await load(); }
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
    if (r.success) { setCloseResult(r); await load(); }
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

  return (
    <>
      {/* ── REGISTER PANEL ── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
        <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-[480px] h-[560px] max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <Receipt className="w-4 h-4 text-blue-500" />
              </div>
              <h2 className="text-sm font-extrabold text-foreground">Cash Register</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95 cursor-pointer">
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>

          {!drawer || !drawer.opening_balance ? (
            /* Opening balance prompt */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
                <Banknote className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">No open cash drawer</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Set opening balance to start the register</p>
              </div>
              <button
                onClick={() => { setShowOpeningBal(true); setOpeningBalInput(0); setOpeningBalError(''); }}
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
              >
                Set Opening Balance
              </button>
            </div>
          ) : (
            <>
              {/* Mini stat cards */}
              <div className="grid grid-cols-2 gap-3 px-5 py-3 border-b border-border/50 bg-muted/5 shrink-0">
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

              {/* Register controls */}
              <div className="flex items-center justify-between px-5 py-2 border-b border-border/50 shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Transactions</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setTxnAmt(0); setTxnCat(''); setTxnNote(''); setShowAddCatForm(false); setNewCatName('');
                      setShowTxnModal(true);
                      const cats = await window.electronAPI!.dbCashierGetCategories({ tenant_id: tenantId! });
                      if (Array.isArray(cats)) setCustomCategories(cats);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-primary hover:bg-primary/10 border border-primary/20 transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Entry
                  </button>
                  <button
                    onClick={() => { setShowDayClose(true); setActualCash(drawer.current_cash ?? 0); setCloseRemarks(''); setCloseResult(null); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-all active:scale-95 cursor-pointer"
                  >
                    <Save className="w-3 h-3" /> Day Close
                  </button>
                </div>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/20 shrink-0">
                <span>Time</span><span>Type</span><span>Category</span><span className="text-right">Amount</span><span className="text-right">By</span>
              </div>

              {/* Transaction feed */}
              <div className="flex-1 overflow-y-auto pb-6">
                {transactions.length === 0 && (!drawer || drawer.opening_balance == null) ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                    <Banknote className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm font-bold">No entries</p>
                    <p className="text-xs text-muted-foreground/60">Use Add Entry to record cash-in or expenses</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {drawer && drawer.opening_balance != null && drawer.opening_balance >= 0 && (
                      <div className="grid grid-cols-[0.55fr_0.5fr_1fr_0.75fr_auto] gap-2 px-5 py-2.5 bg-card hover:bg-muted/20 transition-colors items-center border-l-2 border-l-primary/50">
                        <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 shrink-0" /> {drawer.opened_at ? formatTime(drawer.opened_at) : '—'}
                        </span>
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
              {/* Type toggle */}
              <div className="flex rounded-xl bg-muted/40 border border-border/60 p-1 gap-1">
                <button onClick={() => setTxnType('CASH_IN')} className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer', txnType === 'CASH_IN' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <TrendingUp className="w-3.5 h-3.5" /> Cash In
                </button>
                <button onClick={() => setTxnType('CASH_OUT')} className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer', txnType === 'CASH_OUT' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <TrendingDown className="w-3.5 h-3.5" /> Expense
                </button>
              </div>
              {/* Amount */}
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                  <input type="number" value={txnAmt || ''} onChange={e => setTxnAmt(e.target.value === '' ? 0 : Number(e.target.value))}
                    className={clsx('w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 rounded-2xl outline-none text-foreground tabular-nums shadow-sm transition-all', txnType === 'CASH_IN' ? 'border-emerald-500/25 focus:border-emerald-500' : 'border-rose-500/25 focus:border-rose-500')}
                    step="0.01" min="0" placeholder="Enter amount" autoFocus />
                </div>
              </div>
              {/* Category */}
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
              {/* Notes */}
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">Notes <span className="font-normal normal-case text-muted-foreground/50">(optional)</span></label>
                <input type="text" value={txnNote} onChange={e => setTxnNote(e.target.value)} placeholder="Add a note..." className="w-full bg-background border border-border/80 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:border-primary transition-all" />
              </div>
              {/* Actions */}
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
                    <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">{drawer?.business_date}</p>
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
    </>
  );
}
