import type { Db } from '../types.js';
export const read = (db: Db) => db.prepare('SELECT value FROM sync_meta WHERE key = ?');
export const write = (db: Db) => db.prepare('INSERT INTO sync_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
export const remove = (db: Db) => db.prepare('DELETE FROM sync_meta WHERE key = ?');
export const countConflicts = (db: Db) => db.prepare('SELECT COUNT(*) n FROM sync_meta WHERE key LIKE ?');
export const pendingAccounts = (db: Db) => db.prepare(`SELECT
  (SELECT COUNT(*) FROM parties WHERE tenant_id=? AND sync_status IN ('PENDING','FAILED')) +
  (SELECT COUNT(*) FROM party_ledger WHERE tenant_id=? AND sync_status IN ('PENDING','FAILED')) AS n`);
export const acknowledgeVersion = (db: Db, table: 'parties' | 'party_ledger') => db.prepare(`UPDATE ${table}
  SET row_version = ?, origin = ?, sync_status = 'SYNCED' WHERE ${table === 'parties' ? 'party_id' : 'ledger_id'} = ? AND tenant_id = ?
  AND row_version IS ? AND updated_at IS ?`);

/** Retained support markers only count when the matching shop record is still awaiting upload. */
export const activeAccountConflicts = (db: Db) => db.prepare(`SELECT
  (SELECT COUNT(*) FROM parties p JOIN sync_meta m ON m.key='account_conflict:'||p.tenant_id||':parties:'||p.party_id
    WHERE p.tenant_id=? AND p.sync_status IN ('PENDING','FAILED')) +
  (SELECT COUNT(*) FROM party_ledger l JOIN sync_meta m ON m.key='account_conflict:'||l.tenant_id||':party_ledger:'||l.ledger_id
    WHERE l.tenant_id=? AND l.sync_status IN ('PENDING','FAILED')) AS n`);
