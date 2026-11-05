import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { m015CardTerminalTransactions } from '../../electron/db/migrations/015-card-terminal-transactions';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('electron-log/main', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
import * as service from '../../electron/services/cardTerminalService';
import { createTerminal, INSTALLED_PROVIDERS } from '../../electron/hardware/cardTerminal/registry';
let raw: DatabaseSync;
afterEach(() => raw?.close());
describe('production card terminal setup', () => {
  it('never charges or approves through a previously enabled MOCK setting', async () => {
    raw = new DatabaseSync(':memory:'); state.db = raw as unknown as Database.Database;
    createCoreTables(state.db); m015CardTerminalTransactions.up(state.db);
    raw.prepare("INSERT INTO settings (tenant_id, key, value) VALUES ('global', 'card_terminal_config', ?)")
      .run(JSON.stringify({ enabled: true, provider: 'MOCK' }));
    expect(service.getConfig()).toMatchObject({ enabled: false, provider: 'UNCONFIGURED' });
    expect(INSTALLED_PROVIDERS).not.toContain('MOCK');
    expect(() => createTerminal({ ...service.getConfig(), provider: 'MOCK' })).toThrow(/setup pending/i);
    expect((await service.sale({ tenant_id: 'shop', invoice_id: 'bill', amount: 10 })).outcome).toBe('ERROR');
    expect((await service.testConnection()).ok).toBe(false);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM card_terminal_transactions').get()).toEqual({ n: 0 });
  });
  it('keeps a shops provider and terminal details pending without enabling a missing connector', () => {
    raw = new DatabaseSync(':memory:'); state.db = raw as unknown as Database.Database;
    createCoreTables(state.db);
    raw.prepare("INSERT INTO settings (tenant_id, key, value) VALUES ('global', 'card_terminal_config', ?)")
      .run(JSON.stringify({ enabled: true, provider: 'NETWORK', merchantId: 'MID-1', terminalId: 'TID-1' }));
    expect(service.getConfig()).toMatchObject({ enabled: false, provider: 'NETWORK', merchantId: 'MID-1', terminalId: 'TID-1' });
    expect(service.getStatus().providers).not.toContain('MOCK');
  });
});
