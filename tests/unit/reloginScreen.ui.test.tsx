// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { LoginScreen } from '../../src/components/auth/LoginScreen';
import { useScreenEvents, type ScreenEventsContext } from '../../src/components/app/hooks/useScreenEvents';
import { useAuthStore } from '../../src/store/authStore';

const fixture = vi.hoisted(() => ({
  login: vi.fn(), offline: vi.fn(), prompt: vi.fn(), stored: vi.fn(),
  reject: null as ((session?: { token: string }) => void) | null,
}));
vi.mock('../../src/data/client', async importOriginal => ({ ...await importOriginal<typeof import('../../src/data/client')>(), isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/auth', () => ({ authApi: {
  getTerminalConfig: async () => ({ isConfigured: true, shop_name: 'Test shop' }),
  loginOffline: fixture.offline,
  getToken: fixture.stored,
  saveOfflineSession: async () => ({ success: true }),
} }));
vi.mock('../../src/data/cloud/authCloud', () => ({ authCloud: { login: fixture.login } }));
vi.mock('../../src/data/events', () => ({ bridgeEvents: {
  onDeepLink: () => () => {}, onScaleWeight: () => () => {},
  onTokenExpired: (callback: (session?: { token: string }) => void) => { fixture.reject = callback; return () => { fixture.reject = null; }; },
} }));
const token = `h.${btoa(JSON.stringify({ exp: 4102444800 }))}.s`;
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  fixture.stored.mockResolvedValue(null);
  useAuthStore.setState({ isAuthenticated: false, token: null, tenantId: 'shop', userId: 'staff', isCloudSyncPaused: true });
});
afterEach(cleanup);
it('allows password-only users to enter the POS offline when cloud login is unavailable', async () => {
  // A previous release's recovery flag must no longer force online-only POS entry.
  sessionStorage.setItem('auth_prefer_email', 'true');
  fixture.login.mockResolvedValue(new Response(JSON.stringify({ error: 'Cloud service unavailable' }), { status: 503 }));
  fixture.offline.mockResolvedValue({ success: true, user: { tenant_id: 'shop', user_id: 'staff', role: 'STAFF', name: 'Staff', permissions: ['sales.create'] } });
  render(<StrictMode><LoginScreen /></StrictMode>);
  fireEvent.change(screen.getByPlaceholderText('you@yourshop.com'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));
  await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
  expect(useAuthStore.getState()).toMatchObject({ token: null, isCloudSyncPaused: true });
  expect(fixture.offline).toHaveBeenCalledExactlyOnceWith({ email: 'owner@example.test', password: 'test-password' });
});
function subscribe() {
  const context = new Proxy({} as ScreenEventsContext, { get: (_target, key) => {
    if (key === 'featureFlagsRef') return { current: null };
    if (key === 'enableScrapRef') return { current: false };
    return key === 'setShowSessionExpiredModal' ? fixture.prompt : () => {};
  } });
  return renderHook(() => useScreenEvents(context));
}
it('prompts for a server-rejected active token even when its expiry is in the future', async () => {
  useAuthStore.setState({ isAuthenticated: true, token, isCloudSyncPaused: false }); subscribe();
  fixture.reject?.({ token });
  await waitFor(() => expect(fixture.prompt).toHaveBeenCalledWith(true));
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, isCloudSyncPaused: true });
});
it('ignores delayed worker events from the previous login and while signed out', () => {
  useAuthStore.setState({ isAuthenticated: true, token, isCloudSyncPaused: false }); subscribe();
  fixture.reject?.({ token: 'old-session' });
  useAuthStore.setState({ isAuthenticated: false, token: null }); fixture.reject?.({ token });
  expect(fixture.prompt).not.toHaveBeenCalled(); expect(useAuthStore.getState().isCloudSyncPaused).toBe(false);
});
it('pauses a PIN user when the matching terminal cloud credential is rejected', async () => {
  useAuthStore.setState({ isAuthenticated: true, token: null, isCloudSyncPaused: false });
  fixture.stored.mockResolvedValue({ tenant_id: 'shop', jwt_token: token }); subscribe();
  fixture.reject?.({ token });
  await waitFor(() => expect(fixture.prompt).toHaveBeenCalledWith(true));
  expect(useAuthStore.getState()).toMatchObject({ token: null, isCloudSyncPaused: true });
});
it('ignores a PIN-session rejection if a different user signs in while the stored token is read', async () => {
  useAuthStore.setState({ isAuthenticated: true, token: null, isCloudSyncPaused: false });
  let finish!: (value: unknown) => void;
  fixture.stored.mockImplementation(() => new Promise(resolve => { finish = resolve; })); subscribe();
  fixture.reject?.({ token });
  useAuthStore.setState({ userId: 'different-user' }); finish({ tenant_id: 'shop', jwt_token: token });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fixture.prompt).not.toHaveBeenCalled(); expect(useAuthStore.getState().isCloudSyncPaused).toBe(false);
});
it.each([
  { tenant_id: 'other-shop', jwt_token: token },
  { tenant_id: 'shop', jwt_token: 'replacement-token' },
])('ignores a PIN-session event that does not match its stored tenant credential (%j)', async stored => {
  useAuthStore.setState({ isAuthenticated: true, token: null, isCloudSyncPaused: false });
  fixture.stored.mockResolvedValue(stored); subscribe(); fixture.reject?.({ token });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fixture.prompt).not.toHaveBeenCalled(); expect(useAuthStore.getState().isCloudSyncPaused).toBe(false);
});
