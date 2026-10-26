import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_API, cloudFetch, cloudRequest, registerCloudAuth } from '../../src/data/cloud/client';

type FetchArgs = [string, RequestInit];

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (..._args: FetchArgs) => new Response(body === undefined ? 'not json' : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('cloudFetch', () => {
  let unauthorized = 0;
  beforeEach(() => {
    unauthorized = 0;
    registerCloudAuth({ getToken: async () => 'jwt-1', onUnauthorized: () => { unauthorized++; } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the bearer token and JSON content type to the cloud API and returns the body', async () => {
    const fetch = mockFetch(200, { ok: 1 });
    await expect(cloudFetch('/ads', { method: 'POST', body: '{}' })).resolves.toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${CLOUD_API}/ads`);
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-1');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.method).toBe('POST');
  });

  it('leaves the content type to the browser for FormData and sends no token when there is none', async () => {
    registerCloudAuth({ getToken: async () => null, onUnauthorized: () => undefined });
    const fetch = mockFetch(200, {});
    await cloudFetch('/upload', { method: 'POST', body: new FormData() });
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('throws the server error message, and reports a 401', async () => {
    mockFetch(401, { error: 'Token expired' });
    await expect(cloudFetch('/x')).rejects.toThrow('Token expired');
    expect(unauthorized).toBe(1);
  });

  it('falls back to a generic message for a non-JSON error body', async () => {
    mockFetch(500, undefined);
    await expect(cloudFetch('/x')).rejects.toThrow('An error occurred');
    expect(unauthorized).toBe(0);
  });
});

describe('cloudRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves /paths against the cloud API, keeps absolute URLs and adds nothing', async () => {
    const fetch = mockFetch(200, {});
    await cloudRequest('/health', { method: 'GET' });
    await cloudRequest('http://192.168.1.5:3888/health');
    expect(fetch.mock.calls[0]).toEqual([`${CLOUD_API}/health`, { method: 'GET' }]);
    expect(fetch.mock.calls[1]).toEqual(['http://192.168.1.5:3888/health', undefined]);
  });
});
