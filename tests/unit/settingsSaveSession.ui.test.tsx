// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SettingsSaveSession } from '../../src/components/settings/settingsSaveSession';
import { SettingsSaveContext } from '../../src/components/settings/hooks/useSettingsSectionSave';
import { useRestaurantSettingsDraft } from '../../src/components/restaurant/settings/useRestaurantSettingsDraft';
const api = vi.hoisted(() => ({ saveTable: vi.fn(), deleteTable: vi.fn(), saveStation: vi.fn(), deleteStation: vi.fn(), saveModifierGroup: vi.fn(), deleteModifierGroup: vi.fn(), savePrinterConfig: vi.fn() }));
vi.mock('../../src/data/restaurant', async original => ({ ...await original<typeof import('../../src/data/restaurant')>(), restaurantApi: api }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const table = { table_id: 't1', tenant_id: 'shop', label: 'T1', area: 'Main', seats: 4, sort_order: 1, is_active: 1 };
const initial = { tables: [table], stations: [], modifierGroups: [], modifiers: [] };
it('stages restaurant edits and writes only when the main session saves, with retry after failure', async () => {
  const session = new SettingsSaveSession();
  const context = { session, changed: () => {} };
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsSaveContext.Provider value={context}>{children}</SettingsSaveContext.Provider>;
  const { result } = renderHook(() => useRestaurantSettingsDraft('shop', initial, { widthMm: 80, stations: {} }), { wrapper });
  await act(async () => { await result.current.api.saveTable({ ...table, label: 'Patio', is_active: 0 }); });
  expect(api.saveTable).not.toHaveBeenCalled();
  expect(result.current.setup.tables[0].label).toBe('Patio');
  expect(session.dirty).toBe(true);
  api.saveTable.mockResolvedValueOnce({ success: false, error: 'Table is occupied' });
  await act(async () => { await expect(session.save()).rejects.toThrow('Table is occupied'); });
  expect(session.dirty).toBe(true);
  api.saveTable.mockResolvedValue({ success: true, table_id: 't1' });
  await act(async () => { await session.save(); });
  expect(api.saveTable).toHaveBeenLastCalledWith(expect.objectContaining({ table_id: 't1', label: 'Patio', is_active: 0 }));
  expect(session.dirty).toBe(false);
});
it('rejects duplicate table labels before writing any changes', async () => {
  const session = new SettingsSaveSession();
  const context = { session, changed: () => {} };
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsSaveContext.Provider value={context}>{children}</SettingsSaveContext.Provider>;
  const { result } = renderHook(() => useRestaurantSettingsDraft('shop', initial, { widthMm: 80, stations: {} }), { wrapper });
  await act(async () => { await result.current.api.saveTable({ ...table, table_id: 't2', label: 't1' }); });
  await expect(session.save()).rejects.toThrow('Table labels must be unique');
  expect(api.saveTable).not.toHaveBeenCalled();
});
it('waits for every dirty section and stops success on a failed section', async () => {
  const session = new SettingsSaveSession();
  let finish: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const next = vi.fn().mockRejectedValue(new Error('Offline'));
  session.update({ id: 'printer', dirty: true, save: () => pending });
  session.update({ id: 'cloud', dirty: true, save: next });
  const saving = session.save();
  expect(next).not.toHaveBeenCalled();
  finish?.();
  await expect(saving).rejects.toThrow('Offline');
  expect(session.dirty).toBe(true);
});

it('saves add-on list fields in the existing API format and preserves product assignments', async () => {
  const session = new SettingsSaveSession();
  const context = { session, changed: () => {} };
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsSaveContext.Provider value={context}>{children}</SettingsSaveContext.Provider>;
  const setup = { ...initial, modifierGroups: [{ group_id: 'g', tenant_id: 'shop', name: 'Extras', min_select: 0, max_select: 1, categories: '["Meals"]', product_ids: '["p1"]', sort_order: 2 }], modifiers: [{ modifier_id: 'm', tenant_id: 'shop', group_id: 'g', name: 'Cheese', price: 2, tax_rate: 5, sort_order: 0, is_active: 1 }] };
  const { result } = renderHook(() => useRestaurantSettingsDraft('shop', setup, { widthMm: 80, stations: {} }), { wrapper });
  await act(async () => { await result.current.api.saveModifierGroup({ group_id: 'g', tenant_id: 'shop', name: 'Toppings', min_select: 0, max_select: 1, categories: ['Meals'], modifiers: setup.modifiers }); });
  expect(api.saveModifierGroup).not.toHaveBeenCalled();
  api.saveModifierGroup.mockResolvedValue({ success: true, group_id: 'g' });
  await act(async () => session.save());
  expect(api.saveModifierGroup).toHaveBeenCalledWith(expect.objectContaining({ group_id: 'g', categories: ['Meals'], product_ids: ['p1'], sort_order: 2 }));
});
