import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
import { get, getAll } from '../../electron/services/settingsService';

it('keeps plain and JSON-encoded numeric UAE TRNs as text in both settings reads', () => {
  const raw = new DatabaseSync(':memory:');
  state.db = raw as unknown as Database.Database;
  raw.exec('CREATE TABLE settings (tenant_id TEXT, key TEXT, value TEXT, updated_at TEXT)');
  for (const value of ['100000000000003', '"100000000000003"', '000000000000001', '32ABCDE1234F1Z5']) {
    raw.exec('DELETE FROM settings');
    raw.prepare('INSERT INTO settings VALUES (?, ?, ?, ?)').run('t', 'shop_gstin', value, '2026-10-29');
    const expected = value.replace(/^"|"$/g, '');
    expect(get({ tenant_id: 't', key: 'shop_gstin' })).toBe(expected);
    expect(getAll({ tenant_id: 't' }).shop_gstin).toBe(expected);
  }
  raw.close();
});
