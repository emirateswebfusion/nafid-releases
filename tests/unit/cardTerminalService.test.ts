import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { m015CardTerminalTransactions } from '../../electron/db/migrations/015-card-terminal-transactions';
import { MockTerminal } from '../../electron/hardware/cardTerminal/adapters/mock';
import { maskPan, toMinor, type PaymentTerminal } from '../../electron/hardware/cardTerminal/types';

const state = vi.hoisted(() => ({
  db: null as unknown as Database.Database,
  factory: null as null | (() => PaymentTerminal),
}));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('electron-log/main', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../electron/hardware/cardTerminal/registry', () => ({
  INSTALLED_PROVIDERS: ['MOCK'],
  createTerminal: () => (state.factory ? state.factory() : new MockTerminal(1)),
}));
import * as service from '../../electron/services/cardTerminalService';

let raw: DatabaseSync;
let configSeq = 0;
const configure = (config: Record<string, unknown>) => {
  // A new connection value each time, so the service builds a fresh adapter (no state shared between tests).
  configSeq += 1;
  raw.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value, sync_status) VALUES ('global', 'card_terminal_config', ?, 'LOCAL')")
    .run(JSON.stringify({ enabled: true, provider: 'MOCK', connection: { type: 'SERIAL', path: `COM${configSeq}`, baudRate: 9600 }, ...config }));
};
const row = (ecrRef: string) => raw.prepare('SELECT * FROM card_terminal_transactions WHERE ecr_ref = ?').get(ecrRef) as Record<string, unknown>;

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = raw as unknown as Database.Database;
  state.factory = null;
  createCoreTables(state.db);
  m015CardTerminalTransactions.up(state.db);
  configure({});
});
afterEach(() => raw.close());

describe('card terminal rules', () => {
  it('keeps only the last 4 card digits', () => {
    expect(maskPan('476173******0010')).toBe('****0010');
    expect(maskPan('4761 7390 0101 0010')).toBe('****0010');
    expect(maskPan('****')).toBeNull();
    expect(maskPan(undefined)).toBeNull();
  });

  it('converts amounts to fils without float drift', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(105.505)).toBe(10551);
    expect(toMinor(1.005)).toBe(101);
  });
});

describe('cardTerminalService', () => {
  it('does nothing while the terminal is turned off', async () => {
    configure({ enabled: false });
    const res = await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 10 });
    expect(res.outcome).toBe('ERROR');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM card_terminal_transactions').get()).toEqual({ n: 0 });
  });

  it('journals an approved sale with the masked card only', async () => {
    const res = await service.sale({ tenant_id: 't', invoice_id: 'inv-1', amount: 105.5, currency: 'AED' });
    expect(res).toMatchObject({ outcome: 'APPROVED', amount: 105.5, masked_pan: '****0010', scheme: 'VISA', provider: 'MOCK' });
    expect(res.auth_code).toMatch(/^\d{6}$/);
    expect(row(res.ecr_ref)).toMatchObject({ status: 'APPROVED', amount_minor: 10550, invoice_id: 'inv-1', kind: 'SALE', masked_pan: '****0010', resolved_by: 'DEVICE' });
  });

  it('writes the journal row before anything is sent to the device', async () => {
    let seen: unknown = null;
    state.factory = () => Object.assign(new MockTerminal(1), {
      sale: async (req: { ecrRef: string; amountMinor: number }) => {
        seen = row(req.ecrRef)?.status;
        return { outcome: 'DECLINED' as const, ecrRef: req.ecrRef, amountMinor: req.amountMinor };
      },
    });
    configure({});
    await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 5 });
    expect(seen).toBe('SENT');
  });

  it('reports a decline', async () => {
    const res = await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 20.51 });
    expect(res.outcome).toBe('DECLINED');
    expect(row(res.ecr_ref).status).toBe('DECLINED');
  });

  it('asks the terminal when the answer is lost instead of charging again', async () => {
    const res = await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 20.54 });
    expect(res.outcome).toBe('APPROVED');
    expect(row(res.ecr_ref).resolved_by).toBe('INQUIRY');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM card_terminal_transactions').get()).toEqual({ n: 1 });
  });

  it('cancels a waiting sale and records what the terminal says', async () => {
    const pending = service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 20.52 });
    await new Promise(r => setTimeout(r, 10));
    expect(service.getStatus().busy).toBe(true);
    expect(await service.cancel()).toEqual({ success: true });
    const res = await pending;
    expect(res.outcome).toBe('CANCELLED');
    expect(service.getStatus().busy).toBe(false);
  });

  it('rejects a second payment while one is running', async () => {
    const first = service.sale({ tenant_id: 't', invoice_id: 'a', amount: 20.52 });
    await new Promise(r => setTimeout(r, 5));
    const second = await service.sale({ tenant_id: 't', invoice_id: 'b', amount: 10 });
    expect(second.outcome).toBe('ERROR');
    expect(second.message).toMatch(/in progress/);
    await service.cancel();
    await first;
  });

  it('leaves an unanswered payment for the cashier to resolve from the slip', async () => {
    state.factory = () => Object.assign(new MockTerminal(1), {
      sale: async () => { throw new Error('port closed'); },
      inquire: async (ecrRef: string) => ({ outcome: 'UNKNOWN' as const, ecrRef, amountMinor: 0 }),
    });
    configure({});
    const res = await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 40 });
    expect(res.outcome).toBe('UNKNOWN');
    expect(service.listUnresolved({ tenant_id: 't' }).map(r => r.ecr_ref)).toEqual([res.ecr_ref]);
    expect(service.resolve({ ecr_ref: res.ecr_ref, outcome: 'APPROVED', auth_code: 'A1B2C3' })).toEqual({ success: true });
    expect(row(res.ecr_ref)).toMatchObject({ status: 'APPROVED', auth_code: 'A1B2C3', resolved_by: 'CASHIER' });
    expect(service.listUnresolved({ tenant_id: 't' })).toEqual([]);
    expect(service.resolve({ ecr_ref: res.ecr_ref, outcome: 'DECLINED' }).success).toBe(false);
  });

  it('never accepts an answer for another amount', async () => {
    state.factory = () => Object.assign(new MockTerminal(1), {
      sale: async (req: { ecrRef: string }) => ({ outcome: 'APPROVED' as const, ecrRef: req.ecrRef, amountMinor: 1 }),
    });
    configure({});
    const res = await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 40 });
    expect(res.outcome).toBe('UNKNOWN');
  });

  it('voids an approved sale and marks it voided', async () => {
    const sale = await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 12 });
    const voided = await service.voidSale({ ecr_ref: sale.ecr_ref });
    expect(voided.outcome).toBe('APPROVED');
    expect(row(sale.ecr_ref).status).toBe('VOIDED');
    expect(row(voided.ecr_ref)).toMatchObject({ kind: 'VOID', original_ecr_ref: sale.ecr_ref, amount_minor: 1200 });
    expect((await service.voidSale({ ecr_ref: sale.ecr_ref })).outcome).toBe('ERROR');
  });

  it('refunds linked to the original sale', async () => {
    const sale = await service.sale({ tenant_id: 't', invoice_id: 'inv', amount: 30 });
    const res = await service.refund({ tenant_id: 't', invoice_id: 'inv', amount: 10, original_ecr_ref: sale.ecr_ref });
    expect(res.outcome).toBe('APPROVED');
    expect(row(res.ecr_ref)).toMatchObject({ kind: 'REFUND', original_ecr_ref: sale.ecr_ref, amount_minor: 1000 });
  });

  it('rejects invalid amounts', async () => {
    for (const amount of [0, -5, 'abc', 2_000_000]) {
      expect((await service.sale({ tenant_id: 't', invoice_id: 'inv', amount })).outcome).toBe('ERROR');
    }
  });

  it('reads the bill split details for edits', () => {
    raw.exec(`INSERT INTO invoices (invoice_id, tenant_id, invoice_number, grand_total, split_details) VALUES ('inv-9', 't', '9', 10, '{"card":10}')`);
    expect(service.billSplitDetails({ invoice_id: 'inv-9' })).toEqual({ split_details: '{"card":10}' });
    expect(service.billSplitDetails({ invoice_id: 'nope' })).toEqual({ split_details: null });
  });

  it('falls back to defaults for a broken setting', () => {
    raw.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES ('global', 'card_terminal_config', '{bad')").run();
    expect(service.getConfig()).toMatchObject({ enabled: false, provider: 'MOCK', timeoutSeconds: 120, allowManualFallback: true });
  });
});
