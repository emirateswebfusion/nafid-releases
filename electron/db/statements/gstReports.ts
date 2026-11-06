import type { Db } from './types.js';

export const findInvoicesForGstReport = (db: Db) => db.prepare(`
  SELECT 
    i.invoice_id,
    i.tenant_id,
    i.invoice_number,
    i.invoice_type,
    i.created_at,
    i.subtotal,
    i.tax_total,
    i.discount_total,
    i.grand_total,
    i.customer_name,
    i.customer_phone,
    i.customer_gstin,
    i.customer_state,
    i.supply_type,
    i.cgst_total,
    i.sgst_total,
    i.igst_total,
    i.is_deleted
  FROM invoices i
  WHERE i.tenant_id = ?
    AND i.invoice_type NOT IN ('SCRAP', 'RETURN')
    AND (i.is_deleted IS NULL OR i.is_deleted = 0)
    AND julianday(i.created_at) >= julianday(?)
    AND julianday(i.created_at) <= julianday(?)
  ORDER BY i.created_at ASC
`);

export const findInvoiceItemsForGstReport = (db: Db) => db.prepare(`
  SELECT 
    ii.item_id,
    ii.invoice_id,
    ii.tenant_id,
    ii.product_id,
    ii.name,
    ii.quantity,
    ii.unit_price,
    ii.tax_amount,
    ii.total,
    ii.cgst_rate,
    ii.sgst_rate,
    ii.igst_rate,
    ii.cgst_amount,
    ii.sgst_amount,
    ii.igst_amount,
    ii.hsn_sac_code,
    ii.uom,
    p.name as product_name,
    p.hsn_sac_code as product_hsn
  FROM invoice_items ii
  JOIN invoices i ON i.invoice_id = ii.invoice_id
  LEFT JOIN products p ON p.product_id = ii.product_id
  WHERE i.tenant_id = ?
    AND i.invoice_type NOT IN ('SCRAP', 'RETURN')
    AND (i.is_deleted IS NULL OR i.is_deleted = 0)
    AND julianday(i.created_at) >= julianday(?)
    AND julianday(i.created_at) <= julianday(?)
`);

export const findReturnsForGstReport = (db: Db) => db.prepare(`
  SELECT 
    r.return_id,
    r.tenant_id,
    r.return_number,
    r.invoice_id,
    r.credit_note_number,
    r.original_invoice_number,
    r.original_invoice_date,
    r.customer_name,
    r.customer_phone,
    r.customer_gstin,
    r.supply_type,
    r.pos_state_code,
    r.subtotal,
    r.tax_total,
    r.grand_total,
    r.cgst_total,
    r.sgst_total,
    r.igst_total,
    r.note_type,
    r.reason_code,
    r.created_at
  FROM returns r
  WHERE r.tenant_id = ?
    AND julianday(r.created_at) >= julianday(?)
    AND julianday(r.created_at) <= julianday(?)
  ORDER BY r.created_at ASC
`);

export const findReturnItemsForGstReport = (db: Db) => db.prepare(`
  SELECT 
    ri.return_item_id,
    ri.return_id,
    ri.tenant_id,
    ri.invoice_item_id,
    ri.product_id,
    ri.name,
    ri.quantity,
    ri.unit_price,
    ri.tax_amount,
    ri.total,
    ri.taxable_amount,
    ri.cgst_rate,
    ri.sgst_rate,
    ri.igst_rate,
    ri.cgst_amount,
    ri.sgst_amount,
    ri.igst_amount,
    ri.hsn_sac_code,
    p.name as product_name,
    p.hsn_sac_code as product_hsn
  FROM return_items ri
  JOIN returns r ON r.return_id = ri.return_id
  LEFT JOIN products p ON p.product_id = ri.product_id
  WHERE r.tenant_id = ?
    AND julianday(r.created_at) >= julianday(?)
    AND julianday(r.created_at) <= julianday(?)
`);

export const findInvoiceDocStats = (db: Db) => db.prepare(`
  SELECT 
    MIN(invoice_number) as from_doc,
    MAX(invoice_number) as to_doc,
    COUNT(*) as total_docs,
    0 as cancelled_docs
  FROM invoices
  WHERE tenant_id = ?
    AND invoice_type NOT IN ('SCRAP', 'RETURN')
    AND julianday(created_at) >= julianday(?)
    AND julianday(created_at) <= julianday(?)
`);

export const findCreditNoteDocStats = (db: Db) => db.prepare(`
  SELECT 
    MIN(return_number) as from_doc,
    MAX(return_number) as to_doc,
    COUNT(*) as total_docs,
    0 as cancelled_docs
  FROM returns
  WHERE tenant_id = ?
    AND julianday(created_at) >= julianday(?)
    AND julianday(created_at) <= julianday(?)
`);

export const getLocalGstFilings = (db: Db) => db.prepare(`
  SELECT * FROM gst_local_filings
  ORDER BY period DESC, created_at DESC
`);

export const upsertLocalGstFiling = (db: Db) => db.prepare(`
  INSERT INTO gst_local_filings (
    id, period, return_type, status, filing_mode,
    gross_taxable_value, total_tax_amount, summary_payload,
    approved_by, approved_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(period, return_type) DO UPDATE SET
    status = excluded.status,
    filing_mode = excluded.filing_mode,
    gross_taxable_value = excluded.gross_taxable_value,
    total_tax_amount = excluded.total_tax_amount,
    summary_payload = excluded.summary_payload,
    approved_by = COALESCE(excluded.approved_by, gst_local_filings.approved_by),
    approved_at = COALESCE(excluded.approved_at, gst_local_filings.approved_at),
    updated_at = excluded.updated_at
`);

export const recordLocalManualAcknowledgement = (db: Db) => db.prepare(`
  INSERT INTO gst_local_filings (
    id, period, return_type, status, filing_mode,
    acknowledgement_number, filing_date, gross_taxable_value, total_tax_amount,
    approved_by, approved_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'FILED', 'OFFLINE_MANUAL', ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(period, return_type) DO UPDATE SET
    status = 'FILED',
    filing_mode = 'OFFLINE_MANUAL',
    acknowledgement_number = excluded.acknowledgement_number,
    filing_date = excluded.filing_date,
    gross_taxable_value = excluded.gross_taxable_value,
    total_tax_amount = excluded.total_tax_amount,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    updated_at = excluded.updated_at
`);
