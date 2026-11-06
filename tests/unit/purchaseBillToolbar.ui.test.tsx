// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PurchaseBillList, type PurchaseBillListProps } from '../../src/components/purchase/views/PurchaseBillList';
import type { PurchaseBill } from '../../src/components/purchase/purchaseTypes';

afterEach(cleanup);
const bill = (id: string, type: string): PurchaseBill => ({
  purchase_bill_id: id, tenant_id: 'test', bill_number: id, supplier_id: null, supplier_name: 'Supplier',
  bill_date: null, invoice_number: null, notes: null, total_amount: 100, bill_type: type,
  payment_type: 'CASH', sync_status: 'SYNCED', created_at: null, updated_at: null,
  row_version: 1, origin: null, stock_revision: 0,
});

it('selects and resets bill types with counts while retaining the toolbar actions', () => {
  const onResync = vi.fn();
  const exportBills = vi.fn(async () => {});
  function Workspace() {
    const [filterType, setFilterType] = useState<PurchaseBillListProps['filterType']>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const props: PurchaseBillListProps = {
      bills: [bill('gst', 'GST'), bill('estimate', 'ESTIMATE')],
      filteredBills: [bill('gst', 'GST')], billSummaries: { gst: {
        totalQty: 1, cgst: 0, sgst: 0, taxableAmount: 100, itemsCount: 1, hasPaper: true,
      } },
      filterType, setFilterType, searchQuery, setSearchQuery, dateFrom, dateTo, setDateFrom, setDateTo,
      handleDelete: vi.fn(), handleEditBill: vi.fn(async () => {}), handleExportCSV: exportBills,
      handlePrintBill: vi.fn(async () => {}), handleViewBill: vi.fn(async () => {}),
      isExporting: false, loading: false, showAddForm: false, viewingBill: null,
      setEditHasItems: vi.fn(), setEditingBill: vi.fn(), setEstHasItems: vi.fn(),
      setGstHasItems: vi.fn(), setShowAddForm: vi.fn(), onResyncPurchases: onResync,
    };
    return <PurchaseBillList {...props} />;
  }
  render(<Workspace />);
  const type = screen.getByRole('button', { name: 'Bill type' });
  expect(type.textContent).toContain('All Types (2)');
  for (const label of ['GST Only (1)', 'Estimate Only (1)', 'Paper Only (1)', 'All Types (2)']) {
    fireEvent.click(type);
    expect(type.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
    expect(type.textContent).toContain(label);
    expect(type.getAttribute('aria-expanded')).toBe('false');
  }
  fireEvent.change(screen.getByRole('textbox', { name: 'Search bills or suppliers' }), { target: { value: 'supplier' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear bill search' }));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Re-sync' }));
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  expect(onResync).toHaveBeenCalledOnce();
  expect(exportBills).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'New Bill' })).toBeTruthy();
});
