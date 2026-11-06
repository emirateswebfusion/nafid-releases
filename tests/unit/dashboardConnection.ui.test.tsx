// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { DashboardHeader } from '../../src/components/owner-dashboard/views/DashboardHeader';
import { useOwnerDashboardState } from '../../src/components/owner-dashboard/hooks/useOwnerDashboardState';
import { useOwnerDashboardEffects } from '../../src/components/owner-dashboard/hooks/useOwnerDashboardEffects';
const fixture = vi.hoisted(() => ({ subscriptions: new Set<string>(), init: vi.fn() }));
vi.mock('../../src/store/updateStore', () => ({ useUpdateStore: () => ({ init: fixture.init }) }));
vi.mock('../../src/data/client', async importOriginal => ({ ...await importOriginal<typeof import('../../src/data/client')>(), isDesktopRuntime: () => true, hasBridge: () => true }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: async () => null } }));
vi.mock('../../src/data/invoices', () => ({ invoicesApi: { getDashboardStats: async () => ({ success: true }) } }));
vi.mock('../../src/data/events', () => ({ bridgeEvents: Object.fromEntries(['onSyncCycleComplete', 'onSyncDataUpdated', 'onOnlineStatus'].map(name => [name, () => {
  fixture.subscriptions.add(name); return () => fixture.subscriptions.delete(name);
}])) }));
afterEach(cleanup);
function Header({ route, online }: { route?: 'CLOUD' | 'LAN'; online?: boolean }) {
  const od = useOwnerDashboardState();
  return <DashboardHeader canOpenSettings={false} isCloudSyncPaused={false} isEditMode={false} isSyncing={false} menuRef={{ current: null }} role="STAFF" setIsEditMode={() => {}} shopName="Shop" theme="light" toggleTheme={() => {}} userName="Cashier" od={{ ...od, ...(route ? { activeRoute: route } : {}), ...(online === undefined ? {} : { isOnline: online }) }} />;
}
it('does not claim cloud sync before any connection event arrives', () => {
  render(<Header />); expect(screen.getByText('Offline')).toBeTruthy(); expect(screen.queryByText('Cloud Synced')).toBeNull();
});
it('describes the connection without claiming that every record uploaded', () => {
  render(<Header route="CLOUD" online />); expect(screen.getByText('Cloud Connected')).toBeTruthy(); expect(screen.queryByText('Cloud Synced')).toBeNull();
});
it('releases every dashboard sync listener when the session screen closes', () => {
  const hook = renderHook(() => {
    const od = useOwnerDashboardState();
    useOwnerDashboardEffects({ od, tenantId: 'shop', userId: 'cashier', role: 'STAFF', lastSyncTime: null, loadCardOrder: async () => [], loadFlags: async () => {}, menuRef: { current: null }, setLastSyncTime: () => {} });
  });
  expect(fixture.subscriptions.size).toBe(2); hook.unmount(); expect(fixture.subscriptions.size).toBe(0);
});
