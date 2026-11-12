import { afterEach, describe, expect, it } from 'vitest';
import {
  DEEP_IDLE_AFTER_SECONDS, DEEP_IDLE_CYCLE_MS, IDLE_AFTER_SECONDS, IDLE_CYCLE_MS,
  idleCycleMs, resetRequestBudget, shouldSkipIdleCycle, takeTurn, type IdleCycleInput,
} from '../../electron/sync/requestBudget';

const NOW = 10_000_000;
const idle = (over: Partial<IdleCycleInput> = {}): IdleCycleInput => ({
  route: 'CLOUD', restaurantMode: false, pendingRecords: 0, idleSeconds: IDLE_AFTER_SECONDS, lastCycleAt: NOW - 60_000, now: NOW, ...over,
});

afterEach(() => resetRequestBudget());

describe('idle cycle spacing', () => {
  it('keeps the normal interval while the terminal is in use', () => {
    expect(idleCycleMs(IDLE_AFTER_SECONDS - 1)).toBeNull();
    expect(shouldSkipIdleCycle(idle({ idleSeconds: 30 }))).toBe(false);
  });

  it('stretches to 5 minutes when idle and 15 minutes when deeply idle', () => {
    expect(idleCycleMs(IDLE_AFTER_SECONDS)).toBe(IDLE_CYCLE_MS);
    expect(idleCycleMs(DEEP_IDLE_AFTER_SECONDS)).toBe(DEEP_IDLE_CYCLE_MS);
    expect(shouldSkipIdleCycle(idle())).toBe(true);
    expect(shouldSkipIdleCycle(idle({ lastCycleAt: NOW - IDLE_CYCLE_MS }))).toBe(false);
    expect(shouldSkipIdleCycle(idle({ idleSeconds: DEEP_IDLE_AFTER_SECONDS, lastCycleAt: NOW - IDLE_CYCLE_MS }))).toBe(true);
    expect(shouldSkipIdleCycle(idle({ idleSeconds: DEEP_IDLE_AFTER_SECONDS, lastCycleAt: NOW - DEEP_IDLE_CYCLE_MS }))).toBe(false);
  });

  it('never delays uploads, restaurant screens, LAN sync or the first cycle', () => {
    expect(shouldSkipIdleCycle(idle({ pendingRecords: 1 }))).toBe(false);
    expect(shouldSkipIdleCycle(idle({ restaurantMode: true }))).toBe(false);
    expect(shouldSkipIdleCycle(idle({ route: 'LAN' }))).toBe(false);
    expect(shouldSkipIdleCycle(idle({ lastCycleAt: 0 }))).toBe(false);
  });
});

describe('takeTurn', () => {
  it('allows the first call, then waits for the gap', () => {
    expect(takeTurn('k', 1000, NOW)).toBe(true);
    expect(takeTurn('k', 1000, NOW + 999)).toBe(false);
    expect(takeTurn('k', 1000, NOW + 1000)).toBe(true);
  });

  it('tracks keys separately and a zero gap always runs', () => {
    expect(takeTurn('a', 1000, NOW)).toBe(true);
    expect(takeTurn('b', 1000, NOW)).toBe(true);
    expect(takeTurn('a', 0, NOW + 1)).toBe(true);
  });
});
