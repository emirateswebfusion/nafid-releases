/**
 * Characterization test for the offline AI assistant: asks every phrase the intent parser recognises (plus everyday
 * questions) against fixed sample data and a fixed clock, and pins intent + answer in a snapshot. A refactor of
 * src/services/offlineAi* must leave the snapshot unchanged; a deliberate behaviour change updates it in review
 * (`npx vitest run tests/unit/offlineAi.characterization.test.ts -u`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import questions from './fixtures/offlineAiQuestions.json';

const day = (d: number, h = 10) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:15:00Z`;
const invoices = [
  { invoice_id: 'i1', invoice_number: 'POS1-101', invoice_type: 'BILL_OF_SUPPLY', created_at: day(15, 9), grand_total: 1200, subtotal: 1100, tax_total: 100, discount_total: 50, payment_method: 'CASH', customer_name: 'Ravi Kumar', customer_phone: '9876543210', user_id: 'u1', biller_name: 'Admin', received_amount: 1200, balance_amount: 0, terminal_code: 'POS1' },
  { invoice_id: 'i2', invoice_number: 'GST-102', invoice_type: 'GST', created_at: day(15, 11), grand_total: 2360, subtotal: 2000, tax_total: 360, discount_total: 0, payment_method: 'UPI', customer_name: 'Acme Traders', customer_phone: '9123456780', user_id: 'u2', biller_name: 'Staff One', received_amount: 2360, balance_amount: 0, terminal_code: 'POS2' },
  { invoice_id: 'i3', invoice_number: 'POS1-103', invoice_type: 'BILL_OF_SUPPLY', created_at: day(14, 16), grand_total: 800, subtotal: 800, tax_total: 0, discount_total: 0, payment_method: 'CREDIT', customer_name: 'Ravi Kumar', customer_phone: '9876543210', user_id: 'u1', biller_name: 'Admin', received_amount: 0, balance_amount: 800, terminal_code: 'POS1' },
  { invoice_id: 'i4', invoice_number: 'POS1-104', invoice_type: 'BILL_OF_SUPPLY', created_at: day(3, 12), grand_total: 450, subtotal: 450, tax_total: 0, discount_total: 20, payment_method: 'SPLIT', split_details: JSON.stringify({ cash: 200, upi: 250 }), customer_name: 'Walk-in', user_id: 'u1', biller_name: 'Admin', received_amount: 450, balance_amount: 0, terminal_code: 'POS1' },
  { invoice_id: 'i5', invoice_number: 'GST-105', invoice_type: 'GST', created_at: '2026-09-20T10:00:00Z', grand_total: 5900, subtotal: 5000, tax_total: 900, discount_total: 0, payment_method: 'CARD', customer_name: 'Acme Traders', user_id: 'u2', biller_name: 'Staff One', received_amount: 3000, balance_amount: 2900, terminal_code: 'POS2' },
];
const products = [
  { product_id: 'p1', name: 'Steel Rod', sku_barcode: '1001', item_code: 'SR1', category: 'Hardware', current_stock: 0, reorder_level: 5, base_price: 100, purchase_price: 70, offer_price: null, created_at: day(15, 8), uom: 'Pcs', domain_attributes: JSON.stringify({ expiry_date: '2026-10-20' }) },
  { product_id: 'p2', name: 'Cement Bag', sku_barcode: '1002', item_code: 'CB1', category: 'Building', current_stock: 3, reorder_level: 10, base_price: 400, purchase_price: 420, offer_price: 390, created_at: '2026-08-01T10:00:00Z', uom: 'Pcs', domain_attributes: null },
  { product_id: 'p3', name: 'Paint 1L', sku_barcode: '1003', item_code: 'PT1', category: 'Paint', current_stock: 40, reorder_level: 5, base_price: 250, purchase_price: 180, offer_price: null, created_at: '2026-07-01T10:00:00Z', uom: 'Ltrs', domain_attributes: null },
  { product_id: 'p4', name: 'Steel Rod', sku_barcode: '1004', item_code: 'SR2', category: 'Hardware', current_stock: -2, reorder_level: 0, base_price: 100, purchase_price: 70, offer_price: null, created_at: '2026-07-02T10:00:00Z', uom: 'Pcs', domain_attributes: null },
];
const parties = [
  { party_id: 'pa1', name: 'Acme Traders', phone: '9123456780', current_balance: 2900, balance: 2900, balance_type: 'RECEIVABLE', party_type: 'CUSTOMER' },
  { party_id: 'pa2', name: 'Big Supplier', phone: '9000000001', current_balance: -5000, balance: -5000, balance_type: 'PAYABLE', party_type: 'SUPPLIER' },
];
const customers = [
  { customer_id: 'c1', name: 'Ravi Kumar', phone: '9876543210', current_points_balance: 12, party_balance: 800, has_overdue: true, overdue_bills_count: 1, overdue_amount: 800, oldest_overdue_days: 13 },
  { customer_id: 'c2', name: 'Meera', phone: '9000000002', current_points_balance: 0, party_balance: 0, has_overdue: false },
];
const cashTransactions = [
  { transaction_id: 't1', type: 'CASH_OUT', amount: 120, category: 'Tea', notes: 'tea', created_at: day(15, 9), transaction_date: day(15, 9) },
  { transaction_id: 't2', type: 'CASH_OUT', amount: 900, category: 'Rent', notes: 'rent', created_at: day(10, 9), transaction_date: day(10, 9) },
  { transaction_id: 't3', type: 'CASH_IN', amount: 500, category: 'Customer Payment', notes: 'Ravi', created_at: day(15, 10), transaction_date: day(15, 10) },
  { transaction_id: 't4', type: 'CASH_OUT', amount: 300, category: 'Supplier Payment', notes: 'Big Supplier', created_at: day(15, 12), transaction_date: day(15, 12) },
];
const drawer = { drawer_id: 'd1', business_date: '2026-10-15', status: 'OPEN', opening_balance: 1000, cash_sales: 1400, cash_in: 500, cash_out: 420, current_cash: 2480, expected_closing: 2480, actual_cash: null };
const returns = [{ return_id: 'r1', return_number: 'POS1-RTN-001', invoice_id: 'i1', grand_total: 100, subtotal: 100, payment_method: 'CASH', created_at: day(15, 13), return_date: day(15, 13) }];
const returnItems = [{ return_item_id: 'ri1', return_id: 'r1', product_id: 'p1', name: 'Steel Rod', quantity: 1, unit_price: 100, total: 100 }];
const purchaseBills = [
  { purchase_bill_id: 'pb1', bill_number: 'PB-1', supplier_name: 'Big Supplier', total_amount: 7000, payment_type: 'CREDIT', bill_date: day(12), created_at: day(12) },
  { purchase_bill_id: 'pb2', bill_number: 'PB-2', supplier_name: 'Other Supplier', total_amount: 1500, payment_type: 'CASH', bill_date: '2026-09-25T10:00:00Z', created_at: '2026-09-25T10:00:00Z' },
];
const salesSummary = [
  { product_id: 'p1', name: 'Steel Rod', gst_qty: 2, bos_qty: 10, total_qty: 12, total_revenue: 1200 },
  { product_id: 'p3', name: 'Paint 1L', gst_qty: 4, bos_qty: 1, total_qty: 5, total_revenue: 1250 },
];
const ledger = [{ ledger_id: 'l1', party_id: 'pa1', transaction_date: day(14), description: 'Credit sale', credit_amount: 800, debit_amount: 0, running_balance: 2900 }];

vi.mock('../../src/data/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/client')>()),
  hasBridge: () => true,
  isDesktopRuntime: () => true,
}));
vi.mock('../../src/data/invoices', () => ({ invoicesApi: {
  getInvoices: vi.fn(async (q: { filterDate?: string; filterDateEnd?: string }) => invoices.filter((i) => (!q.filterDate || i.created_at.slice(0, 10) >= q.filterDate) && (!q.filterDateEnd || i.created_at.slice(0, 10) <= q.filterDateEnd))),
  getInvoicesSummary: vi.fn(async () => ({ totalSales: 5260, invoiceCount: 4, totalTax: 460, totalDiscount: 70 })),
} }));
vi.mock('../../src/data/products', () => ({ productsApi: { getProducts: vi.fn(async () => products), getProductSalesSummary: vi.fn(async () => salesSummary) } }));
vi.mock('../../src/data/parties', () => ({ partiesApi: { getParties: vi.fn(async () => parties), getPartyLedger: vi.fn(async () => ledger) } }));
vi.mock('../../src/data/customers', () => ({ customersApi: { getCustomers: vi.fn(async () => customers) } }));
vi.mock('../../src/data/cashier', () => ({ cashierApi: {
  getDayTransactions: vi.fn(async () => cashTransactions), getTransactions: vi.fn(async () => cashTransactions),
  getDrawer: vi.fn(async () => drawer), getPendingInvoices: vi.fn(async () => [invoices[2]]), getDaySettlements: vi.fn(async () => invoices.slice(0, 2)),
} }));
vi.mock('../../src/data/purchases', () => ({ purchasesApi: { getPurchaseBills: vi.fn(async () => purchaseBills) } }));
vi.mock('../../src/data/returns', () => ({ returnsApi: { getReturns: vi.fn(async () => returns), getReturnItems: vi.fn(async () => returnItems) } }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: vi.fn(async () => ({ enabled: true, loyalty: true })) } }));
vi.mock('../../src/data/sync', () => ({ syncApi: { syncGetPending: vi.fn(async () => ({ invoices: 2, products: 1, total: 3 })) } }));

const { processOfflineAiQuery } = await import('../../src/services/offlineAiService');

describe('offline AI assistant (characterization)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:30:00Z'));
  });
  afterAll(() => { vi.useRealTimers(); });

  it('answers every recognised phrase the same way', async () => {
    const answers: Record<string, unknown> = {};
    for (const q of questions as string[]) {
      try {
        const r = await processOfflineAiQuery(q, 't1', []);
        answers[q] = { intent: (r as { intent?: string }).intent, content: r.content };
      } catch (e) {
        answers[q] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    expect(answers).toMatchSnapshot();
  });
});
