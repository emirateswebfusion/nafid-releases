import { useState, useEffect, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Package, X, Trash2, User,
  CheckCircle2, AlertCircle, Save,
  Receipt, Tag, RefreshCw, Send,
  UserPlus,
} from 'lucide-react';
import { Select } from './ui/Select';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { cleanSearchText, sortProductsBySearchPriority } from '../utils/productSort';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { gradesApi } from '../data/grades';
import { partiesApi } from '../data/parties';
import { pricingTiersApi } from '../data/pricingTiers';
import { productsApi } from '../data/products';
import { purchasesApi } from '../data/purchases';
import { settingsApi } from '../data/settings';
import { type PurchaseBill, type PurchaseBillItem, type Product, type PurchaseBillFormHandle, type PurchaseFormItem } from './purchase/purchaseTypes';
import { getPurchaseBillFocusables } from './purchase/purchaseFormat';
import { usePurchaseProductFormState } from './purchase/hooks/usePurchaseProductFormState';
import { usePurchaseCsvExport } from './purchase/hooks/usePurchaseCsvExport';
import { usePurchaseBillPrint } from './purchase/hooks/usePurchaseBillPrint';
import { usePurchaseBillSummaries } from './purchase/hooks/usePurchaseBillSummaries';
import { usePurchaseQuickProduct } from './purchase/hooks/usePurchaseQuickProduct';
import { SupplierCreateDialog } from './purchase/views/SupplierCreateDialog';
import { PurchaseBillViewDialog } from './purchase/views/PurchaseBillViewDialog';
import { PurchaseBillList } from './purchase/views/PurchaseBillList';
import { PurchaseCleanupDialog } from './purchase/views/PurchaseCleanupDialog';
import { PurchaseAddGradeDialog } from './purchase/views/PurchaseAddGradeDialog';
import { PurchaseBillItemsTable } from './purchase/views/PurchaseBillItemsTable';
import { PurchaseProductSearch } from './purchase/views/PurchaseProductSearch';

export function PurchaseBillManager({ onClose, isRestricted: _isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName } = useAuthStore();

  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'GST' | 'ESTIMATE' | 'PAPER'>('ALL');
  const [filterInvoice] = useState<'ALL' | 'WITH' | 'WITHOUT'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewingBill, setViewingBill] = useState<PurchaseBill | null>(null);
  const [viewingBillItems, setViewingBillItems] = useState<PurchaseBillItem[]>([]);
  const [loadingViewingItems, setLoadingViewingItems] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);
  const [editHasItems, setEditHasItems] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<PurchaseBill | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const [billSummaries, setBillSummaries] = useState<Record<string, {
    totalQty: number;
    cgst: number;
    sgst: number;
    taxableAmount: number;
    itemsCount: number;
    hasPaper?: boolean;
    isAllPaper?: boolean;
  }>>({});

  // derived — apply type, invoice, and date filters on top of the server-side search results
  const filteredBills = useMemo(() => {
    let res = bills;
    if (filterType === 'PAPER') {
      res = res.filter(b => billSummaries[b.purchase_bill_id]?.hasPaper);
    } else if (filterType !== 'ALL') {
      res = res.filter(b => b.bill_type === filterType);
    }
    if (filterInvoice === 'WITH') {
      res = res.filter(b => !!b.invoice_number);
    } else if (filterInvoice === 'WITHOUT') {
      res = res.filter(b => !b.invoice_number);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      res = res.filter(b => new Date(b.bill_date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      res = res.filter(b => new Date(b.bill_date) <= to);
    }
    return res;
  }, [bills, filterType, filterInvoice, dateFrom, dateTo, billSummaries]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [billDate, setBillDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [billNotes, setBillNotes] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const purchaseFormRootRef = useRef<HTMLDivElement>(null);
  const billDateInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const gstRef = useRef<PurchaseBillFormHandle>(null);
  const estRef = useRef<PurchaseBillFormHandle>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [highlightedSupplierIndex, setHighlightedSupplierIndex] = useState(-1);
  const supplierOptionsRef = useRef<HTMLDivElement>(null);
  const [billType, setBillType] = useState<'GST' | 'ESTIMATE'>('GST');
  const [gstHasItems, setGstHasItems] = useState(false);
  const [estHasItems, setEstHasItems] = useState(false);

  // ── Party Create Dialog ──
  const [showPartyCreateForm, setShowPartyCreateForm] = useState(false);
  const [newPartyForm, setNewPartyForm] = useState({
    name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'PAYABLE' as const, notes: '',
  });
  const [isSavingParty, setIsSavingParty] = useState(false);

  // Stable memoized editingData objects to prevent infinite re-render cascades
  // (Inline object literals cause child useEffect([editingData]) to fire on every render)
  const gstEditingData = useMemo(() =>
    editingBill?.bill_type === 'GST'
      ? {
          purchase_bill_id: editingBill.purchase_bill_id,
          bill_number: editingBill.bill_number,
          invoice_number: editingBill?.invoice_number,
          payment_type: (editingBill as any)?.payment_type || 'CASH',
          total_amount: Number((editingBill as any)?.total_amount) || 0,
        }
      : undefined,
    [editingBill?.purchase_bill_id, editingBill?.bill_number, editingBill?.invoice_number, editingBill?.bill_type, (editingBill as any)?.payment_type]
  );
  const estEditingData = useMemo(() =>
    editingBill?.bill_type === 'ESTIMATE'
      ? {
          purchase_bill_id: editingBill.purchase_bill_id,
          bill_number: editingBill.bill_number,
          invoice_number: editingBill?.invoice_number,
          payment_type: (editingBill as any)?.payment_type || 'CASH',
          total_amount: Number((editingBill as any)?.total_amount) || 0,
        }
      : undefined,
    [editingBill?.purchase_bill_id, editingBill?.bill_number, editingBill?.invoice_number, editingBill?.bill_type, (editingBill as any)?.payment_type]
  );

  // Stable memoized cross-section addItem callbacks
  const gstOtherAddItem = useMemo(() => estRef.current?.addItem ?? undefined, [estRef.current?.addItem]);
  const estOtherAddItem = useMemo(() => gstRef.current?.addItem ?? undefined, [gstRef.current?.addItem]);

  // Bulk share: copy ALL items from source section to destination section (keeps both in sync)
  const handleBulkShare = async (source: 'GST' | 'ESTIMATE') => {
    const srcRef = source === 'GST' ? gstRef : estRef;
    const dstRef = source === 'GST' ? estRef : gstRef;
    const target = source === 'GST' ? 'Estimate' : 'GST';
    const items = srcRef.current?.getItems?.() ?? [];
    if (items.length === 0) {
      setStatusMessage({ text: `Share failed: no items in ${source} section to share`, type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    if (!dstRef.current?.addItem) {
      setStatusMessage({ text: 'Share failed: destination section unavailable', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    for (const item of items) {
      await dstRef.current.addItem(item);
    }
    setStatusMessage({ text: `${source} items shared to ${target} (${items.length} item${items.length > 1 ? 's' : ''})`, type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const { loadBillSummaries } = usePurchaseBillSummaries({
    setBillSummaries,
  });

  const loadBills = async () => {
    if (!isDesktopRuntime() || !tenantId) return;
    setLoading(true);
    const result = await purchasesApi.getPurchaseBills({
      tenant_id: tenantId,
      search: searchQuery || undefined,
      limit: 100,
    });
    if (Array.isArray(result)) {
      setBills(result);
      loadBillSummaries(result);
    }
    setLoading(false);
  };

  useEffect(() => { loadBills(); }, [tenantId, searchQuery]);

  useEffect(() => {
    if (showAddForm && isDesktopRuntime() && tenantId) {
      partiesApi.getParties(tenantId)
        .then(res => { if (Array.isArray(res)) setSuppliers(res.filter(party => String(party.party_type || 'CUSTOMER').toUpperCase() === 'SUPPLIER')); })
        .catch(console.error);
    }
  }, [showAddForm, tenantId]);

  useEffect(() => {
    if (!showAddForm) return;
    const timer = window.setTimeout(() => billDateInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [showAddForm]);

  useEffect(() => {
    if (!showAddForm) return;
    const handlePurchaseShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'F2' || showPartyCreateForm || viewingBill || (event.target as HTMLElement).closest('[data-product-create-dialog]')) return;
      event.preventDefault();
      (billType === 'GST' ? gstRef.current : estRef.current)?.focusSearch();
    };
    window.addEventListener('keydown', handlePurchaseShortcut);
    return () => window.removeEventListener('keydown', handlePurchaseShortcut);
  }, [showAddForm, showPartyCreateForm, viewingBill, billType]);

  const handleViewBill = async (bill: PurchaseBill) => {
    setViewingBill(bill);
    setLoadingViewingItems(true);
    if (isDesktopRuntime()) {
      const items = await purchasesApi.getPurchaseBillItems(bill.purchase_bill_id);
      if (Array.isArray(items)) {
        setViewingBillItems(items);
      } else {
        setViewingBillItems([]);
      }
    }
    setLoadingViewingItems(false);
  };

  const handleEditBill = async (bill: PurchaseBill) => {
    setEditingBill(bill);
    setEditHasItems(false);
    setGstHasItems(false);
    setEstHasItems(false);
    setSupplierName(bill.supplier_name);
    setSupplierSearch('');
    setSupplierId(bill.supplier_id);
    setBillDate(bill.bill_date || new Date().toLocaleDateString('en-CA'));
    setBillNotes(bill.notes || '');
    setBillType(bill.bill_type as 'GST' | 'ESTIMATE');
    setShowAddForm(true);
  };

  const handleDelete = (bill: PurchaseBill) => {
    setBillToDelete(bill);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteBill = async () => {
    if (!billToDelete) return;
    setDeleteSaving(true);
    try {
      if (isDesktopRuntime()) {
        const res = await purchasesApi.deletePurchaseBill(billToDelete.purchase_bill_id);
        if (res.success) {
          setBills(prev => prev.filter(b => b.purchase_bill_id !== billToDelete.purchase_bill_id));
          setStatusMessage({ text: 'Purchase bill deleted', type: 'success' });
          setDeleteConfirmOpen(false);
          setBillToDelete(null);
        } else {
          setStatusMessage({ text: 'Delete failed: ' + (res.error || ''), type: 'error' });
        }
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch {
      setStatusMessage({ text: 'Delete failed', type: 'error' });
    } finally {
      setDeleteSaving(false);
    }
  };

  const { handlePrintBill } = usePurchaseBillPrint({
    setStatusMessage, tenantId,
  });

  const { handleExportCSV } = usePurchaseCsvExport({
    filteredBills, filterType, searchQuery, setIsExporting, setStatusMessage,
  });

  const filteredSuppliers = suppliers.filter(s =>
    String(s.name || '').toLowerCase().includes(supplierSearch.toLowerCase())
  );

  useEffect(() => {
    supplierOptionsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [highlightedSupplierIndex]);

  const focusNextAfterSupplier = () => {
    window.setTimeout(() => {
      const root = purchaseFormRootRef.current;
      if (!root) return;
      const focusables = getPurchaseBillFocusables(root);
      const supplierIndex = focusables.indexOf(supplierInputRef.current as HTMLElement);
      focusables[supplierIndex + 1]?.focus();
    }, 0);
  };

  const selectSupplier = (supplier: any) => {
    setSupplierName(supplier.name);
    setSupplierId(supplier.party_id);
    setSupplierSearch('');
    setHighlightedSupplierIndex(-1);
    focusNextAfterSupplier();
  };

  const handlePurchaseFormKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.matches('button, [role="button"]') || target.isContentEditable) return;
    const root = purchaseFormRootRef.current;
    if (!root || !root.contains(target)) return;

    const focusables = getPurchaseBillFocusables(root);
    const index = focusables.indexOf(target);
    if (index < 0 || index >= focusables.length - 1) return;

    event.preventDefault();
    focusables[index + 1]?.focus();
  };

  const handleCreateParty = async () => {
    if (!newPartyForm.name.trim()) { setStatusMessage({ text: 'Supplier name is required', type: 'error' }); setTimeout(() => setStatusMessage(null), 3000); return; }
    if (!isDesktopRuntime() || !tenantId || !userId) return;
    setIsSavingParty(true);
    try {
      const partyId = uuidv4();
      await partiesApi.addParty({
        party_id: partyId,
        tenant_id: tenantId,
        name: newPartyForm.name.trim(),
        phone: newPartyForm.phone.trim() || null,
        address: newPartyForm.address.trim() || null,
        gstin: newPartyForm.gstin.trim() || null,
        balance: parseFloat(newPartyForm.opening_balance) || 0,
        balance_type: newPartyForm.balance_type,
        party_type: 'SUPPLIER',
        notes: newPartyForm.notes.trim() || null,
        created_by: userId,
        created_by_name: userName || undefined,
      });
      setStatusMessage({ text: 'Party created successfully', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
      // Refresh suppliers and auto-select
      const updated = await partiesApi.getParties(tenantId);
      if (Array.isArray(updated)) setSuppliers(updated.filter(party => String(party.party_type || 'CUSTOMER').toUpperCase() === 'SUPPLIER'));
      setSupplierName(newPartyForm.name.trim());
      setSupplierId(partyId);
      setSupplierSearch('');
      setHighlightedSupplierIndex(-1);
      setShowPartyCreateForm(false);
      setNewPartyForm({ name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'PAYABLE', notes: '' });
      focusNextAfterSupplier();
    } catch {
      setStatusMessage({ text: 'Failed to create party', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsSavingParty(false);
    }
  };

  const handlePartyFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-enter-submit]');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    let savedCount = 0;
    // When editing, save the matching bill type form
    if (editingBill) {
      const activeRef = editingBill.bill_type === 'GST' ? gstRef : estRef;
      const otherRef = editingBill.bill_type === 'GST' ? estRef : gstRef;

      // Save/update the active/original bill if it still has items
      if (activeRef.current && activeRef.current.hasItems) {
        const ok = await activeRef.current.save();
        if (ok) savedCount++;
      } else {
        // If activeRef has no items, but otherRef has items, delete the original bill
        if (otherRef.current?.hasItems && isDesktopRuntime()) {
          await purchasesApi.deletePurchaseBill(editingBill.purchase_bill_id);
        }
      }

      // Also save the other ref if it has items (creates a new bill of the other type)
      if (otherRef.current?.hasItems) {
        const ok = await otherRef.current.save();
        if (ok) savedCount++;
      }
    } else {
      if (gstRef.current?.hasItems) {
        const ok = await gstRef.current.save();
        if (ok) savedCount++;
      }
      if (estRef.current?.hasItems) {
        const ok = await estRef.current.save();
        if (ok) savedCount++;
      }
    }
    setIsSavingAll(false);
    if (savedCount > 0) {
      setShowAddForm(false);
      setEditingBill(null);
      setEditHasItems(false);
      setGstHasItems(false);
      setEstHasItems(false);
      loadBills();
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ═══════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════ */}
      <header className="shrink-0 z-10 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground truncate">
                  {showAddForm ? (editingBill ? `Edit Purchase Bill - ${editingBill.bill_number}` : 'New Purchase Bill') : 'Purchase Bills'}
                </h1>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {showAddForm ? 'Record a purchase entry' : `${bills.length} purchase bills`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RedCrossButton
              onClick={showAddForm ? () => { setShowAddForm(false); setEditingBill(null); setEditHasItems(false); setGstHasItems(false); setEstHasItems(false); } : onClose}
              title="Close"
            />
          </div>
        </div>
      </header>

      {/* ─── FLOATING TOASTS ─── */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-start gap-2 w-full max-w-md pointer-events-none">
        {statusMessage && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className={clsx("p-2 rounded-xl shrink-0", statusMessage.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
                {statusMessage.type === 'success' ? 'PURCHASE STATUS' : 'PURCHASE ALERT'}
              </span>
              <span className="text-white font-bold text-xs block leading-tight">{statusMessage.text}</span>
            </div>
            <RedCrossButton onClick={() => setStatusMessage(null)} size="sm" />
          </div>
        )}
      </div>

      {/* ── LIST VIEW ── */}
      {!showAddForm && (
        <>
          <PurchaseBillList
            bills={bills} billSummaries={billSummaries} dateFrom={dateFrom} dateTo={dateTo}
            filteredBills={filteredBills} filterType={filterType} handleDelete={handleDelete}
            handleEditBill={handleEditBill} handleExportCSV={handleExportCSV} handlePrintBill={handlePrintBill}
            handleViewBill={handleViewBill} isExporting={isExporting} loading={loading} searchQuery={searchQuery}
            setDateFrom={setDateFrom} setDateTo={setDateTo} setEditHasItems={setEditHasItems}
            setEditingBill={setEditingBill} setEstHasItems={setEstHasItems} setFilterType={setFilterType}
            setGstHasItems={setGstHasItems} setSearchQuery={setSearchQuery} setShowAddForm={setShowAddForm}
            showAddForm={showAddForm} viewingBill={viewingBill}
          />
        </>
      )}

      {/* ── ADD FORM ── */}
      {showAddForm && (
        <div
          ref={purchaseFormRootRef}
          onKeyDown={handlePurchaseFormKeyDown}
          data-enter-nav
          className="w-full px-4 sm:px-6 pt-4 pb-4 select-none flex flex-col flex-1 min-h-0"
        >
          {/* ── Shared Info Card ── */}
          <div className="bg-card border border-border rounded-[28px] shadow-sm px-6 py-4 shrink-0">
<div className="flex items-center gap-4 flex-wrap">
            <input
              ref={billDateInputRef}
              type="date" value={billDate}
              onChange={e => setBillDate(e.target.value)}
              className="bg-background/50 border border-border rounded-xl px-3 py-2.5 text-xs font-semibold text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background focus:outline-none transition-all shrink-0"
            />
            <div className="relative flex-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
<input
                ref={supplierInputRef}
                type="text" placeholder="Search or select supplier..."
                value={supplierSearch || supplierName}
                onChange={e => {
                  setSupplierSearch(e.target.value);
                  setSupplierName(e.target.value);
                  setSupplierId('');
                  setHighlightedSupplierIndex(-1);
                }}
                onKeyDown={event => {
                  if (event.key === 'ArrowDown' && filteredSuppliers.length > 0) {
                    event.preventDefault();
                    setHighlightedSupplierIndex(index => (index + 1) % filteredSuppliers.length);
                  } else if (event.key === 'ArrowUp' && filteredSuppliers.length > 0) {
                    event.preventDefault();
                    setHighlightedSupplierIndex(index => index < 0 ? filteredSuppliers.length - 1 : (index - 1 + filteredSuppliers.length) % filteredSuppliers.length);
                  } else if (event.key === 'Enter' && supplierSearch && filteredSuppliers.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    selectSupplier(filteredSuppliers[highlightedSupplierIndex] || filteredSuppliers[0]);
                  }
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={Boolean(supplierSearch && filteredSuppliers.length > 0)}
                aria-controls="purchase-supplier-options"
                aria-activedescendant={highlightedSupplierIndex >= 0 ? `purchase-supplier-option-${highlightedSupplierIndex}` : undefined}
                className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
              />
              {(supplierSearch || supplierName) && (
                <button
                  onClick={() => {
                    setSupplierSearch('');
                    setSupplierName('');
                    setSupplierId('');
                    setHighlightedSupplierIndex(-1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                  type="button"
                  aria-label="Clear supplier"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {supplierSearch && filteredSuppliers.length > 0 && (
                <div ref={supplierOptionsRef} id="purchase-supplier-options" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-[200px] overflow-y-auto">
                  {filteredSuppliers.map((s, index) => (
                    <button
                      key={s.party_id} type="button"
                      id={`purchase-supplier-option-${index}`}
                      role="option"
                      aria-selected={index === highlightedSupplierIndex}
                      onMouseDown={event => { event.preventDefault(); selectSupplier(s); }}
                      onMouseEnter={() => setHighlightedSupplierIndex(index)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border/40 last:border-0 cursor-pointer',
                        index === highlightedSupplierIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40'
                      )}
                    >
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-foreground truncate">{s.name}</div>
                        {s.phone && <div className="text-[10px] text-muted-foreground">{s.phone}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setNewPartyForm(prev => ({ ...prev, name: supplierSearch || '' })); setShowPartyCreateForm(true); }}
              className="p-2.5 rounded-xl text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all active:scale-95 cursor-pointer shrink-0 shadow-inner"
              title="Create Supplier"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none shadow-inner select-none shrink-0">
              {/* Tab: GST */}
              <button
                type="button"
                onClick={() => setBillType('GST')}
                className={clsx(
                  "flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                  billType === 'GST'
                    ? "bg-background shadow-md shadow-foreground/[0.03] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-extrabold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span className={clsx(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  billType === 'GST' ? "bg-emerald-500" : "bg-muted-foreground/40"
                )} />
                GST
                <span className={clsx(
                  "flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-black transition-opacity",
                  billType === 'GST' ? "bg-emerald-500/15 text-emerald-600" : "bg-muted-foreground/15 text-muted-foreground",
                  gstHasItems ? "opacity-100" : "opacity-0"
                )}>✓</span>
              </button>
              {/* Tab: Estimate */}
              <button
                type="button"
                onClick={() => setBillType('ESTIMATE')}
                className={clsx(
                  "flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                  billType === 'ESTIMATE'
                    ? "bg-background shadow-md shadow-foreground/[0.03] text-amber-600 dark:text-amber-400 border-amber-500/30 font-extrabold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span className={clsx(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  billType === 'ESTIMATE' ? "bg-amber-500" : "bg-muted-foreground/40"
                )} />
                Estimate
                <span className={clsx(
                  "flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-black transition-opacity",
                  billType === 'ESTIMATE' ? "bg-amber-500/15 text-amber-600" : "bg-muted-foreground/15 text-muted-foreground",
                  estHasItems ? "opacity-100" : "opacity-0"
                )}>✓</span>
              </button>
            </div>
            </div>

          {/* ── Notes Row ── */}
          <div className="mt-3.5 pt-3.5 border-t border-border/50 flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              placeholder="Notes / Remarks (optional)"
              value={billNotes}
              onChange={e => setBillNotes(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            />
            {billNotes && (
              <button
                type="button"
                onClick={() => setBillNotes('')}
                className="text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            </div>
          </div>

          <div className={clsx("flex-1 py-5 space-y-4", (gstHasItems || estHasItems) ? "overflow-y-auto" : "overflow-y-hidden")}>
            <div className={billType === 'GST' ? 'block' : 'hidden'}>
              <PurchaseBillFormSection
                ref={gstRef}
                type="GST"
                tenantId={tenantId}
                billDate={billDate}
                supplierName={supplierName}
                supplierId={supplierId}
                notes={billNotes}
                onStatusMessage={setStatusMessage}
                onSaved={() => { setEditingBill(null); setEditHasItems(false); loadBills(); }}
                onItemsLoaded={() => setEditHasItems(true)}
                onItemsChange={setGstHasItems}
                onShareAll={() => handleBulkShare('GST')}
                otherSectionAddItem={gstOtherAddItem}
                editingData={gstEditingData}
                getOtherSectionItems={() => estRef.current?.getItems?.() || []}
              />
            </div>
            <div className={billType === 'ESTIMATE' ? 'block' : 'hidden'}>
              <PurchaseBillFormSection
                ref={estRef}
                type="ESTIMATE"
                tenantId={tenantId}
                billDate={billDate}
                supplierName={supplierName}
                supplierId={supplierId}
                notes={billNotes}
                onStatusMessage={setStatusMessage}
                onSaved={() => { setEditingBill(null); setEditHasItems(false); loadBills(); }}
                onItemsLoaded={() => setEditHasItems(true)}
                onItemsChange={setEstHasItems}
                onShareAll={() => handleBulkShare('ESTIMATE')}
                otherSectionAddItem={estOtherAddItem}
                editingData={estEditingData}
                getOtherSectionItems={() => gstRef.current?.getItems?.() || []}
              />
            </div>
          </div>

          {/* ── Save Button ── */}
          <div className="bg-card border border-border rounded-[28px] shadow-sm px-6 py-4 shrink-0 flex items-center justify-end gap-3">

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSavingAll || !(gstHasItems || estHasItems) || (!!editingBill && !editHasItems)}
              data-enter-submit
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all duration-200 active:scale-95 py-2.5 px-6 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isSavingAll ? 'Saving...' : editingBill ? 'Update Purchase Bill' : 'Save Purchase Bill'}
            </button>
          </div>
        </div>
      )}

      {/* ── Purchase Bill Detail — Centered Wide Dialog ── */}
      {viewingBill !== null && (
        <PurchaseBillViewDialog
          handleDelete={handleDelete} handleEditBill={handleEditBill} handlePrintBill={handlePrintBill}
          loadingViewingItems={loadingViewingItems} setViewingBill={setViewingBill} viewingBill={viewingBill}
          viewingBillItems={viewingBillItems}
        />
      )}

      {/* ── Create Supplier Dialog ── */}
      {showPartyCreateForm && (
        <SupplierCreateDialog
          handleCreateParty={handleCreateParty} handlePartyFormKeyDown={handlePartyFormKeyDown}
          isSavingParty={isSavingParty} newPartyForm={newPartyForm} setNewPartyForm={setNewPartyForm}
          setShowPartyCreateForm={setShowPartyCreateForm}
        />
      )}

      {/* Delete Purchase Bill Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => { if (!deleteSaving) { setDeleteConfirmOpen(false); setBillToDelete(null); } }}
        closeButton={null}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span>Delete Purchase Bill</span>
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
              This will permanently delete purchase bill <strong>{billToDelete?.bill_number}</strong>
              {billToDelete?.supplier_name && <> from <strong>{billToDelete.supplier_name}</strong></>}.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={confirmDeleteBill}
              disabled={deleteSaving}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              {deleteSaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Delete Bill</>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const PurchaseBillFormSection = forwardRef<PurchaseBillFormHandle, {
  type: 'GST' | 'ESTIMATE';
  tenantId: string;
  billDate: string;
  supplierName: string;
  supplierId: string;
  notes: string;
  onStatusMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
  onSaved: () => void;
  onItemsLoaded?: () => void;
  onItemsChange?: (hasItems: boolean) => void;
  onShareAll?: () => void;
  otherSectionAddItem?: (item: {
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    sku_barcode?: string;
    item_code?: string;
  }) => void;
  editingData?: {
    purchase_bill_id: string;
    bill_number: string;
    invoice_number?: string;
    payment_type: string;
    total_amount?: number;
  };
  getOtherSectionItems?: () => any[];
}>(({ type, tenantId, billDate, supplierName, supplierId, notes, onStatusMessage, onSaved, onItemsLoaded, onItemsChange, onShareAll, otherSectionAddItem, editingData, getOtherSectionItems }, ref) => {
  const [billNumber, setBillNumber] = useState('');
  const [peekedBillNumber, setPeekedBillNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [manualRoundOff, setManualRoundOff] = useState<string>('');
  const [createdProductIds, setCreatedProductIds] = useState<string[]>([]);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [pendingCloseAction] = useState<(() => void) | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const productItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (highlightedProductIndex >= 0 && productItemRefs.current[highlightedProductIndex]) {
      productItemRefs.current[highlightedProductIndex]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [highlightedProductIndex]);
  const [billItems, setBillItems] = useState<PurchaseFormItem[]>([]);
  const hsnInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [_isSaving, setIsSaving] = useState(false);
  const [priceCoding, setPriceCoding] = useState<Record<string, string> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const productForm = usePurchaseProductFormState();
  const {
    firstInputRef, showProductCreateForm, setShowProductCreateForm, setNewProductName, newProductItemCode, setNewProductItemCode,
    newProductBarcode, setNewProductBarcode, setNewProductBrand, newProductCategory, setNewProductCategory, setNewProductUom,
    newProductPurchasePrice, setNewProductPurchasePrice, newProductBasePrice, setNewProductBasePrice, setNewProductStock, setNewProductReorderLevel,
    setNewProductHsn, newProductTaxRate, setNewProductTaxRate, setNewProductDiscountPercent, setNewProductDiscountFlat, setNewProductOfferPrice,
    newProductIsGstApplicable, setNewProductIsGstApplicable, setNewProductIsDummy, setNewProductIsCustomCategory, setNewProductGrades, setNewProductGradeId,
    newProductIsAddingGrade, setNewProductIsAddingGrade, setNewProductSavingGrade, newProductGradeForm, setNewProductGradeForm, setTierPrices,
    setConfiguredCategories, setNewProductPcs, editingProductItemId, setEditingProductItemId, setOriginalProductStock,
  } = productForm;
  const [searchDropdownPos, setSearchDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const activePricingTiers = useMemo(() => {
    return pricingTiers.filter(t => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
  }, [pricingTiers]);
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT' | 'UPI' | 'BANK_TRANSFER'>('CASH');
  const [sharedEstimateMode, setSharedEstimateMode] = useState(false);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);

  useEffect(() => {
    const loadRealPaperSetting = () => {
      if (hasBridge('settingsGet')) {
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock' }).then(val => {
          if (val !== null && val !== undefined) setEnableRealPaperStock(Boolean(val));
        }).catch(() => {});
      }
    };
    loadRealPaperSetting();
    window.addEventListener('settings:updated', loadRealPaperSetting);
    return () => window.removeEventListener('settings:updated', loadRealPaperSetting);
  }, [tenantId]);

  const openProductEditor = async (item: typeof billItems[0]) => {
    setEditingProductItemId(item.product_id);
    setNewProductName(item.name);
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductUom('Pcs');
    setNewProductPurchasePrice(item.purchase_price || '');
    setNewProductBasePrice(item.selling_price || '');
    setNewProductStock(item.quantity ? String(item.quantity) : '1');
    setNewProductReorderLevel('');
    setNewProductHsn(item.hsn_sac_code || '');
    setNewProductTaxRate(item.tax_rate_percent ?? 18);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice(item.offer_price && Number(item.offer_price) > 0 ? String(item.offer_price) : '');
    setNewProductIsGstApplicable(item.is_gst_applicable !== 0);
    setNewProductIsDummy(item.skip_stock_update === 1);
    setNewProductPcs('');
    setShowProductCreateForm(true);
    // Populate full product details (MRP/Sale Price, Offer Price, Discounts, Stock, etc.)
    if (isDesktopRuntime() && tenantId) {
      try {
        const product = await productsApi.getProductsByIds({ tenant_id: tenantId, product_ids: [item.product_id] });
        const p = Array.isArray(product) ? product[0] : null;
        if (p) {
          setNewProductName(p.name ?? item.name);
          setNewProductItemCode(p.item_code || '');
          setNewProductBarcode(p.sku_barcode || '');
          setNewProductBrand(p.brand_manufacturer || '');
          setNewProductCategory(p.category || '');
          setNewProductGradeId(p.grade_id || '');
          setNewProductUom(p.uom || 'Pcs');
          if (p.domain_attributes) {
            try {
              const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
              setNewProductPcs(da.pcs ? String(da.pcs) : '');
            } catch {}
          }
          if (!item.purchase_price || Number(item.purchase_price) <= 0) setNewProductPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : '');
          if (!item.selling_price || Number(item.selling_price) <= 0) setNewProductBasePrice(p.base_price != null ? String(p.base_price) : '');
          const currentStock = p.current_stock != null ? Number(p.current_stock) : 0;
          setOriginalProductStock(currentStock);
          setNewProductReorderLevel(p.reorder_level != null ? String(p.reorder_level) : '');
          setNewProductHsn(p.hsn_sac_code || '');
          setNewProductTaxRate(p.tax_rate_percent ?? 18);
          setNewProductIsGstApplicable(p.is_gst_applicable !== 0);
          setNewProductDiscountPercent(p.discount_percent != null && p.discount_percent > 0 ? String(p.discount_percent) : '');
          setNewProductDiscountFlat(p.discount_flat != null && p.discount_flat > 0 ? String(p.discount_flat) : '');
          if (!item.offer_price || Number(item.offer_price) <= 0) setNewProductOfferPrice(p.offer_price != null && p.offer_price > 0 ? String(p.offer_price) : '');
        }
      } catch { /* non-fatal: keep bill-line values */ }
    }
    if (isDesktopRuntime() && tenantId) {
      pricingTiersApi.getProductPricing(tenantId)
        .then((rows: any[]) => {
          if (Array.isArray(rows)) {
            const mine: Record<string, string> = {};
            for (const r of rows) {
              if (r.product_id === item.product_id && r.price != null && r.price !== '') {
                mine[r.pricing_tier_id] = String(r.price);
              }
            }
            setTierPrices(mine);
          }
        })
        .catch(console.error);
    }
    // Rule C: if the product is purchased via Estimate too (present in the other section
    // or already has saved Estimate bills), its barcode purchase code must stay on the raw
    // Estimate base — GST-section edits must never inflate it.
    try {
      const inOtherSection = (getOtherSectionItems ? getOtherSectionItems() : []).some(i => i.product_id === item.product_id);
      let hasEstimateBills = false;
      if (isDesktopRuntime() && tenantId) {
        const res = await productsApi.productHasEstimateBills({ product_id: item.product_id, tenant_id: tenantId });
        hasEstimateBills = !!(res && res.success && res.hasEstimate);
      }
      setSharedEstimateMode(inOtherSection || hasEstimateBills);
    } catch { setSharedEstimateMode(false); }
  };

  useEffect(() => {
    if (editingData) {
      setBillNumber(editingData.bill_number);
      setInvoiceNumber(editingData.invoice_number || '');
      setPaymentType((editingData.payment_type || 'CASH') as any);
      setBillItems([]);
      if (isDesktopRuntime() && tenantId) {
        purchasesApi.getPurchaseBillItems(editingData.purchase_bill_id)
          .then(items => {
            if (Array.isArray(items)) {
              const mapped = items.map((item: any) => ({
                product_id: item.product_id,
                name: item.product_name || item.name,
                quantity: String(item.quantity),
                purchase_price: String(item.purchase_price),
                selling_price: item.product_base_price != null && Number(item.product_base_price) > 0
                  ? String(item.product_base_price)
                  : (item.selling_price != null && Number(item.selling_price) > 0 ? String(item.selling_price) : ''),
                offer_price: item.product_offer_price != null && Number(item.product_offer_price) > 0
                  ? String(item.product_offer_price)
                  : (item.offer_price != null && Number(item.offer_price) > 0 ? String(item.offer_price) : ''),
                stock: item.product_stock != null ? String(item.product_stock) : '',
                is_gst_applicable: item.is_gst_applicable,
                tax_rate_percent: item.tax_rate_percent,
                hsn_sac_code: item.hsn_sac_code,
                skip_stock_update: item.skip_stock_update !== undefined && item.skip_stock_update !== null
                  ? Number(item.skip_stock_update)
                  : 0,
              }));
              setBillItems(mapped);
              if (mapped.length > 0) onItemsLoaded?.();

              // Calculate the round-off for editing
              const baseTotal = mapped.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0) * (Number(i.purchase_price) || 0), 0);
              let unroundedTotal = baseTotal;
              if (type === 'GST') {
                const gstTotal = mapped.reduce((acc: number, item: any) => {
                  const rate = item.tax_rate_percent || 0;
                  const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
                  if ((item.is_gst_applicable ?? 1) === 1 && rate > 0) {
                    return acc + itemTotal * (rate / 100);
                  }
                  return acc;
                }, 0);
                unroundedTotal = baseTotal + gstTotal;
              }
              const diff = (editingData.total_amount ?? 0) - unroundedTotal;
              setManualRoundOff(Math.abs(diff) > 0.001 ? diff.toFixed(2) : '0.00');
            }
          })
          .catch(console.error);
      }
    } else {
      setBillItems([]);
      setManualRoundOff('');
      if (isDesktopRuntime() && tenantId) {
        const getNumFn = hasBridge('dbPeekNextPurchaseBillNumber') ? purchasesApi.peekNextPurchaseBillNumber : purchasesApi.getNextPurchaseBillNumber;
        getNumFn({ tenant_id: tenantId, bill_type: type })
          .then(res => {
            if (res.success && res.billNumber) {
              setBillNumber(res.billNumber);
              setPeekedBillNumber(res.billNumber);
            }
          })
          .catch(console.error);
      }
    }
    if (isDesktopRuntime() && tenantId) {
      settingsApi.get({ tenant_id: tenantId, key: 'price_coding' })
        .then(res => { if (res) setPriceCoding(res); })
        .catch(console.error);
    }
  }, [tenantId, editingData, type]);

  useEffect(() => {
    if (isDesktopRuntime() && tenantId && showProductCreateForm) {
      productsApi.getProducts({ tenant_id: tenantId, limit: 200 })
        .then((res: any[]) => {
          if (Array.isArray(res)) {
            const cats = [...new Set(res.map(p => p.category).filter(Boolean))] as string[];
            setConfiguredCategories(cats);
          }
        })
          .catch(console.error);
      gradesApi.getGrades(tenantId)
        .then((res: any[]) => {
          if (Array.isArray(res)) setNewProductGrades(res);
        })
        .catch(console.error);
      pricingTiersApi.getPricingTiers(tenantId)
        .then((res: any[]) => {
          if (Array.isArray(res)) setPricingTiers(res);
        })
        .catch(console.error);
    }
  }, [showProductCreateForm, tenantId, setConfiguredCategories, setNewProductGrades]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === ' ' && !showProductCreateForm) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !isEditable) {
          e.preventDefault();
          setShowProductCreateForm(true);
          setNewProductName('');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showProductCreateForm, setNewProductName, setShowProductCreateForm]);

  const searchProducts = async (q: string) => {
    setProductSearch(q);
    setHighlightedProductIndex(0);
    setProducts([]);
    setIsSearchingProducts(q.trim().length > 0);
    setShowProductCreateForm(false);
  };

  useEffect(() => {
    const query = productSearch.trim();
    if (!isDesktopRuntime() || !tenantId || !query) {
      setProducts([]);
      setHighlightedProductIndex(0);
      setIsSearchingProducts(false);
      return;
    }

    let isCurrentSearch = true;
    setIsSearchingProducts(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await purchasesApi.getPurchaseBillProducts({
          tenant_id: tenantId,
          search: query,
          limit: 500,
        });
        if (!isCurrentSearch) return;

        const rawProducts = Array.isArray(result) ? result : [];
        const q = query.toLowerCase();
        const qNoSpace = q.replace(/\s+/g, '');
        const qClean = cleanSearchText(q);
        const sortedProducts = sortProductsBySearchPriority(rawProducts, query);
        const matchedProducts = sortedProducts.filter(p => {
          const fields = [p.sku_barcode, p.item_code, p.name, p.brand_manufacturer, p.category, p.hsn_sac_code]
            .map(value => String(value || '').trim().toLowerCase());
          return fields.some(value => {
            const noSpace = value.replace(/\s+/g, '');
            const clean = cleanSearchText(value);
            return value.includes(q) || noSpace.includes(qNoSpace) || (qClean.length > 0 && clean.includes(qClean));
          });
        });

        const deduped: Product[] = [];
        let serviceChargeFound = false;
        for (const product of matchedProducts) {
          const isServiceCharge = Number(product.is_service_item) === 1 || String(product.name || '').trim().toLowerCase() === 'service charge';
          if (isServiceCharge) {
            if (serviceChargeFound) continue;
            serviceChargeFound = true;
          }
          deduped.push(product);
        }

        setProducts(deduped);
        setHighlightedProductIndex(0);
        setIsSearchingProducts(false);
      } catch (error) {
        if (isCurrentSearch) {
          console.error('[PurchaseBillManager] Product search error:', error);
          setProducts([]);
          setIsSearchingProducts(false);
        }
      }
    }, 150);

    return () => {
      isCurrentSearch = false;
      window.clearTimeout(timer);
    };
  }, [productSearch, tenantId]);

  const addProductToBill = async (product: Product) => {
    if (billItems.some(i => i.product_id === product.product_id)) return;

    const isPaperProduct = (() => {
      try {
        const da = typeof product.domain_attributes === 'string'
          ? JSON.parse(product.domain_attributes || '{}')
          : (product.domain_attributes || {});
        return da.gst_type === 'PAPER' || Number(da.paper_stock || 0) > 0 || (Number(product.current_stock || 0) <= 0 && Number((product as any).paper_stock || 0) > 0);
      } catch { return false; }
    })();

    const isSharedWithOther = (getOtherSectionItems?.() ?? []).some(i => i.product_id === product.product_id);

    setBillItems(prev => [...prev, {
      product_id: product.product_id,
      name: product.name,
      quantity: '1',
      purchase_price: String(product.gst_purchase_price || product.purchase_price || 0),
      selling_price: String(
        product.pricing_mode === 'GRADE_RATE' && product.grade_rate !== undefined && product.grade_rate !== null
          ? Number(product.grade_rate)
          : (product.base_price || 0)
      ),
      offer_price: product.offer_price != null && Number(product.offer_price) > 0 ? String(product.offer_price) : '',
      stock: product.current_stock != null ? String(product.current_stock) : '',
      is_gst_applicable: type === 'GST' ? (product.is_gst_applicable ?? 1) : 0,
      tax_rate_percent: type === 'GST' ? (product.tax_rate_percent ?? 18) : 0,
      hsn_sac_code: product.hsn_sac_code || '',
      skip_stock_update: type === 'GST' ? (isPaperProduct || isSharedWithOther ? 1 : 0) : 0,
    }]);
    setProductSearch('');
    setProducts([]);
    setTimeout(() => { hsnInputRefs.current[hsnInputRefs.current.length - 1]?.focus(); }, 0);
  };

  const removeBillItem = (productId: string) => {
    setBillItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateBillItem = (productId: string, field: 'quantity' | 'purchase_price' | 'selling_price' | 'offer_price' | 'hsn_sac_code', value: string) => {
    setBillItems(prev => prev.map(i => i.product_id === productId ? { ...i, [field]: value } : i));
  };

// Real / Dummy toggle per GST-bill line: Dummy = paper stock / tax record only
  // (no stock add), Real = stock-in.
  const toggleBillItemDummy = (item: any) => {
    const newVal = (item.skip_stock_update ?? 0) === 1 ? 0 : 1;
    setBillItems(prev => prev.map(i => i.product_id === item.product_id ? { ...i, skip_stock_update: newVal } : i));
  };

  const getBillTotal = () => {
    const baseTotal = billItems.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.purchase_price) || 0), 0);
    if (type !== 'GST') return baseTotal;
    const gstTotal = billItems.reduce((acc, item) => {
      const rate = item.tax_rate_percent || 0;
      const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
      if ((item.is_gst_applicable ?? 1) === 1 && rate > 0) {
        return acc + itemTotal * (rate / 100);
      }
      return acc;
    }, 0);
    return baseTotal + gstTotal;
  };

  const getEffectivePurchaseRate = () => {
    const base = Number(newProductPurchasePrice) || 0;
    if (base <= 0) return 0;
    if (type === 'ESTIMATE' || sharedEstimateMode) return base;
    const rate = newProductIsGstApplicable ? (newProductTaxRate || 0) : 0;
    return rate > 0 ? Math.round(base * (1 + rate / 100) * 100) / 100 : base;
  };

  const encodePrice = (rate: number) => {
    if (!priceCoding || rate <= 0) return '';
    let code = '';
    for (const char of String(rate)) {
      if (char === '.') code += '.';
      else if (priceCoding[char]) code += priceCoding[char];
    }
    return code;
  };

  const applyBarcodePriceCode = (oldCode: string, newCode: string) => {
    let barcode = newProductBarcode;
    // Strip the new dotted format first, then the legacy dotless format
    for (const candidate of [oldCode, oldCode.replace(/\./g, '')]) {
      if (candidate && barcode.endsWith(candidate)) {
        barcode = barcode.substring(0, barcode.length - candidate.length);
        break;
      }
    }
    if (newCode) barcode += newCode;
    if (barcode !== newProductBarcode) setNewProductBarcode(barcode);
  };

  const getPriceCode = () => {
    if (!priceCoding || !newProductPurchasePrice) return '';
    return encodePrice(getEffectivePurchaseRate());
  };

  const handlePurchasePriceChange = (val: string) => {
    setNewProductPurchasePrice(val);
    if (!priceCoding) return;
    const rate = (type === 'ESTIMATE' || sharedEstimateMode) ? 0 : (newProductIsGstApplicable ? (newProductTaxRate || 0) : 0);
    const toEffective = (base: number) => base > 0 && rate > 0 ? Math.round(base * (1 + rate / 100) * 100) / 100 : base;
    const oldBase = Number(newProductPurchasePrice) || 0;
    const newBase = Number(val) || 0;
    applyBarcodePriceCode(
      encodePrice(toEffective(oldBase)),
      encodePrice(toEffective(newBase))
    );
  };

  const handleTaxRateChange = (val: string) => {
    const oldRate = newProductTaxRate;
    const newRate = parseFloat(val);
    setNewProductTaxRate(newRate);
    if (!priceCoding || type === 'ESTIMATE' || sharedEstimateMode) return;
    const base = Number(newProductPurchasePrice) || 0;
    if (base <= 0) return;
    const gst = newProductIsGstApplicable;
    const toEffective = (r: number) => gst && r > 0 ? Math.round(base * (1 + r / 100) * 100) / 100 : base;
    applyBarcodePriceCode(
      encodePrice(toEffective(oldRate)),
      encodePrice(toEffective(newRate))
    );
  };

  const handleDiscountPercentChange = (val: string) => {
    if (val === '') {
      setNewProductDiscountPercent('');
      setNewProductDiscountFlat('');
      return;
    }
    const mrp = Number(newProductBasePrice) || 0;
    const pct = parseFloat(val);
    const flat = mrp > 0 && !isNaN(pct) ? ((mrp * pct) / 100).toFixed(2) : '';
    setNewProductDiscountPercent(val);
    setNewProductDiscountFlat(flat);
    setNewProductOfferPrice('');
  };

  const handleDiscountFlatChange = (val: string) => {
    if (val === '') {
      setNewProductDiscountPercent('');
      setNewProductDiscountFlat('');
      return;
    }
    const mrp = Number(newProductBasePrice) || 0;
    const flat = parseFloat(val);
    const pct = mrp > 0 && !isNaN(flat) ? ((flat / mrp) * 100).toFixed(2) : '';
    setNewProductDiscountPercent(pct);
    setNewProductDiscountFlat(val);
    setNewProductOfferPrice('');
  };

  const handleOfferPriceChange = (val: string) => {
    if (val === '') {
      setNewProductOfferPrice('');
      return;
    }
    setNewProductOfferPrice(val);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
  };

  const autoGenerateBarcode = async () => {
    if (!isDesktopRuntime() || !tenantId) return;
    const priceCode = getPriceCode();
    const res = await productsApi.generateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined, strip_suffix: priceCode || undefined });
    if (res.success && res.barcode) {
      setNewProductBarcode(res.barcode + priceCode);
    }
  };

  const resetProductForm = () => {
    setShowProductCreateForm(false);
    setEditingProductItemId(null);
    setOriginalProductStock(null);
    setSharedEstimateMode(false);
    setNewProductName('');
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductUom('Pcs');
    setNewProductPurchasePrice('');
    setNewProductBasePrice('');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn('');
    setNewProductTaxRate(18);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice('');
    setNewProductIsGstApplicable(true);
    setNewProductIsDummy(false);
    setNewProductIsCustomCategory(false);
    setNewProductGradeId('');
    setNewProductIsAddingGrade(false);
    setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    setNewProductPcs('');
    setTierPrices({});
    setPaymentType('CASH');
  };

  const handleCreateNewGrade = async () => {
    if (!isDesktopRuntime() || !tenantId || !newProductCategory.trim() || !newProductGradeForm.grade_name.trim()) return;
    setNewProductSavingGrade(true);
    const gradeId = uuidv4();
    const res = await gradesApi.addGrade({
      grade_id: gradeId,
      tenant_id: tenantId,
      category: newProductCategory.trim(),
      grade_name: newProductGradeForm.grade_name.trim(),
      rate: Number(newProductGradeForm.rate) || 0,
      purchase_price: Number(newProductGradeForm.purchase_price) || 0,
      offer_price: Number(newProductGradeForm.offer_price) || 0,
    });
    if (res.success) {
      const fresh = await gradesApi.getGrades(tenantId);
      if (Array.isArray(fresh)) setNewProductGrades(fresh);
      setNewProductGradeId(gradeId);
      if (!newProductBasePrice && newProductGradeForm.rate) setNewProductBasePrice(newProductGradeForm.rate);
      setNewProductIsAddingGrade(false);
      setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    } else {
      onStatusMessage({ text: 'Failed to create grade: ' + (res.error || ''), type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
    }
    setNewProductSavingGrade(false);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-focusable-checkbox]');
    const idx = Array.from(focusable).indexOf(target as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    if (idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const { handleCreateAndAddProduct } = usePurchaseQuickProduct({
    productForm, getPriceCode, hsnInputRefs, onStatusMessage, resetProductForm, setBillItems, setCreatedProductIds,
    setProducts, setProductSearch, tenantId, type,
  });

  const handleSave = async (): Promise<boolean> => {
    if (billItems.length === 0) return true;
    if (!supplierName.trim()) {
      onStatusMessage({ text: 'Supplier name is required.', type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
      return false;
    }

    setIsSaving(true);
    const total = getBillTotal();
    const autoRoundOff = Math.round(total) - total;
    const currentRoundOff = manualRoundOff !== '' ? (Number(manualRoundOff) || 0) : autoRoundOff;
    const totalAmount = Math.round(total + currentRoundOff);
    const billId = editingData?.purchase_bill_id || uuidv4();

    const otherItems = getOtherSectionItems ? getOtherSectionItems() : [];
    const otherProductIds = new Set(otherItems.map(i => i.product_id));

    if (isDesktopRuntime()) {

      let finalBillNumber = billNumber;
      if (!editingData && isDesktopRuntime() && tenantId) {
        try {
          const res = await purchasesApi.getNextPurchaseBillNumber({ tenant_id: tenantId, bill_type: type });
          if (res && res.success && res.billNumber) {
            if (!billNumber || billNumber === peekedBillNumber || billNumber.startsWith('AUTO-')) {
              finalBillNumber = res.billNumber;
              setBillNumber(finalBillNumber);
            }
          }
        } catch (err) {
          console.error('[PurchaseBillManager] Error fetching next bill number on save:', err);
        }
      }

      const payload = {
        purchase_bill_id: billId,
        tenant_id: tenantId,
        bill_number: type === 'ESTIMATE'
          ? (finalBillNumber ? (finalBillNumber.endsWith('-EST') ? finalBillNumber : finalBillNumber + '-EST') : `AUTO-${Date.now()}-EST`)
          : (finalBillNumber || `AUTO-${Date.now()}`),
        supplier_id: supplierId || null,
        supplier_name: supplierName.trim(),
        bill_date: billDate,
        invoice_number: invoiceNumber || null,
        notes: notes || null,
        total_amount: totalAmount,
        bill_type: type,
        payment_type: paymentType,
        items: billItems.map(item => ({
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: Number(item.quantity) || 0,
          purchase_price: Number(item.purchase_price) || 0,
          total_amount: (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0),
          selling_price: item.selling_price ? Number(item.selling_price) || null : null,
          offer_price: item.offer_price ? Number(item.offer_price) || null : null,
          is_gst_applicable: item.is_gst_applicable ?? (type === 'GST' ? 1 : 0),
          tax_rate_percent: type === 'GST' ? (item.tax_rate_percent ?? 0) : 0,
          hsn_sac_code: type === 'GST' ? (item.hsn_sac_code || null) : null,
          skip_stock_update: type === 'GST' ? ((otherProductIds.has(item.product_id) || item.skip_stock_update === 1) ? 1 : 0) : 0,
        })),
      };

      const res = editingData
        ? await purchasesApi.updatePurchaseBill(payload)
        : await purchasesApi.addPurchaseBill(payload);

      if (res.success) {
        setCreatedProductIds([]);
        onStatusMessage({ text: `${type} purchase bill ${editingData ? 'updated' : 'saved'} successfully!`, type: 'success' });
        onSaved();
        setIsSaving(false);
        setTimeout(() => onStatusMessage(null), 3000);
        return true;
      } else {
        onStatusMessage({ text: `Save failed: ${res.error || ''}`, type: 'error' });
        setIsSaving(false);
        setTimeout(() => onStatusMessage(null), 3000);
        return false;
      }
    }
    setIsSaving(false);
    return false;
  };

  const addItemToSection = async (item: {
    product_id: string;
    name: string;
    quantity: string;
    purchase_price: string;
    selling_price: string;
    offer_price?: string;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    skip_stock_update?: number;
  }) => {
    const isGstBill = type === 'GST';
    setBillItems(prev => {
      if (prev.some(i => i.product_id === item.product_id)) return prev;
      return [...prev, {
        ...item,
        is_gst_applicable: isGstBill ? (item.is_gst_applicable ?? 1) : 0,
        tax_rate_percent: isGstBill ? (item.tax_rate_percent ?? 18) : 0,
        skip_stock_update: isGstBill ? 1 : 0,
      }];
    });
  };

  useImperativeHandle(ref, () => ({
    save: handleSave,
    get hasItems() { return billItems.length > 0; },
    focusSearch: () => productSearchInputRef.current?.focus(),
    addItem: addItemToSection,
    getItems: () => billItems.map(i => ({ ...i })),
    replaceItems: (items) => { setBillItems(items.map(i => ({ ...i }))); },
  }));

  useEffect(() => {
    onItemsChange?.(billItems.length > 0);
  }, [billItems.length, onItemsChange]);

  useEffect(() => {
    if (searchRef.current && (products.length > 0 || (productSearch.length >= 2 && products.length === 0 && !showProductCreateForm))) {
      const rect = searchRef.current.getBoundingClientRect();
      setSearchDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setSearchDropdownPos(null);
    }
  }, [products, productSearch, showProductCreateForm]);

  useEffect(() => {
    if (showProductCreateForm) {
      setTimeout(() => firstInputRef.current?.focus(), 50);
      // Auto-generate barcode — match billing page behavior: increment last product's barcode number.
      // Only for NEW products; editing an existing product must keep its own barcode.
      if (!editingProductItemId && isDesktopRuntime() && tenantId && !newProductBarcode) {
        productsApi.getProducts({ tenant_id: tenantId, limit: 1, sortBy: 'created_at' })
          .then((lastProduct: any[]) => {
            if (Array.isArray(lastProduct) && lastProduct.length > 0 && lastProduct[0].sku_barcode) {
              const lastBarcode = lastProduct[0].sku_barcode;
              const match = lastBarcode.match(/(\d+)[^\d]*$/);
              if (match) {
                const numStr = match[1];
                const nextNum = (BigInt(numStr) + 1n).toString();
                setNewProductBarcode(nextNum.padStart(numStr.length, '0'));
              }
            }
          })
          .catch(console.error);
      }
    }
  }, [showProductCreateForm, tenantId, editingProductItemId]);

  const isEstimate = type === 'ESTIMATE';
  return (
    <>
      {/* Bill Info Card */}
      <div className={clsx("bg-card border border-border rounded-[28px] shadow-sm", isEstimate ? "border-amber-500/25" : "border-emerald-500/25")}>
        <div className={clsx("flex items-center gap-4 px-6 py-3.5 border-b border-border/60 flex-wrap rounded-t-[28px]", isEstimate ? "bg-amber-500/[0.04]" : "bg-emerald-500/[0.04]")}>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 block mb-1">
            Bill No {isEstimate ? '(Estimate)' : '(GST)'}
          </label>
          <input
            type="text" value={billNumber}
            onChange={e => setBillNumber(e.target.value)}
            className="w-36 bg-background/50 border border-border rounded-xl px-2.5 py-2 text-xs font-mono tracking-wider text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background focus:outline-none transition-all"
          />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 block mb-1">Invoice No</label>
          <input
            type="text" value={invoiceNumber}
            onChange={e => setInvoiceNumber(e.target.value)}
            placeholder="Supplier inv #"
            className="w-36 bg-background/50 border border-border rounded-xl px-2.5 py-2 text-xs font-mono tracking-wider text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background focus:outline-none transition-all"
          />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 block mb-1">Payment</label>
          <Select
            value={paymentType}
            onChange={v => setPaymentType(v as any)}
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'CREDIT', label: 'Credit' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
            ]}
            triggerClassName="w-28 bg-background/50 border border-border rounded-xl px-2.5 text-xs font-mono tracking-wider text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none shadow-none"
            size="sm"
          />
        </div>
        {onShareAll && (
          <button
            type="button"
            onClick={onShareAll}
            className={clsx(
              "ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer active:scale-95 border transition-all shrink-0",
              isEstimate
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            )}
            title={`Share all items to ${isEstimate ? 'GST Bill' : 'Estimate Bill'}`}
          >
            <Send className="w-3.5 h-3.5" />
            Share All
          </button>
        )}
        </div>
      </div>

      {/* Products Section */}
      <div className="p-5">
        {/* Idea 2: Proactive Tip Banner */}
        <div className="mb-3 px-3.5 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2.5 shadow-2xs">
          <span className="text-base shrink-0">💡</span>
          <p className="font-medium leading-snug">
            <span className="font-bold">Important Tip:</span> If a product already exists in your inventory or was added earlier in this bill, search &amp; select it from the dropdown list below instead of creating a new product.
          </p>
        </div>

        <PurchaseProductSearch
          activePricingTiers={activePricingTiers} addProductToBill={addProductToBill}
          autoGenerateBarcode={autoGenerateBarcode} enableRealPaperStock={enableRealPaperStock}
          handleCreateAndAddProduct={handleCreateAndAddProduct} handleDiscountFlatChange={handleDiscountFlatChange}
          handleDiscountPercentChange={handleDiscountPercentChange} handleFormKeyDown={handleFormKeyDown}
          handleOfferPriceChange={handleOfferPriceChange} handlePurchasePriceChange={handlePurchasePriceChange}
          handleTaxRateChange={handleTaxRateChange} highlightedProductIndex={highlightedProductIndex}
          isSearchingProducts={isSearchingProducts} productItemRefs={productItemRefs} products={products}
          productSearch={productSearch} productSearchInputRef={productSearchInputRef}
          resetProductForm={resetProductForm} searchDropdownPos={searchDropdownPos} searchProducts={searchProducts}
          searchRef={searchRef} setHighlightedProductIndex={setHighlightedProductIndex} setProducts={setProducts}
          setProductSearch={setProductSearch} type={type} productForm={productForm}
        />

        {billItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
            <p className="text-xs font-medium">No products added yet</p>
            <p className="text-[11px] mt-0.5">Search and select products above</p>
          </div>
        ) : (
          <PurchaseBillItemsTable
            billItems={billItems} enableRealPaperStock={enableRealPaperStock}
            getOtherSectionItems={getOtherSectionItems} hsnInputRefs={hsnInputRefs} isEstimate={isEstimate}
            openProductEditor={openProductEditor} otherSectionAddItem={otherSectionAddItem}
            removeBillItem={removeBillItem} setBillItems={setBillItems} toggleBillItemDummy={toggleBillItemDummy}
            type={type} updateBillItem={updateBillItem}
          />
        )}

        {billItems.length > 0 && !isEstimate && (() => {
          const total = getBillTotal();
          const totalGst = billItems.reduce((acc, item) => {
            const rate = item.tax_rate_percent || 0;
            const taxableAmt = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
            if ((item.is_gst_applicable ?? 1) === 1 && rate > 0) {
              return acc + taxableAmt * (rate / 100);
            }
            return acc;
          }, 0);
          const halfGst = totalGst / 2;
          const taxableValue = total - totalGst;
          
          const autoRoundOff = Math.round(total) - total;
          const currentRoundOff = manualRoundOff !== '' ? (Number(manualRoundOff) || 0) : autoRoundOff;
          const roundedTotal = total + currentRoundOff;
          return (
            <div className="flex justify-end mt-3 pt-2.5 border-t border-border/60">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-semibold">Taxable Value</span>
                  <span className="font-bold text-foreground">₹{taxableValue.toFixed(2)}</span>
                </div>
                {totalGst > 0 && (
                  <>
                    <div className="flex justify-between text-xs pl-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">CGST</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{halfGst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs pl-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">SGST</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{halfGst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-border/40 pt-1">
                      <span className="text-muted-foreground font-bold">Total GST</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">₹{totalGst.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1">
                  <span className="text-muted-foreground font-semibold">Round Off</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={autoRoundOff.toFixed(2)}
                    value={manualRoundOff}
                    onChange={e => setManualRoundOff(e.target.value)}
                    className="w-20 text-right bg-background border border-border/80 rounded px-1.5 py-0.5 text-foreground font-bold text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="flex justify-between text-sm border-t-2 border-emerald-500/40 pt-1.5">
                  <span className="font-black uppercase tracking-wider text-foreground">Grand Total</span>
                  <span className="text-base font-black text-emerald-600">₹{roundedTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })()}
        {billItems.length > 0 && isEstimate && (() => {
          const total = getBillTotal();
          const autoRoundOff = Math.round(total) - total;
          const currentRoundOff = manualRoundOff !== '' ? (Number(manualRoundOff) || 0) : autoRoundOff;
          const roundedTotal = total + currentRoundOff;
          return (
            <div className="flex justify-end mt-3 pt-2.5 border-t border-border/60">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Subtotal</span>
                  <span className="font-bold text-foreground">₹{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1">
                  <span className="text-muted-foreground font-semibold">Round Off</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={autoRoundOff.toFixed(2)}
                    value={manualRoundOff}
                    onChange={e => setManualRoundOff(e.target.value)}
                    className="w-20 text-right bg-background border border-border/80 rounded px-1.5 py-0.5 text-foreground font-bold text-xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
                <div className="flex justify-between text-sm border-t-2 border-amber-500/40 pt-1.5">
                  <span className="font-black uppercase tracking-wider text-foreground">Total</span>
                  <p className="text-base font-black text-amber-600">₹{roundedTotal.toFixed(2)}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      {newProductIsAddingGrade && (
        <PurchaseAddGradeDialog
          handleCreateNewGrade={handleCreateNewGrade} handleFormKeyDown={handleFormKeyDown} productForm={productForm}
        />
      )}

      {/* Idea 1: Discard Cleanup Confirmation Modal */}
      {showCleanupModal && (
        <PurchaseCleanupDialog
          createdProductIds={createdProductIds} pendingCloseAction={pendingCloseAction}
          setCreatedProductIds={setCreatedProductIds} setShowCleanupModal={setShowCleanupModal}
          showCleanupModal={showCleanupModal}
        />
      )}
    </>
  );
});
