import { getDb } from '../db/localDb.js';
import { upsertCustomerRecord } from '../db/customerIdentity.js';
import { getCashAmountFromInvoice, adjustPaymentSourcesForInvoice, adjustCashDrawerForInvoice } from './cashDrawerService.js';
import { syncInvoiceCreditLedger, resetBackfillThrottle } from './partyLedgerService.js';
import { localTimestamp } from './storeTime.js';
import crypto from 'node:crypto';
import * as invoicesSql from '../db/statements/invoices.js';
import { recentCheckoutsCache } from './invoiceCheckoutService.js';
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
    
    const invoice = invoicesSql.findInvoicesByInvoiceIdSubtotalAndTaxTotal(db).get(invoice_id) as any;
    if (!invoice) return { success: false, error: 'Invoice not found' };

    let discount_total = 0;
    if (discount_type === 'PERCENTAGE') {
      discount_total = invoice.subtotal * (discount_value / 100);
    } else {
      discount_total = discount_value;
    }

    const scrapD = Math.max(0, Number(invoice.scrap_deduction) || 0);
    const returnD = Math.max(0, Number(invoice.return_deduction) || 0);
    const grand_total = Math.max(0, invoice.subtotal + invoice.tax_total - discount_total - scrapD - returnD);

    invoicesSql.updateInvoiceByInvoiceId2(db).run(discount_total, discount_type, discount_value, grand_total, invoice_id);

    return { success: true };
  } catch (error: any) {
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
  items: Array<{
    item_id?: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    total: number;
    isServiceItem?: boolean;
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
      const u = invoicesSql.findUsersByUserId(db).get(payload.user_id) as any;
      if (u) {
        const uRole = (u.role || '').toUpperCase();
        if (['ADMIN', 'SUPER_ADMIN', 'OWNER', 'ADMINISTRATOR'].includes(uRole)) hasDbPerm = true;
        const uPerms = JSON.parse(u.permissions || '[]');
        if (Array.isArray(uPerms) && (uPerms.includes('*') || uPerms.includes('sales.edit'))) hasDbPerm = true;
      }
    } catch {}
  }

  if (!isAdmin && !hasEditPerm && !hasDbPerm) {
    return { success: false, error: 'You do not have permission to edit bills' };
  }
  const { items, ...invoice } = payload;
  const db = getDb();
  const existingInv = invoicesSql.findInvoicesByInvoiceId2(db).get(payload.invoice_id) as any;
  if (!existingInv) {
    return { success: false, error: 'Invoice not found' };
  }
  const oldCash = getCashAmountFromInvoice(existingInv);

  const finalReceivedAmount = payload.received_amount !== undefined ? payload.received_amount : (existingInv?.received_amount ?? null);
  const finalActualRefundPaid = payload.actual_refund_paid !== undefined ? payload.actual_refund_paid : (existingInv?.actual_refund_paid ?? 0);
  const finalBalanceAmount = payload.balance_amount !== undefined ? payload.balance_amount : (existingInv?.balance_amount ?? null);

  // Deduplication guard: block duplicate update calls within a 4-second window for the same invoice
  const itemsSig = (items || []).map((i: any) => `${i.product_id}:${i.quantity}:${i.unit_price}`).sort().join('|');
  const headerSig = JSON.stringify(invoice);
  const updateCacheKey = `update:${existingInv.tenant_id || payload.tenant_id}:${payload.invoice_id}:${invoice.grand_total}:${itemsSig}:${headerSig}`;
  const now = Date.now();
  const cachedUpdate = recentCheckoutsCache.get(updateCacheKey);
  if (cachedUpdate && (now - cachedUpdate.timestamp < 4000)) {
    console.warn(`[db:updateInvoice] Duplicate update request blocked within 4s window for invoice ${payload.invoice_id}. Returning previous result.`);
    return cachedUpdate.result;
  }

  const transaction = db.transaction(() => {
    const customerId = upsertCustomerRecord(
      db,
      payload.tenant_id || 'global',
      invoice.customer_name,
      invoice.customer_phone,
      invoice.customer_address
    );

    // 1. Get old items for stock adjustment
    const oldItems = invoicesSql.findInvoiceItemsByInvoiceIdProductIdAndQuantity2(db).all(payload.invoice_id) as any[];

    const updatedCreatedAt = (invoice as any).created_at
      ? (isNaN(new Date((invoice as any).created_at).getTime()) ? null : new Date((invoice as any).created_at).toISOString())
      : null;

    // 2. Update invoice header
    invoicesSql.updateInvoiceByInvoiceId3(db).run(
      invoice.subtotal, invoice.tax_total, invoice.discount_total,
      invoice.discount_type || 'FIXED', invoice.discount_value || 0,
      invoice.grand_total, invoice.payment_method || 'PENDING',
      finalReceivedAmount, finalActualRefundPaid, finalBalanceAmount,
      (invoice as any).split_details && typeof (invoice as any).split_details === 'object' ? JSON.stringify((invoice as any).split_details) : ((invoice as any).split_details && (invoice as any).split_details !== 'null' ? (invoice as any).split_details : null),
      invoice.customer_name || null, invoice.customer_phone || null,
      invoice.customer_gstin || null, invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0, invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0, invoice.return_invoice_number || null,
      customerId || null,
      (invoice as any).cgst_total ?? 0, (invoice as any).sgst_total ?? 0,
      (invoice as any).igst_total ?? 0, (invoice as any).supply_type || 'INTRA',
      (invoice as any).notes || (invoice as any).description || null,
      (invoice as any).description || (invoice as any).notes || null,
      (invoice as any).points_earned ?? null,
      (invoice as any).points_redeemed ?? null,
      (invoice as any).points_redeemed_discount ?? null,
      (invoice as any).previous_points_balance ?? null,
      (invoice as any).remaining_points_balance ?? null,
      updatedCreatedAt,
      payload.invoice_id
    );

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
        (item as any).pieces_sold ?? (item as any).pieces_override ?? null,
        (item as any).isServiceItem ? 1 : 0,
        (item as any).billing_type || null,
        (item as any).uom || (item as any).unit || null,
        (item as any).cgst_rate ?? 0,
        (item as any).sgst_rate ?? 0,
        (item as any).igst_rate ?? 0,
        (item as any).cgst_amount ?? 0,
        (item as any).sgst_amount ?? 0,
        (item as any).igst_amount ?? 0,
        (item as any).hsn_sac_code || null,
        (item as any).supply_type || (invoice as any).supply_type || 'INTRA',
      );
    }

    // 5. Adjust stock: reverse old quantities, apply new (skip service items)
    const isServiceItemLookup: Record<string, boolean> = {};
    const svcStmt = invoicesSql.findProductsByProductIdIsServiceItem(db);
    const isServiceItem = (pid: string) => {
      if (isServiceItemLookup[pid] === undefined) {
        const row = svcStmt.get(pid) as any;
        isServiceItemLookup[pid] = row ? !!row.is_service_item : false;
      }
      return isServiceItemLookup[pid];
    };

    const stockDelta: Record<string, number> = {};
    for (const old of oldItems) {
      if (!isServiceItem(old.product_id)) {
        stockDelta[old.product_id] = (stockDelta[old.product_id] || 0) + old.quantity;
      }
    }
    for (const item of items) {
      if (!isServiceItem(item.product_id)) {
        stockDelta[item.product_id] = (stockDelta[item.product_id] || 0) - item.quantity;
      }
    }
    const stockStmt = invoicesSql.updateProductCurrentStockCurrentStock3(db);
    for (const [product_id, delta] of Object.entries(stockDelta)) {
      stockStmt.run(delta, product_id);
    }

    // Sync party credit ledger
    syncInvoiceCreditLedger(db, {
      invoice_id: payload.invoice_id,
      tenant_id: payload.tenant_id,
      invoice_number: existingInv.invoice_number,
      invoice_type: existingInv.invoice_type,
      grand_total: invoice.grand_total,
      payment_method: invoice.payment_method,
      received_amount: finalReceivedAmount,
      balance_amount: finalBalanceAmount,
      customer_id: customerId || (payload as any).customer_id || (invoice as any).customer_id || existingInv.customer_id,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      customer_address: invoice.customer_address,
      customer_gstin: invoice.customer_gstin,
      split_details: (invoice as any).split_details || (payload as any).split_details || existingInv.split_details,
      user_id: payload.role,
      user_name: payload.role,
      created_at: updatedCreatedAt || existingInv.created_at,
      is_staff: Boolean((payload as any).is_staff || (payload as any).isStaffCustomer || existingInv.is_staff),
      staff_id: (payload as any).staff_id || null,
    });
    resetBackfillThrottle(); // reset so next db:getParties re-scans

    // Sync Loyalty Points on invoice update
    const targetCustId = customerId || (payload as any).customer_id || (invoice as any).customer_id || existingInv.customer_id;
    if (targetCustId) {
      try {
        const targetTenantId = payload.tenant_id || existingInv.tenant_id || 'global';
        const lCfgRow: any = invoicesSql.findSettingsByKeyLoyaltyConfig(db).get(targetTenantId)
          || invoicesSql.findSettingsByKeyLoyaltyConfig2(db).get();
        let lCfg: any = null;
        if (lCfgRow?.value) {
          lCfg = typeof lCfgRow.value === 'string' ? JSON.parse(lCfgRow.value) : lCfgRow.value;
        }
        const flagsRow: any = invoicesSql.findSettingsByKeyFeatureFlags(db).get(targetTenantId)
          || invoicesSql.findSettingsByKeyFeatureFlags2(db).get();
        let flags: any = null;
        if (flagsRow?.value) {
          flags = typeof flagsRow.value === 'string' ? JSON.parse(flagsRow.value) : flagsRow.value;
        }
        const isLoyaltyOn = Boolean(lCfg?.enabled) || Boolean(flags?.loyalty);

        if (isLoyaltyOn) {
          const earningRate = Math.max(1, Number(lCfg?.earningRate) || 100);
          const awardOnPending = Boolean(lCfg?.awardPointsOnPending);
          const newPaymentMethod = (invoice.payment_method || existingInv.payment_method || '').toUpperCase();
          const shouldEarn = newPaymentMethod !== 'PENDING' || awardOnPending;

          let targetPointsEarned: number;
          if ((invoice as any).points_earned !== undefined && (invoice as any).points_earned !== null) {
            targetPointsEarned = Number((invoice as any).points_earned) || 0;
          } else if (shouldEarn) {
            targetPointsEarned = Math.floor(Math.max(0, Number(invoice.grand_total) || 0) / earningRate);
          } else {
            targetPointsEarned = 0;
          }

          const prevEarned = Number(existingInv.points_earned) || 0;
          const diffEarned = targetPointsEarned - prevEarned;

          if (diffEarned !== 0) {
            const custRow: any = invoicesSql.findCustomersByCustomerIdCurrentPointsBalance(db).get(targetCustId);
            const curBal = Number(custRow?.current_points_balance) || 0;
            const newBal = Math.max(0, curBal + diffEarned);
            const nowTs = localTimestamp();

            const txType = diffEarned > 0 ? 'EARNED' : 'ADJUSTED';
            const txDesc = diffEarned > 0
              ? (prevEarned === 0
                  ? `Earned ${targetPointsEarned} points on invoice ${existingInv.invoice_number}`
                  : `Earned ${diffEarned} additional points on updated invoice ${existingInv.invoice_number}`)
              : `Adjusted ${Math.abs(diffEarned)} points on updated invoice ${existingInv.invoice_number}`;

            invoicesSql.insertLoyaltyTransaction3(db).run(
              crypto.randomUUID(), targetTenantId,
              targetCustId, payload.invoice_id,
              txType, Math.abs(diffEarned), curBal, newBal,
              existingInv.invoice_number, txDesc,
              payload.user_id || payload.role || 'system',
              nowTs, nowTs
            );

            invoicesSql.updateCustomerByCustomerId2(db).run(diffEarned, newBal, nowTs, targetCustId);

            invoicesSql.updateInvoicePointsEarnedAndRemainingPointsBalance(db).run(targetPointsEarned, newBal, payload.invoice_id);
          }
        }
      } catch (lErr) {
        console.warn('[db:updateInvoice] Failed to sync loyalty points:', lErr);
      }
    }
  });

  try {
    transaction();

    const newCash = getCashAmountFromInvoice(payload);
    const effectiveInvDate = (invoice as any).created_at
      ? (isNaN(new Date((invoice as any).created_at).getTime()) ? existingInv.created_at : new Date((invoice as any).created_at).toISOString())
      : existingInv.created_at;
    if (existingInv) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, effectiveInvDate, oldCash, newCash);
    }

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    const res = { success: true, created_at: effectiveInvDate };
    recentCheckoutsCache.set(updateCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
  } catch (error: any) {
    console.error('[db:updateInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateInvoicePayment` */
export function updateInvoicePayment(payload: {
  invoice_id: string;
  tenant_id: string;
  payment_method: string;
  received_amount: number;
  balance_amount: number;
  split_details?: any;
}) {
  try {
    const db = getDb();
    const existingInv = invoicesSql.findInvoicesByInvoiceId2(db).get(payload.invoice_id) as any;
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

    const splitDetailsVal = payload.split_details && typeof payload.split_details === 'object'
      ? JSON.stringify(payload.split_details)
      : (payload.split_details && payload.split_details !== 'null' ? payload.split_details : null);

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
      split_details: payload.split_details ?? existingInv.split_details,
    };
    const newCash = getCashAmountFromInvoice(updatedInvObj);

    adjustCashDrawerForInvoice(db, existingInv.tenant_id || payload.tenant_id, existingInv.created_at, oldCash, newCash);
    adjustPaymentSourcesForInvoice(db, existingInv.tenant_id || payload.tenant_id, updatedInvObj, false);

    syncInvoiceCreditLedger(db, {
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
      split_details: payload.split_details ?? existingInv.split_details,
      created_at: existingInv.created_at,
      is_staff: Boolean(existingInv.is_staff || (payload as any).is_staff),
      staff_id: (payload as any).staff_id || null,
    });
    resetBackfillThrottle(); // reset so next db:getParties re-scans

    // Award loyalty points if invoice was pending and now paid
    if (existingInv.customer_id && (!existingInv.points_earned || Number(existingInv.points_earned) <= 0)) {
      const newPm = (payload.payment_method || '').toUpperCase();
      if (newPm !== 'PENDING') {
        try {
          const targetTenantId = existingInv.tenant_id || payload.tenant_id || 'global';
          const lCfgRow: any = invoicesSql.findSettingsByKeyLoyaltyConfig(db).get(targetTenantId)
            || invoicesSql.findSettingsByKeyLoyaltyConfig2(db).get();
          let lCfg: any = null;
          if (lCfgRow?.value) {
            lCfg = typeof lCfgRow.value === 'string' ? JSON.parse(lCfgRow.value) : lCfgRow.value;
          }
          const flagsRow: any = invoicesSql.findSettingsByKeyFeatureFlags(db).get(targetTenantId)
            || invoicesSql.findSettingsByKeyFeatureFlags2(db).get();
          let flags: any = null;
          if (flagsRow?.value) {
            flags = typeof flagsRow.value === 'string' ? JSON.parse(flagsRow.value) : flagsRow.value;
          }
          const isLoyaltyOn = Boolean(lCfg?.enabled) || Boolean(flags?.loyalty);
          if (isLoyaltyOn) {
            const earningRate = Math.max(1, Number(lCfg?.earningRate) || 100);
            const ptsEarned = Math.floor(Math.max(0, Number(existingInv.grand_total) || 0) / earningRate);
            if (ptsEarned > 0) {
              const custRow: any = invoicesSql.findCustomersByCustomerIdCurrentPointsBalance(db).get(existingInv.customer_id);
              const prevBal = Number(custRow?.current_points_balance) || 0;
              const newBal = prevBal + ptsEarned;
              const nowTimestamp = localTimestamp();
              const eTxId = crypto.randomUUID();

              invoicesSql.updateInvoiceByInvoiceId5(db).run(ptsEarned, prevBal, newBal, payload.invoice_id);

              invoicesSql.insertLoyaltyTransaction2(db).run(
                eTxId, targetTenantId, existingInv.customer_id, payload.invoice_id,
                ptsEarned, prevBal, newBal,
                existingInv.invoice_number,
                `Earned ${ptsEarned} points on settled invoice ${existingInv.invoice_number}`,
                'system',
                nowTimestamp, nowTimestamp
              );

              invoicesSql.updateCustomerByCustomerId3(db).run(ptsEarned, newBal, nowTimestamp, existingInv.customer_id);
            }
          }
        } catch (lErr) {
          console.warn('[db:updateInvoicePayment] Failed to award loyalty points on payment update:', lErr);
        }
      }
    }

    import('../sync/syncWorker.js').then(({ runInitialSync }) => {
      runInitialSync().catch(e => console.error('[Main] Invoice payment update sync error:', e));
    }).catch(e => console.error('[Main] Failed to load syncWorker:', e));
    const res = { success: true };
    recentCheckoutsCache.set(paymentCacheKey, { timestamp: now, result: res });
    if (recentCheckoutsCache.size > 100) {
      for (const [k, v] of recentCheckoutsCache.entries()) {
        if (now - v.timestamp > 30000) recentCheckoutsCache.delete(k);
      }
    }
    return res;
  } catch (error: any) {
    console.error('[db:updateInvoicePayment]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deleteInvoice` */
export function deleteInvoice(invoice_id: string) {
  try {
    const db = getDb();
    const existingInv = invoicesSql.findInvoicesByInvoiceId2(db).get(invoice_id) as any;
    const oldCash = existingInv ? getCashAmountFromInvoice(existingInv) : 0;

    db.transaction(() => {
      const inv = invoicesSql.findInvoicesByInvoiceId3(db).get(invoice_id) as any;

      // A conversion copy never moved stock — do NOT restore it (would double stock).
      // The superseded BoS owns the deduction.
      const isConversionCopy = !!(inv && inv.converted_from_invoice_id);

      const items = invoicesSql.findInvoiceItemsByInvoiceIdProductIdAndQuantity3(db).all(invoice_id) as any[];
      const restoreStockStmt = invoicesSql.updateProductCurrentStockCurrentStock4(db);
      if (!isConversionCopy) {
        for (const item of items) {
          restoreStockStmt.run(item.quantity, item.product_id, inv.tenant_id);
        }
      }
      try { invoicesSql.updateInvoiceItemIsDeleted(db).run(invoice_id); } catch (e) {}

      // If a copy was deleted, un-supersede its BoS so it can be converted again
      if (isConversionCopy && inv) {
        invoicesSql.updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber2(db).run(inv.converted_from_invoice_id);
      }

      // If a BoS was deleted, unlink its GST copy
      if (!isConversionCopy && inv && inv.converted_to_invoice_id) {
        invoicesSql.updateInvoiceConvertedFromInvoiceIdAndConvertedFromInvoiceNumber(db).run(inv.converted_to_invoice_id);
      }

      invoicesSql.updateInvoiceIsDeletedAndDeletedAt(db).run(invoice_id);

      // Soft-delete party_ledger entries immediately within transaction
      if (existingInv && existingInv.invoice_number) {
        const invNum = String(existingInv.invoice_number).trim();
        invoicesSql.updatePartyLedgerIsDeleted(db).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
      }
    })();

    if (existingInv) {
      syncInvoiceCreditLedger(db, existingInv, true);
    }

    if (existingInv) {
      adjustPaymentSourcesForInvoice(db, existingInv.tenant_id, existingInv, true);
    }

    if (existingInv && oldCash > 0) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id, existingInv.created_at, oldCash, 0);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
}
