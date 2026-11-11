import { moneyDecimalsSql } from './moneyPrecision.js';
import type { Db } from './types.js';

/** SQL statements used by services/customersService.ts. Each factory prepares its statement on the given connection. */

export const findCustomers = (db: Db) => db.prepare('SELECT customer_id FROM customers WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const insertCustomer = (db: Db) => db.prepare(`
      INSERT INTO customers (
        customer_id, tenant_id, name, phone, address, gstin, notes, pricing_tier_id,
        credit_limit, credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
        sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

export const findPartiesByPhone = (db: Db) => db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const findParties = (db: Db) => db.prepare('SELECT party_id FROM parties WHERE tenant_id = ? AND LOWER(TRIM(name)) = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const updatePartyByPartyId = (db: Db) => db.prepare(`
        UPDATE parties 
        SET name = ?, phone = COALESCE(?, phone), address = COALESCE(?, address),
            gstin = COALESCE(?, gstin), notes = COALESCE(?, notes),
            credit_limit = ?, credit_period_enabled = ?, credit_period_days = ?, credit_period_basis = ?, restrict_on_credit_expiry = ?,
            pricing_tier_id = COALESCE(?, pricing_tier_id),
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `);

export const insertParty = (db: Db) => db.prepare(`
        INSERT INTO parties (
          party_id, tenant_id, name, phone, address, gstin, notes, balance, gst_balance, estimate_balance,
          balance_type, party_type, pricing_tier_id, credit_limit,
          credit_period_enabled, credit_period_days, credit_period_basis, restrict_on_credit_expiry,
          is_deleted, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'RECEIVABLE', 'CUSTOMER', ?, ?, ?, ?, ?, ?, 0, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

export const findCustomersByCustomerId = (db: Db) => db.prepare(`SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`);

export const updateCustomerIsDeleted = (db: Db) => db.prepare(`UPDATE customers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND tenant_id = ?`);

export const findPartiesByPhonePartyIdAndName = (db: Db) => db.prepare(`SELECT party_id, name FROM parties WHERE tenant_id = ? AND phone = ? AND (is_deleted IS NULL OR is_deleted = 0)`);

export const findPartiesByName = (db: Db) => db.prepare(`SELECT party_id, name FROM parties WHERE tenant_id = ? AND name = ? COLLATE NOCASE AND (is_deleted IS NULL OR is_deleted = 0)`);

export const updatePartyIsDeleted = (db: Db) => db.prepare(`UPDATE parties SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND tenant_id = ?`);

export const updatePartyLedgerIsDeleted = (db: Db) => db.prepare(`UPDATE party_ledger SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND tenant_id = ?`);

export const findCustomersByCustomerIdTenantIdAndPhone = (db: Db) => db.prepare('SELECT tenant_id, phone, name FROM customers WHERE customer_id = ? AND tenant_id = ?');

export const updatePartyByPartyId2 = (db: Db) => db.prepare(`
        UPDATE parties 
        SET name = ?, phone = ?, address = ?,
            gstin = ?, notes = ?,
            credit_limit = COALESCE(?, credit_limit),
            credit_period_enabled = COALESCE(?, credit_period_enabled),
            credit_period_days = COALESCE(?, credit_period_days),
            credit_period_basis = COALESCE(?, credit_period_basis),
            restrict_on_credit_expiry = COALESCE(?, restrict_on_credit_expiry),
            pricing_tier_id = COALESCE(?, pricing_tier_id),
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
        WHERE party_id = ?
      `);

export const findCustomersByCustomerId2 = (db: Db) => db.prepare('SELECT * FROM customers WHERE customer_id = ? AND tenant_id = ?');

export const findCustomersByPhone = (db: Db) => db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?)`);

export const findCustomerByName = (db: Db) => db.prepare(`SELECT * FROM customers WHERE tenant_id = ? AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), '  ', ' ')) = LOWER(REPLACE(TRIM(?), '  ', ' ')))`);

export const findPartiesByPartyId = (db: Db) => db.prepare('SELECT * FROM parties WHERE party_id = ? AND tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)');

export const findOnePartyByPhone = (db: Db) => db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (phone = ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?) LIMIT 1`);

export const findPartyByName = (db: Db) => db.prepare(`SELECT * FROM parties WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0) AND (LOWER(TRIM(name)) = LOWER(?) OR LOWER(REPLACE(TRIM(name), '  ', ' ')) = LOWER(REPLACE(TRIM(?), '  ', ' '))) LIMIT 1`);

export const updateInvoiceCustomerId = (db: Db) => db.prepare(`
          UPDATE invoices
          SET customer_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE (customer_id IS NULL OR customer_id = '')
            AND tenant_id = ?
            AND customer_phone IS NOT NULL AND customer_phone != ''
            AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?
        `);

export const updateInvoiceCustomerId2 = (db: Db) => db.prepare(`
          UPDATE invoices
          SET customer_id = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE (customer_id IS NULL OR customer_id = '')
            AND tenant_id = ?
            AND customer_name IS NOT NULL
            AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ?
            AND (customer_phone IS NULL OR customer_phone = '' OR (? != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?))
        `);

export const findInvoicesByCustomerId = (db: Db) => db.prepare(`
      SELECT *
      FROM invoices
      WHERE tenant_id = ?
        AND (
          (? != '' AND customer_id = ?)
          OR (? != '' AND customer_id = ?)
          OR (? != '' AND customer_phone IS NOT NULL AND customer_phone != '' AND REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', '') LIKE ?)
          OR (? != '' AND customer_name IS NOT NULL AND LOWER(REPLACE(TRIM(customer_name), '  ', ' ')) = ? AND (customer_phone IS NULL OR customer_phone = '' OR ? = ''))
        )
        AND (invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (is_held IS NULL OR is_held = 0)
        AND (is_deleted IS NULL OR is_deleted = 0)
      ORDER BY created_at DESC
    `);

export const findLoyaltyTransactionsByCustomerId = (db: Db) => db.prepare(`
      SELECT lt.*, i.invoice_number
      FROM loyalty_transactions lt
      LEFT JOIN invoices i ON lt.invoice_id = i.invoice_id
      WHERE lt.customer_id = ? AND (lt.tenant_id = ? OR lt.tenant_id = 'global' OR ? = 'global')
      ORDER BY lt.created_at DESC
    `);

export const insertLoyaltyTransaction = (db: Db) => db.prepare(`
      INSERT INTO loyalty_transactions (
        transaction_id, tenant_id, customer_id, invoice_id,
        transaction_type, points, points_balance_before, points_balance_after,
        reference_number, description, created_by, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, 'ADJUSTED', ?, ?, ?, NULL, ?, ?, 'PENDING', ?, ?)
    `);

export const updateCustomerByCustomerId = (db: Db) => db.prepare(`
      UPDATE customers SET
        total_points_earned = total_points_earned + ?,
        total_points_redeemed = total_points_redeemed + ?,
        current_points_balance = ?,
        sync_status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
      WHERE customer_id = ?
    `);

/** Builds and prepares the dynamic query of `getCustomers` (filters appended in code; user values are bound). */
export function getCustomersStatement(db: Db, args: { tenant_id: string; search: string | undefined; active: boolean | undefined; credit: boolean | undefined; pricing_tier_id: string | undefined }) {
  const { tenant_id, search, active, credit, pricing_tier_id } = args;
  let query = `
    SELECT c.*,
           COALESCE(c.credit_limit,          p.credit_limit,          0)            AS credit_limit,
           COALESCE(c.credit_period_enabled, p.credit_period_enabled, 0)            AS credit_period_enabled,
           COALESCE(c.credit_period_days,    p.credit_period_days,    30)           AS credit_period_days,
           COALESCE(c.credit_period_basis,   p.credit_period_basis,   'BILL_BASED') AS credit_period_basis,
           COALESCE(c.restrict_on_credit_expiry, p.restrict_on_credit_expiry, 1)   AS restrict_on_credit_expiry,
           COALESCE(
             (SELECT ROUND(SUM(pl.credit_amount) - SUM(pl.debit_amount), ${moneyDecimalsSql('p.tenant_id')})
              FROM party_ledger pl
              WHERE pl.party_id = p.party_id
                AND (pl.is_deleted IS NULL OR pl.is_deleted = 0)),
             p.balance,
             0
           )                                                                        AS party_balance,
           p.gstin                                                                  AS gstin,
           p.notes                                                                  AS notes,
           COALESCE(c.pricing_tier_id, p.pricing_tier_id)                          AS resolved_pricing_tier_id,
           pt.name                                                                  AS pricing_tier_name
    FROM customers c
    LEFT JOIN parties p ON p.tenant_id = c.tenant_id
      AND (p.is_deleted IS NULL OR p.is_deleted = 0)
      AND p.party_id = (
        SELECT p2.party_id FROM parties p2
        WHERE p2.tenant_id = c.tenant_id
          AND (p2.is_deleted IS NULL OR p2.is_deleted = 0)
          AND (
            (c.phone IS NOT NULL AND TRIM(c.phone) <> '' AND p2.phone IS NOT NULL AND TRIM(p2.phone) <> '' AND p2.phone = c.phone)
            OR (LOWER(TRIM(p2.name)) = LOWER(TRIM(c.name)))
          )
        ORDER BY CASE WHEN p2.party_type = 'CUSTOMER' THEN 0 ELSE 1 END,
                 ABS(COALESCE(p2.balance, 0)) DESC
        LIMIT 1
      )
    LEFT JOIN pricing_tiers pt ON pt.pricing_tier_id = COALESCE(c.pricing_tier_id, p.pricing_tier_id)
    WHERE c.tenant_id = ? AND (c.is_deleted IS NULL OR c.is_deleted = 0)
  `;
  const params: unknown[] = [tenant_id];
  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (active) {
    query += ` AND c.last_purchase_date IS NOT NULL AND c.last_purchase_date >= datetime('now', '-90 days')`;
  }
  if (credit === true) {
    query += ` AND p.balance > 0`;
  } else if (credit === false) {
    query += ` AND (p.balance <= 0 OR p.balance IS NULL)`;
  }
  if (pricing_tier_id) {
    query += ` AND COALESCE(c.pricing_tier_id, p.pricing_tier_id) = ?`;
    params.push(pricing_tier_id);
  }
  query += ` ORDER BY c.name COLLATE NOCASE ASC`;
  return { statement: db.prepare(query), params };
}

/** Builds and prepares the dynamic query of `findCustomers` (filters appended in code; user values are bound). */
export function findCustomersStatement(db: Db, args: { tenant_id: string; name: string | undefined; phone: string | undefined }) {
  const { tenant_id, name, phone } = args;
  let query = `SELECT * FROM customers WHERE tenant_id = ? AND (is_deleted IS NULL OR is_deleted = 0)`;
  const params: unknown[] = [tenant_id];
  if (name && phone) {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    query += ` AND (name LIKE ? OR phone LIKE ?)`;
    params.push(`%${cleanName}%`, `%${phone.trim()}%`);
  } else if (name) {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    query += ` AND (name LIKE ? OR phone LIKE ?)`;
    params.push(`%${cleanName}%`, `%${cleanName}%`);
  } else if (phone) {
    query += ` AND phone LIKE ?`;
    params.push(`%${phone.trim()}%`);
  }
  query += ` ORDER BY name COLLATE NOCASE ASC LIMIT 25`;
  return { statement: db.prepare(query), params };
}

/** Columns `updateCustomerProfile` may set besides name / phone / address / pricing tier (in this order of use). */
export type CustomerProfileColumn = 'gstin' | 'notes' | 'credit_limit' | 'credit_period_enabled' | 'credit_period_days' | 'credit_period_basis' | 'restrict_on_credit_expiry';

/** Update a customer's profile. Params: name, phone, address, pricing_tier_id, one value per column in `columns`,
 * customer_id, tenant_id. */
export function updateCustomerProfile(db: Db, columns: readonly CustomerProfileColumn[]) {
  return db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, address = ?,
          pricing_tier_id = ?
    ${columns.map((c) => `, ${c} = ?`).join('')}, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND tenant_id = ?`);
}

export const customerIdentityCandidates = (db: Db) => db.prepare("SELECT customer_id, name, phone FROM customers WHERE tenant_id = ? AND COALESCE(is_deleted, 0) = 0");
