import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Plus, Trash2, Pencil, X, Save, TrendingUp, TrendingDown, Package, Search, RefreshCw, Recycle, AlertTriangle } from 'lucide-react';
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

  const totalStock = items.reduce((s, i) => s + Number(i.current_stock), 0);
  const estimatedValue = items.reduce((s, i) => s + Number(i.purchase_price) * Number(i.current_stock), 0);

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shadow-inner animate-pulse">
              <Recycle className="w-5 h-5" />
            </div>
            <div>
              <div className="h-4 w-40 bg-muted rounded animate-pulse" />
              <div className="h-3 w-24 bg-muted rounded animate-pulse mt-1.5" />
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shadow-inner">
            {view === 'list' ? <Recycle className="w-5 h-5" /> : view === 'transaction' ? <TrendingUp className="w-5 h-5" /> : <Package className="w-5 h-5" />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list' ? 'Scrap Management' : view === 'add' ? 'Add Scrap Item' : view === 'edit' ? `Edit: ${selectedItem?.name}` : `Transactions — ${selectedItem?.name}`}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            {view === 'list' && (
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">{items.length} scrap items &middot; {categories.length} categories</p>
            )}
            {view !== 'list' && (
              <span className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {useAuthStore.getState().role === 'OWNER' ? 'Owner' : (useAuthStore.getState().userName || 'Staff')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view !== 'list' ? (
            <button onClick={() => setView('list')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Back to list">
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : (
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </header>

      {/* ── Action Bar ── */}
      {view === 'list' && (
        <div className="flex justify-between items-center gap-4 px-6 py-3 border-b border-border bg-card/50 shrink-0 shadow-sm">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search scrap items by name or category..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCategoryManager(true)}
              className="px-3 py-2.5 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/80 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              Manage Categories
            </button>
            <button
              onClick={() => { setFormData({ name: '', scrap_category_id: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' }); setView('add'); }}
              className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Scrap Item
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {/* ── Category Manager Modal ── */}
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

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black">{items.length}</span>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                    <Recycle className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Scrap Items</div>
              </div>
              <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-emerald-500">{totalStock.toFixed(1)}</span>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Total Stock (Kgs)</div>
              </div>
              <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-blue-500">{formatCurrency(estimatedValue)}</span>
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Estimated Value</div>
              </div>
              <div className="bg-card border border-border/80 border-l-4 border-l-indigo-500 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-indigo-500">{categories.length}</span>
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Categories</div>
              </div>
            </div>

            {/* Table Header */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 bg-muted/40">
                <div className="col-span-3">Name</div>
                <div className="col-span-2">Category</div>
                <div className="col-span-2 text-right">Purchase Rate</div>
                <div className="col-span-2 text-right">Stock</div>
                <div className="col-span-1 text-center">Unit</div>
                <div className="col-span-2 text-center">Actions</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Recycle className="w-12 h-12 mb-3 text-amber-500/30" />
                    <p className="font-medium text-foreground">No scrap items found</p>
                    <p className="text-sm mt-1">Click "Add Scrap Item" to get started</p>
                  </div>
                ) : filteredItems.map(item => (
                  <div key={item.scrap_item_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border/40 hover:border-amber-500/30 hover:shadow-sm transition-all duration-150 group">
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                          <Recycle className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-foreground font-bold text-sm">{item.name}</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-semibold">{item.category_name || '-'}</span>
                    </div>
                    <div className="col-span-2 text-right text-foreground font-semibold text-sm">{formatCurrency(item.purchase_price)}</div>
                    <div className="col-span-2 text-right">
                      <span className={clsx(
                        'font-bold text-sm',
                        Number(item.current_stock) <= 0 ? 'text-destructive' : 'text-emerald-500'
                      )}>
                        {Number(item.current_stock).toFixed(1)}
                      </span>
                    </div>
                    <div className="col-span-1 text-center text-muted-foreground text-sm font-semibold">{item.unit}</div>
                    <div className="col-span-2 flex items-center justify-center gap-1">
                      <button
                        onClick={() => openTransaction(item)}
                        className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                        title="Add Transaction"
                      >
                        <TrendingUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.scrap_item_id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ADD / EDIT VIEW ── */}
        {(view === 'add' || view === 'edit') && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Section Header */}
            <div className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                  <Package className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-amber-500 uppercase tracking-wider">
                  {view === 'add' ? 'New Scrap Item' : 'Edit Scrap Item'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
                  <select
                    value={formData.scrap_category_id}
                    onChange={e => setFormData(p => ({ ...p, scrap_category_id: e.target.value }))}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm appearance-none text-sm"
                  >
                    <option value="">-- No Category --</option>
                    {categories.map(c => <option key={c.scrap_category_id} value={c.scrap_category_id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm appearance-none text-sm"
                  >
                    <option value="Kgs">Kgs</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Grams">Grams</option>
                    <option value="Ltrs">Ltrs</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase Rate (₹)</label>
                  <input
                    type="number" step="0.01"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={formData.purchase_price}
                    onChange={e => setFormData(p => ({ ...p, purchase_price: e.target.value }))}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Selling Rate (₹)</label>
                  <input
                    type="number" step="0.01"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    value={formData.selling_price}
                    onChange={e => setFormData(p => ({ ...p, selling_price: e.target.value }))}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                  />
                </div>
                {view === 'add' && (
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Opening Stock</label>
                    <input
                      type="number" step="0.001"
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      value={formData.current_stock}
                      onChange={e => setFormData(p => ({ ...p, current_stock: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            {statusMessage && (
              <div className={clsx('px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20')}>
                {statusMessage.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {statusMessage.text}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setView('list')} className="px-4 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-xl transition-all active:scale-95 cursor-pointer">
                Cancel
              </button>
              <button onClick={view === 'edit' ? handleUpdateItem : handleAddItem} className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
                <Save className="w-4 h-4" /> {view === 'edit' ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── TRANSACTION VIEW ── */}
        {view === 'transaction' && selectedItem && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Transaction Form */}
            <div className="space-y-6">
              {/* Item Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-sm">
                  <div className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">Stock</div>
                  <div className="text-xl font-black mt-1">{Number(selectedItem.current_stock).toFixed(1)} {selectedItem.unit}</div>
                </div>
                <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-sm">
                  <div className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">Purchase Rate</div>
                  <div className="text-xl font-black mt-1 text-emerald-500">{formatCurrency(selectedItem.purchase_price)}</div>
                </div>
                <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-sm">
                  <div className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">Selling Rate</div>
                  <div className="text-xl font-black mt-1 text-blue-500">{formatCurrency(selectedItem.selling_price)}</div>
                </div>
              </div>

              {/* Transaction Form */}
              <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm">
                <div className="flex bg-muted rounded-lg p-0.5 mb-4">
                  <button
                    onClick={() => setTxForm(p => ({ ...p, type: 'PURCHASE' }))}
                    className={clsx(
                      'flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                      txForm.type === 'PURCHASE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <TrendingUp className="w-4 h-4 text-emerald-500" /> Purchase
                  </button>
                  <button
                    onClick={() => setTxForm(p => ({ ...p, type: 'SALE' }))}
                    className={clsx(
                      'flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                      txForm.type === 'SALE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <TrendingDown className="w-4 h-4 text-red-500" /> Sale
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Quantity ({selectedItem.unit})</label>
                    <input
                      type="number" step="0.001"
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      value={txForm.quantity}
                      onChange={e => setTxForm(p => ({ ...p, quantity: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Rate (₹)</label>
                    <input
                      type="number" step="0.01"
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      value={txForm.rate}
                      onChange={e => setTxForm(p => ({ ...p, rate: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Name</label>
                    <input
                      type="text"
                      value={txForm.party_name}
                      onChange={e => setTxForm(p => ({ ...p, party_name: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
                    <input
                      type="text"
                      value={txForm.notes}
                      onChange={e => setTxForm(p => ({ ...p, notes: e.target.value }))}
                      className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                    />
                  </div>
                </div>

                {txForm.quantity && txForm.rate && (
                  <div className="mt-4 pt-3 border-t border-border/60 text-right">
                    <span className="text-sm text-muted-foreground font-semibold">Total: </span>
                    <span className="text-lg font-black text-primary">{formatCurrency(Number(txForm.quantity) * Number(txForm.rate))}</span>
                  </div>
                )}

                {statusMessage && (
                  <div className={clsx('mt-4 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2', statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20')}>
                    {statusMessage.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {statusMessage.text}
                  </div>
                )}

                <button
                  onClick={handleAddTransaction}
                  className="w-full mt-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> Record {txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'}
                </button>
              </div>
            </div>

            {/* Right: Transaction History */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                  Transaction History
                </h2>
                <button onClick={() => loadTransactions(selectedItem.scrap_item_id)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all active:scale-90 cursor-pointer" title="Refresh">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Summary */}
              {(totalPurchases + totalSales) > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-center">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Purchases</div>
                    <div className="font-bold text-lg text-emerald-500">{formatCurrency(totalPurchases)}</div>
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-center">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Sales</div>
                    <div className="font-bold text-lg text-red-500">{formatCurrency(totalSales)}</div>
                  </div>
                  <div className={clsx('rounded-xl p-3 text-center border', profit >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20')}>
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Profit</div>
                    <div className={clsx('font-bold text-lg', profit >= 0 ? 'text-emerald-500' : 'text-red-500')}>{formatCurrency(profit)}</div>
                  </div>
                </div>
              )}

              {/* Transactions Table */}
              <div className="border border-border rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                <div className="grid grid-cols-5 gap-2 px-4 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 bg-muted/40 sticky top-0">
                  <div className="col-span-1">Type</div>
                  <div className="col-span-1 text-right">Qty</div>
                  <div className="col-span-1 text-right">Rate</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-1 text-left">Date</div>
                </div>
                <div className="divide-y divide-border">
                  {transactions.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">No transactions yet</div>
                  ) : transactions.map(tx => (
                    <div key={tx.transaction_id} className="grid grid-cols-5 gap-2 px-4 py-2.5 items-center bg-card hover:bg-muted/20 transition-colors">
                      <div className="col-span-1">
                        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', tx.type === 'PURCHASE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500')}>
                          {tx.type === 'PURCHASE' ? 'PUR' : 'SALE'}
                        </span>
                      </div>
                      <div className="col-span-1 text-right font-semibold text-sm">{tx.quantity.toFixed(2)}</div>
                      <div className="col-span-1 text-right font-semibold text-sm">{formatCurrency(tx.rate)}</div>
                      <div className="col-span-1 text-right font-bold text-sm">{formatCurrency(tx.total_amount)}</div>
                      <div className="col-span-1 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
