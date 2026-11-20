import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { accountIssues } from '../../electron/db/statements/sync/supportReport';
it('includes waiting and failed records without conflict markers, excludes synced and foreign rows', () => {
  const raw = new DatabaseSync(':memory:');
  try {
    raw.exec(`CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE parties(party_id TEXT,tenant_id TEXT,sync_status TEXT,row_version INTEGER,updated_at TEXT);
      CREATE TABLE party_ledger(ledger_id TEXT,tenant_id TEXT,sync_status TEXT,row_version INTEGER,updated_at TEXT);
      INSERT INTO parties VALUES('waiting','shop','PENDING',1,'2026-11-20'),('synced','shop','SYNCED',2,'2026-11-20'),('foreign','other','PENDING',1,'2026-11-20');
      INSERT INTO party_ledger VALUES('failed','shop','FAILED',3,'2026-11-20'),('conflict','shop','PENDING',4,'2026-11-20');
      INSERT INTO sync_meta VALUES('account_conflict:shop:party_ledger:conflict','Sync conflict: newer cloud copy');`);
    const rows = accountIssues(raw as unknown as Database.Database).all('shop', 'shop') as { entity_id: string; reason: string | null }[];
    expect(rows.map(row => row.entity_id).sort()).toEqual(['conflict', 'failed', 'waiting']);
    expect(rows.find(row => row.entity_id === 'waiting')?.reason).toBeNull();
    expect(rows.find(row => row.entity_id === 'conflict')?.reason).toContain('Sync conflict');
  } finally { raw.close(); }
});
