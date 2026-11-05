import type { Db } from './types.js';

/** SQL statements used by services/scrapService.ts. Each factory prepares its statement on the given connection. */

export const findScrapCategories = (db: Db) => db.prepare('SELECT * FROM scrap_categories WHERE tenant_id = ? AND is_deleted = 0 ORDER BY name COLLATE NOCASE ASC');

export const insertScrapCategory = (db: Db) => db.prepare(`
      INSERT INTO scrap_categories (scrap_category_id, tenant_id, name, purchase_price, selling_price, current_stock, unit, is_deleted, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `);

export const updateScrapCategoryByScrapCategoryId = (db: Db) => db.prepare(`
      UPDATE scrap_categories SET name = ?, purchase_price = ?, selling_price = ?, current_stock = ?, unit = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE scrap_category_id = ?
    `);

export const updateScrapCategoryIsDeleted = (db: Db) => db.prepare(`UPDATE scrap_categories SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`);

export const findScrapCategories2 = (db: Db) => db.prepare(`
      SELECT scrap_category_id, COUNT(*) as cnt, MIN(rowid) as keep_rowid
      FROM scrap_categories
      GROUP BY scrap_category_id
      HAVING COUNT(*) > 1
    `);

export const deleteScrapCategoryByScrapCategoryId = (db: Db) => db.prepare(`DELETE FROM scrap_categories WHERE scrap_category_id = ? AND rowid != ?`);

export const insertScrapTransaction = (db: Db) => db.prepare(`
        INSERT INTO scrap_transactions (transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
      `);

export const updateScrapCategoryCurrentStock = (db: Db) => db.prepare(`UPDATE scrap_categories SET current_stock = current_stock + ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE scrap_category_id = ?`);

export const insertCashTransaction = (db: Db) => db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'SCRAP_PURCHASE', ?, 'system', 'PENDING')
          `);


export const insertCashTransaction2 = (db: Db) => db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_IN', ?, 'SCRAP_SALE', ?, 'system', 'PENDING')
          `);


export const findScrapCategories3 = (db: Db) => db.prepare(`
      SELECT * FROM scrap_categories 
      WHERE tenant_id = ? AND is_deleted = 0 AND (name LIKE ? OR REPLACE(name, ' ', '') LIKE ? OR CLEAN_STR(name) LIKE ?)
      ORDER BY name COLLATE NOCASE ASC
      LIMIT 10
    `);

export const findSettingsByKey = (db: Db) => db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?');

export const findOneScrapTransactionByScrapInvoiceNumber = (db: Db) => db.prepare('SELECT 1 FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1');

export const upsertSetting = (db: Db) => db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `);

export const findScrapTransactionsByScrapInvoiceNumber = (db: Db) => db.prepare(`
      SELECT st.*, sc.name as scrap_category_name, sc.unit
      FROM scrap_transactions st
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id
      WHERE st.tenant_id = ? AND st.scrap_invoice_number = ? AND (st.is_deleted IS NULL OR st.is_deleted = 0)
      ORDER BY st.created_at DESC
    `);

export const findScrapTransactionsByScrap_AndType = (db: Db) => db.prepare(`
      SELECT 
        st.scrap_invoice_number as invoice_number,
        COUNT(st.transaction_id) as item_count,
        SUM(st.quantity) as total_qty,
        GROUP_CONCAT(DISTINCT sc.unit) as units,
        SUM(st.total_amount) as total_amount,
        MAX(st.payment_status) as payment_status,
        MIN(st.created_at) as created_at,
        MAX(st.created_at) as updated_at,
        MAX(st.party_name) as party_name,
        MAX(st.customer_phone) as customer_phone,
        MAX(st.customer_address) as customer_address
      FROM scrap_transactions st
      LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id
      WHERE st.tenant_id = ? AND st.scrap_invoice_number IS NOT NULL AND st.type = 'PURCHASE' AND (st.is_deleted IS NULL OR st.is_deleted = 0)
      GROUP BY st.scrap_invoice_number
      ORDER BY created_at DESC
      LIMIT 500
    `);

export const updateScrapTransactionPaymentStatus = (db: Db) => db.prepare(`
      UPDATE scrap_transactions SET payment_status = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND scrap_invoice_number = ?
    `);

export const updateScrapTransactionByScrapInvoiceNumber = (db: Db) => db.prepare(`
      UPDATE scrap_transactions 
      SET party_name = ?, customer_phone = ?, customer_address = ?, payment_status = COALESCE(?, payment_status), sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND scrap_invoice_number = ?
    `);

export const findScrapTransactionsByScrapInvoiceNumber2 = (db: Db) => db.prepare('SELECT * FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const updateScrapTransactionIsDeleted = (db: Db) => db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND scrap_invoice_number = ?`);

export const insertScrapTransaction2 = (db: Db) => db.prepare(`
        INSERT INTO scrap_transactions (
          transaction_id, tenant_id, type, scrap_category_id, quantity, rate, total_amount, party_name, customer_phone, customer_address, notes, scrap_invoice_number, payment_status, created_at, updated_at
        ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

export const findScrapTransactionsByTransactionId = (db: Db) => db.prepare('SELECT * FROM scrap_transactions WHERE transaction_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const updateScrapTransactionByTransactionId = (db: Db) => db.prepare(`
        UPDATE scrap_transactions 
        SET scrap_category_id = ?, quantity = ?, rate = ?, total_amount = ?, party_name = ?, notes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE transaction_id = ? AND tenant_id = ?
      `);

export const findScrapTransactionsByTransactionId2 = (db: Db) => db.prepare('SELECT * FROM scrap_transactions WHERE transaction_id = ? AND tenant_id = ?');

export const updateScrapTransactionIsDeletedAlt = (db: Db) => db.prepare(`UPDATE scrap_transactions SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE transaction_id = ? AND tenant_id = ?`);

export const findPartyLedgerByReferenceNumber = (db: Db) => db.prepare('SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ?');

export const updatePartyLedgerIsDeleted = (db: Db) => db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?");

export const findOnePartyLedgerByReferenceNumber = (db: Db) => db.prepare('SELECT * FROM party_ledger WHERE tenant_id = ? AND reference_number = ? LIMIT 1');

export const findScrapTransactionsByScrapInvoiceNumberCOALESCESUMtotalAmountAndTotal = (db: Db) => db.prepare(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM scrap_transactions WHERE tenant_id = ? AND scrap_invoice_number = ? AND (is_deleted IS NULL OR is_deleted = 0)`);

export const findPartiesByPhone = (db: Db) => db.prepare('SELECT * FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const findPartiesByName = (db: Db) => db.prepare("SELECT * FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)");

export const insertParty = (db: Db) => db.prepare(`
          INSERT INTO parties (party_id, tenant_id, name, phone, address, gstin, balance, gst_balance, estimate_balance, balance_type, notes, pricing_tier_id, credit_limit, is_deleted, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 'RECEIVABLE', NULL, NULL, 0, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

export const findPartiesByPartyId = (db: Db) => db.prepare('SELECT balance FROM parties WHERE party_id = ?');

export const updatePartyLedgerByLedgerId = (db: Db) => db.prepare(`
          UPDATE party_ledger SET
            debit_amount = ?, credit_amount = 0, description = ?, transaction_date = CURRENT_TIMESTAMP,
            payment_method = 'CREDIT', created_by = ?, created_by_name = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE ledger_id = ?
        `);

export const findPartyLedgerByPartyId = (db: Db) => db.prepare(`
          SELECT ledger_id, credit_amount, debit_amount FROM party_ledger
          WHERE party_id = ? ORDER BY transaction_date ASC, created_at ASC
        `);

export const updatePartyLedgerRunningBalance = (db: Db) => db.prepare(`UPDATE party_ledger SET running_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?`);

export const insertPartyLedger = (db: Db) => db.prepare(`
          INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 0, ?, ?, 'GST', 'CREDIT', ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

export const updatePartyByPartyId = (db: Db) => db.prepare(`UPDATE parties SET balance = ?, gst_balance = gst_balance - ?, last_transaction_date = CURRENT_TIMESTAMP, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`);

/** Builds and prepares the dynamic query of `getScrapTransactions` (filters appended in code; user values are bound). */
export function getScrapTransactionsStatement(db: Db, args: { tenant_id: string; scrap_category_id: string | undefined }) {
  const { tenant_id, scrap_category_id } = args;
  let query = `
    SELECT st.*, sc.name as scrap_category_name, sc.unit 
    FROM scrap_transactions st 
    LEFT JOIN scrap_categories sc ON st.scrap_category_id = sc.scrap_category_id 
    WHERE st.tenant_id = ? AND (st.is_deleted IS NULL OR st.is_deleted = 0)
  `;
  const params: unknown[] = [tenant_id];
  if (scrap_category_id) {
    query += ' AND st.scrap_category_id = ?';
    params.push(scrap_category_id);
  }
  query += ' ORDER BY st.created_at DESC LIMIT 500';
  return { statement: db.prepare(query), params };
}


export const findCashTransactionsByScrapInvoiceNumber = (db: Db) => db.prepare(`
  SELECT drawer_id FROM cash_transactions
  WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
    AND (category = 'Scrap Purchase' OR category = 'SCRAP_PURCHASE')
    AND notes LIKE ?
`);

export const deleteCashTransactionsByScrapInvoiceNumber = (db: Db) => db.prepare(`
  DELETE FROM cash_transactions
  WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = 'unset' OR tenant_id IS NULL)
    AND (category = 'Scrap Purchase' OR category = 'SCRAP_PURCHASE')
    AND notes LIKE ?
`);

export const findCashDrawerByDrawerId = (db: Db) => db.prepare('SELECT * FROM cash_drawer WHERE drawer_id = ?');

export const purgeDuplicateScrapCashTransactions = (db: Db) => db.prepare(`
  DELETE FROM cash_transactions
  WHERE UPPER(REPLACE(TRIM(category), ' ', '_')) = 'SCRAP_PURCHASE'
    AND LOWER(TRIM(COALESCE(entered_by, ''))) IN ('system', '', '-', '—')
    AND LOWER(TRIM(notes)) LIKE 'scrap purchase %'
    AND TRIM(SUBSTR(TRIM(notes), 16)) != ''
    AND (tenant_id = ? OR tenant_id IN ('global', 'unset') OR tenant_id IS NULL)
`);
