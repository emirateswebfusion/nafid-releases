// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const settings = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/data/settings', () => ({ setSetting: settings.set }));
vi.mock('../../src/data/client', async original => ({ ...await original<typeof import('../../src/data/client')>(), isDesktopRuntime: () => true, hasBridge: () => false }));
import { useSettingsFormState } from '../../src/components/settings/hooks/useSettingsFormState';
import { useSettingsSave } from '../../src/components/settings/hooks/useSettingsSave';
import { useAuthStore } from '../../src/store/authStore';
afterEach(cleanup);
it('persists the selected shop timezone with the settings save, not only localStorage', async () => {
  useAuthStore.setState({tenantId:'timezone-shop',role:'ADMIN'});
  const { result } = renderHook(() => {
    const form = useSettingsFormState();
    const save = useSettingsSave({form,activeSection:'shop',buildSettingsSnapshot:()=>'',featureFlags:null,setInitialSnapshot:vi.fn(),localDomain:'GENERAL',returnPrefix:'RET',returnStartNumber:1,role:'ADMIN',shopDomain:'GENERAL',updateDomain:vi.fn()});
    return {form,save};
  });
  act(() => result.current.form.setStoreTimezoneState('Asia/Dubai'));
  await act(async () => result.current.save.handleSave());
  expect(settings.set).toHaveBeenCalledWith({tenant_id:'timezone-shop',key:'store_timezone',value:'Asia/Dubai'});
  expect(result.current.form.message?.type).toBe('success');
});