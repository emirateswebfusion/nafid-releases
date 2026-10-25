import { getDb } from '../../db/localDb.js';
import { BATCH_SIZE, parseIsDeleted, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';

/** Sales documents sync: invoices, quotations and warranties (push and pull). */
// ── Invoice Sync (Edge → Cloud) ──────────────────────────────────────────────
export async function syncInvoices(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM invoices WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD')`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} invoices to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);
  const updateStmt = db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const invoicesWithItems = batch.map((inv: any) => ({
      ...inv,
      subtotal: Number(inv.subtotal) || 0,
      tax_total: Number(inv.tax_total) || 0,
      grand_total: Number(inv.grand_total) || 0,
      discount_total: Number(inv.discount_total) || 0,
      discount_value: Number(inv.discount_value) || 0,
      received_amount: Number(inv.received_amount) || 0,
      actual_refund_paid: Number(inv.actual_refund_paid) || 0,
      balance_amount: Number(inv.balance_amount) || 0,
      scrap_deduction: Number(inv.scrap_deduction) || 0,
      points_earned: Number(inv.points_earned) || 0,
      points_redeemed: Number(inv.points_redeemed) || 0,
      points_redeemed_discount: Number(inv.points_redeemed_discount) || 0,
      previous_points_balance: Number(inv.previous_points_balance) || 0,
      remaining_points_balance: Number(inv.remaining_points_balance) || 0,
      // GST split totals (Indian GST Act compliance)
      cgst_total: Number(inv.cgst_total) || 0,
      sgst_total: Number(inv.sgst_total) || 0,
      igst_total: Number(inv.igst_total) || 0,
      supply_type: inv.supply_type || 'INTRA',
      is_deleted: inv.is_deleted === true || inv.is_deleted === 1 || inv.is_deleted === '1' || inv.is_deleted === 'true',
      items: (getItems.all(inv.invoice_id, tenantId) as any[]).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        total: Number(item.total) || 0,
        tax_amount: Number(item.tax_amount) || 0,
        // GST split per line item
        cgst_rate:   Number(item.cgst_rate)   || 0,
        sgst_rate:   Number(item.sgst_rate)   || 0,
        igst_rate:   Number(item.igst_rate)   || 0,
        cgst_amount: Number(item.cgst_amount) || 0,
        sgst_amount: Number(item.sgst_amount) || 0,
        igst_amount: Number(item.igst_amount) || 0,
        hsn_sac_code: item.hsn_sac_code || null,
        supply_type:  item.supply_type || 'INTRA',
      })),
    }));

    const synced = await pushBatch(
      '/api/sync/invoices',
      token,
      invoicesWithItems,
      'invoices',
      `Invoices batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, pending.length)})`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id, tenantId); });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} invoices to cloud.`);
}

// ── Pull Invoices (Cloud → Edge) ─────────────────────────────────────────────
export async function pullInvoices(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsertInv = db.prepare(`
    INSERT INTO invoices (
      invoice_id, tenant_id, invoice_number, invoice_type,
      customer_name, customer_phone, customer_gstin, customer_state, customer_address,
      subtotal, tax_total,
      discount_total, discount_type, discount_value, grand_total, payment_method, split_details,
      received_amount, actual_refund_paid, balance_amount, user_id, sync_status, created_at,
      scrap_deduction, scrap_invoice_number,
      return_deduction, return_invoice_number,
      customer_id, points_earned, points_redeemed, points_redeemed_discount,
      previous_points_balance, remaining_points_balance,
      converted_from_invoice_id, converted_from_invoice_number,
      converted_to_invoice_id, converted_to_invoice_number,
      is_deleted,
      cgst_total, sgst_total, igst_total, supply_type,
      notes, description
    ) VALUES (
      @invoice_id, @tenant_id, @invoice_number, @invoice_type,
      @customer_name, @customer_phone, @customer_gstin, @customer_state, @customer_address,
      @subtotal, @tax_total,
      @discount_total, @discount_type, @discount_value, @grand_total, @payment_method, @split_details,
      @received_amount, @actual_refund_paid, @balance_amount, @user_id, 'SYNCED', @created_at,
      @scrap_deduction, @scrap_invoice_number,
      @return_deduction, @return_invoice_number,
      @customer_id, @points_earned, @points_redeemed, @points_redeemed_discount,
      @previous_points_balance, @remaining_points_balance,
      @converted_from_invoice_id, @converted_from_invoice_number,
      @converted_to_invoice_id, @converted_to_invoice_number,
      @is_deleted,
      @cgst_total, @sgst_total, @igst_total, @supply_type,
      @notes, @description
    )
    ON CONFLICT(invoice_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_gstin = EXCLUDED.customer_gstin,
      customer_state = EXCLUDED.customer_state,
      customer_address = EXCLUDED.customer_address,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      discount_total = EXCLUDED.discount_total,
      discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      grand_total = EXCLUDED.grand_total,
      payment_method = EXCLUDED.payment_method,
      split_details = EXCLUDED.split_details,
      received_amount = EXCLUDED.received_amount,
      actual_refund_paid = EXCLUDED.actual_refund_paid,
      balance_amount = EXCLUDED.balance_amount,
      invoice_type = EXCLUDED.invoice_type,
      user_id = EXCLUDED.user_id,
      scrap_deduction = EXCLUDED.scrap_deduction,
      scrap_invoice_number = EXCLUDED.scrap_invoice_number,
      return_deduction = EXCLUDED.return_deduction,
      return_invoice_number = EXCLUDED.return_invoice_number,
      customer_id = EXCLUDED.customer_id,
      points_earned = EXCLUDED.points_earned,
      points_redeemed = EXCLUDED.points_redeemed,
      points_redeemed_discount = EXCLUDED.points_redeemed_discount,
      previous_points_balance = EXCLUDED.previous_points_balance,
      remaining_points_balance = EXCLUDED.remaining_points_balance,
      converted_from_invoice_id = EXCLUDED.converted_from_invoice_id,
      converted_from_invoice_number = EXCLUDED.converted_from_invoice_number,
      converted_to_invoice_id = EXCLUDED.converted_to_invoice_id,
      converted_to_invoice_number = EXCLUDED.converted_to_invoice_number,
      is_deleted = EXCLUDED.is_deleted,
      cgst_total = EXCLUDED.cgst_total,
      sgst_total = EXCLUDED.sgst_total,
      igst_total = EXCLUDED.igst_total,
      supply_type = EXCLUDED.supply_type,
      notes = EXCLUDED.notes,
      description = EXCLUDED.description,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO invoice_items (
      item_id, invoice_id, tenant_id, product_id,
      name, quantity, unit_price, tax_amount, total, qty_from_paper_stock, pieces_sold, billing_type, uom,
      cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, supply_type
    ) VALUES (
      @item_id, @invoice_id, @tenant_id, @product_id,
      @name, @quantity, @unit_price, @tax_amount, @total, @qty_from_paper_stock, @pieces_sold, @billing_type, @uom,
      @cgst_rate, @sgst_rate, @igst_rate, @cgst_amount, @sgst_amount, @igst_amount, @hsn_sac_code, @supply_type
    )
    ON CONFLICT(item_id) DO UPDATE SET
      name = excluded.name,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      tax_amount = excluded.tax_amount,
      total = excluded.total,
      qty_from_paper_stock = excluded.qty_from_paper_stock,
      pieces_sold = COALESCE(excluded.pieces_sold, invoice_items.pieces_sold),
      billing_type = COALESCE(excluded.billing_type, invoice_items.billing_type),
      uom = COALESCE(excluded.uom, invoice_items.uom),
      cgst_rate = excluded.cgst_rate,
      sgst_rate = excluded.sgst_rate,
      igst_rate = excluded.igst_rate,
      cgst_amount = excluded.cgst_amount,
      sgst_amount = excluded.sgst_amount,
      igst_amount = excluded.igst_amount,
      hsn_sac_code = excluded.hsn_sac_code,
      supply_type = excluded.supply_type
  `);

  // Items are replaced per invoice (not just upserted) so items removed from an
  // edited bill are deleted locally too — otherwise stale lines come back and
  // reappear on reprints. A locally PENDING edit that differs from the cloud is
  // never clobbered: its items are left untouched until the edit syncs.
  const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?');
  const localInvCheck = db.prepare('SELECT sync_status, updated_at, is_deleted FROM invoices WHERE invoice_id = ? AND tenant_id = ?');

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'invoices',
    urlPath: '/api/sync/invoices',
    label: 'invoices',
    onProgress: (fetched) => notifyPullProgress('invoices', fetched),
    processPage: (rows) => {
      console.log(`[SyncWorker][pull:invoices] processPage: processing ${rows.length} invoices...`);
      // DEBUG: log first few invoice IDs to confirm data is arriving
      if (rows.length > 0) {
        const sample = rows.slice(0, 3).map((r: any) => r.invoice_number || r.invoice_id).join(', ');
        console.log(`[SyncWorker][pull:invoices] Sample invoices received: ${sample}`);
      }

      const tx = db.transaction((invoices: any[]) => {
        for (const inv of invoices) {
          const currentInv = { ...inv };

          // Never touch a locally-PENDING edit that diverges from the cloud (a change that
          // hasn't synced yet). Replacing header or items here would resurrect the deleted
          // lines of an edited bill and/or revert the edit. The push path will sync it later.
          const prior = localInvCheck.get(currentInv.invoice_id, currentInv.tenant_id) as any;
          const isDirtyPending = !!prior
            && prior.sync_status === 'PENDING'
            && toSqliteDate(currentInv.updated_at) !== prior.updated_at;
          if (isDirtyPending) continue;

          let resolvedCustId = currentInv.customer_id || null;
          if (!resolvedCustId && (currentInv.customer_phone || currentInv.customer_name)) {
            const custCleanDigits = (currentInv.customer_phone || '').replace(/\D/g, '');
            if (custCleanDigits.length >= 7) {
              const matchedCust = db.prepare(`
                SELECT customer_id FROM customers 
                WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                  AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)
                LIMIT 1
              `).get(currentInv.tenant_id, currentInv.customer_phone, `%${custCleanDigits.slice(-10)}`) as any;
              if (matchedCust) resolvedCustId = matchedCust.customer_id;
            }
            if (!resolvedCustId && currentInv.customer_name) {
              const matchedCust = db.prepare(`
                SELECT customer_id FROM customers 
                WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
                  AND LOWER(REPLACE(TRIM(name), '  ', ' ')) = LOWER(REPLACE(TRIM(?), '  ', ' '))
                LIMIT 1
              `).get(currentInv.tenant_id, currentInv.customer_name) as any;
              if (matchedCust) resolvedCustId = matchedCust.customer_id;
            }
          }

          let retryCount = 0;
          let success = false;
          while (retryCount < 2 && !success) {
            try {
              upsertInv.run({
                invoice_id: currentInv.invoice_id,
                tenant_id: currentInv.tenant_id,
                invoice_number: currentInv.invoice_number,
                invoice_type: currentInv.invoice_type,
                customer_name: currentInv.customer_name || null,
                customer_phone: currentInv.customer_phone || null,
                subtotal: currentInv.subtotal,
                tax_total: currentInv.tax_total,
                discount_total: currentInv.discount_total ?? 0,
                discount_type: currentInv.discount_type || 'FIXED',
                discount_value: currentInv.discount_value ?? 0,
                grand_total: currentInv.grand_total,
                payment_method: currentInv.payment_method || 'PENDING',
                split_details: currentInv.split_details && typeof currentInv.split_details === 'object' ? JSON.stringify(currentInv.split_details) : (currentInv.split_details && currentInv.split_details !== 'null' ? currentInv.split_details : null),
                received_amount: currentInv.received_amount ?? 0,
                actual_refund_paid: currentInv.actual_refund_paid ?? 0,
                balance_amount: currentInv.balance_amount ?? 0,
                user_id: currentInv.user_id || null,
                created_at: toSqliteDate(currentInv.created_at),
                customer_gstin: currentInv.customer_gstin || null,
                customer_state: currentInv.customer_state || null,
                customer_address: currentInv.customer_address || null,
                scrap_deduction: currentInv.scrap_deduction ?? 0,
                scrap_invoice_number: currentInv.scrap_invoice_number || null,
                return_deduction: currentInv.return_deduction ?? 0,
                return_invoice_number: currentInv.return_invoice_number || null,
                customer_id: resolvedCustId,
                points_earned: currentInv.points_earned ?? 0,
                points_redeemed: currentInv.points_redeemed ?? 0,
                points_redeemed_discount: currentInv.points_redeemed_discount ?? 0,
                previous_points_balance: currentInv.previous_points_balance ?? 0,
                remaining_points_balance: currentInv.remaining_points_balance ?? 0,
                converted_from_invoice_id: currentInv.converted_from_invoice_id || null,
                converted_from_invoice_number: currentInv.converted_from_invoice_number || null,
                converted_to_invoice_id: currentInv.converted_to_invoice_id || null,
                converted_to_invoice_number: currentInv.converted_to_invoice_number || null,
                is_deleted: parseIsDeleted(currentInv.is_deleted),
                cgst_total: Number(currentInv.cgst_total) || 0,
                sgst_total: Number(currentInv.sgst_total) || 0,
                igst_total: Number(currentInv.igst_total) || 0,
                supply_type: currentInv.supply_type || 'INTRA',
                notes: currentInv.notes || currentInv.description || null,
                description: currentInv.description || currentInv.notes || null,
              });

              // If this invoice is soft-deleted and was active locally before this pull, restore local product stock
              const isDeletedPull = parseIsDeleted(currentInv.is_deleted) === 1;
              if (isDeletedPull && prior && !prior.is_deleted && Array.isArray(currentInv.items)) {
                const isConversionCopy = !!(currentInv.converted_from_invoice_id || currentInv.converted_from_invoice_number);
                if (!isConversionCopy) {
                  for (const item of currentInv.items) {
                    db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?').run(Number(item.quantity) || 0, item.product_id, currentInv.tenant_id);
                  }
                }
              }

              // If this invoice was soft-deleted locally but cloud is active, re-deduct local product stock (restored in cloud)
              if (!isDeletedPull && prior && prior.is_deleted === 1 && Array.isArray(currentInv.items)) {
                const isConversionCopy = !!(currentInv.converted_from_invoice_id || currentInv.converted_from_invoice_number);
                if (!isConversionCopy) {
                  for (const item of currentInv.items) {
                    db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?').run(Number(item.quantity) || 0, item.product_id, currentInv.tenant_id);
                  }
                }
              }

              // If this invoice is soft-deleted, ensure any local party ledger entries are also soft-deleted
              if (isDeletedPull && currentInv.invoice_number) {
                const invNum = String(currentInv.invoice_number).trim();
                db.prepare(`
                  UPDATE party_ledger
                  SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
                  WHERE (reference_number = ? OR reference_number = ? OR reference_number LIKE ? OR description LIKE ?)
                    AND (is_deleted IS NULL OR is_deleted = 0)
                `).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
              }

              // If this invoice was restored, restore any corresponding party ledger entries
              if (!isDeletedPull && prior && prior.is_deleted === 1 && currentInv.invoice_number) {
                const invNum = String(currentInv.invoice_number).trim();
                db.prepare(`
                  UPDATE party_ledger
                  SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
                  WHERE (reference_number = ? OR reference_number = ? OR reference_number LIKE ? OR description LIKE ?)
                    AND is_deleted = 1
                `).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
              }

              success = true;
            } catch (e: any) {
              if (e.message?.includes('UNIQUE constraint failed: invoices.tenant_id, invoices.invoice_number')) {
                const suffix = currentInv.invoice_id.substring(0, 4).toUpperCase();
                currentInv.invoice_number = `${currentInv.invoice_number}-C${suffix}`;
                retryCount++;
              } else {
                throw e;
              }
            }
          }

          if (success && Array.isArray(currentInv.items)) {
            // Save existing pieces_sold, billing_type, and uom from local DB BEFORE deleting — server doesn't store
            // these fields so we must preserve the locally-typed values ourselves.
            const existingPiecesSold: Record<string, number | null> = {};
            const existingBillingType: Record<string, string | null> = {};
            const existingUom: Record<string, string | null> = {};
            const existingRows = db.prepare('SELECT item_id, pieces_sold, billing_type, uom FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?').all(currentInv.invoice_id, currentInv.tenant_id) as any[];
            for (const row of existingRows) {
              existingPiecesSold[row.item_id] = row.pieces_sold != null ? Number(row.pieces_sold) : null;
              existingBillingType[row.item_id] = row.billing_type != null ? row.billing_type : null;
              existingUom[row.item_id] = row.uom != null ? row.uom : null;
            }

            // Replace items per invoice so lines removed from an edited bill are deleted
            // locally too — otherwise they resurrect and reappear on reprints.
            deleteItems.run(currentInv.invoice_id, currentInv.tenant_id);
            for (const item of currentInv.items) {
              // Prefer: server-returned pieces_sold → previously saved local value → null
              const preservedPcs = item.pieces_sold != null
                ? Number(item.pieces_sold)
                : (existingPiecesSold[item.item_id] ?? null);
              const preservedBillingType = item.billing_type != null
                ? item.billing_type
                : (existingBillingType[item.item_id] ?? null);
              const preservedUom = item.uom != null
                ? item.uom
                : (existingUom[item.item_id] ?? null);

              upsertItem.run({
                item_id: item.item_id,
                invoice_id: currentInv.invoice_id,
                tenant_id: currentInv.tenant_id,
                product_id: item.product_id,
                name: item.name || null,
                quantity: item.quantity,
                unit_price: item.unit_price,
                tax_amount: item.tax_amount,
                total: item.total,
                qty_from_paper_stock: item.qty_from_paper_stock ?? 0,
                pieces_sold: preservedPcs,
                billing_type: preservedBillingType,
                uom: preservedUom,
                cgst_rate: Number(item.cgst_rate) || 0,
                sgst_rate: Number(item.sgst_rate) || 0,
                igst_rate: Number(item.igst_rate) || 0,
                cgst_amount: Number(item.cgst_amount) || 0,
                sgst_amount: Number(item.sgst_amount) || 0,
                igst_amount: Number(item.igst_amount) || 0,
                hsn_sac_code: item.hsn_sac_code || null,
                supply_type: item.supply_type || 'INTRA',
              });
            }
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'invoices', 'invoice_id', rows);
    },
  });

  if (result.count > 0) {
    console.log(`[SyncWorker] ✅ Pulled ${result.count} invoices from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled} PENDING.` : ''}`);
  } else if (result.failed) {
    console.error(`[SyncWorker] ❌ Pull invoices FAILED for tenantId=${tenantId}.`);
  } else {
    console.log(`[SyncWorker] ℹ️ Pull invoices: 0 new/changed invoices (cursor up-to-date).`);
  }
  // Always signal "changed" whenever count > 0 so the UI re-queries SQLite.
  // hasContentChanged was removed — it was blocking notifications for data already in DB.
  return (result.count > 0 || result.reconciled > 0) && !result.failed;
}

// ── Quotations Sync (Edge → Cloud) ───────────────────────────────────────────────
export async function syncQuotations(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM quotations WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} quotations to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ?`);
  const updateStmt = db.prepare(`UPDATE quotations SET sync_status = 'SYNCED', tenant_id = ? WHERE quotation_id = ?`);
  const updateItemsStmt = db.prepare(`UPDATE quotation_items SET sync_status = 'SYNCED', tenant_id = ? WHERE quotation_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const quotationsWithItems = batch.map((q: any) => ({
      ...q,
      tenant_id: tenantId,
      subtotal: Number(q.subtotal) || 0,
      tax_total: Number(q.tax_total) || 0,
      grand_total: Number(q.grand_total) || 0,
      converted_to_invoice: parseIsDeleted(q.converted_to_invoice),
      items: (getItems.all(q.quotation_id) as any[]).map((item: any) => ({
        ...item,
        tenant_id: tenantId,
        quantity: Number(item.quantity) || 0,
        weight: item.weight != null ? Number(item.weight) : null,
        rate: Number(item.rate) || 0,
        amount: Number(item.amount) || 0,
      })),
    }));

    const synced = await pushBatch(
      '/api/sync/quotations',
      token,
      quotationsWithItems,
      'quotations',
      `Quotations batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(tenantId, id);
          updateItemsStmt.run(tenantId, id);
        }
      });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} quotations to cloud.`);
}

// ── Pull Quotations (Cloud → Edge) ─────────────────────────────────────────────
export async function pullQuotations(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  let hasContentChanged = false;

  const upsertQtn = db.prepare(`
    INSERT INTO quotations (
      quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address,
      terms_conditions, subtotal, tax_total, grand_total, status, converted_to_invoice, invoice_id,
      sync_status, created_at, updated_at
    ) VALUES (
      @quotation_id, @tenant_id, @quotation_number, @customer_name, @customer_phone, @customer_address,
      @terms_conditions, @subtotal, @tax_total, @grand_total, @status, @converted_to_invoice, @invoice_id,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(quotation_id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_address = EXCLUDED.customer_address,
      terms_conditions = EXCLUDED.terms_conditions,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      grand_total = EXCLUDED.grand_total,
      status = EXCLUDED.status,
      converted_to_invoice = EXCLUDED.converted_to_invoice,
      invoice_id = EXCLUDED.invoice_id,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
    WHERE quotations.sync_status != 'PENDING'
  `);

  const upsertItem = db.prepare(`
    INSERT INTO quotation_items (
      item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status, created_at
    ) VALUES (
      @item_id, @quotation_id, @tenant_id, @product_id, @name, @quantity, @weight, @rate, @amount, 'SYNCED', @created_at
    )
    ON CONFLICT(item_id) DO UPDATE SET
      name = EXCLUDED.name,
      quantity = EXCLUDED.quantity,
      weight = EXCLUDED.weight,
      rate = EXCLUDED.rate,
      amount = EXCLUDED.amount,
      sync_status = 'SYNCED'
  `);

  const deleteItems = db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?');

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'quotations',
    urlPath: '/api/sync/quotations',
    label: 'quotations',
    onProgress: (fetched) => notifyPullProgress('quotations', fetched),
    processPage: (rows) => {
      const tx = db.transaction((quotations: any[]) => {
        for (const q of quotations) {
          try {
            if (q.status === 'DELETED' || q.is_deleted) {
              db.prepare("UPDATE quotations SET status = 'DELETED', sync_status = 'SYNCED' WHERE quotation_id = ?").run(q.quotation_id);
              deleteItems.run(q.quotation_id);
              continue;
            }
            upsertQtn.run({
              quotation_id: q.quotation_id,
              tenant_id: tenantId,
              quotation_number: q.quotation_number,
              customer_name: q.customer_name || null,
              customer_phone: q.customer_phone || null,
              customer_address: q.customer_address || null,
              terms_conditions: q.terms_conditions || null,
              subtotal: Number(q.subtotal) || 0,
              tax_total: Number(q.tax_total) || 0,
              grand_total: Number(q.grand_total) || 0,
              status: q.status || 'ACTIVE',
              converted_to_invoice: parseIsDeleted(q.converted_to_invoice),
              invoice_id: q.invoice_id || null,
              created_at: toSqliteDate(q.created_at),
              updated_at: toSqliteDate(q.updated_at),
            });

            let itemsList = Array.isArray(q.items) ? q.items : (Array.isArray(q.quotation_items) ? q.quotation_items : (Array.isArray(q.quotationItems) ? q.quotationItems : null));
            if (itemsList && itemsList.length > 0) {
              if (itemsList.length > 1) {
                const timestamps: number[] = itemsList.map((i: any) => i.created_at ? new Date(i.created_at).getTime() : 0).filter(Boolean);
                const uniqueTs = Array.from(new Set<number>(timestamps));
                if (uniqueTs.length > 1) {
                  const latestTs = Math.max(...uniqueTs);
                  itemsList = itemsList.filter((i: any) => (i.created_at ? new Date(i.created_at).getTime() : 0) === latestTs);
                }
              }
              deleteItems.run(q.quotation_id);
              for (let idx = 0; idx < itemsList.length; idx++) {
                const item = itemsList[idx];
                const itemId = item.item_id || item.id || item.quotation_item_id || `${q.quotation_id}_item_${idx + 1}`;
                const itemName = item.name || item.product_name || 'Item';
                upsertItem.run({
                  item_id: String(itemId),
                  quotation_id: String(q.quotation_id),
                  tenant_id: tenantId,
                  product_id: item.product_id ? String(item.product_id) : null,
                  name: String(itemName),
                  quantity: Number(item.quantity) || 1,
                  weight: item.weight != null ? Number(item.weight) : null,
                  rate: Number(item.rate) || 0,
                  amount: Number(item.amount) || 0,
                  created_at: toSqliteDate(item.created_at || q.created_at || new Date().toISOString()),
                });
              }
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling quotation:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'quotations', 'quotation_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} quotations from cloud.`);
    hasContentChanged = true;
  }
  return hasContentChanged;
}

// ── Warranties Sync (Edge → Cloud) ──────────────────────────────────────────
export async function syncWarranties(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM warranties WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} warranties to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = db.prepare(`UPDATE warranties SET sync_status = 'SYNCED', tenant_id = ? WHERE warranty_id = ?`);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const warrantiesToPush = batch.map((w: any) => ({
      ...w,
      tenant_id: tenantId,
      bill_number: w.bill_number || null,
      brand: w.brand || null,
      warranty_period_days: Number(w.warranty_period_days) || 365,
    }));

    const synced = await pushBatch(
      '/api/sync/warranties',
      token,
      warrantiesToPush,
      'warranties',
      `Warranties batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      totalSynced += synced.length;
      const tx = db.transaction((ids: string[]) => {
        for (const id of ids) {
          updateStmt.run(tenantId, id);
        }
      });
      tx(synced);
    }
  }
  console.log(`[SyncWorker] Pushed ${totalSynced} warranties to cloud.`);
}

// ── Pull Warranties (Cloud → Edge) ──────────────────────────────────────────
export async function pullWarranties(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  let hasContentChanged = false;

  const upsertWarranty = db.prepare(`
    INSERT INTO warranties (
      warranty_id, tenant_id, invoice_id, invoice_item_id, bill_number, brand,
      customer_name, customer_phone, product_name, product_details, purchase_date,
      warranty_period_days, expiry_date, notes, sync_status, created_at, updated_at
    ) VALUES (
      @warranty_id, @tenant_id, @invoice_id, @invoice_item_id, @bill_number, @brand,
      @customer_name, @customer_phone, @product_name, @product_details, @purchase_date,
      @warranty_period_days, @expiry_date, @notes, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(warranty_id) DO UPDATE SET
      bill_number = EXCLUDED.bill_number,
      brand = EXCLUDED.brand,
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      product_name = EXCLUDED.product_name,
      product_details = EXCLUDED.product_details,
      purchase_date = EXCLUDED.purchase_date,
      warranty_period_days = EXCLUDED.warranty_period_days,
      expiry_date = EXCLUDED.expiry_date,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at,
      sync_status = 'SYNCED'
    WHERE warranties.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'warranties',
    urlPath: '/api/sync/warranties',
    label: 'warranties',
    onProgress: (fetched) => notifyPullProgress('warranties', fetched),
    processPage: (rows) => {
      const tx = db.transaction((warranties: any[]) => {
        for (const w of warranties) {
          try {
            upsertWarranty.run({
              warranty_id: String(w.warranty_id),
              tenant_id: tenantId,
              invoice_id: w.invoice_id || null,
              invoice_item_id: w.invoice_item_id || null,
              bill_number: w.bill_number || null,
              brand: w.brand || null,
              customer_name: w.customer_name || '',
              customer_phone: w.customer_phone || null,
              product_name: w.product_name || '',
              product_details: w.product_details || null,
              purchase_date: toSqliteDate(w.purchase_date),
              warranty_period_days: Number(w.warranty_period_days) || 365,
              expiry_date: toSqliteDate(w.expiry_date),
              notes: w.notes || null,
              created_at: toSqliteDate(w.created_at),
              updated_at: toSqliteDate(w.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling warranty:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'warranties', 'warranty_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} warranties from cloud.`);
    hasContentChanged = true;
  }
  return hasContentChanged;
}
