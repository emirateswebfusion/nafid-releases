import type { Db } from './types.js';

/** SQL for the read-only mirror of server-owned UAE e-invoice statuses (migration 017). */

export const upsertEinvoiceDocument = (db: Db) => db.prepare(`
    INSERT INTO einvoice_documents (
      document_id, tenant_id, document_kind, document_number, document_type, status, buyer_endpoint, provider_id,
      asp_reference, fta_reference, errors, attempts, submitted_at, created_at, updated_at
    ) VALUES (
      @document_id, @tenant_id, @document_kind, @document_number, @document_type, @status, @buyer_endpoint, @provider_id,
      @asp_reference, @fta_reference, @errors, @attempts, @submitted_at, @created_at, @updated_at
    )
    ON CONFLICT(document_id) DO UPDATE SET
      document_number = excluded.document_number, document_type = excluded.document_type, status = excluded.status,
      buyer_endpoint = excluded.buyer_endpoint, provider_id = excluded.provider_id, asp_reference = excluded.asp_reference,
      fta_reference = excluded.fta_reference, errors = excluded.errors, attempts = excluded.attempts,
      submitted_at = excluded.submitted_at, updated_at = excluded.updated_at
  `);

/** Statuses for a page of documents (invoice_id / return_id); the caller binds the tenant and a JSON array of ids. */
export const selectEinvoiceStatuses = (db: Db) => db.prepare(`
    SELECT document_id, document_kind, document_number, document_type, status, buyer_endpoint, fta_reference, errors, updated_at
      FROM einvoice_documents
     WHERE tenant_id = ? AND document_id IN (SELECT value FROM json_each(?))
  `);

export const countEinvoiceStatuses = (db: Db) => db.prepare(`
    SELECT status, COUNT(*) AS count FROM einvoice_documents WHERE tenant_id = ? GROUP BY status
  `);

export const selectCustomerEinvoiceProfile = (db: Db) => db.prepare(`
    SELECT customer_id, name, phone, address, gstin, einvoice_profile FROM customers
     WHERE tenant_id = ? AND customer_id = ? AND (is_deleted IS NULL OR is_deleted = 0)
  `);

export const updateCustomerEinvoiceProfile = (db: Db) => db.prepare(`
    UPDATE customers SET einvoice_profile = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND customer_id = ?
  `);
