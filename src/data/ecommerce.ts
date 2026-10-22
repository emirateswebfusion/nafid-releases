import { bindBridge } from './client';

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
