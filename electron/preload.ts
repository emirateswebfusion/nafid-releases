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
  dbResetPrintStatus: (tenant_id: string) => ipcRenderer.invoke('db:resetPrintStatus', tenant_id),
  dbGetPendingPrintProducts: (params: { tenant_id: string; limit: number; date?: string; dateEnd?: string; only_pending?: boolean }) => ipcRenderer.invoke('db:getPendingPrintProducts', params),
  dbCheckout: (payload: any) => ipcRenderer.invoke('db:checkout', payload),
  dbApplyInvoiceDiscount: (payload: any) => ipcRenderer.invoke('db:applyInvoiceDiscount', payload),
  dbGetInvoices: (filters: any) => ipcRenderer.invoke('db:getInvoices', filters),
  dbGetInvoiceItems: (invoice_id: string) => ipcRenderer.invoke('db:getInvoiceItems', invoice_id),
  dbUpdateInvoice: (payload: any) => ipcRenderer.invoke('db:updateInvoice', payload),
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
  
  onUpdateStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('update-status', (_event, status) => callback(status));
  },
  onBarcodeScanned: (callback: (code: string) => void) => {
    ipcRenderer.on('hardware:barcode', (_event, code) => callback(code));
  },
  onScaleWeight: (callback: (weight: number) => void) => {
    ipcRenderer.on('hardware:scaleWeight', (_event, weight) => callback(weight));
  },
  onSyncDataUpdated: (callback: () => void) => ipcRenderer.on('sync:data-updated', () => callback()),
  dbDebugDumpInvoices: () => ipcRenderer.invoke('db:debug:dumpInvoices'),
  dbGetNextInvoiceNumber: (payload: { tenant_id: string; prefix?: string }) => ipcRenderer.invoke('db:getNextInvoiceNumber', payload),
  dbPeekNextInvoiceNumber: (payload: { tenant_id: string }) => ipcRenderer.invoke('db:peekNextInvoiceNumber', payload),

  // Scrap
  dbGetScrapCategories: (tenant_id: string) => ipcRenderer.invoke('db:getScrapCategories', tenant_id),
  dbAddScrapCategory: (cat: any) => ipcRenderer.invoke('db:addScrapCategory', cat),
  dbUpdateScrapCategory: (cat: any) => ipcRenderer.invoke('db:updateScrapCategory', cat),
  dbDeleteScrapCategory: (scrap_category_id: string) => ipcRenderer.invoke('db:deleteScrapCategory', scrap_category_id),
  dbGetScrapItems: (tenant_id: string) => ipcRenderer.invoke('db:getScrapItems', tenant_id),
  dbAddScrapItem: (item: any) => ipcRenderer.invoke('db:addScrapItem', item),
  dbUpdateScrapItem: (item: any) => ipcRenderer.invoke('db:updateScrapItem', item),
  dbDeleteScrapItem: (scrap_item_id: string) => ipcRenderer.invoke('db:deleteScrapItem', scrap_item_id),
  dbAdjustScrapStock: (args: { scrap_item_id: string; delta: number }) => ipcRenderer.invoke('db:adjustScrapStock', args),
  dbAddScrapTransaction: (t: any) => ipcRenderer.invoke('db:addScrapTransaction', t),
  dbGetScrapTransactions: (args: { tenant_id: string; scrap_item_id?: string }) => ipcRenderer.invoke('db:getScrapTransactions', args),

  // Stock Report
  dbGetStockReport: (tenant_id: string) => ipcRenderer.invoke('db:getStockReport', tenant_id),

  // Quotations
  dbGetNextQuotationNumber: (payload: { tenant_id: string; prefix?: string }) => ipcRenderer.invoke('db:getNextQuotationNumber', payload),
  dbSaveQuotation: (q: any) => ipcRenderer.invoke('db:saveQuotation', q),
  dbGetQuotations: (args: { tenant_id: string; search?: string }) => ipcRenderer.invoke('db:getQuotations', args),
  dbGetQuotationItems: (quotation_id: string) => ipcRenderer.invoke('db:getQuotationItems', quotation_id),
  dbUpdateQuotationStatus: (args: { quotation_id: string; status?: string; converted_to_invoice?: number; invoice_id?: string }) => ipcRenderer.invoke('db:updateQuotationStatus', args),

  // Warranties
  dbSaveWarranty: (w: any) => ipcRenderer.invoke('db:saveWarranty', w),
  dbGetWarranties: (args: { tenant_id: string; search?: string }) => ipcRenderer.invoke('db:getWarranties', args),
  dbDeleteWarranty: (warranty_id: string) => ipcRenderer.invoke('db:deleteWarranty', warranty_id),

  // Parties
  dbGetParties: (tenant_id: string) => ipcRenderer.invoke('db:getParties', tenant_id),
  dbAddParty: (party: any) => ipcRenderer.invoke('db:addParty', party),
  dbUpdateParty: (party: any) => ipcRenderer.invoke('db:updateParty', party),
  dbDeleteParty: (party_id: string) => ipcRenderer.invoke('db:deleteParty', party_id),
  dbAdjustPartyBalance: (payload: { party_id: string; amount: number }) => ipcRenderer.invoke('db:adjustPartyBalance', payload),
});
