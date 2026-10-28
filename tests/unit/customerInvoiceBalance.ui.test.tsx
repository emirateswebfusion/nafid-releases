// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CustomerInvoiceModal } from '../../src/components/customers/views/CustomerInvoiceModal';
import type { InvoiceRecord } from '../../src/components/customers/customerTypes';

afterEach(cleanup);

function showInvoice(invoice: Partial<InvoiceRecord>) {
  render(<CustomerInvoiceModal viewingInvoice={{ invoice_id: 'qa', invoice_number: 'QA-1', grand_total: 1249.75,
    balance_amount: 1249.75, received_amount: 0, payment_method: 'CREDIT', ...invoice } as InvoiceRecord}
    invoiceItems={[]} itemsLoading={false} loyaltyEnabled={false} invoiceBusyId={null}
    setViewingInvoice={vi.fn()} handleDownloadInvoiceCsv={vi.fn()} handleEditBillFromCustomerModal={vi.fn()} />);
  return screen.getByText('Outstanding Balance:').parentElement?.textContent;
}

it('shows the canonical remaining allocation after later repayments rather than the checkout snapshot', () => {
  expect(showInvoice({ is_credit_bill: true, outstanding_amount: 499.75 })).toContain('₹499.75');
});

it('shows a settled credit invoice as zero without falling back to its original debt', () => {
  expect(showInvoice({ is_credit_bill: true, outstanding_amount: 0 })).toContain('₹0.00');
});

it('shows current outstanding for a split bill with a credit portion', () => {
  expect(showInvoice({ payment_method: 'SPLIT', is_credit_bill: true, received_amount: 500, outstanding_amount: 249.75 })).toContain('₹249.75');
});

it('retains the stored balance when allocation data is unavailable', () => {
  expect(showInvoice({})).toContain('₹1,249.75');
});
