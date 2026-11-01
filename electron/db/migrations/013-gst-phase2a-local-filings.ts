import type { Migration } from './runner.js';

export const m013GstPhase2aLocalFilings: Migration = {
  version: 13,
  name: 'gst-phase2a-local-filings',
  up: db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gst_local_filings (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        return_type TEXT NOT NULL,
        status TEXT NOT NULL,
        filing_mode TEXT NOT NULL,
        acknowledgement_number TEXT,
        filing_date TEXT,
        gross_taxable_value REAL DEFAULT 0,
        total_tax_amount REAL DEFAULT 0,
        summary_payload TEXT,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(period, return_type)
      );

      CREATE INDEX IF NOT EXISTS idx_gst_local_filings_period ON gst_local_filings(period);
    `);
  },
};
