// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuthState } from '../../src/store/authStore';
import { resumeCloudSync } from '../../src/store/cloudSyncRecovery';
const fixture = vi.hoisted(() => ({ login: vi.fn(), save: vi.fn(), sync: vi.fn() }));
vi.mock('../../src/data/cloud/authCloud', () => ({ authCloud: { login: fixture.login } }));
vi.mock('../../src/data/auth', () => ({ authApi: { resumeCloudSession: fixture.save } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/sync', () => ({ syncApi: { runInitialSync: fixture.sync } }));
const token = `h.${btoa(JSON.stringify({ exp: 4102444800, tenant_id: 'shop', user_id: 'owner' }))}.s`;
const reply = (status = 200, body: unknown = { token, tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', permissions: ['*'] }) => new Response(JSON.stringify(body), { status });
let state: AuthState;
const access = { getState: () => state, setState: (patch: Partial<AuthState>) => { state = { ...state, ...patch }; } };
beforeEach(() => {
  vi.resetAllMocks(); fixture.login.mockImplementation(async () => reply()); fixture.save.mockResolvedValue({ success: true }); fixture.sync.mockResolvedValue({ success: true });
  state = { isAuthenticated: true, tenantId: 'shop', userId: 'cashier', token: null, role: 'STAFF', permissions: ['sales.create'], userName: 'Cashier', shopName: 'Shop', isCloudSyncPaused: true } as AuthState;
});
it('reconnects the terminal using its owner without changing local identity or permissions', async () => {
  expect(await resumeCloudSync('owner@example.test', 'password', access)).toEqual({ success: true });
  expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ expected_tenant_id: 'shop', expected_user_id: 'cashier', credentials: expect.objectContaining({ jwt_token: token, user_id: 'owner' }) }));
  expect(state).toMatchObject({ isAuthenticated: true, role: 'STAFF', permissions: ['sales.create'], userId: 'cashier', token: null, isCloudSyncPaused: false });
  expect(fixture.sync).toHaveBeenCalledOnce();
});
it.each([401, 403, 429, 503])('keeps the authenticated local session after cloud HTTP %s', async status => {
  const original = state; fixture.login.mockResolvedValue(reply(status, { error: 'Cloud denied' }));
  expect(await resumeCloudSync('owner@example.test', 'password', access)).toEqual({ success: false, error: 'Cloud denied' });
  expect(state).toBe(original); expect(fixture.save).not.toHaveBeenCalled();
});
it('rejects another shop without saving its credentials', async () => {
  fixture.login.mockResolvedValue(reply(200, { token, tenant_id: 'other-shop', user_id: 'owner', role: 'ADMIN' }));
  expect((await resumeCloudSync('owner@example.test', 'password', access)).success).toBe(false);
  expect(fixture.save).not.toHaveBeenCalled(); expect(state.tenantId).toBe('shop');
});
it('keeps the paused session retryable after save failure', async () => {
  fixture.save.mockResolvedValueOnce({ success: false, error: 'Disk unavailable' });
  expect(await resumeCloudSync('owner@example.test', 'password', access)).toEqual({ success: false, error: 'Disk unavailable' });
  expect(state.isCloudSyncPaused).toBe(true); expect(fixture.sync).not.toHaveBeenCalled();
  expect((await resumeCloudSync('owner@example.test', 'password', access)).success).toBe(true);
});
it.each(['cancel', 'user-switch', 'logout'])('discards the pending login after %s', async reason => {
  const controller = new AbortController(); let finish!: (value: Response) => void;
  fixture.login.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = resumeCloudSync('owner@example.test', 'password', access, controller.signal);
  if (reason === 'cancel') controller.abort();
  if (reason === 'user-switch') state = { ...state, userId: 'another-cashier' };
  if (reason === 'logout') state = { ...state, isAuthenticated: false };
  finish(reply()); expect((await pending).success).toBe(false); expect(fixture.save).not.toHaveBeenCalled();
});
it('preserves offline work when the network is unavailable', async () => {
  fixture.login.mockRejectedValue(new Error('Network unavailable')); const original = state;
  expect((await resumeCloudSync('owner@example.test', 'password', access)).success).toBe(false); expect(state).toBe(original);
});
