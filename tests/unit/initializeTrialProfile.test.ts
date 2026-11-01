import { beforeEach, expect, it, vi } from 'vitest';
import { initializeTrialProfile } from '../../src/store/initializeTrialProfile';

const settings = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../../src/data/settings', () => ({ settingsApi: settings }));
beforeEach(() => { vi.clearAllMocks(); settings.set.mockResolvedValue({ success: true }); });
it('seeds missing profile settings on a new installation', async () => {
  settings.get.mockResolvedValue(null);
  await initializeTrialProfile('shop', { store_country: 'AE', shop_address: 'Dubai' });
  expect(settings.get).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'store_country', tenant_only: true });
  expect(settings.set).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'store_country', value: 'AE' });
  expect(settings.set).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'shop_address', value: 'Dubai' });
});
it('keeps local offline changes including deliberately empty fields', async () => {
  settings.get.mockImplementation(({ key }: { key: string }) => Promise.resolve(key === 'shop_address' ? '' : 'IN'));
  await initializeTrialProfile('shop', { store_country: 'AE', shop_address: 'Old address' });
  expect(settings.set).not.toHaveBeenCalled();
});
