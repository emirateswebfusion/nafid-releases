/** Signed movement from outstanding sold components before an operation to those afterwards. */
export function stockDifference(before: readonly { product_id: string; quantity: number }[], after: readonly { product_id: string; quantity: number }[]) {
  const changes = new Map<string, number>();
  for (const [rows, direction] of [[before, 1], [after, -1]] as const) {
    for (const row of rows) changes.set(row.product_id, (changes.get(row.product_id) || 0) + direction * row.quantity);
  }
  return [...changes].filter(([, quantity]) => quantity !== 0).map(([product_id, quantity]) => ({ product_id, quantity }));
}
