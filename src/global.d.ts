import type { Invoice, InvoiceItem, InvoiceItemWithProduct } from './data/invoices';
import type { AppCheckForUpdatesResult, AppInstallUpdateResult, AppRendererReadyResult, UpdateInfoPayload } from './data/app';
import type { Product } from './data/products';
import type { StockReportResult } from './data/products';
import type { Party } from './data/parties';
import type { CustomerListItem } from './data/customers';
import type { Grade } from './data/grades';
import type { SaveStaffResult, StaffListItem } from './data/staff';
import type { ComboOfferDetails, ComboOfferWithItems } from './data/combos';
import type { PaymentSource } from './data/paymentSources';
import type { PurchaseBillItemWithProduct, PurchaseSearchProduct } from './data/purchases';
import type { ScrapInvoiceByNumberResult, ScrapInvoiceListResult, ScrapTransactionWithCategory } from './data/scrap';
import type { PricingTier } from './data/pricingTiers';
import type { DeletedInvoice, DeletedProduct, DeletedCustomer, DeletedParty } from './data/recycleBin';
import type { OfflineLoginResult, PinLoginResult, TerminalConfigResult, RejectedCloudSession, CloudSessionResumeRequest, CloudLoginReply } from './data/auth';
import type { EffectiveCloudState } from './data/sync';
import type { BulkPrintItem } from './data/printing';
import type { CardTerminalPayment, CardTerminalStatus, CardTerminalTransaction } from './data/cardTerminal';
import type { CashDrawerResult } from './data/cashier';
import type { ReturnInvoiceByNumberResult } from './data/returns';
import type { EcommerceOrdersResult, EcommerceProductsResult } from './data/ecommerce';
import type { ShopClosingConfigResult, ShopClosingHistoryRow, ShopClosingPreviewResult, ShopClosingSaveConfigResult } from './data/whatsapp';
import type * as Rows from './data/dbRows';
import type * as R from './data/restaurant';
export interface SyncProgress {
  percent: number;
  label: string;
  recordsSynced: number;
  totalRecords: number;
}

/** Drawer auto close state (`db:cashier:getAutoCloseStatus`). `time` is HH:MM in the store timezone (before 12:00 =
 * after midnight); `due_at` is UTC ISO including a snooze; `is_due` = ask the cashier now. */
export interface CashDrawerAutoCloseStatus {
  enabled: boolean;
  time: string;
  drawer_id: string | null;
  business_date: string | null;
  due_at: string | null;
  is_due: boolean;
}

export interface IElectronAPI {
  logError: (message: string, error?: unknown) => Promise<void>;
  ping: () => Promise<string>;
  dbDebugSyncState: (tenant_id: string) => Promise<unknown>;
  appCheckForUpdates: () => Promise<AppCheckForUpdatesResult>;
  appGetVersion: () => Promise<string>;
  appRendererReady: () => Promise<AppRendererReadyResult>;
  appInstallUpdate: () => Promise<AppInstallUpdateResult>;
  appDownloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  dbGetProducts: (params: unknown) => Promise<Product[]>;
  dbGetProductsCount: (params: unknown) => Promise<number>;
  dbGetProductsByIds: (params: { tenant_id: string; product_ids: string[] }) => Promise<Product[]>;
  dbGetProductSuppliers?: (tenant_id: string) => Promise<Record<string, string[]>>;
  dbEnsureServiceItem: (params: { tenant_id: string }) => Promise<{ success: boolean; product_id?: string; error?: string }>;
  dbAddProduct: (product: unknown) => Promise<{ success: boolean; product_id?: string; error?: string }>;
  dbUpdateProduct: (product: unknown) => Promise<{ success: boolean; error?: string }>;
  dbUpdateProductName: (params: { tenant_id: string; product_id: string; name: string }) => Promise<{ success: boolean; error?: string }>;
  dbDeleteProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbBulkDeleteProducts: (product_ids: string[]) => Promise<{ success: boolean; count?: number; error?: string }>;
  dbAdjustStock: (args: { product_id: string; delta?: number; pcsDelta?: number }) => Promise<{ success: boolean; error?: string }>;
  dbBulkImportProducts: (products: unknown[]) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePrintStatus: (productIds: string[]) => Promise<{ success: boolean; error?: string }>;
  dbResetPrintStatus: (tenantId: string) => Promise<{ success: boolean; error?: string }>;
  dbGetPendingPrintProducts: (params: { tenant_id: string; limit: number; date?: string; dateEnd?: string; only_pending?: boolean }) => Promise<Product[]>;
  dbCheckout: (payload: Record<string, unknown> & { discount_type?: string, discount_value?: number }) => Promise<{ success: boolean; invoice_id?: string; invoice_number?: string; error?: string }>;
  dbApplyInvoiceDiscount: (payload: { invoice_id: string; discount_type: 'FIXED' | 'PERCENTAGE'; discount_value: number; role: string }) => Promise<{ success: boolean; error?: string }>;
  dbGetInvoices: (filters: unknown) => Promise<Invoice[]>;
  dbGetInvoicesSummary: (filters: unknown) => Promise<import('./data/invoices').InvoiceSummary>;
  dbGetDashboardStats: (tenantId: string) => Promise<{ success: boolean; totalSales: number; totalSalesBeforeDeductions?: number; invoiceCount: number; error?: string }>;
  dbGetGstReport: (payload: { tenant_id: string; from_date: string; to_date: string; shop_state_code?: string }) => Promise<import('../electron/services/gstReportService').Gstr1Report | { error: string }>;
  dbGetLocalGstFilings: () => Promise<import('../electron/services/gstReportService').LocalGstFilingRow[] | { error: string }>;
  dbUpsertLocalGstFiling: (payload: { id?: string; period: string; return_type: string; status: string; filing_mode: string; gross_taxable_value: number; total_tax_amount: number; summary_payload?: string; approved_by?: string; approved_at?: string }) => Promise<{ success: boolean; id?: string } | { error: string }>;
  dbRecordLocalManualAcknowledgement: (payload: { id?: string; period: string; return_type: string; acknowledgement_number: string; filing_date: string; gross_taxable_value: number; total_tax_amount: number; approved_by?: string; approved_at?: string }) => Promise<{ success: boolean; id?: string } | { error: string }>;
  dbGetVatReport: (payload: { tenant_id: string; from_date: string; to_date: string; shop_emirate?: string; shop_trn?: string; shop_name?: string }) => Promise<import('../electron/services/vatReportService').Vat201Report | { error: string }>;
  dbGetLocalVatFilings: () => Promise<import('../electron/services/vatFilingService').LocalVatFilingRow[] | { error: string }>;
  dbUpsertLocalVatFiling: (payload: { id?: string; period: string; return_type?: string; status: string; filing_mode: string; net_output_vat: number; recoverable_input_vat: number; net_vat_payable: number; net_vat_status: string; summary_payload?: string; notes?: string; approved_by?: string; approved_at?: string }) => Promise<{ success: boolean; id?: string } | { error: string }>;
  dbRecordLocalVatManualAck: (payload: { id?: string; period: string; return_type?: string; filing_mode?: string; acknowledgement_number: string; filing_date: string; net_output_vat: number; recoverable_input_vat: number; net_vat_payable: number; net_vat_status: string; notes?: string; approved_by?: string; approved_at?: string }) => Promise<{ success: boolean; id?: string } | { error: string }>;
  dbGetEinvoiceStatuses: (payload: { tenant_id: string; document_ids: string[] }) => Promise<import('./data/einvoice').EinvoiceStatusRow[]>;
  dbGetEinvoiceSummary: (payload: { tenant_id: string }) => Promise<{ status: string; count: number }[]>;
  dbGetCustomerEinvoiceProfile: (payload: { tenant_id: string; customer_id: string }) => Promise<import('./data/einvoice').CustomerEinvoiceRow | null>;
  dbSaveCustomerEinvoiceProfile: (payload: { tenant_id: string; customer_id: string; profile: unknown }) => Promise<{ success: boolean; error?: string }>;
  dbGetInvoiceItems: (invoice_id: string) => Promise<InvoiceItem[]>;
  dbUpdateInvoice: (payload: unknown) => Promise<{ success: boolean; error?: string }>;
  dbUpdateInvoicePayment: (payload: { invoice_id: string; tenant_id: string; payment_method: string; received_amount: number; balance_amount: number; split_details?: unknown }) => Promise<{ success: boolean; error?: string }>;
  dbGetCustomers: (params: { tenant_id: string; active?: boolean; credit?: boolean; pricing_tier_id?: string; search?: string; overdue?: boolean }) => Promise<CustomerListItem[]>;
  dbCreateCustomer: (customer: unknown) => Promise<{ success: boolean; customer_id?: string; error?: string }>;
  dbUpdateCustomer: (customer: unknown) => Promise<{ success: boolean; error?: string }>;
  dbCheckCustomerCreditStatus: (params: { tenant_id: string; customer_id?: string; customer_name?: string; customer_phone?: string }) => Promise<{ allowed: boolean; isOverdue: boolean; overdueCount: number; overdueAmount: number; oldestOverdueDays: number; restrictOnExpiry: boolean; creditPeriodEnabled: boolean; creditPeriodDays: number; customerName: string; error?: string }>;
  dbDeleteCustomer: (params: { customer_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string; deleted_party_count?: number }>;
  dbDeduplicateCustomers: (tenant_id?: string) => Promise<{ success: boolean; error?: string; merged_customers?: number; merged_parties?: number }>;
  dbGetCustomerInvoices: (params: { customer_id: string; tenant_id: string; phone?: string | null; name?: string }) => Promise<Rows.InvoicesRow[]>;
  dbGetCustomerLoyaltyTransactions: (params: { customer_id: string; tenant_id: string }) => Promise<Rows.LoyaltyTransactionsRow[]>;
  dbAdjustCustomerLoyaltyPoints: (params: { customer_id: string; tenant_id: string; points: number; reason?: string; user_name?: string }) => Promise<{ success: boolean; new_balance?: number; transaction_id?: string; error?: string }>;
  dbRecalculateCustomerLoyaltyPoints: (params: { tenant_id: string }) => Promise<{ success: boolean; updatedCount?: number; error?: string }>;
  dbGetGrades: (tenantId: string) => Promise<Grade[]>;
  dbAddGrade: (grade: unknown) => Promise<{ success: boolean; error?: string }>;
  dbUpdateGrade: (grade: unknown) => Promise<{ success: boolean; error?: string }>;
  dbDeleteGrade: (grade_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetPricingTiers: (tenantId: string) => Promise<PricingTier[]>;
  dbAddPricingTier: (tier: unknown) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePricingTier: (tier: unknown) => Promise<{ success: boolean; error?: string }>;
  dbDeletePricingTier: (tier_id: string) => Promise<{ success: boolean; error?: string }>;
  dbReorderPricingTiers: (tiers: Array<{ pricing_tier_id: string; sort_order: number }>) => Promise<{ success: boolean; error?: string }>;
  dbSetDefaultPricingTier: (payload: { tenant_id: string; pricing_tier_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbGetProductPricing: (tenantId: string) => Promise<Rows.ProductPricingRow[]>;
  dbSetProductPricing: (payload: { tenant_id: string; product_id: string; pricing: Array<{ pricing_tier_id: string; price: number | null }> }) => Promise<{ success: boolean; error?: string }>;
  dbSetTierPricing: (payload: { tenant_id: string; pricing_tier_id: string; pricing: Array<{ product_id: string; price: number | null }> }) => Promise<{ success: boolean; error?: string }>;
  dbGetStaff: (params: { tenant_id: string; search?: string; status?: string }) => Promise<StaffListItem[]>;
  dbSaveStaff: (params: unknown) => Promise<SaveStaffResult>;
  dbVerifyBillerPin: (params: { tenant_id: string; pin: string }) => Promise<{ success: boolean; staff?: Rows.StaffRow; error?: string }>;
  dbGetStaffLedger: (params: { tenant_id: string; staff_id: string }) => Promise<Rows.StaffLedgerRow[]>;
  dbAddStaffTransaction: (params: unknown) => Promise<{ success: boolean; transaction_id?: string; ledger_id?: string; new_balance?: number; error?: string }>;
  dbGetStaffAttendance: (params: { tenant_id: string; staff_id?: string; date?: string; month?: string }) => Promise<Rows.StaffAttendanceRow[]>;
  dbSaveStaffAttendance: (params: unknown) => Promise<{ success: boolean; attendance_id?: string; error?: string }>;

  runInitialSync: () => Promise<{ success: boolean; error?: string }>;
  forceResyncInvoices: () => Promise<{ success: boolean; error?: string }>;
  forceResyncCatalog: () => Promise<{ success: boolean; error?: string }>;
  forceResyncEntities: (categories: string[]) => Promise<{ success: boolean; error?: string }>;
  getSyncProgress: () => Promise<SyncProgress | null>;
  testNetworkConnection?: (payload: { syncMode?: string; lanRole?: string; lanHostIp?: string; lanPort?: number; lanPairingKey?: string }) => Promise<{ ok: boolean; route?: string; fallback?: boolean; message?: string; error?: string }>;
  authSaveToken: (payload: { jwt_token: string; tenant_id: string; role: string; user_id: string; user_name?: string; shop_name: string; domain_type?: string; restricted_page?: string; password_hash?: string; email?: string; permissions?: string[]; login_enabled?: boolean }) => Promise<{ success: boolean; error?: string }>;
  authLoginCloud: (payload: { email: string; password: string }) => Promise<CloudLoginReply>;
  authResumeCloudSession: (payload: CloudSessionResumeRequest) => Promise<{ success: boolean; error?: string }>;
  authGetToken: () => Promise<{ jwt_token: string; tenant_id: string; role: string; user_id: string; user_name?: string; shop_name: string; domain_type?: string; restricted_page?: string; password_hash?: string; email?: string; permissions?: string[]; login_enabled?: boolean } | null>;
  authSaveOfflineSession: (payload: { tenant_id: string; user_id: string; role: string; user_name: string; shop_name: string; restricted_page?: string | null; permissions: string[] }) => Promise<{ success: boolean; error?: string; cloud_sync_ready?: boolean }>;
  authGetOfflineSession: () => Promise<{ tenant_id: string; user_id: string; role: string; user_name: string; shop_name: string; restricted_page?: string | null; permissions: string[] } | null>;
  authClearToken: () => Promise<{ success: boolean; error?: string }>;
  authSaveLocalUser: (payload: unknown) => Promise<{ success: boolean; error?: string }>;
  authLoginOffline: (payload: { email: string; password: string }) => Promise<OfflineLoginResult>;
  authLoginWithPin: (payload: { pin: string; tenant_id?: string }) => Promise<PinLoginResult>;
  authGetTerminalConfig: () => Promise<TerminalConfigResult>;
  authGetTrialAccess: (payload: { tenant_id: string }) => Promise<{ is_trial: boolean; allowed: boolean; error?: string; token?: string; expires_at?: number }>;
  authRefreshTrialSession: (payload: { expected_token: string; tenant_id: string; user_id: string; token: string; role: 'ADMIN' | 'STAFF'; permissions: string[]; user_name: string; restricted_page: string | null }) => Promise<{ success: boolean; error?: string }>;
  authBlockTrialAccess: (payload: { tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  appGetLocalIp?: () => Promise<string>;
  appGetNetworkDetails?: () => Promise<{ ip: string; subnetPrefix: string; netmask: string; gateway: string; dns: string }>;
  getCloudAccessState?: () => Promise<EffectiveCloudState | null>;
  onCloudStateChanged?: (callback: (state: EffectiveCloudState) => void) => () => void;
  drainPendingCloudQueue?: () => Promise<{ success: boolean; error?: string }>;
  updateCloudAccessConfig?: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  onDeepLink: (callback: (token: string) => void) => void;
  settingsGet: (payload: { tenant_id: string; key: string; tenant_only?: boolean }) => Promise<unknown>;
  settingsGetAll?: (payload: { tenant_id: string }) => Promise<Record<string, unknown>>;
  settingsSet: (payload: { tenant_id: string; key: string; value: unknown }) => Promise<{ success: boolean; error?: string }>;
  printReceipt: (tenant_id: string, data: string) => Promise<{ success: boolean; error?: string; skipped?: boolean }>;
  dbDeleteInvoice: (invoice_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedInvoices: (tenantId: string) => Promise<DeletedInvoice[]>;
  dbRestoreInvoice: (invoice_id: string) => Promise<{ success: boolean; error?: string }>;
  dbHardDeleteInvoice: (invoice_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedProducts: (tenantId: string) => Promise<DeletedProduct[]>;
  dbRestoreProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbHardDeleteProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedCustomers: (tenantId: string) => Promise<DeletedCustomer[]>;
  dbRestoreCustomer: (args: { customer_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbGetDeletedParties: (tenantId: string) => Promise<DeletedParty[]>;
  dbHardDeleteCustomer: (args: { customer_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbHardDeleteParty: (party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetRecycleBinSummary: (tenantId: string) => Promise<{ invoices: number; invoicesValue: number; products: number; customers: number; parties: number }>;
  dbEmptyRecycleBin: (payload: { category: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbUpdateScrapInvoiceHeader: (args: unknown) => Promise<{ success: boolean; error?: string }>;
  openCashDrawer: (tenant_id: string) => Promise<{ success: boolean; error?: string }>;
  printBarcode: (tenant_id: string, barcode: string, price?: number, name?: string, quantity?: number, sp?: number, spType?: 'SP' | 'OFF') => Promise<{ success: boolean; error?: string }>;
  printBulkBarcodes: (tenant_id: string, items: BulkPrintItem[]) => Promise<{ success: boolean; error?: string; printed?: string[] }>;
  getBulkPrintItems: () => Promise<BulkPrintItem[]>;
  getPrinters: () => Promise<{ name: string; displayName?: string; isDefault?: boolean; status?: number }[]>;
  getReceiptText: () => Promise<string>;
  getA4Html: () => Promise<string>;
  printReady: (contentHeightPx?: number) => Promise<{ success: boolean; error?: string }>;
  cardTerminalGetStatus: () => Promise<CardTerminalStatus>;
  cardTerminalSale: (payload: { tenant_id: string; invoice_id: string; amount: number; currency?: string }) => Promise<CardTerminalPayment>;
  cardTerminalVoid: (payload: { ecr_ref: string }) => Promise<CardTerminalPayment>;
  cardTerminalRefund: (payload: { tenant_id: string; invoice_id?: string | null; amount: number; original_ecr_ref?: string | null; currency?: string }) => Promise<CardTerminalPayment>;
  cardTerminalCancel: () => Promise<{ success: boolean }>;
  cardTerminalResolve: (payload: { ecr_ref: string; outcome: 'APPROVED' | 'DECLINED'; auth_code?: string }) => Promise<{ success: boolean; error?: string }>;
  cardTerminalTest: () => Promise<{ ok: boolean; message: string }>;
  cardTerminalBillSplitDetails: (payload: { invoice_id: string }) => Promise<{ split_details: string | null }>;
  cardTerminalListPorts: () => Promise<{ path: string; manufacturer?: string }[]>;
  cardTerminalListTransactions: (payload: { tenant_id: string; limit?: number }) => Promise<CardTerminalTransaction[]>;
  cardTerminalListUnresolved: (payload: { tenant_id: string }) => Promise<CardTerminalTransaction[]>;
  printA4Html: (tenant_id: string, htmlContent: string) => Promise<{ success: boolean; useDefaultDialog?: boolean; error?: string }>;
  exportA4Pdf: (tenant_id: string, htmlContent: string, defaultFilename?: string, pdfOptions?: { displayHeaderFooter?: boolean; headerTemplate?: string; footerTemplate?: string }) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;

  // WhatsApp APIs
  whatsappGetStatus: () => Promise<{ status: 'disconnected' | 'connecting' | 'syncing' | 'connected'; qrCode: string | null; phone: string | null; error?: string | null }>;
  whatsappConnect: () => Promise<{ success: boolean; status: string; qrCode?: string | null; phone?: string | null; error?: string }>;
  whatsappDisconnect: () => Promise<{ success: boolean; error?: string }>;
  whatsappSendInvoice: (payload: { phone: string; message: string; htmlContent?: string; fileName?: string; receiptText?: string; receiptWidthMm?: number }) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  onWhatsAppStatusUpdate: (callback: (data: { status: 'disconnected' | 'connecting' | 'syncing' | 'connected'; qrCode: string | null; phone: string | null; error?: string | null }) => void) => () => void;
  // Shop Closing Overview WhatsApp APIs
  shopClosingGetConfig: (params: { tenant_id?: string }) => Promise<ShopClosingConfigResult>;
  shopClosingSaveConfig: (params: { tenant_id?: string; config: unknown; user_role?: string }) => Promise<ShopClosingSaveConfigResult>;
  shopClosingGetPreview: (params: { tenant_id?: string; business_date?: string; checklist?: unknown }) => Promise<ShopClosingPreviewResult>;
  shopClosingSendReport: (params: { tenant_id?: string; business_date?: string; trigger_type?: string; force?: boolean; custom_phone?: string; custom_checklist?: unknown }) => Promise<{ success: boolean; messageId?: string; error?: string; reportId?: string }>;
  shopClosingGetHistory: (params: { tenant_id?: string; limit?: number }) => Promise<ShopClosingHistoryRow[]>;
  shopClosingRetry: (params: { report_id: string }) => Promise<{ success: boolean; error?: string }>;
  onShopClosingUpdated: (callback: () => void) => () => void;
  onUpdateStatus: (callback: (status: string) => void) => void;
  onUpdateVerificationProgress: (callback: (progress: { percent: number }) => void) => void;
  onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
  onUpdateInfo: (callback: (info: UpdateInfoPayload) => void) => void;
  onBarcodeScanned: (callback: (code: string) => void) => () => void;
  onScaleWeight: (callback: (weight: number) => void) => () => void;
  onCardTerminalStatus: (callback: (status: { ecr_ref: string; message: string }) => void) => () => void;
  onSyncDataUpdated: (callback: () => void) => (() => void);
  onSyncCycleComplete: (callback: () => void) => (() => void);
  onOnlineStatus: (callback: (online: boolean, route?: 'LAN' | 'CLOUD' | 'NONE') => void) => (() => void);
  onSyncProgress: (callback: (progress: SyncProgress) => void) => (() => void) | void;
  onTokenExpired: (callback: (session?: RejectedCloudSession) => void) => (() => void) | void;
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
  dbFindCustomers: (params: { tenant_id: string; name?: string; phone?: string }) => Promise<Rows.CustomersRow[]>;
  dbGetParties: (tenant_id: string, includeDeleted?: boolean) => Promise<Party[]>;
  dbAddParty: (party: unknown) => Promise<{ success: boolean; error?: string }>;
  dbBulkImportParties: (parties: unknown[]) => Promise<{ success: boolean; error?: string; ignored_balances?: number }>;
  dbImportOpeningBalances: (payload: unknown) => Promise<import('./data/parties').OpeningImportResult>;
  dbUpdateParty: (party: unknown) => Promise<{ success: boolean; error?: string }>;
  dbDeleteParty: (party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbRestoreParty: (party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbMergeParties: (payload: { tenant_id: string; primary_party_id: string; secondary_party_id: string }) => Promise<{ success: boolean; error?: string; primary_party_id?: string; secondary_party_id?: string }>;
  dbAdjustPartyBalance: (payload: { party_id: string; amount: number }) => Promise<{ success: boolean; error?: string }>;
  dbGetPartyLedger: (party_id: string, includeDeleted?: boolean) => Promise<Rows.PartyLedgerRow[]>;
  dbAddPartyLedgerEntry: (entry: unknown) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePartyLedgerEntry: (entry: unknown) => Promise<{ success: boolean; error?: string }>;
  dbDeletePartyLedgerEntry: (ledger_id: string, party_id: string) => Promise<{ success: boolean; error?: string }>;
  dbRestorePartyLedgerEntry: (ledger_id: string, party_id: string) => Promise<{ success: boolean; error?: string }>;

  // Scrap (categories ARE items with price/stock/unit)
  dbDeduplicateScrapCategories: () => Promise<{ removed: number }>;
  dbGetScrapCategories: (tenant_id: string) => Promise<Rows.ScrapCategoriesRow[]>;
  dbAddScrapCategory: (cat: unknown) => Promise<{ success: boolean; error?: string }>;
  dbUpdateScrapCategory: (cat: unknown) => Promise<{ success: boolean; error?: string }>;
  dbDeleteScrapCategory: (scrap_category_id: string) => Promise<{ success: boolean; error?: string }>;
  dbAddScrapTransaction: (t: unknown) => Promise<{ success: boolean; error?: string }>;
  dbGetScrapTransactions: (args: { tenant_id: string; scrap_category_id?: string }) => Promise<ScrapTransactionWithCategory[]>;
  dbGetScrapCategoriesBySearch: (args: { tenant_id: string; search: string }) => Promise<Rows.ScrapCategoriesRow[]>;
  dbGetNextScrapInvoiceNumber: (args: { tenant_id: string }) => Promise<{ success: boolean; invoiceNumber?: string; error?: string }>;
  dbPeekNextScrapInvoiceNumber: (args: { tenant_id: string }) => Promise<{ success: boolean; invoiceNumber?: string; error?: string }>;
  dbGetScrapInvoiceByNumber: (args: { tenant_id: string; scrap_invoice_number: string }) => Promise<ScrapInvoiceByNumberResult>;
  dbGetScrapInvoiceList: (args: { tenant_id: string }) => Promise<ScrapInvoiceListResult>;
  dbUpdateScrapInvoicePaymentStatus: (args: { tenant_id: string; scrap_invoice_number: string; payment_status: string }) => Promise<{ success: boolean; error?: string }>;
  dbUpdateScrapTransaction: (args: unknown) => Promise<{ success: boolean; error?: string }>;
  dbDeleteScrapTransaction: (args: { tenant_id: string; transaction_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbDeleteScrapInvoice: (args: { tenant_id: string; scrap_invoice_number: string }) => Promise<{ success: boolean; error?: string }>;
  dbUpdateScrapInvoiceFull: (payload: { tenant_id: string; scrap_invoice_number: string | null; party_name: string | null; customer_phone: string | null; customer_address: string | null; payment_status: string; items: unknown[] }) => Promise<{ success: boolean; error?: string }>;
  dbUpsertScrapCreditLedger: (args: { tenant_id: string; scrap_invoice_number: string; payment_status: string; party_name?: string | null; customer_phone?: string | null; customer_address?: string | null; user_id?: string; user_name?: string }) => Promise<{ success: boolean; error?: string; party_id?: string }>;

  // Stock Report
  dbGetStockReport: (tenant_id: string) => Promise<StockReportResult>;
  dbGetProductBillQuantities: (tenant_id: string) => Promise<{ product_id: string; gst_qty: number; estimate_qty: number }[]>;
  dbUpdateProductGstFlag: (payload: { tenant_id: string; product_id: string; is_gst_applicable: number }) => Promise<{ success: boolean; error?: string }>;
  dbGetProductSalesSummary: (payload: { tenant_id: string; fromDate?: string; toDate?: string }) => Promise<{ product_id: string; name: string; gst_qty: number; bos_qty: number; total_qty: number; total_revenue?: number }[]>;
  dbGetBosConvertibleInvoices: (tenant_id: string, invoice_ids?: string[]) => Promise<{ invoice_id: string; convertible: number }[]>;

  // Quotations
  dbGetNextQuotationNumber: (payload: { tenant_id: string; prefix?: string }) => Promise<{ success: boolean; quotationNumber?: string; error?: string }>;
  dbPeekNextQuotationNumber: (payload: { tenant_id: string }) => Promise<{ success: boolean; quotationNumber?: string; error?: string }>;
  dbSaveQuotation: (q: unknown) => Promise<{ success: boolean; error?: string }>;
  dbGetQuotations: (args: { tenant_id: string; search?: string }) => Promise<Rows.QuotationsRow[]>;
  dbGetQuotationItems: (quotation_id: string) => Promise<Rows.QuotationItemsRow[]>;
  dbUpdateQuotationStatus: (args: { quotation_id: string; status?: string; converted_to_invoice?: number; invoice_id?: string }) => Promise<{ success: boolean; error?: string }>;
  dbDeleteQuotation: (quotation_id: string) => Promise<{ success: boolean; error?: string }>;
  dbUpdateQuotation: (q: unknown) => Promise<{ success: boolean; error?: string }>;

  // Warranties
  dbSaveWarranty: (w: unknown) => Promise<{ success: boolean; error?: string }>;
  dbGetWarranties: (args: { tenant_id: string; search?: string }) => Promise<Rows.WarrantiesRow[]>;
  dbDeleteWarranty: (warranty_id: string) => Promise<{ success: boolean; error?: string }>;

  // Cashier & Settlement
  dbCashierGetDrawer: (params: { tenant_id: string; business_date?: string }) => Promise<CashDrawerResult>;
  /** `error: 'PREVIOUS_DRAWER_OPEN'` when a drawer from an earlier day is still open (`business_date`, `drawer_id`, `message`). */
  dbCashierSetOpeningBalance: (params: { tenant_id: string; opening_balance: number; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string; business_date?: string; drawer_id?: string; message?: string }>;
  dbCashierGetPendingInvoices: (params: { tenant_id: string; search?: string }) => Promise<Invoice[]>;
  dbCashierSettlePayment: (params: { tenant_id: string; invoice_id: string; received_amount: number; discount_amount?: number; payment_method: string; payment_source_id?: string; split_details?: unknown; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierAddTransaction: (params: { tenant_id: string; type: 'CASH_IN' | 'CASH_OUT'; amount: number; category?: string; notes?: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierDayClosing: (params: { tenant_id: string; actual_cash: number; closing_remarks?: string; user_id: string; user_name?: string; business_date?: string }) => Promise<{ success: boolean; error?: string; expected_closing?: number; actual_cash?: number; cash_short?: number; cash_excess?: number }>;
  dbCashierGetAutoCloseStatus: (params: { tenant_id: string }) => Promise<CashDrawerAutoCloseStatus | { error: string }>;
  dbCashierSnoozeAutoClose: (params: { tenant_id: string; drawer_id: string; minutes: number }) => Promise<{ success: boolean; error?: string; status?: CashDrawerAutoCloseStatus }>;
  dbCashierAutoCloseNow: (params: { tenant_id: string; drawer_id: string; user_id?: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierReopenDrawer: (params: { tenant_id: string; drawer_id: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierDeleteTransaction: (params: { tenant_id: string; transaction_id: string; user_id: string; user_name?: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierGetTransactions: (params: { tenant_id: string }) => Promise<import('./data/cashier').CashTransactionViewRow[]>;
  dbCashierGetHistory: (params: { tenant_id: string; limit?: number; offset?: number }) => Promise<Rows.CashDrawerRow[]>;
  dbCashierGetDaySettlements: (params: { tenant_id: string; business_date: string }) => Promise<Invoice[]>;
  dbCashierGetDayTransactions?: (params: { tenant_id: string; business_date?: string; from_date?: string; to_date?: string }) => Promise<Rows.CashTransactionsRow[]>;
  dbCashierGetAuditLog: (params: { tenant_id: string; limit?: number; offset?: number }) => Promise<Rows.CashierAuditLogRow[]>;
  dbCashierGetCategories: (params: { tenant_id: string }) => Promise<Rows.CashCategoriesRow[]>;
  dbCashierAddCategory: (params: { tenant_id: string; name: string; type: string }) => Promise<{ success: boolean; error?: string }>;
  dbCashierDeleteCategory: (params: { category_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;

  // Payment Methods (BANK / CARD / UPI sources)
  dbPaymentGetSources: (tenant_id: string) => Promise<PaymentSource[]>;
  dbPaymentAddSource: (source: unknown) => Promise<{ success: boolean; source_id?: string; error?: string }>;
  dbPaymentUpdateSource: (source: unknown) => Promise<{ success: boolean; error?: string }>;
  dbPaymentDeleteSource: (params: { source_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbPaymentGetTransactions: (params: { source_id: string; tenant_id: string }) => Promise<Rows.PaymentSourceTransactionsRow[]>;
  dbPaymentAddTransaction: (tx: unknown) => Promise<{ success: boolean; balance?: number; error?: string }>;

  // Purchase Bills
  dbPeekNextPurchaseBillNumber: (payload: { tenant_id: string; bill_type?: string }) => Promise<{ success: boolean; billNumber?: string; counter?: number; error?: string }>;
  dbGetNextPurchaseBillNumber: (payload: { tenant_id: string; bill_type?: string }) => Promise<{ success: boolean; billNumber?: string; counter?: number; error?: string }>;
  dbAddPurchaseBill: (payload: unknown) => Promise<{ success: boolean; error?: string }>;
  dbGetPurchaseBills: (args: { tenant_id: string; search?: string; limit?: number; offset?: number }) => Promise<Rows.PurchaseBillsRow[]>;
  dbGetPurchaseBillItems: (purchase_bill_id: string) => Promise<PurchaseBillItemWithProduct[]>;
  dbDeletePurchaseBill: (purchase_bill_id: string) => Promise<{ success: boolean; error?: string }>;
  dbUpdatePurchaseBill: (payload: unknown) => Promise<{ success: boolean; error?: string }>;
  dbGetPurchaseBillProducts: (args: { tenant_id: string; search?: string; limit?: number; numericPrefixOnly?: boolean }) => Promise<PurchaseSearchProduct[]>;
  dbProductHasEstimateBills: (args: { product_id: string; tenant_id: string }) => Promise<{ success: boolean; hasEstimate?: boolean; error?: string }>;
  dbGenerateBarcode: (args: { tenant_id: string; item_code?: string; strip_suffix?: string }) => Promise<{ success: boolean; barcode?: string; error?: string }>;

  // Returns
  dbCreateReturn: (payload: unknown) => Promise<{ success: boolean; error?: string }>;
  dbGetReturns: (filters: { tenant_id: string; invoice_id?: string; limit?: number; offset?: number; search?: string }) => Promise<Rows.ReturnsRow[]>;
  dbGetReturnItems: (return_id: string) => Promise<Rows.ReturnItemsRow[]>;
  dbDeleteReturn: (return_id: string) => Promise<{ success: boolean; error?: string }>;
  dbGetNextReturnNumber: (payload: { tenant_id: string; prefix?: string }) => Promise<{ success: boolean; returnNumber?: string; error?: string }>;
  dbPeekNextReturnNumber: (payload: { tenant_id: string; prefix?: string }) => Promise<{ success: boolean; returnNumber?: string; error?: string }>;
  dbGetAlreadyReturnedQuantities: (invoiceId: string) => Promise<{ invoice_item_id: string; returned_qty: number }[]>;
  dbGetReturnableInvoices: (payload: { tenant_id: string; search?: string; limit?: number; role?: string; user_id?: string }) => Promise<Invoice[]>;
  dbGetReturnInvoiceByNumber: (payload: { tenant_id: string; return_number: string }) => Promise<ReturnInvoiceByNumberResult>;
  dbGetPendingReturnInvoices: (payload: { tenant_id: string; search?: string }) => Promise<Rows.ReturnsRow[]>;
  dbSettleReturnInvoice: (payload: { tenant_id: string; return_number: string; adjusted_invoice_number: string; amount: number }) => Promise<{ success: boolean; error?: string }>;

  // Hold Bill
  // Restaurant mode (src/data/restaurant.ts)
  restaurantGetSetup: (payload: { tenant_id: string }) => Promise<R.RestaurantSetup>;
  restaurantSaveTable: (payload: unknown) => Promise<R.WriteResult<{ table_id: string }>>;
  restaurantDeleteTable: (payload: { tenant_id: string; table_id: string }) => Promise<R.WriteResult>;
  restaurantSaveStation: (payload: unknown) => Promise<R.WriteResult<{ station_id: string }>>;
  restaurantDeleteStation: (payload: { tenant_id: string; station_id: string }) => Promise<R.WriteResult>;
  restaurantSaveModifierGroup: (payload: unknown) => Promise<R.WriteResult<{ group_id: string }>>;
  restaurantDeleteModifierGroup: (payload: { tenant_id: string; group_id: string }) => Promise<R.WriteResult>;
  restaurantListActive: (payload: { tenant_id: string }) => Promise<R.ActiveOrders>;
  restaurantGetOrder: (payload: { order_id: string }) => Promise<{ order: R.RestaurantOrder | null; lines: R.OrderLine[]; kots: R.KotTicket[] }>;
  restaurantOpenOrder: (payload: unknown) => Promise<R.WriteResult<{ order: R.RestaurantOrder }>>;
  restaurantUpdateOrder: (payload: unknown) => Promise<R.WriteResult>;
  restaurantSendItems: (payload: { tenant_id: string; order_id: string; user_id: string | null; lines: R.NewOrderLine[] }) => Promise<R.WriteResult<{ kot_ids: string[] }>>;
  restaurantVoidLines: (payload: { order_id: string; reason: string; user_id: string | null; lines: { line_id: string; quantity?: number }[] }) => Promise<R.WriteResult<{ kot_ids: string[] }>>;
  restaurantMoveTable: (payload: { order_id: string; table_id: string }) => Promise<R.WriteResult>;
  restaurantMergeOrders: (payload: { target_order_id: string; source_order_id: string; user_id: string | null }) => Promise<R.WriteResult>;
  restaurantSplitOrder: (payload: { order_id: string; user_id: string | null; lines: { line_id: string; quantity: number }[] }) => Promise<R.WriteResult<{ order_id: string }>>;
  restaurantCancelOrder: (payload: { order_id: string; reason: string; user_id: string | null }) => Promise<R.WriteResult<{ kot_ids: string[] }>>;
  restaurantClaimForBilling: (payload: { order_id: string }) => Promise<R.ClaimResult>;
  restaurantReleaseClaim: (payload: { order_id: string }) => Promise<R.WriteResult>;
  restaurantPrintKots: (payload: { kot_ids: string[]; reprint?: boolean }) => Promise<{ success: boolean; results: R.KotPrintResult[] }>;
  restaurantPreviewKot: (payload: { kot_id: string }) => Promise<R.WriteResult<{ text: string }>>;
  restaurantGetPrinterConfig: () => Promise<R.KitchenPrinterConfig>;
  restaurantSavePrinterConfig: (payload: R.KitchenPrinterConfig) => Promise<R.WriteResult<{ config: R.KitchenPrinterConfig }>>;
  restaurantTestPrinter: (payload: { tenant_id: string; station_name: string; target: R.KitchenPrinterTarget }) => Promise<R.WriteResult>;
  restaurantListKds: (payload: { tenant_id: string }) => Promise<R.KdsData>;
  restaurantSetKdsStatus: (payload: { kot_id: string; status: R.KdsStatus }) => Promise<R.WriteResult>;
  restaurantReport: (payload: { tenant_id: string; from?: string; to?: string }) => Promise<R.RestaurantReport>;
  dbHoldBill: (payload: unknown) => Promise<{ success: boolean; error?: string }>;
  dbGetHeldBills: (payload: { tenant_id: string }) => Promise<Invoice[]>;
  dbRecallHeldBill: (payload: { invoice_id: string }) => Promise<{ success: boolean; invoice?: Invoice; items?: InvoiceItemWithProduct[]; error?: string }>;
  dbReleaseHeldBill: (payload: { invoice_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbExpireStaleHeldBills: (payload: { tenant_id: string }) => Promise<{ success: boolean; expiredCount?: number; error?: string }>;

  // Diagnostic sync helpers
  syncClearPending: (payload: { tenant_id: string; type: 'invoices' | 'products' | 'all'; records?: string[] }) => Promise<{ success: boolean; error?: string }>;
  syncGetPending: (payload: { tenant_id: string }) => Promise<{ success: boolean; pending: { invoices: Rows.InvoicesRow[]; products: Rows.ProductsRow[] }; error?: string }>;

  // Combo Offers
  dbGetComboOffers: (params: { tenant_id: string; search?: string; only_active?: boolean }) => Promise<ComboOfferWithItems[]>;
  dbGetComboOfferDetails: (params: { combo_id: string; tenant_id: string }) => Promise<ComboOfferDetails | null>;
  dbSaveComboOffer: (combo: unknown) => Promise<{ success: boolean; error?: string }>;
  dbDeleteComboOffer: (params: { combo_id: string; tenant_id: string }) => Promise<{ success: boolean; error?: string }>;
  dbToggleComboOfferActive: (params: { combo_id: string; tenant_id: string; is_active: boolean }) => Promise<{ success: boolean; error?: string }>;

  setPageContext: (payload: { page: string; active: boolean }) => Promise<{ success: boolean; error?: string }>;
  resetFastPollBackoff: () => Promise<{ success: boolean; error?: string }>;

  // E-Commerce / FusionCart Integration
  ecommerceGetSettings: (payload: { tenant_id: string }) => Promise<{ success: boolean; settings?: Rows.EcommerceSettingsRow; error?: string }>;
  ecommerceSaveSettings: (payload: { tenant_id: string; settings: unknown }) => Promise<{ success: boolean; settings?: Rows.EcommerceSettingsRow; error?: string }>;
  ecommerceTestConnection: (payload: { url?: string | null }) => Promise<{ connected: boolean; message?: string }>;
  ecommerceRegisterVendor: (payload: { tenant_id: string; data: unknown }) => Promise<{ success: boolean; settings?: Rows.EcommerceSettingsRow; error?: string }>;
  ecommerceRefreshStatus: (payload: { tenant_id: string }) => Promise<{ success: boolean; settings?: Rows.EcommerceSettingsRow; store?: unknown; error?: string }>;
  ecommerceGetProducts: (payload: { tenant_id: string; search?: string; filter?: string }) => Promise<EcommerceProductsResult>;
  ecommerceUpdateMapping: (payload: unknown) => Promise<{ success: boolean; mapping?: Rows.EcommerceProductMappingsRow; error?: string }>;
  ecommerceSyncProduct: (payload: { tenant_id: string; product_id: string }) => Promise<{ success: boolean; remoteId?: number; error?: string }>;
  ecommerceUnpublishProduct: (payload: { tenant_id: string; product_id: string }) => Promise<{ success: boolean; error?: string }>;
  ecommerceGetOrders: (payload: { tenant_id: string }) => Promise<EcommerceOrdersResult>;

  // Emergency Purge & Kill Switch
  dbEmergencyPurge?: (payload: { wipe_mode?: 'ALL_DATA' | 'SALES_AND_CASH_ONLY'; reason?: string; email?: string; password?: string }) => Promise<{ success: boolean; clearedTables?: string[]; error?: string }>;
  onEmergencyPurged?: (callback: (data: { wipeMode: string; reason?: string }) => void) => (() => void);
}


declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
