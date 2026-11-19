import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { applyRow } from '../../electron/db/statements/sync/outboxSync';
it.each(['CASH', 'CARD', 'ADJUST_BILL'])('preserves legacy cloud return method %s in a new sequence download', method => {
  const raw = new DatabaseSync(':memory:');
  try {
    raw.exec('CREATE TABLE returns(return_id TEXT PRIMARY KEY,tenant_id TEXT,refund_method TEXT,sync_status TEXT)');
    applyRow(raw as unknown as Database.Database, 'returns', { return_id: 'r', tenant_id: 't', refund_method: null, payment_method: method }, 't');
    expect(raw.prepare('SELECT refund_method FROM returns').get()?.refund_method).toBe(method);
    applyRow(raw as unknown as Database.Database, 'returns', { return_id: 'r', tenant_id: 't', refund_method: 'CREDIT', payment_method: method }, 't');
    expect(raw.prepare('SELECT refund_method FROM returns').get()?.refund_method).toBe('CREDIT');
  } finally { raw.close(); }
});
