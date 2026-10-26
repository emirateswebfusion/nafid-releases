import { bindBridge } from './client';
import type { EcommerceProductMappingsRow, ProductsRow } from './dbRows';

/** Product and mapping columns selected by `ecommerceService.getProducts` / `getProductsStatement`. */
export interface EcommerceProduct extends Pick<ProductsRow, 'product_id' | 'tenant_id' | 'name' | 'sku_barcode' | 'category' | 'base_price' | 'current_stock' | 'uom'> {
  mapping_id: string | null;
  fusioncart_product_id: EcommerceProductMappingsRow['fusioncart_product_id'];
  is_online_enabled: number;
  online_title_override: string | null;
  online_description_override: string | null;
  online_price_override: number | null;
  sync_status: string;
  last_error: string | null;
  last_synced_at: string | null;
}

/** Success and caught-query-error shapes from `ecommerceService.getProducts`. */
export type EcommerceProductsResult =
  | { success: true; products: EcommerceProduct[] }
  | { success: false; error: string; products: [] };

/** Unvalidated FusionCart order JSON filtered by `fusionCartBridge.getOrders` using these store fields. */
export type EcommerceOrder = Record<string, unknown> & {
  store_id?: number;
  store?: { id: number };
};

/** Success and API-error shapes from `ecommerceService.getOrders`; all error branches return an empty list. */
export type EcommerceOrdersResult =
  | { success: true; orders: EcommerceOrder[] }
  | { success: false; error?: string; orders: [] };

/** FusionCart e-commerce integration. Channel catalog — the only way UI code reaches these IPC channels. */
export const ecommerceApi = bindBridge({
  getSettings: 'ecommerceGetSettings',
  saveSettings: 'ecommerceSaveSettings',
  testConnection: 'ecommerceTestConnection',
  registerVendor: 'ecommerceRegisterVendor',
  refreshStatus: 'ecommerceRefreshStatus',
  getProducts: 'ecommerceGetProducts',
  updateMapping: 'ecommerceUpdateMapping',
  syncProduct: 'ecommerceSyncProduct',
  unpublishProduct: 'ecommerceUnpublishProduct',
  getOrders: 'ecommerceGetOrders',
});
