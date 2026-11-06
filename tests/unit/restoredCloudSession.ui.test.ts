// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';
import { cloudFetch } from '../../src/data/cloud/client';
const fixture = vi.hoisted(() => ({ stored: vi.fn(), offline: vi.fn() }));
vi.mock('../../src/data/auth', () => ({ authApi: { getToken: fixture.stored, getOfflineSession: fixture.offline } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/settings', () => ({ settingsApi: {} }));
vi.mock('../../src/data/sync', () => ({ syncApi: {} }));
const token = `h.${btoa(JSON.stringify({ exp: 4102444800, role: 'ADMIN' }))}.s`;
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: false, token: null, tenantId: null, userId: null, isCloudSyncPaused: true });
  fixture.offline.mockResolvedValue({ tenant_id: 'shop', user_id: 'cashier', role: 'STAFF', permissions: ['sales.create'], user_name: 'Cashier' });
  fixture.stored.mockResolvedValue({ jwt_token: token, tenant_id: 'shop', user_id: 'owner', role: 'ADMIN' });
});
afterEach(() => vi.unstubAllGlobals());
it('restores the cashier and cloud availability independently after restarting', async () => {
  await useAuthStore.getState().checkAuth();
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, userId: 'cashier', role: 'STAFF', permissions: ['sales.create'], token: null, isCloudSyncPaused: false });
});
it.each([null, { jwt_token: token, tenant_id: 'other-shop', user_id: 'owner' }])('keeps local access with paused sync for unavailable credentials (%j)', async stored => {
  fixture.stored.mockResolvedValue(stored); await useAuthStore.getState().checkAuth();
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, userId: 'cashier', isCloudSyncPaused: true });
});
it('never adopts the stored owner token for a cashier cloud UI request', async () => {
  await useAuthStore.getState().checkAuth();
  const fetch = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetch);
  await cloudFetch('/test');
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false);
  expect(useAuthStore.getState().token).toBeNull();
});
it('still restores offline work if the cloud credential file cannot be read', async () => {
  fixture.stored.mockRejectedValue(new Error('Credential file unreadable'));
  await expect(useAuthStore.getState().checkAuth()).resolves.toBeUndefined();
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, isLoading: false, userId: 'cashier', isCloudSyncPaused: true });
});
