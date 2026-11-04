import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { m017HistoricalCreditNotes } from '../../electron/db/migrations/017-historical-credit-notes';
import type { Migration } from '../../electron/db/migrations/runner';

it.each([false,true])('preserves returns, children and triggers; accepts no invoice (foreign keys %s)', foreignKeys => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=${foreignKeys ? 'ON' : 'OFF'}; CREATE TABLE invoices(invoice_id TEXT PRIMARY KEY); INSERT INTO invoices VALUES ('i');
      CREATE TABLE returns(return_id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(invoice_id), extra TEXT, UNIQUE(return_id,invoice_id));
      CREATE TABLE return_items(id TEXT PRIMARY KEY,return_id TEXT REFERENCES returns(return_id));
      CREATE TABLE events(id TEXT); CREATE INDEX return_extra ON returns(extra);
      CREATE TRIGGER return_insert AFTER INSERT ON returns BEGIN INSERT INTO events VALUES(new.return_id); END;
      INSERT INTO returns VALUES ('r','i','kept'); INSERT INTO return_items VALUES ('child','r');`);
    db.exec('BEGIN');
    m017HistoricalCreditNotes.up(db as unknown as Parameters<Migration['up']>[0]);
    db.exec('COMMIT');
    expect(db.prepare('SELECT * FROM returns').all()).toEqual([{return_id:'r',invoice_id:'i',extra:'kept'}]);
    expect(db.prepare('SELECT * FROM return_items').all()).toEqual([{id:'child',return_id:'r'}]);
    db.prepare('INSERT INTO returns VALUES (?,?,?)').run('manual',null,'historical');
    expect(db.prepare('SELECT id FROM events ORDER BY id').all()).toEqual([{id:'manual'},{id:'r'}]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='return_extra'").get()).toBeTruthy();
    m017HistoricalCreditNotes.up(db as unknown as Parameters<Migration['up']>[0]);
  } finally { db.close(); }
});
