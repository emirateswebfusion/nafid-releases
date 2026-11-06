import type { Db } from './types.js';

export const findInvoicesForVatReport = (db: Db) => db.prepare(`
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
    i.customer_address,
    i.customer_state,
    i.is_deleted
  FROM invoices i
  WHERE i.tenant_id = ?
    AND i.invoice_type NOT IN ('SCRAP', 'RETURN')
    AND (i.is_deleted IS NULL OR i.is_deleted = 0)
    AND julianday(i.created_at) >= julianday(?)
    AND julianday(i.created_at) <= julianday(?)
  ORDER BY i.created_at ASC
`);

export const findInvoiceItemsForVatReport = (db: Db) => db.prepare(`
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
    ii.is_service_item,
    p.name as product_name
  FROM invoice_items ii
  JOIN invoices i ON i.invoice_id = ii.invoice_id
  LEFT JOIN products p ON p.product_id = ii.product_id
  WHERE i.tenant_id = ?
    AND i.invoice_type NOT IN ('SCRAP', 'RETURN')
    AND (i.is_deleted IS NULL OR i.is_deleted = 0)
    AND julianday(i.created_at) >= julianday(?)
    AND julianday(i.created_at) <= julianday(?)
`);

export const findReturnsForVatReport = (db: Db) => db.prepare(`
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
    r.subtotal,
    r.tax_total,
    r.grand_total,
    r.created_at
  FROM returns r
  WHERE r.tenant_id = ?
    AND julianday(r.created_at) >= julianday(?)
    AND julianday(r.created_at) <= julianday(?)
  ORDER BY r.created_at ASC
`);

export const findReturnItemsForVatReport = (db: Db) => db.prepare(`
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
    p.name as product_name
  FROM return_items ri
  JOIN returns r ON r.return_id = ri.return_id
  LEFT JOIN products p ON p.product_id = ri.product_id
  WHERE r.tenant_id = ?
    AND julianday(r.created_at) >= julianday(?)
    AND julianday(r.created_at) <= julianday(?)
`);

export const findPurchasesForVatReport = (db: Db) => db.prepare(`
  SELECT 
    pb.purchase_bill_id,
    pb.tenant_id,
    pb.bill_number,
    pb.supplier_id,
    pb.supplier_name,
    pb.bill_date,
    pb.invoice_number,
    pb.total_amount,
    pb.bill_type,
    pb.created_at,
    p.gstin as supplier_trn,
    p.address as supplier_address
  FROM purchase_bills pb
  LEFT JOIN parties p ON p.party_id = pb.supplier_id
  WHERE pb.tenant_id = @tenant_id
    AND ((length(pb.bill_date) = 10 AND pb.bill_date BETWEEN @from_date AND @to_date)
      OR (COALESCE(length(pb.bill_date), 0) != 10 AND julianday(COALESCE(NULLIF(pb.bill_date, ''), pb.created_at)) BETWEEN julianday(@startUtc) AND julianday(@endUtc)))
  ORDER BY COALESCE(NULLIF(pb.bill_date, ''), pb.created_at) ASC
`);

export const findPurchaseItemsForVatReport = (db: Db) => db.prepare(`
  SELECT 
    pbi.item_id,
    pbi.purchase_bill_id,
    pbi.tenant_id,
    pbi.product_id,
    pbi.name,
    pbi.quantity,
    pbi.purchase_price,
    pbi.total_amount,
    pbi.is_gst_applicable,
    pbi.tax_rate_percent,
    p.name as product_name
  FROM purchase_bill_items pbi
  JOIN purchase_bills pb ON pb.purchase_bill_id = pbi.purchase_bill_id
  LEFT JOIN products p ON p.product_id = pbi.product_id
  WHERE pb.tenant_id = @tenant_id
    AND ((length(pb.bill_date) = 10 AND pb.bill_date BETWEEN @from_date AND @to_date)
      OR (COALESCE(length(pb.bill_date), 0) != 10 AND julianday(COALESCE(NULLIF(pb.bill_date, ''), pb.created_at)) BETWEEN julianday(@startUtc) AND julianday(@endUtc)))
`);

export const findVatInvoiceDocStats = (db: Db) => db.prepare(`
  SELECT 
    MIN(invoice_number) as from_doc,
    MAX(invoice_number) as to_doc,
    COUNT(*) as total_docs
  FROM invoices
  WHERE tenant_id = ?
    AND invoice_type NOT IN ('SCRAP', 'RETURN')
    AND (is_deleted IS NULL OR is_deleted = 0)
    AND julianday(created_at) >= julianday(?)
    AND julianday(created_at) <= julianday(?)
`);

export const findVatCreditNoteDocStats = (db: Db) => db.prepare(`
  SELECT 
    MIN(COALESCE(credit_note_number, return_number)) as from_doc,
    MAX(COALESCE(credit_note_number, return_number)) as to_doc,
    COUNT(*) as total_docs
  FROM returns
  WHERE tenant_id = ?
    AND julianday(created_at) >= julianday(?)
    AND julianday(created_at) <= julianday(?)
`);

export const findVatPurchaseDocStats = (db: Db) => db.prepare(`
  SELECT 
    MIN(bill_number) as from_doc,
    MAX(bill_number) as to_doc,
    COUNT(*) as total_docs
  FROM purchase_bills
  WHERE tenant_id = ?
    AND date(COALESCE(NULLIF(bill_date, ''), created_at)) >= date(?)
    AND date(COALESCE(NULLIF(bill_date, ''), created_at)) <= date(?)
`);

export const getLocalVatFilings = (db: Db) => db.prepare(`
  SELECT * FROM vat_local_filings
  ORDER BY period DESC, created_at DESC
`);

export const upsertLocalVatFiling = (db: Db) => db.prepare(`
  INSERT INTO vat_local_filings (
    id, period, return_type, status, filing_mode,
    net_output_vat, recoverable_input_vat, net_vat_payable, net_vat_status,
    summary_payload, notes, approved_by, approved_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(period, return_type) DO UPDATE SET
    status = excluded.status,
    filing_mode = excluded.filing_mode,
    net_output_vat = excluded.net_output_vat,
    recoverable_input_vat = excluded.recoverable_input_vat,
    net_vat_payable = excluded.net_vat_payable,
    net_vat_status = excluded.net_vat_status,
    summary_payload = excluded.summary_payload,
    notes = COALESCE(excluded.notes, vat_local_filings.notes),
    approved_by = COALESCE(excluded.approved_by, vat_local_filings.approved_by),
    approved_at = COALESCE(excluded.approved_at, vat_local_filings.approved_at),
    updated_at = excluded.updated_at
`);

export const recordLocalVatManualAck = (db: Db) => db.prepare(`
  INSERT INTO vat_local_filings (
    id, period, return_type, status, filing_mode,
    acknowledgement_number, filing_date, net_output_vat, recoverable_input_vat,
    net_vat_payable, net_vat_status, notes, approved_by, approved_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'FILED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(period, return_type) DO UPDATE SET
    status = 'FILED',
    filing_mode = excluded.filing_mode,
    acknowledgement_number = excluded.acknowledgement_number,
    filing_date = excluded.filing_date,
    net_output_vat = excluded.net_output_vat,
    recoverable_input_vat = excluded.recoverable_input_vat,
    net_vat_payable = excluded.net_vat_payable,
    net_vat_status = excluded.net_vat_status,
    notes = COALESCE(excluded.notes, vat_local_filings.notes),
    approved_by = COALESCE(excluded.approved_by, vat_local_filings.approved_by),
    approved_at = COALESCE(excluded.approved_at, vat_local_filings.approved_at),
    updated_at = excluded.updated_at
`);
