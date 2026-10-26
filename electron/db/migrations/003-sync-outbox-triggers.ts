import type { Migration } from './runner.js';
import * as outboxSql from '../statements/outbox.js';
import { SYNCED_TABLES } from './002-sync-outbox.js';

/** Records local row changes in sync_outbox and suppresses changes applied from a remote peer. */
export const m003SyncOutboxTriggers: Migration = {
  version: 3,
  name: 'sync-outbox-triggers',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS sync_apply_guard (
        id INTEGER PRIMARY KEY CHECK (id = 1)
      );
    `);
    db.prepare("INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('origin', lower(hex(randomblob(4))))").run();

    for (const statement of outboxSql.buildOutboxTriggerStatements(db, SYNCED_TABLES)) {
      db.exec(statement);
    }
  },
};
