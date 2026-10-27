import { getDocumentTitle, type InvoiceData } from './invoiceHtml/invoiceHtmlCore';
import { generateBoxedHtml } from './invoiceHtml/styles/boxed';
import { generateClassicHtml } from './invoiceHtml/styles/classic';
import { generateHalfA4Html } from './invoiceHtml/styles/halfA4';
import { generateModernHtml } from './invoiceHtml/styles/modern';
import { generateStandardHtml } from './invoiceHtml/styles/standard';

/** A4 / A5 invoice HTML: shared types and helpers in invoiceHtml/invoiceHtmlCore.ts, one module per style. */
export type { InvoiceData, InvoiceItemDisplay } from './invoiceHtml/invoiceHtmlCore';
export { generatePurchaseBillHtml } from './invoiceHtml/purchaseBillHtml';


export function generateInvoiceHtml(data: InvoiceData, style: 'standard' | 'boxed' | 'modern' | 'classic' | 'half-a4' = 'standard'): string {
  const bs = data.billSettings;
  const isB2B = data.isB2B === true;
  const title = getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, isB2B, bs?.nonGstBillTitle);

  if (style === 'half-a4') return generateHalfA4Html(data, title);
  if (style === 'boxed') return generateBoxedHtml(data, title);
  if (style === 'modern') return generateModernHtml(data, title);
  if (style === 'classic') return generateClassicHtml(data, title);
  return generateStandardHtml(data, title);
}
