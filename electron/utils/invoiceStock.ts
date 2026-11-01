export interface StockLine {
  product_id: string;
  quantity: unknown;
  isServiceItem?: unknown;
  is_service_item?: unknown;
  isCombo?: unknown;
  combo_id?: unknown;
  combo_items?: unknown;
  combo_details?: unknown;
}

/** A saved combo recipe is immutable: never use today's catalog recipe to reverse yesterday's sale. */
export function stockComponents(line: StockLine): { product_id: string; quantity: number }[] {
  if (line.isServiceItem === true || line.is_service_item === true || line.is_service_item === 1) return [];
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Invalid stock quantity');
  if (quantity === 0) return [];
  let recipe: unknown = line.combo_items ?? line.combo_details;
  if (typeof recipe === 'string') recipe = JSON.parse(recipe);
  if (!Array.isArray(recipe) || recipe.length === 0) {
    if (line.isCombo || line.combo_id) throw new Error('Combo stock details are missing');
    return [{ product_id: line.product_id, quantity }];
  }
  return recipe.map((part: unknown) => {
    if (!part || typeof part !== 'object' || !('product_id' in part) || !('quantity' in part)
      || typeof part.product_id !== 'string' || !part.product_id || !Number.isFinite(Number(part.quantity))
      || Number(part.quantity) <= 0) throw new Error('Invalid combo stock details');
    return { product_id: part.product_id, quantity: quantity * Number(part.quantity) };
  });
}


export function netStockComponents(lines: readonly StockLine[], returns: readonly StockLine[]) {
  const quantities = new Map<string, number>();
  for (const [rows, direction] of [[lines, 1], [returns, -1]] as const) {
    for (const line of rows) for (const part of stockComponents(line)) {
      quantities.set(part.product_id, (quantities.get(part.product_id) || 0) + direction * part.quantity);
    }
  }
  return [...quantities].filter(([, quantity]) => quantity > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
}
