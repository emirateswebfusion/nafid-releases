/** A bill that does not count as revenue (filing-only or excluded B2B/B2C) moves no money anywhere. */
import { describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
const { syncInvoiceCreditLedger } = await import('../../electron/services/partyLedgerService');
const { adjustPaymentSourcesForInvoice, getCashAmountFromInvoice } = await import('../../electron/services/cashDrawerService');

/** Any database access fails the test: a non-revenue bill must not read or write ledgers or accounts. */
const untouchable = new Proxy({}, { get: () => { throw new Error('database touched for a non-revenue bill'); } }) as unknown as Database.Database;
const bill = {
  counts_in_revenue: 0, invoice_id: 'i', tenant_id: 't', invoice_number: 'GST-1', invoice_type: 'GST',
  grand_total: 500, received_amount: 500, balance_amount: 0, customer_id: 'c', customer_name: 'Acme',
};

describe('non-revenue bills move no money', () => {
  it('post nothing to the credit ledger, on save or on delete', () => {
    expect(() => syncInvoiceCreditLedger(untouchable, { ...bill, payment_method: 'CREDIT', balance_amount: 500 })).not.toThrow();
    expect(() => syncInvoiceCreditLedger(untouchable, { ...bill, payment_method: 'CREDIT' }, true)).not.toThrow();
  });

  it('post nothing to UPI / bank / card accounts and no drawer cash', () => {
    expect(() => adjustPaymentSourcesForInvoice(untouchable, 't', { ...bill, payment_method: 'UPI' })).not.toThrow();
    expect(() => adjustPaymentSourcesForInvoice(untouchable, 't', { ...bill, payment_method: 'UPI' }, true)).not.toThrow();
    expect(getCashAmountFromInvoice({ ...bill, payment_method: 'CASH' })).toBe(0);
  });
});
