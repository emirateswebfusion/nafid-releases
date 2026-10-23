import { useState } from 'react';
import { type EcommerceSettings, type EcommerceProductItem, type EcommerceOrder } from '../../../services/fusionCartService';

/**
 * State of the e-commerce (FusionCart) portal: active tab, vendor status, online catalog, orders, store settings,
 * the product being edited and loading / saving flags. (The registration form stays in the portal: its defaults come
 * from the signed-in shop.)
 */
export function useEcommerceState() {
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

  return {
    activeTab, setActiveTab, settings, setSettings, loading, setLoading, refreshing, setRefreshing, connectionStatus,
    setConnectionStatus, copiedId, setCopiedId, products, setProducts, productsLoading, setProductsLoading,
    productSearch, setProductSearch, productFilter, setProductFilter, categoryFilter, setCategoryFilter, stockFilter,
    setStockFilter, selectedProductIds, setSelectedProductIds, bulkProcessing, setBulkProcessing, syncingProductId,
    setSyncingProductId, editingProduct, setEditingProduct, orders, setOrders, ordersLoading, setOrdersLoading,
    orderSearch, setOrderSearch, orderStatusFilter, setOrderStatusFilter, selectedOrder, setSelectedOrder,
    regLoading, setRegLoading, regError, setRegError, regSuccess, setRegSuccess, settingsForm, setSettingsForm,
    savingSettings, setSavingSettings, settingsMsg, setSettingsMsg, testingConnection, setTestingConnection,
    pingLatency, setPingLatency,
  };
}

export type EcommerceState = ReturnType<typeof useEcommerceState>;
