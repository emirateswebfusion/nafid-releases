import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import { useTerminologyStore } from '../store/terminologyStore';
import { fetchApi } from '../lib/api';
import { isAdminRole, hasPermission } from '../utils/permissions';
import {
  Search, Loader2, UserPlus, Handshake,
  Pencil, Trash, BookOpen, PlusCircle, MinusCircle,
  Calendar, Hash, User, X, CheckCircle2, AlertCircle, Save,
  UserCircle, Banknote, FileText, Phone, MapPin,
  TrendingUp, TrendingDown, Activity, ChevronRight, Wallet,
  CreditCard, Building2, Smartphone, MoreHorizontal, Tag, Layers,
  Trash2, RefreshCw, ArrowLeft, Link, QrCode, Share2, XCircle, Copy, Check,
  Eye, Printer, Receipt, Edit3, LayoutList, Table, Upload, ArrowUpDown, ArrowUp, ArrowDown, Clock, AlertTriangle, FileDown,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { Select } from './ui/Select';
import { Modal } from './ui/Modal';
import { DeleteTxModal } from './party/modals/DeleteTxModal';
import { DeletePartyModal } from './party/modals/DeletePartyModal';
import { PartyConnectModal } from './party/modals/PartyConnectModal';
import { PartyBillPreviewModal } from './party/modals/PartyBillPreviewModal';
import { PartyTransactionForm } from './party/views/PartyTransactionForm';
import { PartyLedgerView } from './party/views/PartyLedgerView';
import { DataUploadModal } from './DataUploadModal';
import { RedCrossButton } from './ui/RedCrossButton';
import { FloatToast } from './ui/FloatToast';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { getAppTimeFormat, parseUTCDate, formatBillDateTime, generateReceiptText } from '../utils/receiptGenerator';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { WhatsAppIcon } from './ui/WhatsAppIcon';
import { formatWhatsAppLedgerTxMessage, formatWhatsAppStatementMessage } from '../utils/whatsappBillHelper';
import { calculateLedgerStatement, generatePartyLedgerHtml, type LedgerEntryData } from '../utils/partyLedgerPdfGenerator';

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

const formatDate = (d: string) => {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
};

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
const toLocalInputValue = (iso: string): string => {
  const d = parseUTCDate(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Generate a consistent hue from a party name
const nameToHue = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
};

const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const PaymentMethodIcon = ({ method }: { method: string }) => {
  const map: Record<string, React.JSX.Element> = {
    CASH: <Wallet className="w-3.5 h-3.5" />,
    BANK_TRANSFER: <Building2 className="w-3.5 h-3.5" />,
    UPI: <Smartphone className="w-3.5 h-3.5" />,
    CARD: <CreditCard className="w-3.5 h-3.5" />,
    CHEQUE: <Receipt className="w-3.5 h-3.5" />,
    OTHER: <MoreHorizontal className="w-3.5 h-3.5" />,
  };
  return map[method] ?? <MoreHorizontal className="w-3.5 h-3.5" />;
};

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
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
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
        if (window.electronAPI?.dbGetInvoices) {
          const res = await window.electronAPI.dbGetInvoices({ search: term, tenant_id: tId });
          if (Array.isArray(res) && res.length > 0) {
            const match = res.find(inv =>
              String(inv.invoice_number).toLowerCase() === term.toLowerCase() ||
              String(inv.invoice_id).toLowerCase() === term.toLowerCase()
            ) || res[0];
            foundInvoice = match;
            break;
          }
        }
        if (!foundInvoice && window.electronAPI?.dbGetReturnInvoiceByNumber && (term.toUpperCase().startsWith('RTN-') || term.toUpperCase().startsWith('RET-'))) {
          try {
            const ret = await window.electronAPI.dbGetReturnInvoiceByNumber({ tenant_id: tId, return_number: term });
            if (ret && ret.invoice_id) {
              const res = await window.electronAPI.dbGetInvoices({ search: ret.invoice_id, tenant_id: tId });
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
        if (window.electronAPI?.dbGetInvoices) {
          const res = await window.electronAPI.dbGetInvoices({ tenant_id: tId, limit: 100 });
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
        if (window.electronAPI?.dbGetInvoiceItems) {
          const items = await window.electronAPI.dbGetInvoiceItems(foundInvoice.invoice_id);
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
          if (window.electronAPI?.dbGetScrapInvoiceByNumber) {
            const scrap = await window.electronAPI.dbGetScrapInvoiceByNumber({ tenant_id: tId, scrap_invoice_number: term });
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
      if (window.electronAPI?.printReceipt) {
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
          await window.electronAPI.printReceipt(tId, receiptText);
          showStatus('Receipt sent to printer', 'success');
        } catch {
          showStatus('Failed to print receipt', 'error');
        }
      }
    } else if (viewingLedgerVoucher) {
      if (window.electronAPI?.printReceipt) {
        try {
          const tId = tenantId || 'global';
          const amt = viewingLedgerVoucher.credit_amount > 0 ? viewingLedgerVoucher.credit_amount : viewingLedgerVoucher.debit_amount;
          const receiptText = `================================\n        PAYMENT VOUCHER         \n================================\nRef #: ${viewingLedgerVoucher.reference_number || viewingLedgerVoucher.ledger_id.slice(0, 8)}\nDate: ${formatDateTime(viewingLedgerVoucher.transaction_date)}\nParty: ${selectedParty?.name || ''}\nPhone: ${selectedParty?.phone || ''}\nType: ${viewingLedgerVoucher.credit_amount > 0 ? 'CREDIT SALE (GIVEN)' : 'PAYMENT (RECEIVED)'}\nPayment Mode: ${viewingLedgerVoucher.payment_method || 'CASH'}\n--------------------------------\nAmount: RS. ${amt.toFixed(2)}\nRunning Bal: RS. ${Math.abs(viewingLedgerVoucher.running_balance).toFixed(2)}\nNote: ${viewingLedgerVoucher.description || ''}\n================================\n`;
          await window.electronAPI.printReceipt(tId, receiptText);
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
        if (window.electronAPI?.dbGetInvoiceItems) {
          const data = await window.electronAPI.dbGetInvoiceItems(viewingInvoice.invoice_id);
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
    if (!tenantId || !window.electronAPI) return;
    try {
      const [gstVal, estVal, waEnabledVal, waIncShopVal] = await Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'enable_party_gst_balance' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'enable_party_estimate_balance' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'ledger_whatsapp_enabled' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'ledger_whatsapp_include_shop' }),
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
      if (window.electronAPI.settingsGetAll) {
        const all = await window.electronAPI.settingsGetAll({ tenant_id: tenantId || 'global' });
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
        const timer = setTimeout(() => setHighlightedPartyId(null), 3000);
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
      const data = await window.electronAPI.dbGetParties(tenantId);
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
    window.electronAPI.dbGetPricingTiers(tenantId)
      .then(res => {
        if (Array.isArray(res)) setPricingTiers(res);
      })
      .catch(console.error);

    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'custom_party_categories' })
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
      const data = await window.electronAPI.dbGetPartyLedger(partyId);
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

        const res = await window.electronAPI.dbUpdateParty(updatedFields);
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
        const res = await window.electronAPI.dbAddParty({
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
          window.electronAPI.settingsSet({
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
      await window.electronAPI.dbDeleteParty(partyToDelete.party_id);
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
    if (!window.electronAPI?.whatsappSendInvoice) {
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

      const res = await window.electronAPI.whatsappSendInvoice({
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

      if (window.electronAPI?.exportA4Pdf) {
        const res = await window.electronAPI.exportA4Pdf(
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

      if (window.electronAPI?.whatsappSendInvoice) {
        const res = await window.electronAPI.whatsappSendInvoice({
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
        await window.electronAPI.dbUpdatePartyLedgerEntry({
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
        await window.electronAPI.dbAddPartyLedgerEntry({
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
          await window.electronAPI.dbCashierAddTransaction({
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

              if (window.electronAPI?.whatsappSendInvoice) {
                const waRes = await window.electronAPI.whatsappSendInvoice({
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
      await window.electronAPI.dbDeletePartyLedgerEntry(txToDelete.ledger_id, selectedParty.party_id);
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
        <div className="flex flex-col flex-1 min-h-0">

          {/* Pending Connection Requests Banner */}
          {pendingRequests.length > 0 && (
            <div className="shrink-0 px-5 py-3 border-b border-border bg-indigo-500/10">
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={req.request_id} className="flex items-center justify-between gap-3 p-3 bg-card border border-indigo-500/30 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 shrink-0">
                        <Link className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">🤝 Connection Request from "{req.sender_tenant_name}"</p>
                        <p className="text-[11px] text-muted-foreground truncate">Code: {req.sender_connect_code} · Click to connect ledgers & auto-sync transactions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleRespondConnectRequest(req.request_id, 'ACCEPT')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => handleRespondConnectRequest(req.request_id, 'REJECT')}
                        className="p-1.5 bg-muted hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground rounded-xl transition-all cursor-pointer"
                        title="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary strip */}
          <div className="shrink-0 px-5 py-4 border-b border-border bg-transparent">
            <div className="grid grid-cols-3 gap-4">

              {/* Receivable */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-rose-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-rose-500/10 to-rose-500/5 text-rose-600 dark:text-rose-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">₹{totalReceivable.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">{tLabels.receivable}</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">{tLabels.receivableSub}</p>
                </div>
              </div>

              {/* Payable */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-emerald-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">₹{totalPayable.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">{tLabels.payable}</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">{tLabels.payableSub}</p>
                </div>
              </div>

              {/* Total parties */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-blue-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">{filteredParties.length}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">Contacts</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">{filteredParties.length === 1 ? 'Active contact' : 'Active contacts'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Layout toggle */}
          <div className="shrink-0 px-5 py-3 border-b border-border bg-background flex items-center justify-between gap-3">
            <div className="relative flex-1">
              {isSearchPending ? (
                <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin pointer-events-none" />
              ) : (
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              )}
              <input
                type="text"
                placeholder="Search by name, phone or GSTIN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={clsx(fieldCls, 'pl-10')}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setDebouncedSearchQuery(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-destructive hover:bg-destructive/10 border border-destructive/30 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              )}
            </div>

            {/* Layout View Switcher (Icon-only) */}
            <div className="flex items-center p-1 rounded-xl bg-muted/70 border border-border shrink-0 select-none">
              <button
                type="button"
                onClick={() => setListLayoutMode('table')}
                className={clsx(
                  "p-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
                  listLayoutMode === 'table'
                    ? "bg-card text-primary shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Table View"
              >
                <Table className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setListLayoutMode('cards')}
                className={clsx(
                  "p-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
                  listLayoutMode === 'cards'
                    ? "bg-card text-primary shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Cards View"
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs (Ledger Categorization) */}
          <div className="shrink-0 px-5 py-2.5 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
              <button
                onClick={() => setActiveTab('ALL')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'ALL'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                🌐 All
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {parties.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('CUSTOMER')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'CUSTOMER'
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                🛒 Customers
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.customer}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('SUPPLIER')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'SUPPLIER'
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                📦 Suppliers
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.supplier}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('STAFF')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'STAFF'
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                👥 Staff
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.staff}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('CUSTOM')}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  activeTab === 'CUSTOM'
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                🏦 Custom / Chitty
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-black/10 dark:bg-white/20 font-mono">
                  {tabCounts.custom}
                </span>
              </button>
            </div>

            {/* Sub-category filter for Custom parties */}
            {activeTab === 'CUSTOM' && customCategoriesList.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Category:</span>
                <select
                  value={customCategoryFilter}
                  onChange={e => setCustomCategoryFilter(e.target.value)}
                  className="bg-background border border-border rounded-xl px-3 py-1 text-xs font-bold text-foreground focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  {customCategoriesList.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
              </div>
            ) : filteredParties.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">
                    {searchQuery ? 'No results found' : 'No parties yet'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {searchQuery ? `No parties match "${searchQuery}"` : 'Add your first party to start tracking'}
                  </p>
                </div>
                {!searchQuery && isOwner && (
                  <button
                    onClick={() => { resetPartyForm(); setView('party_form'); }}
                    className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" /> Add First Party
                  </button>
                )}
              </div>
            ) : listLayoutMode === 'table' ? (
              /* ── Standard Party Directory Table View ── */
              <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/70 text-muted-foreground font-bold border-b border-border uppercase tracking-wider text-[11px] select-none sticky top-0 backdrop-blur-md">
                      <th className="py-3 px-4">Party Name</th>
                      <th className="py-3 px-4">Category / Type</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-right">Credit Limit</th>
                      <th className="py-3 px-4">Last Activity</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {displayedParties.map(party => {
                      const balance = getPartyBalance(party);
                      const isReceivable = balance > 0;
                      const isPayable = balance < 0;
                      const hue = nameToHue(party.name);
                      return (
                        <tr
                          key={party.party_id}
                          id={`party-row-${party.party_id}`}
                          onClick={() => {
                            lastInteractedPartyId.current = party.party_id;
                            if (listScrollRef.current) {
                              savedScrollTop.current = listScrollRef.current.scrollTop;
                            }
                            setSelectedParty(party);
                            setView('ledger');
                            loadLedger(party.party_id);
                          }}
                          className={clsx(
                            "hover:bg-muted/40 transition-colors cursor-pointer group",
                            highlightedPartyId === party.party_id && "bg-primary/10"
                          )}
                        >
                          {/* Party Name */}
                          <td className="py-3 px-4 font-bold text-foreground">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-black text-xs shadow-xs"
                                style={{ background: `hsl(${hue}, 65%, 52%)` }}
                              >
                                {getInitials(party.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">{party.name}</p>
                                {party.gstin && <p className="text-[10px] text-muted-foreground font-mono">GST: {party.gstin}</p>}
                              </div>
                            </div>
                          </td>

                          {/* Type / Category */}
                          <td className="py-3 px-4">
                            {party.party_type === 'SUPPLIER' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                                📦 Supplier
                              </span>
                            )}
                            {party.party_type === 'STAFF' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                👥 Staff
                              </span>
                            )}
                            {party.party_type === 'CUSTOM' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                                🏦 {party.custom_category || 'Custom'}
                              </span>
                            )}
                            {(!party.party_type || party.party_type === 'CUSTOMER') && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                                🛒 Customer
                              </span>
                            )}
                          </td>

                          {/* Contact */}
                          <td className="py-3 px-4 font-medium text-muted-foreground">
                            {party.phone ? (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-muted-foreground/70" />
                                <span>{party.phone}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>

                          {/* Balance */}
                          <td className="py-3 px-4 text-right">
                            <span className={clsx(
                              "font-mono font-black text-sm block",
                              isReceivable ? "text-rose-600 dark:text-rose-400" :
                              isPayable ? "text-emerald-600 dark:text-emerald-400" :
                              "text-muted-foreground"
                            )}>
                              ₹{Math.abs(balance).toFixed(2)}
                            </span>
                            {enablePartyGst && enablePartyEstimate && (
                              <div className="flex items-center justify-end gap-1.5 text-[9px] font-bold font-mono mt-0.5">
                                <span className="text-sky-600 dark:text-sky-400" title="GST Balance">G: ₹{Math.abs(Number(party.current_gst_balance ?? party.gst_balance ?? 0)).toFixed(2)}</span>
                                <span className="text-muted-foreground/30">•</span>
                                <span className="text-violet-600 dark:text-violet-400" title="Estimate Balance">E: ₹{Math.abs(Number(party.current_estimate_balance ?? party.estimate_balance ?? 0)).toFixed(2)}</span>
                              </div>
                            )}
                            {enablePartyGst && !enablePartyEstimate && (
                              <div className="flex items-center justify-end text-[9px] font-bold font-mono text-sky-600 dark:text-sky-400 mt-0.5">
                                GST Balance
                              </div>
                            )}
                            {!enablePartyGst && enablePartyEstimate && (
                              <div className="flex items-center justify-end text-[9px] font-bold font-mono text-violet-600 dark:text-violet-400 mt-0.5">
                                Estimate Balance
                              </div>
                            )}
                            <span className={clsx(
                              "inline-block text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border mt-0.5",
                              isReceivable ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400" :
                              isPayable ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                              "bg-muted border-border text-muted-foreground"
                            )}>
                              {isReceivable ? tLabels.receivable : isPayable ? tLabels.payable : 'Settled'}
                            </span>
                          </td>

                          {/* Credit Limit & Period */}
                          <td className="py-3 px-4 text-right font-mono font-semibold text-muted-foreground">
                            <div className="flex flex-col items-end gap-1">
                              {party.credit_limit != null && Number(party.credit_limit) > 0 && (
                                <span className={clsx(
                                  "px-2 py-0.5 rounded border text-[11px] font-bold",
                                  isReceivable && balance >= party.credit_limit
                                    ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                                    : "bg-muted border-border text-foreground"
                                )}>
                                  ₹{Number(party.credit_limit).toLocaleString('en-IN')}
                                </span>
                              )}
                              {Boolean(party.credit_period_enabled) && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                                  <Clock className="w-2.5 h-2.5" />
                                  {party.credit_period_days || 30}d
                                </span>
                              )}
                              {party.has_overdue && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  OVERDUE
                                </span>
                              )}
                              {(!party.credit_limit || Number(party.credit_limit) <= 0) && !party.credit_period_enabled && !party.has_overdue && (
                                <span className="text-muted-foreground/30">—</span>
                              )}
                            </div>
                          </td>

                          {/* Last Activity */}
                          <td className="py-3 px-4 font-medium text-muted-foreground text-[11px]">
                            {party.last_transaction_date ? formatDate(party.last_transaction_date) : '—'}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setSelectedParty(party);
                                  setLedgerBalanceFilter('ALL');
                                  setView('ledger');
                                  loadLedger(party.party_id);
                                }}
                                className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                                title="Open Ledger"
                              >
                                <BookOpen className="w-4 h-4" />
                              </button>
                              {isOwner && (
                                <button
                                  onClick={() => startEditingParty(party, 'list')}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteParty(party)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                  title="Delete"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedParties.map(party => {
                  const hue = nameToHue(party.name);
                  const balance = getPartyBalance(party);
                  const isReceivable = balance > 0;
                  const isPayable = balance < 0;
                  const _isSettled = balance === 0;
                  return (
                    <div
                      key={party.party_id}
                      id={`party-row-${party.party_id}`}
                      className={clsx(
                        "group flex items-center gap-3.5 p-4 rounded-2xl border border-border bg-card dark:bg-card hover:border-primary/30 hover:bg-card transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer",
                        highlightedPartyId === party.party_id && "ring-2 ring-primary ring-offset-2 bg-primary/10 border-primary"
                      )}
                      onClick={() => {
                        lastInteractedPartyId.current = party.party_id;
                        if (listScrollRef.current) {
                          savedScrollTop.current = listScrollRef.current.scrollTop;
                        }
                        setSelectedParty(party);
                        setLedgerBalanceFilter('ALL');
                        setView('ledger');
                        loadLedger(party.party_id);
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-sm shadow-inner select-none"
                        style={{ background: `hsl(${hue}, 65%, 52%)` }}
                      >
                        {getInitials(party.name)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-foreground truncate">{party.name}</p>
                          {/* Party Type Badge */}
                          {party.party_type === 'SUPPLIER' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              📦 Supplier
                            </span>
                          )}
                          {party.party_type === 'STAFF' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              👥 Staff
                            </span>
                          )}
                          {party.party_type === 'CUSTOM' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              🏦 {party.custom_category || 'Custom'}
                            </span>
                          )}
                          {(!party.party_type || party.party_type === 'CUSTOMER') && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              🛒 Customer
                            </span>
                          )}
                          {party.gstin && (
                            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              GST
                            </span>
                          )}
                          {party.pricing_tier_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 dark:bg-violet-500/20 border border-violet-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                              <Tag className="w-2.5 h-2.5" />
                              {pricingTiers.find(t => t.pricing_tier_id === party.pricing_tier_id)?.name || 'Tier'}
                            </span>
                          )}
                          {party.credit_limit != null && Number(party.credit_limit) > 0 && (
                            <span className={clsx(
                              "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 border",
                              isReceivable && balance >= party.credit_limit
                                ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20"
                                : "text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20"
                            )}>
                              <CreditCard className="w-2.5 h-2.5" />
                              Limit: ₹{Number(party.credit_limit).toLocaleString('en-IN')}
                            </span>
                          )}
                          {Boolean(party.credit_period_enabled) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 border text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20">
                              <Clock className="w-2.5 h-2.5" />
                              {party.credit_period_days || 30}d Period
                            </span>
                          )}
                          {party.has_overdue && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0 border text-rose-600 dark:text-rose-400 bg-rose-500/15 border-rose-500/30 animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              OVERDUE ({party.overdue_bills_count || 1})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-medium">
                          {party.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />{party.phone}
                            </span>
                          )}
                          {party.last_transaction_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{formatDate(party.last_transaction_date)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Balance */}
                      <div className="text-right shrink-0">
                        <p className={clsx(
                          'text-base font-black leading-none',
                          isReceivable ? 'text-red-500 dark:text-red-400' :
                          isPayable ? 'text-emerald-600 dark:text-emerald-400' :
                          'text-muted-foreground'
                        )}>
                          ₹{Math.abs(balance).toFixed(2)}
                        </p>
                        {enablePartyGst && enablePartyEstimate && (
                          <div className="flex items-center justify-end gap-1 text-[9px] font-bold font-mono mt-1">
                            <span className="text-sky-600 dark:text-sky-400" title="GST Balance">G: ₹{Math.abs(Number(party.current_gst_balance ?? party.gst_balance ?? 0)).toFixed(2)}</span>
                            <span className="text-muted-foreground/30">•</span>
                            <span className="text-violet-600 dark:text-violet-400" title="Estimate Balance">E: ₹{Math.abs(Number(party.current_estimate_balance ?? party.estimate_balance ?? 0)).toFixed(2)}</span>
                          </div>
                        )}
                        {enablePartyGst && !enablePartyEstimate && (
                          <div className="flex items-center justify-end text-[9px] font-bold font-mono text-sky-600 dark:text-sky-400 mt-1">
                            GST Balance
                          </div>
                        )}
                        {!enablePartyGst && enablePartyEstimate && (
                          <div className="flex items-center justify-end text-[9px] font-bold font-mono text-violet-600 dark:text-violet-400 mt-1">
                            Estimate Balance
                          </div>
                        )}
                        <span className={clsx(
                          'inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border',
                          isReceivable ? 'bg-red-500/10 dark:bg-red-500/20 border-red-500/20 text-red-500 dark:text-red-400' :
                          isPayable ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                          'bg-muted border-border text-muted-foreground'
                        )}>
                          {isReceivable ? tLabels.receivable : isPayable ? tLabels.payable : 'Settled'}
                        </span>
                        {party.credit_limit != null && Number(party.credit_limit) > 0 && isReceivable && (
                          <div className="mt-0.5 text-[9px]">
                            {balance >= party.credit_limit ? (
                              <span className="text-red-500 font-bold">Limit Reached</span>
                            ) : (
                              <span className="text-muted-foreground font-medium">Avail: ₹{Math.max(0, Number(party.credit_limit) - Number(balance)).toLocaleString('en-IN')}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions (show on hover) */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={e => e.stopPropagation()}>
                        {isOwner && (
                          <button
                            onClick={() => {
                              lastInteractedPartyId.current = party.party_id;
                              if (listScrollRef.current) {
                                savedScrollTop.current = listScrollRef.current.scrollTop;
                              }
                              startEditingParty(party, 'list');
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-95 cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => handleDeleteParty(party)}
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

            {/* Pagination / Load more indicator */}
            {filteredParties.length > displayedParties.length && (
              <div className="py-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  Showing <span className="font-bold text-foreground font-mono">{displayedParties.length}</span> of{' '}
                  <span className="font-bold text-foreground font-mono">{filteredParties.length}</span> parties
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleCount(prev => Math.min(prev + 50, filteredParties.length))}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer shadow-xs border border-border"
                >
                  Load more ({filteredParties.length - displayedParties.length} remaining)...
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          PARTY FORM VIEW
      ══════════════════════════════════════════ */}
      {view === 'party_form' && (
        <form onSubmit={(e) => { e.preventDefault(); handleSaveParty(); }} className="flex flex-col flex-1 min-h-0 bg-background" onKeyDown={handleFormKeyDown as unknown as React.KeyboardEventHandler<HTMLFormElement>}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4" data-enter-nav>

            {/* Section: Identity */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <UserCircle className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Party Identity</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-4">
                  {/* Party Type Selection */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-primary" />
                      Party Type <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { key: 'CUSTOMER', label: '🛒 Customer', desc: 'Customer Billing' },
                        { key: 'SUPPLIER', label: '📦 Supplier', desc: 'Purchase Supplier' },
                        { key: 'STAFF', label: '👥 Staff', desc: 'Staff Member' },
                        { key: 'CUSTOM', label: '🏦 Custom', desc: 'Chitty / Savings / Other' },
                      ].map(t => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setPartyForm(f => ({ ...f, party_type: t.key as any }))}
                          className={clsx(
                            "p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-95",
                            partyForm.party_type === t.key
                              ? "border-primary bg-primary/10 text-primary font-black shadow-sm"
                              : "border-border bg-background hover:bg-muted/50 text-muted-foreground font-semibold"
                          )}
                        >
                          <p className="text-xs">{t.label}</p>
                          <p className="text-[9px] opacity-75 mt-0.5">{t.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Category Selection if party_type === 'CUSTOM' */}
                  {partyForm.party_type === 'CUSTOM' && (
                    <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                      <label className="block text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-2">
                        Choose Custom Category <span className="text-red-500">*</span>
                      </label>

                      {/* Quick Select Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        {allCustomCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setPartyForm(f => ({ ...f, custom_category: cat }));
                              setIsCustomCategoryNew(false);
                            }}
                            className={clsx(
                              "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none",
                              partyForm.custom_category.toLowerCase() === cat.toLowerCase() && !isCustomCategoryNew
                                ? "bg-amber-600 text-white border-amber-700 shadow-sm"
                                : "bg-background border-border text-foreground hover:bg-muted"
                            )}
                          >
                            {cat === 'KSEB' ? '⚡ ' : cat.includes('Chitty') || cat.includes('KSFE') ? '🏦 ' : '🏷️ '}
                            {cat}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomCategoryNew(true);
                            setPartyForm(f => ({ ...f, custom_category: '' }));
                          }}
                          className={clsx(
                            "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none",
                            isCustomCategoryNew
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-muted/60 hover:bg-muted border-border text-muted-foreground"
                          )}
                        >
                          ➕ Add New Category
                        </button>
                      </div>

                      {/* Input field for custom category */}
                      {(isCustomCategoryNew || !allCustomCategories.map(c => c.toLowerCase()).includes(partyForm.custom_category.toLowerCase())) && (
                        <div>
                          <label className="block text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-1">
                            Type New Category Name:
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. KSEB Electricity, Partner Deposit, Water Authority"
                            value={partyForm.custom_category}
                            onChange={e => setPartyForm(f => ({ ...f, custom_category: e.target.value }))}
                            className={fieldCls}
                            autoFocus
                          />
                          <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5 font-medium">
                            This new category will be saved automatically in the system and will remain available for future selection.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Rajan Traders"
                      value={partyForm.name}
                      onChange={e => setPartyForm(f => ({ ...f, name: e.target.value }))}
                      className={fieldCls}
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Phone number"
                          value={partyForm.phone}
                          onChange={e => setPartyForm(f => ({ ...f, phone: e.target.value }))}
                          className={clsx(fieldCls, 'pl-9')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GSTIN</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="GSTIN (optional)"
                          value={partyForm.gstin}
                          onChange={e => setPartyForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                          className={clsx(fieldCls, 'pl-9 font-mono tracking-wider')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Link className="w-3.5 h-3.5" /> Nafid Connect Code
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="e.g. NF-8924K"
                          value={partyForm.connect_code || ''}
                          onChange={e => setPartyForm(f => ({ ...f, connect_code: e.target.value.toUpperCase() }))}
                          className={clsx(fieldCls, 'uppercase font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col h-full">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    Address
                  </label>
                  <div className="relative flex-1 flex flex-col min-h-0">
                    <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
                    <textarea
                      placeholder="Optional address, door number, street, city or PIN"
                      value={partyForm.address}
                      onChange={e => setPartyForm(f => ({ ...f, address: e.target.value }))}
                      className={clsx(fieldCls, 'pl-9 resize-none flex-1 w-full min-h-[160px] leading-relaxed')}
                    />
                  </div>
                </div>
              </div>
              {/* ── Commercial & Credit Configuration ── */}
              <div className="mt-5 pt-5 border-t border-border/70 space-y-5">
                {/* Section Header */}
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-amber-500/10 text-amber-500">
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    Commercial & Credit Configuration
                  </span>
                </div>

                {/* Pricing Tier & Credit Limit Side-by-Side Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Default Pricing Tier Card */}
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 flex flex-col justify-between">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-violet-500" />
                        Default Pricing Tier
                      </label>
                      <p className="text-[11px] text-muted-foreground mb-2.5">
                        Applied automatically when billing items to this customer.
                      </p>
                    </div>
                    {pricingTiers.length > 0 ? (
                      <Select
                        value={partyForm.pricing_tier_id}
                        onChange={v => setPartyForm(f => ({ ...f, pricing_tier_id: v }))}
                        options={[
                          { value: '', label: 'Standard MRP (Default)' },
                          ...pricingTiers
                            .filter(t => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted)
                            .map(t => ({ value: t.pricing_tier_id, label: t.name })),
                        ]}
                        triggerClassName="rounded-xl h-[42px] w-full bg-background"
                      />
                    ) : (
                      <div className="p-2.5 bg-background border border-border/80 rounded-xl text-xs text-muted-foreground">
                        Standard MRP (Configure custom tiers in <span className="font-semibold text-foreground">Settings &gt; Pricing Tiers</span>).
                      </div>
                    )}
                  </div>

                  {/* Credit Limit Card */}
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-amber-500" />
                          Credit Limit (₹)
                        </label>
                        <span className="text-[11px] font-mono font-semibold text-muted-foreground">
                          {Number(partyForm.credit_limit) > 0 ? `Max ₹${Number(partyForm.credit_limit).toLocaleString('en-IN')}` : 'No Limit'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2.5">
                        Maximum outstanding credit balance allowed.
                      </p>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00 (No Limit)"
                        value={partyForm.credit_limit}
                        onChange={e => setPartyForm(f => ({ ...f, credit_limit: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={clsx(fieldCls, 'pl-8 bg-background no-spinners h-[42px] font-mono font-bold')}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Dedicated Credit Period Box ── */}
                <div className={clsx(
                  "rounded-2xl border transition-all duration-200 overflow-hidden",
                  partyForm.credit_period_enabled
                    ? "bg-card border-indigo-500/30 shadow-xs"
                    : "bg-muted/15 border-border/60"
                )}>
                  {/* Credit Period Header & Toggle */}
                  <div className="p-4.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        partyForm.credit_period_enabled
                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                          : "bg-muted text-muted-foreground"
                      )}>
                        <Clock className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-foreground tracking-tight">Credit Period Management</span>
                          {partyForm.credit_period_enabled && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                              {partyForm.credit_period_days || 30} Days
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Enforce payment deadlines independently of credit limits. Overdue credit bills can restrict new credit purchases.
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                      <input
                        type="checkbox"
                        checked={partyForm.credit_period_enabled}
                        onChange={e => setPartyForm(f => ({ ...f, credit_period_enabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                  </div>

                  {/* Expanded Settings */}
                  {partyForm.credit_period_enabled && (
                    <div className="px-5 pb-5 pt-3 border-t border-border/60 space-y-4.5 animate-in fade-in-50 duration-200">
                      {/* Duration Configuration */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            Credit Duration (Days)
                          </label>
                          <span className="text-xs font-mono font-extrabold text-primary">
                            {partyForm.credit_period_days || 30} Days Grace Period
                          </span>
                        </div>

                        {/* Combined Preset Pills & Input Group */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/70 shrink-0">
                            {[15, 30, 45, 50, 60].map(days => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => setPartyForm(f => ({ ...f, credit_period_days: String(days) }))}
                                className={clsx(
                                  "px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer select-none active:scale-95",
                                  String(partyForm.credit_period_days) === String(days)
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                                )}
                              >
                                {days}d
                              </button>
                            ))}
                          </div>

                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="Custom days (e.g. 30)"
                              value={partyForm.credit_period_days}
                              onChange={e => setPartyForm(f => ({ ...f, credit_period_days: e.target.value }))}
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              className={clsx(fieldCls, 'h-[40px] no-spinners text-xs font-bold pr-16')}
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                              Days
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Calculation Basis Dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Calculation Basis
                        </label>
                        <select
                          value={partyForm.credit_period_basis}
                          onChange={e => setPartyForm(f => ({ ...f, credit_period_basis: e.target.value }))}
                          className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs cursor-pointer"
                        >
                          <option value="BILL_BASED">Option A: Bill-Based (Payment due date calculated separately from each bill date)</option>
                          <option value="OLDEST_UNPAID">Option B: Oldest Unpaid Bill (Due date counted from oldest unsettled bill)</option>
                        </select>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Calculates each credit bill's deadline individually and tracks overdue status via FIFO settlement.
                        </p>
                      </div>

                      {/* Expiry Restriction Policy Selection */}
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          When Credit Period Expires
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPartyForm(f => ({ ...f, restrict_on_credit_expiry: true }))}
                            className={clsx(
                              "p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-3",
                              partyForm.restrict_on_credit_expiry
                                ? "border-rose-500 bg-rose-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">🚫</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", partyForm.restrict_on_credit_expiry ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
                                Restrict Further Credit
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                Blocks new credit sales if any previous bill is overdue. Cash/Card/UPI transactions remain fully open.
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPartyForm(f => ({ ...f, restrict_on_credit_expiry: false }))}
                            className={clsx(
                              "p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-3",
                              !partyForm.restrict_on_credit_expiry
                                ? "border-emerald-500 bg-emerald-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">✅</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", !partyForm.restrict_on_credit_expiry ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                Allow Further Credit
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                Permits further credit sales even past due date, subject to available credit limit.
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Info Banner */}
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                        <span className="text-sm shrink-0">💡</span>
                        <p className="leading-relaxed">
                          <strong>Independent Control:</strong> Credit Period functions independently of Credit Limit. A customer may have plenty of available limit but will still be restricted from credit purchases if past bills remain unpaid.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
            {!editingParty && (
              <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Opening Balance</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Balance Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['RECEIVABLE', 'PAYABLE'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setPartyForm(f => ({ ...f, balance_type: t }))}
                          className={clsx(
                            'py-3 px-3 rounded-xl border-2 text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer text-center',
                            partyForm.balance_type === t
                              ? t === 'RECEIVABLE'
                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {t === 'RECEIVABLE' ? '↑ Receivable' : '↓ Payable'}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium mt-2 leading-snug">
                      {partyForm.balance_type === 'RECEIVABLE'
                        ? '🔴 Party owes you this amount'
                        : '🟢 You owe the party this amount'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Opening Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={partyForm.opening_balance}
                        onChange={e => setPartyForm(f => ({ ...f, opening_balance: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={clsx(fieldCls, 'pl-8 no-spinners')}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium mt-2">
                      {partyForm.balance_type === 'RECEIVABLE'
                        ? 'Will add to the balance (+)'
                        : 'Will subtract from the balance (-)'}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Section: Notes */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-blue-500">{editingParty ? '2' : '3'}. Notes</span>
              </div>
              <textarea
                placeholder="Internal notes about this party (optional)"
                rows={3}
                value={partyForm.notes}
                onChange={e => setPartyForm(f => ({ ...f, notes: e.target.value }))}
                className={clsx(fieldCls, 'resize-none')}
              />
            </section>

            {/* Section: WhatsApp Alerts */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                  <WhatsAppIcon className="w-4 h-4 text-emerald-500 fill-current" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {editingParty ? '3' : '4'}. WhatsApp Alerts
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/80 hover:bg-muted/50 transition-colors">
                <div className="space-y-0.5 pr-3">
                  <span className="text-xs font-bold text-foreground block">
                    Enable WhatsApp Transaction Alerts for this Party
                  </span>
                  <span className="text-[11px] text-muted-foreground block leading-relaxed">
                    When active, ledger transactions recorded for this party will send an automated text message showing Opening Balance, Paid/Received Amount, and Balance.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={partyForm.whatsapp_alerts_enabled}
                    onChange={e => setPartyForm(f => ({ ...f, whatsapp_alerts_enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-inner"></div>
                </label>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-card px-5 py-3">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (editReturnView === 'ledger' && selectedParty) {
                    setView('ledger');
                  } else {
                    setView('list');
                  }
                  resetPartyForm();
                  setEditReturnView('list');
                }}
                className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-enter-submit
                disabled={isSavingParty}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                {isSavingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSavingParty ? 'Saving…' : editingParty ? 'Update Party' : 'Create Party'}
              </button>
            </div>
          </div>
        </form>
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
          shopName={shopName}
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
