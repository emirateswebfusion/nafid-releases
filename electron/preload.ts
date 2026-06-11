import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  logError: (message: string, error?: any) => ipcRenderer.invoke('log:error', { message, error }),
  ping: () => ipcRenderer.invoke('ping'),
  appCheckForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  appGetVersion: () => ipcRenderer.invoke('app:getVersion'),
  dbGetProducts: (params: any) => ipcRenderer.invoke('db:getProducts', params),
  dbGetProductsCount: (params: any) => ipcRenderer.invoke('db:getProductsCount', params),
  dbAddProduct: (product: any) => ipcRenderer.invoke('db:addProduct', product),
  dbUpdateProduct: (product: any) => ipcRenderer.invoke('db:updateProduct', product),
  dbDeleteProduct: (product_id: string) => ipcRenderer.invoke('db:deleteProduct', product_id),
  dbAdjustStock: (args: { product_id: string; delta: number }) => ipcRenderer.invoke('db:adjustStock', args),
  dbBulkImportProducts: (products: any[]) => ipcRenderer.invoke('db:bulkImportProducts', products),
  dbUpdatePrintStatus: (productIds: string[]) => ipcRenderer.invoke('db:updatePrintStatus', productIds),
  dbGetPendingPrintProducts: (params: { tenant_id: string; limit: number }) => ipcRenderer.invoke('db:getPendingPrintProducts', params),
  dbCheckout: (payload: any) => ipcRenderer.invoke('db:checkout', payload),
  dbGetInvoices: (filters: any) => ipcRenderer.invoke('db:getInvoices', filters),
  dbGetInvoiceItems: (invoice_id: string) => ipcRenderer.invoke('db:getInvoiceItems', invoice_id),
  dbGetGrades: (tenant_id: string) => ipcRenderer.invoke('db:getGrades', tenant_id),
  dbAddGrade: (grade: any) => ipcRenderer.invoke('db:addGrade', grade),
  dbUpdateGrade: (grade: any) => ipcRenderer.invoke('db:updateGrade', grade),
  dbDeleteGrade: (grade_id: string) => ipcRenderer.invoke('db:deleteGrade', grade_id),
  runInitialSync: () => ipcRenderer.invoke('sync:runInitial'),
  settingsGet: (payload: { tenant_id: string; key: string }) => ipcRenderer.invoke('settings:get', payload),
  settingsSet: (payload: { tenant_id: string; key: string; value: any }) => ipcRenderer.invoke('settings:set', payload),

  // Auth
  authSaveToken: (payload: any) => ipcRenderer.invoke('auth:saveToken', payload),
  authGetToken: () => ipcRenderer.invoke('auth:getToken'),
  authClearToken: () => ipcRenderer.invoke('auth:clearToken'),
  onDeepLink: (callback: (token: string) => void) => {
    ipcRenderer.on('auth:deep-link', (_event, token) => callback(token));
  },

  // Hardware APIs
  printReceipt: (tenant_id: string, data: string) => ipcRenderer.invoke('hardware:printReceipt', { tenant_id, textData: data }),
  openCashDrawer: (tenant_id: string) => ipcRenderer.invoke('hardware:openCashDrawer', tenant_id),
  printBarcode: (tenant_id: string, barcode: string, price?: number, name?: string, quantity?: number, sp?: number, spType?: 'SP' | 'OFF') => ipcRenderer.invoke('hardware:printBarcode', { tenant_id, barcode, price, name, quantity, sp, spType }),
  printBulkBarcodes: (tenant_id: string, items: Array<{ barcode: string; price?: number; name?: string; quantity: number; sp?: number; spType?: 'SP' | 'OFF' }>) => ipcRenderer.invoke('hardware:printBulkBarcodes', { tenant_id, items }),
  getBulkPrintItems: () => ipcRenderer.invoke('hardware:getBulkPrintItems'),
  getPrinters: () => ipcRenderer.invoke('hardware:getPrinters'),
  printReady: () => ipcRenderer.invoke('hardware:printReady'),
  
  onBarcodeScanned: (callback: (code: string) => void) => {
    ipcRenderer.on('hardware:barcode', (_event, code) => callback(code));
  },
  onScaleWeight: (callback: (weight: number) => void) => {
    ipcRenderer.on('hardware:scaleWeight', (_event, weight) => callback(weight));
  },
  onSyncDataUpdated: (callback: () => void) => ipcRenderer.on('sync:data-updated', () => callback()),
  dbDebugDumpInvoices: () => ipcRenderer.invoke('db:debug:dumpInvoices'),
});
