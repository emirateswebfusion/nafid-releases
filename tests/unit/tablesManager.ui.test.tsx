// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ saveTable: vi.fn(), deleteTable: vi.fn() }));
vi.mock('../../src/data/restaurant', () => ({ restaurantApi: api }));
import { TablesManager } from '../../src/components/restaurant/views/TablesManager';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('creates a named table through an explicit form save', async () => {
  api.saveTable.mockResolvedValue({ success: true }); const reload = vi.fn().mockResolvedValue(undefined);
  render(<TablesManager tenantId="shop" tables={[]} onChanged={reload} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Table' }));
  fireEvent.change(screen.getByLabelText('Table name'), { target: { value: 'Patio 1' } });
  expect(api.saveTable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save Table' }));
  await waitFor(() => expect(api.saveTable).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'shop', label: 'Patio 1', seats: 4 })));
  await waitFor(() => expect(reload).toHaveBeenCalled());
});
it('requires confirmation and preserves an occupied table after rejected deletion', async () => {
  api.deleteTable.mockResolvedValue({ success: false, error: 'Table has an open order' });
  render(<TablesManager tenantId="shop" tables={[{ table_id: 't', tenant_id: 'shop', label: 'T1', area: 'Main', seats: 4, sort_order: 1, is_active: 1 }]} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
  expect(api.deleteTable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Table' }));
  await screen.findByText('Table has an open order');
  expect(screen.getByRole('button', { name: 'Delete Table' })).toBeDefined();
});

it('offers bulk add even with existing tables and skips duplicate names', async () => {
  api.saveTable.mockResolvedValue({ success: true });
  render(<TablesManager tenantId="shop" tables={[{ table_id: 't', tenant_id: 'shop', label: 'T1', area: 'Main', seats: 4, sort_order: 1, is_active: 1 }]} onChanged={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bulk Add Tables' }));
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '3' } });
  expect(api.saveTable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add Tables', exact: true }));
  await waitFor(() => expect(api.saveTable).toHaveBeenCalledTimes(2));
  expect(api.saveTable).toHaveBeenCalledWith(expect.objectContaining({ label: 'T2', seats: 4 }));
  expect(api.saveTable).toHaveBeenCalledWith(expect.objectContaining({ label: 'T3', seats: 4 }));
});
it('retries a partial bulk failure without recreating successful rows', async () => {
  api.saveTable.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'Disconnected' }).mockResolvedValue({ success: true });
  render(<TablesManager tenantId="shop" tables={[]} onChanged={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bulk Add Tables' }));
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Tables', exact: true }));
  await screen.findByText(/Successfully added tables are kept/);
  fireEvent.click(screen.getByRole('button', { name: 'Add Tables', exact: true }));
  await waitFor(() => expect(api.saveTable).toHaveBeenCalledTimes(3));
  expect(api.saveTable.mock.calls.map(call => call[0].label)).toEqual(['T1', 'T2', 'T2']);
});
