/**
 * Notification centre rules: which shop events become notifications, how read state is applied, and how the
 * Notifications page filters them. Pure functions only; the store (src/store/notificationStore.ts) loads the inputs
 * and persists the read ids.
 */

export type NotificationKind = 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UPDATE_AVAILABLE' | 'SYNC_PAUSED';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationStatusFilter = 'ALL' | 'UNREAD' | 'READ';

export interface AppNotification {
  /** Stable id: the same underlying event always yields the same id, so read state survives reloads. */
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /** Screen event (`open-*`) that takes the user to the place the notification is about. */
  actionEvent?: string;
  read: boolean;
}

export interface StockSnapshot {
  product_id: string;
  name: string;
  current_stock: number | null;
  reorder_level: number | null;
}

/** Read ids kept per user; older entries are dropped first so the stored list never grows unbounded. */
export const MAX_STORED_READ_IDS = 500;

function stockLabel(value: number | null): string {
  const n = Number(value ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Out-of-stock and low-stock (at or below the reorder level) products become one notification each. The id carries
 * the stock level, so a product that is restocked and runs low again notifies afresh. */
export function buildStockNotifications(products: StockSnapshot[]): Omit<AppNotification, 'read'>[] {
  const result: Omit<AppNotification, 'read'>[] = [];
  for (const p of products) {
    const stock = Number(p.current_stock ?? 0);
    const reorder = Number(p.reorder_level ?? 0);
    if (stock <= 0) {
      result.push({
        id: `out-of-stock:${p.product_id}:${stockLabel(stock)}`,
        kind: 'OUT_OF_STOCK', severity: 'critical',
        title: `${p.name} is out of stock`,
        message: 'Restock this product to keep selling it.',
        actionEvent: 'open-inventory-manager',
      });
    } else if (reorder > 0 && stock <= reorder) {
      result.push({
        id: `low-stock:${p.product_id}:${stockLabel(stock)}`,
        kind: 'LOW_STOCK', severity: 'warning',
        title: `${p.name} is running low`,
        message: `Only ${stockLabel(stock)} left (reorder level ${stockLabel(reorder)}).`,
        actionEvent: 'open-inventory-manager',
      });
    }
  }
  return result;
}

export function buildUpdateNotification(version: string | null | undefined): Omit<AppNotification, 'read'> | null {
  if (!version) return null;
  return {
    id: `update:${version}`,
    kind: 'UPDATE_AVAILABLE', severity: 'info',
    title: `Nafid POS v${version} is available`,
    message: 'Open Settings to see what is new and install the update.',
    actionEvent: 'open-settings-manager',
  };
}

export function buildSyncPausedNotification(paused: boolean, reason: string | null | undefined): Omit<AppNotification, 'read'> | null {
  if (!paused) return null;
  return {
    id: 'sync-paused',
    kind: 'SYNC_PAUSED', severity: 'critical',
    title: 'Cloud sync is paused',
    message: reason || 'Log in again to resume cloud sync.',
    actionEvent: 'open-session-expired-modal',
  };
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Marks each notification read or unread from the stored ids, unread first, then by severity. */
export function applyReadState(items: Omit<AppNotification, 'read'>[], readIds: readonly string[]): AppNotification[] {
  const read = new Set(readIds);
  return items
    .map(item => ({ ...item, read: read.has(item.id) }))
    .sort((a, b) => Number(a.read) - Number(b.read) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function countUnread(items: readonly AppNotification[]): number {
  return items.filter(n => !n.read).length;
}

/** Case-insensitive search over title and message, combined with the read/unread filter. */
export function filterNotifications(items: readonly AppNotification[], query: string, status: NotificationStatusFilter = 'ALL'): AppNotification[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(n => {
    if (status === 'UNREAD' && n.read) return false;
    if (status === 'READ' && !n.read) return false;
    if (terms.length === 0) return true;
    const haystack = `${n.title} ${n.message}`.toLowerCase();
    return terms.every(t => haystack.includes(t));
  });
}

/** Adds ids to the read list without duplicates, keeping the newest MAX_STORED_READ_IDS. */
export function addReadIds(readIds: readonly string[], ids: readonly string[]): string[] {
  const next = readIds.filter(id => !ids.includes(id));
  next.push(...ids);
  return next.slice(-MAX_STORED_READ_IDS);
}

export function removeReadId(readIds: readonly string[], id: string): string[] {
  return readIds.filter(r => r !== id);
}

/** Parses the stored setting (a JSON array of ids, or the already-parsed array). Anything else reads as empty. */
export function parseReadIds(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
}
