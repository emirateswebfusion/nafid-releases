import type { Db } from './types.js';
import { buildProductSearchConditions } from './productSearch.js';

/** SQL statements used by services/purchasesService.ts. Each factory prepares its statement on the given connection. */

export const findSettingsByKey = (db: Db) => db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?');

export const findPurchaseBills = (db: Db) => db.prepare('SELECT bill_number, bill_type FROM purchase_bills WHERE tenant_id = ?');

export const findOnePurchaseBillByBillNumber = (db: Db) => db.prepare('SELECT 1 FROM purchase_bills WHERE tenant_id = ? AND bill_number = ? LIMIT 1');

export const upsertSetting = (db: Db) => db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
      VALUES (?, ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, key) DO UPDATE SET
        value = EXCLUDED.value,
        sync_status = 'LOCAL',
        updated_at = CURRENT_TIMESTAMP
    `);

export const upsertSetting2 = (db: Db) => db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `);

export const findPurchaseBillItems = (db: Db) => db.prepare(`
      SELECT DISTINCT pbi.product_id, pb.supplier_name
      FROM purchase_bill_items pbi
      JOIN purchase_bills pb ON pbi.purchase_bill_id = pb.purchase_bill_id
      WHERE pb.tenant_id = ? AND pb.supplier_name IS NOT NULL AND TRIM(pb.supplier_name) != ''
    `);

export const insertPurchaseBill = (db: Db) => db.prepare(`
          INSERT INTO purchase_bills (purchase_bill_id, tenant_id, bill_number, supplier_id, supplier_name, bill_date, invoice_number, notes, total_amount, bill_type, payment_type, is_interstate, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

export const insertPurchaseBillItem = (db: Db) => db.prepare(`
          INSERT INTO purchase_bill_items (item_id, purchase_bill_id, tenant_id, product_id, name, quantity, purchase_price, total_amount, selling_price, offer_price, is_gst_applicable, tax_rate_percent, hsn_sac_code, skip_stock_update, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

export const updateProductCurrentStockAndPurchasePrice = (db: Db) => db.prepare(`UPDATE products SET current_stock = current_stock + ?, purchase_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);


export const updateProductBasePrice = (db: Db) => db.prepare(`UPDATE products SET base_price = ? WHERE product_id = ? AND tenant_id = ?`);

export const updateProductOfferPrice = (db: Db) => db.prepare(`UPDATE products SET offer_price = ? WHERE product_id = ? AND tenant_id = ?`);

export const findProductsByProductId = (db: Db) => db.prepare('SELECT domain_attributes FROM products WHERE product_id = ?');

export const updateProductDomainAttributes = (db: Db) => db.prepare(`UPDATE products SET domain_attributes = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);

export const findPartiesByPartyId = (db: Db) => db.prepare('SELECT balance, gst_balance, estimate_balance FROM parties WHERE party_id = ?');

export const insertPartyLedger = (db: Db) => db.prepare(`
            INSERT INTO party_ledger (ledger_id, party_id, tenant_id, transaction_date, description, credit_amount, debit_amount, running_balance, balance_type, payment_method, reference_number, created_by, created_by_name, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `);

export const insertCashTransaction = (db: Db) => db.prepare(`
            INSERT INTO cash_transactions (transaction_id, tenant_id, drawer_id, type, amount, category, notes, entered_by, sync_status)
            VALUES (?, ?, ?, 'CASH_OUT', ?, 'Purchase Bill', ?, 'system', 'PENDING')
          `);

export const updateCashDrawerByDrawerId = (db: Db) => db.prepare(`
            UPDATE cash_drawer SET cash_out = ?, current_cash = ?, expected_closing = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE drawer_id = ?
          `);

export const findPurchaseBillItemsByPurchaseBillId = (db: Db) => db.prepare('SELECT pbi.*, p.name as product_name, p.sku_barcode, p.item_code, p.base_price as product_base_price, p.offer_price as product_offer_price, p.current_stock as product_stock FROM purchase_bill_items pbi LEFT JOIN products p ON pbi.product_id = p.product_id WHERE pbi.purchase_bill_id = ? ORDER BY pbi.created_at ASC');

export const findPurchaseBillsByPurchaseBillId = (db: Db) => db.prepare('SELECT supplier_id, bill_number, tenant_id, payment_type, total_amount, bill_type FROM purchase_bills WHERE purchase_bill_id = ?');

export const findPurchaseBillItemsByPurchaseBillIdProductIdAndQuantity = (db: Db) => db.prepare('SELECT product_id, quantity, skip_stock_update FROM purchase_bill_items WHERE purchase_bill_id = ?');

export const updatePurchaseBillByPurchaseBillId = (db: Db) => db.prepare(`
        UPDATE purchase_bills SET supplier_id = ?, supplier_name = ?, bill_date = ?, invoice_number = ?, notes = ?, total_amount = ?, bill_type = ?, payment_type = ?, is_interstate = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE purchase_bill_id = ?
      `);

export const updateProductCurrentStock = (db: Db) => db.prepare(`UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?`);

export const deletePurchaseBillItemByPurchaseBillId = (db: Db) => db.prepare('DELETE FROM purchase_bill_items WHERE purchase_bill_id = ?');

export const findPurchaseBillsByPurchaseBillId2 = (db: Db) => db.prepare('SELECT supplier_id, bill_number, tenant_id, payment_type, total_amount, bill_type FROM purchase_bills WHERE purchase_bill_id = ?');

export const findPartyLedgerByPartyIdAndReferenceNumber = (db: Db) => db.prepare('SELECT ledger_id FROM party_ledger WHERE tenant_id = ? AND party_id = ? AND reference_number = ?');

export const updatePartyLedgerIsDeleted = (db: Db) => db.prepare("UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE ledger_id = ?");

export const findCashTransactionsByCategory = (db: Db) => db.prepare(`SELECT * FROM cash_transactions WHERE tenant_id = ? AND category = 'Purchase Bill' AND notes LIKE ?`);

export const deleteCashTransactionByTransactionId = (db: Db) => db.prepare(`DELETE FROM cash_transactions WHERE transaction_id = ?`);

export const findCashDrawerByDrawerId = (db: Db) => db.prepare(`SELECT * FROM cash_drawer WHERE drawer_id = ?`);

export const deletePurchaseBillByPurchaseBillId = (db: Db) => db.prepare('DELETE FROM purchase_bills WHERE purchase_bill_id = ?');


/** Dynamic SQL: `balanceCol` must be built from trusted values (placeholders/column lists), never user input. */
export const updatePartyBalanceColumn = (db: Db, balanceCol: string | number) => db.prepare(`UPDATE parties SET balance = ?, ${balanceCol} = ?, last_transaction_date = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ?`);

/** Builds and prepares the dynamic query of `getPurchaseBills` (filters appended in code; user values are bound). */
export function getPurchaseBillsStatement(db: Db, args: { tenant_id: string; search: string | undefined; limit: number | undefined; offset: number | undefined }) {
  const { tenant_id, search, limit, offset } = args;
  let query = 'SELECT pb.*, p.phone as supplier_phone, p.gstin as supplier_gstin FROM purchase_bills pb LEFT JOIN parties p ON pb.supplier_id = p.party_id WHERE pb.tenant_id = ?';
  const params: unknown[] = [tenant_id];
  if (search) {
    query += ' AND (pb.bill_number LIKE ? OR pb.supplier_name LIKE ? OR pb.invoice_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY pb.created_at DESC';
  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }
  if (offset) {
    query += ' OFFSET ?';
    params.push(offset);
  }
  return { statement: db.prepare(query), params };
}

/** Builds and prepares the dynamic query of `getPurchaseBillProducts` (filters appended in code; user values are bound). */
export function getPurchaseBillProductsStatement(db: Db, args: { tenant_id: string; search: string | undefined; numericPrefixOnly: boolean; limit: number | undefined }) {
  const { tenant_id, search, numericPrefixOnly, limit } = args;
  let query = `
    SELECT p.*, 
      COALESCE((SELECT SUM(pbi.quantity) FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND (pb.bill_type = 'GST' OR pbi.skip_stock_update = 1)), 0) as gst_purchase_quantity,
      COALESCE((SELECT pbi.purchase_price FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND (pb.bill_type = 'GST' OR pbi.skip_stock_update = 1) ORDER BY pbi.rowid DESC LIMIT 1), 0) as gst_purchase_price,
      COALESCE((SELECT pbi.selling_price FROM purchase_bill_items pbi JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id WHERE pbi.product_id = p.product_id AND pbi.skip_stock_update = 1 ORDER BY pbi.rowid DESC LIMIT 1), 0) as paper_mrp
    FROM products p 
    WHERE p.tenant_id = ? AND p.is_deleted = 0
  `;
  const params: unknown[] = [tenant_id];
  if (search) {
    const cleanSearch = String(search).trim();
    const cleanSearchNoSpace = cleanSearch.replace(/\s+/g, '');
    if (/^\d+$/.test(cleanSearch) && numericPrefixOnly) {
      query += ' AND (p.sku_barcode LIKE ? OR p.item_code LIKE ? OR REPLACE(p.sku_barcode, \' \', \'\') LIKE ? OR REPLACE(p.item_code, \' \', \'\') LIKE ?)';
      params.push(`${cleanSearch}%`, `${cleanSearch}%`, `${cleanSearchNoSpace}%`, `${cleanSearchNoSpace}%`);
    } else {
      const cond = buildProductSearchConditions(cleanSearch, 'p.');
      query += ` AND ${cond.sql}`;
      params.push(...cond.params);
    }
  }
  const resultLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 200)));
  query += ' ORDER BY p.name COLLATE NOCASE ASC LIMIT ?';
  params.push(resultLimit);
  return { statement: db.prepare(query), params };
}
