import { describe, it, expect } from 'vitest';
import { cloudTokenUnusable, LAN_PLACEHOLDER_TOKEN } from '../../electron/sync/syncAuth';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: object) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

describe('cloud token usability', () => {
  it('rejects a missing token', () => {
    expect(cloudTokenUnusable('')).toBe(true);
  });
  it('rejects the LAN placeholder: the cloud never accepts it (changed 2026-10-23; it used to count as usable)', () => {
    expect(cloudTokenUnusable(LAN_PLACEHOLDER_TOKEN)).toBe(true);
  });
  it('accepts a JWT that has not expired, or has no exp', () => {
    expect(cloudTokenUnusable(jwt({ tenant_id: 't1', exp: inSeconds(3600) }))).toBe(false);
    expect(cloudTokenUnusable(jwt({ tenant_id: 't1' }))).toBe(false);
  });
  it('rejects a JWT whose exp has passed', () => {
    expect(cloudTokenUnusable(jwt({ tenant_id: 't1', exp: inSeconds(-60) }))).toBe(true);
  });
  it('keeps treating a non-JWT string as usable (pre-existing; the server rejects it)', () => {
    expect(cloudTokenUnusable('not-a-jwt')).toBe(false);
    expect(cloudTokenUnusable('a.%%%')).toBe(false);
  });
});
