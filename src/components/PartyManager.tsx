import { useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useTerminologyStore } from '../store/terminologyStore';
import { fetchApi } from '../lib/api';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { DeleteTxModal } from './party/modals/DeleteTxModal';
import { DeletePartyModal } from './party/modals/DeletePartyModal';
import { PartyConnectModal } from './party/modals/PartyConnectModal';
import { PartyBillPreviewModal } from './party/modals/PartyBillPreviewModal';
import { PartyTransactionForm } from './party/views/PartyTransactionForm';
import { PartyLedgerView } from './party/views/PartyLedgerView';
import { PartyListView } from './party/views/PartyListView';
import { PartyFormView } from './party/views/PartyFormView';
import { DataUploadModal } from './DataUploadModal';
import { FloatToast } from './ui/FloatToast';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { calculateLedgerStatement } from '../utils/partyLedgerPdfGenerator';
import { partiesApi } from '../data/parties';
import { usePartyManagerState } from './party/hooks/usePartyManagerState';
import { usePartyBillPreview } from './party/hooks/usePartyBillPreview';
import { usePartySave } from './party/hooks/usePartySave';
import { usePartyTransactionSave } from './party/hooks/usePartyTransactionSave';
import { useLedgerSharing } from './party/hooks/useLedgerSharing';
import { type Party, type LedgerEntry, type View } from './party/partyTypes';
import { PartyManagerHeader } from './party/views/PartyManagerHeader';
import { usePartyLoaders } from './party/hooks/usePartyLoaders';
import { usePartyManagerEffects } from './party/hooks/usePartyManagerEffects';

// Converts a stored timestamp back to a local naive "YYYY-MM-DDTHH:mm" value
// for the datetime-local input when editing an entry. SQLite stores UTC wall
// time without a marker (e.g. "2026-08-16 17:55:00"), so parseUTCDate treats
// unmarked values as UTC and converts them to the user's local time.

// Generate a consistent hue from a party name

export function PartyManager({
  onClose,
  initialPartyIdOrQuery,
  onBackToCustomers,
}: {
  onClose: () => void;
  initialPartyIdOrQuery?: string;
  onBackToCustomers?: () => void;
}) {
  useCloseOnEscape(onClose);
  const { tenantId, userId, userName, role, shopName } = useAuthStore();
  const tLabels = useTerminologyStore(state => state.labels);
  const isOwner = !role || ['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPER_ADMIN', 'STAFF', 'BILLER', 'CASHIER'].includes(role.toUpperCase());

  const pm = usePartyManagerState();
  const {
    enablePartyGst, enablePartyEstimate, highlightedPartyId, parties, setParties, loading,
    setLoading, searchQuery, setSearchQuery, debouncedSearchQuery, setDebouncedSearchQuery, visibleCount,
    setVisibleCount, pricingTiers, view, setView, selectedParty, setSelectedParty,
    listLayoutMode, setListLayoutMode, ledgerLayoutMode, setLedgerLayoutMode, statusMessage, setStatusMessage,
    showUploadModal, setShowUploadModal, editingParty, setEditingParty, activeTab, setActiveTab,
    customCategoryFilter, setCustomCategoryFilter, savedCustomCategories, isCustomCategoryNew, setIsCustomCategoryNew, partyForm,
    setPartyForm, isSavingParty, setIsSavingParty, pendingRequests, setPendingRequests, showConnectModal,
    setShowConnectModal, connectCodeInput, setConnectCodeInput, searchResult, setSearchResult, searching,
    setSearching, partyNameForConnect, setPartyNameForConnect, myConnectCode, setMyConnectCode, copiedMyCode,
    setCopiedMyCode, ledger, setLedger, ledgerLoading, dateSortOrder, setDateSortOrder,
    ledgerStartDate, setLedgerStartDate, ledgerEndDate, setLedgerEndDate, isExportingPdf, isSendingWhatsAppPdf,
    shopDetails, ledgerBalanceFilter, setLedgerBalanceFilter, editingTx, setEditingTx, isSavingTx,
    ledgerWhatsappEnabled, ledgerWhatsappIncludeShop, txForm, setTxForm, deleteTxModalOpen, setDeleteTxModalOpen,
    txToDelete, setTxToDelete, deleteTxSaving, setDeleteTxSaving, deletePartyModalOpen, setDeletePartyModalOpen,
    partyToDelete, setPartyToDelete, deletePartySaving, setDeletePartySaving, viewingBillModal, setViewingBillModal,
    viewingBillLoading, viewingInvoice, setViewingInvoice, viewingInvoiceItems, setViewingInvoiceItems, viewingLedgerVoucher,
    setViewingLedgerVoucher, editReturnView, setEditReturnView,
  } = pm;

  const getPartyBalance = useCallback((p: any): number => {
    if (!p) return 0;
    if (enablePartyGst && !enablePartyEstimate) {
      if (p.current_gst_balance !== undefined && p.current_gst_balance !== null && !isNaN(Number(p.current_gst_balance))) {
        return Number(p.current_gst_balance);
      }
      if (p.gst_balance !== undefined && p.gst_balance !== null && !isNaN(Number(p.gst_balance))) {
        return Number(p.gst_balance);
      }
    } else if (!enablePartyGst && enablePartyEstimate) {
      if (p.current_estimate_balance !== undefined && p.current_estimate_balance !== null && !isNaN(Number(p.current_estimate_balance))) {
        return Number(p.current_estimate_balance);
      }
      if (p.estimate_balance !== undefined && p.estimate_balance !== null && !isNaN(Number(p.estimate_balance))) {
        return Number(p.estimate_balance);
      }
    }
    if (p.current_balance !== undefined && p.current_balance !== null && !isNaN(Number(p.current_balance))) {
      return Number(p.current_balance);
    }
    return Number(p.balance || 0);
  }, [enablePartyGst, enablePartyEstimate]);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const lastInteractedPartyId = useRef<string | null>(null);
  const savedScrollTop = useRef<number>(0);
  const processedInitialTarget = useRef<string | null>(null);

  const prevViewRef = useRef<View>(view);

  const fetchMyConnectCode = useCallback(async () => {
    try {
      const res = await fetchApi('/settings/connect-code').catch(() => null);
      if (res?.connect_code) {
        setMyConnectCode(res.connect_code);
      } else {
        const tId = useAuthStore.getState().tenantId || 'STORE';
        setMyConnectCode('NF-' + tId.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase());
      }
    } catch (e) {
      console.warn('Failed to fetch my connect code:', e);
    }
  }, [setMyConnectCode]);

  const fetchPendingRequests = useCallback(async () => {
    fetchMyConnectCode();
    try {
      const res = await fetchApi('/parties/connect/requests').catch(() => null);
      if (res && Array.isArray(res)) {
        setPendingRequests(res.filter((r: any) => r.status === 'PENDING'));
      }
    } catch (e) {
      console.warn('Failed to fetch connect requests:', e);
    }
  }, [fetchMyConnectCode, setPendingRequests]);

  const handleSearchConnectCode = async () => {
    if (!connectCodeInput.trim()) {
      showStatus('Please enter a Nafid Connect Code', 'error');
      return;
    }
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await fetchApi('/parties/connect/search', {
        method: 'POST',
        body: JSON.stringify({ query: connectCodeInput.trim() })
      });
      if (res) {
        setSearchResult(res);
        setPartyNameForConnect(res.name || '');
      }
    } catch (e: any) {
      showStatus(e?.message || 'No business found matching code', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleSendConnectRequest = async () => {
    if (!searchResult?.connect_code) return;
    setIsSavingParty(true);
    try {
      await fetchApi('/parties/connect/request', {
        method: 'POST',
        body: JSON.stringify({
          receiver_connect_code: searchResult.connect_code,
          party_name: partyNameForConnect.trim() || searchResult.name,
        })
      });
      setShowConnectModal(false);
      setConnectCodeInput('');
      setSearchResult(null);
      showStatus(`Connection request sent to ${searchResult.name}!`, 'success');
      loadParties();
    } catch (e: any) {
      showStatus(e?.message || 'Failed to send connection request', 'error');
    } finally {
      setIsSavingParty(false);
    }
  };

  const handleRespondConnectRequest = async (requestId: string, action: 'ACCEPT' | 'REJECT') => {
    try {
      await fetchApi('/parties/connect/respond', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId, action })
      });
      showStatus(action === 'ACCEPT' ? 'Ledger Connection Accepted! 🟢' : 'Connection Request Declined', 'success');
      fetchPendingRequests();
      loadParties();
    } catch (e: any) {
      showStatus(e?.message || 'Failed to respond to request', 'error');
    }
  };

  const gstBalance = useMemo(() => {
    return ledger
      .filter(e => (e.balance_type || 'GST') === 'GST')
      .reduce((sum, e) => sum + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
  }, [ledger]);

  const estimateBalance = useMemo(() => {
    return ledger
      .filter(e => e.balance_type === 'ESTIMATE')
      .reduce((sum, e) => sum + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
  }, [ledger]);

  const gstEntriesCount = useMemo(() => {
    return ledger.filter(e => (e.balance_type || 'GST') === 'GST').length;
  }, [ledger]);

  const estimateEntriesCount = useMemo(() => {
    return ledger.filter(e => e.balance_type === 'ESTIMATE').length;
  }, [ledger]);

  // Single source of truth calculation for filtered ledger, opening balance & reconciliation
  const statementData = useMemo(() => {
    if (!selectedParty) return null;
    return calculateLedgerStatement(
      ledger,
      { startDate: ledgerStartDate, endDate: ledgerEndDate },
      selectedParty,
      tLabels,
      getStoreTimezone()
    );
  }, [ledger, ledgerStartDate, ledgerEndDate, selectedParty, tLabels]);

  const isPeriodFiltered = Boolean(ledgerStartDate || ledgerEndDate);
  const activeGstBal = useMemo(() => {
    if (isPeriodFiltered && statementData) {
      return (statementData.entries || [])
        .filter(e => (e.balance_type || 'GST') === 'GST')
        .reduce((sum, e) => sum + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
    }
    return gstBalance;
  }, [isPeriodFiltered, statementData, gstBalance]);

  const activeEstimateBal = useMemo(() => {
    if (isPeriodFiltered && statementData) {
      return (statementData.entries || [])
        .filter(e => e.balance_type === 'ESTIMATE')
        .reduce((sum, e) => sum + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
    }
    return estimateBalance;
  }, [isPeriodFiltered, statementData, estimateBalance]);

  const displayLedger = useMemo(() => {
    let list = statementData ? statementData.entries : ledger;
    if (enablePartyGst && !enablePartyEstimate) {
      list = list.filter(e => (e.balance_type || 'GST') === 'GST');
    } else if (!enablePartyGst && enablePartyEstimate) {
      list = list.filter(e => e.balance_type === 'ESTIMATE');
    } else if (enablePartyGst && enablePartyEstimate && ledgerBalanceFilter !== 'ALL') {
      list = list.filter(e => (e.balance_type || 'GST') === ledgerBalanceFilter);
    }
    const sortedAsc = [...list].sort((a, b) => {
      const timeA = new Date(a.transaction_date).getTime();
      const timeB = new Date(b.transaction_date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const catA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const catB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return catA - catB;
    });

    const isFilteredByMode = (enablePartyGst && !enablePartyEstimate) || (!enablePartyGst && enablePartyEstimate) || (enablePartyGst && enablePartyEstimate && ledgerBalanceFilter !== 'ALL');
    let running = (statementData && ledgerStartDate && !isFilteredByMode) ? statementData.openingBalance : 0;
    const withRunning = sortedAsc.map(entry => {
      running += (Number(entry.credit_amount) || 0) - (Number(entry.debit_amount) || 0);
      return {
        ...entry,
        contextRunningBalance: !isFilteredByMode ? entry.running_balance : running,
      };
    });

    return dateSortOrder === 'desc' ? withRunning.reverse() : withRunning;
  }, [statementData, ledger, dateSortOrder, enablePartyGst, enablePartyEstimate, ledgerBalanceFilter, ledgerStartDate]);

  const totalCreditSum = useMemo(() => {
    return displayLedger.reduce((sum, entry) => sum + (Number(entry.credit_amount) || 0), 0);
  }, [displayLedger]);

  const totalDebitSum = useMemo(() => {
    return displayLedger.reduce((sum, entry) => sum + (Number(entry.debit_amount) || 0), 0);
  }, [displayLedger]);

  const showStatus = useCallback((text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  }, [setStatusMessage]);

  const { loadPartySettings, loadLedger } = usePartyLoaders({
    pm, showStatus, tenantId,
  });

  const openTxForm = (transactionType: 'CREDIT' | 'DEBIT' = 'CREDIT') => {
    setEditingTx(null);
    let defaultBalanceType: 'GST' | 'ESTIMATE' = enablePartyGst ? 'GST' : 'ESTIMATE';
    if (ledgerBalanceFilter === 'ESTIMATE' && enablePartyEstimate) {
      defaultBalanceType = 'ESTIMATE';
    } else if (ledgerBalanceFilter === 'GST' && enablePartyGst) {
      defaultBalanceType = 'GST';
    }
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const hasPhone = Boolean(selectedParty?.phone && selectedParty.phone.trim());
    const isPartyAlertEnabled = selectedParty?.whatsapp_alerts_enabled !== 0 && selectedParty?.whatsapp_alerts_enabled !== false;
    const shouldSendWa = Boolean(ledgerWhatsappEnabled && isPartyAlertEnabled && hasPhone);

    setTxForm({
      amount: '',
      transaction_type: transactionType,
      description: '',
      transaction_date: dateStr,
      reference_number: '',
      balance_type: defaultBalanceType,
      payment_method: 'CASH',
      send_whatsapp: shouldSendWa,
    });
    setView('tx_form');
  };

  const loadParties = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await partiesApi.getParties(tenantId);
      const list = Array.isArray(data) ? data : [];
      setParties(list);
      fetchPendingRequests();
      return list;
    } catch {
      showStatus('Failed to load parties', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantId, fetchPendingRequests, setLoading, setParties, showStatus]);

  const startEditingParty = (party: Party, returnTo: 'list' | 'ledger' = 'list') => {
    setEditReturnView(returnTo);
    setEditingParty(party);
    setPartyForm({
      name: party.name,
      phone: party.phone || '',
      address: party.address || '',
      gstin: party.gstin || '',
      opening_balance: '',
      balance_type: party.balance_type,
      party_type: (party.party_type as any) || 'CUSTOMER',
      custom_category: party.custom_category || '',
      notes: party.notes || '',
      pricing_tier_id: party.pricing_tier_id || '',
      credit_limit: party.credit_limit != null && Number(party.credit_limit) > 0 ? String(party.credit_limit) : '',
      credit_period_enabled: Boolean(party.credit_period_enabled),
      credit_period_days: String(party.credit_period_days || 30),
      credit_period_basis: party.credit_period_basis || 'BILL_BASED',
      restrict_on_credit_expiry: party.restrict_on_credit_expiry !== false && (party.restrict_on_credit_expiry as any) !== 0,
      whatsapp_alerts_enabled: party.whatsapp_alerts_enabled !== 0 && party.whatsapp_alerts_enabled !== false,
      connect_code: (party as any).connect_code || '',
    });
    setView('party_form');
  };

  const resetPartyForm = () => {
    setPartyForm({
      name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE',
      party_type: 'CUSTOMER', custom_category: '', notes: '', pricing_tier_id: '', credit_limit: '', connect_code: '',
      credit_period_enabled: false, credit_period_days: '30', credit_period_basis: 'BILL_BASED', restrict_on_credit_expiry: true,
      whatsapp_alerts_enabled: true,
    });
    setEditingParty(null);
  };

  const handleDeleteParty = (party: Party) => {
    if (!isOwner) { showStatus('Only owners can delete parties', 'error'); return; }
    setPartyToDelete(party);
    setDeletePartyModalOpen(true);
  };

  const confirmDeleteParty = async () => {
    if (!partyToDelete || !isOwner) return;
    setDeletePartySaving(true);
    try {
      await partiesApi.deleteParty(partyToDelete.party_id);
      showStatus('Party deleted', 'success');
      setParties(prev => prev.filter(p => p.party_id !== partyToDelete.party_id));
      setDeletePartyModalOpen(false);
      setPartyToDelete(null);
    } catch {
      showStatus('Delete failed', 'error');
    } finally {
      setDeletePartySaving(false);
    }
  };

  const handleDeleteTx = (entry: LedgerEntry) => {
    if (!selectedParty || !isOwner) { showStatus('Only owners can delete transactions', 'error'); return; }
    setTxToDelete(entry);
    setDeleteTxModalOpen(true);
  };

  const confirmDeleteTx = async () => {
    if (!txToDelete || !selectedParty || !isOwner) return;
    setDeleteTxSaving(true);
    try {
      setLedger(prev => prev.filter(e => e.ledger_id !== txToDelete.ledger_id));
      await partiesApi.deletePartyLedgerEntry(txToDelete.ledger_id, selectedParty.party_id);
      showStatus('Transaction deleted', 'success');
      setDeleteTxModalOpen(false);
      setTxToDelete(null);
      await loadLedger(selectedParty.party_id);
      const freshParties = await loadParties();
      const updatedParty = (freshParties || []).find(p => p.party_id === selectedParty.party_id);
      if (updatedParty) setSelectedParty(updatedParty);
    } catch {
      showStatus('Delete failed', 'error');
      await loadLedger(selectedParty.party_id);
    } finally {
      setDeleteTxSaving(false);
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  const allCustomCategories = useMemo(() => {
    const list = new Set<string>(['KSEB', 'KSFE Chitty', 'Monthly Savings', 'Personal Account', 'Daily Deposit']);
    (savedCustomCategories || []).forEach(c => { if (c && c.trim()) list.add(c.trim()); });
    parties.forEach(p => {
      if ((p.party_type || '').toUpperCase() === 'CUSTOM' && p.custom_category?.trim()) {
        list.add(p.custom_category.trim());
      }
    });
    return Array.from(list);
  }, [savedCustomCategories, parties]);

  // Single-pass calculation of tab counts to avoid multi-pass filtering per render
  const tabCounts = useMemo(() => {
    let customer = 0;
    let supplier = 0;
    let staff = 0;
    let custom = 0;
    for (let i = 0; i < parties.length; i++) {
      const t = (parties[i].party_type || 'CUSTOMER').toUpperCase();
      if (t === 'CUSTOMER') customer++;
      else if (t === 'SUPPLIER') supplier++;
      else if (t === 'STAFF') staff++;
      else if (t === 'CUSTOM') custom++;
    }
    return { customer, supplier, staff, custom };
  }, [parties]);

  const filteredParties = useMemo(() => {
    const rawQ = debouncedSearchQuery.trim();
    const q = rawQ.toLowerCase();
    const phoneQ = rawQ.replace(/\s+/g, '');
    const hasSearch = Boolean(q);

    return parties.filter(p => {
      if (hasSearch) {
        const nameMatch = p.name ? p.name.toLowerCase().includes(q) : false;
        const phoneMatch = p.phone ? p.phone.includes(phoneQ) : false;
        const gstinMatch = p.gstin ? p.gstin.toLowerCase().includes(q) : false;
        if (!nameMatch && !phoneMatch && !gstinMatch) return false;
      }

      const pType = (p.party_type || 'CUSTOMER').toUpperCase();
      if (activeTab === 'CUSTOMER') return pType === 'CUSTOMER';
      if (activeTab === 'SUPPLIER') return pType === 'SUPPLIER';
      if (activeTab === 'STAFF') return pType === 'STAFF';
      if (activeTab === 'CUSTOM') {
        if (pType !== 'CUSTOM') return false;
        if (customCategoryFilter !== 'ALL') {
          return (p.custom_category || '').toLowerCase() === customCategoryFilter.toLowerCase();
        }
        return true;
      }
      return true;
    });
  }, [parties, debouncedSearchQuery, activeTab, customCategoryFilter]);

  const displayedParties = useMemo(() => {
    return filteredParties.slice(0, visibleCount);
  }, [filteredParties, visibleCount]);

  const customCategoriesList = allCustomCategories;

  const { totalReceivable, totalPayable } = useMemo(() => {
    let rec = 0;
    let pay = 0;
    for (let i = 0; i < filteredParties.length; i++) {
      const b = getPartyBalance(filteredParties[i]);
      if (b > 0) rec += b;
      else if (b < 0) pay += Math.abs(b);
    }
    return { totalReceivable: rec, totalPayable: pay };
  }, [filteredParties, getPartyBalance]);

  const isSearchPending = searchQuery.trim() !== debouncedSearchQuery.trim();

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 350) {
      setVisibleCount(prev => (prev < filteredParties.length ? Math.min(prev + 50, filteredParties.length) : prev));
    }
  }, [filteredParties.length, setVisibleCount]);

  // ── Shared field style ──
  const fieldCls = "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";

  const { handleOpenBillForLedgerEntry, handlePrintBillInModal, handleEditBillFromModal } = usePartyBillPreview({
    pm, onClose, showStatus, tenantId,
  });

  const { handleSaveParty } = usePartySave({
    pm, allCustomCategories, isOwner, loadParties, resetPartyForm, showStatus, tenantId, userId, userName,
  });

  const { handleSaveTx } = usePartyTransactionSave({
    pm, getPartyBalance, isOwner, loadLedger, loadParties, shopName, showStatus, tenantId, userId, userName,
  });

  const { handleSendWhatsAppForEntry, handleDownloadPdf, handleSendWhatsAppPdf } = useLedgerSharing({
    pm, shopName, showStatus, statementData, tenantId, tLabels,
  });
  usePartyManagerEffects({
    pm, initialPartyIdOrQuery, lastInteractedPartyId, listScrollRef, loadLedger, loadParties, loadPartySettings,
    prevViewRef, processedInitialTargetRef: processedInitialTarget, savedScrollTop, tenantId,
  });

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ══════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════ */}
      <PartyManagerHeader
        isOwner={isOwner} loadParties={loadParties} onBackToCustomers={onBackToCustomers} onClose={onClose}
        openTxForm={openTxForm} resetPartyForm={resetPartyForm} pm={pm}
      />

      {/* ══════════════════════════════════════════
          LIST VIEW
      ══════════════════════════════════════════ */}
      {view === 'list' && (
        <PartyListView
          pendingRequests={pendingRequests}
          handleRespondConnectRequest={handleRespondConnectRequest}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          parties={parties}
          tabCounts={tabCounts}
          tLabels={tLabels}
          totalReceivable={totalReceivable}
          totalPayable={totalPayable}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setDebouncedSearchQuery={setDebouncedSearchQuery}
          isSearchPending={isSearchPending}
          listLayoutMode={listLayoutMode}
          setListLayoutMode={setListLayoutMode}
          customCategoriesList={customCategoriesList}
          customCategoryFilter={customCategoryFilter}
          setCustomCategoryFilter={setCustomCategoryFilter}
          fieldCls={fieldCls}
          loading={loading}
          filteredParties={filteredParties}
          displayedParties={displayedParties}
          listScrollRef={listScrollRef}
          handleListScroll={handleListScroll}
          highlightedPartyId={highlightedPartyId}
          lastInteractedPartyId={lastInteractedPartyId}
          savedScrollTop={savedScrollTop}
          pricingTiers={pricingTiers}
          enablePartyGst={enablePartyGst}
          enablePartyEstimate={enablePartyEstimate}
          getPartyBalance={getPartyBalance}
          loadLedger={loadLedger}
          setSelectedParty={setSelectedParty}
          setView={setView}
          setLedgerBalanceFilter={setLedgerBalanceFilter}
          isOwner={isOwner}
          startEditingParty={startEditingParty}
          handleDeleteParty={handleDeleteParty}
          resetPartyForm={resetPartyForm}
          setVisibleCount={setVisibleCount}
        />
      )}

      {/* ══════════════════════════════════════════
          PARTY FORM VIEW
      ══════════════════════════════════════════ */}
      {view === 'party_form' && (
        <PartyFormView
          handleSaveParty={handleSaveParty}
          handleFormKeyDown={handleFormKeyDown}
          partyForm={partyForm}
          setPartyForm={setPartyForm}
          allCustomCategories={allCustomCategories}
          isCustomCategoryNew={isCustomCategoryNew}
          setIsCustomCategoryNew={setIsCustomCategoryNew}
          pricingTiers={pricingTiers}
          editingParty={editingParty}
          isSavingParty={isSavingParty}
          editReturnView={editReturnView}
          setEditReturnView={setEditReturnView}
          selectedParty={selectedParty}
          setView={setView}
          resetPartyForm={resetPartyForm}
          fieldCls={fieldCls}
        />
      )}

      {/* ══════════════════════════════════════════
          LEDGER VIEW
      ══════════════════════════════════════════ */}
      {/* LEDGER VIEW */}
      {view === 'ledger' && selectedParty && (
        <PartyLedgerView
          selectedParty={selectedParty}
          ledger={ledger}
          ledgerLoading={ledgerLoading}
          ledgerStartDate={ledgerStartDate}
          setLedgerStartDate={setLedgerStartDate}
          ledgerEndDate={ledgerEndDate}
          setLedgerEndDate={setLedgerEndDate}
          ledgerBalanceFilter={ledgerBalanceFilter}
          setLedgerBalanceFilter={setLedgerBalanceFilter}
          ledgerLayoutMode={ledgerLayoutMode}
          setLedgerLayoutMode={setLedgerLayoutMode}
          dateSortOrder={dateSortOrder}
          setDateSortOrder={setDateSortOrder}
          isExportingPdf={isExportingPdf}
          isSendingWhatsAppPdf={isSendingWhatsAppPdf}
          enablePartyEstimate={enablePartyEstimate}
          enablePartyGst={enablePartyGst}
          isOwner={isOwner}
          tLabels={tLabels}
          getPartyBalance={getPartyBalance}
          statementData={statementData}
          activeGstBal={activeGstBal}
          activeEstimateBal={activeEstimateBal}
          displayLedger={displayLedger}
          totalCreditSum={totalCreditSum}
          totalDebitSum={totalDebitSum}
          gstEntriesCount={gstEntriesCount}
          estimateEntriesCount={estimateEntriesCount}
          handleDownloadPdf={handleDownloadPdf}
          handleSendWhatsAppPdf={handleSendWhatsAppPdf}
          handleOpenBillForLedgerEntry={handleOpenBillForLedgerEntry}
          handleDeleteTx={handleDeleteTx}
          handleSendWhatsAppForEntry={handleSendWhatsAppForEntry}
          openTxForm={openTxForm}
          startEditingParty={startEditingParty}
          setShowConnectModal={setShowConnectModal}
          setConnectCodeInput={setConnectCodeInput}
          setSearchResult={setSearchResult}
          showStatus={showStatus}
          setParties={setParties}
          setSelectedParty={setSelectedParty}
          setEditingTx={setEditingTx}
          setTxForm={setTxForm}
          setView={setView}
        />
      )}

      {/* TX FORM VIEW */}
      {view === 'tx_form' && selectedParty && (
        <PartyTransactionForm
          selectedParty={selectedParty}
          editingTx={editingTx}
          txForm={txForm}
          setTxForm={setTxForm}
          isSavingTx={isSavingTx}
          enablePartyEstimate={enablePartyEstimate}
          enablePartyGst={enablePartyGst}
          ledgerWhatsappEnabled={ledgerWhatsappEnabled}
          ledgerWhatsappIncludeShop={ledgerWhatsappIncludeShop}
          shopDetails={shopDetails}
          shopName={shopName as string | undefined}
          statusMessage={statusMessage}
          getPartyBalance={getPartyBalance}
          handleSaveTx={handleSaveTx}
          handleFormKeyDown={handleFormKeyDown}
          onCancel={() => setView('ledger')}
        />
      )}

      {/* Modals */}
      <DeleteTxModal
        isOpen={deleteTxModalOpen}
        onClose={() => { if (!deleteTxSaving) { setDeleteTxModalOpen(false); setTxToDelete(null); } }}
        deleteTxSaving={deleteTxSaving}
        txToDelete={txToDelete}
        selectedPartyName={selectedParty?.name}
        onConfirm={confirmDeleteTx}
      />

      <DeletePartyModal
        isOpen={deletePartyModalOpen}
        onClose={() => { if (!deletePartySaving) { setDeletePartyModalOpen(false); setPartyToDelete(null); } }}
        deletePartySaving={deletePartySaving}
        partyToDelete={partyToDelete}
        onConfirm={confirmDeleteParty}
      />

      <PartyConnectModal
        isOpen={showConnectModal}
        onClose={() => { setShowConnectModal(false); setSearchResult(null); }}
        myConnectCode={myConnectCode}
        copiedMyCode={copiedMyCode}
        setCopiedMyCode={setCopiedMyCode}
        connectCodeInput={connectCodeInput}
        setConnectCodeInput={setConnectCodeInput}
        searching={searching}
        searchResult={searchResult}
        setSearchResult={setSearchResult}
        partyNameForConnect={partyNameForConnect}
        setPartyNameForConnect={setPartyNameForConnect}
        isSavingParty={isSavingParty}
        onSearch={handleSearchConnectCode}
        onSendRequest={handleSendConnectRequest}
      />

      {viewingBillModal && (
        <PartyBillPreviewModal
          isOpen={viewingBillModal}
          onClose={() => {
            setViewingBillModal(false);
            setViewingInvoice(null);
            setViewingInvoiceItems([]);
            setViewingLedgerVoucher(null);
          }}
          viewingInvoice={viewingInvoice}
          viewingInvoiceItems={viewingInvoiceItems}
          viewingLedgerVoucher={viewingLedgerVoucher}
          viewingBillLoading={viewingBillLoading}
          selectedParty={selectedParty}
          handlePrintBillInModal={handlePrintBillInModal}
          handleEditBillFromModal={handleEditBillFromModal}
        />
      )}

      <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} />

      <DataUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        defaultEntity={activeTab === 'SUPPLIER' ? 'suppliers' : activeTab === 'CUSTOMER' ? 'customers' : activeTab === 'STAFF' ? 'staff' : 'customers'}
        allowedEntities={['customers', 'suppliers', 'staff']}
        hideEntityTabs={false}
        onImportSuccess={(count, entity) => {
          loadParties();
          setStatusMessage({ text: `Successfully imported ${count} ${entity}!`, type: 'success' });
        }}
      />
    </div>

  );
}
