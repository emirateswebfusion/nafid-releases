import type { Migration } from './runner.js';
import { buildOutboxTriggerStatements } from '../statements/outbox.js';
import { SYNCED_TABLES } from './002-sync-outbox.js';

export const m008ReturnStockSnapshots: Migration = {
  version: 8, name: 'return-stock-snapshots',
  up: db => {
    db.exec('ALTER TABLE return_items ADD COLUMN combo_details TEXT');
    for (const statement of buildOutboxTriggerStatements(db, SYNCED_TABLES)) db.exec(statement);
  },
};
