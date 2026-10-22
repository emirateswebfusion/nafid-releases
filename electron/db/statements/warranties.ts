import type { Db } from './types.js';

/** SQL statements used by services/warrantiesService.ts. Each factory prepares its statement on the given connection. */

export const insertWarranty = (db: Db) => db.prepare(`
      INSERT INTO warranties (warranty_id, tenant_id, invoice_id, invoice_item_id, bill_number, brand, customer_name, customer_phone, product_name, product_details, purchase_date, warranty_period_days, expiry_date, notes, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);

export const deleteWarrantyByWarrantyId = (db: Db) => db.prepare('DELETE FROM warranties WHERE warranty_id = ?');

/** Builds and prepares the dynamic query of `getWarranties` (filters appended in code; user values are bound). */
export function getWarrantiesStatement(db: Db, args: { tenant_id: string; search: string | undefined }) {
  const { tenant_id, search } = args;
  let query = 'SELECT * FROM warranties WHERE tenant_id = ?';
  const params: unknown[] = [tenant_id];
  if (search) {
    query += ' AND (customer_name LIKE ? OR customer_phone LIKE ? OR product_name LIKE ? OR brand LIKE ? OR bill_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT 200';
  return { statement: db.prepare(query), params };
}
