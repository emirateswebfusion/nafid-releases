import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { accountPushRows, accountPushResult, rememberAccountBase, pendingAccountConflicts, accountSyncNotice } from '../../electron/sync/accountMetadata';

it('captures a cloud baseline, retains a concurrent local edit and displays unresolved conflicts', () => {
  const raw = new DatabaseSync(':memory:');
  const db = raw as unknown as Database.Database;
  try {
    raw.exec(`CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY);
      CREATE TABLE party_ledger(ledger_id TEXT,tenant_id TEXT,sync_status TEXT);
      CREATE TABLE parties(party_id TEXT PRIMARY KEY,tenant_id TEXT,party_type TEXT,custom_category TEXT,row_version INTEGER,origin TEXT,updated_at TEXT,sync_status TEXT);
      INSERT INTO parties VALUES('p','shop','CUSTOM','Chitty',6,'A','2026-11-19T10:00:00Z','PENDING');`);
    rememberAccountBase(db, 'shop', 'parties', { party_id: 'p', row_version: 5, origin: 'cloud', server_seq: '90' });
    const sent = [raw.prepare('SELECT * FROM parties').get()!];
    expect(accountPushRows(db, 'shop', 'parties', sent)[0]._sync_base).toBe('5:cloud');
    raw.exec("UPDATE parties SET custom_category='Next month',row_version=7");
    accountPushResult(db, 'shop', 'parties', sent, { synced: ['p'], failed: [], versions: [{ id: 'p', base: '6:A', row_version: 6, origin: 'A' }] });
    expect(raw.prepare('SELECT custom_category,row_version,sync_status FROM parties').get()).toEqual({ custom_category: 'Next month', row_version: 7, sync_status: 'PENDING' });
    expect(accountPushRows(db, 'shop', 'parties', sent)[0]._sync_base).toBe('6:A');
    expect(accountSyncNotice(db, 'shop')).toContain('waiting to upload');
    accountPushResult(db, 'shop', 'parties', [], { synced: [], failed: [{ party_id: 'p', error: 'Sync conflict: newer cloud copy' }] });
    expect(pendingAccountConflicts(db, 'shop')).toBe(1);
    raw.exec("UPDATE parties SET sync_status='SYNCED'");
    expect(pendingAccountConflicts(db, 'shop')).toBe(0);
    expect(accountSyncNotice(db, 'shop')).toBeNull();
    expect(raw.prepare("SELECT COUNT(*) n FROM sync_meta WHERE key LIKE 'account_conflict:%'").get()?.n).toBe(1);
  } finally { raw.close(); }
});
