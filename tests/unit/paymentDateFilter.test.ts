import { expect, it } from 'vitest';
import { matchesPaymentDateRange } from '../../src/components/payment-methods/paymentDateFilter';

it('preserves undated rows only when the range is cleared', () => {
  expect(matchesPaymentDateRange(null, '', '')).toBe(true);
  expect(matchesPaymentDateRange(null, '2026-11-01', '')).toBe(false);
  expect(matchesPaymentDateRange('invalid', '2026-11-01', '')).toBe(false);
});
it('includes both boundaries and supports one-sided ranges', () => {
  expect(matchesPaymentDateRange('2026-11-01', '2026-11-01', '2026-11-06')).toBe(true);
  expect(matchesPaymentDateRange('2026-11-06', '2026-11-01', '2026-11-06')).toBe(true);
  expect(matchesPaymentDateRange('2026-10-31', '2026-11-01', '')).toBe(false);
  expect(matchesPaymentDateRange('2026-11-07', '', '2026-11-06')).toBe(false);
});
