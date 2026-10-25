import { getDb } from '../../db/localDb.js';
import { BATCH_SIZE, parseIsDeleted, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';

/** Stock documents sync: scrap categories / transactions, purchase bills and returns (push and pull). */
// ── Scrap Categories Sync (Edge → Cloud) ─────────────────────────────────────
export async function syncScrapCategories(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM scrap_categories WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} scrap categories to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE scrap_categories SET sync_status = 'SYNCED' WHERE scrap_category_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const categories = batch.map((c: any) => ({
      ...c,
      is_deleted: !!c.is_deleted,
    }));

    const synced = await pushBatch(
      '/api/sync/scrap_categories',
      token,
      categories,
      'scrap_categories',
      `Scrap Categories batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Scrap Transactions Sync (Edge → Cloud) ──────────────────────────────────
export async function syncScrapTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM scrap_transactions WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} scrap transactions to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE scrap_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/scrap_transactions',
      token,
      batch,
      'scrap_transactions',
      `Scrap Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
}

// ── Pull Scrap Categories (Cloud → Edge) ────────────────────────────────────
export async function pullScrapCategories(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO scrap_categories (
      scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @scrap_category_id, @tenant_id, @name, @purchase_price, @selling_price, @current_stock, @unit, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(scrap_category_id) DO UPDATE SET
      name = excluded.name,
      purchase_price = excluded.purchase_price,
      selling_price = excluded.selling_price,
      current_stock = excluded.current_stock,
      unit = excluded.unit,
      is_deleted = excluded.is_deleted,
      created_at = COALESCE(scrap_categories.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE scrap_categories.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'scrap_categories',
    urlPath: '/api/sync/scrap_categories',
    label: 'scrap categories',
    onProgress: (fetched) => notifyPullProgress('scrap categories', fetched),
    processPage: (rows) => {
      const tx = db.transaction((categories: any[]) => {
        for (const c of categories) {
          try {
            upsert.run({
              scrap_category_id: c.scrap_category_id,
              tenant_id: tenantId,
              name: c.name,
              purchase_price: c.purchase_price ?? 0,
              selling_price: c.selling_price ?? 0,
              current_stock: c.current_stock ?? 0,
              unit: c.unit || 'Kgs',
              is_deleted: parseIsDeleted(c.is_deleted),
              created_at: toSqliteDate(c.created_at),
              updated_at: toSqliteDate(c.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling scrap category:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'scrap_categories', 'scrap_category_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} scrap categories from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull scrap categories failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Scrap Transactions (Cloud → Edge) ─────────────────────────────────
export async function pullScrapTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO scrap_transactions (
      transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, transaction_date, created_at,
      is_deleted, sync_status, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @type, @scrap_category_id, @quantity, @rate, @total_amount, @party_name, @customer_phone, @customer_address, @notes, @scrap_invoice_number, @payment_status, @transaction_date, @created_at,
      COALESCE(@is_deleted, 0), 'SYNCED', @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      type = excluded.type,
      scrap_category_id = excluded.scrap_category_id,
      quantity = excluded.quantity,
      rate = excluded.rate,
      total_amount = excluded.total_amount,
      party_name = excluded.party_name,
      customer_phone = excluded.customer_phone,
      customer_address = excluded.customer_address,
      notes = excluded.notes,
      scrap_invoice_number = excluded.scrap_invoice_number,
      payment_status = excluded.payment_status,
      is_deleted = COALESCE(excluded.is_deleted, 0),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE scrap_transactions.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'scrap_transactions',
    urlPath: '/api/sync/scrap_transactions',
    label: 'scrap transactions',
    onProgress: (fetched) => notifyPullProgress('scrap transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((transactions: any[]) => {
        for (const t of transactions) {
          try {
            upsert.run({
              transaction_id: t.transaction_id,
              tenant_id: tenantId,
              type: t.type,
              scrap_category_id: t.scrap_category_id,
              quantity: t.quantity,
              rate: t.rate,
              total_amount: t.total_amount ?? 0,
              party_name: t.party_name || null,
              customer_phone: t.customer_phone || null,
              customer_address: t.customer_address || null,
              notes: t.notes || null,
              scrap_invoice_number: t.scrap_invoice_number || null,
              payment_status: t.payment_status || 'CASH',
              is_deleted: parseIsDeleted(t.is_deleted),
              transaction_date: toSqliteDate(t.transaction_date),
              created_at: toSqliteDate(t.created_at),
              updated_at: toSqliteDate(t.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling scrap transaction:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'scrap_transactions', 'transaction_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} scrap transactions from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull scrap transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Sync Purchase Bills (Edge → Cloud) ───────────────────────────────────────
export async function syncPurchaseBills(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM purchase_bills WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} purchase bills to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE purchase_bills SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);
  const itemsUpdateStmt = db.prepare(`UPDATE purchase_bill_items SET sync_status = 'SYNCED' WHERE purchase_bill_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    // Enrich with items
    const enriched = batch.map((bill: any) => {
      const items = db.prepare(`SELECT * FROM purchase_bill_items WHERE purchase_bill_id = ? AND tenant_id = ?`).all(bill.purchase_bill_id, tenantId);
      return { ...bill, items };
    });
    const synced = await pushBatch(
      '/api/sync/purchase_bills',
      token,
      enriched,
      'purchase_bills',
      `Purchase Bills batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id, tenantId);
          itemsUpdateStmt.run(id, tenantId);
        }
      });
      tx(synced);
    }
  }
}

// ── Pull Purchase Bills (Cloud → Edge) ───────────────────────────────────────
export async function pullPurchaseBills(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertBill = db.prepare(`
    INSERT INTO purchase_bills (
      purchase_bill_id, tenant_id, bill_number, supplier_id, supplier_name, bill_date, invoice_number, notes, total_amount,
      bill_type, payment_type, sync_status, created_at, updated_at
    ) VALUES (
      @purchase_bill_id, @tenant_id, @bill_number, @supplier_id, @supplier_name, @bill_date, @invoice_number, @notes, @total_amount,
      @bill_type, @payment_type, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(purchase_bill_id) DO UPDATE SET
      bill_number = excluded.bill_number,
      supplier_id = excluded.supplier_id,
      supplier_name = excluded.supplier_name,
      bill_date = excluded.bill_date,
      invoice_number = excluded.invoice_number,
      notes = excluded.notes,
      total_amount = excluded.total_amount,
      bill_type = excluded.bill_type,
      payment_type = excluded.payment_type,
      created_at = COALESCE(purchase_bills.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE purchase_bills.sync_status != 'PENDING'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO purchase_bill_items (
      item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price,
      is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at
    ) VALUES (
      @item_id, @purchase_bill_id, @tenant_id, @product_id, @name, @quantity, @purchase_price, @total_amount, @selling_price, @offer_price,
      @is_gst_applicable, @tax_rate_percent, @hsn_sac_code, @skip_stock_update, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(item_id) DO UPDATE SET
      product_id = excluded.product_id,
      name = excluded.name,
      quantity = excluded.quantity,
      purchase_price = excluded.purchase_price,
      total_amount = excluded.total_amount,
      selling_price = excluded.selling_price,
      offer_price = excluded.offer_price,
      is_gst_applicable = excluded.is_gst_applicable,
      tax_rate_percent = excluded.tax_rate_percent,
      hsn_sac_code = excluded.hsn_sac_code,
      skip_stock_update = excluded.skip_stock_update,
      created_at = COALESCE(purchase_bill_items.created_at, excluded.created_at),
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE purchase_bill_items.sync_status != 'PENDING'
  `);

  const deleteItems = db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ? AND tenant_id = ?');
  const localBillCheck = db.prepare('SELECT sync_status, updated_at FROM purchase_bills WHERE purchase_bill_id = ? AND tenant_id = ?');

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'purchase_bills',
    urlPath: '/api/sync/purchase_bills',
    label: 'purchase bills',
    onProgress: (fetched) => notifyPullProgress('purchase bills', fetched),
    processPage: (rows) => {
      const tx = db.transaction((bills: any[]) => {
        for (const bill of bills) {
          try {
            // Never touch a locally-PENDING edit that diverges from the cloud (a change that
            // hasn't synced yet). Replacing header or items here would resurrect the deleted
            // lines of an edited bill. The push path will sync it later.
            const prior = localBillCheck.get(bill.purchase_bill_id, tenantId) as any;
            const isDirtyPending = !!prior
              && prior.sync_status === 'PENDING'
              && toSqliteDate(bill.updated_at) !== prior.updated_at;
            if (isDirtyPending) continue;

            upsertBill.run({
              purchase_bill_id: bill.purchase_bill_id,
              tenant_id: tenantId,
              bill_number: bill.bill_number,
              supplier_id: bill.supplier_id || null,
              supplier_name: bill.supplier_name,
              bill_date: bill.bill_date || null,
              invoice_number: bill.invoice_number || null,
              notes: bill.notes || null,
              total_amount: bill.total_amount ?? 0,
              bill_type: bill.bill_type || 'GST',
              payment_type: bill.payment_type || 'CASH',
              created_at: toSqliteDate(bill.created_at),
              updated_at: toSqliteDate(bill.updated_at),
            });
            if (Array.isArray(bill.items)) {
              deleteItems.run(bill.purchase_bill_id, tenantId);
              for (const item of bill.items) {
                upsertItem.run({
                  item_id: item.item_id,
                  purchase_bill_id: bill.purchase_bill_id,
                  tenant_id: tenantId,
                  product_id: item.product_id,
                  name: item.name,
                  quantity: item.quantity ?? 0,
                  purchase_price: item.purchase_price ?? 0,
                  total_amount: item.total_amount ?? 0,
                  selling_price: item.selling_price ?? 0,
                  offer_price: item.offer_price ?? null,
                  is_gst_applicable: item.is_gst_applicable === false ? 0 : 1,
                  tax_rate_percent: item.tax_rate_percent ?? 0,
                  hsn_sac_code: item.hsn_sac_code || null,
                  skip_stock_update: item.skip_stock_update ? 1 : 0,
                  created_at: toSqliteDate(item.created_at),
                  updated_at: toSqliteDate(item.updated_at),
                });
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling purchase bill:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'purchase_bills', 'purchase_bill_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} purchase bills from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull purchase bills failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Sync Returns (Edge → Cloud) ──────────────────────────────────────────
export async function syncReturns(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM returns WHERE sync_status = 'PENDING' AND tenant_id = ?`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} returns to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE returns SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);
  const itemsUpdateStmt = db.prepare(`UPDATE return_items SET sync_status = 'SYNCED' WHERE return_id = ? AND tenant_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const enriched = batch.map((r: any) => {
      const items = db.prepare(`SELECT * FROM return_items WHERE return_id = ? AND tenant_id = ?`).all(r.return_id, tenantId);
      return { ...r, items };
    });
    const synced = await pushBatch(
      '/api/sync/returns',
      token, enriched, 'returns', `Returns batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(id, tenantId);
          itemsUpdateStmt.run(id, tenantId);
        }
      });
      tx(synced);
    }
  }
}

// ── Pull Returns (Cloud → Edge) ──────────────────────────────────────────
export async function pullReturns(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertReturn = db.prepare(`
    INSERT INTO returns (return_id, invoice_id, tenant_id, user_id, return_number, customer_name, customer_phone, customer_address, subtotal, tax_total, grand_total, reason, return_date, refund_method, adjusted_invoice_number, adjusted_amount, sync_status, created_at, updated_at)
    VALUES (@return_id, @invoice_id, @tenant_id, @user_id, @return_number, @customer_name, @customer_phone, @customer_address, @subtotal, @tax_total, @grand_total, @reason, @return_date, @refund_method, @adjusted_invoice_number, @adjusted_amount, 'SYNCED', @created_at, @updated_at)
    ON CONFLICT(return_id) DO UPDATE SET
      customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
      customer_address = excluded.customer_address,
      subtotal = excluded.subtotal, tax_total = excluded.tax_total, grand_total = excluded.grand_total,
      reason = excluded.reason, return_date = excluded.return_date,
      refund_method = excluded.refund_method, adjusted_invoice_number = excluded.adjusted_invoice_number,
      adjusted_amount = excluded.adjusted_amount, updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE returns.sync_status != 'PENDING'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO return_items (return_item_id, return_id, tenant_id, invoice_item_id, product_id, name, quantity, unit_price, tax_amount, total, sync_status, created_at)
    VALUES (@return_item_id, @return_id, @tenant_id, @invoice_item_id, @product_id, @name, @quantity, @unit_price, @tax_amount, @total, 'SYNCED', @created_at)
    ON CONFLICT(return_item_id) DO UPDATE SET
      name = excluded.name, quantity = excluded.quantity, unit_price = excluded.unit_price,
      tax_amount = excluded.tax_amount, total = excluded.total, sync_status = 'SYNCED'
    WHERE return_items.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'returns',
    urlPath: '/api/sync/returns',
    label: 'returns',
    onProgress: (fetched) => notifyPullProgress('returns', fetched),
    processPage: (rows) => {
      const tx = db.transaction((returns: any[]) => {
        for (const r of returns) {
          try {
            upsertReturn.run({
              return_id: r.return_id, invoice_id: r.invoice_id, tenant_id: tenantId,
              user_id: r.user_id || null, return_number: r.return_number,
              customer_name: r.customer_name || null, customer_phone: r.customer_phone || null,
              customer_address: r.customer_address || null,
              subtotal: r.subtotal, tax_total: r.tax_total ?? 0, grand_total: r.grand_total,
              reason: r.reason || null, return_date: toSqliteDate(r.return_date),
              refund_method: r.refund_method || r.payment_method || null,
              adjusted_invoice_number: r.adjusted_invoice_number || null,
              adjusted_amount: Number(r.adjusted_amount) || 0,
              created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
            });
            if (Array.isArray(r.items)) {
              for (const item of r.items) {
                upsertItem.run({
                  return_item_id: item.return_item_id, return_id: r.return_id, tenant_id: tenantId,
                  invoice_item_id: item.invoice_item_id || null, product_id: item.product_id,
                  name: item.name, quantity: item.quantity, unit_price: item.unit_price,
                  tax_amount: item.tax_amount ?? 0, total: item.total,
                  created_at: toSqliteDate(item.created_at),
                });
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling return:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'returns', 'return_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} returns from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled} PENDING.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull returns failed.');
  }
  return result.hasChanged && result.count > 0;
}
