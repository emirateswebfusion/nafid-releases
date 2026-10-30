// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { setStoreCountry, setStoreVatInclusive } from '../../src/utils/localization/storeProfile';
import { defaultQuotationTerms, resolveQuotationTerms } from '../../src/utils/localization/quotationTerms';
import { displayInvoiceNumber } from '../../src/utils/pricing/invoiceNumberHelper';
import { ErpGridWorkspace, type ErpGridWorkspaceProps } from '../../src/components/billing/views/ErpGridWorkspace';
import { CashierInvoiceModal } from '../../src/components/cashier/views/CashierInvoiceModal';
import type { DisplayInvoice, DisplayInvoiceItem } from '../../src/components/sales/invoiceDisplayTypes';
import { DefaultStockReportViewSelector } from '../../src/components/settings/settingsConstants';

afterEach(() => { cleanup(); setStoreCountry('IN'); setStoreVatInclusive(false); });
const noop = () => {};

it('upgrades only recognized built-in GST terms and keeps custom wording', () => {
  setStoreCountry('IN'); const oldDefault = defaultQuotationTerms();
  setStoreCountry('AE'); setStoreVatInclusive(true);
  expect(resolveQuotationTerms(oldDefault)).toContain('Prices include VAT');
  expect(resolveQuotationTerms(oldDefault.replace(/\n/g, '\r\n'))).not.toContain('GST');
  expect(resolveQuotationTerms('Custom GST terms agreed with buyer')).toBe('Custom GST terms agreed with buyer');
  expect(displayInvoiceNumber('VAT-001', 'GST', false)).toBe('VAT-001');
  expect(displayInvoiceNumber('GST-099', 'GST', false)).toBe('GST-099');
  expect(displayInvoiceNumber('CUSTOM-001', 'GST', false)).toBe('CUSTOM-001');
  setStoreCountry('IN'); expect(displayInvoiceNumber('001', 'GST', false)).toBe('GST-001');
});

it('localizes stock-report selection labels without changing saved filter keys', () => {
  setStoreCountry('AE');
  const { container } = render(<DefaultStockReportViewSelector value="gst" onChange={noop} />);
  expect(container.textContent).toContain('VAT Only');
  expect(container.textContent).not.toContain('GST');
});

it('uses checkout totals and a single VAT column in the UAE ERP grid', () => {
  setStoreCountry('AE'); setStoreVatInclusive(true);
  const props = { customerFields: { setShowCustomerDropdown: noop }, deductions: {}, items: [
    { product_id: 'p1', name: 'UAE item', quantity: 2, base_price: 105, tax_rate_percent: 5 }],
    pricingTiers: [], findMatchingParty: () => null, qtyRefs: createRef(), receivedInputRef: createRef(),
    discountRef: createRef(), customerName: '', customerPhone: '', customerGstin: '', erpNarration: '', erpSalesRep: '',
    invoiceType: 'GST', nextInvoiceNumber: 'VAT-001', paymentMethod: 'CASH', selectedTierId: '',
    receivedAmount: 210, discountValue: 0, displayGrandTotal: 210, balanceAmount: 0,
  } as unknown as ErpGridWorkspaceProps;
  props.qtyRefs.current = {};
  const { container } = render(<ErpGridWorkspace {...props} />);
  expect(container.textContent).not.toMatch(/SGST|CGST|IGST/);
  expect(screen.getByRole('columnheader', { name: 'VAT' })).toBeTruthy();
  expect(screen.getByDisplayValue('VAT-001')).toBeTruthy();
  expect(container.textContent).toContain('AED 200.00');
  expect(container.textContent).toContain('AED 10.00');
  expect(container.textContent).not.toContain('220.50');
});

it('shows stored UAE net amounts and VAT in cashier details without Indian splits', () => {
  setStoreCountry('AE');
  const invoice = { invoice_id: 'i1', tenant_id: 't1', invoice_number: 'VAT-001', invoice_type: 'GST',
    subtotal: 200, tax_total: 10, grand_total: 210, payment_method: 'CASH', created_at: '2026-10-29T10:00:00Z' } as DisplayInvoice;
  const item = { item_id: 'line', name: 'UAE item', quantity: 2, unit_price: 100, total: 200, tax_amount: 10 } as DisplayInvoiceItem;
  const { baseElement } = render(<CashierInvoiceModal showInvoiceModal selectedInvoice={invoice} invoiceItems={[item]}
    loadingItems={false} setInvoiceItems={noop} setReprintSuccess={noop} setSelectedInvoice={noop} setShowInvoiceModal={noop} />);
  expect(baseElement.textContent).not.toMatch(/CGST|SGST|IGST/);
  expect(baseElement.textContent).toContain('AED 210.00');
  expect(baseElement.textContent).toContain('VAT: AED 10.00');
});
