import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  X, Trash2, User,
  CheckCircle2, AlertCircle, Save,
  Receipt, Tag, RefreshCw,
  UserPlus,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { isDesktopRuntime } from '../data/client';
import { partiesApi } from '../data/parties';
import { purchasesApi } from '../data/purchases';
import { type PurchaseBill, type PurchaseBillItem, type PurchaseBillFormHandle } from './purchase/purchaseTypes';
import { getPurchaseBillFocusables } from './purchase/purchaseFormat';
import { usePurchaseCsvExport } from './purchase/hooks/usePurchaseCsvExport';
import { usePurchaseBillPrint } from './purchase/hooks/usePurchaseBillPrint';
import { usePurchaseBillSummaries } from './purchase/hooks/usePurchaseBillSummaries';
import { SupplierCreateDialog } from './purchase/views/SupplierCreateDialog';
import { PurchaseBillViewDialog } from './purchase/views/PurchaseBillViewDialog';
import { PurchaseBillList } from './purchase/views/PurchaseBillList';
import { PurchaseBillFormSection } from './purchase/PurchaseBillFormSection';

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
      res = res.filter(b => new Date(b.bill_date as string) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      res = res.filter(b => new Date(b.bill_date as string) <= to);
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
    setSupplierId(bill.supplier_id as string);
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

  const selectSupplier = (supplier: { name: string; party_id: string }) => {
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
                tenantId={tenantId as string}
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
                tenantId={tenantId as string}
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

