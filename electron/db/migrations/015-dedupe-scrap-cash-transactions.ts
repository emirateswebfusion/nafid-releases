import type { Migration } from './runner.js';

/**
 * Scrap purchase invoice checkouts previously deducted cash drawer both at the invoice level
 * ('Scrap Purchase', by cashier) and for each individual line item ('SCRAP_PURCHASE', by 'system').
 * Clean up duplicate per-item SCRAP_PURCHASE cash transactions that duplicate an invoice-level
 * 'Scrap Purchase' payout in the same drawer, and immediately reconcile the affected drawer balances.
 */
export const m015DedupeScrapCashTransactions: Migration = {
  version: 15,
  name: 'dedupe-scrap-cash-transactions',
  up: db => {
    // 1. Identify drawers that contain duplicate scrap purchase cash entries
    const duplicateDrawers = db.prepare(`
      SELECT DISTINCT drawer_id FROM cash_transactions
      WHERE (category = 'SCRAP_PURCHASE' OR category = 'Scrap Purchase')
        AND entered_by = 'system'
        AND notes LIKE 'Scrap purchase %'
        AND notes != 'Scrap purchase'
        AND EXISTS (
          SELECT 1 FROM cash_transactions ct2
          WHERE ct2.drawer_id = cash_transactions.drawer_id
            AND (ct2.category = 'Scrap Purchase' OR ct2.category = 'SCRAP_PURCHASE')
            AND ct2.entered_by != 'system'
            AND TRIM(ct2.notes) = TRIM(cash_transactions.notes)
        )
    `).all() as Array<{ drawer_id: string }>;

    // 2. Delete the per-item system duplicate transactions
    db.exec(`
      DELETE FROM cash_transactions
      WHERE (category = 'SCRAP_PURCHASE' OR category = 'Scrap Purchase')
        AND entered_by = 'system'
        AND notes LIKE 'Scrap purchase %'
        AND notes != 'Scrap purchase'
        AND EXISTS (
          SELECT 1 FROM cash_transactions ct2
          WHERE ct2.drawer_id = cash_transactions.drawer_id
            AND (ct2.category = 'Scrap Purchase' OR ct2.category = 'SCRAP_PURCHASE')
            AND ct2.entered_by != 'system'
            AND TRIM(ct2.notes) = TRIM(cash_transactions.notes)
        );
    `);

    // 3. Recalculate cash_out and balances for all affected drawers immediately
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
