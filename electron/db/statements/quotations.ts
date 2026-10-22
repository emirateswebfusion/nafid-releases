import type { Db } from './types.js';

/** SQL statements used by services/quotationsService.ts. Each factory prepares its statement on the given connection. */

export const findSettingsByKey = (db: Db) => db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?');

export const upsertSetting = (db: Db) => db.prepare(`
        INSERT INTO settings (tenant_id, key, value, sync_status, updated_at)
        VALUES ('global', ?, ?, 'LOCAL', CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          sync_status = 'LOCAL',
          updated_at = CURRENT_TIMESTAMP
      `);

export const pragmaTableInfo = (db: Db) => db.prepare('PRAGMA table_info(quotations)');

export const upsertQuotation = (db: Db) => db.prepare(`
          INSERT INTO quotations (
            quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address,
            customer_gstin, customer_state, is_gst, discount_total, round_off, biller_name,
            terms_conditions, subtotal, tax_total, grand_total, status, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING')
          ON CONFLICT(quotation_id) DO UPDATE SET
            quotation_number = excluded.quotation_number,
            customer_name = excluded.customer_name,
            customer_phone = excluded.customer_phone,
            customer_address = excluded.customer_address,
            customer_gstin = excluded.customer_gstin,
            customer_state = excluded.customer_state,
            is_gst = excluded.is_gst,
            discount_total = excluded.discount_total,
            round_off = excluded.round_off,
            biller_name = excluded.biller_name,
            terms_conditions = excluded.terms_conditions,
            subtotal = excluded.subtotal,
            tax_total = excluded.tax_total,
            grand_total = excluded.grand_total,
            status = 'ACTIVE',
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        `);

export const upsertQuotationActive = (db: Db) => db.prepare(`
          INSERT INTO quotations (quotation_id, tenant_id, quotation_number, customer_name, customer_phone, customer_address, terms_conditions, subtotal, tax_total, grand_total, status, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'PENDING')
          ON CONFLICT(quotation_id) DO UPDATE SET
            quotation_number = excluded.quotation_number,
            customer_name = excluded.customer_name,
            customer_phone = excluded.customer_phone,
            customer_address = excluded.customer_address,
            terms_conditions = excluded.terms_conditions,
            subtotal = excluded.subtotal,
            tax_total = excluded.tax_total,
            grand_total = excluded.grand_total,
            status = 'ACTIVE',
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        `);

export const deleteQuotationItemByQuotationId = (db: Db) => db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?');

export const pragmaTableInfo2 = (db: Db) => db.prepare('PRAGMA table_info(quotation_items)');

export const insertQuotationItem = (db: Db) => db.prepare(`
          INSERT INTO quotation_items (
            item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount,
            hsn_code, uom, tax_rate_percent, discount_amount, discount_percent, taxable_amount,
            cgst_amount, sgst_amount, igst_amount, sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);

export const insertQuotationItem2 = (db: Db) => db.prepare(`
          INSERT INTO quotation_items (item_id, quotation_id, tenant_id, product_id, name, quantity, weight, rate, amount, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);

export const findQuotationsByQuotationId = (db: Db) => db.prepare('SELECT * FROM quotations WHERE quotation_id = ?');

export const updateQuotationByQuotationId = (db: Db) => db.prepare("UPDATE quotations SET sync_status = 'PENDING' WHERE quotation_id = ?");

export const updateQuotationStatus = (db: Db) => db.prepare("UPDATE quotations SET status = 'DELETED', sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE quotation_id = ?");

export const updateQuotationByQuotationId2 = (db: Db) => db.prepare(`
          UPDATE quotations SET 
            customer_name = ?, customer_phone = ?, customer_address = ?,
            customer_gstin = ?, customer_state = ?, is_gst = ?, discount_total = ?, round_off = ?, biller_name = ?,
            terms_conditions = ?, subtotal = ?, tax_total = ?, grand_total = ?,
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE quotation_id = ?
        `);

export const updateQuotationByQuotationId3 = (db: Db) => db.prepare(`
          UPDATE quotations SET 
            customer_name = ?, customer_phone = ?, customer_address = ?, terms_conditions = ?,
            subtotal = ?, tax_total = ?, grand_total = ?,
            sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE quotation_id = ?
        `);

/** Items of a quotation joined with product tax data. `selectFields` is a column list built by the service from trusted values only. */
export const listQuotationItems = (db: Db, selectFields: string) => db.prepare(`
      SELECT ${selectFields}
      FROM quotation_items qi
      LEFT JOIN products p ON qi.product_id = p.product_id
      WHERE qi.quotation_id = ?
      ORDER BY qi.created_at ASC
    `);

/** Builds and prepares the dynamic query of `getQuotations` (filters appended in code; user values are bound). */
export function getQuotationsStatement(db: Db, args: { tid: string; search: string | undefined }) {
  const { tid, search } = args;
  let query = "SELECT * FROM quotations WHERE (tenant_id = ? OR tenant_id = 'global' OR tenant_id = '' OR tenant_id IS NULL) AND (status IS NULL OR status != 'DELETED')";
  const params: unknown[] = [tid];
  if (search) {
    query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR quotation_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT 200';
  return { statement: db.prepare(query), params };
}

/** Builds and prepares the dynamic query of `updateQuotationStatus` (filters appended in code; user values are bound). */
export function updateQuotationStatusStatement(db: Db, args: { status: string | undefined; converted_to_invoice: number | undefined; invoice_id: string | undefined; quotation_id: string }) {
  const { status, converted_to_invoice, invoice_id, quotation_id } = args;
  const updates: string[] = ["sync_status = 'PENDING'", "updated_at = CURRENT_TIMESTAMP"];
  const params: unknown[] = [];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (converted_to_invoice !== undefined) { updates.push('converted_to_invoice = ?'); params.push(converted_to_invoice); }
  if (invoice_id) { updates.push('invoice_id = ?'); params.push(invoice_id); }
  params.push(quotation_id);
  return { statement: db.prepare(`UPDATE quotations SET ${updates.join(', ')} WHERE quotation_id = ?`), params };
}
