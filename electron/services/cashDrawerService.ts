import { getStoreCountrySetting, roundStoreMoney, storeMoneyMinorUnit } from './storeCountryService.js';
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
  const cleanDate = dateStr ? parseCleanDate(dateStr, storeTz) : localDate(new Date(), activeTenantId);
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
  if (!inv || inv.counts_in_revenue === 0) return 0;
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
          // Cash kept on the customer's account is in the drawer too.
          const onAccount = pm === 'CREDIT' ? Math.max(0, Number((sd as SplitDetails).on_account) || 0) : 0;
          if (cashSplit > 0) return Math.min(cashSplit, netPayable) + onAccount;
        }
      } catch { /* ignore */ }
    }
    if (pm === 'CREDIT' && Number(inv.received_amount) > 0) {
      return Math.min(Number(inv.received_amount), netPayable);
    }
  }
  return 0;
}

/** Rounds at the shop currency's precision (2 decimals; 3 for a Bahrain shop). A missing amount stays NaN, as before. */
const round2For = (db: Db, tenantId: string) => {
  const country = getStoreCountrySetting(db, tenantId);
  return (n: number) => roundStoreMoney(n, country);
};

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
      const variance = round2For(db, tenantId)(round2For(db, tenantId)(Number(drawer.actual_cash)) - t.expected);
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

/**
 * Money a bill puts in each payment account (UPI / card / bank), by account: UPI, CARD and BANK bills the amount
 * received (else the total); SPLIT bills their upi / card / bank_transfer parts. Cash, cheque and credit go to no account.
 */
function invoiceSourceAmounts(db: Db, tenantId: string, invoice: InvoicePaymentFields) {
  const amounts = new Map<string, { source: PaymentSourceRow; type: string; amount: number }>();
  if (invoice.counts_in_revenue === 0) return amounts; // not real money (see getCashAmountFromInvoice)
  const pm = (invoice.payment_method || '').toUpperCase();
  let splitObj: SplitDetails | null = null;
  if (invoice.split_details && invoice.split_details !== 'null') {
    if (typeof invoice.split_details === 'string') {
      try { splitObj = JSON.parse(invoice.split_details); } catch { /* ignore */ }
    } else if (typeof invoice.split_details === 'object') {
      splitObj = invoice.split_details;
    }
  }

  const add = (sourceId: string | null | undefined, sourceType: string, amount: number) => {
    if (!(amount > 0)) return;
    let source: PaymentSourceRow | null | undefined = null;
    if (sourceId) {
      source = cashDrawerSql.findPaymentSourcesBySourceId(db).get(sourceId, tenantId) as PaymentSourceRow | undefined;
    }
    if (!source) {
      source = cashDrawerSql.findOnePaymentSourceByTypeAndIsEnabled(db).get(tenantId, sourceType === 'BANK_TRANSFER' ? 'BANK' : sourceType) as PaymentSourceRow | undefined;
    }
    if (!source) return;
    const entry = amounts.get(source.source_id) || { source, type: sourceType, amount: 0 };
    entry.amount = round2For(db, tenantId)(entry.amount + amount);
    amounts.set(source.source_id, entry);
  };

  if (pm === 'UPI') {
    add(invoice.payment_source_id || splitObj?.upi_source_id, 'UPI', Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0));
  } else if (pm === 'CARD') {
    add(invoice.payment_source_id || splitObj?.card_source_id, 'CARD', Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0));
  } else if (pm === 'BANK_TRANSFER' || pm === 'BANK') {
    add(invoice.payment_source_id || splitObj?.bank_source_id, 'BANK_TRANSFER', Math.max(0, Number(invoice.received_amount || invoice.grand_total) || 0));
  } else if (pm === 'SPLIT' && splitObj) {
    add(splitObj.upi_source_id || invoice.payment_source_id, 'UPI', Number(splitObj.upi));
    add(splitObj.card_source_id || invoice.payment_source_id, 'CARD', Number(splitObj.card));
    add(splitObj.bank_source_id || invoice.payment_source_id, 'BANK_TRANSFER', Number(splitObj.bank_transfer));
  }
  return amounts;
}

/** Post one bill movement to a payment account: positive = money in (sale), negative = money out (cancellation). */
function postSourceMovement(db: Db, tenantId: string, invoice: InvoicePaymentFields, source: PaymentSourceRow, type: string, delta: number) {
  const fresh = cashDrawerSql.findPaymentSourcesBySourceId(db).get(source.source_id, tenantId) as PaymentSourceRow | undefined;
  const newBalance = round2For(db, tenantId)(Number((fresh || source).current_balance) + delta);
  const isOut = delta < 0;
  cashDrawerSql.insertPaymentSourceTransaction(db).run(
    crypto.randomUUID(), tenantId, source.source_id, isOut ? 'CASH_OUT' : 'CASH_IN', round2For(db, tenantId)(Math.abs(delta)),
    isOut ? 'Invoice Cancellation' : 'Invoice Sale', invoice.invoice_number || null,
    `Invoice ${invoice.invoice_number || ''} ${isOut ? 'cancelled' : 'payment'} via ${type}`,
    newBalance, invoice.user_id || 'system', invoice.user_name || null
  );
  cashDrawerSql.updatePaymentSourceCurrentBalance(db).run(newBalance, source.source_id);
}

export function adjustPaymentSourcesForInvoice(
  db: Db,
  tenantId: string,
  invoice: InvoicePaymentFields | null | undefined,
  isDeleteOrCancel: boolean = false
) {
  if (!db || !tenantId || !invoice || invoice.counts_in_revenue === 0) return; // not real money (see getCashAmountFromInvoice)
  try {
    for (const { source, type, amount } of invoiceSourceAmounts(db, tenantId, invoice).values()) {
      postSourceMovement(db, tenantId, invoice, source, type, isDeleteOrCancel ? -amount : amount);
    }
  } catch (err) {
    console.error('[PaymentSources] adjustPaymentSourcesForInvoice error:', (err as Error).message);
  }
}

/**
 * Bring the payment accounts in line with a bill as it is now (after an edit, a payment change, a delete or a
 * restore): what the bill should have in each account minus what it already posted there is posted as one movement.
 * Idempotent: repeating it, or editing back and forth, never adds money twice. A deleted bill should have nothing.
 */
export function syncPaymentSourcesForInvoice(db: Db, tenantId: string, invoice: (InvoicePaymentFields & { is_deleted?: number | boolean | null }) | null | undefined) {
  if (!db || !tenantId || !invoice?.invoice_number) return;
  try {
    const target = invoice.is_deleted ? new Map<string, { source: PaymentSourceRow; type: string; amount: number }>() : invoiceSourceAmounts(db, tenantId, invoice);
    const posted = new Map<string, number>();
    for (const row of cashDrawerSql.sumInvoicePaymentSourcePostings(db).all(tenantId, invoice.invoice_number) as Array<{ source_id: string; net: number }>) {
      posted.set(row.source_id, Number(row.net) || 0);
    }
    const country = getStoreCountrySetting(db, tenantId);
    for (const [sourceId, { source, type, amount }] of target) {
      const delta = roundStoreMoney(amount - (posted.get(sourceId) || 0), country);
      if (Math.abs(delta) >= storeMoneyMinorUnit(country)) postSourceMovement(db, tenantId, invoice, source, type, delta);
      posted.delete(sourceId);
    }
    for (const [sourceId, net] of posted) {
      if (Math.abs(net) < storeMoneyMinorUnit(country)) continue;
      const source = cashDrawerSql.findPaymentSourcesBySourceId(db).get(sourceId, tenantId) as PaymentSourceRow | undefined;
      if (source) postSourceMovement(db, tenantId, invoice, source, String(source.type || 'account'), -net);
    }
  } catch (err) {
    console.error('[PaymentSources] syncPaymentSourcesForInvoice error:', (err as Error).message);
  }
}

// ── Cashier & Settlement IPC Handlers ─────────────────────────────────────────


