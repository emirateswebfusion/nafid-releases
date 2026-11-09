// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationsPage } from '../../src/components/notifications/NotificationsPage';
import { useDashboardCards } from '../../src/components/owner-dashboard/hooks/useDashboardCards';
import { ALL_CARD_DEFINITIONS } from '../../src/components/owner-dashboard/cardDefinitions';
import { DEFAULT_DASHBOARD_CARDS_ORDER } from '../../src/store/dashboardCardsStore';
import { useNotificationStore, notificationReadSettingKey } from '../../src/store/notificationStore';
import { useAuthStore } from '../../src/store/authStore';
import { useUpdateStore } from '../../src/store/updateStore';
import { DEFAULT_FEATURE_FLAGS } from '../../src/config/featureFlags';

const mocks = vi.hoisted(() => ({
  listProducts: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock('../../src/data/client', async importOriginal => ({ ...await importOriginal<typeof import('../../src/data/client')>(), hasBridge: () => true, isDesktopRuntime: () => true }));
vi.mock('../../src/data/products', () => ({ listProducts: mocks.listProducts }));
vi.mock('../../src/data/settings', () => ({ getSetting: mocks.getSetting, setSetting: mocks.setSetting, settingsApi: { get: async () => null } }));

beforeEach(() => {
  mocks.listProducts.mockImplementation(async ({ stockStatus }: { stockStatus: string }) => stockStatus === 'out_of_stock'
    ? [{ product_id: 'p1', name: 'Basmati Rice 5kg', current_stock: 0, reorder_level: 5 }]
    : [{ product_id: 'p2', name: 'Sunflower Oil 1L', current_stock: 3, reorder_level: 10 }]);
  mocks.getSetting.mockResolvedValue(null);
  mocks.setSetting.mockResolvedValue(undefined);
  useAuthStore.setState({ tenantId: 'shop', userId: 'u1', role: 'ADMIN', permissions: [], isCloudSyncPaused: false, cloudSyncReason: null });
  useUpdateStore.setState({ updateInfo: null });
  useNotificationStore.setState({ stockNotifications: [], readIds: [], scope: null, error: null, isLoading: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const items = () => screen.queryAllByTestId('notification-item');

it('lists notifications, filters them by search, and marks them read with persisted state', async () => {
  render(<NotificationsPage onClose={() => {}} />);
  await waitFor(() => expect(items()).toHaveLength(2));
  expect(screen.getByRole('heading', { name: 'Notifications' })).toBeDefined();
  expect(screen.getByText('2 unread')).toBeDefined();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search notifications' }), { target: { value: 'oil' } });
  expect(items()).toHaveLength(1);
  expect(screen.getByText('Sunflower Oil 1L is running low')).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: 'Mark "Sunflower Oil 1L is running low" as read' }));
  await waitFor(() => expect(items()[0].getAttribute('data-read')).toBe('true'));
  expect(screen.getByText('1 unread')).toBeDefined();
  expect(mocks.setSetting).toHaveBeenCalledWith({ tenant_id: 'shop', key: notificationReadSettingKey('u1'), value: JSON.stringify(['low-stock:p2:3']) });

  fireEvent.change(screen.getByRole('textbox', { name: 'Search notifications' }), { target: { value: 'no such alert' } });
  expect(items()).toHaveLength(0);
  expect(screen.getByText('No notifications match your search')).toBeDefined();
});

it('marks every notification read, including update and sync alerts, and respects stored read ids', async () => {
  mocks.getSetting.mockResolvedValue(JSON.stringify(['out-of-stock:p1:0']));
  useUpdateStore.setState({ updateInfo: { version: '9.9.9' } as never });
  act(() => useAuthStore.setState({ isCloudSyncPaused: true, cloudSyncReason: 'Token expired' }));
  render(<NotificationsPage onClose={() => {}} />);
  await waitFor(() => expect(items()).toHaveLength(4));
  expect(screen.getByText('3 unread')).toBeDefined();

  fireEvent.click(screen.getByRole('tab', { name: 'Unread' }));
  expect(items()).toHaveLength(3);

  fireEvent.click(screen.getByRole('button', { name: /Mark all as read/ }));
  await waitFor(() => expect(screen.getByText('You are all caught up')).toBeDefined());
  expect(items()).toHaveLength(0);
  fireEvent.click(screen.getByRole('tab', { name: 'All' }));
  expect(items().every(el => el.getAttribute('data-read') === 'true')).toBe(true);
});

it('hides stock alerts from staff without products.view and never loads the product list for them', async () => {
  useUpdateStore.setState({ updateInfo: { version: '9.9.9' } as never });
  act(() => useAuthStore.setState({ role: 'STAFF', permissions: ['sales.create'] }));
  render(<NotificationsPage onClose={() => {}} />);
  await waitFor(() => expect(items()).toHaveLength(1));
  expect(screen.getByText('Nafid POS v9.9.9 is available')).toBeDefined();
  expect(screen.queryByText('Basmati Rice 5kg is out of stock')).toBeNull();
  expect(mocks.listProducts).not.toHaveBeenCalled();
});

it('shows stock alerts to staff who may view products', async () => {
  act(() => useAuthStore.setState({ role: 'STAFF', permissions: ['products.view'] }));
  render(<NotificationsPage onClose={() => {}} />);
  await waitFor(() => expect(items()).toHaveLength(2));
});

it('is reachable from the dashboard for every user and opens through the open-notifications event', () => {
  expect(DEFAULT_DASHBOARD_CARDS_ORDER).toContain('notifications');
  expect(ALL_CARD_DEFINITIONS.notifications.title).toBe('Notifications');
  const { visibleCards } = useDashboardCards({ cardOrder: [], enableScrap: false, featureFlags: DEFAULT_FEATURE_FLAGS, role: 'STAFF', permissions: [] });
  const card = visibleCards.find(c => c.id === 'notifications');
  expect(card).toBeDefined();
  const listener = vi.fn();
  window.addEventListener('open-notifications', listener);
  card?.action();
  window.removeEventListener('open-notifications', listener);
  expect(listener).toHaveBeenCalledTimes(1);
});
