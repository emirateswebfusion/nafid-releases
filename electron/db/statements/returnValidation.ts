import type { Db } from './types.js';
export const invoice = (db: Db) => db.prepare('SELECT * FROM invoices WHERE invoice_id = ? AND tenant_id = ?');
export const sourceLines = (db: Db) => db.prepare(`SELECT ii.item_id, ii.product_id, ii.quantity, ii.combo_id, ii.combo_details, ii.is_service_item,
  COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.return_id=ri.return_id AND r.tenant_id=ri.tenant_id
    WHERE ri.invoice_item_id=ii.item_id AND r.invoice_id=ii.invoice_id AND r.tenant_id=ii.tenant_id AND COALESCE(r.is_deleted,0)=0),0) AS returned
  FROM invoice_items ii WHERE ii.invoice_id=? AND ii.tenant_id=?`);
export const returnedProducts = (db: Db) => db.prepare(`SELECT ri.product_id, SUM(ri.quantity) AS quantity
  FROM return_items ri JOIN returns r ON r.return_id=ri.return_id AND r.tenant_id=ri.tenant_id
  WHERE r.invoice_id IN (SELECT invoice_id FROM invoices WHERE (invoice_id=? OR converted_from_invoice_id=?) AND tenant_id=?)
    AND r.tenant_id=? AND COALESCE(r.is_deleted,0)=0 GROUP BY ri.product_id`);
export const accountCredits = (db: Db) => db.prepare(`SELECT COALESCE(SUM(grand_total),0) AS total FROM returns
  WHERE invoice_id IN (SELECT invoice_id FROM invoices WHERE (invoice_id=? OR converted_from_invoice_id=?) AND tenant_id=?)
    AND tenant_id=? AND COALESCE(is_deleted,0)=0
    AND UPPER(COALESCE(NULLIF(refund_method,''),'CREDIT')) IN ('CREDIT','STORE_CREDIT','ADJUST_BILL')`);
export const updateBalance = (db: Db) => db.prepare("UPDATE invoices SET balance_amount=?,sync_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE invoice_id=? AND tenant_id=?");
