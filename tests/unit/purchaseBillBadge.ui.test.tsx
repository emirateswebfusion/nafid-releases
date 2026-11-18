// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PurchaseBillViewDialog } from '../../src/components/purchase/views/PurchaseBillViewDialog';
import { purchaseBillTypeLabel } from '../../src/components/purchase/purchaseFormat';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';
import type { PurchaseBill } from '../../src/components/purchase/purchaseTypes';

const bill: PurchaseBill = {
  purchase_bill_id: 'igst', tenant_id: 'test', bill_number: 'P-IGST', supplier_id: null,
  supplier_name: 'Supplier', bill_date: null, invoice_number: null, notes: null,
  total_amount: 118, bill_type: 'GST', is_interstate: 1, payment_type: 'CASH',
  sync_status: 'SYNCED', created_at: null, updated_at: null, row_version: 1, origin: null, stock_revision: 0,
};
afterEach(() => { cleanup(); setStoreCountry('IN'); });

it.each([
  ['IN', 'GST', 1, 'IGST'], ['IN', 'GST', 0, 'GST'], ['IN', 'GST', null, 'GST'],
  ['IN', 'ESTIMATE', 1, 'ESTIMATE'], ['AE', 'GST', 1, 'VAT'], ['BH', 'GST', 1, 'VAT'],
] as const)('labels %s %s interstate=%s as %s', (country, type, interstate, expected) => {
  setStoreCountry(country);
  expect(purchaseBillTypeLabel({ bill_type: type, is_interstate: interstate })).toBe(expected);
});

it('shows the persisted interstate classification in the saved bill header badge', () => {
  setStoreCountry('IN');
  render(<PurchaseBillViewDialog viewingBill={bill} viewingBillItems={[]} loadingViewingItems={false}
    handleDelete={vi.fn()} handleEditBill={vi.fn(async () => {})} handlePrintBill={vi.fn(async () => {})}
    setViewingBill={vi.fn()} />);
  const header = screen.getByRole('heading', { name: 'P-IGST' }).parentElement;
  expect(header?.textContent).toBe('P-IGSTIGST');
});
