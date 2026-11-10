import { describe, expect, it, vi } from 'vitest';
import { handleReturnsAndPricingIntent } from '../../src/services/offlineAi/handlers/returnsAndPricing';
import { createAiQueryContext } from '../../src/services/offlineAi/queryContext';
const state = vi.hoisted(() => ({ config: { enabled: true }, flags: { loyalty: true } }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: async ({ key }: { key: string }) => key === 'loyalty_config' ? state.config : state.flags } }));
vi.mock('../../src/data/client', () => ({ hasBridge: () => true, bindBridge: () => ({}) }));
describe('loyalty assistant report', () => {
  it.each([[false, true], [true, false], [true, true]])('honors config=%s and feature=%s', async (enabled, feature) => {
    state.config.enabled = enabled; state.flags.loyalty = feature;
    const result = await handleReturnsAndPricingIntent({ intent: 'LOYALTY_POINTS', params: {} }, createAiQueryContext('points', 't', [], false));
    expect(result).toMatchObject({ content: expect.stringContaining(enabled && feature ? 'Whose points do you need?' : 'disabled in Settings') });
  });
});
