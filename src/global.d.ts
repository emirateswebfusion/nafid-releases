export interface SyncProgress {
  percent: number;
  label: string;
  recordsSynced: number;
  totalRecords: number;
}

export interface IElectronAPI {
  logError: (message: string, error?: any) => Promise<void>;
  ping: () => Promise<string>;
  appCheckForUpdates: () => Promise<any>;
  appGetVersion: () => Promise<string>;
  appInstallUpdate: () => Promise<void>;
  appDownloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  dbGetProducts: (params: any) => Promise<any[]>;
  dbGetProductsCount: (params: any) => Promise<number>;
  dbAddProduct: (product: any) => Promise<{ success: boolean; product_id?: string; error?: string }>;
  dbUpdateProduct: (product: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbAdjustStock: (args: { product_id: string; delta: number }) => Promise<{ success: boolean; error?: string }>;
  dbBulkImportProducts: (products: any[]) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePrintStatus: (productIds: string[]) => Promise<{ success: boolean; error?: string }>;
  dbResetPrintStatus: (tenantId: string) => Promise<{ success: boolean; error?: string }>;
  dbGetPendingPrintProducts: (params: { tenant_id: string; limit: number; date?: string; dateEnd?: string; only_pending?: boolean }) => Promise<any[]>;
  dbCheckout: (payload: any & { discount_type?: string, discount_value?: number }) => Promise<{ success: boolean; invoice_id?: string; error?: string }>;
  dbApplyInvoiceDiscount: (payload: { invoice_id: string; discount_type: 'FIXED' | 'PERCENTAGE'; discount_value: number; role: string }) => Promise<{ success: boolean; error?: string }>;
  dbGetInvoices: (filters: any) => Promise<any[]>;
  dbGetDashboardStats: (tenantId: string) => Promise<{ success: boolean; totalSales: number; invoiceCount: number; error?: string }>;
  dbGetInvoiceItems: (invoice_id: string) => Promise<any[]>;
  dbUpdateInvoice: (payload: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateInvoicePayment: (payload: { invoice_id: string; tenant_id: string; payment_method: string; received_amount: number; balance_amount: number }) => Promise<{ success: boolean; error?: string }>;
  dbGetGrades: (tenantId: string) => Promise<any[]>;
  dbAddGrade: (grade: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateGrade: (grade: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteGrade: (grade_id: string) => Promise<{ success: boolean; error?: string }>;
  runInitialSync: () => Promise<{ success: boolean; error?: string }>;
  getSyncProgress: () => Promise<SyncProgress | null>;
  authSaveToken: (payload: { jwt_token: string; tenant_id: string; role: string; user_id: string; user_name?: string; shop_name: string; domain_type?: string }) => Promise<{ success: boolean; error?: string }>;
  authGetToken: () => Promise<{ jwt_token: string; tenant_id: string; role: string; user_id: string; user_name?: string; shop_name: string; domain_type?: string } | null>;
  authClearToken: () => Promise<{ success: boolean; error?: string }>;
  onDeepLink: (callback: (token: string) => void) => void;
  settingsGet: (payload: { tenant_id: string; key: string }) => Promise<any>;
  settingsSet: (payload: { tenant_id: string; key: string; value: any }) => Promise<{ success: boolean; error?: string }>;
  printReceipt: (tenant_id: string, data: string) => Promise<{ success: boolean; error?: string }>;
  openCashDrawer: (tenant_id: string) => Promise<{ success: boolean; error?: string }>;
  printBarcode: (tenant_id: string, barcode: string, price?: number, name?: string, quantity?: number, sp?: number, spType?: 'SP' | 'OFF') => Promise<{ success: boolean; error?: string }>;
  printBulkBarcodes: (tenant_id: string, items: Array<{ barcode: string; price?: number; name?: string; quantity: number; sp?: number; spType?: 'SP' | 'OFF' }>) => Promise<{ success: boolean; error?: string }>;
  getBulkPrintItems: () => Promise<any[]>;
  getPrinters: () => Promise<any[]>;
  getReceiptText: () => Promise<string>;
  getA4Html: () => Promise<string>;
  printReady: () => Promise<{ success: boolean; error?: string }>;
  printA4Html: (tenant_id: string, htmlContent: string) => Promise<{ success: boolean; useDefaultDialog?: boolean; error?: string }>;
  onUpdateStatus: (callback: (status: string) => void) => void;
  onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
  onUpdateInfo: (callback: (info: any) => void) => void;
  onBarcodeScanned: (callback: (code: string) => void) => void;
  onScaleWeight: (callback: (weight: number) => void) => void;
  onSyncDataUpdated: (callback: () => void) => void;
  onSyncCycleComplete: (callback: () => void) => void;
  onOnlineStatus: (callback: (online: boolean) => void) => void;
  onSyncProgress: (callback: (progress: SyncProgress) => void) => void;
  onTokenExpired: (callback: () => void) => void;
  dbDebugDumpInvoices: () => Promise<{ success: boolean; rows?: any[]; error?: string }>;
  dbGetNextServerInvoiceNumber: (payload: { tenant_id: string }) => Promise<{ success: boolean; invoiceNumber?: string; error?: string; offline?: boolean }>;
  dbGetNextInvoiceNumber: (payload: { tenant_id: string; prefix?: string }) => Promise<{ success: boolean; invoiceNumber?: string; counter?: number; error?: string }>;
  dbPeekNextInvoiceNumber: (payload: { tenant_id: string }) => Promise<{ success: boolean; invoiceNumber?: string; error?: string }>;
  dbGetParties: (tenant_id: string) => Promise<any[]>;
  dbAddParty: (party: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateParty: (party: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteParty: (party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbAdjustPartyBalance: (payload: { party_id: string; amount: number }) => Promise<{ success: boolean; error?: string }>;
  dbGetPartyLedger: (party_id: string) => Promise<any[]>;
  dbAddPartyLedgerEntry: (entry: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePartyLedgerEntry: (entry: any) => Promise<{ success: boolean; error?: string }>;
  dbDeletePartyLedgerEntry: (ledger_id: string, party_id: string) => Promise<{ success: boolean; error?: string }>;

  // Scrap (categories ARE items with price/stock/unit)
  dbDeduplicateScrapCategories: () => Promise<{ removed: number }>;
  dbGetScrapCategories: (tenant_id: string) => Promise<any[]>;
  dbAddScrapCategory: (cat: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateScrapCategory: (cat: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteScrapCategory: (scrap_category_id: string) => Promise<{ success: boolean; error?: string }>;
  dbAddScrapTransaction: (t: any) => Promise<{ success: boolean; error?: string }>;
  dbGetScrapTransactions: (args: { tenant_id: string; scrap_category_id?: string }) => Promise<any[]>;
  dbGetScrapCategoriesBySearch: (args: { tenant_id: string; search: string }) => Promise<any[]>;
  dbGetNextScrapInvoiceNumber: (args: { tenant_id: string }) => Promise<{ success: boolean; invoiceNumber?: string; error?: string }>;
  dbPeekNextScrapInvoiceNumber: (args: { tenant_id: string }) => Promise<{ success: boolean; invoiceNumber?: string; error?: string }>;
  dbGetScrapInvoiceByNumber: (args: { tenant_id: string; scrap_invoice_number: string }) => Promise<any>;
  dbGetScrapInvoiceList: (args: { tenant_id: string }) => Promise<any[]>;
  dbUpdateScrapInvoicePaymentStatus: (args: { tenant_id: string; scrap_invoice_number: string; payment_status: string }) => Promise<{ success: boolean; error?: string }>;

  // Stock Report
  dbGetStockReport: (tenant_id: string) => Promise<any[]>;

  // Quotations
  dbGetNextQuotationNumber: (payload: { tenant_id: string; prefix?: string }) => Promise<{ success: boolean; quotationNumber?: string; error?: string }>;
  dbPeekNextQuotationNumber: (payload: { tenant_id: string }) => Promise<{ success: boolean; quotationNumber?: string; error?: string }>;
  dbSaveQuotation: (q: any) => Promise<{ success: boolean; error?: string }>;
  dbGetQuotations: (args: { tenant_id: string; search?: string }) => Promise<any[]>;
  dbGetQuotationItems: (quotation_id: string) => Promise<any[]>;
  dbUpdateQuotationStatus: (args: { quotation_id: string; status?: string; converted_to_invoice?: number; invoice_id?: string }) => Promise<{ success: boolean; error?: string }>;
  dbDeleteQuotation: (quotation_id: string) => Promise<{ success: boolean; error?: string }>;
  dbUpdateQuotation: (q: any) => Promise<{ success: boolean; error?: string }>;

  // Warranties
  dbSaveWarranty: (w: any) => Promise<{ success: boolean; error?: string }>;
  dbGetWarranties: (args: { tenant_id: string; search?: string }) => Promise<any[]>;
  dbDeleteWarranty: (warranty_id: string) => Promise<{ success: boolean; error?: string }>;

  // Cashier & Settlement
  dbCashierGetDrawer: (params: { tenant_id: string; business_date?: string }) => Promise<any>;
  dbCashierSetOpeningBalance: (params: { tenant_id: string; opening_balance: number; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierGetPendingInvoices: (params: { tenant_id: string; search?: string }) => Promise<any[]>;
  dbCashierSettlePayment: (params: { tenant_id: string; invoice_id: string; received_amount: number; payment_method: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierAddTransaction: (params: { tenant_id: string; type: 'CASH_IN' | 'CASH_OUT'; amount: number; category?: string; notes?: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierDayClosing: (params: { tenant_id: string; actual_cash: number; closing_remarks?: string; user_id: string; user_name?: string; business_date?: string }) => Promise<{ success: boolean; error?: string; expected_closing?: number; actual_cash?: number; cash_short?: number; cash_excess?: number }>;
  dbCashierGetTransactions: (params: { tenant_id: string }) => Promise<any[]>;
  dbCashierGetHistory: (params: { tenant_id: string; limit?: number; offset?: number }) => Promise<any[]>;
  dbCashierGetDaySettlements: (params: { tenant_id: string; business_date: string }) => Promise<any[]>;
  dbCashierGetAuditLog: (params: { tenant_id: string; limit?: number; offset?: number }) => Promise<any[]>;

  // Purchase Bills
  dbGetNextPurchaseBillNumber: (payload: { tenant_id: string }) => Promise<{ success: boolean; billNumber?: string; counter?: number; error?: string }>;
  dbAddPurchaseBill: (payload: any) => Promise<{ success: boolean; error?: string }>;
  dbGetPurchaseBills: (args: { tenant_id: string; search?: string; limit?: number; offset?: number }) => Promise<any[]>;
  dbGetPurchaseBillItems: (purchase_bill_id: string) => Promise<any[]>;
  dbDeletePurchaseBill: (purchase_bill_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetPurchaseBillProducts: (args: { tenant_id: string; search?: string }) => Promise<any[]>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
