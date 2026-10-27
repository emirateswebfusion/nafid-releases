import { getDb } from '../../db/localDb.js';
import { BATCH_SIZE, parseIsDeleted, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';
import * as salesDocsSyncSql from '../../db/statements/sync/salesDocsSync.js';

/** Sales documents sync: invoices, quotations and warranties (push and pull). */
// ── Invoice Sync (Edge → Cloud) ──────────────────────────────────────────────
export async function syncInvoices(token: string, tenantId: string) {
  const db = getDb();
  const pending = salesDocsSyncSql.selectInvoices(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} invoices to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = salesDocsSyncSql.selectInvoiceItems(db);
  const updateStmt = salesDocsSyncSql.updateInvoices(db);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const invoicesWithItems = batch.map((inv: Record<string, unknown>) => ({
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
      items: (getItems.all(inv.invoice_id, tenantId) as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
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

  const upsertInv = salesDocsSyncSql.insertInvoices(db);

  const upsertItem = salesDocsSyncSql.insertInvoiceItems(db);

  // Items are replaced per invoice (not just upserted) so items removed from an
  // edited bill are deleted locally too — otherwise stale lines come back and
  // reappear on reprints. A locally PENDING edit that differs from the cloud is
  // never clobbered: its items are left untouched until the edit syncs.
  const deleteItems = salesDocsSyncSql.deleteInvoiceItems(db);
  const localInvCheck = salesDocsSyncSql.selectInvoices2(db);

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
        const sample = rows.slice(0, 3).map((r: Record<string, unknown>) => r.invoice_number || r.invoice_id).join(', ');
        console.log(`[SyncWorker][pull:invoices] Sample invoices received: ${sample}`);
      }

      const tx = db.transaction((invoices: Record<string, unknown>[]) => {
        for (const inv of invoices) {
          const currentInv = { ...inv };

          // Never touch a locally-PENDING edit that diverges from the cloud (a change that
          // hasn't synced yet). Replacing header or items here would resurrect the deleted
          // lines of an edited bill and/or revert the edit. The push path will sync it later.
          const prior = localInvCheck.get(currentInv.invoice_id, currentInv.tenant_id) as Record<string, unknown>;
          const isDirtyPending = !!prior
            && prior.sync_status === 'PENDING'
            && toSqliteDate((currentInv.updated_at as string | number | Date | null | undefined)) !== prior.updated_at;
          if (isDirtyPending) continue;

          let resolvedCustId = currentInv.customer_id || null;
          if (!resolvedCustId && (currentInv.customer_phone || currentInv.customer_name)) {
            const custCleanDigits = ((currentInv.customer_phone as string) || ('' as string)).replace(/\D/g, '');
            if (custCleanDigits.length >= 7) {
              const matchedCust = salesDocsSyncSql.selectCustomers(db).get(currentInv.tenant_id, currentInv.customer_phone, `%${custCleanDigits.slice(-10)}`) as Record<string, unknown>;
              if (matchedCust) resolvedCustId = (matchedCust.customer_id as typeof resolvedCustId);
            }
            if (!resolvedCustId && currentInv.customer_name) {
              const matchedCust = salesDocsSyncSql.selectCustomers2(db).get(currentInv.tenant_id, currentInv.customer_name) as Record<string, unknown>;
              if (matchedCust) resolvedCustId = (matchedCust.customer_id as typeof resolvedCustId);
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
                created_at: toSqliteDate((currentInv.created_at as string | number | Date | null | undefined)),
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
                counts_in_revenue: currentInv.counts_in_revenue ?? 1,
                bill_purpose: currentInv.bill_purpose ?? 'SALE',
                stock_applied: currentInv.stock_applied ?? 1,
                notes: currentInv.notes || currentInv.description || null,
                description: currentInv.description || currentInv.notes || null,
              });

              // If this invoice is soft-deleted and was active locally before this pull, restore local product stock
              const isDeletedPull = parseIsDeleted(currentInv.is_deleted) === 1;
              if (isDeletedPull && prior && !prior.is_deleted && Array.isArray(currentInv.items)) {
                const isConversionCopy = !!(currentInv.converted_from_invoice_id || currentInv.converted_from_invoice_number);
                if (!isConversionCopy) {
                  for (const item of currentInv.items) {
                    salesDocsSyncSql.updateProducts(db).run(Number(item.quantity) || 0, item.product_id, currentInv.tenant_id);
                  }
                }
              }

              // If this invoice was soft-deleted locally but cloud is active, re-deduct local product stock (restored in cloud)
              if (!isDeletedPull && prior && prior.is_deleted === 1 && Array.isArray(currentInv.items)) {
                const isConversionCopy = !!(currentInv.converted_from_invoice_id || currentInv.converted_from_invoice_number);
                if (!isConversionCopy) {
                  for (const item of currentInv.items) {
                    salesDocsSyncSql.updateProducts2(db).run(Number(item.quantity) || 0, item.product_id, currentInv.tenant_id);
                  }
                }
              }

              // If this invoice is soft-deleted, ensure any local party ledger entries are also soft-deleted
              if (isDeletedPull && currentInv.invoice_number) {
                const invNum = String(currentInv.invoice_number).trim();
                salesDocsSyncSql.updatePartyLedger(db).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
              }

              // If this invoice was restored, restore any corresponding party ledger entries
              if (!isDeletedPull && prior && prior.is_deleted === 1 && currentInv.invoice_number) {
                const invNum = String(currentInv.invoice_number).trim();
                salesDocsSyncSql.updatePartyLedger2(db).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
              }

              success = true;
            } catch (e) {
              if ((e as Error).message?.includes('UNIQUE constraint failed: invoices.tenant_id, invoices.invoice_number')) {
                const suffix = (currentInv.invoice_id as string).substring(0, 4).toUpperCase();
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
            const existingRows = salesDocsSyncSql.selectInvoiceItems2(db).all(currentInv.invoice_id, currentInv.tenant_id) as Record<string, unknown>[];
            for (const row of existingRows) {
              existingPiecesSold[(row.item_id as string)] = row.pieces_sold != null ? Number(row.pieces_sold) : null;
              existingBillingType[(row.item_id as string)] = row.billing_type != null ? (row.billing_type as string | null) : (null as string | null);
              existingUom[(row.item_id as string)] = row.uom != null ? (row.uom as string | null) : (null as string | null);
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
  const pending = salesDocsSyncSql.selectQuotations(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} quotations to cloud in batches of ${BATCH_SIZE}...`);

  const getItems = salesDocsSyncSql.selectQuotationItems(db);
  const updateStmt = salesDocsSyncSql.updateQuotations(db);
  const updateItemsStmt = salesDocsSyncSql.updateQuotationItems(db);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const quotationsWithItems = batch.map((q: Record<string, unknown>) => ({
      ...q,
      tenant_id: tenantId,
      subtotal: Number(q.subtotal) || 0,
      tax_total: Number(q.tax_total) || 0,
      grand_total: Number(q.grand_total) || 0,
      converted_to_invoice: parseIsDeleted(q.converted_to_invoice),
      items: (getItems.all(q.quotation_id) as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
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

  const upsertQtn = salesDocsSyncSql.insertQuotations(db);

  const upsertItem = salesDocsSyncSql.insertQuotationItems(db);

  const deleteItems = salesDocsSyncSql.deleteQuotationItems(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'quotations',
    urlPath: '/api/sync/quotations',
    label: 'quotations',
    onProgress: (fetched) => notifyPullProgress('quotations', fetched),
    processPage: (rows) => {
      const tx = db.transaction((quotations: Record<string, unknown>[]) => {
        for (const q of quotations) {
          try {
            if (q.status === 'DELETED' || q.is_deleted) {
              salesDocsSyncSql.updateQuotations2(db).run(q.quotation_id);
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
              created_at: toSqliteDate((q.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((q.updated_at as string | number | Date | null | undefined)),
            });

            let itemsList = Array.isArray(q.items) ? q.items : (Array.isArray(q.quotation_items) ? q.quotation_items : (Array.isArray(q.quotationItems) ? q.quotationItems : null));
            if (itemsList && itemsList.length > 0) {
              if (itemsList.length > 1) {
                const timestamps: number[] = itemsList.map((i: Record<string, unknown>) => i.created_at ? new Date((i.created_at as string | number)).getTime() : 0).filter(Boolean);
                const uniqueTs = Array.from(new Set<number>(timestamps));
                if (uniqueTs.length > 1) {
                  const latestTs = Math.max(...uniqueTs);
                  itemsList = itemsList.filter((i: Record<string, unknown>) => (i.created_at ? new Date((i.created_at as string | number)).getTime() : 0) === latestTs);
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
          } catch (e) {
            console.error('[SyncWorker] Error pulling quotation:', (e as Error).message);
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
  const pending = salesDocsSyncSql.selectWarranties(db).all(tenantId) as Record<string, unknown>[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} warranties to cloud in batches of ${BATCH_SIZE}...`);

  const updateStmt = salesDocsSyncSql.updateWarranties(db);

  let totalSynced = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const warrantiesToPush = batch.map((w: Record<string, unknown>) => ({
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

  const upsertWarranty = salesDocsSyncSql.insertWarranties(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'warranties',
    urlPath: '/api/sync/warranties',
    label: 'warranties',
    onProgress: (fetched) => notifyPullProgress('warranties', fetched),
    processPage: (rows) => {
      const tx = db.transaction((warranties: Record<string, unknown>[]) => {
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
              purchase_date: toSqliteDate((w.purchase_date as string | number | Date | null | undefined)),
              warranty_period_days: Number(w.warranty_period_days) || 365,
              expiry_date: toSqliteDate((w.expiry_date as string | number | Date | null | undefined)),
              notes: w.notes || null,
              created_at: toSqliteDate((w.created_at as string | number | Date | null | undefined)),
              updated_at: toSqliteDate((w.updated_at as string | number | Date | null | undefined)),
            });
          } catch (e) {
            console.error('[SyncWorker] Error pulling warranty:', (e as Error).message);
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
