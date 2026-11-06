// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authCloud } from '../../src/data/cloud/authCloud';
const fixture = vi.hoisted(() => ({ login: vi.fn(), desktop: true, supported: true }));
vi.mock('../../src/data/auth', () => ({ authApi: { loginCloud: fixture.login } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => fixture.desktop, hasBridge: () => fixture.supported }));
beforeEach(() => { vi.clearAllMocks(); fixture.desktop = true; fixture.supported = true; });
afterEach(() => vi.unstubAllGlobals());
it('uses the scoped main-process login channel rather than the browser network', async () => {
  fixture.login.mockResolvedValue({ success: true, status: 401, data: { error: 'Invalid credentials' } }); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const response = await authCloud.login('https://renderer-override.invalid', 'owner@example.test', 'password');
  expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: 'Invalid credentials' });
  expect(fixture.login).toHaveBeenCalledExactlyOnceWith({ email: 'owner@example.test', password: 'password' }); expect(fetch).not.toHaveBeenCalled();
});
it('retains browser login for web/dev surfaces without the native channel', async () => {
  fixture.desktop = false; const fetch = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetch);
  await authCloud.login('https://browser.example', 'owner@example.test', 'password');
  expect(fixture.login).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledWith('https://browser.example/auth/login', expect.any(Object));
});
it('does not persist or accept a main-process login response after the dialog was cancelled', async () => {
  let finish!: (value: unknown) => void; const controller = new AbortController();
  fixture.login.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = authCloud.login('', 'owner@example.test', 'password', controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled'); controller.abort();
  finish({ success: true, status: 200, data: { token: 'late' } }); await rejected;
});
