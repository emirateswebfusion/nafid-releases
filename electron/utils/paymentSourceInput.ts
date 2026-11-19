/** Payment account opening amounts must not silently turn invalid text or negative values into a saved balance. */
export function paymentSourceOpening(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Opening balance must be a non-negative number');
  return amount;
}
