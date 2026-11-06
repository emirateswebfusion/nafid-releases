// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';
const fixture = vi.hoisted(() => ({ login: vi.fn(), save: vi.fn(), clear: vi.fn(), clearCart: vi.fn(), pin: vi.fn() }));
vi.mock('../../src/data/cloud/authCloud', () => ({ authCloud: { login: fixture.login } }));
vi.mock('../../src/data/auth', () => ({ authApi: { saveToken: fixture.save, clearToken: fixture.clear, loginWithPin: fixture.pin } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: async () => null, set: async () => ({ success: true }) } }));
vi.mock('../../src/data/sync', () => ({ syncApi: { runInitialSync: async () => ({ success: true }) } }));
vi.mock('../../src/store/cartStore', () => ({ useCartStore: { getState: () => ({ clearCart: fixture.clearCart, resetDomainConfirmation: vi.fn(), setRole: vi.fn(), setDomain: vi.fn(), confirmDomain: vi.fn() }) } }));
beforeEach(() => { vi.resetAllMocks(); fixture.clear.mockResolvedValue({ success: true }); fixture.save.mockResolvedValue({ success: true }); useAuthStore.setState({ isAuthenticated: true, tenantId: 'shop', userId: 'owner', token: 'old', role: 'ADMIN' }); });
it('does not save a late cloud login response after the user has signed out', async () => {
  let finish!: (value: Response) => void;
  fixture.login.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = useAuthStore.getState().login('owner@example.test', 'password');
  await useAuthStore.getState().logout();
  const token = `h.${btoa(JSON.stringify({ exp: 4102444800, role: 'ADMIN' }))}.s`;
  finish(new Response(JSON.stringify({ token, tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', shop_name: 'Shop' }), { status: 200 }));
  expect((await pending).success).toBe(false); expect(fixture.save).not.toHaveBeenCalled(); expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it('does not reopen a session after a delayed PIN result when logout already completed', async () => {
  let finish!: (value: unknown) => void;
  fixture.pin.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = useAuthStore.getState().loginWithPin('1234'); await useAuthStore.getState().logout();
  finish({ success: true, cloud_sync_ready: true, user: { tenant_id: 'shop', user_id: 'cashier', role: 'STAFF', permissions: [], name: 'Cashier' } });
  expect((await pending).success).toBe(false); expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it.each(['returned', 'thrown'])('keeps the local session and cart retryable if sign-out storage fails (%s)', async failure => {
  if (failure === 'returned') fixture.clear.mockResolvedValue({ success: false, error: 'Credential file locked' });
  else fixture.clear.mockRejectedValue(new Error('Credential file locked'));
  await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, isCloudSyncPaused: true, authError: expect.any(String) });
  expect(fixture.clearCart).not.toHaveBeenCalled();
});
