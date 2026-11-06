/** Keep this terminal's saved bill order when legacy cloud responses have no line positions.
 * Removed lines stay removed; new lines retain their incoming order after surviving saved lines.
 */
export function preserveInvoiceItemOrder<T extends { item_id?: unknown }>(incoming: readonly T[], saved: readonly { item_id?: unknown }[]): T[] {
  const positions = new Map(saved.map((item, index) => [item.item_id, index]));
  return [...incoming].sort((a, b) => (positions.get(a.item_id) ?? saved.length) - (positions.get(b.item_id) ?? saved.length));
}
