import type { Migration } from './runner.js';
export const m025PreservePartyIdentities: Migration = {
  version: 25,
  name: 'preserve-party-identities',
  up(db) {
    db.exec('DROP INDEX IF EXISTS idx_parties_tenant_name_phone_customer');
    // Force a complete account/ledger download; no existing account is merged, restored or deleted.
    db.prepare("DELETE FROM sync_meta WHERE key LIKE 'pull_cursor:%:parties' OR key LIKE 'pull_cursor:%:party_ledger'").run();
  },
};
