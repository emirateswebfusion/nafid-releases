import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useCartStore } from '../../store/cartStore';
import { parseUTCDate } from '../../utils/receiptGenerator';
import { Loader2, Plus, Trash, Trash2, RefreshCw, AlertCircle, ShoppingCart, Package, CheckCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { RedCrossButton } from '../ui/RedCrossButton';
import { FloatToast } from '../ui/FloatToast';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { getUpiPageConfig, DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../../utils/upiConfig';
import { hasBridge, isDesktopRuntime } from '../../data/client';
import { paymentSourcesApi } from '../../data/paymentSources';
import { scrapApi } from '../../data/scrap';
import { type View, type ScrapCategory, type ScrapTransaction } from './scrapTypes';
import { formatStock } from './scrapFormat';
import { AddInvoiceItemDialog } from './views/AddInvoiceItemDialog';
import { EditInvoiceHeaderDialog } from './views/EditInvoiceHeaderDialog';
import { EditScrapTxDialog } from './views/EditScrapTxDialog';
import { ScrapInvoiceDetailView } from './views/ScrapInvoiceDetailView';
import { ScrapInvoicesView } from './views/ScrapInvoicesView';
import { ScrapSellingView } from './views/ScrapSellingView';
import { ScrapTxForm } from './views/ScrapTxForm';
import { ScrapTransactionsView } from './views/ScrapTransactionsView';
import { ScrapCategoryForm } from './views/ScrapCategoryForm';
import { ScrapCategoryList } from './views/ScrapCategoryList';
import type { ScrapInvoiceRow, ScrapInvoiceTxRow, ScrapUpiSourceRow } from './scrapTypes';
import { useScrapInvoiceActions } from './hooks/useScrapInvoiceActions';
import { useScrapStockActions } from './hooks/useScrapStockActions';

export function ScrapManager({ onClose, initialView, isRestricted: _isRestricted }: { onClose: () => void; initialView?: View; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId, userId: _userId, userName: _userName, role: _role } = useAuthStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  // Enable edit and delete features in Scrap Manager
  const isOwner = true;

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
  const [invoices, setInvoices] = useState<ScrapInvoiceRow[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState<string>('');
  const [invoiceDetailTxs, setInvoiceDetailTxs] = useState<ScrapInvoiceTxRow[]>([]);
  const [reprintSuccess, setReprintSuccess] = useState(false);

  // Edit Line Item Modal state
  const [editingTxItem, setEditingTxItem] = useState<ScrapInvoiceTxRow | null>(null);
  const [editTxForm, setEditTxForm] = useState({
    scrap_category_id: '',
    quantity: '',
    rate: '',
    party_name: '',
    notes: '',
  });

  // Confirm delete transaction & invoice state
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [confirmDeleteInvoiceNumber, setConfirmDeleteInvoiceNumber] = useState<string | null>(null);
  const [deleteCatModalOpen, setDeleteCatModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ScrapCategory | null>(null);
  const [deleteCatSaving, setDeleteCatSaving] = useState(false);

  // Edit Invoice Header state
  const [editHeaderInvoice, setEditHeaderInvoice] = useState<ScrapInvoiceRow | null>(null);
  const [editHeaderForm, setEditHeaderForm] = useState({
    party_name: '',
    customer_phone: '',
    customer_address: '',
    payment_status: 'CASH',
  });
  const [isSavingHeader, setIsSavingHeader] = useState(false);

  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [upiSources, setUpiSources] = useState<ScrapUpiSourceRow[]>([]);
  const [scrapUpiSourceId, setScrapUpiSourceId] = useState<string>('');

  // Add Item to existing Invoice state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [addItemForm, setAddItemForm] = useState({
    categoryId: '',
    quantity: '',
    rate: '',
    notes: '',
  });
  const [isAddingItemSaving, setIsAddingItemSaving] = useState(false);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  useEffect(() => {
    loadData();
    if (initialView === 'invoices') loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialView selects the mount-time view, while loadData and loadInvoices are the corresponding one-time requests.
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      if (isDesktopRuntime()) {
        const tid = tenantId || '';
        await scrapApi.deduplicateScrapCategories();
        const cats = await scrapApi.getScrapCategories(tid);
        if (Array.isArray(cats)) {
          setCategories(cats);
          const currentCatId = selectedCategory?.scrap_category_id;
          if (currentCatId) {
            const updated = cats.find(c => c.scrap_category_id === currentCatId);
            if (updated) setSelectedCategory(updated);
          }
        }
        getUpiPageConfig(tid || 'global').then(setUpiPageConfig);
        if (hasBridge('dbPaymentGetSources')) {
          paymentSourcesApi.getSources(tid || 'global').then((sources) => {
            if (Array.isArray(sources)) {
              setUpiSources(sources.filter((s) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[ScrapManager] Failed to load data:', err);
    }
    setLoading(false);
  }

  const loadTransactions = async (categoryId?: string) => {
    if (isDesktopRuntime()) {
      const txs = await scrapApi.getScrapTransactions({ tenant_id: tenantId || '', scrap_category_id: categoryId });
      if (Array.isArray(txs)) setTransactions(txs);
    }
  };

  async function loadInvoices() {
    if (isDesktopRuntime()) {
      const invs = await scrapApi.getScrapInvoiceList({ tenant_id: tenantId || '' });
      if (Array.isArray(invs)) setInvoices(invs);
    }
  }

  const openInvoiceDetail = async (invoiceNumber: string) => {
    setSelectedInvoiceNumber(invoiceNumber);
    if (isDesktopRuntime()) {
      const detail = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: invoiceNumber }) as import('../../data/scrap').ScrapInvoiceDetails | null;
      if (detail && detail.transactions) setInvoiceDetailTxs(detail.transactions);
    }
    setView('invoice_detail');
  };

  const resetCategoryForm = () => {
    setFormData({ name: '', purchase_price: '', selling_price: '', current_stock: '', unit: 'Kgs' });
    setEditingCategory(null);
  };

  const { handleSaveCategory, handleSaveTransaction, handleRecordSales } = useScrapStockActions({
    editingCategory, formData, isOwner, loadData, loadTransactions, resetCategoryForm, selectedCategory,
    sellingSelected, setIsSavingCategory, setIsSavingTx, setSellingProcessing, setSellingSelected, setView,
    showStatus, tenantId, txForm,
  });

  const handleDeleteCategory = (cat: ScrapCategory) => {
    if (!isOwner) { showStatus('Only owners/admins can delete categories', 'error'); return; }
    setCategoryToDelete(cat);
    setDeleteCatModalOpen(true);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete || !isOwner) return;
    setDeleteCatSaving(true);
    try {
      await scrapApi.deleteScrapCategory(categoryToDelete.scrap_category_id);
      showStatus('Category deleted', 'success');
      setCategories(prev => prev.filter(c => c.scrap_category_id !== categoryToDelete.scrap_category_id));
      setDeleteCatModalOpen(false);
      setCategoryToDelete(null);
    } catch {
      showStatus('Delete failed', 'error');
    } finally {
      setDeleteCatSaving(false);
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
    if (sellingSearch.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sellingSearch dropping below two characters clears stale category suggestions immediately.
      setSellingResults([]);
      return;
    }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const res = await scrapApi.getScrapCategoriesBySearch({ tenant_id: tenantId || '', search: sellingSearch });
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

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>(
      '[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const { handleReprintScrap, handleSaveEditTx, handleSaveInvoiceHeader, handleAddLineItemToInvoice } = useScrapInvoiceActions({
    addItemForm, categories, editHeaderForm, editHeaderInvoice, editingTxItem, editTxForm, invoiceDetailTxs,
    loadData, loadInvoices, loadTransactions, openInvoiceDetail, selectedCategory, selectedInvoiceNumber,
    setAddItemForm, setEditHeaderInvoice, setEditingTxItem, setEditTxForm, setInvoiceDetailTxs, setIsAddingItem,
    setIsAddingItemSaving, setIsSavingHeader, setIsSavingTx, setReprintSuccess, showStatus, tenantId, view,
  });

  const handleStartEditTx = (tx: ScrapInvoiceTxRow) => {
    setEditingTxItem(tx);
    setEditTxForm({
      scrap_category_id: tx.scrap_category_id || '',
      quantity: String(tx.quantity || ''),
      rate: String(tx.rate || ''),
      party_name: tx.party_name || '',
      notes: tx.notes || '',
    });
  };

  const handleDeleteTx = async (transactionId: string) => {
    if (!isOwner) { showStatus('Only owners/admins can delete transactions', 'error'); return; }
    try {
      const res = await scrapApi.deleteScrapTransaction({ tenant_id: tenantId || '', transaction_id: transactionId });
      if (res.success) {
        showStatus('Transaction line item deleted', 'success');
        setConfirmDeleteTxId(null);
        if (selectedInvoiceNumber) {
          const detail = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: selectedInvoiceNumber }) as import('../../data/scrap').ScrapInvoiceDetails | null;
          if (detail && detail.transactions) {
            if (detail.transactions.length === 0) {
              setView('invoices');
              await loadInvoices();
            } else {
              setInvoiceDetailTxs(detail.transactions);
            }
          }
        } else if (selectedCategory) {
          await loadTransactions(selectedCategory.scrap_category_id);
        }
        await loadInvoices();
        await loadData();
      } else {
        showStatus(res.error || 'Delete failed', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    }
  };

  const handleDeleteInvoice = async (invoiceNumber: string) => {
    if (!isOwner) { showStatus('Only owners/admins can delete invoices', 'error'); return; }
    try {
      const res = await scrapApi.deleteScrapInvoice({ tenant_id: tenantId || '', scrap_invoice_number: invoiceNumber });
      if (res.success) {
        showStatus(`Scrap invoice ${invoiceNumber} deleted successfully`, 'success');
        setConfirmDeleteInvoiceNumber(null);
        if (view === 'invoice_detail') {
          setView('invoices');
        }
        await loadInvoices();
        await loadData();
      } else {
        showStatus(res.error || 'Delete failed', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    }
  };

  const handleEditInvoiceInBilling = (invoiceNumber: string) => {
    useCartStore.getState().setPendingScrapInvoiceToEdit(invoiceNumber);
    useCartStore.getState().setRole('BILLER');
    useCartStore.getState().setReturnMode(false);
    useCartStore.getState().setQuotationMode(false);
    useCartStore.getState().setIsScrapMode(true);
    window.dispatchEvent(new CustomEvent('edit-scrap-invoice', { detail: { invoiceNumber } }));
    onClose();
  };

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredInvoices = invoices.filter(inv => {
    const q = invoiceSearch.toLowerCase().trim();
    if (q) {
      const matchesSearch = (
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
        (inv.party_name && inv.party_name.toLowerCase().includes(q)) ||
        (inv.customer_phone && inv.customer_phone.toLowerCase().includes(q)) ||
        (inv.customer_address && inv.customer_address.toLowerCase().includes(q))
      );
      if (!matchesSearch) return false;
    }

    if (invoiceDateFrom) {
      const from = new Date(invoiceDateFrom);
      from.setHours(0, 0, 0, 0);
      const to = new Date(invoiceDateTo || invoiceDateFrom);
      to.setHours(23, 59, 59, 999);
      const d = inv.created_at ? parseUTCDate(inv.created_at) : null;
      if (!d || isNaN(d.getTime()) || d < from || d > to) return false;
    } else if (invoiceDateTo) {
      const to = new Date(invoiceDateTo);
      to.setHours(23, 59, 59, 999);
      const d = inv.created_at ? parseUTCDate(inv.created_at) : null;
      if (!d || isNaN(d.getTime()) || d > to) return false;
    }

    return true;
  });

  const totalStock = categories.reduce((s, c) => s + Number(c.current_stock), 0);
  const estimatedValue = categories.reduce((s, c) => s + Number(c.purchase_price) * Number(c.current_stock), 0);

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
              <Trash2 className="w-5 h-5" />
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
                <Trash2 className="w-4 h-4" />
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
                  ? `${transactions.length} transactions · Stock: ${formatStock(selectedCategory.current_stock)} ${selectedCategory.unit}`
                  : view === 'category_form'
                  ? 'Fill in the details below'
                  : view === 'tx_form'
                  ? `Recording for ${selectedCategory?.name}`
                  : view === 'selling'
                  ? 'Multi-item scrap sale'
                  : view === 'invoices'
                  ? `${filteredInvoices.length} ${filteredInvoices.length === 1 ? 'invoice' : 'invoices'} · Edit and manage scrap bills`
                  : view === 'invoice_detail'
                  ? `${invoiceDetailTxs.length} line items in this invoice`
                  : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
                    setTxForm({ type: 'PURCHASE', categoryId: selectedCategory?.scrap_category_id || '', quantity: '', rate: selectedCategory ? String(selectedCategory.purchase_price) : '', party_name: '', notes: '' });
                    setView('tx_form');
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Tx
                </button>
              )}

              <RedCrossButton
                onClick={
                  view === 'list' ? onClose 
                  : view === 'transaction' ? () => setView('list') 
                  : view === 'category_form' ? () => setView('list') 
                  : view === 'tx_form' ? () => { setView('transaction'); if (selectedCategory) loadTransactions(selectedCategory.scrap_category_id); } 
                  : view === 'selling' ? () => setView('list') 
                  : view === 'invoice_detail' ? () => { setEditingTxItem(null); setConfirmDeleteTxId(null); setConfirmDeleteInvoiceNumber(null); loadInvoices(); setView('invoices'); } 
                  : view === 'invoices' ? () => { setConfirmDeleteInvoiceNumber(null); setView('list'); } 
                  : () => setView('list')
                }
                title="Close"
              />
            </div>
          </div>
        </header>

        {view === 'list' && (
          <ScrapCategoryList
            categories={categories} estimatedValue={estimatedValue} filteredCategories={filteredCategories}
            handleDeleteCategory={handleDeleteCategory} isOwner={isOwner} loading={loading}
            loadTransactions={loadTransactions} search={search} setEditingCategory={setEditingCategory}
            setFormData={setFormData} setSearch={setSearch} setSelectedCategory={setSelectedCategory} setView={setView}
            totalStock={totalStock}
          />
        )}

        {/* ══════════════════════════════════════════
            CATEGORY FORM VIEW
        ══════════════════════════════════════════ */}
        {view === 'category_form' && (
          <ScrapCategoryForm
            editingCategory={editingCategory} fieldCls={fieldCls} formData={formData}
            handleFormKeyDown={handleFormKeyDown} handleSaveCategory={handleSaveCategory}
            isSavingCategory={isSavingCategory} setFormData={setFormData}
          />
        )}

        {/* ══════════════════════════════════════════
            TRANSACTION VIEW (Ledger)
        ══════════════════════════════════════════ */}
        {view === 'transaction' && selectedCategory && (
          <ScrapTransactionsView
            handleStartEditTx={handleStartEditTx} isDark={isDark} isOwner={isOwner} realizedProfit={realizedProfit}
            selectedCategory={selectedCategory} setConfirmDeleteTxId={setConfirmDeleteTxId} setTxForm={setTxForm}
            setView={setView} transactions={transactions}
          />
        )}

        {/* ══════════════════════════════════════════
            TX FORM VIEW
        ══════════════════════════════════════════ */}
        {view === 'tx_form' && selectedCategory && (
          <ScrapTxForm
            fieldCls={fieldCls} handleFormKeyDown={handleFormKeyDown} handleSaveTransaction={handleSaveTransaction}
            isSavingTx={isSavingTx} selectedCategory={selectedCategory} setTxForm={setTxForm} txForm={txForm}
          />
        )}

        {/* ══════════════════════════════════════════
            SELLING VIEW
        ══════════════════════════════════════════ */}
        {view === 'selling' && (
          <ScrapSellingView
            fieldCls={fieldCls} handleAddToSellingCart={handleAddToSellingCart} handleFormKeyDown={handleFormKeyDown}
            handleRecordSales={handleRecordSales} sellingProcessing={sellingProcessing} sellingResults={sellingResults}
            sellingSearch={sellingSearch} sellingSelected={sellingSelected} setSellingResults={setSellingResults}
            setSellingSearch={setSellingSearch} setSellingSelected={setSellingSelected}
          />
        )}

        {/* ══════════════════════════════════════════
            INVOICES VIEW
        ══════════════════════════════════════════ */}
        {view === 'invoices' && (
          <ScrapInvoicesView
            filteredInvoices={filteredInvoices} handleEditInvoiceInBilling={handleEditInvoiceInBilling}
            invoiceDateFrom={invoiceDateFrom} invoiceDateTo={invoiceDateTo} invoiceSearch={invoiceSearch}
            isOwner={isOwner} openInvoiceDetail={openInvoiceDetail}
            setConfirmDeleteInvoiceNumber={setConfirmDeleteInvoiceNumber} setInvoiceDateFrom={setInvoiceDateFrom}
            setInvoiceDateTo={setInvoiceDateTo} setInvoiceSearch={setInvoiceSearch}
          />
        )}

        {/* ══════════════════════════════════════════
            INVOICE DETAIL VIEW
        ══════════════════════════════════════════ */}
        {view === 'invoice_detail' && (
          <ScrapInvoiceDetailView
            handleEditInvoiceInBilling={handleEditInvoiceInBilling} handleReprintScrap={handleReprintScrap}
            handleStartEditTx={handleStartEditTx} invoiceDetailTxs={invoiceDetailTxs} isOwner={isOwner}
            selectedInvoiceNumber={selectedInvoiceNumber} setConfirmDeleteInvoiceNumber={setConfirmDeleteInvoiceNumber}
            setConfirmDeleteTxId={setConfirmDeleteTxId} setIsAddingItem={setIsAddingItem}
          />
        )}
      </div>

      {/* ══════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════ */}

      {/* 1. Delete Invoice Confirmation Modal */}
      {confirmDeleteInvoiceNumber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2.5 rounded-xl bg-destructive/10">
                <Trash className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Delete Scrap Invoice</h3>
                <p className="text-xs text-muted-foreground">Invoice #{confirmDeleteInvoiceNumber}</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to delete this scrap invoice? This action will permanently remove the invoice and restore inventory stock for all included scrap categories.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => handleDeleteInvoice(confirmDeleteInvoiceNumber)}
                className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Delete Single Line Item Confirmation Modal */}
      {confirmDeleteTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2.5 rounded-xl bg-destructive/10">
                <Trash className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Delete Scrap Item</h3>
                <p className="text-xs text-muted-foreground">Line item from invoice</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Delete this line item? Stock will be restored to the category, and line total will be subtracted from this invoice.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => handleDeleteTx(confirmDeleteTxId)}
                className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Delete Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Edit Line Item Modal */}
      {editingTxItem && (
        <EditScrapTxDialog
          categories={categories} editTxForm={editTxForm} fieldCls={fieldCls} handleFormKeyDown={handleFormKeyDown}
          handleSaveEditTx={handleSaveEditTx} isSavingTx={isSavingTx} setEditingTxItem={setEditingTxItem}
          setEditTxForm={setEditTxForm}
        />
      )}

      {/* 4. Edit Invoice Header Modal */}
      {editHeaderInvoice && (
        <EditInvoiceHeaderDialog
          editHeaderForm={editHeaderForm} editHeaderInvoice={editHeaderInvoice} fieldCls={fieldCls}
          handleFormKeyDown={handleFormKeyDown} handleSaveInvoiceHeader={handleSaveInvoiceHeader}
          isSavingHeader={isSavingHeader} scrapUpiSourceId={scrapUpiSourceId} setEditHeaderForm={setEditHeaderForm}
          setEditHeaderInvoice={setEditHeaderInvoice} setScrapUpiSourceId={setScrapUpiSourceId}
          upiPageConfig={upiPageConfig} upiSources={upiSources}
        />
      )}

      {/* 5. Add Line Item to Invoice Modal */}
      {isAddingItem && (
        <AddInvoiceItemDialog
          addItemForm={addItemForm} categories={categories} fieldCls={fieldCls}
          handleAddLineItemToInvoice={handleAddLineItemToInvoice} handleFormKeyDown={handleFormKeyDown}
          isAddingItemSaving={isAddingItemSaving} selectedInvoiceNumber={selectedInvoiceNumber}
          setAddItemForm={setAddItemForm} setIsAddingItem={setIsAddingItem}
        />
      )}

      {/* Delete Category Confirmation Modal */}
      <Modal
        isOpen={deleteCatModalOpen}
        onClose={() => { if (!deleteCatSaving) { setDeleteCatModalOpen(false); setCategoryToDelete(null); } }}
        closeButton={null}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span>Delete Scrap Category</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[400px] text-foreground">
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Are you sure?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This will permanently delete scrap category <strong>"{categoryToDelete?.name}"</strong>.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={confirmDeleteCategory}
              disabled={deleteCatSaving}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              {deleteCatSaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Delete Category</>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} />
    </>
  );
}
