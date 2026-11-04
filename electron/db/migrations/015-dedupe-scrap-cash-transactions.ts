import type { Migration } from './runner.js';

/**
 * Scrap purchase invoice checkouts previously deducted cash drawer both at the invoice level
 * ('Scrap Purchase', by cashier) and for each individual line item ('SCRAP_PURCHASE', by 'system').
 * Clean up duplicate per-item SCRAP_PURCHASE cash transactions that duplicate an invoice-level
 * 'Scrap Purchase' payout in the same drawer.
 */
export const m015DedupeScrapCashTransactions: Migration = {
  version: 15,
  name: 'dedupe-scrap-cash-transactions',
  up: db => {
    db.exec(`
      DELETE FROM cash_transactions
      WHERE category = 'SCRAP_PURCHASE'
        AND entered_by = 'system'
        AND notes LIKE 'Scrap purchase %'
        AND notes != 'Scrap purchase'
        AND EXISTS (
          SELECT 1 FROM cash_transactions ct2
          WHERE ct2.drawer_id = cash_transactions.drawer_id
            AND ct2.category = 'Scrap Purchase'
            AND ct2.notes = cash_transactions.notes
        );
    `);
  },
};
