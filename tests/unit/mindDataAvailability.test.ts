import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoicesApi } from '../../src/data/invoices';
import { createAiQueryContext } from '../../src/services/offlineAi/queryContext';

vi.mock('../../src/data/client', async original => ({
  ...await original<typeof import('../../src/data/client')>(), hasBridge: () => true,
}));
vi.mock('../../src/data/invoices', () => ({ invoicesApi: {
  getInvoices: vi.fn(), getInvoicesSummary: vi.fn(),
} }));

describe('Mind distinguishes missing data from zero sales', () => {
  beforeEach(() => vi.resetAllMocks());
  it('propagates invoice failures instead of returning an empty list', async () => {
    vi.mocked(invoicesApi.getInvoices).mockRejectedValue(new Error('database unavailable'));
    const ctx = createAiQueryContext('sales today', 'test-tenant', [], false);
    await expect(ctx.fetchInvoices('2026-11-10', '2026-11-10')).rejects.toThrow('database unavailable');
  });
  it('does not produce zero sales when both summary and detail queries fail', async () => {
    vi.mocked(invoicesApi.getInvoicesSummary).mockRejectedValue(new Error('summary unavailable'));
    vi.mocked(invoicesApi.getInvoices).mockRejectedValue(new Error('database unavailable'));
    const ctx = createAiQueryContext('sales today', 'test-tenant', [], false);
    await expect(ctx.fetchSummary('2026-11-10', '2026-11-10')).rejects.toThrow('database unavailable');
  });
  it('still returns genuine zero sales from a successful empty query', async () => {
    vi.mocked(invoicesApi.getInvoicesSummary).mockRejectedValue(new Error('summary unavailable'));
    vi.mocked(invoicesApi.getInvoices).mockResolvedValue([]);
    const ctx = createAiQueryContext('sales today', 'test-tenant', [], false);
    await expect(ctx.fetchSummary('2026-11-10', '2026-11-10')).resolves.toMatchObject({ totalSales: 0, totalInvoices: 0 });
    expect(invoicesApi.getInvoices).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'test-tenant', filterDate: '2026-11-10', filterDateEnd: '2026-11-10' }));
  });
});
