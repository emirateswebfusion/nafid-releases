import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, type ReceiptData } from '../utils/receiptGenerator';
import {
  Search, Loader2, Plus,
  Pencil, Trash, X, Save, TrendingUp, TrendingDown, Recycle,
  CheckCircle2, AlertCircle, ShoppingCart, Minus, Package,
  IndianRupee, Printer, CheckCheck, Recycle as RecycleIcon,
  ChevronRight, Activity,
} from 'lucide-react';
import { Select } from './ui/Select';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Skeleton } from './ui/Skeleton';

type View = 'list' | 'category_form' | 'transaction' | 'tx_form' | 'selling' | 'invoices' | 'invoice_detail';

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

const formatCurrency = (amount: number | undefined | null) =>
  amount == null || isNaN(amount) ? '-' : `\u20B9${amount.toFixed(2)}`;

const formatDate = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (d: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const nameToHue = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

export function ScrapManager({ onClose, initialView, isRestricted }: { onClose: () => void; initialView?: View; isRestricted?: boolean }) {
  const { tenantId, userId, userName, role } = useAuthStore();
  const isOwner = role === 'OWNER';

  const [view, setView] = useState<View>(initialView || 'list');
  const [categories, setCategories] = useState<ScrapCategory[]>([]);
  const [transactions, setTransactions] = useState<ScrapTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ScrapCategory | null>(null);
  const [search, setSearch] = useState('');

  const [editingCategory, setEditingCategory] = useState<ScrapCategory | null>(null);
  const [formData, setFormData] = useState({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' });
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [txForm, setTxForm] = useState({
    type: 'PURCHASE' as 'PURCHASE' | 'SALE',
    categoryId: '',
    quantity: '',
    rate: '',
    party_name: '',
    notes: '',
  });
  const [isSavingTx, setIsSavingTx] = useState(false);

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

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  useEffect(() => {
    loadData();
    if (initialView === 'invoices') loadInvoices();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const tid = tenantId || '';
        await window.electronAPI.dbDeduplicateScrapCategories();
        const cats = await window.electronAPI.dbGetScrapCategories(tid);
        if (Array.isArray(cats)) {
          setCategories(cats);
          const currentCatId = selectedCategory?.scrap_category_id;
          if (currentCatId) {
            const updated = cats.find(c => c.scrap_category_id === currentCatId);
            if (updated) setSelectedCategory(updated);
          }
        }
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

  const resetCategoryForm = () => {
    setFormData({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' });
    setEditingCategory(null);
  };

  const handleSaveCategory = async () => {
    if (!formData.name.trim()) { showStatus('Category name is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage categories', 'error'); return; }
    setIsSavingCategory(true);
    try {
      if (editingCategory) {
        const res = await window.electronAPI.dbUpdateScrapCategory({
          scrap_category_id: editingCategory.scrap_category_id,
          name: formData.name.trim(),
          purchase_price: Number(formData.purchase_price) || 0,
          selling_price: Number(formData.selling_price) || 0,
          current_stock: Number(formData.current_stock) || 0,
          unit: formData.unit || 'Kgs',
        });
        if (res.success) {
          showStatus('Category updated successfully', 'success');
        } else {
          showStatus(res.error || 'Update failed', 'error');
          return;
        }
      } else {
        const res = await window.electronAPI.dbAddScrapCategory({
          scrap_category_id: uuidv4(),
          tenant_id: tenantId,
          name: formData.name.trim(),
          purchase_price: Number(formData.purchase_price) || 0,
          selling_price: Number(formData.selling_price) || 0,
          current_stock: Number(formData.current_stock) || 0,
          unit: formData.unit || 'Kgs',
        });
        if (res.success) {
          showStatus('Category created successfully', 'success');
        } else {
          showStatus(res.error || 'Create failed', 'error');
          return;
        }
      }
      await loadData();
      setView('list');
      resetCategoryForm();
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: ScrapCategory) => {
    if (!isOwner) { showStatus('Only owners can delete categories', 'error'); return; }
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await window.electronAPI.dbDeleteScrapCategory(cat.scrap_category_id);
      showStatus('Category deleted', 'success');
      setCategories(prev => prev.filter(c => c.scrap_category_id !== cat.scrap_category_id));
    } catch {
      showStatus('Delete failed', 'error');
    }
  };

  const openTransaction = (cat: ScrapCategory) => {
    setSelectedCategory(cat);
    setTxForm({ type: 'PURCHASE', categoryId: cat.scrap_category_id, quantity: '', rate: '', party_name: '', notes: '' });
    setView('transaction');
    loadTransactions(cat.scrap_category_id);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;
    if (!txForm.quantity || !txForm.rate) { showStatus('Quantity and Rate required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage transactions', 'error'); return; }

    const qty = Number(txForm.quantity);
    const rate = Number(txForm.rate);
    if (txForm.type === 'SALE' && qty > Number(selectedCategory.current_stock)) {
      showStatus('Insufficient stock', 'error'); return;
    }

    setIsSavingTx(true);
    try {
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
        showStatus(`${txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'} recorded`, 'success');
        await loadTransactions(txForm.categoryId);
        await loadData();
        setView('transaction');
      } else {
        showStatus(res.error || 'Failed', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
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
        showStatus(`Insufficient stock for ${entry.category.name}`, 'error');
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
      showStatus(`${successCount} item(s) sold successfully!`, 'success');
      setSellingSelected([]);
      await loadData();
    }
    setSellingProcessing(false);
  };

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

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalStock = categories.reduce((s, c) => s + Number(c.current_stock), 0);
  const estimatedValue = categories.reduce((s, c) => s + Number(c.purchase_price) * Number(c.current_stock), 0);

  const totalPurchases = transactions.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + t.total_amount, 0);
  const totalSales = transactions.filter(t => t.type === 'SALE').reduce((s, t) => s + t.total_amount, 0);
  const realizedProfit = transactions
    .filter(t => t.type === 'SALE')
    .reduce((sum, t) => sum + (Number(t.rate) - Number(selectedCategory?.purchase_price || 0)) * Number(t.quantity), 0);

  const fieldCls = "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
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
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
      <div className="fixed inset-0 z-40 flex flex-col bg-background">

        {/* ══════════════════════════════════════════
            HEADER
        ══════════════════════════════════════════ */}
        <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 px-5 py-3">

            {view === 'list' && (
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 shadow-inner shrink-0">
                <Recycle className="w-4 h-4" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">
                  {view === 'list' ? 'Scrap Management'
                    : view === 'category_form' ? (editingCategory ? 'Edit Category' : 'New Category')
                    : view === 'transaction' && selectedCategory ? selectedCategory.name
                    : view === 'tx_form' ? (txForm.type === 'PURCHASE' ? 'Record Purchase' : 'Record Sale')
                    : view === 'selling' ? 'Sell Scrap Items'
                    : view === 'invoices' ? 'Scrap Invoices'
                    : view === 'invoice_detail' ? `Invoice ${selectedInvoiceNumber}`
                    : 'Scrap'}
                </h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {view === 'list'
                  ? `${categories.length} ${categories.length === 1 ? 'category' : 'categories'} · Track scrap stock & value`
                  : view === 'transaction' && selectedCategory
                  ? `${transactions.length} transactions · Stock: ${Number(selectedCategory.current_stock).toFixed(1)} ${selectedCategory.unit}`
                  : view === 'category_form'
                  ? 'Fill in the details below'
                  : view === 'tx_form'
                  ? `Recording for ${selectedCategory?.name}`
                  : view === 'selling'
                  ? 'Multi-item scrap sale'
                  : view === 'invoices'
                  ? `${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'}`
                  : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {statusMessage && (
                <span className={clsx(
                  'hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg animate-in fade-in duration-200',
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-destructive/10 text-destructive'
                )}>
                  {statusMessage.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {statusMessage.text}
                </span>
              )}

              {view === 'list' && (
                <>
                  <button
                    onClick={() => { loadInvoices(); setView('invoices'); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer border border-orange-500/20"
                  >
                    <Package className="w-3.5 h-3.5" /> Invoices
                  </button>
                  <button
                    onClick={() => { setSellingSelected([]); setSellingSearch(''); setView('selling'); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer border border-emerald-500/20"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" /> Sell
                  </button>
                  <button
                    onClick={() => { resetCategoryForm(); setView('category_form'); }}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Category
                  </button>
                </>
              )}

              {view === 'transaction' && (
                <button
                  onClick={() => {
                    setTxForm({ type: 'PURCHASE', categoryId: selectedCategory?.scrap_category_id || '', quantity: '', rate: '', party_name: '', notes: '' });
                    setView('tx_form');
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Tx
                </button>
              )}

              <button
                onClick={view === 'list' ? onClose : view === 'transaction' ? () => setView('list') : view === 'category_form' ? () => setView('list') : view === 'tx_form' ? () => { setView('transaction'); if (selectedCategory) loadTransactions(selectedCategory.scrap_category_id); } : view === 'selling' ? () => setView('list') : view === 'invoice_detail' ? () => { loadInvoices(); setView('invoices'); } : view === 'invoices' ? () => setView('list') : () => setView('list')}
                className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>
          </div>
        </header>

        {/* ══════════════════════════════════════════
            LIST VIEW
        ══════════════════════════════════════════ */}
        {view === 'list' && (
          <div className="flex flex-col flex-1 min-h-0">

            {/* Gradient stats */}
            <div className="shrink-0 px-5 py-3 border-b border-border bg-background">
              <div className="grid grid-cols-3 gap-3">
                <div className="relative overflow-hidden rounded-xl p-4 shadow-sm" style={{ background: 'linear-gradient(135deg,#f97316 0%,#ea580c 100%)' }}>
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
                  <div className="absolute right-3 top-3 p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.22)' }}>
                    <Recycle className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-white/70 mb-1.5">Categories</p>
                  <p className="text-xl font-black text-white leading-none">{categories.length}</p>
                  <p className="text-[11px] text-white/60 mt-1.5 font-medium">Scrap types tracked</p>
                </div>

                <div className="relative overflow-hidden rounded-xl p-4 shadow-sm" style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)' }}>
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
                  <div className="absolute right-3 top-3 p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.22)' }}>
                    <Package className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-white/70 mb-1.5">Total Stock</p>
                  <p className="text-xl font-black text-white leading-none">{isNaN(totalStock) ? '-' : `${totalStock.toFixed(1)}`}</p>
                  <p className="text-[11px] text-white/60 mt-1.5 font-medium">Units in inventory</p>
                </div>

                <div className="relative overflow-hidden rounded-xl p-4 shadow-sm" style={{ background: 'linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)' }}>
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
                  <div className="absolute right-3 top-3 p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.22)' }}>
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-white/70 mb-1.5">Est. Value</p>
                  <p className="text-xl font-black text-white leading-none">{formatCurrency(estimatedValue)}</p>
                  <p className="text-[11px] text-white/60 mt-1.5 font-medium">At purchase rate</p>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="shrink-0 px-5 py-3 border-b border-border bg-background">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search scrap categories..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={clsx(fieldCls, 'pl-10')}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category list */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                    <RecycleIcon className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">
                      {search ? 'No results found' : 'No scrap categories yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {search ? `No categories match "${search}"` : 'Add your first category to start tracking scrap'}
                    </p>
                  </div>
                  {!search && isOwner && (
                    <button
                      onClick={() => { resetCategoryForm(); setView('category_form'); }}
                      className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Add First Category
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCategories.map(cat => {
                    const hue = nameToHue(cat.name);
                    const stock = Number(cat.current_stock);
                    const outOfStock = stock <= 0;
                    return (
                      <div
                        key={cat.scrap_category_id}
                        className="group flex items-center gap-3.5 p-3.5 rounded-xl border border-border bg-card hover:border-orange-500/30 hover:shadow-md hover:shadow-orange-500/5 transition-all duration-200 cursor-pointer"
                        onClick={() => openTransaction(cat)}
                      >
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-sm shadow-inner select-none"
                          style={{ background: `hsl(${hue}, 65%, 52%)` }}
                        >
                          {getInitials(cat.name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-foreground truncate">{cat.name}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-medium">
                            <span className="flex items-center gap-1">
                              <Package className="w-3 h-3" />{stock.toFixed(1)} {cat.unit}
                            </span>
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />Buy: {formatCurrency(cat.purchase_price)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={clsx(
                            'text-base font-black leading-none',
                            outOfStock ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'
                          )}>
                            {formatCurrency(cat.selling_price)}
                          </p>
                          <span className={clsx(
                            'inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md',
                            outOfStock
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                          )}>
                            {outOfStock ? 'Out of Stock' : `${stock.toFixed(1)} ${cat.unit}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={e => e.stopPropagation()}>
                          {isOwner && (
                            <button
                              onClick={() => {
                                setEditingCategory(cat);
                                setFormData({
                                  name: cat.name,
                                  purchase_price: cat.purchase_price.toString(),
                                  selling_price: cat.selling_price.toString(),
                                  current_stock: cat.current_stock.toString(),
                                  unit: cat.unit || 'Kgs',
                                });
                                setView('category_form');
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-95 cursor-pointer"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isOwner && (
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 cursor-pointer"
                              title="Delete"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-0.5" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            CATEGORY FORM VIEW
        ══════════════════════════════════════════ */}
        {view === 'category_form' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                    <Recycle className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-orange-500">Category Identity</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Iron Scrap"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className={fieldCls}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Unit</label>
                    <Select
                      value={formData.unit}
                      onChange={v => setFormData(f => ({ ...f, unit: v }))}
                      options={[
                        { value: 'Kgs', label: 'Kgs' },
                        { value: 'Pcs', label: 'Pcs' },
                        { value: 'Grams', label: 'Grams' },
                        { value: 'Ltrs', label: 'Ltrs' },
                      ]}
                    />
                  </div>
                </div>
              </section>

              <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Pricing & Stock</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase Rate (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.purchase_price}
                        onChange={e => setFormData(f => ({ ...f, purchase_price: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={clsx(fieldCls, 'pl-8 no-spinners')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Selling Rate (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.selling_price}
                        onChange={e => setFormData(f => ({ ...f, selling_price: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={clsx(fieldCls, 'pl-8 no-spinners')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{editingCategory ? 'Current Stock' : 'Opening Stock'}</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0"
                      value={formData.current_stock}
                      onChange={e => setFormData(f => ({ ...f, current_stock: e.target.value }))}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className={clsx(fieldCls, 'no-spinners')}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="shrink-0 border-t border-border bg-card px-5 py-3">
              {statusMessage && (
                <div className={clsx(
                  'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold mb-3 animate-in fade-in duration-200',
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-600'
                )}>
                  {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                  {statusMessage.text}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setView('list'); resetCategoryForm(); }}
                  className="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-sm font-bold text-foreground transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingCategory}
                  onClick={handleSaveCategory}
                  className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  {isSavingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSavingCategory ? 'Saving…' : editingCategory ? 'Update Category' : 'Create Category'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TRANSACTION VIEW (like Ledger)
        ══════════════════════════════════════════ */}
        {view === 'transaction' && selectedCategory && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">

            {/* Category Banner */}
            <div
              className="shrink-0 px-5 py-4 border-b border-border"
              style={{ background: `linear-gradient(135deg, hsl(${nameToHue(selectedCategory.name)},60%,96%) 0%, hsl(${nameToHue(selectedCategory.name)},40%,98%) 100%)` }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md shrink-0 select-none"
                  style={{ background: `linear-gradient(135deg, hsl(${nameToHue(selectedCategory.name)},65%,50%), hsl(${nameToHue(selectedCategory.name)},65%,40%))` }}
                >
                  {getInitials(selectedCategory.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                      <TrendingUp className="w-3 h-3" /> Buy: {formatCurrency(selectedCategory.purchase_price)}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                      Sell: {formatCurrency(selectedCategory.selling_price)}
                    </span>
                    {totalSales > 0 && (
                      <span className={clsx(
                        'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg',
                        realizedProfit >= 0
                          ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                          : 'text-red-700 bg-red-50 border border-red-200'
                      )}>
                        {realizedProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        Profit: {formatCurrency(realizedProfit)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium mt-1.5">
                    {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
                  </p>
                </div>

                {/* Stock Pill */}
                <div className={clsx(
                  'shrink-0 text-right px-4 py-3 rounded-2xl shadow-sm',
                  Number(selectedCategory.current_stock) > 0
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground border border-border'
                )}>
                  <p className="text-xl font-black leading-none">
                    {Number(selectedCategory.current_stock).toFixed(1)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
                    {selectedCategory.unit}
                  </p>
                </div>
              </div>
            </div>

            {/* Transaction entries */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                    <Activity className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">No transactions yet</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Add the first transaction to start tracking</p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => {
                        setTxForm({ type: 'PURCHASE', categoryId: selectedCategory.scrap_category_id, quantity: '', rate: '', party_name: '', notes: '' });
                        setView('tx_form');
                      }}
                      className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Add Transaction
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[...transactions].reverse().map((entry) => {
                    const isPurchase = entry.type === 'PURCHASE';
                    return (
                      <div
                        key={entry.transaction_id}
                        className={clsx(
                          'rounded-xl border bg-card shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md',
                          isPurchase ? 'border-emerald-200 dark:border-emerald-900/50' : 'border-red-200 dark:border-red-900/50'
                        )}
                      >
                        <div className={clsx('h-1 w-full', isPurchase ? 'bg-emerald-500' : 'bg-red-500')} />

                        <div className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className={clsx(
                                  'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg',
                                  isPurchase ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                                )}>
                                  {isPurchase ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  {isPurchase ? 'Purchase' : 'Sale'}
                                </span>
                                {entry.party_name && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-1 rounded-lg">
                                    {entry.party_name}
                                  </span>
                                )}
                              </div>

                              <p className="font-bold text-sm text-foreground leading-snug">
                                {entry.notes || `${entry.quantity.toFixed(3)} ${selectedCategory.unit} of ${entry.scrap_category_name || selectedCategory.name}`}
                              </p>

                              <div className="flex items-center gap-3 mt-2 flex-wrap">
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                  {formatDateTime(entry.created_at)}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-medium">
                                  {entry.quantity.toFixed(3)} {selectedCategory.unit} × ₹{entry.rate.toFixed(2)}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-end gap-1.5">
                              <p className={clsx(
                                'text-xl font-black leading-none',
                                isPurchase ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                              )}>
                                {isPurchase ? '+' : '−'}₹{entry.total_amount.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TX FORM VIEW
        ══════════════════════════════════════════ */}
        {view === 'tx_form' && selectedCategory && (
          <form onSubmit={handleSaveTransaction} className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Activity className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-primary">Transaction Details</span>
                  <span className="ml-auto text-xs text-muted-foreground font-medium">
                    Category: <span className="font-bold text-foreground">{selectedCategory.name}</span>
                  </span>
                </div>

                {/* Type selector */}
                <div className="mb-5">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Transaction Type</label>
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    <button
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, type: 'PURCHASE' }))}
                      className={clsx(
                        'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                        txForm.type === 'PURCHASE'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <TrendingUp className="w-4 h-4" /> Purchase
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, type: 'SALE' }))}
                      className={clsx(
                        'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                        txForm.type === 'SALE'
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <TrendingDown className="w-4 h-4" /> Sale
                    </button>
                  </div>
                </div>

                {/* Quantity + Rate */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Quantity ({selectedCategory.unit}) *</label>
                    <input
                      required
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="0.000"
                      value={txForm.quantity}
                      onChange={e => setTxForm(f => ({ ...f, quantity: e.target.value }))}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className={clsx(fieldCls, 'no-spinners text-lg font-black')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Rate (₹) *</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={txForm.rate}
                        onChange={e => setTxForm(f => ({ ...f, rate: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={clsx(fieldCls, 'pl-8 no-spinners text-lg font-black')}
                      />
                    </div>
                  </div>
                </div>

                {/* Party + Notes */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party / Customer</label>
                    <input
                      type="text"
                      placeholder="Party name (optional)"
                      value={txForm.party_name}
                      onChange={e => setTxForm(f => ({ ...f, party_name: e.target.value }))}
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
                    <input
                      type="text"
                      placeholder="Optional notes"
                      value={txForm.notes}
                      onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))}
                      className={fieldCls}
                    />
                  </div>
                </div>

                {/* Total preview */}
                {txForm.quantity && txForm.rate && Number(txForm.quantity) > 0 && Number(txForm.rate) > 0 && (
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground font-semibold">Total Amount</span>
                      <span className={clsx(
                        'text-xl font-black',
                        txForm.type === 'PURCHASE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                      )}>
                        {(Number(txForm.quantity) * Number(txForm.rate)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="shrink-0 border-t border-border bg-card px-5 py-3">
              {statusMessage && (
                <div className={clsx(
                  'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold mb-3 animate-in fade-in duration-200',
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-600'
                )}>
                  {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                  {statusMessage.text}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground font-medium">
                  Current Stock: <span className="font-bold text-foreground">{Number(selectedCategory.current_stock).toFixed(1)} {selectedCategory.unit}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setView('transaction'); if (selectedCategory) loadTransactions(selectedCategory.scrap_category_id); }}
                    className="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-sm font-bold text-foreground transition-all active:scale-95 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTx}
                    className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    {isSavingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSavingTx ? 'Saving…' : `Record ${txForm.type === 'PURCHASE' ? 'Purchase' : 'Sale'}`}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* ══════════════════════════════════════════
            SELLING VIEW
        ══════════════════════════════════════════ */}
        {view === 'selling' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Section 1: Search & Select */}
              <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">1. Search & Select Scrap Items</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={sellingSearch}
                    onChange={e => setSellingSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && sellingResults.length > 0) handleAddToSellingCart(sellingResults[0]);
                      if (e.key === 'Escape') { setSellingSearch(''); setSellingResults([]); }
                    }}
                    placeholder="Search scrap categories to sell..."
                    autoFocus
                    className={clsx(fieldCls, 'pl-10')}
                  />
                  {sellingResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="max-h-[240px] overflow-y-auto">
                        {sellingResults.map((s) => (
                          <button
                            key={s.scrap_category_id}
                            onClick={() => handleAddToSellingCart(s)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-emerald-500/5 border-b border-border last:border-0 cursor-pointer"
                          >
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                              <Recycle className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-foreground truncate">{s.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Stock: <span className="font-semibold">{Number(s.current_stock).toFixed(1)} {s.unit} · ₹{Number(s.selling_price).toFixed(2)}/{s.unit}</span>
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
              <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <ShoppingCart className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-wider">2. Sale Items ({sellingSelected.length})</span>
                  </div>
                  {sellingSelected.length > 0 && (
                    <button onClick={() => setSellingSelected([])} className="text-xs font-bold text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors cursor-pointer">
                      Clear All
                    </button>
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
                        <div key={entry.category.scrap_category_id} className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-xl group hover:border-indigo-500/30 transition-all duration-150">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-foreground truncate">{entry.category.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Stock: <span className={clsx('font-semibold', stockNum <= 0 ? 'text-destructive' : 'text-emerald-500')}>{stockNum.toFixed(1)} {entry.category.unit}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5 bg-background border border-border rounded-lg p-0.5 shadow-sm">
                              <button
                                onClick={() => setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: Math.max(0.1, s.qty - 0.1) } : s))}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all active:scale-90 cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="0.1"
                                step="0.1"
                                value={entry.qty}
                                onChange={e => { const val = e.target.value === '' ? 0.1 : Number(e.target.value); setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: val } : s)); }}
                                className="w-14 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                onClick={() => setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, qty: s.qty + 0.1 } : s))}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-all active:scale-90 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="relative w-20">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={entry.rate}
                                onChange={e => { const val = e.target.value === '' ? 0 : Number(e.target.value); setSellingSelected(prev => prev.map((s, i) => i === idx ? { ...s, rate: val } : s)); }}
                                className="w-full bg-background border border-border rounded-lg pl-6 pr-2 py-1.5 text-sm font-bold text-right text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>

                            <div className="text-right min-w-[70px]">
                              <div className="font-black text-sm text-indigo-500">₹{(entry.qty * entry.rate).toFixed(2)}</div>
                            </div>

                            <button
                              onClick={() => setSellingSelected(prev => prev.filter((_, i) => i !== idx))}
                              className="p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                            >
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
              <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
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
                    <button
                      onClick={() => setView('list')}
                      className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors active:scale-95 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRecordSales}
                      disabled={sellingSelected.length === 0 || sellingProcessing}
                      className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm border border-indigo-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {sellingProcessing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                      ) : (
                        <><ShoppingCart className="w-4 h-4" /> Complete Sale</>
                      )}
                    </button>
                  </div>
                </div>

                {statusMessage && (
                  <div className={clsx("mt-3 px-4 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200",
                    statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
                  )}>
                    {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span className="flex-1">{statusMessage.text}</span>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            INVOICES VIEW
        ══════════════════════════════════════════ */}
        {view === 'invoices' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
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
                  ) : invoices.map((inv: any) => {
                    const units = inv.units || 'Kgs';
                    const hasMixedUnits = units.includes(',');
                    return (
                    <div key={inv.invoice_number} className="grid grid-cols-12 gap-2 px-4 py-3 items-center bg-card border-b border-border hover:border-orange-500/30 hover:shadow-sm transition-all duration-150 group">
                      <div className="col-span-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
                            <Recycle className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-bold text-sm text-foreground truncate">{inv.invoice_number}</span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground font-semibold truncate">{inv.party_name || '-'}</div>
                        {(inv.customer_phone || inv.customer_address) && (
                          <div className="text-[9px] text-muted-foreground/60 truncate mt-0.5">
                            {[inv.customer_phone, inv.customer_address].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 text-center text-xs text-muted-foreground font-semibold">
                        {new Date(inv.created_at).toLocaleDateString('en-IN')}
                      </div>
                      <div className="col-span-1 text-center font-bold text-sm text-foreground">{inv.item_count}</div>
                      <div className="col-span-2 text-right font-bold text-sm text-foreground">
                        {hasMixedUnits ? (
                          <span className="text-muted-foreground text-xs font-semibold italic">Mixed units</span>
                        ) : (
                          <>{Number(inv.total_qty || 0).toFixed(3)} <span className="text-muted-foreground text-xs font-semibold">{units}</span></>
                        )}
                      </div>
                      <div className="col-span-2 text-right font-bold text-sm text-orange-600">{formatCurrency(inv.total_amount)}</div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={() => openInvoiceDetail(inv.invoice_number)}
                          className="px-3 py-1.5 text-xs font-bold text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                        >
                          View
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            INVOICE DETAIL VIEW
        ══════════════════════════════════════════ */}
        {view === 'invoice_detail' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
                      {(invoiceDetailTxs[0]?.customer_phone || invoiceDetailTxs[0]?.customer_address) && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {[invoiceDetailTxs[0].customer_phone, invoiceDetailTxs[0].customer_address].filter(Boolean).join(', ')}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(() => {
                          const allUnits = [...new Set(invoiceDetailTxs.map((tx: any) => tx.unit || 'Kgs'))];
                          const totalQty = invoiceDetailTxs.reduce((sum: number, tx: any) => sum + Number(tx.quantity), 0);
                          if (allUnits.length === 1) return `${totalQty.toFixed(3)} ${allUnits[0]} · ${invoiceDetailTxs.length} item(s)`;
                          return `${invoiceDetailTxs.length} item(s)`;
                        })()}
                      </p>
                    </div>
                    <button
                      onClick={handleReprintScrap}
                      disabled={invoiceDetailTxs.length === 0}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all text-sm font-bold border border-primary/20 hover:border-primary/30 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Printer className="w-3.5 h-3.5" /> Reprint
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
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
                      <div className="col-span-2 text-right font-semibold">
                        {Number(tx.quantity).toFixed(3)} <span className="text-muted-foreground text-xs">{tx.unit || 'Kgs'}</span>
                      </div>
                      <div className="col-span-2 text-right font-semibold">{formatCurrency(tx.rate)}</div>
                      <div className="col-span-3 text-right font-bold text-orange-600">{formatCurrency(tx.total_amount)}</div>
                      <div className="col-span-1 text-center text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

