import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'crypto';
import { sendWhatsAppBill } from './whatsappService';
import * as shopClosingReportSql from '../db/statements/shopClosingReport.js';

export interface ShopClosingChecklist {
  sales: boolean;
  grossSales?: boolean;
  totalDiscount?: boolean;
  taxCollected?: boolean;
  invoices: boolean;
  paymentMethods: boolean;
  paymentCash?: boolean;
  paymentUpi?: boolean;
  paymentCard?: boolean;
  paymentBank?: boolean;
  paymentCheque?: boolean;
  paymentCredit?: boolean;
  expenses: boolean;
  expensesList: boolean;
  cashInOut: boolean;
  cashInList: boolean;
  creditSales: boolean;
  customerPayments: boolean;
  partyTransactions: boolean;
  staffTransactions: boolean;
  scrap: boolean;
  returns: boolean;
  refunds: boolean;
  purchases: boolean;
  cashBalances: boolean;
  cashDifferences: boolean;
  closingStaff: boolean;
  dateTime: boolean;
  counterDetails: boolean;
  closingStatus: boolean;
}

export type ShopClosingSendTiming = 'IMMEDIATELY' | 'SCHEDULED' | 'BOTH';

export interface ShopClosingOverviewConfig {
  enabled: boolean;
  ownerPhone: string;
  sendTiming: ShopClosingSendTiming;
  scheduledTime: string; // "HH:mm" 24h
  includeMultiCounterBreakdown: boolean;
  checklist: ShopClosingChecklist;
}

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

function formatCurrency(amount: number | null | undefined): string {
  const num = Number(amount) || 0;
  const isNegative = num < 0;
  const absFormatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-₹${absFormatted}` : `₹${absFormatted}`;
}

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
  } catch (err: any) {
    console.error('[ShopClosing] getShopClosingConfig error:', err.message);
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
  } catch (err: any) {
    console.error('[ShopClosing] saveShopClosingConfig error:', err);
    return { success: false, error: err.message || 'Failed to save configuration' };
  }
}

/**
 * Build consolidated summary data from POS database
 */
function buildShopClosingSummaryData(
  db: any,
  tenantId: string = 'global',
  businessDate?: string,
  providedDrawer?: any,
  closedByName?: string,
  reconcileCashDrawerFn?: (db: any, tid: string, drawer: any) => any,
  getStoreTimezoneSettingFn?: (db: any, tid?: string) => string
): any {
  const tid = tenantId || 'global';
  const tz = getStoreTimezoneSettingFn ? getStoreTimezoneSettingFn(db, tid) : 'Asia/Kolkata';

  // Determine business date string (YYYY-MM-DD)
  let bDate = businessDate ? businessDate.split('T')[0].split(' ')[0] : '';
  if (!bDate) {
    try {
      bDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    } catch {
      bDate = new Date().toISOString().split('T')[0];
    }
  }

  const parts = bDate.split('-');
  const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : bDate;
  const dateLike = `${bDate}%`;

  // Get Shop Name
  let shopName = 'Nafid Store';
  try {
    const shopRow = shopClosingReportSql.findOneSettingByKeyShopName(db)
      .get(tid, tid) as any;
    if (shopRow?.value) {
      try {
        const parsed = JSON.parse(shopRow.value);
        shopName = typeof parsed === 'string' ? parsed : shopRow.value;
      } catch {
        shopName = shopRow.value;
      }
    }
  } catch {}

  // Get Terminal Code
  let counterCode = 'POS 1';
  try {
    const termRow = shopClosingReportSql.findOneSettingByKeyTerminalCode(db)
      .get(tid) as any;
    if (termRow?.value) {
      try {
        const parsed = JSON.parse(termRow.value);
        counterCode = typeof parsed === 'string' ? parsed : termRow.value;
      } catch {
        counterCode = termRow.value;
      }
    }
  } catch {}

  // 1. Drawer Reconciliation
  let drawer = providedDrawer;
  if (!drawer) {
    try {
      drawer = shopClosingReportSql.findOneCashDrawerByBusinessDate(db)
        .get(tid, bDate, altDate, bDate, dateLike, bDate) as any;
    } catch {}
  }

  if (drawer && reconcileCashDrawerFn) {
    try {
      drawer = reconcileCashDrawerFn(db, tid, drawer);
    } catch (e: any) {
      console.warn('[ShopClosing] drawer reconcile warning:', e.message);
    }
  }

  const openingBalance = Math.round(Number(drawer?.opening_balance || 0) * 100) / 100;
  const expectedClosingCash = Math.round(Number(drawer?.expected_closing || drawer?.current_cash || 0) * 100) / 100;
  const actualCashCounted = drawer?.actual_cash !== null && drawer?.actual_cash !== undefined
    ? Math.round(Number(drawer.actual_cash) * 100) / 100
    : expectedClosingCash;
  let cashShortage = Math.round(Number(drawer?.cash_short || 0) * 100) / 100;
  let cashExcess = Math.round(Number(drawer?.cash_excess || 0) * 100) / 100;
  if (drawer?.actual_cash !== null && drawer?.actual_cash !== undefined) {
    const diff = Math.round((actualCashCounted - expectedClosingCash) * 100) / 100;
    if (diff < 0 && cashShortage === 0) cashShortage = Math.abs(diff);
    if (diff > 0 && cashExcess === 0) cashExcess = diff;
  }
  const registerStatus = drawer?.status || 'OPEN';
  const closingRemarks = drawer?.closing_remarks || '';

  // Staff details
  let staffName = closedByName || '';
  if (!staffName && drawer?.closed_by) {
    try {
      const userRow = shopClosingReportSql.findUsersByUserId(db).get(drawer.closed_by) as any;
      if (userRow) staffName = userRow.name || '';
    } catch {}
  }
  if (!staffName && drawer?.opened_by) {
    try {
      const userRow = shopClosingReportSql.findUsersByUserId(db).get(drawer.opened_by) as any;
      if (userRow) staffName = userRow.name || '';
    } catch {}
  }

  // Closing timestamp
  let closingTimestamp = '';
  if (drawer?.closed_at) {
    try {
      const d = new Date(drawer.closed_at);
      closingTimestamp = d.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    } catch {
      closingTimestamp = String(drawer.closed_at);
    }
  } else {
    try {
      closingTimestamp = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    } catch {}
  }

  // 2. Query Invoices for the business date
  let totalInvoices = 0;
  let grossSales = 0;
  let totalDiscount = 0;
  let netSales = 0;
  let totalTax = 0;
  let creditSalesAmount = 0;
  let refundsPaidAmount = 0;

  const paymentBreakdown = {
    cash: 0,
    card: 0,
    upi: 0,
    bankTransfer: 0,
    cheque: 0,
    credit: 0,
  };

  const counterGroupMap: Record<string, { counterCode: string; billerName?: string; invoiceCount: number; netSales: number; cashSales: number }> = {};

  try {
    const invoices = shopClosingReportSql.findInvoicesByConvertedFrom_(db)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as any[];

    if (Array.isArray(invoices)) {
      totalInvoices = invoices.length;
      for (const inv of invoices) {
        const gTotal = Math.max(0, Number(inv.grand_total) || 0);
        const tax = Math.max(0, Number(inv.tax_total) || 0);
        const disc = Math.max(0, Number(inv.discount_total || 0) + Number(inv.points_redeemed_discount || 0));
        const sub = Math.max(0, Number(inv.subtotal) || 0);
        const refundPaid = Math.max(0, Number(inv.actual_refund_paid) || 0);
        const scrapDed = Math.max(0, Number(inv.scrap_deduction) || 0);
        const returnDed = Math.max(0, Number(inv.return_deduction) || 0);

        netSales += gTotal;
        totalTax += tax;
        totalDiscount += disc;
        grossSales += (disc > 0 || scrapDed > 0 || returnDed > 0 ? (gTotal + disc + scrapDed + returnDed) : (sub > 0 && Math.abs((sub + tax) - gTotal) > 0.01 ? (sub + tax) : gTotal));
        refundsPaidAmount += refundPaid;

        const pm = (inv.payment_method || 'CASH').toUpperCase();
        let invCashPortion = 0;

        if (pm === 'SPLIT' && inv.split_details) {
          let sd: any = inv.split_details;
          while (typeof sd === 'string') {
            try { sd = JSON.parse(sd); } catch { break; }
          }
          if (sd && typeof sd === 'object') {
            const cAmt = Number(sd.cash) || 0;
            const upiAmt = Number(sd.upi) || 0;
            const cardAmt = Number(sd.card) || 0;
            const bankAmt = Number(sd.bank_transfer || sd.bank) || 0;
            const chqAmt = Number(sd.cheque) || 0;
            const crAmt = Number(sd.credit) || 0;

            paymentBreakdown.cash += cAmt;
            paymentBreakdown.upi += upiAmt;
            paymentBreakdown.card += cardAmt;
            paymentBreakdown.bankTransfer += bankAmt;
            paymentBreakdown.cheque += chqAmt;
            paymentBreakdown.credit += crAmt;
            creditSalesAmount += crAmt;
            invCashPortion = cAmt;
          } else {
            paymentBreakdown.cash += gTotal;
            invCashPortion = gTotal;
          }
        } else if (pm === 'CASH') {
          paymentBreakdown.cash += gTotal;
          invCashPortion = gTotal;
        } else if (pm === 'CARD') {
          paymentBreakdown.card += gTotal;
        } else if (pm === 'UPI') {
          paymentBreakdown.upi += gTotal;
        } else if (pm === 'BANK_TRANSFER' || pm === 'BANK') {
          paymentBreakdown.bankTransfer += gTotal;
        } else if (pm === 'CHEQUE') {
          paymentBreakdown.cheque += gTotal;
        } else if (pm === 'CREDIT') {
          const recAmt = Math.max(0, Number(inv.received_amount) || 0);
          if (recAmt > 0 && recAmt < gTotal) {
            paymentBreakdown.cash += recAmt;
            invCashPortion = recAmt;
            paymentBreakdown.credit += (gTotal - recAmt);
            creditSalesAmount += (gTotal - recAmt);
          } else if (recAmt >= gTotal && gTotal > 0) {
            paymentBreakdown.cash += gTotal;
            invCashPortion = gTotal;
          } else {
            paymentBreakdown.credit += gTotal;
            creditSalesAmount += gTotal;
          }
        } else {
          paymentBreakdown.cash += gTotal;
          invCashPortion = gTotal;
        }

        // Identify counter / terminal code
        let invCounter = counterCode || 'POS 1';
        const invNum = String(inv.invoice_number || '');
        const match = invNum.match(/^([A-Za-z0-9]+)-/);
        if (match && match[1]) {
          invCounter = match[1].toUpperCase();
        }

        if (!counterGroupMap[invCounter]) {
          counterGroupMap[invCounter] = {
            counterCode: invCounter,
            billerName: inv.staff_user_name || undefined,
            invoiceCount: 0,
            netSales: 0,
            cashSales: 0,
          };
        }
        counterGroupMap[invCounter].invoiceCount++;
        counterGroupMap[invCounter].netSales += gTotal;
        counterGroupMap[invCounter].cashSales += invCashPortion;
      }
    }
  } catch (err: any) {
    console.error('[ShopClosing] Invoices calculation error:', err.message);
  }

  // 3. Cash Transactions (Cash In, Cash Out, Expenses & Itemized lists)
  let totalCashIn = 0;
  let totalCashOut = 0;
  let cashInCount = 0;
  let cashOutCount = 0;
  let totalExpenses = 0;
  const cashInItems: Array<{ description: string; amount: number; time?: string }> = [];
  const expensesItems: Array<{ description: string; amount: number; time?: string }> = [];

  try {
    const txRows = shopClosingReportSql.findCashTransactions(db)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as any[];

    if (Array.isArray(txRows)) {
      for (const row of txRows) {
        const amt = Math.round(Number(row.amount || 0) * 100) / 100;
        const desc = (row.notes || row.category || (row.type === 'CASH_IN' ? 'Deposit' : 'Expense')).trim();
        if (row.type === 'CASH_IN') {
          totalCashIn += amt;
          cashInCount++;
          cashInItems.push({
            description: desc,
            amount: amt,
            time: row.transaction_date,
          });
        } else if (row.type === 'CASH_OUT') {
          totalCashOut += amt;
          cashOutCount++;
          expensesItems.push({
            description: desc,
            amount: amt,
            time: row.transaction_date,
          });
        }
      }
      totalCashIn = Math.round(totalCashIn * 100) / 100;
      totalCashOut = Math.round(totalCashOut * 100) / 100;
      totalExpenses = totalCashOut;
    }
  } catch (err: any) {
    console.error('[ShopClosing] Cash transactions error:', err.message);
  }

  // 4. Customer Payments collected & Party transactions (from party_ledger)
  let customerPaymentsCollected = 0;
  const partyTransactionItems: Array<{ partyName: string; type: 'Got Cash' | 'Gave Cash' | string; amount: number; description?: string }> = [];

  try {
    const plRows = shopClosingReportSql.findPartyLedger(db)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as any[];

    if (Array.isArray(plRows)) {
      for (const pl of plRows) {
        const credit = Math.round(Number(pl.credit_amount || 0) * 100) / 100;
        const debit = Math.round(Number(pl.debit_amount || 0) * 100) / 100;
        const partyName = (pl.party_name || pl.party_id || 'Party').trim();
        const descUpper = (pl.description || '').toUpperCase();
        const isExplicitGot = descUpper.includes('GOT CASH') || descUpper.includes('CASH RECEIVED') || descUpper.includes('RECEIPT');
        const isExplicitGave = descUpper.includes('GAVE CASH') || descUpper.includes('CASH PAID') || descUpper.includes('PAYMENT');

        // In POS Party Ledger:
        // DEBIT is Received / Got Cash from Customer (collections towards dues).
        // CREDIT is Paid / Gave Cash to Party (or sale charge).
        // If an entry explicitly says Got Cash in description, treat as Got Cash regardless of column.
        if (debit > 0 || (credit > 0 && isExplicitGot)) {
          const amt = debit > 0 ? debit : credit;
          customerPaymentsCollected += amt;
          partyTransactionItems.push({
            partyName,
            type: 'Got Cash',
            amount: amt,
            description: pl.description || undefined,
          });
        } else if (credit > 0 || (debit > 0 && isExplicitGave)) {
          const amt = credit > 0 ? credit : debit;
          partyTransactionItems.push({
            partyName,
            type: 'Gave Cash',
            amount: amt,
            description: pl.description || undefined,
          });
        }
      }
      customerPaymentsCollected = Math.round(customerPaymentsCollected * 100) / 100;
    }
  } catch (err: any) {
    console.error('[ShopClosing] Party ledger query error:', err.message);
  }

  // 5. Staff transactions
  const staffTransactionItems: Array<{ staffName: string; type: string; amount: number; notes?: string }> = [];
  try {
    const stRows = shopClosingReportSql.findStaffTransactions(db)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as any[];

    if (Array.isArray(stRows)) {
      for (const st of stRows) {
        const amt = Math.round(Number(st.amount || 0) * 100) / 100;
        staffTransactionItems.push({
          staffName: (st.staff_name || 'Staff').trim(),
          type: st.type || 'Payment',
          amount: amt,
          notes: st.notes || undefined,
        });
      }
    }
  } catch (err: any) {
    console.error('[ShopClosing] Staff transactions query error:', err.message);
  }

  // 6. Scrap transactions & bill scrap deductions
  const scrapSummary: {
    totalAmount: number;
    count: number;
    items: Array<{ categoryName: string; quantity: number; unit?: string; rate: number; totalAmount: number; partyName?: string }>;
  } = {
    totalAmount: 0,
    count: 0,
    items: [],
  };

  try {
    const scrapRows = shopClosingReportSql.findScrapTransactions(db)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as any[];

    if (Array.isArray(scrapRows)) {
      for (const sr of scrapRows) {
        const total = Math.round(Number(sr.total_amount || 0) * 100) / 100;
        scrapSummary.totalAmount += total;
        scrapSummary.count++;
        scrapSummary.items.push({
          categoryName: sr.category_name || (sr.type === 'PURCHASE' ? 'Scrap Purchase' : 'Scrap Sale'),
          quantity: Number(sr.quantity || 0),
          unit: sr.unit || 'Kgs',
          rate: Number(sr.rate || 0),
          totalAmount: total,
          partyName: sr.party_name || undefined,
        });
      }
    }

    // Also check invoices for scrap deductions
    const invScrapRow = shopClosingReportSql.countInvoicesByConvertedFrom_(db)
      .get(tid, bDate, altDate, bDate, altDate, dateLike) as any;

    if (invScrapRow && Number(invScrapRow.total_inv_scrap) > 0) {
      const invScrapAmt = Math.round(Number(invScrapRow.total_inv_scrap) * 100) / 100;
      scrapSummary.totalAmount += invScrapAmt;
      scrapSummary.count += Number(invScrapRow.inv_scrap_count || 1);
      scrapSummary.items.push({
        categoryName: 'Bill Scrap Deductions',
        quantity: Number(invScrapRow.inv_scrap_count || 1),
        unit: 'bills',
        rate: invScrapAmt,
        totalAmount: invScrapAmt,
      });
    }

    scrapSummary.totalAmount = Math.round(scrapSummary.totalAmount * 100) / 100;
  } catch (err: any) {
    console.error('[ShopClosing] Scrap query error:', err.message);
  }

  // 7. Returns count & amount
  let returnsCount = 0;
  let returnsAmount = 0;
  try {
    const retRow = shopClosingReportSql.countReturns(db)
      .get(tid, bDate, altDate, bDate, altDate, dateLike) as any;

    if (retRow) {
      returnsCount = Number(retRow.ret_count || 0);
      returnsAmount = Math.round(Number(retRow.ret_total || 0) * 100) / 100;
    }
  } catch (err: any) {
    console.error('[ShopClosing] Returns query error:', err.message);
  }

  // 8. Purchases bills
  let purchasesCount = 0;
  let purchasesAmount = 0;
  try {
    let amountCol = 'grand_total';
    try {
      const tableInfo = shopClosingReportSql.pragmaTableInfo(db).all() as any[];
      const colNames = (tableInfo || []).map((c: any) => c.name);
      if (colNames.includes('total_amount')) {
        amountCol = 'total_amount';
      } else if (colNames.includes('grand_total')) {
        amountCol = 'grand_total';
      }
    } catch {}

    const pbRow = db
      .prepare(`
        SELECT COUNT(*) AS pb_count, COALESCE(SUM(${amountCol}), 0) AS pb_total
        FROM purchase_bills
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id IS NULL)
          AND (
            date(bill_date) = ?
            OR date(bill_date) = ?
            OR substr(bill_date, 1, 10) = ?
            OR substr(bill_date, 1, 10) = ?
            OR bill_date LIKE ?
            OR date(created_at) = ?
            OR substr(created_at, 1, 10) = ?
          )
      `)
      .get(tid, bDate, altDate, bDate, altDate, dateLike, bDate, bDate) as any;

    if (pbRow) {
      purchasesCount = Number(pbRow.pb_count || 0);
      purchasesAmount = Math.round(Number(pbRow.pb_total || 0) * 100) / 100;
    }
  } catch (err: any) {
    console.error('[ShopClosing] Purchases query error:', err.message);
  }

  // Multi-counter summary list
  const countersSummary = Object.values(counterGroupMap).map((c) => ({
    counterCode: c.counterCode,
    billerName: c.billerName,
    invoiceCount: c.invoiceCount,
    netSales: Math.round(c.netSales * 100) / 100,
    cashSales: Math.round(c.cashSales * 100) / 100,
  }));

  // Round results
  return {
    tenantId: tid,
    shopName,
    businessDate: bDate,
    closingTimestamp,
    closingStaffName: staffName,
    registerStatus,
    closingRemarks,
    counterCode,
    totalInvoices,
    grossSales: Math.round(grossSales * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    netSales: Math.round(netSales * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    paymentBreakdown: {
      cash: Math.round(paymentBreakdown.cash * 100) / 100,
      card: Math.round(paymentBreakdown.card * 100) / 100,
      upi: Math.round(paymentBreakdown.upi * 100) / 100,
      bankTransfer: Math.round(paymentBreakdown.bankTransfer * 100) / 100,
      cheque: Math.round(paymentBreakdown.cheque * 100) / 100,
      credit: Math.round(paymentBreakdown.credit * 100) / 100,
    },
    creditSalesAmount: Math.round(creditSalesAmount * 100) / 100,
    customerPaymentsCollected,
    totalCashIn,
    totalCashOut,
    cashInCount,
    cashOutCount,
    totalExpenses,
    expensesItems,
    cashInItems,
    partyTransactionItems,
    staffTransactionItems,
    scrapSummary,
    returnsCount,
    returnsAmount,
    refundsPaidAmount: Math.round(refundsPaidAmount * 100) / 100,
    purchasesCount,
    purchasesAmount,
    openingBalance,
    expectedClosingCash,
    actualCashCounted,
    cashShortage,
    cashExcess,
    countersSummary,
  };
}

/**
 * Format the WhatsApp closing message based on checklist
 */
function formatClosingWhatsAppMessage(summaryData: any, checklist: ShopClosingChecklist): string {
  const lines: string[] = [];

  // Header
  lines.push(`🏪 *SHOP CLOSING OVERVIEW*`);
  lines.push(`🏢 *${summaryData.shopName || 'STORE'}*`);

  // Date & Time
  if (checklist.dateTime) {
    lines.push(`📅 *Date:* ${summaryData.businessDate}`);
    if (summaryData.closingTimestamp) {
      lines.push(`⏰ *Closing Time:* ${summaryData.closingTimestamp}`);
    }
  }

  // Counter details
  if (checklist.counterDetails) {
    lines.push(`🖥️ *Counter:* ${summaryData.counterCode || 'Main Counter'}`);
  }

  // Closing Staff
  if (checklist.closingStaff && summaryData.closingStaffName) {
    lines.push(`👤 *Closed By:* ${summaryData.closingStaffName}`);
  }

  // Closing Status
  if (checklist.closingStatus) {
    const isClosed = summaryData.registerStatus === 'CLOSED';
    lines.push(`${isClosed ? '🔒' : '🔓'} *Status:* ${isClosed ? 'CLOSED (Settled)' : 'OPEN / In Progress'}`);
    if (summaryData.closingRemarks) {
      lines.push(`📝 *Remarks:* ${summaryData.closingRemarks}`);
    }
  }

  // Sales & Invoices
  if (checklist.sales || checklist.invoices) {
    lines.push(``);
    lines.push(`📊 *SALES SUMMARY*`);
    if (checklist.invoices) {
      lines.push(`• Total Invoices: *${summaryData.totalInvoices}*`);
    }
    if (checklist.sales) {
      lines.push(`• Net Sales: *${formatCurrency(summaryData.netSales)}*`);
      if (checklist.grossSales !== false && summaryData.grossSales > 0 && summaryData.totalDiscount > 0) {
        lines.push(`• Gross Sales: ${formatCurrency(summaryData.grossSales)}`);
      }
      if (checklist.totalDiscount !== false && summaryData.totalDiscount > 0) {
        lines.push(`• Total Discount: -${formatCurrency(summaryData.totalDiscount)}`);
      }
      if (checklist.taxCollected !== false && summaryData.totalTax > 0) {
        lines.push(`• Tax Collected: ${formatCurrency(summaryData.totalTax)}`);
      }
    }
  }

  // Payment Breakdown
  if (checklist.paymentMethods) {
    const pm = summaryData.paymentBreakdown;
    const pmLines: string[] = [];
    if (checklist.paymentCash !== false && (pm.cash > 0 || (pm.upi === 0 && pm.card === 0 && pm.bankTransfer === 0 && pm.cheque === 0 && pm.credit === 0))) {
      pmLines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
    } else if (checklist.paymentCash !== false && pm.cash > 0) {
      pmLines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
    }
    if (checklist.paymentUpi !== false && pm.upi > 0) {
      pmLines.push(`• UPI / QR: *${formatCurrency(pm.upi)}*`);
    }
    if (checklist.paymentCard !== false && pm.card > 0) {
      pmLines.push(`• Card / POS: *${formatCurrency(pm.card)}*`);
    }
    if (checklist.paymentBank !== false && pm.bankTransfer > 0) {
      pmLines.push(`• Bank Transfer: ${formatCurrency(pm.bankTransfer)}`);
    }
    if (checklist.paymentCheque !== false && pm.cheque > 0) {
      pmLines.push(`• Cheque: ${formatCurrency(pm.cheque)}`);
    }
    if (checklist.paymentCredit !== false && pm.credit > 0) {
      pmLines.push(`• Credit (Pending): ${formatCurrency(pm.credit)}`);
    }

    // If all payment collections are 0.00, show only selected modes with 0.00 rather than cluttering
    if (pmLines.length === 0) {
      if (checklist.paymentCash !== false) pmLines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
      if (checklist.paymentUpi !== false) pmLines.push(`• UPI / QR: *${formatCurrency(pm.upi)}*`);
      if (checklist.paymentCard !== false) pmLines.push(`• Card / POS: *${formatCurrency(pm.card)}*`);
      if (checklist.paymentBank !== false && pm.bankTransfer > 0) pmLines.push(`• Bank Transfer: ${formatCurrency(pm.bankTransfer)}`);
      if (checklist.paymentCheque !== false && pm.cheque > 0) pmLines.push(`• Cheque: ${formatCurrency(pm.cheque)}`);
      if (checklist.paymentCredit !== false && pm.credit > 0) pmLines.push(`• Credit (Pending): ${formatCurrency(pm.credit)}`);
    }

    if (pmLines.length > 0) {
      lines.push(``);
      lines.push(`💳 *PAYMENT BREAKDOWN*`);
      lines.push(...pmLines);
    }
  }

  // Credit & Collections
  if (checklist.creditSales || checklist.customerPayments) {
    const items: string[] = [];
    if (checklist.creditSales) items.push(`• Credit Sales Issued: *${formatCurrency(summaryData.creditSalesAmount)}*`);
    if (checklist.customerPayments) items.push(`• Customer Ledger Collections: *${formatCurrency(summaryData.customerPaymentsCollected)}*`);
    if (items.length > 0) {
      lines.push(``);
      lines.push(`📑 *CREDIT & COLLECTIONS*`);
      lines.push(...items);
    }
  }

  // Party Transactions List (Itemized)
  if (checklist.partyTransactions && summaryData.partyTransactionItems && summaryData.partyTransactionItems.length > 0) {
    lines.push(``);
    lines.push(`👥 *PARTY TRANSACTIONS:*`);
    summaryData.partyTransactionItems.forEach((pt: any) => {
      const typeNote = pt.type ? ` (${pt.type})` : '';
      lines.push(`• -${pt.partyName} : *${formatCurrency(pt.amount)}*${typeNote}`);
    });
  }

  // Staff Transactions List (Itemized)
  if (checklist.staffTransactions && summaryData.staffTransactionItems && summaryData.staffTransactionItems.length > 0) {
    lines.push(``);
    lines.push(`👔 *STAFF TRANSACTIONS:*`);
    summaryData.staffTransactionItems.forEach((st: any) => {
      const typeNote = st.type ? ` (${st.type})` : '';
      const notesTxt = st.notes ? ` - ${st.notes}` : '';
      lines.push(`• -${st.staffName} : *${formatCurrency(st.amount)}*${typeNote}${notesTxt}`);
    });
  }

  // Cash Balances & Differences
  if (checklist.cashBalances || checklist.cashDifferences) {
    lines.push(``);
    lines.push(`💰 *CASH DRAWER RECONCILIATION*`);
    if (checklist.cashBalances) {
      lines.push(`• Opening Balance: ${formatCurrency(summaryData.openingBalance)}`);
      lines.push(`• Expected Closing Cash: *${formatCurrency(summaryData.expectedClosingCash)}*`);
      lines.push(`• Actual Counted Cash: *${formatCurrency(summaryData.actualCashCounted)}*`);
    }
    if (checklist.cashDifferences) {
      if (summaryData.cashShortage > 0) {
        lines.push(`• ⚠️ *Cash Shortage:* -${formatCurrency(summaryData.cashShortage)}`);
      } else if (summaryData.cashExcess > 0) {
        lines.push(`• ➕ *Cash Excess:* +${formatCurrency(summaryData.cashExcess)}`);
      } else {
        lines.push(`• ✅ *Cash Variance:* Balanced (₹0.00)`);
      }
    }
  }

  // Cash In / Out & Expenses
  if (checklist.cashInOut || checklist.expenses) {
    const items: string[] = [];
    if (checklist.cashInOut) {
      items.push(`• Cash In (Deposits): +${formatCurrency(summaryData.totalCashIn)} (${summaryData.cashInCount} entry)`);
      items.push(`• Cash Out (Withdrawals): -${formatCurrency(summaryData.totalCashOut)} (${summaryData.cashOutCount} entry)`);
    }
    if (checklist.expenses) {
      items.push(`• Business Expenses: *${formatCurrency(summaryData.totalExpenses)}*`);
    }
    if (items.length > 0) {
      lines.push(``);
      lines.push(`💸 *CASH FLOW SUMMARY*`);
      lines.push(...items);
    }
  }

  // Itemized Cash In List
  if (checklist.cashInList && summaryData.cashInItems && summaryData.cashInItems.length > 0) {
    lines.push(``);
    lines.push(`📥 *CASH IN ENTRIES:*`);
    summaryData.cashInItems.forEach((ci: any) => {
      lines.push(`• ${ci.description}: *+${formatCurrency(ci.amount)}*`);
    });
    lines.push(`*Total Cash In:* +${formatCurrency(summaryData.totalCashIn)}`);
  }

  // Itemized Expenses List
  if (checklist.expensesList && summaryData.expensesItems && summaryData.expensesItems.length > 0) {
    lines.push(``);
    lines.push(`🧾 *EXPENSES LIST:*`);
    summaryData.expensesItems.forEach((exp: any) => {
      lines.push(`• ${exp.description}: *${formatCurrency(exp.amount)}*`);
    });
    lines.push(`*Total Expenses:* ${formatCurrency(summaryData.totalExpenses)}`);
  }

  // Scrap Transactions & Deductions
  if (checklist.scrap && summaryData.scrapSummary && (summaryData.scrapSummary.totalAmount > 0 || summaryData.scrapSummary.count > 0)) {
    lines.push(``);
    lines.push(`♻️ *SCRAP ENTRIES:*`);
    summaryData.scrapSummary.items.forEach((sc: any) => {
      const qtyTxt = sc.quantity > 0 ? ` (${sc.quantity} ${sc.unit || 'Kgs'}${sc.rate > 0 ? ` @ ${formatCurrency(sc.rate)}` : ''})` : '';
      lines.push(`• ${sc.categoryName}${qtyTxt}: *${formatCurrency(sc.totalAmount)}*`);
    });
    lines.push(`*Total Scrap:* ${formatCurrency(summaryData.scrapSummary.totalAmount)}`);
  }

  // Returns & Refunds
  if (checklist.returns || checklist.refunds) {
    const items: string[] = [];
    if (checklist.returns) items.push(`• Sales Returns: *${formatCurrency(summaryData.returnsAmount)}* (${summaryData.returnsCount} return)`);
    if (checklist.refunds) items.push(`• Refunds Paid Out: *${formatCurrency(summaryData.refundsPaidAmount)}*`);
    if (items.length > 0) {
      lines.push(``);
      lines.push(`↩️ *RETURNS & REFUNDS*`);
      lines.push(...items);
    }
  }

  // Purchases
  if (checklist.purchases && summaryData.purchasesAmount > 0) {
    lines.push(``);
    lines.push(`📦 *PURCHASES*`);
    lines.push(`• Supplier Bills: *${formatCurrency(summaryData.purchasesAmount)}* (${summaryData.purchasesCount} bill)`);
  }

  // Multi-counter breakdown
  if (checklist.counterDetails && summaryData.countersSummary && summaryData.countersSummary.length > 1) {
    lines.push(``);
    lines.push(`🖩 *MULTI-COUNTER BREAKDOWN*`);
    summaryData.countersSummary.forEach((c: any) => {
      lines.push(`• *${c.counterCode}*: ${c.invoiceCount} bills | Net: ${formatCurrency(c.netSales)} (Cash: ${formatCurrency(c.cashSales)})`);
    });
  }

  // Footer
  lines.push(``);
  lines.push(`— *Generated by Nafid POS*`);

  return lines.join('\n');
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
    } catch (e: any) {
      console.warn('[ShopClosing] Deduplication check warning:', e.message);
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
  } catch (err: any) {
    console.error('[ShopClosing] Failed to insert report log:', err.message);
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
      } catch {}

      notifyRendererReportsUpdated();
      return { success: true, messageId: res.messageId, reportId };
    } else {
      const errorMsg = res.error || 'WhatsApp message dispatch failed.';
      try {
        shopClosingReportSql.updateShopClosingReportStatusAndErrorMessage(db).run(errorMsg, reportId);
      } catch {}

      notifyRendererReportsUpdated();
      return { success: false, error: errorMsg, reportId };
    }
  } catch (err: any) {
    const errorMsg = err?.message || 'Unexpected error sending WhatsApp report.';
    try {
      shopClosingReportSql.updateShopClosingReportStatusAndErrorMessage(db).run(errorMsg, reportId);
    } catch {}

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
  } catch (err: any) {
    return { success: false, error: err.message };
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
  } catch (err: any) {
    console.error('[ShopClosing] getShopClosingHistory error:', err.message);
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
  } catch {}
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
    } catch (err: any) {
      console.error('[ShopClosing Scheduler] Error in check cycle:', err.message);
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
    } catch (err: any) {
      return { success: false, error: err.message };
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

