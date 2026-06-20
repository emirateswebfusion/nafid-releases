import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Plus, Pencil, Trash2, Minus, Plus as PlusIcon, X, Save, Search } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Skeleton } from './ui/Skeleton';

interface Party {
  party_id: string;
  tenant_id: string;
  name: string;
  phone: string;
  balance: number;
  notes: string;
  is_deleted: number;
  sync_status: string;
  created_at: string;
  updated_at: string;
}

export function PartyManager({ onClose }: { onClose: () => void }) {
  const { tenantId } = useAuthStore();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', notes: '', balance: '' });

  const [adjustModal, setAdjustModal] = useState<{ party: Party; type: 'add' | 'reduce' } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchParties();
  }, []);

  const fetchParties = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.dbGetParties(tenantId);
      setParties(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showStatus('Failed to load parties', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', notes: '', balance: '' });
    setEditingParty(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { showStatus('Name is required', 'error'); return; }
    try {
      const result = await window.electronAPI.dbAddParty({
        party_id: uuidv4(),
        tenant_id: tenantId,
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        notes: formData.notes.trim() || null,
        balance: parseFloat(formData.balance) || 0,
      });
      if (result.success) {
        showStatus('Party created', 'success');
        resetForm();
        setView('list');
        fetchParties();
      } else {
        showStatus(result.error || 'Failed to create party', 'error');
      }
    } catch { showStatus('Network error', 'error'); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !editingParty) return;
    try {
      const result = await window.electronAPI.dbUpdateParty({
        party_id: editingParty.party_id,
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        notes: formData.notes.trim() || null,
      });
      if (result.success) {
        showStatus('Party updated', 'success');
        resetForm();
        setView('list');
        fetchParties();
      } else {
        showStatus(result.error || 'Failed to update party', 'error');
      }
    } catch { showStatus('Network error', 'error'); }
  };

  const handleDelete = async (party: Party) => {
    if (!window.confirm(`Delete party "${party.name}"?`)) return;
    try {
      const result = await window.electronAPI.dbDeleteParty(party.party_id);
      if (result.success) {
        showStatus('Party deleted', 'success');
        fetchParties();
      }
    } catch { showStatus('Network error', 'error'); }
  };

  const openEdit = (party: Party) => {
    setEditingParty(party);
    setFormData({ name: party.name, phone: party.phone || '', notes: party.notes || '', balance: '' });
    setView('edit');
  };

  const handleAdjustBalance = async () => {
    if (!adjustModal || !adjustAmount) return;
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) { showStatus('Enter a valid amount', 'error'); return; }

    const signedAmount = adjustModal.type === 'add' ? amount : -amount;
    try {
      const result = await window.electronAPI.dbAdjustPartyBalance({
        party_id: adjustModal.party.party_id,
        amount: signedAmount,
      });
      if (result.success) {
        showStatus(`Balance ${adjustModal.type === 'add' ? 'increased' : 'reduced'} by ₹${amount}`, 'success');
        setAdjustModal(null);
        setAdjustAmount('');
        fetchParties();
      } else {
        showStatus(result.error || 'Failed to adjust balance', 'error');
      }
    } catch { showStatus('Network error', 'error'); }
  };

  const filteredParties = parties.filter(p =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.phone || '').includes(searchQuery)
  );

  const totalOutstanding = parties.reduce((sum, p) => sum + p.balance, 0);

  if (view === 'add' || view === 'edit') {
    const isEdit = view === 'edit';
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Party' : 'Add New Party'}</h2>
          <button onClick={() => { resetForm(); setView('list'); }} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 max-w-lg mx-auto w-full">
          <form onSubmit={isEdit ? handleEdit : handleAdd} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5">Party Name *</label>
              <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="Enter party name" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Phone</label>
              <Input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" />
            </div>
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Opening Balance</label>
                <Input type="number" value={formData.balance} onChange={e => setFormData(f => ({ ...f, balance: e.target.value }))} placeholder="0" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5">Notes</label>
              <textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" className="flex-1">{isEdit ? 'Update Party' : 'Create Party'}</Button>
              <button type="button" onClick={() => { resetForm(); setView('list'); }} className="px-4 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-xl transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div>
          <h2 className="text-xl font-bold">Parties / Credit</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total Outstanding: <span className="font-bold text-primary">₹{totalOutstanding.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {statusMessage && (
            <span className={clsx('text-sm font-medium', statusMessage.type === 'success' ? 'text-green-600' : 'text-destructive')}>
              {statusMessage.text}
            </span>
          )}
          <Button onClick={() => { resetForm(); setView('add'); }} size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> New Party
          </Button>
          <button onClick={onClose} className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-lg transition-colors flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-border bg-muted/20">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search parties..." className="pl-9 h-9 text-sm" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : filteredParties.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium mb-1">{searchQuery ? 'No parties match your search' : 'No parties yet'}</p>
            <p className="text-sm">Create your first party to start tracking credit</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {filteredParties.map(party => (
              <div key={party.party_id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{party.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {party.phone && <span>{party.phone}</span>}
                    {party.notes && <span className="truncate max-w-[200px]">{party.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right mr-2">
                    <p className={clsx('text-lg font-black', party.balance > 0 ? 'text-destructive' : party.balance < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                      ₹{Math.abs(party.balance).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {party.balance > 0 ? 'Owes You' : party.balance < 0 ? 'You Owe' : 'Settled'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setAdjustModal({ party, type: 'add' })} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 rounded-lg transition-colors" title="Add amount">
                      <PlusIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => setAdjustModal({ party, type: 'reduce' })} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Reduce amount">
                      <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(party)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(party)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Adjust Balance Modal */}
      <Modal isOpen={!!adjustModal} onClose={() => { setAdjustModal(null); setAdjustAmount(''); }}
        title={adjustModal ? `${adjustModal.type === 'add' ? 'Add' : 'Reduce'} Amount — ${adjustModal.party.name}` : ''}>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Amount to {adjustModal?.type === 'add' ? 'add' : 'reduce'}
            </label>
            <Input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="Enter amount" step="0.01" min="0" autoFocus />
          </div>
          {adjustModal && (
            <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted rounded-lg px-4 py-2.5">
              <span>Current Balance</span>
              <span className="font-bold text-foreground">₹{adjustModal.party.balance.toFixed(2)}</span>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleAdjustBalance} className="flex-1" variant={adjustModal?.type === 'reduce' ? 'destructive' : 'default'}>
              {adjustModal?.type === 'add' ? 'Add Amount' : 'Reduce Amount'}
            </Button>
            <button onClick={() => { setAdjustModal(null); setAdjustAmount(''); }} className="px-4 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-xl transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
