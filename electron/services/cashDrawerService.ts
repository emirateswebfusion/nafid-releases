import crypto from 'node:crypto';
import { localDate, parseCleanDate, getStoreTimezoneSetting } from './storeTime.js';
import * as cashDrawerSql from '../db/statements/cashDrawer.js';


export function deduplicateAndGetOpenDrawer(db: any, tenantId: string, dateStr?: string): any {
  if (!db) return null;
  const activeTenantId = tenantId || 'global';
  const storeTz = getStoreTimezoneSetting(db, activeTenantId);
  const cleanDate = dateStr ? parseCleanDate(dateStr, storeTz) : localDate();
  const parts = cleanDate.split('-');
  const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
  const dateLike = `${cleanDate}%`;

  const candidates = cashDrawerSql.findCashDrawerByBusinessDate(db).all(activeTenantId, cleanDate, altDate, cleanDate, dateLike, cleanDate, altDate) as any[];

  let primary: any = null;
  if (candidates && candidates.length > 0) {
    primary = candidates[0];
  } else {
    const openCandidates = cashDrawerSql.findCashDrawerByStatus(db).all(activeTenantId) as any[];
    if (openCandidates && openCandidates.length > 0) {
      primary = openCandidates[0];
    }
  }

  if (!primary) return null;

  if (candidates && candidates.length > 1) {
    for (let i = 1; i < candidates.length; i++) {
      const dup = candidates[i];
      if (dup.drawer_id !== primary.drawer_id) {
        try {
          cashDrawerSql.updateCashTransactionDrawerId(db).run(primary.drawer_id, dup.drawer_id);
          cashDrawerSql.updateCashierAuditLogDrawerId(db).run(primary.drawer_id, dup.drawer_id);
          if (dup.status === 'OPEN') {
            cashDrawerSql.updateCashDrawerStatusAndClosingRemarks(db).run(dup.drawer_id);
          }
        } catch {}
      }
    }
  }

  return reconcileCashDrawer(db, activeTenantId, primary);
}

export function getOpenCashDrawer(db: any, tenantId: string, dateStr?: string): any {
  return deduplicateAndGetOpenDrawer(db, tenantId, dateStr);
}

export function getCashAmountFromInvoice(inv: any): number {
  if (!inv) return 0;
  const pm = (inv.payment_method || '').toUpperCase();
  const grand = Math.max(0, Number(inv.grand_total) || 0);
  const retD = Math.max(0, Number(inv.return_deduction) || 0);
  const scrapD = Math.max(0, Number(inv.scrap_deduction) || 0);
  const netPayable = Math.max(0, grand - retD - scrapD);

  if (pm === 'CASH') {
    if (netPayable <= 0) return 0;
    const rec = Number(inv.received_amount);
    if (rec > 0 && rec < netPayable) {
      return rec;
    }
    return netPayable;
  }
  if (pm === 'SPLIT' || pm === 'CREDIT') {
    if (inv.split_details && inv.split_details !== 'null') {
      try {
        let sd = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        while (typeof sd === 'string') {
          try { sd = JSON.parse(sd); } catch { break; }
        }
        if (sd && typeof sd === 'object') {
          const cashSplit = Math.max(0, Number(sd.cash) || 0);
          if (cashSplit > 0) return Math.min(cashSplit, netPayable);
        }
      } catch {}
    }
    if (pm === 'CREDIT' && Number(inv.received_amount) > 0) {
      return Math.min(Number(inv.received_amount), netPayable);
    }
  }
  return 0;
}

export function reconcileCashDrawer(db: any, tenantId: string, drawer: any): any {
  if (!drawer || !tenantId) return drawer;
  try {
    const storeTz = getStoreTimezoneSetting(db, tenantId);
    const cleanDate = parseCleanDate(drawer.business_date, storeTz);
    const parts = cleanDate.split('-');
    const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
    const dateLike1 = `${cleanDate}%`;
    const dateLike2 = `${altDate}%`;

    // Calculate total cash sales from settled cash invoices & cash portion of split invoices for this business date
    const salesRow = cashDrawerSql.findInvoices(db).get(tenantId, cleanDate, altDate, cleanDate, altDate, dateLike1, dateLike2) as any;

    const calcSales = Math.round(Number(salesRow?.total_cash_sales || 0) * 100) / 100;

    // Calculate Cash In and Cash Out sums across all drawers / transactions for this business date
    const txSums = cashDrawerSql.findCashTransactionsByDrawerIdAndBusinessDate(db).get(tenantId, drawer.drawer_id, tenantId, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate) as any;

    const calcIn = Math.round(Number(txSums?.total_in || 0) * 100) / 100;
    const calcOut = Math.round(Number(txSums?.total_out || 0) * 100) / 100;

    const openingBal = Math.round(Number(drawer.opening_balance || 0) * 100) / 100;
    const expectedCash = Math.round((openingBal + calcSales + calcIn - calcOut) * 100) / 100;

    drawer.cash_sales = calcSales;
    drawer.cash_in = calcIn;
    drawer.cash_out = calcOut;
    drawer.current_cash = expectedCash;
    drawer.expected_closing = expectedCash;

    if (drawer.status === 'CLOSED' && drawer.actual_cash !== null && drawer.actual_cash !== undefined) {
      const actual = Math.round(Number(drawer.actual_cash) * 100) / 100;
      const variance = Math.round((actual - expectedCash) * 100) / 100;
      drawer.cash_short = variance < 0 ? Math.abs(variance) : 0;
      drawer.cash_excess = variance > 0 ? variance : 0;
      cashDrawerSql.updateCashDrawerByDrawerId(db).run(calcSales, calcIn, calcOut, expectedCash, expectedCash, drawer.cash_short, drawer.cash_excess, drawer.drawer_id);
    } else {
      cashDrawerSql.updateCashDrawerByDrawerId2(db).run(calcSales, calcIn, calcOut, expectedCash, expectedCash, drawer.drawer_id);
    }
  } catch (err: any) {
    console.error('[Cashier] reconcileCashDrawer error:', err.message);
  }
  return drawer;
}

export function autoClosePastOpenDrawers(db: any, tenantId: string) {
  if (!tenantId) return;
  try {
    const today = localDate(new Date(), tenantId);
    const storeTz = getStoreTimezoneSetting(db, tenantId);
    const openDrawers = cashDrawerSql.findCashDrawerByStatusOpen(db).all(tenantId) as any[];

    if (Array.isArray(openDrawers) && openDrawers.length > 0) {
      for (const d of openDrawers) {
        const cleanDate = parseCleanDate(d.business_date, storeTz);
        if (cleanDate < today) {
          reconcileCashDrawer(db, tenantId, d);
          const exp = Number(d.expected_closing || 0);
          cashDrawerSql.updateCashDrawerByDrawerIdClosed(db).run(exp, d.drawer_id);
        }
      }
    }
  } catch (err: any) {
    console.error('[Cashier] autoClosePastOpenDrawers error:', err.message);
  }
}

export function adjustCashDrawerForInvoice(
  db: any,
  tenantId: string,
  invoiceCreatedAt: string | Date | undefined,
  oldCashAmount: number,
  newCashAmount: number
) {
  const diff = (Number(newCashAmount) || 0) - (Number(oldCashAmount) || 0);
  if (Math.abs(diff) < 0.001) return; // No change in cash amount

  let businessDate = localDate(new Date(), tenantId);
  if (invoiceCreatedAt) {
    try {
      const d = new Date(invoiceCreatedAt);
      if (!isNaN(d.getTime())) {
        businessDate = localDate(d, tenantId);
      }
    } catch {}
  }

  let drawer = deduplicateAndGetOpenDrawer(db, tenantId, businessDate);

  if (!drawer && tenantId) {
    try {
      let defaultBal = 0;
      let autoOpenSetting = false;
      const autoOpenRow = cashDrawerSql.findOneSettingByKey(db).get(tenantId, tenantId) as any;
      if (autoOpenRow && autoOpenRow.value !== undefined && autoOpenRow.value !== null) {
        try { autoOpenSetting = Boolean(JSON.parse(autoOpenRow.value)); } catch { autoOpenSetting = String(autoOpenRow.value).trim() === 'true'; }
      }
      if (autoOpenSetting) {
        const balRow = cashDrawerSql.findOneSettingByKeyDefaultOpeningBalance(db).get(tenantId, tenantId) as any;
        if (balRow && balRow.value !== undefined && balRow.value !== null) {
          try { defaultBal = Number(JSON.parse(balRow.value)) || 0; } catch { defaultBal = Number(balRow.value) || 0; }
        }
        if (isNaN(defaultBal) || defaultBal < 0) defaultBal = 0;
      }

      const drawerId = crypto.randomUUID();
      cashDrawerSql.insertCashDrawer(db).run(drawerId, tenantId, businessDate, defaultBal, defaultBal, defaultBal);
      drawer = cashDrawerSql.findCashDrawerByDrawerId(db).get(drawerId) as any;
    } catch (e: any) {
      console.error('[Cashier] Auto-create drawer error:', e.message);
    }
  }

  if (drawer) {
    reconcileCashDrawer(db, tenantId, drawer);
  }
}

export function adjustPaymentSourcesForInvoice(
  db: any,
  tenantId: string,
  invoice: any,
  isDeleteOrCancel: boolean = false
) {
  if (!db || !tenantId || !invoice) return;
  try {
    const pm = (invoice.payment_method || '').toUpperCase();
    let splitObj: any = null;
    if (invoice.split_details && invoice.split_details !== 'null') {
      if (typeof invoice.split_details === 'string') {
        try { splitObj = JSON.parse(invoice.split_details); } catch {}
      } else if (typeof invoice.split_details === 'object') {
        splitObj = invoice.split_details;
      }
    }

    const processSourceTransaction = (sourceId: string | undefined, sourceType: string, amount: number) => {
      if (amount <= 0) return;
      let source: any = null;
      if (sourceId) {
        source = cashDrawerSql.findPaymentSourcesBySourceId(db).get(sourceId, tenantId) as any;
      }
      if (!source) {
        source = cashDrawerSql.findOnePaymentSourceByTypeAndIsEnabled(db).get(tenantId, sourceType) as any;
      }
      if (source) {
        const delta = isDeleteOrCancel ? -amount : amount;
        const newBalance = Number(source.current_balance) + delta;
        const txnType = isDeleteOrCancel ? 'CASH_OUT' : 'CASH_IN';
        const category = isDeleteOrCancel ? 'Invoice Cancellation' : 'Invoice Sale';
        
        cashDrawerSql.insertPaymentSourceTransaction(db).run(
          crypto.randomUUID(), tenantId, source.source_id, txnType, amount,
          category, invoice.invoice_number || null, `Invoice ${invoice.invoice_number || ''} ${isDeleteOrCancel ? 'cancelled' : 'payment'} via ${sourceType}`,
          newBalance, invoice.user_id || 'system', invoice.user_name || null
        );

        cashDrawerSql.updatePaymentSourceCurrentBalance(db)
          .run(newBalance, source.source_id);
      }
    };

    if (pm === 'UPI') {
      const upiAmt = Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0);
      processSourceTransaction(invoice.payment_source_id || splitObj?.upi_source_id, 'UPI', upiAmt);
    } else if (pm === 'CARD') {
      const cardAmt = Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0);
      processSourceTransaction(invoice.payment_source_id || splitObj?.card_source_id, 'CARD', cardAmt);
    } else if (pm === 'BANK_TRANSFER' || pm === 'BANK') {
      const bankAmt = Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0);
      processSourceTransaction(invoice.payment_source_id || splitObj?.bank_source_id, 'BANK_TRANSFER', bankAmt);
    } else if (pm === 'SPLIT' && splitObj) {
      if (Number(splitObj.upi) > 0) {
        processSourceTransaction(splitObj.upi_source_id || invoice.payment_source_id, 'UPI', Number(splitObj.upi));
      }
      if (Number(splitObj.card) > 0) {
        processSourceTransaction(splitObj.card_source_id || invoice.payment_source_id, 'CARD', Number(splitObj.card));
      }
      if (Number(splitObj.bank_transfer) > 0) {
        processSourceTransaction(splitObj.bank_source_id || invoice.payment_source_id, 'BANK_TRANSFER', Number(splitObj.bank_transfer));
      }
    }
  } catch (err: any) {
    console.error('[PaymentSources] adjustPaymentSourcesForInvoice error:', err.message);
  }
}

// ── Cashier & Settlement IPC Handlers ─────────────────────────────────────────


