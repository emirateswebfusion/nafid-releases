// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PurchaseBill, PurchaseBillEditingData } from '../../src/components/purchase/purchaseTypes';
const fixture = vi.hoisted(() => ({ bill: { purchase_bill_id: 'bill', tenant_id: 'shop', bill_number: 'P-1',
  supplier_name: 'Supplier', bill_type: 'GST', payment_type: 'CASH', total_amount: 118, is_interstate: 1 } }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: () => ({ tenantId: 'shop', userId: 'owner', userName: 'Owner' }) }));
vi.mock('../../src/data/client', async original => ({ ...await original<typeof import('../../src/data/client')>(), isDesktopRuntime: () => true, hasBridge: () => false }));
vi.mock('../../src/data/purchases', () => ({ purchasesApi: { getPurchaseBills: async () => [fixture.bill], getPurchaseBillItems: async () => [] } }));
vi.mock('../../src/data/parties', () => ({ partiesApi: { getParties: async () => [] } }));
vi.mock('../../src/components/purchase/hooks/usePurchaseCsvExport', () => ({ usePurchaseCsvExport: () => ({ handleExportCSV: vi.fn() }) }));
vi.mock('../../src/components/purchase/hooks/usePurchaseBillPrint', () => ({ usePurchaseBillPrint: () => ({ handlePrintBill: vi.fn() }) }));
vi.mock('../../src/components/purchase/hooks/usePurchaseBillSummaries', () => ({ usePurchaseBillSummaries: () => ({ loadBillSummaries: vi.fn() }) }));
vi.mock('../../src/components/purchase/views/PurchaseBillList', () => ({ PurchaseBillList: ({ bills, handleEditBill }: { bills: PurchaseBill[]; handleEditBill: (bill: PurchaseBill) => void }) =>
  bills.map(bill => <button key={bill.purchase_bill_id} onClick={() => handleEditBill(bill)}>Edit saved bill</button>) }));
vi.mock('../../src/components/purchase/PurchaseBillFormSection', () => ({ PurchaseBillFormSection: ({ type, editingData }: { type: string; editingData?: PurchaseBillEditingData }) =>
  <output aria-label={`${type} classification`}>{editingData?.is_interstate ? 'interstate' : 'intrastate'}</output> }));
import { PurchaseBillManager } from '../../src/components/purchase/PurchaseBillManager';
afterEach(cleanup);
it('hands the persisted interstate flag from the saved bill to its editor', async () => {
  render(<PurchaseBillManager onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit saved bill' }));
  expect((await screen.findByLabelText('GST classification')).textContent).toBe('interstate');
});
