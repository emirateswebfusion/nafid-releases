import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceRow, InvoiceItemRow } from '../../electron/services/typesA';

const state = vi.hoisted(() => ({
  invoice: {} as InvoiceRow,
  items: [] as InvoiceItemRow[],
  settings: {} as Record<string, string>,
  inserted: vi.fn(),
  insertedItem: vi.fn(),
  linked: vi.fn(),
  allocate: vi.fn(),
}));
vi.mock('../../electron/db/localDb.js', () => ({
  getDb: () => ({ transaction: (fn: () => unknown) => fn }),
}));
vi.mock('../../electron/services/invoiceNumberService.js', () => ({
  getGuaranteedNextInvoiceNumber: () => ({ invoiceNumber: 'GST-001' }),
  peekGuaranteedNextInvoiceNumber: () => ({ counter: 1 }),
  requestServerInvoiceNumber: (...args: unknown[]) => { state.allocate(...args); return { success: false }; },
}));
vi.mock('../../electron/db/statements/invoices.js', () => ({
  findSettingsByKey: () => ({ get: (_tenant: string, key: string) => state.settings[key] === undefined ? undefined : { value: state.settings[key] } }),
  findInvoicesByInvoiceId2: () => ({ get: () => state.invoice }),
  findInvoicesByInvoiceIdInvoiceNumberAndInvoiceType: () => ({ get: () => state.invoice }),
  findInvoiceItemsByInvoiceId3: () => ({ all: () => state.items }),
  findOneProductByProductId: () => ({ get: () => ({ product_id: 'p1', name: 'Rice', is_gst_applicable: 1, tax_rate_percent: 18, current_stock: 8 }) }),
  findPurchaseBillItemsByProductIdAndBillType: () => ({ all: () => [] }),
  findInvoiceItemsByProductIdAndInvoiceType: () => ({ get: () => ({ total_gst_sold: 0 }) }),
  insertInvoice3: () => ({ run: state.inserted }),
  insertInvoiceItem4: () => ({ run: state.insertedItem }),
  updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber: () => ({ run: state.linked }),
}));
import { convertBosToGst, previewConvertBosToGst } from '../../electron/services/bosConversionService';
const payload = { invoice_ids: ['bos'], tenant_id: 'shop', user_id: 'user' };

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = { three_invoice_series: '{"enabled":true}' };
  state.invoice = {
    invoice_id: 'bos', invoice_number: 'BOS-001', tenant_id: 'shop', user_id: 'user',
    invoice_type: 'BILL_OF_SUPPLY', subtotal: 100, tax_total: 0, grand_total: 100,
    payment_method: 'CASH', received_amount: 100, balance_amount: 0,
    customer_id: 'customer', customer_name: 'Asha', customer_phone: '555',
    customer_address: 'Kochi', customer_state: 'KL', customer_gstin: '',
    created_at: '2026-10-26 12:00:00',
  };
  state.items = [{ item_id: 'line', product_id: 'p1', name: 'Rice', quantity: 2, unit_price: 50, total: 100 }];
});
describe('BOS to B2C service characterization', () => {
  it.each(['EXCLUSIVE', 'INCLUSIVE'] as const)('preview and save agree for %s GST', async tax_mode => {
    const preview = previewConvertBosToGst({ ...payload, tax_mode });
    await convertBosToGst({ ...payload, tax_mode });
    expect(preview.success).toBe(true);
    if (!preview.success || !('invoices' in preview)) throw new Error('Preview failed');
    const row = state.inserted.mock.calls[0];
    expect(row[4]).toBe(preview.invoices![0].taxable_amount);
    expect(row[5]).toBe(preview.invoices![0].tax_amount);
    expect(row[9]).toBe(preview.invoices![0].converted_grand_total);
    expect(row[9]).toBe(tax_mode === 'INCLUSIVE' ? 100 : 118);
    expect(row[26] + row[27] + row[28]).toBe(row[5]);
  });
  it('preserves customer identity, original date and source links', async () => {
    await convertBosToGst(payload);
    const row = state.inserted.mock.calls[0];
    expect(row.slice(14, 20)).toEqual(['customer', 'Asha', '555', null, 'KL', 'Kochi']);
    expect(row.slice(24, 26)).toEqual(['bos', 'BOS-001']);
    expect(row.at(-1)).toBe('2026-10-26 12:00:00');
    expect(state.insertedItem.mock.calls[0].slice(10, 14)).toEqual(['line', 50, 0, 100]);
    expect(state.linked.mock.calls[0].slice(1)).toEqual(['GST-001', 'bos']);
    expect(state.invoice.invoice_type).toBe('BILL_OF_SUPPLY');
  });
  it('uses the B2C series and retains two units without another stock write', async () => {
    await convertBosToGst(payload);
    expect(state.allocate.mock.calls[0].slice(1, 4)).toEqual(['shop', 'gst_b2c', 'gst_b2c_invoice_counter_config']);
    expect(state.insertedItem.mock.calls[0][5]).toBe(2);
    // The SQL mock exposes no stock write: attempting one would fail conversion.
    expect(state.inserted).toHaveBeenCalledOnce();
  });
  it('preserves a partial collection and computes the remaining balance', async () => {
    state.invoice.received_amount = 40;
    state.invoice.balance_amount = 60;
    await convertBosToGst(payload);
    expect(state.inserted.mock.calls[0].slice(12, 14)).toEqual([40, 78]);
  });
  it('keeps split details on the tax copy', async () => {
    state.invoice.payment_method = 'SPLIT';
    state.invoice.split_details = '{"cash":40,"upi":60}';
    await convertBosToGst(payload);
    expect(state.inserted.mock.calls[0].slice(10, 12)).toEqual(['SPLIT', '{"cash":40,"upi":60}']);
  });
  it('uses IGST for an interstate customer', async () => {
    state.invoice.customer_state = 'TN';
    await convertBosToGst(payload);
    expect(state.inserted.mock.calls[0].slice(26, 30)).toEqual([0, 0, 18, 'INTER']);
  });
  it('does not create a second copy when the BOS is already converted', async () => {
    state.invoice.converted_to_invoice_id = 'gst';
    const result = await convertBosToGst(payload);
    expect(result.results?.[0]).toMatchObject({ success: false, error: 'Invoice is already converted' });
    expect(state.inserted).not.toHaveBeenCalled();
  });
});
