import type { Migration } from './runner.js';
import * as outboxSql from '../statements/outbox.js';
import { SYNCED_TABLES } from './002-sync-outbox.js';
export const m006FilingOnly: Migration = {
  version: 6, name: 'filing-only',
  up: db => {
    db.exec("ALTER TABLE invoices ADD COLUMN counts_in_revenue INTEGER NOT NULL DEFAULT 1");
    db.exec("ALTER TABLE invoices ADD COLUMN bill_purpose TEXT NOT NULL DEFAULT 'SALE'");
    db.exec("ALTER TABLE invoices ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 1");
    for (const statement of outboxSql.buildOutboxTriggerStatements(db, SYNCED_TABLES)) db.exec(statement);
  },
};
