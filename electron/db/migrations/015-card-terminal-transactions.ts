import type { Migration } from './runner.js';

/** Device-local journal of card machine requests (never synced): written before a request is sent, for audit and recovery. */
export const m015CardTerminalTransactions: Migration = {
  version: 15,
  name: 'card-terminal-transactions',
  up: db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS card_terminal_transactions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        invoice_id TEXT,
        ecr_ref TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        auth_code TEXT,
        rrn TEXT,
        terminal_id TEXT,
        masked_pan TEXT,
        scheme TEXT,
        response_code TEXT,
        message TEXT,
        original_ecr_ref TEXT,
        resolved_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_card_terminal_tx_tenant ON card_terminal_transactions(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_card_terminal_tx_invoice ON card_terminal_transactions(invoice_id);
    `);
  },
};
