// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useDashboardCards } from '../../src/components/owner-dashboard/hooks/useDashboardCards';
import { useDashboardCardsStore } from '../../src/store/dashboardCardsStore';
import { DEFAULT_FEATURE_FLAGS } from '../../src/config/featureFlags';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';

describe('VAT Reports Dashboard Card Integration (UAE vs India)', () => {
  afterEach(() => {
    setStoreCountry('IN'); // reset to India default
  });

  it('renders VAT Return & Audit for UAE stores and dispatches open-vat-reports on click', () => {
    setStoreCountry('AE');

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const { visibleCards, visibleCardIds } = useDashboardCards({
      cardOrder: useDashboardCardsStore.getState().cardOrder,
      enableScrap: true,
      featureFlags: { ...DEFAULT_FEATURE_FLAGS, gst_reports: true },
      permissions: ['reports.view'],
      role: 'ADMIN',
    });

    expect(visibleCardIds).toContain('gst-reports');
    const vatCard = visibleCards.find(c => c.id === 'gst-reports');
    expect(vatCard).toBeDefined();
    expect(vatCard?.title).toBe('VAT Return & Audit');
    expect(vatCard?.desc).toContain('FTA VAT 201 return');

    vatCard?.action();
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls.find(c => (c[0] as CustomEvent).type === 'open-vat-reports');
    expect(event).toBeDefined();

    dispatchSpy.mockRestore();
  });

  it('renders GST Reports for India stores and dispatches open-gst-reports on click', () => {
    setStoreCountry('IN');

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const { visibleCards } = useDashboardCards({
      cardOrder: useDashboardCardsStore.getState().cardOrder,
      enableScrap: true,
      featureFlags: { ...DEFAULT_FEATURE_FLAGS, gst_reports: true },
      permissions: ['reports.view'],
      role: 'ADMIN',
    });

    const gstCard = visibleCards.find(c => c.id === 'gst-reports');
    expect(gstCard?.title).toBe('GST Reports');
    expect(gstCard?.desc).toContain('GSTR-1');

    gstCard?.action();
    const event = dispatchSpy.mock.calls.find(c => (c[0] as CustomEvent).type === 'open-gst-reports');
    expect(event).toBeDefined();

    dispatchSpy.mockRestore();
  });
});
