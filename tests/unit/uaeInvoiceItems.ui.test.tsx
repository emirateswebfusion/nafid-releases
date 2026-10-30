// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { InvoiceItemsTable } from '../../src/components/sales/views/InvoiceItemsTable';
import type { SalesInvoiceItemRow, SalesInvoiceRow } from '../../src/components/sales/salesTypes';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';

afterEach(() => { cleanup(); setStoreCountry('IN'); });
it('shows stored UAE net lines plus VAT without inventing GST components or discounts', () => {
  setStoreCountry('AE');
  const { container } = render(<InvoiceItemsTable itemsLoading={false}
    selectedInvoice={{ invoice_type: 'GST', supply_type: 'INTRA' } as SalesInvoiceRow}
    items={[{ item_id: 'line', name: 'Test product', quantity: 2, unit_price: 100, total: 200,
      tax_amount: 10, cgst_rate: 0, sgst_rate: 0, igst_rate: 0, originalRate: 105 } as SalesInvoiceItemRow]} />);
  expect(container.textContent).not.toMatch(/CGST|SGST|IGST|MRP/);
  expect(screen.getByText('AED 105.00')).toBeTruthy();
  expect(screen.getByText('AED 210.00')).toBeTruthy();
  expect(screen.getByText('AED 200.00')).toBeTruthy();
  expect(container.textContent).toContain('VAT: AED 10.00');
});
