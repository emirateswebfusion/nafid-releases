import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useTerminologyStore } from '../store/terminologyStore';
import { fetchApi } from '../lib/api';
import { isAdminRole, hasPermission } from '../utils/permissions';
import { UserPlus, Handshake, PlusCircle, ArrowLeft, Link, Upload } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
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
import { RedCrossButton } from './ui/RedCrossButton';
import { FloatToast } from './ui/FloatToast';
import { getAppTimeFormat, parseUTCDate, formatBillDateTime, generateReceiptText } from '../utils/receiptGenerator';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { formatWhatsAppLedgerTxMessage, formatWhatsAppStatementMessage } from '../utils/whatsappBillHelper';
import { calculateLedgerStatement, generatePartyLedgerHtml, type LedgerEntryData } from '../utils/partyLedgerPdfGenerator';
import { cashierApi } from '../data/cashier';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { invoicesApi } from '../data/invoices';
import { partiesApi } from '../data/parties';
import { pricingTiersApi } from '../data/pricingTiers';
import { printingApi } from '../data/printing';
import { returnsApi } from '../data/returns';
import { scrapApi } from '../data/scrap';
import { settingsApi } from '../data/settings';
import { whatsappApi } from '../data/whatsapp';

interface Party {
  party_id: string;
  name: string;
  phone: string;
  address: string;
  gstin: string;
  balance: number;
  current_balance?: number;
  gst_balance?: number;
  estimate_balance?: number;
  current_gst_balance?: number;
  current_estimate_balance?: number;
  balance_type: 'RECEIVABLE' | 'PAYABLE';
  party_type?: 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM' | string;
  custom_category?: string | null;
  notes: string;
  last_transaction_date: string;
  created_at: string;
  pricing_tier_id?: string | null;
  credit_limit?: number;
  credit_period_enabled?: boolean | number;
  credit_period_days?: number;
  credit_period_basis?: 'BILL_BASED' | 'OLDEST_UNPAID' | string;
  restrict_on_credit_expiry?: boolean | number;
  whatsapp_alerts_enabled?: boolean | number;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
  oldest_overdue_days?: number;
  connected_tenant_id?: string | null;
  connected_party_id?: string | null;
  connection_status?: 'UNLINKED' | 'PENDING' | 'CONNECTED' | string;
  connect_code?: string | null;
}

type LedgerEntry = LedgerEntryData;

type View = 'list' | 'ledger' | 'party_form' | 'tx_form';

const formatDateTime = (d: string) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
};

// Converts a naive local datetime-local value (e.g. "2026-08-16T23:25") into a
// timezone-aware UTC ISO string so Postgres stores the true instant, not local
// wall time misread as UTC. Returns undefined for empty/invalid input.
const toUtcIso = (naive: string): string | undefined => {
  if (!naive) return undefined;
  const d = new Date(naive);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

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

  const [enablePartyGst, setEnablePartyGst] = useState(true);
  const [enablePartyEstimate, setEnablePartyEstimate] = useState(true);

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
  const [highlightedPartyId, setHighlightedPartyId] = useState<string | null>(null);

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);

  const [view, setView] = useState<View>('list');
  const prevViewRef = useRef<View>(view);
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
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectCodeInput, setConnectCodeInput] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [partyNameForConnect, setPartyNameForConnect] = useState('');
  const [myConnectCode, setMyConnectCode] = useState<string>('');
  const [copiedMyCode, setCopiedMyCode] = useState(false);

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
  }, []);

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
  }, [fetchMyConnectCode]);

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
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null);
  const [viewingInvoiceItems, setViewingInvoiceItems] = useState<any[]>([]);
  const [viewingLedgerVoucher, setViewingLedgerVoucher] = useState<LedgerEntry | null>(null);

  const handleOpenBillForLedgerEntry = async (entry: LedgerEntry) => {
    setViewingInvoice(null);
    setViewingInvoiceItems([]);
    setViewingLedgerVoucher(null);
    setViewingBillModal(true);
    setViewingBillLoading(true);

    try {
      const tId = tenantId || useAuthStore.getState().tenantId;
      const candidateTerms: string[] = [];

      if (entry.reference_number?.trim()) {
        const ref = entry.reference_number.trim();
        candidateTerms.push(ref);
        const baseRef = ref.replace(/-(PAY|CASH|UPI|CARD|BANK|CHEQUE)$/i, '');
        if (baseRef !== ref && !candidateTerms.includes(baseRef)) {
          candidateTerms.push(baseRef);
        }
      }

      const fullText = `${entry.description || ''} ${entry.reference_number || ''}`;
      const matches = fullText.match(/(?:#|INV-|BOS-|PB-|SCRAP-|RET-|RTN-|Bill\s*#?|Invoice\s*#?|Estimate\s*#?)([A-Za-z0-9\-_]+)/gi);
      if (matches) {
        matches.forEach(m => {
          const cleaned = m.replace(/^(?:#|Bill\s*#?|Invoice\s*#?|Estimate\s*#?)/i, '').trim();
          if (cleaned && !candidateTerms.includes(cleaned)) {
            candidateTerms.push(cleaned);
          }
        });
      }

      let foundInvoice: any = null;
      let invoiceItems: any[] = [];

      for (const term of candidateTerms) {
        if (hasBridge('dbGetInvoices')) {
          const res = await invoicesApi.getInvoices({ search: term, tenant_id: tId });
          if (Array.isArray(res) && res.length > 0) {
            const match = res.find(inv =>
              String(inv.invoice_number).toLowerCase() === term.toLowerCase() ||
              String(inv.invoice_id).toLowerCase() === term.toLowerCase()
            ) || res[0];
            foundInvoice = match;
            break;
          }
        }
        if (!foundInvoice && hasBridge('dbGetReturnInvoiceByNumber') && (term.toUpperCase().startsWith('RTN-') || term.toUpperCase().startsWith('RET-'))) {
          try {
            const ret = await returnsApi.getReturnInvoiceByNumber({ tenant_id: tId as string, return_number: term });
            if (ret && ret.invoice_id) {
              const res = await invoicesApi.getInvoices({ search: ret.invoice_id, tenant_id: tId });
              if (Array.isArray(res) && res.length > 0) {
                foundInvoice = res.find((inv: any) => inv.invoice_id === ret.invoice_id) || res[0];
                break;
              }
            }
          } catch {}
        }
        if (!foundInvoice) {
          try {
            const res = await fetchApi(`/sales?search=${encodeURIComponent(term)}`);
            const list = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
            if (list.length > 0) {
              foundInvoice = list[0];
              break;
            }
          } catch { /* ignore */ }
        }
      }

      if (!foundInvoice && selectedParty) {
        if (hasBridge('dbGetInvoices')) {
          const res = await invoicesApi.getInvoices({ tenant_id: tId, limit: 100 });
          if (Array.isArray(res)) {
            const entryAmt = entry.credit_amount > 0 ? entry.credit_amount : entry.debit_amount;
            const match = res.find(inv => {
              const isPartyMatch = inv.party_id === selectedParty.party_id ||
                (inv.customer_phone && selectedParty.phone && inv.customer_phone === selectedParty.phone) ||
                (inv.customer_name && selectedParty.name && inv.customer_name.toLowerCase().trim() === selectedParty.name.toLowerCase().trim());
              if (!isPartyMatch) return false;
              const invTotal = Number(inv.grand_total) || 0;
              return Math.abs(invTotal - entryAmt) < 0.01 ||
                (entry.reference_number && (
                  String(inv.invoice_number).includes(entry.reference_number) ||
                  entry.reference_number.startsWith(String(inv.invoice_number))
                ));
            });
            if (match) {
              foundInvoice = match;
            }
          }
        }
      }

      if (foundInvoice) {
        setViewingInvoice(foundInvoice);
        if (hasBridge('dbGetInvoiceItems')) {
          const items = await invoicesApi.getInvoiceItems(foundInvoice.invoice_id);
          if (Array.isArray(items)) invoiceItems = items;
        } else {
          try {
            const itemsRes = await fetchApi(`/sales/${foundInvoice.invoice_id}/items`);
            if (Array.isArray(itemsRes)) invoiceItems = itemsRes;
          } catch { /* ignore */ }
        }
        setViewingInvoiceItems(invoiceItems);
      } else {
        let foundScrap: any = null;
        for (const term of candidateTerms) {
          if (hasBridge('dbGetScrapInvoiceByNumber')) {
            const scrap = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tId as string, scrap_invoice_number: term });
            if (scrap && scrap.scrap_invoice_number) {
              foundScrap = scrap;
              break;
            }
          }
        }
        if (foundScrap) {
          setViewingInvoice({
            invoice_number: foundScrap.scrap_invoice_number,
            invoice_type: 'SCRAP',
            created_at: foundScrap.created_at || entry.transaction_date,
            payment_method: foundScrap.payment_status || 'COMPLETED',
            customer_name: foundScrap.party_name || selectedParty?.name,
            customer_phone: foundScrap.customer_phone || selectedParty?.phone,
            grand_total: foundScrap.total_amount || (entry.credit_amount || entry.debit_amount),
            subtotal: foundScrap.total_amount || (entry.credit_amount || entry.debit_amount),
          });
          setViewingInvoiceItems(foundScrap.items || []);
        } else {
          setViewingLedgerVoucher(entry);
        }
      }
    } catch (err) {
      console.error('Error fetching bill for ledger entry:', err);
      setViewingLedgerVoucher(entry);
    } finally {
      setViewingBillLoading(false);
    }
  };

  const handlePrintBillInModal = async () => {
    if (viewingInvoice) {
      if (hasBridge('printReceipt')) {
        try {
          const tId = tenantId || 'global';
          const receiptText = generateReceiptText({
            shopName: useAuthStore.getState().shopName || 'Store',
            invoiceNumber: viewingInvoice.invoice_number,
            date: formatBillDateTime(viewingInvoice.created_at),
            items: (viewingInvoiceItems || []).map(i => ({
              name: i.name,
              quantity: Number(i.quantity) || 1,
              unit_price: Number(i.unit_price) || 0,
              total: Number(i.total) || (Number(i.quantity) * Number(i.unit_price)) || 0,
              qty: Number(i.quantity) || 1,
              unitPrice: Number(i.unit_price) || 0,
              totalPrice: Number(i.total) || (Number(i.quantity) * Number(i.unit_price)) || 0,
            })),
            grandTotal: Number(viewingInvoice.grand_total) || 0,
            subtotal: Number(viewingInvoice.subtotal) || 0,
            tax: Number(viewingInvoice.tax_amount || viewingInvoice.tax || 0),
            discount: Number(viewingInvoice.discount_amount || viewingInvoice.discount || 0),
            paymentMethod: viewingInvoice.payment_method || 'CASH',
          });
          await printingApi.printReceipt(tId, receiptText);
          showStatus('Receipt sent to printer', 'success');
        } catch {
          showStatus('Failed to print receipt', 'error');
        }
      }
    } else if (viewingLedgerVoucher) {
      if (hasBridge('printReceipt')) {
        try {
          const tId = tenantId || 'global';
          const amt = viewingLedgerVoucher.credit_amount > 0 ? viewingLedgerVoucher.credit_amount : viewingLedgerVoucher.debit_amount;
          const receiptText = `================================\n        PAYMENT VOUCHER         \n================================\nRef #: ${viewingLedgerVoucher.reference_number || viewingLedgerVoucher.ledger_id.slice(0, 8)}\nDate: ${formatDateTime(viewingLedgerVoucher.transaction_date)}\nParty: ${selectedParty?.name || ''}\nPhone: ${selectedParty?.phone || ''}\nType: ${viewingLedgerVoucher.credit_amount > 0 ? 'CREDIT SALE (GIVEN)' : 'PAYMENT (RECEIVED)'}\nPayment Mode: ${viewingLedgerVoucher.payment_method || 'CASH'}\n--------------------------------\nAmount: RS. ${amt.toFixed(2)}\nRunning Bal: RS. ${Math.abs(viewingLedgerVoucher.running_balance).toFixed(2)}\nNote: ${viewingLedgerVoucher.description || ''}\n================================\n`;
          await printingApi.printReceipt(tId, receiptText);
          showStatus('Voucher sent to printer', 'success');
        } catch {
          showStatus('Failed to print voucher', 'error');
        }
      }
    }
  };

  const handleEditBillFromModal = async () => {
    if (!viewingInvoice) return;
    const { role, permissions } = useAuthStore.getState();
    if (!hasPermission({ role, permissions }, 'sales.edit')) {
      showStatus('Permission Denied: You do not have permission to edit bills', 'error');
      return;
    }
    try {
      let itemsToEdit = viewingInvoiceItems;
      if (!itemsToEdit || itemsToEdit.length === 0) {
        if (hasBridge('dbGetInvoiceItems')) {
          const data = await invoicesApi.getInvoiceItems(viewingInvoice.invoice_id);
          itemsToEdit = Array.isArray(data) ? data : [];
        }
      }
      localStorage.setItem('editBillData', JSON.stringify({
        invoice: viewingInvoice,
        items: itemsToEdit,
        originalRole: useAuthStore.getState().role || 'OWNER',
      }));
      setViewingBillModal(false);
      onClose();
      if (isAdminRole(useAuthStore.getState().role)) {
        useCartStore.getState().setRole('BILLER');
      }
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 50);
    } catch (e) {
      console.error('Failed to start bill edit:', e);
      showStatus('Failed to open bill editor', 'error');
    }
  };

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const loadPartySettings = useCallback(async () => {
    if (!tenantId || !isDesktopRuntime()) return;
    try {
      const [gstVal, estVal, waEnabledVal, waIncShopVal] = await Promise.all([
        settingsApi.get({ tenant_id: tenantId, key: 'enable_party_gst_balance' }),
        settingsApi.get({ tenant_id: tenantId, key: 'enable_party_estimate_balance' }),
        settingsApi.get({ tenant_id: tenantId, key: 'ledger_whatsapp_enabled' }),
        settingsApi.get({ tenant_id: tenantId, key: 'ledger_whatsapp_include_shop' }),
      ]);
      const isPartyFirstRun = gstVal === undefined && estVal === undefined;
      const g = isPartyFirstRun ? true : Boolean(gstVal);
      const e = isPartyFirstRun ? true : Boolean(estVal);
      setEnablePartyGst(g);
      setEnablePartyEstimate(e);
      if (waEnabledVal !== null && waEnabledVal !== undefined) {
        setLedgerWhatsappEnabled(Boolean(waEnabledVal));
      }
      if (waIncShopVal !== null && waIncShopVal !== undefined) {
        setLedgerWhatsappIncludeShop(Boolean(waIncShopVal));
      }
      if (hasBridge('settingsGetAll')) {
        const all = await settingsApi.getAll({ tenant_id: tenantId || 'global' });
        if (all) {
          setShopDetails({
            shopName: all['shop_name'] || '',
            shopAddress: all['shop_address'] || '',
            shopPhone: all['shop_phone'] || '',
            shopEmail: all['shop_email'] || '',
            shopGstin: all['shop_gstin'] || '',
            shopState: all['shop_state'] || '',
          });
        }
      }
    } catch (err) {
      console.error('Failed to load party balance settings', err);
    }
  }, [tenantId]);

  useEffect(() => { loadPartySettings(); }, [loadPartySettings]);

  useEffect(() => {
    const handleSettingsUpdate = () => { loadPartySettings(); };
    window.addEventListener('settings:updated', handleSettingsUpdate);
    return () => window.removeEventListener('settings:updated', handleSettingsUpdate);
  }, [loadPartySettings]);

  // Debounce search query to keep typing at 60fps with zero input lag
  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination when search query or filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [debouncedSearchQuery, activeTab, customCategoryFilter]);

  // Restore scroll position and highlight party row when returning to list
  useEffect(() => {
    if (view === 'list' && (lastInteractedPartyId.current || savedScrollTop.current > 0)) {
      const targetId = lastInteractedPartyId.current;
      if (targetId) {
        setHighlightedPartyId(targetId);
        setTimeout(() => setHighlightedPartyId(null), 3000);
        const targetIdx = parties.findIndex(p => p.party_id === targetId);
        if (targetIdx >= 0 && targetIdx >= visibleCount) {
          setVisibleCount(Math.ceil((targetIdx + 1) / 50) * 50);
        }
      }

      const restore = () => {
        if (targetId) {
          const row = document.getElementById(`party-row-${targetId}`);
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
  }, [tenantId, fetchPendingRequests]);

  useEffect(() => { loadParties(); }, [loadParties]);

  useEffect(() => {
    if (prevViewRef.current === 'ledger' && view === 'list') {
      loadParties();
    }
    prevViewRef.current = view;
  }, [view, loadParties]);

  useEffect(() => {
    if (!tenantId) return;
    pricingTiersApi.getPricingTiers(tenantId)
      .then(res => {
        if (Array.isArray(res)) setPricingTiers(res);
      })
      .catch(console.error);

    settingsApi.get({ tenant_id: tenantId || 'global', key: 'custom_party_categories' })
      .then((val: any) => {
        if (val) {
          try {
            const parsed = typeof val === 'string' ? JSON.parse(val) : val;
            if (Array.isArray(parsed)) setSavedCustomCategories(parsed);
          } catch {}
        }
      })
      .catch(console.error);
  }, [tenantId]);

  const loadLedger = async (partyId: string) => {
    setLedgerLoading(true);
    try {
      const data = await partiesApi.getPartyLedger(partyId);
      if (data && !Array.isArray(data) && (data as any).error) {
        showStatus('Ledger: ' + (data as any).error, 'error');
      } else {
        const entries = Array.isArray(data) ? data : [];
        setLedger(entries);
        const latestBal = entries.length > 0 ? Number(entries[entries.length - 1].running_balance) || 0 : 0;
        const gBal = entries.filter(e => (e.balance_type || 'GST') === 'GST').reduce((s, e) => s + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
        const eBal = entries.filter(e => e.balance_type === 'ESTIMATE').reduce((s, e) => s + (Number(e.credit_amount) || 0) - (Number(e.debit_amount) || 0), 0);
        setSelectedParty(prev => prev ? {
          ...prev,
          balance: latestBal,
          current_balance: latestBal,
          gst_balance: gBal,
          current_gst_balance: gBal,
          estimate_balance: eBal,
          current_estimate_balance: eBal,
        } : prev);
        setParties(prev => prev.map(p => p.party_id === partyId ? {
          ...p,
          balance: latestBal,
          current_balance: latestBal,
          gst_balance: gBal,
          current_gst_balance: gBal,
          estimate_balance: eBal,
          current_estimate_balance: eBal,
        } : p));
      }
    } catch {
      showStatus('Failed to load ledger', 'error');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (!initialPartyIdOrQuery || parties.length === 0) return;
    if (processedInitialTarget.current === initialPartyIdOrQuery) return;

    processedInitialTarget.current = initialPartyIdOrQuery;
    const q = initialPartyIdOrQuery.trim().toLowerCase();
    const queryDigits = initialPartyIdOrQuery.replace(/\D/g, '');

    const found = parties.find(p => {
      if (!p) return false;
      if (p.party_id === initialPartyIdOrQuery) return true;
      const pDigits = (p.phone || '').replace(/\D/g, '');
      if (queryDigits && pDigits) {
        if (queryDigits === pDigits) return true;
        if (queryDigits.length >= 7 && pDigits.length >= 7 && queryDigits.slice(-10) === pDigits.slice(-10)) return true;
      }
      if (p.name && p.name.trim().toLowerCase() === q) return true;
      return false;
    });
    if (found) {
      setSelectedParty(found);
      setView('ledger');
      loadLedger(found.party_id);
    } else {
      setSearchQuery(initialPartyIdOrQuery);
      setDebouncedSearchQuery(initialPartyIdOrQuery);
    }
  }, [initialPartyIdOrQuery, parties]);

  const [editReturnView, setEditReturnView] = useState<'list' | 'ledger'>('list');

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

  const handleSaveParty = async () => {
    if (!partyForm.name.trim()) { showStatus('Party name is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage parties', 'error'); return; }

    // If adding a new party, check if a party with the exact same name already exists
    if (!editingParty) {
      const trimmedName = partyForm.name.trim();
      const existingWithSameName = parties.filter(p =>
        (p.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
      );

      if (existingWithSameName.length > 0) {
        // Calculate the next suffix number: e.g. "suhaib (1)", "suhaib (2)"
        let nextNum = 1;
        const baseLower = trimmedName.toLowerCase();
        // Check existing parties for suffixes like "name (1)", "name (2)"
        const escapedBase = baseLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const suffixRegex = new RegExp(`^${escapedBase}\\s*\\((\\d+)\\)$`, 'i');

        parties.forEach(p => {
          const pName = (p.name || '').trim().toLowerCase();
          const match = pName.match(suffixRegex);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= nextNum) {
              nextNum = num + 1;
            }
          }
        });

        const suggestedName = `${trimmedName} (${nextNum})`;
        showStatus(`A party named "${trimmedName}" already exists! Please use a unique name, e.g.: "${suggestedName}"`, 'error');
        return;
      }
    }

    setIsSavingParty(true);
    const parsedCreditLimit = Math.max(0, parseFloat(partyForm.credit_limit) || 0);
    const parsedCreditPeriodDays = Math.max(1, parseInt(partyForm.credit_period_days, 10) || 30);
    try {
      if (editingParty) {
        const trimmedName = partyForm.name.trim();
        const otherWithSameName = parties.find(p =>
          p.party_id !== editingParty.party_id &&
          (p.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (otherWithSameName) {
          showStatus(`Another party named "${trimmedName}" already exists!`, 'error');
          setIsSavingParty(false);
          return;
        }

        const updatedFields = {
          party_id: editingParty.party_id,
          name: trimmedName,
          phone: partyForm.phone.trim() || null,
          address: partyForm.address.trim() || null,
          gstin: partyForm.gstin.trim() || null,
          party_type: partyForm.party_type,
          custom_category: partyForm.party_type === 'CUSTOM' ? (partyForm.custom_category.trim() || null) : null,
          notes: partyForm.notes.trim() || null,
          pricing_tier_id: partyForm.pricing_tier_id || null,
          credit_limit: parsedCreditLimit,
          credit_period_enabled: partyForm.credit_period_enabled,
          credit_period_days: parsedCreditPeriodDays,
          credit_period_basis: partyForm.credit_period_basis,
          restrict_on_credit_expiry: partyForm.restrict_on_credit_expiry,
          whatsapp_alerts_enabled: partyForm.whatsapp_alerts_enabled,
        };

        const res = await partiesApi.updateParty(updatedFields);
        if (res && res.success === false) {
          showStatus(res.error || 'Failed to update party', 'error');
          setIsSavingParty(false);
          return;
        }

        const statePartyUpdate: Partial<Party> = {
          name: trimmedName,
          phone: partyForm.phone.trim() || '',
          address: partyForm.address.trim() || '',
          gstin: partyForm.gstin.trim() || '',
          party_type: partyForm.party_type,
          custom_category: partyForm.party_type === 'CUSTOM' ? (partyForm.custom_category.trim() || null) : null,
          notes: partyForm.notes.trim() || '',
          pricing_tier_id: partyForm.pricing_tier_id || null,
          credit_limit: parsedCreditLimit,
          credit_period_enabled: partyForm.credit_period_enabled,
          credit_period_days: parsedCreditPeriodDays,
          credit_period_basis: partyForm.credit_period_basis,
          restrict_on_credit_expiry: partyForm.restrict_on_credit_expiry,
          whatsapp_alerts_enabled: partyForm.whatsapp_alerts_enabled,
        };

        // Immediately update React states for instant consistency
        setSelectedParty(prev => (prev && prev.party_id === editingParty.party_id) ? { ...prev, ...statePartyUpdate } : prev);
        setParties(prev => prev.map(p => p.party_id === editingParty.party_id ? { ...p, ...statePartyUpdate } : p));
        showStatus('Party updated successfully', 'success');
      } else {
        const res = await partiesApi.addParty({
          party_id: uuidv4(),
          tenant_id: tenantId,
          name: partyForm.name.trim(),
          phone: partyForm.phone.trim() || null,
          address: partyForm.address.trim() || null,
          gstin: partyForm.gstin.trim() || null,
          balance: parseFloat(partyForm.opening_balance) || 0,
          balance_type: partyForm.balance_type,
          party_type: partyForm.party_type,
          custom_category: partyForm.party_type === 'CUSTOM' ? (partyForm.custom_category.trim() || null) : null,
          notes: partyForm.notes.trim() || null,
          pricing_tier_id: partyForm.pricing_tier_id || null,
          credit_limit: parsedCreditLimit,
          credit_period_enabled: partyForm.credit_period_enabled,
          credit_period_days: parsedCreditPeriodDays,
          credit_period_basis: partyForm.credit_period_basis,
          restrict_on_credit_expiry: partyForm.restrict_on_credit_expiry,
          whatsapp_alerts_enabled: partyForm.whatsapp_alerts_enabled,
          created_by: userId,
          created_by_name: userName || undefined,
        });
        if (res && res.success === false) {
          showStatus(res.error || 'Failed to create party', 'error');
          setIsSavingParty(false);
          return;
        }
        showStatus('Party created successfully', 'success');
      }
      if (partyForm.party_type === 'CUSTOM' && partyForm.custom_category.trim()) {
        const catName = partyForm.custom_category.trim();
        if (!allCustomCategories.map(c => c.toLowerCase()).includes(catName.toLowerCase())) {
          const updated = [...allCustomCategories, catName];
          setSavedCustomCategories(updated);
          settingsApi.set({
            tenant_id: tenantId || 'global',
            key: 'custom_party_categories',
            value: JSON.stringify(updated)
          }).catch(console.error);
        }
      }

      await loadParties();
      if (editReturnView === 'ledger' && selectedParty) {
        setView('ledger');
      } else {
        setView('list');
      }
      setEditReturnView('list');
      resetPartyForm();
      setIsCustomCategoryNew(false);
    } catch (err: any) {
      showStatus(err?.message || 'Operation failed', 'error');
    } finally {
      setIsSavingParty(false);
    }
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

  const handleSendWhatsAppForEntry = async (entry: LedgerEntry) => {
    if (!selectedParty) return;
    const phone = (selectedParty.phone || '').trim();
    if (!phone) {
      showStatus('WhatsApp alert not sent: Party phone number is missing', 'error');
      return;
    }
    if (!hasBridge('whatsappSendInvoice')) {
      showStatus('WhatsApp service not available', 'error');
      return;
    }

    try {
      const amt = Number(entry.credit_amount > 0 ? entry.credit_amount : entry.debit_amount) || 0;
      const runningBal = Number(entry.running_balance) || 0;
      const ob = runningBal - (Number(entry.credit_amount) || 0) + (Number(entry.debit_amount) || 0);

      const effectiveShopName = shopDetails.shopName || shopName || '';
      const waMsg = formatWhatsAppLedgerTxMessage({
        openingBalance: ob,
        amount: amt,
        newBalance: runningBal,
        paymentMethod: entry.payment_method || 'CASH',
        transactionType: entry.credit_amount > 0 ? 'CREDIT' : 'DEBIT',
        partyName: selectedParty.name,
        shopName: effectiveShopName,
        includeShopName: ledgerWhatsappIncludeShop,
      });

      const res = await whatsappApi.sendInvoice({
        phone,
        message: waMsg,
      });

      if (res?.success) {
        showStatus(`WhatsApp alert sent to ${selectedParty.name}!`, 'success');
      } else {
        showStatus(`WhatsApp Alert Failed: ${res?.error || 'WhatsApp not able to connect'}`, 'error');
      }
    } catch (err: any) {
      showStatus('WhatsApp Alert Failed: ' + (err?.message || 'Connection error'), 'error');
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedParty || !statementData) return;
    setIsExportingPdf(true);
    try {
      let effectiveLedgerForPdf = ledger;
      if (enablePartyGst && !enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === 'GST');
      } else if (!enablePartyGst && enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => e.balance_type === 'ESTIMATE');
      } else if (enablePartyGst && enablePartyEstimate && ledgerBalanceFilter !== 'ALL') {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === ledgerBalanceFilter);
      }
      const partyWithLedger = { ...selectedParty, ledger: effectiveLedgerForPdf };
      const effectiveShopName = shopDetails.shopName || shopName || 'STORE';
      const htmlContent = generatePartyLedgerHtml({
        shopName: effectiveShopName,
        shopAddress: shopDetails.shopAddress || undefined,
        shopPhone: shopDetails.shopPhone || undefined,
        shopEmail: shopDetails.shopEmail || undefined,
        shopGstin: shopDetails.shopGstin || undefined,
        shopState: shopDetails.shopState || undefined,
        party: partyWithLedger,
        filter: { startDate: ledgerStartDate, endDate: ledgerEndDate },
        terminology: tLabels,
        timezone: getStoreTimezone(),
        showBalanceType: enablePartyGst && enablePartyEstimate,
      });

      const pClean = selectedParty.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const startTag = ledgerStartDate || 'Beginning';
      const endTag = ledgerEndDate || 'Current';
      const defaultFilename = `Statement_${pClean}_${startTag}_to_${endTag}.pdf`;

      if (hasBridge('exportA4Pdf')) {
        const res = await printingApi.exportA4Pdf(
          tenantId || 'global',
          htmlContent,
          defaultFilename,
          { displayHeaderFooter: true }
        );
        if (res?.success) {
          if (!res.canceled) {
            showStatus(`Statement PDF downloaded successfully!`, 'success');
          }
        } else if (res?.error) {
          showStatus(`PDF export error: ${res.error}`, 'error');
        }
      } else {
        const pw = window.open('', '_blank');
        if (pw) {
          pw.document.write(htmlContent);
          pw.document.title = defaultFilename.replace('.pdf', '');
          pw.document.close();
          setTimeout(() => pw.print(), 500);
        }
      }
    } catch (err: any) {
      console.error('Download PDF error:', err);
      showStatus('Failed to generate PDF: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSendWhatsAppPdf = async () => {
    if (!selectedParty || !statementData) return;
    const phone = (selectedParty.phone || '').trim();
    if (!phone) {
      showStatus('WhatsApp alert not sent: Party phone number is missing', 'error');
      return;
    }
    setIsSendingWhatsAppPdf(true);
    try {
      let effectiveLedgerForPdf = ledger;
      if (enablePartyGst && !enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === 'GST');
      } else if (!enablePartyGst && enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => e.balance_type === 'ESTIMATE');
      } else if (enablePartyGst && enablePartyEstimate && ledgerBalanceFilter !== 'ALL') {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === ledgerBalanceFilter);
      }
      const partyWithLedger = { ...selectedParty, ledger: effectiveLedgerForPdf };
      const effectiveShopName = shopDetails.shopName || shopName || 'STORE';
      const htmlContent = generatePartyLedgerHtml({
        shopName: effectiveShopName,
        shopAddress: shopDetails.shopAddress || undefined,
        shopPhone: shopDetails.shopPhone || undefined,
        shopEmail: shopDetails.shopEmail || undefined,
        shopGstin: shopDetails.shopGstin || undefined,
        shopState: shopDetails.shopState || undefined,
        party: partyWithLedger,
        filter: { startDate: ledgerStartDate, endDate: ledgerEndDate },
        terminology: tLabels,
        timezone: getStoreTimezone(),
        showBalanceType: enablePartyGst && enablePartyEstimate,
      });

      const pClean = selectedParty.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const startTag = ledgerStartDate || 'Beginning';
      const endTag = ledgerEndDate || 'Current';
      const defaultFilename = `Statement_${pClean}_${startTag}_to_${endTag}.pdf`;

      const summaryMsg = formatWhatsAppStatementMessage({
        shopName: effectiveShopName,
        partyName: selectedParty.name,
        partyType: selectedParty.party_type || 'Customer',
        phone: selectedParty.phone,
        balance: statementData.closingBalance,
        balanceLabel: statementData.closingBalance > 0 ? tLabels.receivable : statementData.closingBalance < 0 ? tLabels.payable : 'Settled',
        totalDebit: statementData.periodDebit,
        totalCredit: statementData.periodCredit,
        entryCount: statementData.entryCount,
        lastDate: statementData.periodLabel,
      });

      if (hasBridge('whatsappSendInvoice')) {
        const res = await whatsappApi.sendInvoice({
          phone,
          message: summaryMsg,
          htmlContent,
          fileName: defaultFilename,
        });
        if (res?.success) {
          showStatus(`Statement PDF sent to ${selectedParty.name} via WhatsApp!`, 'success');
        } else {
          showStatus(`WhatsApp Alert Failed: ${res?.error || 'Could not send WhatsApp message'}`, 'error');
        }
      } else {
        const waUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(summaryMsg)}`;
        window.open(waUrl, '_blank');
        showStatus('Opened WhatsApp chat with statement summary', 'success');
      }
    } catch (err: any) {
      showStatus('WhatsApp Alert Failed: ' + (err?.message || 'Connection error'), 'error');
    } finally {
      setIsSendingWhatsAppPdf(false);
    }
  };

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;
    if (!txForm.amount) { showStatus('Amount is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage transactions', 'error'); return; }

    const parsedAmount = parseFloat(txForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { showStatus('Enter a valid positive amount', 'error'); return; }

    const effectiveBalanceType = (!enablePartyGst && enablePartyEstimate)
      ? 'ESTIMATE'
      : (enablePartyGst && !enablePartyEstimate)
      ? 'GST'
      : (!enablePartyGst && !enablePartyEstimate)
      ? 'GST'
      : txForm.balance_type;

    setIsSavingTx(true);
    try {
      if (editingTx) {
        await partiesApi.updatePartyLedgerEntry({
          ledger_id: editingTx.ledger_id,
          party_id: selectedParty.party_id,
          amount: parsedAmount,
          transaction_type: txForm.transaction_type,
          description: txForm.description.trim(),
          transaction_date: toUtcIso(txForm.transaction_date) ?? undefined,
          reference_number: txForm.reference_number.trim() || null,
          balance_type: effectiveBalanceType,
          payment_method: txForm.payment_method,
        });
        showStatus('Transaction updated', 'success');
      } else {
        await partiesApi.addPartyLedgerEntry({
          ledger_id: uuidv4(),
          party_id: selectedParty.party_id,
          tenant_id: tenantId,
          amount: parsedAmount,
          transaction_type: txForm.transaction_type,
          description: txForm.description.trim(),
          transaction_date: toUtcIso(txForm.transaction_date) || new Date().toISOString(),
          reference_number: txForm.reference_number.trim() || null,
          balance_type: effectiveBalanceType,
          payment_method: txForm.payment_method,
          created_by: userId,
          created_by_name: userName || undefined,
        });

        if (txForm.payment_method === 'CASH') {
          const cashType = txForm.transaction_type === 'CREDIT' ? 'CASH_OUT' : 'CASH_IN';
          await cashierApi.addTransaction({
            tenant_id: tenantId!,
            type: cashType,
            amount: parsedAmount,
            category: 'Party ' + (cashType === 'CASH_OUT' ? 'Payment' : 'Receipt'),
            notes: `${selectedParty.name} - ${txForm.description.trim()}`,
            user_id: userId!,
            user_name: userName || undefined,
          });
        }

        // WhatsApp notification handling
        const isPartyAlertEnabled = selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false;
        const shouldSendWa = Boolean(ledgerWhatsappEnabled && isPartyAlertEnabled && txForm.send_whatsapp);

        if (shouldSendWa) {
          const partyPhone = (selectedParty.phone || '').trim();
          if (!partyPhone) {
            showStatus('Transaction added. WhatsApp alert not sent: Party phone number is missing', 'error');
          } else {
            try {
              const ob = getPartyBalance(selectedParty);
              const creditAmt = txForm.transaction_type === 'CREDIT' ? parsedAmount : 0;
              const debitAmt = txForm.transaction_type === 'DEBIT' ? parsedAmount : 0;
              const nb = ob + creditAmt - debitAmt;
              const effectiveShopName = shopDetails.shopName || shopName || '';

              const waMsg = formatWhatsAppLedgerTxMessage({
                openingBalance: ob,
                amount: parsedAmount,
                newBalance: nb,
                paymentMethod: txForm.payment_method,
                transactionType: txForm.transaction_type,
                partyName: selectedParty.name,
                shopName: effectiveShopName,
                includeShopName: ledgerWhatsappIncludeShop,
              });

              if (hasBridge('whatsappSendInvoice')) {
                const waRes = await whatsappApi.sendInvoice({
                  phone: partyPhone,
                  message: waMsg,
                });
                if (!waRes?.success) {
                  showStatus(`Transaction added. WhatsApp Alert Failed: ${waRes?.error || 'WhatsApp not able to connect'}`, 'error');
                } else {
                  showStatus(`Transaction added & WhatsApp alert sent to ${selectedParty.name}!`, 'success');
                }
              } else {
                showStatus('Transaction added. WhatsApp service not available', 'error');
              }
            } catch (waErr: any) {
              console.error('[PartyManager] WhatsApp send error:', waErr);
              showStatus(`Transaction added. WhatsApp Alert Failed: ${waErr?.message || 'Connection error'}`, 'error');
            }
          }
        } else {
          showStatus('Transaction added', 'success');
        }
      }
      await loadLedger(selectedParty.party_id);
      const freshParties = await loadParties();
      const updatedParty = (freshParties || []).find(p => p.party_id === selectedParty.party_id);
      if (updatedParty) setSelectedParty(updatedParty);
      setView('ledger');
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
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
  }, [filteredParties.length]);

  // ── Shared field style ──
  const fieldCls = "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">

      {/* ══════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-5 py-3">

            {view === 'list' && (
              <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
                <Handshake className="w-4 h-4" />
              </div>
            )}

          {/* Title / Breadcrumb */}
          <div className="flex-1 min-w-0">
            {view === 'ledger' && selectedParty ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => { setView('list'); loadParties(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/80 hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-all active:scale-95 cursor-pointer shrink-0 border border-border"
                  title="Back to Party Directory"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Parties</span>
                </button>
                <span className="text-muted-foreground/30 font-bold shrink-0">/</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm font-black text-foreground truncate">{selectedParty.name}</h1>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5 truncate">
                    Ledger Statement &amp; Balance Sheet
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-foreground truncate">
                    {view === 'list'
                      ? 'Ledger'
                      : view === 'party_form'
                      ? (editingParty ? 'Edit Party' : 'New Party')
                      : editingTx
                      ? 'Edit Transaction'
                      : 'New Transaction'}
                  </h1>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                  {view === 'list'
                    ? `${parties.length} ${parties.length === 1 ? 'party' : 'parties'} · Track balances &amp; payments`
                    : view === 'party_form'
                    ? 'Fill in party details below'
                    : `Recording transaction for ${selectedParty?.name || 'Party'}`}
                </p>
              </div>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            {view === 'list' && isOwner && (
              <>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload (CSV/Excel)
                </button>
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Link className="w-3.5 h-3.5" /> Connect Party
                </button>
                <button
                  onClick={() => { resetPartyForm(); setView('party_form'); }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add Party
                </button>
              </>
            )}

            {view === 'ledger' && isOwner && (
              <button
                onClick={() => openTxForm('CREDIT')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Add Tx
              </button>
            )}

            <RedCrossButton
              onClick={onBackToCustomers ? onBackToCustomers : (view === 'list' ? onClose : view === 'ledger' ? () => { setView('list'); loadParties(); } : () => { setView(view === 'party_form' ? (editReturnView === 'ledger' && selectedParty ? 'ledger' : 'list') : 'ledger'); resetPartyForm(); })}
              title="Close"
            />
          </div>
        </div>
      </header>

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
