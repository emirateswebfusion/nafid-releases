import { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, RotateCcw, Search, X, AlertTriangle, Receipt, Package, Users, Handshake, Loader2, RefreshCw, Ban, Eye, ExternalLink, CheckCircle2, LayoutGrid, List, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { isAdminRole, hasPermission } from '../utils/permissions';
import { hasBridge } from '../data/client';
import { invoicesApi } from '../data/invoices';
import { partiesApi } from '../data/parties';
import { recycleBinApi } from '../data/recycleBin';
import { formatAmount } from '../utils/money';

// ─── Types ────────────────────────────────────────────────────────────────────

type RecycleBinCategory = 'SALES_BILLS' | 'PRODUCTS' | 'CUSTOMERS' | 'PARTIES';

interface Props {
  onClose: () => void;
  initialCategory?: RecycleBinCategory;
  onNavigateToSalesHistory?: () => void;
}

interface DeletedInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone: string;
  grand_total: number;
  payment_method: string;
  invoice_type: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

interface DeletedProduct {
  product_id: string;
  name: string;
  barcode: string;
  category: string;
  current_stock: number;
  base_price: number;
  updated_at: string;
}

interface DeletedCustomer {
  customer_id: string;
  name: string;
  phone: string;
  email: string;
  current_points_balance: number;
  updated_at: string;
}

interface DeletedParty {
  party_id: string;
  name: string;
  phone: string;
  address: string;
  balance: number;
  balance_type: string;
  party_type: string;
  updated_at: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

interface ConfirmState {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return 'unknown';
  try {
    const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMinutes < 5) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  } catch {
    return 'unknown';
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ─── Category Configurations ──────────────────────────────────────────────────

const CATEGORIES: { id: RecycleBinCategory; label: string; Icon: React.FC<any>; desc: string }[] = [
  { id: 'SALES_BILLS', label: 'Sales Bills', Icon: Receipt, desc: 'Invoices, Estimates & Bills of Supply' },
  { id: 'PRODUCTS', label: 'Products & Stock', Icon: Package, desc: 'Inventory catalog items' },
  { id: 'CUSTOMERS', label: 'Customers', Icon: Users, desc: 'Customer directories & loyalty records' },
  { id: 'PARTIES', label: 'Suppliers & Ledger', Icon: Handshake, desc: 'Credit accounts & vendor parties' },
];

export function RecycleBin({ onClose, initialCategory, onNavigateToSalesHistory }: Props) {
  const { tenantId, role, permissions } = useAuthStore();
  const isAdmin = isAdminRole(role);
  const canAccess = isAdmin || hasPermission({ role, permissions }, 'sales.view') || hasPermission({ role, permissions }, 'sales.delete');

  const [activeCategory, setActiveCategory] = useState<RecycleBinCategory>(initialCategory || 'SALES_BILLS');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState('');
  const [billTypeFilter, setBillTypeFilter] = useState<'ALL' | 'GST' | 'BILL_OF_SUPPLY'>('ALL');

  // Category data
  const [invoices, setInvoices] = useState<DeletedInvoice[]>([]);
  const [products, setProducts] = useState<DeletedProduct[]>([]);
  const [customers, setCustomers] = useState<DeletedCustomer[]>([]);
  const [parties, setParties] = useState<DeletedParty[]>([]);

  // Category loading flags
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingParties, setLoadingParties] = useState(false);

  // Loaded categories tracking
  const [, setLoaded] = useState<Set<RecycleBinCategory>>(new Set());

  // Invoice item inspection
  const [inspectingInvoice, setInspectingInvoice] = useState<DeletedInvoice | null>(null);
  const [inspectingItems, setInspectingItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Toasts & Dialogs
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const counts: Record<RecycleBinCategory, number> = useMemo(() => ({
    SALES_BILLS: invoices.length,
    PRODUCTS: products.length,
    CUSTOMERS: customers.length,
    PARTIES: parties.length,
  }), [invoices.length, products.length, customers.length, parties.length]);

  const tid = tenantId || 'global';

  // ─── Toasts ────────────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: 'success' | 'error', actionLabel?: string, onAction?: () => void) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type, actionLabel, onAction }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Data Loaders ──────────────────────────────────────────────────────────
  const loadInvoices = useCallback(async () => {
    if (!hasBridge('dbGetDeletedInvoices')) return;
    setLoadingInvoices(true);
    try {
      const data = await recycleBinApi.getDeletedInvoices(tid);
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, [tid]);

  const loadProducts = useCallback(async () => {
    if (!hasBridge('dbGetDeletedProducts')) return;
    setLoadingProducts(true);
    try {
      const data = await recycleBinApi.getDeletedProducts(tid);
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [tid]);

  const loadCustomers = useCallback(async () => {
    if (!hasBridge('dbGetDeletedCustomers')) return;
    setLoadingCustomers(true);
    try {
      const data = await recycleBinApi.getDeletedCustomers(tid);
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, [tid]);

  const loadParties = useCallback(async () => {
    if (!hasBridge('dbGetDeletedParties')) return;
    setLoadingParties(true);
    try {
      const data = await recycleBinApi.getDeletedParties(tid);
      setParties(Array.isArray(data) ? data : []);
    } catch {
      setParties([]);
    } finally {
      setLoadingParties(false);
    }
  }, [tid]);

  // Load all summary on mount
  useEffect(() => {
    loadInvoices();
    loadProducts();
    loadCustomers();
    loadParties();
    setLoaded(new Set(['SALES_BILLS', 'PRODUCTS', 'CUSTOMERS', 'PARTIES']));
  }, [loadInvoices, loadProducts, loadCustomers, loadParties]);

  // Reload current category
  const reloadActive = useCallback(() => {
    if (activeCategory === 'SALES_BILLS') loadInvoices();
    else if (activeCategory === 'PRODUCTS') loadProducts();
    else if (activeCategory === 'CUSTOMERS') loadCustomers();
    else if (activeCategory === 'PARTIES') loadParties();
  }, [activeCategory, loadInvoices, loadProducts, loadCustomers, loadParties]);

  // ─── Inspect Invoice ───────────────────────────────────────────────────────
  const handleInspectInvoice = useCallback(async (inv: DeletedInvoice) => {
    setInspectingInvoice(inv);
    setLoadingItems(true);
    try {
      if (hasBridge('dbGetInvoiceItems')) {
        const items = await invoicesApi.getInvoiceItems(inv.invoice_id);
        setInspectingItems(Array.isArray(items) ? items : []);
      } else {
        setInspectingItems([]);
      }
    } catch {
      setInspectingItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  // ─── Restore Handlers ──────────────────────────────────────────────────────
  const restoreInvoice = useCallback(async (invoice_id: string, invoice_number: string) => {
    if (!hasBridge('dbRestoreInvoice')) return;
    const res = await recycleBinApi.restoreInvoice(invoice_id);
    if (res?.success) {
      addToast(
        `Invoice ${invoice_number} restored to Sales History`,
        'success',
        onNavigateToSalesHistory ? 'View in History' : undefined,
        onNavigateToSalesHistory
      );
      loadInvoices();
    } else {
      addToast(res?.error || 'Failed to restore invoice', 'error');
    }
  }, [addToast, loadInvoices, onNavigateToSalesHistory]);

  const restoreProduct = useCallback(async (product_id: string, name: string) => {
    if (!hasBridge('dbRestoreProduct')) return;
    const res = await recycleBinApi.restoreProduct(product_id);
    if (res?.success) {
      addToast(`Product "${name}" restored successfully`, 'success');
      loadProducts();
    } else {
      addToast(res?.error || 'Failed to restore product', 'error');
    }
  }, [addToast, loadProducts]);

  const restoreCustomer = useCallback(async (customer_id: string, name: string) => {
    if (!hasBridge('dbRestoreCustomer')) return;
    const res = await recycleBinApi.restoreCustomer({ customer_id, tenant_id: tid });
    if (res?.success) {
      addToast(`Customer "${name}" restored successfully`, 'success');
      loadCustomers();
    } else {
      addToast(res?.error || 'Failed to restore customer', 'error');
    }
  }, [addToast, loadCustomers, tid]);

  const restoreParty = useCallback(async (party_id: string, name: string) => {
    if (!hasBridge('dbRestoreParty')) return;
    const res = await partiesApi.restoreParty(party_id);
    if (res?.success) {
      addToast(`Supplier "${name}" restored successfully`, 'success');
      loadParties();
    } else {
      addToast(res?.error || 'Failed to restore party', 'error');
    }
  }, [addToast, loadParties]);

  // ─── Permanent Delete Handlers ─────────────────────────────────────────────
  const hardDeleteInvoice = useCallback(async (invoice_id: string, invoice_number: string) => {
    if (!hasBridge('dbHardDeleteInvoice')) return;
    const res = await recycleBinApi.hardDeleteInvoice(invoice_id);
    if (res?.success) {
      addToast(`Invoice ${invoice_number} permanently wiped`, 'success');
      loadInvoices();
    } else {
      addToast(res?.error || 'Failed to permanently delete invoice', 'error');
    }
  }, [addToast, loadInvoices]);

  const hardDeleteProduct = useCallback(async (product_id: string, name: string) => {
    if (!hasBridge('dbHardDeleteProduct')) return;
    const res = await recycleBinApi.hardDeleteProduct(product_id);
    if (res?.success) {
      addToast(`"${name}" permanently removed`, 'success');
      loadProducts();
    } else {
      addToast(res?.error || 'Failed to permanently delete product', 'error');
    }
  }, [addToast, loadProducts]);

  const hardDeleteCustomer = useCallback(async (customer_id: string, name: string) => {
    if (!hasBridge('dbHardDeleteCustomer')) return;
    const res = await recycleBinApi.hardDeleteCustomer({ customer_id, tenant_id: tid });
    if (res?.success) {
      addToast(`Customer "${name}" permanently removed`, 'success');
      loadCustomers();
    } else {
      addToast(res?.error || 'Failed to permanently delete customer', 'error');
    }
  }, [addToast, loadCustomers, tid]);

  const hardDeleteParty = useCallback(async (party_id: string, name: string) => {
    if (!hasBridge('dbHardDeleteParty')) return;
    const res = await recycleBinApi.hardDeleteParty(party_id);
    if (res?.success) {
      addToast(`Supplier "${name}" permanently removed`, 'success');
      loadParties();
    } else {
      addToast(res?.error || 'Failed to permanently delete supplier', 'error');
    }
  }, [addToast, loadParties]);

  const askHardDeleteCustomer = useCallback((cust: DeletedCustomer) => {
    setConfirm({
      visible: true,
      title: `Permanently delete "${cust.name}"?`,
      message: 'This action is irreversible. The customer profile will be completely erased from the local database.',
      onConfirm: () => hardDeleteCustomer(cust.customer_id, cust.name),
    });
  }, [hardDeleteCustomer]);

  const askHardDeleteParty = useCallback((party: DeletedParty) => {
    setConfirm({
      visible: true,
      title: `Permanently delete "${party.name}"?`,
      message: 'This action is irreversible. The supplier/party and ledger transactions will be completely erased.',
      onConfirm: () => hardDeleteParty(party.party_id, party.name),
    });
  }, [hardDeleteParty]);

  const askHardDeleteInvoice = useCallback((inv: DeletedInvoice) => {
    setConfirm({
      visible: true,
      title: `Permanently delete ${inv.invoice_number}?`,
      message: 'This action is irreversible. The invoice record and its associated data will be completely erased from the local database.',
      onConfirm: () => hardDeleteInvoice(inv.invoice_id, inv.invoice_number),
    });
  }, [hardDeleteInvoice]);

  const askHardDeleteProduct = useCallback((prod: DeletedProduct) => {
    setConfirm({
      visible: true,
      title: `Permanently delete "${prod.name}"?`,
      message: 'This action is irreversible. The product item and barcode index will be completely removed.',
      onConfirm: () => hardDeleteProduct(prod.product_id, prod.name),
    });
  }, [hardDeleteProduct]);

  const handleEmptyCategory = useCallback(() => {
    const count = counts[activeCategory];
    if (count === 0) return;
    const catLabel = CATEGORIES.find((c) => c.id === activeCategory)?.label || 'items';
    setConfirm({
      visible: true,
      title: `Empty ${catLabel}?`,
      message: `Permanently delete all ${count} records in ${catLabel}? This action is irreversible.`,
      onConfirm: async () => {
        if (!hasBridge('dbEmptyRecycleBin')) return;
        const res = await recycleBinApi.emptyRecycleBin({ category: activeCategory, tenant_id: tid });
        if (res?.success) {
          addToast(`Recycle bin cleared for ${catLabel}`, 'success');
          reloadActive();
        } else {
          addToast(res?.error || 'Failed to empty recycle bin', 'error');
        }
      },
    });
  }, [activeCategory, counts, tid, addToast, reloadActive]);

  // ─── Filtering ─────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (billTypeFilter === 'GST' && inv.invoice_type !== 'GST') return false;
      if (billTypeFilter === 'BILL_OF_SUPPLY' && inv.invoice_type === 'GST') return false;
      if (!q) return true;
      return (
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.customer_name?.toLowerCase().includes(q) ||
        inv.customer_phone?.includes(q) ||
        inv.payment_method?.toLowerCase().includes(q)
      );
    });
  }, [invoices, billTypeFilter, q]);

  const filteredProducts = useMemo(() => {
    if (!q) return products;
    return products.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  }, [products, q]);

  const filteredCustomers = useMemo(() => {
    if (!q) return customers;
    return customers.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  }, [customers, q]);

  const filteredParties = useMemo(() => {
    if (!q) return parties;
    return parties.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.party_type?.toLowerCase().includes(q)
    );
  }, [parties, q]);

  const totalDeletedBillsValue = useMemo(() => {
    return invoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0);
  }, [invoices]);

  const isCurrentLoading =
    (activeCategory === 'SALES_BILLS' && loadingInvoices) ||
    (activeCategory === 'PRODUCTS' && loadingProducts) ||
    (activeCategory === 'CUSTOMERS' && loadingCustomers) ||
    (activeCategory === 'PARTIES' && loadingParties);

  // Permission Guard
  if (!canAccess) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6 text-foreground">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto text-rose-500">
            <Ban size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Access Restricted</h3>
            <p className="text-xs text-muted-foreground mt-1">
              You need view permissions to inspect the Recycle Bin. Please log in with an authorized profile.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden text-foreground">

      {/* ─── TOP HEADER ─── */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-4 px-6 py-3.5">

          {/* Left Title & Back Button */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 shadow-inner shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-foreground tracking-tight">Recycle Bin</h1>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                Structured data recovery &amp; restoration hub
              </p>
            </div>
          </div>

          {/* Center Category Switcher */}
          <div className="flex items-center bg-muted/60 dark:bg-muted/30 p-1 rounded-2xl border border-border/80 gap-1 shadow-inner backdrop-blur-xs">
            {CATEGORIES.map(({ id, label, Icon }) => {
              const count = counts[id];
              const isActive = id === activeCategory;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(id);
                    setSearch('');
                  }}
                  className={clsx(
                    'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer active:scale-[0.98]',
                    isActive
                      ? 'bg-card text-foreground border border-border shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                  )}
                >
                  <Icon className={clsx('w-3.5 h-3.5 transition-colors', isActive ? 'text-rose-500' : 'text-muted-foreground')} />
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      className={clsx(
                        'text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full',
                        isActive ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-muted-foreground/15 text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && counts[activeCategory] > 0 && (
              <button
                type="button"
                onClick={handleEmptyCategory}
                title={`Permanently wipe all deleted ${CATEGORIES.find((c) => c.id === activeCategory)?.label || ''}`}
                className="h-8.5 px-3 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all duration-150 active:scale-[0.98] flex items-center gap-1.5 cursor-pointer text-xs font-bold shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Empty Bin</span>
              </button>
            )}

            <button
              type="button"
              onClick={reloadActive}
              disabled={isCurrentLoading}
              title="Refresh deleted items"
              className="h-8.5 w-8.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-[0.98] flex items-center justify-center cursor-pointer disabled:opacity-40 shadow-2xs"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', isCurrentLoading && 'animate-spin text-rose-500')} />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close page"
              className="h-8.5 w-8.5 rounded-xl border border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/15 transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── SUMMARY KPI STRIP ─── */}
        <div className="px-6 py-2.5 bg-muted/20 border-t border-border/70 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">

            {/* KPI 1: Sales Bills */}
            <div
              onClick={() => setActiveCategory('SALES_BILLS')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'SALES_BILLS'
                  ? 'bg-card border-rose-500/40 shadow-xs ring-1 ring-rose-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                <Receipt className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Deleted Bills</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-black font-mono text-foreground">{counts.SALES_BILLS}</span>
                  <span className="text-[10px] font-mono text-muted-foreground font-bold">₹{formatAmount(totalDeletedBillsValue)}</span>
                </div>
              </div>
            </div>

            {/* KPI 2: Products */}
            <div
              onClick={() => setActiveCategory('PRODUCTS')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'PRODUCTS'
                  ? 'bg-card border-blue-500/40 shadow-xs ring-1 ring-blue-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Deleted Items</p>
                <p className="text-xs font-black font-mono text-foreground">{counts.PRODUCTS}</p>
              </div>
            </div>

            {/* KPI 3: Customers */}
            <div
              onClick={() => setActiveCategory('CUSTOMERS')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'CUSTOMERS'
                  ? 'bg-card border-purple-500/40 shadow-xs ring-1 ring-purple-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Customers</p>
                <p className="text-xs font-black font-mono text-foreground">{counts.CUSTOMERS}</p>
              </div>
            </div>

            {/* KPI 4: Ledger Parties */}
            <div
              onClick={() => setActiveCategory('PARTIES')}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all',
                activeCategory === 'PARTIES'
                  ? 'bg-card border-emerald-500/40 shadow-xs ring-1 ring-emerald-500/20'
                  : 'bg-card/50 border-border/60 hover:bg-card'
              )}
            >
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                <Handshake className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Suppliers / Parties</p>
                <p className="text-xs font-black font-mono text-foreground">{counts.PARTIES}</p>
              </div>
            </div>
          </div>

          {/* Quick Notice */}
          <div className="text-[11px] text-muted-foreground hidden lg:flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>Restoring a bill immediately updates inventory stock and recalculates customer ledger balance.</span>
          </div>
        </div>
      </header>

      {/* ─── TOOLBAR (Search & Filters) ─── */}
      <div className="px-6 py-3 border-b border-border/80 bg-card/60 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeCategory === 'SALES_BILLS'
                  ? 'Search deleted bills by invoice #, customer name, mobile...'
                  : activeCategory === 'PRODUCTS'
                  ? 'Search by product name, barcode, category...'
                  : 'Search by name, phone, or details...'
              }
              className="w-full h-8.5 pl-8.5 pr-8 text-xs rounded-xl border border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sales Bill Specific Sub-Filter */}
          {activeCategory === 'SALES_BILLS' && (
            <div className="flex items-center bg-muted/50 p-0.5 rounded-xl border border-border/60 gap-1 text-[11px] font-bold">
              <button
                onClick={() => setBillTypeFilter('ALL')}
                className={clsx(
                  'px-2.5 py-1 rounded-lg transition-all',
                  billTypeFilter === 'ALL' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                All Bills
              </button>
              <button
                onClick={() => setBillTypeFilter('GST')}
                className={clsx(
                  'px-2.5 py-1 rounded-lg transition-all',
                  billTypeFilter === 'GST' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                GST
              </button>
              <button
                onClick={() => setBillTypeFilter('BILL_OF_SUPPLY')}
                className={clsx(
                  'px-2.5 py-1 rounded-lg transition-all',
                  billTypeFilter === 'BILL_OF_SUPPLY' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Bill of Supply
              </button>
            </div>
          )}
        </div>

        {/* View Mode Toggle: Cards vs Table */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/60 gap-1">
            <button
              onClick={() => setViewMode('cards')}
              title="Card Grid View"
              className={clsx(
                'p-1.5 rounded-lg transition-all cursor-pointer',
                viewMode === 'cards' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={clsx(
                'p-1.5 rounded-lg transition-all cursor-pointer',
                viewMode === 'table' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── MAIN CONTENT AREA ─── */}
      <main className="flex-1 overflow-y-auto p-6">
        {isCurrentLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
            <p className="text-xs font-semibold">Loading deleted records...</p>
          </div>
        ) : activeCategory === 'SALES_BILLS' ? (
          filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Bills</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All your billing records are active and accounted for. Any bills deleted from Sales History will appear here ready to restore.
              </p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredInvoices.map((inv) => (
                <div
                  key={inv.invoice_id}
                  className="bg-card border border-border/80 hover:border-rose-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between group"
                >
                  {/* Top: Invoice No + Type + Deleted Time */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm text-foreground tracking-tight">
                            {inv.invoice_number}
                          </span>
                        </div>
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50">
                          {inv.invoice_type?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 shrink-0">
                        {timeAgo(inv.updated_at)}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <p className="text-xs font-bold text-foreground truncate">
                        {inv.customer_name || 'Walk-in Customer'}
                      </p>
                      {inv.customer_phone ? (
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          {inv.customer_phone}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/60 italic mt-0.5">No phone provided</p>
                      )}
                    </div>

                    {/* Date & Payment Method */}
                    <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Billed: {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : 'N/A'}</span>
                      <span className="font-semibold text-foreground/80 uppercase text-[10px] bg-muted px-1.5 py-0.2 rounded">
                        {inv.payment_method || 'CASH'}
                      </span>
                    </div>

                    {/* Grand Total */}
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-baseline justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Value</span>
                      <span className="text-base font-black font-mono text-foreground">
                        ₹{formatAmount(inv.grand_total)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => handleInspectInvoice(inv)}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>
                    <button
                      onClick={() => restoreInvoice(inv.invoice_id, inv.invoice_number)}
                      className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteInvoice(inv)}
                        title="Delete Permanently"
                        className="p-1.5 rounded-xl border border-rose-500/25 bg-rose-500/5 text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-[0.98] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table View */
            <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    <th className="px-4 py-3">Invoice Number</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Grand Total</th>
                    <th className="px-4 py-3">Deleted</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.invoice_id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{inv.customer_name || 'Walk-in Customer'}</p>
                        {inv.customer_phone && <p className="text-[11px] font-mono text-muted-foreground">{inv.customer_phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {inv.invoice_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 uppercase text-[11px] text-muted-foreground">{inv.payment_method}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                        ₹{formatAmount(inv.grand_total)}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-rose-500 font-semibold">{timeAgo(inv.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleInspectInvoice(inv)}
                            className="p-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Inspect"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => restoreInvoice(inv.invoice_id, inv.invoice_number)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => askHardDeleteInvoice(inv)}
                              className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white cursor-pointer"
                              title="Delete Permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeCategory === 'PRODUCTS' ? (
          filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Products</h3>
              <p className="text-xs text-muted-foreground">All inventory catalog products are active.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.product_id}
                  className="bg-card border border-border/80 hover:border-blue-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{timeAgo(p.updated_at)}</span>
                    </div>
                    {p.category && (
                      <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {p.category}
                      </span>
                    )}
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1 text-xs">
                      {p.barcode && (
                        <p className="font-mono text-[11px] text-muted-foreground">Barcode: {p.barcode}</p>
                      )}
                      <p className="text-muted-foreground">
                        Stock: <span className="font-bold text-foreground">{p.current_stock ?? 0}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Selling Price: <span className="font-bold text-foreground font-mono">₹{formatAmount(p.base_price)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => restoreProduct(p.product_id, p.name)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteProduct(p)}
                        className="p-1.5 rounded-xl border border-rose-500/25 text-rose-500 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeCategory === 'CUSTOMERS' ? (
          filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Customers</h3>
              <p className="text-xs text-muted-foreground">All customer profiles are active in the system.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCustomers.map((c) => (
                <div
                  key={c.customer_id}
                  className="bg-card border border-border/80 hover:border-purple-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-foreground truncate">{c.name}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{timeAgo(c.updated_at)}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1 text-xs text-muted-foreground">
                      <p>Phone: <span className="font-mono text-foreground font-medium">{c.phone || 'N/A'}</span></p>
                      {c.email && <p className="truncate">Email: {c.email}</p>}
                      <p>Points: <span className="font-bold text-purple-600 dark:text-purple-400">{c.current_points_balance || 0}</span></p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => restoreCustomer(c.customer_id, c.name)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteCustomer(c)}
                        title="Delete Permanently"
                        className="p-1.5 rounded-xl border border-rose-500/25 text-rose-500 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          filteredParties.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Suppliers</h3>
              <p className="text-xs text-muted-foreground">All vendor and supplier parties are active.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredParties.map((p) => (
                <div
                  key={p.party_id}
                  className="bg-card border border-border/80 hover:border-emerald-500/30 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{timeAgo(p.updated_at)}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1 text-xs text-muted-foreground">
                      <p>Type: <span className="font-semibold text-foreground">{p.party_type || 'SUPPLIER'}</span></p>
                      <p>Phone: <span className="font-mono text-foreground font-medium">{p.phone || 'N/A'}</span></p>
                      {p.balance !== undefined && (
                        <p>
                          Balance:{' '}
                          <span className={clsx('font-bold font-mono', p.balance > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                            ₹{formatAmount(Math.abs(p.balance))} {p.balance_type || ''}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
                    <button
                      onClick={() => restoreParty(p.party_id, p.name)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/25 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => askHardDeleteParty(p)}
                        title="Delete Permanently"
                        className="p-1.5 rounded-xl border border-rose-500/25 text-rose-500 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {/* ─── BILL INSPECTION DRAWER/MODAL ─── */}
      {inspectingInvoice && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden text-foreground">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground font-mono">
                    {inspectingInvoice.invoice_number}
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 font-bold uppercase">
                    Deleted
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {inspectingInvoice.customer_name || 'Walk-in customer'}
                  {inspectingInvoice.customer_phone ? ' · ' + inspectingInvoice.customer_phone : ''}
                </p>
              </div>
              <button
                onClick={() => setInspectingInvoice(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-3 rounded-xl border border-border/60">
                <div>
                  <span className="text-muted-foreground text-[11px]">Original Date:</span>
                  <p className="font-semibold text-foreground font-mono">{formatDate(inspectingInvoice.created_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Deleted At:</span>
                  <p className="font-semibold text-rose-400 font-mono">{formatDate(inspectingInvoice.deleted_at || inspectingInvoice.updated_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Payment Mode:</span>
                  <p className="font-semibold text-foreground uppercase">{inspectingInvoice.payment_method}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Grand Total:</span>
                  <p className="font-bold text-foreground text-sm font-mono">₹{formatAmount(inspectingInvoice.grand_total)}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Itemized Products</h4>
                {loadingItems ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
                    <Loader2 size={16} className="animate-spin text-primary" />
                    <span className="text-xs font-semibold">Loading bill items...</span>
                  </div>
                ) : inspectingItems.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground bg-muted/20 rounded-xl">
                    No individual item details cached. Grand total amount will be restored.
                  </div>
                ) : (
                  <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40">
                    {inspectingItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">{item.name || item.product_id}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Qty: {item.quantity} × ₹{formatAmount(item.unit_price || item.rate || 0)}
                          </p>
                        </div>
                        <span className="font-bold text-foreground font-mono ml-3">
                          ₹{formatAmount(item.total || (item.quantity * (item.unit_price || 0)))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/20">
              <button
                onClick={() => setInspectingInvoice(null)}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const inv = inspectingInvoice;
                  setInspectingInvoice(null);
                  restoreInvoice(inv.invoice_id, inv.invoice_number);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <RotateCcw size={13} />
                <span>Restore Bill to Sales History</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRM DIALOG ─── */}
      {confirm.visible && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-foreground">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{confirm.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{confirm.message}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setConfirm((p) => ({ ...p, visible: false }))}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirm.onConfirm();
                  setConfirm((p) => ({ ...p, visible: false }));
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer active:scale-[0.98]"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST NOTIFICATIONS ─── */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border transition-all animate-in slide-in-from-bottom-2',
              t.type === 'success'
                ? 'bg-card border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-card border-rose-500/30 text-rose-600 dark:text-rose-400'
            )}
          >
            {t.type === 'success' ? <RotateCcw size={14} /> : <AlertTriangle size={14} />}
            <span>{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                onClick={t.onAction}
                className="ml-2 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90 flex items-center gap-1 cursor-pointer"
              >
                <span>{t.actionLabel}</span>
                <ExternalLink size={10} />
              </button>
            )}
            <button onClick={() => dismissToast(t.id)} className="ml-1 opacity-60 hover:opacity-100 cursor-pointer">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}

