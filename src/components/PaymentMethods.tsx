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
  ArrowUpFromLine, Star, StarOff, History, Wallet, CheckCircle2, AlertCircle,
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

const TYPE_ICONS: Record<string, any> = {
  BANK: Landmark,
  CARD: CreditCard,
  UPI: Smartphone,
};

const TYPE_COLORS: Record<string, string> = {
  BANK: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
  CARD: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
  UPI: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
};

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

  const filtered = sources.filter(s =>
    !search.trim() ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.bank_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.account_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.upi_id || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalBalance = sources.reduce((sum, s) => sum + (Number(s.current_balance) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-muted/30 dark:bg-muted/5">
        <div>
          <h1 className="text-lg font-black text-foreground">Payment Methods</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage bank accounts, cards &amp; UPI ids used to receive payments
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all duration-200 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Payment Method
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-border/60 flex items-center justify-center shadow-sm"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status toast */}
      {statusMessage && (
        <div className={clsx(
          'fixed top-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-top-2 duration-200',
          statusMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        )}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {statusMessage.text}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {view === 'list' && (
          <div className="max-w-5xl mx-auto space-y-5">
            {/* Summary strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  <Wallet className="w-4 h-4" /> Total Balance
                </div>
                <div className="mt-1.5 text-2xl font-black text-foreground">{formatCurrency(totalBalance)}</div>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  <Landmark className="w-4 h-4" /> Accounts
                </div>
                <div className="mt-1.5 text-2xl font-black text-foreground">{sources.length}</div>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  <Star className="w-4 h-4" /> Default
                </div>
                <div className="mt-1.5 text-2xl font-black text-foreground">
                  {sources.filter(s => s.is_default === 1).map(s => s.name).join(', ') || '—'}
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, account, UPI id..."
                className="w-full max-w-sm bg-card border border-border/70 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* List */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Wallet className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No payment methods found</p>
                {isOwner && (
                  <button onClick={openAdd} className="mt-3 text-sm font-semibold text-primary hover:underline cursor-pointer">
                    Add your first payment method
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(s => {
                  const Icon = TYPE_ICONS[s.type] || Landmark;
                  return (
                    <div key={s.source_id} className={clsx(
                      'bg-card border rounded-2xl p-4 shadow-sm transition-all duration-200',
                      s.is_enabled === 1 ? 'border-border/60' : 'border-border/40 opacity-70',
                      s.is_default === 1 && 'ring-1 ring-primary/30'
                    )}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={clsx('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0', TYPE_COLORS[s.type])}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground truncate">{s.name}</span>
                              {s.is_default === 1 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                                  <Star className="w-3 h-3" /> Default
                                </span>
                              )}
                              {s.is_enabled !== 1 && (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border/60 rounded-full px-2 py-0.5">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {TYPE_LABELS[s.type]}
                              {s.bank_name && ` · ${s.bank_name}`}
                              {s.account_number && ` · ${s.account_number}`}
                              {s.upi_id && ` · ${s.upi_id}`}
                              {s.holder_name && ` · ${s.holder_name}`}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-black text-foreground">{formatCurrency(s.current_balance)}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {s.transaction_count ?? 0} txn{s.transaction_count === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border/40">
                        <button
                          onClick={() => openTransactions(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-muted text-muted-foreground rounded-lg hover:bg-muted/70 active:scale-95 transition-all cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5" /> Transactions
                        </button>
                        {isOwner && (
                          <>
                            <button
                              onClick={() => openEdit(s)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-muted text-muted-foreground rounded-lg hover:bg-muted/70 active:scale-95 transition-all cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => deleteSource(s)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
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

        {view === 'form' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-black text-foreground mb-5">
                {editing ? 'Edit Payment Method' : 'Add Payment Method'}
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Method Name *</label>
                    <Input
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. HDFC Current Account"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Type *</label>
                    <Select
                      value={form.type}
                      onChange={v => setForm({ ...form, type: v as any })}
                      options={[
                        { value: 'BANK', label: 'Bank Account' },
                        { value: 'CARD', label: 'Card (Visa / Master / RuPay)' },
                        { value: 'UPI', label: 'UPI' },
                      ]}
                    />
                  </div>
                </div>

                {form.type === 'BANK' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Bank Name</label>
                      <Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. HDFC Bank" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Account Number</label>
                      <Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="Account number" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Account Holder Name</label>
                      <Input value={form.holder_name} onChange={e => setForm({ ...form, holder_name: e.target.value })} placeholder="Name on the account" />
                    </div>
                  </div>
                )}

                {form.type === 'CARD' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Card Network</label>
                      <Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Visa / Mastercard / RuPay" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Last 4 Digits</label>
                      <Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="e.g. 1234" />
                    </div>
                  </div>
                )}

                {form.type === 'UPI' && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">UPI ID</label>
                    <Input value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })} placeholder="e.g. shop@okhdfcbank" />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
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
                      <p className="text-[10px] text-muted-foreground mt-1">Locked — this source already has transactions.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Sort Order</label>
                    <Input
                      type="number"
                      value={String(form.sort_order)}
                      onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 p-3 bg-muted/40 border border-border/60 rounded-xl cursor-pointer hover:bg-muted/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      onChange={e => setForm({ ...form, is_default: e.target.checked })}
                      className="w-4 h-4 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-semibold text-foreground">Set as default</div>
                      <div className="text-xs text-muted-foreground">Default method for {form.type === 'BANK' ? 'bank transfers' : form.type === 'CARD' ? 'card payments' : 'UPI payments'}</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-muted/40 border border-border/60 rounded-xl cursor-pointer hover:bg-muted/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={form.is_enabled}
                      onChange={e => setForm({ ...form, is_enabled: e.target.checked })}
                      className="w-4 h-4 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-semibold text-foreground">Enabled</div>
                      <div className="text-xs text-muted-foreground">Available for receiving payments</div>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setView('list')}
                    className="px-4 py-2 text-sm font-semibold bg-muted text-muted-foreground rounded-xl hover:bg-muted/70 active:scale-95 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSource}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? 'Saving...' : editing ? 'Save Changes' : 'Add Method'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'transactions' && selectedSource && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setView('list')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                ← Back
              </button>
              <div className="text-right">
                <div className="font-black text-lg text-foreground">{selectedSource.name}</div>
                <div className="text-xs text-muted-foreground">
                  Balance: <span className="font-bold text-foreground">{formatCurrency(selectedSource.current_balance)}</span>
                </div>
              </div>
            </div>

            {/* Add transaction */}
            <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-black text-foreground mb-4">
                {selectedSource.type === 'UPI' ? 'Receive UPI Payment' : selectedSource.type === 'CARD' ? 'Receive Card Payment' : 'Bank Money In / Out'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Type</label>
                  <Select
                    value={txForm.type}
                    onChange={v => setTxForm({ ...txForm, type: v as any })}
                    options={[
                      { value: 'CASH_IN', label: 'Money In (Received)' },
                      { value: 'CASH_OUT', label: 'Money Out (Paid)' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Amount *</label>
                  <Input type="number" step="0.01" min="0" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Category</label>
                  <Input value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} placeholder="e.g. Invoice Payment" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Reference No.</label>
                  <Input value={txForm.reference_number} onChange={e => setTxForm({ ...txForm, reference_number: e.target.value })} placeholder="UTR / Txn id" />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={saveTransaction}
                    disabled={isSavingTx}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {txForm.type === 'CASH_IN' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                    {isSavingTx ? 'Saving...' : 'Record'}
                  </button>
                </div>
              </div>
              {showNotes && (
                <div className="mt-3">
                  <Input value={txForm.notes} onChange={e => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Notes (optional)" />
                </div>
              )}
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={() => setShowNotes(prev => !prev)}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showNotes ? 'Hide' : 'Add'} notes
                </button>
              </div>
            </div>

            {/* Transactions list */}
            {loadingTx ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No transactions yet</p>
              </div>
            ) : (
              <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/30">
                        <th className="px-4 py-3 font-bold">Date</th>
                        <th className="px-4 py-3 font-bold">Type</th>
                        <th className="px-4 py-3 font-bold">Category</th>
                        <th className="px-4 py-3 font-bold">Reference</th>
                        <th className="px-4 py-3 font-bold text-right">Amount</th>
                        <th className="px-4 py-3 font-bold text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(t => (
                        <tr key={t.transaction_id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateTime(t.transaction_date)}</td>
                          <td className="px-4 py-3">
                            <span className={clsx(
                              'inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border',
                              t.type === 'CASH_IN' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                            )}>
                              {t.type === 'CASH_IN' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                              {t.type === 'CASH_IN' ? 'In' : 'Out'}
                            </span>
                          </td>
                          <td className="px-4 py-3">{t.category || '—'}{t.notes ? <span className="text-muted-foreground block text-xs">{t.notes}</span> : null}</td>
                          <td className="px-4 py-3 text-muted-foreground">{t.reference_number || '—'}</td>
                          <td className={clsx('px-4 py-3 text-right font-bold whitespace-nowrap', t.type === 'CASH_IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {t.type === 'CASH_IN' ? '+' : '-'}{formatCurrency(t.amount)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(t.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
