// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useQuotationState } from '../../src/components/quotation/hooks/useQuotationState';
import { QuotationDocumentView } from '../../src/components/quotation/views/QuotationDocumentView';
import { buildQuotationPrintData } from '../../src/components/quotation/quotationPrintData';
import type { Quotation, QuotationItem } from '../../src/components/quotation/quotationTypes';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';

afterEach(() => { cleanup(); setStoreCountry('IN'); });

it('shows the same net-rate AED/TRN/VAT document for preview and export, including older quotation rates', () => {
  setStoreCountry('AE');
  const { result } = renderHook(() => useQuotationState());
  const quote = { quotation_id: 'q1', quotation_number: 'Q-1', created_at: '2026-10-29T10:00:00Z',
    subtotal: 100, tax_total: 5, grand_total: 105, discount_total: 0, is_gst: 1 } as Quotation;
  const item = { name: 'Test product', quantity: 1, rate: 105, taxable_amount: 100, amount: 100,
    tax_rate_percent: 5 } as QuotationItem;
  const qm = { ...result.current, selectedQuotation: quote, quotationItems: [item], shopGstin: '100000000000003' };
  render(<QuotationDocumentView qm={qm} selectedQuotation={quote} shopName="UAE Test Shop"
    hasConfiguredBank={false} isInterState={false} previewAmountInWords="" previewGrandTotal={105}
    previewHasDiscounts={false} previewHasHsn={false} />);
  const iframe = screen.getByTitle('UAE quotation preview') as HTMLIFrameElement;
  const doc = new DOMParser().parseFromString(iframe.srcdoc, 'text/html');
  expect(doc.body.textContent).toContain('QUOTATION / عرض سعر');
  expect(doc.body.textContent).toContain('TRN / رقم التسجيل الضريبي: 100000000000003');
  expect(doc.body.textContent).toContain('AED 105.00');
  expect(doc.body.textContent).not.toMatch(/GSTIN|CGST|SGST|IGST|Rupees/);
  const row = Array.from(doc.querySelectorAll('tbody tr')).find(tr => tr.textContent?.includes('Test product'))!;
  expect(row.cells[3].textContent).toBe('AED 100.00');
  expect(buildQuotationPrintData(qm, 'UAE Test Shop', null)).toMatchObject({ grandTotal: 105, taxTotal: 5 });
  expect(iframe.getAttribute('sandbox')).toBe('');
});
