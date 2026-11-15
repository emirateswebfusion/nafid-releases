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

it.each([
  { tz: 'Asia/Dubai', expected: 'GST' },
  { tz: 'Asia/Tokyo', expected: 'JST' },
  { tz: 'Asia/Singapore', expected: 'SGT' },
])('shows standard abbreviation $expected for $tz across clock variants', ({ tz, expected }) => {
  setStoreTimezone(tz);
  for (const variant of ['header', 'pill', 'card'] as const) {
    const { unmount, container } = render(<DigitalClock variant={variant} />);
    expect(screen.getByText(expected)).toBeTruthy();
    expect(container.textContent).not.toContain(tz);
    expect(localStorage.getItem('app_store_timezone')).toBe(tz);
    unmount();
  }
});

it('switches America/New_York between EST and EDT depending on date', () => {
  setStoreTimezone('America/New_York');

  // Winter (January) -> EST
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  const winter = render(<DigitalClock variant="header" />);
  expect(screen.getByText('EST')).toBeTruthy();
  winter.unmount();

  // Summer (July) -> EDT
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  const summer = render(<DigitalClock variant="header" />);
  expect(screen.getByText('EDT')).toBeTruthy();
  summer.unmount();
});

it('switches Europe/London between GMT and BST depending on date', () => {
  setStoreTimezone('Europe/London');

  // Winter (January) -> GMT
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  const winter = render(<DigitalClock variant="header" />);
  expect(screen.getByText('GMT')).toBeTruthy();
  winter.unmount();

  // Summer (July) -> BST
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  const summer = render(<DigitalClock variant="header" />);
  expect(screen.getByText('BST')).toBeTruthy();
  summer.unmount();
});

it('switches Australia/Sydney between AEST and AEDT depending on date', () => {
  setStoreTimezone('Australia/Sydney');

  // Australian Summer (January) -> AEDT (Daylight Saving)
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  const summer = render(<DigitalClock variant="header" />);
  expect(screen.getByText('AEDT')).toBeTruthy();
  summer.unmount();

  // Australian Winter (July) -> AEST (Standard Time)
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  const winter = render(<DigitalClock variant="header" />);
  expect(screen.getByText('AEST')).toBeTruthy();
  winter.unmount();
});
