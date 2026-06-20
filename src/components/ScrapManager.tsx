import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Plus, Trash2, Pencil, X, Save, TrendingUp, TrendingDown, Package, Search, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

type View = 'list' | 'add' | 'edit' | 'transaction';

interface ScrapCategory {
  scrap_category_id: string;
  name: string;
}

interface ScrapItem {
  scrap_item_id: string;
  name: string;
  scrap_category_id: string;
  category_name: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  unit: string;
}

interface ScrapTransaction {
  transaction_id: string;
  type: 'PURCHASE' | 'SALE';
  scrap_item_id: string;
  scrap_item_name: string;
  quantity: number;
  rate: number;
  total_amount: number;
  party_name: string;
  notes: string;
  created_at: string;
}

export function ScrapManager({ onClose }: { onClose: () => void }) {
  const { tenantId } = useAuthStore();
  const [view, setView] = useState<View>('list');
  const [categories, setCategories] = useState<ScrapCategory[]>([]);
  const [items, setItems] = useState<ScrapItem[]>([]);
  const [transactions, setTransactions] = useState<ScrapTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ScrapItem | null>(null);
  const [search, setSearch] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    scrap_category_id: '',
    purchase_price: '',
    selling_price: '',
    current_stock: '',
    unit: 'Kgs',
  });

  const [txForm, setTxForm] = useState({
    type: 'PURCHASE' as 'PURCHASE' | 'SALE',
    scrap_item_id: '',
    quantity: '',
    rate: '',
    party_name: '',
    notes: '',
  });

  const [catForm, setCatForm] = useState({ name: '' });
  const [editingCat, setEditingCat] = useState<ScrapCategory | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const tid = tenantId || '';
        const [cats, its] = await Promise.all([
          window.electronAPI.dbGetScrapCategories(tid),
          window.electronAPI.dbGetScrapItems(tid),
        ]);
        if (Array.isArray(cats)) setCategories(cats);
        if (Array.isArray(its)) setItems(its);
      }
    } catch (err) {
      console.error('[ScrapManager] Failed to load data:', err);
    }
    setLoading(false);
  };

  const loadTransactions = async (itemId?: string) => {
    if (window.electronAPI) {
      const txs = await window.electronAPI.dbGetScrapTransactions({ tenant_id: tenantId || '', scrap_item_id: itemId });
      if (Array.isArray(txs)) setTransactions(txs);
    }
  };

  const handleAddItem = async () => {
    if (!formData.name) { setStatusMessage({ text: 'Name is required', type: 'error' }); return; }
    if (window.electronAPI) {
      const res = await window.electronAPI.dbAddScrapItem({
        scrap_item_id: uuidv4(),
        tenant_id: tenantId,
        ...formData,
        purchase_price: Number(formData.purchase_price) || 0,
        selling_price: Number(formData.selling_price) || 0,
        current_stock: Number(formData.current_stock) || 0,
      });
      if (res.success) {
        setStatusMessage({ text: 'Scrap item added', type: 'success' });
        setFormData({ name: '', scrap_category_id: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' });
        setView('list');
        loadData();
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleUpdateItem = async () => {
    if (!selectedItem) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbUpdateScrapItem({
        scrap_item_id: selectedItem.scrap_item_id,
        ...formData,
        purchase_price: Number(formData.purchase_price) || 0,
        selling_price: Number(formData.selling_price) || 0,
        current_stock: Number(formData.current_stock) || 0,
      });
      if (res.success) {
        setStatusMessage({ text: 'Scrap item updated', type: 'success' });
        setView('list');
        loadData();
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this scrap item?')) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbDeleteScrapItem(id);
      if (res.success) { loadData(); } else { alert(res.error); }
    }
  };

  const openEdit = (item: ScrapItem) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      scrap_category_id: item.scrap_category_id || '',
      purchase_price: item.purchase_price.toString(),
      selling_price: item.selling_price.toString(),
      current_stock: item.current_stock.toString(),
      unit: item.unit || 'Kgs',
    });
    setView('edit');
  };

  const openTransaction = (item: ScrapItem) => {
    setSelectedItem(item);
    setTxForm({ type: 'PURCHASE', scrap_item_id: item.scrap_item_id, quantity: '', rate: '', party_name: '', notes: '' });
    setView('transaction');
    loadTransactions(item.scrap_item_id);
  };

  const handleAddTransaction = async () => {
    if (!txForm.quantity || !txForm.rate) { setStatusMessage({ text: 'Quantity and Rate required', type: 'error' }); return; }
    const qty = Number(txForm.quantity);
    const rate = Number(txForm.rate);
    if (txForm.type === 'SALE' && selectedItem && qty > Number(selectedItem.current_stock)) {
      setStatusMessage({ text: 'Insufficient stock', type: 'error' }); return;
    }
    if (window.electronAPI) {
      const res = await window.electronAPI.dbAddScrapTransaction({
        transaction_id: uuidv4(),
        tenant_id: tenantId,
        ...txForm,
        quantity: qty,
        rate,
        total_amount: qty * rate,
      });
      if (res.success) {
        setStatusMessage({ text: `${txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'} recorded`, type: 'success' });
        loadTransactions(txForm.scrap_item_id);
        loadData();
        setTxForm(prev => ({ ...prev, quantity: '', rate: '', party_name: '', notes: '' }));
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleAddCategory = async () => {
    if (!catForm.name) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbAddScrapCategory({ scrap_category_id: uuidv4(), tenant_id: tenantId, name: catForm.name });
      if (res.success) {
        setCatForm({ name: '' });
        const cats = await window.electronAPI.dbGetScrapCategories(tenantId || '');
        if (Array.isArray(cats)) setCategories(cats);
      }
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCat) return;
    if (window.electronAPI) {
      await window.electronAPI.dbUpdateScrapCategory({ scrap_category_id: editingCat.scrap_category_id, name: catForm.name });
      setEditingCat(null);
      setCatForm({ name: '' });
      const cats = await window.electronAPI.dbGetScrapCategories(tenantId || '');
      if (Array.isArray(cats)) setCategories(cats);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    if (window.electronAPI) {
      await window.electronAPI.dbDeleteScrapCategory(id);
      const cats = await window.electronAPI.dbGetScrapCategories(tenantId || '');
      if (Array.isArray(cats)) setCategories(cats);
    }
  };

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.category_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPurchases = transactions.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + t.total_amount, 0);
  const totalSales = transactions.filter(t => t.type === 'SALE').reduce((s, t) => s + t.total_amount, 0);
  const profit = totalSales - totalPurchases;

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center bg-background"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg"><Package className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">Scrap Management</h1>
            <p className="text-muted-foreground text-sm">{items.length} scrap items</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {view === 'list' ? (
            <>
              <button onClick={() => setShowCategoryManager(true)} className="px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">Manage Categories</button>
              <button onClick={() => { setFormData({ name: '', scrap_category_id: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' }); setView('add'); }} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><Plus className="w-4 h-4" /> Add Scrap Item</button>
              <button onClick={onClose} className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-lg transition-colors flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" />
                Close
              </button>
            </>
          ) : (
            <button onClick={() => setView('list')} className="p-2 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors"><X className="w-5 h-5" /></button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {/* Category Manager Modal */}
        {showCategoryManager && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">Scrap Categories</h2>
                <button onClick={() => setShowCategoryManager(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {categories.map(cat => (
                  <div key={cat.scrap_category_id} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border">
                    {editingCat?.scrap_category_id === cat.scrap_category_id ? (
                      <div className="flex-1 flex gap-2">
                        <input value={catForm.name} onChange={e => setCatForm({ name: e.target.value })} className="flex-1 bg-background border border-border rounded-lg p-2 text-sm" />
                        <button onClick={handleUpdateCategory} className="p-2 text-primary"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingCat(null)} className="p-2 text-muted-foreground"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-sm">{cat.name}</span>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingCat(cat); setCatForm({ name: cat.name }); }} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteCategory(cat.scrap_category_id)} className="p-1.5 hover:bg-destructive/20 rounded-lg text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <input value={catForm.name} onChange={e => setCatForm({ name: e.target.value })} placeholder="New category name" className="flex-1 bg-background border border-border rounded-xl p-3 text-sm" />
                <button onClick={editingCat ? handleUpdateCategory : handleAddCategory} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}

        {view === 'list' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 border border-border rounded-xl bg-card">
                <div className="text-2xl font-black">{items.length}</div>
                <div className="text-xs text-muted-foreground">Scrap Items</div>
              </div>
              <div className="p-4 border border-border rounded-xl bg-card">
                <div className="text-2xl font-black text-emerald-500">{items.reduce((s, i) => s + Number(i.current_stock), 0).toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Total Stock</div>
              </div>
              <div className="p-4 border border-border rounded-xl bg-card">
                <div className="text-2xl font-black text-blue-500">{formatCurrency(items.reduce((s, i) => s + Number(i.selling_price) * Number(i.current_stock), 0))}</div>
                <div className="text-xs text-muted-foreground">Estimated Value</div>
              </div>
              <div className="p-4 border border-border rounded-xl bg-card">
                <div className="text-2xl font-black text-amber-500">{categories.length}</div>
                <div className="text-xs text-muted-foreground">Categories</div>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search scrap items..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
            </div>

            {/* Items List */}
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Name</th>
                    <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Category</th>
                    <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Purchase Rate</th>
                    <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Selling Rate</th>
                    <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Stock</th>
                    <th className="text-center p-3 font-bold text-xs uppercase text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No scrap items found</td></tr>
                  ) : filteredItems.map(item => (
                    <tr key={item.scrap_item_id} className="hover:bg-muted/20">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 text-muted-foreground">{item.category_name || '-'}</td>
                      <td className="p-3 text-right">{formatCurrency(item.purchase_price)}</td>
                      <td className="p-3 text-right font-bold text-emerald-500">{formatCurrency(item.selling_price)}</td>
                      <td className="p-3 text-right font-bold">{Number(item.current_stock).toFixed(1)} {item.unit}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openTransaction(item)} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-muted rounded-lg" title="Add Transaction"><TrendingUp className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteItem(item.scrap_item_id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(view === 'add' || view === 'edit') && (
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-bold">{view === 'add' ? 'Add Scrap Item' : 'Edit Scrap Item'}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Item Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Category</label>
                <select value={formData.scrap_category_id} onChange={e => setFormData(p => ({ ...p, scrap_category_id: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none appearance-none">
                  <option value="">-- No Category --</option>
                  {categories.map(c => <option key={c.scrap_category_id} value={c.scrap_category_id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Unit</label>
                <select value={formData.unit} onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none appearance-none">
                  <option value="Kgs">Kgs</option>
                  <option value="Pcs">Pcs</option>
                  <option value="Grams">Grams</option>
                  <option value="Ltrs">Ltrs</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Purchase Rate (₹)</label>
                <input type="number" step="0.01" value={formData.purchase_price} onChange={e => setFormData(p => ({ ...p, purchase_price: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Selling Rate (₹)</label>
                <input type="number" step="0.01" value={formData.selling_price} onChange={e => setFormData(p => ({ ...p, selling_price: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              {view === 'add' && (
                <div>
                  <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Opening Stock</label>
                  <input type="number" step="0.001" value={formData.current_stock} onChange={e => setFormData(p => ({ ...p, current_stock: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                </div>
              )}
            </div>
            {statusMessage && (
              <div className={clsx('px-4 py-2.5 rounded-xl text-sm font-bold', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive')}>{statusMessage.text}</div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setView('list')} className="px-4 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-xl transition-colors">Cancel</button>
              <button onClick={view === 'edit' ? handleUpdateItem : handleAddItem} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><Save className="w-4 h-4" /> {view === 'edit' ? 'Update' : 'Save'}</button>
            </div>
          </div>
        )}

        {view === 'transaction' && selectedItem && (
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Transaction — {selectedItem.name}</h2>
              <div className="p-4 bg-muted/20 border border-border rounded-xl grid grid-cols-3 gap-4 text-center">
                <div><div className="text-sm text-muted-foreground">Stock</div><div className="text-xl font-black">{Number(selectedItem.current_stock).toFixed(1)}</div></div>
                <div><div className="text-sm text-muted-foreground">Purchase Rate</div><div className="text-xl font-black">{formatCurrency(selectedItem.purchase_price)}</div></div>
                <div><div className="text-sm text-muted-foreground">Selling Rate</div><div className="text-xl font-black">{formatCurrency(selectedItem.selling_price)}</div></div>
              </div>

              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex bg-muted rounded-lg p-0.5">
                  <button onClick={() => setTxForm(p => ({ ...p, type: 'PURCHASE' }))} className={clsx('flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5', txForm.type === 'PURCHASE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}><TrendingUp className="w-4 h-4 text-emerald-500" /> Purchase</button>
                  <button onClick={() => setTxForm(p => ({ ...p, type: 'SALE' }))} className={clsx('flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5', txForm.type === 'SALE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}><TrendingDown className="w-4 h-4 text-red-500" /> Sale</button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Quantity</label>
                    <input type="number" step="0.001" value={txForm.quantity} onChange={e => setTxForm(p => ({ ...p, quantity: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Rate (₹)</label>
                    <input type="number" step="0.01" value={txForm.rate} onChange={e => setTxForm(p => ({ ...p, rate: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Party Name</label>
                    <input type="text" value={txForm.party_name} onChange={e => setTxForm(p => ({ ...p, party_name: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-1.5">Notes</label>
                    <input type="text" value={txForm.notes} onChange={e => setTxForm(p => ({ ...p, notes: e.target.value }))} className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                  </div>
                </div>
                {txForm.quantity && txForm.rate && (
                  <div className="text-right text-lg font-black text-primary">Total: {formatCurrency(Number(txForm.quantity) * Number(txForm.rate))}</div>
                )}
                {statusMessage && (
                  <div className={clsx('px-4 py-2.5 rounded-xl text-sm font-bold', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive')}>{statusMessage.text}</div>
                )}
                <button onClick={handleAddTransaction} className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"><Save className="w-4 h-4" /> Record {txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'}</button>
              </div>
            </div>

            {/* Transaction History */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Transaction History</h2>
                <button onClick={() => loadTransactions(selectedItem.scrap_item_id)} className="p-2 text-muted-foreground hover:text-foreground"><RefreshCw className="w-4 h-4" /></button>
              </div>

              {totalPurchases + totalSales > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                    <div className="text-xs text-muted-foreground">Purchases</div>
                    <div className="font-bold text-emerald-500">{formatCurrency(totalPurchases)}</div>
                  </div>
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                    <div className="text-xs text-muted-foreground">Sales</div>
                    <div className="font-bold text-red-500">{formatCurrency(totalSales)}</div>
                  </div>
                  <div className={clsx('p-3 rounded-xl text-center border', profit >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20')}>
                    <div className="text-xs text-muted-foreground">Profit</div>
                    <div className={clsx('font-bold', profit >= 0 ? 'text-emerald-500' : 'text-red-500')}>{formatCurrency(profit)}</div>
                  </div>
                </div>
              )}

              <div className="border border-border rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2.5 text-xs font-bold text-muted-foreground uppercase">Type</th>
                      <th className="text-right p-2.5 text-xs font-bold text-muted-foreground uppercase">Qty</th>
                      <th className="text-right p-2.5 text-xs font-bold text-muted-foreground uppercase">Rate</th>
                      <th className="text-right p-2.5 text-xs font-bold text-muted-foreground uppercase">Total</th>
                      <th className="text-left p-2.5 text-xs font-bold text-muted-foreground uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No transactions yet</td></tr>
                    ) : transactions.map(tx => (
                      <tr key={tx.transaction_id} className="hover:bg-muted/20">
                        <td className="p-2.5">
                          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', tx.type === 'PURCHASE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500')}>{tx.type === 'PURCHASE' ? 'PUR' : 'SALE'}</span>
                        </td>
                        <td className="p-2.5 text-right font-medium">{tx.quantity.toFixed(2)}</td>
                        <td className="p-2.5 text-right">{formatCurrency(tx.rate)}</td>
                        <td className="p-2.5 text-right font-bold">{formatCurrency(tx.total_amount)}</td>
                        <td className="p-2.5 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
