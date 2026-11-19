import type { Db } from './types.js';
import { netStockComponents, type StockLine } from '../../utils/invoiceStock.js';
export const soldStock = (db: Db) => db.prepare(`SELECT product_id, quantity, combo_id, combo_details, is_service_item
  FROM invoice_items WHERE invoice_id = ? AND tenant_id = ?`);
export const returnedStock = (db: Db) => db.prepare(`SELECT ri.product_id, ri.quantity, ri.combo_details
  FROM return_items ri JOIN returns r ON r.return_id = ri.return_id AND r.tenant_id = ri.tenant_id
  WHERE COALESCE(r.is_deleted,0) = 0 AND r.invoice_id IN
    (SELECT invoice_id FROM invoices WHERE (invoice_id=? OR converted_from_invoice_id=?) AND tenant_id=?) AND r.tenant_id=?`);
export const stockInvoice = (db: Db) => db.prepare('SELECT * FROM invoices WHERE invoice_id=? AND tenant_id=?');
/** One physical invoice projection for edits, returns, cancellation and recovery. Deleted items retain their snapshot. */
export function outstandingInvoiceStock(db: Db, id: string, tenant: string, includeDeleted = false) {
  const header = stockInvoice(db).get(id, tenant) as Record<string, unknown> | undefined;
  if (!header || (!includeDeleted && header.is_deleted) || header.stock_applied === 0
    || header.converted_from_invoice_id || header.converted_from_invoice_number
    || ['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(String(header.invoice_type))) return [];
  return netStockComponents(soldStock(db).all(id, tenant) as StockLine[], returnedStock(db).all(id, id, tenant, tenant) as StockLine[]);
}
export function returnStockOwner(db: Db, id: string, tenant: string): string {
  const row = stockInvoice(db).get(id, tenant) as { converted_from_invoice_id?: string | null } | undefined;
  return row?.converted_from_invoice_id || id;
}
