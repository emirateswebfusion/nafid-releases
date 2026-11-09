import { describe, expect, it } from 'vitest';
import {
  MAX_STORED_READ_IDS, addReadIds, applyReadState, buildStockNotifications, buildSyncPausedNotification,
  buildUpdateNotification, countUnread, filterNotifications, parseReadIds, removeReadId,
} from '../../src/utils/notifications/notifications';

const products = [
  { product_id: 'p1', name: 'Basmati Rice 5kg', current_stock: 0, reorder_level: 5 },
  { product_id: 'p2', name: 'Sunflower Oil 1L', current_stock: 3, reorder_level: 10 },
  { product_id: 'p3', name: 'Sugar 1kg', current_stock: 50, reorder_level: 10 },
  { product_id: 'p4', name: 'Salt 1kg', current_stock: 2, reorder_level: 0 },
];

describe('notification rules', () => {
  it('turns out-of-stock and low-stock products into notifications with stable ids', () => {
    const items = buildStockNotifications(products);
    expect(items.map(n => [n.id, n.kind])).toEqual([
      ['out-of-stock:p1:0', 'OUT_OF_STOCK'],
      ['low-stock:p2:3', 'LOW_STOCK'],
    ]);
    expect(items[1].message).toBe('Only 3 left (reorder level 10).');
    expect(buildStockNotifications(products)).toEqual(items);
  });

  it('builds update and sync notifications only when relevant', () => {
    expect(buildUpdateNotification(null)).toBeNull();
    expect(buildUpdateNotification('2.3.0')?.id).toBe('update:2.3.0');
    expect(buildSyncPausedNotification(false, null)).toBeNull();
    expect(buildSyncPausedNotification(true, null)?.message).toBe('Log in again to resume cloud sync.');
  });

  it('applies read state, sorts unread and critical first, and counts unread', () => {
    const items = [buildUpdateNotification('2.3.0')!, ...buildStockNotifications(products)];
    const list = applyReadState(items, ['out-of-stock:p1:0']);
    expect(list.map(n => [n.id, n.read])).toEqual([
      ['low-stock:p2:3', false],
      ['update:2.3.0', false],
      ['out-of-stock:p1:0', true],
    ]);
    expect(countUnread(list)).toBe(2);
  });

  it('searches title and message case-insensitively and filters by read status', () => {
    const list = applyReadState(buildStockNotifications(products), ['out-of-stock:p1:0']);
    expect(filterNotifications(list, 'oil').map(n => n.id)).toEqual(['low-stock:p2:3']);
    expect(filterNotifications(list, 'RICE stock').map(n => n.id)).toEqual(['out-of-stock:p1:0']);
    expect(filterNotifications(list, 'reorder level 10').map(n => n.id)).toEqual(['low-stock:p2:3']);
    expect(filterNotifications(list, '', 'UNREAD').map(n => n.id)).toEqual(['low-stock:p2:3']);
    expect(filterNotifications(list, '', 'READ').map(n => n.id)).toEqual(['out-of-stock:p1:0']);
    expect(filterNotifications(list, 'nothing matches')).toEqual([]);
  });

  it('keeps read ids unique, bounded, and parses the stored setting defensively', () => {
    expect(addReadIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(removeReadId(['a', 'b'], 'a')).toEqual(['b']);
    const many = Array.from({ length: MAX_STORED_READ_IDS }, (_, i) => `id${i}`);
    const next = addReadIds(many, ['new']);
    expect(next).toHaveLength(MAX_STORED_READ_IDS);
    expect(next[0]).toBe('id1');
    expect(next.at(-1)).toBe('new');
    expect(parseReadIds('["a",1,"b"]')).toEqual(['a', 'b']);
    expect(parseReadIds(['x'])).toEqual(['x']);
    expect(parseReadIds('not json')).toEqual([]);
    expect(parseReadIds(null)).toEqual([]);
  });
});
