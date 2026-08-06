import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import clsx from 'clsx';
import {
  Landmark, CreditCard, Smartphone, Plus, Pencil, Trash2, X, ArrowDownToLine,
  ArrowUpFromLine, Star, History, Wallet, CheckCircle2, AlertCircle, Search, Sparkles, PlusCircle
} from 'lucide-react';

type View = 'list' | 'form' | 'transactions';

interface PaymentSource {
  source_id: string;
  tenant_id: string;
  name: string;
  type: 'BANK' | 'CARD' | 'UPI';
  bank_name?: string | null;
  account_number?: string | null;
  holder_name?: string | null;
  upi_id?: string | null;
  opening_balance: number;
  current_balance: number;
  is_default: number;
  is_enabled: number;
  sort_order: number;
  transaction_count?: number;
  last_transaction_date?: string | null;
}

interface SourceTransaction {
  transaction_id: string;
  source_id: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  category?: string | null;
  notes?: string | null;
  reference_number?: string | null;
  transaction_date: string;
  running_balance: number;
  entered_by_name?: string | null;
}

const formatCurrency = (amount: number | undefined | null) =>
  amount == null || isNaN(amount) ? '-' : `\u20B9${Number(amount).toFixed(2)}`;

const formatDateTime = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const TYPE_LABELS: Record<string, string> = { BANK: 'Bank Account', CARD: 'Card', UPI: 'UPI' };

const defaultForm = {
  name: '',
  type: 'BANK' as 'BANK' | 'CARD' | 'UPI',
  bank_name: '',
  account_number: '',
  holder_name: '',
  upi_id: '',
  opening_balance: '',
  is_default: false,
  is_enabled: true,
  sort_order: 0,
};

export function PaymentMethods({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName } = useAuthStore();
  const isOwner = !isRestricted;

  const [view, setView] = useState<View>('list');
  const [sources, setSources] = useState<PaymentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BANK' | 'CARD' | 'UPI'>('ALL');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [editing, setEditing] = useState<PaymentSource | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSource, setSelectedSource] = useState<PaymentSource | null>(null);
  const [transactions, setTransactions] = useState<SourceTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [txForm, setTxForm] = useState({ type: 'CASH_IN' as 'CASH_IN' | 'CASH_OUT', amount: '', category: '', notes: '', reference_number: '' });
  const [isSavingTx, setIsSavingTx] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.dbPaymentGetSources) {
        const res = await window.electronAPI.dbPaymentGetSources(tenantId || '');
        if (Array.isArray(res)) setSources(res);
      }
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(defaultForm);
    setView('form');
  };

  const openEdit = (s: PaymentSource) => {
    setEditing(s);
    setForm({
      name: s.name,
      type: s.type,
      bank_name: s.bank_name || '',
      account_number: s.account_number || '',
      holder_name: s.holder_name || '',
      upi_id: s.upi_id || '',
      opening_balance: String(s.opening_balance ?? 0),
      is_default: s.is_default === 1,
      is_enabled: s.is_enabled === 1,
      sort_order: s.sort_order ?? 0,
    });
    setView('form');
  };

  const saveSource = async () => {
    if (!form.name.trim()) {
      showMessage('Name is required', 'error');
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        const res = await window.electronAPI!.dbPaymentUpdateSource({
          ...editing,
          name: form.name.trim(),
          bank_name: form.bank_name.trim(),
          account_number: form.account_number.trim(),
          holder_name: form.holder_name.trim(),
          upi_id: form.upi_id.trim(),
          opening_balance: parseFloat(form.opening_balance) || 0,
          is_default: form.is_default,
          is_enabled: form.is_enabled,
          sort_order: Number(form.sort_order) || 0,
          tenant_id: tenantId,
        });
        if (!res.success) {
          showMessage(res.error || 'Failed to update', 'error');
          return;
        }
        showMessage('Payment method updated');
      } else {
        const res = await window.electronAPI!.dbPaymentAddSource({
          name: form.name.trim(),
          type: form.type,
          bank_name: form.bank_name.trim(),
          account_number: form.account_number.trim(),
          holder_name: form.holder_name.trim(),
          upi_id: form.upi_id.trim(),
          opening_balance: parseFloat(form.opening_balance) || 0,
          is_default: form.is_default,
          is_enabled: form.is_enabled,
          sort_order: Number(form.sort_order) || 0,
          tenant_id: tenantId,
          created_by: userId,
          created_by_name: userName,
        });
        if (!res.success) {
          showMessage(res.error || 'Failed to add', 'error');
          return;
        }
        showMessage('Payment method added');
      }
      setView('list');
      await loadSources();
    } catch (e: any) {
      showMessage(e?.message || 'Operation failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSource = async (s: PaymentSource) => {
    if (!window.confirm(`Delete "${s.name}"? Transactions will be kept for history.`)) return;
    const res = await window.electronAPI!.dbPaymentDeleteSource({ source_id: s.source_id, tenant_id: tenantId || '' });
    if (res.success) {
      showMessage('Payment method deleted');
      await loadSources();
    } else {
      showMessage(res.error || 'Failed to delete', 'error');
    }
  };

  const openTransactions = async (s: PaymentSource) => {
    setSelectedSource(s);
    setView('transactions');
    setShowNotes(false);
    setTxForm({ type: 'CASH_IN', amount: '', category: '', notes: '', reference_number: '' });
    setLoadingTx(true);
    try {
      const res = await window.electronAPI!.dbPaymentGetTransactions({ source_id: s.source_id, tenant_id: tenantId || '' });
      setTransactions(Array.isArray(res) ? res : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  };

  const saveTransaction = async () => {
    if (!selectedSource) return;
    const amount = parseFloat(txForm.amount);
    if (!isFinite(amount) || amount <= 0) {
      showMessage('Enter a valid amount', 'error');
      return;
    }
    setIsSavingTx(true);
    try {
      const res = await window.electronAPI!.dbPaymentAddTransaction({
        tenant_id: tenantId,
        source_id: selectedSource.source_id,
        type: txForm.type,
        amount,
        category: txForm.category.trim() || null,
        notes: txForm.notes.trim() || null,
        reference_number: txForm.reference_number.trim() || null,
        entered_by: userId,
        entered_by_name: userName,
      });
      if (!res.success) {
        showMessage(res.error || 'Failed to record', 'error');
        return;
      }
      showMessage(txForm.type === 'CASH_IN' ? 'Money added to account' : 'Money moved out of account');
      setTxForm({ type: 'CASH_IN', amount: '', category: '', notes: '', reference_number: '' });
      await openTransactions(selectedSource);
    } catch (e: any) {
      showMessage(e?.message || 'Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  const filtered = sources.filter(s => {
    const matchesSearch = !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.bank_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.account_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.upi_id || '').toLowerCase().includes(search.toLowerCase());
    
    const matchesFilter = typeFilter === 'ALL' || s.type === typeFilter;
    return matchesSearch && matchesFilter;
  });

  const totalBalance = sources.reduce((sum, s) => sum + (Number(s.current_balance) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-in fade-in duration-300 overflow-hidden">
      {/* Dynamic glow overlays */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between px-8 py-5 border-b border-border/40 bg-background/50 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20">
            <Wallet className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-foreground">Payment Methods</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full uppercase tracking-wider select-none">Treasury</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure and audit your accounts, bank cards, and UPI portals.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <button
              onClick={openAdd}
              className="group inline-flex items-center gap-2 px-4.5 py-2.5 bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-95 hover:shadow-lg hover:shadow-primary/10 active:scale-95 transition-all duration-300 cursor-pointer"
            >
              <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
              <span>Link Account</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-border/40 flex items-center justify-center shadow-sm"
            title="Close"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Status toast */}
      {statusMessage && (
        <div className={clsx(
          'fixed top-5 left-1/2 -translate-x-1/2 z-[60] px-4.5 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2.5 animate-in slide-in-from-top-2 duration-300',
          statusMessage.type === 'success' ? 'bg-emerald-600 text-white shadow-emerald-950/20' : 'bg-red-600 text-white shadow-red-950/20'
        )}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {statusMessage.text}
        </div>
      )}

      {/* Scrollable View Area */}
      <div className="flex-1 overflow-y-auto p-8 relative z-10">
        {view === 'transactions' && selectedSource ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
            {/* Header info */}
            <div className="flex items-center justify-between pb-3 border-b border-border/40 select-none">
              <button
                onClick={() => setView('list')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:translate-x-[-2px] transition-all cursor-pointer"
              >
                ← Back to Channels
              </button>
              
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-extrabold text-sm text-foreground">{selectedSource.name}</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">
                    Current Balance: <span className="text-foreground font-extrabold text-xs">{formatCurrency(selectedSource.current_balance)}</span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <History className="w-4 h-4 text-primary animate-pulse" />
                </div>
              </div>
            </div>

            {/* Record Manual entry */}
            <div className="bg-card border border-border/40 rounded-3xl p-5 shadow-sm">
              <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5 select-none">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Quick Record Manual Entry</span>
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider select-none">Type</label>
                  <Select
                    value={txForm.type}
                    onChange={v => setTxForm({ ...txForm, type: v as any })}
                    options={[
                      { value: 'CASH_IN', label: 'Money In (+)' },
                      { value: 'CASH_OUT', label: 'Money Out (-)' },
                    ]}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider select-none">Amount *</label>
                  <Input type="number" step="0.01" min="0" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.00" />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider select-none">Category</label>
                  <Input value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} placeholder="e.g. Vendor Invoice" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider select-none">Reference No.</label>
                  <Input value={txForm.reference_number} onChange={e => setTxForm({ ...txForm, reference_number: e.target.value })} placeholder="UTR / Txn ID" />
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <button
                    onClick={saveTransaction}
                    disabled={isSavingTx}
                    className={clsx(
                      'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl hover:opacity-95 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer h-10',
                      txForm.type === 'CASH_IN' 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/10' 
                        : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/10'
                    )}
                  >
                    {txForm.type === 'CASH_IN' ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                    <span>{isSavingTx ? 'Recording...' : 'Record'}</span>
                  </button>
                </div>
              </div>
              
              {showNotes && (
                <div className="mt-3.5 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Notes / Memo</label>
                  <Input value={txForm.notes} onChange={e => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Add a custom note to describe this transaction..." />
                </div>
              )}
              
              <div className="flex items-center justify-between mt-4 pt-1">
                <button
                  onClick={() => setShowNotes(prev => !prev)}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  {showNotes ? 'Hide Notes' : 'Add Notes'}
                </button>
              </div>
            </div>

            {/* Ledger table */}
            {loadingTx ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-2xl" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground bg-muted/10 border border-dashed border-border/40 rounded-3xl">
                <History className="w-8 h-8 mx-auto mb-2.5 opacity-40 animate-pulse" />
                <p className="text-sm font-semibold">Ledger Empty</p>
                <p className="text-xs text-muted-foreground mt-1">This channel has no manual ledger entries recorded yet.</p>
              </div>
            ) : (
              <div className="bg-card border border-border/40 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-border/40 bg-muted/40">
                        <th className="px-5 py-3.5 font-extrabold">Transaction Date</th>
                        <th className="px-5 py-3.5 font-extrabold">Type</th>
                        <th className="px-5 py-3.5 font-extrabold">Category &amp; Memo</th>
                        <th className="px-5 py-3.5 font-extrabold">Ref. ID</th>
                        <th className="px-5 py-3.5 font-extrabold text-right">Amount</th>
                        <th className="px-5 py-3.5 font-extrabold text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(t => (
                        <tr key={t.transaction_id} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{formatDateTime(t.transaction_date)}</td>
                          <td className="px-5 py-3.5">
                            <span className={clsx(
                              'inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider rounded-full px-2 py-0.5 border',
                              t.type === 'CASH_IN' 
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                            )}>
                              {t.type === 'CASH_IN' ? <ArrowDownToLine className="w-2.5 h-2.5" /> : <ArrowUpFromLine className="w-2.5 h-2.5" />}
                              {t.type === 'CASH_IN' ? 'In' : 'Out'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-foreground">{t.category || 'Manual Entry'}</span>
                            {t.notes && <span className="text-muted-foreground block text-[10px] mt-0.5 font-medium">{t.notes}</span>}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[10px] text-muted-foreground">{t.reference_number || '—'}</td>
                          <td className={clsx('px-5 py-3.5 text-right font-extrabold whitespace-nowrap text-sm', t.type === 'CASH_IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {t.type === 'CASH_IN' ? '+' : '-'}{formatCurrency(t.amount)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-bold text-slate-200 dark:text-slate-100 whitespace-nowrap">{formatCurrency(t.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Summary strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Total Balance Card */}
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-lg group">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-wider">
                    <Wallet className="w-4 h-4 text-primary" /> Total Balance
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">Live</span>
                </div>
                <div className="mt-3.5 flex items-baseline gap-1">
                  <span className="text-3xl font-black tracking-tight text-white">{formatCurrency(totalBalance)}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Combined liquid assets across all systems</p>
              </div>

              {/* Accounts Card */}
              <div className="relative overflow-hidden bg-card border border-border/50 rounded-2xl p-5 shadow-sm group">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/15 transition-all duration-500" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold uppercase tracking-wider">
                    <Landmark className="w-4 h-4 text-indigo-500" /> Accounts
                  </div>
                  <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">Linked</span>
                </div>
                <div className="mt-3.5 text-3xl font-black text-foreground tracking-tight">{sources.length}</div>
                <p className="text-[10px] text-muted-foreground mt-2">Active cash flow channels configured</p>
              </div>

              {/* Default Card */}
              <div className="relative overflow-hidden bg-card border border-border/50 rounded-2xl p-5 shadow-sm group">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/15 transition-all duration-500" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold uppercase tracking-wider">
                    <Star className="w-4 h-4 text-amber-500 animate-spin-slow" /> Primary Source
                  </div>
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">Default</span>
                </div>
                <div className="mt-3.5 text-lg font-bold text-foreground truncate select-none leading-9">
                  {sources.find(s => s.is_default === 1)?.name || <span className="text-muted-foreground font-normal">None Set</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Automatically handles POS collections</p>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20 p-2 rounded-2xl border border-border/40">
              {/* Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto shrink-0 select-none">
                {(['ALL', 'BANK', 'CARD', 'UPI'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTypeFilter(tab)}
                    className={clsx(
                      'px-4 py-2 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap',
                      typeFilter === tab
                        ? 'bg-background text-foreground shadow-sm border border-border/40 font-extrabold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                    )}
                  >
                    {tab === 'ALL' ? 'All Channels' : tab === 'BANK' ? 'Bank Accounts' : tab === 'CARD' ? 'Cards' : 'UPI Portals'}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, account, upi..."
                  className="w-full bg-background border border-border/50 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                />
              </div>
            </div>

            {/* List */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[260px] rounded-3xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 bg-muted/10 border border-dashed border-border/60 rounded-3xl p-8 max-w-xl mx-auto flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse" />
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg relative z-10">
                    <Wallet className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h3 className="text-base font-extrabold text-foreground tracking-tight">No Payment Channels Configured</h3>
                <p className="text-xs text-muted-foreground mt-2 max-w-xs leading-relaxed">
                  Start linking your business bank accounts, cards, or UPI terminals to record transactions and view analytics.
                </p>
                {isOwner && (
                  <button
                    onClick={openAdd}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-xs font-extrabold rounded-xl hover:opacity-95 hover:shadow-md hover:shadow-primary/10 active:scale-95 transition-all duration-300 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> Link First Channel
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filtered.map(s => {
                  return (
                    <div
                      key={s.source_id}
                      className={clsx(
                        'flex flex-col bg-card border rounded-3xl p-3.5 shadow-sm hover:shadow-md transition-all duration-300 group',
                        s.is_enabled === 1 ? 'border-border/50' : 'border-border/30 opacity-70',
                        s.is_default === 1 && 'ring-1 ring-primary/20'
                      )}
                    >
                      {/* CARD design */}
                      {s.type === 'CARD' && (
                        <div className="relative overflow-hidden h-[160px] bg-gradient-to-br from-indigo-950/90 to-slate-900/90 text-white rounded-2xl p-5 border border-slate-800/80 shadow-md flex flex-col justify-between group-hover:-translate-y-0.5 group-hover:shadow-lg transition-all duration-300">
                          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/20 to-transparent rounded-full blur-xl group-hover:from-indigo-500/30" />
                          <div className="flex items-start justify-between z-10">
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] uppercase font-bold tracking-widest text-indigo-300">POS Payment Terminal</span>
                              <div className="w-8 h-6 bg-gradient-to-r from-amber-400 to-amber-200 rounded border border-amber-300/40 relative overflow-hidden flex items-center justify-center">
                                <div className="absolute inset-y-0 left-1/3 right-1/3 border-x border-amber-700/20" />
                                <div className="absolute inset-x-0 top-1/3 bottom-1/3 border-y border-amber-700/20" />
                              </div>
                            </div>
                            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                              <CreditCard className="w-3.5 h-3.5 text-white" />
                              <span className="text-[10px] font-black tracking-wider uppercase text-indigo-100">{s.bank_name || 'Card'}</span>
                            </div>
                          </div>
                          <div className="text-lg font-mono tracking-widest text-center select-all my-2 text-indigo-100 z-10">
                            ••••  ••••  ••••  {s.account_number || '••••'}
                          </div>
                          <div className="flex items-end justify-between z-10">
                            <div className="min-w-0">
                              <div className="text-[8px] uppercase tracking-wider text-indigo-300 font-medium">Card Holder</div>
                              <div className="text-xs font-bold truncate tracking-wide text-white">{s.holder_name || 'Merchant Source'}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[8px] uppercase tracking-wider text-indigo-300 font-medium">Balance</div>
                              <div className="text-sm font-black text-white">{formatCurrency(s.current_balance)}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* BANK design */}
                      {s.type === 'BANK' && (
                        <div className="relative overflow-hidden h-[160px] bg-gradient-to-br from-emerald-950/90 to-slate-900/90 text-white rounded-2xl p-5 border border-slate-800/80 shadow-md flex flex-col justify-between group-hover:-translate-y-0.5 group-hover:shadow-lg transition-all duration-300">
                          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/20 to-transparent rounded-full blur-xl group-hover:from-emerald-500/30" />
                          <div className="flex items-start justify-between z-10">
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] uppercase font-bold tracking-widest text-emerald-300">Checking Account</span>
                              <div className="flex items-center gap-1.5">
                                <Landmark className="w-4 h-4 text-emerald-400 animate-pulse" />
                                <span className="text-xs font-extrabold text-emerald-100 truncate max-w-[120px]">{s.bank_name || 'Bank Account'}</span>
                              </div>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-0.5">
                              BANK
                            </span>
                          </div>
                          <div className="my-2 z-10">
                            <div className="text-[8px] uppercase tracking-wider text-emerald-300/80">Account Number</div>
                            <div className="text-base font-mono font-bold text-emerald-100 tracking-wider">
                              {s.account_number ? `•••• •••• ${s.account_number.slice(-4)}` : '•••• •••• ••••'}
                            </div>
                          </div>
                          <div className="flex items-end justify-between z-10">
                            <div className="min-w-0">
                              <div className="text-[8px] uppercase tracking-wider text-emerald-300 font-medium">Account Holder</div>
                              <div className="text-xs font-bold truncate tracking-wide text-white">{s.holder_name || 'Business Partner'}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[8px] uppercase tracking-wider text-emerald-300 font-medium">Balance</div>
                              <div className="text-sm font-black text-white">{formatCurrency(s.current_balance)}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* UPI design */}
                      {s.type === 'UPI' && (
                        <div className="relative overflow-hidden h-[160px] bg-gradient-to-br from-violet-950/90 to-slate-900/90 text-white rounded-2xl p-5 border border-slate-800/80 shadow-md flex flex-col justify-between group-hover:-translate-y-0.5 group-hover:shadow-lg transition-all duration-300">
                          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-bl from-violet-500/20 to-transparent rounded-full blur-xl group-hover:from-violet-500/30" />
                          <div className="flex items-start justify-between z-10">
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] uppercase font-bold tracking-widest text-violet-300">Instant UPI Portal</span>
                              <div className="flex items-center gap-1.5">
                                <Smartphone className="w-4 h-4 text-violet-400" />
                                <span className="text-xs font-extrabold text-violet-100 truncate max-w-[120px]">{s.name || 'UPI Gateway'}</span>
                              </div>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2.5 py-0.5">
                              UPI
                            </span>
                          </div>
                          <div className="my-2 z-10 min-w-0">
                            <div className="text-[8px] uppercase tracking-wider text-violet-300/80">Virtual Payment Address</div>
                            <div className="text-sm font-mono font-bold text-violet-100 truncate tracking-wide">
                              {s.upi_id || '—'}
                            </div>
                          </div>
                          <div className="flex items-end justify-between z-10">
                            <div className="min-w-0">
                              <div className="text-[8px] uppercase tracking-wider text-violet-300 font-medium">Gateway Name</div>
                              <div className="text-xs font-bold truncate tracking-wide text-white">{s.name || 'UPI Source'}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[8px] uppercase tracking-wider text-violet-300 font-medium">Balance</div>
                              <div className="text-sm font-black text-white">{formatCurrency(s.current_balance)}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Card Status Deck */}
                      <div className="flex items-center justify-between mt-3 px-1">
                        <div className="flex items-center gap-1.5">
                          {s.is_default === 1 ? (
                            <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Default
                            </span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider px-1">Secondary</span>
                          )}
                          {s.is_enabled !== 1 && (
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground bg-muted border border-border/60 rounded-full px-2 py-0.5">
                              Disabled
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] font-bold text-muted-foreground bg-muted/40 px-2.5 py-0.5 rounded-lg border border-border/20">
                          {s.transaction_count ?? 0} txn{s.transaction_count === 1 ? '' : 's'}
                        </div>
                      </div>

                      {/* Interactive Controls */}
                      <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/40 select-none">
                        <button
                          onClick={() => openTransactions(s)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl transition-all duration-200 cursor-pointer active:scale-95"
                        >
                          <History className="w-3.5 h-3.5" /> <span>Ledger</span>
                        </button>
                        {isOwner && (
                          <>
                            <button
                              onClick={() => openEdit(s)}
                              className="inline-flex items-center justify-center p-2 text-xs font-bold bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 border border-border/20"
                              title="Edit Details"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteSource(s)}
                              className="inline-flex items-center justify-center p-2 text-xs font-bold bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 border border-red-500/10"
                              title="Delete Method"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Form for Link/Edit payment channel */}
      <Modal
        isOpen={view === 'form'}
        onClose={() => setView('list')}
        title={
          <div className="flex items-center gap-2 select-none">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              {editing ? <Pencil className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-primary" />}
            </div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-foreground">
              {editing ? 'Edit Payment Method' : 'Link New Payment Channel'}
            </span>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Method Name & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Method Display Name *</label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. HDFC Current Account"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Channel Type *</label>
              <Select
                value={form.type}
                onChange={v => setForm({ ...form, type: v as any })}
                options={[
                  { value: 'BANK', label: 'Bank Account (checking/savings)' },
                  { value: 'CARD', label: 'Card (Visa / Mastercard / RuPay)' },
                  { value: 'UPI', label: 'UPI Portal' },
                ]}
              />
            </div>
          </div>

          {/* Conditional Fields */}
          {form.type === 'BANK' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/10 p-4.5 rounded-2xl border border-border/30 animate-in fade-in duration-200">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Bank Name</label>
                <Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. HDFC Bank" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Account Number</label>
                <Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="Enter account number" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Account Holder Name</label>
                <Input value={form.holder_name} onChange={e => setForm({ ...form, holder_name: e.target.value })} placeholder="Name printed on bank account" />
              </div>
            </div>
          )}

          {form.type === 'CARD' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/10 p-4.5 rounded-2xl border border-border/30 animate-in fade-in duration-200">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Card Network / Issuer</label>
                <Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Visa / Mastercard / RuPay" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Last 4 Digits</label>
                <Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="e.g. 1234" maxLength={4} />
              </div>
            </div>
          )}

          {form.type === 'UPI' && (
            <div className="bg-muted/10 p-4.5 rounded-2xl border border-border/30 animate-in fade-in duration-200">
              <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">UPI ID / VPA</label>
              <Input value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })} placeholder="e.g. shop@okhdfcbank" />
            </div>
          )}

          {/* Balance & Sorting */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">
                {editing && (editing.transaction_count ?? 0) > 0 ? 'Opening Balance (locked)' : 'Opening Balance'}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.opening_balance}
                onChange={e => setForm({ ...form, opening_balance: e.target.value })}
                disabled={!!editing && ((editing as any).transaction_count ?? 0) > 0}
                placeholder="0.00"
              />
              {!!editing && ((editing as any).transaction_count ?? 0) > 0 && (
                <p className="text-[9px] text-muted-foreground mt-1">Locked — this channel already has transactions in its ledger.</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground mb-1.5 block uppercase tracking-wider">Sort Order Priority</label>
              <Input
                type="number"
                value={String(form.sort_order)}
                onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Settings Toggle Checkboxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 select-none">
            <label className="flex items-center gap-3 p-3 bg-muted/20 border border-border/35 rounded-xl cursor-pointer hover:bg-muted/40 transition-colors select-none">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={e => setForm({ ...form, is_default: e.target.checked })}
                className="w-4 h-4 accent-primary rounded"
              />
              <div>
                <div className="text-xs font-bold text-foreground">Set as default account</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Primary gateway for POS checkouts</div>
              </div>
            </label>
            
            <label className="flex items-center gap-3 p-3 bg-muted/20 border border-border/35 rounded-xl cursor-pointer hover:bg-muted/40 transition-colors select-none">
              <input
                type="checkbox"
                checked={form.is_enabled}
                onChange={e => setForm({ ...form, is_enabled: e.target.checked })}
                className="w-4 h-4 accent-primary rounded"
              />
              <div>
                <div className="text-xs font-bold text-foreground">Status active / enabled</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Allows payment reception on POS</div>
              </div>
            </label>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/35">
            <button
              onClick={() => setView('list')}
              className="px-4.5 py-2 text-xs font-bold bg-muted text-muted-foreground rounded-xl hover:bg-muted/80 active:scale-95 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={saveSource}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-xs font-extrabold rounded-xl hover:opacity-95 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Saving...' : editing ? 'Save Changes' : 'Link Channel'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
