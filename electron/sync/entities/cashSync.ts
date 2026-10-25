import { BrowserWindow } from 'electron';
import { getDb } from '../../db/localDb.js';
import { BATCH_SIZE, parseCleanDate, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress, notifyRenderer } from '../syncProgress.js';
import { pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';

/** Cash sync: cash drawer (with reconciliation), cash transactions, categories, cashier audit log and payment sources (push and pull). */
// ── Cash Drawer Sync (Edge → Cloud) ─────────────────────────────────────────────
export async function syncCashDrawer(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_drawer WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash drawer records to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_drawer SET sync_status = 'SYNCED' WHERE drawer_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cash_drawer',
      token, batch, 'cash_drawer', `Cash Drawer batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Cash Transactions Sync (Edge → Cloud) ───────────────────────────────────────
export async function syncCashTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_transactions WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash transactions to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cash_transactions',
      token, batch, 'cash_transactions', `Cash Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Cash Categories Sync (Edge → Cloud) ─────────────────────────────────────────
export async function syncCashCategories(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cash_categories WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash categories to cloud...`);

  const updateStmt = db.prepare(`UPDATE cash_categories SET sync_status = 'SYNCED' WHERE category_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cash_categories',
      token, batch, 'cash_categories', `Cash Categories batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Cashier Audit Log Sync (Edge → Cloud) ───────────────────────────────────────
export async function syncCashierAuditLog(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM cashier_audit_log WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cashier audit log records to cloud...`);

  const updateStmt = db.prepare(`UPDATE cashier_audit_log SET sync_status = 'SYNCED' WHERE audit_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/cashier_audit_log',
      token, batch, 'cashier_audit_log', `Cashier Audit Log batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

export let lastCashDrawerHash = '';

export function reconcileCashDrawerSync(db: any, tenantId: string, drawer: any) {
  if (!drawer || !tenantId) return;
  try {
    const cleanDate = parseCleanDate(drawer.business_date);
    const parts = cleanDate.split('-');
    const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
    const dateLike1 = `${cleanDate}%`;
    const dateLike2 = `${altDate}%`;

    const salesRow = db.prepare(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN UPPER(payment_method) = 'CASH' THEN (
              CASE 
                WHEN COALESCE(grand_total, 0) <= 0 THEN 0
                WHEN received_amount > 0 AND received_amount < COALESCE(grand_total, 0)
                  THEN received_amount 
                ELSE MAX(0, COALESCE(grand_total, 0))
              END
            )
            WHEN UPPER(payment_method) = 'SPLIT' AND split_details IS NOT NULL THEN (
              CASE 
                WHEN json_extract(split_details, '$.cash') IS NOT NULL 
                THEN MIN(
                  CAST(json_extract(split_details, '$.cash') AS REAL),
                  MAX(0, COALESCE(grand_total, 0))
                )
                ELSE 0 
              END
            )
            ELSE 0 
          END
        ), 0) AS total_cash_sales
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND UPPER(payment_method) IN ('CASH', 'SPLIT')
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = 0.0)
        AND (
          substr(COALESCE(settled_at, created_at), 1, 10) = ?
          OR substr(COALESCE(settled_at, created_at), 1, 10) = ?
          OR date(COALESCE(settled_at, created_at)) = ?
          OR date(COALESCE(settled_at, created_at)) = ?
          OR COALESCE(settled_at, created_at) LIKE ?
          OR COALESCE(settled_at, created_at) LIKE ?
        )
    `).get(tenantId, cleanDate, altDate, cleanDate, altDate, dateLike1, dateLike2) as any;

    const calcSales = Math.round(Number(salesRow?.total_cash_sales || 0) * 100) / 100;

    const txSums = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN type = 'CASH_OUT' THEN amount ELSE 0 END), 0) AS total_out
      FROM cash_transactions 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (
        drawer_id = ? 
        OR drawer_id IN (SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?))
        OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ? OR substr(transaction_date, 1, 10) = ?
      )
    `).get(tenantId, drawer.drawer_id, tenantId, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate) as any;

    const calcIn = Math.round(Number(txSums?.total_in || 0) * 100) / 100;
    const calcOut = Math.round(Number(txSums?.total_out || 0) * 100) / 100;

    const openingBal = Math.round(Number(drawer.opening_balance || 0) * 100) / 100;
    const expectedCash = Math.round((openingBal + calcSales + calcIn - calcOut) * 100) / 100;

    db.prepare(`
      UPDATE cash_drawer 
      SET cash_sales = ?, cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE drawer_id = ?
    `).run(calcSales, calcIn, calcOut, expectedCash, expectedCash, drawer.drawer_id);
  } catch (e: any) {
    console.error('[SyncWorker] reconcileCashDrawerSync error:', e.message);
  }
}

// ── Pull Cash Drawer (Cloud → Edge) ─────────────────────────────────────────────
export async function pullCashDrawer(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const selectExisting = db.prepare(`
    SELECT drawer_id, status, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing, sync_status 
    FROM cash_drawer 
    WHERE drawer_id = ? 
       OR ((tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
           AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)) 
    ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
  `);
  const updateTxDrawerId = db.prepare(`UPDATE cash_transactions SET drawer_id = ? WHERE drawer_id = ? AND tenant_id = ?`);
  const updateAuditDrawerId = db.prepare(`UPDATE cashier_audit_log SET drawer_id = ? WHERE drawer_id = ? AND tenant_id = ?`);
  const updateMatchedDrawer = db.prepare(`
    UPDATE cash_drawer SET
      drawer_id = @drawer_id,
      opening_balance = @opening_balance, cash_sales = @cash_sales, cash_in = @cash_in, cash_out = @cash_out,
      current_cash = @current_cash, expected_closing = @expected_closing, actual_cash = @actual_cash,
      cash_short = @cash_short, cash_excess = @cash_excess, closing_remarks = @closing_remarks,
      status = @status, opened_by = COALESCE(opened_by, @opened_by), closed_by = @closed_by,
      opened_at = COALESCE(opened_at, @opened_at), closed_at = @closed_at,
      sync_status = 'SYNCED', updated_at = @updated_at
    WHERE drawer_id = @target_id
  `);
  const insertDrawer = db.prepare(`
    INSERT INTO cash_drawer (
      drawer_id, tenant_id, business_date, opening_balance, cash_sales, cash_in, cash_out,
      current_cash, expected_closing, actual_cash, cash_short, cash_excess, closing_remarks,
      status, opened_by, closed_by, opened_at, closed_at, sync_status, created_at, updated_at
    ) VALUES (
      @drawer_id, @tenant_id, @business_date, @opening_balance, @cash_sales, @cash_in, @cash_out,
      @current_cash, @expected_closing, @actual_cash, @cash_short, @cash_excess, @closing_remarks,
      @status, @opened_by, @closed_by, @opened_at, @closed_at, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(drawer_id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      business_date = excluded.business_date,
      opening_balance = excluded.opening_balance,
      cash_sales = MAX(cash_drawer.cash_sales, excluded.cash_sales),
      cash_in = excluded.cash_in,
      cash_out = excluded.cash_out,
      current_cash = MAX(cash_drawer.current_cash, excluded.current_cash),
      expected_closing = MAX(cash_drawer.expected_closing, excluded.expected_closing),
      actual_cash = excluded.actual_cash,
      cash_short = excluded.cash_short,
      cash_excess = excluded.cash_excess,
      closing_remarks = excluded.closing_remarks,
      status = excluded.status,
      opened_by = COALESCE(cash_drawer.opened_by, excluded.opened_by),
      closed_by = excluded.closed_by,
      opened_at = COALESCE(cash_drawer.opened_at, excluded.opened_at),
      closed_at = excluded.closed_at,
      sync_status = CASE WHEN cash_drawer.sync_status = 'PENDING' THEN 'PENDING' ELSE 'SYNCED' END,
      updated_at = excluded.updated_at
    WHERE cash_drawer.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cash_drawer',
    urlPath: '/api/sync/cash_drawer',
    label: 'cash drawer',
    onProgress: (fetched) => notifyPullProgress('cash drawer', fetched),
    processPage: (rows) => {
      const currentHash = JSON.stringify(rows.map(r => ({
        id: r.drawer_id,
        status: r.status,
        opening: r.opening_balance,
        sales: r.cash_sales,
        in: r.cash_in,
        out: r.cash_out,
        cash: r.current_cash,
        date: r.business_date,
      })));
      if (currentHash !== lastCashDrawerHash) {
        lastCashDrawerHash = currentHash;
      }

      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          try {
            const cleanDate = parseCleanDate(r.business_date);
            const parts = cleanDate.split('-');
            const altDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : cleanDate;
            const dateLike1 = `${cleanDate}%`;

            const drawerData = {
              drawer_id: r.drawer_id,
              tenant_id: tenantId,
              business_date: cleanDate,
              opening_balance: r.opening_balance ?? 0,
              cash_sales: r.cash_sales ?? 0,
              cash_in: r.cash_in ?? 0,
              cash_out: r.cash_out ?? 0,
              current_cash: r.current_cash ?? 0,
              expected_closing: r.expected_closing ?? 0,
              actual_cash: r.actual_cash ?? null,
              cash_short: r.cash_short ?? 0,
              cash_excess: r.cash_excess ?? 0,
              closing_remarks: r.closing_remarks || null,
              status: r.status || 'OPEN',
              opened_by: r.opened_by || null,
              closed_by: r.closed_by || null,
              opened_at: toSqliteDate(r.opened_at),
              closed_at: toSqliteDate(r.closed_at),
              created_at: toSqliteDate(r.created_at),
              updated_at: toSqliteDate(r.updated_at),
            };

            const existing = selectExisting.get(r.drawer_id, tenantId, cleanDate, altDate, cleanDate, dateLike1, cleanDate, altDate) as any;
            if (existing) {
              const targetId = existing.drawer_id;
              // For open drawers or drawers pending push, preserve local sales & cash balance if cloud is lower
              const localSales = Number(existing.cash_sales) || 0;
              const localCurrent = Number(existing.current_cash) || 0;
              const cloudSales = Number(drawerData.cash_sales) || 0;
              const cloudCurrent = Number(drawerData.current_cash) || 0;
              
              if (existing.status === 'OPEN' || existing.sync_status === 'PENDING' || localSales > cloudSales || localCurrent > cloudCurrent) {
                const localOpening = Number(existing.opening_balance) || 0;
                const cloudOpening = Number(drawerData.opening_balance) || 0;
                drawerData.opening_balance = Math.max(cloudOpening, localOpening);
                if (drawerData.opening_balance > 0 && (existing.status !== 'CLOSED' || drawerData.status === 'OPEN')) {
                  drawerData.status = 'OPEN';
                }
                drawerData.cash_sales = Math.max(cloudSales, localSales);
                drawerData.current_cash = Math.max(cloudCurrent, drawerData.opening_balance + drawerData.cash_sales + drawerData.cash_in - drawerData.cash_out);
                drawerData.expected_closing = Math.max(Number(drawerData.expected_closing) || 0, drawerData.current_cash);
              }

              updateMatchedDrawer.run({ ...drawerData, target_id: targetId });
              if (targetId !== r.drawer_id) {
                updateTxDrawerId.run(r.drawer_id, targetId, tenantId);
                updateAuditDrawerId.run(r.drawer_id, targetId, tenantId);
              }
            } else {
              insertDrawer.run(drawerData);
            }
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cash drawer:', e.message);
          }
        }
      });
      tx(rows);

      // Instantly reconcile all open cash drawers so cash_sales & current_cash stay accurate
      try {
        const openDrawers = db.prepare(`SELECT * FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND status = 'OPEN'`).all(tenantId) as any[];
        for (const d of openDrawers) {
          reconcileCashDrawerSync(db, tenantId, d);
        }
      } catch (e: any) {
        console.error('[SyncWorker] Drawer reconcile error after pull:', e.message);
      }

      return reconcilePending(db, 'cash_drawer', 'drawer_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cash drawer records from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
    notifyRenderer('cash-drawer-pulled');
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cash drawer failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Cash Transactions (Cloud → Edge) ───────────────────────────────────────
export async function pullCashTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO cash_transactions (
      transaction_id, tenant_id, drawer_id, type, amount, category, notes, reference_number,
      entered_by, entered_by_name, transaction_date, sync_status, created_at, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @drawer_id, @type, @amount, @category, @notes, @reference_number,
      @entered_by, @entered_by_name, @transaction_date, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      drawer_id = excluded.drawer_id,
      type = excluded.type,
      amount = excluded.amount,
      category = excluded.category,
      notes = excluded.notes,
      reference_number = excluded.reference_number,
      entered_by = excluded.entered_by,
      entered_by_name = excluded.entered_by_name,
      transaction_date = excluded.transaction_date,
      updated_at = excluded.updated_at,
      sync_status = 'SYNCED'
    WHERE cash_transactions.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cash_transactions',
    urlPath: '/api/sync/cash_transactions',
    label: 'cash transactions',
    onProgress: (fetched) => notifyPullProgress('cash transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((transactions: any[]) => {
        for (const t of transactions) {
          try {
            const txDate = parseCleanDate(t.transaction_date);
            const localDrawer = db.prepare(`SELECT drawer_id FROM cash_drawer WHERE drawer_id = ? OR (tenant_id = ? AND (business_date = ? OR date(business_date) = ? OR business_date LIKE ?)) LIMIT 1`).get(t.drawer_id, tenantId, txDate, txDate, `${txDate}%`) as any;
            const targetDrawerId = localDrawer?.drawer_id || t.drawer_id;

            upsert.run({
              transaction_id: t.transaction_id,
              tenant_id: tenantId,
              drawer_id: targetDrawerId,
              type: t.type,
              amount: t.amount ?? 0,
              category: t.category || null,
              notes: t.notes || null,
              reference_number: t.reference_number || null,
              entered_by: t.entered_by || null,
              entered_by_name: t.entered_by_name || null,
              transaction_date: toSqliteDate(t.transaction_date),
              created_at: toSqliteDate(t.created_at),
              updated_at: toSqliteDate(t.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cash transaction:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'cash_transactions', 'transaction_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cash transactions from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('sync:data-updated');
    } catch {}
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cash transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Cashier Audit Log (Cloud → Edge) ───────────────────────────────────────
export async function pullCashierAuditLog(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO cashier_audit_log (
      audit_id, tenant_id, drawer_id, action, details, performed_by, performed_by_name, performed_at, sync_status, created_at
    ) VALUES (
      @audit_id, @tenant_id, @drawer_id, @action, @details, @performed_by, @performed_by_name, @performed_at, 'SYNCED', @created_at
    )
    ON CONFLICT(audit_id) DO UPDATE SET
      drawer_id = excluded.drawer_id,
      action = excluded.action,
      details = excluded.details,
      performed_by = excluded.performed_by,
      performed_by_name = excluded.performed_by_name,
      performed_at = excluded.performed_at,
      sync_status = 'SYNCED'
    WHERE cashier_audit_log.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cashier_audit_log',
    urlPath: '/api/sync/cashier_audit_log',
    label: 'cashier audit log',
    tsColumn: 'created_at',
    onProgress: (fetched) => notifyPullProgress('cashier audit log', fetched),
    processPage: (rows) => {
      const tx = db.transaction((logs: any[]) => {
        for (const l of logs) {
          try {
            upsert.run({
              audit_id: l.audit_id,
              tenant_id: tenantId,
              drawer_id: l.drawer_id || null,
              action: l.action,
              details: l.details ? (typeof l.details === 'object' ? JSON.stringify(l.details) : l.details) : null,
              performed_by: l.performed_by || null,
              performed_by_name: l.performed_by_name || null,
              performed_at: toSqliteDate(l.performed_at),
              created_at: toSqliteDate(l.created_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cashier audit log:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'cashier_audit_log', 'audit_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cashier audit log entries from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cashier audit log failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Cash Categories (Cloud → Edge) ─────────────────────────────────────────
export async function pullCashCategories(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO cash_categories (
      category_id, tenant_id, name, type, sort_order, is_default, sync_status, created_at
    ) VALUES (
      @category_id, @tenant_id, @name, @type, @sort_order, @is_default, 'SYNCED', @created_at
    )
    ON CONFLICT(category_id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      sort_order = excluded.sort_order,
      is_default = excluded.is_default,
      sync_status = 'SYNCED'
    WHERE cash_categories.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'cash_categories',
    urlPath: '/api/sync/cash_categories',
    label: 'cash categories',
    onProgress: (fetched) => notifyPullProgress('cash categories', fetched),
    processPage: (rows) => {
      const tx = db.transaction((categories: any[]) => {
        for (const c of categories) {
          try {
            upsert.run({
              category_id: c.category_id,
              tenant_id: tenantId,
              name: c.name,
              type: c.type,
              sort_order: c.sort_order ?? 0,
              is_default: c.is_default ? 1 : 0,
              created_at: toSqliteDate(c.created_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling cash category:', e.message);
          }
        }
      });
      tx(rows);
      return reconcilePending(db, 'cash_categories', 'category_id', rows);
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} cash categories from cloud.${result.reconciled > 0 ? ` Reconciled ${result.reconciled}.` : ''}`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull cash categories failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Payment Sources Sync (Edge → Cloud) ─────────────────────────────────────────
export async function syncPaymentSources(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM payment_sources WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} payment sources to cloud...`);

  const updateStmt = db.prepare(`UPDATE payment_sources SET sync_status = 'SYNCED' WHERE source_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/payment_sources',
      token, batch, 'payment_sources', `Payment Sources batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Payment Source Transactions Sync (Edge → Cloud) ─────────────────────────────
export async function syncPaymentSourceTransactions(token: string, tenantId: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM payment_source_transactions WHERE sync_status = 'PENDING' AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)`).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} payment source transactions to cloud...`);

  const updateStmt = db.prepare(`UPDATE payment_source_transactions SET sync_status = 'SYNCED' WHERE transaction_id = ?`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const synced = await pushBatch(
      '/api/sync/payment_source_transactions',
      token, batch, 'payment_source_transactions', `Payment Source Transactions batch ${Math.floor(i / BATCH_SIZE) + 1}`,
    );
    if (synced.length > 0) {
      const tx = db.transaction((ids: string[]) => { for (const id of ids) updateStmt.run(id); });
      tx(synced);
    }
  }
}

// ── Pull Payment Sources (Cloud → Edge) ─────────────────────────────────────────
export async function pullPaymentSources(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO payment_sources (
      source_id, tenant_id, name, type, bank_name, account_number, holder_name, upi_id,
      opening_balance, current_balance, is_default, is_enabled, sort_order, is_deleted,
      sync_status, created_at, updated_at
    ) VALUES (
      @source_id, @tenant_id, @name, @type, @bank_name, @account_number, @holder_name, @upi_id,
      @opening_balance, @current_balance, @is_default, @is_enabled, @sort_order, @is_deleted,
      'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name, type = excluded.type,
      bank_name = excluded.bank_name, account_number = excluded.account_number,
      holder_name = excluded.holder_name, upi_id = excluded.upi_id,
      opening_balance = excluded.opening_balance, current_balance = excluded.current_balance,
      is_default = excluded.is_default, is_enabled = excluded.is_enabled,
      sort_order = excluded.sort_order, is_deleted = excluded.is_deleted,
      updated_at = excluded.updated_at, sync_status = 'SYNCED'
    WHERE payment_sources.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'payment_sources',
    urlPath: '/api/sync/payment_sources',
    label: 'payment sources',
    onProgress: (fetched) => notifyPullProgress('payment sources', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          try {
            upsert.run({
              source_id: r.source_id, tenant_id: tenantId, name: r.name, type: r.type,
              bank_name: r.bank_name || null, account_number: r.account_number || null,
              holder_name: r.holder_name || null, upi_id: r.upi_id || null,
              opening_balance: r.opening_balance ?? 0, current_balance: r.current_balance ?? 0,
              is_default: r.is_default ? 1 : 0, is_enabled: r.is_enabled === false ? 0 : 1,
              sort_order: r.sort_order ?? 0, is_deleted: r.is_deleted ? 1 : 0,
              created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling payment source:', e.message);
          }
        }
      });
      tx(rows);
      return rows.length;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} payment sources from cloud.`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull payment sources failed.');
  }
  return result.hasChanged && result.count > 0;
}

// ── Pull Payment Source Transactions (Cloud → Edge) ─────────────────────────────
export async function pullPaymentSourceTransactions(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO payment_source_transactions (
      transaction_id, tenant_id, source_id, type, amount, category, notes, reference_number,
      transaction_date, running_balance, entered_by, entered_by_name, sync_status, created_at, updated_at
    ) VALUES (
      @transaction_id, @tenant_id, @source_id, @type, @amount, @category, @notes, @reference_number,
      @transaction_date, @running_balance, @entered_by, @entered_by_name, 'SYNCED', @created_at, @updated_at
    )
    ON CONFLICT(transaction_id) DO UPDATE SET
      type = excluded.type, amount = excluded.amount, category = excluded.category,
      notes = excluded.notes, reference_number = excluded.reference_number,
      transaction_date = excluded.transaction_date, running_balance = excluded.running_balance,
      entered_by = excluded.entered_by, entered_by_name = excluded.entered_by_name,
      updated_at = excluded.updated_at, sync_status = 'SYNCED'
    WHERE payment_source_transactions.sync_status != 'PENDING'
  `);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'payment_source_transactions',
    urlPath: '/api/sync/payment_source_transactions',
    label: 'payment source transactions',
    onProgress: (fetched) => notifyPullProgress('payment source transactions', fetched),
    processPage: (rows) => {
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          try {
            upsert.run({
              transaction_id: r.transaction_id, tenant_id: tenantId, source_id: r.source_id,
              type: r.type, amount: r.amount ?? 0, category: r.category || null,
              notes: r.notes || null, reference_number: r.reference_number || null,
              transaction_date: toSqliteDate(r.transaction_date),
              running_balance: r.running_balance ?? 0,
              entered_by: r.entered_by || null, entered_by_name: r.entered_by_name || null,
              created_at: toSqliteDate(r.created_at), updated_at: toSqliteDate(r.updated_at),
            });
          } catch (e: any) {
            console.error('[SyncWorker] Error pulling payment source transaction:', e.message);
          }
        }
      });
      tx(rows);
      return rows.length;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} payment source transactions from cloud.`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull payment source transactions failed.');
  }
  return result.hasChanged && result.count > 0;
}
