import { randomUUID } from 'crypto';
import { getDb } from '../db/localDb.js';
import * as sql from '../db/statements/restaurant.js';
import type { DiningTableRow, KitchenStationRow, ModifierGroupRow, ModifierRow, Result } from './restaurantTypes.js';
import { asInput, failure, flag, list, number, requiredText, text, textList, RestaurantInputError } from './restaurantInput.js';

/** Restaurant setup: dining tables, kitchen stations, modifier groups and modifiers. Called via restaurantHandlers. */

export interface RestaurantSetup {
  tables: DiningTableRow[];
  stations: KitchenStationRow[];
  modifierGroups: ModifierGroupRow[];
  modifiers: ModifierRow[];
}

/** IPC `restaurant:getSetup` */
export function getSetup(payload: unknown): RestaurantSetup {
  const tenantId = requiredText(asInput(payload), 'tenant_id');
  const db = getDb();
  return {
    tables: sql.listDiningTables(db).all(tenantId) as DiningTableRow[],
    stations: sql.listKitchenStations(db).all(tenantId) as KitchenStationRow[],
    modifierGroups: sql.listModifierGroups(db).all(tenantId) as ModifierGroupRow[],
    modifiers: sql.listModifiers(db).all(tenantId) as ModifierRow[],
  };
}

/** IPC `restaurant:saveTable` */
export function saveTable(payload: unknown): Result<{ table_id: string }> {
  try {
    const input = asInput(payload);
    const row = {
      table_id: text(input, 'table_id') ?? randomUUID(),
      tenant_id: requiredText(input, 'tenant_id'),
      label: requiredText(input, 'label'),
      area: text(input, 'area'),
      seats: Math.round(number(input, 'seats', 4, 0)),
      sort_order: Math.round(number(input, 'sort_order', 0)),
      is_active: flag(input, 'is_active', true) ? 1 : 0,
    };
    sql.upsertDiningTable(getDb()).run(row);
    return { success: true, table_id: row.table_id };
  } catch (error) {
    return failure('saveTable', error);
  }
}

/** IPC `restaurant:deleteTable` — refused while an order is open on the table. */
export function deleteTable(payload: unknown): Result {
  try {
    const input = asInput(payload);
    const tenantId = requiredText(input, 'tenant_id');
    const tableId = requiredText(input, 'table_id');
    const db = getDb();
    if (sql.findActiveOrderOnTable(db).get(tenantId, tableId)) throw new RestaurantInputError('The table has an open order');
    sql.softDeleteDiningTable(db).run(tableId, tenantId);
    return { success: true };
  } catch (error) {
    return failure('deleteTable', error);
  }
}

/** IPC `restaurant:saveStation` */
export function saveStation(payload: unknown): Result<{ station_id: string }> {
  try {
    const input = asInput(payload);
    const row = {
      station_id: text(input, 'station_id') ?? randomUUID(),
      tenant_id: requiredText(input, 'tenant_id'),
      name: requiredText(input, 'name'),
      categories: JSON.stringify(textList(input, 'categories')),
      print_copies: Math.min(5, Math.max(1, Math.round(number(input, 'print_copies', 1, 1)))),
      is_default: flag(input, 'is_default', false) ? 1 : 0,
      sort_order: Math.round(number(input, 'sort_order', 0)),
    };
    const db = getDb();
    db.transaction(() => {
      sql.upsertKitchenStation(db).run(row);
      if (row.is_default) sql.clearDefaultKitchenStations(db).run(row.tenant_id, row.station_id);
    })();
    return { success: true, station_id: row.station_id };
  } catch (error) {
    return failure('saveStation', error);
  }
}

/** IPC `restaurant:deleteStation` */
export function deleteStation(payload: unknown): Result {
  try {
    const input = asInput(payload);
    sql.softDeleteKitchenStation(getDb()).run(requiredText(input, 'station_id'), requiredText(input, 'tenant_id'));
    return { success: true };
  } catch (error) {
    return failure('deleteStation', error);
  }
}

/**
 * IPC `restaurant:saveModifierGroup` — the group with its full modifier list. Modifiers missing from the list are
 * removed (soft delete); prices are on the same price basis (VAT inclusive or not) as product prices.
 */
export function saveModifierGroup(payload: unknown): Result<{ group_id: string }> {
  try {
    const input = asInput(payload);
    const tenantId = requiredText(input, 'tenant_id');
    const minSelect = Math.round(number(input, 'min_select', 0, 0));
    const maxSelect = Math.round(number(input, 'max_select', 1, 1));
    if (maxSelect < minSelect) throw new RestaurantInputError('Maximum choices must be at least the minimum');
    const group = {
      group_id: text(input, 'group_id') ?? randomUUID(),
      tenant_id: tenantId,
      name: requiredText(input, 'name'),
      min_select: minSelect,
      max_select: maxSelect,
      categories: JSON.stringify(textList(input, 'categories')),
      product_ids: JSON.stringify(textList(input, 'product_ids')),
      sort_order: Math.round(number(input, 'sort_order', 0)),
    };
    const modifiers = list(input, 'modifiers').map((m, index) => ({
      modifier_id: text(m, 'modifier_id') ?? randomUUID(),
      tenant_id: tenantId,
      group_id: group.group_id,
      name: requiredText(m, 'name'),
      price: number(m, 'price', 0, 0),
      tax_rate: number(m, 'tax_rate', 0, 0),
      sort_order: index,
      is_active: flag(m, 'is_active', true) ? 1 : 0,
    }));
    if (modifiers.length === 0) throw new RestaurantInputError('Add at least one choice');
    const db = getDb();
    db.transaction(() => {
      sql.upsertModifierGroup(db).run(group);
      const keep = new Set(modifiers.map(m => m.modifier_id));
      for (const existing of sql.listModifiers(db).all(tenantId) as ModifierRow[]) {
        if (existing.group_id === group.group_id && !keep.has(existing.modifier_id)) {
          sql.softDeleteModifier(db).run(existing.modifier_id, tenantId);
        }
      }
      for (const modifier of modifiers) sql.upsertModifier(db).run(modifier);
    })();
    return { success: true, group_id: group.group_id };
  } catch (error) {
    return failure('saveModifierGroup', error);
  }
}

/** IPC `restaurant:deleteModifierGroup` */
export function deleteModifierGroup(payload: unknown): Result {
  try {
    const input = asInput(payload);
    const tenantId = requiredText(input, 'tenant_id');
    const groupId = requiredText(input, 'group_id');
    const db = getDb();
    db.transaction(() => {
      sql.softDeleteModifiersOfGroup(db).run(groupId, tenantId);
      sql.softDeleteModifierGroup(db).run(groupId, tenantId);
    })();
    return { success: true };
  } catch (error) {
    return failure('deleteModifierGroup', error);
  }
}
