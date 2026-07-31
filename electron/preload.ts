import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  logError: (message: string, error?: any) => ipcRenderer.invoke('log:error', { message, error }),
  ping: () => ipcRenderer.invoke('ping'),
  appCheckForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  appGetVersion: () => ipcRenderer.invoke('app:getVersion'),
  appInstallUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  appDownloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  dbGetProducts: (params: any) => ipcRenderer.invoke('db:getProducts', params),
  dbGetProductsCount: (params: any) => ipcRenderer.invoke('db:getProductsCount', params),
  dbGetProductsByIds: (params: { tenant_id: string; product_ids: string[] }) => ipcRenderer.invoke('db:getProductsByIds', params),
  dbAddProduct: (product: any) => ipcRenderer.invoke('db:addProduct', product),
  dbEnsureServiceItem: (params: { tenant_id: string }) => ipcRenderer.invoke('db:ensureServiceItem', params),
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
  dbGetDashboardStats: (tenantId: string) => ipcRenderer.invoke('db:getDashboardStats', tenantId),
  dbGetInvoiceItems: (invoice_id: string) => ipcRenderer.invoke('db:getInvoiceItems', invoice_id),
  dbUpdateInvoice: (payload: any) => ipcRenderer.invoke('db:updateInvoice', payload),
  dbGetGrades: (tenant_id: string) => ipcRenderer.invoke('db:getGrades', tenant_id),
  dbAddGrade: (grade: any) => ipcRenderer.invoke('db:addGrade', grade),
  dbUpdateGrade: (grade: any) => ipcRenderer.invoke('db:updateGrade', grade),
  dbDeleteGrade: (grade_id: string) => ipcRenderer.invoke('db:deleteGrade', grade_id),
  runInitialSync: () => ipcRenderer.invoke('sync:runInitial'),
  getSyncProgress: () => ipcRenderer.invoke('sync:getProgress'),
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
  getReceiptText: () => ipcRenderer.invoke('hardware:getReceiptText'),
  getA4Html: () => ipcRenderer.invoke('hardware:getA4Html'),
  getPrinters: () => ipcRenderer.invoke('hardware:getPrinters'),
  printReady: () => ipcRenderer.invoke('hardware:printReady'),
  printA4Html: (tenant_id: string, htmlContent: string) => ipcRenderer.invoke('hardware:printA4Html', { tenant_id, htmlContent }),
  
  onUpdateStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('update-status', (_event, status) => callback(status));
  },
  onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress));
  },
  onUpdateInfo: (callback: (info: any) => void) => {
    ipcRenderer.on('update-info', (_event, info) => callback(info));
  },
  onBarcodeScanned: (callback: (code: string) => void) => {
    ipcRenderer.on('hardware:barcode', (_event, code) => callback(code));
  },
  onScaleWeight: (callback: (weight: number) => void) => {
    const listener = (_event: any, weight: number) => callback(weight);
    ipcRenderer.on('hardware:scaleWeight', listener);
    return () => {
      ipcRenderer.removeListener('hardware:scaleWeight', listener);
    };
  },
  onSyncDataUpdated: (callback: () => void) => ipcRenderer.on('sync:data-updated', () => callback()),
  onSyncCycleComplete: (callback: () => void) => ipcRenderer.on('sync:cycle-complete', () => callback()),
  onOnlineStatus: (callback: (online: boolean) => void) => ipcRenderer.on('sync:online-status', (_event, online) => callback(online)),
  onSyncProgress: (callback: (progress: { percent: number; label: string; recordsSynced: number; totalRecords: number }) => void) => {
    ipcRenderer.on('sync:progress', (_event, progress) => callback(progress));
  },
  onTokenExpired: (callback: () => void) => {
    ipcRenderer.on('auth:token-expired', () => callback());
  },
  dbConvertBosToGst: (payload: { invoice_ids: string[]; tenant_id: string; user_id: string }) => ipcRenderer.invoke('db:convertBosToGst', payload),
  dbGetNextServerInvoiceNumber: (payload: { tenant_id: string; series?: string }) => ipcRenderer.invoke('db:getNextServerInvoiceNumber', payload),
  dbGetNextInvoiceNumber: (payload: { tenant_id: string; prefix?: string; series?: string }) => ipcRenderer.invoke('db:getNextInvoiceNumber', payload),
  dbPeekNextInvoiceNumber: (payload: { tenant_id: string; series?: string }) => ipcRenderer.invoke('db:peekNextInvoiceNumber', payload),

  // Scrap (categories ARE items with price/stock/unit)
  dbDeduplicateScrapCategories: () => ipcRenderer.invoke('db:deduplicateScrapCategories'),
  dbGetScrapCategories: (tenant_id: string) => ipcRenderer.invoke('db:getScrapCategories', tenant_id),
  dbAddScrapCategory: (cat: any) => ipcRenderer.invoke('db:addScrapCategory', cat),
  dbUpdateScrapCategory: (cat: any) => ipcRenderer.invoke('db:updateScrapCategory', cat),
  dbDeleteScrapCategory: (scrap_category_id: string) => ipcRenderer.invoke('db:deleteScrapCategory', scrap_category_id),
  dbAddScrapTransaction: (t: any) => ipcRenderer.invoke('db:addScrapTransaction', t),
  dbGetScrapTransactions: (args: { tenant_id: string; scrap_category_id?: string }) => ipcRenderer.invoke('db:getScrapTransactions', args),

  // Stock Report
  dbGetStockReport: (tenant_id: string) => ipcRenderer.invoke('db:getStockReport', tenant_id),
  dbGetProductBillQuantities: (tenant_id: string) => ipcRenderer.invoke('db:getProductBillQuantities', tenant_id),

  // Quotations
  dbGetNextQuotationNumber: (payload: { tenant_id: string; prefix?: string }) => ipcRenderer.invoke('db:getNextQuotationNumber', payload),
  dbPeekNextQuotationNumber: (payload: { tenant_id: string }) => ipcRenderer.invoke('db:peekNextQuotationNumber', payload),
  dbSaveQuotation: (q: any) => ipcRenderer.invoke('db:saveQuotation', q),
  dbGetQuotations: (args: { tenant_id: string; search?: string }) => ipcRenderer.invoke('db:getQuotations', args),
  dbGetQuotationItems: (quotation_id: string) => ipcRenderer.invoke('db:getQuotationItems', quotation_id),
  dbUpdateQuotationStatus: (args: { quotation_id: string; status?: string; converted_to_invoice?: number; invoice_id?: string }) => ipcRenderer.invoke('db:updateQuotationStatus', args),
  dbDeleteQuotation: (quotation_id: string) => ipcRenderer.invoke('db:deleteQuotation', quotation_id),
  dbUpdateQuotation: (q: any) => ipcRenderer.invoke('db:updateQuotation', q),

  // Warranties
  dbSaveWarranty: (w: any) => ipcRenderer.invoke('db:saveWarranty', w),
  dbGetWarranties: (args: { tenant_id: string; search?: string }) => ipcRenderer.invoke('db:getWarranties', args),
  dbDeleteWarranty: (warranty_id: string) => ipcRenderer.invoke('db:deleteWarranty', warranty_id),

  // Scrap Invoice
  dbGetScrapCategoriesBySearch: (args: { tenant_id: string; search: string }) => ipcRenderer.invoke('db:getScrapCategoriesBySearch', args),
  dbGetNextScrapInvoiceNumber: (args: { tenant_id: string }) => ipcRenderer.invoke('db:getNextScrapInvoiceNumber', args),
  dbPeekNextScrapInvoiceNumber: (args: { tenant_id: string }) => ipcRenderer.invoke('db:peekNextScrapInvoiceNumber', args),
  dbGetScrapInvoiceByNumber: (args: { tenant_id: string; scrap_invoice_number: string }) => ipcRenderer.invoke('db:getScrapInvoiceByNumber', args),
  dbGetScrapInvoiceList: (args: { tenant_id: string }) => ipcRenderer.invoke('db:getScrapInvoiceList', args),
  dbUpdateScrapInvoicePaymentStatus: (args: { tenant_id: string; scrap_invoice_number: string; payment_status: string }) => ipcRenderer.invoke('db:updateScrapInvoicePaymentStatus', args),
  dbUpdateScrapInvoiceHeader: (args: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string }) => ipcRenderer.invoke('db:updateScrapInvoiceHeader', args),
  dbUpdateScrapInvoiceFull: (args: { tenant_id: string; scrap_invoice_number: string; party_name?: string; customer_phone?: string; customer_address?: string; payment_status?: string; items: any[] }) => ipcRenderer.invoke('db:updateScrapInvoiceFull', args),
  dbUpdateScrapTransaction: (args: any) => ipcRenderer.invoke('db:updateScrapTransaction', args),
  dbDeleteScrapTransaction: (args: { tenant_id: string; transaction_id: string }) => ipcRenderer.invoke('db:deleteScrapTransaction', args),
  dbDeleteScrapInvoice: (args: { tenant_id: string; scrap_invoice_number: string }) => ipcRenderer.invoke('db:deleteScrapInvoice', args),

  // Parties
  dbGetParties: (tenant_id: string) => ipcRenderer.invoke('db:getParties', tenant_id),
  dbAddParty: (party: any) => ipcRenderer.invoke('db:addParty', party),
  dbUpdateParty: (party: any) => ipcRenderer.invoke('db:updateParty', party),
  dbDeleteParty: (party_id: string) => ipcRenderer.invoke('db:deleteParty', party_id),
  dbAdjustPartyBalance: (payload: { party_id: string; amount: number }) => ipcRenderer.invoke('db:adjustPartyBalance', payload),
  dbGetPartyLedger: (party_id: string) => ipcRenderer.invoke('db:getPartyLedger', party_id),
  dbAddPartyLedgerEntry: (entry: any) => ipcRenderer.invoke('db:addPartyLedgerEntry', entry),
  dbUpdatePartyLedgerEntry: (entry: any) => ipcRenderer.invoke('db:updatePartyLedgerEntry', entry),
  dbDeletePartyLedgerEntry: (ledger_id: string, party_id: string) => ipcRenderer.invoke('db:deletePartyLedgerEntry', { ledger_id, party_id }),

  // Cashier & Settlement
  dbCashierGetDrawer: (params: { tenant_id: string; business_date?: string }) => ipcRenderer.invoke('db:cashier:getDrawer', params),
  dbCashierSetOpeningBalance: (params: { tenant_id: string; opening_balance: number; user_id: string; user_name?: string }) => ipcRenderer.invoke('db:cashier:setOpeningBalance', params),
  dbCashierGetPendingInvoices: (params: { tenant_id: string; search?: string }) => ipcRenderer.invoke('db:cashier:getPendingInvoices', params),
  dbCashierSettlePayment: (params: { tenant_id: string; invoice_id: string; received_amount: number; payment_method: string; user_id: string; user_name?: string }) => ipcRenderer.invoke('db:cashier:settlePayment', params),
  dbCashierAddTransaction: (params: { tenant_id: string; type: 'CASH_IN' | 'CASH_OUT'; amount: number; category?: string; notes?: string; user_id: string; user_name?: string }) => ipcRenderer.invoke('db:cashier:addTransaction', params),
  dbCashierDayClosing: (params: { tenant_id: string; actual_cash: number; closing_remarks?: string; user_id: string; user_name?: string }) => ipcRenderer.invoke('db:cashier:dayClosing', params),
  dbCashierGetTransactions: (params: { tenant_id: string }) => ipcRenderer.invoke('db:cashier:getTransactions', params),
  dbCashierGetHistory: (params: { tenant_id: string; limit?: number; offset?: number }) => ipcRenderer.invoke('db:cashier:getHistory', params),
  dbCashierGetDaySettlements: (params: { tenant_id: string; business_date: string }) => ipcRenderer.invoke('db:cashier:getDaySettlements', params),
  dbCashierGetAuditLog: (params: { tenant_id: string; limit?: number; offset?: number }) => ipcRenderer.invoke('db:cashier:getAuditLog', params),
  dbCashierGetCategories: (params: { tenant_id: string; type?: 'CASH_IN' | 'CASH_OUT' }) => ipcRenderer.invoke('db:cashier:getCategories', params),
  dbCashierAddCategory: (params: { tenant_id: string; name: string; type: 'CASH_IN' | 'CASH_OUT' }) => ipcRenderer.invoke('db:cashier:addCategory', params),
  dbCashierDeleteCategory: (params: { category_id: string; tenant_id: string }) => ipcRenderer.invoke('db:cashier:deleteCategory', params),

  // Purchase Bills
  dbGetNextPurchaseBillNumber: (payload: { tenant_id: string }) => ipcRenderer.invoke('db:getNextPurchaseBillNumber', payload),
  dbAddPurchaseBill: (payload: any) => ipcRenderer.invoke('db:addPurchaseBill', payload),
  dbGetPurchaseBills: (args: { tenant_id: string; search?: string; limit?: number; offset?: number }) => ipcRenderer.invoke('db:getPurchaseBills', args),
  dbGetPurchaseBillItems: (purchase_bill_id: string) => ipcRenderer.invoke('db:getPurchaseBillItems', purchase_bill_id),
  dbUpdatePurchaseBill: (payload: any) => ipcRenderer.invoke('db:updatePurchaseBill', payload),
  dbDeletePurchaseBill: (purchase_bill_id: string) => ipcRenderer.invoke('db:deletePurchaseBill', purchase_bill_id),
  dbGetPurchaseBillProducts: (args: { tenant_id: string; search?: string }) => ipcRenderer.invoke('db:getPurchaseBillProducts', args),
  dbGenerateBarcode: (args: { tenant_id: string; item_code?: string; strip_suffix?: string }) => ipcRenderer.invoke('db:generateBarcode', args),

  // Customers / Loyalty
  dbGetCustomers: (args: { tenant_id: string }) => ipcRenderer.invoke('db:getCustomers', args),
  dbFindCustomers: (args: { tenant_id: string; name?: string; phone?: string }) => ipcRenderer.invoke('db:findCustomers', args),
  dbGetCustomerInvoices: (args: { customer_id: string; tenant_id: string }) => ipcRenderer.invoke('db:getCustomerInvoices', args),
  dbDeleteInvoice: (invoice_id: string) => ipcRenderer.invoke('db:deleteInvoice', invoice_id),
  dbGetCustomerLoyaltyTransactions: (args: { customer_id: string; tenant_id: string }) => ipcRenderer.invoke('db:getCustomerLoyaltyTransactions', args),

  // Returns
  dbCreateReturn: (payload: any) => ipcRenderer.invoke('db:createReturn', payload),
  dbGetReturns: (filters: any) => ipcRenderer.invoke('db:getReturns', filters),
  dbGetReturnItems: (return_id: string) => ipcRenderer.invoke('db:getReturnItems', return_id),
  dbDeleteReturn: (return_id: string) => ipcRenderer.invoke('db:deleteReturn', return_id),
  dbGetNextReturnNumber: (payload: { tenant_id: string; prefix?: string }) => ipcRenderer.invoke('db:getNextReturnNumber', payload),
  dbPeekNextReturnNumber: (payload: { tenant_id: string; prefix?: string }) => ipcRenderer.invoke('db:peekNextReturnNumber', payload),
  dbGetAlreadyReturnedQuantities: (invoiceId: string) => ipcRenderer.invoke('db:getAlreadyReturnedQuantities', invoiceId),
  dbGetReturnInvoiceByNumber: (payload: { tenant_id: string; return_number: string }) => ipcRenderer.invoke('db:getReturnInvoiceByNumber', payload),
  dbGetPendingReturnInvoices: (payload: { tenant_id: string; search?: string }) => ipcRenderer.invoke('db:getPendingReturnInvoices', payload),
  dbSettleReturnInvoice: (payload: { tenant_id: string; return_number: string; adjusted_invoice_number: string }) => ipcRenderer.invoke('db:settleReturnInvoice', payload),

  // Hold Bill
  dbHoldBill: (payload: any) => ipcRenderer.invoke('db:holdBill', payload),
  dbGetHeldBills: (payload: { tenant_id: string }) => ipcRenderer.invoke('db:getHeldBills', payload),
  dbRecallHeldBill: (payload: { invoice_id: string }) => ipcRenderer.invoke('db:recallHeldBill', payload),
  dbReleaseHeldBill: (payload: { invoice_id: string }) => ipcRenderer.invoke('db:releaseHeldBill', payload),
  dbExpireStaleHeldBills: (payload: { tenant_id: string }) => ipcRenderer.invoke('db:expireStaleHeldBills', payload),
  
  // Diagnostic sync helpers
  syncClearPending: (payload: { tenant_id: string; type: 'invoices' | 'products' | 'all'; records?: string[] }) => ipcRenderer.invoke('sync:clearPending', payload),
  syncGetPending: (payload: { tenant_id: string }) => ipcRenderer.invoke('sync:getPending', payload),
});
