// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { useDashboardCards } from '../../src/components/owner-dashboard/hooks/useDashboardCards';
import { useDashboardCardsStore } from '../../src/store/dashboardCardsStore';
import { ALL_CARD_DEFINITIONS } from '../../src/components/owner-dashboard/cardDefinitions';
import { DEFAULT_FEATURE_FLAGS } from '../../src/config/featureFlags';

describe('GST Reports Dashboard Card Integration', () => {
  it('includes gst-reports in the default dashboard cards order', () => {
    const state = useDashboardCardsStore.getState();
    expect(state.cardOrder).toContain('gst-reports');
  });

  it('defines metadata for gst-reports in DashboardCardCustomizer', () => {
    expect(ALL_CARD_DEFINITIONS['gst-reports']).toBeDefined();
    expect(ALL_CARD_DEFINITIONS['gst-reports'].title).toBe('GST Reports');
    expect(ALL_CARD_DEFINITIONS['gst-reports'].badge).toBe('NEW');
  });

  it('renders the gst-reports card in useDashboardCards and dispatches open-gst-reports on click', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const { visibleCards, visibleCardIds } = useDashboardCards({
      cardOrder: useDashboardCardsStore.getState().cardOrder,
      enableScrap: true,
      featureFlags: { ...DEFAULT_FEATURE_FLAGS, gst_reports: true },
      permissions: ['reports.view'],
      role: 'ADMIN',
    });

    expect(visibleCardIds).toContain('gst-reports');
    const gstCard = visibleCards.find(c => c.id === 'gst-reports');
    expect(gstCard).toBeDefined();
    expect(gstCard?.title).toBe('GST Reports');

    gstCard?.action();
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls.find(c => (c[0] as CustomEvent).type === 'open-gst-reports');
    expect(event).toBeDefined();

    dispatchSpy.mockRestore();
  });
});
