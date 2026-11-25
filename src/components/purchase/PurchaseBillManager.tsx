import { FloatToast } from '../ui/FloatToast';
import { parseUTCDate } from '../../utils/time/utc';
import { storeDate } from '../../utils/time/dateDisplay';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Save } from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { isDesktopRuntime } from '../../data/client';
import { partiesApi } from '../../data/parties';
import { isAllowedInPurchase } from '../../data/partyRoles';
import { purchasesApi } from '../../data/purchases';
import { type PurchaseBill, type PurchaseBillItem, type PurchaseBillFormHandle } from './purchaseTypes';
import { getPurchaseBillFocusables } from './purchaseFormat';
import { usePurchaseCsvExport } from './hooks/usePurchaseCsvExport';
import { usePurchaseBillPrint } from './hooks/usePurchaseBillPrint';
import { usePurchaseBillSummaries } from './hooks/usePurchaseBillSummaries';
import { SupplierCreateDialog } from './views/SupplierCreateDialog';
import { PurchaseBillViewDialog } from './views/PurchaseBillViewDialog';
import { PurchaseBillList } from './views/PurchaseBillList';
import { PurchaseBillHeader } from './views/PurchaseBillHeader';
import { PurchaseBillDeleteModal } from './views/PurchaseBillDeleteModal';
import { PurchaseBillFormHeaderCard } from './views/PurchaseBillFormHeaderCard';
import { syncApi } from '../../data/sync';
import { PurchaseBillFormSection } from './PurchaseBillFormSection';
import { usePurchaseBarcodePrint } from './hooks/usePurchaseBarcodePrint';
import { BarcodePrintModal } from '../inventory/modals/BarcodePrintModal';
import { BulkBarcodePrintModal } from './views/BulkBarcodePrintModal';

export function PurchaseBillManager({ onClose, isRestricted: _isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
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
  const [isResyncing, setIsResyncing] = useState(false);

  const handleResyncPurchases = async () => {
    if (isResyncing) return;
    setIsResyncing(true);
    try {
      const res = await syncApi.forceResyncEntities(['purchases']);
      if (res?.success) {
        setStatusMessage({ text: 'Purchase bills synced from cloud', type: 'success' });
        await loadBills();
      } else {
        setStatusMessage({ text: res?.error || 'Re-sync failed', type: 'error' });
      }
    } catch {
      setStatusMessage({ text: 'Re-sync failed', type: 'error' });
    } finally {
      setIsResyncing(false);
    }
  };
  const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);
  const [editHasItems, setEditHasItems] = useState(false);
  const handleEditItemsLoaded = useCallback(() => setEditHasItems(true), [setEditHasItems]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<PurchaseBill | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const [billSummaries, setBillSummaries] = useState<Record<string, {
    totalQty: number;
    cgst: number;
    sgst: number;
    igst: number;
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
      const from = parseUTCDate(dateFrom);
      from.setHours(0, 0, 0, 0);
      res = res.filter(b => parseUTCDate(b.bill_date as string) >= from);
    }
    if (dateTo) {
      const to = parseUTCDate(dateTo);
      to.setHours(23, 59, 59, 999);
      res = res.filter(b => parseUTCDate(b.bill_date as string) <= to);
    }
    return res;
  }, [bills, filterType, filterInvoice, dateFrom, dateTo, billSummaries]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [billDate, setBillDate] = useState(storeDate(new Date(), 'en-CA'));
  const [billNotes, setBillNotes] = useState('');
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof partiesApi.getParties>>>([]);
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

  const editingBillDetails = editingBill as (PurchaseBill & { payment_type?: string; total_amount?: number | string | null }) | null;
  const editingBillPaymentType = editingBillDetails?.payment_type;
  const editingBillTotalAmount = Number(editingBillDetails?.total_amount) || 0;

  // Stable memoized editingData objects to prevent infinite re-render cascades
  // (Inline object literals cause child useEffect([editingData]) to fire on every render)
  const gstEditingData = useMemo(() =>
    editingBill?.bill_type === 'GST'
      ? {
          purchase_bill_id: editingBill.purchase_bill_id,
          bill_number: editingBill.bill_number,
          invoice_number: editingBill?.invoice_number,
          payment_type: editingBillPaymentType || 'CASH',
          total_amount: editingBillTotalAmount,
          is_interstate: editingBill.is_interstate,
        }
      : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editingBill object and editingBillTotalAmount excluded: the original memo tracks only the listed bill fields, so unrelated record or total changes must not refresh the child editor.
    [editingBill?.purchase_bill_id, editingBill?.bill_number, editingBill?.invoice_number, editingBill?.bill_type, editingBill?.is_interstate, editingBillPaymentType]
  );
  const estEditingData = useMemo(() =>
    editingBill?.bill_type === 'ESTIMATE'
      ? {
          purchase_bill_id: editingBill.purchase_bill_id,
          bill_number: editingBill.bill_number,
          invoice_number: editingBill?.invoice_number,
          payment_type: editingBillPaymentType || 'CASH',
          total_amount: editingBillTotalAmount,
        }
      : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editingBill object and editingBillTotalAmount excluded: the original memo tracks only the listed bill fields, so unrelated record or total changes must not refresh the child editor.
    [editingBill?.purchase_bill_id, editingBill?.bill_number, editingBill?.invoice_number, editingBill?.bill_type, editingBillPaymentType]
  );

  // Stable memoized cross-section addItem callbacks
  const gstOtherAddItem = useCallback<PurchaseBillFormHandle['addItem']>((item) => {
    estRef.current?.addItem(item);
  }, [estRef]);
  const estOtherAddItem = useCallback<PurchaseBillFormHandle['addItem']>((item) => {
    gstRef.current?.addItem(item);
  }, [gstRef]);
  const getEstimateItems = useCallback(() => estRef.current?.getItems?.() || [], [estRef]);
  const getGstItems = useCallback(() => gstRef.current?.getItems?.() || [], [gstRef]);

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

  useEffect(() => {
    loadBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadBills is render-local; tenantId and searchQuery are the intended fetch triggers.
  }, [tenantId, searchQuery]);

  useEffect(() => {
    if (showAddForm && isDesktopRuntime() && tenantId) {
      partiesApi.getParties(tenantId)
        .then(res => { if (Array.isArray(res)) setSuppliers(res.filter(party => isAllowedInPurchase(party.party_type))); })
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
    setBillDate(bill.bill_date || storeDate(new Date(), 'en-CA'));
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

  const {
    printModalProduct,
    printQuantity,
    setPrintQuantity,
    printPrice,
    setPrintPrice,
    labelCodeType,
    grades,
    closePrintModal,
    openBarcodeModalForFormItem,
    openBarcodeModalForBillItem,
    printProductLabel,
    bulkPrintModalOpen,
    bulkPrintBill,
    bulkPrintItems,
    isBulkPrinting,
    openBulkBarcodeModal,
    closeBulkBarcodeModal,
    executeBulkBarcodePrint,
  } = usePurchaseBarcodePrint({ tenantId, setStatusMessage });

  const handleEscape = useCallback(() => {
    if (bulkPrintModalOpen) {
      closeBulkBarcodeModal();
    } else if (printModalProduct) {
      closePrintModal();
    } else if (deleteConfirmOpen) {
      if (!deleteSaving) {
        setDeleteConfirmOpen(false);
        setBillToDelete(null);
      }
    } else if (showPartyCreateForm) {
      setShowPartyCreateForm(false);
    } else if (viewingBill) {
      setViewingBill(null);
    } else if (showAddForm) {
      setShowAddForm(false);
      setEditingBill(null);
      setEditHasItems(false);
      setGstHasItems(false);
      setEstHasItems(false);
    } else {
      onClose();
    }
  }, [
    bulkPrintModalOpen,
    closeBulkBarcodeModal,
    printModalProduct,
    closePrintModal,
    deleteConfirmOpen,
    deleteSaving,
    setDeleteConfirmOpen,
    setBillToDelete,
    showPartyCreateForm,
    setShowPartyCreateForm,
    viewingBill,
    setViewingBill,
    showAddForm,
    setShowAddForm,
    setEditingBill,
    setEditHasItems,
    setGstHasItems,
    setEstHasItems,
    onClose,
  ]);
  useCloseOnEscape(handleEscape);

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
      if (Array.isArray(updated)) setSuppliers(updated.filter(party => isAllowedInPurchase(party.party_type)));
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
      <PurchaseBillHeader
        showAddForm={showAddForm}
        editingBill={editingBill}
        billsCount={bills.length}
        onClose={onClose}
        onCloseForm={() => {
          setShowAddForm(false);
          setEditingBill(null);
          setEditHasItems(false);
          setGstHasItems(false);
          setEstHasItems(false);
        }}
      />

      {/* ─── FLOATING TOASTS ─── */}
      <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} title={statusMessage?.type === 'success' ? 'PURCHASE STATUS' : 'PURCHASE ALERT'} duration={0} />

      {/* ── LIST VIEW ── */}
      {!showAddForm && (
        <>
          <PurchaseBillList
            bills={bills} billSummaries={billSummaries} dateFrom={dateFrom} dateTo={dateTo}
            filteredBills={filteredBills} filterType={filterType} handleDelete={handleDelete}
            handleEditBill={handleEditBill} handleExportCSV={handleExportCSV} handlePrintBill={handlePrintBill}
            handlePrintBillBarcodes={openBulkBarcodeModal}
            handleViewBill={handleViewBill} isExporting={isExporting} loading={loading} searchQuery={searchQuery}
            setDateFrom={setDateFrom} setDateTo={setDateTo} setEditHasItems={setEditHasItems}
            setEditingBill={setEditingBill} setEstHasItems={setEstHasItems} setFilterType={setFilterType}
            setGstHasItems={setGstHasItems} setSearchQuery={setSearchQuery} setShowAddForm={setShowAddForm}
            showAddForm={showAddForm} viewingBill={viewingBill}
            isResyncing={isResyncing} onResyncPurchases={handleResyncPurchases}
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
          <PurchaseBillFormHeaderCard
            billDateInputRef={billDateInputRef}
            billDate={billDate}
            setBillDate={setBillDate}
            supplierInputRef={supplierInputRef}
            supplierSearch={supplierSearch}
            setSupplierSearch={setSupplierSearch}
            supplierName={supplierName}
            setSupplierName={setSupplierName}
            setSupplierId={setSupplierId}
            highlightedSupplierIndex={highlightedSupplierIndex}
            setHighlightedSupplierIndex={setHighlightedSupplierIndex}
            filteredSuppliers={filteredSuppliers}
            supplierOptionsRef={supplierOptionsRef}
            selectSupplier={selectSupplier}
            onOpenCreateSupplier={() => { setNewPartyForm(prev => ({ ...prev, name: supplierSearch || '' })); setShowPartyCreateForm(true); }}
            billType={billType}
            setBillType={setBillType}
            gstHasItems={gstHasItems}
            estHasItems={estHasItems}
            billNotes={billNotes}
            setBillNotes={setBillNotes}
          />

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
                onItemsLoaded={handleEditItemsLoaded}
                onItemsChange={setGstHasItems}
                onShareAll={() => handleBulkShare('GST')}
                otherSectionAddItem={gstOtherAddItem}
                editingData={gstEditingData}
                getOtherSectionItems={getEstimateItems}
                onPrintBarcode={openBarcodeModalForFormItem}
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
                onItemsLoaded={handleEditItemsLoaded}
                onItemsChange={setEstHasItems}
                onShareAll={() => handleBulkShare('ESTIMATE')}
                otherSectionAddItem={estOtherAddItem}
                editingData={estEditingData}
                getOtherSectionItems={getGstItems}
                onPrintBarcode={openBarcodeModalForFormItem}
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
          onPrintItemBarcode={openBarcodeModalForBillItem}
          onPrintAllBarcodes={openBulkBarcodeModal}
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
      <PurchaseBillDeleteModal
        isOpen={deleteConfirmOpen}
        bill={billToDelete}
        onClose={() => { if (!deleteSaving) { setDeleteConfirmOpen(false); setBillToDelete(null); } }}
        onConfirm={confirmDeleteBill}
        isDeleting={deleteSaving}
      />

      {/* Barcode Label Print Modal */}
      <BarcodePrintModal
        printModalProduct={printModalProduct}
        onClose={closePrintModal}
        labelCodeType={labelCodeType}
        printPrice={printPrice}
        setPrintPrice={setPrintPrice}
        printQuantity={printQuantity}
        setPrintQuantity={setPrintQuantity}
        printProductLabel={printProductLabel}
        grades={grades}
      />

      {/* Bulk Barcode Label Print Modal */}
      {bulkPrintModalOpen && (
        <BulkBarcodePrintModal
          isOpen={bulkPrintModalOpen}
          bill={bulkPrintBill}
          items={bulkPrintItems}
          onClose={closeBulkBarcodeModal}
          onPrint={executeBulkBarcodePrint}
          isPrinting={isBulkPrinting}
        />
      )}
    </div>
  );
}

