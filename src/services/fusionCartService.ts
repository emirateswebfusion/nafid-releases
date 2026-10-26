import { hasBridge } from '../data/client';
import { ecommerceApi } from '../data/ecommerce';
import type * as Rows from '../data/dbRows';
import type { EcommerceOrder as EcommerceOrderRecord, EcommerceProduct as EcommerceProductRecord } from '../data/ecommerce';
/**
 * POS-side FusionCart Service
 * 
 * Provides an abstraction for frontend components to interact with the
 * E-Commerce / FusionCart integration via Electron IPC APIs.
 */

export type EcommerceSettings = Rows.EcommerceSettingsRow;

/** Product row as selected by the e-commerce IPC query. */
export type EcommerceProductItem = EcommerceProductRecord;

/** View fields the e-commerce screen already reads from FusionCart's unvalidated order JSON. */
export interface EcommerceOrder extends EcommerceOrderRecord {
  id: number;
  order_number: number | string;
  amount: number;
  total: number;
  payment_status: string;
  payment_method: string;
  order_status?: { id: number; name: string; slug: string };
  created_at?: string;
  billing_address?: { title?: string; city?: string; address?: string; phone?: string; [key: string]: unknown };
  shipping_address?: { title?: string; city?: string; address?: string; phone?: string; [key: string]: unknown };
  products?: Array<{ id: number; name: string; pivot?: { quantity: number; single_price: number; subtotal: number } }>;
}

export const fusionCartService = {
  async getSettings(tenantId: string): Promise<EcommerceSettings | null> {
    if (!hasBridge('ecommerceGetSettings')) return null;
    const res = await ecommerceApi.getSettings({ tenant_id: tenantId });
    return res.success ? (res.settings as EcommerceSettings) : null;
  },

  async saveSettings(tenantId: string, settings: Partial<EcommerceSettings>): Promise<EcommerceSettings | null> {
    if (!hasBridge('ecommerceSaveSettings')) return null;
    const res = await ecommerceApi.saveSettings({ tenant_id: tenantId, settings });
    return res.success ? (res.settings as EcommerceSettings) : null;
  },

  async testConnection(url?: string | null): Promise<{ connected: boolean; message?: string }> {
    if (!hasBridge('ecommerceTestConnection')) return { connected: false, message: 'Electron API unavailable' };
    return ecommerceApi.testConnection({ url });
  },

  async registerVendor(tenantId: string, data: Record<string, unknown>): Promise<{ success: boolean; settings?: EcommerceSettings; error?: string }> {
    if (!hasBridge('ecommerceRegisterVendor')) return { success: false, error: 'Electron API unavailable' };
    return ecommerceApi.registerVendor({ tenant_id: tenantId, data });
  },

  async refreshStatus(tenantId: string): Promise<{ success: boolean; settings?: EcommerceSettings; store?: Record<string, unknown>; error?: string }> {
    if (!hasBridge('ecommerceRefreshStatus')) return { success: false, error: 'Electron API unavailable' };
    return ecommerceApi.refreshStatus({ tenant_id: tenantId }) as Promise<{ success: boolean; settings?: EcommerceSettings; store?: Record<string, unknown>; error?: string }>;
  },

  async getProducts(tenantId: string, search?: string, filter?: string): Promise<EcommerceProductItem[]> {
    if (!hasBridge('ecommerceGetProducts')) return [];
    const res = await ecommerceApi.getProducts({ tenant_id: tenantId, search, filter });
    return res.success ? res.products : [];
  },

  async updateMapping(tenantId: string, productId: string, data: {
    is_online_enabled?: boolean;
    online_title_override?: string | null;
    online_description_override?: string | null;
    online_price_override?: number | null;
  }): Promise<{ success: boolean; mapping?: Record<string, unknown>; error?: string }> {
    if (!hasBridge('ecommerceUpdateMapping')) return { success: false, error: 'Electron API unavailable' };
    return ecommerceApi.updateMapping({
      tenant_id: tenantId,
      product_id: productId,
      ...data,
    }) as Promise<{ success: boolean; mapping?: Record<string, unknown>; error?: string }>;
  },

  async syncProduct(tenantId: string, productId: string): Promise<{ success: boolean; remoteId?: number; error?: string }> {
    if (!hasBridge('ecommerceSyncProduct')) return { success: false, error: 'Electron API unavailable' };
    return ecommerceApi.syncProduct({ tenant_id: tenantId, product_id: productId });
  },

  async unpublishProduct(tenantId: string, productId: string): Promise<{ success: boolean; error?: string }> {
    if (!hasBridge('ecommerceUnpublishProduct')) return { success: false, error: 'Electron API unavailable' };
    return ecommerceApi.unpublishProduct({ tenant_id: tenantId, product_id: productId });
  },

  async getOrders(tenantId: string): Promise<EcommerceOrder[]> {
    if (!hasBridge('ecommerceGetOrders')) return [];
    const res = await ecommerceApi.getOrders({ tenant_id: tenantId });
    return res.success ? res.orders as EcommerceOrder[] : [];
  },
};
