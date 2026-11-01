import type { Migration } from './runner.js';

export const m014VatLocalFilings: Migration = {
  version: 14,
  name: 'vat-local-filings',
  up: db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vat_local_filings (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        return_type TEXT NOT NULL DEFAULT 'VAT201',
        status TEXT NOT NULL,
        filing_mode TEXT NOT NULL,
        acknowledgement_number TEXT,
        filing_date TEXT,
        net_output_vat REAL DEFAULT 0,
        recoverable_input_vat REAL DEFAULT 0,
        net_vat_payable REAL DEFAULT 0,
        net_vat_status TEXT,
        summary_payload TEXT,
        notes TEXT,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(period, return_type)
      );

      CREATE INDEX IF NOT EXISTS idx_vat_local_filings_period ON vat_local_filings(period);
    `);
  },
};
