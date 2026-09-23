import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { fetchApi } from '../lib/api';
import {
  Search, Loader2, UserPlus, Handshake,
  Pencil, Trash, BookOpen, PlusCircle, MinusCircle,
  Calendar, Hash, User, X, CheckCircle2, AlertCircle, Save,
  UserCircle, Banknote, FileText, Phone, MapPin,
  TrendingUp, TrendingDown, Activity, ChevronRight, Wallet,
  CreditCard, Building2, Smartphone, MoreHorizontal, Tag, Layers,
  Trash2, RefreshCw, ArrowLeft, Link, QrCode, Share2, XCircle, Copy, Check,
} from 'lucide-react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { Select } from './ui/Select';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { FloatToast } from './ui/FloatToast';
import { getAppTimeFormat, parseUTCDate } from '../utils/receiptGenerator';
import { getStoreTimezone } from '../utils/timezoneHelper';

interface Party {
  party_id: string;
  name: string;
  phone: string;
  address: string;
  gstin: string;
  balance: number;
  gst_balance?: number;
  estimate_balance?: number;
  balance_type: 'RECEIVABLE' | 'PAYABLE';
  party_type?: 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM' | string;
  custom_category?: string | null;
  notes: string;
  last_transaction_date: string;
  created_at: string;
  pricing_tier_id?: string | null;
  credit_limit?: number;
  connected_tenant_id?: string | null;
  connected_party_id?: string | null;
  connection_status?: 'UNLINKED' | 'PENDING' | 'CONNECTED' | string;
  connect_code?: string | null;
}

interface LedgerEntry {
  ledger_id: string;
  party_id: string;
  transaction_date: string;
  description: string;
  credit_amount: number;
  debit_amount: number;
  running_balance: number;
  balance_type?: 'GST' | 'ESTIMATE';
  payment_method?: string;
  reference_number: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

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
  const { tenantId, userId, userName, role } = useAuthStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const isOwner = !role || ['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPER_ADMIN', 'STAFF', 'BILLER', 'CASHIER'].includes(role.toUpperCase());

  const listScrollRef = useRef<HTMLDivElement>(null);
  const lastInteractedPartyId = useRef<string | null>(null);
  const savedScrollTop = useRef<number>(0);
  const [highlightedPartyId, setHighlightedPartyId] = useState<string | null>(null);

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);

  const [view, setView] = useState<View>('list');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM'>('ALL');
  const [customCategoryFilter, setCustomCategoryFilter] = useState<string>('ALL');
  const [savedCustomCategories, setSavedCustomCategories] = useState<string[]>([]);
  const [isCustomCategoryNew, setIsCustomCategoryNew] = useState(false);
  const [partyForm, setPartyForm] = useState({
    name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE' as 'RECEIVABLE' | 'PAYABLE',
    party_type: 'CUSTOMER' as 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM',
    custom_category: '',
    notes: '', pricing_tier_id: '', credit_limit: '', connect_code: ''
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

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [editingTx, setEditingTx] = useState<LedgerEntry | null>(null);
  const [isSavingTx, setIsSavingTx] = useState(false);
  const [txForm, setTxForm] = useState({
    amount: '', transaction_type: 'CREDIT' as 'CREDIT' | 'DEBIT',
    description: '', transaction_date: '', reference_number: '',
    balance_type: 'GST' as 'GST' | 'ESTIMATE',
    payment_method: 'CASH' as 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'OTHER',
  });

  const [deleteTxModalOpen, setDeleteTxModalOpen] = useState(false);
  const [txToDelete, setTxToDelete] = useState<LedgerEntry | null>(null);
  const [deleteTxSaving, setDeleteTxSaving] = useState(false);

  const [deletePartyModalOpen, setDeletePartyModalOpen] = useState(false);
  const [partyToDelete, setPartyToDelete] = useState<Party | null>(null);
  const [deletePartySaving, setDeletePartySaving] = useState(false);

  const [enablePartyGst, setEnablePartyGst] = useState(true);
  const [enablePartyEstimate, setEnablePartyEstimate] = useState(true);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const loadPartySettings = useCallback(async () => {
    if (!tenantId || !window.electronAPI) return;
    try {
      const [gstVal, estVal] = await Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'enable_party_gst_balance' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'enable_party_estimate_balance' }),
      ]);
      let g = gstVal !== null && gstVal !== undefined ? Boolean(gstVal) : true;
      let e = estVal !== null && estVal !== undefined ? Boolean(estVal) : true;
      if (!g && !e) g = true;
      setEnablePartyGst(g);
      setEnablePartyEstimate(e);
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

  // Restore scroll position and highlight party row when returning to list
  useEffect(() => {
    if (view === 'list' && (lastInteractedPartyId.current || savedScrollTop.current > 0)) {
      const targetId = lastInteractedPartyId.current;
      if (targetId) {
        setHighlightedPartyId(targetId);
        const timer = setTimeout(() => setHighlightedPartyId(null), 3000);
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
    const defaultBalanceType = enablePartyGst ? 'GST' : 'ESTIMATE';
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setTxForm({
      amount: '',
      transaction_type: transactionType,
      description: '',
      transaction_date: dateStr,
      reference_number: '',
      balance_type: defaultBalanceType,
      payment_method: 'CASH',
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
        setLedger(Array.isArray(data) ? data : []);
      }
    } catch {
      showStatus('Failed to load ledger', 'error');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (!initialPartyIdOrQuery || parties.length === 0) return;
    const q = initialPartyIdOrQuery.trim().toLowerCase();
    const found = parties.find(p =>
      p.party_id === initialPartyIdOrQuery ||
      (p.phone && String(p.phone).trim() === initialPartyIdOrQuery.trim()) ||
      (p.name && p.name.trim().toLowerCase() === q)
    );
    if (found) {
      setSelectedParty(found);
      setView('ledger');
      loadLedger(found.party_id);
    } else {
      setSearchQuery(initialPartyIdOrQuery);
    }
  }, [initialPartyIdOrQuery, parties]);

  const resetPartyForm = () => {
    setPartyForm({ name: '', phone: '', address: '', gstin: '', opening_balance: '', balance_type: 'RECEIVABLE', party_type: 'CUSTOMER', custom_category: '', notes: '', pricing_tier_id: '', credit_limit: '' });
    setEditingParty(null);
  };

  const handleSaveParty = async () => {
    if (!partyForm.name.trim()) { showStatus('Party name is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage parties', 'error'); return; }
    setIsSavingParty(true);
    const parsedCreditLimit = Math.max(0, parseFloat(partyForm.credit_limit) || 0);
    try {
      if (editingParty) {
        await window.electronAPI.dbUpdateParty({
          party_id: editingParty.party_id,
          name: partyForm.name.trim(),
          phone: partyForm.phone.trim() || null,
          address: partyForm.address.trim() || null,
          gstin: partyForm.gstin.trim() || null,
          party_type: partyForm.party_type,
          custom_category: partyForm.party_type === 'CUSTOM' ? (partyForm.custom_category.trim() || null) : null,
          notes: partyForm.notes.trim() || null,
          pricing_tier_id: partyForm.pricing_tier_id || null,
          credit_limit: parsedCreditLimit,
        });
        showStatus('Party updated successfully', 'success');
      } else {
        await window.electronAPI.dbAddParty({
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
          created_by: userId,
          created_by_name: userName || undefined,
        });
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
      setView('list');
      resetPartyForm();
      setIsCustomCategoryNew(false);
    } catch {
      showStatus('Operation failed', 'error');
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

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;
    if (!txForm.amount) { showStatus('Amount is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage transactions', 'error'); return; }

    const parsedAmount = parseFloat(txForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { showStatus('Enter a valid positive amount', 'error'); return; }

    const effectiveBalanceType = !enablePartyGst ? 'ESTIMATE' : !enablePartyEstimate ? 'GST' : txForm.balance_type;

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

        showStatus('Transaction added', 'success');
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

  const filteredParties = parties.filter(p => {
    const matchesSearch = !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.phone || '').includes(searchQuery) ||
      (p.gstin || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

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

  const customCategoriesList = allCustomCategories;

  const totalReceivable = filteredParties.reduce((s, p) => s + (p.balance > 0 ? p.balance : 0), 0);
  const totalPayable = filteredParties.reduce((s, p) => s + (p.balance < 0 ? Math.abs(p.balance) : 0), 0);

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

          {/* Title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground truncate">
                {view === 'list'
                  ? 'Ledger'
                  : view === 'party_form'
                  ? (editingParty ? 'Edit Party' : 'New Party')
                  : view === 'ledger' && selectedParty
                  ? selectedParty.name
                  : editingTx
                  ? 'Edit Transaction'
                  : 'New Transaction'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
              {view === 'list'
                ? `${parties.length} ${parties.length === 1 ? 'party' : 'parties'} · Track balances & payments`
                : view === 'ledger' && selectedParty
                ? selectedParty.phone
                  ? `📞 ${selectedParty.phone}  ·  ${ledger.length} entries`
                  : `${ledger.length} ledger entries`
                : view === 'party_form'
                ? 'Fill in the details below'
                : `Recording for ${selectedParty?.name}`}
            </p>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            {view === 'list' && isOwner && (
              <>
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
              onClick={onBackToCustomers ? onBackToCustomers : (view === 'list' ? onClose : view === 'ledger' ? () => setView('list') : () => { setView(view === 'party_form' ? 'list' : 'ledger'); resetPartyForm(); })}
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
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">Receivable</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">Owed to you</p>
                </div>
              </div>

              {/* Payable */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-emerald-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">₹{totalPayable.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">Payable</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">You owe</p>
                </div>
              </div>

              {/* Total parties */}
              <div className="bg-card dark:bg-card border border-border p-4.5 rounded-[24px] flex items-center gap-4 hover:border-blue-500/25 hover:shadow-md hover:bg-card transition-all duration-300 group select-none">
                <div className="p-3.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-2xl group-hover:scale-105 transition-transform shadow-inner">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-black tracking-tight text-foreground font-mono">{parties.length}</p>
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider leading-none">Total Parties</p>
                  <p className="text-[9px] text-muted-foreground/60 font-semibold mt-1 leading-none">{parties.length === 1 ? 'Active contact' : 'Active contacts'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="shrink-0 px-5 py-3 border-b border-border bg-background">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={clsx(fieldCls, 'pl-10')}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-destructive hover:bg-destructive/10 border border-destructive/30 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              )}
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
                  {parties.filter(p => (p.party_type || 'CUSTOMER').toUpperCase() === 'CUSTOMER').length}
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
                  {parties.filter(p => (p.party_type || '').toUpperCase() === 'SUPPLIER').length}
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
                  {parties.filter(p => (p.party_type || '').toUpperCase() === 'STAFF').length}
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
                  {parties.filter(p => (p.party_type || '').toUpperCase() === 'CUSTOM').length}
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
          <div ref={listScrollRef} className="flex-1 overflow-y-auto px-5 py-4">
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
            ) : (
              <div className="space-y-2">
                {filteredParties.map(party => {
                  const hue = nameToHue(party.name);
                  const isReceivable = party.balance > 0;
                  const isPayable = party.balance < 0;
                  const _isSettled = party.balance === 0;
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
                              isReceivable && party.balance >= party.credit_limit
                                ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20"
                                : "text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20"
                            )}>
                              <CreditCard className="w-2.5 h-2.5" />
                              Limit: ₹{Number(party.credit_limit).toLocaleString('en-IN')}
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
                          ₹{Math.abs(party.balance).toFixed(2)}
                        </p>
                        <span className={clsx(
                          'inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border',
                          isReceivable ? 'bg-red-500/10 dark:bg-red-500/20 border-red-500/20 text-red-500 dark:text-red-400' :
                          isPayable ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                          'bg-muted border-border text-muted-foreground'
                        )}>
                          {isReceivable ? 'To Receive' : isPayable ? 'To Pay' : 'Settled'}
                        </span>
                        {party.credit_limit != null && Number(party.credit_limit) > 0 && isReceivable && (
                          <div className="mt-0.5 text-[9px]">
                            {party.balance >= party.credit_limit ? (
                              <span className="text-red-500 font-bold">Limit Reached</span>
                            ) : (
                              <span className="text-muted-foreground font-medium">Avail: ₹{Math.max(0, Number(party.credit_limit) - Number(party.balance)).toLocaleString('en-IN')}</span>
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
                              setEditingParty(party);
                              setPartyForm({
                                name: party.name, phone: party.phone || '', address: party.address || '',
                                gstin: party.gstin || '', opening_balance: '', balance_type: party.balance_type,
                                party_type: (party.party_type as 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM') || 'CUSTOMER',
                                custom_category: party.custom_category || '',
                                notes: party.notes || '',
                                pricing_tier_id: party.pricing_tier_id || '',
                                credit_limit: party.credit_limit != null && Number(party.credit_limit) > 0 ? String(party.credit_limit) : '',
                              });
                              setView('party_form');
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
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          PARTY FORM VIEW
      ══════════════════════════════════════════ */}
      {view === 'party_form' && (
        <div className="flex flex-col flex-1 min-h-0 bg-background" onKeyDown={handleFormKeyDown}>
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
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <textarea
                      placeholder="Optional address"
                      value={partyForm.address}
                      onChange={e => setPartyForm(f => ({ ...f, address: e.target.value }))}
                      rows={4}
                      className={clsx(fieldCls, 'pl-9 resize-none')}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-violet-500" />
                    Default Pricing Tier
                  </label>
                  {pricingTiers.length > 0 ? (
                    <Select
                      value={partyForm.pricing_tier_id}
                      onChange={v => setPartyForm(f => ({ ...f, pricing_tier_id: v }))}
                      options={[
                        { value: '', label: 'MRP' },
                        ...pricingTiers
                          .filter(t => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted)
                          .map(t => ({ value: t.pricing_tier_id, label: t.name })),
                      ]}
                      triggerClassName="rounded-xl h-[46px] w-full"
                    />
                  ) : (
                    <div className="p-3 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground">
                      No custom pricing tiers configured yet. Standard MRP price will be applied. (Configure tiers in <span className="font-bold text-foreground">Settings &gt; Pricing Tiers</span>).
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1.5">Bills for this party will automatically apply the selected pricing tier's rates.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-amber-500" />
                    Credit Limit (₹)
                  </label>
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
                      className={clsx(fieldCls, 'pl-8 no-spinners')}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Maximum credit allowed. Billing on credit above this limit will be blocked with a toast message.</p>
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
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-card px-5 py-3">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSavingParty}
                onClick={handleSaveParty}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                {isSavingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSavingParty ? 'Saving…' : editingParty ? 'Update Party' : 'Create Party'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LEDGER VIEW
      ══════════════════════════════════════════ */}
      {view === 'ledger' && selectedParty && (
        <div className="flex flex-col flex-1 min-h-0 bg-background">

          {/* ── Party Banner ── */}
          <div
            className="shrink-0 px-5 py-4 border-b border-border"
            style={{
              background: isDark
                ? `linear-gradient(135deg, hsl(${nameToHue(selectedParty.name)}, 25%, 13%) 0%, hsl(${nameToHue(selectedParty.name)}, 15%, 17%) 100%)`
                : `linear-gradient(135deg, hsl(${nameToHue(selectedParty.name)}, 60%, 96%) 0%, hsl(${nameToHue(selectedParty.name)}, 40%, 98%) 100%)`
            }}
          >
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md shrink-0 select-none"
                style={{ background: `linear-gradient(135deg, hsl(${nameToHue(selectedParty.name)},65%,50%), hsl(${nameToHue(selectedParty.name)},65%,40%))` }}
              >
                {getInitials(selectedParty.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedParty.phone && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-foreground/70 bg-background/60 dark:bg-white/10 border border-border px-2 py-0.5 rounded-lg">
                      <Phone className="w-3 h-3" /> {selectedParty.phone}
                    </span>
                  )}
                  {selectedParty.gstin && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                      <FileText className="w-3 h-3" /> {selectedParty.gstin}
                    </span>
                  )}
                  {selectedParty.address && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-foreground/60 bg-background/60 dark:bg-white/10 border border-border px-2 py-0.5 rounded-lg truncate max-w-[200px]">
                      <MapPin className="w-3 h-3 shrink-0" /> {selectedParty.address}
                    </span>
                  )}
                  {selectedParty.pricing_tier_id && (
                    <span className="flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 dark:bg-violet-500/20 border border-violet-500/20 px-2 py-0.5 rounded-lg">
                      <Tag className="w-3 h-3 shrink-0" /> {pricingTiers.find(t => t.pricing_tier_id === selectedParty.pricing_tier_id)?.name || 'Pricing Tier'}
                    </span>
                  )}
                  {selectedParty.connection_status === 'CONNECTED' ? (
                    <span className="flex items-center gap-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg shadow-sm">
                      🟢 Connected Ledger
                    </span>
                  ) : selectedParty.connection_status === 'PENDING' ? (
                    <span className="flex items-center gap-1 text-xs font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-lg">
                      🟡 Connection Pending
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setConnectCodeInput(selectedParty.connect_code || '');
                        setSearchResult(null);
                        setShowConnectModal(true);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 px-2.5 py-0.5 rounded-lg transition-all cursor-pointer"
                    >
                      <Link className="w-3 h-3" /> Connect Ledger
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-medium mt-1.5">
                  {ledger.length} {ledger.length === 1 ? 'entry' : 'entries'} · Last updated {selectedParty.last_transaction_date ? formatDate(selectedParty.last_transaction_date) : '—'}
                </p>
              </div>

              {/* Balance pill */}
              <div className={clsx(
                'shrink-0 text-right px-4 py-3 rounded-2xl shadow-sm',
                selectedParty.balance > 0
                  ? 'bg-red-500 text-white'
                  : selectedParty.balance < 0
                  ? 'bg-emerald-500 text-white'
                  : 'bg-muted text-muted-foreground border border-border'
              )}>
                <p className="text-xl font-black leading-none">
                  ₹{Math.abs(selectedParty.balance).toFixed(2)}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
                  {selectedParty.balance > 0 ? 'To Receive' : selectedParty.balance < 0 ? 'To Pay' : 'Settled'}
                </p>
                {enablePartyGst && enablePartyEstimate && (
                  <div className="mt-1.5 pt-1.5 border-t border-white/20 flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-90">
                      GST: ₹{Math.abs(selectedParty.gst_balance ?? selectedParty.balance).toFixed(2)}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-90">
                      Est: ₹{Math.abs(selectedParty.estimate_balance ?? 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Credit Limit Card if configured */}
              {selectedParty.credit_limit != null && Number(selectedParty.credit_limit) > 0 && (
                <div className="shrink-0 text-right px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center justify-end gap-1">
                    <CreditCard className="w-3 h-3" />
                    Credit Limit
                  </p>
                  <p className="text-lg font-black leading-tight text-foreground mt-0.5">
                    ₹{Number(selectedParty.credit_limit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <div className="mt-1.5 pt-1.5 border-t border-amber-500/20 text-[10px] font-bold">
                    {selectedParty.balance >= selectedParty.credit_limit ? (
                      <span className="text-red-500 font-extrabold">Limit Reached</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Available: <span className="text-emerald-600 dark:text-emerald-400 font-black">₹{Math.max(0, Number(selectedParty.credit_limit) - Math.max(0, Number(selectedParty.balance))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Ledger entries ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {ledgerLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
              </div>
            ) : ledger.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <Activity className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Add the first entry to start the ledger</p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => openTxForm('CREDIT')}
                    className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-all active:scale-95 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> Add Transaction
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {[...ledger].reverse().map((entry) => {
                  const isCredit = entry.credit_amount > 0;
                  const amount = isCredit ? entry.credit_amount : entry.debit_amount;
                  return (
                    <div
                      key={entry.ledger_id}
                      className={clsx(
                        'rounded-2xl border bg-card dark:bg-card shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:bg-card',
                        isCredit ? 'border-emerald-500/20 dark:border-emerald-900/30' : 'border-rose-500/20 dark:border-rose-900/30'
                      )}
                    >
                      {/* Colored top bar */}
                      <div className={clsx('h-1 w-full', isCredit ? 'bg-emerald-500' : 'bg-red-500')} />

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4">

                          {/* Left: badge + description + meta */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              {/* Type badge */}
                              <span className={clsx(
                                'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg',
                                isCredit
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-red-500 text-white'
                              )}>
                                {isCredit ? <PlusCircle className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />}
                                {isCredit ? 'Paid' : 'Received'}
                              </span>
                              {/* Balance type badge */}
                              {enablePartyGst && enablePartyEstimate && (
                                <span className={clsx(
                                  'inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg',
                                  (entry.balance_type || 'GST') === 'ESTIMATE'
                                    ? 'bg-violet-500 text-white'
                                    : 'bg-sky-500 text-white'
                                )}>
                                  {entry.balance_type || 'GST'}
                                </span>
                              )}
                              {/* Reference badge */}
                              {entry.reference_number && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-1 rounded-lg">
                                  <Hash className="w-3 h-3" />{entry.reference_number}
                                </span>
                              )}
                            </div>

                            <p className="font-bold text-sm text-foreground leading-snug">{entry.description}</p>

                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                <Calendar className="w-3 h-3" />{formatDateTime(entry.transaction_date)}
                              </span>
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                <User className="w-3 h-3" />{entry.created_by_name || 'Unknown'}
                              </span>
                              {entry.payment_method && (
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                  <Wallet className="w-3 h-3" />
                                  {entry.payment_method === 'CASH' ? 'Cash' : entry.payment_method === 'BANK_TRANSFER' ? 'Bank' : entry.payment_method === 'UPI' ? 'UPI' : entry.payment_method === 'CARD' ? 'Card' : 'Other'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: amount + balance + actions */}
                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            <p className={clsx(
                              'text-xl font-black leading-none',
                              isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                            )}>
                              {isCredit ? '+' : '−'}₹{amount.toFixed(2)}
                            </p>
                            <div className={clsx(
                              'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border',
                              entry.running_balance > 0
                                ? 'bg-red-500/10 dark:bg-red-500/20 border-red-500/20 text-red-500 dark:text-red-400'
                                : entry.running_balance < 0
                                ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                : 'bg-muted border-border text-muted-foreground'
                            )}>
                              Bal: ₹{Math.abs(entry.running_balance).toFixed(2)}
                            </div>

                            {/* Actions — under balance */}
                            {isOwner && (
                              <div className="flex items-center gap-1 mt-1">
                                <button
                                  onClick={() => {
                                    setEditingTx(entry);
                                    const amt = entry.credit_amount > 0 ? entry.credit_amount : entry.debit_amount;
                                    setTxForm({
                                      amount: String(amt),
                                      transaction_type: entry.credit_amount > 0 ? 'CREDIT' : 'DEBIT',
                                      description: entry.description,
                                      transaction_date: toLocalInputValue(entry.transaction_date),
                                      reference_number: entry.reference_number || '',
                                      balance_type: entry.balance_type || 'GST',
                                      payment_method: (entry.payment_method as 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'OTHER') || 'CASH',
                                    });
                                    setView('tx_form');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-200 dark:hover:border-blue-800/40 transition-all active:scale-95 cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteTx(entry)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800/40 transition-all active:scale-95 cursor-pointer"
                                >
                                  <Trash className="w-3 h-3" /> Delete
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

          {/* ── Bottom Action Bar for Ledger ── */}
          {isOwner && (
            <div className="shrink-0 border-t border-border bg-card px-5 py-3 flex items-center justify-between gap-3 shadow-lg">
              <p className="text-xs text-muted-foreground font-medium truncate hidden sm:block">
                Record new entry for <span className="font-bold text-foreground">{selectedParty.name}</span>
              </p>
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  onClick={() => openTxForm('CREDIT')}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" /> + Paid (Credit)
                </button>
                <button
                  onClick={() => openTxForm('DEBIT')}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <MinusCircle className="w-4 h-4" /> − Received (Debit)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TX FORM VIEW
      ══════════════════════════════════════════ */}
      {view === 'tx_form' && selectedParty && (
        <form onSubmit={handleSaveTx} onKeyDown={handleFormKeyDown as unknown as React.KeyboardEventHandler<HTMLFormElement>} className="flex flex-col flex-1 min-h-0 bg-background">
          <div className="flex-1 overflow-y-auto p-5 space-y-4" data-enter-nav>

            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Activity className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Transaction Details</span>
                <span className="ml-auto text-xs text-muted-foreground font-medium">
                  Party: <span className="font-bold text-foreground">{selectedParty.name}</span>
                </span>
              </div>

              {/* Type selector */}
              <div className="mb-5">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Transaction Type</label>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <button
                    type="button"
                    onClick={() => setTxForm(f => ({ ...f, transaction_type: 'CREDIT' }))}
                    className={clsx(
                      'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                      txForm.transaction_type === 'CREDIT'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <PlusCircle className="w-4 h-4" /> Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxForm(f => ({ ...f, transaction_type: 'DEBIT' }))}
                    className={clsx(
                      'py-3.5 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                      txForm.transaction_type === 'DEBIT'
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <MinusCircle className="w-4 h-4" /> Received
                  </button>
                </div>
              </div>

              {/* Balance type selector */}
              {enablePartyGst && enablePartyEstimate && (
                <div className="mb-5">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Adjust Against</label>
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    <button
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, balance_type: 'GST' }))}
                      className={clsx(
                        'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                        txForm.balance_type === 'GST'
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <FileText className="w-4 h-4" /> GST Balance
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, balance_type: 'ESTIMATE' }))}
                      className={clsx(
                        'py-3 px-4 rounded-xl border-2 text-sm font-black transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2',
                        txForm.balance_type === 'ESTIMATE'
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <TrendingUp className="w-4 h-4" /> Estimate Balance
                    </button>
                  </div>
                </div>
              )}

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Amount (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={txForm.amount}
                      onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className={clsx(fieldCls, 'pl-8 no-spinners text-lg font-black')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={txForm.transaction_date}
                    onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))}
                    className={fieldCls}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Description / Remarks</label>
                <textarea
                  placeholder="e.g. Payment received for Invoice #123"
                  rows={2}
                  value={txForm.description}
                  onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                  className={clsx(fieldCls, 'resize-none')}
                />
              </div>

              {/* Reference */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Reference / Invoice No.</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Optional reference number"
                    value={txForm.reference_number}
                    onChange={e => setTxForm(f => ({ ...f, reference_number: e.target.value }))}
                    className={clsx(fieldCls, 'pl-9')}
                  />
                </div>
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Payment Method</label>
                <div className="grid grid-cols-5 gap-2">
                  {(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'OTHER'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTxForm(f => ({ ...f, payment_method: m }))}
                      className={clsx(
                        'py-2.5 px-2 rounded-xl border-2 text-[11px] font-bold transition-all duration-200 active:scale-95 cursor-pointer flex flex-col items-center gap-1 leading-tight',
                        txForm.payment_method === m
                          ? m === 'CASH'
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 shadow-sm'
                            : 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <PaymentMethodIcon method={m} />
                      {m === 'CASH' ? 'Cash' : m === 'BANK_TRANSFER' ? 'Bank' : m === 'UPI' ? 'UPI' : m === 'CARD' ? 'Card' : 'Other'}
                    </button>
                  ))}
                </div>
                {txForm.payment_method === 'CASH' && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-2 flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5" />
                    {txForm.transaction_type === 'CREDIT'
                      ? 'This will deduct cash from the drawer'
                      : 'This will add cash to the drawer'}
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Footer */}
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
                {txForm.amount && parseFloat(txForm.amount) > 0 && (
                  <span className={clsx('font-bold', txForm.transaction_type === 'CREDIT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                    {txForm.transaction_type === 'CREDIT' ? '+' : '-'}₹{parseFloat(txForm.amount).toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSavingTx}
                  className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  {isSavingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSavingTx ? 'Saving…' : editingTx ? 'Update' : 'Add Transaction'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Delete Ledger Entry Confirmation Modal */}
      <Modal
        isOpen={deleteTxModalOpen}
        onClose={() => { if (!deleteTxSaving) { setDeleteTxModalOpen(false); setTxToDelete(null); } }}
        closeButton={null}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span>Delete Ledger Entry</span>
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
              This will permanently delete this transaction of <strong>₹{(txToDelete ? (txToDelete.credit_amount > 0 ? txToDelete.credit_amount : txToDelete.debit_amount) : 0).toFixed(2)}</strong>
              {txToDelete?.description ? <> (<strong>{txToDelete.description}</strong>)</> : ''} for <strong>{selectedParty?.name}</strong>.
              The party balance will be recalculated.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={confirmDeleteTx}
              disabled={deleteTxSaving}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              {deleteTxSaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Delete Entry</>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Party Confirmation Modal */}
      <Modal
        isOpen={deletePartyModalOpen}
        onClose={() => { if (!deletePartySaving) { setDeletePartyModalOpen(false); setPartyToDelete(null); } }}
        closeButton={null}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span>Delete Party</span>
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
              This will permanently delete party <strong>{partyToDelete?.name}</strong> and all associated ledger entries.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={confirmDeleteParty}
              disabled={deletePartySaving}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              {deletePartySaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Delete Party</>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Connect Party Modal */}
      <Modal
        isOpen={showConnectModal}
        onClose={() => { setShowConnectModal(false); setSearchResult(null); }}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Link className="w-5 h-5 text-indigo-500" />
            <span>Connect Party Ledger</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[420px] text-foreground">
          {/* Your Store Connect Code Banner */}
          <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase font-black text-indigo-600 dark:text-indigo-400 tracking-wider">Your Store Connect Code (To Share)</p>
              <p className="text-base font-mono font-black text-indigo-700 dark:text-indigo-300 mt-0.5">{myConnectCode || 'Loading...'}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (myConnectCode) {
                  navigator.clipboard.writeText(myConnectCode);
                  setCopiedMyCode(true);
                  setTimeout(() => setCopiedMyCode(false), 2000);
                }
              }}
              className="px-3 py-1.5 text-xs font-bold bg-background hover:bg-muted border border-border text-foreground rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {copiedMyCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedMyCode ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter the counterparty's 8-character <strong>Nafid Connect Code</strong> (found in their App Settings).
          </p>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Nafid Connect Code *</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. NF-8924K"
                value={connectCodeInput}
                onChange={e => setConnectCodeInput(e.target.value.toUpperCase())}
                className={clsx(fieldCls, 'uppercase font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400')}
              />
              <button
                type="button"
                disabled={searching}
                onClick={handleSearchConnectCode}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Search
              </button>
            </div>
          </div>

          {searchResult && (
            <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">Business Found</p>
                <p className="text-base font-black text-foreground mt-0.5">{searchResult.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Domain: {searchResult.domain_type} · Code: {searchResult.connect_code}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Display Name in Your Ledger</label>
                <input
                  type="text"
                  placeholder="e.g. Royal Hardwares"
                  value={partyNameForConnect}
                  onChange={e => setPartyNameForConnect(e.target.value)}
                  className={fieldCls}
                />
              </div>

              <button
                type="button"
                disabled={isSavingParty}
                onClick={handleSendConnectRequest}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                {isSavingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                Send Connection Request
              </button>
            </div>
          )}
        </div>
      </Modal>

      <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} />
    </div>
  );
}
