import React, { useState, useEffect, Fragment } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData, getAppTimeFormat, parseUTCDate } from '../utils/receiptGenerator';
import {
  Search, Loader2, Plus,
  Pencil, Trash, Trash2, X, Save, TrendingUp, TrendingDown, Recycle,
  CheckCircle2, AlertCircle, ShoppingCart, Minus, Package,
  IndianRupee, Printer, CheckCheck, Recycle as RecycleIcon,
  ChevronRight, Activity, FileText, Layers
} from 'lucide-react';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Select } from './ui/Select';
import { DateRangeFilter } from './ui/DateRangeFilter';
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

const _formatDate = (d: string) => {
  if (!d) return '—';
  return parseUTCDate(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (d: string) => {
  if (!d) return '—';
  return parseUTCDate(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
};

const formatGroupDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const d = parseUTCDate(dateStr);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const dayName = d.toLocaleDateString('en-IN', { weekday: 'long' });
  return `${dd}/${mm}/${yyyy} ${dayName}`;
};

const nameToHue = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

export function ScrapManager({ onClose, initialView, isRestricted: _isRestricted }: { onClose: () => void; initialView?: View; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId, userId: _userId, userName: _userName, role: _role } = useAuthStore();
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
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState<string>('');
  const [invoiceDetailTxs, setInvoiceDetailTxs] = useState<any[]>([]);
  const [reprintSuccess, setReprintSuccess] = useState(false);

  // Edit Line Item Modal state
  const [editingTxItem, setEditingTxItem] = useState<any | null>(null);
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

  // Edit Invoice Header state
  const [editHeaderInvoice, setEditHeaderInvoice] = useState<any | null>(null);
  const [editHeaderForm, setEditHeaderForm] = useState({
    party_name: '',
    customer_phone: '',
    customer_address: '',
    payment_status: 'CASH',
  });
  const [isSavingHeader, setIsSavingHeader] = useState(false);

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
    if (!isOwner) { showStatus('Only owners/admins can manage categories', 'error'); return; }
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
    if (!isOwner) { showStatus('Only owners/admins can delete categories', 'error'); return; }
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
    setTxForm({ type: 'PURCHASE', categoryId: cat.scrap_category_id, quantity: '', rate: String(cat.purchase_price), party_name: '', notes: '' });
    setView('transaction');
    loadTransactions(cat.scrap_category_id);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;
    if (!txForm.quantity || !txForm.rate) { showStatus('Quantity and Rate required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners/admins can manage transactions', 'error'); return; }

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

  const handleReprintScrap = async () => {
    if (!selectedInvoiceNumber || invoiceDetailTxs.length === 0 || !window.electronAPI) return;
    try {
      const { tenantId } = useAuthStore.getState();
      const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin] = await Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }),
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
        shopName: scrapBillSettings.showShopName ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: scrapBillSettings.showShopGstin ? (shopGstin || undefined) : undefined,
        shopAddress: scrapBillSettings.showShopAddress ? (shopAddr || undefined) : undefined,
        shopPhone: scrapBillSettings.showPhone ? (shopPh || undefined) : undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        invoiceNumber: selectedInvoiceNumber,
        invoiceType: 'SCRAP',
        date: formatBillDateTime(invoiceDetailTxs[0]?.created_at || Date.now()),
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

  const handleStartEditTx = (tx: any) => {
    setEditingTxItem(tx);
    setEditTxForm({
      scrap_category_id: tx.scrap_category_id || '',
      quantity: String(tx.quantity || ''),
      rate: String(tx.rate || ''),
      party_name: tx.party_name || '',
      notes: tx.notes || '',
    });
  };

  const handleSaveEditTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxItem) return;
    if (!editTxForm.quantity || !editTxForm.rate) { showStatus('Quantity and Rate are required', 'error'); return; }
    setIsSavingTx(true);
    try {
      const res = await window.electronAPI.dbUpdateScrapTransaction({
        transaction_id: editingTxItem.transaction_id,
        tenant_id: tenantId,
        scrap_category_id: editTxForm.scrap_category_id,
        quantity: Number(editTxForm.quantity),
        rate: Number(editTxForm.rate),
        party_name: editTxForm.party_name,
        notes: editTxForm.notes,
      });
      if (res.success) {
        showStatus('Line item updated successfully', 'success');
        setEditingTxItem(null);
        setEditTxForm({ scrap_category_id: '', quantity: '', rate: '', party_name: '', notes: '' });
        if (selectedInvoiceNumber) {
          const detail = await window.electronAPI.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: selectedInvoiceNumber });
          if (detail && detail.transactions) setInvoiceDetailTxs(detail.transactions);
        } else if (selectedCategory) {
          await loadTransactions(selectedCategory.scrap_category_id);
        }
        await loadInvoices();
        await loadData();
      } else {
        showStatus(res.error || 'Update failed', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  const handleDeleteTx = async (transactionId: string) => {
    if (!isOwner) { showStatus('Only owners/admins can delete transactions', 'error'); return; }
    try {
      const res = await window.electronAPI.dbDeleteScrapTransaction({ tenant_id: tenantId || '', transaction_id: transactionId });
      if (res.success) {
        showStatus('Transaction line item deleted', 'success');
        setConfirmDeleteTxId(null);
        if (selectedInvoiceNumber) {
          const detail = await window.electronAPI.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: selectedInvoiceNumber });
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
      const res = await window.electronAPI.dbDeleteScrapInvoice({ tenant_id: tenantId || '', scrap_invoice_number: invoiceNumber });
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

  const _handleOpenEditHeader = (inv: any) => {
    setEditHeaderInvoice(inv);
    setEditHeaderForm({
      party_name: inv.party_name || '',
      customer_phone: inv.customer_phone || '',
      customer_address: inv.customer_address || '',
      payment_status: inv.payment_status || 'CASH',
    });
  };

  const handleSaveInvoiceHeader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHeaderInvoice || !window.electronAPI) return;
    setIsSavingHeader(true);
    try {
      const res = await window.electronAPI.dbUpdateScrapInvoiceHeader({
        tenant_id: tenantId || '',
        scrap_invoice_number: editHeaderInvoice.invoice_number || editHeaderInvoice.scrap_invoice_number,
        party_name: editHeaderForm.party_name,
        customer_phone: editHeaderForm.customer_phone,
        customer_address: editHeaderForm.customer_address,
        payment_status: editHeaderForm.payment_status,
      });
      if (res.success) {
        showStatus('Invoice customer info updated successfully', 'success');
        const invNum = editHeaderInvoice.invoice_number || editHeaderInvoice.scrap_invoice_number;
        await window.electronAPI.dbUpsertScrapCreditLedger({
          tenant_id: tenantId || '',
          scrap_invoice_number: invNum,
          payment_status: editHeaderForm.payment_status,
          party_name: editHeaderForm.party_name || null,
          customer_phone: editHeaderForm.customer_phone || null,
          customer_address: editHeaderForm.customer_address || null,
          user_id: undefined,
          user_name: undefined,
        }).catch(() => {});
        setEditHeaderInvoice(null);
        await loadInvoices();
        if (view === 'invoice_detail' && selectedInvoiceNumber === invNum) {
          await openInvoiceDetail(invNum);
        }
      } else {
        showStatus(res.error || 'Failed to update invoice info', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingHeader(false);
    }
  };

  const handleAddLineItemToInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceNumber || !addItemForm.categoryId || !addItemForm.quantity || !addItemForm.rate) {
      showStatus('Category, Quantity, and Rate are required', 'error');
      return;
    }
    const cat = categories.find(c => c.scrap_category_id === addItemForm.categoryId);
    if (!cat) {
      showStatus('Category not found', 'error');
      return;
    }
    const qty = Number(addItemForm.quantity);
    const rate = Number(addItemForm.rate);
    const firstTx = invoiceDetailTxs[0];

    setIsAddingItemSaving(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.dbAddScrapTransaction({
          transaction_id: uuidv4(),
          tenant_id: tenantId,
          type: 'PURCHASE',
          scrap_category_id: addItemForm.categoryId,
          quantity: qty,
          rate: rate,
          total_amount: qty * rate,
          party_name: firstTx?.party_name || '',
          customer_phone: firstTx?.customer_phone || '',
          customer_address: firstTx?.customer_address || '',
          notes: addItemForm.notes || 'Added line item',
          scrap_invoice_number: selectedInvoiceNumber,
          payment_status: firstTx?.payment_status || 'CASH',
        });
        if (res.success) {
          showStatus(`Added ${qty} ${cat.unit} of ${cat.name} to invoice`, 'success');
          await window.electronAPI.dbUpsertScrapCreditLedger({
            tenant_id: tenantId || '',
            scrap_invoice_number: selectedInvoiceNumber,
            payment_status: firstTx?.payment_status || 'CASH',
            party_name: firstTx?.party_name || null,
            customer_phone: firstTx?.customer_phone || null,
            customer_address: firstTx?.customer_address || null,
            user_id: undefined,
            user_name: undefined,
          }).catch(() => {});
          setIsAddingItem(false);
          setAddItemForm({ categoryId: '', quantity: '', rate: '', notes: '' });
          await openInvoiceDetail(selectedInvoiceNumber);
          await loadInvoices();
          await loadData();
        } else {
          showStatus(res.error || 'Failed to add line item', 'error');
        }
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsAddingItemSaving(false);
    }
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

  const _totalPurchases = transactions.filter(t => t.type === 'PURCHASE').reduce((s, t) => s + t.total_amount, 0);
  const _totalSales = transactions.filter(t => t.type === 'SALE').reduce((s, t) => s + t.total_amount, 0);
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
                  ? `${transactions.length} transactions · Stock: ${Number(selectedCategory.current_stock).toFixed(1)} ${selectedCategory.unit}`
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
              {statusMessage && (
                <span className={clsx(
                  'hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg animate-in fade-in duration-200',
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-destructive/10 text-destructive'
                )}>
                  {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
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
                    setTxForm({ type: 'PURCHASE', categoryId: selectedCategory?.scrap_category_id || '', quantity: '', rate: selectedCategory ? String(selectedCategory.purchase_price) : '', party_name: '', notes: '' });
                    setView('tx_form');
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Tx
                </button>
              )}

              <button
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
                className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>
          </div>
        </header>

        {view === 'list' && (
          <div className="flex-1 flex flex-col min-h-0 bg-background select-none max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
            {/* Themed stats cards */}
            <div className="grid grid-cols-3 gap-5 select-none shrink-0">
              <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
                <div className="p-3 bg-gradient-to-br from-orange-500/10 to-orange-500/5 text-orange-600 dark:text-orange-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <Recycle className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0 flex-1">
                  <p className="text-2xl font-black text-foreground font-mono truncate">{categories.length}</p>
                  <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Categories</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Scrap types tracked</p>
                </div>
              </div>

              <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
                <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0 flex-1">
                  <p className="text-2xl font-black text-foreground font-mono truncate">{isNaN(totalStock) ? '-' : `${totalStock.toFixed(1)}`}</p>
                  <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Stock</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Units in inventory</p>
                </div>
              </div>

              <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
                <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0 flex-1">
                  <p className="text-2xl font-black text-foreground font-mono truncate">{formatCurrency(estimatedValue)}</p>
                  <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Est. Value</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">At purchase rate</p>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 shrink-0 select-none">
              <div className="relative w-full sm:max-w-xs flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search scrap categories..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category list */}
            <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
              <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm p-6 flex-1 flex flex-col min-h-0">
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
                        onClick={() => {
                          setEditingCategory(null);
                          setFormData({
                            name: '',
                            purchase_price: '',
                            selling_price: '',
                            current_stock: '0',
                            unit: 'Kgs',
                          });
                          setView('category_form');
                        }}
                        className="inline-flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-sm hover:bg-primary/95 transition-all shadow-sm cursor-pointer active:scale-95 mt-2"
                      >
                        <Plus className="w-4 h-4" /> Add Category
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredCategories.map(cat => {
                      const stock = Number(cat.current_stock) || 0;
                      const outOfStock = stock <= 0;
                      return (
                        <div
                          key={cat.scrap_category_id}
                          onClick={() => {
                            setSelectedCategory(cat);
                            loadTransactions(cat.scrap_category_id);
                            setView('transaction');
                          }}
                          className="flex items-center justify-between p-4.5 rounded-3xl border border-border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-300 shadow-sm cursor-pointer group select-none animate-in fade-in duration-200"
                        >
                          <div className="flex items-center gap-3.5 flex-1 min-w-0">
                            <div
                              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-sm shadow-sm shrink-0 select-none group-hover:scale-105 transition-transform"
                              style={{ background: `linear-gradient(135deg, hsl(${nameToHue(cat.name)},60%,50%), hsl(${nameToHue(cat.name)},60%,40%))` }}
                            >
                              {getInitials(cat.name)}
                            </div>
                            <div className="min-w-0 flex-1 leading-tight text-left">
                              <p className="font-extrabold text-foreground truncate text-sm">{cat.name}</p>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/75 font-semibold mt-1 flex-wrap">
                                <span className="flex items-center gap-1">
                                  Buy: {formatCurrency(cat.purchase_price)}/{cat.unit || 'Kg'}
                                </span>
                                <span className="w-1.5 h-1.5 rounded-full bg-border" />
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                  Sell: {formatCurrency(cat.selling_price)}/{cat.unit || 'Kg'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <span className={clsx(
                                'inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-black border tracking-wide',
                                outOfStock
                                  ? 'bg-muted border-border text-muted-foreground'
                                  : 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            CATEGORY FORM VIEW
        ══════════════════════════════════════════ */}
        {view === 'category_form' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="flex-1 overflow-y-auto p-5 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
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
            TRANSACTION VIEW (Ledger)
        ══════════════════════════════════════════ */}
        {view === 'transaction' && selectedCategory && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
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
                    <span className={clsx(
                      'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg',
                      realizedProfit >= 0
                        ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                        : 'text-red-700 bg-red-50 border border-red-200'
                    )}>
                      {realizedProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      Profit: {formatCurrency(realizedProfit)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium mt-1.5">
                    {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
                  </p>
                </div>

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
                        setTxForm({ type: 'PURCHASE', categoryId: selectedCategory.scrap_category_id, quantity: '', rate: String(selectedCategory.purchase_price), party_name: '', notes: '' });
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
                              {isOwner && (
                                <div className="flex items-center gap-1 mt-1">
                                  <button
                                    onClick={() => handleStartEditTx(entry)}
                                    className="p-1 rounded text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer"
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteTxId(entry.transaction_id)}
                                    className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
                                    title="Delete"
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
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
            <div className="flex-1 overflow-y-auto p-5 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
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

                <div className="mb-5">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Transaction Type</label>
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    <button
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, type: 'PURCHASE', rate: selectedCategory ? String(selectedCategory.purchase_price) : f.rate }))}
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
                      onClick={() => setTxForm(f => ({ ...f, type: 'SALE', rate: selectedCategory ? String(selectedCategory.selling_price) : f.rate }))}
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
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
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
                      if (e.key === 'Enter' && sellingResults.length > 0) { handleAddToSellingCart(sellingResults[0]); e.preventDefault(); }
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
          <div className="flex-1 flex flex-col min-h-0 bg-background select-none max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
            {/* Themed stats cards */}
            <div className="grid grid-cols-3 gap-5 select-none shrink-0">
              <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
                <div className="p-3 bg-gradient-to-br from-orange-500/10 to-orange-500/5 text-orange-600 dark:text-orange-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0 flex-1">
                  <p className="text-2xl font-black text-foreground font-mono truncate">{filteredInvoices.length}</p>
                  <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Invoices</p>
                </div>
              </div>

              <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
                <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <IndianRupee className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0 flex-1">
                  <p className="text-2xl font-black text-foreground font-mono truncate">{formatCurrency(filteredInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0))}</p>
                  <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Scrap Value</p>
                </div>
              </div>

              <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
                <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
                <div className="leading-tight text-left min-w-0 flex-1">
                  <p className="text-2xl font-black text-foreground font-mono truncate">{filteredInvoices.reduce((s, inv) => s + Number(inv.item_count || 0), 0)}</p>
                  <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Items Collected</p>
                </div>
              </div>
            </div>

            {/* Filter / Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-start bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 shrink-0 select-none relative z-30">
              <div className="relative w-full sm:w-80 md:w-96 shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search invoice number, customer name, phone..."
                  value={invoiceSearch}
                  onChange={e => setInvoiceSearch(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
                />
                {invoiceSearch && (
                  <button
                    onClick={() => setInvoiceSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <DateRangeFilter
                  startDate={invoiceDateFrom}
                  endDate={invoiceDateTo}
                  align="left"
                  onChange={(start, end) => {
                    setInvoiceDateFrom(start);
                    setInvoiceDateTo(end);
                  }}
                />
              </div>
            </div>

            {/* Invoices List */}
            <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
              <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm p-6 flex-1 flex flex-col min-h-0">
                <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
                  <div className="col-span-3">Invoice & Customer</div>
                  <div className="col-span-2 text-center">Date & Status</div>
                  <div className="col-span-2 text-center">Items & Qty</div>
                  <div className="col-span-2 text-right">Total Amount</div>
                  <div className="col-span-3 text-center">Actions</div>
                </div>

                <div className="divide-y divide-border">
                  {filteredInvoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Recycle className="w-12 h-12 mb-3 text-orange-500/30" />
                      <p className="font-bold text-foreground text-base">
                        {(invoiceSearch || invoiceDateFrom || invoiceDateTo) ? 'No matching scrap invoices' : 'No scrap invoices found'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {(invoiceSearch || invoiceDateFrom || invoiceDateTo) ? 'No invoices match the applied search or date filters' : 'Scrap invoices from billing and purchases will appear here'}
                      </p>
                    </div>
                  ) : (
                    filteredInvoices.map((inv: any, idx: number) => {
                      const invDate = formatGroupDate(inv.created_at);
                      const prevDate = idx > 0 ? formatGroupDate(filteredInvoices[idx - 1].created_at) : null;
                      const showHeader = invDate !== prevDate;
                      const units = inv.units || 'Kgs';
                      const hasMixedUnits = units.includes(',');
                      return (
                        <Fragment key={inv.invoice_number}>
                          {showHeader && (
                            <div className="sticky top-0 z-10 bg-muted px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border">
                              {invDate}
                            </div>
                          )}
                        <div className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center hover:bg-muted/20 transition-all duration-150 group">
                          {/* Invoice & Customer */}
                          <div className="col-span-3 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
                                <Recycle className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm text-foreground truncate">{inv.invoice_number}</span>
                            </div>
                            <div className="text-xs font-semibold text-muted-foreground truncate mt-1">
                              {inv.party_name ? `Customer: ${inv.party_name}` : 'Walk-in Customer'}
                            </div>
                            {(inv.customer_phone || inv.customer_address) && (
                              <div className="text-[10px] text-muted-foreground/60 truncate">
                                {[inv.customer_phone, inv.customer_address].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>

                          {/* Date & Status */}
                          <div className="col-span-2 text-center">
                            <div className="text-xs font-semibold text-foreground">
                              {new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                            <span className={clsx('inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border',
                              inv.payment_status === 'CREDIT'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : inv.payment_status === 'PENDING'
                                  ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20')}>
                              {inv.payment_status === 'CREDIT' ? 'Credit' : (inv.payment_status || 'PAID')}
                            </span>
                          </div>

                          {/* Items & Qty */}
                          <div className="col-span-2 text-center">
                            <span className="font-bold text-sm text-foreground">{inv.item_count} {inv.item_count === 1 ? 'item' : 'items'}</span>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {hasMixedUnits ? (
                                <span className="italic">Mixed units</span>
                              ) : (
                                <>{Number(inv.total_qty || 0).toFixed(3)} {units}</>
                              )}
                            </div>
                          </div>

                          {/* Total Amount */}
                          <div className="col-span-2 text-right">
                            <span className="text-base font-black text-orange-600 dark:text-orange-400">
                              {formatCurrency(inv.total_amount)}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="col-span-3 flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openInvoiceDetail(inv.invoice_number)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-blue-500/20"
                              title="View Invoice Details & Line Items"
                            >
                              <FileText className="w-3.5 h-3.5" /> View
                            </button>
                            {isOwner && (
                              <button
                                onClick={() => handleEditInvoiceInBilling(inv.invoice_number)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-amber-500/20"
                                title="Edit Invoice in Billing Page"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                            )}
                            {isOwner && (
                              <button
                                onClick={() => setConfirmDeleteInvoiceNumber(inv.invoice_number)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-destructive/20"
                                title="Delete Invoice"
                              >
                                <Trash className="w-3.5 h-3.5" /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                        </Fragment>
                      );
                    })
                  )}
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
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500">
                        <Recycle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-black text-foreground">{selectedInvoiceNumber}</h2>
                          <span className={clsx('text-xs font-bold px-2.5 py-0.5 rounded-lg border',
                            invoiceDetailTxs[0]?.payment_status === 'CREDIT'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                              : invoiceDetailTxs[0]?.payment_status === 'PENDING'
                                ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20')}>
                            {invoiceDetailTxs[0]?.payment_status === 'CREDIT' ? 'Credit' : (invoiceDetailTxs[0]?.payment_status || 'PAID')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Created on {formatDateTime(invoiceDetailTxs[0]?.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Amount</p>
                      <p className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-0.5">
                        {formatCurrency(invoiceDetailTxs.reduce((sum: number, tx: any) => sum + Number(tx.total_amount || 0), 0))}
                      </p>
                    </div>
                  </div>

                  {/* Customer Info & Action Toolbar */}
                  <div className="flex items-center justify-between bg-muted/30 p-4 rounded-xl border border-border flex-wrap gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer / Party Details</span>
                      <p className="text-sm font-bold text-foreground mt-0.5">
                        {invoiceDetailTxs[0]?.party_name || 'Walk-in Customer'}
                      </p>
                      {(invoiceDetailTxs[0]?.customer_phone || invoiceDetailTxs[0]?.customer_address) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[invoiceDetailTxs[0].customer_phone, invoiceDetailTxs[0].customer_address].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isOwner && (
                        <button
                          onClick={() => handleEditInvoiceInBilling(selectedInvoiceNumber)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl text-xs font-bold border border-amber-500/20 transition-all active:scale-95 cursor-pointer"
                          title="Edit Scrap Invoice in Billing Page"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit Invoice
                        </button>
                      )}

                      {isOwner && (
                        <button
                          onClick={() => setIsAddingItem(true)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold border border-primary/20 transition-all active:scale-95 cursor-pointer"
                          title="Add line item to this invoice"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Item
                        </button>
                      )}

                      <button
                        onClick={handleReprintScrap}
                        disabled={invoiceDetailTxs.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 rounded-xl text-xs font-bold border border-blue-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                      >
                        <Printer className="w-3.5 h-3.5" /> Reprint
                      </button>

                      {isOwner && (
                        <button
                          onClick={() => setConfirmDeleteInvoiceNumber(selectedInvoiceNumber)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl text-xs font-bold border border-destructive/20 transition-all active:scale-95 cursor-pointer"
                          title="Delete entire invoice"
                        >
                          <Trash className="w-3.5 h-3.5" /> Delete Invoice
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Items Table */}
              <div className="border border-border rounded-2xl overflow-hidden shadow-sm bg-card">
                <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
                  <div className="col-span-3">Category</div>
                  <div className="col-span-2 text-right">Quantity</div>
                  <div className="col-span-2 text-right">Rate per Unit</div>
                  <div className="col-span-2 text-right">Line Total</div>
                  <div className="col-span-1 text-center">Date</div>
                  {isOwner && <div className="col-span-2 text-center">Actions</div>}
                </div>
                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {invoiceDetailTxs.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">No transactions found</div>
                  ) : invoiceDetailTxs.map((tx: any) => (
                    <div key={tx.transaction_id} className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center text-sm bg-card hover:bg-muted/20 transition-colors group">
                      <div className="col-span-3 font-bold text-foreground/90 truncate">{tx.scrap_category_name || 'Unknown'}</div>
                      <div className="col-span-2 text-right font-semibold">
                        {Number(tx.quantity).toFixed(3)} <span className="text-muted-foreground text-xs">{tx.unit || 'Kgs'}</span>
                      </div>
                      <div className="col-span-2 text-right font-semibold">{formatCurrency(tx.rate)}</div>
                      <div className="col-span-2 text-right font-bold text-orange-600 dark:text-orange-400">{formatCurrency(tx.total_amount)}</div>
                      <div className="col-span-1 text-center text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('en-IN')}</div>
                      {isOwner && (
                        <div className="col-span-2 text-center flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleStartEditTx(tx)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-blue-500/20"
                            title="Edit item"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => setConfirmDeleteTxId(tx.transaction_id)}
                            className="p-1.5 rounded-xl text-destructive hover:bg-destructive/10 transition-all active:scale-95 cursor-pointer border border-destructive/20"
                            title="Delete item"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
                onClick={() => setConfirmDeleteInvoiceNumber(null)}
                className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
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
                onClick={() => setConfirmDeleteTxId(null)}
                className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <form onSubmit={handleSaveEditTx} className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Edit Scrap Line Item</h3>
                  <p className="text-xs text-muted-foreground">Modify category, quantity or rate</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTxItem(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Scrap Category *</label>
                <Select
                  value={editTxForm.scrap_category_id}
                  onChange={v => {
                    const selected = categories.find(c => c.scrap_category_id === v);
                    setEditTxForm(f => ({
                      ...f,
                      scrap_category_id: v,
                      rate: selected ? String(selected.purchase_price || f.rate) : f.rate,
                    }));
                  }}
                  options={categories.map(c => ({
                    value: c.scrap_category_id,
                    label: `${c.name} (${c.unit}) - Default: ₹${c.purchase_price}/${c.unit}`
                  }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Quantity *</label>
                  <input
                    required
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={editTxForm.quantity}
                    onChange={e => setEditTxForm(f => ({ ...f, quantity: e.target.value }))}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Rate (₹) *</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editTxForm.rate}
                    onChange={e => setEditTxForm(f => ({ ...f, rate: e.target.value }))}
                    className={fieldCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Party / Customer Name</label>
                <input
                  type="text"
                  placeholder="Customer name"
                  value={editTxForm.party_name}
                  onChange={e => setEditTxForm(f => ({ ...f, party_name: e.target.value }))}
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Notes"
                  value={editTxForm.notes}
                  onChange={e => setEditTxForm(f => ({ ...f, notes: e.target.value }))}
                  className={fieldCls}
                />
              </div>

              {editTxForm.quantity && editTxForm.rate && Number(editTxForm.quantity) > 0 && Number(editTxForm.rate) > 0 && (
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">New Line Total:</span>
                  <span className="text-lg font-black text-orange-500">
                    ₹{(Number(editTxForm.quantity) * Number(editTxForm.rate)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingTxItem(null)}
                className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingTx}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
              >
                {isSavingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Edit Invoice Header Modal */}
      {editHeaderInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <form onSubmit={handleSaveInvoiceHeader} className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Edit Scrap Invoice Header</h3>
                  <p className="text-xs text-muted-foreground">{editHeaderInvoice.invoice_number || editHeaderInvoice.scrap_invoice_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditHeaderInvoice(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer / Party Name</label>
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={editHeaderForm.party_name}
                  onChange={e => setEditHeaderForm(f => ({ ...f, party_name: e.target.value }))}
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer Phone</label>
                <input
                  type="text"
                  placeholder="Phone number"
                  value={editHeaderForm.customer_phone}
                  onChange={e => setEditHeaderForm(f => ({ ...f, customer_phone: e.target.value }))}
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Customer Address</label>
                <input
                  type="text"
                  placeholder="Address"
                  value={editHeaderForm.customer_address}
                  onChange={e => setEditHeaderForm(f => ({ ...f, customer_address: e.target.value }))}
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Payment Status</label>
                <Select
                  value={editHeaderForm.payment_status}
                  onChange={v => setEditHeaderForm(f => ({ ...f, payment_status: v }))}
                  options={[
                    { value: 'CASH', label: 'CASH' },
                    { value: 'UPI', label: 'UPI' },
                    { value: 'CARD', label: 'CARD' },
                    { value: 'CREDIT', label: 'CREDIT' },
                    { value: 'PAID', label: 'PAID' },
                  ]}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditHeaderInvoice(null)}
                className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingHeader}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
              >
                {isSavingHeader ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Add Line Item to Invoice Modal */}
      {isAddingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <form onSubmit={handleAddLineItemToInvoice} className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onKeyDown={handleFormKeyDown} data-enter-nav>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Add Item to Invoice</h3>
                  <p className="text-xs text-muted-foreground">Invoice #{selectedInvoiceNumber}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingItem(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Select Scrap Category *</label>
                <Select
                  value={addItemForm.categoryId}
                  onChange={v => {
                    const selected = categories.find(c => c.scrap_category_id === v);
                    setAddItemForm(f => ({
                      ...f,
                      categoryId: v,
                      rate: selected ? String(selected.purchase_price || '') : f.rate,
                    }));
                  }}
                  options={[
                    { value: '', label: '-- Select Category --' },
                    ...categories.map(c => ({ value: c.scrap_category_id, label: `${c.name} (${c.unit}) - ₹${c.purchase_price}/${c.unit}` })),
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Quantity *</label>
                  <input
                    required
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="0.000"
                    value={addItemForm.quantity}
                    onChange={e => setAddItemForm(f => ({ ...f, quantity: e.target.value }))}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Rate (₹) *</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={addItemForm.rate}
                    onChange={e => setAddItemForm(f => ({ ...f, rate: e.target.value }))}
                    className={fieldCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Item notes (optional)"
                  value={addItemForm.notes}
                  onChange={e => setAddItemForm(f => ({ ...f, notes: e.target.value }))}
                  className={fieldCls}
                />
              </div>

              {addItemForm.quantity && addItemForm.rate && Number(addItemForm.quantity) > 0 && Number(addItemForm.rate) > 0 && (
                <div className="pt-2 flex items-center justify-between text-sm border-t border-border font-bold">
                  <span className="text-muted-foreground">Line Total:</span>
                  <span className="text-orange-500 text-base">₹{(Number(addItemForm.quantity) * Number(addItemForm.rate)).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setIsAddingItem(false)}
                className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAddingItemSaving}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
              >
                {isAddingItemSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Item
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
