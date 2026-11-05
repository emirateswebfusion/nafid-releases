// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), sync: vi.fn() }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: Object.assign((select?: (s: { tenantId: string; role: string; permissions: string[] }) => unknown) => {
  const s = { tenantId: 'shop', role: 'ADMIN', permissions: ['*'] }; return select ? select(s) : s;
}, { getState: () => ({ role: 'ADMIN', permissions: ['*'] }) }) }));
vi.mock('../../src/data/settings', () => ({ setSetting: mocks.save, settingsApi: { get: vi.fn() } }));
vi.mock('../../src/data/sync', () => ({ syncApi: { runInitialSync: mocks.sync } }));
import { FeaturesTab } from '../../src/components/settings/tabs/FeaturesTab';
import { PermissionGuard } from '../../src/components/app/PermissionGuard';
import { useFeatureFlagsStore, DEFAULT_FEATURE_FLAGS } from '../../src/config/featureFlags';
import { useDashboardCards } from '../../src/components/owner-dashboard/hooks/useDashboardCards';
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue(undefined); mocks.sync.mockResolvedValue(undefined); useFeatureFlagsStore.getState().setFlags({ ...DEFAULT_FEATURE_FLAGS }); });
it('selects a restaurant category, allows customization, and persists it for the shop', async () => {
  render(<FeaturesTab featureFlags={DEFAULT_FEATURE_FLAGS} handleToggleFeatureFlag={() => {}} setShowCashRegister={() => {}} setConfirmTurnOffAllModalOpen={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /Restaurant \/ Cafeteria/ }));
  expect((screen.getByRole('checkbox', { name: /Enable Scrap Management/ }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: /Kitchen Display/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save shop modules' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'feature_flags', value: expect.objectContaining({ restaurant_mode: true, dining_tables: true, takeaway_delivery: true, kitchen_display: false, scrap: false }) }));
  await screen.findByRole('status');
  await waitFor(() => expect(useFeatureFlagsStore.getState().flags?.kitchen_display).toBe(false));
});
it('hides disabled dashboard cards and exposes food operations as separate pages', () => {
  const flags = { ...DEFAULT_FEATURE_FLAGS, restaurant_mode: true, dining_tables: true, takeaway_delivery: true, kitchen_display: false, advertisements: false, scrap: false };
  const { visibleCardIds } = useDashboardCards({ cardOrder: [], enableScrap: true, featureFlags: flags, role: 'ADMIN', permissions: ['*'] });
  expect(visibleCardIds).toContain('tables'); expect(visibleCardIds).toContain('takeaway-delivery');
  for (const id of ['restaurant', 'kitchen-display', 'advertisements', 'scrap']) expect(visibleCardIds).not.toContain(id);
});
it('blocks a disabled module even for an administrator with an already-open page', () => {
  useFeatureFlagsStore.getState().setFlag('advertisements', false);
  render(<PermissionGuard feature="advertisements"><div>Private promotions page</div></PermissionGuard>);
  expect(screen.queryByText('Private promotions page')).toBeNull();
  expect(screen.getByText('This module is turned off')).toBeDefined();
});
