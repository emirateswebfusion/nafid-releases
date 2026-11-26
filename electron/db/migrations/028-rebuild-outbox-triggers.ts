import type { Migration } from './runner.js';
import { buildOutboxTriggerStatements } from '../statements/outbox.js';
import { ALL_SYNCED_TABLES } from './syncedTables.js';

/** Rebuild outbox triggers so columns added by migrations 012, 024, and 027 are captured by sync_outbox. */
export const m028RebuildOutboxTriggers: Migration = {
  version: 28,
  name: 'rebuild-outbox-triggers',
  up: (db) => {
    for (const stmt of buildOutboxTriggerStatements(db, ALL_SYNCED_TABLES)) {
      db.exec(stmt);
    }
  },
};
