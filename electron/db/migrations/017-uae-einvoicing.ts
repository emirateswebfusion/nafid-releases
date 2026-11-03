import type { Migration } from './runner.js';
import * as outboxSql from '../statements/outbox.js';

/**
 * UAE Electronic Invoicing (server migration 102): the customer's e-invoice identity (synced JSON text) and a
 * read-only mirror of the server-owned `einvoice_documents` status rows. Version 17 leaves 15/16 to the parallel
 * restaurant / card-terminal branches. The customers outbox trigger is rebuilt so the new column is carried by ops.
 */
export const m017UaeEinvoicing: Migration = {
  version: 17,
  name: 'uae-einvoicing',
  up: db => {
    const customerCols = (db.prepare('PRAGMA table_info(customers)').all() as { name: string }[]).map(c => c.name);
    if (!customerCols.includes('einvoice_profile')) db.exec('ALTER TABLE customers ADD COLUMN einvoice_profile TEXT');

    db.exec(`
      CREATE TABLE IF NOT EXISTS einvoice_documents (
        document_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        document_kind TEXT NOT NULL,
        document_number TEXT NOT NULL,
        document_type TEXT,
        status TEXT NOT NULL,
        buyer_endpoint TEXT,
        provider_id TEXT,
        asp_reference TEXT,
        fta_reference TEXT,
        errors TEXT NOT NULL DEFAULT '[]',
        attempts INTEGER NOT NULL DEFAULT 0,
        submitted_at TEXT,
        created_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_einvoice_documents_tenant_updated ON einvoice_documents(tenant_id, updated_at);
    `);

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'").all() as { name: string }[]);
    if (tables.length > 0) {
      for (const statement of outboxSql.buildOutboxTriggerStatements(db, ['customers'])) db.exec(statement);
    }
  },
};
