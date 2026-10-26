export type Row = Record<string, unknown>;
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
