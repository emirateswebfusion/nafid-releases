import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  dbGetProducts: (tenantId: string) => ipcRenderer.invoke('db:getProducts', tenantId),
  dbAddProduct: (product: any) => ipcRenderer.invoke('db:addProduct', product),
  dbUpdateProduct: (product: any) => ipcRenderer.invoke('db:updateProduct', product),
  dbDeleteProduct: (product_id: string) => ipcRenderer.invoke('db:deleteProduct', product_id),
  dbAdjustStock: (args: { product_id: string; delta: number }) => ipcRenderer.invoke('db:adjustStock', args),
  dbCheckout: (payload: any) => ipcRenderer.invoke('db:checkout', payload),
  dbGetInvoices: (filters: any) => ipcRenderer.invoke('db:getInvoices', filters),
  dbGetInvoiceItems: (invoice_id: string) => ipcRenderer.invoke('db:getInvoiceItems', invoice_id),
  runInitialSync: () => ipcRenderer.invoke('sync:runInitial'),
  settingsGet: (payload: { tenant_id: string; key: string }) => ipcRenderer.invoke('settings:get', payload),
  settingsSet: (payload: { tenant_id: string; key: string; value: any }) => ipcRenderer.invoke('settings:set', payload),

  // Auth
  authSaveToken: (payload: any) => ipcRenderer.invoke('auth:saveToken', payload),
  authGetToken: () => ipcRenderer.invoke('auth:getToken'),
  authClearToken: () => ipcRenderer.invoke('auth:clearToken'),

  // Hardware APIs
  printReceipt: (data: string) => ipcRenderer.invoke('hardware:printReceipt', data),
  openCashDrawer: () => ipcRenderer.invoke('hardware:openCashDrawer'),
  printBarcode: (barcode: string) => ipcRenderer.invoke('hardware:printBarcode', barcode),
  
  onBarcodeScanned: (callback: (code: string) => void) => {
    ipcRenderer.on('hardware:barcode', (_event, code) => callback(code));
  },
  onScaleWeight: (callback: (weight: number) => void) => {
    ipcRenderer.on('hardware:scaleWeight', (_event, weight) => callback(weight));
  },
  onSyncDataUpdated: (callback: () => void) => ipcRenderer.on('sync:data-updated', () => callback()),
  dbDebugDumpInvoices: () => ipcRenderer.invoke('db:debug:dumpInvoices'),
});
