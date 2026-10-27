import crypto from 'node:crypto';
import { localDate, parseCleanDate, getStoreTimezoneSetting } from './storeTime.js';
import * as cashDrawerSql from '../db/statements/cashDrawer.js';
import { AUTO_CLOSE_BACKSTOP_MINUTES, computeDrawerTotals, findOpenDrawers, getAutoCloseConfig, getAutoCloseDueMs, getSessionSinceMs, isFrozenDrawer } from './cashDrawerSession.js';
import type { Db } from '../db/statements/types.js';
import type { CashDrawerRow, InvoiceCashFields, InvoicePaymentFields, PaymentSourceRow, SettingRow, SplitDetails } from './typesA.js';

export { computeDrawerTotals } from './cashDrawerSession.js';
export type { DrawerTotals } from './cashDrawerSession.js';


export function deduplicateAndGetOpenDrawer(db: Db, tenantId: string, dateStr?: string): CashDrawerRow | null {
  if (!db) return null;
  const activeTenantId = tenantId || 'global';
  const storeTz = getStoreTimezoneSetting(db, activeTenantId);
  const cleanDate = dateStr ? parseCleanDate(dateStr, storeTz) : localDate();
  const parts = cleanDate.split('-');
  const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
  const dateLike = `${cleanDate}%`;

  const candidates = cashDrawerSql.findCashDrawerByBusinessDate(db).all(activeTenantId, cleanDate, altDate, cleanDate, dateLike, cleanDate, altDate) as CashDrawerRow[];

  let primary: CashDrawerRow | null = null;
  if (candidates && candidates.length > 0) {
    primary = candidates[0];
  } else {
    const openCandidates = cashDrawerSql.findCashDrawerByStatus(db).all(activeTenantId) as CashDrawerRow[];
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
        } catch { /* ignore */ }
      }
    }
  }

  return reconcileCashDrawer(db, activeTenantId, primary);
}

export function getOpenCashDrawer(db: Db, tenantId: string, dateStr?: string): CashDrawerRow | null {
  return deduplicateAndGetOpenDrawer(db, tenantId, dateStr);
}

export function getCashAmountFromInvoice(inv: InvoiceCashFields | null | undefined): number {
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
        let sd: unknown = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
        while (typeof sd === 'string') {
          try { sd = JSON.parse(sd); } catch { break; }
        }
        if (sd && typeof sd === 'object') {
          const cashSplit = Math.max(0, Number((sd as SplitDetails).cash) || 0);
          if (cashSplit > 0) return Math.min(cashSplit, netPayable);
        }
      } catch { /* ignore */ }
    }
    if (pm === 'CREDIT' && Number(inv.received_amount) > 0) {
      return Math.min(Number(inv.received_amount), netPayable);
    }
  }
  return 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const differs = (a: unknown, b: number) => Math.abs((Number(a) || 0) - b) > 0.001;

/** Recompute a drawer's totals from its session and store them when they changed. Frozen drawers are returned as stored. */
export function reconcileCashDrawer(db: Db, tenantId: string, drawer: CashDrawerRow): CashDrawerRow;
export function reconcileCashDrawer(db: Db, tenantId: string, drawer: CashDrawerRow | null | undefined): CashDrawerRow | null | undefined;
export function reconcileCashDrawer(db: Db, tenantId: string, drawer: CashDrawerRow | null | undefined): CashDrawerRow | null | undefined {
  if (!drawer || !tenantId) return drawer;
  try {
    getSessionSinceMs(db, tenantId);
    if (drawer.status === 'OPEN' && drawer.drawer_id) {
      // Installing sessions may just have closed this drawer (left open on an earlier day).
      const fresh = cashDrawerSql.findCashDrawerByDrawerId(db).get(drawer.drawer_id) as CashDrawerRow | undefined;
      if (fresh && fresh.status !== 'OPEN') Object.assign(drawer, fresh);
    }
    if (isFrozenDrawer(db, tenantId, drawer)) return drawer;
    const t = computeDrawerTotals(db, tenantId, drawer);
    const changed = differs(drawer.cash_sales, t.cash_sales) || differs(drawer.cash_in, t.cash_in) || differs(drawer.cash_out, t.cash_out)
      || differs(drawer.current_cash, t.expected) || differs(drawer.expected_closing, t.expected);

    drawer.cash_sales = t.cash_sales;
    drawer.cash_in = t.cash_in;
    drawer.cash_out = t.cash_out;
    drawer.current_cash = t.expected;
    drawer.expected_closing = t.expected;

    if (drawer.status === 'CLOSED' && drawer.actual_cash !== null && drawer.actual_cash !== undefined) {
      const variance = round2(round2(Number(drawer.actual_cash)) - t.expected);
      const short = variance < 0 ? Math.abs(variance) : 0;
      const excess = variance > 0 ? variance : 0;
      const varianceChanged = differs(drawer.cash_short, short) || differs(drawer.cash_excess, excess);
      drawer.cash_short = short;
      drawer.cash_excess = excess;
      if (changed || varianceChanged) {
        cashDrawerSql.updateCashDrawerByDrawerId(db).run(t.cash_sales, t.cash_in, t.cash_out, t.expected, t.expected, short, excess, drawer.drawer_id);
      }
    } else if (changed) {
      cashDrawerSql.updateCashDrawerByDrawerId2(db).run(t.cash_sales, t.cash_in, t.cash_out, t.expected, t.expected, drawer.drawer_id);
    }
  } catch (err) {
    console.error('[Cashier] reconcileCashDrawer error:', (err as Error).message);
  }
  return drawer;
}

/** Close an open drawer without a count: counted cash = expected, so no short / excess. Returns false if it was not open. */
export function closeDrawerAutomatically(db: Db, tenantId: string, drawer: CashDrawerRow, closedAtIso: string, remarks: string, closedBy: string | null): boolean {
  const t = computeDrawerTotals(db, tenantId, { ...drawer, status: 'OPEN' });
  const r = cashDrawerSql.closeDrawerAutomatically(db).run(
    t.cash_sales, t.cash_in, t.cash_out, t.expected, t.expected, t.expected, closedAtIso, remarks, closedBy, drawer.drawer_id,
  );
  return r.changes > 0;
}

/**
 * With auto close on, close open drawers that are more than AUTO_CLOSE_BACKSTOP_MINUTES past their due time (the
 * renderer asks the cashier at the due time; this catches a closed app or an unanswered prompt). With auto close off,
 * drawers stay open until the cashier closes them.
 */
export function autoCloseOverdueDrawers(db: Db, tenantId: string) {
  if (!tenantId) return;
  try {
    getSessionSinceMs(db, tenantId);
    const config = getAutoCloseConfig(db, tenantId);
    if (!config.enabled) return;
    const now = Date.now();
    for (const d of findOpenDrawers(db, tenantId)) {
      if (now >= getAutoCloseDueMs(db, tenantId, d, config) + AUTO_CLOSE_BACKSTOP_MINUTES * 60_000) {
        closeDrawerAutomatically(db, tenantId, d, new Date(now).toISOString(), 'Auto-closed at the auto close time', null);
      }
    }
  } catch (err) {
    console.error('[Cashier] autoCloseOverdueDrawers error:', (err as Error).message);
  }
}

export function adjustCashDrawerForInvoice(
  db: Db,
  tenantId: string,
  invoiceCreatedAt: string | Date | null | undefined,
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
    } catch { /* ignore */ }
  }

  let drawer = deduplicateAndGetOpenDrawer(db, tenantId, businessDate);

  if (!drawer && tenantId) {
    try {
      let defaultBal = 0;
      let autoOpenSetting = false;
      const autoOpenRow = cashDrawerSql.findOneSettingByKey(db).get(tenantId, tenantId) as SettingRow | undefined;
      if (autoOpenRow && autoOpenRow.value !== undefined && autoOpenRow.value !== null) {
        try { autoOpenSetting = Boolean(JSON.parse(autoOpenRow.value)); } catch { autoOpenSetting = String(autoOpenRow.value).trim() === 'true'; }
      }
      if (autoOpenSetting) {
        const balRow = cashDrawerSql.findOneSettingByKeyDefaultOpeningBalance(db).get(tenantId, tenantId) as SettingRow | undefined;
        if (balRow && balRow.value !== undefined && balRow.value !== null) {
          try { defaultBal = Number(JSON.parse(balRow.value)) || 0; } catch { defaultBal = Number(balRow.value) || 0; }
        }
        if (isNaN(defaultBal) || defaultBal < 0) defaultBal = 0;
      }

      const drawerId = crypto.randomUUID();
      cashDrawerSql.insertCashDrawer(db).run(drawerId, tenantId, businessDate, defaultBal, defaultBal, defaultBal);
      drawer = cashDrawerSql.findCashDrawerByDrawerId(db).get(drawerId) as CashDrawerRow | null;
    } catch (e) {
      console.error('[Cashier] Auto-create drawer error:', (e as Error).message);
    }
  }

  if (drawer) {
    reconcileCashDrawer(db, tenantId, drawer);
  }
  // A drawer left open past midnight holds today's bills too.
  for (const open of findOpenDrawers(db, tenantId)) {
    if (!drawer || open.drawer_id !== drawer.drawer_id) reconcileCashDrawer(db, tenantId, open);
  }
}

export function adjustPaymentSourcesForInvoice(
  db: Db,
  tenantId: string,
  invoice: InvoicePaymentFields | null | undefined,
  isDeleteOrCancel: boolean = false
) {
  if (!db || !tenantId || !invoice) return;
  try {
    const pm = (invoice.payment_method || '').toUpperCase();
    let splitObj: SplitDetails | null = null;
    if (invoice.split_details && invoice.split_details !== 'null') {
      if (typeof invoice.split_details === 'string') {
        try { splitObj = JSON.parse(invoice.split_details); } catch { /* ignore */ }
      } else if (typeof invoice.split_details === 'object') {
        splitObj = invoice.split_details;
      }
    }

    const processSourceTransaction = (sourceId: string | null | undefined, sourceType: string, amount: number) => {
      if (amount <= 0) return;
      let source: PaymentSourceRow | null | undefined = null;
      if (sourceId) {
        source = cashDrawerSql.findPaymentSourcesBySourceId(db).get(sourceId, tenantId) as PaymentSourceRow | undefined;
      }
      if (!source) {
        source = cashDrawerSql.findOnePaymentSourceByTypeAndIsEnabled(db).get(tenantId, sourceType === 'BANK_TRANSFER' ? 'BANK' : sourceType) as PaymentSourceRow | undefined;
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
  } catch (err) {
    console.error('[PaymentSources] adjustPaymentSourcesForInvoice error:', (err as Error).message);
  }
}

// ── Cashier & Settlement IPC Handlers ─────────────────────────────────────────


