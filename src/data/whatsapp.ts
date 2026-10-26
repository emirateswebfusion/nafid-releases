import { bindBridge } from './client';
import type { ShopClosingReportsRow } from './dbRows';

/** Owner checklist used by `shopClosingReportService` to choose report sections. */
export interface ShopClosingChecklist {
  dateTime: boolean;
  closingStatus: boolean;
  counterDetails: boolean;
  closingStaff: boolean;
  sales: boolean;
  grossSales: boolean;
  totalDiscount: boolean;
  taxCollected: boolean;
  invoices: boolean;
  paymentMethods: boolean;
  paymentCash: boolean;
  paymentUpi: boolean;
  paymentCard: boolean;
  paymentBank: boolean;
  paymentCheque: boolean;
  paymentCredit: boolean;
  cashBalances: boolean;
  cashDifferences: boolean;
  cashInOut: boolean;
  cashInList: boolean;
  expenses: boolean;
  expensesList: boolean;
  creditSales: boolean;
  customerPayments: boolean;
  partyTransactions: boolean;
  staffTransactions: boolean;
  scrap: boolean;
  returns: boolean;
  refunds: boolean;
  purchases: boolean;
}

export type ShopClosingSendTiming = 'IMMEDIATELY' | 'SCHEDULED' | 'BOTH';

/** Normalized configuration returned by `getShopClosingConfig` after defaults are merged with saved settings. */
export interface ShopClosingOverviewConfig {
  enabled: boolean;
  ownerPhone: string;
  sendTiming: ShopClosingSendTiming;
  scheduledTime: string;
  includeMultiCounterBreakdown: boolean;
  checklist: ShopClosingChecklist;
}

/** Summary produced by `buildShopClosingSummaryData` and returned by `shopClosing:getPreview`. */
export interface ShopClosingSummary {
  tenantId: string;
  shopName: string;
  businessDate: string;
  closingTimestamp: string;
  closingStaffName: string;
  registerStatus: string;
  closingRemarks: string;
  counterCode: string;
  totalInvoices: number;
  grossSales: number;
  totalDiscount: number;
  netSales: number;
  totalTax: number;
  paymentBreakdown: {
    cash: number;
    card: number;
    upi: number;
    bankTransfer: number;
    cheque: number;
    credit: number;
  };
  creditSalesAmount: number;
  customerPaymentsCollected: number;
  totalCashIn: number;
  totalCashOut: number;
  cashInCount: number;
  cashOutCount: number;
  totalExpenses: number;
  expensesItems: Array<{ description: string; amount: number; time?: string }>;
  cashInItems: Array<{ description: string; amount: number; time?: string }>;
  partyTransactionItems: Array<{ partyName: string; type: string; amount: number; description?: string }>;
  staffTransactionItems: Array<{ staffName: string; type: string; amount: number; notes?: string }>;
  scrapSummary: {
    totalAmount: number;
    count: number;
    items: Array<{ categoryName: string; quantity: number; unit?: string; rate: number; totalAmount: number; partyName?: string }>;
  };
  returnsCount: number;
  returnsAmount: number;
  refundsPaidAmount: number;
  purchasesCount: number;
  purchasesAmount: number;
  openingBalance: number;
  expectedClosingCash: number;
  actualCashCounted: number;
  cashShortage: number;
  cashExcess: number;
  countersSummary: Array<{ counterCode: string; billerName?: string; invoiceCount: number; netSales: number; cashSales: number }>;
}

/** Flattened config response from `shopClosing:getConfig` (`cfg` plus its `config` property). */
export type ShopClosingConfigResult = ShopClosingOverviewConfig & { success: true; config: ShopClosingOverviewConfig };

/** Success and caught-error return shapes from `saveShopClosingConfig`. */
export type ShopClosingSaveConfigResult =
  | { success: true; config: ShopClosingOverviewConfig }
  | { success: false; error: string };

/** Preview response from `shopClosing:getPreview`, including its summary-builder error branch. */
export type ShopClosingPreviewResult =
  | { success: true; summary: ShopClosingSummary; message: string }
  | { success: false; error: string };

/** Full `SELECT *` row returned by `getShopClosingHistory` / `findShopClosingReports`. */
export type ShopClosingHistoryRow = ShopClosingReportsRow;

/** WhatsApp connection, invoice sending and shop-closing reports. Channel catalog — the only way UI code reaches these IPC channels. */
export const whatsappApi = bindBridge({
  getStatus: 'whatsappGetStatus',
  connect: 'whatsappConnect',
  disconnect: 'whatsappDisconnect',
  sendInvoice: 'whatsappSendInvoice',
  shopClosingGetConfig: 'shopClosingGetConfig',
  shopClosingSaveConfig: 'shopClosingSaveConfig',
  shopClosingGetPreview: 'shopClosingGetPreview',
  shopClosingSendReport: 'shopClosingSendReport',
  shopClosingGetHistory: 'shopClosingGetHistory',
  shopClosingRetry: 'shopClosingRetry',
});
