import { describe, it, expect, vi, beforeEach } from 'vitest';

// Characterization tests: they pin how billing tabs preview document numbers today, including the per-type
// differences in when a tab is retitled. Change them only together with an intended behaviour change.

const invoices = { peekNextInvoiceNumber: vi.fn() };
const scrap = { peekNextScrapInvoiceNumber: vi.fn() };
const quotations = { peekNextQuotationNumber: vi.fn() };
const returns = { peekNextReturnNumber: vi.fn() };
let desktop = true;
let tabs: Record<string, unknown>[] = [];
vi.mock('../../src/data/invoices', () => ({ invoicesApi: invoices }));
vi.mock('../../src/data/scrap', () => ({ scrapApi: scrap }));
vi.mock('../../src/data/quotations', () => ({ quotationsApi: quotations }));
vi.mock('../../src/data/returns', () => ({ returnsApi: returns }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => desktop }));
vi.mock('../../src/store/tabStore', () => ({ useTabStore: { getState: () => ({ tabs }) } }));

const nr = await import('../../src/components/billing/numberReservation');

type AnyTab = Record<string, unknown> & { id: string; title: string };
const tab = (fields: Partial<AnyTab> = {}): AnyTab => ({ id: 't1', title: 'New', ...fields });
function access(active: AnyTab | undefined) {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    getActiveTab: () => active as never,
    updateActiveTab: (u: Record<string, unknown>) => { updates.push(u); },
  };
}
const invoiceCtx = (a: ReturnType<typeof access>, over: Record<string, unknown> = {}) => ({
  tenantId: 'ten', enableThreeInvoiceSeries: false, invoiceType: 'BILL_OF_SUPPLY' as const, customerGstin: '',
  isScrapMode: false, isQuotationMode: false, isReturnMode: false, editingActive: null, ...a, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  desktop = true;
  tabs = [];
});

describe('new tab numbers', () => {
  it('peeks all four series and skips numbers other tabs already show', async () => {
    tabs = [{ reservedInvoiceNumber: 'POS1-009', reservedReturnNumber: 'RTN-004' }];
    invoices.peekNextInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'POS1-009' });
    scrap.peekNextScrapInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'SCR-001' });
    quotations.peekNextQuotationNumber.mockResolvedValue({ success: true, quotationNumber: 'QT-010' });
    returns.peekNextReturnNumber.mockResolvedValue({ success: true, returnNumber: 'RTN-004' });
    expect(await nr.peekNewTabNumbers({ tenantId: 'ten', enableThreeInvoiceSeries: true }))
      .toEqual({ billNumber: 'POS1-010', scrapNumber: 'SCR-001', quotationNumber: 'QT-010', returnNumber: 'RTN-005' });
    expect(invoices.peekNextInvoiceNumber).toHaveBeenCalledWith({ tenant_id: 'ten', series: 'normal' });
    expect(scrap.peekNextScrapInvoiceNumber).toHaveBeenCalledWith({ tenant_id: 'global' });
  });
  it('leaves a number empty when its lookup fails, and does nothing outside the desktop app', async () => {
    invoices.peekNextInvoiceNumber.mockRejectedValue(new Error('db'));
    scrap.peekNextScrapInvoiceNumber.mockResolvedValue({ success: false });
    quotations.peekNextQuotationNumber.mockResolvedValue({ success: true, quotationNumber: 'QT-001' });
    returns.peekNextReturnNumber.mockResolvedValue(null);
    expect(await nr.peekNewTabNumbers({ tenantId: null, enableThreeInvoiceSeries: false }))
      .toEqual({ billNumber: '', scrapNumber: '', quotationNumber: 'QT-001', returnNumber: '' });
    expect(invoices.peekNextInvoiceNumber).toHaveBeenCalledWith({ tenant_id: 'global', series: undefined });
    desktop = false;
    expect(await nr.peekNewTabNumbers({ tenantId: 't', enableThreeInvoiceSeries: false }))
      .toEqual({ billNumber: '', scrapNumber: '', quotationNumber: '', returnNumber: '' });
  });
});

describe('invoice number', () => {
  it('picks the series from invoice type, B2B and the three-series setting', async () => {
    invoices.peekNextInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'X-1' });
    const series = async (over: Record<string, unknown>, t = tab()) => {
      invoices.peekNextInvoiceNumber.mockClear();
      await nr.reserveInvoiceNumber(invoiceCtx(access(t), over));
      return invoices.peekNextInvoiceNumber.mock.calls[0][0].series;
    };
    expect(await series({})).toBeUndefined();
    expect(await series({ invoiceType: 'GST' })).toBe('gst');
    expect(await series({ enableThreeInvoiceSeries: true })).toBe('normal');
    expect(await series({ enableThreeInvoiceSeries: true, invoiceType: 'GST' })).toBe('gst_b2c');
    expect(await series({ enableThreeInvoiceSeries: true, invoiceType: 'GST', customerGstin: '32AB' })).toBe('gst_b2b');
    expect(await series({ enableThreeInvoiceSeries: true, invoiceType: 'GST' }, tab({ isB2B: true }))).toBe('gst_b2b');
  });
  it('does nothing in scrap/quotation/return mode, for a quotation snapshot, or while editing', async () => {
    for (const over of [{ isScrapMode: true }, { isQuotationMode: true }, { isReturnMode: true }, { editingActive: 'inv-1' }]) {
      await nr.reserveInvoiceNumber(invoiceCtx(access(tab()), over));
    }
    await nr.reserveInvoiceNumber(invoiceCtx(access(tab({ snapshot: { isQuotationMode: true } }))));
    await nr.reserveInvoiceNumber(invoiceCtx(access(undefined)));
    expect(invoices.peekNextInvoiceNumber).not.toHaveBeenCalled();
  });
  it('retitles a placeholder tab but keeps a custom title; skips other tabs\' numbers; unchanged numbers are not rewritten', async () => {
    tabs = [{ id: 't2', reservedInvoiceNumber: 'POS1-009' }];
    invoices.peekNextInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'POS1-009' });
    for (const title of ['New', 'Bill 3', 'GST-004', '']) {
      const a = access(tab({ title }));
      await nr.reserveInvoiceNumber(invoiceCtx(a));
      expect(a.updates).toEqual([{ reservedInvoiceNumber: 'POS1-010', title: 'POS1-010' }]);
    }
    const custom = access(tab({ title: 'Ravi order' }));
    await nr.reserveInvoiceNumber(invoiceCtx(custom));
    expect(custom.updates).toEqual([{ reservedInvoiceNumber: 'POS1-010', title: 'Ravi order' }]);
    const same = access(tab({ reservedInvoiceNumber: 'POS1-010', title: 'POS1-010' }));
    await nr.reserveInvoiceNumber(invoiceCtx(same));
    expect(same.updates).toEqual([]);
    await nr.reserveInvoiceNumber(invoiceCtx(same), true);
    expect(same.updates).toEqual([{ reservedInvoiceNumber: 'POS1-010', title: 'POS1-010' }]);
  });
  it('logs and leaves the tab alone when the lookup fails', async () => {
    invoices.peekNextInvoiceNumber.mockRejectedValue(new Error('db'));
    const a = access(tab());
    await nr.reserveInvoiceNumber(invoiceCtx(a));
    expect(a.updates).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('invoice type change', () => {
  it('re-peeks for the new type and always retitles the tab', async () => {
    invoices.peekNextInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'GST-012' });
    const a = access(tab({ title: 'Ravi order' }));
    await nr.refreshInvoiceNumberForType({ tenantId: 'ten', enableThreeInvoiceSeries: true, customerGstin: '', ...a }, 'GST');
    expect(invoices.peekNextInvoiceNumber).toHaveBeenCalledWith({ tenant_id: 'ten', series: 'gst_b2c' });
    expect(a.updates).toEqual([{ reservedInvoiceNumber: 'GST-012', title: 'GST-012' }]);
  });
});

describe('scrap, quotation and return numbers', () => {
  it('scrap: offsets past other tabs; retitles New/Bill/old-number titles only; skipped while editing', async () => {
    tabs = [{ id: 't2', reservedScrapInvoiceNumber: 'SCR-001' }];
    scrap.peekNextScrapInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'SCR-001' });
    const a = access(tab({ title: 'Bill 2' }));
    await nr.reserveScrapInvoiceNumber({ ...a, editingActive: null });
    expect(a.updates).toEqual([{ reservedScrapInvoiceNumber: 'SCR-002', title: 'SCR-002' }]);
    const gst = access(tab({ title: 'GST-004' }));
    await nr.reserveScrapInvoiceNumber({ ...gst, editingActive: null });
    expect(gst.updates).toEqual([{ reservedScrapInvoiceNumber: 'SCR-002', title: 'GST-004' }]);
    scrap.peekNextScrapInvoiceNumber.mockClear();
    await nr.reserveScrapInvoiceNumber({ ...access(tab()), editingActive: 'inv-1' });
    expect(scrap.peekNextScrapInvoiceNumber).not.toHaveBeenCalled();
  });
  it('quotation: clears the invoice number and also retitles "New Quote" and invoice-number titles', async () => {
    quotations.peekNextQuotationNumber.mockResolvedValue({ success: true, quotationNumber: 'QT-010' });
    for (const t of [tab({ title: 'New Quote' }), tab({ title: 'POS1-009', reservedInvoiceNumber: 'POS1-009' })]) {
      const a = access(t);
      await nr.reserveQuotationNumber({ ...a, editingQuotationId: null });
      expect(a.updates).toEqual([{ reservedQuotationNumber: 'QT-010', reservedInvoiceNumber: '', title: 'QT-010' }]);
    }
    quotations.peekNextQuotationNumber.mockClear();
    await nr.reserveQuotationNumber({ ...access(tab()), editingQuotationId: 'q1' });
    expect(quotations.peekNextQuotationNumber).not.toHaveBeenCalled();
  });
  it('return: same title rule as scrap, tenant-scoped lookup', async () => {
    returns.peekNextReturnNumber.mockResolvedValue({ success: true, returnNumber: 'RTN-004' });
    const a = access(tab({ title: 'New Quote' }));
    await nr.reserveReturnNumber({ ...a, tenantId: null });
    expect(returns.peekNextReturnNumber).toHaveBeenCalledWith({ tenant_id: 'global' });
    expect(a.updates).toEqual([{ reservedReturnNumber: 'RTN-004', title: 'New Quote' }]);
  });
});

describe('GST B2C/B2B series switch', () => {
  it('previews the next number of the series past numbers other tabs show, and retitles', async () => {
    tabs = [{ id: 't2', reservedInvoiceNumber: 'B2B-007' }, { id: 't1', reservedInvoiceNumber: 'B2B-007' }];
    invoices.peekNextInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'B2B-007' });
    const a = access(tab({ title: 'Ravi order' }));
    await nr.reserveGstSeriesNumber({ tenantId: 'ten', ...a }, 'gst_b2b');
    expect(invoices.peekNextInvoiceNumber).toHaveBeenCalledWith({ tenant_id: 'ten', series: 'gst_b2b' });
    expect(a.updates).toEqual([{ reservedInvoiceNumber: 'B2B-008', title: 'B2B-008' }]);
  });
  it('keeps the number when no other tab holds it, and does nothing when the lookup has no number', async () => {
    tabs = [{ id: 't1', reservedInvoiceNumber: 'B2C-003' }];
    invoices.peekNextInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'B2C-003' });
    const a = access(tab());
    await nr.reserveGstSeriesNumber({ tenantId: null, ...a }, 'gst_b2c');
    expect(a.updates).toEqual([{ reservedInvoiceNumber: 'B2C-003', title: 'B2C-003' }]);
    invoices.peekNextInvoiceNumber.mockResolvedValue({ success: false });
    const b = access(tab());
    await nr.reserveGstSeriesNumber({ tenantId: null, ...b }, 'gst_b2c');
    expect(b.updates).toEqual([]);
  });
});
