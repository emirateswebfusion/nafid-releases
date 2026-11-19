import type { Migration } from './runner.js';
export const m026FinancialOutboxOrder: Migration = {
  version: 26,
  name: 'financial-outbox-order',
  up(db) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending_identity
      ON sync_outbox(tenant_id, entity, entity_id) WHERE sent_at IS NULL`);
  },
};
