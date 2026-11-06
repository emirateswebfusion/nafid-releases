import { SettingsSaveSession } from '../../src/components/settings/settingsSaveSession';
// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const settings = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/data/settings', () => ({ setSetting: settings.set, getSetting: vi.fn().mockResolvedValue({ lanPairingKey: 'ABCD-EFGH-JKLM-NPQR' }) }));
vi.mock('../../src/data/client', async original => ({ ...await original<typeof import('../../src/data/client')>(), isDesktopRuntime: () => true, hasBridge: () => false }));
import { useSettingsFormState } from '../../src/components/settings/hooks/useSettingsFormState';
import { useSettingsSave } from '../../src/components/settings/hooks/useSettingsSave';
import { useAuthStore } from '../../src/store/authStore';
afterEach(cleanup);
it('persists the selected shop timezone with the settings save, not only localStorage', async () => {
  useAuthStore.setState({tenantId:'timezone-shop',role:'ADMIN'});
  const { result } = renderHook(() => {
    const form = useSettingsFormState();
    const save = useSettingsSave({form,saveSession:new SettingsSaveSession(),activeSection:'shop',buildSettingsSnapshot:()=>'',featureFlags:null,setInitialSnapshot:vi.fn(),localDomain:'GENERAL',returnPrefix:'RET',returnStartNumber:1,role:'ADMIN',shopDomain:'GENERAL',updateDomain:vi.fn()});
    return {form,save};
  });
  act(() => result.current.form.setStoreTimezoneState('Asia/Dubai'));
  await act(async () => result.current.save.handleSave());
  expect(settings.set).toHaveBeenCalledWith({tenant_id:'timezone-shop',key:'store_timezone',value:'Asia/Dubai'});
  expect(result.current.form.message?.type).toBe('success');
  expect(settings.set).toHaveBeenCalledWith(expect.objectContaining({ key: 'network_sync_config', value: expect.objectContaining({ lanPairingKey: 'ABCD-EFGH-JKLM-NPQR' }) }));
});
it('keeps the main Save Changes in its error state when a section cannot save', async () => {
  const session = new SettingsSaveSession();
  session.update({ id: 'cloud', dirty: true, save: async () => { throw new Error('Provider unavailable'); } });
  const { result } = renderHook(() => {
    const form = useSettingsFormState();
    const save = useSettingsSave({ form, saveSession: session, activeSection: 'features', buildSettingsSnapshot: () => '', featureFlags: null, setInitialSnapshot: vi.fn(), localDomain: 'GENERAL', returnPrefix: 'RET', returnStartNumber: 1, role: 'ADMIN', shopDomain: 'GENERAL', updateDomain: vi.fn() });
    return { form, save };
  });
  await act(async () => result.current.save.handleSave());
  expect(result.current.form.message?.type).toBe('error');
  expect(result.current.form.message?.text).toContain('Provider unavailable');
  expect(result.current.form.saving).toBe(false);
  expect(session.dirty).toBe(true);
});
