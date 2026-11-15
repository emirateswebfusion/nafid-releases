// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DigitalClock } from '../../src/components/owner-dashboard/DigitalClock';
import { setStoreTimezone } from '../../src/utils/time/timezoneHelper';

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); setStoreTimezone('Asia/Kolkata'); });
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

// A first sign-in (new trial shop) pulls the shop profile after the dashboard clock has mounted,
// without a window settings event. The clock must still switch to the shop's timezone.
it('picks up a shop timezone that loads after the clock mounted', () => {
  render(<DigitalClock variant="header" />);
  expect(screen.getByText('IST')).toBeTruthy();
  setStoreTimezone('Asia/Dubai');
  act(() => { vi.advanceTimersByTime(1000); });
  expect(screen.getByText('GST')).toBeTruthy();
  expect(screen.queryByText('IST')).toBeNull();
});

it.each(['Asia/Calcutta', 'Asia/Kolkata'])('shows IST for %s across shared clock labels without changing the stored timezone', (timezone) => {
  setStoreTimezone(timezone);
  for (const variant of ['header', 'pill', 'card'] as const) {
    const { unmount, container } = render(<DigitalClock variant={variant} />);
    expect(screen.getByText('IST')).toBeTruthy();
    expect(container.textContent).not.toContain('Asia/Calcutta');
    expect(localStorage.getItem('app_store_timezone')).toBe(timezone);
    unmount();
  }
});
