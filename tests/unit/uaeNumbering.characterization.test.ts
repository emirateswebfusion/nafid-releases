import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import type { ServiceDb } from '../../electron/services/typesB';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
vi.mock('../../electron/services/authStorage', () => ({ readAuthPayload: () => ({ jwt_token: 'test-token' }) }));
vi.mock('../../electron/sync/syncWorker', () => ({ getSyncEndpoints: () => ({ primaryRoute: 'CLOUD', primaryUrl: 'https://test.invalid' }) }));
import { getGuaranteedNextInvoiceNumber, peekGuaranteedNextInvoiceNumber, requestServerInvoiceNumber } from '../../electron/services/invoiceNumberService';

afterEach(() => vi.unstubAllGlobals());
function shop(country: 'IN' | 'AE', prefix?: string) {
  const raw = new DatabaseSync(':memory:');
  const db = raw as unknown as ServiceDb;
  createCoreTables(db);
  raw.prepare('INSERT INTO settings(tenant_id,key,value) VALUES (?,?,?)').run('test', 'store_country', country);
  raw.prepare('INSERT INTO settings(tenant_id,key,value) VALUES (?,?,?)').run('global', 'terminal_code', 'TEST');
  if (prefix) raw.prepare('INSERT INTO settings(tenant_id,key,value) VALUES (?,?,?)').run('global', 'gst_invoice_counter_config', JSON.stringify({ prefix, counter: 7 }));
  return { raw, db };
}

it.each([
  ['IN', undefined, 'GST-001'], ['AE', undefined, 'VAT-001'],
  ['IN', 'GST-', 'GST-007'], ['AE', 'GST-', 'VAT-007'], ['AE', 'SHOP-', 'SHOP-007'],
] as const)('keeps peek and allocation consistent for %s / %s', (country, prefix, expected) => {
  const { raw, db } = shop(country, prefix);
  const before = peekGuaranteedNextInvoiceNumber(db, 'test', 'gst_invoice_counter_config');
  expect(before.invoiceNumber).toBe(expected);
  expect(peekGuaranteedNextInvoiceNumber(db, 'test', 'gst_invoice_counter_config')).toEqual(before);
  expect(getGuaranteedNextInvoiceNumber(db, 'test', 'gst_invoice_counter_config')).toEqual(before);
  expect(peekGuaranteedNextInvoiceNumber(db, 'test', 'gst_invoice_counter_config').counter).toBe(before.counter + 1);
  raw.close();
});

it('skips an existing VAT number without changing historical GST identities', () => {
  const { raw, db } = shop('AE', 'GST-');
  raw.exec("INSERT INTO invoices(invoice_id,tenant_id,invoice_number,invoice_type) VALUES ('old','test','GST-007','GST'),('used','test','VAT-007','GST')");
  expect(getGuaranteedNextInvoiceNumber(db, 'test', 'gst_invoice_counter_config').invoiceNumber).toBe('VAT-008');
  expect(raw.prepare("SELECT invoice_number FROM invoices WHERE invoice_id='old'").get()?.invoice_number).toBe('GST-007');
  raw.close();
});

it('sends the same UAE prefix to online allocation and retains custom series', async () => {
  const { raw, db } = shop('AE', 'GST-');
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ invoiceNumber: 'VAT-007' }) }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await requestServerInvoiceNumber(db, 'test', undefined, 'gst_invoice_counter_config')).toMatchObject({ success: true, invoiceNumber: 'VAT-007' });
  const url = new URL(String(fetchMock.mock.calls[0][0]));
  expect(url.searchParams.get('prefix')).toBe('VAT-');
  expect(peekGuaranteedNextInvoiceNumber(db, 'test', 'gst_invoice_counter_config').invoiceNumber).toBe('VAT-008');
  raw.close();
});

it('bounds online allocation wait and preserves local fallback numbering', async () => {
  const { raw, db } = shop('IN');
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  vi.stubGlobal('fetch', vi.fn((_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
  })));
  const started = performance.now();
  try {
    expect(await requestServerInvoiceNumber(db, 'test', undefined, 'invoice_counter_config')).toMatchObject({ success: false, offline: true });
    expect(timeout).toHaveBeenCalledWith(750);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(getGuaranteedNextInvoiceNumber(db, 'test').invoiceNumber).toBe('TEST-001');
    expect(getGuaranteedNextInvoiceNumber(db, 'test').invoiceNumber).toBe('TEST-002');
  } finally { timeout.mockRestore(); raw.close(); }
});
