import { getDb } from '../db/localDb.js';
import * as invoicesSql from '../db/statements/invoices.js';
/** Held (parked) bills: hold, list, recall, release and expire. Called by electron/ipc handlers via invoicesService. */

/** IPC `db:holdBill` */
export function holdBill(payload: any) {
  const { items, ...invoice } = payload;
  const db = getDb();
  const transaction = db.transaction(() => {
    // Force a unique HLD invoice number for hold bills to avoid UNIQUE constraint conflicts with regular invoices
    let holdInvoiceNumber = invoice.invoice_number;
    if (!holdInvoiceNumber || !holdInvoiceNumber.includes('HLD')) {
      holdInvoiceNumber = `${(invoice.tenant_id || 'POS1').substring(0, 4).toUpperCase()}-HLD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 1. Insert the invoice as a HOLD type
    const invStmt = invoicesSql.insertInvoice2(db);
    invStmt.run(
      invoice.invoice_id,
      invoice.tenant_id,
      invoice.user_id,
      holdInvoiceNumber,
      invoice.subtotal,
      invoice.tax_total,
      invoice.discount_total,
      invoice.discount_type || 'FIXED',
      invoice.discount_value || 0,
      invoice.grand_total,
      invoice.payment_method || 'PENDING',
      invoice.split_details && typeof invoice.split_details === 'object' ? JSON.stringify(invoice.split_details) : (invoice.split_details && invoice.split_details !== 'null' ? invoice.split_details : null),
      invoice.received_amount ?? 0,
      invoice.balance_amount ?? 0,
      invoice.customer_name || null,
      invoice.customer_phone || null,
      invoice.customer_gstin || null,
      invoice.customer_state || null,
      invoice.customer_address || null,
      invoice.scrap_deduction ?? 0,
      invoice.scrap_invoice_number || null,
      invoice.return_deduction ?? 0,
      invoice.return_invoice_number || null,
      invoice.hold_note || null
    );

    // 2. Insert items and DEDUCT stock (reserve the inventory for this hold)
    const itemStmt = invoicesSql.insertInvoiceItem2(db);
    const stockStmt = invoicesSql.updateProductCurrentStockAlt(db);

    for (const item of items) {
      const isCombo = Boolean(item.isCombo || item.combo_id || (item.combo_items && item.combo_items.length > 0));
      const comboId = item.combo_id || (isCombo ? item.product_id : null);
      const comboDetailsJson = item.combo_items ? JSON.stringify(item.combo_items) : null;

      itemStmt.run(
        item.item_id,
        invoice.invoice_id,
        invoice.tenant_id,
        item.product_id,
        item.name,
        item.quantity,
        item.unit_price,
        item.tax_amount,
        item.total,
        item.pieces_sold ?? item.pieces_override ?? null,
        item.isServiceItem ? 1 : 0,
        comboId,
        comboDetailsJson,
        item.billing_type || null,
        item.uom || item.unit || null
      );
      if (!item.isServiceItem) {
        if (isCombo && item.combo_items && Array.isArray(item.combo_items)) {
          for (const ci of item.combo_items) {
            const qtyToDeduct = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
            stockStmt.run(qtyToDeduct, ci.product_id);
          }
        } else {
          stockStmt.run(item.quantity, item.product_id);
        }
      }
    }
  });

  try {
    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:holdBill]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getHeldBills` */
export function getHeldBills({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    return invoicesSql.findInvoicesByInvoiceTypeAndIsHeld(db).all(tenant_id);
  } catch (error: any) {
    console.error('[db:getHeldBills]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:recallHeldBill` */
export function recallHeldBill({ invoice_id }: { invoice_id: string }) {
  try {
    const db = getDb();
    if (!invoice_id) return { success: false, error: 'Missing invoice ID' };

    let resultInvoice: any = null;
    let resultItems: any[] = [];

    const transaction = db.transaction(() => {
      // 1. Get the held invoice
      resultInvoice = invoicesSql.findInvoicesByInvoiceIdAndInvoiceType(db).get(invoice_id) as any;

      if (!resultInvoice) {
        throw new Error('Held bill not found or already recalled');
      }

      // 2. Get line items
      resultItems = invoicesSql.findInvoiceItemsByInvoiceId(db).all(invoice_id) as any[];

      // 3. Revert stock (add back stock reserved during hold)
      const stockStmt = invoicesSql.updateProductCurrentStockCurrentStock2(db);
      for (const item of resultItems) {
        if (!item.is_service_item) {
          if (item.combo_details) {
            try {
              const comboItems = JSON.parse(item.combo_details);
              if (Array.isArray(comboItems)) {
                for (const ci of comboItems) {
                  const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                  stockStmt.run(qtyToRevert, ci.product_id);
                }
                continue;
              }
            } catch {}
          }
          if (item.product_id) {
            stockStmt.run(item.quantity, item.product_id);
          }
        }
      }

      // 4. Mark invoice as recalled / deleted so it disappears from held list & sales history
      invoicesSql.updateInvoiceByInvoiceId(db).run(invoice_id);
    });

    transaction();
    return { success: true, invoice: resultInvoice, items: resultItems };
  } catch (error: any) {
    console.error('[db:recallHeldBill]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}

/** IPC `db:releaseHeldBill` */
export function releaseHeldBill({ invoice_id }: { invoice_id: string }) {
  try {
    const db = getDb();
    const transaction = db.transaction(() => {
      // 1. Check it's a valid held bill
      const invoice = invoicesSql.findInvoicesByInvoiceIdAndInvoiceTypeHold(db).get(invoice_id) as any;
      if (!invoice) {
        throw new Error('Held bill not found');
      }

      // 2. Get items to revert stock
      const items = invoicesSql.findInvoiceItemsByInvoiceIdProductIdAndQuantity(db).all(invoice_id) as any[];

      // 3. Revert stock (add back)
      const stockStmt = invoicesSql.updateProductCurrentStockCurrentStock2(db);
      for (const item of items) {
        if (!item.is_service_item) {
          if (item.combo_details) {
            try {
              const comboItems = JSON.parse(item.combo_details);
              if (Array.isArray(comboItems)) {
                for (const ci of comboItems) {
                  const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                  stockStmt.run(qtyToRevert, ci.product_id);
                }
                continue;
              }
            } catch {}
          }
          if (item.product_id) {
            stockStmt.run(item.quantity, item.product_id);
          }
        }
      }

      // 4. Mark invoice as expired/held = 0, change type to track it (keep sync_status='SYNCED' so it stays out of the sync queue)
      invoicesSql.updateInvoiceByInvoiceIdExpiredHold(db).run(invoice_id);
    });

    transaction();
    return { success: true };
  } catch (error: any) {
    console.error('[db:releaseHeldBill]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
}

/** IPC `db:expireStaleHeldBills` */
export function expireStaleHeldBills({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    let expiredCount = 0;

    const transaction = db.transaction(() => {
      // 1. Find all expired held bills
      const expired = invoicesSql.findInvoicesByInvoiceType(db).all(tenant_id) as any[];

      for (const bill of expired) {
        // 2. Get items to revert stock
        const items = invoicesSql.findInvoiceItemsByInvoiceIdProductIdAndQuantity(db).all(bill.invoice_id) as any[];

        // 3. Revert stock
        const stockStmt = invoicesSql.updateProductCurrentStockCurrentStock2(db);
        for (const item of items) {
          if (!item.is_service_item) {
            if (item.combo_details) {
              try {
                const comboItems = JSON.parse(item.combo_details);
                if (Array.isArray(comboItems)) {
                  for (const ci of comboItems) {
                    const qtyToRevert = (Number(ci.quantity) || 1) * (Number(item.quantity) || 1);
                    stockStmt.run(qtyToRevert, ci.product_id);
                  }
                  continue;
                }
              } catch {}
            }
            if (item.product_id) {
              stockStmt.run(item.quantity, item.product_id);
            }
          }
        }

        // 4. Mark as expired & deleted
        invoicesSql.updateInvoiceByInvoiceIdExpiredHold(db).run(bill.invoice_id);

        expiredCount++;
      }

      // Cleanup any non-held EXPIRED_HOLD or RECALLED_HOLD records so they never leak into queries
      invoicesSql.updateInvoiceIsDeletedAndIsHeld(db).run(tenant_id);
    });

    transaction();
    if (expiredCount > 0) {
      console.log(`[Hold] Expired ${expiredCount} stale held bill(s) and reverted stock`);
    }
    return { success: true, expiredCount };
  } catch (error: any) {
    console.error('[db:expireStaleHeldBills]', error);
    return { success: false, error: 'Operation failed' };
  }
}
