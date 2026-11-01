import type { Migration } from './runner.js';

export const m012GstReturnsAndCreditNotes: Migration = {
  version: 12,
  name: 'gst-returns-and-credit-notes',
  up: db => {
    const returnCols = (db.prepare('PRAGMA table_info(returns)').all() as { name: string }[]).map(c => c.name);
    if (!returnCols.includes('credit_note_number')) {
      db.exec(`
        ALTER TABLE returns ADD COLUMN credit_note_number TEXT;
        ALTER TABLE returns ADD COLUMN original_invoice_number TEXT;
        ALTER TABLE returns ADD COLUMN original_invoice_date TEXT;
        ALTER TABLE returns ADD COLUMN customer_gstin TEXT;
        ALTER TABLE returns ADD COLUMN supply_type TEXT DEFAULT 'INTRA';
        ALTER TABLE returns ADD COLUMN pos_state_code TEXT;
        ALTER TABLE returns ADD COLUMN cgst_total REAL DEFAULT 0;
        ALTER TABLE returns ADD COLUMN sgst_total REAL DEFAULT 0;
        ALTER TABLE returns ADD COLUMN igst_total REAL DEFAULT 0;
        ALTER TABLE returns ADD COLUMN note_type TEXT DEFAULT 'C';
        ALTER TABLE returns ADD COLUMN reason_code TEXT DEFAULT '01-Sales Return';
      `);
    }

    const itemCols = (db.prepare('PRAGMA table_info(return_items)').all() as { name: string }[]).map(c => c.name);
    if (!itemCols.includes('taxable_amount')) {
      db.exec(`
        ALTER TABLE return_items ADD COLUMN taxable_amount REAL DEFAULT 0;
        ALTER TABLE return_items ADD COLUMN cgst_rate REAL DEFAULT 0;
        ALTER TABLE return_items ADD COLUMN sgst_rate REAL DEFAULT 0;
        ALTER TABLE return_items ADD COLUMN igst_rate REAL DEFAULT 0;
        ALTER TABLE return_items ADD COLUMN cgst_amount REAL DEFAULT 0;
        ALTER TABLE return_items ADD COLUMN sgst_amount REAL DEFAULT 0;
        ALTER TABLE return_items ADD COLUMN igst_amount REAL DEFAULT 0;
        ALTER TABLE return_items ADD COLUMN hsn_sac_code TEXT;
      `);
    }
  },
};
