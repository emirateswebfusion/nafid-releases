import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));

import { m017UaeEinvoicing } from '../../electron/db/migrations/017-uae-einvoicing';
import { getCustomerEinvoiceProfile, getEinvoiceStatuses, getEinvoiceSummary, sanitizeEinvoiceProfile, saveCustomerEinvoiceProfile } from '../../electron/services/einvoiceService';
import { upsertEinvoiceDocument } from '../../electron/db/statements/einvoice';
import { insertCustomers } from '../../electron/db/statements/sync/partiesSync';
import { buyerProfileIssues, compactProfile, einvoiceErrorLines, einvoiceStatusLabel, needsPaperCopy, parseBuyerProfile } from '../../src/utils/einvoice/einvoice';

let raw: DatabaseSync;
const T = 'tenant_uae';

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  state.db = Object.assign(raw, { transaction: (fn: () => unknown) => () => fn() }) as unknown as Database.Database;
  createCoreTables(state.db);
  createExtendedTables(state.db);
  ensureSchemaColumns(state.db);
  m017UaeEinvoicing.up(state.db);
  state.db.prepare("INSERT INTO customers (customer_id, tenant_id, name, phone, sync_status) VALUES ('c1', ?, 'Buyer LLC', '0501', 'SYNCED')").run(T);
});

afterEach(() => raw.close());

const doc = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  document_id: id, tenant_id: T, document_kind: 'INVOICE', document_number: `INV-${id}`, document_type: 'TAX', status,
  buyer_endpoint: '1009876543', provider_id: 'sandbox', asp_reference: null, fta_reference: null, errors: '[]', attempts: 0,
  submitted_at: null, created_at: '2027-07-01 10:00:00', updated_at: '2027-07-01 10:00:00', ...extra,
});

describe('UAE e-invoicing on the terminal (migration 017, status mirror, customer profile)', () => {
  it('migration 017 is idempotent and adds the profile column and mirror table', () => {
    m017UaeEinvoicing.up(state.db);
    const cols = (state.db.prepare('PRAGMA table_info(customers)').all() as { name: string }[]).map(c => c.name);
    expect(cols).toContain('einvoice_profile');
    expect(state.db.prepare("SELECT name FROM sqlite_master WHERE name = 'einvoice_documents'").get()).toBeTruthy();
  });

  it('mirrors server statuses and returns only the requested, tenant-scoped documents', () => {
    const upsert = upsertEinvoiceDocument(state.db);
    upsert.run(doc('a', 'QUEUED'));
    upsert.run(doc('a', 'REPORTED', { fta_reference: 'FTA-1', updated_at: '2027-07-01 10:05:00' }));
    upsert.run(doc('b', 'VALIDATION_FAILED', { errors: '[{"rule":"ibr-184-ae","message":"HS code missing"}]' }));
    upsert.run(doc('c', 'NOT_REQUIRED', { tenant_id: 'other' }));
    const rows = getEinvoiceStatuses({ tenant_id: T, document_ids: ['a', 'b', 'c', 7] }) as { document_id: string; status: string; fta_reference: string | null }[];
    expect(rows.map(r => [r.document_id, r.status, r.fta_reference]).sort()).toEqual([['a', 'REPORTED', 'FTA-1'], ['b', 'VALIDATION_FAILED', null]]);
    expect(getEinvoiceStatuses({ tenant_id: T, document_ids: [] })).toEqual([]);
    expect(getEinvoiceSummary({ tenant_id: T })).toHaveLength(2);
  });

  it('saves a sanitized buyer profile and marks the customer for sync', () => {
    const result = saveCustomerEinvoiceProfile({ tenant_id: T, customer_id: 'c1', profile: { isBusiness: true, trn: '100987654300003', street: ' Al Wahda ', city: 'Sharjah', emirate: 'SHARJAH', junk: 'x', notOnPeppol: 'yes' } });
    expect(result).toEqual({ success: true });
    const row = getCustomerEinvoiceProfile({ tenant_id: T, customer_id: 'c1' }) as { einvoice_profile: string };
    expect(JSON.parse(row.einvoice_profile)).toEqual({ trn: '100987654300003', street: 'Al Wahda', city: 'Sharjah', emirate: 'SHARJAH', isBusiness: true });
    expect((state.db.prepare("SELECT sync_status FROM customers WHERE customer_id = 'c1'").get() as { sync_status: string }).sync_status).toBe('PENDING');
    expect(saveCustomerEinvoiceProfile({ tenant_id: T, customer_id: 'c1', profile: { trn: '123' } }).success).toBe(false);
    expect(saveCustomerEinvoiceProfile({ tenant_id: T, customer_id: 'missing', profile: {} })).toEqual({ success: false, error: 'Customer not found' });
    expect(sanitizeEinvoiceProfile([]).error).toBeTruthy();
    expect(sanitizeEinvoiceProfile({ legalIdType: 'XX' }).error).toBeTruthy();
  });

  it('customer pull keeps the local profile when an older server sends none, and takes the server copy otherwise', () => {
    state.db.prepare("UPDATE customers SET einvoice_profile = '{\"isBusiness\":true}' WHERE customer_id = 'c1'").run();
    const pull = insertCustomers(state.db);
    const row = { customer_id: 'c1', tenant_id: T, name: 'Buyer LLC', phone: '0501', address: null, pricing_tier_id: null, total_points_earned: 0, total_points_redeemed: 0, current_points_balance: 0, last_purchase_date: null, is_deleted: 0, created_at: '2027-07-01 10:00:00', updated_at: '2027-07-02 10:00:00' };
    pull.run({ ...row, einvoice_profile: null });
    expect((getCustomerEinvoiceProfile({ tenant_id: T, customer_id: 'c1' }) as { einvoice_profile: string }).einvoice_profile).toBe('{"isBusiness":true}');
    pull.run({ ...row, einvoice_profile: '{"isBusiness":true,"trn":"100987654300003"}' });
    expect((getCustomerEinvoiceProfile({ tenant_id: T, customer_id: 'c1' }) as { einvoice_profile: string }).einvoice_profile).toContain('100987654300003');
  });
});

describe('UAE e-invoicing renderer rules', () => {
  it('buyer profile checks mirror the PINT AE buyer rules', () => {
    expect(buyerProfileIssues({})).toEqual([]);
    expect(buyerProfileIssues({ isBusiness: true })).toHaveLength(2);
    expect(buyerProfileIssues({ isBusiness: true, trn: '100987654300003', street: 's', city: 'c', emirate: 'DUBAI' })).toEqual([]);
    expect(buyerProfileIssues({ isBusiness: true, legalId: 'CN-1', legalIdType: 'TL', street: 's', city: 'c', emirate: 'DUBAI' })).toEqual(['Enter the trade licence issuing authority']);
    expect(buyerProfileIssues({ isBusiness: true, countryCode: 'KW', street: 's', city: 'c', emirate: 'Asimah' })).toEqual([]);
    expect(buyerProfileIssues({ isBusiness: true, trn: '100987654300003', street: 's', city: 'c', emirate: 'DUBAI', peppolId: 'x' })).toHaveLength(1);
  });

  it('parses, compacts and labels', () => {
    expect(parseBuyerProfile('not json')).toEqual({});
    expect(parseBuyerProfile('[1]')).toEqual({});
    expect(compactProfile({ isBusiness: false, trn: '', city: 'Dubai' })).toEqual({ city: 'Dubai' });
    expect(einvoiceStatusLabel('REPORTED')).toEqual({ label: 'Reported to FTA', tone: 'success' });
    expect(einvoiceStatusLabel(undefined).label).toBe('Not synced');
    expect(needsPaperCopy('9900000098')).toBe(true);
    expect(needsPaperCopy('1009876543')).toBe(false);
    expect(einvoiceErrorLines('[{"rule":"r","message":"HS code missing"}]')).toEqual(['HS code missing']);
    expect(einvoiceErrorLines('oops')).toEqual([]);
  });
});
