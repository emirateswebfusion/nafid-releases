import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { MANUAL_SYNC_TABLES, pendingUploadRows, retryCandidates, retryTransportOperation, pendingOperations } from '../../electron/db/statements/sync/manualSync';
it('counts pending/failed source rows with tenant isolation and refuses missing schema', () => {
  const raw = new DatabaseSync(':memory:');
  const db = raw as unknown as Database.Database;
  try {
    expect(() => pendingUploadRows(db, 'shop')).toThrow('missing');
    for (const table of MANUAL_SYNC_TABLES) raw.exec(`CREATE TABLE "${table}"(tenant_id TEXT,sync_status TEXT)`);
    raw.exec(`INSERT INTO parties VALUES('shop','PENDING'),('shop','FAILED'),('other','PENDING'),('shop','SYNCED');
      INSERT INTO customers VALUES('shop','PENDING'); INSERT INTO settings VALUES('shop','LOCAL')`);
    expect(pendingUploadRows(db, 'shop')).toBe(3);
    raw.exec("INSERT INTO parties VALUES('global','PENDING'),('unset','FAILED'),(NULL,'PENDING')");
    expect(pendingUploadRows(db, 'shop')).toBe(6);
  } finally { raw.close(); }
});
it('one retry preserves operation identity, payload, order and other tenants; changed errors cannot be reset', () => {
  const raw = new DatabaseSync(':memory:');
  const db = raw as unknown as Database.Database;
  try {
    raw.exec(`CREATE TABLE sync_outbox(op_id TEXT PRIMARY KEY,tenant_id TEXT,last_error TEXT,attempts INTEGER,sent_at TEXT,payload TEXT,entity TEXT);
      INSERT INTO sync_outbox VALUES('first','shop','Outbox HTTP 503',10,NULL,'immutable-first','products'),('second','shop','Sync conflict:',10,NULL,'immutable-second','parties'),('foreign','other','Outbox HTTP 503',10,NULL,'foreign','products')`);
    expect(retryCandidates(db).all('shop')).toHaveLength(2);
    const retry = retryTransportOperation(db);
    expect(retry.run('shop', 'first', 'Outbox HTTP 503').changes).toBe(1);
    expect(retry.run('shop', 'second', 'Outbox HTTP 503').changes).toBe(0);
    expect(retry.run('shop', 'foreign', 'Outbox HTTP 503').changes).toBe(0);
    expect(raw.prepare('SELECT op_id,payload,attempts FROM sync_outbox ORDER BY rowid').all()).toEqual([
      { op_id: 'first', payload: 'immutable-first', attempts: 9 }, { op_id: 'second', payload: 'immutable-second', attempts: 10 }, { op_id: 'foreign', payload: 'foreign', attempts: 10 },
    ]);
    expect(pendingOperations(db).get('shop')).toEqual({ n: 2, exhausted: 1 });
  } finally { raw.close(); }
});
