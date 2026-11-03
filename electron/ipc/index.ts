import { getDb } from '../db/localDb.js';
import { registerAuthHandlers } from './authHandlers.js';
import { registerAppHandlers } from './appHandlers.js';
import { registerProductHandlers } from './productHandlers.js';
import { registerPartyCustomerHandlers } from './partyCustomerHandlers.js';
import { registerInvoiceHandlers } from './invoiceHandlers.js';
import { registerPurchaseScrapHandlers } from './purchaseScrapHandlers.js';
import { registerCashierHandlers } from './cashierHandlers.js';
import { registerSettingsHandlers } from './settingsHandlers.js';
import { registerSyncEcommerceHandlers } from './syncEcommerceHandlers.js';
import { registerRestaurantHandlers } from './restaurantHandlers.js';
import { registerUpdaterIpc } from '../services/updaterService.js';
import { reconcileCashDrawer } from '../services/cashDrawerService.js';
import { getStoreTimezoneSetting } from '../services/storeTime.js';
import { initWhatsAppIpc } from '../whatsapp/whatsappService.js';
import { initShopClosingIpc } from '../whatsapp/shopClosingReportService.js';

export function registerAllIpcHandlers(): void {
  registerAuthHandlers();
  registerAppHandlers();
  registerProductHandlers();
  registerPartyCustomerHandlers();
  registerInvoiceHandlers();
  registerPurchaseScrapHandlers();
  registerCashierHandlers();
  registerSettingsHandlers();
  registerSyncEcommerceHandlers();
  registerRestaurantHandlers();
  registerUpdaterIpc();
  initWhatsAppIpc();
  initShopClosingIpc({
    reconcileCashDrawerFn: reconcileCashDrawer,
    getStoreTimezoneSettingFn: getStoreTimezoneSetting,
    getDbFn: getDb,
  });
}
