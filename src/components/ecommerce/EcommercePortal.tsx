import { FloatToast } from '../ui/FloatToast';
import { storeDateTime } from '../../utils/time/dateDisplay';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Store, Package, ShoppingCart, Settings, RefreshCw, X, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { fusionCartService, type EcommerceProductItem } from '../../services/fusionCartService';
import clsx from 'clsx';
import { formatCurrency } from '../../utils/pricing/money';
import { useEcommerceState } from './hooks/useEcommerceState';
import { EditCatalogProductDialog } from './views/EditCatalogProductDialog';
import { EcomSettingsTab } from './views/EcomSettingsTab';
import { EcomOrdersTab } from './views/EcomOrdersTab';
import { EcomProductsTab } from './views/EcomProductsTab';
import { EcomRegistrationTab } from './views/EcomRegistrationTab';
import { EcomOverviewTab } from './views/EcomOverviewTab';
import { EcomHeader } from './views/EcomHeader';

interface EcommercePortalProps {
  onClose: () => void;
}

function filterEcommerceProducts(
  products: EcommerceProductItem[],
  productSearch: string,
  productFilter: string,
  categoryFilter: string,
  stockFilter: string,
): EcommerceProductItem[] {
  return products.filter(prod => {
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase().trim();
      const matchesName = prod.name.toLowerCase().includes(q);
      const matchesSku = prod.sku_barcode ? prod.sku_barcode.toLowerCase().includes(q) : false;
      const matchesCat = prod.category ? prod.category.toLowerCase().includes(q) : false;
      if (!matchesName && !matchesSku && !matchesCat) return false;
    }
    if (productFilter === 'online' && prod.is_online_enabled !== 1) return false;
    if (productFilter === 'offline' && prod.is_online_enabled === 1) return false;
    if (productFilter === 'failed' && prod.sync_status !== 'FAILED') return false;
    if (categoryFilter !== 'all' && (prod.category || '').toLowerCase() !== categoryFilter.toLowerCase()) return false;
    if (stockFilter === 'instock' && (prod.current_stock as number) <= 0) return false;
    if (stockFilter === 'outstock' && (prod.current_stock as number) !== 0) return false;
    if (stockFilter === 'negative' && (prod.current_stock as number) >= 0) return false;
    return true;
  });
}

export function EcommercePortal({ onClose }: EcommercePortalProps) {
  const { tenantId, shopName, userName } = useAuthStore();
  const currentTenantId = tenantId || 'global';

  const ec = useEcommerceState();
  const {
    activeTab, setActiveTab, settings, setSettings, loading, setLoading,
    setRefreshing, setConnectionStatus, setCopiedId, products, setProducts, setProductsLoading,
    productSearch, productFilter, categoryFilter, stockFilter, selectedProductIds, setSelectedProductIds,
    setBulkProcessing, setSyncingProductId, editingProduct, orders, setOrders, setOrdersLoading,
    orderSearch, orderStatusFilter, selectedOrder, setSelectedOrder, setRegLoading, setRegError,
    setRegSuccess, settingsForm, setSettingsForm, setSavingSettings, setSettingsMsg, setTestingConnection,
    setPingLatency, toast, setToast,
  } = ec;

  // Registration Form State
  const [regForm, setRegForm] = useState({
    store_name: shopName || '',
    store_slug: (shopName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    store_description: 'Official online storefront synchronized in real-time with Nafid POS.',
    contact_name: userName || 'Store Manager',
    contact_email: '',
    contact_phone: '',
    city: 'Dubai',
    address: '',
    pincode: '',
  });

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
          contact_email: data.contact_email || '',
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
  }, [currentTenantId, shopName, setSettings, setSettingsForm]);

  // Check Connection
  const checkConnection = useCallback(async (url?: string | null) => {
    setTestingConnection(true);
    const start = performance.now();
    try {
      const res = await fusionCartService.testConnection(url);
      setConnectionStatus(res);
      setPingLatency(Math.round(performance.now() - start));
    } finally {
      setTestingConnection(false);
    }
  }, [setConnectionStatus, setPingLatency, setTestingConnection]);

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
  }, [currentTenantId, productSearch, productFilter, setProducts, setProductsLoading]);

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
  }, [currentTenantId, setOrders, setOrdersLoading]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProducts and loadOrders excluded: their filter-dependent identities are outside the original tenant and tab refresh triggers.
  }, [currentTenantId, activeTab, checkConnection, setRefreshing, setSettings]);

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
  }, [loadSettings, checkConnection, loadProducts, loadOrders, setLoading]);

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
    } catch (err) {
      setRegError((err as Error).message || 'An unexpected error occurred during vendor registration.');
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
        setToast({ text: `Product sync failed: ${res.error}`, type: 'error' });
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
        setToast({ text: `Unpublish failed: ${res.error}`, type: 'error' });
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
    } catch (err) {
      setSettingsMsg({ type: 'error', text: (err as Error).message || 'Network error occurred.' });
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
    const inStockCount = products.filter(p => (p.current_stock as number) > 0).length;
    return {
      published,
      pending,
      revenue: totalRevenue,
      inStockCount,
      totalCatalog: products.length,
      publishedPercent: products.length > 0 ? Math.round((published / products.length) * 100) : 0,
    };
  }, [products, orders]);

  const regStatus = (settings?.registration_status || 'NOT_REQUESTED') as 'PENDING' | 'ACTIVE' | 'NOT_REQUESTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'CONNECTION_ERROR';
  const isVendorApproved = regStatus === 'ACTIVE' || regStatus === 'APPROVED';

  // Filtered Products
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- this original memo keeps the product-list identity stable while its filters and data are unchanged.
  const filteredProductsList = useMemo(
    () => filterEcommerceProducts(products, productSearch, productFilter, categoryFilter, stockFilter),
    [products, productSearch, productFilter, categoryFilter, stockFilter],
  );

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
      <EcomHeader
        currentTenantId={currentTenantId} isVendorApproved={isVendorApproved} onClose={onClose}
        refreshStatus={refreshStatus} regStatus={regStatus} shopName={shopName} ec={ec}
      />

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
              <EcomOverviewTab
                checkConnection={checkConnection} currentTenantId={currentTenantId} handleCopyId={handleCopyId}
                isVendorApproved={isVendorApproved} refreshStatus={refreshStatus} regStatus={regStatus}
                shopName={shopName} summary={summary} ec={ec}
              />
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 2: VENDOR REGISTRATION (SPLIT-VIEW)
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'registration' && (
              <EcomRegistrationTab
                currentTenantId={currentTenantId} handleRegister={handleRegister} regForm={regForm}
                setRegForm={setRegForm} shopName={shopName} summary={summary} ec={ec}
              />
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 3: ONLINE PRODUCTS CATALOG
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'products' && (
              <EcomProductsTab
                categoriesList={categoriesList} filteredProductsList={filteredProductsList}
                handleBulkPublish={handleBulkPublish} handleBulkUnpublish={handleBulkUnpublish}
                handleSyncProduct={handleSyncProduct} handleUnpublishProduct={handleUnpublishProduct}
                isVendorApproved={isVendorApproved} toggleSelectAll={toggleSelectAll}
                toggleSelectProduct={toggleSelectProduct} ec={ec}
              />
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 4: ONLINE ORDERS STREAM
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'orders' && (
              <EcomOrdersTab
                filteredOrders={filteredOrders} loadOrders={loadOrders} ec={ec}
              />
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 5: STORE & GATEWAY CONFIGURATION
            ═══════════════════════════════════════════════════ */}
            {activeTab === 'settings' && (
              <EcomSettingsTab
                checkConnection={checkConnection} handleSaveSettings={handleSaveSettings} ec={ec}
              />
            )}
          </div>
        )}
      </main>

      {/* ═══════════════════════════════════════════════════
          MODAL: EDIT PRODUCT OVERRIDES
      ═══════════════════════════════════════════════════ */}
      {editingProduct && (
        <EditCatalogProductDialog
          currentTenantId={currentTenantId} loadProducts={loadProducts} editingProduct={editingProduct} ec={ec}
        />
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
                  {selectedOrder.created_at ? storeDateTime(selectedOrder.created_at) : 'Recent'}
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
                          Qty: {p.pivot?.quantity || 1} × {formatCurrency(p.pivot?.single_price)}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-foreground">
                        {formatCurrency(p.pivot?.subtotal)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Financials */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="font-bold text-foreground text-sm">Total Paid</span>
                <span className="font-mono font-black text-foreground text-base">
                  {formatCurrency(selectedOrder.total || selectedOrder.amount)}
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
      <FloatToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
