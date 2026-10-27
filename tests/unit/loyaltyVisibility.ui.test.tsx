// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoyaltyEnabled } from '../../src/hooks/useLoyaltyEnabled';
import { useCustomerInvoiceExports } from '../../src/components/customers/hooks/useCustomerInvoiceExports';
import { useFeatureFlagsStore } from '../../src/store/featureFlagsStore';
import type { InvoiceRecord } from '../../src/components/customers/customerTypes';
const state = vi.hoisted(() => ({ config: { enabled: true }, flags: { loyalty: true } }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: async ({ key }: { key: string }) => key === 'loyalty_config' ? state.config : state.flags } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => false, bindBridge: () => ({}) }));
beforeEach(() => { state.config = { enabled: true }; state.flags = { loyalty: true }; useFeatureFlagsStore.setState({ flags: null }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('customer loyalty visibility', () => {
  it('shows enabled points and reloads to hide them after settings are switched off', async () => {
    const { result } = renderHook(() => useLoyaltyEnabled('t'));
    await waitFor(() => expect(result.current).toBe(true));
    state.config.enabled = false;
    act(() => { window.dispatchEvent(new Event('settings:updated')); });
    await waitFor(() => expect(result.current).toBe(false));
  });
  it('an explicitly disabled feature flag overrides enabled loyalty configuration', async () => {
    state.flags.loyalty = false;
    const { result } = renderHook(() => useLoyaltyEnabled('t'));
    await act(async () => {});
    expect(result.current).toBe(false);
  });
  it.each([false, true])('CSV export includes points only when enabled=%s', async (enabled) => {
    let exported: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { exported = blob; return 'blob:test'; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => useCustomerInvoiceExports({ loyaltyEnabled: enabled, billFilterEnd: '', billFilterStart: '', filteredInvoices: [], selectedCustomer: null, setExportingFilteredInvoices: vi.fn(), setExportingPdf: vi.fn(), setInvoiceBusyId: vi.fn(), showStatus: vi.fn(), tenantId: 't' }));
    await result.current.handleDownloadInvoiceCsv({ invoice_id: 'i', invoice_number: 'I1', created_at: '2026-10-27T10:00:00Z', points_earned: 10 } as InvoiceRecord);
    const content = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(exported!); });
    expect(content.includes('Points Earned')).toBe(enabled);
    expect(content.includes('Points Redeemed')).toBe(enabled);
  });
});
