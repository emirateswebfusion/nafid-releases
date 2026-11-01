import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ config: {} as Record<string, unknown> }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => ({ prepare: () => ({ get: () => ({ value: JSON.stringify(state.config) }) }) }) }));
vi.mock('../../electron/sync/syncConfig', () => ({ getAuthConfig: () => ({ tenant_id: 't' }) }));
vi.mock('../../electron/sync/syncProgress', () => ({ notifyOnlineStatus: vi.fn() }));
vi.mock('../../electron/sync/cloudAccess', () => ({ calculateEffectiveCloudAccess: vi.fn() }));
vi.mock('../../electron/services/lanPairing', () => ({ LAN_KEY_HEADER: 'x-nafid-lan-key', getLanPairingKey: vi.fn() }));
import { getSyncEndpoints } from '../../electron/sync/syncTransport';

it('identifies the configured primary rather than inferring the role from its URL', () => {
  state.config = { syncMode: 'LAN', lanRole: 'PRIMARY', lanPort: 38996 };
  expect(getSyncEndpoints()).toMatchObject({ primaryRoute: 'LAN', isLanPrimary: true });
});
it.each(['LAN', 'HYBRID'])('%s secondary remains a client when its host is loopback', syncMode => {
  state.config = { syncMode, lanRole: 'SECONDARY', lanHostIp: '127.0.0.1', lanPort: 38996 };
  const endpoints = getSyncEndpoints();
  expect(endpoints.primaryUrl).toBe('http://127.0.0.1:38996');
  expect(endpoints.isLanPrimary).not.toBe(true);
});
