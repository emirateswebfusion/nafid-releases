import { BrowserWindow } from 'electron';
import { getDb } from '../../db/localDb.js';
import { BATCH_SIZE, parseCleanDate, toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress, notifyRenderer } from '../syncProgress.js';
import { pullPaginated, pushBatch, reconcilePending } from '../syncTransport.js';
import { computeDrawerTotals } from '../../services/cashDrawerService.js';
import * as cashSyncSql from '../../db/statements/sync/cashSync.js';

/** Cash sync: cash drawer (with reconciliation), cash transactions, categories, cashier audit log and payment sources (push and pull). */
// ── Cash Drawer Sync (Edge → Cloud) ─────────────────────────────────────────────
export async function syncCashDrawer(token: string, tenantId: string) {
  const db = getDb();
  const pending = cashSyncSql.selectCashDrawer(db).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash drawer records to cloud...`);

  const updateStmt = cashSyncSql.updateCashDrawer(db);

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
  const pending = cashSyncSql.selectCashTransactions(db).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash transactions to cloud...`);

  const updateStmt = cashSyncSql.updateCashTransactions(db);

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
  const pending = cashSyncSql.selectCashCategories(db).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cash categories to cloud...`);

  const updateStmt = cashSyncSql.updateCashCategories(db);

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
  const pending = cashSyncSql.selectCashierAuditLog(db).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} cashier audit log records to cloud...`);

  const updateStmt = cashSyncSql.updateCashierAuditLog(db);

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

/** After a pull: refresh an open drawer's totals with the canonical session maths (computeDrawerTotals). Written only
 * when they changed, and without marking the drawer for upload. */
export function reconcileCashDrawerSync(db: any, tenantId: string, drawer: any) {
  if (!drawer || !tenantId) return;
  try {
    const t = computeDrawerTotals(db, tenantId, drawer);
    const same = (a: unknown, b: number) => Math.abs((Number(a) || 0) - b) <= 0.001;
    if (same(drawer.cash_sales, t.cash_sales) && same(drawer.cash_in, t.cash_in) && same(drawer.cash_out, t.cash_out)
      && same(drawer.current_cash, t.expected) && same(drawer.expected_closing, t.expected)) return;
    cashSyncSql.updateCashDrawer2(db).run(t.cash_sales, t.cash_in, t.cash_out, t.expected, t.expected, drawer.drawer_id);
  } catch (e: any) {
    console.error('[SyncWorker] reconcileCashDrawerSync error:', e.message);
  }
}

// ── Pull Cash Drawer (Cloud → Edge) ─────────────────────────────────────────────
export async function pullCashDrawer(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const selectExisting = cashSyncSql.selectCashDrawer2(db);
  const updateTxDrawerId = cashSyncSql.updateCashTransactions2(db);
  const updateAuditDrawerId = cashSyncSql.updateCashierAuditLog2(db);
  const updateMatchedDrawer = cashSyncSql.updateCashDrawer3(db);
  const insertDrawer = cashSyncSql.insertCashDrawer(db);

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
        const openDrawers = cashSyncSql.selectCashDrawer3(db).all(tenantId) as any[];
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

  const upsert = cashSyncSql.insertCashTransactions(db);

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
            const localDrawer = cashSyncSql.selectCashDrawer4(db).get(t.drawer_id, tenantId, txDate, txDate, `${txDate}%`) as any;
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

  const upsert = cashSyncSql.insertCashierAuditLog(db);

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

  const upsert = cashSyncSql.insertCashCategories(db);

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
  const pending = cashSyncSql.selectPaymentSources(db).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} payment sources to cloud...`);

  const updateStmt = cashSyncSql.updatePaymentSources(db);

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
  const pending = cashSyncSql.selectPaymentSourceTransactions(db).all(tenantId) as any[];

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} payment source transactions to cloud...`);

  const updateStmt = cashSyncSql.updatePaymentSourceTransactions(db);

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

  const upsert = cashSyncSql.insertPaymentSources(db);

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

  const upsert = cashSyncSql.insertPaymentSourceTransactions(db);

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
