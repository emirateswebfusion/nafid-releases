// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useDataUploadImportActions } from '../../src/components/data-upload/hooks/useDataUploadImportActions';
import { useDataUploadState } from '../../src/components/data-upload/hooks/useDataUploadState';

const importOpeningBalances = vi.hoisted(() => vi.fn());
vi.mock('../../src/data/parties', () => ({ partiesApi: { importOpeningBalances, bulkImportParties: vi.fn() } }));
vi.mock('../../src/data/products', () => ({ productsApi: {} }));
vi.mock('../../src/data/staff', () => ({ staffApi: {} }));

const row = (name: string, balance: number) => ({ id: name, data: { name, balance, tax_rate_percent: 0, uom: '', hsn_sac_code: '' }, isValid: true, errors: [] });

function setup(asOf: string) {
  const onImportSuccess = vi.fn();
  const view = renderHook(() => {
    const du = useDataUploadState();
    return { du, actions: useDataUploadImportActions({ du, entityType: 'opening_balances', tenantId: 't', userId: 'u', userName: 'Owner', onClose: vi.fn(), onImportSuccess }) };
  });
  act(() => {
    view.result.current.du.setParsedRows([row('Ravi', 100), row('Nobody', 5)]);
    view.result.current.du.setOpeningAsOf(asOf);
  });
  return { view, onImportSuccess };
}

beforeEach(() => importOpeningBalances.mockReset());

it('asks for the as-of date before touching any data', async () => {
  const { view } = setup('');
  await act(() => view.result.current.actions.handleImport());
  expect(importOpeningBalances).not.toHaveBeenCalled();
  expect(view.result.current.du.message?.type).toBe('error');
});

it('sends signed amounts at the end of the as-of day, and reports the outcome', async () => {
  importOpeningBalances.mockResolvedValue({ success: true, applied: true, posted: 2, blocked: 0, total: 105, results: [] });
  const { view, onImportSuccess } = setup('2026-10-31');
  await act(() => view.result.current.actions.handleImport());
  expect(importOpeningBalances.mock.calls[0][0]).toMatchObject({
    tenant_id: 't', party_type: 'CUSTOMER', apply: true, as_of: new Date('2026-10-31T23:59:59').toISOString(),
    rows: [{ name: 'Ravi', amount: 100 }, { name: 'Nobody', amount: 5 }],
  });
  expect(view.result.current.du.message).toMatchObject({ type: 'success' });
  expect(onImportSuccess).toHaveBeenCalledWith(2, 'opening_balances');
});

it('a blocked file imports nothing and marks the rows that need attention', async () => {
  importOpeningBalances.mockResolvedValue({ success: true, applied: false, posted: 0, blocked: 1, total: 105, results: [
    { name: 'Ravi', amount: 100, status: 'post' }, { name: 'Nobody', amount: 5, status: 'unmatched', reason: 'No party with this name' },
  ] });
  const { view, onImportSuccess } = setup('2026-10-31');
  await act(() => view.result.current.actions.handleImport());
  expect(view.result.current.du.message?.text).toContain('Nothing was imported');
  expect(view.result.current.du.parsedRows.map(r => r.isValid)).toEqual([true, false]);
  expect(view.result.current.du.parsedRows[1].errors).toEqual(['No party with this name']);
  expect(onImportSuccess).not.toHaveBeenCalled();
});
