import { ipcMain } from 'electron';
import { handle } from './common.js';
import * as syncService from '../services/syncService.js';
import * as ecommerceService from '../services/ecommerceService.js';

export function registerSyncEcommerceHandlers(): void {
handle('sync:clearPending', syncService.syncClearPending);

// ── Diagnostic: Get stuck PENDING sync records ────────────────────────────────
handle('sync:getPending', syncService.syncGetPending);

ipcMain.handle('sync:runInitial', async (event) => {
  const { runInitialSync } = await import('../sync/syncWorker.js');
  return runInitialSync(event.sender);
});

handle('sync:getCloudAccessState', syncService.getCloudAccessState);

handle('sync:updateCloudAccessConfig', syncService.updateCloudAccessConfig);

ipcMain.handle('sync:drainPendingCloudQueue', async (event) => {
  try {
    const { drainPendingCloudQueue } = await import('../sync/syncWorker.js');
    return drainPendingCloudQueue(event.sender);
  } catch (err) {
    console.error('[Main] sync:drainPendingCloudQueue error:', (err as Error).message);
    return { success: false, drainedCount: 0, message: (err as Error).message };
  }
});

handle('sync:setPageContext', syncService.setPageContext);

ipcMain.removeHandler('ecommerce:getSettings');
handle('ecommerce:getSettings', ecommerceService.getSettings);

ipcMain.removeHandler('ecommerce:saveSettings');
handle('ecommerce:saveSettings', ecommerceService.saveSettings);

ipcMain.removeHandler('ecommerce:testConnection');
handle('ecommerce:testConnection', ecommerceService.testConnection);

ipcMain.removeHandler('ecommerce:registerVendor');
handle('ecommerce:registerVendor', ecommerceService.registerVendor);

ipcMain.removeHandler('ecommerce:refreshStatus');
handle('ecommerce:refreshStatus', ecommerceService.refreshStatus);

ipcMain.removeHandler('ecommerce:getProducts');
handle('ecommerce:getProducts', ecommerceService.getProducts);

ipcMain.removeHandler('ecommerce:updateMapping');
handle('ecommerce:updateMapping', ecommerceService.updateMapping);

ipcMain.removeHandler('ecommerce:syncProduct');
handle('ecommerce:syncProduct', ecommerceService.syncProduct);

ipcMain.removeHandler('ecommerce:unpublishProduct');
handle('ecommerce:unpublishProduct', ecommerceService.unpublishProduct);

ipcMain.removeHandler('ecommerce:getOrders');
handle('ecommerce:getOrders', ecommerceService.getOrders);


handle('sync:resetFastPollBackoff', syncService.resetFastPollBackoff);

ipcMain.handle('sync:forceResyncInvoices', async (event) => {
  const { forceResyncInvoices } = await import('../sync/syncWorker.js');
  return forceResyncInvoices(event.sender);
});

ipcMain.handle('sync:forceResyncCatalog', async (event) => {
  const { forceResyncCatalog } = await import('../sync/syncWorker.js');
  return forceResyncCatalog(event.sender);
});

ipcMain.handle('sync:forceResyncEntities', async (event, categories: string[]) => {
  const { forceResyncEntities } = await import('../sync/syncWorker.js');
  return forceResyncEntities(categories, event.sender);
});

handle('sync:getProgress', syncService.getSyncProgress);

handle('sync:testConnection', syncService.testNetworkConnection);


}
