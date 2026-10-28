// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReturnManager } from '../../src/components/returns/ReturnManager';
vi.mock('../../src/data/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/data/client')>(), isDesktopRuntime: () => true,
}));
vi.mock('../../src/data/returns', () => ({ returnsApi: { getReturns: async () => [
  { return_id:'today',return_number:'R-1',grand_total:375.5,return_date:null,created_at:'2026-10-27T20:30:00Z',refund_method:'UPI' },
  { return_id:'credit',return_number:'R-3',grand_total:1000,return_date:null,created_at:'2026-10-28T00:00:00Z',refund_method:'ADJUST_BILL' },
  { return_id:'yesterday',return_number:'R-2',grand_total:100,return_date:null,created_at:'2026-10-27T10:00:00Z',refund_method:'CASH' },
] } }));
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });
it('uses created_at and the store timezone for today refunds and historical dates', async () => {
  vi.useFakeTimers({ shouldAdvanceTime:true });
  vi.setSystemTime(new Date('2026-10-28T01:00:00Z'));
  localStorage.setItem('app_store_timezone','Asia/Dubai');
  render(<ReturnManager onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText("Today's Returns").parentElement?.textContent).toContain('₹1,375.50'));
  expect(screen.getByText('Total Return Value').parentElement?.textContent).toContain('₹1,475.50');
  expect(screen.getByText('27 Oct 2026')).toBeTruthy();
  expect(screen.getAllByText('28 Oct 2026')).toHaveLength(2);
});
