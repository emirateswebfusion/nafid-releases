// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';
const fixture = vi.hoisted(() => ({ pin: vi.fn() }));
vi.mock('../../src/data/auth', () => ({ authApi: { loginWithPin: fixture.pin } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/settings', () => ({ settingsApi: {} }));
vi.mock('../../src/data/sync', () => ({ syncApi: {} }));
beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ isAuthenticated: false, token: null, isCloudSyncPaused: false }); });
it.each([false, undefined])('keeps a PIN-only session visibly paused when cloud readiness is %s', async ready => {
  fixture.pin.mockResolvedValue({ success: true, cloud_sync_ready: ready, user: { tenant_id: 'shop', user_id: 'cashier', name: 'Cashier', role: 'STAFF', permissions: ['sales.create'] } });
  expect(await useAuthStore.getState().loginWithPin('1234')).toEqual({ success: true });
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, token: null, isCloudSyncPaused: true });
});
it('only unpauses cloud sync when main confirms a usable terminal credential', async () => {
  fixture.pin.mockResolvedValue({ success: true, cloud_sync_ready: true, user: { tenant_id: 'shop', user_id: 'cashier', name: 'Cashier', role: 'STAFF', permissions: ['sales.create'] } });
  await useAuthStore.getState().loginWithPin('1234');
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, token: null, isCloudSyncPaused: false });
});
