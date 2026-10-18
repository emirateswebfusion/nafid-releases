import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Globe,
  Store,
  Package,
  ShoppingCart,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Search,
  Filter,
  Upload,
  Check,
  X,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Building2,
  Mail,
  Phone,
  MapPin,
  Save,
  Link as LinkIcon,
  Layers,
  Edit2,
  Activity,
  ArrowUpRight,
  Zap,
  Tag,
  Eye,
  Sliders,
  CheckCheck,
  Copy,
  ShieldCheck,
  Server,
  Wifi,
  WifiOff,
  ChevronDown,
  CheckSquare,
  Square
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fusionCartService, type EcommerceSettings, type EcommerceProductItem, type EcommerceOrder } from '../services/fusionCartService';
import clsx from 'clsx';

interface EcommercePortalProps {
  onClose: () => void;
}

export function EcommercePortal({ onClose }: EcommercePortalProps) {
  const { tenantId, shopName, user } = useAuthStore();
  const currentTenantId = tenantId || 'global';

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'overview' | 'registration' | 'products' | 'orders' | 'settings'>('overview');
  const [settings, setSettings] = useState<EcommerceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; message?: string } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Products State
  const [products, setProducts] = useState<EcommerceProductItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'online' | 'offline' | 'failed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'instock' | 'outstock' | 'negative'>('all');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<EcommerceProductItem | null>(null);

  // Orders State
  const [orders, setOrders] = useState<EcommerceOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<EcommerceOrder | null>(null);

  // Registration Form State
  const [regForm, setRegForm] = useState({
    store_name: shopName || '',
    store_slug: (shopName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    store_description: 'Official online storefront synchronized in real-time with Nafid POS.',
    contact_name: user?.name || 'Store Manager',
    contact_email: user?.email || '',
    contact_phone: '',
    city: 'Dubai',
    address: '',
    pincode: '',
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState(false);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState({
    fusioncart_url: 'http://localhost:5050/api',
    store_name: '',
    store_slug: '',
    store_description: '',
    contact_email: '',
    contact_phone: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  // Keyboard shortcut listener (Esc to close, / for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingProduct && !selectedOrder) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, editingProduct, selectedOrder]);

  // Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const data = await fusionCartService.getSettings(currentTenantId);
      if (data) {
        setSettings(data);
        setSettingsForm({
          fusioncart_url: data.fusioncart_url || 'http://localhost:5050/api',
          store_name: data.store_name || shopName || '',
          store_slug: data.store_slug || '',
          store_description: data.store_description || '',
          contact_email: data.contact_email || user?.email || '',
          contact_phone: data.contact_phone || '',
        });
        setRegForm(prev => ({
          ...prev,
          store_name: data.store_name || prev.store_name,
          store_slug: data.store_slug || prev.store_slug,
          contact_email: data.contact_email || prev.contact_email,
          contact_phone: data.contact_phone || prev.contact_phone,
        }));
      }
    } catch (err) {
      console.error('[EcommercePortal] loadSettings failed', err);
    }
  }, [currentTenantId, shopName, user]);

  // Check Connection
  const checkConnection = useCallback(async (url?: string) => {
    setTestingConnection(true);
    const start = performance.now();
    try {
      const res = await fusionCartService.testConnection(url);
      setConnectionStatus(res);
      setPingLatency(Math.round(performance.now() - start));
    } finally {
      setTestingConnection(false);
    }
  }, []);

  // Refresh Remote Status from FusionCart
  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fusionCartService.refreshStatus(currentTenantId);
      if (res.settings) {
        setSettings(res.settings);
      }
      await checkConnection(res.settings?.fusioncart_url);
      if (activeTab === 'products') await loadProducts();
      if (activeTab === 'orders') await loadOrders();
    } catch (err) {
      console.error('[EcommercePortal] refreshStatus failed', err);
    } finally {
      setRefreshing(false);
    }
  }, [currentTenantId, activeTab, checkConnection]);

  // Load Products Catalog
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const items = await fusionCartService.getProducts(currentTenantId, productSearch, productFilter);
      setProducts(items);
    } catch (err) {
      console.error('[EcommercePortal] loadProducts failed', err);
    } finally {
      setProductsLoading(false);
    }
  }, [currentTenantId, productSearch, productFilter]);

  // Load Orders Stream
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const list = await fusionCartService.getOrders(currentTenantId);
      setOrders(list);
    } catch (err) {
      console.error('[EcommercePortal] loadOrders failed', err);
    } finally {
      setOrdersLoading(false);
    }
  }, [currentTenantId]);

  // Initial Load
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      await loadSettings();
      await checkConnection();
      await loadProducts();
      await loadOrders();
      if (mounted) setLoading(false);
    };
    init();
    return () => { mounted = false; };
  }, [loadSettings, checkConnection, loadProducts, loadOrders]);

  // Handle Tab Switch
  useEffect(() => {
    if (activeTab === 'products') loadProducts();
    if (activeTab === 'orders') loadOrders();
  }, [activeTab, loadProducts, loadOrders]);

  // Copy Tenant / Vendor ID
  const handleCopyId = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Vendor Registration Submit
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError(null);
    setRegSuccess(false);

    try {
      const res = await fusionCartService.registerVendor(currentTenantId, {
        store_name: regForm.store_name,
        store_slug: regForm.store_slug,
        store_description: regForm.store_description,
        contact_name: regForm.contact_name,
        contact_email: regForm.contact_email,
        contact_phone: regForm.contact_phone,
        city: regForm.city,
        address: regForm.address,
        pincode: regForm.pincode,
      });

      if (res.success && res.settings) {
        setSettings(res.settings);
        setRegSuccess(true);
        setActiveTab('overview');
      } else {
        setRegError(res.error || 'Registration failed. Verify API connection and try again.');
      }
    } catch (err: any) {
      setRegError(err.message || 'An unexpected error occurred during vendor registration.');
    } finally {
      setRegLoading(false);
    }
  };

  // Publish / Sync Single Product
  const handleSyncProduct = async (prod: EcommerceProductItem) => {
    setSyncingProductId(prod.product_id);
    try {
      const res = await fusionCartService.syncProduct(currentTenantId, prod.product_id);
      if (res.success) {
        await loadProducts();
      } else {
        alert(`Product sync failed: ${res.error}`);
      }
    } finally {
      setSyncingProductId(null);
    }
  };

  // Unpublish Single Product
  const handleUnpublishProduct = async (prod: EcommerceProductItem) => {
    setSyncingProductId(prod.product_id);
    try {
      const res = await fusionCartService.unpublishProduct(currentTenantId, prod.product_id);
      if (res.success) {
        await loadProducts();
      } else {
        alert(`Unpublish failed: ${res.error}`);
      }
    } finally {
      setSyncingProductId(null);
    }
  };

  // Bulk Publish Selected
  const handleBulkPublish = async () => {
    if (selectedProductIds.size === 0) return;
    setBulkProcessing(true);
    try {
      for (const id of Array.from(selectedProductIds)) {
        await fusionCartService.syncProduct(currentTenantId, id);
      }
      setSelectedProductIds(new Set());
      await loadProducts();
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk Unpublish Selected
  const handleBulkUnpublish = async () => {
    if (selectedProductIds.size === 0) return;
    setBulkProcessing(true);
    try {
      for (const id of Array.from(selectedProductIds)) {
        await fusionCartService.unpublishProduct(currentTenantId, id);
      }
      setSelectedProductIds(new Set());
      await loadProducts();
    } finally {
      setBulkProcessing(false);
    }
  };

  // Toggle Selection
  const toggleSelectAll = () => {
    if (selectedProductIds.size === filteredProductsList.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProductsList.map(p => p.product_id)));
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg(null);

    try {
      const updated = await fusionCartService.saveSettings(currentTenantId, {
        fusioncart_url: settingsForm.fusioncart_url,
        store_name: settingsForm.store_name,
        store_slug: settingsForm.store_slug,
        store_description: settingsForm.store_description,
        contact_email: settingsForm.contact_email,
        contact_phone: settingsForm.contact_phone,
      });

      if (updated) {
        setSettings(updated);
        setSettingsMsg({ type: 'success', text: 'Store settings saved successfully.' });
        await checkConnection(updated.fusioncart_url);
      } else {
        setSettingsMsg({ type: 'error', text: 'Failed to update store settings.' });
      }
    } catch (err: any) {
      setSettingsMsg({ type: 'error', text: err.message || 'Network error occurred.' });
    } finally {
      setSavingSettings(false);
    }
  };

  // Dynamic Categories from Products
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [products]);

  // Compute metrics
  const summary = useMemo(() => {
    const published = products.filter(p => p.is_online_enabled === 1).length;
    const pending = products.filter(p => p.sync_status === 'PENDING').length;
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total || o.amount) || 0), 0);
    const inStockCount = products.filter(p => p.current_stock > 0).length;
    return {
      published,
      pending,
      revenue: totalRevenue,
      inStockCount,
      totalCatalog: products.length,
      publishedPercent: products.length > 0 ? Math.round((published / products.length) * 100) : 0,
    };
  }, [products, orders]);

  const regStatus = settings?.registration_status || 'NOT_REQUESTED';
  const isVendorApproved = regStatus === 'ACTIVE' || regStatus === 'APPROVED';

  // Filtered Products
  const filteredProductsList = useMemo(() => {
    return products.filter(prod => {
      // Search
      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        const matchesName = prod.name.toLowerCase().includes(q);
        const matchesSku = prod.sku_barcode ? prod.sku_barcode.toLowerCase().includes(q) : false;
        const matchesCat = prod.category ? prod.category.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesSku && !matchesCat) return false;
      }
      // Status
      if (productFilter === 'online' && prod.is_online_enabled !== 1) return false;
      if (productFilter === 'offline' && prod.is_online_enabled === 1) return false;
      if (productFilter === 'failed' && prod.sync_status !== 'FAILED') return false;

      // Category
      if (categoryFilter !== 'all' && (prod.category || '').toLowerCase() !== categoryFilter.toLowerCase()) return false;

      // Stock
      if (stockFilter === 'instock' && prod.current_stock <= 0) return false;
      if (stockFilter === 'outstock' && prod.current_stock !== 0) return false;
      if (stockFilter === 'negative' && prod.current_stock >= 0) return false;

      return true;
    });
  }, [products, productSearch, productFilter, categoryFilter, stockFilter]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase().trim();
        const matchesNum = String(o.order_number || o.id).toLowerCase().includes(q);
        const matchesCust = o.billing_address?.title?.toLowerCase().includes(q);
        const matchesCity = o.shipping_address?.city?.toLowerCase().includes(q);
        if (!matchesNum && !matchesCust && !matchesCity) return false;
      }
      if (orderStatusFilter !== 'all') {
        const status = (o.payment_status || '').toLowerCase();
        if (status !== orderStatusFilter.toLowerCase()) return false;
      }
      return true;
    });
  }, [orders, orderSearch, orderStatusFilter]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background portal-ambient text-foreground select-none overflow-hidden font-sans">
      
      {/* ═══════════════════════════════════════════════════
          ENTERPRISE GLASS HEADER
      ═══════════════════════════════════════════════════ */}
      <header className="h-16 shrink-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur-md px-5 flex items-center justify-between shadow-2xs">
        
        {/* Brand & Store Context */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <Globe className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-1.5">
                <span>FusionCart Marketplace Hub</span>
              </h1>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <span>Store: <strong className="text-foreground">{shopName || 'Retail Hub'}</strong></span>
              <span className="text-muted-foreground/40">•</span>
              <span>Tenant: <span className="font-mono text-muted-foreground/80">{currentTenantId.slice(0, 8)}...{currentTenantId.slice(-4)}</span></span>
            </p>
          </div>
        </div>

        {/* Center Tab Navigation (Segmented Switcher) */}
        <div className="hidden lg:flex items-center gap-1 p-1 bg-muted/50 dark:bg-muted/20 border border-border/80 rounded-2xl shadow-inner">
          {[
            { id: 'overview' as const, label: 'Overview', icon: TrendingUp },
            { id: 'products' as const, label: 'Online Catalog', icon: Package, count: products.length },
            { id: 'orders' as const, label: 'Orders Stream', icon: ShoppingCart, count: orders.length },
            { id: 'registration' as const, label: 'Vendor Status', icon: Store, hasBadge: true },
            { id: 'settings' as const, label: 'Configuration', icon: Settings },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-2 py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer select-none",
                  isActive
                    ? "bg-card text-foreground shadow-xs border border-border/70 font-extrabold"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                )}
              >
                <Icon className={clsx("h-3.5 w-3.5", isActive ? "text-primary" : "text-muted-foreground/70")} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={clsx(
                    "text-[10px] font-mono px-1.5 py-0.2 rounded-md font-bold",
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/70"
                  )}>
                    {tab.count}
                  </span>
                )}
                {tab.hasBadge && (
                  <span className={clsx(
                    "w-2 h-2 rounded-full shrink-0",
                    isVendorApproved ? "bg-emerald-500 animate-pulse" : regStatus === 'PENDING' ? "bg-amber-500" : "bg-slate-400"
                  )} />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Tools & Actions */}
        <div className="flex items-center gap-2.5">
          {/* FusionCart API Status Indicator */}
          <div className={clsx(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors shadow-2xs",
            connectionStatus?.connected
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400"
          )}>
            <span className={clsx(
              "w-2 h-2 rounded-full",
              connectionStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
            )} />
            <span className="hidden sm:inline">
              {connectionStatus?.connected ? (pingLatency ? `${pingLatency}ms • Live` : 'Connected') : 'Gateway Offline'}
            </span>
          </div>

          {/* Sync Button */}
          <button
            onClick={refreshStatus}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-2xs"
            title="Refresh remote synchronization status"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", refreshing && "animate-spin text-primary")} />
            <span className="hidden md:inline">Sync Hub</span>
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/80 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer shadow-2xs"
            title="Close E-Commerce Portal (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex items-center gap-1 p-2 bg-card border-b border-border/80 overflow-x-auto scrollbar-none">
        {[
          { id: 'overview' as const, label: 'Overview', icon: TrendingUp },
          { id: 'products' as const, label: 'Products', icon: Package },
          { id: 'orders' as const, label: 'Orders', icon: ShoppingCart },
          { id: 'registration' as const, label: 'Registration', icon: Store },
          { id: 'settings' as const, label: 'Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap",
              activeTab === tab.id ? "bg-primary text-primary-foreground font-bold shadow-xs" : "bg-muted text-muted-foreground"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          MAIN VIEWPORT (DYNAMIC FLUID WIDTH)
      ═══════════════════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto p-3.5 sm:p-5">
        {loading ? (
          <div className="flex h-full min-h-[360px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-card border border-border/80 shadow-sm animate-pulse">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
              <p className="text-xs font-bold text-muted-foreground tracking-wide uppercase">Connecting to FusionCart Multi-Vendor Hub...</p>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-3.5 pb-6">
            
            {/* ═══════════════════════════════════════════════════
                TAB 1: EXECUTIVE OVERVIEW
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                
                {/* 4-Card Bento KPI Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  
                  {/* Card 1: Published Online */}
                  <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-emerald-500/40 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Published Online</span>
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Package className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono">
                      {summary.published}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
                      <span>Active on Storefront</span>
                      <span className="font-bold font-mono text-emerald-500">{summary.publishedPercent}% of catalog</span>
                    </div>
                  </div>

                  {/* Card 2: Sync Queue */}
                  <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-amber-500/40 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Sync Pending</span>
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono">
                      {summary.pending}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
                      <span>Queued updates</span>
                      <span className={clsx("font-bold font-mono", summary.pending > 0 ? "text-amber-500" : "text-emerald-500")}>
                        {summary.pending > 0 ? 'Push needed' : 'Up to date'}
                      </span>
                    </div>
                  </div>

                  {/* Card 3: Online Orders */}
                  <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-blue-500/40 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Marketplace Orders</span>
                      <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        <ShoppingCart className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono">
                      {orders.length}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
                      <span>Total fulfilled orders</span>
                      <span className="font-bold font-mono text-blue-500">Store #{settings?.store_id || '0'}</span>
                    </div>
                  </div>

                  {/* Card 4: Gross Revenue */}
                  <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs card-sheen relative group hover:border-primary/40 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Online Revenue</span>
                      <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                        <DollarSign className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight font-mono flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-muted-foreground">INR</span>
                      <span>{summary.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium mt-1.5 pt-1.5 border-t border-border/40">
                      <span>Gross customer sales</span>
                      <span className="font-bold text-foreground">Direct Payouts</span>
                    </div>
                  </div>
                </div>

                {/* Unified Hero Status Banner (Consolidated Alert & Health) */}
                <div className="rounded-xl border border-border/80 bg-card p-3.5 sm:p-4 shadow-xs overflow-hidden">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    
                    {/* Left: Health Indicator & Gateway */}
                    <div className="flex items-start gap-3">
                      <div className={clsx(
                        "p-2.5 rounded-xl shrink-0 border",
                        connectionStatus?.connected
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                      )}>
                        {connectionStatus?.connected ? <Wifi className="h-4.5 w-4.5" /> : <WifiOff className="h-4.5 w-4.5" />}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs sm:text-sm font-bold text-foreground">
                            {connectionStatus?.connected
                              ? 'FusionCart Marketplace Gateway Active'
                              : 'FusionCart Gateway Unreachable'}
                          </h3>
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                            connectionStatus?.connected
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                          )}>
                            {connectionStatus?.connected ? 'Live Syncing' : 'Connection Error'}
                          </span>
                        </div>

                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {connectionStatus?.connected
                            ? `Connected to ${settings?.fusioncart_url || 'http://localhost:5050/api'} • Bidirectional delta syncing between POS local database and remote storefront.`
                            : `Cannot reach ${settings?.fusioncart_url || 'http://localhost:5050/api'}. Ensure the FusionCart server instance is running or update your API endpoint in Settings.`}
                        </p>
                      </div>
                    </div>

                    {/* Right: Quick Operational CTAs */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                      {!connectionStatus?.connected ? (
                        <>
                          <button
                            onClick={() => checkConnection(settings?.fusioncart_url)}
                            disabled={testingConnection}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border/80 text-xs font-bold hover:bg-muted transition-all cursor-pointer shadow-2xs"
                          >
                            <RefreshCw className={clsx("h-3.5 w-3.5", testingConnection && "animate-spin text-primary")} />
                            <span>Retry Ping</span>
                          </button>
                          <button
                            onClick={() => setActiveTab('settings')}
                            className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs"
                          >
                            Configure Gateway
                          </button>
                        </>
                      ) : !isVendorApproved ? (
                        <button
                          onClick={() => setActiveTab('registration')}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs"
                        >
                          <Store className="h-3.5 w-3.5" />
                          <span>Complete Store Onboarding &rarr;</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setActiveTab('products')}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>Publish More SKUs &rarr;</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Onboarding Stepper Strip (When not yet registered) */}
                  {!isVendorApproved && (
                    <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className={clsx(
                        "p-2.5 rounded-xl border flex items-center gap-2.5",
                        connectionStatus?.connected ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted/40 border-border/70 text-muted-foreground"
                      )}>
                        <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center font-bold text-[11px]">1</div>
                        <div className="text-xs">
                          <div className="font-bold">Gateway Connection</div>
                          <div className="text-[10px] opacity-80">{connectionStatus?.connected ? 'Online & Healthy' : 'Offline'}</div>
                        </div>
                      </div>

                      <div className={clsx(
                        "p-2.5 rounded-xl border flex items-center gap-2.5",
                        regStatus === 'PENDING' ? "bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-primary/5 border-primary/20 text-primary"
                      )}>
                        <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center font-bold text-[11px]">2</div>
                        <div className="text-xs">
                          <div className="font-bold">Store Registration</div>
                          <div className="text-[10px] opacity-80">{regStatus === 'PENDING' ? 'Under Review' : 'Needs Submission'}</div>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl border bg-muted/30 border-border/60 text-muted-foreground flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center font-bold text-[11px]">3</div>
                        <div className="text-xs">
                          <div className="font-bold">Publish Catalog</div>
                          <div className="text-[10px] opacity-80">{summary.published} items ready</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Operations & Identity Bento (2 Columns) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  
                  {/* Card A: Vendor Marketplace Identity (6-Tile Grid) */}
                  <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                        <Store className="h-4 w-4 text-primary" />
                        <span>Vendor Marketplace Identity</span>
                      </h3>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Store Settings</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Compact 6-Tile Grid: Fits width proportionally without empty gaps */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Store Name</span>
                        <span className="font-bold text-foreground text-xs mt-0.5 block truncate">{settings?.store_name || shopName || 'Retail Hub'}</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Storefront Slug</span>
                        <span className="font-mono font-bold text-primary text-xs mt-0.5 block truncate">/{settings?.store_slug || 'not-assigned'}</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Vendor ID</span>
                        <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                          {settings?.vendor_id ? `#${settings.vendor_id}` : '#Pending'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Last Sync</span>
                        <span className="font-mono text-foreground text-xs mt-0.5 block truncate">
                          {settings?.last_sync_at ? new Date(settings.last_sync_at).toLocaleTimeString() : 'Never'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Sync Health</span>
                        <span className={clsx(
                          "font-bold text-xs mt-0.5 block uppercase",
                          settings?.last_sync_status === 'SUCCESS' ? "text-emerald-500" : "text-amber-500"
                        )}>
                          {settings?.last_sync_status || 'IDLE'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Tenant Key</span>
                        <button
                          onClick={() => handleCopyId(currentTenantId)}
                          className="text-[11px] font-mono text-muted-foreground hover:text-foreground flex items-center justify-between w-full mt-0.5 cursor-pointer"
                          title="Click to copy full tenant ID"
                        >
                          <span className="truncate">{currentTenantId.slice(0, 8)}...</span>
                          <Copy className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                          {copiedId && <span className="text-[9px] text-emerald-500 font-bold ml-1">Copied</span>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card B: Quick Actions & Inventory Health */}
                  <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <span>Quick Actions &amp; Catalog Health</span>
                      </h3>
                      <span className="text-xs font-mono font-bold text-muted-foreground">{summary.totalCatalog} Total SKUs</span>
                    </div>

                    <div className="space-y-2.5">
                      {/* Catalog Progress Bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground font-medium text-[11px]">Marketplace Publishing Rate</span>
                          <span className="font-bold text-foreground font-mono text-xs">{summary.published} / {summary.totalCatalog} SKUs ({summary.publishedPercent}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                            style={{ width: `${summary.publishedPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Action Buttons in Compact 2x2 Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => setActiveTab('products')}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
                        >
                          <Package className="h-4 w-4 text-primary shrink-0 group-hover:scale-105 transition-transform" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-foreground block truncate">Manage Catalog</span>
                            <span className="text-[10px] text-muted-foreground block truncate">Publish &amp; override</span>
                          </div>
                        </button>

                        <button
                          onClick={() => setActiveTab('orders')}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
                        >
                          <ShoppingCart className="h-4 w-4 text-blue-500 shrink-0 group-hover:scale-105 transition-transform" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-foreground block truncate">View Orders</span>
                            <span className="text-[10px] text-muted-foreground block truncate">{orders.length} incoming</span>
                          </div>
                        </button>

                        <button
                          onClick={refreshStatus}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
                        >
                          <RefreshCw className="h-4 w-4 text-emerald-500 shrink-0 group-hover:scale-105 transition-transform" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-foreground block truncate">Delta Sync</span>
                            <span className="text-[10px] text-muted-foreground block truncate">Push stock live</span>
                          </div>
                        </button>

                        <button
                          onClick={() => setActiveTab('settings')}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/80 bg-background/50 hover:bg-muted text-left transition-all cursor-pointer group shadow-2xs"
                        >
                          <Server className="h-4 w-4 text-indigo-500 shrink-0 group-hover:scale-105 transition-transform" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-foreground block truncate">API Settings</span>
                            <span className="text-[10px] text-muted-foreground block truncate">Gateway config</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 2: VENDOR REGISTRATION (SPLIT-VIEW)
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'registration' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 animate-in fade-in duration-200">
                
                {/* Left Column (7 cols): The Registration Form */}
                <div className="lg:col-span-7 rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Store className="h-4.5 w-4.5 text-primary" />
                      <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight">FusionCart Vendor Registration</h2>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Register this local POS store onto the connected FusionCart marketplace cluster to unlock public storefront selling.
                    </p>
                  </div>

                  {regSuccess && (
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Registration submitted successfully! Application status: <strong>{settings?.registration_status}</strong></span>
                    </div>
                  )}

                  {regError && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{regError}</span>
                    </div>
                  )}

                  <form onSubmit={handleRegister} className="space-y-5">
                    
                    {/* Section 1: Storefront Identity */}
                    <div className="space-y-3">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/40">
                        1. Storefront Identity
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold block mb-1 text-foreground">Store / Business Name *</label>
                          <input
                            type="text"
                            required
                            value={regForm.store_name}
                            onChange={e => setRegForm({
                              ...regForm,
                              store_name: e.target.value,
                              store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                            })}
                            className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs"
                            placeholder="e.g. Suhaib Trading LLC"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold block mb-1 text-foreground">Online Store Slug (URL path) *</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">/store/</span>
                            <input
                              type="text"
                              required
                              value={regForm.store_slug}
                              onChange={e => setRegForm({ ...regForm, store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })}
                              className="w-full pl-16 pr-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-mono font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs"
                              placeholder="suhaib-store"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold block mb-1 text-foreground">Storefront Tagline / Bio</label>
                        <textarea
                          rows={2}
                          value={regForm.store_description}
                          onChange={e => setRegForm({ ...regForm, store_description: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs"
                          placeholder="Brief description visible to marketplace shoppers..."
                        />
                      </div>
                    </div>

                    {/* Section 2: Contact & Location */}
                    <div className="space-y-3 pt-2">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/40">
                        2. Contact &amp; Regional Logistics
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label className="text-xs font-semibold block mb-1 text-foreground">Contact Person</label>
                          <input
                            type="text"
                            value={regForm.contact_name}
                            onChange={e => setRegForm({ ...regForm, contact_name: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold block mb-1 text-foreground">Contact Email *</label>
                          <input
                            type="email"
                            required
                            value={regForm.contact_email}
                            onChange={e => setRegForm({ ...regForm, contact_email: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold block mb-1 text-foreground">Contact Phone</label>
                          <input
                            type="text"
                            value={regForm.contact_phone}
                            onChange={e => setRegForm({ ...regForm, contact_phone: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                            placeholder="+971 50 ..."
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div>
                          <label className="text-xs font-semibold block mb-1 text-foreground">City</label>
                          <input
                            type="text"
                            value={regForm.city}
                            onChange={e => setRegForm({ ...regForm, city: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-xs font-semibold block mb-1 text-foreground">Store Address</label>
                          <input
                            type="text"
                            value={regForm.address}
                            onChange={e => setRegForm({ ...regForm, address: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                            placeholder="Building, Street, Area..."
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Submission & Tenant Verification */}
                    <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/70">
                      <div className="text-[11px] text-muted-foreground">
                        Tenant verification: <span className="font-mono font-bold text-foreground">{currentTenantId.slice(0, 16)}...</span>
                      </div>

                      <button
                        type="submit"
                        disabled={regLoading}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {regLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                        <span>Submit Registration Application</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Right Column (5 cols): Live Storefront Mockup Preview */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-3 card-sheen">
                    <div className="flex items-center justify-between pb-3 border-b border-border/60">
                      <div className="flex items-center gap-1.5">
                        <Eye className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live Marketplace Preview</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Interactive
                      </span>
                    </div>

                    {/* Store Card Visual Preview */}
                    <div className="rounded-2xl border border-border/80 bg-background/80 overflow-hidden shadow-sm">
                      {/* Store Banner */}
                      <div className="h-24 bg-gradient-to-r from-emerald-600 via-teal-600 to-primary flex items-end p-4 relative">
                        <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-xs text-[10px] text-white px-2 py-0.5 rounded-full font-mono">
                          FusionCart Web
                        </div>
                      </div>

                      {/* Store Profile Info */}
                      <div className="p-4 pt-0 relative">
                        <div className="-mt-7 mb-3 flex items-end justify-between">
                          <div className="h-14 w-14 rounded-2xl bg-card border-2 border-background shadow-md flex items-center justify-center font-bold text-lg text-primary">
                            {(regForm.store_name || shopName || 'ST').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            <span>Verified Merchant</span>
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-foreground">
                          {regForm.store_name || shopName || 'Store Display Name'}
                        </h4>
                        
                        <p className="text-xs text-primary font-mono mt-0.5">
                          fusioncart.io/store/{regForm.store_slug || 'your-slug'}
                        </p>

                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {regForm.store_description || 'No storefront bio provided yet.'}
                        </p>

                        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{regForm.city || 'Dubai, UAE'}</span>
                          </span>
                          <span className="font-mono font-bold text-foreground">
                            {summary.published} Live SKUs
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      💡 This card visualizes how your store identity, slug, and location will appear to consumers shopping across the FusionCart marketplace network.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 3: ONLINE PRODUCTS CATALOG
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'products' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                
                {/* Search, Filter & Bulk Actions Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
                  
                  {/* Left: Search input */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                      <input
                        type="text"
                        placeholder="Search product name, barcode, SKU or category..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs font-medium"
                      />
                      {productSearch && (
                        <button
                          onClick={() => setProductSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Center: Dropdown Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    
                    {/* Category Selector */}
                    {categoriesList.length > 0 && (
                      <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
                      >
                        <option value="all">All Categories ({products.length})</option>
                        {categoriesList.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}

                    {/* Stock Filter */}
                    <select
                      value={stockFilter}
                      onChange={e => setStockFilter(e.target.value as any)}
                      className="px-3 py-2 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
                    >
                      <option value="all">All Stock Status</option>
                      <option value="instock">In Stock (&gt; 0)</option>
                      <option value="outstock">Out of Stock (0)</option>
                      <option value="negative">Negative Stock (&lt; 0)</option>
                    </select>

                    {/* Status Pill Switcher */}
                    <div className="flex items-center gap-1 p-1 bg-muted/60 dark:bg-muted/20 border border-border/70 rounded-xl shadow-2xs">
                      {[
                        { key: 'all' as const, label: 'All' },
                        { key: 'online' as const, label: 'Published' },
                        { key: 'offline' as const, label: 'Draft' },
                      ].map(f => (
                        <button
                          key={f.key}
                          onClick={() => setProductFilter(f.key)}
                          className={clsx(
                            "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            productFilter === f.key
                              ? "bg-card text-foreground shadow-xs border border-border/80"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bulk Actions Banner (When items are selected) */}
                {selectedProductIds.size > 0 && (
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-xs animate-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <CheckSquare className="h-4 w-4 text-primary" />
                      <span>{selectedProductIds.size} products selected</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBulkPublish}
                        disabled={bulkProcessing || !isVendorApproved}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        {bulkProcessing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        <span>Publish Selected</span>
                      </button>

                      <button
                        onClick={handleBulkUnpublish}
                        disabled={bulkProcessing || !isVendorApproved}
                        className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        Unpublish Selected
                      </button>

                      <button
                        onClick={() => setSelectedProductIds(new Set())}
                        className="px-2 py-1 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* Products Data Table */}
                <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs tabular-nums">
                      <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-bold sticky top-0 backdrop-blur-xs select-none">
                        <tr>
                          <th className="w-10 px-3 py-2 text-center">
                            <button
                              onClick={toggleSelectAll}
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Select / Deselect All"
                            >
                              {selectedProductIds.size > 0 && selectedProductIds.size === filteredProductsList.length ? (
                                <CheckSquare className="h-4 w-4 text-primary" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          </th>
                          <th className="px-3 py-2">Product Name &amp; Barcode</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2 text-right">POS Price</th>
                          <th className="px-3 py-2 text-right">Marketplace Price</th>
                          <th className="px-3 py-2 text-center">Stock Level</th>
                          <th className="px-3 py-2 text-center">Storefront</th>
                          <th className="px-3 py-2 text-center">Sync State</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {productsLoading ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                              <span className="font-semibold text-xs">Loading catalog items from local database...</span>
                            </td>
                          </tr>
                        ) : filteredProductsList.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                              <p className="font-bold text-sm text-foreground">No matching products found</p>
                              <p className="text-xs text-muted-foreground mt-1">Try resetting the search keyword or changing status filters.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredProductsList.map(prod => {
                            const isOnline = prod.is_online_enabled === 1;
                            const isSyncing = syncingProductId === prod.product_id;
                            const isSelected = selectedProductIds.has(prod.product_id);

                            return (
                              <tr
                                key={prod.product_id}
                                className={clsx(
                                  "transition-colors",
                                  isSelected ? "bg-primary/[0.04]" : "hover:bg-muted/30"
                                )}
                              >
                                {/* Checkbox */}
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => toggleSelectProduct(prod.product_id)}
                                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="h-4 w-4 text-primary" />
                                    ) : (
                                      <Square className="h-4 w-4" />
                                    )}
                                  </button>
                                </td>

                                {/* Product Name & Barcode */}
                                <td className="px-3 py-2">
                                  <div className="font-bold text-foreground text-xs leading-snug">{prod.name}</div>
                                  <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <Tag className="h-3 w-3 text-muted-foreground/60" />
                                    <span>{prod.sku_barcode || 'No Barcode'}</span>
                                  </div>
                                </td>

                                {/* Category */}
                                <td className="px-3 py-2 text-muted-foreground">
                                  <span className="px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-bold border border-border/60">
                                    {prod.category || 'General'}
                                  </span>
                                </td>

                                {/* POS Counter Price */}
                                <td className="px-3 py-2 text-right font-mono font-medium text-foreground">
                                  INR {Number(prod.base_price).toFixed(2)}
                                </td>

                                {/* Online Price Override */}
                                <td className="px-3 py-2 text-right font-mono">
                                  {prod.online_price_override !== null && prod.online_price_override !== undefined ? (
                                    <div className="font-bold text-emerald-600 dark:text-emerald-400">
                                      INR {Number(prod.online_price_override).toFixed(2)}
                                      <span className="block text-[9px] font-sans text-muted-foreground font-normal">Custom Override</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground/60 text-[11px]">
                                      INR {Number(prod.base_price).toFixed(2)} <span className="text-[10px] italic">(POS)</span>
                                    </span>
                                  )}
                                </td>

                                {/* Stock Level */}
                                <td className="px-3 py-2 text-center">
                                  <span className={clsx(
                                    "inline-block px-2 py-0.5 rounded-md font-mono text-[11px] font-bold",
                                    prod.current_stock > 0
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      : prod.current_stock < 0
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                      : "bg-muted text-muted-foreground"
                                  )}>
                                    {prod.current_stock} {prod.uom || 'Pcs'}
                                  </span>
                                </td>

                                {/* Storefront State */}
                                <td className="px-3 py-2 text-center">
                                  <span className={clsx(
                                    "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                    isOnline
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                      : "bg-muted text-muted-foreground border-border/60"
                                  )}>
                                    {isOnline ? 'Online' : 'Draft'}
                                  </span>
                                </td>

                                {/* Sync Status */}
                                <td className="px-3 py-2 text-center">
                                  <span className={clsx(
                                    "inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                                    prod.sync_status === 'SYNCED'
                                      ? "bg-emerald-500/10 text-emerald-600"
                                      : prod.sync_status === 'FAILED'
                                      ? "bg-rose-500/10 text-rose-600"
                                      : "bg-amber-500/10 text-amber-600"
                                  )}>
                                    {prod.sync_status}
                                  </span>
                                </td>

                                {/* Action */}
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => setEditingProduct(prod)}
                                      className="p-1.5 rounded-xl border border-border/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
                                      title="Edit marketplace price & description"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>

                                    {isOnline ? (
                                      <button
                                        onClick={() => handleUnpublishProduct(prod)}
                                        disabled={isSyncing || !isVendorApproved}
                                        className="px-2.5 py-1 rounded-xl border border-border/80 hover:border-rose-500/40 text-muted-foreground hover:text-rose-600 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-40"
                                        title="Remove from online store"
                                      >
                                        Unpublish
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleSyncProduct(prod)}
                                        disabled={isSyncing || !isVendorApproved}
                                        className="flex items-center gap-1 px-3 py-1 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[11px] font-bold transition-all cursor-pointer disabled:opacity-40 shadow-2xs"
                                        title="Publish SKU to FusionCart storefront"
                                      >
                                        {isSyncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                        <span>Publish</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Table Footer Summary */}
                  <div className="px-4 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Showing <strong>{filteredProductsList.length}</strong> of <strong>{products.length}</strong> items</span>
                    <span>Hold Shift to select ranges</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 4: ONLINE ORDERS STREAM
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'orders' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">FusionCart Real-Time Orders Stream</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Online customer orders dispatched to Store #{settings?.store_id || '0'} for fulfillment.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                      <input
                        type="text"
                        value={orderSearch}
                        onChange={e => setOrderSearch(e.target.value)}
                        placeholder="Search order #, customer..."
                        className="bg-background border border-border/80 rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>

                    <select
                      value={orderStatusFilter}
                      onChange={e => setOrderStatusFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
                    >
                      <option value="all">All Payments</option>
                      <option value="completed">Paid / Completed</option>
                      <option value="pending">Payment Pending</option>
                    </select>

                    <button
                      onClick={loadOrders}
                      disabled={ordersLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/80 bg-card text-xs font-bold hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <RefreshCw className={clsx("h-3.5 w-3.5", ordersLoading && "animate-spin text-primary")} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs tabular-nums">
                      <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-bold sticky top-0 backdrop-blur-xs select-none">
                        <tr>
                          <th className="px-3 py-2">Order #</th>
                          <th className="px-3 py-2">Order Date</th>
                          <th className="px-3 py-2">Customer Destination</th>
                          <th className="px-3 py-2 text-center">Items</th>
                          <th className="px-3 py-2 text-right">Total (INR)</th>
                          <th className="px-3 py-2 text-center">Payment Status</th>
                          <th className="px-3 py-2 text-center">Fulfillment</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {ordersLoading ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                              <span className="font-semibold text-xs">Streaming orders from FusionCart engine...</span>
                            </td>
                          </tr>
                        ) : filteredOrders.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                              <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                              <p className="font-bold text-sm text-foreground">No online orders recorded yet</p>
                              <p className="text-xs text-muted-foreground mt-1">When marketplace shoppers place orders, they will stream directly into this POS table in real-time.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredOrders.map(order => (
                            <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2 font-mono font-bold text-primary">
                                #{order.order_number || order.id}
                              </td>

                              <td className="px-3 py-2 text-muted-foreground font-medium">
                                {order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent'}
                              </td>

                              <td className="px-3 py-2">
                                <div className="font-bold text-foreground">
                                  {order.billing_address?.title || 'Online Customer'}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {order.shipping_address?.city || order.billing_address?.city || 'United Arab Emirates'}
                                </div>
                              </td>

                              <td className="px-3 py-2 text-center font-mono">
                                <span className="px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-bold">
                                  {order.products?.length || 0} items
                                </span>
                              </td>

                              <td className="px-3 py-2 text-right font-mono font-black text-foreground">
                                INR {Number(order.total || order.amount).toFixed(2)}
                              </td>

                              <td className="px-3 py-2 text-center">
                                <span className={clsx(
                                  "inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                                  order.payment_status === 'COMPLETED' || order.payment_status === 'PAID'
                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                )}>
                                  {order.payment_status || 'PENDING'}
                                </span>
                              </td>

                              <td className="px-3 py-2 text-center">
                                <span className="inline-block px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[10px] font-bold uppercase border border-border/50">
                                  {order.order_status?.name || 'Processing'}
                                </span>
                              </td>

                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => setSelectedOrder(order)}
                                  className="px-3 py-1 rounded-xl border border-border/80 hover:bg-muted text-[11px] font-bold text-foreground transition-all cursor-pointer shadow-2xs"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 5: STORE & GATEWAY CONFIGURATION
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 animate-in fade-in duration-200">
                <div className="lg:col-span-8 rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground tracking-tight">FusionCart Marketplace Configuration</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure the remote API endpoint, merchant connection URL, and public store profile parameters.
                    </p>
                  </div>

                  {settingsMsg && (
                    <div className={clsx(
                      "rounded-xl p-3.5 text-xs flex items-center gap-2.5 border",
                      settingsMsg.type === 'success'
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300"
                    )}>
                      {settingsMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                      <span>{settingsMsg.text}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveSettings} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold block mb-1 text-foreground">FusionCart API Gateway URL *</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={settingsForm.fusioncart_url}
                          onChange={e => setSettingsForm({ ...settingsForm, fusioncart_url: e.target.value })}
                          className="flex-1 px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-mono font-medium text-foreground focus:outline-none focus:border-primary shadow-2xs"
                        />
                        <button
                          type="button"
                          disabled={testingConnection}
                          onClick={() => checkConnection(settingsForm.fusioncart_url)}
                          className="px-4 py-2 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                        >
                          {testingConnection ? 'Pinging...' : 'Test Connection'}
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">Default local instance: <code>http://localhost:5050/api</code></p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold block mb-1 text-foreground">Public Store Name</label>
                        <input
                          type="text"
                          value={settingsForm.store_name}
                          onChange={e => setSettingsForm({ ...settingsForm, store_name: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold block mb-1 text-foreground">Store Slug URL</label>
                        <input
                          type="text"
                          value={settingsForm.store_slug}
                          onChange={e => setSettingsForm({ ...settingsForm, store_slug: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-mono text-foreground focus:outline-none focus:border-primary shadow-2xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold block mb-1 text-foreground">Store Description</label>
                      <textarea
                        rows={3}
                        value={settingsForm.store_description}
                        onChange={e => setSettingsForm({ ...settingsForm, store_description: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold block mb-1 text-foreground">Support Email</label>
                        <input
                          type="email"
                          value={settingsForm.contact_email}
                          onChange={e => setSettingsForm({ ...settingsForm, contact_email: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold block mb-1 text-foreground">Support Phone</label>
                        <input
                          type="text"
                          value={settingsForm.contact_phone}
                          onChange={e => setSettingsForm({ ...settingsForm, contact_phone: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {savingSettings ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        <span>Save Marketplace Settings</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Right Info Card */}
                <div className="lg:col-span-4 space-y-3">
                  <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Server className="h-4 w-4 text-primary" />
                      <span>Sync Engine Architecture</span>
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      FusionCart syncs stock and price updates automatically via background delta workers. POS retail operations continue uninterrupted even during internet outages.
                    </p>
                    <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground space-y-2">
                      <div className="flex justify-between">
                        <span>Local POS Database:</span>
                        <strong className="text-foreground">SQLite / LocalDB</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Remote Cluster:</span>
                        <strong className="text-foreground">Postgres Multi-Tenant</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Offline Queue:</span>
                        <strong className="text-emerald-500 font-bold">Enabled</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ═══════════════════════════════════════════════════
          MODAL: EDIT PRODUCT OVERRIDES
      ═══════════════════════════════════════════════════ */}
      {editingProduct && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Marketplace Product Overrides</h3>
                <span className="text-xs text-muted-foreground font-mono">{editingProduct.name}</span>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1 text-foreground">Online Title Override (Optional)</label>
                <input
                  type="text"
                  placeholder={editingProduct.name}
                  defaultValue={editingProduct.online_title_override || ''}
                  id="modal-online-title"
                  className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1 text-foreground">Online Price Override (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`POS Counter Price: INR ${Number(editingProduct.base_price).toFixed(2)}`}
                  defaultValue={editingProduct.online_price_override !== null && editingProduct.online_price_override !== undefined ? editingProduct.online_price_override : ''}
                  id="modal-online-price"
                  className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background font-mono text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Leave blank to inherit POS billing price (INR {Number(editingProduct.base_price).toFixed(2)}).
                </p>
              </div>

              <div>
                <label className="font-semibold block mb-1 text-foreground">Online Description</label>
                <textarea
                  rows={3}
                  placeholder="Custom online description for web portal..."
                  defaultValue={editingProduct.online_description_override || ''}
                  id="modal-online-desc"
                  className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="modal-online-enable"
                  defaultChecked={editingProduct.is_online_enabled === 1}
                  className="rounded border-border text-primary cursor-pointer w-4 h-4"
                />
                <label htmlFor="modal-online-enable" className="font-semibold text-foreground cursor-pointer text-xs">
                  Publish this product onto the FusionCart online marketplace
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-xl border border-border/80 text-xs font-semibold hover:bg-muted text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const titleInput = document.getElementById('modal-online-title') as HTMLInputElement;
                  const priceInput = document.getElementById('modal-online-price') as HTMLInputElement;
                  const descInput = document.getElementById('modal-online-desc') as HTMLTextAreaElement;
                  const enableCheck = document.getElementById('modal-online-enable') as HTMLInputElement;

                  const titleVal = titleInput?.value?.trim() || null;
                  const priceVal = priceInput?.value ? Number(priceInput.value) : null;
                  const descVal = descInput?.value?.trim() || null;
                  const enabledVal = enableCheck?.checked || false;

                  await fusionCartService.updateMapping(currentTenantId, editingProduct.product_id, {
                    is_online_enabled: enabledVal,
                    online_title_override: titleVal,
                    online_price_override: priceVal,
                    online_description_override: descVal,
                  });

                  setEditingProduct(null);
                  await loadProducts();
                }}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 cursor-pointer shadow-xs"
              >
                Save Overrides
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          MODAL: ORDER DETAILS
      ═══════════════════════════════════════════════════ */}
      {selectedOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Order #{selectedOrder.order_number || selectedOrder.id}</h3>
                <span className="text-xs text-muted-foreground font-mono">
                  {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : 'Recent'}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Customer and shipping details */}
              <div className="rounded-xl bg-muted/40 p-3.5 space-y-1.5 border border-border/60">
                <div className="font-bold text-foreground flex items-center justify-between">
                  <span>{selectedOrder.billing_address?.title || 'Customer Name'}</span>
                  <span className="text-[11px] font-mono text-primary font-bold">
                    {selectedOrder.payment_method || 'ONLINE'}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {selectedOrder.shipping_address?.address || selectedOrder.billing_address?.address || 'Delivery Address'}
                </div>
                <div className="text-muted-foreground font-mono">
                  {selectedOrder.shipping_address?.city || selectedOrder.billing_address?.city || 'Dubai'} • {selectedOrder.shipping_address?.phone || selectedOrder.billing_address?.phone || 'No Phone'}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Ordered Products
                </span>
                <div className="max-h-48 overflow-y-auto divide-y divide-border/50 border border-border/60 rounded-xl bg-background">
                  {(selectedOrder.products || []).map((p, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-foreground">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Qty: {p.pivot?.quantity || 1} × INR {Number(p.pivot?.single_price || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-foreground">
                        INR {Number(p.pivot?.subtotal || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Financials */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="font-bold text-foreground text-sm">Total Paid</span>
                <span className="font-mono font-black text-foreground text-base">
                  INR {Number(selectedOrder.total || selectedOrder.amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-border/60">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 cursor-pointer shadow-xs"
              >
                Close Order View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
