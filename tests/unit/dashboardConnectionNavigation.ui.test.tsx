// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useSyncStatus } from '../../src/components/app/hooks/useSyncStatus';
import { useOwnerDashboardState } from '../../src/components/owner-dashboard/hooks/useOwnerDashboardState';
import { useOwnerDashboardEffects } from '../../src/components/owner-dashboard/hooks/useOwnerDashboardEffects';
import { useSyncConnectionStore } from '../../src/store/syncConnectionStore';
const fixture = vi.hoisted(() => ({ online: new Set<(online: boolean, route?: 'CLOUD' | 'LAN' | 'NONE') => void>() }));
vi.mock('../../src/data/client', async importOriginal => ({ ...await importOriginal<typeof import('../../src/data/client')>(), hasBridge: () => true, isDesktopRuntime: () => true }));
vi.mock('../../src/data/sync', () => ({ syncApi: {} }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: async () => null } }));
vi.mock('../../src/data/invoices', () => ({ invoicesApi: { getDashboardStats: async () => ({ success: true }) } }));
vi.mock('../../src/data/events', () => ({ bridgeEvents: {
  onOnlineStatus: (callback: (online: boolean, route?: 'CLOUD' | 'LAN' | 'NONE') => void) => { fixture.online.add(callback); return () => fixture.online.delete(callback); },
  onSyncProgress: () => () => {}, onSyncCycleComplete: () => () => {}, onSyncDataUpdated: () => () => {},
} }));
afterEach(() => { cleanup(); fixture.online.clear(); useSyncConnectionStore.getState().reset(); });
const renderDashboard = () => renderHook(() => {
  const od = useOwnerDashboardState();
  useOwnerDashboardEffects({ od, tenantId: 'shop', userId: 'cashier', role: 'STAFF', lastSyncTime: null, loadCardOrder: async () => [], loadFlags: async () => {}, menuRef: { current: null }, setLastSyncTime: () => {} });
  return od;
});
it('retains cloud status across leaving and reopening the dashboard, and tracks changes while it is closed', () => {
  renderHook(() => useSyncStatus({ isAuthenticated: true, isCloudSyncPaused: true }));
  let dashboard = renderDashboard();
  act(() => fixture.online.forEach(callback => callback(true, 'CLOUD')));
  expect(dashboard.result.current).toMatchObject({ isOnline: true, activeRoute: 'CLOUD' });
  dashboard.unmount();
  dashboard = renderDashboard();
  expect(dashboard.result.current).toMatchObject({ isOnline: true, activeRoute: 'CLOUD' });
  dashboard.unmount();
  act(() => fixture.online.forEach(callback => callback(false, 'NONE')));
  dashboard = renderDashboard();
  expect(dashboard.result.current).toMatchObject({ isOnline: false, activeRoute: 'NONE' });
});
it('clears the last connection on logout and releases the shell subscription', () => {
  const shell = renderHook(({ signedIn }) => useSyncStatus({ isAuthenticated: signedIn, isCloudSyncPaused: true }), { initialProps: { signedIn: true } });
  const dashboard = renderHook(useOwnerDashboardState);
  act(() => fixture.online.forEach(callback => callback(true, 'LAN')));
  expect(dashboard.result.current.isOnline).toBe(true);
  shell.rerender({ signedIn: false });
  expect(dashboard.result.current).toMatchObject({ isOnline: false, activeRoute: 'NONE' });
  expect(fixture.online.size).toBe(0);
});
