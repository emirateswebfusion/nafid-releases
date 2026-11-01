// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useTrialSession } from '../../src/components/auth/useTrialSession';

const fixture = vi.hoisted(() => ({
  auth: { tenantId: 'trial-shop', userId: 'staff', role: 'STAFF', shopName: 'Shop', userName: 'Staff', isAuthenticated: true, token: null as string | null },
  getAccess: vi.fn(), getToken: vi.fn(), saveToken: vi.fn(), refreshToken: vi.fn(), block: vi.fn(), session: vi.fn(), setState: vi.fn(), setRole: vi.fn(),
}));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: Object.assign((selector: (state: typeof fixture.auth) => unknown) => selector(fixture.auth), { getState: () => fixture.auth, setState: fixture.setState }) }));
vi.mock('../../src/store/cartStore', () => ({ useCartStore: { getState: () => ({ setRole: fixture.setRole }) } }));
vi.mock('../../src/data/auth', () => ({ authApi: { getTrialAccess: fixture.getAccess, getToken: fixture.getToken, saveToken: fixture.saveToken, refreshTrialSession: fixture.refreshToken, blockTrialAccess: fixture.block } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/cloud/trials', () => ({ trialsCloud: { session: fixture.session } }));
const token = (user: string, trial = true) => `h.${Buffer.from(JSON.stringify({ user_id: user, trial, exp: Date.now() / 1000 + 3600 })).toString('base64url')}.s`;
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); fixture.auth.token = null; fixture.auth.userId = 'staff';
  fixture.refreshToken.mockResolvedValue({ success: true });
  fixture.getToken.mockResolvedValue(null); fixture.saveToken.mockResolvedValue({ success: true }); fixture.block.mockResolvedValue({ success: true });
  fixture.getAccess.mockResolvedValue({ is_trial: true, allowed: true, token: token('owner') });
});
it('does not use a cached owner token as another staff member’s cloud credential', async () => {
  const hook = renderHook(() => useTrialSession());
  await waitFor(() => expect(hook.result.current.checking).toBe(false));
  expect(hook.result.current.blocked).toBe(false);
  expect(fixture.session).not.toHaveBeenCalled();
  expect(fixture.saveToken).not.toHaveBeenCalled();
  expect(fixture.setState).not.toHaveBeenCalled();
});
it('keeps paid sessions out of the trial path', async () => {
  fixture.auth.token = token('staff', false);
  const hook = renderHook(() => useTrialSession());
  await waitFor(() => expect(hook.result.current.checking).toBe(false));
  expect(fixture.getAccess).not.toHaveBeenCalled(); expect(fixture.session).not.toHaveBeenCalled();
});
it('renews the same user with the current server permissions', async () => {
  fixture.auth.token = token('staff');
  fixture.getAccess.mockResolvedValue({ is_trial: true, allowed: true, token: fixture.auth.token });
  fixture.session.mockResolvedValue({ token: 'renewed', role: 'STAFF', permissions: ['sales.view'], user_name: 'Staff', restricted_page: null });
  renderHook(() => useTrialSession());
  await waitFor(() => expect(fixture.setState).toHaveBeenCalledWith(expect.objectContaining({ token: 'renewed', permissions: ['sales.view'], role: 'STAFF' })));
  expect(fixture.refreshToken).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'staff', permissions: ['sales.view'], role: 'STAFF' }));
});
it('remembers an online expiry denial and blocks cached access', async () => {
  fixture.auth.token = token('staff');
  fixture.getAccess.mockResolvedValue({ is_trial: true, allowed: true, token: fixture.auth.token });
  fixture.session.mockRejectedValue(Object.assign(new Error('Your trial has expired.'), { status: 403 }));
  const hook = renderHook(() => useTrialSession());
  await waitFor(() => expect(hook.result.current.blocked).toBe(true));
  expect(fixture.block).toHaveBeenCalledWith({ tenant_id: 'trial-shop' });
});

it('uses the active staff credential when the shop allowance was cached by its owner', async () => {
  fixture.auth.token = token('staff');
  fixture.session.mockResolvedValue({ token: 'renewed', role: 'STAFF', permissions: ['sales.view'], user_name: 'Staff', restricted_page: null });
  renderHook(() => useTrialSession());
  await waitFor(() => expect(fixture.session).toHaveBeenCalledWith(fixture.auth.token));
});

it('discards an old refresh response after a different user signs in', async () => {
  fixture.auth.token = token('staff');
  fixture.getAccess.mockResolvedValue({ is_trial: true, allowed: true, token: fixture.auth.token });
  let finish!: (value: unknown) => void;
  fixture.session.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  renderHook(() => useTrialSession());
  await waitFor(() => expect(fixture.session).toHaveBeenCalled());
  fixture.auth.userId = 'different-user'; fixture.auth.token = token('different-user');
  finish({ token: 'old-user-token', role: 'ADMIN', permissions: ['*'], user_name: 'Old user', restricted_page: null });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(fixture.saveToken).not.toHaveBeenCalled();
  expect(fixture.refreshToken).not.toHaveBeenCalled();
  expect(fixture.setState).not.toHaveBeenCalled();
});
