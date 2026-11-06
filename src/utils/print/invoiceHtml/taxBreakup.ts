import type { InvoiceData } from './invoiceHtmlCore';
import { resolveTaxBreakup } from '../receipt/receiptCore';

/** Uses the same visibility, taxable value and rounding as thermal receipts. */
export function renderTaxBreakup(data: InvoiceData): string {
  const tax = resolveTaxBreakup(data);
  if (!tax) return '';
  const columns = [['Taxable', tax.taxable], ['CGST', tax.cgst], ['SGST', tax.sgst],
    ...(tax.igst > 0 ? [['IGST', tax.igst] as const] : []), ['Total GST', tax.total]] as const;
  return `<section aria-label="Tax Breakup" style="break-inside:avoid;page-break-inside:avoid;margin:12px 0;font-size:11px;">
    <div style="font-weight:bold;text-align:center;">TAX BREAKUP</div>
    <table style="width:100%;border-collapse:collapse;margin:6px 0;">
      <thead><tr>${columns.map(([label]) => `<th style="text-align:right;border:1px solid #ccc;padding:5px;">${label}</th>`).join('')}</tr></thead>
      <tbody><tr>${columns.map(([, value]) => `<td style="text-align:right;border:1px solid #ccc;padding:5px;">${Number(value).toFixed(2)}</td>`).join('')}</tr></tbody>
    </table></section>`;
}
