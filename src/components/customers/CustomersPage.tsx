import { storeDate } from '../../utils/time/dateDisplay';
import { getCurrencyPrefix } from '../../utils/localization/storeProfile';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Building2, Trash2, AlertTriangle, Loader2, Save, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { Modal } from '../ui/Modal';
import { FloatToast } from '../ui/FloatToast';
import { getStoreTimezone } from '../../utils/time/timezoneHelper';
import { isDesktopRuntime } from '../../data/client';
import { pricingTiersApi } from '../../data/pricingTiers';
import { useLoyaltyEnabled } from '../../hooks/useLoyaltyEnabled';
import { formatCurrency } from '../../utils/pricing/money';
import { type PricingTier, type Customer, type Party, type LoyaltyTx, type InvoiceRecord, type View, type DetailTab, type InvoiceItemRow } from './customerTypes';
import { findMatchingPartyForCustomer } from './customerUtils';
import { EditCustomerModal } from './views/EditCustomerModal';
import { AddCustomerModal } from './views/AddCustomerModal';
import { CustomerInvoiceModal } from './views/CustomerInvoiceModal';
import { CustomerDetailView } from './views/CustomerDetailView';
import { CustomerListView } from './views/CustomerListView';
import { useCustomerInvoiceExports } from './hooks/useCustomerInvoiceExports';
import { useCustomerEditing } from './hooks/useCustomerEditing';
import { useCustomerData } from './hooks/useCustomerData';
import { useCustomerActions } from './hooks/useCustomerActions';
import { CustomerPageHeader } from './views/CustomerPageHeader';
import { syncApi } from '../../data/sync';

export function CustomersPage({
  onClose,
  isRestricted,
  onOpenParty,
  initialCustomerIdOrQuery,
}: {
  onClose: () => void;
  isRestricted?: boolean;
  onOpenParty?: (partyIdOrQuery?: string, customerIdOrQuery?: string) => void;
  initialCustomerIdOrQuery?: string;
}) {
  useCloseOnEscape(onClose);
  const { tenantId, role } = useAuthStore();
  const isOwner = !role || ['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPER_ADMIN', 'STAFF', 'BILLER', 'CASHIER'].includes(role.toUpperCase());

  const listScrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastInteractedCustomerId = useRef<string | null>(null);
  const savedScrollTop = useRef<number>(0);
  const processedInitialCustomer = useRef<string | null>(null);
  const [highlightedCustomerId, setHighlightedCustomerId] = useState<string | null>(null);

  const [visibleCount, setVisibleCount] = useState(50);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const partiesRef = useRef<Party[]>([]);
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [filterCredit, setFilterCredit] = useState<'all' | 'credit' | 'no-credit'>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterPricingTier, setFilterPricingTier] = useState<string>('');
  const [isResyncing, setIsResyncing] = useState(false);

  const handleResyncCustomers = async () => {
    if (isResyncing) return;
    setIsResyncing(true);
    try {
      const res = await syncApi.forceResyncEntities(['parties']);
      if (res?.success) {
        showStatus('Customers & ledgers synced from cloud', 'success');
        await loadCustomers(true);
      } else {
        showStatus(res?.error || 'Re-sync failed', 'error');
      }
    } catch {
      showStatus('Re-sync failed', 'error');
    } finally {
      setIsResyncing(false);
    }
  };

  const [view, setView] = useState<View>(() => initialCustomerIdOrQuery ? 'detail' : 'list');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [matchedParty, setMatchedParty] = useState<Party | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('purchases');
  const [initialLoading, setInitialLoading] = useState(initialCustomerIdOrQuery ? true : false);

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Bill download / print state
  const [billFilterStart, setBillFilterStart] = useState('');
  const [billFilterEnd, setBillFilterEnd] = useState('');
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
  const [exportingFilteredInvoices, setExportingFilteredInvoices] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [loyaltyTxs, setLoyaltyTxs] = useState<LoyaltyTx[]>([]);
  const [loyaltyTxsLoading, setLoyaltyTxsLoading] = useState(false);
  const loyaltyEnabled = useLoyaltyEnabled(tenantId);

  // Loyalty Points Adjustment Modal state
  const [adjustPointsModalOpen, setAdjustPointsModalOpen] = useState(false);
  const [adjustPointsValue, setAdjustPointsValue] = useState<number | ''>('');
  const [adjustPointsType, setAdjustPointsType] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [adjustPointsReason, setAdjustPointsReason] = useState('');
  const [adjustPointsLoading, setAdjustPointsLoading] = useState(false);
  const [recalculatingPoints, setRecalculatingPoints] = useState(false);

  // Invoice Detail Modal state
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Delete Customer Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [matchedPartyToDelete, setMatchedPartyToDelete] = useState<Party | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Add Customer Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isSavingAdd, setIsSavingAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    phone: '',
    address: '',
    pricing_tier_id: '',
    credit_limit: '',
    credit_period_enabled: false,
    credit_period_days: '30',
    credit_period_basis: 'BILL_BASED',
    restrict_on_credit_expiry: true
  });

  // Edit Customer Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    address: '',
    pricing_tier_id: '',
    credit_limit: '',
    credit_period_enabled: false,
    credit_period_days: '30',
    credit_period_basis: 'BILL_BASED',
    restrict_on_credit_expiry: true
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showStatus = useCallback((text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  }, [setStatusMessage]);

  const handleDeleteCustomerClick = (cust: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isOwner) {
      showStatus('Only owners can delete customers', 'error');
      return;
    }
    const pMatch = findMatchingPartyForCustomer(cust, parties);
    setCustomerToDelete(cust);
    setMatchedPartyToDelete(pMatch || null);
    setDeleteModalOpen(true);
  };


  const handleAddCustomerClick = () => {
    if (!isOwner) {
      showStatus('Only owners can add customers', 'error');
      return;
    }
    setAddForm({
      name: '',
      phone: '',
      address: '',
      pricing_tier_id: '',
      credit_limit: '',
      credit_period_enabled: false,
      credit_period_days: '30',
      credit_period_basis: 'BILL_BASED',
      restrict_on_credit_expiry: true,
    });
    setAddModalOpen(true);
  };

  const handleEditCustomerClick = (cust: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isOwner) {
      showStatus('Only owners can edit customers', 'error');
      return;
    }
    setEditingCustomer(cust);
    setEditForm({
      name: cust.name,
      phone: cust.phone || '',
      address: cust.address || '',
      pricing_tier_id: cust.pricing_tier_id || '',
      credit_limit: cust.credit_limit != null && Number(cust.credit_limit) > 0 ? String(cust.credit_limit) : '',
      credit_period_enabled: Boolean(cust.credit_period_enabled),
      credit_period_days: String(cust.credit_period_days || 30),
      credit_period_basis: cust.credit_period_basis || 'BILL_BASED',
      restrict_on_credit_expiry: cust.restrict_on_credit_expiry !== false && cust.restrict_on_credit_expiry !== 0,
    });
    setEditModalOpen(true);
  };

  const loadPricingTiers = useCallback(async () => {
    if (!tenantId || !isDesktopRuntime()) return;
    try {
      const tiers = await pricingTiersApi.getPricingTiers(tenantId);
      setPricingTiers(Array.isArray(tiers) ? tiers : []);
    } catch {
      // silent fail
    }
  }, [tenantId]);

  const { loadCustomers, loadCustomerDetails } = useCustomerData({
    customers, debouncedSearchQuery, filterActive, filterCredit, filterOverdue, filterPricingTier,
    findMatchingPartyForCustomer, lastInteractedCustomerIdRef: lastInteractedCustomerId, listScrollRef, parties, partiesRef, savedScrollTopRef: savedScrollTop,
    setBillFilterEnd, setBillFilterStart, setCustomers, setDetailTab, setFilterLoading, setInvoices,
    setInvoicesLoading, setLoading, setLoyaltyTxs, setLoyaltyTxsLoading, setMatchedParty, setParties,
    setSelectedCustomer, setView, setVisibleCount, showStatus, tenantId, visibleCount,
  });

  const { handleConfirmDeleteCustomer, handleRecalculateCustomerPoints, handleOpenInvoiceDetail, handleEditBillFromCustomerModal, handleNavigateToParty } = useCustomerActions({
    customerToDelete, invoiceItems, loadCustomers, matchedParty, onClose, onOpenParty, selectedCustomer,
    setCustomers, setCustomerToDelete, setDeleteModalOpen, setDeleteSaving,
    setInvoiceItems, setItemsLoading, setLoyaltyTxs, setMatchedPartyToDelete, setRecalculatingPoints,
    setSelectedCustomer, setView, setViewingInvoice, showStatus, tenantId, viewingInvoice,
  });

  const filtersMountedRef = useRef(false);
  useEffect(() => {
    loadCustomers(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCustomers is mount-only here; the separate filter effect owns list refreshes.
  }, []); // initial load; the filter effect below skips its mount run
  useEffect(() => {
    if (!filtersMountedRef.current) { filtersMountedRef.current = true; return; }
    loadCustomers(false);
    setVisibleCount(50);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCustomers excluded: filter changes remain the only customer-list refresh triggers.
  }, [debouncedSearchQuery, filterActive, filterCredit, filterOverdue, filterPricingTier]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadPricingTiers loads the settings needed by the initial customer list.
    loadPricingTiers();
  }, [loadPricingTiers]);

  // ── Intersection Observer & Scroll for infinite scrolling ──
  useEffect(() => {
    if (view !== 'list') return;
    const scrollContainer = listScrollRef.current;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          setVisibleCount(prev => (prev < customers.length ? prev + 50 : prev));
        }
      },
      {
        root: scrollContainer,
        rootMargin: '150px',
        threshold: 0.05,
      }
    );

    obs.observe(sentinel);

    return () => {
      obs.disconnect();
    };
  }, [view, customers.length]);

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    savedScrollTop.current = el.scrollTop;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 200) {
      setVisibleCount(prev => (prev < customers.length ? prev + 50 : prev));
    }
  }, [customers.length]);

  // Debounce search query with 0ms instant clear
  useEffect(() => {
    if (!searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an empty searchQuery clears the debounced filter immediately to preserve the 0ms clear behavior.
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Restore scroll position and highlight customer row when returning to list
  useEffect(() => {
    if (view === 'list' && (lastInteractedCustomerId.current || savedScrollTop.current > 0)) {
      const targetId = lastInteractedCustomerId.current;
      if (targetId) {
        setHighlightedCustomerId(targetId);
        setTimeout(() => setHighlightedCustomerId(null), 3000);
      }

      const restore = () => {
        if (targetId) {
          const row = document.getElementById(`customer-row-${targetId}`);
          if (row) {
            row.scrollIntoView({ block: 'center', behavior: 'instant' });
            return true;
          }
        }
        if (listScrollRef.current && savedScrollTop.current > 0) {
          listScrollRef.current.scrollTop = savedScrollTop.current;
          return true;
        }
        return false;
      };

      restore();
      const raf1 = requestAnimationFrame(() => {
        if (!restore()) {
          requestAnimationFrame(restore);
        }
      });
      const t1 = setTimeout(restore, 50);
      const t2 = setTimeout(restore, 150);
      const t3 = setTimeout(restore, 300);

      return () => {
        cancelAnimationFrame(raf1);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [view]);

  const { handleConfirmAddCustomer, handleConfirmEditCustomer, handleAdjustPointsSubmit } = useCustomerEditing({
    addForm, adjustPointsReason, adjustPointsType, adjustPointsValue, editForm, editingCustomer, loadCustomers,
    pricingTiers, selectedCustomer, setAddModalOpen, setAdjustPointsLoading, setAdjustPointsModalOpen,
    setAdjustPointsReason, setAdjustPointsValue, setCustomers, setEditingCustomer, setEditModalOpen,
    setIsSavingAdd, setIsSavingEdit, setLoyaltyTxs, setSelectedCustomer, showStatus, tenantId,
  });

  useEffect(() => {
    if (!initialCustomerIdOrQuery || customers.length === 0) return;
    if (processedInitialCustomer.current === initialCustomerIdOrQuery) return;

    processedInitialCustomer.current = initialCustomerIdOrQuery;
    const q = initialCustomerIdOrQuery.trim().toLowerCase();
    const found = customers.find(c =>
      c.customer_id === initialCustomerIdOrQuery ||
      (c.phone && String(c.phone).trim() === initialCustomerIdOrQuery.trim()) ||
      (c.name && c.name.trim().toLowerCase() === q)
    );
    if (found) {
      loadCustomerDetails(found);
    }
    setInitialLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCustomerDetails is a render-local opener; this ref-guarded handoff should run once for the initial customer.
  }, [initialCustomerIdOrQuery, customers]);

  /* ─── Bill CSV export + individual download/print ─── */
  const filteredInvoices = useMemo(() => {
    if (!billFilterStart && !billFilterEnd) return invoices;
    return invoices.filter(inv => {
      const key = storeDate(inv.created_at, 'en-CA', { timeZone: getStoreTimezone() });
      if (billFilterStart && key < billFilterStart) return false;
      if (billFilterEnd && key > billFilterEnd) return false;
      return true;
    });
  }, [invoices, billFilterStart, billFilterEnd]);

  const { handleDownloadInvoiceCsv, handleDownloadFilteredInvoicesCsv, handleDownloadFilteredInvoicesPdf } = useCustomerInvoiceExports({
    billFilterEnd, billFilterStart, filteredInvoices, selectedCustomer, loyaltyEnabled, setExportingFilteredInvoices,
    setExportingPdf, setInvoiceBusyId, showStatus, tenantId,
  });

  const totalPointsIssued = customers.reduce((s, c) => s + (c.total_points_earned || 0), 0);
  const totalPointsRedeemed = customers.reduce((s, c) => s + (c.total_points_redeemed || 0), 0);
  const totalPointsActive = customers.reduce((s, c) => s + (c.current_points_balance || 0), 0);

  const totalLifetimeSpend = invoices.reduce((s, inv) => s + (inv.grand_total || 0), 0);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background select-none overflow-hidden">
      <CustomerPageHeader
        view={view}
        selectedCustomer={selectedCustomer}
        customersCount={customers.length}
        loyaltyEnabled={loyaltyEnabled}
        filterActive={filterActive}
        filterCredit={filterCredit}
        filterPricingTier={filterPricingTier}
        setFilterActive={setFilterActive}
        setFilterCredit={setFilterCredit}
        setFilterPricingTier={setFilterPricingTier}
        isOwner={isOwner}
        handleAddCustomerClick={handleAddCustomerClick}
        handleEditCustomerClick={handleEditCustomerClick}
        handleDeleteCustomerClick={handleDeleteCustomerClick}
        isRestricted={isRestricted}
        onClose={onClose}
        setView={setView}
        isResyncing={isResyncing}
        onResyncCustomers={handleResyncCustomers}
      />

      {/* Main Content Body */}
      {view === 'list' && (
        <CustomerListView
          customers={customers} filterActive={filterActive} filterCredit={filterCredit} filterLoading={filterLoading}
          filterOverdue={filterOverdue} filterPricingTier={filterPricingTier}
          handleDeleteCustomerClick={handleDeleteCustomerClick} handleListScroll={handleListScroll}
          highlightedCustomerId={highlightedCustomerId} isOwner={isOwner} listScrollRef={listScrollRef}
          loadCustomerDetails={loadCustomerDetails} loading={loading} loyaltyEnabled={loyaltyEnabled}
          pricingTiers={pricingTiers} searchQuery={searchQuery} sentinelRef={sentinelRef}
          setDebouncedSearchQuery={setDebouncedSearchQuery} setFilterActive={setFilterActive}
          setFilterCredit={setFilterCredit} setFilterOverdue={setFilterOverdue}
          setFilterPricingTier={setFilterPricingTier} setSearchQuery={setSearchQuery}
          totalPointsActive={totalPointsActive} totalPointsIssued={totalPointsIssued}
          totalPointsRedeemed={totalPointsRedeemed} visibleCount={visibleCount}
        />
      )}

      {/* Customer Detail View */}
      {view === 'detail' && (
        initialLoading ? (
          <div className="flex-1 flex flex-col min-h-0 w-full px-4 sm:px-6 py-4 space-y-4 overflow-y-auto">
            {/* Loading Skeleton */}
            <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0 animate-pulse">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-muted/30 border border-border/30 flex items-center justify-center font-black text-xl shrink-0" />
                <div className="space-y-1 min-w-0">
                  <div className="h-6 w-48 bg-muted/30 rounded-lg" />
                  <div className="h-4 w-32 bg-muted/30 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs animate-pulse space-y-4">
              <div className="h-4 w-1/3 bg-muted/30 rounded-lg" />
              <div className="h-4 w-1/2 bg-muted/30 rounded-lg" />
              <div className="h-4 w-2/3 bg-muted/30 rounded-lg" />
              <div className="h-4 w-1/4 bg-muted/30 rounded-lg" />
            </div>
            <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs animate-pulse space-y-4">
              <div className="h-4 w-1/3 bg-muted/30 rounded-lg" />
              <div className="grid grid-cols-3 gap-4">
                <div className="h-24 bg-muted/30 rounded-xl" />
                <div className="h-24 bg-muted/30 rounded-xl" />
                <div className="h-24 bg-muted/30 rounded-xl" />
              </div>
              <div className="h-24 bg-muted/30 rounded-xl" />
              <div className="h-24 bg-muted/30 rounded-xl" />
            </div>
          </div>
        ) : selectedCustomer ? (
          <CustomerDetailView
            billFilterEnd={billFilterEnd} billFilterStart={billFilterStart} detailTab={detailTab}
            exportingFilteredInvoices={exportingFilteredInvoices} exportingPdf={exportingPdf}
            filteredInvoices={filteredInvoices} handleDownloadFilteredInvoicesCsv={handleDownloadFilteredInvoicesCsv}
            handleDownloadFilteredInvoicesPdf={handleDownloadFilteredInvoicesPdf}
            handleDownloadInvoiceCsv={handleDownloadInvoiceCsv} handleNavigateToParty={handleNavigateToParty}
            handleOpenInvoiceDetail={handleOpenInvoiceDetail}
            handleRecalculateCustomerPoints={handleRecalculateCustomerPoints} invoiceBusyId={invoiceBusyId}
            invoices={invoices} invoicesLoading={invoicesLoading} loyaltyEnabled={loyaltyEnabled}
            loyaltyTxs={loyaltyTxs} loyaltyTxsLoading={loyaltyTxsLoading} matchedParty={matchedParty}
            recalculatingPoints={recalculatingPoints} selectedCustomer={selectedCustomer}
            setAdjustPointsModalOpen={setAdjustPointsModalOpen} setAdjustPointsReason={setAdjustPointsReason}
            setAdjustPointsType={setAdjustPointsType} setAdjustPointsValue={setAdjustPointsValue}
            setBillFilterEnd={setBillFilterEnd} setBillFilterStart={setBillFilterStart} setDetailTab={setDetailTab}
            totalLifetimeSpend={totalLifetimeSpend}
          />
      ) : null )}

      {/* Invoice Detail Modal */}
      {viewingInvoice && (
        <CustomerInvoiceModal
          handleDownloadInvoiceCsv={handleDownloadInvoiceCsv}
          handleEditBillFromCustomerModal={handleEditBillFromCustomerModal} invoiceBusyId={invoiceBusyId}
          invoiceItems={invoiceItems} itemsLoading={itemsLoading} loyaltyEnabled={loyaltyEnabled}
          setViewingInvoice={setViewingInvoice} viewingInvoice={viewingInvoice}
        />
      )}

      {/* Delete Customer Confirmation Modal */}
      {deleteModalOpen && customerToDelete && (
        <Modal isOpen={deleteModalOpen} onClose={() => { if (!deleteSaving) setDeleteModalOpen(false); }} title="Delete Customer & Ledger">
          <div className="space-y-4 select-none">
            <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-destructive/20 text-destructive shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-xs">
                <p className="font-extrabold text-destructive text-sm">Permanent Customer & Ledger Deletion</p>
                <p className="text-muted-foreground leading-relaxed">
                  Are you sure you want to delete customer <strong className="text-foreground">{customerToDelete.name}</strong>?
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  This action will soft-delete their customer profile, associated records, and any associated <strong>Party Ledger entries</strong>.
                </p>
              </div>
            </div>

            {/* Matched Party Info & Balance Warning */}
            {matchedPartyToDelete && (
              <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-primary" /> Matched Party Ledger:
                  </span>
                  <span className="text-foreground">{matchedPartyToDelete.name}</span>
                </div>
                <div className="flex items-center justify-between font-bold pt-1.5 border-t border-border/40">
                  <span className="text-muted-foreground">Current Ledger Balance:</span>
                  <span className={clsx(
                    "font-mono font-black text-sm",
                    matchedPartyToDelete.balance > 0 ? "text-rose-600 dark:text-rose-400" :
                    matchedPartyToDelete.balance < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                  )}>
                    {matchedPartyToDelete.balance > 0
                      ? `+${formatCurrency(matchedPartyToDelete.balance)} (Receivable)`
                      : matchedPartyToDelete.balance < 0
                      ? `-${formatCurrency(Math.abs(matchedPartyToDelete.balance))} (Payable)`
                      : `${getCurrencyPrefix()}0.00 (Settled)`}
                  </span>
                </div>
                {matchedPartyToDelete.balance !== 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                    ⚠️ Warning: This party has an active balance. Deleting will soft-delete the party and clear its ledger entry history.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                disabled={deleteSaving}
                onClick={handleConfirmDeleteCustomer}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                {deleteSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting Customer & Ledger...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Customer & Ledger</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Customer Modal */}
      {addModalOpen && (
        <AddCustomerModal
          addForm={addForm} addModalOpen={addModalOpen} handleConfirmAddCustomer={handleConfirmAddCustomer}
          isSavingAdd={isSavingAdd} pricingTiers={pricingTiers} setAddForm={setAddForm}
          setAddModalOpen={setAddModalOpen}
        />
      )}

      {/* Edit Customer Modal */}
      {editModalOpen && editingCustomer && (
        <EditCustomerModal
          editForm={editForm} editingCustomer={editingCustomer} editModalOpen={editModalOpen}
          handleConfirmEditCustomer={handleConfirmEditCustomer} isSavingEdit={isSavingEdit} pricingTiers={pricingTiers}
          setEditForm={setEditForm} setEditingCustomer={setEditingCustomer} setEditModalOpen={setEditModalOpen}
        />
      )}

      {/* Adjust Loyalty Points Modal */}
      {adjustPointsModalOpen && selectedCustomer && loyaltyEnabled && (
        <Modal
          isOpen={adjustPointsModalOpen}
          onClose={() => { if (!adjustPointsLoading) setAdjustPointsModalOpen(false); }}
          title="Adjust Loyalty Points"
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl border border-border bg-amber-500/5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-muted-foreground">Customer:</span>
                <span className="font-black text-foreground">{selectedCustomer.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-muted-foreground">Current Balance:</span>
                <span className="font-black font-mono text-amber-600 dark:text-amber-400">
                  {(Number(selectedCustomer.current_points_balance) || 0).toFixed(0)} pts
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustPointsType('ADD')}
                    className={clsx(
                      'py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5',
                      adjustPointsType === 'ADD'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-black'
                        : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Points (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustPointsType('DEDUCT')}
                    className={clsx(
                      'py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5',
                      adjustPointsType === 'DEDUCT'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 font-black'
                        : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span>Deduct Points (-)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Points Amount <span className="text-destructive">*</span></label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={adjustPointsValue}
                  onChange={e => setAdjustPointsValue(e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value))))}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm font-bold font-mono text-foreground placeholder:text-muted-foreground/60 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 focus:outline-none transition-all shadow-sm"
                  placeholder="e.g. 50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Reason / Description</label>
                <input
                  type="text"
                  value={adjustPointsReason}
                  onChange={e => setAdjustPointsReason(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 focus:outline-none transition-all shadow-sm"
                  placeholder="e.g. Festival bonus / promotional reward"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                disabled={adjustPointsLoading}
                onClick={() => setAdjustPointsModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border transition-all cursor-pointer shadow-sm active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={adjustPointsLoading || !adjustPointsValue || Number(adjustPointsValue) <= 0}
                onClick={handleAdjustPointsSubmit}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                {adjustPointsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Points</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} />
    </div>
  );
}
