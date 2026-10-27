import type { Db } from './types.js';
import { counterSalePredicate } from './revenue.js';

/** SQL statements used by services/cashDrawerService.ts. Each factory prepares its statement on the given connection. */

export const findCashDrawerByBusinessDate = (db: Db) => db.prepare(`
    SELECT * FROM cash_drawer 
    WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
      AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?)
    ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, (CASE WHEN opening_balance > 0 THEN 1 ELSE 0 END) DESC, current_cash DESC, created_at DESC
  `);

export const findCashDrawerByStatus = (db: Db) => db.prepare(`
      SELECT * FROM cash_drawer 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) 
        AND status = 'OPEN' 
      ORDER BY business_date DESC, created_at DESC
    `);

export const updateCashTransactionDrawerId = (db: Db) => db.prepare(`UPDATE cash_transactions SET drawer_id = ? WHERE drawer_id = ?`);

export const updateCashierAuditLogDrawerId = (db: Db) => db.prepare(`UPDATE cashier_audit_log SET drawer_id = ? WHERE drawer_id = ?`);

export const updateCashDrawerStatusAndClosingRemarks = (db: Db) => db.prepare(`UPDATE cash_drawer SET status = 'CLOSED', closing_remarks = 'Merged duplicate drawer' WHERE drawer_id = ?`);

/** Cash taken by an invoice (cash bills, the cash part of split / credit bills), summed as `total_cash_sales`. */
const CASH_SALES_SELECT = `
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
            WHEN UPPER(payment_method) IN ('SPLIT', 'CREDIT') AND split_details IS NOT NULL THEN (
              CASE 
                WHEN json_extract(split_details, '$.cash') IS NOT NULL 
                THEN MIN(
                  CAST(json_extract(split_details, '$.cash') AS REAL),
                  MAX(0, COALESCE(grand_total, 0))
                )
                WHEN UPPER(payment_method) = 'CREDIT' AND received_amount > 0
                THEN MIN(
                  received_amount,
                  MAX(0, COALESCE(grand_total, 0))
                )
                ELSE 0 
              END
            )
            WHEN UPPER(payment_method) = 'CREDIT' AND received_amount > 0 THEN (
              MIN(received_amount, MAX(0, COALESCE(grand_total, 0)))
            )
            ELSE 0 
          END
        ), 0) AS total_cash_sales
`;

/** Invoices that can carry drawer cash (no holds, not deleted); the tenant is the first parameter. */
const CASH_SALES_FROM = `
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND (
          UPPER(payment_method) IN ('CASH', 'SPLIT')
          OR (UPPER(payment_method) = 'CREDIT' AND (received_amount > 0 OR (split_details IS NOT NULL AND CAST(json_extract(split_details, '$.cash') AS REAL) > 0)))
        )
        AND ${counterSalePredicate()}
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = '0' OR is_deleted = 0.0)
`;

/** Cash sales of a drawer session: settled (else created) after `from` and, when `to` is not NULL, up to `to` (UTC).
 * Params: tenant, from, to, to. */
export const sumCashSalesInWindow = (db: Db) => db.prepare(`${CASH_SALES_SELECT}${CASH_SALES_FROM}
        AND datetime(COALESCE(settled_at, created_at)) > datetime(?)
        AND (? IS NULL OR datetime(COALESCE(settled_at, created_at)) <= datetime(?))
    `);

/** Latest close of another drawer with an earlier business date. Params: tenant, drawer_id, business date. */
export const findPreviousDrawerClosedAt = (db: Db) => db.prepare(`
      SELECT MAX(closed_at) AS closed_at FROM cash_drawer
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND drawer_id != ? AND status = 'CLOSED' AND closed_at IS NOT NULL AND substr(business_date, 1, 10) < ?
    `);

/** Open drawers with a business date before the given one. Params: tenant, business date. */
export const findOpenDrawersBefore = (db: Db) => db.prepare(`
      SELECT * FROM cash_drawer
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND status = 'OPEN' AND substr(business_date, 1, 10) < ?
      ORDER BY business_date ASC
    `);

/** A drawer setting (tenant row first, then global). Params: tenant, key, tenant. */
export const findDrawerSetting = (db: Db) => db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = ? ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1");

/** Terminal-local drawer state (session cut-over, auto-close snooze): `LOCAL` settings are never pushed. */
export const upsertLocalDrawerSetting = (db: Db) => db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (?, ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET value = EXCLUDED.value, sync_status = 'LOCAL', updated_at = CURRENT_TIMESTAMP
    `);

/** Auto close: counted cash = expected, no variance.
 * Params: cash_sales, cash_in, cash_out, current_cash, expected_closing, actual_cash, closed_at, remarks, closed_by, drawer_id. */
export const closeDrawerAutomatically = (db: Db) => db.prepare(`
      UPDATE cash_drawer SET
        status = 'CLOSED',
        cash_sales = ?, cash_in = ?, cash_out = ?,
        current_cash = ?, expected_closing = ?,
        actual_cash = ?, cash_short = 0, cash_excess = 0,
        closed_at = ?, closing_remarks = ?, closed_by = ?,
        sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE drawer_id = ? AND status = 'OPEN'
    `);

export const updateCashDrawerByDrawerId = (db: Db) => db.prepare(`
        UPDATE cash_drawer 
        SET cash_sales = ?, cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, cash_short = ?, cash_excess = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE drawer_id = ?
      `);

export const updateCashDrawerByDrawerId2 = (db: Db) => db.prepare(`
        UPDATE cash_drawer 
        SET cash_sales = ?, cash_in = ?, cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
        WHERE drawer_id = ?
      `);

export const findOneSettingByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'auto_open_cash_drawer' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1");

export const findOneSettingByKeyDefaultOpeningBalance = (db: Db) => db.prepare("SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'default_opening_balance' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) DESC LIMIT 1");

export const insertCashDrawer = (db: Db) => db.prepare(`
        INSERT INTO cash_drawer (drawer_id, tenant_id, business_date, opening_balance, cash_sales, cash_in, cash_out, current_cash, expected_closing, status, opened_at, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, 'OPEN', CURRENT_TIMESTAMP, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

export const findCashDrawerByDrawerId = (db: Db) => db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`);

export const findPaymentSourcesBySourceId = (db: Db) => db.prepare(`SELECT * FROM payment_sources WHERE source_id = ? AND (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND is_deleted = 0`);

export const findOnePaymentSourceByTypeAndIsEnabled = (db: Db) => db.prepare(`SELECT * FROM payment_sources WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND type = ? AND is_deleted = 0 AND is_enabled = 1 ORDER BY is_default DESC, sort_order ASC LIMIT 1`);

export const insertPaymentSourceTransaction = (db: Db) => db.prepare(`
          INSERT INTO payment_source_transactions (transaction_id, tenant_id, source_id, type, amount, category, reference_number, notes, transaction_date, running_balance, entered_by, entered_by_name, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'PENDING')
        `);

export const updatePaymentSourceCurrentBalance = (db: Db) => db.prepare(`UPDATE payment_sources SET current_balance = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE source_id = ?`);

/** Cash entries with current ledger values; ledger ids are stored in the existing category field. */
export const listRegisterCashTransactions = (db: Db) => db.prepare(`
  SELECT t.*, l.ledger_id, l.transaction_date AS ledger_date,
    l.credit_amount, l.debit_amount, l.payment_method AS ledger_method, l.is_deleted AS ledger_deleted
  FROM cash_transactions t
  LEFT JOIN party_ledger l ON t.category = 'PARTY_LEDGER:' || l.ledger_id
  WHERE (t.tenant_id = ? OR t.tenant_id IN ('global', 'unset') OR t.tenant_id IS NULL)
    AND (t.drawer_id = ? OR ((t.drawer_id IS NULL OR t.drawer_id NOT IN (SELECT drawer_id FROM cash_drawer))
      AND datetime(t.transaction_date) > datetime(?) AND (? IS NULL OR datetime(t.transaction_date) <= datetime(?))))
`);

/** Returns are the source of truth, including refunds made before opening the drawer. */
export const listRegisterCashReturns = (db: Db) => db.prepare(`
  SELECT return_id, return_number, tenant_id, grand_total, created_at, user_id FROM returns
  WHERE (tenant_id = ? OR tenant_id IN ('global', 'unset') OR tenant_id IS NULL)
    AND UPPER(refund_method) = 'CASH' AND datetime(created_at) > datetime(?)
    AND (? IS NULL OR datetime(created_at) <= datetime(?))
`);

/** Settled non-held invoices in the same session as the drawer. */
export const listRegisterInvoices = (db: Db) => db.prepare(`
  SELECT payment_method, grand_total, received_amount, split_details FROM invoices
  WHERE (tenant_id = ? OR tenant_id IN ('global', 'unset') OR tenant_id IS NULL)
    AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
    AND COALESCE(is_held, 0) = 0 AND COALESCE(is_deleted, 0) = 0
    AND datetime(COALESCE(settled_at, created_at)) > datetime(?)
    AND (? IS NULL OR datetime(COALESCE(settled_at, created_at)) <= datetime(?))
`);

/** One source-linked cash entry per manual ledger row, even when a drawer has not been opened yet. */
export const insertLinkedLedgerCashEntry = (db: Db) => db.prepare(`
  INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes,
    entered_by, entered_by_name, transaction_date, sync_status)
  SELECT ?, l.tenant_id,
    (SELECT drawer_id FROM cash_drawer WHERE tenant_id = l.tenant_id AND status = 'OPEN' ORDER BY business_date DESC LIMIT 1),
    CASE WHEN l.credit_amount > l.debit_amount THEN 'CASH_OUT' ELSE 'CASH_IN' END,
    ABS(l.credit_amount - l.debit_amount), 'PARTY_LEDGER:' || l.ledger_id, l.description,
    l.created_by, l.created_by_name, CURRENT_TIMESTAMP, 'PENDING'
  FROM party_ledger l WHERE l.tenant_id = ? AND l.ledger_id = ? AND UPPER(l.payment_method) = 'CASH'
    AND COALESCE(l.is_deleted, 0) = 0 AND ABS(l.credit_amount - l.debit_amount) > 0
  ON CONFLICT(transaction_id) DO NOTHING
`);
