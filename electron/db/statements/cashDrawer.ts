import type { Db } from './types.js';

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

export const findInvoices = (db: Db) => db.prepare(`
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
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
        AND (
          UPPER(payment_method) IN ('CASH', 'SPLIT')
          OR (UPPER(payment_method) = 'CREDIT' AND (received_amount > 0 OR (split_details IS NOT NULL AND CAST(json_extract(split_details, '$.cash') AS REAL) > 0)))
        )
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
    `);

export const findCashTransactionsByDrawerIdAndBusinessDate = (db: Db) => db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN type = 'CASH_OUT' THEN amount ELSE 0 END), 0) AS total_out
      FROM cash_transactions 
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (
        drawer_id = ? 
        OR drawer_id IN (SELECT drawer_id FROM cash_drawer WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ? OR substr(business_date, 1, 10) = ?))
        OR date(transaction_date) = ? OR transaction_date LIKE ? OR substr(transaction_date, 1, 10) = ? OR substr(transaction_date, 1, 10) = ?
      )
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

export const findCashDrawerByStatusOpen = (db: Db) => db.prepare(`
      SELECT * FROM cash_drawer
      WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL) AND status = 'OPEN'
    `);

export const updateCashDrawerByDrawerIdClosed = (db: Db) => db.prepare(`
            UPDATE cash_drawer SET
              status = 'CLOSED',
              actual_cash = COALESCE(actual_cash, ?),
              cash_short = 0,
              cash_excess = 0,
              closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
              closing_remarks = COALESCE(closing_remarks, 'Auto-closed past shift on date transition'),
              sync_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
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
