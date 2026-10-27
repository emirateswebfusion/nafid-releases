import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const scrap = {
  getNextScrapInvoiceNumber: vi.fn(),
  addScrapTransaction: vi.fn(),
  updateScrapInvoiceFull: vi.fn(),
  upsertScrapCreditLedger: vi.fn(),
};
const printing = { printReceipt: vi.fn() };
const cashier = { addTransaction: vi.fn() };
const cartState = { discountType: 'FIXED', discountValue: 0, setEditingInvoice: vi.fn() };

vi.mock('../../src/data/scrap', () => ({ scrapApi: scrap }));
vi.mock('../../src/data/printing', () => ({ printingApi: printing }));
vi.mock('../../src/data/cashier', () => ({ cashierApi: cashier }));
vi.mock('../../src/data/settings', () => ({ getSetting: vi.fn(async () => null) }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../src/store/cartStore', () => ({ useCartStore: { getState: () => cartState } }));
vi.mock('../../src/store/tabStore', () => ({ useTabStore: { getState: () => ({ tabs: [{ id: 'tab1' }] }) } }));

const { runScrapCheckout } = await import('../../src/components/billing/checkout/scrapCheckout');
const { resolveLinePrice } = await import('../../src/utils/pricing/linePricing');
type Ctx = Parameters<typeof runScrapCheckout>[0];

const items = [
  { product_id: 's1', scrap_category_id: 's1', name: 'Iron', base_price: 30, quantity: 2 },
  { product_id: 's2', scrap_category_id: 's2', name: 'Copper', base_price: 410, quantity: 0.5 },
];

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    items, scrapTotal: 265, extraBonus: 5, scrapPaymentStatus: 'CASH',
    customerName: 'Ravi', customerPhone: '9876543210', customerAddress: '', customerState: '',
    tenantId: 't1', userId: 'u1', userName: 'Owner', authRole: 'ADMIN',
    shopNameState: 'Shop', shopName: 'Shop', shopGstin: '', shopAddress: '', shopPhone: '', discount: 0,
    uiConfig: {}, isCashSettlementEnabled: false,
    setHardwareError: vi.fn(), setCheckoutSuccess: vi.fn(), setIsScrapMode: vi.fn(), closeTab: vi.fn(), clearCart: vi.fn(),
    updateActiveTab: vi.fn(), reserveScrapInvoiceNumberForTab: vi.fn(async () => {}), reserveInvoiceNumberForTab: vi.fn(async () => {}),
    getActiveTab: vi.fn(() => undefined), syncActiveSnapshot: vi.fn(),
    ...overrides,
  } as unknown as Ctx;
}
const rateOf = (item: (typeof items)[number]) => resolveLinePrice(item as never, item.base_price, 'scrap').unitRate;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  scrap.getNextScrapInvoiceNumber.mockResolvedValue({ success: true, invoiceNumber: 'SCR-0007' });
  scrap.addScrapTransaction.mockResolvedValue({ success: true });
  scrap.updateScrapInvoiceFull.mockResolvedValue({ success: true });
  scrap.upsertScrapCreditLedger.mockResolvedValue({ success: true });
  cashier.addTransaction.mockResolvedValue({ success: true });
  printing.printReceipt.mockResolvedValue({ success: true });
});
afterEach(() => vi.useRealTimers());

describe('scrap checkout (characterization)', () => {
  it('requires customer name and phone for CREDIT and writes nothing', async () => {
    const ctx = makeCtx({ scrapPaymentStatus: 'CREDIT', customerPhone: ' ' });
    await runScrapCheckout(ctx, { saveOnly: true, checkoutTabId: 'tab1', editingInvoiceNumber: null });
    expect(ctx.setHardwareError).toHaveBeenCalledWith('Please enter Customer Name and Phone Number for Credit payment');
    expect(scrap.getNextScrapInvoiceNumber).not.toHaveBeenCalled();
    expect(scrap.addScrapTransaction).not.toHaveBeenCalled();
  });

  it('saves a new CASH scrap invoice: one transaction per line, ledger sync, cash-out of total + bonus', async () => {
    const ctx = makeCtx();
    await runScrapCheckout(ctx, { saveOnly: true, checkoutTabId: 'tab1', editingInvoiceNumber: null });

    expect(scrap.addScrapTransaction).toHaveBeenCalledTimes(2);
    const first = scrap.addScrapTransaction.mock.calls[0][0];
    expect(first).toMatchObject({
      tenant_id: 't1', type: 'PURCHASE', scrap_category_id: 's1', quantity: 2, rate: rateOf(items[0]),
      total_amount: rateOf(items[0]) * 2, party_name: 'Ravi', customer_phone: '9876543210',
      scrap_invoice_number: 'SCR-0007', payment_status: 'CASH',
    });
    expect(scrap.upsertScrapCreditLedger).toHaveBeenCalledWith(expect.objectContaining({ scrap_invoice_number: 'SCR-0007', payment_status: 'CASH' }));
    expect(cashier.addTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'CASH_OUT', amount: 270, category: 'Scrap Purchase', notes: 'Scrap purchase SCR-0007' }));
    expect(printing.printReceipt).not.toHaveBeenCalled();
    expect(ctx.setCheckoutSuccess).toHaveBeenCalledWith('saved');
  });

  it('updates an existing scrap invoice in place instead of numbering a new one', async () => {
    const ctx = makeCtx({ scrapPaymentStatus: 'PENDING' });
    await runScrapCheckout(ctx, { saveOnly: true, checkoutTabId: 'tab1', editingInvoiceNumber: 'SCR-0003' });

    expect(scrap.getNextScrapInvoiceNumber).not.toHaveBeenCalled();
    expect(scrap.updateScrapInvoiceFull).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 't1', scrap_invoice_number: 'SCR-0003', payment_status: 'PENDING',
      items: [
        { scrap_category_id: 's1', quantity: 2, rate: rateOf(items[0]), notes: '' },
        { scrap_category_id: 's2', quantity: 0.5, rate: rateOf(items[1]), notes: '' },
      ],
    }));
    expect(cashier.addTransaction).not.toHaveBeenCalled();
  });

  it('prints the receipt unless saveOnly and reports "printed"', async () => {
    const ctx = makeCtx();
    await runScrapCheckout(ctx, { saveOnly: false, checkoutTabId: 'tab1', editingInvoiceNumber: null });
    expect(printing.printReceipt).toHaveBeenCalledTimes(1);
    expect(printing.printReceipt.mock.calls[0][1]).toContain('SCR-0007');
    expect(ctx.setCheckoutSuccess).toHaveBeenCalledWith('printed');
  });
});
