import { afterEach, expect, it, vi } from 'vitest';
import { loginCloud } from '../../electron/services/cloudLoginService';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('uses the configured API without a file-origin header or any caller-selected address', async () => {
  vi.stubEnv('VENDORA_CLOUD_API', 'https://cloud.example');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ token: 'new-token' }), { status: 200 })); vi.stubGlobal('fetch', fetch);
  expect(await loginCloud({ email: ' owner@example.test ', password: 'password', url: 'https://untrusted.example' })).toEqual({ success: true, status: 200, data: { token: 'new-token' } });
  expect(fetch).toHaveBeenCalledWith('https://cloud.example/auth/login', expect.objectContaining({ redirect: 'error', body: JSON.stringify({ email: 'owner@example.test', password: 'password' }) }));
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('Origin')).toBe(false);
});
it.each([401, 403, 429, 503])('preserves server HTTP %s and its error body', async status => {
  vi.stubEnv('VENDORA_CLOUD_API', 'https://cloud.example'); vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Denied"}', { status })));
  expect(await loginCloud({ email: 'owner@example.test', password: 'password' })).toEqual({ success: true, status, data: { error: 'Denied' } });
});
it.each(['http://external.example', 'https://user:secret@cloud.example'])('rejects an unsafe configured endpoint (%s) before sending credentials', async url => {
  vi.stubEnv('VENDORA_CLOUD_API', url); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect((await loginCloud({ email: 'owner@example.test', password: 'password' })).success).toBe(false); expect(fetch).not.toHaveBeenCalled();
});
it('allows local development login and returns network failure without logging credentials', async () => {
  vi.stubEnv('VENDORA_CLOUD_API', 'http://localhost:3001'); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Connection refused'); }));
  const result = await loginCloud({ email: 'owner@example.test', password: 'password' });
  expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('owner@example.test'); expect(JSON.stringify(result)).not.toContain('password');
});
