import { getStoreCountrySetting } from './storeCountryService.js';
import { captureInvoicePoints, reconcileInvoicePoints, refreshInvoiceEarnings, validateInvoicePointsEdit } from './loyaltyService.js';
import { getDb } from '../db/localDb.js';
import { upsertCustomerRecord } from '../db/customerIdentity.js';
import { getCashAmountFromInvoice, syncPaymentSourcesForInvoice, adjustCashDrawerForInvoice } from './cashDrawerService.js';
import { normalizePaymentSplit, syncInvoiceCreditLedger, resetBackfillThrottle } from './partyLedgerService.js';
import crypto from 'node:crypto';
import { toEpochMs, toIsoTimestamp } from '../utils/timestamps.js';
import * as invoicesSql from '../db/statements/invoices.js';
import { recentCheckoutsCache } from './invoiceCheckoutService.js';
import type { InvoiceItemRow, InvoiceRow, SplitDetails, UserRow } from './typesA.js';
/** Changes to saved invoices: discounts, edits, payment updates, deletion. Called by electron/ipc handlers via invoicesService. */

/** IPC `db:applyInvoiceDiscount` */
export function applyInvoiceDiscount({ invoice_id, discount_type, discount_value, role }: { invoice_id: string, discount_type: 'FIXED' | 'PERCENTAGE', discount_value: number, role?: string }) {
  try {
    const db = getDb();

    // Only ADMIN or SUPER_ADMIN can apply discounts
    const normalizedRole = (role || '').toUpperCase();
    if (!['ADMIN', 'SUPER_ADMIN', 'OWNER'].includes(normalizedRole)) {
      return { success: false, error: 'Admin access required to apply discounts' };
    }
    
    return db.transaction(() => {
    const invoice = invoicesSql.findInvoicesByInvoiceIdSubtotalAndTaxTotal(db).get(invoice_id) as InvoiceRow | undefined;
    if (!invoice) return { success: false, error: 'Invoice not found' };

    let discount_total: number;
    if (discount_type === 'PERCENTAGE') {
      discount_total = invoice.subtotal * (discount_value / 100);
    } else {
      discount_total = discount_value;
    }

    const scrapD = Math.max(0, Number(invoice.scrap_deduction) || 0);
    const returnD = Math.max(0, Number(invoice.return_deduction) || 0);
    const grand_total = Math.max(0, invoice.subtotal + invoice.tax_total - discount_total - scrapD - returnD - (Number(invoice.points_redeemed_discount) || 0));

    captureInvoicePoints(db, invoice_id);
    invoicesSql.updateInvoiceByInvoiceId2(db).run(discount_total, discount_type, discount_value, grand_total, invoice_id);

    refreshInvoiceEarnings(db, invoice_id);
    return { success: true };
    })();
  } catch (error) {
    console.error('[db:applyInvoiceDiscount]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateInvoice` */
export async function updateInvoice(payload: {
  invoice_id: string;
  tenant_id: string;
  role?: string;
  permissions?: string[];
  user_id?: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  discount_type: string;
  discount_value: number;
  grand_total: number;
  payment_method?: string;
  received_amount?: number;
  actual_refund_paid?: number;
  balance_amount?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  customer_state?: string;
  customer_address?: string;
  scrap_deduction?: number;
  scrap_invoice_number?: string;
  return_deduction?: number;
  return_invoice_number?: string;
  created_at?: string;
  split_details?: SplitDetails | string | null;
  cgst_total?: number;
  sgst_total?: number;
  igst_total?: number;
  supply_type?: string;
  notes?: string | null;
  description?: string | null;
  points_earned?: number | null;
  points_redeemed?: number | null;
  points_redeemed_discount?: number | null;
  previous_points_balance?: number | null;
  remaining_points_balance?: number | null;
  customer_id?: string | null;
  is_staff?: boolean | number | null;
  isStaffCustomer?: boolean;
  staff_id?: string | null;
  items: Array<{
    item_id?: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
    isServiceItem?: boolean;
    pieces_sold?: number | null;
    pieces_override?: number | null;
    billing_type?: string | null;
    uom?: string | null;
    unit?: string | null;
    cgst_rate?: number | null;
    sgst_rate?: number | null;
    igst_rate?: number | null;
    cgst_amount?: number | null;
    sgst_amount?: number | null;
    igst_amount?: number | null;
    hsn_sac_code?: string | null;
    supply_type?: string | null;
  }>;
}) {
  // Permission check: allow ADMIN role OR staff with sales.edit permission
  const normalizedRole = (payload.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'].includes(normalizedRole);
  const perms = Array.isArray(payload.permissions) ? payload.permissions : [];
  const hasEditPerm = perms.includes('*') || perms.includes('sales.edit');

  let hasDbPerm = false;
  if (!isAdmin && !hasEditPerm && payload.user_id) {
    try {
      const db = getDb();
      const u = invoicesSql.findUsersByUserId(db).get(payload.user_id) as UserRow | undefined;
      if (u) {
        const uRole = (u.role || '').toUpperCase();
        if (['ADMIN', 'SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'].includes(uRole)) hasDbPerm = true;
        const uPerms = JSON.parse(u.permissions || '[]');
        if (Array.isArray(uPerms) && (uPerms.includes('*') || uPerms.includes('sales.edit'))) hasDbPerm = true;
      }
    } catch { /* ignore */ }
  }

  if (!isAdmin && !hasEditPerm && !hasDbPerm) {
    return { success: false, error: 'You do not have permission to edit bills' };
  }
  const { items, ...invoice } = payload;
  const db = getDb();
  const existingInv = invoicesSql.findInvoicesByInvoiceId2(db).get(payload.invoice_id) as InvoiceRow | undefined;
  if (!existingInv) {
    return { success: false, error: 'Invoice not found' };
  }
  const oldCash = getCashAmountFromInvoice(existingInv);

  const finalReceivedAmount = payload.received_amount !== undefined ? payload.received_amount : (existingInv?.received_amount ?? null);
  const finalActualRefundPaid = payload.actual_refund_paid !== undefined ? payload.actual_refund_paid : (existingInv?.actual_refund_paid ?? 0);
  const finalBalanceAmount = payload.balance_amount !== undefined ? payload.balance_amount : (existingInv?.balance_amount ?? null);

  // Deduplication guard: block duplicate update calls within a 4-second window for the same invoice
  const itemsSig = (items || []).map((i) => `${i.product_id}:${i.quantity}:${i.unit_price}`).sort().join('|');
  const headerSig = JSON.stringify(invoice);
  const updateCacheKey = `update:${existingInv.tenant_id || payload.tenant_id}:${payload.invoice_id}:${invoice.grand_total}:${itemsSig}:${headerSig}`;
  const now = Date.now();
  const cachedUpdate = recentCheckoutsCache.get(updateCacheKey);
  if (cachedUpdate && (now - cachedUpdate.timestamp < 4000)) {
    console.warn(`[db:updateInvoice] Duplicate update request blocked within 4s window for invoice ${payload.invoice_id}. Returning previous result.`);
    return cachedUpdate.result;
  }

  let savedSplit: SplitDetails = {};
  const transaction = db.transaction(() => {
    const targetCustId = invoice.customer_id || existingInv.customer_id || null;
    const customerId = upsertCustomerRecord(
      db,
      payload.tenant_id || 'global',
      invoice.customer_name,
      invoice.customer_phone,
      invoice.customer_address,
      {
        customer_id: targetCustId,
        gstin: invoice.customer_gstin,
      }
    );

    // A bill whose customer was cleared is a walk-in bill: it keeps no customer (and so no credit on anyone's ledger).
    // (A payload without customer fields keeps the bill's customer.)
    const customerCleared = (invoice.customer_name !== undefined || invoice.customer_phone !== undefined)
      && !(invoice.customer_name || '').trim() && !(invoice.customer_phone || '').trim();
    const hasCustomer = !customerCleared;
    const billCustomerId = hasCustomer ? (customerId || invoice.customer_id || existingInv.customer_id || null) : null;
    validateInvoicePointsEdit(db, payload.invoice_id, billCustomerId, invoice.points_redeemed, invoice.points_redeemed_discount);
    captureInvoicePoints(db, payload.invoice_id);
    // 1. Get old items for stock adjustment
    const oldItems = invoicesSql.findInvoiceItemsByInvoiceIdProductIdAndQuantity2(db).all(payload.invoice_id) as InvoiceItemRow[];

    const updatedCreatedAt = invoice.created_at
      ? (toEpochMs(invoice.created_at) === null ? null : toIsoTimestamp(invoice.created_at))
      : null;

    // 2. Update invoice header (with the exact payment breakdown: reports, filters and the drawer read it)
    savedSplit = normalizePaymentSplit({
      grand_total: invoice.grand_total, payment_method: invoice.payment_method || 'PENDING',
      received_amount: finalReceivedAmount, split_details: invoice.split_details ?? existingInv.split_details,
    }, getStoreCountrySetting(db, existingInv.tenant_id || 'global'));
    invoicesSql.updateInvoiceByInvoiceId3(db).run(
      invoice.subtotal, invoice.tax_total, invoice.discount_total,
      invoice.discount_type || 'FIXED', invoice.discount_value || 0,
      invoice.grand_total, invoice.payment_method || 'PENDING',
      finalReceivedAmount, finalActualRefundPaid, finalBalanceAmount,
      JSON.stringify(savedSplit),
      invoice.customer_name || null, invoice.customer_phone || null,
      invoice.customer_gstin || null, invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0, invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0, invoice.return_invoice_number || null,
      billCustomerId,
      invoice.cgst_total ?? 0, invoice.sgst_total ?? 0,
      invoice.igst_total ?? 0, invoice.supply_type || 'INTRA',
      invoice.notes || invoice.description || null,
      invoice.description || invoice.notes || null,
      existingInv.points_earned ?? null,
      invoice.points_redeemed ?? null,
      invoice.points_redeemed_discount ?? null,
      invoice.previous_points_balance ?? null,
      invoice.remaining_points_balance ?? null,
      updatedCreatedAt,
      payload.invoice_id
    );

    // Keep linked conversion documents in sync when invoice date is updated
    if (updatedCreatedAt) {
      if (existingInv.converted_from_invoice_id) {
        invoicesSql.updateInvoiceCreatedAt(db).run(updatedCreatedAt, existingInv.converted_from_invoice_id);
        invoicesSql.updateInvoiceItemsCreatedAt(db).run(updatedCreatedAt, existingInv.converted_from_invoice_id);
      }
      if (existingInv.converted_to_invoice_id) {
        invoicesSql.updateInvoiceCreatedAt(db).run(updatedCreatedAt, existingInv.converted_to_invoice_id);
        invoicesSql.updateInvoiceItemsCreatedAt(db).run(updatedCreatedAt, existingInv.converted_to_invoice_id);
      }
    }

    // 3. Delete old items
    invoicesSql.deleteInvoiceItemByInvoiceId(db).run(payload.invoice_id);

    // 4. Insert new items
    const itemStmt = invoicesSql.insertInvoiceItem3(db);
    for (const item of (items || [])) {
      itemStmt.run(
        item.item_id || crypto.randomUUID(),
        payload.invoice_id,
        payload.tenant_id || 'global',
        item.product_id || '',
        item.name || 'Product',
        item.quantity ?? 1,
        item.unit_price ?? 0,
        item.tax_amount ?? 0,
        item.total ?? 0,
        item.pieces_sold ?? item.pieces_override ?? null,
        item.isServiceItem ? 1 : 0,
        item.billing_type || null,
        item.uom || item.unit || null,
        item.cgst_rate ?? 0,
        item.sgst_rate ?? 0,
        item.igst_rate ?? 0,
        item.cgst_amount ?? 0,
        item.sgst_amount ?? 0,
        item.igst_amount ?? 0,
        item.hsn_sac_code || null,
        item.supply_type || invoice.supply_type || 'INTRA',
      );
    }
    const finalCreatedAt = updatedCreatedAt || existingInv.created_at;
    if (finalCreatedAt) {
      invoicesSql.updateInvoiceItemsCreatedAt(db).run(finalCreatedAt, payload.invoice_id);
    }

    // 5. Adjust stock: reverse old quantities, apply new (skip service items)
    const isServiceItemLookup: Record<string, boolean> = {};
    const svcStmt = invoicesSql.findProductsByProductIdIsServiceItem(db);
    const isServiceItem = (pid: string) => {
      if (isServiceItemLookup[pid] === undefined) {
        const row = svcStmt.get(pid) as { is_service_item?: number | boolean | null } | undefined;
        isServiceItemLookup[pid] = row ? !!row.is_service_item : false;
      }
      return isServiceItemLookup[pid];
    };

    const stockDelta: Record<string, number> = {};
    for (const old of oldItems) {
      if (existingInv.stock_applied !== 0 && !isServiceItem(old.product_id)) {
        stockDelta[old.product_id] = (stockDelta[old.product_id] || 0) + old.quantity;
      }
    }
    for (const item of items) {
      if (existingInv.stock_applied !== 0 && !isServiceItem(item.product_id)) {
        stockDelta[item.product_id] = (stockDelta[item.product_id] || 0) - item.quantity;
      }
    }
    const stockStmt = invoicesSql.updateProductCurrentStockCurrentStock3(db);
    for (const [product_id, delta] of Object.entries(stockDelta)) {
      stockStmt.run(delta, product_id);
    }

    // Sync party credit ledger
    syncInvoiceCreditLedger(db, {
      counts_in_revenue: existingInv.counts_in_revenue,
      invoice_id: payload.invoice_id,
      tenant_id: payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: invoice.grand_total,
      payment_method: invoice.payment_method,
      received_amount: finalReceivedAmount,
      balance_amount: finalBalanceAmount,
      // The customer now on the bill (resolved from its name / phone), never the previous one.
      customer_id: hasCustomer ? (customerId || payload.customer_id || existingInv.customer_id) : null,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      customer_address: invoice.customer_address,
      customer_gstin: invoice.customer_gstin,
      split_details: savedSplit,
      user_id: payload.role,
      user_name: payload.role,
      created_at: updatedCreatedAt || existingInv.created_at,
      is_staff: Boolean(payload.is_staff || payload.isStaffCustomer || existingInv.is_staff),
      staff_id: payload.staff_id || null,
    });
    resetBackfillThrottle(); // reset so next db:getParties re-scans

    refreshInvoiceEarnings(db, payload.invoice_id);

  });

  try {
    transaction();

    const newCash = getCashAmountFromInvoice({ ...payload, counts_in_revenue: existingInv.counts_in_revenue });
    const effectiveInvDate = invoice.created_at
      ? (toEpochMs(invoice.created_at) === null ? existingInv.created_at : toIsoTimestamp(invoice.created_at))
      : existingInv.created_at;
    if (existingInv) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, effectiveInvDate, oldCash, newCash);
      // UPI / card / bank accounts follow the edited payment (an edit can change the method or the amounts).
      const updatedInv = invoicesSql.findInvoicesByInvoiceId2(db).get(payload.invoice_id) as InvoiceRow | undefined;
      syncPaymentSourcesForInvoice(db, existingInv.tenant_id || payload.tenant_id, updatedInv);
    }

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    const saved = invoicesSql.findInvoicesByInvoiceId2(db).get(payload.invoice_id) as InvoiceRow;
    const res = { success: true, created_at: effectiveInvDate, editedLoyalty: { earned: saved.points_earned, previous: saved.previous_points_balance, remaining: saved.remaining_points_balance } };
    recentCheckoutsCache.set(updateCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
  } catch (error) {
    console.error('[db:updateInvoice]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:updateInvoicePayment` */
export function updateInvoicePayment(payload: {
  invoice_id: string;
  tenant_id: string;
  payment_method: string;
  received_amount: number;
  balance_amount: number;
  split_details?: SplitDetails | string | null;
  is_staff?: boolean | number | null;
  isStaffCustomer?: boolean;
  staff_id?: string | null;
}) {
  try {
    const db = getDb();
    return db.transaction(() => {
    const existingInv = invoicesSql.findInvoicesByInvoiceId2(db).get(payload.invoice_id) as InvoiceRow | undefined;
    if (!existingInv) {
      return { success: false, error: 'Invoice not found' };
    }
    const oldCash = getCashAmountFromInvoice(existingInv);

    // Deduplication guard
    const paymentCacheKey = `updatePayment:${existingInv.tenant_id || payload.tenant_id}:${payload.invoice_id}:${payload.payment_method}:${payload.received_amount}:${payload.balance_amount}`;
    const now = Date.now();
    const cachedPayment = recentCheckoutsCache.get(paymentCacheKey);
    if (cachedPayment && (now - cachedPayment.timestamp < 4000)) {
      console.warn(`[db:updateInvoicePayment] Duplicate update request blocked within 4s window for invoice ${payload.invoice_id}. Returning previous result.`);
      return cachedPayment.result;
    }

    // The new payment replaces the old one: store its exact breakdown (only a SPLIT keeps the amounts it was given).
    const savedSplit = normalizePaymentSplit({
      grand_total: existingInv.grand_total, payment_method: payload.payment_method,
      received_amount: payload.received_amount, split_details: payload.split_details ?? existingInv.split_details,
    }, getStoreCountrySetting(db, existingInv.tenant_id || 'global'));
    const splitDetailsVal = JSON.stringify(savedSplit);

    captureInvoicePoints(db, payload.invoice_id);
    invoicesSql.updateInvoiceByInvoiceId4(db).run(
      payload.payment_method,
      payload.received_amount,
      payload.balance_amount,
      splitDetailsVal,
      payload.invoice_id
    );

    const updatedInvObj = {
      ...existingInv,
      payment_method: payload.payment_method,
      received_amount: payload.received_amount,
      split_details: savedSplit,
    };
    const newCash = getCashAmountFromInvoice(updatedInvObj);

    adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, existingInv.created_at, oldCash, newCash);
    // Replace the old method's account money with the new method's (adding only would keep both).
    syncPaymentSourcesForInvoice(db, existingInv.tenant_id || payload.tenant_id, invoicesSql.findInvoicesByInvoiceId2(db).get(payload.invoice_id) as InvoiceRow | undefined);

    syncInvoiceCreditLedger(db, {
      counts_in_revenue: existingInv.counts_in_revenue,
      invoice_id: payload.invoice_id,
      tenant_id: existingInv.tenant_id || payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: existingInv.grand_total,
      payment_method: payload.payment_method,
      received_amount: payload.received_amount,
      balance_amount: payload.balance_amount,
      customer_id: existingInv.customer_id,
      customer_name: existingInv.customer_name,
      customer_phone: existingInv.customer_phone,
      customer_address: existingInv.customer_address,
      customer_gstin: existingInv.customer_gstin,
      split_details: savedSplit,
      created_at: existingInv.created_at,
      is_staff: Boolean(existingInv.is_staff || payload.is_staff),
      staff_id: payload.staff_id || null,
    });
    resetBackfillThrottle(); // reset so next db:getParties re-scans

    refreshInvoiceEarnings(db, payload.invoice_id);

    const res = { success: true };
    recentCheckoutsCache.set(paymentCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
    })();
  } catch (error) {
    console.error('[db:updateInvoicePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deleteInvoice` */
export function deleteInvoice(invoice_id: string) {
  try {
    const db = getDb();
    const existingInv = invoicesSql.findInvoicesByInvoiceId2(db).get(invoice_id) as InvoiceRow | undefined;
    const oldCash = existingInv ? getCashAmountFromInvoice(existingInv) : 0;

    db.transaction(() => {
      const inv = invoicesSql.findInvoicesByInvoiceId3(db).get(invoice_id) as InvoiceRow;

      // A conversion copy never moved stock — do NOT restore it (would double stock).
      // The superseded BoS owns the deduction.
      const isConversionCopy = !!(inv && inv.converted_from_invoice_id);

      const items = invoicesSql.findInvoiceItemsByInvoiceIdProductIdAndQuantity3(db).all(invoice_id) as InvoiceItemRow[];
      const restoreStockStmt = invoicesSql.updateProductCurrentStockCurrentStock4(db);
      if (!isConversionCopy && inv.stock_applied !== 0) {
        for (const item of items) {
          restoreStockStmt.run(item.quantity, item.product_id, inv.tenant_id);
        }
      }
      try { invoicesSql.updateInvoiceItemIsDeleted(db).run(invoice_id); } catch { /* ignore */ }

      // If a copy was deleted, un-supersede its BoS so it can be converted again
      if (isConversionCopy && inv) {
        invoicesSql.updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber2(db).run(inv.converted_from_invoice_id);
      }

      // If a BoS was deleted, unlink its GST copy
      if (!isConversionCopy && inv && inv.converted_to_invoice_id) {
        invoicesSql.updateInvoiceConvertedFromInvoiceIdAndConvertedFromInvoiceNumber(db).run(inv.converted_to_invoice_id);
      }

      invoicesSql.updateInvoiceIsDeletedAndDeletedAt(db).run(invoice_id);
      reconcileInvoicePoints(db, invoice_id);

      // Retire this bill's own ledger rows (and give back a return credit it used), then recalculate the balances.
      if (existingInv) syncInvoiceCreditLedger(db, existingInv, true);
    })();

    if (existingInv) {
      syncPaymentSourcesForInvoice(db, existingInv.tenant_id as string, { ...existingInv, is_deleted: 1 });
    }

    if (existingInv && oldCash > 0) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id as string, existingInv.created_at as string, oldCash, 0);
    }

    return { success: true };
  } catch (error) {
    console.error('[db:deleteInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
}
