import { expect, it, vi } from 'vitest';
const database = vi.hoisted(() => vi.fn(() => { throw new Error('No database write is authorized'); }));
vi.mock('../../electron/db/localDb', () => ({ getDb: database }));
vi.mock('../../electron/services/lanPairing', () => ({ LAN_KEY_HEADER: 'X-Nafid-Lan-Key', getLanPairingKey: vi.fn(), normalizeLanKey: vi.fn() }));
import { syncClearPending } from '../../electron/services/syncService';
it.each([undefined, null, { tenant_id: 'shop', type: 'all', records: ['invoice-id'] }])('never clears pending records without actual acknowledgements: %s', async value => {
  expect((await syncClearPending(value)).success).toBe(false);
  expect(database).not.toHaveBeenCalled();
});
