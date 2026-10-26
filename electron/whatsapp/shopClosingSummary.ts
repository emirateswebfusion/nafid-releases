import type { CashDrawerRow } from '../services/typesA.js';
import * as shopClosingReportSql from '../db/statements/shopClosingReport.js';

/**
 * Build consolidated summary data from POS database
 */
export function buildShopClosingSummaryData(
  db: import('better-sqlite3').Database,
  tenantId: string = 'global',
  businessDate?: string,
  providedDrawer?: Record<string, unknown>,
  closedByName?: string,
  reconcileCashDrawerFn?: typeof import('../services/cashDrawerService.js').reconcileCashDrawer,
  getStoreTimezoneSettingFn?: (db: import('better-sqlite3').Database, tid?: string) => string
) {
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
      .get(tid, tid) as Record<string, unknown>;
    if (shopRow?.value) {
      try {
        const parsed = JSON.parse((shopRow.value as string));
        shopName = typeof parsed === 'string' ? parsed : shopRow.value as string;
      } catch {
        shopName = (shopRow.value as string);
      }
    }
  } catch { /* ignore */ }

  // Get Terminal Code
  let counterCode = 'POS 1';
  try {
    const termRow = shopClosingReportSql.findOneSettingByKeyTerminalCode(db)
      .get(tid) as Record<string, unknown>;
    if (termRow?.value) {
      try {
        const parsed = JSON.parse((termRow.value as string));
        counterCode = typeof parsed === 'string' ? parsed : termRow.value as string;
      } catch {
        counterCode = (termRow.value as string);
      }
    }
  } catch { /* ignore */ }

  // 1. Drawer Reconciliation
  let drawer = providedDrawer as CashDrawerRow | null | undefined;
  if (!drawer) {
    try {
      drawer = shopClosingReportSql.findOneCashDrawerByBusinessDate(db)
        .get(tid, bDate, altDate, bDate, dateLike, bDate) as CashDrawerRow | undefined;
    } catch { /* ignore */ }
  }

  if (drawer && reconcileCashDrawerFn) {
    try {
      drawer = reconcileCashDrawerFn(db, tid, drawer);
    } catch (e) {
      console.warn('[ShopClosing] drawer reconcile warning:', (e as Error).message);
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
      const userRow = shopClosingReportSql.findUsersByUserId(db).get(drawer.closed_by) as Record<string, unknown>;
      if (userRow) staffName = (userRow.name as string) || ('' as string);
    } catch { /* ignore */ }
  }
  if (!staffName && drawer?.opened_by) {
    try {
      const userRow = shopClosingReportSql.findUsersByUserId(db).get(drawer.opened_by) as Record<string, unknown>;
      if (userRow) staffName = (userRow.name as string) || ('' as string);
    } catch { /* ignore */ }
  }

  // Closing timestamp
  let closingTimestamp = '';
  if (drawer?.closed_at) {
    try {
      const d = new Date((drawer.closed_at as string | number));
      closingTimestamp = d.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    } catch {
      closingTimestamp = String(drawer.closed_at);
    }
  } else {
    try {
      closingTimestamp = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    } catch { /* ignore */ }
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
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as Record<string, unknown>[];

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

        const pm = ((inv.payment_method as string) || ('CASH' as string)).toUpperCase();
        let invCashPortion = 0;

        if (pm === 'SPLIT' && inv.split_details) {
          let sd: Record<string, unknown> = (inv.split_details as Record<string, unknown>);
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
            billerName: (inv.staff_user_name as string | undefined) || (undefined as string | undefined),
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
  } catch (err) {
    console.error('[ShopClosing] Invoices calculation error:', (err as Error).message);
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
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as Record<string, unknown>[];

    if (Array.isArray(txRows)) {
      for (const row of txRows) {
        const amt = Math.round(Number(row.amount || 0) * 100) / 100;
        const desc = ((row.notes as string) || (row.category as string) || (row.type === 'CASH_IN' ? 'Deposit' : 'Expense')).trim();
        if (row.type === 'CASH_IN') {
          totalCashIn += amt;
          cashInCount++;
          cashInItems.push({
            description: desc,
            amount: amt,
            time: (row.transaction_date as string | undefined),
          });
        } else if (row.type === 'CASH_OUT') {
          totalCashOut += amt;
          cashOutCount++;
          expensesItems.push({
            description: desc,
            amount: amt,
            time: (row.transaction_date as string | undefined),
          });
        }
      }
      totalCashIn = Math.round(totalCashIn * 100) / 100;
      totalCashOut = Math.round(totalCashOut * 100) / 100;
      totalExpenses = totalCashOut;
    }
  } catch (err) {
    console.error('[ShopClosing] Cash transactions error:', (err as Error).message);
  }

  // 4. Customer Payments collected & Party transactions (from party_ledger)
  let customerPaymentsCollected = 0;
  const partyTransactionItems: Array<{ partyName: string; type: 'Got Cash' | 'Gave Cash' | string; amount: number; description?: string }> = [];

  try {
    const plRows = shopClosingReportSql.findPartyLedger(db)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as Record<string, unknown>[];

    if (Array.isArray(plRows)) {
      for (const pl of plRows) {
        const credit = Math.round(Number(pl.credit_amount || 0) * 100) / 100;
        const debit = Math.round(Number(pl.debit_amount || 0) * 100) / 100;
        const partyName = ((pl.party_name as string) || (pl.party_id as string) || 'Party').trim();
        const descUpper = ((pl.description as string) || ('' as string)).toUpperCase();
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
            description: (pl.description as string | undefined) || (undefined as string | undefined),
          });
        } else if (credit > 0 || (debit > 0 && isExplicitGave)) {
          const amt = credit > 0 ? credit : debit;
          partyTransactionItems.push({
            partyName,
            type: 'Gave Cash',
            amount: amt,
            description: (pl.description as string | undefined) || (undefined as string | undefined),
          });
        }
      }
      customerPaymentsCollected = Math.round(customerPaymentsCollected * 100) / 100;
    }
  } catch (err) {
    console.error('[ShopClosing] Party ledger query error:', (err as Error).message);
  }

  // 5. Staff transactions
  const staffTransactionItems: Array<{ staffName: string; type: string; amount: number; notes?: string }> = [];
  try {
    const stRows = shopClosingReportSql.findStaffTransactions(db)
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as Record<string, unknown>[];

    if (Array.isArray(stRows)) {
      for (const st of stRows) {
        const amt = Math.round(Number(st.amount || 0) * 100) / 100;
        staffTransactionItems.push({
          staffName: ((st.staff_name as string) || ('Staff' as string)).trim(),
          type: (st.type as string) || ('Payment' as string),
          amount: amt,
          notes: (st.notes as string | undefined) || (undefined as string | undefined),
        });
      }
    }
  } catch (err) {
    console.error('[ShopClosing] Staff transactions query error:', (err as Error).message);
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
      .all(tid, bDate, altDate, bDate, altDate, dateLike) as Record<string, unknown>[];

    if (Array.isArray(scrapRows)) {
      for (const sr of scrapRows) {
        const total = Math.round(Number(sr.total_amount || 0) * 100) / 100;
        scrapSummary.totalAmount += total;
        scrapSummary.count++;
        scrapSummary.items.push({
          categoryName: (sr.category_name as string) || (sr.type === 'PURCHASE' ? 'Scrap Purchase' : 'Scrap Sale'),
          quantity: Number(sr.quantity || 0),
          unit: (sr.unit as string | undefined) || ('Kgs' as string | undefined),
          rate: Number(sr.rate || 0),
          totalAmount: total,
          partyName: (sr.party_name as string | undefined) || (undefined as string | undefined),
        });
      }
    }

    // Also check invoices for scrap deductions
    const invScrapRow = shopClosingReportSql.countInvoicesByConvertedFrom_(db)
      .get(tid, bDate, altDate, bDate, altDate, dateLike) as Record<string, unknown>;

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
  } catch (err) {
    console.error('[ShopClosing] Scrap query error:', (err as Error).message);
  }

  // 7. Returns count & amount
  let returnsCount = 0;
  let returnsAmount = 0;
  try {
    const retRow = shopClosingReportSql.countReturns(db)
      .get(tid, bDate, altDate, bDate, altDate, dateLike) as Record<string, unknown>;

    if (retRow) {
      returnsCount = Number(retRow.ret_count || 0);
      returnsAmount = Math.round(Number(retRow.ret_total || 0) * 100) / 100;
    }
  } catch (err) {
    console.error('[ShopClosing] Returns query error:', (err as Error).message);
  }

  // 8. Purchases bills
  let purchasesCount = 0;
  let purchasesAmount = 0;
  try {
    let amountCol: 'grand_total' | 'total_amount' = 'grand_total';
    try {
      const tableInfo = shopClosingReportSql.pragmaTableInfo(db).all() as Record<string, unknown>[];
      const colNames = (tableInfo || []).map((c: unknown) => (c as { name: string }).name);
      if (colNames.includes('total_amount')) {
        amountCol = 'total_amount';
      } else if (colNames.includes('grand_total')) {
        amountCol = 'grand_total';
      }
    } catch { /* ignore */ }

    const pbRow = shopClosingReportSql.sumPurchaseBillsForDate(db, amountCol)
      .get(tid, bDate, altDate, bDate, altDate, dateLike, bDate, bDate) as Record<string, unknown>;

    if (pbRow) {
      purchasesCount = Number(pbRow.pb_count || 0);
      purchasesAmount = Math.round(Number(pbRow.pb_total || 0) * 100) / 100;
    }
  } catch (err) {
    console.error('[ShopClosing] Purchases query error:', (err as Error).message);
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
