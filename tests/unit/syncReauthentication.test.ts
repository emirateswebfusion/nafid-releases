import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ token: 'old-session' as string | null, send: vi.fn(), network: {} as Record<string, unknown> }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: fixture.send } }] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({}) }));
vi.mock('../../electron/db/statements/sync/syncTransport', () => ({ selectSettings: () => ({ get: () => ({ value: JSON.stringify(fixture.network) }) }) }));
vi.mock('../../electron/sync/syncConfig', () => ({
  getAuthConfig: () => fixture.token ? { jwt_token: fixture.token, tenant_id: 'shop' } : null,
  CURSOR_REPLAY_SECONDS: 5, FETCH_TIMEOUT_MS: 30000, PULL_MAX_PAGES: 50, PULL_MAX_RETRIES: 3, PULL_PAGE_SIZE: 500, toSqliteDate: (v: unknown) => v,
}));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: () => ({ isCloudAllowed: true }) }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyOnlineStatus: vi.fn() }));
vi.mock('../../electron/services/lanPairing', () => ({ LAN_KEY_HEADER: 'X-Nafid-Lan-Key', getLanPairingKey: () => 'pairing-key' }));
import { clearAuthAndNotify, fetchWithFallback, pushBatch } from '../../electron/sync/syncTransport';
import { syncState } from '../../electron/sync/syncState';

beforeEach(() => {
  fixture.token = 'old-session'; fixture.network = {}; fixture.send.mockClear();
  syncState.isSyncActive = true; syncState.authExpiredNotified = false; syncState.syncCycleTimerId = null;
  vi.stubEnv('NAFID_CLOUD_API', 'https://cloud.test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(['new-session', null])('ignores a late cloud rejection after credentials change to %s', async replacement => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const pending = fetchWithFallback('/api/sync/products', { headers: { Authorization: 'Bearer old-session' } });
  fixture.token = replacement; finish(new Response('{}', { status: 401 })); await pending;
  expect(syncState.isSyncActive).toBe(true); expect(fixture.send).not.toHaveBeenCalled();
});
it('pauses the rejected current cloud session once and identifies that session to the renderer', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
  await fetchWithFallback('/api/sync/check-status', { headers: new Headers({ Authorization: 'Bearer old-session' }) });
  await fetchWithFallback('/api/sync/products', { headers: { Authorization: 'Bearer old-session' } });
  expect(syncState.isSyncActive).toBe(false);
  expect(fixture.send).toHaveBeenCalledExactlyOnceWith('auth:token-expired', { token: 'old-session' });
});
it('does not pause cloud authentication for a LAN pairing rejection', async () => {
  fixture.network = { syncMode: 'LAN', lanRole: 'SECONDARY', lanHostIp: '192.168.1.10' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
  const result = await fetchWithFallback('/api/sync/products', { headers: { Authorization: 'Bearer old-session' } });
  expect(result.activeRoute).toBe('LAN'); expect(syncState.isSyncActive).toBe(true); expect(fixture.send).not.toHaveBeenCalled();
});
it('does not pause a replacement session when a direct expiry check is stale', async () => {
  fixture.token = 'new-session'; await clearAuthAndNotify('old-session');
  expect(syncState.isSyncActive).toBe(true); expect(fixture.send).not.toHaveBeenCalled();
});
it.each(['new-session', null])('keeps a late batch upload rejection from pausing credentials %s', async replacement => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const pending = pushBatch('/api/sync/customers', 'old-session', [{ customer_id: 'customer' }], 'customers', 'Customers');
  fixture.token = replacement; finish(new Response('{}', { status: 401 }));
  expect(await pending).toEqual([]); expect(syncState.isSyncActive).toBe(true); expect(fixture.send).not.toHaveBeenCalled();
});
it('deduplicates simultaneous cloud rejections and cancels the paused session timer', async () => {
  vi.useFakeTimers();
  const timer = setTimeout(() => { throw new Error('Paused sync timer must not run'); }, 30000);
  syncState.syncCycleTimerId = timer;
  try {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await Promise.all(['/api/sync/products', '/api/sync/customers', '/api/sync/check-status'].map(path =>
      fetchWithFallback(path, { headers: { Authorization: 'Bearer old-session' } })));
    expect(fixture.send).toHaveBeenCalledExactlyOnceWith('auth:token-expired', { token: 'old-session' });
    expect(syncState.syncCycleTimerId).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  } finally { clearTimeout(timer); vi.useRealTimers(); }
});
