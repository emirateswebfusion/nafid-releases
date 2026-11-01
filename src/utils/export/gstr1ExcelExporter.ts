/**
 * Multi-sheet GSTR-1 Excel Exporter
 * Generates an Excel workbook formatted according to the official GST offline tool template.
 */

import * as XLSX from 'xlsx';
import type { Gstr1Report } from '../../../electron/services/gstReportService';

export function exportGstr1ToExcel(report: Gstr1Report, filename?: string) {
  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summaryData = [
    { Field: 'Period From', Value: report.period_from },
    { Field: 'Period To', Value: report.period_to },
    { Field: 'Generated At', Value: report.generated_at },
    { Field: 'Total Invoices', Value: report.summary.total_invoices },
    { Field: 'Total Taxable Value', Value: report.summary.total_taxable_value },
    { Field: 'Total Tax (CGST + SGST + IGST)', Value: report.summary.total_tax },
    { Field: 'Total CGST', Value: report.summary.total_cgst },
    { Field: 'Total SGST', Value: report.summary.total_sgst },
    { Field: 'Total IGST', Value: report.summary.total_igst },
    { Field: 'Total Invoice Value', Value: report.summary.total_invoice_value },
    { Field: 'Total Credit Notes', Value: report.summary.total_credit_notes },
    { Field: 'Total Credit Note Value', Value: report.summary.credit_note_value },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // 2. B2B Sheet
  const b2bRows = report.b2b.map(inv => ({
    'GSTIN/UIN of Recipient': inv.gstin,
    'Receiver Name': inv.customer_name || '',
    'Invoice Number': inv.invoice_number,
    'Invoice date': inv.invoice_date,
    'Invoice Value': inv.invoice_value,
    'Place Of Supply': inv.pos,
    'Reverse Charge': inv.reverse_charge,
    'Invoice Type': inv.invoice_type,
    'Taxable Value': inv.taxable_value,
    'Integrated Tax': inv.igst,
    'Central Tax': inv.cgst,
    'State/UT Tax': inv.sgst,
    'Cess Amount': 0,
  }));
  const b2bSheet = XLSX.utils.json_to_sheet(b2bRows.length > 0 ? b2bRows : [{}]);
  XLSX.utils.book_append_sheet(wb, b2bSheet, 'b2b');

  // 3. B2CL Sheet
  const b2clRows = report.b2cl.map(inv => ({
    'Invoice Number': inv.invoice_number,
    'Invoice date': inv.invoice_date,
    'Invoice Value': inv.invoice_value,
    'Place Of Supply': inv.pos,
    'Rate': inv.applicable_tax_rate,
    'Taxable Value': inv.taxable_value,
    'Integrated Tax': inv.igst,
    'Cess Amount': 0,
  }));
  const b2clSheet = XLSX.utils.json_to_sheet(b2clRows.length > 0 ? b2clRows : [{}]);
  XLSX.utils.book_append_sheet(wb, b2clSheet, 'b2cl');

  // 4. B2CS Sheet
  const b2csRows = report.b2cs.map(entry => ({
    'Type': entry.supply_type === 'INTER' ? 'OE' : 'OE',
    'Place Of Supply': entry.pos,
    'Rate': entry.applicable_tax_rate,
    'Taxable Value': entry.taxable_value,
    'Integrated Tax': entry.igst,
    'Central Tax': entry.cgst,
    'State/UT Tax': entry.sgst,
    'Cess Amount': 0,
  }));
  const b2csSheet = XLSX.utils.json_to_sheet(b2csRows.length > 0 ? b2csRows : [{}]);
  XLSX.utils.book_append_sheet(wb, b2csSheet, 'b2cs');

  // 5. CDNR Sheet
  const cdnrRows = report.cdnr.map(cn => ({
    'GSTIN/UIN of Recipient': cn.gstin,
    'Receiver Name': cn.customer_name || '',
    'Note Number': cn.note_number,
    'Note Date': cn.note_date,
    'Note Type': cn.note_type,
    'Original Invoice Number': cn.original_invoice_number || '',
    'Original Invoice Date': cn.original_invoice_date || '',
    'Reason For Issuing document': cn.reason,
    'Place Of Supply': cn.pos,
    'Note Value': cn.note_value,
    'Taxable Value': cn.taxable_value,
    'Integrated Tax': cn.igst,
    'Central Tax': cn.cgst,
    'State/UT Tax': cn.sgst,
    'Cess Amount': 0,
  }));
  const cdnrSheet = XLSX.utils.json_to_sheet(cdnrRows.length > 0 ? cdnrRows : [{}]);
  XLSX.utils.book_append_sheet(wb, cdnrSheet, 'cdnr');

  // 6. CDNUR Sheet
  const cdnurRows = report.cdnur.map(cn => ({
    'Note Number': cn.note_number,
    'Note Date': cn.note_date,
    'Note Type': cn.note_type,
    'Supply Type': cn.supply_type,
    'Original Invoice Number': cn.original_invoice_number || '',
    'Original Invoice Date': cn.original_invoice_date || '',
    'Reason For Issuing document': cn.reason,
    'Note Value': cn.note_value,
    'Rate': cn.applicable_tax_rate,
    'Taxable Value': cn.taxable_value,
    'Integrated Tax': cn.igst,
    'Central Tax': cn.cgst,
    'State/UT Tax': cn.sgst,
    'Cess Amount': 0,
  }));
  const cdnurSheet = XLSX.utils.json_to_sheet(cdnurRows.length > 0 ? cdnurRows : [{}]);
  XLSX.utils.book_append_sheet(wb, cdnurSheet, 'cdnur');

  // 7. HSN Sheet
  const hsnRows = report.hsn.map(h => ({
    'HSN': h.hsn_sc,
    'Description': h.description,
    'UQC': h.uqc,
    'Total Quantity': h.total_quantity,
    'Total Value': h.total_value,
    'Taxable Value': h.taxable_value,
    'Integrated Tax Amount': h.igst,
    'Central Tax Amount': h.cgst,
    'State/UT Tax Amount': h.sgst,
    'Cess Amount': 0,
  }));
  const hsnSheet = XLSX.utils.json_to_sheet(hsnRows.length > 0 ? hsnRows : [{}]);
  XLSX.utils.book_append_sheet(wb, hsnSheet, 'hsn');

  // 8. Doc Issue Sheet
  const docRows = report.doc_issue.map(d => ({
    'Nature of Document': d.nature_of_document,
    'Sr. No. From': d.from_doc || '',
    'Sr. No. To': d.to_doc || '',
    'Total Number': d.total_docs,
    'Cancelled': d.cancelled_docs,
    'Net Issued': d.net_docs,
  }));
  const docSheet = XLSX.utils.json_to_sheet(docRows.length > 0 ? docRows : [{}]);
  XLSX.utils.book_append_sheet(wb, docSheet, 'doc_issue');

  const defaultFilename = `GSTR1_${report.period_from}_to_${report.period_to}.xlsx`;
  XLSX.writeFile(wb, filename || defaultFilename);
}
