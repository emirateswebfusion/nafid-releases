// @vitest-environment jsdom
import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const writes = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../src/data/settings', () => ({ setSetting: writes, settingsApi: { get: vi.fn().mockResolvedValue(null) } }));
import { SettingsSaveSession } from '../../src/components/settings/settingsSaveSession';
import { SettingsSaveContext } from '../../src/components/settings/hooks/useSettingsSectionSave';
import { BillingRulesTab } from '../../src/components/settings/tabs/BillingRulesTab';
import { BillingUICustomizer } from '../../src/components/billing-ui-customizer/BillingUICustomizer';
import { useBillingUIStore, DEFAULT_BILLING_UI_CONFIG } from '../../src/store/billingUIStore';
import { DEFAULT_FEATURE_FLAGS, useFeatureFlagsStore } from '../../src/config/featureFlags';
import { useDesignDraft } from '../../src/components/design-settings/useDesignDraft';
import { useThemeStore } from '../../src/store/themeStore';
afterEach(() => { cleanup(); writes.mockClear(); });
it('billing rule switches change parent drafts without changing runtime permissions or layout', () => {
  const beforeFlags = useFeatureFlagsStore.getState().flags;
  const beforeConfig = useBillingUIStore.getState().config;
  function Rules() {
    const [flags, setFlags] = useState(DEFAULT_FEATURE_FLAGS);
    const [config, setConfig] = useState(DEFAULT_BILLING_UI_CONFIG);
    return <BillingRulesTab featureFlags={flags} onToggleFeature={(key, value) => setFlags(f => ({ ...f, [key]: value ?? !f[key] }))} billingUIConfig={config} setBillingUIConfig={setConfig} enableConvertToGst setEnableConvertToGst={() => {}} showPriceOverrideMrp setShowPriceOverrideMrp={() => {}} />;
  }
  render(<Rules />);
  fireEvent.click(screen.getByText('Biller PIN Protection'));
  fireEvent.click(screen.getByText('Show Product Purchase Cost in Price Override Menu (View-Only)'));
  expect(useFeatureFlagsStore.getState().flags).toEqual(beforeFlags);
  expect(useBillingUIStore.getState().config).toEqual(beforeConfig);
  expect(writes).not.toHaveBeenCalled();
});
it('resetting the billing layout only proposes defaults to the parent', () => {
  const before = useBillingUIStore.getState().config;
  const change = vi.fn();
  render(<BillingUICustomizer config={{ ...DEFAULT_BILLING_UI_CONFIG, showPurchasePriceInPOS: true }} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
  expect(change).toHaveBeenCalledWith(DEFAULT_BILLING_UI_CONFIG);
  expect(useBillingUIStore.getState().config).toEqual(before);
  expect(writes).not.toHaveBeenCalled();
});
it('theme choices leave runtime and cache unchanged until the main save completes', async () => {
  const session = new SettingsSaveSession();
  const context = { session, changed: () => {} };
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsSaveContext.Provider value={context}>{children}</SettingsSaveContext.Provider>;
  const original = useThemeStore.getState().primaryColor;
  const cache = localStorage.getItem('vendora-primary-color');
  const { result } = renderHook(useDesignDraft, { wrapper });
  act(() => result.current.setPrimaryColor('#059669'));
  expect(useThemeStore.getState().primaryColor).toBe(original);
  expect(localStorage.getItem('vendora-primary-color')).toBe(cache);
  expect(writes).not.toHaveBeenCalled();
  await act(async () => session.save());
  expect(useThemeStore.getState().primaryColor).toBe('#059669');
  expect(localStorage.getItem('vendora-primary-color')).toBe('#059669');
  expect(session.dirty).toBe(false);
});

it('reverting WhatsApp switches clears pending changes and saving waits for durable settings', async () => {
  const { useWhatsAppConnection } = await import('../../src/components/whatsapp/hooks/useWhatsAppConnection');
  const { useWhatsAppSettingsState } = await import('../../src/components/whatsapp/hooks/useWhatsAppSettingsState');
  const session = new SettingsSaveSession();
  const context = { session, changed: () => {} };
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsSaveContext.Provider value={context}>{children}</SettingsSaveContext.Provider>;
  const { result } = renderHook(() => { const wa = useWhatsAppSettingsState(); return useWhatsAppConnection({ effectiveTenantId: 'shop', wa }); }, { wrapper });
  await act(async () => result.current.handleToggleLedgerAlerts(false));
  expect(session.dirty).toBe(true);
  await act(async () => result.current.handleToggleLedgerAlerts(true));
  expect(session.dirty).toBe(false);
  expect(writes).not.toHaveBeenCalled();
  await act(async () => result.current.handleToggleIncludeShopName(true));
  await act(async () => session.save());
  expect(writes).toHaveBeenCalledWith({ tenant_id: 'shop', key: 'ledger_whatsapp_include_shop', value: true });
  expect(session.dirty).toBe(false);
});
