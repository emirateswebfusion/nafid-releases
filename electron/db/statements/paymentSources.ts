import type { Db } from './types.js';
import { invoiceOwnedEntry } from './partyLedger.js';

/** Invoice-owned collections already post through checkout; manual repayments post through the ledger. */
export const findManualLedgerPayment = (db: Db) => db.prepare(`
  SELECT pl.* FROM party_ledger pl WHERE pl.ledger_id = ? AND pl.party_id = ?
    AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.tenant_id = pl.tenant_id AND ${invoiceOwnedEntry('i.invoice_number')})
`);

export const sumDocumentAccountPostings = (db: Db) => db.prepare(`
  SELECT source_id, ROUND(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE -amount END), 2) AS net
  FROM payment_source_transactions WHERE tenant_id = ? AND category = ? AND reference_number = ?
  GROUP BY source_id
`);

export const findEnabledLedgerAccount = (db: Db) => db.prepare(`
  SELECT * FROM payment_sources WHERE tenant_id = ? AND type = ? AND is_enabled = 1 AND is_deleted = 0
  ORDER BY is_default DESC, sort_order ASC, source_id ASC LIMIT 1
`);

/** SQL statements used by services/paymentSourcesService.ts. Each factory prepares its statement on the given connection. */

export const findPaymentSourceTransactionsBySourceId = (db: Db) => db.prepare(`
      SELECT ps.*,
        (SELECT COUNT(*) FROM payment_source_transactions pst WHERE pst.source_id = ps.source_id) AS transaction_count,
        (SELECT MAX(pst.transaction_date) FROM payment_source_transactions pst WHERE pst.source_id = ps.source_id) AS last_transaction_date
      FROM payment_sources ps
      WHERE ps.tenant_id = ? AND ps.is_deleted = 0
      ORDER BY ps.type ASC, ps.sort_order ASC, ps.name COLLATE NOCASE ASC
    `);

export const updatePaymentSourceIsDefault = (db: Db) => db.prepare(`UPDATE payment_sources SET is_default = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND type = ? AND is_deleted = 0`);

export const insertPaymentSource = (db: Db) => db.prepare(`
        INSERT INTO payment_sources (source_id, tenant_id, name, type, bank_name, account_number, holder_name, upi_id, opening_balance, current_balance, is_default, is_enabled, sort_order, is_deleted, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

export const insertPaymentSourceTransaction = (db: Db) => db.prepare(`
          INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, notes, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
          VALUES (?, ?, ?, 'CASH_IN', ?, 'Opening Balance', ?, CURRENT_TIMESTAMP, ?, ?, ?, 'PENDING')
        `);

export const findPaymentSourcesBySourceId = (db: Db) => db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND tenant_id = ? AND is_deleted = 0`);

export const countPaymentSourceTransactionsBySourceId = (db: Db) => db.prepare(`SELECT COUNT(*) as cnt FROM payment_source_transactions WHERE source_id = ?`);

export const updatePaymentSourceBySourceId = (db: Db) => db.prepare(`
        UPDATE payment_sources SET
          name = COALESCE(?, name),
          bank_name = ?, account_number = ?, holder_name = ?, upi_id = ?,
          is_enabled = COALESCE(?, is_enabled),
          is_default = COALESCE(?, is_default),
          sort_order = COALESCE(?, sort_order),
          opening_balance = COALESCE(?, opening_balance),
          current_balance = COALESCE(?, current_balance),
          sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE source_id = ? AND tenant_id = ?
      `);

export const updatePaymentSourceTransactionAmountAndRunningBalance = (db: Db) => db.prepare(`UPDATE payment_source_transactions SET amount = ?, running_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND category = 'Opening Balance' AND tenant_id = ?`);

export const updatePaymentSourceIsDeleted = (db: Db) => db.prepare(`UPDATE payment_sources SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`);

export const findPaymentSourceTransactionsBySourceId2 = (db: Db) => db.prepare(`
      SELECT * FROM payment_source_transactions
      WHERE source_id = ? AND tenant_id = ?
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 500
    `);

export const insertPaymentSourceTransaction2 = (db: Db) => db.prepare(`
        INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, notes, reference_number, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, 'PENDING')
      `);

export const updatePaymentSourceCurrentBalance = (db: Db) => db.prepare(`UPDATE payment_sources SET current_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND tenant_id = ?`);
