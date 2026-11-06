/** Shared earning rule for checkout, edits and settlement. Missing preference preserves inclusive earnings. */
export function calculateLoyaltyPoints(total: number, tax: number, config: { earningRate?: number; includeTax?: boolean }): number {
  const base = Math.max(0, (Number(total) || 0) - (config.includeTax === false ? Math.max(0, Number(tax) || 0) : 0));
  return Math.floor(base / Math.max(1, Number(config.earningRate) || 100));
}
