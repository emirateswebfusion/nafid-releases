import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: mocks.get } }));
import { useFeatureFlagsStore } from '../../src/store/featureFlagsStore';
beforeEach(() => { useFeatureFlagsStore.getState().reset(); mocks.get.mockReset(); });
it('reloads saved remote choices and keeps disabled modules off after a failed read', async () => {
  mocks.get.mockResolvedValueOnce({ scrap: true }).mockResolvedValueOnce({ scrap: false }).mockRejectedValueOnce(new Error('read failed'));
  await useFeatureFlagsStore.getState().loadFlags('shop');
  await useFeatureFlagsStore.getState().loadFlags('shop', true);
  expect(useFeatureFlagsStore.getState().flags?.scrap).toBe(false);
  await useFeatureFlagsStore.getState().loadFlags('shop', true);
  expect(useFeatureFlagsStore.getState().flags?.scrap).toBe(false);
  expect(mocks.get).toHaveBeenLastCalledWith({ tenant_id: 'shop', key: 'feature_flags', tenant_only: true });
});
it('does not let an old tenant load overwrite the newly signed-in shop', async () => {
  let completeOld: (value: unknown) => void = () => {};
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; })).mockResolvedValueOnce({ scrap: false });
  const old = useFeatureFlagsStore.getState().loadFlags('old-shop');
  await useFeatureFlagsStore.getState().loadFlags('new-shop');
  completeOld({ scrap: true }); await old;
  expect(useFeatureFlagsStore.getState().tenantId).toBe('new-shop');
  expect(useFeatureFlagsStore.getState().flags?.scrap).toBe(false);
});
it('does not let an in-flight load overwrite a more recent local edit', async () => {
  let complete: (value: unknown) => void = () => {};
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const load = useFeatureFlagsStore.getState().loadFlags('shop');
  useFeatureFlagsStore.getState().setFlag('scrap', false);
  complete({ scrap: true }); await load;
  expect(useFeatureFlagsStore.getState().flags?.scrap).toBe(false);
});
