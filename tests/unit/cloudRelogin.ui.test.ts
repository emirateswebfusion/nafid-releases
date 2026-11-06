// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';

const mocks = vi.hoisted(() => ({ login: vi.fn(), offline: vi.fn(), save: vi.fn(), sync: vi.fn(), setting: vi.fn() }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/auth', () => ({ authApi: { loginOffline: mocks.offline, saveToken: mocks.save, saveOfflineSession: vi.fn(async () => ({ success: true })) } }));
vi.mock('../../src/data/cloud/authCloud', () => ({ authCloud: { login: mocks.login } }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: vi.fn(async () => null), set: mocks.setting } }));
vi.mock('../../src/data/sync', () => ({ syncApi: { runInitialSync: mocks.sync } }));
const token = (exp = Date.now() / 1000 + 3600) => `h.${btoa(JSON.stringify({ exp, role: 'ADMIN' }))}.s`;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const online = () => ({ token: token(), tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', domain_type: 'GENERAL' });
beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ isAuthenticated: false, token: null, tenantId: null, isCloudSyncPaused: true });
  mocks.offline.mockResolvedValue({ success: true, user: { tenant_id: 'shop', user_id: 'owner', role: 'ADMIN' } });
  mocks.save.mockResolvedValue({ success: true }); mocks.sync.mockResolvedValue({ success: true }); mocks.setting.mockResolvedValue({ success: true });
});
it.each([401, 403, 429])('does not bypass a cloud HTTP %s denial with cached credentials', async status => {
  mocks.login.mockResolvedValue(reply(status, { error: 'Cloud login denied' }));
  expect(await useAuthStore.getState().login('owner@example.test', 'password')).toMatchObject({ success: false });
  expect(mocks.offline).not.toHaveBeenCalled(); expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it.each(['network', 'server'])('requires a cloud session when resuming sync after a %s failure', async failure => {
  if (failure === 'network') mocks.login.mockRejectedValue(new Error('Network unavailable'));
  else mocks.login.mockResolvedValue(reply(503, { error: 'Service unavailable' }));
  const result = await useAuthStore.getState().login('owner@example.test', 'password', undefined, { requireCloud: true });
  expect(result.success).toBe(false); expect(mocks.offline).not.toHaveBeenCalled();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it('preserves ordinary offline login during a network outage', async () => {
  mocks.login.mockRejectedValue(new Error('Network unavailable'));
  expect(await useAuthStore.getState().login('owner@example.test', 'password')).toEqual({ success: true });
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, token: null, isCloudSyncPaused: true });
});
it('returns a retryable error if local authentication also fails during a network outage', async () => {
  mocks.login.mockRejectedValue(new Error('Network unavailable'));
  mocks.offline.mockRejectedValue(new Error('Local authentication unavailable'));
  await expect(useAuthStore.getState().login('owner@example.test', 'password')).resolves.toEqual({ success: false, error: 'Local authentication unavailable' });
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it.each([402, 503])('preserves ordinary offline access for provider HTTP %s outages but requires online recovery', async status => {
  mocks.login.mockImplementation(async () => reply(status, { error: 'Provider unavailable' }));
  expect(await useAuthStore.getState().login('owner@example.test', 'password')).toEqual({ success: true });
  mocks.offline.mockClear(); useAuthStore.setState({ isAuthenticated: false, token: null });
  expect(await useAuthStore.getState().login('owner@example.test', 'password', undefined, { requireCloud: true })).toMatchObject({ success: false });
  expect(mocks.offline).not.toHaveBeenCalled();
});
it.each(['result', 'throw'])('does not report login success or fall back offline when saving fails (%s)', async failure => {
  mocks.login.mockResolvedValue(reply(200, online()));
  if (failure === 'result') mocks.save.mockResolvedValue({ success: false, error: 'Disk unavailable' });
  else mocks.save.mockRejectedValue(new Error('Disk unavailable'));
  expect(await useAuthStore.getState().login('owner@example.test', 'password')).toMatchObject({ success: false, error: 'Disk unavailable' });
  expect(mocks.offline).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it.each([undefined, '', 'broken', token(Date.now() / 1000 - 60)])('rejects missing, malformed or expired cloud tokens (%s)', async invalid => {
  mocks.login.mockResolvedValue(reply(200, { ...online(), token: invalid }));
  expect(await useAuthStore.getState().login('owner@example.test', 'password')).toMatchObject({ success: false });
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.offline).not.toHaveBeenCalled();
});
it('publishes the new session only after token persistence completes and starts sync', async () => {
  const data = online(); mocks.login.mockResolvedValue(reply(200, data));
  let finish!: (value: { success: boolean }) => void;
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = useAuthStore.getState().login('owner@example.test', 'password', undefined, { requireCloud: true });
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(useAuthStore.getState().isAuthenticated).toBe(false); expect(mocks.sync).not.toHaveBeenCalled();
  finish({ success: true }); expect(await pending).toEqual({ success: true });
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, token: data.token, isCloudSyncPaused: false });
  expect(mocks.sync).toHaveBeenCalledOnce();
});
it('does not replace an online session with an offline session after a settings failure', async () => {
  const data = online(); mocks.login.mockResolvedValue(reply(200, data)); mocks.setting.mockRejectedValue(new Error('Settings unavailable'));
  expect(await useAuthStore.getState().login('owner@example.test', 'password')).toEqual({ success: true });
  expect(mocks.offline).not.toHaveBeenCalled(); expect(useAuthStore.getState().token).toBe(data.token);
});
it('keeps login retryable if an older bridge returns no token-save result', async () => {
  mocks.login.mockResolvedValue(reply(200, online())); mocks.save.mockResolvedValue(undefined);
  expect(await useAuthStore.getState().login('owner@example.test', 'password', undefined, { requireCloud: true })).toMatchObject({ success: false });
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(mocks.offline).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
