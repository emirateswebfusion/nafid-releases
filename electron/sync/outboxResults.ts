export type Row = Record<string, unknown>;
/** Keep queue order and stop before a second edit that needs the preceding financial receipt. */
export function orderedFinancialBatch<T extends { tenant_id: string; entity: string; entity_id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.entity !== 'parties' && row.entity !== 'party_ledger') continue;
    const key = JSON.stringify([row.tenant_id, row.entity, row.entity_id]);
    if (seen.has(key)) return rows.slice(0, index);
    seen.add(key);
  }
  return rows;
}
export const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
export function resultAction(value: unknown): { done: boolean; error: string | null; current?: Row } {
  if (!isRow(value)) return { done: false, error: 'Invalid result' };
  if (value.status === 'applied' || value.status === 'duplicate') return { done: true, error: null };
  if (value.status === 'conflict') return isRow(value.current)
    ? { done: true, error: 'conflict', current: value.current } : { done: false, error: 'Conflict missing current row' };
  return { done: false, error: typeof value.error === 'string' ? value.error : String(value.status ?? 'Missing result') };
}
export function usesOutbox(engine: unknown, network: unknown): boolean {
  if (engine !== 'outbox') return false;
  return !(isRow(network) && (network.syncMode === 'LAN' || network.syncMode === 'HYBRID')
    && (network.lanRole === 'PRIMARY' || network.lanRole === 'SECONDARY'));
}
