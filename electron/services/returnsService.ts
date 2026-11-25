import { outstandingInvoiceStock, returnStockOwner } from '../db/statements/invoiceStock.js';
import { movementBetween } from '../utils/stockOperation.js';
import { stockComponents } from '../utils/invoiceStock.js';
import { validateReturnSource, refreshReturnedInvoiceBalance } from './returnValidation.js';
import { toIsoTimestamp } from '../utils/timestamps.js';
import { reconcileInvoicePoints } from './loyaltyService.js';
import type { InvoiceItem, InvoiceRow, ReturnRow, SettingRow } from './typesB.js';
import { getDb } from '../db/localDb.js';
import { upsertCustomerRecord } from '../db/customerIdentity.js';
import { localTimestamp, localDate } from './storeTime.js';
import { getOpenCashDrawer, reconcileCashDrawer } from './cashDrawerService.js';
import crypto from 'node:crypto';
import { syncReturnLedger, removeReturnLedger } from './partyLedgerService.js';
import { getOrInitTerminalCode } from './invoiceNumberService.js';
import * as returnsSql from '../db/statements/returns.js';
import { syncReturnPaymentAccount } from './ledgerPaymentAccounts.js';
/** returns use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:createReturn` */
export function createReturn(payload: {
  return_id: string;
  invoice_id: string | null;
  tenant_id: string;
  user_id?: string;
  user_name?: string;
  return_number: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  reason?: string;
  return_date?: string;
  refund_method?: string;
  adjusted_invoice_number?: string;
  adjusted_amount?: number;
  items: Array<{
    return_item_id: string;
    product_id: string;
    invoice_item_id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
    combo_details?: string | null;
    pieces_sold?: number | null;
    billing_type?: string | null;
    uom?: string | null;
  }>;
}) {
  if (!Array.isArray(payload.items) || payload.items.length === 0 ||
      payload.items.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return { success: false, error: 'Enter a positive quantity for at least one return item; omit zero-quantity items.' };
  }
  if (!Number.isFinite(payload.grand_total) || payload.grand_total <= 0 || !Number.isFinite(payload.subtotal) || !Number.isFinite(payload.tax_total) || payload.subtotal < 0 || payload.tax_total < 0 || payload.items.some(item => !Number.isFinite(item.unit_price) || item.unit_price < 0 || !Number.isFinite(item.tax_amount) || item.tax_amount < 0 || !Number.isFinite(item.total) || item.total < 0)) return { success: false, error: 'Enter valid non-negative return amounts.' };
  if (payload.return_date && !Number.isFinite(Date.parse(payload.return_date))) return { success: false, error: 'Enter a valid return date.' };
  const { items: requestedItems, ...returnData } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    const items = validateReturnSource(db, returnData.tenant_id, returnData.invoice_id, requestedItems);
    const owner = returnData.invoice_id ? returnStockOwner(db, returnData.invoice_id, returnData.tenant_id) : null;
    const beforeStock = owner ? outstandingInvoiceStock(db, owner, returnData.tenant_id) : [];
    if (returnData.customer_name || returnData.customer_phone) {
      upsertCustomerRecord(db, returnData.tenant_id || 'global', returnData.customer_name, returnData.customer_phone, null);
    }
    const now = localTimestamp();
    const occurredAt = returnData.return_date ? toIsoTimestamp(returnData.return_date) : now;
    returnsSql.insertReturn(db).run(
      returnData.return_id, returnData.invoice_id, returnData.tenant_id, returnData.user_id || null,
      returnData.return_number, returnData.customer_name || null, returnData.customer_phone || null,
      returnData.customer_address || null,
      returnData.subtotal, returnData.tax_total, returnData.grand_total, returnData.reason || null,
      returnData.refund_method || null, returnData.adjusted_invoice_number || null,
      returnData.adjusted_amount ?? 0,
      occurredAt, occurredAt, now
    );

    const itemStmt = returnsSql.insertReturnItem(db);
    const stockStmt = returnsSql.updateProductCurrentStock(db);

    for (const item of items) {
      itemStmt.run(
        item.return_item_id, returnData.return_id, returnData.tenant_id,
        item.invoice_item_id || null, item.product_id, item.name,
        item.quantity, item.unit_price, item.tax_amount, item.total, item.combo_details || null,
        item.pieces_sold != null ? Number(item.pieces_sold) : null,
        item.billing_type || null,
        item.uom || null
      );
    }

    const movement = owner ? movementBetween(outstandingInvoiceStock(db, owner, returnData.tenant_id), beforeStock)
      : items.flatMap(stockComponents);
    for (const part of movement) stockStmt.run(part.quantity, part.product_id, returnData.tenant_id);

    let origInv: InvoiceRow | null | undefined = null;
    if (returnData.invoice_id) {
      origInv = returnsSql.findInvoicesByInvoiceId(db).get(returnData.invoice_id) as InvoiceRow | null | undefined;
    }
    if (origInv) reconcileInvoicePoints(db, origInv.invoice_id);
    const origPm = (origInv?.payment_method || '').toUpperCase();
    let origSplitCredit = 0;
    if (origInv?.split_details) {
      try {
        const s = typeof origInv.split_details === 'string' ? JSON.parse(origInv.split_details) : origInv.split_details;
        origSplitCredit = Number(s?.credit) || 0;
      } catch { /* ignore */ }
    }
    const isOrigCredit = Boolean(
      origInv && (
        origPm === 'CREDIT' ||
        origSplitCredit > 0 ||
        (Number(origInv.balance_amount) > 0 && origPm !== 'CASH')
      )
    );

    const refMethod = (returnData.refund_method || (isOrigCredit ? 'CREDIT' : 'ADJUST_BILL')).toUpperCase();
    refreshReturnedInvoiceBalance(db, returnData.invoice_id || '', returnData.tenant_id);
    syncReturnPaymentAccount(db, { ...returnData, refund_method: refMethod });

    if (refMethod === 'CASH' && Number(returnData.grand_total) > 0) {
      const todayDate = localDate(new Date(occurredAt), returnData.tenant_id);
      const drawer = getOpenCashDrawer(db, returnData.tenant_id, todayDate);
      if (drawer) {
        const existingTx = returnsSql.findCashTransactionsByDrawerIdAndCategory(db).get(drawer.drawer_id, `%${returnData.return_number}%`);
        if (!existingTx) {
          const txnId = crypto.randomUUID();
          returnsSql.insertCashTransaction(db).run(
            txnId,
            returnData.tenant_id,
            drawer.drawer_id,
            Number(returnData.grand_total),
            `Return refund for ${returnData.return_number}`,
            returnData.user_id || 'system'
          );
          reconcileCashDrawer(db, returnData.tenant_id, drawer);
        }
      }
    }

    // Sync party ledger whenever:
    // 1. Original bill was a credit invoice (return reduces customer's balance), OR
    // 2. Refund method is CREDIT, STORE_CREDIT, or ADJUST_BILL (customer gets account credit), OR
    // 3. Customer has an account / identity and refund was made
    const shouldSyncLedger = isOrigCredit || ['CREDIT', 'STORE_CREDIT', 'ADJUST_BILL'].includes(refMethod) || (
      Boolean(returnData.customer_name || returnData.customer_phone || origInv?.customer_id) &&
      ['CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CASH'].includes(refMethod) &&
      Number(returnData.grand_total) > 0
    );

    if (shouldSyncLedger && Number(returnData.grand_total) > 0) {
      syncReturnLedger(db, {
        tenant_id: returnData.tenant_id || origInv?.tenant_id || 'global',
        return_number: returnData.return_number,
        return_id: returnData.return_id,
        invoice_id: returnData.invoice_id || null,
        invoice_number: origInv?.invoice_number || null,
        customer_id: origInv?.customer_id || null,
        customer_name: returnData.customer_name || origInv?.customer_name || null,
        customer_phone: returnData.customer_phone || origInv?.customer_phone || null,
        customer_address: returnData.customer_address || origInv?.customer_address || null,
        customer_gstin: origInv?.customer_gstin || null,
        grand_total: Number(returnData.grand_total) || 0,
        refund_method: refMethod,
        amount: Number(returnData.grand_total) || 0,
        user_id: returnData.user_id,
        user_name: returnData.user_name || returnData.user_id,
        created_at: occurredAt,
      });
    }
  });

  try {
    transaction();
    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Return sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    return { success: true };
  } catch (error) {
    console.error('[db:createReturn]', error);
    return { success: false, error: (error as Error)?.message || 'Operation failed' };
  }
}

/** IPC `db:getAlreadyReturnedQuantities` */
export function getAlreadyReturnedQuantities(invoice_id: string) {
  const db = getDb();
  return returnsSql.findReturnItemsByReturnIdAndInvoiceId(db).all(invoice_id);
}

/** IPC `db:getReturnableInvoices` */
export function getReturnableInvoices({ tenant_id, search, limit = 10, role, user_id }: { tenant_id: string; search?: string; limit?: number; role?: string; user_id?: string }) {
  const db = getDb();
  const { statement, params } = returnsSql.getReturnableInvoicesStatement(db, { tenant_id, role, user_id, search, limit });

  return statement.all(...params);
}

/** IPC `db:getReturnInvoiceByNumber` */
export function getReturnInvoiceByNumber({ tenant_id, return_number }: { tenant_id: string; return_number: string }) {
  const db = getDb();
  const q = String(return_number || '').trim();
  if (!q) return null;
  const qNum = (q.match(/\d+/g) || []).join('');

  // 1. Direct match by exact return_number
  let row = returnsSql.findReturnsByReturnNumber(db).get(tenant_id, q);
  if (row) return row;

  // 2. Direct match by common prefixes
  row = returnsSql.findReturnsByReturnNumber2(db).get(tenant_id, `RET-${q}`, `RTN-${q}`);
  if (row) return row;

  // 3. Fallback: match by numeric part
  if (qNum) {
    const list = returnsSql.findReturns(db).all(tenant_id) as ReturnRow[];
    const match = list.find((r: ReturnRow) => {
      const numStr = (String(r.return_number || '').match(/\d+/g) || []).join('');
      return numStr === qNum || Number(numStr) === Number(qNum);
    });
    if (match) return match;
  }
  return null;
}

/** IPC `db:getPendingReturnInvoices` */
export function getPendingReturnInvoices({ tenant_id, search }: { tenant_id: string; search?: string }) {
  const db = getDb();
  const { statement, params } = returnsSql.getPendingReturnInvoicesStatement(db, { tenant_id, search });
  return statement.all(...params);
}

/** A return credit that cannot be used on a bill; its message is shown to the cashier. */
export class ReturnCreditError extends Error {}

/** Refund methods whose credit stays with the customer to be used on a later bill. */
export function isAdjustableReturn(refundMethod: unknown): boolean {
  const method = String(refundMethod ?? '').trim().toUpperCase();
  return method === '' || method === 'ADJUST_BILL';
}

/**
 * Uses part of an "Adjust Bill" return credit on a bill. Throws when the return does not exist, was refunded another
 * way (cash, UPI, card, ...), or has nothing left. Uses at most what is left and returns the amount used. Runs inside
 * the caller's transaction, so a bill and the use of its return credit are saved together or not at all.
 */
export function applyReturnCredit(db: ReturnType<typeof getDb>, args: { tenant_id: string; return_number: string; adjusted_invoice_number: string; amount: number }): number {
  const requested = Math.max(0, Number(args.amount) || 0);
  if (requested <= 0) throw new ReturnCreditError('Invalid return adjustment amount');
  const returnData = returnsSql.findReturnsByReturnNumber3(db).get(args.tenant_id, args.return_number) as ReturnRow | undefined;
  if (!returnData) throw new ReturnCreditError(`Return ${args.return_number} not found`);
  if (!isAdjustableReturn(returnData.refund_method)) {
    throw new ReturnCreditError(`Return ${args.return_number} was refunded by ${returnData.refund_method}; it cannot also be deducted from a bill`);
  }
  const current = returnsSql.findReturnsByReturnNumber(db).get(args.tenant_id, args.return_number) as ReturnRow;
  const remaining = (Number(current.grand_total) || 0) - (Number(current.adjusted_amount) || 0);
  if (remaining <= 0.0005) throw new ReturnCreditError(`Return ${args.return_number} is already fully adjusted`);
  const amt = Math.min(requested, remaining);
  const res = returnsSql.updateReturnAdjustedAmountAndAdjustedInvoiceNumber(db).run(amt, args.adjusted_invoice_number, args.tenant_id, args.return_number);
  if (res.changes === 0) throw new ReturnCreditError(`Return ${args.return_number} is already fully adjusted`);
  syncReturnLedger(db, {
    tenant_id: args.tenant_id || 'global',
    return_number: returnData.return_number,
    return_id: returnData.return_id,
    // The same customer the return was posted to (createReturn falls back to the original bill's customer).
    invoice_number: returnData.orig_invoice_number || null,
    customer_id: returnData.orig_customer_id || null,
    customer_name: (returnData.customer_name || '').trim() || returnData.orig_customer_name || null,
    customer_phone: (returnData.customer_phone || '').trim() || returnData.orig_customer_phone || null,
    customer_address: returnData.customer_address || returnData.orig_customer_address || null,
    customer_gstin: returnData.orig_customer_gstin || null,
    grand_total: returnData.grand_total,
    refund_method: 'ADJUST_BILL',
    adjusted_invoice_number: args.adjusted_invoice_number,
    amount: amt,
    user_id: returnData.user_id,
    user_name: returnData.user_name || returnData.user_id,
    created_at: localTimestamp(),
  });
  return amt;
}

/** IPC `db:settleReturnInvoice` (kept for older callers; new bills use the return credit inside checkout). */
export function settleReturnInvoice({ tenant_id, return_number, adjusted_invoice_number, amount }: { tenant_id: string; return_number: string; adjusted_invoice_number: string; amount: number }) {
  const db = getDb();
  try {
    db.transaction(() => applyReturnCredit(db, { tenant_id, return_number, adjusted_invoice_number, amount }))();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** IPC `db:getReturns` */
export function getReturns(filters?: {
  tenant_id?: string;
  invoice_id?: string;
  limit?: number;
  offset?: number;
  search?: string;
}) {
  try {
    const db = getDb();
    const { tenant_id, invoice_id, limit, offset, search } = filters || {};
    if (!tenant_id) return [];

    const { statement, params } = returnsSql.getReturnsStatement(db, { tenant_id, invoice_id, search, limit, offset });

    return statement.all(...params);
  } catch (error) {
    console.error('[db:getReturns]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getReturnItems` */
export function getReturnItems(return_id: string) {
  try {
    const db = getDb();
    return returnsSql.findReturnItemsByReturnId(db).all(return_id);
  } catch (error) {
    console.error('[db:getReturnItems]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:deleteReturn` */
export function deleteReturn(return_id: string) {
  try {
    const db = getDb();
    const transaction = db.transaction(() => {
      const returnRow = returnsSql.findReturnsByReturnId(db).get(return_id) as ReturnRow;
      if (!returnRow) return;
      syncReturnPaymentAccount(db, returnRow, true);

      const owner = returnRow.invoice_id ? returnStockOwner(db, returnRow.invoice_id, returnRow.tenant_id) : null;
      const beforeStock = owner ? outstandingInvoiceStock(db, owner, returnRow.tenant_id) : [];
      const items = returnsSql.findReturnItemsByReturnIdProductIdAndQuantity(db).all(return_id) as InvoiceItem[];

      // Retire this return's ledger rows (exact references, this shop only) and recalculate the balances.
      removeReturnLedger(db, returnRow.tenant_id || 'global', returnRow.return_number);

      returnsSql.deleteReturnItemByReturnId(db).run(return_id);
      returnsSql.deleteReturnByReturnId(db).run(return_id);
      const movement = owner ? movementBetween(outstandingInvoiceStock(db, owner, returnRow.tenant_id), beforeStock)
        : items.flatMap(stockComponents).map(part => ({ ...part, quantity: -part.quantity }));
      for (const part of movement) returnsSql.updateProductCurrentStock(db).run(part.quantity, part.product_id, returnRow.tenant_id);

      if (returnRow.invoice_id) {
        refreshReturnedInvoiceBalance(db, returnRow.invoice_id, returnRow.tenant_id);
        reconcileInvoicePoints(db, returnRow.invoice_id);
      }
    });
    transaction();
    return { success: true };
  } catch (error) {
    console.error('[db:deleteReturn]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getNextReturnNumber` */
export function getNextReturnNumber(payload: { tenant_id: string; prefix?: string }) {
  const db = getDb();
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-RTN-`;
  const result = db.transaction(() => {
    const confRow: SettingRow = returnsSql.findSettingsByKey(db).get('global', 'return_counter') as SettingRow;
    let prefix = defaultPrefix;
    let counter = 1;
    if (payload.prefix) {
      prefix = payload.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
    } else if (confRow) {
      try {
        const cfg = JSON.parse(confRow.value);
        const rawPrefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : defaultPrefix;
        if (rawPrefix.includes('-RTN-')) {
          // Respect user-set prefix -- no forced override
        }
        prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
      } catch {
        // Invalid JSON — use defaults
      }
    }
    const usedRows: ReturnRow[] = returnsSql.findReturnsReturnNumber(db).all(`${prefix}%`) as ReturnRow[];
    let maxUsed = 0;
    for (const row of usedRows) {
      const usedNum = parseInt(String(row.return_number).slice(prefix.length), 10);
      if (!isNaN(usedNum) && usedNum > maxUsed) maxUsed = usedNum;
    }
    const nextCounter = Math.max(counter, maxUsed + 1);
    const returnNumber = `${prefix}${String(nextCounter).padStart(3, '0')}`;
    returnsSql.upsertSetting(db).run(JSON.stringify({ prefix, counter: nextCounter + 1 }));
    return { success: true, returnNumber };
  })();
  return result;
}

/** IPC `db:peekNextReturnNumber` */
export function peekNextReturnNumber(payload: { tenant_id: string; prefix?: string }) {
  const db = getDb();
  const terminalCode = getOrInitTerminalCode(db);
  const defaultPrefix = `${terminalCode}-RTN-`;
  const confRow: SettingRow = returnsSql.findSettingsByKey(db).get('global', 'return_counter') as SettingRow;
  let prefix = defaultPrefix;
  let counter = 1;
  if (payload.prefix) {
    const sanitized = payload.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    prefix = sanitized && /[A-Z0-9]/i.test(sanitized) ? sanitized : defaultPrefix;
  } else if (confRow) {
    try {
      const cfg = JSON.parse(confRow.value);
      const rawPrefix = cfg.prefix && /[A-Z0-9]/i.test(cfg.prefix) ? cfg.prefix : defaultPrefix;
      if (rawPrefix.includes('-RTN-')) {
          // Respect user-set prefix -- no forced override
      }
      prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
      counter = typeof cfg.counter === 'number' ? cfg.counter : 1;
    } catch {
      // Invalid JSON — use defaults
    }
  }
  const usedRows: ReturnRow[] = returnsSql.findReturnsReturnNumber(db).all(`${prefix}%`) as ReturnRow[];
  let maxUsed = 0;
  for (const row of usedRows) {
    const usedNum = parseInt(String(row.return_number).slice(prefix.length), 10);
    if (!isNaN(usedNum) && usedNum > maxUsed) maxUsed = usedNum;
  }
  const nextCounter = Math.max(counter, maxUsed + 1);
  return { success: true, returnNumber: `${prefix}${String(nextCounter).padStart(3, '0')}` };
}
