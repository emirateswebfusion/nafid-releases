/** Desktop side of the per-installation monotone counter wire contract. */
export function normalizeStockCounters(input: unknown): string | null {
  if (input == null) return null;
  const parsed: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Invalid stock counters');
  const entries = Object.entries(parsed);
  if (entries.some(([key, amount]) => !/^[a-zA-Z0-9_-]{1,128}:[ar]$/.test(key)
    || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) throw new Error('Invalid stock counter');
  return JSON.stringify(Object.fromEntries(entries));
}
