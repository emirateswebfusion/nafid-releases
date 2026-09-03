import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import clsx from 'clsx';
import { parseUTCDate, getAppTimeFormat } from '../utils/receiptGenerator';
import { getUpiPageConfig, saveUpiPageConfig, type UpiPageConfig, DEFAULT_UPI_PAGE_CONFIG } from '../utils/upiConfig';
import {
  Landmark, CreditCard, Smartphone, Plus, Pencil, Trash2, X, ArrowDownToLine,
  ArrowUpFromLine, Star, History, Wallet, CheckCircle2, AlertCircle, Search,
  Copy, Check, Sparkles, Lock, ShieldCheck, ArrowUpRight, Layers, ShoppingCart,
  FileText, Settings2, ToggleLeft, ToggleRight
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
  amount == null || isNaN(amount) ? '₹0.00' : `\u20B9${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateTime = (d: string) => {
  if (!d) return '—';
  try {
    return parseUTCDate(d).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: getAppTimeFormat() !== '24h'
    });
  } catch {
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; gradient: string; badgeBg: string; textColor: string; borderColor: string }> = {
  BANK: {
    label: 'Bank Account',
    icon: Landmark,
    gradient: 'from-sky-600 via-blue-700 to-indigo-900',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    textColor: 'text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-500/30',
  },
  CARD: {
    label: 'Card Portal',
    icon: CreditCard,
    gradient: 'from-violet-600 via-purple-700 to-slate-900',
    badgeBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-500/30',
  },
  UPI: {
    label: 'UPI Gateway',
    icon: Smartphone,
    gradient: 'from-emerald-600 via-teal-700 to-slate-900',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500/30',
  },
};

const QUICK_CATEGORIES = [
  'Invoice Payment',
  'Vendor Payout',
  'Customer Transfer',
  'Cash Settlement',
  'Refund',
  'Adjustment',
];

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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [editing, setEditing] = useState<PaymentSource | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSource, setSelectedSource] = useState<PaymentSource | null>(null);
  const [transactions, setTransactions] = useState<SourceTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [txForm, setTxForm] = useState({ type: 'CASH_IN' as 'CASH_IN' | 'CASH_OUT', amount: '', category: '', notes: '', reference_number: '' });
  const [isSavingTx, setIsSavingTx] = useState(false);

  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.dbPaymentGetSources) {
        const res = await window.electronAPI.dbPaymentGetSources(tenantId || '');
        if (Array.isArray(res)) setSources(res);
      }
      const config = await getUpiPageConfig(tenantId || '');
      setUpiPageConfig(config);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleToggleUpiPage = async (pageKey: keyof UpiPageConfig) => {
    const updated = { ...upiPageConfig, [pageKey]: !upiPageConfig[pageKey] };
    setUpiPageConfig(updated);
    const names: Record<keyof UpiPageConfig, string> = {
      billing: 'Billing Page',
      settlement: 'Cash Settlement Page',
      sales_history: 'Sales History',
      scrap: 'Scrap Manager',
      mobile_billing: 'Mobile App Billing',
    };
    const ok = await saveUpiPageConfig(tenantId || '', updated);
    if (ok) {
      showMessage(`UPI account selection on ${names[pageKey]} ${updated[pageKey] ? 'Enabled' : 'Disabled'}`);
    } else {
      showMessage('Failed to save configuration', 'error');
    }
  };

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const copyToClipboard = (text: string, idKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(idKey);
    setTimeout(() => setCopiedId(null), 2000);
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
      showMessage('Method name is required', 'error');
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
          showMessage(res.error || 'Failed to update payment method', 'error');
          return;
        }
        showMessage('Payment method updated successfully');
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
          showMessage(res.error || 'Failed to add payment method', 'error');
          return;
        }
        showMessage('Payment method added successfully');
      }
      setView('list');
      await loadSources();
    } catch (e: any) {
      showMessage(e?.message || 'Operation failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSourceDefault = async (s: PaymentSource, e: React.MouseEvent) => {
    e.stopPropagation();
    if (s.is_default === 1) return;
    try {
      const res = await window.electronAPI!.dbPaymentUpdateSource({
        ...s,
        is_default: true,
        tenant_id: tenantId,
      });
      if (res.success) {
        showMessage(`"${s.name}" set as default payment method`);
        await loadSources();
      } else {
        showMessage(res.error || 'Failed to update default state', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message || 'Failed to set default', 'error');
    }
  };

  const toggleSourceEnabled = async (s: PaymentSource, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = s.is_enabled !== 1;
    try {
      const res = await window.electronAPI!.dbPaymentUpdateSource({
        ...s,
        is_enabled: nextState,
        tenant_id: tenantId,
      });
      if (res.success) {
        showMessage(`"${s.name}" ${nextState ? 'enabled' : 'disabled'}`);
        await loadSources();
      } else {
        showMessage(res.error || 'Failed to toggle state', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message || 'Failed to update state', 'error');
    }
  };

  const deleteSource = async (s: PaymentSource) => {
    if (!window.confirm(`Delete payment method "${s.name}"?\nExisting transaction history will be preserved.`)) return;
    const res = await window.electronAPI!.dbPaymentDeleteSource({ source_id: s.source_id, tenant_id: tenantId || '' });
    if (res.success) {
      showMessage('Payment method deleted');
      await loadSources();
    } else {
      showMessage(res.error || 'Failed to delete payment method', 'error');
    }
  };

  const openTransactions = async (s: PaymentSource) => {
    setSelectedSource(s);
    setView('transactions');
    setTxSearch('');
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
      showMessage('Please enter a valid positive amount', 'error');
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
        showMessage(res.error || 'Failed to record transaction', 'error');
        return;
      }
      showMessage(txForm.type === 'CASH_IN' ? 'Funds added to account' : 'Funds withdrawn from account');
      setTxForm({ type: 'CASH_IN', amount: '', category: '', notes: '', reference_number: '' });
      await openTransactions(selectedSource);
      await loadSources();
    } catch (e: any) {
      showMessage(e?.message || 'Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  const filteredSources = sources.filter(s => {
    const matchesSearch = !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.bank_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.account_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.upi_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.holder_name || '').toLowerCase().includes(search.toLowerCase());

    const matchesFilter = typeFilter === 'ALL' || s.type === typeFilter;
    return matchesSearch && matchesFilter;
  });

  const safeSources = Array.isArray(sources) ? sources : [];
  const totalLiquidity = safeSources.filter(s => s.is_enabled === 1).reduce((sum, s) => sum + (Number(s.current_balance) || 0), 0);
  const totalAccounts = safeSources.length;
  const activeAccounts = safeSources.filter(s => s.is_enabled === 1).length;
  const defaultSource = safeSources.find(s => s.is_default === 1);
  const totalTxnCount = safeSources.reduce((sum, s) => sum + (Number(s.transaction_count) || 0), 0);

  const filteredTransactions = transactions.filter(t => {
    if (!txSearch.trim()) return true;
    const query = txSearch.toLowerCase();
    return (
      (t.category || '').toLowerCase().includes(query) ||
      (t.reference_number || '').toLowerCase().includes(query) ||
      (t.notes || '').toLowerCase().includes(query) ||
      (t.entered_by_name || '').toLowerCase().includes(query)
    );
  });

  const txTotalIn = transactions.filter(t => t.type === 'CASH_IN').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const txTotalOut = transactions.filter(t => t.type === 'CASH_OUT').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-in fade-in duration-300 overflow-hidden">
      {/* Background ambient lighting effects */}
      <div className="absolute -top-24 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Header */}
      <header className="shrink-0 z-20 border-b border-border/80 bg-card/80 backdrop-blur-md shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary via-indigo-600 to-violet-700 flex items-center justify-center shadow-lg shadow-primary/25 ring-2 ring-primary/20 shrink-0">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-foreground tracking-tight">
                {view === 'list' && 'Payment Methods'}
                {view === 'form' && (editing ? `Edit "${editing.name}"` : 'Link Payment Method')}
                {view === 'transactions' && (selectedSource ? selectedSource.name : 'Transaction Ledger')}
              </h1>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {view === 'list' && 'Configure and audit bank accounts, UPI IDs, credit cards & POS payment sources'}
                {view === 'form' && (editing ? 'Update channel identifiers, holder info, and sorting preferences.' : 'Configure a bank account, UPI ID, or card portal for customer payments.')}
                {view === 'transactions' && (selectedSource ? `Viewing full ledger & transaction logs for ${selectedSource.name}` : 'Detailed transaction logs')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isOwner && view === 'list' && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 font-bold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2.5 px-4 text-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Link Payment Method</span>
              </button>
            )}
            <button
              onClick={() => {
                if (view !== 'list') {
                  setView('list');
                } else {
                  onClose();
                }
              }}
              className="p-2.5 rounded-xl border border-destructive/30 hover:bg-destructive/15 bg-destructive/5 text-destructive transition-all duration-200 active:scale-95 cursor-pointer shadow-sm"
              title={view !== 'list' ? 'Back to Payment Methods' : 'Close'}
            >
              <X className="w-4.5 h-4.5 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* Floating Status Toast Notification */}
      {statusMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto max-w-md">
          <div className={clsx("p-2 rounded-xl shrink-0", statusMessage.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
              {statusMessage.type === 'success' ? 'PAYMENT STATUS' : 'PAYMENT ERROR'}
            </span>
            <span className="text-white font-bold text-xs block leading-tight">{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 overflow-y-auto px-6 py-6 relative z-10">
        {view === 'list' && (
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Top Liquidity Metrics Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
              
              {/* Card 1: Total Net Liquidity */}
              <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Wallet className="w-16 h-16 text-primary" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Total Liquidity</span>
                    <p className="text-xl font-black tracking-tight text-foreground font-mono mt-0.5">
                      {formatCurrency(totalLiquidity)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Across active sources</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" /> Healthy
                  </span>
                </div>
              </div>

              {/* Card 2: Active Channels */}
              <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-2xl border border-sky-500/20 shadow-inner">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Active Channels</span>
                    <p className="text-xl font-black tracking-tight text-foreground font-mono mt-0.5">
                      {activeAccounts} <span className="text-xs font-semibold text-muted-foreground">/ {totalAccounts} Total</span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                  <span>{sources.filter(s => s.type === 'BANK').length} Bank · {sources.filter(s => s.type === 'UPI').length} UPI · {sources.filter(s => s.type === 'CARD').length} Card</span>
                </div>
              </div>

              {/* Card 3: Default Gateway */}
              <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20 shadow-inner">
                    <Star className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Default Method</span>
                    <p className="text-sm font-extrabold text-foreground truncate mt-0.5">
                      {defaultSource ? defaultSource.name : 'None Selected'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/40 text-[11px] text-muted-foreground font-medium flex items-center justify-between">
                  <span>Primary receiving target</span>
                  {defaultSource && <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Active</span>}
                </div>
              </div>

              {/* Card 4: Total Volume */}
              <div className="relative overflow-hidden bg-card/60 dark:bg-card/40 border border-border/60 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-2xl border border-violet-500/20 shadow-inner">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Recorded Txns</span>
                    <p className="text-xl font-black tracking-tight text-foreground font-mono mt-0.5">
                      {totalTxnCount} <span className="text-xs font-normal text-muted-foreground">entries</span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/40 text-[11px] text-muted-foreground font-medium flex items-center justify-between">
                  <span>Ledger history active</span>
                  <span className="font-bold text-violet-600 dark:text-violet-400">Audited</span>
                </div>
              </div>

            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card/60 dark:bg-card/40 border border-border/60 p-3.5 rounded-3xl backdrop-blur-md shadow-sm select-none">
              
              {/* Segmented Filter Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-2xl w-full md:w-auto overflow-x-auto">
                <button
                  onClick={() => setTypeFilter('ALL')}
                  className={clsx(
                    'px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
                    typeFilter === 'ALL'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                  )}
                >
                  All Methods ({sources.length})
                </button>
                <button
                  onClick={() => setTypeFilter('BANK')}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
                    typeFilter === 'BANK'
                      ? 'bg-background text-sky-600 dark:text-sky-400 shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                  )}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  Banks ({sources.filter(s => s.type === 'BANK').length})
                </button>
                <button
                  onClick={() => setTypeFilter('UPI')}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
                    typeFilter === 'UPI'
                      ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                  )}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  UPI IDs ({sources.filter(s => s.type === 'UPI').length})
                </button>
                <button
                  onClick={() => setTypeFilter('CARD')}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer',
                    typeFilter === 'CARD'
                      ? 'bg-background text-violet-600 dark:text-violet-400 shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                  )}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Cards ({sources.filter(s => s.type === 'CARD').length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search channel, bank, UPI..."
                  className="w-full pl-10 pr-9 py-2 text-xs bg-background/60 border border-border/80 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-foreground placeholder:text-muted-foreground/50"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Methods Card Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-56 rounded-3xl" />)}
              </div>
            ) : filteredSources.length === 0 ? (
              <div className="text-center py-20 bg-card/40 border border-border/60 rounded-3xl backdrop-blur-md">
                <div className="w-16 h-16 rounded-3xl bg-muted/60 flex items-center justify-center mx-auto mb-4 border border-border/40">
                  <Wallet className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-sm font-bold text-foreground">No payment methods found</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  {search ? 'No channel matches your search term. Try resetting your filter.' : 'Link your bank account, card, or UPI portal to get started.'}
                </p>
                {isOwner && !search && (
                  <button
                    onClick={openAdd}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add Payment Method
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredSources.map(s => {
                  const cfg = TYPE_CONFIG[s.type] || TYPE_CONFIG.BANK;
                  const Icon = cfg.icon;

                  return (
                    <div
                      key={s.source_id}
                      className={clsx(
                        'relative group overflow-hidden bg-card/80 dark:bg-card/50 border rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-primary/40 transition-all duration-300 backdrop-blur-md flex flex-col justify-between',
                        s.is_enabled === 1 ? 'border-border/70' : 'border-border/30 opacity-60 bg-muted/20',
                        s.is_default === 1 && 'ring-2 ring-primary/40 shadow-primary/5'
                      )}
                    >
                      {/* Card Top Strip Header */}
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className={clsx(
                              'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner transition-transform group-hover:scale-105',
                              cfg.badgeBg
                            )}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-black text-sm text-foreground truncate">{s.name}</h3>
                                {s.is_default === 1 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-0.5">
                                    <Star className="w-3 h-3 fill-amber-500" /> Default
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground font-semibold mt-0.5 flex items-center gap-1.5">
                                <span>{cfg.label}</span>
                                {s.bank_name && <span>· {s.bank_name}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Quick Interactive Toggles (Owner only) */}
                          {isOwner && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={e => toggleSourceDefault(s, e)}
                                title={s.is_default === 1 ? 'Current Default Method' : 'Set as Default Method'}
                                className={clsx(
                                  'p-2 rounded-xl border transition-all cursor-pointer',
                                  s.is_default === 1
                                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                                    : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
                                )}
                              >
                                <Star className={clsx('w-3.5 h-3.5', s.is_default === 1 && 'fill-amber-500')} />
                              </button>
                              <button
                                onClick={e => toggleSourceEnabled(s, e)}
                                title={s.is_enabled === 1 ? 'Click to Disable Method' : 'Click to Enable Method'}
                                className={clsx(
                                  'p-2 rounded-xl border transition-all text-[11px] font-bold cursor-pointer',
                                  s.is_enabled === 1
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400'
                                )}
                              >
                                {s.is_enabled === 1 ? 'Active' : 'Disabled'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Account Identifier Box */}
                        <div className="mt-5 p-3.5 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-between text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                              {s.type === 'UPI' ? 'UPI Identifier' : s.type === 'CARD' ? 'Card Details' : 'Account Details'}
                            </span>
                            <div className="font-mono font-bold text-foreground truncate mt-0.5 flex items-center gap-2">
                              {s.type === 'UPI' && (s.upi_id || 'No UPI ID specified')}
                              {s.type === 'CARD' && (s.account_number ? `•••• •••• •••• ${s.account_number}` : 'No card number')}
                              {s.type === 'BANK' && (s.account_number ? `A/C: ${s.account_number}` : 'No account number')}
                            </div>
                          </div>

                          {/* Quick Copy Button */}
                          {(s.upi_id || s.account_number) && (
                            <button
                              onClick={() => copyToClipboard(s.upi_id || s.account_number || '', s.source_id)}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg border border-transparent hover:border-border transition-all cursor-pointer shrink-0 ml-2"
                              title="Copy to clipboard"
                            >
                              {copiedId === s.source_id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Card Bottom: Balance & Action Toolbar */}
                      <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Available Balance</span>
                          <div className="text-xl font-black text-foreground font-mono tracking-tight mt-0.5">
                            {formatCurrency(s.current_balance)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openTransactions(s)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-xl transition-all cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Ledger ({s.transaction_count ?? 0})</span>
                          </button>
                          {isOwner && (
                            <>
                              <button
                                onClick={() => openEdit(s)}
                                className="p-2 text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/60 rounded-xl transition-all cursor-pointer"
                                title="Edit Method"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteSource(s)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all cursor-pointer"
                                title="Delete Method"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

            {/* ── UPI Details Page-wise Configuration Section ── */}
            <div className="bg-card/70 dark:bg-card/40 border border-border/60 p-6 rounded-3xl backdrop-blur-md shadow-sm space-y-5 mt-8 select-none">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground tracking-tight">
                      UPI Details – Page-wise Configuration
                    </h3>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      Enable or disable displaying the configured UPI ID list when UPI payment method is selected on each page.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-xl border border-border/50">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <span>{sources.filter(s => s.type === 'UPI' && s.is_enabled === 1).length} Active UPI Accounts Configured</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    key: 'billing' as const,
                    title: 'Billing Page',
                    desc: 'Displays the UPI account selection list when UPI payment is selected during POS billing checkout.',
                    icon: ShoppingCart,
                    badge: 'POS Checkout',
                  },
                  {
                    key: 'settlement' as const,
                    title: 'Cash Settlement Page',
                    desc: 'Displays the UPI account selection list when UPI payment is selected during cash register drawer settlement.',
                    icon: Wallet,
                    badge: 'Cash Drawer',
                  },
                  {
                    key: 'sales_history' as const,
                    title: 'Sales History Page',
                    desc: 'Displays the UPI account selection list when collecting due payments for credit invoices in Sales History.',
                    icon: History,
                    badge: 'Collect Payment',
                  },
                  {
                    key: 'scrap' as const,
                    title: 'Scrap Manager Page',
                    desc: 'Displays the UPI account selection list when paying or receiving funds via UPI in Scrap Manager.',
                    icon: Layers,
                    badge: 'Scrap Payouts',
                  },
                  {
                    key: 'mobile_billing' as const,
                    title: 'Mobile Billing Page',
                    desc: 'Displays the UPI account selection list when UPI payment is selected on the Mobile App billing screen.',
                    icon: Smartphone,
                    badge: 'Mobile POS',
                  },
                ].map((item) => {
                  const isEnabled = upiPageConfig[item.key];
                  const ItemIcon = item.icon;

                  return (
                    <div
                      key={item.key}
                      className={clsx(
                        'p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-4',
                        isEnabled
                          ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/30 shadow-sm'
                          : 'bg-muted/30 border-border/60 opacity-80'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            'p-2.5 rounded-xl border',
                            isEnabled
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-muted text-muted-foreground border-border'
                          )}>
                            <ItemIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-foreground">{item.title}</h4>
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
                              {item.badge}
                            </span>
                          </div>
                        </div>

                        {/* Toggle Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleUpiPage(item.key)}
                          className={clsx(
                            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
                            isEnabled ? 'bg-emerald-600' : 'bg-muted-foreground/30'
                          )}
                          title={`Toggle UPI details for ${item.title}`}
                        >
                          <span
                            className={clsx(
                              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                              isEnabled ? 'translate-x-5' : 'translate-x-0'
                            )}
                          />
                        </button>
                      </div>

                      <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                        {item.desc}
                      </p>

                      <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-bold">
                        <span className="text-muted-foreground">UPI Selection List:</span>
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full font-black uppercase tracking-wider',
                          isEnabled
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {isEnabled ? 'ON (Displayed)' : 'OFF (Hidden)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* Add / Edit Form View */}
        {view === 'form' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Step 1: Visual Channel Type Selector */}
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block">
                1. Select Payment Channel Type
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(['BANK', 'UPI', 'CARD'] as const).map(t => {
                  const cfg = TYPE_CONFIG[t];
                  const Icon = cfg.icon;
                  const isSelected = form.type === t;

                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, type: t })}
                      className={clsx(
                        'p-5 rounded-3xl border text-left transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden group',
                        isSelected
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40 shadow-lg shadow-primary/10'
                          : 'border-border/60 bg-card/60 hover:bg-card hover:border-border'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner transition-transform group-hover:scale-105', cfg.badgeBg)}>
                          <Icon className="w-6 h-6" />
                        </div>
                        {isSelected && (
                          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-md">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="mt-5">
                        <div className="font-black text-sm text-foreground">{cfg.label}</div>
                        <div className="text-xs text-muted-foreground font-medium mt-1">
                          {t === 'BANK' && 'Direct IMPS / NEFT / RTGS settlement'}
                          {t === 'UPI' && 'Google Pay, PhonePe, Paytm QR VPAs'}
                          {t === 'CARD' && 'Visa, Mastercard & RuPay POS swipe'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2 & Live Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Form Inputs Column */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Method Credentials Panel */}
                <div className="bg-card/80 border border-border/80 rounded-3xl p-6 shadow-sm space-y-5 backdrop-blur-md">
                  <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block border-b border-border/40 pb-2">
                    2. Method Details &amp; Identifiers
                  </span>

                  <div>
                    <label className="text-xs font-bold text-foreground mb-1.5 block">Method Display Name *</label>
                    <Input
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. HDFC Main Current A/C"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">This display title will appear on payment selection dropdowns during checkout.</p>
                  </div>

                  {/* Bank Account Fields & Presets */}
                  {form.type === 'BANK' && (
                    <div className="space-y-4 pt-1">
                      <div>
                        <label className="text-xs font-bold text-foreground mb-1.5 block">Bank Name</label>
                        <Input
                          value={form.bank_name}
                          onChange={e => setForm({ ...form, bank_name: e.target.value })}
                          placeholder="e.g. HDFC Bank"
                        />
                        {/* Quick Bank Presets */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">Popular:</span>
                          {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Bank'].map(b => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setForm({ ...form, bank_name: b })}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-muted/60 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-foreground mb-1.5 block">Account Number</label>
                          <Input
                            value={form.account_number}
                            onChange={e => setForm({ ...form, account_number: e.target.value })}
                            placeholder="e.g. 501002938472"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-foreground mb-1.5 block">Account Holder Name</label>
                          <Input
                            value={form.holder_name}
                            onChange={e => setForm({ ...form, holder_name: e.target.value })}
                            placeholder="Business / Legal Name"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Card Fields & Presets */}
                  {form.type === 'CARD' && (
                    <div className="space-y-4 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-foreground mb-1.5 block">Card Network / POS Provider</label>
                          <Input
                            value={form.bank_name}
                            onChange={e => setForm({ ...form, bank_name: e.target.value })}
                            placeholder="e.g. Visa Business / HDFC POS"
                          />
                          {/* Quick Network Presets */}
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            {['Visa Business', 'Mastercard', 'RuPay Corporate', 'Amex'].map(net => (
                              <button
                                key={net}
                                type="button"
                                onClick={() => setForm({ ...form, bank_name: net })}
                                className="px-2 py-0.5 text-[10px] font-semibold bg-muted/60 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                              >
                                {net}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-foreground mb-1.5 block">Last 4 Digits</label>
                          <Input
                            value={form.account_number}
                            maxLength={4}
                            onChange={e => setForm({ ...form, account_number: e.target.value.replace(/\D/g, '') })}
                            placeholder="e.g. 4829"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* UPI VPA Fields & Suffix Presets */}
                  {form.type === 'UPI' && (
                    <div className="space-y-4 pt-1">
                      <div>
                        <label className="text-xs font-bold text-foreground mb-1.5 block">UPI VPA Handle *</label>
                        <Input
                          value={form.upi_id}
                          onChange={e => setForm({ ...form, upi_id: e.target.value })}
                          placeholder="e.g. storename@okhdfcbank"
                        />
                        {/* Quick UPI Handle Suffix Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">Suffixes:</span>
                          {['@okhdfcbank', '@ybl', '@paytm', '@ibl', '@axl', '@sbi'].map(suf => (
                            <button
                              key={suf}
                              type="button"
                              onClick={() => {
                                const base = form.upi_id.split('@')[0] || 'store';
                                setForm({ ...form, upi_id: `${base}${suf}` });
                              }}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-muted/60 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer font-mono"
                            >
                              {suf}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* Balances & Rules Panel */}
                <div className="bg-card/80 border border-border/80 rounded-3xl p-6 shadow-sm space-y-5 backdrop-blur-md">
                  <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block border-b border-border/40 pb-2">
                    3. Initial Balance &amp; Permissions
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-foreground mb-1.5 block flex items-center justify-between">
                        <span>Opening Balance (₹)</span>
                        {!!editing && ((editing as any).transaction_count ?? 0) > 0 && (
                          <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Locked
                          </span>
                        )}
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
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground mb-1.5 block">Display Order Preference</label>
                      <Input
                        type="number"
                        value={String(form.sort_order)}
                        onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Toggle Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                    <label className="flex items-start gap-3 p-4 bg-muted/40 border border-border/60 rounded-2xl cursor-pointer hover:bg-muted/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={form.is_default}
                        onChange={e => setForm({ ...form, is_default: e.target.checked })}
                        className="mt-0.5 w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-foreground">Primary Default Gateway</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Auto-selected channel when settling bills</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-4 bg-muted/40 border border-border/60 rounded-2xl cursor-pointer hover:bg-muted/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={form.is_enabled}
                        onChange={e => setForm({ ...form, is_enabled: e.target.checked })}
                        className="mt-0.5 w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-foreground">Active for Billing</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Enable receiving transactions on this method</div>
                      </div>
                    </label>
                  </div>

                  {/* Submit Actions */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => setView('list')}
                      className="px-5 py-2.5 text-xs font-bold bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-all cursor-pointer border border-border/60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveSource}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/25 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isSaving ? 'Saving Payment Method...' : editing ? 'Save Changes' : 'Link Payment Method'}</span>
                    </button>
                  </div>

                </div>

              </div>

              {/* Ultra-Realistic Digital Wallet Card Preview */}
              <div className="lg:col-span-5 space-y-4 select-none sticky top-6">
                <div className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Live Wallet Card Preview
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/70">EMV 3D SECURE</span>
                </div>

                {/* Metallic Card Frame */}
                <div className={clsx(
                  'relative rounded-3xl p-6 text-white shadow-2xl bg-gradient-to-br transition-all duration-500 min-h-[230px] flex flex-col justify-between border border-white/25 overflow-hidden group hover:scale-[1.02]',
                  TYPE_CONFIG[form.type].gradient
                )}>
                  {/* Card sheen & reflection overlays */}
                  <div className="absolute top-0 right-0 left-0 bottom-0 bg-gradient-to-tr from-white/10 via-transparent to-black/30 pointer-events-none" />
                  <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/15 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-black/30 rounded-full blur-3xl pointer-events-none" />

                  {/* Card Top Row: Type & Default Badge */}
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/70 block">
                        {TYPE_CONFIG[form.type].label}
                      </span>
                      <h4 className="text-base font-black tracking-tight mt-0.5 truncate max-w-[200px] text-white">
                        {form.name || 'Channel Display Name'}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      {form.is_default && (
                        <span className="bg-amber-400/25 text-amber-200 border border-amber-300/40 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                          <Star className="w-3 h-3 fill-amber-300 text-amber-300" /> Default
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Middle Row: EMV Chip & Contactless Symbol */}
                  <div className="my-3 flex items-center justify-between relative z-10">
                    <div className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 border border-amber-100/60 shadow-inner flex items-center justify-center">
                      <div className="w-8 h-5 border border-amber-600/40 rounded-sm grid grid-cols-2 gap-0.5 p-0.5">
                        <div className="border-r border-b border-amber-600/40" />
                        <div className="border-b border-amber-600/40" />
                        <div className="border-r border-amber-600/40" />
                        <div className="border-amber-600/40" />
                      </div>
                    </div>
                    {/* Contactless waves icon */}
                    <div className="flex items-center gap-0.5 opacity-60">
                      <span className="w-1 h-3 rounded-full border-r-2 border-white" />
                      <span className="w-1 h-4 rounded-full border-r-2 border-white" />
                      <span className="w-1 h-5 rounded-full border-r-2 border-white" />
                    </div>
                  </div>

                  {/* Card Identifier Line */}
                  <div className="mb-2 relative z-10">
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/60 block">Identifier</span>
                    <div className="font-mono text-base font-bold tracking-wider text-white truncate mt-0.5">
                      {form.type === 'UPI' && (form.upi_id || 'handle@upi')}
                      {form.type === 'CARD' && (form.account_number ? `•••• •••• •••• ${form.account_number}` : '•••• •••• •••• 0000')}
                      {form.type === 'BANK' && (form.account_number ? `A/C: ${form.account_number}` : 'A/C: ••••••••••••')}
                    </div>
                    {form.bank_name && (
                      <div className="text-xs font-semibold text-white/90 mt-0.5">{form.bank_name}</div>
                    )}
                  </div>

                  {/* Card Bottom Row: Balance & Holder */}
                  <div className="flex items-end justify-between relative z-10 pt-3 border-t border-white/20">
                    <div>
                      <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/60 block">Opening Balance</span>
                      <div className="font-mono text-base font-black tracking-tight text-white mt-0.5">
                        {formatCurrency(parseFloat(form.opening_balance) || 0)}
                      </div>
                    </div>
                    {form.holder_name ? (
                      <div className="text-right">
                        <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/60 block">Holder</span>
                        <div className="text-xs font-extrabold text-white truncate max-w-[130px] mt-0.5">{form.holder_name}</div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className="text-[9px] uppercase font-extrabold tracking-widest text-white/40 block">Status</span>
                        <span className="text-xs font-bold text-emerald-300">Ready to Link</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Helpful Tip Box */}
                <div className="p-4 rounded-2xl bg-card/60 border border-border/60 text-xs text-muted-foreground space-y-1.5 backdrop-blur-md">
                  <div className="font-bold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Quick Tip</span>
                  </div>
                  <p>Linking bank accounts and UPI IDs accurately helps generate automated settlement reports and clear customer receipts.</p>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Transactions & Ledger View */}
        {view === 'transactions' && selectedSource && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
            
            {/* Header channel summary card */}
            <div className="bg-card/80 border border-border/80 rounded-3xl p-6 shadow-sm backdrop-blur-md select-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner', TYPE_CONFIG[selectedSource.type].badgeBg)}>
                  {(() => {
                    const Icon = TYPE_CONFIG[selectedSource.type].icon;
                    return <Icon className="w-7 h-7" />;
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-foreground">{selectedSource.name}</h2>
                    {selectedSource.is_default === 1 && (
                      <span className="text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                    {TYPE_CONFIG[selectedSource.type].label}
                    {selectedSource.bank_name && ` · ${selectedSource.bank_name}`}
                    {selectedSource.account_number && ` · ${selectedSource.account_number}`}
                    {selectedSource.upi_id && ` · ${selectedSource.upi_id}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 self-end md:self-auto">
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Net Cash In</span>
                  <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(txTotalIn)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Net Cash Out</span>
                  <span className="font-mono text-sm font-bold text-red-600 dark:text-red-400">-{formatCurrency(txTotalOut)}</span>
                </div>
                <div className="text-right pl-4 border-l border-border/60">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">Current Balance</span>
                  <span className="font-mono text-xl font-black text-foreground">{formatCurrency(selectedSource.current_balance)}</span>
                </div>
              </div>
            </div>

            {/* Quick Record Manual Entry Panel */}
            {isOwner && (
              <div className="bg-card/80 border border-border/80 rounded-3xl p-5 shadow-sm backdrop-blur-md space-y-4">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h3 className="text-xs font-black text-foreground uppercase tracking-wider flex items-center gap-2 select-none">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span>Record Manual Transaction Entry</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTxForm({ ...txForm, type: 'CASH_IN' })}
                      className={clsx(
                        'px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer',
                        txForm.type === 'CASH_IN' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      + Money In (Deposit)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxForm({ ...txForm, type: 'CASH_OUT' })}
                      className={clsx(
                        'px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer',
                        txForm.type === 'CASH_OUT' ? 'bg-red-600 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      - Money Out (Withdrawal)
                    </button>
                  </div>
                </div>

                {/* Quick Category Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1 select-none">Presets:</span>
                  {QUICK_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTxForm({ ...txForm, category: cat })}
                      className={clsx(
                        'px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer',
                        txForm.category === cat
                          ? 'bg-primary/10 border-primary/40 text-primary font-bold'
                          : 'bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-wider">Amount (₹) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={txForm.amount}
                      onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-wider">Category</label>
                    <Input
                      value={txForm.category}
                      onChange={e => setTxForm({ ...txForm, category: e.target.value })}
                      placeholder="e.g. Vendor Payment / Invoice #1024"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-wider">Reference / UTR</label>
                    <Input
                      value={txForm.reference_number}
                      onChange={e => setTxForm({ ...txForm, reference_number: e.target.value })}
                      placeholder="e.g. UTR-94827103"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-end">
                    <button
                      type="button"
                      onClick={saveTransaction}
                      disabled={isSavingTx}
                      className={clsx(
                        'w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer h-10',
                        txForm.type === 'CASH_IN'
                          ? 'bg-emerald-600 text-white shadow-emerald-900/20'
                          : 'bg-red-600 text-white shadow-red-900/20'
                      )}
                    >
                      {txForm.type === 'CASH_IN' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                      <span>{isSavingTx ? 'Posting...' : 'Post Entry'}</span>
                    </button>
                  </div>
                </div>

                {showNotes ? (
                  <div className="pt-2">
                    <Input
                      value={txForm.notes}
                      onChange={e => setTxForm({ ...txForm, notes: e.target.value })}
                      placeholder="Add optional notes or ledger reference detail..."
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNotes(true)}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    + Add notes to transaction
                  </button>
                )}
              </div>
            )}

            {/* Transactions Log & Table */}
            <div className="bg-card/80 border border-border/80 rounded-3xl overflow-hidden shadow-sm backdrop-blur-md">
              <div className="p-4 border-b border-border/60 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">Transaction History</h3>
                  <span className="text-xs text-muted-foreground font-semibold">({filteredTransactions.length} entries)</span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                  <input
                    type="text"
                    value={txSearch}
                    onChange={e => setTxSearch(e.target.value)}
                    placeholder="Search UTR, category, notes..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-background/60 border border-border/60 rounded-xl focus:outline-none focus:border-primary transition-all font-semibold text-foreground"
                  />
                  {txSearch && (
                    <button
                      onClick={() => setTxSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground p-0.5 hover:text-foreground rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {loadingTx ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-xs font-semibold">No transactions recorded for this method yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/40 font-extrabold text-[10px]">
                        <th className="px-5 py-3">Date &amp; Time</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Category &amp; Notes</th>
                        <th className="px-5 py-3">Reference / UTR</th>
                        <th className="px-5 py-3 text-right">Amount</th>
                        <th className="px-5 py-3 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-medium">
                      {filteredTransactions.map(t => (
                        <tr key={t.transaction_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-3.5 text-muted-foreground font-mono whitespace-nowrap">
                            {formatDateTime(t.transaction_date)}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className={clsx(
                              'inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border',
                              t.type === 'CASH_IN'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                            )}>
                              {t.type === 'CASH_IN' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                              {t.type === 'CASH_IN' ? 'Deposit' : 'Withdrawal'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-bold text-foreground block">{t.category || 'General Ledger'}</span>
                            {t.notes && <span className="text-muted-foreground text-[11px] block mt-0.5">{t.notes}</span>}
                            {t.entered_by_name && <span className="text-[10px] text-muted-foreground/70 block">By: {t.entered_by_name}</span>}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-muted-foreground font-semibold">
                            {t.reference_number ? (
                              <span className="bg-muted px-2 py-0.5 rounded border border-border/60 text-[11px]">
                                {t.reference_number}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className={clsx(
                            'px-5 py-3.5 text-right font-mono font-bold whitespace-nowrap text-sm',
                            t.type === 'CASH_IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          )}>
                            {t.type === 'CASH_IN' ? '+' : '-'}{formatCurrency(t.amount)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold text-foreground whitespace-nowrap">
                            {formatCurrency(t.running_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
