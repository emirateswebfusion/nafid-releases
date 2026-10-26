import { useState } from 'react';
import type { Party, LedgerEntry, View } from '../partyTypes';

/**
 * State of the ledger (parties) screen: party list and filters, the selected party and its ledger, party and
 * transaction forms, bill preview dialog, sharing / printing flags and settings.
 */
export function usePartyManagerState() {
  const [enablePartyGst, setEnablePartyGst] = useState(true);
  const [enablePartyEstimate, setEnablePartyEstimate] = useState(true);
  const [highlightedPartyId, setHighlightedPartyId] = useState<string | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [pricingTiers, setPricingTiers] = useState<import('../../../data/pricingTiers').PricingTier[]>([]);
  const [view, setView] = useState<View>('list');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [listLayoutMode, setListLayoutMode] = useState<'table' | 'cards'>('table');
  const [ledgerLayoutMode, setLedgerLayoutMode] = useState<'table' | 'cards'>('table');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM'>('ALL');
  const [customCategoryFilter, setCustomCategoryFilter] = useState<string>('ALL');
  const [savedCustomCategories, setSavedCustomCategories] = useState<string[]>([]);
  const [isCustomCategoryNew, setIsCustomCategoryNew] = useState(false);
  const [partyForm, setPartyForm] = useState({
    name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE' as 'RECEIVABLE' | 'PAYABLE',
    party_type: 'CUSTOMER' as 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM',
    custom_category: '',
    notes: '', pricing_tier_id: '', credit_limit: '', connect_code: '',
    credit_period_enabled: false,
    credit_period_days: '30',
    credit_period_basis: 'BILL_BASED',
    restrict_on_credit_expiry: true,
    whatsapp_alerts_enabled: true,
  });
  const [isSavingParty, setIsSavingParty] = useState(false);
  // Connected Ledger state
  const [pendingRequests, setPendingRequests] = useState<import('../partyTypes').PartyConnectionRequest[]>([]);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectCodeInput, setConnectCodeInput] = useState('');
  const [searchResult, setSearchResult] = useState<import('../partyTypes').PartyConnectionSearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [partyNameForConnect, setPartyNameForConnect] = useState('');
  const [myConnectCode, setMyConnectCode] = useState<string>('');
  const [copiedMyCode, setCopiedMyCode] = useState(false);
  // ── Party Ledger & Statement State ──────────────────────────────────────────────
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc');
  const [ledgerStartDate, setLedgerStartDate] = useState<string>('');
  const [ledgerEndDate, setLedgerEndDate] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSendingWhatsAppPdf, setIsSendingWhatsAppPdf] = useState(false);
  const [shopDetails, setShopDetails] = useState<{
    shopName: string;
    shopAddress?: string;
    shopPhone?: string;
    shopEmail?: string;
    shopGstin?: string;
    shopState?: string;
  }>({ shopName: '' });
  const [ledgerBalanceFilter, setLedgerBalanceFilter] = useState<'ALL' | 'GST' | 'ESTIMATE'>('ALL');
  const [editingTx, setEditingTx] = useState<LedgerEntry | null>(null);
  const [isSavingTx, setIsSavingTx] = useState(false);
  const [ledgerWhatsappEnabled, setLedgerWhatsappEnabled] = useState<boolean>(true);
  const [ledgerWhatsappIncludeShop, setLedgerWhatsappIncludeShop] = useState<boolean>(false);
  const [txForm, setTxForm] = useState({
    amount: '', transaction_type: 'CREDIT' as 'CREDIT' | 'DEBIT',
    description: '', transaction_date: '', reference_number: '',
    balance_type: 'GST' as 'GST' | 'ESTIMATE',
    payment_method: 'CASH' as 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'CHEQUE' | 'OTHER',
    send_whatsapp: true,
  });
  const [deleteTxModalOpen, setDeleteTxModalOpen] = useState(false);
  const [txToDelete, setTxToDelete] = useState<LedgerEntry | null>(null);
  const [deleteTxSaving, setDeleteTxSaving] = useState(false);
  const [deletePartyModalOpen, setDeletePartyModalOpen] = useState(false);
  const [partyToDelete, setPartyToDelete] = useState<Party | null>(null);
  const [deletePartySaving, setDeletePartySaving] = useState(false);
  // Bill viewing states
  const [viewingBillModal, setViewingBillModal] = useState<boolean>(false);
  const [viewingBillLoading, setViewingBillLoading] = useState<boolean>(false);
  const [viewingInvoice, setViewingInvoice] = useState<import('../partyTypes').PartyPreviewInvoice | null>(null);
  const [viewingInvoiceItems, setViewingInvoiceItems] = useState<import('../partyTypes').PartyPreviewItem[]>([]);
  const [viewingLedgerVoucher, setViewingLedgerVoucher] = useState<LedgerEntry | null>(null);
  const [editReturnView, setEditReturnView] = useState<'list' | 'ledger'>('list');

  return {
    enablePartyGst, setEnablePartyGst, enablePartyEstimate, setEnablePartyEstimate, highlightedPartyId,
    setHighlightedPartyId, parties, setParties, loading, setLoading, searchQuery, setSearchQuery,
    debouncedSearchQuery, setDebouncedSearchQuery, visibleCount, setVisibleCount, pricingTiers, setPricingTiers,
    view, setView, selectedParty, setSelectedParty, listLayoutMode, setListLayoutMode, ledgerLayoutMode,
    setLedgerLayoutMode, statusMessage, setStatusMessage, showUploadModal, setShowUploadModal, editingParty,
    setEditingParty, activeTab, setActiveTab, customCategoryFilter, setCustomCategoryFilter, savedCustomCategories,
    setSavedCustomCategories, isCustomCategoryNew, setIsCustomCategoryNew, partyForm, setPartyForm, isSavingParty,
    setIsSavingParty, pendingRequests, setPendingRequests, showConnectModal, setShowConnectModal, connectCodeInput,
    setConnectCodeInput, searchResult, setSearchResult, searching, setSearching, partyNameForConnect,
    setPartyNameForConnect, myConnectCode, setMyConnectCode, copiedMyCode, setCopiedMyCode, ledger, setLedger,
    ledgerLoading, setLedgerLoading, dateSortOrder, setDateSortOrder, ledgerStartDate, setLedgerStartDate,
    ledgerEndDate, setLedgerEndDate, isExportingPdf, setIsExportingPdf, isSendingWhatsAppPdf,
    setIsSendingWhatsAppPdf, shopDetails, setShopDetails, ledgerBalanceFilter, setLedgerBalanceFilter, editingTx,
    setEditingTx, isSavingTx, setIsSavingTx, ledgerWhatsappEnabled, setLedgerWhatsappEnabled,
    ledgerWhatsappIncludeShop, setLedgerWhatsappIncludeShop, txForm, setTxForm, deleteTxModalOpen,
    setDeleteTxModalOpen, txToDelete, setTxToDelete, deleteTxSaving, setDeleteTxSaving, deletePartyModalOpen,
    setDeletePartyModalOpen, partyToDelete, setPartyToDelete, deletePartySaving, setDeletePartySaving,
    viewingBillModal, setViewingBillModal, viewingBillLoading, setViewingBillLoading, viewingInvoice,
    setViewingInvoice, viewingInvoiceItems, setViewingInvoiceItems, viewingLedgerVoucher, setViewingLedgerVoucher,
    editReturnView, setEditReturnView,
  };
}

export type PartyManagerState = ReturnType<typeof usePartyManagerState>;
