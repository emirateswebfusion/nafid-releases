import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'crypto';
import { sendWhatsAppBill } from './whatsappService';

export interface ShopClosingChecklist {
  sales: boolean;
  invoices: boolean;
  paymentMethods: boolean;
  expenses: boolean;
  cashInOut: boolean;
  creditSales: boolean;
  customerPayments: boolean;
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

export const DEFAULT_CHECKLIST: ShopClosingChecklist = {
  dateTime: true,
  closingStatus: true,
  counterDetails: true,
  closingStaff: true,
  sales: true,
  invoices: true,
  paymentMethods: true,
  cashBalances: true,
  cashDifferences: true,
  cashInOut: true,
  expenses: true,
  creditSales: true,
  customerPayments: true,
  returns: true,
  refunds: true,
  purchases: false,
};

export const DEFAULT_CONFIG: ShopClosingOverviewConfig = {
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

export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[^0-9+]/g, '').trim();
}

export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 8 && cleaned.length <= 15;
}

/**
 * Read configuration from settings table
 */
export function getShopClosingConfig(db: any, tenantId: string = 'global'): ShopClosingOverviewConfig {
  try {
    const tid = tenantId || 'global';
    let row = db
      .prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'shop_closing_whatsapp_config' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 2 END) ASC, updated_at DESC LIMIT 1`)
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
export function saveShopClosingConfig(
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

    db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (?, 'shop_closing_whatsapp_config', ?, 'PENDING', CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = EXCLUDED.value,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `).run(tid, valString);

    return { success: true, config: updated };
  } catch (err: any) {
    console.error('[ShopClosing] saveShopClosingConfig error:', err);
    return { success: false, error: err.message || 'Failed to save configuration' };
  }
}

/**
 * Build consolidated summary data from POS database
 */
export function buildShopClosingSummaryData(
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
    const shopRow = db
      .prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'shop_name' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 2 END) ASC LIMIT 1`)
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
    const termRow = db
      .prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'terminal_code' LIMIT 1`)
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
      drawer = db
        .prepare(`
          SELECT * FROM cash_drawer
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
            AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)
          ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
        `)
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
  const cashShortage = Math.round(Number(drawer?.cash_short || 0) * 100) / 100;
  const cashExcess = Math.round(Number(drawer?.cash_excess || 0) * 100) / 100;
  const registerStatus = drawer?.status || 'OPEN';
  const closingRemarks = drawer?.closing_remarks || '';

  // Staff details
  let staffName = closedByName || '';
  if (!staffName && drawer?.closed_by) {
    try {
      const userRow = db.prepare(`SELECT name, role FROM users WHERE user_id = ?`).get(drawer.closed_by) as any;
      if (userRow) staffName = userRow.name || '';
    } catch {}
  }
  if (!staffName && drawer?.opened_by) {
    try {
      const userRow = db.prepare(`SELECT name, role FROM users WHERE user_id = ?`).get(drawer.opened_by) as any;
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
    const invoices = db
      .prepare(`
        SELECT i.*, u.name AS staff_user_name
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.user_id
        WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL)
          AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT')
          AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
          AND (i.is_held IS NULL OR i.is_held = 0)
          AND (i.is_deleted IS NULL OR i.is_deleted = 0)
          AND (
            date(COALESCE(i.settled_at, i.created_at)) = ?
            OR date(COALESCE(i.settled_at, i.created_at)) = ?
            OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = ?
            OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = ?
            OR COALESCE(i.settled_at, i.created_at) LIKE ?
          )
        ORDER BY COALESCE(i.settled_at, i.created_at) ASC
      `)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as any[];

    if (Array.isArray(invoices)) {
      totalInvoices = invoices.length;
      for (const inv of invoices) {
        const gTotal = Math.max(0, Number(inv.grand_total) || 0);
        const tax = Math.max(0, Number(inv.tax_total) || 0);
        const disc = Math.max(0, Number(inv.discount_total || 0) + Number(inv.points_redeemed_discount || 0));
        const sub = Math.max(0, Number(inv.subtotal) || 0);
        const refundPaid = Math.max(0, Number(inv.actual_refund_paid) || 0);

        netSales += gTotal;
        totalTax += tax;
        totalDiscount += disc;
        grossSales += (sub + tax);
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
          paymentBreakdown.credit += gTotal;
          creditSalesAmount += gTotal;
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

  // 3. Cash Transactions (Cash In, Cash Out, Expenses)
  let totalCashIn = 0;
  let totalCashOut = 0;
  let cashInCount = 0;
  let cashOutCount = 0;
  let totalExpenses = 0;

  try {
    const txRow = db
      .prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) AS total_in,
          COALESCE(SUM(CASE WHEN type = 'CASH_OUT' THEN amount ELSE 0 END), 0) AS total_out,
          COUNT(CASE WHEN type = 'CASH_IN' THEN 1 END) AS count_in,
          COUNT(CASE WHEN type = 'CASH_OUT' THEN 1 END) AS count_out
        FROM cash_transactions
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
          AND (
            date(transaction_date) = ?
            OR date(transaction_date) = ?
            OR substr(transaction_date, 1, 10) = ?
            OR substr(transaction_date, 1, 10) = ?
            OR transaction_date LIKE ?
          )
      `)
      .get(tid, bDate, altDate, bDate, altDate, dateLike) as any;

    if (txRow) {
      totalCashIn = Math.round(Number(txRow.total_in || 0) * 100) / 100;
      totalCashOut = Math.round(Number(txRow.total_out || 0) * 100) / 100;
      cashInCount = Number(txRow.count_in || 0);
      cashOutCount = Number(txRow.count_out || 0);
      totalExpenses = totalCashOut;
    }
  } catch (err: any) {
    console.error('[ShopClosing] Cash transactions error:', err.message);
  }

  // 4. Customer Payments collected today (from party_ledger)
  let customerPaymentsCollected = 0;
  try {
    const plRow = db
      .prepare(`
        SELECT COALESCE(SUM(credit_amount), 0) AS total_collected
        FROM party_ledger
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id IS NULL)
          AND (
            date(transaction_date) = ?
            OR date(transaction_date) = ?
            OR substr(transaction_date, 1, 10) = ?
            OR substr(transaction_date, 1, 10) = ?
            OR transaction_date LIKE ?
          )
          AND (is_deleted IS NULL OR is_deleted = 0)
          AND credit_amount > 0
          AND (description NOT LIKE '%Opening Balance%' OR description IS NULL)
      `)
      .get(tid, bDate, altDate, bDate, altDate, dateLike) as any;

    if (plRow) {
      customerPaymentsCollected = Math.round(Number(plRow.total_collected || 0) * 100) / 100;
    }
  } catch (err: any) {
    console.error('[ShopClosing] Party ledger query error:', err.message);
  }

  // 5. Returns count & amount
  let returnsCount = 0;
  let returnsAmount = 0;
  try {
    const retRow = db
      .prepare(`
        SELECT COUNT(*) AS ret_count, COALESCE(SUM(grand_total), 0) AS ret_total
        FROM returns
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id IS NULL)
          AND (
            date(return_date) = ?
            OR date(return_date) = ?
            OR substr(return_date, 1, 10) = ?
            OR substr(return_date, 1, 10) = ?
            OR return_date LIKE ?
          )
      `)
      .get(tid, bDate, altDate, bDate, altDate, dateLike) as any;

    if (retRow) {
      returnsCount = Number(retRow.ret_count || 0);
      returnsAmount = Math.round(Number(retRow.ret_total || 0) * 100) / 100;
    }
  } catch (err: any) {
    console.error('[ShopClosing] Returns query error:', err.message);
  }

  // 6. Purchases bills
  let purchasesCount = 0;
  let purchasesAmount = 0;
  try {
    const pbRow = db
      .prepare(`
        SELECT COUNT(*) AS pb_count, COALESCE(SUM(grand_total), 0) AS pb_total
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
export function formatClosingWhatsAppMessage(summaryData: any, checklist: ShopClosingChecklist): string {
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
      if (summaryData.totalDiscount > 0) {
        lines.push(`• Gross Sales: ${formatCurrency(summaryData.grossSales)}`);
        lines.push(`• Total Discount: -${formatCurrency(summaryData.totalDiscount)}`);
      }
      if (summaryData.totalTax > 0) {
        lines.push(`• Tax Collected: ${formatCurrency(summaryData.totalTax)}`);
      }
    }
  }

  // Payment Breakdown
  if (checklist.paymentMethods) {
    const pm = summaryData.paymentBreakdown;
    lines.push(``);
    lines.push(`💳 *PAYMENT BREAKDOWN*`);
    lines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
    lines.push(`• UPI / QR: *${formatCurrency(pm.upi)}*`);
    lines.push(`• Card / POS: *${formatCurrency(pm.card)}*`);
    if (pm.bankTransfer > 0) lines.push(`• Bank Transfer: ${formatCurrency(pm.bankTransfer)}`);
    if (pm.cheque > 0) lines.push(`• Cheque: ${formatCurrency(pm.cheque)}`);
    if (pm.credit > 0) lines.push(`• Credit (Pending): ${formatCurrency(pm.credit)}`);
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
      lines.push(`💸 *CASH TRANSACTIONS & EXPENSES*`);
      lines.push(...items);
    }
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
      const recent = db
        .prepare(`
          SELECT id, status, created_at FROM shop_closing_reports
          WHERE (tenant_id = ? OR tenant_id = 'global')
            AND business_date = ?
            AND trigger_type = ?
            AND status = 'SENT'
          ORDER BY created_at DESC LIMIT 1
        `)
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
    db.prepare(`
      INSERT INTO shop_closing_reports (
        id, tenant_id, business_date, trigger_type, terminal_code, recipient_phone,
        summary_data, checklist_config, message_text, status, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)
    `).run(
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
        db.prepare(`
          UPDATE shop_closing_reports
          SET status = 'SENT', whatsapp_message_id = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(res.messageId || null, reportId);
      } catch {}

      notifyRendererReportsUpdated();
      return { success: true, messageId: res.messageId, reportId };
    } else {
      const errorMsg = res.error || 'WhatsApp message dispatch failed.';
      try {
        db.prepare(`
          UPDATE shop_closing_reports
          SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(errorMsg, reportId);
      } catch {}

      notifyRendererReportsUpdated();
      return { success: false, error: errorMsg, reportId };
    }
  } catch (err: any) {
    const errorMsg = err?.message || 'Unexpected error sending WhatsApp report.';
    try {
      db.prepare(`
        UPDATE shop_closing_reports
        SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(errorMsg, reportId);
    } catch {}

    notifyRendererReportsUpdated();
    return { success: false, error: errorMsg, reportId };
  }
}

/**
 * Retry failed report
 */
export async function retryShopClosingReport(db: any, reportId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const row = db.prepare(`SELECT * FROM shop_closing_reports WHERE id = ?`).get(reportId) as any;
    if (!row) return { success: false, error: 'Report record not found' };

    const res = await sendWhatsAppBill({
      phone: row.recipient_phone,
      message: row.message_text,
    });

    if (res.success) {
      db.prepare(`
        UPDATE shop_closing_reports
        SET status = 'SENT', whatsapp_message_id = ?, error_message = NULL, sent_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(res.messageId || null, reportId);

      notifyRendererReportsUpdated();
      return { success: true };
    } else {
      db.prepare(`
        UPDATE shop_closing_reports
        SET status = 'FAILED', error_message = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(res.error || 'Retry failed', reportId);

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
export function getShopClosingHistory(db: any, tenantId: string = 'global', limit: number = 30): any[] {
  try {
    const tid = tenantId || 'global';
    return db
      .prepare(`
        SELECT * FROM shop_closing_reports
        WHERE tenant_id = ? OR tenant_id = 'global'
        ORDER BY created_at DESC LIMIT ?
      `)
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

export function startShopClosingScheduler(
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
        const existing = db
          .prepare(`
            SELECT id FROM shop_closing_reports
            WHERE (tenant_id = ? OR tenant_id = 'global')
              AND business_date = ?
              AND trigger_type = 'SCHEDULED'
              AND status = 'SENT'
            LIMIT 1
          `)
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
    return getShopClosingConfig(getDbFn(), tenant_id);
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

