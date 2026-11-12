import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrap = { getScrapInvoiceByNumber: vi.fn(), getScrapInvoiceList: vi.fn() };
const returns = { getReturnInvoiceByNumber: vi.fn(), getPendingReturnInvoices: vi.fn() };
vi.mock('../../src/data/scrap', () => ({ scrapApi: scrap }));
vi.mock('../../src/data/returns', () => ({ returnsApi: returns }));

const { findScrapCredit, findReturnCredit, lookupScrapCredit, lookupReturnCredit } = await import('../../src/components/billing/deductionLookup');
const { getNumericPart, matchesDocumentNumber } = await import('../../src/utils/pricing/invoiceNumberHelper');

beforeEach(() => vi.resetAllMocks());

describe('document number matching', () => {
  it('extracts digits', () => {
    expect(getNumericPart('SCR-0012/B7')).toBe('00127');
    expect(getNumericPart('ABC')).toBe('');
  });
  it('never matches a query without digits', () => {
    expect(matchesDocumentNumber('SCR-0012', 'SCR')).toBe(false);
    expect(matchesDocumentNumber('SCR-0012', '12')).toBe(true);
  });
});

describe('scrap credit lookup', () => {
  it('applies an exact pending scrap invoice', async () => {
    scrap.getScrapInvoiceByNumber.mockResolvedValue({ totalAmount: 250, paymentStatus: 'PENDING' });
    expect(await lookupScrapCredit('t1', 'SCR-1')).toEqual({ status: 'found', amount: 250, number: 'SCR-1' });
  });
  it('refuses a settled scrap credit', async () => {
    scrap.getScrapInvoiceByNumber.mockResolvedValue({ totalAmount: 250, paymentStatus: 'SETTLED' });
    expect(await lookupScrapCredit('t1', 'SCR-1')).toEqual({ status: 'error', message: 'Scrap credit SCR-1 has already been redeemed.' });
  });
  it('falls back to a loose digit match on pending invoices', async () => {
    scrap.getScrapInvoiceByNumber.mockImplementation(async ({ scrap_invoice_number }) =>
      scrap_invoice_number === 'SCR-0042' ? { totalAmount: 90, paymentStatus: 'PENDING' } : null);
    scrap.getScrapInvoiceList.mockResolvedValue([
      { invoice_number: 'SCR-0042', payment_status: 'SETTLED' },
      { invoice_number: 'SCR-0042', payment_status: 'PENDING' },
    ]);
    expect(await findScrapCredit('t1', '42')).toEqual({ status: 'found', amount: 90, number: 'SCR-0042' });
  });
  it('does not apply an arbitrary credit when the query has no digits', async () => {
    scrap.getScrapInvoiceByNumber.mockResolvedValue(null);
    scrap.getScrapInvoiceList.mockResolvedValue([{ invoice_number: 'SCR-0001', payment_status: 'PENDING' }]);
    expect(await findScrapCredit('t1', 'abc')).toEqual({ status: 'error', message: 'Scrap invoice "abc" not found' });
  });
});

describe('return credit lookup', () => {
  it('refuses a return that was refunded in cash, UPI or card: it cannot also be deducted', async () => {
    returns.getReturnInvoiceByNumber.mockResolvedValue({ return_number: 'RET-7', grand_total: 500, adjusted_amount: 0, refund_method: 'CASH' });
    expect(await lookupReturnCredit('t1', 'RET-7')).toEqual({ status: 'error', message: 'Return RET-7 was refunded by CASH; it cannot also be deducted.' });
  });
  it('uses the stored return number when the cashier typed a short form', async () => {
    returns.getReturnInvoiceByNumber.mockResolvedValue({ return_number: 'POS1-RTN-007', grand_total: 500, adjusted_amount: 0, refund_method: 'ADJUST_BILL' });
    expect(await lookupReturnCredit('t1', '7')).toEqual({ status: 'found', amount: 500, number: 'POS1-RTN-007' });
  });
  it('deducts only the unadjusted remainder', async () => {
    returns.getReturnInvoiceByNumber.mockResolvedValue({ grand_total: 500, adjusted_amount: 120 });
    expect(await lookupReturnCredit('t1', 'RET-1')).toEqual({ status: 'found', amount: 380, number: 'RET-1' });
  });
  it('rejects a fully adjusted return', async () => {
    returns.getReturnInvoiceByNumber.mockResolvedValue({ grand_total: 500, adjusted_amount: 500 });
    expect(await lookupReturnCredit('t1', 'RET-1')).toEqual({ status: 'error', message: 'Return already fully adjusted' });
  });
  it('reports not found when nothing matches', async () => {
    returns.getReturnInvoiceByNumber.mockResolvedValue(null);
    returns.getPendingReturnInvoices.mockResolvedValue([]);
    expect(await findReturnCredit('t1', 'RET-9')).toEqual({ status: 'error', message: 'Return "RET-9" not found' });
  });
});
