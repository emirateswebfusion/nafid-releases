import { describe, expect, it, vi } from 'vitest';
vi.mock('../../electron/db/localDb', () => ({ getDb: vi.fn(() => { throw new Error('Database must not be reached'); }) }));
vi.mock('../../electron/db/customerIdentity', () => ({ upsertCustomerRecord: vi.fn() }));
vi.mock('../../electron/services/storeTime', () => ({ localTimestamp: vi.fn(), localDate: vi.fn() }));
vi.mock('../../electron/services/cashDrawerService', () => ({ getOpenCashDrawer: vi.fn() }));
vi.mock('../../electron/services/partyLedgerService', () => ({ syncReturnLedger: vi.fn(), removeReturnLedger: vi.fn() }));
vi.mock('../../electron/services/invoiceNumberService', () => ({ getOrInitTerminalCode: vi.fn() }));
import { createReturn } from '../../electron/services/returnsService';
import { getDb } from '../../electron/db/localDb';
describe('return service quantity validation', () => {
  it.each([[], [0], [0, 0], [-1], [NaN], [Infinity], [1, -1]].map(quantities => ({ quantities })))('rejects invalid quantities before any side effect: %j', ({ quantities }) => {
    const result = createReturn({ return_id: 'r', invoice_id: 'i', tenant_id: 't', return_number: 'RET-1',
      subtotal: 0, tax_total: 0, grand_total: 0,
      items: quantities.map(quantity => ({ return_item_id: 'ri', product_id: 'p', name: 'Product', quantity,
        unit_price: 100, tax_amount: 0, total: 0 })) });
    expect(result.success).toBe(false);
    expect(getDb).not.toHaveBeenCalled();
  });
});
