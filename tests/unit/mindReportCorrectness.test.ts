import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyProductExpiry, productExpiryReply } from '../../src/services/offlineAi/handlers/productExpiry';
import { catalogSellingRate } from '../../src/services/offlineAi/catalogPrice';
import { clarifyProduct } from '../../src/services/offlineAi/productSelection';
import { handlePartiesIntent } from '../../src/services/offlineAi/handlers/parties';
import { handleCashierIntent } from '../../src/services/offlineAi/handlers/cashier';
import { createAiQueryContext, NOT_HANDLED } from '../../src/services/offlineAi/queryContext';
import { OfflineAiIntentParser } from '../../src/services/offlineAi/intentParser';
import { getStoreTimezone, setStoreTimezone } from '../../src/utils/time/timezoneHelper';
import type { AiRow, OfflineAiResponse } from '../../src/services/offlineAi/types';

const state = vi.hoisted(() => ({ customers: [] as AiRow[] }));
vi.mock('../../src/data/client', async original => ({ ...await original<typeof import('../../src/data/client')>(), hasBridge: () => true }));
vi.mock('../../src/data/customers', () => ({ customersApi: { getCustomers: async () => state.customers } }));
const context = () => createAiQueryContext('', 'test', [], false);
const content = (answer: OfflineAiResponse | typeof NOT_HANDLED) => {
  if (answer === NOT_HANDLED) throw new Error('Expected a report');
  return answer.content;
};
const accounts: AiRow[] = [
  { name: 'Supplier debt', party_type: 'SUPPLIER', current_balance: -500, balance: 999 },
  { name: 'Supplier advance', party_type: 'SUPPLIER', current_balance: 200 },
  { name: 'Dual account', party_type: 'SUPPLIER,CUSTOMER', current_balance: -50 },
  { name: 'Customer debt', party_type: 'CUSTOMER', current_balance: 300 },
];

describe('Mind reports preserve ledger direction and provenance', () => {
  it.each([
    ['SUPPLIER_PAYABLES_TOTAL', '550.00', 'Supplier advance'],
    ['SUPPLIER_RECEIVABLES', '200.00', 'Supplier debt'],
    ['CUSTOMER_PAYABLES', '50.00', 'Supplier debt'],
  ])('%s uses current signed balances and canonical multi-role membership', async (intent, total, excluded) => {
    const answer = content(await handlePartiesIntent({ intent, params: {} }, { ...context(), fetchParties: async () => accounts }));
    expect(answer).toContain(total);
    expect(answer).not.toContain(excluded);
    expect(answer).not.toContain('999');
  });
  it('uses overdue invoice metadata rather than treating all positive balances as overdue', async () => {
    state.customers = [
      { name: 'Not overdue', balance: 900, has_overdue: false } as AiRow,
      { name: 'Overdue customer', overdue_amount: 120, has_overdue: true } as AiRow,
    ];
    const answer = content(await handlePartiesIntent({ intent: 'CUSTOMER_OVERDUE_LIST', params: {} }, context()));
    expect(answer).toContain('120.00');
    expect(answer).not.toContain('Not overdue');
  });
  it('excludes owner deposits from customer-labelled cash receipts', async () => {
    const answer = content(await handlePartiesIntent({ intent: 'CUSTOMER_PAYMENTS_COLLECTED_TODAY', params: {} }, {
      ...context(), fetchCashTransactions: async () => [
        { type: 'CASH_IN', category: 'Customer Payment', amount: 100 },
        { type: 'CASH_IN', category: 'Capital', amount: 90 },
        { type: 'CASH_OUT', category: 'CUSTOMER_PAYMENT', amount: 50 },
      ],
    }));
    expect(answer).toContain('100.00');
    expect(answer).not.toContain('190.00');
    expect(answer).toContain('not a complete total');
  });
  it('does not fabricate a shortage before cash is counted', async () => {
    const answer = content(await handleCashierIntent({ intent: 'CASH_DRAWER_EXPECTED_VS_ACTUAL', params: {} }, {
      ...context(), fetchCashDrawer: async () => ({ expected_closing: 1250, actual_cash: null }),
    }));
    expect(answer).toContain('not been recorded');
    expect(answer).not.toContain('-1,250');
  });
  it('recognizes an explicitly counted zero', async () => {
    const answer = content(await handleCashierIntent({ intent: 'CASH_DRAWER_EXPECTED_VS_ACTUAL', params: {} }, {
      ...context(), fetchCashDrawer: async () => ({ expected_closing: 1250, actual_cash: 0 }),
    }));
    expect(answer).toContain('Settlement Difference');
    expect(answer).toContain('-');
    expect(answer).not.toContain('not been recorded');
  });
  it('does not invent an open drawer with a zero opening when no row exists', async () => {
    const answer = content(await handleCashierIntent({ intent: 'CASH_DRAWER_CURRENT', params: {} }, { ...context(), fetchCashDrawer: async () => null }));
    expect(answer).toContain('cannot be confirmed');
    expect(answer).not.toContain('OPEN');
  });
});

describe('catalog and expiry boundary regressions', () => {
  afterEach(() => vi.useRealTimers());
  it('uses canonical offer/discount pricing, including an explicit zero offer', () => {
    expect(catalogSellingRate({ base_price: 100, offer_price: 0 })).toBe(0);
    expect(catalogSellingRate({ base_price: 100, discount_percent: 10 })).toBe(90);
  });
  it('includes today and day 30, excludes day 31, invalid dates and zero stock', () => {
    const product = (name: string, expiry: string, stock = 1): AiRow => ({ name, current_stock: stock, domain_attributes: JSON.stringify({ expiry_date: expiry }) });
    const result = classifyProductExpiry([
      product('expired', '2026-11-09'), product('today', '2026-11-10'),
      product('day30', '2026-12-10'), product('day31', '2026-12-11'),
      product('invalid', '2026-02-30'), product('empty', '2026-11-09', 0),
    ], '2026-11-10');
    expect(result.expired.map(p => p.product.name)).toEqual(['expired']);
    expect(result.near.map(p => p.product.name)).toEqual(['today', 'day30']);
  });
  it('uses the Dubai shop day across UTC midnight', () => {
    const previous = getStoreTimezone();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T22:30:00Z'));
    try {
      setStoreTimezone('Asia/Dubai');
      const answer = productExpiryReply([{ name: 'today', current_stock: 1, domain_attributes: { expiry_date: '2026-11-10' } }], false);
      expect(answer.content).toContain('**Shop date:** 2026-11-10');
      expect(answer.content).toContain('**Expired products:** 0');
    } finally { setStoreTimezone(previous); }
  });
  it('persists product choices as full queries and resolves a numeric follow-up', () => {
    const reply = clarifyProduct([{ name: 'Rice', sku_barcode: '001' }, { name: 'Tea', sku_barcode: '002' }], 'barcode', false)!;
    const parsed = OfflineAiIntentParser.parse('2', [{ role: 'assistant', content: reply.content, parsedIntent: reply.parsedIntent }]);
    expect(parsed.intent).toBe('PRODUCT_BARCODE_LOOKUP');
    expect(parsed.params.productName).toBe('002');
  });
  it.each([
    ['How much do suppliers owe us?', 'SUPPLIER_RECEIVABLES'],
    ['How much do we owe suppliers?', 'SUPPLIER_PAYABLES_TOTAL'],
    ['How much do we owe customers?', 'CUSTOMER_PAYABLES'],
    ['cash in drawer', 'CASH_DRAWER_CURRENT'],
    ['Which customers spent the most this month?', 'SALES_CUSTOMER_LEVEL'],
    ['Show products with highest stock', 'INVENTORY_TOP_STOCK'],
  ])('keeps directional/specific intent: %s', (query, intent) => {
    expect(OfflineAiIntentParser.parse(query).intent).toBe(intent);
  });
});
