export interface SyncProgress {
  percent: number;
  label: string;
  recordsSynced: number;
  totalRecords: number;
}

export interface IElectronAPI {
  logError: (message: string, error?: any) => Promise<void>;
  ping: () => Promise<string>;
  dbDebugSyncState: (tenant_id: string) => Promise<unknown>;
  appCheckForUpdates: () => Promise<any>;
  appGetVersion: () => Promise<string>;
  appInstallUpdate: () => Promise<void>;
  appDownloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  dbGetProducts: (params: any) => Promise<any[]>;
  dbGetProductsCount: (params: any) => Promise<number>;
  dbGetProductsByIds: (params: { tenant_id: string; product_ids: string[] }) => Promise<any[]>;
  dbGetProductSuppliers?: (tenant_id: string) => Promise<Record<string, string[]>>;
  dbEnsureServiceItem: (params: { tenant_id: string }) => Promise<{ success: boolean; product_id?: string; error?: string }>;
  dbAddProduct: (product: any) => Promise<{ success: boolean; product_id?: string; error?: string }>;
  dbUpdateProduct: (product: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateProductName: (params: { tenant_id: string; product_id: string; name: string }) => Promise<{ success: boolean; error?: string }>;
  dbDeleteProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbBulkDeleteProducts: (product_ids: string[]) => Promise<{ success: boolean; count?: number; error?: string }>;
  dbAdjustStock: (args: { product_id: string; delta?: number; pcsDelta?: number }) => Promise<{ success: boolean; error?: string }>;
  dbBulkImportProducts: (products: any[]) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePrintStatus: (productIds: string[]) => Promise<{ success: boolean; error?: string }>;
  dbResetPrintStatus: (tenantId: string) => Promise<{ success: boolean; error?: string }>;
  dbGetPendingPrintProducts: (params: { tenant_id: string; limit: number; date?: string; dateEnd?: string; only_pending?: boolean }) => Promise<any[]>;
  dbCheckout: (payload: any & { discount_type?: string, discount_value?: number }) => Promise<{ success: boolean; invoice_id?: string; invoice_number?: string; error?: string }>;
  dbApplyInvoiceDiscount: (payload: { invoice_id: string; discount_type: 'FIXED' | 'PERCENTAGE'; discount_value: number; role: string }) => Promise<{ success: boolean; error?: string }>;
  dbGetInvoices: (filters: any) => Promise<any[]>;
  dbGetInvoicesSummary: (filters: any) => Promise<{ totalSales: number; totalSalesBeforeDeductions?: number; totalInvoices: number; totalTax: number; totalDiscount: number; avgOrder: number }>;
  dbGetDashboardStats: (tenantId: string) => Promise<{ success: boolean; totalSales: number; invoiceCount: number; error?: string }>;
  dbGetInvoiceItems: (invoice_id: string) => Promise<any[]>;
  dbUpdateInvoice: (payload: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateInvoicePayment: (payload: { invoice_id: string; tenant_id: string; payment_method: string; received_amount: number; balance_amount: number; split_details?: any }) => Promise<{ success: boolean; error?: string }>;
  dbGetCustomers: (params: { tenant_id: string; active?: boolean; credit?: boolean; pricing_tier_id?: string; search?: string; overdue?: boolean }) => Promise<any[]>;
  dbCreateCustomer: (customer: any) => Promise<{ success: boolean; customer_id?: string; error?: string }>;
  dbUpdateCustomer: (customer: any) => Promise<{ success: boolean; error?: string }>;
  dbCheckCustomerCreditStatus: (params: { tenant_id: string; customer_id?: string; customer_name?: string; customer_phone?: string }) => Promise<{ allowed: boolean; isOverdue: boolean; overdueCount: number; overdueAmount: number; oldestOverdueDays: number; restrictOnExpiry: boolean; creditPeriodEnabled: boolean; creditPeriodDays: number; customerName: string; error?: string }>;
  dbDeleteCustomer: (params: { customer_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string; deleted_party_count?: number }>;
  dbDeduplicateCustomers: (tenant_id?: string) => Promise<{ success: boolean; error?: string; merged_customers?: number; merged_parties?: number }>;
  dbGetCustomerInvoices: (params: { customer_id: string; tenant_id: string; phone?: string; name?: string }) => Promise<any[]>;
  dbGetCustomerLoyaltyTransactions: (params: { customer_id: string; tenant_id: string }) => Promise<any[]>;
  dbAdjustCustomerLoyaltyPoints: (params: { customer_id: string; tenant_id: string; points: number; reason?: string; user_name?: string }) => Promise<{ success: boolean; new_balance?: number; transaction_id?: string; error?: string }>;
  dbRecalculateCustomerLoyaltyPoints: (params: { tenant_id: string }) => Promise<{ success: boolean; updatedCount?: number; error?: string }>;
  dbGetGrades: (tenantId: string) => Promise<any[]>;
  dbAddGrade: (grade: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdateGrade: (grade: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteGrade: (grade_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetPricingTiers: (tenantId: string) => Promise<any[]>;
  dbAddPricingTier: (tier: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePricingTier: (tier: any) => Promise<{ success: boolean; error?: string }>;
  dbDeletePricingTier: (tier_id: string) => Promise<{ success: boolean; error?: string }>;
  dbReorderPricingTiers: (tiers: Array<{ pricing_tier_id: string; sort_order: number }>) => Promise<{ success: boolean; error?: string }>;
  dbSetDefaultPricingTier: (payload: { tenant_id: string; pricing_tier_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbGetProductPricing: (tenantId: string) => Promise<any[]>;
  dbSetProductPricing: (payload: { tenant_id: string; product_id: string; pricing: Array<{ pricing_tier_id: string; price: number | null }> }) => Promise<{ success: boolean; error?: string }>;
  dbSetTierPricing: (payload: { tenant_id: string; pricing_tier_id: string; pricing: Array<{ product_id: string; price: number | null }> }) => Promise<{ success: boolean; error?: string }>;
  dbGetStaff: (params: { tenant_id: string; search?: string; status?: string }) => Promise<any[]>;
  dbSaveStaff: (params: any) => Promise<any>;
  dbVerifyBillerPin: (params: { tenant_id: string; pin: string }) => Promise<{ success: boolean; staff?: any; error?: string }>;
  dbGetStaffLedger: (params: { tenant_id: string; staff_id: string }) => Promise<any[]>;
  dbAddStaffTransaction: (params: any) => Promise<{ success: boolean; transaction_id?: string; ledger_id?: string; new_balance?: number; error?: string }>;
  dbGetStaffAttendance: (params: { tenant_id: string; staff_id?: string; date?: string; month?: string }) => Promise<any[]>;
  dbSaveStaffAttendance: (params: any) => Promise<{ success: boolean; attendance_id?: string; error?: string }>;

  runInitialSync: () => Promise<{ success: boolean; error?: string }>;
  forceResyncInvoices: () => Promise<{ success: boolean; error?: string }>;
  getSyncProgress: () => Promise<SyncProgress | null>;
  testNetworkConnection?: (payload: { syncMode?: string; lanRole?: string; lanHostIp?: string; lanPort?: number }) => Promise<{ ok: boolean; route?: string; fallback?: boolean; message?: string; error?: string }>;
  authSaveToken: (payload: { jwt_token: string; tenant_id: string; role: string; user_id: string; user_name?: string; shop_name: string; domain_type?: string; restricted_page?: string; password_hash?: string; email?: string; permissions?: string[]; login_enabled?: boolean }) => Promise<{ success: boolean; error?: string }>;
  authGetToken: () => Promise<{ jwt_token: string; tenant_id: string; role: string; user_id: string; user_name?: string; shop_name: string; domain_type?: string; restricted_page?: string; password_hash?: string; email?: string; permissions?: string[]; login_enabled?: boolean } | null>;
  authSaveOfflineSession: (payload: { tenant_id: string; user_id: string; role: string; user_name: string; shop_name: string; restricted_page?: string | null; permissions: string[] }) => Promise<{ success: boolean; error?: string }>;
  authGetOfflineSession: () => Promise<{ tenant_id: string; user_id: string; role: string; user_name: string; shop_name: string; restricted_page?: string | null; permissions: string[] } | null>;
  authClearToken: () => Promise<{ success: boolean; error?: string }>;
  authSaveLocalUser: (payload: any) => Promise<{ success: boolean; error?: string }>;
  authLoginOffline: (payload: { email: string; password: string }) => Promise<{ success: boolean; error?: string; user?: any }>;
  appGetLocalIp?: () => Promise<string>;
  appGetNetworkDetails?: () => Promise<{ ip: string; subnetPrefix: string; netmask: string; gateway: string; dns: string }>;
  getCloudAccessState?: () => Promise<any>;
  onCloudStateChanged?: (callback: (state: any) => void) => () => void;
  drainPendingCloudQueue?: () => Promise<{ success: boolean; error?: string }>;
  updateCloudAccessConfig?: (config: any) => Promise<{ success: boolean; error?: string }>;
  onDeepLink: (callback: (token: string) => void) => void;
  settingsGet: (payload: { tenant_id: string; key: string }) => Promise<any>;
  settingsGetAll?: (payload: { tenant_id: string }) => Promise<Record<string, any>>;
  settingsSet: (payload: { tenant_id: string; key: string; value: any }) => Promise<{ success: boolean; error?: string }>;
  printReceipt: (tenant_id: string, data: string) => Promise<{ success: boolean; error?: string; skipped?: boolean }>;
  dbDeleteInvoice: (invoice_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedInvoices: (tenantId: string) => Promise<any[]>;
  dbRestoreInvoice: (invoice_id: string) => Promise<{ success: boolean; error?: string }>;
  dbHardDeleteInvoice: (invoice_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedProducts: (tenantId: string) => Promise<any[]>;
  dbRestoreProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbHardDeleteProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedCustomers: (tenantId: string) => Promise<any[]>;
  dbRestoreCustomer: (args: { customer_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedParties: (tenantId: string) => Promise<any[]>;
  dbHardDeleteCustomer: (args: { customer_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbHardDeleteParty: (party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetRecycleBinSummary: (tenantId: string) => Promise<{ invoices: number; invoicesValue: number; products: number; customers: number; parties: number }>;
  dbEmptyRecycleBin: (payload: { category: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbUpdateScrapInvoiceHeader: (args: any) => Promise<{ success: boolean; error?: string }>;
  openCashDrawer: (tenant_id: string) => Promise<{ success: boolean; error?: string }>;
  printBarcode: (tenant_id: string, barcode: string, price?: number, name?: string, quantity?: number, sp?: number, spType?: 'SP' | 'OFF') => Promise<{ success: boolean; error?: string }>;
  printBulkBarcodes: (tenant_id: string, items: Array<{ barcode: string; price?: number; name?: string; quantity: number; sp?: number; spType?: 'SP' | 'OFF' }>) => Promise<{ success: boolean; error?: string; printed?: string[] }>;
  getBulkPrintItems: () => Promise<any[]>;
  getPrinters: () => Promise<any[]>;
  getReceiptText: () => Promise<string>;
  getA4Html: () => Promise<string>;
  printReady: (contentHeightPx?: number) => Promise<{ success: boolean; error?: string }>;
  printA4Html: (tenant_id: string, htmlContent: string) => Promise<{ success: boolean; useDefaultDialog?: boolean; error?: string }>;
  exportA4Pdf: (tenant_id: string, htmlContent: string, defaultFilename?: string, pdfOptions?: { displayHeaderFooter?: boolean; headerTemplate?: string; footerTemplate?: string }) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;

  // WhatsApp APIs
  whatsappGetStatus: () => Promise<{ status: 'disconnected' | 'connecting' | 'connected'; qrCode: string | null; phone: string | null }>;
  whatsappConnect: () => Promise<{ success: boolean; status: string; qrCode?: string | null; phone?: string | null }>;
  whatsappDisconnect: () => Promise<{ success: boolean; error?: string }>;
  whatsappSendInvoice: (payload: { phone: string; message: string; htmlContent?: string; fileName?: string }) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  onWhatsAppStatusUpdate: (callback: (data: { status: 'disconnected' | 'connecting' | 'syncing' | 'connected'; qrCode: string | null; phone: string | null }) => void) => () => void;
  // Shop Closing Overview WhatsApp APIs
  shopClosingGetConfig: (params: { tenant_id?: string }) => Promise<any>;
  shopClosingSaveConfig: (params: { tenant_id?: string; config: any; user_role?: string }) => Promise<{ success: boolean; error?: string; config?: any }>;
  shopClosingGetPreview: (params: { tenant_id?: string; business_date?: string; checklist?: any }) => Promise<{ success: boolean; summary?: any; message?: string; error?: string }>;
  shopClosingSendReport: (params: { tenant_id?: string; business_date?: string; trigger_type?: string; force?: boolean; custom_phone?: string; custom_checklist?: any }) => Promise<{ success: boolean; messageId?: string; error?: string; reportId?: string }>;
  shopClosingGetHistory: (params: { tenant_id?: string; limit?: number }) => Promise<any[]>;
  shopClosingRetry: (params: { report_id: string }) => Promise<{ success: boolean; error?: string }>;
  onShopClosingUpdated: (callback: () => void) => () => void;
  onUpdateStatus: (callback: (status: string) => void) => void;
  onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
  onUpdateInfo: (callback: (info: any) => void) => void;
  onBarcodeScanned: (callback: (code: string) => void) => () => void;
  onScaleWeight: (callback: (weight: number) => void) => () => void;
  onSyncDataUpdated: (callback: () => void) => (() => void);
  onSyncCycleComplete: (callback: () => void) => (() => void);
  onOnlineStatus: (callback: (online: boolean, route?: 'LAN' | 'CLOUD' | 'NONE') => void) => (() => void);
  onSyncProgress: (callback: (progress: SyncProgress) => void) => (() => void) | void;
  onTokenExpired: (callback: () => void) => (() => void) | void;
  dbConvertBosToGst: (payload: { invoice_ids: string[]; tenant_id: string; user_id: string; tax_mode?: 'EXCLUSIVE' | 'INCLUSIVE' }) => Promise<{ success: boolean; results?: { invoice_id: string; old_number: string; new_number: string; success: boolean; error?: string; skipped_items?: string[] }[]; error?: string }>;
  dbPreviewConvertBosToGst: (payload: { invoice_ids: string[]; tenant_id: string; tax_mode?: 'EXCLUSIVE' | 'INCLUSIVE' }) => Promise<{
    success: boolean;
    invoices?: {
      invoice_id: string;
      invoice_number: string;
      bos_grand_total: number;
      converted_grand_total: number;
      has_real_gst: boolean;
      has_paper: boolean;
      skipped_items: string[];
    }[];
    total_bos_amount?: number;
    total_converted_amount?: number;
    has_real_gst?: boolean;
    has_paper?: boolean;
    has_skipped?: boolean;
    error?: string;
  }>;
  dbGetNextServerInvoiceNumber: (payload: { tenant_id: string; series?: string; start?: number }) => Promise<{ success: boolean; invoiceNumber?: string; error?: string; offline?: boolean }>;
  dbGetNextInvoiceNumber: (payload: { tenant_id: string; prefix?: string; series?: string }) => Promise<{ success: boolean; invoiceNumber?: string; counter?: number; error?: string }>;
  dbPeekNextInvoiceNumber: (payload: { tenant_id: string; series?: string }) => Promise<{ success: boolean; invoiceNumber?: string; counter?: number; prefix?: string; error?: string }>;
  dbFindCustomers: (params: { tenant_id: string; name?: string; phone?: string }) => Promise<any[]>;
  dbGetParties: (tenant_id: string, includeDeleted?: boolean) => Promise<any[]>;
  dbAddParty: (party: any) => Promise<{ success: boolean; error?: string }>;
  dbBulkImportParties: (parties: any[]) => Promise<{ success: boolean; error?: string }>;
  dbUpdateParty: (party: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteParty: (party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbRestoreParty: (party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbMergeParties: (payload: { tenant_id: string; primary_party_id: string; secondary_party_id: string }) => Promise<{ success: boolean; error?: string; primary_party_id?: string; secondary_party_id?: string }>;
  dbAdjustPartyBalance: (payload: { party_id: string; amount: number }) => Promise<{ success: boolean; error?: string }>;
  dbGetPartyLedger: (party_id: string, includeDeleted?: boolean) => Promise<any[]>;
  dbAddPartyLedgerEntry: (entry: any) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePartyLedgerEntry: (entry: any) => Promise<{ success: boolean; error?: string }>;
  dbDeletePartyLedgerEntry: (ledger_id: string, party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbRestorePartyLedgerEntry: (ledger_id: string, party_id: string) => Promise<{ success: boolean; error?: string }>;

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
  dbUpdateScrapTransaction: (args: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteScrapTransaction: (args: { tenant_id: string; transaction_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbDeleteScrapInvoice: (args: { tenant_id: string; scrap_invoice_number: string }) => Promise<{ success: boolean; error?: string }>;
  dbUpdateScrapInvoiceFull: (payload: { tenant_id: string; scrap_invoice_number: string | null; party_name: string | null; customer_phone: string | null; customer_address: string | null; payment_status: string; items: any[] }) => Promise<{ success: boolean; error?: string }>;
  dbUpsertScrapCreditLedger: (args: { tenant_id: string; scrap_invoice_number: string; payment_status: string; party_name?: string | null; customer_phone?: string | null; customer_address?: string | null; user_id?: string; user_name?: string }) => Promise<{ success: boolean; error?: string; party_id?: string }>;

  // Stock Report
  dbGetStockReport: (tenant_id: string) => Promise<any[]>;
  dbGetProductBillQuantities: (tenant_id: string) => Promise<{ product_id: string; gst_qty: number; estimate_qty: number }[]>;
  dbUpdateProductGstFlag: (payload: { tenant_id: string; product_id: string; is_gst_applicable: number }) => Promise<{ success: boolean; error?: string }>;
  dbGetProductSalesSummary: (payload: { tenant_id: string; fromDate?: string; toDate?: string }) => Promise<{ product_id: string; name: string; gst_qty: number; bos_qty: number; total_qty: number; total_revenue?: number }[]>;
  dbGetBosConvertibleInvoices: (tenant_id: string) => Promise<{ invoice_id: string; convertible: number }[]>;

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
  dbCashierSettlePayment: (params: { tenant_id: string; invoice_id: string; received_amount: number; discount_amount?: number; payment_method: string; payment_source_id?: string; split_details?: any; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierAddTransaction: (params: { tenant_id: string; type: 'CASH_IN' | 'CASH_OUT'; amount: number; category?: string; notes?: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierDayClosing: (params: { tenant_id: string; actual_cash: number; closing_remarks?: string; user_id: string; user_name?: string; business_date?: string }) => Promise<{ success: boolean; error?: string; expected_closing?: number; actual_cash?: number; cash_short?: number; cash_excess?: number }>;
  dbCashierReopenDrawer: (params: { tenant_id: string; drawer_id: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierDeleteTransaction: (params: { tenant_id: string; transaction_id: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierGetTransactions: (params: { tenant_id: string }) => Promise<any[]>;
  dbCashierGetHistory: (params: { tenant_id: string; limit?: number; offset?: number }) => Promise<any[]>;
  dbCashierGetDaySettlements: (params: { tenant_id: string; business_date: string }) => Promise<any[]>;
  dbCashierGetDayTransactions?: (params: { tenant_id: string; business_date?: string; from_date?: string; to_date?: string }) => Promise<any[]>;
  dbCashierGetAuditLog: (params: { tenant_id: string; limit?: number; offset?: number }) => Promise<any[]>;
  dbCashierGetCategories: (params: { tenant_id: string }) => Promise<any[]>;
  dbCashierAddCategory: (params: { tenant_id: string; name: string; type: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierDeleteCategory: (params: { category_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;

  // Payment Methods (BANK / CARD / UPI sources)
  dbPaymentGetSources: (tenant_id: string) => Promise<any[]>;
  dbPaymentAddSource: (source: any) => Promise<{ success: boolean; source_id?: string; error?: string }>;
  dbPaymentUpdateSource: (source: any) => Promise<{ success: boolean; error?: string }>;
  dbPaymentDeleteSource: (params: { source_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbPaymentGetTransactions: (params: { source_id: string; tenant_id: string }) => Promise<any[]>;
  dbPaymentAddTransaction: (tx: any) => Promise<{ success: boolean; balance?: number; error?: string }>;

  // Purchase Bills
  dbPeekNextPurchaseBillNumber: (payload: { tenant_id: string; bill_type?: string }) => Promise<{ success: boolean; billNumber?: string; counter?: number; error?: string }>;
  dbGetNextPurchaseBillNumber: (payload: { tenant_id: string; bill_type?: string }) => Promise<{ success: boolean; billNumber?: string; counter?: number; error?: string }>;
  dbAddPurchaseBill: (payload: any) => Promise<{ success: boolean; error?: string }>;
  dbGetPurchaseBills: (args: { tenant_id: string; search?: string; limit?: number; offset?: number }) => Promise<any[]>;
  dbGetPurchaseBillItems: (purchase_bill_id: string) => Promise<any[]>;
  dbDeletePurchaseBill: (purchase_bill_id: string) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePurchaseBill: (payload: any) => Promise<{ success: boolean; error?: string }>;
  dbGetPurchaseBillProducts: (args: { tenant_id: string; search?: string; limit?: number; numericPrefixOnly?: boolean }) => Promise<any[]>;
  dbProductHasEstimateBills: (args: { product_id: string; tenant_id: string }) => Promise<{ success: boolean; hasEstimate?: boolean; error?: string }>;
  dbGenerateBarcode: (args: { tenant_id: string; item_code?: string; strip_suffix?: string }) => Promise<{ success: boolean; barcode?: string; error?: string }>;

  // Returns
  dbCreateReturn: (payload: any) => Promise<{ success: boolean; error?: string }>;
  dbGetReturns: (filters: { tenant_id: string; invoice_id?: string; limit?: number; offset?: number; search?: string }) => Promise<any[]>;
  dbGetReturnItems: (return_id: string) => Promise<any[]>;
  dbDeleteReturn: (return_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetNextReturnNumber: (payload: { tenant_id: string; prefix?: string }) => Promise<{ success: boolean; returnNumber?: string; error?: string }>;
  dbPeekNextReturnNumber: (payload: { tenant_id: string; prefix?: string }) => Promise<{ success: boolean; returnNumber?: string; error?: string }>;
  dbGetAlreadyReturnedQuantities: (invoiceId: string) => Promise<any[]>;
  dbGetReturnableInvoices: (payload: { tenant_id: string; search?: string; limit?: number; role?: string; user_id?: string }) => Promise<any[]>;
  dbGetReturnInvoiceByNumber: (payload: { tenant_id: string; return_number: string }) => Promise<any>;
  dbGetPendingReturnInvoices: (payload: { tenant_id: string; search?: string }) => Promise<any[]>;
  dbSettleReturnInvoice: (payload: { tenant_id: string; return_number: string; adjusted_invoice_number: string; amount: number }) => Promise<{ success: boolean; error?: string }>;

  // Hold Bill
  dbHoldBill: (payload: any) => Promise<{ success: boolean; error?: string }>;
  dbGetHeldBills: (payload: { tenant_id: string }) => Promise<any[]>;
  dbRecallHeldBill: (payload: { invoice_id: string }) => Promise<{ success: boolean; invoice?: any; items?: any[]; error?: string }>;
  dbReleaseHeldBill: (payload: { invoice_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbExpireStaleHeldBills: (payload: { tenant_id: string }) => Promise<{ success: boolean; expiredCount?: number; error?: string }>;

  // Diagnostic sync helpers
  syncClearPending: (payload: { tenant_id: string; type: 'invoices' | 'products' | 'all'; records?: string[] }) => Promise<{ success: boolean; error?: string }>;
  syncGetPending: (payload: { tenant_id: string }) => Promise<{ success: boolean; pending: { invoices: any[]; products: any[] }; error?: string }>;

  // Combo Offers
  dbGetComboOffers: (params: { tenant_id: string; search?: string; only_active?: boolean }) => Promise<any[]>;
  dbGetComboOfferDetails: (params: { combo_id: string; tenant_id: string }) => Promise<any>;
  dbSaveComboOffer: (combo: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteComboOffer: (params: { combo_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbToggleComboOfferActive: (params: { combo_id: string; tenant_id: string; is_active: boolean }) => Promise<{ success: boolean; error?: string }>;

  setPageContext: (payload: { page: string; active: boolean }) => Promise<{ success: boolean; error?: string }>;
  resetFastPollBackoff: () => Promise<{ success: boolean; error?: string }>;

  // E-Commerce / FusionCart Integration
  ecommerceGetSettings: (payload: { tenant_id: string }) => Promise<{ success: boolean; settings?: any; error?: string }>;
  ecommerceSaveSettings: (payload: { tenant_id: string; settings: any }) => Promise<{ success: boolean; settings?: any; error?: string }>;
  ecommerceTestConnection: (payload: { url?: string }) => Promise<{ connected: boolean; message?: string }>;
  ecommerceRegisterVendor: (payload: { tenant_id: string; data: any }) => Promise<{ success: boolean; settings?: any; error?: string }>;
  ecommerceRefreshStatus: (payload: { tenant_id: string }) => Promise<{ success: boolean; settings?: any; store?: any; error?: string }>;
  ecommerceGetProducts: (payload: { tenant_id: string; search?: string; filter?: string }) => Promise<{ success: boolean; products: any[]; error?: string }>;
  ecommerceUpdateMapping: (payload: any) => Promise<{ success: boolean; mapping?: any; error?: string }>;
  ecommerceSyncProduct: (payload: { tenant_id: string; product_id: string }) => Promise<{ success: boolean; remoteId?: number; error?: string }>;
  ecommerceUnpublishProduct: (payload: { tenant_id: string; product_id: string }) => Promise<{ success: boolean; error?: string }>;
  ecommerceGetOrders: (payload: { tenant_id: string }) => Promise<{ success: boolean; orders: any[]; error?: string }>;

  // Emergency Purge & Kill Switch
  dbEmergencyPurge?: (payload: { wipe_mode?: 'ALL_DATA' | 'SALES_AND_CASH_ONLY'; reason?: string }) => Promise<{ success: boolean; clearedTables?: string[]; error?: string }>;
  onEmergencyPurged?: (callback: (data: { wipeMode: string; reason?: string }) => void) => (() => void);
}


declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
