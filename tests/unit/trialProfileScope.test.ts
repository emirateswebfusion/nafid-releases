import { expect, it, vi } from 'vitest';
const sql = vi.hoisted(() => ({ exact: vi.fn(), global: vi.fn(), any: vi.fn() }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/db/statements/settings', () => ({
  findSettingsByKeyValue: () => ({ get: sql.exact }),
  findSettingsByKey: () => ({ get: sql.global }),
  findOneSettingByKey: () => ({ get: sql.any }),
}));
vi.mock('../../electron/services/storeCountryService', () => ({ saveStoreCountry: vi.fn(), saveVatPriceBasis: vi.fn() }));
vi.mock('../../electron/services/lanPairing', () => ({ withPreservedLanKey: vi.fn() }));
import { get } from '../../electron/services/settingsService';
it('does not inherit another shop profile when initializing a new trial', () => {
  sql.exact.mockReturnValue(undefined);
  sql.global.mockReturnValue({ value: '"IN"' });
  sql.any.mockReturnValue({ value: '"IN"' });
  expect(get({ tenant_id: 'new-trial', key: 'store_country', tenant_only: true })).toBeNull();
  expect(sql.global).not.toHaveBeenCalled();
  expect(sql.any).not.toHaveBeenCalled();
  expect(get({ tenant_id: 'new-trial', key: 'store_country' })).toBe('IN');
});
