import type { Db } from './types.js';
export const soldStock = (db: Db) => db.prepare(`SELECT product_id, quantity, combo_details, is_service_item
  FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?`);
export const returnedStock = (db: Db) => db.prepare(`SELECT ri.product_id, ri.quantity, ri.combo_details
  FROM return_items ri JOIN returns r ON r.return_id = ri.return_id AND r.tenant_id = ri.tenant_id
  WHERE r.is_deleted = 0 AND r.invoice_id = ? AND r.tenant_id = ?`);
