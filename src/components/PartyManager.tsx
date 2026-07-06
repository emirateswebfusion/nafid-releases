import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Search, Loader2, UserPlus,
  Pencil, Trash2, BookOpen, PlusCircle, MinusCircle,
  Calendar, Hash, User, X, CheckCircle2, AlertCircle, Save,
  UserCircle, Banknote, FileText, Phone, MapPin,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Skeleton } from './ui/Skeleton';

interface Party {
  party_id: string;
  name: string;
  phone: string;
  address: string;
  gstin: string;
  balance: number;
  balance_type: 'RECEIVABLE' | 'PAYABLE';
  notes: string;
  last_transaction_date: string;
  created_at: string;
}

interface LedgerEntry {
  ledger_id: string;
  party_id: string;
  transaction_date: string;
  description: string;
  credit_amount: number;
  debit_amount: number;
  running_balance: number;
  reference_number: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

type View = 'list' | 'ledger' | 'party_form' | 'tx_form';

const formatBalance = (balance: number) => {
  const abs = Math.abs(balance).toFixed(2);
  return balance >= 0 ? `+${abs}` : `-${abs}`;
};

const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN');
};

export function PartyManager({ onClose }: { onClose: () => void }) {
  const { tenantId, userId, userName, role } = useAuthStore();
  const isOwner = role === 'OWNER';

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [view, setView] = useState<View>('list');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState({
    name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE' as 'RECEIVABLE' | 'PAYABLE', notes: ''
  });
  const [isSavingParty, setIsSavingParty] = useState(false);

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [editingTx, setEditingTx] = useState<LedgerEntry | null>(null);
  const [isSavingTx, setIsSavingTx] = useState(false);
  const [txForm, setTxForm] = useState({
    amount: '', transaction_type: 'CREDIT' as 'CREDIT' | 'DEBIT',
    description: '', transaction_date: '', reference_number: '',
    payment_method: 'CASH' as 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'OTHER',
  });

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const loadParties = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.dbGetParties(tenantId);
      setParties(Array.isArray(data) ? data : []);
    } catch {
      showStatus('Failed to load parties', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadParties(); }, [loadParties]);

  const loadLedger = async (partyId: string) => {
    setLedgerLoading(true);
    try {
      const data = await window.electronAPI.dbGetPartyLedger(partyId);
      if (data && !Array.isArray(data) && (data as any).error) {
        showStatus('Ledger: ' + (data as any).error, 'error');
      } else {
        setLedger(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      showStatus('Failed to load ledger', 'error');
    } finally {
      setLedgerLoading(false);
    }
  };

  const resetPartyForm = () => {
    setPartyForm({ name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE', notes: '' });
    setEditingParty(null);
  };

  const handleSaveParty = async () => {
    if (!partyForm.name.trim()) { showStatus('Party name is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage parties', 'error'); return; }
    setIsSavingParty(true);
    try {
      if (editingParty) {
        await window.electronAPI.dbUpdateParty({
          party_id: editingParty.party_id,
          name: partyForm.name.trim(),
          phone: partyForm.phone.trim() || null,
          address: partyForm.address.trim() || null,
          gstin: partyForm.gstin.trim() || null,
          notes: partyForm.notes.trim() || null,
        });
        showStatus('Party updated', 'success');
      } else {
        await window.electronAPI.dbAddParty({
          party_id: uuidv4(),
          tenant_id: tenantId,
          name: partyForm.name.trim(),
          phone: partyForm.phone.trim() || null,
          address: partyForm.address.trim() || null,
          gstin: partyForm.gstin.trim() || null,
          balance: parseFloat(partyForm.opening_balance) || 0,
          balance_type: partyForm.balance_type,
          notes: partyForm.notes.trim() || null,
          created_by: userId,
          created_by_name: userName || undefined,
        });
        showStatus('Party created', 'success');
      }
      await loadParties();
      setView('list');
      resetPartyForm();
    } catch (e: any) {
      showStatus(e.message || 'Operation failed', 'error');
    } finally {
      setIsSavingParty(false);
    }
  };

  const handleDeleteParty = async (party: Party) => {
    if (!isOwner) { showStatus('Only owners can delete parties', 'error'); return; }
    if (!confirm(`Delete party "${party.name}"? This will remove all ledger entries.`)) return;
    try {
      await window.electronAPI.dbDeleteParty(party.party_id);
      showStatus('Party deleted', 'success');
      setParties(prev => prev.filter(p => p.party_id !== party.party_id));
    } catch (e: any) {
      showStatus(e.message || 'Delete failed', 'error');
    }
  };

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;
    if (!txForm.amount || !txForm.description.trim()) { showStatus('Amount and description are required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage transactions', 'error'); return; }

    const parsedAmount = parseFloat(txForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { showStatus('Enter a valid positive amount', 'error'); return; }

    setIsSavingTx(true);
    try {
      if (editingTx) {
        await window.electronAPI.dbUpdatePartyLedgerEntry({
          ledger_id: editingTx.ledger_id,
          party_id: selectedParty.party_id,
          amount: parsedAmount,
          transaction_type: txForm.transaction_type,
          description: txForm.description.trim(),
          transaction_date: txForm.transaction_date || undefined,
          reference_number: txForm.reference_number.trim() || null,
        });
        showStatus('Transaction updated', 'success');
      } else {
        await window.electronAPI.dbAddPartyLedgerEntry({
          ledger_id: uuidv4(),
          party_id: selectedParty.party_id,
          tenant_id: tenantId,
          amount: parsedAmount,
          transaction_type: txForm.transaction_type,
          description: txForm.description.trim(),
          transaction_date: txForm.transaction_date || new Date().toISOString(),
          reference_number: txForm.reference_number.trim() || null,
          created_by: userId,
          created_by_name: userName || undefined,
        });

        if (txForm.payment_method === 'CASH') {
          const cashType = txForm.transaction_type === 'CREDIT' ? 'CASH_OUT' : 'CASH_IN';
          await window.electronAPI.dbCashierAddTransaction({
            tenant_id: tenantId!,
            type: cashType,
            amount: parsedAmount,
            category: 'Party ' + (cashType === 'CASH_OUT' ? 'Payment' : 'Receipt'),
            notes: `${selectedParty.name} - ${txForm.description.trim()}`,
            user_id: userId!,
            user_name: userName || undefined,
          });
        }

        showStatus('Transaction added', 'success');
      }
      await loadLedger(selectedParty.party_id);
      await loadParties();
      setView('ledger');
    } catch (e: any) {
      showStatus(e.message || 'Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  const handleDeleteTx = async (entry: LedgerEntry) => {
    if (!selectedParty || !isOwner) { showStatus('Only owners can delete transactions', 'error'); return; }
    if (!confirm('Delete this transaction? The balance will be recalculated.')) return;
    try {
      await window.electronAPI.dbDeletePartyLedgerEntry(entry.ledger_id, selectedParty.party_id);
      showStatus('Transaction deleted', 'success');
      await loadLedger(selectedParty.party_id);
      await loadParties();
    } catch (e: any) {
      showStatus(e.message || 'Delete failed', 'error');
    }
  };

  const filteredParties = parties.filter(p =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.phone || '').includes(searchQuery)
  );

  const totalReceivable = parties.reduce((s, p) => s + (p.balance > 0 ? p.balance : 0), 0);
  const totalPayable = parties.reduce((s, p) => s + (p.balance < 0 ? Math.abs(p.balance) : 0), 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ── Unified Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            {view === 'list' ? <BookOpen className="w-5 h-5" /> : view === 'party_form' ? <UserPlus className="w-5 h-5" /> : view === 'ledger' ? <BookOpen className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list' ? 'Parties / Ledger' : view === 'party_form' ? (editingParty ? 'Edit Party' : 'Add New Party') : view === 'ledger' && selectedParty ? selectedParty.name : editingTx ? 'Edit Transaction' : 'Add Transaction'}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            {view === 'list' && <p className="text-xs text-muted-foreground font-semibold mt-0.5">{parties.length} {parties.length === 1 ? 'party' : 'parties'}</p>}
            {view === 'ledger' && selectedParty && (
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                Balance: <span className={clsx(selectedParty.balance > 0 ? 'text-destructive' : selectedParty.balance < 0 ? 'text-green-600' : '')}>
                  ₹{formatBalance(selectedParty.balance)}
                </span> — {selectedParty.balance > 0 ? 'Receivable' : selectedParty.balance < 0 ? 'Payable' : 'Settled'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusMessage && (
            <span className={clsx('text-sm font-medium', statusMessage.type === 'success' ? 'text-green-600' : 'text-destructive')}>
              {statusMessage.text}
            </span>
          )}
          {view === 'list' && (
            <>
              {isOwner && (
                <button onClick={() => { resetPartyForm(); setView('party_form'); }}
                  className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
                  <UserPlus className="w-4 h-4" /> Add Party
                </button>
              )}
              <button onClick={onClose} className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center" title="Close">
                <X className="w-4 h-4 text-destructive" />
              </button>
            </>
          )}
          {view === 'ledger' && (
            <>
              {isOwner && (
                <button onClick={() => {
                  setEditingTx(null);
                  setTxForm({ amount: '', transaction_type: 'CREDIT', description: '', transaction_date: new Date().toISOString().slice(0, 16), reference_number: '', payment_method: 'CASH' });
                  setView('tx_form');
                }} className="h-10 px-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
                  <PlusCircle className="w-3.5 h-3.5" /> Add Tx
                </button>
              )}
              <button onClick={() => setView('list')} className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center" title="Back to list">
                <X className="w-4 h-4 text-destructive" />
              </button>
            </>
          )}
          {(view === 'party_form' || view === 'tx_form') && (
            <button onClick={() => { setView(view === 'party_form' ? 'list' : 'ledger'); resetPartyForm(); }} className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center" title="Back">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </header>

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-border bg-card/50 shrink-0 shadow-sm">
            <div className="bg-card p-4 rounded-xl border border-border/80 shadow-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Receivable</p>
              <p className="text-2xl font-black text-destructive mt-1">₹{totalReceivable.toFixed(2)}</p>
            </div>
            <div className="bg-card p-4 rounded-xl border border-border/80 shadow-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Payable</p>
              <p className="text-2xl font-black text-green-600 mt-1">₹{totalPayable.toFixed(2)}</p>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-border bg-card/50 shrink-0 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search parties..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-border/80 rounded-xl py-2.5 pl-10 pr-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
            </div>
          </div>

          {/* Party List */}
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
              ) : filteredParties.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-lg font-black mb-1">{searchQuery ? 'No parties match your search' : 'No parties yet'}</p>
                  <p className="text-sm">Create your first party to start tracking balances</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredParties.map(party => (
                    <div key={party.party_id}
                      className="flex items-center justify-between p-4 rounded-xl border border-border/80 bg-card hover:border-primary/30 transition-all duration-200 shadow-sm">
                      <div onClick={() => { setSelectedParty(party); setView('ledger'); loadLedger(party.party_id); }}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-foreground truncate text-sm">{party.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground font-semibold mt-0.5">
                            {party.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {party.phone}
                              </span>
                            )}
                            {party.gstin && (
                              <span className="flex items-center gap-1 text-amber-500">
                                <FileText className="w-3 h-3" /> {party.gstin}
                              </span>
                            )}
                            {party.last_transaction_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {formatDate(party.last_transaction_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right mr-1">
                          <p className={clsx('text-lg font-black', party.balance > 0 ? 'text-destructive' : party.balance < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                            ₹{formatBalance(party.balance)}
                          </p>
                          <p className={clsx('text-[10px] uppercase font-black tracking-wider', party.balance > 0 ? 'text-destructive' : party.balance < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                            {party.balance > 0 ? 'Receivable' : party.balance < 0 ? 'Payable' : 'Settled'}
                          </p>
                        </div>
                        <button onClick={() => { setSelectedParty(party); setView('ledger'); loadLedger(party.party_id); }}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-95" title="View Ledger">
                          <BookOpen className="w-4 h-4" />
                        </button>
                        {isOwner && (
                          <>
                            <button onClick={() => { setEditingParty(party); setPartyForm({
                              name: party.name, phone: party.phone || '', address: party.address || '',
                              gstin: party.gstin || '', opening_balance: '', balance_type: party.balance_type, notes: party.notes || '',
                            }); setView('party_form'); }}
                              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all active:scale-95" title="Edit Party">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteParty(party)}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-95" title="Delete Party">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── PARTY FORM VIEW ── */}
      {(view === 'party_form') && (
        <div className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full">
            {/* Section 1: Basic Details */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <UserCircle className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">1. Basic Details</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Name *</label>
                    <input type="text" placeholder="Enter party name"
                      value={partyForm.name} onChange={e => setPartyForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Contact Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input type="text" placeholder="Phone number"
                          value={partyForm.phone} onChange={e => setPartyForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full bg-background border border-border/80 rounded-xl p-3 pl-10 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GSTIN</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input type="text" placeholder="GSTIN (optional)"
                          value={partyForm.gstin} onChange={e => setPartyForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                          className="w-full bg-background border border-border/80 rounded-xl p-3 pl-10 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm font-mono tracking-wider uppercase" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 flex flex-col">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Address</label>
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <textarea placeholder="Optional address"
                      value={partyForm.address} onChange={e => setPartyForm(f => ({ ...f, address: e.target.value }))}
                      className="w-full h-full min-h-[130px] bg-background border border-border/80 rounded-xl p-3 pl-10 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm resize-none" />
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Opening Balance */}
            {!editingParty && (
              <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Opening Balance</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Balance Type</label>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <button type="button"
                        onClick={() => setPartyForm(f => ({ ...f, balance_type: 'RECEIVABLE' }))}
                        className={clsx(
                          'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer',
                          partyForm.balance_type === 'RECEIVABLE'
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border'
                        )}>
                        Receivable (+)
                      </button>
                      <button type="button"
                        onClick={() => setPartyForm(f => ({ ...f, balance_type: 'PAYABLE' }))}
                        className={clsx(
                          'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer',
                          partyForm.balance_type === 'PAYABLE'
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border'
                        )}>
                        Payable (-)
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground font-semibold mt-2">
                      {partyForm.balance_type === 'RECEIVABLE' ? 'Party owes you this amount' : 'You owe the party this amount'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Opening Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                      <input type="number" step="0.01" min="0" placeholder="0.00"
                        value={partyForm.opening_balance} onChange={e => setPartyForm(f => ({ ...f, opening_balance: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm" />
                    </div>
                    <p className="text-xs text-muted-foreground font-semibold mt-2">
                      {partyForm.balance_type === 'RECEIVABLE' ? 'Will be added as a credit (+)' : 'Will be added as a debit (-)'}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Section 3: Notes */}
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">{editingParty ? '2' : '3'}. Notes</span>
              </div>
              <div>
                <textarea placeholder="Optional notes about this party" rows={3}
                  value={partyForm.notes} onChange={e => setPartyForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm resize-none" />
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 bg-background">
            <div className="px-4 pt-2">
              {statusMessage && (
                <div className={clsx(
                  "px-3 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200",
                  statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
                )}>
                  {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span className="flex-1">{statusMessage.text}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end px-4 py-3">
              <button type="button" disabled={isSavingParty} onClick={handleSaveParty}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                {isSavingParty ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {isSavingParty ? 'Saving...' : editingParty ? 'Update Party' : 'Add to Parties'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEDGER VIEW ── */}
      {view === 'ledger' && selectedParty && (
        <div className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {selectedParty.address && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold bg-muted/50 px-4 py-2.5 rounded-xl border border-border/80 mb-4">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>{selectedParty.address}</span>
              </div>
            )}

            {ledgerLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
            ) : ledger.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-black mb-1">No transactions yet</p>
                <p className="text-sm">Add the first transaction to start tracking the ledger</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...ledger].reverse().map((entry) => (
                  <div key={entry.ledger_id}
                    className="p-4 rounded-xl border border-border/80 bg-card hover:border-primary/30 transition-all duration-200 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold mb-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDateTime(entry.transaction_date)}</span>
                          {entry.reference_number && (
                            <span className="flex items-center gap-1">
                              <Hash className="w-3.5 h-3.5" /> {entry.reference_number}
                            </span>
                          )}
                        </div>
                        <p className="font-black text-sm">{entry.description}</p>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-semibold mt-1">
                          <User className="w-3 h-3" /> {entry.created_by_name || 'Unknown'}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        {entry.credit_amount > 0 && <p className="text-green-600 font-black text-sm">+₹{entry.credit_amount.toFixed(2)}</p>}
                        {entry.debit_amount > 0 && <p className="text-destructive font-black text-sm">-₹{entry.debit_amount.toFixed(2)}</p>}
                        <p className={clsx('text-xs font-black mt-0.5', entry.running_balance > 0 ? 'text-destructive' : entry.running_balance < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                          Bal: {formatBalance(entry.running_balance)}
                        </p>
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-border/60">
                        <button onClick={() => {
                          setEditingTx(entry);
                          const amt = entry.credit_amount > 0 ? entry.credit_amount : entry.debit_amount;
                          setTxForm({
                            amount: String(amt),
                            transaction_type: entry.credit_amount > 0 ? 'CREDIT' : 'DEBIT',
                            description: entry.description,
                            transaction_date: entry.transaction_date.slice(0, 16),
                            reference_number: entry.reference_number || '',
                          });
                          setView('tx_form');
                        }} className="p-1.5 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all active:scale-95" title="Edit Transaction">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteTx(entry)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-95" title="Delete Transaction">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TX FORM VIEW ── */}
      {view === 'tx_form' && selectedParty && (
        <form onSubmit={handleSaveTx} className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full">
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">Transaction Details</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Transaction Type</label>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <button type="button"
                        onClick={() => setTxForm(f => ({ ...f, transaction_type: 'CREDIT' }))}
                        className={clsx(
                          'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer',
                          txForm.transaction_type === 'CREDIT'
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border'
                        )}>
                        <PlusCircle className="w-4 h-4 inline mr-1" /> Credit (+)
                      </button>
                      <button type="button"
                        onClick={() => setTxForm(f => ({ ...f, transaction_type: 'DEBIT' }))}
                        className={clsx(
                          'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer',
                          txForm.transaction_type === 'DEBIT'
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border'
                        )}>
                        <MinusCircle className="w-4 h-4 inline mr-1" /> Debit (-)
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Amount (₹) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                      <input required type="number" step="0.01" min="0.01" placeholder="0.00"
                        value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm" />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Transaction Date</label>
                    <input type="datetime-local"
                      value={txForm.transaction_date} onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Reference Number</label>
                    <input type="text" placeholder="Optional ref / invoice no."
                      value={txForm.reference_number} onChange={e => setTxForm(f => ({ ...f, reference_number: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Description / Remarks *</label>
                <textarea required placeholder="Transaction description" rows={2}
                  value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm resize-none" />
              </div>
              {!editingTx && (
                <div className="mt-4">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment Method</label>
                  <div className="grid grid-cols-5 gap-2">
                    {(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'OTHER'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setTxForm(f => ({ ...f, payment_method: m }))}
                        className={clsx(
                          'py-2 px-1 rounded-xl border-2 text-[11px] font-bold transition-all duration-200 active:scale-95 cursor-pointer text-center leading-tight',
                          txForm.payment_method === m
                            ? m === 'CASH' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm'
                              : 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}>
                        {m === 'CASH' ? '💵 Cash' : m === 'BANK_TRANSFER' ? '🏦 Bank' : m === 'UPI' ? '📱 UPI' : m === 'CARD' ? '💳 Card' : '📄 Other'}
                      </button>
                    ))}
                  </div>
                  {txForm.payment_method === 'CASH' && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1.5 flex items-center gap-1">
                      <Banknote className="w-3 h-3" /> {txForm.transaction_type === 'CREDIT' ? 'Cash will be deducted from drawer' : 'Cash will be added to drawer'}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 bg-background">
            <div className="px-4 pt-2">
              {statusMessage && (
                <div className={clsx(
                  "px-3 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200",
                  statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
                )}>
                  {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span className="flex-1">{statusMessage.text}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setView('ledger')}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/80 border border-border/80 text-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
                <button type="submit" disabled={isSavingTx}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  {isSavingTx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {isSavingTx ? 'Saving...' : editingTx ? 'Update' : 'Add Transaction'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}