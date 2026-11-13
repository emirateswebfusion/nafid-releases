/**
 * Request budget for the cloud API. Every request is a billed serverless invocation, so background work that finds
 * nothing to do (idle terminals, emergency-command checks, e-invoice processing) runs less often. Work the shop is
 * waiting for (pushing new records, the cash-settlement bill poll, restaurant tickets) is never delayed by this module.
 */

/** A terminal whose keyboard and mouse are untouched this long counts as idle. */
export const IDLE_AFTER_SECONDS = 10 * 60;
/** Untouched this long (closed shop, terminal left on overnight) counts as deeply idle. */
export const DEEP_IDLE_AFTER_SECONDS = 60 * 60;
/** Background cycle spacing while idle and deeply idle. */
export const IDLE_CYCLE_MS = 5 * 60_000;
export const DEEP_IDLE_CYCLE_MS = 15 * 60_000;
/** Minimum spacing of the emergency-command check and of UAE e-invoice processing. */
export const EMERGENCY_POLL_MS = 5 * 60_000;
export const EINVOICE_PROCESS_MS = 5 * 60_000;

/** Spacing a background cycle needs while the terminal is idle, or null when the normal interval applies. */
export function idleCycleMs(idleSeconds: number): number | null {
  if (idleSeconds >= DEEP_IDLE_AFTER_SECONDS) return DEEP_IDLE_CYCLE_MS;
  if (idleSeconds >= IDLE_AFTER_SECONDS) return IDLE_CYCLE_MS;
  return null;
}

export interface IdleCycleInput {
  route: 'LAN' | 'CLOUD';
  /** Restaurant terminals (kitchen screens) are watched, not touched, so they keep the normal interval. */
  restaurantMode: boolean;
  /** Local records waiting to be uploaded are always pushed on time. */
  pendingRecords: number;
  idleSeconds: number;
  lastCycleAt: number;
  now: number;
}

/** True when this background cycle can be skipped because the terminal is idle and synced recently enough. */
export function shouldSkipIdleCycle(input: IdleCycleInput): boolean {
  if (input.route !== 'CLOUD' || input.restaurantMode || input.pendingRecords > 0 || input.lastCycleAt <= 0) return false;
  const spacing = idleCycleMs(input.idleSeconds);
  return spacing !== null && input.now - input.lastCycleAt < spacing;
}

const lastRunAt = new Map<string, number>();

/** Claims a turn for `key` when at least `minGapMs` passed since its last turn (the first call always succeeds). */
export function takeTurn(key: string, minGapMs: number, now: number = Date.now()): boolean {
  const last = lastRunAt.get(key);
  if (last !== undefined && now - last < minGapMs) return false;
  lastRunAt.set(key, now);
  return true;
}

/** Test helper: forgets every recorded turn. */
export function resetRequestBudget(): void {
  lastRunAt.clear();
}
