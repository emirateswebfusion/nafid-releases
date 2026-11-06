// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCustomerData, type UseCustomerDataContext } from '../../src/components/customers/hooks/useCustomerData';
const api = vi.hoisted(() => ({ getCustomers: vi.fn(), getCustomerInvoices: vi.fn(), getCustomerLoyaltyTransactions: vi.fn() }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../src/data/customers', () => ({ customersApi: api }));
vi.mock('../../src/data/parties', () => ({ partiesApi: { getParties: async () => [] } }));
it('refreshes the stale summary together with purchases and points activity', async () => {
  const old = { customer_id: 'c', name: 'Customer', current_points_balance: 0, total_points_earned: 0 };
  const fresh = { ...old, current_points_balance: 67, total_points_earned: 67 };
  api.getCustomers.mockResolvedValue([fresh]);
  api.getCustomerInvoices.mockResolvedValue([{ invoice_id: 'i', points_earned: 55 }]);
  api.getCustomerLoyaltyTransactions.mockResolvedValue([{ points: 55 }]);
  let selected: unknown;
  const setSelectedCustomer = vi.fn(update => { selected = typeof update === 'function' ? update(selected) : update; });
  const ctx = { customers: [old], tenantId: 't', visibleCount: 50, parties: [],
    lastInteractedCustomerIdRef: { current: null }, listScrollRef: { current: null }, savedScrollTopRef: { current: 0 },
    findMatchingPartyForCustomer: () => null, setSelectedCustomer,
    ...Object.fromEntries(['setMatchedParty', 'setView', 'setDetailTab', 'setBillFilterStart', 'setBillFilterEnd', 'setInvoicesLoading', 'setLoyaltyTxsLoading', 'setInvoices', 'setLoyaltyTxs', 'showStatus'].map(key => [key, vi.fn()])),
  } as unknown as UseCustomerDataContext;
  const { result } = renderHook(() => useCustomerData(ctx));
  await act(async () => { await result.current.loadCustomerDetails(old as UseCustomerDataContext['customers'][number]); });
  expect(selected).toEqual(fresh);
  expect(api.getCustomers).toHaveBeenCalledWith({ tenant_id: 't', search: 'Customer' });
});
