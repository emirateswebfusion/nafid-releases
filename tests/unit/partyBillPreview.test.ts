import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScrapInvoiceDetails } from '../../src/data/scrap';

const mocks = vi.hoisted(() => ({
  getScrapInvoiceByNumber: vi.fn(),
  setViewingBillLoading: vi.fn(),
  setViewingBillModal: vi.fn(),
  setViewingInvoice: vi.fn(),
  setViewingInvoiceItems: vi.fn(),
  setViewingLedgerVoucher: vi.fn(),
}));

vi.mock('../../src/data/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/client')>()),
  hasBridge: (channel: string) => channel === 'dbGetScrapInvoiceByNumber',
}));
vi.mock('../../src/data/invoices', () => ({ invoicesApi: { getInvoices: vi.fn() } }));
vi.mock('../../src/data/returns', () => ({ returnsApi: { getReturnInvoiceByNumber: vi.fn() } }));
vi.mock('../../src/data/cloud/sales', () => ({ salesCloud: { search: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('../../src/data/scrap', () => ({ scrapApi: { getScrapInvoiceByNumber: mocks.getScrapInvoiceByNumber } }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: { getState: () => ({ tenantId: 'tenant-1' }) } }));

const { usePartyBillPreview } = await import('../../src/components/party/hooks/usePartyBillPreview');

const scrapInvoice: ScrapInvoiceDetails = {
  invoiceNumber: 'SCRAP-0042',
  totalAmount: 50,
  paymentStatus: 'PENDING',
  transactions: [{
    transaction_id: 'tx-1',
    tenant_id: 'tenant-1',
    type: 'PURCHASE',
    scrap_category_id: 'cat-1',
    quantity: 2,
    rate: 25,
    total_amount: 50,
    party_name: 'Asha Rao',
    customer_phone: '555-0142',
    customer_address: 'Market Road',
    notes: null,
    scrap_invoice_number: 'SCRAP-0042',
    payment_status: 'PENDING',
    is_deleted: 0,
    deleted_at: null,
    transaction_date: '2026-10-25 10:30:00',
    sync_status: 'SYNCED',
    created_at: '2026-10-25 10:30:00',
    updated_at: '2026-10-25 10:30:00',
    row_version: 1,
    origin: null,
    scrap_category_name: 'Gold scrap',
    unit: 'g',
  }],
};

beforeEach(() => vi.resetAllMocks());

describe('party bill preview scrap lookup', () => {
  it('maps the real scrap invoice result into an itemized bill preview', async () => {
    mocks.getScrapInvoiceByNumber.mockResolvedValue(scrapInvoice);
    const pm = {
      selectedParty: null,
      viewingInvoice: null,
      viewingInvoiceItems: [],
      viewingLedgerVoucher: null,
      setViewingBillLoading: mocks.setViewingBillLoading,
      setViewingBillModal: mocks.setViewingBillModal,
      setViewingInvoice: mocks.setViewingInvoice,
      setViewingInvoiceItems: mocks.setViewingInvoiceItems,
      setViewingLedgerVoucher: mocks.setViewingLedgerVoucher,
    };
    const { handleOpenBillForLedgerEntry } = usePartyBillPreview({
      onClose: vi.fn(),
      showStatus: vi.fn(),
      tenantId: 'tenant-1',
      pm: pm as never,
    });
    const entry = {
      description: 'Scrap purchase SCRAP-0042',
      reference_number: 'SCRAP-0042',
      transaction_date: '2026-10-25 10:30:00',
      credit_amount: 50,
      debit_amount: 0,
    } as never;

    await handleOpenBillForLedgerEntry(entry);

    expect(mocks.getScrapInvoiceByNumber).toHaveBeenCalledWith({
      tenant_id: 'tenant-1',
      scrap_invoice_number: 'SCRAP-0042',
    });
    expect(mocks.setViewingInvoice).toHaveBeenCalledWith(expect.objectContaining({
      invoice_number: 'SCRAP-0042',
      invoice_type: 'SCRAP',
      created_at: '2026-10-25 10:30:00',
      payment_method: 'PENDING',
      payment_status: 'PENDING',
      customer_name: 'Asha Rao',
      customer_phone: '555-0142',
      grand_total: 50,
      subtotal: 50,
    }));
    expect(mocks.setViewingInvoiceItems).toHaveBeenCalledWith([{
      item_id: 'tx-1',
      product_id: 'cat-1',
      name: 'Gold scrap',
      quantity: 2,
      unit_price: 25,
      total: 50,
    }]);
  });
});
