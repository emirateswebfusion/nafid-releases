import { useState } from 'react';
import { restaurantApi, parseTextList, type RestaurantSetup, type KitchenPrinterConfig, type DiningTable, type KitchenStation, type ModifierGroup } from '../../../data/restaurant';
import { useSettingsSectionSave } from '../../settings/hooks/useSettingsSectionSave';

/** Editing setup is local to Settings; only the main Save Changes writes to the data layer. */
export function useRestaurantSettingsDraft(tenantId: string, initial: RestaurantSetup, initialPrinter: KitchenPrinterConfig) {
  const [setup, setSetup] = useState(initial);
  const [printer, setPrinter] = useState(initialPrinter);
  const [saved, setSaved] = useState({ setup: initial, printer: initialPrinter });
  const snapshot = JSON.stringify({ setup, printer });
  useSettingsSectionSave(snapshot !== JSON.stringify(saved), async () => {
    if (setup.tables.some(row => !row.label.trim() || row.seats < 0 || !Number.isInteger(row.seats))) throw new Error('Every table needs a label and a whole number of seats.');
    const labels = setup.tables.map(row => row.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) throw new Error('Table labels must be unique.');
    if (setup.stations.some(row => !row.name.trim() || row.print_copies < 1 || !Number.isInteger(row.print_copies))) throw new Error('Every kitchen station needs a name and at least one whole print copy.');
    if (setup.modifierGroups.some(row => !row.name.trim() || row.min_select < 0 || row.max_select < row.min_select)) throw new Error('Check add-on group names and selection limits.');
    if (setup.modifierGroups.some(row => !setup.modifiers.some(choice => choice.group_id === row.group_id))) throw new Error('Add at least one choice to every add-on group.');
    if (setup.modifiers.some(row => !row.name.trim() || row.price < 0 || row.tax_rate < 0 || row.tax_rate > 100)) throw new Error('Check add-on choice names, prices and tax rates.');
    const check = (result: { success: boolean; error?: string }) => { if (!result.success) throw new Error(result.error || 'Could not save restaurant setup'); };
    for (const row of setup.tables) if (JSON.stringify(row) !== JSON.stringify(saved.setup.tables.find(x => x.table_id === row.table_id))) check(await restaurantApi.saveTable(row));
    for (const row of saved.setup.tables) if (!setup.tables.some(x => x.table_id === row.table_id)) check(await restaurantApi.deleteTable({ tenant_id: tenantId, table_id: row.table_id }));
    for (const row of setup.stations) if (JSON.stringify(row) !== JSON.stringify(saved.setup.stations.find(x => x.station_id === row.station_id))) check(await restaurantApi.saveStation({ ...row, categories: parseTextList(row.categories) }));
    for (const row of saved.setup.stations) if (!setup.stations.some(x => x.station_id === row.station_id)) check(await restaurantApi.deleteStation({ tenant_id: tenantId, station_id: row.station_id }));
    for (const row of setup.modifierGroups) {
      const modifiers = setup.modifiers.filter(x => x.group_id === row.group_id);
      if (JSON.stringify([row, modifiers]) !== JSON.stringify([saved.setup.modifierGroups.find(x => x.group_id === row.group_id), saved.setup.modifiers.filter(x => x.group_id === row.group_id)])) {
        check(await restaurantApi.saveModifierGroup({ ...row, categories: parseTextList(row.categories), product_ids: parseTextList(row.product_ids), modifiers }));
      }
    }
    for (const row of saved.setup.modifierGroups) if (!setup.modifierGroups.some(x => x.group_id === row.group_id)) check(await restaurantApi.deleteModifierGroup({ tenant_id: tenantId, group_id: row.group_id }));
    if (JSON.stringify(printer) !== JSON.stringify(saved.printer)) check(await restaurantApi.savePrinterConfig(printer));
    setSaved({ setup, printer });
  });
  const api = {
    ...restaurantApi,
    getPrinterConfig: async () => printer,
    savePrinterConfig: async (value: KitchenPrinterConfig) => { setPrinter(value); return { success: true as const }; },
    saveTable: async (value: Partial<DiningTable>) => {
      const row: DiningTable = { table_id: crypto.randomUUID(), tenant_id: tenantId, label: '', area: null, seats: 4, sort_order: 0, is_active: 1, ...value };
      setSetup(s => ({ ...s, tables: s.tables.some(x => x.table_id === row.table_id) ? s.tables.map(x => x.table_id === row.table_id ? row : x) : [...s.tables, row] }));
      return { success: true as const, table_id: row.table_id };
    },
    deleteTable: async ({ table_id }: { table_id: string; tenant_id: string }) => { setSetup(s => ({ ...s, tables: s.tables.filter(x => x.table_id !== table_id) })); return { success: true as const }; },
    saveStation: async (value: Omit<Partial<KitchenStation>, 'categories'> & { categories?: string[] }) => {
      const row: KitchenStation = { station_id: crypto.randomUUID(), tenant_id: tenantId, name: '', print_copies: 1, is_default: 0, sort_order: 0, ...value, categories: JSON.stringify(value.categories ?? []) };
      setSetup(s => ({ ...s, stations: (s.stations.some(x => x.station_id === row.station_id) ? s.stations.map(x => x.station_id === row.station_id ? row : x) : [...s.stations, row]).map(x => row.is_default && x.station_id !== row.station_id ? { ...x, is_default: 0 } : x) }));
      return { success: true as const, station_id: row.station_id };
    },
    deleteStation: async ({ station_id }: { station_id: string; tenant_id: string }) => { setSetup(s => ({ ...s, stations: s.stations.filter(x => x.station_id !== station_id) })); return { success: true as const }; },
    saveModifierGroup: async (value: { group_id?: string; tenant_id: string; name: string; min_select: number; max_select: number; categories: string[]; modifiers: { modifier_id?: string; name: string; price: number; tax_rate: number }[] }) => {
      const group_id = value.group_id ?? crypto.randomUUID();
      const row: ModifierGroup = { group_id, tenant_id: tenantId, name: value.name, min_select: value.min_select, max_select: value.max_select, categories: JSON.stringify(value.categories), product_ids: setup.modifierGroups.find(x => x.group_id === group_id)?.product_ids ?? '[]', sort_order: setup.modifierGroups.find(x => x.group_id === group_id)?.sort_order ?? 0 };
      setSetup(s => ({ ...s, modifierGroups: s.modifierGroups.some(x => x.group_id === group_id) ? s.modifierGroups.map(x => x.group_id === group_id ? row : x) : [...s.modifierGroups, row], modifiers: [...s.modifiers.filter(x => x.group_id !== group_id), ...value.modifiers.map((x, i) => ({ ...x, modifier_id: x.modifier_id ?? crypto.randomUUID(), tenant_id: tenantId, group_id, sort_order: i, is_active: 1 }))] }));
      return { success: true as const, group_id };
    },
    deleteModifierGroup: async ({ group_id }: { group_id: string; tenant_id: string }) => { setSetup(s => ({ ...s, modifierGroups: s.modifierGroups.filter(x => x.group_id !== group_id), modifiers: s.modifiers.filter(x => x.group_id !== group_id) })); return { success: true as const }; },
  };
  return { setup, api: api as typeof restaurantApi };
}
