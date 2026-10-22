import type { Db } from './types.js';

/** SQL statements used by whatsapp/shopClosingReportService.ts. Each factory prepares its statement on the given connection. */

export const findOneSettingByKey = (db: Db) => db.prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'shop_closing_whatsapp_config' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 2 END) ASC, updated_at DESC LIMIT 1`);

export const upsertSetting = (db: Db) => db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (?, 'shop_closing_whatsapp_config', ?, 'PENDING', CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = EXCLUDED.value,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    `);

export const findOneSettingByKeyShopName = (db: Db) => db.prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'shop_name' ORDER BY (CASE WHEN tenant_id = ? THEN 1 ELSE 2 END) ASC LIMIT 1`);

export const findOneSettingByKeyTerminalCode = (db: Db) => db.prepare(`SELECT value FROM settings WHERE (tenant_id = ? OR tenant_id = 'global') AND key = 'terminal_code' LIMIT 1`);

export const findOneCashDrawerByBusinessDate = (db: Db) => db.prepare(`
          SELECT * FROM cash_drawer
          WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
            AND (business_date = ? OR business_date = ? OR date(business_date) = ? OR business_date LIKE ? OR substr(business_date, 1, 10) = ?)
          ORDER BY (CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) DESC, created_at DESC LIMIT 1
        `);

export const findUsersByUserId = (db: Db) => db.prepare(`SELECT name, role FROM users WHERE user_id = ?`);

export const findInvoicesByConvertedFrom_ = (db: Db) => db.prepare(`
        SELECT i.*, u.name AS staff_user_name
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.user_id
        WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL)
          AND i.payment_method NOT IN ('PENDING', 'HOLD_DRAFT')
          AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
          AND (i.is_held IS NULL OR i.is_held = 0)
          AND (i.is_deleted IS NULL OR i.is_deleted = 0)
          AND (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '')
          AND (
            date(COALESCE(i.settled_at, i.created_at)) = ?
            OR date(COALESCE(i.settled_at, i.created_at)) = ?
            OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = ?
            OR substr(COALESCE(i.settled_at, i.created_at), 1, 10) = ?
            OR COALESCE(i.settled_at, i.created_at) LIKE ?
          )
        ORDER BY COALESCE(i.settled_at, i.created_at) ASC
      `);

export const findCashTransactions = (db: Db) => db.prepare(`
        SELECT type, amount, category, notes, transaction_date
        FROM cash_transactions
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
          AND (
            date(transaction_date) = ?
            OR date(transaction_date) = ?
            OR substr(transaction_date, 1, 10) = ?
            OR substr(transaction_date, 1, 10) = ?
            OR transaction_date LIKE ?
          )
        ORDER BY transaction_date ASC
      `);

export const findPartyLedger = (db: Db) => db.prepare(`
        SELECT pl.party_id, pl.credit_amount, pl.debit_amount, pl.description, pl.transaction_date,
               p.name AS party_name
        FROM party_ledger pl
        LEFT JOIN parties p ON pl.party_id = p.party_id
        WHERE (pl.tenant_id = ? OR pl.tenant_id = 'global' OR pl.tenant_id IS NULL)
          AND (
            date(pl.transaction_date) = ?
            OR date(pl.transaction_date) = ?
            OR substr(pl.transaction_date, 1, 10) = ?
            OR substr(pl.transaction_date, 1, 10) = ?
            OR pl.transaction_date LIKE ?
          )
          AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)
          AND (pl.description NOT LIKE '%Opening Balance%' OR pl.description IS NULL)
          AND (pl.description NOT LIKE 'Credit Sale%' OR pl.description IS NULL)
          AND (pl.description NOT LIKE 'Cash Sale%' OR pl.description IS NULL)
          AND (pl.description NOT LIKE 'Payment received (%) for %' OR pl.description IS NULL)
        ORDER BY pl.transaction_date ASC
      `);

export const findStaffTransactions = (db: Db) => db.prepare(`
        SELECT st.staff_id, st.type, st.amount, st.notes, st.transaction_date,
               s.name AS staff_name
        FROM staff_transactions st
        LEFT JOIN staff s ON st.staff_id = s.staff_id
        WHERE (st.tenant_id = ? OR st.tenant_id = 'global' OR st.tenant_id IS NULL)
          AND (
            date(st.transaction_date) = ?
            OR date(st.transaction_date) = ?
            OR substr(st.transaction_date, 1, 10) = ?
            OR substr(st.transaction_date, 1, 10) = ?
            OR st.transaction_date LIKE ?
          )
        ORDER BY st.transaction_date ASC
      `);

export const findScrapTransactions = (db: Db) => db.prepare(`
        SELECT st.quantity, st.rate, st.total_amount, st.party_name, st.type,
               sc.name AS category_name, sc.unit
        FROM scrap_transactions st
        LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id
        WHERE (st.tenant_id = ? OR st.tenant_id = 'global' OR st.tenant_id IS NULL)
          AND (st.is_deleted IS NULL OR st.is_deleted = 0)
          AND (
            date(st.transaction_date) = ?
            OR date(st.transaction_date) = ?
            OR substr(st.transaction_date, 1, 10) = ?
            OR substr(st.transaction_date, 1, 10) = ?
            OR st.transaction_date LIKE ?
          )
        ORDER BY st.transaction_date ASC
      `);

export const countInvoicesByConvertedFrom_ = (db: Db) => db.prepare(`
        SELECT COUNT(*) AS inv_scrap_count, COALESCE(SUM(scrap_deduction), 0) AS total_inv_scrap
        FROM invoices
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
          AND scrap_deduction > 0
          AND (is_deleted IS NULL OR is_deleted = 0)
          AND (converted_from_invoice_id IS NULL OR converted_from_invoice_id = '')
          AND (
            date(COALESCE(settled_at, created_at)) = ?
            OR date(COALESCE(settled_at, created_at)) = ?
            OR substr(COALESCE(settled_at, created_at), 1, 10) = ?
            OR substr(COALESCE(settled_at, created_at), 1, 10) = ?
            OR COALESCE(settled_at, created_at) LIKE ?
          )
      `);

export const countReturns = (db: Db) => db.prepare(`
        SELECT COUNT(*) AS ret_count, COALESCE(SUM(grand_total), 0) AS ret_total
        FROM returns
        WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id IS NULL)
          AND (
            date(return_date) = ?
            OR date(return_date) = ?
            OR substr(return_date, 1, 10) = ?
            OR substr(return_date, 1, 10) = ?
            OR return_date LIKE ?
          )
      `);

export const pragmaTableInfo = (db: Db) => db.prepare(`PRAGMA table_info(purchase_bills)`);

export const findOneShopClosingReportByBusinessDateAndTriggerType = (db: Db) => db.prepare(`
          SELECT id, status, created_at FROM shop_closing_reports
          WHERE (tenant_id = ? OR tenant_id = 'global')
            AND business_date = ?
            AND trigger_type = ?
            AND status = 'SENT'
          ORDER BY created_at DESC LIMIT 1
        `);

export const insertShopClosingReport = (db: Db) => db.prepare(`
      INSERT INTO shop_closing_reports (
        id, tenant_id, business_date, trigger_type, terminal_code, recipient_phone,
        summary_data, checklist_config, message_text, status, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)
    `);

export const updateShopClosingReportById = (db: Db) => db.prepare(`
          UPDATE shop_closing_reports
          SET status = 'SENT', whatsapp_message_id = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

export const updateShopClosingReportStatusAndErrorMessage = (db: Db) => db.prepare(`
          UPDATE shop_closing_reports
          SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

export const findShopClosingReportsById = (db: Db) => db.prepare(`SELECT * FROM shop_closing_reports WHERE id = ?`);

export const updateShopClosingReportByIdSent = (db: Db) => db.prepare(`
        UPDATE shop_closing_reports
        SET status = 'SENT', whatsapp_message_id = ?, error_message = NULL, sent_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

export const updateShopClosingReportByIdFailed = (db: Db) => db.prepare(`
        UPDATE shop_closing_reports
        SET status = 'FAILED', error_message = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

export const findShopClosingReports = (db: Db) => db.prepare(`
        SELECT * FROM shop_closing_reports
        WHERE tenant_id = ? OR tenant_id = 'global'
        ORDER BY created_at DESC LIMIT ?
      `);

export const findOneShopClosingReportByBusinessDateAndTriggerTypeSent = (db: Db) => db.prepare(`
            SELECT id FROM shop_closing_reports
            WHERE (tenant_id = ? OR tenant_id = 'global')
              AND business_date = ?
              AND trigger_type = 'SCHEDULED'
              AND status = 'SENT'
            LIMIT 1
          `);
