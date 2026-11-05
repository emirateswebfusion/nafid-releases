// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const report = vi.hoisted(() => vi.fn());
vi.mock('../../src/data/restaurant', () => ({ restaurantApi: { report } }));
vi.mock('../../src/utils/pricing/money', () => ({ formatCurrency: (n: number) => String(n) }));
import { RestaurantReportView } from '../../src/components/restaurant/views/RestaurantReportView';
afterEach(cleanup);
it('uses the shared financial period and reloads when that period changes', async () => {
  report.mockResolvedValue({ byType: [], byWaiter: [], voids: [] });
  const view = render(<RestaurantReportView tenantId="shop" period={{ from: '2026-11-01', to: '2026-11-05' }} />);
  await waitFor(() => expect(report).toHaveBeenLastCalledWith({ tenant_id: 'shop', from: '2026-11-01', to: '2026-11-05' }));
  expect(view.container.querySelector('input[type="date"]')).toBeNull();
  view.rerender(<RestaurantReportView tenantId="shop" period={{ from: '2026-10-01', to: '2026-10-31' }} />);
  await waitFor(() => expect(report).toHaveBeenLastCalledWith({ tenant_id: 'shop', from: '2026-10-01', to: '2026-10-31' }));
});
