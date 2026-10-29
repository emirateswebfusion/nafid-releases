import { describe, expect, it } from 'vitest';
import { validateTrialDetails } from '../../src/components/auth/trialShopDetails';
import type { TrialShopDetails } from '../../src/components/auth/trialShopDetails';

const shop: TrialShopDetails = { shopName: 'Al Noor', ownerName: 'Owner', email: 'owner@example.com', phone: '+971 50 123 4567', city: 'Dubai', country: 'AE' };

describe('trial shop details', () => {
  it('accepts complete shop details without requiring tax registration', () => {
    expect(validateTrialDetails(shop)).toEqual({});
    expect(validateTrialDetails({ ...shop, country: 'IN', phone: '+91 98765 43210', city: 'Kochi' })).toEqual({});
  });
  it('rejects blank required fields and invalid contact details', () => {
    expect(Object.keys(validateTrialDetails({ ...shop, shopName: ' ', ownerName: ' ', email: 'owner@', phone: 'call me', city: ' ' }))).toEqual(['shopName', 'ownerName', 'email', 'phone', 'city']);
    expect(validateTrialDetails({ ...shop, phone: '123' }).phone).toBeDefined();
    expect(validateTrialDetails({ ...shop, phone: '1234567890123456' }).phone).toBeDefined();
  });
  it('validates trimmed input without changing the supplied details', () => {
    const details = { ...shop, email: ' owner@example.com ' };
    expect(validateTrialDetails(details)).toEqual({});
    expect(details.email).toBe(' owner@example.com ');
  });
});
