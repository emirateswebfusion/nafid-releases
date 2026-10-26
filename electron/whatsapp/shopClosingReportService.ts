import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'crypto';
import { sendWhatsAppBill } from './whatsappService';
import * as shopClosingReportSql from '../db/statements/shopClosingReport.js';
import { buildShopClosingSummaryData } from './shopClosingSummary.js';
import { formatClosingWhatsAppMessage } from './shopClosingMessage.js';
import type { ShopClosingChecklist, ShopClosingOverviewConfig } from './shopClosingTypes.js';

const DEFAULT_CHECKLIST: ShopClosingChecklist = {
  dateTime: true,
  closingStatus: true,
  counterDetails: true,
  closingStaff: true,
  sales: true,
  grossSales: true,
  totalDiscount: true,
  taxCollected: true,
  invoices: true,
  paymentMethods: true,
  paymentCash: true,
  paymentUpi: true,
  paymentCard: true,
  paymentBank: true,
  paymentCheque: true,
  paymentCredit: true,
  cashBalances: true,
  cashDifferences: true,
  cashInOut: true,
  cashInList: true,
  expenses: true,
  expensesList: true,
  creditSales: true,
  customerPayments: true,
  partyTransactions: true,
  staffTransactions: true,
  scrap: true,
  returns: true,
  refunds: true,
  purchases: false,
};

const DEFAULT_CONFIG: ShopClosingOverviewConfig = {
  enabled: false,
  ownerPhone: '',
  sendTiming: 'IMMEDIATELY',
  scheduledTime: '22:00',
  includeMultiCounterBreakdown: true,
  checklist: DEFAULT_CHECKLIST,
};

function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[^0-9+]/g, '').trim();
}

function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 8 && cleaned.length <= 15;
}

/**
 * Read configuration from settings table
 */
function getShopClosingConfig(db: any, tenantId: string = 'global'): ShopClosingOverviewConfig {
  try {
    const tid = tenantId || 'global';
    const row = shopClosingReportSql.findOneSettingByKey(db)
      .get(tid, tid) as any;

    if (row && row.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        checklist: {
          ...DEFAULT_CHECKLIST,
          ...(parsed.checklist || {}),
        },
      };
    }
  } catch (err) {
    console.error('[ShopClosing] getShopClosingConfig error:', (err as Error).message);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to settings table (Admin check enforced)
 */
function saveShopClosingConfig(
  db: any,
  tenantId: string = 'global',
  config: Partial<ShopClosingOverviewConfig>,
  userRole?: string
): { success: boolean; error?: string; config?: ShopClosingOverviewConfig } {
  try {
    const role = (userRole || '').toUpperCase().trim();
    const isAdmin = role === 'ADMIN' || role === 'OWNER' || role === 'SUPER_ADMIN' || role === 'ADMINISTRATOR';
    if (!isAdmin) {
      return { success: false, error: 'Permission denied: Store Admin or Owner privileges required.' };
    }

    const current = getShopClosingConfig(db, tenantId);
    const updated: ShopClosingOverviewConfig = {
      ...current,
      ...config,
      ownerPhone: cleanPhoneNumber(config.ownerPhone !== undefined ? config.ownerPhone : current.ownerPhone),
      checklist: {
        ...current.checklist,
        ...(config.checklist || {}),
      },
    };

    const tid = tenantId || 'global';
    const valString = JSON.stringify(updated);

    shopClosingReportSql.upsertSetting(db).run(tid, valString);

    return { success: true, config: updated };
  } catch (err) {
    console.error('[ShopClosing] saveShopClosingConfig error:', err);
    return { success: false, error: (err as Error).message || 'Failed to save configuration' };
  }
}

/**
 * Send Shop Closing Report (With deduplication and failure logging)
 */
export async function sendShopClosingReport({
  db,
  tenantId = 'global',
  businessDate,
  triggerType = 'SETTLEMENT_CLOSE',
  force = false,
  customPhone,
  customChecklist,
  currentDrawer,
  closedByName,
  reconcileCashDrawerFn,
  getStoreTimezoneSettingFn,
}: {
  db: any;
  tenantId?: string;
  businessDate?: string;
  triggerType?: 'SETTLEMENT_CLOSE' | 'SCHEDULED' | 'MANUAL';
  force?: boolean;
  customPhone?: string;
  customChecklist?: ShopClosingChecklist;
  currentDrawer?: any;
  closedByName?: string;
  reconcileCashDrawerFn?: (db: any, tid: string, drawer: any) => any;
  getStoreTimezoneSettingFn?: (db: any, tid?: string) => string;
}): Promise<{ success: boolean; messageId?: string; error?: string; reportId?: string }> {
  const tid = tenantId || 'global';
  const config = getShopClosingConfig(db, tid);

  // If not manual test/force, check if enabled
  if (!force && !config.enabled) {
    return { success: false, error: 'Shop Closing Overview WhatsApp alert is disabled in settings.' };
  }

  const phone = cleanPhoneNumber(customPhone || config.ownerPhone);
  if (!phone || !isValidPhoneNumber(phone)) {
    return { success: false, error: 'Invalid or missing shop owner WhatsApp number.' };
  }

  const checklist = customChecklist || config.checklist || DEFAULT_CHECKLIST;
  const summaryData = buildShopClosingSummaryData(
    db,
    tid,
    businessDate,
    currentDrawer,
    closedByName,
    reconcileCashDrawerFn,
    getStoreTimezoneSettingFn
  );

  const bDate = summaryData.businessDate;

  // Deduplication check: avoid spamming owner multiple times for the same business date & trigger
  if (!force) {
    try {
      const recent = shopClosingReportSql.findOneShopClosingReportByBusinessDateAndTriggerType(db)
        .get(tid, bDate, triggerType) as any;

      if (recent) {
        console.log(`[ShopClosing] Duplicate prevented: ${triggerType} report already sent for date ${bDate} at ${recent.created_at}`);
        return { success: true, error: 'Report was already sent for this business date.' };
      }
    } catch (e) {
      console.warn('[ShopClosing] Deduplication check warning:', (e as Error).message);
    }
  }

  const messageText = formatClosingWhatsAppMessage(summaryData, checklist);
  const reportId = crypto.randomUUID();

  // Log as PENDING
  try {
    shopClosingReportSql.insertShopClosingReport(db).run(
      reportId,
      tid,
      bDate,
      triggerType,
      summaryData.counterCode,
      phone,
      JSON.stringify(summaryData),
      JSON.stringify(checklist),
      messageText
    );
  } catch (err) {
    console.error('[ShopClosing] Failed to insert report log:', (err as Error).message);
  }

  // Attempt send via WhatsApp service
  try {
    const res = await sendWhatsAppBill({
      phone,
      message: messageText,
    });

    if (res.success) {
      try {
        shopClosingReportSql.updateShopClosingReportById(db).run(res.messageId || null, reportId);
      } catch { /* ignore */ }

      notifyRendererReportsUpdated();
      return { success: true, messageId: res.messageId, reportId };
    } else {
      const errorMsg = res.error || 'WhatsApp message dispatch failed.';
      try {
        shopClosingReportSql.updateShopClosingReportStatusAndErrorMessage(db).run(errorMsg, reportId);
      } catch { /* ignore */ }

      notifyRendererReportsUpdated();
      return { success: false, error: errorMsg, reportId };
    }
  } catch (err) {
    const errorMsg = (err as Error)?.message || 'Unexpected error sending WhatsApp report.';
    try {
      shopClosingReportSql.updateShopClosingReportStatusAndErrorMessage(db).run(errorMsg, reportId);
    } catch { /* ignore */ }

    notifyRendererReportsUpdated();
    return { success: false, error: errorMsg, reportId };
  }
}

/**
 * Retry failed report
 */
async function retryShopClosingReport(db: any, reportId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const row = shopClosingReportSql.findShopClosingReportsById(db).get(reportId) as any;
    if (!row) return { success: false, error: 'Report record not found' };

    const res = await sendWhatsAppBill({
      phone: row.recipient_phone,
      message: row.message_text,
    });

    if (res.success) {
      shopClosingReportSql.updateShopClosingReportByIdSent(db).run(res.messageId || null, reportId);

      notifyRendererReportsUpdated();
      return { success: true };
    } else {
      shopClosingReportSql.updateShopClosingReportByIdFailed(db).run(res.error || 'Retry failed', reportId);

      notifyRendererReportsUpdated();
      return { success: false, error: res.error };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Query report history
 */
function getShopClosingHistory(db: any, tenantId: string = 'global', limit: number = 30): any[] {
  try {
    const tid = tenantId || 'global';
    return shopClosingReportSql.findShopClosingReports(db)
      .all(tid, limit) as any[];
  } catch (err) {
    console.error('[ShopClosing] getShopClosingHistory error:', (err as Error).message);
    return [];
  }
}

function notifyRendererReportsUpdated() {
  try {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('shopClosing:updated');
      }
    });
  } catch { /* ignore */ }
}

/**
 * Scheduled background timer for shop-closing time check
 */
let scheduledTimer: NodeJS.Timeout | null = null;
let lastScheduledCheckDate: string = '';

function startShopClosingScheduler(
  db: any,
  getTenantIdFn?: () => string,
  reconcileCashDrawerFn?: (db: any, tid: string, drawer: any) => any,
  getStoreTimezoneSettingFn?: (db: any, tid?: string) => string
): void {
  if (scheduledTimer) clearInterval(scheduledTimer);

  scheduledTimer = setInterval(async () => {
    try {
      const tid = getTenantIdFn ? getTenantIdFn() : 'global';
      const config = getShopClosingConfig(db, tid);

      if (!config.enabled) return;
      if (config.sendTiming !== 'SCHEDULED' && config.sendTiming !== 'BOTH') return;
      if (!config.ownerPhone || !config.scheduledTime) return;

      const tz = getStoreTimezoneSettingFn ? getStoreTimezoneSettingFn(db, tid) : 'Asia/Kolkata';
      const now = new Date();

      // Current store time in HH:mm
      const timeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);

      const storeBusinessDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

      // Compare current store time with scheduled time
      if (timeParts >= config.scheduledTime) {
        // Check if scheduled report was already sent for today
        const existing = shopClosingReportSql.findOneShopClosingReportByBusinessDateAndTriggerTypeSent(db)
          .get(tid, storeBusinessDate) as any;

        if (!existing && lastScheduledCheckDate !== `${storeBusinessDate}_${config.scheduledTime}`) {
          lastScheduledCheckDate = `${storeBusinessDate}_${config.scheduledTime}`;
          console.log(`[ShopClosing Scheduler] Triggering scheduled shop-closing overview for ${storeBusinessDate} at ${timeParts} (scheduled for ${config.scheduledTime})...`);

          await sendShopClosingReport({
            db,
            tenantId: tid,
            businessDate: storeBusinessDate,
            triggerType: 'SCHEDULED',
            force: false,
            reconcileCashDrawerFn,
            getStoreTimezoneSettingFn,
          });
        }
      }
    } catch (err) {
      console.error('[ShopClosing Scheduler] Error in check cycle:', (err as Error).message);
    }
  }, 45000); // Check every 45 seconds
}

/**
 * Register Shop Closing IPC Handlers
 */
export function initShopClosingIpc(helpers: {
  reconcileCashDrawerFn: (db: any, tid: string, drawer: any) => any;
  getStoreTimezoneSettingFn: (db: any, tid?: string) => string;
  getDbFn: () => any;
  getTenantIdFn?: () => string;
}): void {
  const { reconcileCashDrawerFn, getStoreTimezoneSettingFn, getDbFn, getTenantIdFn } = helpers;

  ipcMain.handle('shopClosing:getConfig', (_event, { tenant_id }: { tenant_id?: string }) => {
    const cfg = getShopClosingConfig(getDbFn(), tenant_id);
    return {
      ...cfg,
      success: true,
      config: cfg,
    };
  });

  ipcMain.handle('shopClosing:saveConfig', (_event, { tenant_id, config, user_role }: { tenant_id?: string; config: Partial<ShopClosingOverviewConfig>; user_role?: string }) => {
    return saveShopClosingConfig(getDbFn(), tenant_id, config, user_role);
  });

  ipcMain.handle('shopClosing:getPreview', (_event, { tenant_id, business_date, checklist }: { tenant_id?: string; business_date?: string; checklist?: ShopClosingChecklist }) => {
    try {
      const db = getDbFn();
      const cfg = getShopClosingConfig(db, tenant_id);
      const effectiveChecklist = checklist || cfg.checklist || DEFAULT_CHECKLIST;
      const summary = buildShopClosingSummaryData(db, tenant_id, business_date, undefined, undefined, reconcileCashDrawerFn, getStoreTimezoneSettingFn);

      // In Settings Real-time Preview:
      // If the current shift / business day does not yet contain entries for any enabled itemized checklist section,
      // populate representative sample preview items so the merchant sees in real-time exactly how their selected
      // options look in WhatsApp.
      if (effectiveChecklist.expensesList && (!summary.expensesItems || summary.expensesItems.length === 0)) {
        summary.expensesItems = [
          { description: 'tea', amount: 10 },
          { description: 'Shop Cleaning & Waste', amount: 50 },
          { description: 'Delivery Petrol', amount: 140 },
        ];
        if (!summary.totalExpenses) summary.totalExpenses = 200;
      }
      if (effectiveChecklist.cashInList && (!summary.cashInItems || summary.cashInItems.length === 0)) {
        summary.cashInItems = [
          { description: 'Opening Float Deposit', amount: 1000 },
          { description: 'Owner Cash Injection', amount: 500 },
        ];
        if (!summary.totalCashIn) summary.totalCashIn = 1500;
      }
      if (effectiveChecklist.partyTransactions && (!summary.partyTransactionItems || summary.partyTransactionItems.length === 0)) {
        summary.partyTransactionItems = [
          { partyName: 'Suhaib', type: 'Got Cash', amount: 1000, description: 'Ledger payment' },
          { partyName: 'Al Madina Traders', type: 'Got Cash', amount: 1400, description: 'Invoice payment' },
        ];
      }
      if (effectiveChecklist.staffTransactions && (!summary.staffTransactionItems || summary.staffTransactionItems.length === 0)) {
        summary.staffTransactionItems = [
          { staffName: 'Rahul', type: 'Advance', amount: 500, notes: 'Emergency' },
          { staffName: 'Sanjay', type: 'Salary', amount: 1200, notes: 'Part payment' },
        ];
      }
      if (effectiveChecklist.scrap && (!summary.scrapSummary || (summary.scrapSummary.totalAmount === 0 && summary.scrapSummary.count === 0))) {
        summary.scrapSummary = {
          totalAmount: 950,
          count: 2,
          items: [
            { categoryName: 'Iron Scrap', quantity: 20, unit: 'Kgs', rate: 30, totalAmount: 600 },
            { categoryName: 'Copper Wire Scrap', quantity: 1, unit: 'Kgs', rate: 350, totalAmount: 350 },
          ],
        };
      }

      // In Settings Real-time Preview:
      // If store has 0 sales or all payments are 0.00 today yet, provide realistic sample sales & payments
      // so the merchant sees in real-time exactly how their selected payment methods and metrics look in WhatsApp.
      const hasAnyPayment = (summary.paymentBreakdown.cash > 0 ||
        summary.paymentBreakdown.upi > 0 ||
        summary.paymentBreakdown.card > 0 ||
        summary.paymentBreakdown.bankTransfer > 0 ||
        summary.paymentBreakdown.cheque > 0 ||
        summary.paymentBreakdown.credit > 0);

      if (summary.totalInvoices === 0 || !hasAnyPayment) {
        summary.totalInvoices = summary.totalInvoices || 38;
        summary.grossSales = summary.grossSales || 42850;
        summary.totalDiscount = summary.totalDiscount || 1350;
        summary.netSales = summary.netSales || 41500;
        summary.totalTax = summary.totalTax || 3240;
        summary.paymentBreakdown = {
          cash: 18450,
          upi: 14200,
          card: 6350,
          bankTransfer: 1500,
          cheque: 500,
          credit: 1000,
        };
        if (!summary.creditSalesAmount) summary.creditSalesAmount = 1000;
        if (!summary.customerPaymentsCollected) summary.customerPaymentsCollected = 2400;
        if (!summary.openingBalance) summary.openingBalance = 3000;
        if (!summary.expectedClosingCash) summary.expectedClosingCash = 21750;
        if (!summary.actualCashCounted) summary.actualCashCounted = 21750;
        if (!summary.returnsCount) summary.returnsCount = 2;
        if (!summary.returnsAmount) summary.returnsAmount = 480;
        if (!summary.refundsPaidAmount) summary.refundsPaidAmount = 480;
        if (!summary.purchasesCount) summary.purchasesCount = 1;
        if (!summary.purchasesAmount) summary.purchasesAmount = 15800;
        if (!summary.countersSummary || summary.countersSummary.length === 0) {
          summary.countersSummary = [
            { counterCode: 'POS-01', billerName: 'Alex', invoiceCount: 24, netSales: 26800, cashSales: 12400 },
            { counterCode: 'POS-02', billerName: 'Sam', invoiceCount: 14, netSales: 14700, cashSales: 6050 },
          ];
        }
      }

      const message = formatClosingWhatsAppMessage(summary, effectiveChecklist);
      return { success: true, summary, message };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('shopClosing:sendReport', async (_event, params: {
    tenant_id?: string;
    business_date?: string;
    trigger_type?: 'SETTLEMENT_CLOSE' | 'SCHEDULED' | 'MANUAL';
    force?: boolean;
    custom_phone?: string;
    custom_checklist?: ShopClosingChecklist;
  }) => {
    return await sendShopClosingReport({
      db: getDbFn(),
      tenantId: params.tenant_id,
      businessDate: params.business_date,
      triggerType: params.trigger_type || 'MANUAL',
      force: params.force ?? true,
      customPhone: params.custom_phone,
      customChecklist: params.custom_checklist,
      reconcileCashDrawerFn,
      getStoreTimezoneSettingFn,
    });
  });

  ipcMain.handle('shopClosing:getHistory', (_event, { tenant_id, limit }: { tenant_id?: string; limit?: number }) => {
    return getShopClosingHistory(getDbFn(), tenant_id, limit);
  });

  ipcMain.handle('shopClosing:retry', async (_event, { report_id }: { report_id: string }) => {
    return await retryShopClosingReport(getDbFn(), report_id);
  });

  // Start background scheduler
  startShopClosingScheduler(getDbFn(), getTenantIdFn, reconcileCashDrawerFn, getStoreTimezoneSettingFn);
}

