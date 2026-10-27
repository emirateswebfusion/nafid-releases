import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendConfiguredBill, isLedgerRecipientAllowed } from '../../src/data/whatsappSharing';
import { sendPurchaseWhatsApp } from '../../src/data/purchaseWhatsApp';
import type { PurchaseBillsRow } from '../../src/data/dbRows';
const mocks = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn(), parties: vi.fn(), ledger: vi.fn() }));
vi.mock('../../src/data/settings', () => ({ getSetting: mocks.get }));
vi.mock('../../src/data/whatsapp', () => ({ whatsappApi: { sendInvoice: mocks.send } }));
vi.mock('../../src/data/parties', () => ({ listParties: mocks.parties, partiesApi: { getPartyLedger: mocks.ledger } }));
const input = { phone: '123', message: 'Summary', a4Html: '<h1>Invoice</h1>', receiptText: 'Receipt', invoiceNumber: 'B1' };
const bill = { tenant_id: 'shop', supplier_id: 's1', bill_number: 'PUR-1', bill_type: 'GST' } as PurchaseBillsRow;
beforeEach(() => { vi.resetAllMocks(); mocks.send.mockResolvedValue({ success: true }); mocks.get.mockResolvedValue(null); });
describe('configured bill delivery', () => {
  it('keeps the default summary and A4 attachment', async () => {
    await sendConfiguredBill('shop', input);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ phone: '123', message: 'Summary', htmlContent: input.a4Html, fileName: 'Invoice_B1.pdf' });
  });
  it('preserves the legacy layout until formats are explicitly selected', async () => {
    await sendConfiguredBill('shop', { ...input, legacyHtml: '<h1>Legacy half A4</h1>' });
    expect(mocks.send.mock.calls[0][0].htmlContent).toContain('Legacy half A4');
    mocks.get.mockResolvedValue(['a4']);
    await sendConfiguredBill('shop', { ...input, legacyHtml: '<h1>Legacy half A4</h1>' });
    expect(mocks.send.mock.calls[1][0].htmlContent).toBe(input.a4Html);
  });
  it('sends text only without an attachment', async () => {
    mocks.get.mockResolvedValue(['text']); await sendConfiguredBill('shop', input);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ phone: '123', message: 'Summary' });
  });
  it('sends both selected PDF formats and propagates a failed delivery', async () => {
    mocks.get.mockResolvedValue(['a4', 'thermal']);
    mocks.send.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'offline' });
    expect(await sendConfiguredBill('shop', input)).toEqual({ success: false, error: 'offline' });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0].receiptText).toBe('Receipt');
  });
});
describe('ledger recipients', () => {
  it('reads tenant settings and excludes unselected types', async () => {
    mocks.get.mockResolvedValue(['CUSTOMER']);
    expect(await isLedgerRecipientAllowed('shop', { party_type: 'SUPPLIER' })).toBe(false);
    expect(mocks.get).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'ledger_whatsapp_party_types' });
  });
});
describe('purchase bill WhatsApp', () => {
  beforeEach(() => {
    mocks.parties.mockResolvedValue([{ party_id: 's1', party_type: 'SUPPLIER', phone: '123', current_balance: -99999 }]);
    mocks.ledger.mockResolvedValue([{ reference_number: 'PUR-1', balance_type: 'GST', description: 'Purchase bill PUR-1 - Supplier', credit_amount: 0, debit_amount: 1308, running_balance: -32371 }]);
  });
  it('uses the matched purchase ledger figures, even after later purchases', async () => {
    await sendPurchaseWhatsApp(bill);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ phone: '123', message: 'OB: ₹ -31,063/-\nPurchase: ₹ 1,308/-\nBalance: ₹ -32,371/-' });
  });
  it('rejects missing or ambiguous ledger entries instead of inventing balances', async () => {
    mocks.ledger.mockResolvedValue([]);
    await expect(sendPurchaseWhatsApp(bill)).rejects.toThrow('unique purchase ledger entry');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not send excluded supplier types', async () => {
    mocks.get.mockResolvedValue(['CUSTOMER']);
    await expect(sendPurchaseWhatsApp(bill)).rejects.toThrow('excluded');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
