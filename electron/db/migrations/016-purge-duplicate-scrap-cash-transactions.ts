import type { Migration } from './runner.js';

/**
 * Migration 16: Purge duplicate per-item SCRAP_PURCHASE cash transactions from any scrap invoice,
 * and immediately reconcile cash drawer balances.
 */
export const m016PurgeDuplicateScrapCashTransactions: Migration = {
  version: 16,
  name: 'purge-duplicate-scrap-cash-transactions',
  up: db => {
    // 1. Identify all drawers containing duplicate per-item scrap transactions
    const duplicateDrawers = db.prepare(`
      SELECT DISTINCT drawer_id FROM cash_transactions
      WHERE category = 'SCRAP_PURCHASE'
        AND (entered_by = 'system' OR entered_by IS NULL OR entered_by = '')
        AND notes LIKE 'Scrap purchase %'
        AND notes != 'Scrap purchase'
    `).all() as Array<{ drawer_id: string }>;

    // 2. Delete all per-item scrap transactions
    db.exec(`
      DELETE FROM cash_transactions
      WHERE category = 'SCRAP_PURCHASE'
        AND (entered_by = 'system' OR entered_by IS NULL OR entered_by = '')
        AND notes LIKE 'Scrap purchase %'
        AND notes != 'Scrap purchase';
    `);

    // 3. Immediately recompute cash_out and current_cash for every affected drawer
    const updateDrawer = db.prepare(`
      UPDATE cash_drawer
      SET cash_out = (
            SELECT COALESCE(SUM(amount), 0)
            FROM cash_transactions
            WHERE cash_transactions.drawer_id = cash_drawer.drawer_id
              AND cash_transactions.type = 'CASH_OUT'
          ),
          current_cash = COALESCE(opening_balance, 0) + COALESCE(cash_sales, 0) + (
            SELECT COALESCE(SUM(amount), 0)
            FROM cash_transactions
            WHERE cash_transactions.drawer_id = cash_drawer.drawer_id
              AND cash_transactions.type = 'CASH_IN'
          ) - (
            SELECT COALESCE(SUM(amount), 0)
            FROM cash_transactions
            WHERE cash_transactions.drawer_id = cash_drawer.drawer_id
              AND cash_transactions.type = 'CASH_OUT'
          ),
          expected_closing = COALESCE(opening_balance, 0) + COALESCE(cash_sales, 0) + (
            SELECT COALESCE(SUM(amount), 0)
            FROM cash_transactions
            WHERE cash_transactions.drawer_id = cash_drawer.drawer_id
              AND cash_transactions.type = 'CASH_IN'
          ) - (
            SELECT COALESCE(SUM(amount), 0)
            FROM cash_transactions
            WHERE cash_transactions.drawer_id = cash_drawer.drawer_id
              AND cash_transactions.type = 'CASH_OUT'
          )
      WHERE drawer_id = ?
    `);

    for (const d of duplicateDrawers) {
      updateDrawer.run(d.drawer_id);
    }
  },
};
