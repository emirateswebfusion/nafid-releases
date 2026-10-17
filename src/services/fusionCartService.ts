/**
 * POS-side FusionCart Service
 * 
 * Provides an abstraction for frontend components to interact with the
 * E-Commerce / FusionCart integration via Electron IPC APIs.
 */

export interface EcommerceSettings {
  tenant_id: string;
  fusioncart_url: string;
  store_id: number | null;
  vendor_id: number | null;
  store_name: string | null;
  store_slug: string | null;
  store_description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  registration_status: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'CONNECTION_ERROR';
  rejection_reason: string | null;
  last_sync_at: string | null;
  last_sync_status: 'SUCCESS' | 'FAILED' | null;
  created_at: string;
  updated_at: string;
}

export interface EcommerceProductItem {
  product_id: string;
  tenant_id: string;
  name: string;
  sku_barcode: string | null;
  category: string | null;
  base_price: number;
  current_stock: number;
  uom: string;
  mapping_id: string | null;
  fusioncart_product_id: number | null;
  is_online_enabled: number;
  online_title_override: string | null;
  online_description_override: string | null;
  online_price_override: number | null;
  sync_status: 'SYNCED' | 'PENDING' | 'FAILED' | 'UNSYNCED';
  last_error: string | null;
  last_synced_at: string | null;
}

export interface EcommerceOrder {
  id: number;
  order_number: number | string;
  amount: number;
  total: number;
  payment_status: string;
  payment_method: string;
  store_id: number;
  order_status?: {
    id: number;
    name: string;
    slug: string;
  };
  created_at?: string;
  billing_address?: any;
  shipping_address?: any;
  products?: Array<{
    id: number;
    name: string;
    pivot?: {
      quantity: number;
      single_price: number;
      subtotal: number;
    };
  }>;
}

export const fusionCartService = {
  async getSettings(tenantId: string): Promise<EcommerceSettings | null> {
    if (!window.electronAPI?.ecommerceGetSettings) return null;
    const res = await window.electronAPI.ecommerceGetSettings({ tenant_id: tenantId });
    return res.success ? res.settings : null;
  },

  async saveSettings(tenantId: string, settings: Partial<EcommerceSettings>): Promise<EcommerceSettings | null> {
    if (!window.electronAPI?.ecommerceSaveSettings) return null;
    const res = await window.electronAPI.ecommerceSaveSettings({ tenant_id: tenantId, settings });
    return res.success ? res.settings : null;
  },

  async testConnection(url?: string): Promise<{ connected: boolean; message?: string }> {
    if (!window.electronAPI?.ecommerceTestConnection) return { connected: false, message: 'Electron API unavailable' };
    return window.electronAPI.ecommerceTestConnection({ url });
  },

  async registerVendor(tenantId: string, data: any): Promise<{ success: boolean; settings?: EcommerceSettings; error?: string }> {
    if (!window.electronAPI?.ecommerceRegisterVendor) return { success: false, error: 'Electron API unavailable' };
    return window.electronAPI.ecommerceRegisterVendor({ tenant_id: tenantId, data });
  },

  async refreshStatus(tenantId: string): Promise<{ success: boolean; settings?: EcommerceSettings; store?: any; error?: string }> {
    if (!window.electronAPI?.ecommerceRefreshStatus) return { success: false, error: 'Electron API unavailable' };
    return window.electronAPI.ecommerceRefreshStatus({ tenant_id: tenantId });
  },

  async getProducts(tenantId: string, search?: string, filter?: string): Promise<EcommerceProductItem[]> {
    if (!window.electronAPI?.ecommerceGetProducts) return [];
    const res = await window.electronAPI.ecommerceGetProducts({ tenant_id: tenantId, search, filter });
    return res.success ? res.products : [];
  },

  async updateMapping(tenantId: string, productId: string, data: {
    is_online_enabled?: boolean;
    online_title_override?: string | null;
    online_description_override?: string | null;
    online_price_override?: number | null;
  }): Promise<{ success: boolean; mapping?: any; error?: string }> {
    if (!window.electronAPI?.ecommerceUpdateMapping) return { success: false, error: 'Electron API unavailable' };
    return window.electronAPI.ecommerceUpdateMapping({
      tenant_id: tenantId,
      product_id: productId,
      ...data,
    });
  },

  async syncProduct(tenantId: string, productId: string): Promise<{ success: boolean; remoteId?: number; error?: string }> {
    if (!window.electronAPI?.ecommerceSyncProduct) return { success: false, error: 'Electron API unavailable' };
    return window.electronAPI.ecommerceSyncProduct({ tenant_id: tenantId, product_id: productId });
  },

  async unpublishProduct(tenantId: string, productId: string): Promise<{ success: boolean; error?: string }> {
    if (!window.electronAPI?.ecommerceUnpublishProduct) return { success: false, error: 'Electron API unavailable' };
    return window.electronAPI.ecommerceUnpublishProduct({ tenant_id: tenantId, product_id: productId });
  },

  async getOrders(tenantId: string): Promise<EcommerceOrder[]> {
    if (!window.electronAPI?.ecommerceGetOrders) return [];
    const res = await window.electronAPI.ecommerceGetOrders({ tenant_id: tenantId });
    return res.success ? res.orders : [];
  },
};
