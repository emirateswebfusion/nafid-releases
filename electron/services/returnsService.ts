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
  }>;
}) {
  if (!Array.isArray(payload.items) || payload.items.length === 0 ||
      payload.items.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return { success: false, error: 'Enter a positive quantity for at least one return item; omit zero-quantity items.' };
  }
  if (!Number.isFinite(payload.grand_total) || payload.grand_total <= 0 || !Number.isFinite(payload.subtotal) || !Number.isFinite(payload.tax_total) || payload.subtotal < 0 || payload.tax_total < 0 || payload.items.some(item => !Number.isFinite(item.unit_price) || item.unit_price < 0 || !Number.isFinite(item.tax_amount) || item.tax_amount < 0 || !Number.isFinite(item.total) || item.total < 0)) return { success: false, error: 'Enter valid non-negative return amounts.' };
  if (payload.return_date && !Number.isFinite(Date.parse(payload.return_date))) return { success: false, error: 'Enter a valid return date.' };
  const { items, ...returnData } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
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

    const stockInvoice = returnData.invoice_id ? returnsSql.findInvoicesByInvoiceId(db).get(returnData.invoice_id) as InvoiceRow | undefined : undefined;
    const itemStmt = returnsSql.insertReturnItem(db);
    const stockStmt = returnsSql.updateProductCurrentStock(db);

    for (const item of items) {
      itemStmt.run(
        item.return_item_id, returnData.return_id, returnData.tenant_id,
        item.invoice_item_id || null, item.product_id, item.name,
        item.quantity, item.unit_price, item.tax_amount, item.total
      );
      if (stockInvoice?.stock_applied !== 0) stockStmt.run(item.quantity, item.product_id);
    }

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

    // If original invoice was a credit bill, reduce its balance_amount by the returned amount
    if (isOrigCredit && origInv) {
      const currentBal = Number(origInv.balance_amount) || (origPm === 'CREDIT' ? Math.max(0, Number(origInv.grand_total) - (Number(origInv.received_amount) || 0)) : origSplitCredit);
      const newBal = Math.max(0, currentBal - Number(returnData.grand_total));
      returnsSql.updateInvoiceBalanceAmount(db).run(newBal, origInv.invoice_id);
    }

    const refMethod = (returnData.refund_method || (isOrigCredit ? 'CREDIT' : 'ADJUST_BILL')).toUpperCase();
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
      return numStr === qNum || Number(numStr) === Number(qNum) || numStr.endsWith(qNum);
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

/** IPC `db:settleReturnInvoice` */
export function settleReturnInvoice({ tenant_id, return_number, adjusted_invoice_number, amount }: { tenant_id: string; return_number: string; adjusted_invoice_number: string; amount: number }) {
  const db = getDb();
  const amt = Math.max(0, Number(amount) || 0);
  if (amt <= 0) return { success: false, error: 'Invalid adjustment amount' };
  
  // Get return details for ledger sync
  const returnData = returnsSql.findReturnsByReturnNumber3(db).get(tenant_id, return_number) as ReturnRow;
  
  const res = returnsSql.updateReturnAdjustedAmountAndAdjustedInvoiceNumber(db).run(amt, adjusted_invoice_number, tenant_id, return_number);
  
  if (res.changes === 0) return { success: false, error: 'Return not found or already fully adjusted' };
  
  // Sync party ledger for ADJUST_BILL
  if (returnData && returnData.refund_method === 'ADJUST_BILL') {
    syncReturnLedger(db, {
      tenant_id: tenant_id || 'global',
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
      adjusted_invoice_number: adjusted_invoice_number,
      amount: amt,
      user_id: returnData.user_id,
      user_name: returnData.user_name || returnData.user_id,
      created_at: localTimestamp(),
    });
  }
  
  return { success: true };
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

      const stockInvoice = returnRow.invoice_id ? returnsSql.findInvoicesByInvoiceId(db).get(returnRow.invoice_id) as InvoiceRow | undefined : undefined;
      const items = returnsSql.findReturnItemsByReturnIdProductIdAndQuantity(db).all(return_id) as InvoiceItem[];
      for (const item of items) {
        if (stockInvoice?.stock_applied !== 0) returnsSql.updateProductCurrentStockAlt(db).run(item.quantity, item.product_id);
      }

      // Restore original invoice balance_amount if it was a credit bill
      if (returnRow.invoice_id) {
        const origInv = returnsSql.findInvoicesByInvoiceId(db).get(returnRow.invoice_id) as InvoiceRow;
        if (origInv) {
          const origPm = (origInv.payment_method || '').toUpperCase();
          let origSplitCredit = 0;
          if (origInv.split_details) {
            try {
              const s = typeof origInv.split_details === 'string' ? JSON.parse(origInv.split_details) : origInv.split_details;
              origSplitCredit = Number(s?.credit) || 0;
            } catch { /* ignore */ }
          }
          const isOrigCredit = origPm === 'CREDIT' || origSplitCredit > 0 || (Number(origInv.balance_amount) > 0 && origPm !== 'CASH');
          if (isOrigCredit) {
            const restoredBalance = (Number(origInv.balance_amount) || 0) + (Number(returnRow.grand_total) || 0);
            returnsSql.updateInvoiceBalanceAmount(db).run(restoredBalance, origInv.invoice_id);
          }
        }
      }

      // Retire this return's ledger rows (exact references, this shop only) and recalculate the balances.
      removeReturnLedger(db, returnRow.tenant_id || 'global', returnRow.return_number);

      returnsSql.deleteReturnItemByReturnId(db).run(return_id);
      returnsSql.deleteReturnByReturnId(db).run(return_id);
      if (returnRow.invoice_id) reconcileInvoicePoints(db, returnRow.invoice_id);
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
