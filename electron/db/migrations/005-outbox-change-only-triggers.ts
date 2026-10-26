import type { Migration } from './runner.js';
import * as outboxSql from '../statements/outbox.js';
import { SYNCED_TABLES } from './002-sync-outbox.js';

/** Re-creates the outbox triggers so an UPDATE records an op only when a business column changes (003 also fired on
 * same-value updates, e.g. ~2,100 party / ledger balance rewrites per start). Clears the unsent ops recorded so far:
 * no terminal used the outbox engine before this release, and legacy sync already pushed those rows. */
export const m005OutboxChangeOnlyTriggers: Migration = {
  version: 5,
  name: 'outbox-change-only-triggers',
  up: (db) => {
    for (const statement of outboxSql.buildOutboxTriggerStatements(db, SYNCED_TABLES)) {
      db.exec(statement);
    }
    db.exec('DELETE FROM sync_outbox WHERE sent_at IS NULL');
  },
};
