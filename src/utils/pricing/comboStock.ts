/** Complete combos available from their limiting component. Invalid requirements are unavailable. */
export function getComboStock(items: unknown): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const requirements = new Map<string, { stock: number; quantity: number }>();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') return 0;
    const row = item as Record<string, unknown>;
    const stock = Number(row.product_stock);
    const quantity = Number(row.quantity);
    if (!Number.isFinite(stock) || !Number.isFinite(quantity) || quantity <= 0) return 0;
    const key = typeof row.product_id === 'string' ? row.product_id : `row:${index}`;
    const previous = requirements.get(key);
    requirements.set(key, { stock: Math.min(previous?.stock ?? stock, stock), quantity: (previous?.quantity ?? 0) + quantity });
  }
  return Math.max(0, Math.min(...Array.from(requirements.values(), row => Math.floor(row.stock / row.quantity))));
}
