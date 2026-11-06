import { describe, it, expect } from 'vitest';
import { calculateLoyaltyPoints } from '../../electron/utils/loyalty';
describe('loyalty tax basis', () => {
  it('uses the selected basis and preserves the inclusive default', () => {
    expect(calculateLoyaltyPoints(2600, 100, { earningRate: 100 })).toBe(26);
    expect(calculateLoyaltyPoints(2600, 100, { earningRate: 100, includeTax: false })).toBe(25);
    expect(calculateLoyaltyPoints(2600, 0, { earningRate: 100, includeTax: false })).toBe(26);
    expect(calculateLoyaltyPoints(50, 100, { includeTax: false })).toBe(0);
  });
});
