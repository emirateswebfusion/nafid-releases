import { describe, it, expect } from 'vitest';
import { readTrialClaims, trialAccessError } from '../../electron/utils/trialAccess';

const now = Date.parse('2026-10-30T10:00:00Z');
const claims = { trial: true as const, tenant_id: 'shop', exp: now / 1000 + 3600, trial_expires_at: '2026-11-01T10:00:00Z' };
const token = (body: unknown) => `header.${Buffer.from(JSON.stringify(body)).toString('base64url')}.signature`;
describe('desktop trial access', () => {
  it('preserves paid account behavior and rejects malformed trial claims', () => {
    expect(readTrialClaims(token({ tenant_id: 'shop' }))).toBeNull();
    expect(readTrialClaims('invalid')).toBeNull();
    expect(readTrialClaims(token({ ...claims, exp: undefined }))).toBeNull();
    expect(readTrialClaims(token(claims))).toEqual(claims);
  });
  it('allows cached trial access only within its approved lease', () => {
    expect(trialAccessError(claims, now, now)).toBeNull();
    expect(trialAccessError(claims, claims.exp * 1000, now)).toContain('renew');
  });
  it('never allows a cached lease beyond the actual trial end', () => {
    expect(trialAccessError({ ...claims, trial_expires_at: new Date(now).toISOString() }, now, now)).toContain('expired');
  });
  it('detects a backwards clock jump', () => {
    expect(trialAccessError(claims, now - 300001, now)).toContain('clock');
    expect(trialAccessError(claims, now - 1000, now)).toBeNull();
  });
});
