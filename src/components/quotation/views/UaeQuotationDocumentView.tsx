import { generateQuotationHtml } from '../../../utils/print/quotationHtmlGenerator';
import { buildQuotationPrintData } from '../quotationPrintData';
import type { QuotationDocumentViewProps } from './QuotationDocumentView';

/** Preview the very same AED/TRN/VAT document used for print and PDF. */
export function UaeQuotationDocumentView({ qm, selectedQuotation, shopName }:
  Pick<QuotationDocumentViewProps, 'qm' | 'selectedQuotation' | 'shopName'>) {
  const data = buildQuotationPrintData({ ...qm, selectedQuotation }, shopName, null);
  return data && <iframe title="UAE quotation preview" sandbox="" srcDoc={generateQuotationHtml(data)}
    className="w-full max-w-5xl mx-auto block bg-white border border-border rounded-xl p-4"
    style={{ height: '1100px' }} />;
}
