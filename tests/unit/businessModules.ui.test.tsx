// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
it('keeps category and module selections in the parent draft without persisting or applying them', () => {
  function Draft() {
    const [flags, setFlags] = useState(DEFAULT_FEATURE_FLAGS);
    return <FeaturesTab featureFlags={flags} onFlagsChange={setFlags} handleToggleFeatureFlag={(key, value) => setFlags(current => ({ ...current, [key]: value ?? !current[key] }))} setShowCashRegister={() => {}} setConfirmTurnOffAllModalOpen={() => {}} />;
  }
  render(<Draft />);
  fireEvent.click(screen.getByRole('button', { name: /Restaurant \/ Cafeteria/ }));
  expect((screen.getByRole('checkbox', { name: /Enable Scrap Management/ }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: /Kitchen Display/ }));
  expect((screen.getByRole('checkbox', { name: /Kitchen Display/ }) as HTMLInputElement).checked).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(useFeatureFlagsStore.getState().flags?.restaurant_mode).toBe(false);
  expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
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
