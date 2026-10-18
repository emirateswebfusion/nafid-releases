// eslint-disable-next-line @typescript-eslint/parser
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { isAdminRole, hasPermission } from '../utils/permissions';
import {
  Search, ChevronLeft, User, UserCheck, UserPlus, X, Phone, MapPin, Receipt, Star, Calendar, ArrowLeft, Gift, LogOut,
  ShoppingBag, GitMerge, Clock, ChevronRight, CreditCard, Award, ArrowUpRight, TrendingUp, ExternalLink, Eye, Building2,
  Trash2, AlertTriangle, Loader2, Edit3, Filter, FilterX, Tag, Save, Download, Printer, FileText,
  RotateCw, Plus, SlidersHorizontal
} from 'lucide-react';
import clsx from 'clsx';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { Modal } from './ui/Modal';
import { RedCrossButton } from './ui/RedCrossButton';
import { FloatToast } from './ui/FloatToast';
import { parseUTCDate, getAppTimeFormat, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { parsePrintFormat } from '../utils/printFormatHelper';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { getStoreTimezone } from '../utils/timezoneHelper';

interface PricingTier {
  pricing_tier_id: string;
  name: string;
}

interface Customer {
  customer_id: string;
  name: string;
  phone: string;
  address: string;
  total_points_earned: number;
  total_points_redeemed: number;
  current_points_balance: number;
  last_purchase_date: string;
  created_at: string;
  party_balance?: number;
  credit_limit?: number;
  credit_period_enabled?: boolean | number;
  credit_period_days?: number;
  credit_period_basis?: 'BILL_BASED' | 'OLDEST_UNPAID' | string;
  restrict_on_credit_expiry?: boolean | number;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
  oldest_overdue_days?: number;
  pricing_tier_id?: string;
  pricing_tier_name?: string;
}

interface Party {
  party_id: string;
  name: string;
  phone: string;
  balance: number;
  gst_balance?: number;
  estimate_balance?: number;
  balance_type: 'RECEIVABLE' | 'PAYABLE';
  credit_limit?: number;
  credit_period_enabled?: boolean | number;
  credit_period_days?: number;
  credit_period_basis?: 'BILL_BASED' | 'OLDEST_UNPAID' | string;
  restrict_on_credit_expiry?: boolean | number;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
}

interface LoyaltyTx {
  transaction_id: string;
  customer_id: string;
  invoice_id: string;
  transaction_type: 'EARNED' | 'REDEEMED' | 'ADJUSTED';
  points: number;
  points_balance_before: number;
  points_balance_after: number;
  reference_number: string;
  description: string;
  created_by: string;
  created_at: string;
}

interface InvoiceRecord {
  invoice_id: string;
  invoice_number: string;
  grand_total: number;
  created_at: string;
  points_earned: number;
  points_redeemed: number;
  points_redeemed_discount: number;
  payment_method?: string;
  invoice_type?: string;
  customer_gstin?: string;
  subtotal?: number;
  tax_total?: number;
  discount_total?: number;
  received_amount?: number;
  balance_amount?: number;
  discount_value?: number;
  scrap_deduction?: number;
  scrap_invoice_number?: string;
  return_deduction?: number;
  return_invoice_number?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_state?: string;
  biller_name?: string;
  description?: string;
  notes?: string;
  discount_type?: string;
  split_details?: string;
  due_date?: string | null;
  is_credit_bill?: boolean;
  outstanding_amount?: number;
  is_overdue?: boolean;
  overdue_days?: number;
  remaining_days?: number;
  credit_status?: 'OVERDUE' | 'DUE_SOON' | 'ACTIVE' | 'PAID' | 'NON_CREDIT' | string;
}

interface InvoiceItemRow {
  name?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  billing_type?: string;
  pieces_sold?: number;
  pieces_override?: number;
  unit?: string;
  uom?: string;
  brand_manufacturer?: string;
  hsn_code?: string;
  tax_rate_percent?: number;
  product_id?: string;
  combo_id?: string;
  combo_details?: string;
}

type InvoiceStyle = 'standard' | 'boxed' | 'modern' | 'classic' | 'half-a4';

type ComboItemLine = { product_id: string; quantity: number; product_name?: string };
type ComboOffer = { combo_id?: string; name?: string; items?: ComboItemLine[] };

function formatCurrency(amount: number): string {
  return `\u20B9${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string) {
  if (!d) return '—';
  const tz = getStoreTimezone();
  return parseUTCDate(d).toLocaleString('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: getAppTimeFormat() !== '24h' });
}

function getInitials(name: string): string {
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getBillTypeDisplay(inv: InvoiceRecord): { label: string; color: string; bgColor: string; borderColor: string } {
  const invoiceType = inv.invoice_type;
  const hasCustomerGstin = inv.customer_gstin && inv.customer_gstin.trim() !== '';
  
  if (invoiceType === 'GST') {
    if (hasCustomerGstin) {
      return { label: 'B2B', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' };
    } else {
      return { label: 'B2C', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/20' };
    }
  } else if (invoiceType === 'BILL_OF_SUPPLY') {
    return { label: 'Bill of Supply', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' };
  } else if (invoiceType === 'ESTIMATE') {
    return { label: 'Estimate', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' };
  }
  return { label: 'Unknown', color: 'text-muted-foreground', bgColor: 'bg-muted/10', borderColor: 'border-border/20' };
}

function getPaymentMethodDisplay(method?: string): { label: string; color: string; bgColor: string; borderColor: string } {
  const m = (method || 'CASH').toUpperCase();
  const methods: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
    'CASH': { label: 'Cash', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    'CARD': { label: 'Card', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    'UPI': { label: 'UPI', color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
    'CREDIT': { label: 'Credit', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
    'CHEQUE': { label: 'Cheque', color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/20' },
    'ONLINE': { label: 'Online', color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20' },
    'MIXED': { label: 'Mixed', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/20' },
  };
  return methods[m] || { label: m, color: 'text-muted-foreground', bgColor: 'bg-muted/10', borderColor: 'border-border/20' };
}

function renderPaymentMethodBadge(method: string) {
  const pm = getPaymentMethodDisplay(method);
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono', pm.bgColor, pm.color, pm.borderColor)}>{pm.label}</span>;
}

function renderBillTypeBadge(inv: InvoiceRecord) {
  const bt = getBillTypeDisplay(inv);
  return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono', bt.bgColor, bt.color, bt.borderColor)}>{bt.label}</span>;
}

type View = 'list' | 'detail';
type DetailTab = 'purchases' | 'points';

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
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);

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
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);

  // Loyalty Points Adjustment Modal state
  const [adjustPointsModalOpen, setAdjustPointsModalOpen] = useState(false);
  const [adjustPointsValue, setAdjustPointsValue] = useState<number | ''>('');
  const [adjustPointsType, setAdjustPointsType] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [adjustPointsReason, setAdjustPointsReason] = useState('');
  const [adjustPointsLoading, setAdjustPointsLoading] = useState(false);
  const [recalculatingPoints, setRecalculatingPoints] = useState(false);

  // Invoice Detail Modal state
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
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

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const findMatchingPartyForCustomer = (cust: Customer | null | undefined, partyList: Party[]): Party | null => {
    if (!cust) return null;
    const custDigits = (cust.phone || '').replace(/\D/g, '');
    const cleanName = (cust.name || '').trim().toLowerCase();

    return partyList.find(p => {
      if (!p) return false;
      if (p.party_id === cust.customer_id) return true;
      const pDigits = (p.phone || '').replace(/\D/g, '');
      if (custDigits && pDigits) {
        if (custDigits === pDigits) return true;
        if (custDigits.length >= 7 && pDigits.length >= 7 && custDigits.slice(-10) === pDigits.slice(-10)) return true;
      }
      if (cleanName && p.name && p.name.trim().toLowerCase() === cleanName) return true;
      return false;
    }) || null;
  };

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

  const handleConfirmDeleteCustomer = async () => {
    if (!customerToDelete || !tenantId || !window.electronAPI?.dbDeleteCustomer) return;
    setDeleteSaving(true);
    try {
      const res = await window.electronAPI.dbDeleteCustomer({
        customer_id: customerToDelete.customer_id,
        tenant_id: tenantId,
      });
      if (res?.success) {
        showStatus('Customer and associated party ledger deleted successfully', 'success');
        setDeleteModalOpen(false);
        setCustomerToDelete(null);
        setMatchedPartyToDelete(null);
        if (selectedCustomer?.customer_id === customerToDelete.customer_id) {
          setSelectedCustomer(null);
          setView('list');
        }
        await loadCustomers();
      } else {
        showStatus(res?.error || 'Failed to delete customer', 'error');
      }
    } catch {
      showStatus('Failed to delete customer', 'error');
    } finally {
      setDeleteSaving(false);
    }
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

  const handleConfirmAddCustomer = async () => {
    if (!tenantId || !window.electronAPI?.dbCreateCustomer) return;
    if (!addForm.name.trim()) {
      showStatus('Customer name is required', 'error');
      return;
    }
    setIsSavingAdd(true);
    try {
      const parsedCreditLimit = Math.max(0, parseFloat(addForm.credit_limit) || 0);
      const parsedCreditPeriodDays = Math.max(1, parseInt(addForm.credit_period_days, 10) || 30);
      const res = await window.electronAPI.dbCreateCustomer({
        tenant_id: tenantId,
        name: addForm.name.trim(),
        phone: addForm.phone.trim() || null,
        address: addForm.address.trim() || null,
        pricing_tier_id: addForm.pricing_tier_id || null,
        credit_limit: parsedCreditLimit,
        credit_period_enabled: addForm.credit_period_enabled,
        credit_period_days: parsedCreditPeriodDays,
        credit_period_basis: addForm.credit_period_basis,
        restrict_on_credit_expiry: addForm.restrict_on_credit_expiry,
      });
      if (res?.success) {
        showStatus('Customer created successfully', 'success');
        setAddModalOpen(false);
        await loadCustomers();
      } else {
        showStatus(res?.error || 'Failed to create customer', 'error');
      }
    } catch {
      showStatus('Failed to create customer', 'error');
    } finally {
      setIsSavingAdd(false);
    }
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
      restrict_on_credit_expiry: cust.restrict_on_credit_expiry !== false && (cust.restrict_on_credit_expiry as any) !== 0,
    });
    setEditModalOpen(true);
  };

  const handleConfirmEditCustomer = async () => {
    if (!editingCustomer || !tenantId || !window.electronAPI?.dbUpdateCustomer) return;
    if (!editForm.name.trim()) {
      showStatus('Customer name is required', 'error');
      return;
    }
    setIsSavingEdit(true);
    try {
      const parsedCreditLimit = Math.max(0, parseFloat(editForm.credit_limit) || 0);
      const parsedCreditPeriodDays = Math.max(1, parseInt(editForm.credit_period_days, 10) || 30);
      const res = await window.electronAPI.dbUpdateCustomer({
        customer_id: editingCustomer.customer_id,
        tenant_id: tenantId,
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        pricing_tier_id: editForm.pricing_tier_id || null,
        credit_limit: parsedCreditLimit,
        credit_period_enabled: editForm.credit_period_enabled,
        credit_period_days: parsedCreditPeriodDays,
        credit_period_basis: editForm.credit_period_basis,
        restrict_on_credit_expiry: editForm.restrict_on_credit_expiry,
      });
      if (res?.success) {
        showStatus('Customer updated successfully', 'success');
        setEditModalOpen(false);
        setEditingCustomer(null);
        if (selectedCustomer?.customer_id === editingCustomer.customer_id) {
          setSelectedCustomer({
            ...selectedCustomer,
            ...editForm,
            credit_limit: parsedCreditLimit,
            credit_period_enabled: editForm.credit_period_enabled,
            credit_period_days: parsedCreditPeriodDays,
            credit_period_basis: editForm.credit_period_basis,
            restrict_on_credit_expiry: editForm.restrict_on_credit_expiry,
            pricing_tier_name: pricingTiers.find(t => t.pricing_tier_id === editForm.pricing_tier_id)?.name
          });
        }
        await loadCustomers();
      } else {
        showStatus(res?.error || 'Failed to update customer', 'error');
      }
    } catch {
      showStatus('Failed to update customer', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const loadPricingTiers = useCallback(async () => {
    if (!tenantId || !window.electronAPI) return;
    try {
      const tiers = await window.electronAPI.dbGetPricingTiers(tenantId);
      setPricingTiers(Array.isArray(tiers) ? tiers : []);
    } catch {
      // silent fail
    }
  }, [tenantId]);

  const loadCustomers = useCallback(async (isInitialLoad = false) => {
    if (!tenantId || !window.electronAPI) return;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setFilterLoading(true);
    }
    try {
      const custPromise = window.electronAPI.dbGetCustomers({
        tenant_id: tenantId,
        search: debouncedSearchQuery || undefined,
        active: filterActive || undefined,
        credit: filterCredit === 'credit' ? true : filterCredit === 'no-credit' ? false : undefined,
        pricing_tier_id: filterPricingTier || undefined,
        overdue: filterOverdue || undefined,
      });

      const partyPromise = (isInitialLoad || partiesRef.current.length === 0)
        ? window.electronAPI.dbGetParties(tenantId).catch(() => [])
        : Promise.resolve(null);

      const [custData, partyData] = await Promise.all([custPromise, partyPromise]);

      const cleanCusts: Customer[] = [];
      if (Array.isArray(custData)) {
        const seen = new Set<string>();
        for (const c of custData) {
          if (!c.customer_id || seen.has(c.customer_id)) continue;
          seen.add(c.customer_id);
          cleanCusts.push(c);
        }
      }

      setCustomers(cleanCusts);
      if (partyData !== null && Array.isArray(partyData)) {
        setParties(partyData);
        partiesRef.current = partyData;
      }
    } catch {
      showStatus('Failed to load customers', 'error');
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [tenantId, debouncedSearchQuery, filterActive, filterCredit, filterPricingTier, filterOverdue]);

  const handleCleanDuplicates = async () => {
    if (!tenantId || !window.electronAPI?.dbDeduplicateCustomers) return;
    try {
      setCleaningDuplicates(true);
      const res = await window.electronAPI.dbDeduplicateCustomers(tenantId);
      if (res.success) {
        showStatus(`Merged ${res.merged_customers || 0} duplicate customer(s) & ${res.merged_parties || 0} duplicate ledger record(s)`, 'success');
        await loadCustomers(false);
      } else {
        showStatus(res.error || 'Failed to merge duplicates', 'error');
      }
    } catch {
      showStatus('Failed to merge duplicates', 'error');
    } finally {
      setCleaningDuplicates(false);
    }
  };

  useEffect(() => { loadCustomers(true); }, []);
  useEffect(() => { loadCustomers(false); setVisibleCount(50); }, [debouncedSearchQuery, filterActive, filterCredit, filterPricingTier]);
  useEffect(() => { loadPricingTiers(); }, [loadPricingTiers]);

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

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'loyalty_config' }).then((v: any) => {
      if (v && typeof v === 'object' && v.enabled !== undefined) {
        setLoyaltyEnabled(Boolean(v.enabled));
      } else {
        window.electronAPI!.settingsGet({ tenant_id: tenantId || 'global', key: 'feature_flags' }).then((flags: any) => {
          if (flags && typeof flags.loyalty === 'boolean') {
            setLoyaltyEnabled(flags.loyalty);
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [tenantId]);

  // Debounce search query with 0ms instant clear
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

  // Restore scroll position and highlight customer row when returning to list
  useEffect(() => {
    if (view === 'list' && (lastInteractedCustomerId.current || savedScrollTop.current > 0)) {
      const targetId = lastInteractedCustomerId.current;
      if (targetId) {
        setHighlightedCustomerId(targetId);
        const timer = setTimeout(() => setHighlightedCustomerId(null), 3000);
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

  const loadCustomerDetails = async (customer: Customer) => {
    lastInteractedCustomerId.current = customer.customer_id;
    if (listScrollRef.current) {
      savedScrollTop.current = listScrollRef.current.scrollTop;
    }
    const idx = customers.findIndex(c => c.customer_id === customer.customer_id);
    if (idx >= 0 && idx >= visibleCount) {
      setVisibleCount(Math.ceil((idx + 1) / 50) * 50);
    }
    setSelectedCustomer(customer);

    // Match customer to Party by ID, phone (normalized) or name
    const pMatch = findMatchingPartyForCustomer(customer, parties);
    setMatchedParty(pMatch || null);

    setView('detail');
    setDetailTab('purchases');
    setBillFilterStart('');
    setBillFilterEnd('');
    setInvoicesLoading(true);
    setLoyaltyTxsLoading(true);

    if (!window.electronAPI) return;
    try {
      const [invData, loyaltyData] = await Promise.all([
        window.electronAPI.dbGetCustomerInvoices({
          customer_id: customer.customer_id,
          tenant_id: tenantId,
          phone: customer.phone,
          name: customer.name,
        }),
        window.electronAPI.dbGetCustomerLoyaltyTransactions({ customer_id: customer.customer_id, tenant_id: tenantId }),
      ]);
      setInvoices(Array.isArray(invData) ? invData : []);
      setLoyaltyTxs(Array.isArray(loyaltyData) ? loyaltyData : []);
    } catch {
      showStatus('Failed to load customer details', 'error');
    } finally {
      setInvoicesLoading(false);
      setLoyaltyTxsLoading(false);
    }
  };

  const handleAdjustPointsSubmit = async () => {
    if (!selectedCustomer || !window.electronAPI) return;
    const pts = Number(adjustPointsValue);
    if (!pts || pts <= 0) {
      showStatus('Please enter a valid points amount', 'error');
      return;
    }
    const signedPts = adjustPointsType === 'ADD' ? pts : -pts;
    setAdjustPointsLoading(true);
    try {
      const res = await window.electronAPI.dbAdjustCustomerLoyaltyPoints({
        customer_id: selectedCustomer.customer_id,
        tenant_id: tenantId || 'global',
        points: signedPts,
        reason: adjustPointsReason.trim() || `Manual ${adjustPointsType === 'ADD' ? 'bonus' : 'deduction'} adjustment`,
        user_name: useAuthStore.getState().userName || undefined,
      });
      if (res.success) {
        showStatus('Loyalty points adjusted successfully', 'success');
        setAdjustPointsModalOpen(false);
        setAdjustPointsValue('');
        setAdjustPointsReason('');
        const [updatedCustList, updatedTxs] = await Promise.all([
          window.electronAPI.dbGetCustomers(tenantId),
          window.electronAPI.dbGetCustomerLoyaltyTransactions({ customer_id: selectedCustomer.customer_id, tenant_id: tenantId }),
        ]);
        if (Array.isArray(updatedCustList)) {
          setCustomers(updatedCustList);
          const found = updatedCustList.find(c => c.customer_id === selectedCustomer.customer_id);
          if (found) setSelectedCustomer(found);
        }
        if (Array.isArray(updatedTxs)) setLoyaltyTxs(updatedTxs);
      } else {
        showStatus(res.error || 'Failed to adjust points', 'error');
      }
    } catch (e: any) {
      showStatus(e?.message || 'Error adjusting points', 'error');
    } finally {
      setAdjustPointsLoading(false);
    }
  };

  const handleRecalculateCustomerPoints = async () => {
    if (!selectedCustomer || !window.electronAPI) return;
    setRecalculatingPoints(true);
    try {
      const res = await window.electronAPI.dbRecalculateCustomerLoyaltyPoints({
        tenant_id: tenantId || 'global',
      });
      if (res.success) {
        showStatus(`Points recalculated successfully! (${res.updatedCount || 0} customers updated)`, 'success');
        const [updatedCustList, updatedTxs] = await Promise.all([
          window.electronAPI.dbGetCustomers(tenantId),
          window.electronAPI.dbGetCustomerLoyaltyTransactions({ customer_id: selectedCustomer.customer_id, tenant_id: tenantId }),
        ]);
        if (Array.isArray(updatedCustList)) {
          setCustomers(updatedCustList);
          const found = updatedCustList.find(c => c.customer_id === selectedCustomer.customer_id);
          if (found) setSelectedCustomer(found);
        }
        if (Array.isArray(updatedTxs)) setLoyaltyTxs(updatedTxs);
      } else {
        showStatus(res.error || 'Failed to recalculate points', 'error');
      }
    } catch (e: any) {
      showStatus(e?.message || 'Error recalculating points', 'error');
    } finally {
      setRecalculatingPoints(false);
    }
  };

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
  }, [initialCustomerIdOrQuery, customers]);

  const handleOpenInvoiceDetail = async (inv: InvoiceRecord) => {
    setViewingInvoice(inv);
    setItemsLoading(true);
    try {
      if (window.electronAPI?.dbGetInvoiceItems) {
        const items = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
        setInvoiceItems(Array.isArray(items) ? items : []);
      } else {
        setInvoiceItems([]);
      }
    } catch {
      showStatus('Failed to load invoice items', 'error');
    } finally {
      setItemsLoading(false);
    }
  };

  const handleEditBillFromCustomerModal = async () => {
    if (!viewingInvoice) return;
    const { role, permissions } = useAuthStore.getState();
    if (!hasPermission({ role, permissions }, 'sales.edit')) {
      showStatus('Permission Denied: You do not have permission to edit bills', 'error');
      return;
    }
    try {
      let itemsToEdit = invoiceItems;
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
      setViewingInvoice(null);
      onClose?.();
      if (isAdminRole(useAuthStore.getState().role)) {
        useCartStore.getState().setRole('BILLER');
      }
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 50);
    } catch (e) {
      console.error('Error starting bill edit from customer modal:', e);
      showStatus('Failed to open bill editor', 'error');
    }
  };

  const handleNavigateToParty = () => {
    if (!selectedCustomer) return;
    const target = matchedParty?.party_id || selectedCustomer.phone || selectedCustomer.name;
    if (onOpenParty) {
      onOpenParty(target, selectedCustomer.customer_id);
    } else {
      showStatus(`Party ledger for "${selectedCustomer.name}" is accessible via the Ledger menu.`, 'success');
    }
  };

  /* ─── Bill CSV export + individual download/print ─── */
  const filteredInvoices = useMemo(() => {
    if (!billFilterStart && !billFilterEnd) return invoices;
    return invoices.filter(inv => {
      const key = parseUTCDate(inv.created_at).toLocaleDateString('en-CA', { timeZone: getStoreTimezone() });
      if (billFilterStart && key < billFilterStart) return false;
      if (billFilterEnd && key > billFilterEnd) return false;
      return true;
    });
  }, [invoices, billFilterStart, billFilterEnd]);

  type BillConfig = {
    shopNameVal: string | null | undefined; shopAddr: string | null | undefined;
    shopPh: string | null | undefined; shopGstin: string | null | undefined;
    shopStateVal: string | null | undefined; upiVal: string | null | undefined;
    showQr: unknown; printFmt: ReturnType<typeof parsePrintFormat>;
    billSettings: typeof DEFAULT_BILL_SETTINGS; receiptWidthCm: number;
    shopEmailVal: string | null | undefined; shopWebsiteVal: string | null | undefined;
    combos: ComboOffer[];
  };

  const loadBillConfig = async (): Promise<BillConfig> => {
    const tId = tenantId || 'global';
    const [shopNameVal, shopAddr, shopPh, shopGstin, shopStateVal, upiVal, showQr, printFmtRaw, receiptConfig, shopEmailVal, shopWebsiteVal, combosRaw] = await Promise.all([
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'shop_name' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'shop_address' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'shop_phone' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'shop_gstin' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'shop_state' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'upi_id' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'show_upi_qr' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'print_format' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'receipt_printer_config' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'shop_email' }),
      window.electronAPI.settingsGet({ tenant_id: tId, key: 'shop_website' }),
      window.electronAPI.dbGetComboOffers({ tenant_id: tId }),
    ]);
    const printFmt = parsePrintFormat(printFmtRaw);
    const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };
    const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
    const combos: ComboOffer[] = Array.isArray(combosRaw) ? combosRaw : [];
    return { shopNameVal, shopAddr, shopPh, shopGstin, shopStateVal, upiVal, showQr, printFmt, billSettings, receiptWidthCm, shopEmailVal, shopWebsiteVal, combos };
  };

  const buildInvoiceData = async (inv: InvoiceRecord, cfg: BillConfig) => {
    let items: InvoiceItemRow[];
    try {
      const data = window.electronAPI?.dbGetInvoiceItems ? await window.electronAPI.dbGetInvoiceItems(inv.invoice_id) : [];
      items = Array.isArray(data) ? data : [];
    } catch {
      items = [];
    }

    const { printFmt, billSettings } = cfg;
    const isB2B = inv.invoice_type === 'GST' && !!(inv.customer_gstin && String(inv.customer_gstin).trim());
    const isGstOrB2B = inv.invoice_type === 'GST' || isB2B;
    const scrapD = Number(inv.scrap_deduction) || 0;
    const returnD = Number(inv.return_deduction) || 0;
    const isInterState = !!(cfg.shopStateVal && inv.customer_state && cfg.shopStateVal !== inv.customer_state);
    const taxVal = Number(inv.tax_total) || 0;
    // Stored grand_total is already net of scrap/return deductions, but the generators show
    // "Net Payable = grandTotal - deductions", so pass the pre-deduction base (same as
    // SalesHistory's reprint) — otherwise deductions would be subtracted twice.
    let baseGrandTotal = Number(inv.grand_total) || 0;
    if (inv.invoice_type !== 'SCRAP') {
      baseGrandTotal = Math.max(0, (Number(inv.subtotal) || 0) + taxVal - (Number(inv.discount_total) || 0) - (Number(inv.points_redeemed_discount) || 0));
    }

    const receiptData: ReceiptData = {
      shopName: (isGstOrB2B || billSettings.showShopName !== false) ? (cfg.shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
      shopGstin: (isGstOrB2B || billSettings.showShopGstin !== false) ? (cfg.shopGstin || undefined) : undefined,
      shopState: (isGstOrB2B || billSettings.showShopState !== false) ? (cfg.shopStateVal || undefined) : undefined,
      shopAddress: (isGstOrB2B || billSettings.showShopAddress !== false) ? (cfg.shopAddr || undefined) : undefined,
      shopPhone: (isGstOrB2B || billSettings.showPhone !== false) ? (cfg.shopPh || undefined) : undefined,
      shopEmail: cfg.shopEmailVal || undefined,
      shopWebsite: cfg.shopWebsiteVal || undefined,
      upiId: cfg.upiVal || undefined,
      showUpiQr: cfg.showQr !== null && cfg.showQr !== undefined ? Boolean(cfg.showQr) : true,
      showProductOffers: printFmt.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
      showPriceOverrideMrp: printFmt.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
      invoiceNumber: inv.invoice_number,
      invoiceType: inv.invoice_type,
      date: formatBillDateTime(inv.created_at),
      billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (inv.biller_name || useAuthStore.getState().userName || undefined) : undefined,
      items: items.map(item => {
        let comboItemsParsed: ComboItemLine[] | undefined;
        if (item.combo_details) {
          try {
            const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
            if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
          } catch { /* corrupted combo_details — render as a normal line */ }
        }
        const matchedCombo = cfg.combos.find(c =>
          (item.combo_id && c.combo_id === item.combo_id) ||
          (item.name && c.name && c.name.toLowerCase().trim() === item.name.toLowerCase().trim()) ||
          (item.product_id && c.combo_id === item.product_id)
        );
        if (!comboItemsParsed && matchedCombo?.items) comboItemsParsed = matchedCombo.items;
        const isComboItem = Boolean(item.combo_id || matchedCombo || (comboItemsParsed && comboItemsParsed.length > 0));
        return {
          name: item.name || '',
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          total: Number(item.total) || 0,
          billing_type: item.billing_type,
          pieces_sold: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
          pieces_override: item.pieces_override != null ? Number(item.pieces_override) : undefined,
          unit: item.unit || item.uom,
          brand: item.brand_manufacturer || undefined,
          isCombo: isComboItem,
          combo_items: comboItemsParsed,
        };
      }),
      subtotal: Number(inv.subtotal) || 0,
      tax: taxVal,
      cgst: isInterState ? undefined : taxVal / 2,
      sgst: isInterState ? undefined : taxVal / 2,
      igst: isInterState ? taxVal : undefined,
      discount: Number(inv.discount_total) || 0,
      discountType: inv.discount_type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED',
      discountValue: Number(inv.discount_value) || 0,
      grandTotal: baseGrandTotal,
      receivedAmount: inv.received_amount != null ? Number(inv.received_amount) : undefined,
      balanceAmount: (() => {
        if (inv.balance_amount == null) return undefined;
        const rawBal = Number(inv.balance_amount);
        const pmUpper = (inv.payment_method || '').toUpperCase();
        if (pmUpper !== 'CREDIT' && pmUpper !== 'SPLIT' && rawBal < 0) return 0;
        return rawBal;
      })(),
      paymentMethod: inv.payment_method,
      isReprint: true,
      customerName: (isGstOrB2B || billSettings.showCustomerName !== false) ? (inv.customer_name || undefined) : undefined,
      customerPhone: (isGstOrB2B || billSettings.showCustomerPhone !== false) ? (inv.customer_phone || undefined) : undefined,
      customerAddress: (isGstOrB2B || billSettings.showCustomerAddress !== false) ? (inv.customer_address || undefined) : undefined,
      customerGstin: inv.customer_gstin ? String(inv.customer_gstin).trim() || undefined : undefined,
      customerState: (isGstOrB2B || billSettings.showCustomerState !== false) ? (inv.customer_state || undefined) : undefined,
      scrapDeduction: scrapD > 0 ? scrapD : undefined,
      scrapInvoiceNumber: inv.scrap_invoice_number || undefined,
      returnDeduction: returnD > 0 ? returnD : undefined,
      returnInvoiceNumber: inv.return_invoice_number || undefined,
      description: inv.description || inv.notes || undefined,
      notes: inv.notes || inv.description || undefined,
      billSettings,
      isB2B,
      a5Orientation: printFmt.a5Orientation || 'horizontal',
    };

    const isHalfA4 = printFmt.format === 'half-a4';
    const invoiceStyle = (!isGstOrB2B && isHalfA4)
      ? 'half-a4'
      : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');

    return { receiptData, isGstOrB2B, invoiceStyle: invoiceStyle as InvoiceStyle };
  };

  const handleDownloadInvoiceCsv = async (inv: InvoiceRecord) => {
    setInvoiceBusyId(inv.invoice_id);
    try {
      const escape = (val: unknown) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      const typeLabel = (inv: InvoiceRecord) => {
        if (inv.invoice_type === 'GST' && inv.customer_gstin) return 'B2B';
        if (inv.invoice_type === 'GST') return 'B2C';
        if (inv.invoice_type === 'BILL_OF_SUPPLY') return 'Bill of Supply';
        if (inv.invoice_type === 'ESTIMATE') return 'Estimate';
        if (inv.invoice_type === 'SCRAP') return 'Scrap';
        return inv.invoice_type || '';
      };
      const headers = [
        'Invoice No', 'Date & Time', 'Type', 'Payment Method',
        'Subtotal (₹)', 'Tax (₹)', 'Discount (₹)', 'Grand Total (₹)',
        'Received (₹)', 'Balance (₹)', 'Points Earned', 'Points Redeemed',
        'Biller', 'Description / Remarks',
      ];
      const row = [
        escape(inv.invoice_number),
        escape(formatDateTime(inv.created_at)),
        escape(typeLabel(inv)),
        escape(inv.payment_method || ''),
        escape((inv.subtotal || 0).toFixed(2)),
        escape((inv.tax_total || 0).toFixed(2)),
        escape((inv.discount_total || 0).toFixed(2)),
        escape((inv.grand_total || 0).toFixed(2)),
        escape((inv.received_amount || 0).toFixed(2)),
        escape((inv.balance_amount || 0).toFixed(2)),
        escape(inv.points_earned || 0),
        escape(inv.points_redeemed || 0),
        escape(inv.biller_name || useAuthStore.getState().userName || ''),
        escape(inv.description || inv.notes || ''),
      ];
      const csvContent = [headers.join(','), row.join(',')].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = String(inv.invoice_number).replace(/[^a-zA-Z0-9._-]+/g, '-');
      link.download = `invoice-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showStatus(`Downloaded invoice ${inv.invoice_number} as CSV`, 'success');
    } catch (err) {
      console.error('Invoice CSV download failed:', err);
      showStatus('Download failed', 'error');
    } finally { setInvoiceBusyId(null); }
  };

  const handleDownloadFilteredInvoicesCsv = async () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      showStatus('No bills to export in current filter', 'error');
      return;
    }
    setExportingFilteredInvoices(true);
    try {
      const escape = (val: unknown) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      const typeLabel = (inv: InvoiceRecord) => {
        if (inv.invoice_type === 'GST' && inv.customer_gstin) return 'B2B';
        if (inv.invoice_type === 'GST') return 'B2C';
        if (inv.invoice_type === 'BILL_OF_SUPPLY') return 'Bill of Supply';
        if (inv.invoice_type === 'ESTIMATE') return 'Estimate';
        if (inv.invoice_type === 'SCRAP') return 'Scrap';
        return inv.invoice_type || '';
      };
      const headers = [
        'Invoice No', 'Date & Time', 'Customer Name', 'Customer Phone', 'Type', 'Payment Method',
        'Subtotal (₹)', 'Tax (₹)', 'Discount (₹)', 'Grand Total (₹)',
        'Received (₹)', 'Balance (₹)', 'Points Earned', 'Points Redeemed',
        'Biller', 'Description / Remarks',
      ];
      const rows = filteredInvoices.map(inv => [
        escape(inv.invoice_number),
        escape(formatDateTime(inv.created_at)),
        escape(selectedCustomer?.name || inv.customer_name || ''),
        escape(selectedCustomer?.phone || inv.customer_phone || ''),
        escape(typeLabel(inv)),
        escape(inv.payment_method || ''),
        escape((inv.subtotal || 0).toFixed(2)),
        escape((inv.tax_total || 0).toFixed(2)),
        escape((inv.discount_total || 0).toFixed(2)),
        escape((inv.grand_total || 0).toFixed(2)),
        escape((inv.received_amount || 0).toFixed(2)),
        escape((inv.balance_amount || 0).toFixed(2)),
        escape(inv.points_earned || 0),
        escape(inv.points_redeemed || 0),
        escape(inv.biller_name || useAuthStore.getState().userName || ''),
        escape(inv.description || inv.notes || ''),
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeCustomer = (selectedCustomer?.name || 'customer').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const rangeLabel = billFilterStart || billFilterEnd ? `${billFilterStart || 'start'}_to_${billFilterEnd || 'end'}` : 'all_dates';
      link.download = `customer_bills_${safeCustomer}_${rangeLabel}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showStatus(`Exported ${filteredInvoices.length} bill(s) as CSV`, 'success');
    } catch (err) {
      console.error('Filtered bills CSV export failed:', err);
      showStatus('Export failed', 'error');
    } finally {
      setExportingFilteredInvoices(false);
    }
  };

  const handleDownloadFilteredInvoicesPdf = async () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      showStatus('No bills to export in current filter', 'error');
      return;
    }
    setExportingPdf(true);
    try {
      const cfg = await loadBillConfig();
      const billBodies: string[] = [];

      for (const inv of filteredInvoices) {
        const { receiptData, invoiceStyle } = await buildInvoiceData(inv, cfg);
        const singleHtml = generateInvoiceHtml(receiptData, invoiceStyle);

        // Extract content inside <body>...</body> if present, else use full HTML
        const bodyMatch = singleHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : singleHtml;
        billBodies.push(bodyContent);
      }

      const safeCustomerName = (selectedCustomer?.name || 'Customer').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const docTitle = `Bills_${safeCustomerName}_${billFilterStart || 'start'}_to_${billFilterEnd || 'end'}`;

      const combinedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 8mm;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bill-page-break {
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        clear: both;
      }
      .bill-page-break:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .bill-page-break {
      page-break-after: always;
      break-after: page;
      padding-bottom: 20px;
    }
    .bill-page-break:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  </style>
</head>
<body>
  ${billBodies.map((body, idx) => `<div class="bill-page-break" id="invoice-page-${idx + 1}">${body}</div>`).join('\n')}
</body>
</html>`;

      if (window.electronAPI?.printA4Html) {
        const res = await window.electronAPI.printA4Html(tenantId || 'global', combinedHtml);
        if (!res?.success && (res as any)?.useDefaultDialog) {
          const pw = window.open('', '_blank', 'width=900,height=700');
          if (pw) {
            pw.document.write(combinedHtml);
            pw.document.close();
            setTimeout(() => pw.print(), 500);
          }
        }
      } else {
        const pw = window.open('', '_blank', 'width=900,height=700');
        if (pw) {
          pw.document.write(combinedHtml);
          pw.document.close();
          setTimeout(() => pw.print(), 500);
        }
      }

      showStatus(`Generated PDF for ${filteredInvoices.length} bill(s) (1 per page)`, 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showStatus('Failed to generate PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const totalPointsIssued = customers.reduce((s, c) => s + (c.total_points_earned || 0), 0);
  const totalPointsRedeemed = customers.reduce((s, c) => s + (c.total_points_redeemed || 0), 0);
  const totalPointsActive = customers.reduce((s, c) => s + (c.current_points_balance || 0), 0);

  const totalLifetimeSpend = invoices.reduce((s, inv) => s + (inv.grand_total || 0), 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background select-none overflow-hidden">
      {/* Top Header Bar */}
      <header className="shrink-0 border-b border-border/80 bg-card/95 backdrop-blur-md shadow-xs z-30 px-4 sm:px-6 py-2.5">
        <div className="flex items-center justify-between gap-4 w-full">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>

            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-black text-foreground truncate tracking-tight">
                  {view === 'list' ? 'Customer Directory' : selectedCustomer?.name || 'Customer Profile'}
                </h1>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="System Live" />
                {/* Active Filter Indicator Badge */}
                {(filterActive || filterCredit !== 'all' || filterPricingTier) && (
                  <button
                    onClick={() => {
                      setFilterActive(false);
                      setFilterCredit('all');
                      setFilterPricingTier('');
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold uppercase tracking-wider hover:bg-primary/20 transition-all cursor-pointer"
                    title="Click to clear all filters"
                  >
                    <Filter className="w-3 h-3" />
                    <span>Filters Active</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-mono">
                      {(filterActive ? 1 : 0) + (filterCredit !== 'all' ? 1 : 0) + (filterPricingTier ? 1 : 0)}
                    </span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-semibold mt-0.5 flex items-center gap-1.5 truncate">
                {view === 'list' ? (
                  <span>{customers.length} registered customer{customers.length !== 1 ? 's' : ''}</span>
                ) : (
                  <>
                    {loyaltyEnabled && (
                      <>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Loyalty Member</span>
                        <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/40" />
                      </>
                    )}
                    <span className="font-mono">ID: #{selectedCustomer?.customer_id.slice(-6).toUpperCase()}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right Actions & Close */}
          <div className="flex items-center gap-3 shrink-0">
            {view === 'list' && (
              <button
                onClick={handleCleanDuplicates}
                disabled={cleaningDuplicates}
                className="h-9 px-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/50 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                title="Scan and merge duplicate customer and credit ledger records"
              >
                <GitMerge className={`w-3.5 h-3.5 ${cleaningDuplicates ? 'animate-spin' : 'text-amber-500'}`} />
                <span className="hidden sm:inline">{cleaningDuplicates ? 'Merging...' : 'Merge Duplicates'}</span>
              </button>
            )}
            {view === 'list' && isOwner && (
              <button
                onClick={handleAddCustomerClick}
                className="h-9 px-3.5 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Add New Customer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Customer</span>
              </button>
            )}
            {view === 'detail' && selectedCustomer && isOwner && (
              <>
                <button
                  onClick={() => handleEditCustomerClick(selectedCustomer)}
                  className="h-9 px-3 rounded-xl text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs"
                  title="Edit Customer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit Customer</span>
                </button>
                <button
                  onClick={() => handleDeleteCustomerClick(selectedCustomer)}
                  className="h-9 px-3 rounded-xl text-xs font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-xs"
                  title="Delete Customer & Ledger"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete Customer</span>
                </button>
              </>
            )}

            {isRestricted ? (
              <button
                onClick={() => useAuthStore.getState().logout()}
                className="h-9 px-3.5 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center gap-2"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            ) : (
              <RedCrossButton
                onClick={() => view === 'detail' ? setView('list') : onClose()}
                title={view === 'detail' ? 'Back to Customer List' : 'Close'}
              />
            )}
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      {view === 'list' && (
        <div className="flex-1 flex flex-col min-h-0 w-full px-4 sm:px-6 py-4 space-y-4 overflow-hidden">
          {/* Streamlined Toolbar (Search + Summary Pills) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card border border-border/80 px-4 py-2.5 rounded-2xl shadow-xs shrink-0">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              {filterLoading ? (
                <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
              ) : (
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              )}
              <input
                type="text"
                placeholder="Search customers by name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-xs bg-muted/40 border border-border/80 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/60 font-semibold text-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Active Filter */}
              <button
                onClick={() => setFilterActive(!filterActive)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                  filterActive
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                    : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
                )}
                title="Active customers (purchased in last 90 days)"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Active</span>
              </button>

              {/* Credit Filter */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFilterCredit(filterCredit === 'credit' ? 'all' : 'credit')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                    filterCredit === 'credit'
                      ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                      : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
                  )}
                  title="Customers with credit balance (receivable)"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Credit</span>
                </button>
                <button
                  onClick={() => setFilterCredit(filterCredit === 'no-credit' ? 'all' : 'no-credit')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                    filterCredit === 'no-credit'
                      ? 'bg-blue-500/10 text-blue-600 border border-blue-500/30'
                      : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
                  )}
                  title="Customers without credit balance"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>No Credit</span>
                </button>

                {/* Overdue Filter */}
                <button
                  onClick={() => setFilterOverdue(!filterOverdue)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer',
                    filterOverdue
                      ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30 font-black'
                      : 'bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:text-foreground'
                  )}
                  title="Filter customers with overdue credit payments"
                >
                  <AlertTriangle className={clsx("w-3.5 h-3.5", filterOverdue ? "text-rose-600 animate-pulse" : "text-muted-foreground")} />
                  <span>Overdue</span>
                  {customers.filter(c => c.has_overdue).length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-black leading-tight">
                      {customers.filter(c => c.has_overdue).length}
                    </span>
                  )}
                </button>
              </div>

              {/* Pricing Tier Filter */}
              {pricingTiers.length > 0 && (
                <div className="relative">
                  <select
                    value={filterPricingTier}
                    onChange={e => setFilterPricingTier(e.target.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted/50 border border-border text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 cursor-pointer appearance-none pr-8"
                  >
                    <option value="">All Tiers</option>
                    {pricingTiers.map(tier => (
                      <option key={tier.pricing_tier_id} value={tier.pricing_tier_id}>{tier.name}</option>
                    ))}
                  </select>
                  <Tag className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                </div>
              )}

              {/* Clear Filters */}
              {(filterActive || filterCredit !== 'all' || filterOverdue || filterPricingTier) && (
                <button
                  onClick={() => {
                    setFilterActive(false);
                    setFilterCredit('all');
                    setFilterOverdue(false);
                    setFilterPricingTier('');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-destructive/80 border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 transition-all cursor-pointer"
                  title="Clear all filters"
                >
                  <FilterX className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Metric Pills Row */}
            {loyaltyEnabled && (
              <div className="flex items-center gap-2 overflow-x-auto py-0.5 shrink-0">
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl shrink-0">
                  <Award className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <div className="text-left">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase block leading-none">Issued</span>
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono leading-tight">{totalPointsIssued.toFixed(0)} pts</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl shrink-0">
                  <Gift className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <div className="text-left">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase block leading-none">Redeemed</span>
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono leading-tight">{totalPointsRedeemed.toFixed(0)} pts</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl shrink-0">
                  <Award className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-left">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase block leading-none">Active</span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono leading-tight">{totalPointsActive.toFixed(0)} pts</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Customer Cards Grid / List Area */}
          <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : customers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground bg-card rounded-2xl border border-dashed border-border/80 flex flex-col items-center justify-center gap-3 p-8">
                <div className="p-3.5 bg-muted/40 rounded-xl border border-border/40">
                  <User className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <div className="max-w-md">
                  <p className="text-sm font-extrabold text-foreground">
                    {(searchQuery || filterActive || filterCredit !== 'all' || filterPricingTier)
                      ? 'No matching customers found'
                      : 'No customer records yet'}
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                    {searchQuery || filterActive || filterCredit !== 'all' || filterPricingTier
                      ? 'Try adjusting your search or filters.'
                      : 'Customer records are automatically logged when phone numbers or details are entered during sales checkout.'}
                  </p>
                </div>
              </div>
            ) : (
              (() => {
                const displayedCustomers = customers.slice(0, visibleCount);

                return (
                  <div className="space-y-4">
                    <div className={clsx(
                      "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5 transition-opacity duration-150",
                      filterLoading && "opacity-60 pointer-events-none"
                    )}>
                      {displayedCustomers.map(customer => (
                        <div
                          key={customer.customer_id}
                          id={`customer-row-${customer.customer_id}`}
                          onClick={() => loadCustomerDetails(customer)}
                          className={clsx(
                            "p-3.5 rounded-xl bg-card border border-border/80 hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group select-none flex flex-col justify-between gap-3",
                            highlightedCustomerId === customer.customer_id && "ring-2 ring-primary ring-offset-2 bg-primary/10 border-primary"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 via-primary/10 to-transparent text-primary border border-primary/20 flex items-center justify-center font-black text-xs shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                {getInitials(customer.name)}
                              </div>
                              <div className="min-w-0 leading-tight">
                                <p className="font-bold text-foreground truncate text-sm group-hover:text-primary transition-colors">{customer.name}</p>
                                <p className="text-xs text-muted-foreground font-medium mt-0.5 flex items-center gap-1 truncate">
                                  {customer.phone ? (
                                    <span className="flex items-center gap-1 text-muted-foreground/90 font-mono">
                                      <Phone className="w-3 h-3 text-primary/70" /> {customer.phone}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/50">No phone</span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isOwner && (
                                <button
                                  onClick={(e) => handleDeleteCustomerClick(customer, e)}
                                  className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100 active:scale-95 cursor-pointer"
                                  title="Delete Customer & Ledger"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>

                          {/* Status and Credit Tags */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {customer.has_overdue && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {customer.overdue_bills_count || 1} OVERDUE
                              </span>
                            )}
                            {Boolean(customer.credit_period_enabled) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                                <Clock className="w-2.5 h-2.5" />
                                {customer.credit_period_days || 30}d Period
                              </span>
                            )}
                            {customer.party_balance != null && customer.party_balance > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-mono">
                                Due: ₹{customer.party_balance.toFixed(2)}
                              </span>
                            )}
                            {customer.pricing_tier_name && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-400">
                                <Tag className="w-2.5 h-2.5" />
                                {customer.pricing_tier_name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2.5 border-t border-border/40 text-[11px]">
                            <span className="text-muted-foreground flex items-center gap-1 font-medium">
                              <Calendar className="w-3 h-3 text-muted-foreground/60" />
                              {customer.last_purchase_date ? formatDate(customer.last_purchase_date) : 'No purchases'}
                            </span>

                            {loyaltyEnabled && (
                              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-black font-mono">
                                <Star className="w-3 h-3 fill-emerald-500/20" />
                                {(customer.current_points_balance || 0).toFixed(0)} pts
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Sentinel element for scroll intersection */}
                    <div ref={sentinelRef} className="h-4 w-full" />

                    {/* Infinite Scroll Progress Bar */}
                    {customers.length > 0 && (
                      <div className="flex items-center justify-between border-t border-border/80 pt-3.5 text-xs select-none">
                        <div className="text-muted-foreground font-semibold">
                          Showing <span className="font-mono text-foreground font-bold">{Math.min(visibleCount, customers.length)}</span> of{' '}
                          <span className="font-mono text-foreground font-bold">{customers.length}</span> customers
                        </div>
                        {visibleCount < customers.length && (
                          <div className="text-xs text-muted-foreground font-medium animate-pulse flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            <span>Scroll down to load more...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
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
          <div className="flex-1 flex flex-col min-h-0 w-full px-4 sm:px-6 py-4 space-y-4 overflow-y-auto">
          {/* Profile Banner */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-emerald-500/20 text-primary border border-primary/30 flex items-center justify-center font-black text-xl shrink-0 shadow-inner">
                {getInitials(selectedCustomer.name)}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-black text-foreground tracking-tight">{selectedCustomer.name}</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    Active
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium flex-wrap">
                  {selectedCustomer.phone && (
                    <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md font-mono text-[11px]">
                      <Phone className="w-3 h-3 text-primary" /> {selectedCustomer.phone}
                    </span>
                  )}
                  {selectedCustomer.address && (
                    <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md text-[11px]">
                      <MapPin className="w-3 h-3 text-primary" /> {selectedCustomer.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px]">
                    <Calendar className="w-3 h-3 text-muted-foreground/60" /> Since {formatDate(selectedCustomer.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Party Ledger & Loyalty Point Badges */}
            <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
              {/* Party Ledger Card */}
              {(() => {
                const bal = matchedParty?.balance || 0;
                const isReceivable = bal > 0;
                const isPayable = bal < 0;

                const colorStyles = isReceivable
                  ? {
                      box: 'bg-rose-500/10 border-rose-500/20',
                      title: 'text-rose-600 dark:text-rose-400',
                      amount: 'text-rose-600 dark:text-rose-400',
                      button: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border-rose-500/30',
                    }
                  : isPayable
                  ? {
                      box: 'bg-emerald-500/10 border-emerald-500/20',
                      title: 'text-emerald-600 dark:text-emerald-400',
                      amount: 'text-emerald-600 dark:text-emerald-400',
                      button: 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                    }
                  : {
                      box: 'bg-blue-500/10 border-blue-500/20',
                      title: 'text-blue-600 dark:text-blue-400',
                      amount: 'text-blue-600 dark:text-blue-400',
                      button: 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border-blue-500/30',
                    };

                return (
                  <div className={clsx("rounded-xl p-3 border flex-1 md:flex-initial min-w-[190px] flex items-center justify-between gap-3 shadow-xs", colorStyles.box)}>
                    <div className="min-w-0">
                      <div className={clsx("flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider", colorStyles.title)}>
                        <Building2 className="w-3 h-3" />
                        <span>Party Ledger</span>
                      </div>
                      <p className={clsx("text-sm font-black font-mono tracking-tight mt-0.5 truncate", colorStyles.amount)}>
                        {matchedParty
                          ? (isReceivable ? `+${formatCurrency(bal)}` : isPayable ? `-${formatCurrency(Math.abs(bal))}` : `₹0.00`)
                          : 'No Ledger'}
                      </p>
                    </div>
                    <button
                      onClick={handleNavigateToParty}
                      className={clsx("py-1 px-2 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer border shrink-0", colorStyles.button)}
                    >
                      <span>View</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                );
              })()}

              {/* Credit Period & Limit Status Card */}
              {(() => {
                const creditLimit = Number(selectedCustomer.credit_limit || matchedParty?.credit_limit || 0);
                const hasCreditPeriod = Boolean(selectedCustomer.credit_period_enabled || matchedParty?.credit_period_enabled);
                const days = selectedCustomer.credit_period_days || (matchedParty as any)?.credit_period_days || 30;
                const isOverdue = Boolean(selectedCustomer.has_overdue || (matchedParty as any)?.has_overdue);
                const overdueBillsCount = selectedCustomer.overdue_bills_count || (matchedParty as any)?.overdue_bills_count || 0;
                const overdueAmount = Number(selectedCustomer.overdue_amount || (matchedParty as any)?.overdue_amount || 0);
                const isRestricted = selectedCustomer.restrict_on_credit_expiry !== false && (selectedCustomer.restrict_on_credit_expiry as any) !== 0 && (matchedParty as any)?.restrict_on_credit_expiry !== false;

                if (!hasCreditPeriod && creditLimit <= 0) return null;

                return (
                  <div className={clsx(
                    "rounded-xl p-3 border flex-1 md:flex-initial min-w-[210px] flex items-center justify-between gap-3 shadow-xs",
                    isOverdue
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
                      : "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-400"
                  )}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{isOverdue ? 'Overdue Payment' : 'Credit Terms'}</span>
                      </div>
                      <div className="text-xs font-black mt-1 flex items-center gap-2">
                        {isOverdue ? (
                          <span className="text-rose-600 dark:text-rose-400 font-mono">
                            {overdueBillsCount} bill{overdueBillsCount !== 1 ? 's' : ''} ({formatCurrency(overdueAmount)})
                          </span>
                        ) : hasCreditPeriod ? (
                          <span className="font-mono text-foreground font-black">
                            {days} Days Period
                          </span>
                        ) : (
                          <span className="font-mono text-foreground font-black">
                            Limit: {formatCurrency(creditLimit)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {creditLimit > 0 && <span>Limit: {formatCurrency(creditLimit)} · </span>}
                        {hasCreditPeriod && (
                          <span className={isRestricted && isOverdue ? "text-rose-600 dark:text-rose-400 font-bold" : ""}>
                            {isRestricted ? (isOverdue ? 'Credit Blocked' : 'Strict') : 'Allowed'}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOverdue && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-xs shrink-0">
                        OVERDUE
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Available Points Badge */}
              {loyaltyEnabled && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex-1 md:flex-initial min-w-[170px] flex items-center justify-between gap-3 shadow-xs">
                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      <Award className="w-3 h-3" />
                      <span>Active Points</span>
                    </div>
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-0.5">
                      {(selectedCustomer.current_points_balance || 0).toFixed(0)} pts
                    </p>
                  </div>
                  <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2 py-1 rounded-md font-mono border border-emerald-500/20 shrink-0">
                    Earned: {(selectedCustomer.total_points_earned || 0).toFixed(0)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className={clsx("grid gap-3 shrink-0", loyaltyEnabled ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2")}>
            <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <ShoppingBag className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Lifetime Spend</p>
                <p className="text-sm font-black text-foreground font-mono truncate">{formatCurrency(totalLifetimeSpend)}</p>
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Receipt className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Total Invoices</p>
                <p className="text-sm font-black text-foreground font-mono truncate">{invoices.length}</p>
              </div>
            </div>

            {loyaltyEnabled && (
              <>
                <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Points Earned</p>
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
                      +{(selectedCustomer.total_points_earned || 0).toFixed(0)} pts
                    </p>
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-card border border-border/80 shadow-xs flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Gift className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">Points Redeemed</p>
                    <p className="text-sm font-black text-amber-600 dark:text-amber-400 font-mono truncate">
                      -{(selectedCustomer.total_points_redeemed || 0).toFixed(0)} pts
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Interactive Tabbed History Section */}
          <div className="flex-1 flex flex-col bg-card border border-border/80 rounded-2xl shadow-xs overflow-hidden">
            {/* Tab Header */}
            <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5 bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailTab('purchases')}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer',
                    detailTab === 'purchases'
                      ? 'bg-card text-foreground shadow-xs border border-border/80'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  <Receipt className="w-3.5 h-3.5 text-primary" />
                  <span>Purchase History</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-black">
                    {invoices.length}
                  </span>
                </button>

                {loyaltyEnabled && (
                  <button
                    onClick={() => setDetailTab('points')}
                    className={clsx(
                      'px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer',
                      detailTab === 'points'
                        ? 'bg-card text-foreground shadow-xs border border-border/80'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                  >
                    <Gift className="w-3.5 h-3.5 text-amber-500" />
                    <span>Points Activity Log</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black">
                      {loyaltyTxs.length}
                    </span>
                  </button>
                )}
              </div>

              {/* Bill filter + bulk CSV download */}
              {detailTab === 'purchases' && invoices.length > 0 && (
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <span className="text-[10px] text-muted-foreground font-bold shrink-0">
                    {filteredInvoices.length === invoices.length
                      ? `${invoices.length} bill${invoices.length !== 1 ? 's' : ''}`
                      : `${filteredInvoices.length} of ${invoices.length} bills`}
                  </span>
                  <DateRangeFilter
                    startDate={billFilterStart}
                    endDate={billFilterEnd}
                    onChange={(s, e) => { setBillFilterStart(s); setBillFilterEnd(e); }}
                    align="right"
                  />
                  <button
                    type="button"
                    onClick={handleDownloadFilteredInvoicesPdf}
                    disabled={exportingPdf || filteredInvoices.length === 0}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Download/Print filtered bills as PDF (1 bill per page)"
                  >
                    {exportingPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadFilteredInvoicesCsv}
                    disabled={exportingFilteredInvoices || filteredInvoices.length === 0}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted/60 text-foreground hover:bg-muted border border-border/60 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Download filtered bills as CSV spreadsheet"
                  >
                    {exportingFilteredInvoices ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>CSV</span>
                  </button>
                </div>
              )}

              {detailTab === 'points' && loyaltyEnabled && (
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={handleRecalculateCustomerPoints}
                    disabled={recalculatingPoints}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border bg-card hover:bg-muted text-foreground transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                    title="Recalculate loyalty points balance from customer purchase history"
                  >
                    {recalculatingPoints ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span>Recalculate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustPointsValue('');
                      setAdjustPointsReason('');
                      setAdjustPointsType('ADD');
                      setAdjustPointsModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    title="Manually add or deduct loyalty points"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Adjust Points</span>
                  </button>
                </div>
              )}
            </div>

            {/* Tab Body */}
            <div className="flex-1 p-6 overflow-y-auto">
              {detailTab === 'purchases' && (
                <div>
                  {invoicesLoading ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
                  ) : invoices.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                      <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                        <CreditCard className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-extrabold text-foreground">No purchases recorded yet</p>
                      <p className="text-xs text-muted-foreground/75 max-w-sm">
                        Invoices linked to this customer will appear here automatically after checkout.
                      </p>
                    </div>
                  ) : filteredInvoices.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                      <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                        <FilterX className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-extrabold text-foreground">No bills in selected date range</p>
                      <p className="text-xs text-muted-foreground/75 max-w-sm">
                        {`${invoices.length} bill${invoices.length !== 1 ? 's' : ''} exist for this customer. Adjust or clear the date filter to see them.`}
                      </p>
                      <button
                        onClick={() => { setBillFilterStart(''); setBillFilterEnd(''); }}
                        className="px-4 py-2 rounded-xl text-xs font-bold border border-border bg-muted/50 hover:bg-muted text-foreground transition-all cursor-pointer"
                      >
                        Clear Date Filter
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredInvoices.map(inv => (
                        // eslint-disable-next-line @typescript-eslint/parser
                        <div
                          key={inv.invoice_id}
                          onClick={() => handleOpenInvoiceDetail(inv)}
                          className="p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/40 transition-all shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer group"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 text-primary font-mono font-black text-xs shrink-0 group-hover:scale-105 transition-transform flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-primary group-hover:underline font-mono">#{inv.invoice_number}</span>
                                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-muted-foreground/60" /> {formatDateTime(inv.created_at)}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground font-bold mt-1">
                                Grand Total: <span className="text-foreground font-black">{formatCurrency(inv.grand_total)}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {inv.payment_method && renderPaymentMethodBadge(inv.payment_method)}
                                {inv.invoice_type && renderBillTypeBadge(inv)}
                                {inv.due_date && (
                                  <span className="text-[10px] font-mono font-bold text-muted-foreground flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-md border border-border/40">
                                    Due: {inv.due_date}
                                  </span>
                                )}
                                {inv.credit_status === 'OVERDUE' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                    ⚠️ {inv.overdue_days != null ? `${inv.overdue_days}d OVERDUE` : 'OVERDUE'}
                                    {inv.outstanding_amount != null && ` (${formatCurrency(inv.outstanding_amount)})`}
                                  </span>
                                )}
                                {inv.credit_status === 'DUE_SOON' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                    ⏰ Due in {inv.remaining_days}d
                                  </span>
                                )}
                                {inv.credit_status === 'ACTIVE' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                    ⏳ {inv.remaining_days != null ? `${inv.remaining_days}d left` : 'Active Credit'}
                                  </span>
                                )}
                                {inv.credit_status === 'PAID' && (inv.payment_method === 'CREDIT' || inv.is_credit_bill) && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                    ✓ Settled
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {loyaltyEnabled && inv.points_earned > 0 && (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono">
                                +{inv.points_earned.toFixed(0)} pts earned
                              </span>
                            )}
                            {loyaltyEnabled && inv.points_redeemed > 0 && (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-600 border border-amber-500/20 font-mono">
                                -{inv.points_redeemed.toFixed(0)} pts ({formatCurrency(inv.points_redeemed_discount)} off)
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownloadInvoiceCsv(inv); }}
                                disabled={invoiceBusyId === inv.invoice_id}
                                className="p-2 rounded-lg text-muted-foreground/70 hover:text-blue-600 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/25 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Download bill as CSV"
                              >
                                {invoiceBusyId === inv.invoice_id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                )}
                              </button>
                            </div>
                            <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                              View Bill <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'points' && loyaltyEnabled && selectedCustomer && (
                <div className="space-y-6">
                  {/* Summary row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Available Balance</p>
                      <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
                        {(Number(selectedCustomer.current_points_balance) || 0).toFixed(0)} <span className="text-xs">pts</span>
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Earned</p>
                      <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                        +{(Number(selectedCustomer.total_points_earned) || 0).toFixed(0)} <span className="text-xs">pts</span>
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Total Redeemed</p>
                      <p className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono mt-1">
                        -{(Number(selectedCustomer.total_points_redeemed) || 0).toFixed(0)} <span className="text-xs">pts</span>
                      </p>
                    </div>
                  </div>

                  {loyaltyTxsLoading ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
                  ) : loyaltyTxs.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
                      <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                        <Gift className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-extrabold text-foreground">No points activity yet</p>
                      <p className="text-xs text-muted-foreground/75 max-w-sm">
                        Loyalty point earnings, redemptions, and manual adjustments will be logged here.
                      </p>
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                      {loyaltyTxs.map(tx => (
                        <div key={tx.transaction_id} className="relative group">
                          {/* Timeline node */}
                          <div className={clsx(
                            'absolute -left-6 top-3 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center shadow-xs',
                            tx.transaction_type === 'EARNED' ? 'bg-emerald-500 text-white' :
                            tx.transaction_type === 'REDEEMED' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                          )}>
                            <Award className="w-2.5 h-2.5" />
                          </div>

                          <div className="p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/30 transition-all shadow-xs flex items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={clsx(
                                  'text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider',
                                  tx.transaction_type === 'EARNED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                                  tx.transaction_type === 'REDEEMED' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                  'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                                )}>
                                  {tx.transaction_type}
                                </span>
                                <span className="text-xs text-muted-foreground font-semibold">{formatDateTime(tx.created_at)}</span>
                              </div>
                              {tx.description && (
                                <p className="text-xs font-medium text-foreground">{tx.description}</p>
                              )}
                              {tx.reference_number && (
                                <p className="text-[10px] text-muted-foreground/75 font-mono">Ref: {tx.reference_number}</p>
                              )}
                            </div>

                            <div className="text-right">
                              <p className={clsx(
                                'text-base font-black font-mono tracking-tight',
                                tx.transaction_type === 'EARNED' ? 'text-emerald-600 dark:text-emerald-400' :
                                tx.transaction_type === 'REDEEMED' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600'
                              )}>
                                {tx.transaction_type === 'EARNED' ? '+' : '-'}{(Number(tx.points) || 0).toFixed(0)} pts
                              </p>
                              <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                                Balance: {(Number(tx.points_balance_after) || 0).toFixed(0)} pts
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null )}

      {/* Invoice Detail Modal */}
      {viewingInvoice && (
        <Modal isOpen={!!viewingInvoice} className="max-w-6xl w-full" onClose={() => setViewingInvoice(null)} title={`Invoice Detail #${viewingInvoice.invoice_number}`}>
          <div className="space-y-4 select-none w-full">
            <div className="flex items-center justify-between bg-muted/40 p-3.5 rounded-xl border border-border">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Invoice Number</p>
                <p className="text-base font-black text-foreground font-mono">#{viewingInvoice.invoice_number}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {viewingInvoice.payment_method && renderPaymentMethodBadge(viewingInvoice.payment_method)}
                  {viewingInvoice.invoice_type && renderBillTypeBadge(viewingInvoice)}
                  {viewingInvoice.due_date && (
                    <span className="text-[10px] font-mono font-bold text-muted-foreground bg-background px-2 py-0.5 rounded-md border border-border">
                      Due: {viewingInvoice.due_date}
                    </span>
                  )}
                  {viewingInvoice.credit_status === 'OVERDUE' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-xs">
                      ⚠️ OVERDUE ({viewingInvoice.overdue_days != null ? `${viewingInvoice.overdue_days}d` : ''})
                    </span>
                  )}
                  {viewingInvoice.credit_status === 'DUE_SOON' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                      ⏰ Due in {viewingInvoice.remaining_days}d
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Date & Time</p>
                <p className="text-xs font-bold text-foreground">{formatDateTime(viewingInvoice.created_at)}</p>
              </div>
            </div>

            {/* Purchased Items Table */}
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="bg-muted/60 px-4 py-2 border-b border-border text-xs font-bold text-muted-foreground flex justify-between">
                <span>Items Purchased</span>
                <span>{invoiceItems.length} item{invoiceItems.length !== 1 ? 's' : ''}</span>
              </div>
              {itemsLoading ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Loading invoice line items...</div>
              ) : invoiceItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">No itemized details recorded for this invoice.</div>
              ) : (
                <div className="divide-y divide-border">
                  {invoiceItems.map((item, idx) => (
                    <div key={item.item_id || idx} className="p-3 text-xs flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {item.quantity} {item.uom || 'Pcs'} × {formatCurrency(item.unit_price)}
                          {Number(item.tax_amount) > 0 && <span className="ml-2 text-emerald-600 font-semibold">(Tax: +{formatCurrency(item.tax_amount)})</span>}
                        </p>
                      </div>
                      <div className="text-right font-bold text-foreground font-mono">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial Summary Box */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-xs">
              {/* Subtotal */}
              <div className="flex justify-between text-muted-foreground font-semibold">
                <span>Subtotal:</span>
                <span className="font-mono text-foreground font-bold">
                  {formatCurrency(viewingInvoice.subtotal ?? invoiceItems.reduce((s, i) => s + (Number(i.total) || 0), 0))}
                </span>
              </div>

              {/* Total Tax */}
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Tax Total (GST):</span>
                <span className="font-mono">
                  +{formatCurrency(viewingInvoice.tax_total ?? invoiceItems.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0))}
                </span>
              </div>

              {/* Bill Discount */}
              {Number(viewingInvoice.discount_total || viewingInvoice.discount_value) > 0 && (
                <div className="flex justify-between text-amber-600 font-bold">
                  <span>Trade Discount:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.discount_total || viewingInvoice.discount_value || 0)}</span>
                </div>
              )}

              {/* Scrap Deduction */}
              {Number(viewingInvoice.scrap_deduction) > 0 && (
                <div className="flex justify-between text-purple-600 font-bold">
                  <span>Scrap Deduction {viewingInvoice.scrap_invoice_number ? `(#${viewingInvoice.scrap_invoice_number})` : ''}:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.scrap_deduction || 0)}</span>
                </div>
              )}

              {/* Return Deduction */}
              {Number(viewingInvoice.return_deduction) > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Return Deduction {viewingInvoice.return_invoice_number ? `(#${viewingInvoice.return_invoice_number})` : ''}:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.return_deduction || 0)}</span>
                </div>
              )}

              {/* Loyalty Points Earned / Redeemed */}
              {loyaltyEnabled && viewingInvoice.points_earned > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Loyalty Points Earned:</span>
                  <span>+{(Number(viewingInvoice.points_earned) || 0).toFixed(0)} pts</span>
                </div>
              )}
              {loyaltyEnabled && viewingInvoice.points_redeemed > 0 && (
                <div className="flex justify-between text-amber-600 font-bold">
                  <span>Loyalty Points Discount:</span>
                  <span className="font-mono">-{formatCurrency(viewingInvoice.points_redeemed_discount)}</span>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between font-extrabold text-base pt-2.5 border-t border-border">
                <span>Grand Total:</span>
                <span className="text-primary font-mono">{formatCurrency(viewingInvoice.grand_total)}</span>
              </div>

              {/* Received & Balance Breakdown */}
              {(Number(viewingInvoice.received_amount) > 0 || Number(viewingInvoice.balance_amount) !== 0) && (
                <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-[11px]">
                  {Number(viewingInvoice.received_amount) > 0 && (
                    <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                      <span className="text-muted-foreground font-semibold block">Received Amount:</span>
                      <span className="font-bold text-foreground font-mono">{formatCurrency(viewingInvoice.received_amount || 0)}</span>
                    </div>
                  )}
                  {viewingInvoice.payment_method === 'CREDIT' ? (
                    <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                      <span className="text-muted-foreground font-semibold block">
                        {Number(viewingInvoice.balance_amount) < 0 ? 'Advance Credit:' : 'Outstanding Balance:'}
                      </span>
                      <span className={clsx("font-bold font-mono", Number(viewingInvoice.balance_amount) > 0 ? "text-amber-600" : "text-emerald-600")}>
                        {formatCurrency(Math.abs(viewingInvoice.balance_amount || 0))}
                      </span>
                    </div>
                  ) : (Number(viewingInvoice.received_amount) > Number(viewingInvoice.grand_total)) ? (
                    <div className="bg-muted/40 p-2 rounded-lg border border-border/40">
                      <span className="text-muted-foreground font-semibold block">Change Returned:</span>
                      <span className="font-bold font-mono text-emerald-600">
                        {formatCurrency(Number(viewingInvoice.received_amount) - Number(viewingInvoice.grand_total))}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Bill Actions: Download CSV / Edit */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => handleDownloadInvoiceCsv(viewingInvoice)}
                  disabled={invoiceBusyId === viewingInvoice.invoice_id}
                  className="px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {invoiceBusyId === viewingInvoice.invoice_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  )} Download CSV
                </button>
                {hasPermission(useAuthStore.getState(), 'sales.edit') && (
                  <button
                    type="button"
                    onClick={handleEditBillFromCustomerModal}
                    className="px-4 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Bill
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
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
                  This action will soft-delete their customer profile, loyalty points record (<strong>{(customerToDelete.current_points_balance || 0).toFixed(0)} pts</strong>), and any associated <strong>Party Ledger entries</strong>.
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
                      : `₹0.00 (Settled)`}
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
        <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Customer" size="md">
          <div className="space-y-4">
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Name <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                  placeholder="Customer name"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Phone</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={e => setAddForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                    placeholder="Phone number"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Credit Limit (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 50000 (0 = No limit)"
                      value={addForm.credit_limit}
                      onChange={e => setAddForm(prev => ({ ...prev, credit_limit: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm no-spinners"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Address</label>
                <textarea
                  value={addForm.address}
                  onChange={e => setAddForm(prev => ({ ...prev, address: e.target.value }))}
                  rows={2}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm resize-none"
                  placeholder="Customer address"
                />
              </div>

              {pricingTiers.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Pricing Tier</label>
                  <select
                    value={addForm.pricing_tier_id}
                    onChange={e => setAddForm(prev => ({ ...prev, pricing_tier_id: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm appearance-none"
                  >
                    <option value="">No Tier (Default Pricing)</option>
                    {pricingTiers.map(tier => (
                      <option key={tier.pricing_tier_id} value={tier.pricing_tier_id}>{tier.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Credit Period Section */}
              <div className="pt-2 border-t border-border/70">
                <div className={clsx(
                  "rounded-2xl border transition-all duration-200 overflow-hidden",
                  addForm.credit_period_enabled
                    ? "bg-card border-indigo-500/30 shadow-xs"
                    : "bg-muted/15 border-border/60"
                )}>
                  {/* Header & Toggle */}
                  <div className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        addForm.credit_period_enabled
                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                          : "bg-muted text-muted-foreground"
                      )}>
                        <Clock className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-foreground uppercase tracking-wider">Credit Period Management</span>
                          {addForm.credit_period_enabled && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                              {addForm.credit_period_days || 30} Days
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          Enforce payment deadlines independently of credit limits.
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={addForm.credit_period_enabled}
                        onChange={e => setAddForm(prev => ({ ...prev, credit_period_enabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                  </div>

                  {addForm.credit_period_enabled && (
                    <div className="p-4 pt-2 border-t border-border/60 space-y-4 animate-in fade-in duration-200">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Credit Duration (Days)
                          </label>
                          <span className="text-xs font-extrabold text-primary font-mono">
                            {addForm.credit_period_days || 30} Days Grace Period
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/70 shrink-0">
                            {[15, 30, 45, 50, 60].map(days => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => setAddForm(prev => ({ ...prev, credit_period_days: String(days) }))}
                                className={clsx(
                                  "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95",
                                  String(addForm.credit_period_days) === String(days)
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
                              value={addForm.credit_period_days}
                              onChange={e => setAddForm(prev => ({ ...prev, credit_period_days: e.target.value }))}
                              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs no-spinners pr-14"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                              Days
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Calculation Basis
                        </label>
                        <select
                          value={addForm.credit_period_basis}
                          onChange={e => setAddForm(prev => ({ ...prev, credit_period_basis: e.target.value }))}
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs"
                        >
                          <option value="BILL_BASED">Option A: Bill-Based (Payment due date calculated separately from each bill)</option>
                          <option value="OLDEST_UNPAID">Option B: Oldest Unpaid Bill (Due date counted from oldest unsettled bill)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          When Credit Period Expires
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => setAddForm(prev => ({ ...prev, restrict_on_credit_expiry: true }))}
                            className={clsx(
                              "p-3 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-2.5",
                              addForm.restrict_on_credit_expiry
                                ? "border-rose-500 bg-rose-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">🚫</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", addForm.restrict_on_credit_expiry ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
                                Restrict Further Credit
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                Blocks credit purchases if past bills are overdue. Cash sales remain available.
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAddForm(prev => ({ ...prev, restrict_on_credit_expiry: false }))}
                            className={clsx(
                              "p-3 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-2.5",
                              !addForm.restrict_on_credit_expiry
                                ? "border-emerald-500 bg-emerald-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">✅</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", !addForm.restrict_on_credit_expiry ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                Allow Further Credit
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                Can continue credit purchases even after expiry, subject to available credit limit.
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </button>
              <button
                type="button"
                disabled={isSavingAdd}
                onClick={handleConfirmAddCustomer}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                {isSavingAdd ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Customer...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Customer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Customer Modal */}
      {editModalOpen && editingCustomer && (
        <Modal isOpen={editModalOpen} onClose={() => { setEditModalOpen(false); setEditingCustomer(null); }} title="Edit Customer" size="md">
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-muted-foreground">
                <User className="w-4 h-4 text-primary" /> Editing Customer: <span className="text-foreground">{editingCustomer.name}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                ID: <span className="font-mono font-bold text-foreground">{editingCustomer.customer_id}</span>
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Name <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                  placeholder="Customer name"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm"
                    placeholder="Phone number"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Credit Limit (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 50000 (0 = No limit)"
                      value={editForm.credit_limit}
                      onChange={e => setEditForm(prev => ({ ...prev, credit_limit: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm no-spinners"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Address</label>
                <textarea
                  value={editForm.address}
                  onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                  rows={2}
                  className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm resize-none"
                  placeholder="Address"
                />
              </div>

              {pricingTiers.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Pricing Tier</label>
                  <select
                    value={editForm.pricing_tier_id}
                    onChange={e => setEditForm(prev => ({ ...prev, pricing_tier_id: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm appearance-none"
                  >
                    <option value="">No Tier (Default Pricing)</option>
                    {pricingTiers.map(tier => (
                      <option key={tier.pricing_tier_id} value={tier.pricing_tier_id}>{tier.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Credit Period Section */}
              <div className="pt-2 border-t border-border/70">
                <div className={clsx(
                  "rounded-2xl border transition-all duration-200 overflow-hidden",
                  editForm.credit_period_enabled
                    ? "bg-card border-indigo-500/30 shadow-xs"
                    : "bg-muted/15 border-border/60"
                )}>
                  {/* Header & Toggle */}
                  <div className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        editForm.credit_period_enabled
                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                          : "bg-muted text-muted-foreground"
                      )}>
                        <Clock className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-foreground uppercase tracking-wider">Credit Period Management</span>
                          {editForm.credit_period_enabled && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                              {editForm.credit_period_days || 30} Days
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          Enforce payment deadlines independently of credit limits.
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={editForm.credit_period_enabled}
                        onChange={e => setEditForm(prev => ({ ...prev, credit_period_enabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                  </div>

                  {editForm.credit_period_enabled && (
                    <div className="p-4 pt-2 border-t border-border/60 space-y-4 animate-in fade-in duration-200">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Credit Duration (Days)
                          </label>
                          <span className="text-xs font-extrabold text-primary font-mono">
                            {editForm.credit_period_days || 30} Days Grace Period
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/70 shrink-0">
                            {[15, 30, 45, 50, 60].map(days => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => setEditForm(prev => ({ ...prev, credit_period_days: String(days) }))}
                                className={clsx(
                                  "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95",
                                  String(editForm.credit_period_days) === String(days)
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
                              value={editForm.credit_period_days}
                              onChange={e => setEditForm(prev => ({ ...prev, credit_period_days: e.target.value }))}
                              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs no-spinners pr-14"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                              Days
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Calculation Basis
                        </label>
                        <select
                          value={editForm.credit_period_basis}
                          onChange={e => setEditForm(prev => ({ ...prev, credit_period_basis: e.target.value }))}
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs"
                        >
                          <option value="BILL_BASED">Option A: Bill-Based (Payment due date calculated separately from each bill)</option>
                          <option value="OLDEST_UNPAID">Option B: Oldest Unpaid Bill (Due date counted from oldest unsettled bill)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          When Credit Period Expires
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => setEditForm(prev => ({ ...prev, restrict_on_credit_expiry: true }))}
                            className={clsx(
                              "p-3 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-2.5",
                              editForm.restrict_on_credit_expiry
                                ? "border-rose-500 bg-rose-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">🚫</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", editForm.restrict_on_credit_expiry ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
                                Restrict Further Credit
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                Blocks credit purchases if past bills are overdue. Cash sales remain available.
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditForm(prev => ({ ...prev, restrict_on_credit_expiry: false }))}
                            className={clsx(
                              "p-3 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-2.5",
                              !editForm.restrict_on_credit_expiry
                                ? "border-emerald-500 bg-emerald-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">✅</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", !editForm.restrict_on_credit_expiry ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                Allow Further Credit
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                Can continue credit purchases even after expiry, subject to available credit limit.
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setEditModalOpen(false); setEditingCustomer(null); }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleConfirmEditCustomer}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Adjust Loyalty Points Modal */}
      {adjustPointsModalOpen && selectedCustomer && (
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
