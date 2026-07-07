import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, type ReceiptData } from '../utils/receiptGenerator';
import { Plus, Trash2, Pencil, X, Save, TrendingUp, TrendingDown, Search, RefreshCw, Recycle, AlertTriangle, CheckCircle2, AlertCircle, ShoppingCart, Minus, Package, IndianRupee, Printer, CheckCheck } from 'lucide-react';
import { Select } from './ui/Select';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

type View = 'list' | 'transaction' | 'selling' | 'invoices' | 'invoice_detail';

interface ScrapCategory {
  scrap_category_id: string;
  tenant_id: string;
  name: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  unit: string;
  is_deleted?: number;
}

interface ScrapTransaction {
  transaction_id: string;
  type: 'PURCHASE' | 'SALE';
  scrap_category_id: string;
  scrap_category_name: string;
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
  const [transactions, setTransactions] = useState<ScrapTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ScrapCategory | null>(null);
  const [search, setSearch] = useState('');
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ScrapCategory | null>(null);
  const [formData, setFormData] = useState({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' });
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [txForm, setTxForm] = useState({
    type: 'PURCHASE' as 'PURCHASE' | 'SALE',
    categoryId: '',
    quantity: '',
    rate: '',
    party_name: '',
    notes: '',
  });

  // Selling page state
  const [sellingSearch, setSellingSearch] = useState('');
  const [sellingResults, setSellingResults] = useState<ScrapCategory[]>([]);
  const [sellingSelected, setSellingSelected] = useState<{ category: ScrapCategory; qty: number; rate: number }[]>([]);
  const [sellingProcessing, setSellingProcessing] = useState(false);

  // Invoices state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState<string>('');
  const [invoiceDetailTxs, setInvoiceDetailTxs] = useState<any[]>([]);
  const [reprintSuccess, setReprintSuccess] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const tid = tenantId || '';
        await window.electronAPI.dbDeduplicateScrapCategories();
        const cats = await window.electronAPI.dbGetScrapCategories(tid);
        if (Array.isArray(cats)) setCategories(cats);
      }
    } catch (err) {
      console.error('[ScrapManager] Failed to load data:', err);
    }
    setLoading(false);
  };

  const loadTransactions = async (categoryId?: string) => {
    if (window.electronAPI) {
      const txs = await window.electronAPI.dbGetScrapTransactions({ tenant_id: tenantId || '', scrap_category_id: categoryId });
      if (Array.isArray(txs)) setTransactions(txs);
    }
  };

  const loadInvoices = async () => {
    if (window.electronAPI) {
      const invs = await window.electronAPI.dbGetScrapInvoiceList({ tenant_id: tenantId || '' });
      if (Array.isArray(invs)) setInvoices(invs);
    }
  };

  const openInvoiceDetail = async (invoiceNumber: string) => {
    setSelectedInvoiceNumber(invoiceNumber);
    if (window.electronAPI) {
      const detail = await window.electronAPI.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: invoiceNumber });
      if (detail && detail.transactions) setInvoiceDetailTxs(detail.transactions);
    }
    setView('invoice_detail');
  };

  const handleAddCategory = async () => {
    if (!formData.name) { setStatusMessage({ text: 'Name is required', type: 'error' }); return; }
    if (window.electronAPI) {
      const res = await window.electronAPI.dbAddScrapCategory({
        scrap_category_id: uuidv4(),
        tenant_id: tenantId,
        ...formData,
        purchase_price: Number(formData.purchase_price) || 0,
        selling_price: Number(formData.selling_price) || 0,
        current_stock: Number(formData.current_stock) || 0,
      });
      if (res.success) {
        setStatusMessage({ text: 'Category added', type: 'success' });
        setFormData({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' });
        setShowCategoryForm(false);
        loadData();
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.dbUpdateScrapCategory({
        scrap_category_id: editingCategory.scrap_category_id,
        name: formData.name,
        purchase_price: Number(formData.purchase_price) || 0,
        selling_price: Number(formData.selling_price) || 0,
        current_stock: Number(formData.current_stock) || 0,
        unit: formData.unit || 'Kgs',
      });
      if (res.success) {
        setStatusMessage({ text: 'Category updated', type: 'success' });
        setEditingCategory(null);
        setShowCategoryForm(false);
        setFormData({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' });
        loadData();
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDeleteCategory = async (id: string) => {
    const cat = categories.find(c => c.scrap_category_id === id);
    if (!cat) return;
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    if (window.electronAPI) {
      await window.electronAPI.dbDeleteScrapCategory(id);
      loadData();
    }
  };

  const openEdit = (cat: ScrapCategory) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      purchase_price: cat.purchase_price.toString(),
      selling_price: cat.selling_price.toString(),
      current_stock: cat.current_stock.toString(),
      unit: cat.unit || 'Kgs',
    });
    setShowCategoryForm(true);
  };

  const openTransaction = (cat: ScrapCategory) => {
    setSelectedCategory(cat);
    setTxForm({ type: 'PURCHASE', categoryId: cat.scrap_category_id, quantity: '', rate: '', party_name: '', notes: '' });
    setView('transaction');
    loadTransactions(cat.scrap_category_id);
  };

  const handleAddTransaction = async () => {
    if (!txForm.quantity || !txForm.rate) { setStatusMessage({ text: 'Quantity and Rate required', type: 'error' }); return; }
    const qty = Number(txForm.quantity);
    const rate = Number(txForm.rate);
    if (txForm.type === 'SALE' && selectedCategory && qty > Number(selectedCategory.current_stock)) {
      setStatusMessage({ text: 'Insufficient stock', type: 'error' }); return;
    }
    if (window.electronAPI) {
      const res = await window.electronAPI.dbAddScrapTransaction({
        transaction_id: uuidv4(),
        tenant_id: tenantId,
        type: txForm.type,
        scrap_category_id: txForm.categoryId,
        quantity: qty,
        rate,
        total_amount: qty * rate,
        party_name: txForm.party_name || '',
        notes: txForm.notes || '',
      });
      if (res.success) {
        setStatusMessage({ text: `${txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'} recorded`, type: 'success' });
        loadTransactions(txForm.categoryId);
        loadData();
        setTxForm(prev => ({ ...prev, quantity: '', rate: '', party_name: '', notes: '' }));
      } else {
        setStatusMessage({ text: res.error || 'Failed', type: 'error' });
      }
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Auto-dismiss reprint toast
  useEffect(() => {
    if (!reprintSuccess) return;
    const t = setTimeout(() => setReprintSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [reprintSuccess]);

  // Selling search effect
  useEffect(() => {
    if (sellingSearch.length < 2) { setSellingResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const res = await window.electronAPI.dbGetScrapCategoriesBySearch({ tenant_id: tenantId || '', search: sellingSearch });
      if (Array.isArray(res)) setSellingResults(res.filter((c: ScrapCategory, i: number, arr: ScrapCategory[]) => arr.findIndex(x => x.scrap_category_id === c.scrap_category_id) === i));
    }, 150);
    return () => clearTimeout(t);
  }, [sellingSearch, tenantId]);

  const handleAddToSellingCart = (cat: ScrapCategory) => {
    setSellingSelected(prev => {
      const existing = prev.find(s => s.category.scrap_category_id === cat.scrap_category_id);
      if (existing) {
        return prev.map(s => s.category.scrap_category_id === cat.scrap_category_id ? { ...s, qty: s.qty + 1 } : s);
      }
      return [...prev, { category: cat, qty: 1, rate: Number(cat.selling_price) || 0 }];
    });
    setSellingSearch('');
    setSellingResults([]);
  };

  const handleRecordSales = async () => {
    if (sellingSelected.length === 0) return;
    setSellingProcessing(true);
    let successCount = 0;
    for (const entry of sellingSelected) {
      if (entry.qty <= 0 || entry.rate <= 0) continue;
      if (entry.qty > Number(entry.category.current_stock)) {
        setStatusMessage({ text: `Insufficient stock for ${entry.category.name}`, type: 'error' });
        setTimeout(() => setStatusMessage(null), 3000);
        continue;
      }
      if (window.electronAPI) {
        const res = await window.electronAPI.dbAddScrapTransaction({
          transaction_id: uuidv4(),
          tenant_id: tenantId,
          type: 'SALE',
          scrap_category_id: entry.category.scrap_category_id,
          quantity: entry.qty,
          rate: entry.rate,
          total_amount: entry.qty * entry.rate,
          party_name: '',
          notes: 'Direct scrap sale',
        });
        if (res.success) successCount++;
      }
    }
    if (successCount > 0) {
      setStatusMessage({ text: `${successCount} item(s) sold successfully!`, type: 'success' });
      setSellingSelected([]);
      await loadData();
    }
    setSellingProcessing(false);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPurchases = transactions.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + t.total_amount, 0);
  const totalSales = transactions.filter(t => t.type === 'SALE').reduce((s, t) => s + t.total_amount, 0);
  const profit = totalSales - totalPurchases;

  const totalStock = categories.reduce((s, c) => s + Number(c.current_stock), 0);
  const estimatedValue = categories.reduce((s, c) => s + Number(c.purchase_price) * Number(c.current_stock), 0);

  const formatCurrency = (amount: number | undefined | null) => amount == null || isNaN(amount) ? '-' : `\u20B9${amount.toFixed(2)}`;

  const handleReprintScrap = async () => {
    if (!selectedInvoiceNumber || invoiceDetailTxs.length === 0 || !window.electronAPI) return;
    try {
      const { tenantId } = useAuthStore.getState();
      const [shopAddr, shopPh, upi, showQr, shopGstin] = await Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
      ]);
      const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
      const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : receiptWidthCm;
      const thermalStyle = printFmt?.style || 'standard';

      const scrapItems = invoiceDetailTxs.map((tx: any) => ({
        name: tx.scrap_category_name || 'Unknown',
        quantity: Number(tx.quantity).toFixed(3),
        unit_price: Number(tx.rate),
        total: Number(tx.total_amount),
      }));

      const totalAmount = invoiceDetailTxs.reduce((sum: number, tx: any) => sum + Number(tx.total_amount), 0);

      const scrapBillSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.scrapBillSettings || {}) };
      const receiptData: ReceiptData = {
        shopName: scrapBillSettings.showShopName ? (useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: scrapBillSettings.showShopGstin ? (shopGstin || undefined) : undefined,
        shopAddress: scrapBillSettings.showShopAddress ? (shopAddr || undefined) : undefined,
        shopPhone: scrapBillSettings.showPhone ? (shopPh || undefined) : undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        invoiceNumber: selectedInvoiceNumber,
        invoiceType: 'SCRAP',
        date: new Date(invoiceDetailTxs[0]?.created_at || Date.now()).toLocaleString(),
        items: scrapItems,
        subtotal: totalAmount,
        tax: 0,
        discount: 0,
        grandTotal: totalAmount,
        isReprint: true,
        customerName: scrapBillSettings.showCustomerName ? (invoiceDetailTxs[0]?.party_name || undefined) : undefined,
        billSettings: scrapBillSettings,
      };

      const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
      await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
      setReprintSuccess(true);
    } catch (err) {
      console.error('Failed to reprint scrap invoice', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 shadow-inner animate-pulse">
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
    <>
      {reprintSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCheck className="w-4 h-4 shrink-0" />
          <span>Scrap invoice reprinted successfully!</span>
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 shadow-inner">
            {view === 'list' ? <Recycle className="w-5 h-5" /> : view === 'selling' ? <ShoppingCart className="w-5 h-5" /> : view === 'transaction' ? <TrendingUp className="w-5 h-5" /> : <Package className="w-5 h-5" />}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list' ? 'Scrap Management' : view === 'selling' ? 'Sell Scrap Items' : view === 'transaction' ? `Transactions — ${selectedCategory?.name}` : view === 'invoices' ? 'Scrap Invoices' : view === 'invoice_detail' ? `Invoice ${selectedInvoiceNumber}` : 'Scrap Management'}
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Active" />
            </div>
            {view === 'list' && (
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">{categories.length} categories</p>
            )}
            {view !== 'list' && (
              <span className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {useAuthStore.getState().role === 'OWNER' ? 'Owner' : (useAuthStore.getState().userName || 'Staff')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view === 'invoices' ? (
            <button onClick={() => setView('list')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Back to Scrap Management">
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : view === 'invoice_detail' ? (
            <button onClick={() => { loadInvoices(); setView('invoices'); }} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30" title="Back to Invoices">
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : view !== 'list' ? (
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
                placeholder="Search scrap categories..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-foreground transition-all shadow-sm placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { loadInvoices(); setView('invoices'); }}
              className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-orange-500/20 active:scale-95 cursor-pointer"
            >
              <Recycle className="w-4 h-4" /> Invoices
            </button>
            <button
              onClick={() => { setSellingSelected([]); setSellingSearch(''); setView('selling'); }}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-emerald-500/20 active:scale-95 cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" /> Sell Scrap
            </button>
            <button
              onClick={() => { setEditingCategory(null); setFormData({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' }); setShowCategoryForm(true); }}
              className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Category
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {/* ── ADD / EDIT CATEGORY MODAL ── */}
        {showCategoryForm && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
                <button onClick={() => { setShowCategoryForm(false); setEditingCategory(null); setFormData({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' }); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Category Name *</label>
                  <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground mb-1">Purchase Rate (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                      <input type="number" step="0.01" onWheel={e => (e.target as HTMLInputElement).blur()} value={formData.purchase_price} onChange={e => setFormData(p => ({ ...p, purchase_price: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all no-spinners text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground mb-1">Selling Rate (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                      <input type="number" step="0.01" onWheel={e => (e.target as HTMLInputElement).blur()} value={formData.selling_price} onChange={e => setFormData(p => ({ ...p, selling_price: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all no-spinners text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground mb-1">{editingCategory ? 'Current Stock' : 'Opening Stock'}</label>
                    <input type="number" step="0.001" onWheel={e => (e.target as HTMLInputElement).blur()} value={formData.current_stock} onChange={e => setFormData(p => ({ ...p, current_stock: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all no-spinners text-sm font-bold" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Unit</label>
                  <Select value={formData.unit} onChange={v => setFormData(p => ({ ...p, unit: v }))} options={[{value:'Kgs',label:'Kgs'},{value:'Pcs',label:'Pcs'},{value:'Grams',label:'Grams'},{value:'Ltrs',label:'Ltrs'}]} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60">
                <button onClick={() => { setShowCategoryForm(false); setEditingCategory(null); setFormData({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' }); }} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground border border-border/80 rounded-xl transition-colors cursor-pointer">Cancel</button>
                <button onClick={editingCategory ? handleUpdateCategory : handleAddCategory} disabled={!formData.name.trim()} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  <Save className="w-3.5 h-3.5" /> {editingCategory ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border/80 border-l-4 border-l-orange-500 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black">{categories.length}</span>
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                    <Recycle className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Scrap Categories</div>
              </div>
              <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-emerald-500">{isNaN(totalStock) ? '-' : `${totalStock.toFixed(1)}`}</span>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Total Stock</div>
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
            </div>

            {/* Table */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-6 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 bg-muted/40">
                <div className="col-span-3">Name</div>
                <div className="col-span-2 text-right">Purchase Rate</div>
                <div className="col-span-2 text-right">Selling Rate</div>
                <div className="col-span-2 text-right">Stock</div>
                <div className="col-span-1 text-center">Unit</div>
                <div className="col-span-2 text-center">Actions</div>
              </div>

              <div className="divide-y divide-border">
                {filteredCategories.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Recycle className="w-12 h-12 mb-3 text-orange-500/30" />
                    <p className="font-medium text-foreground">No scrap categories found</p>
                    <p className="text-sm mt-1">Click "Add Category" to get started</p>
                  </div>
                ) : filteredCategories.map(cat => (
                  <div key={cat.scrap_category_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border/40 hover:border-orange-500/30 hover:shadow-sm transition-all duration-150 group">
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
                          <Recycle className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-foreground font-bold text-sm">{cat.name}</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-right text-foreground font-semibold text-sm">{formatCurrency(cat.purchase_price)}</div>
                    <div className="col-span-2 text-right text-foreground font-semibold text-sm">{formatCurrency(cat.selling_price)}</div>
                    <div className="col-span-2 text-right">
                      {(() => { const stock = Number(cat.current_stock); if (isNaN(stock)) return <span className="text-muted-foreground text-sm font-semibold">-</span>; return <span className={clsx('font-bold text-sm', stock <= 0 ? 'text-destructive' : 'text-emerald-500')}>{stock.toFixed(1)} in stock</span>; })()}
                    </div>
                    <div className="col-span-1 text-center text-muted-foreground text-sm font-semibold">{cat.unit}</div>
                    <div className="col-span-2 flex items-center justify-center gap-1">
                      <button onClick={() => openTransaction(cat)} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90 cursor-pointer" title="Add Transaction">
                        <TrendingUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(cat)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90 cursor-pointer" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.scrap_category_id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90 cursor-pointer" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SELLING VIEW ── */}
        {view === 'selling' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full">
              {/* Section 1: Search & Select */}
              <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">1. Search &amp; Select Scrap Items</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={sellingSearch}
                    onChange={e => setSellingSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && sellingResults.length > 0) {
                        handleAddToSellingCart(sellingResults[0]);
                      }
                      if (e.key === 'Escape') { setSellingSearch(''); setSellingResults([]); }
                    }}
                    placeholder="Search scrap categories to sell..."
                    autoFocus
                    className="w-full bg-background border border-border/80 rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-all shadow-sm placeholder:text-muted-foreground/50"
                  />
                  {sellingResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="max-h-[240px] overflow-y-auto">
                        {sellingResults.map((s) => (
                          <button
                            key={s.scrap_category_id}
                            onClick={() => handleAddToSellingCart(s)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-emerald-500/5 border-b border-border/40 last:border-0 cursor-pointer"
                          >
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                              <Recycle className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-foreground truncate">{s.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Stock: <span className="font-semibold">{Number(s.current_stock).toFixed(1)} {s.unit} &middot; ₹{Number(s.selling_price).toFixed(2)}/{s.unit}</span>
                              </div>
                            </div>
                            <div className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                              + Add
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Section 2: Selected Items */}
              <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <ShoppingCart className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-wider">2. Sale Items ({sellingSelected.length})</span>
                  </div>
                  {sellingSelected.length > 0 && (
                    <button onClick={() => setSellingSelected([])} className="text-xs font-bold text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors cursor-pointer">Clear All</button>
                  )}
                </div>

                {sellingSelected.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <ShoppingCart className="w-10 h-10 mb-3 text-muted-foreground/30" />
                    <p className="font-medium text-foreground">No items selected</p>
                    <p className="text-sm mt-1">Search and add scrap categories above</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {sellingSelected.map((entry, idx) => {
                      const stockNum = Number(entry.category.current_stock);
                      return (
                        <div key={entry.category.scrap_category_id} className="flex items-center gap-3 p-3 bg-muted/20 border border-border/60 rounded-xl group hover:border-indigo-500/30 transition-all duration-150">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-foreground truncate">{entry.category.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Stock: <span className={clsx('font-semibold', stockNum <= 0 ? 'text-destructive' : 'text-emerald-500')}>{stockNum.toFixed(1)} {entry.category.unit}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5 bg-background border border-border/80 rounded-lg p-0.5 shadow-sm">
                              <button onClick={() => { setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: Math.max(0.1, s.qty - 0.1) } : s)); }} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all active:scale-90 cursor-pointer">
                                <Minus className="w-3 h-3" />
                              </button>
                              <input type="number" min="0.1" step="0.1" value={entry.qty} onChange={e => { const val = e.target.value === '' ? 0.1 : Number(e.target.value); setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: val } : s)); }} className="w-14 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                              <button onClick={() => { setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: s.qty + 0.1 } : s)); }} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all active:scale-90 cursor-pointer">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="relative w-20">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                              <input type="number" min="0" step="0.01" value={entry.rate} onChange={e => { const val = e.target.value === '' ? 0 : Number(e.target.value); setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, rate: val } : s)); }} className="w-full bg-background border border-border/80 rounded-lg pl-6 pr-2 py-1.5 text-sm font-bold text-right text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>

                            <div className="text-right min-w-[70px]">
                              <div className="font-black text-sm text-indigo-500">₹{(entry.qty * entry.rate).toFixed(2)}</div>
                            </div>

                            <button onClick={() => setSellingSelected(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Section 3: Summary & Confirm */}
              <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-amber-500 uppercase tracking-wider">3. Sale Summary</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Sale Amount</span>
                    <div className="text-2xl font-black text-foreground mt-0.5">
                      {formatCurrency(sellingSelected.reduce((sum, s) => sum + s.qty * s.rate, 0))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setView('list')} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border/80 rounded-xl transition-colors active:scale-95 cursor-pointer">Cancel</button>
                    <button onClick={handleRecordSales} disabled={sellingSelected.length === 0 || sellingProcessing} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-indigo-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                      {sellingProcessing ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</>
                      ) : (
                        <><ShoppingCart className="w-4 h-4" /> Complete Sale</>
                      )}
                    </button>
                  </div>
                </div>

                {statusMessage && (
                  <div className={clsx("mt-3 px-4 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200", statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive")}>
                    {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span className="flex-1">{statusMessage.text}</span>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ── INVOICES LIST VIEW ── */}
        {view === 'invoices' && (
          <div className="space-y-4">
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 bg-muted/40">
                <div className="col-span-2">Invoice No.</div>
                <div className="col-span-2">Customer</div>
                <div className="col-span-2 text-center">Date</div>
                <div className="col-span-1 text-center">Items</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Total Amount</div>
                <div className="col-span-1 text-center">Action</div>
              </div>
              <div className="divide-y divide-border">
                {invoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Recycle className="w-12 h-12 mb-3 text-orange-500/30" />
                    <p className="font-medium text-foreground">No scrap invoices found</p>
                    <p className="text-sm mt-1">Complete a scrap purchase from billing to see it here</p>
                  </div>
                ) : invoices.map((inv: any) => (
                  <div key={inv.invoice_number} className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border/40 hover:border-orange-500/30 hover:shadow-sm transition-all duration-150 group">
                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
                          <Recycle className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-sm text-foreground truncate">{inv.invoice_number}</span>
                      </div>
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground font-semibold truncate">
                      {inv.party_name || '-'}
                    </div>
                    <div className="col-span-2 text-center text-xs text-muted-foreground font-semibold">
                      {new Date(inv.created_at).toLocaleDateString('en-IN')}
                    </div>
                    <div className="col-span-1 text-center font-bold text-sm text-foreground">
                      {inv.item_count}
                    </div>
                    <div className="col-span-2 text-right font-bold text-sm text-foreground">
                      {Number(inv.total_qty || 0).toFixed(3)} <span className="text-muted-foreground text-xs font-semibold">{inv.units || 'Kgs'}</span>
                    </div>
                    <div className="col-span-2 text-right font-bold text-sm text-orange-600">
                      {formatCurrency(inv.total_amount)}
                    </div>
                    <div className="col-span-1 text-center">
                      <button
                        onClick={() => openInvoiceDetail(inv.invoice_number)}
                        className="px-3 py-1.5 text-xs font-bold text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── INVOICE DETAIL VIEW ── */}
        {view === 'invoice_detail' && (
          <div className="space-y-4">
            {invoiceDetailTxs.length > 0 && (
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Amount</p>
                  <p className="text-2xl font-black text-orange-500 mt-1">
                    {formatCurrency(invoiceDetailTxs.reduce((sum: number, tx: any) => sum + tx.total_amount, 0))}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Invoice</p>
                    <p className="text-sm font-bold text-foreground mt-1">{selectedInvoiceNumber}</p>
                    {invoiceDetailTxs[0]?.party_name && (
                      <p className="text-xs font-semibold text-foreground/70 mt-0.5">{invoiceDetailTxs[0].party_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{invoiceDetailTxs.reduce((sum: number, tx: any) => sum + Number(tx.quantity), 0).toFixed(3)} {invoiceDetailTxs[0]?.unit || 'Kgs'} &middot; {invoiceDetailTxs.length} item(s)</p>
                  </div>
                  <button
                    onClick={handleReprintScrap}
                    disabled={invoiceDetailTxs.length === 0}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-sm font-bold border border-primary/20 hover:border-primary/30 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Reprint
                  </button>
                </div>
              </div>
            )}

            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border/60 bg-muted/40">
                <div className="col-span-4">Category</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-3 text-right">Total</div>
                <div className="col-span-1 text-center">Date</div>
              </div>
              <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                {invoiceDetailTxs.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">No transactions found</div>
                ) : invoiceDetailTxs.map((tx: any) => (
                  <div key={tx.transaction_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm bg-card hover:bg-muted/20 transition-colors">
                    <div className="col-span-4 font-bold text-foreground/90 truncate">{tx.scrap_category_name || 'Unknown'}</div>
                    <div className="col-span-2 text-right font-semibold">{Number(tx.quantity).toFixed(3)} <span className="text-muted-foreground text-xs">{tx.unit || 'Kgs'}</span></div>
                    <div className="col-span-2 text-right font-semibold">{formatCurrency(tx.rate)}</div>
                    <div className="col-span-3 text-right font-bold text-orange-600">{formatCurrency(tx.total_amount)}</div>
                    <div className="col-span-1 text-center text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('en-IN')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TRANSACTION VIEW ── */}
        {view === 'transaction' && selectedCategory && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Transaction Form */}
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border border-border/80 border-l-4 border-l-orange-500 rounded-xl p-4 shadow-sm">
                  <div className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">Stock</div>
                  <div className="text-xl font-black mt-1">{Number(selectedCategory.current_stock).toFixed(1)} {selectedCategory.unit}</div>
                </div>
                <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-sm">
                  <div className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">Purchase Rate</div>
                  <div className="text-xl font-black mt-1 text-emerald-500">{formatCurrency(selectedCategory.purchase_price)}</div>
                </div>
                <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-sm">
                  <div className="text-sm text-muted-foreground font-semibold uppercase tracking-wider">Selling Rate</div>
                  <div className="text-xl font-black mt-1 text-blue-500">{formatCurrency(selectedCategory.selling_price)}</div>
                </div>
              </div>

              <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm">
                <div className="flex bg-muted rounded-lg p-0.5 mb-4">
                  <button onClick={() => setTxForm(p => ({ ...p, type: 'PURCHASE' }))} className={clsx('flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer', txForm.type === 'PURCHASE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    <TrendingUp className="w-4 h-4 text-emerald-500" /> Purchase
                  </button>
                  <button onClick={() => setTxForm(p => ({ ...p, type: 'SALE' }))} className={clsx('flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer', txForm.type === 'SALE' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    <TrendingDown className="w-4 h-4 text-red-500" /> Sale
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Quantity ({selectedCategory.unit})</label>
                    <input type="number" step="0.001" onWheel={e => (e.target as HTMLInputElement).blur()} value={txForm.quantity} onChange={e => setTxForm(p => ({ ...p, quantity: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Rate (₹)</label>
                    <input type="number" step="0.01" onWheel={e => (e.target as HTMLInputElement).blur()} value={txForm.rate} onChange={e => setTxForm(p => ({ ...p, rate: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Name</label>
                    <input type="text" value={txForm.party_name} onChange={e => setTxForm(p => ({ ...p, party_name: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
                    <input type="text" value={txForm.notes} onChange={e => setTxForm(p => ({ ...p, notes: e.target.value }))} className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
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

                <button onClick={handleAddTransaction} className="w-full mt-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm border border-primary/10 active:scale-95 cursor-pointer">
                  <Save className="w-4 h-4" /> Record {txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'}
                </button>
              </div>
            </div>

            {/* Right: Transaction History */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-500" />
                  Transaction History
                </h2>
                <button onClick={() => loadTransactions(selectedCategory.scrap_category_id)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all active:scale-90 cursor-pointer" title="Refresh">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

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
                      <div className="col-span-1 text-right font-semibold text-sm">{tx.quantity.toFixed(3)}</div>
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
    </>
  );
}
