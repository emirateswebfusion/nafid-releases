/**
 * UAE Federal Tax Authority (FTA) VAT Return 201 Multi-Sheet Excel Exporter.
 */

import * as XLSX from 'xlsx';
import type { Vat201Report } from '../../../electron/services/vatReportService';

export function exportVat201ToExcel(report: Vat201Report, filename?: string) {
  const wb = XLSX.utils.book_new();

  // 1. VAT 201 Return Summary Sheet
  const returnRows = [
    { 'Box #': '—', Description: 'TAXABLE PERSON INFORMATION', 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '—', Description: `Company Name: ${report.taxablePerson.shopName}`, 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '—', Description: `TRN: ${report.taxablePerson.trn || 'Not set'}`, 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '—', Description: `Emirate: ${report.taxablePerson.emirate}`, 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '—', Description: `Tax Period: ${report.period.fromDate} to ${report.period.toDate}`, 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '—', Description: '', 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },

    { 'Box #': 'SECTION 1', Description: 'VAT ON SALES AND OTHER OUTPUTS', 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '1a', Description: 'Standard rated supplies in Abu Dhabi', 'Amount (AED)': report.section1Output.standardRatedSupplies.abuDhabi.amount, 'VAT Amount (AED)': report.section1Output.standardRatedSupplies.abuDhabi.vatAmount, 'Adjustments (AED)': report.section1Output.standardRatedSupplies.abuDhabi.adjustment },
    { 'Box #': '1b', Description: 'Standard rated supplies in Dubai', 'Amount (AED)': report.section1Output.standardRatedSupplies.dubai.amount, 'VAT Amount (AED)': report.section1Output.standardRatedSupplies.dubai.vatAmount, 'Adjustments (AED)': report.section1Output.standardRatedSupplies.dubai.adjustment },
    { 'Box #': '1c', Description: 'Standard rated supplies in Sharjah', 'Amount (AED)': report.section1Output.standardRatedSupplies.sharjah.amount, 'VAT Amount (AED)': report.section1Output.standardRatedSupplies.sharjah.vatAmount, 'Adjustments (AED)': report.section1Output.standardRatedSupplies.sharjah.adjustment },
    { 'Box #': '1d', Description: 'Standard rated supplies in Ajman', 'Amount (AED)': report.section1Output.standardRatedSupplies.ajman.amount, 'VAT Amount (AED)': report.section1Output.standardRatedSupplies.ajman.vatAmount, 'Adjustments (AED)': report.section1Output.standardRatedSupplies.ajman.adjustment },
    { 'Box #': '1e', Description: 'Standard rated supplies in Umm Al Quwain', 'Amount (AED)': report.section1Output.standardRatedSupplies.ummAlQuwain.amount, 'VAT Amount (AED)': report.section1Output.standardRatedSupplies.ummAlQuwain.vatAmount, 'Adjustments (AED)': report.section1Output.standardRatedSupplies.ummAlQuwain.adjustment },
    { 'Box #': '1f', Description: 'Standard rated supplies in Ras Al Khaimah', 'Amount (AED)': report.section1Output.standardRatedSupplies.rasAlKhaimah.amount, 'VAT Amount (AED)': report.section1Output.standardRatedSupplies.rasAlKhaimah.vatAmount, 'Adjustments (AED)': report.section1Output.standardRatedSupplies.rasAlKhaimah.adjustment },
    { 'Box #': '1g', Description: 'Standard rated supplies in Fujairah', 'Amount (AED)': report.section1Output.standardRatedSupplies.fujairah.amount, 'VAT Amount (AED)': report.section1Output.standardRatedSupplies.fujairah.vatAmount, 'Adjustments (AED)': report.section1Output.standardRatedSupplies.fujairah.adjustment },
    { 'Box #': '2', Description: 'Tax Refunds for Tourists Scheme', 'Amount (AED)': 0, 'VAT Amount (AED)': 0, 'Adjustments (AED)': 0 },
    { 'Box #': '3', Description: 'Supplies subject to reverse charge provisions', 'Amount (AED)': 0, 'VAT Amount (AED)': 0, 'Adjustments (AED)': 0 },
    { 'Box #': '4', Description: 'Zero rated supplies', 'Amount (AED)': report.section1Output.zeroRatedSupplies.amount, 'VAT Amount (AED)': 0, 'Adjustments (AED)': 0 },
    { 'Box #': '5', Description: 'Exempt supplies', 'Amount (AED)': report.section1Output.exemptSupplies.amount, 'VAT Amount (AED)': 0, 'Adjustments (AED)': 0 },
    { 'Box #': '6', Description: 'Goods imported into the UAE', 'Amount (AED)': 0, 'VAT Amount (AED)': 0, 'Adjustments (AED)': 0 },
    { 'Box #': '7', Description: 'Adjustments to goods imported into the UAE', 'Amount (AED)': 0, 'VAT Amount (AED)': 0, 'Adjustments (AED)': 0 },
    { 'Box #': '8', Description: 'TOTAL VALUE OF OUTPUT TAX', 'Amount (AED)': report.section1Output.totalOutputTax.totalAmount, 'VAT Amount (AED)': report.section1Output.totalOutputTax.netOutputVatDue, 'Adjustments (AED)': report.section1Output.totalOutputTax.totalAdjustment },

    { 'Box #': '—', Description: '', 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': 'SECTION 2', Description: 'VAT ON EXPENSES AND OTHER INPUTS', 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '9', Description: 'Standard rated expenses / purchases', 'Amount (AED)': report.section2Input.standardRatedExpenses.amount, 'VAT Amount (AED)': report.section2Input.standardRatedExpenses.vatAmount, 'Adjustments (AED)': 0 },
    { 'Box #': '10', Description: 'Supplies subject to reverse charge provisions', 'Amount (AED)': 0, 'VAT Amount (AED)': 0, 'Adjustments (AED)': 0 },
    { 'Box #': '11', Description: 'TOTAL VALUE OF RECOVERABLE INPUT TAX', 'Amount (AED)': report.section2Input.totalInputTax.totalAmount, 'VAT Amount (AED)': report.section2Input.totalInputTax.netInputVatRecoverable, 'Adjustments (AED)': 0 },

    { 'Box #': '—', Description: '', 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': 'SECTION 3', Description: 'NET VAT DUE / PAYABLE', 'Amount (AED)': '', 'VAT Amount (AED)': '', 'Adjustments (AED)': '' },
    { 'Box #': '12', Description: 'Total value of due tax for the period (Box 8)', 'Amount (AED)': '', 'VAT Amount (AED)': report.netDue.totalDueTax, 'Adjustments (AED)': '' },
    { 'Box #': '13', Description: 'Total value of recoverable tax for the period (Box 11)', 'Amount (AED)': '', 'VAT Amount (AED)': report.netDue.totalRecoverableTax, 'Adjustments (AED)': '' },
    { 'Box #': '14', Description: `Net VAT ${report.netDue.status} to Federal Tax Authority`, 'Amount (AED)': '', 'VAT Amount (AED)': report.netDue.netVatPayable, 'Adjustments (AED)': '' },
  ];

  const returnSheet = XLSX.utils.json_to_sheet(returnRows);
  XLSX.utils.book_append_sheet(wb, returnSheet, 'VAT 201 Return');

  // 2. Sales Invoices Sheet
  const salesRows = report.salesAudit.map(s => ({
    'Invoice Number': s.invoiceNumber,
    'Invoice Date': s.invoiceDate,
    'Customer Name': s.customerName,
    'Customer TRN': s.customerTrn || 'Unregistered',
    'Invoice Type': s.invoiceType,
    'Emirate': s.emirate,
    'Net Taxable (AED)': s.taxableAmount,
    'VAT Rate': `${s.vatRate}%`,
    'VAT Amount (AED)': s.vatAmount,
    'Grand Total (AED)': s.grandTotal,
    'Category': s.taxCategory,
  }));
  const salesSheet = XLSX.utils.json_to_sheet(salesRows.length > 0 ? salesRows : [{}]);
  XLSX.utils.book_append_sheet(wb, salesSheet, 'Sales Invoices');

  // 3. Credit Notes Sheet
  const creditRows = report.creditNotesAudit.map(c => ({
    'Credit Note #': c.creditNoteNumber,
    'Return #': c.returnNumber,
    'Date': c.returnDate,
    'Original Invoice #': c.originalInvoiceNumber || 'Missing Ref',
    'Original Invoice Date': c.originalInvoiceDate || '',
    'Customer Name': c.customerName,
    'Customer TRN': c.customerTrn || '',
    'Emirate': c.emirate,
    'Adjusted Taxable (AED)': c.taxableAmount,
    'Adjusted VAT (AED)': c.vatAmount,
    'Total Refund (AED)': c.grandTotal,
  }));
  const creditSheet = XLSX.utils.json_to_sheet(creditRows.length > 0 ? creditRows : [{}]);
  XLSX.utils.book_append_sheet(wb, creditSheet, 'Credit Notes');

  // 4. Purchase Bills Sheet
  const purchaseRows = report.purchaseAudit.map(p => ({
    'Bill Number': p.billNumber,
    'Supplier Invoice #': p.supplierInvoiceNumber || '',
    'Date': p.billDate,
    'Supplier Name': p.supplierName,
    'Supplier TRN': p.supplierTrn || 'Unregistered',
    'Net Taxable (AED)': p.taxableAmount,
    'Input VAT (AED)': p.vatAmount,
    'Grand Total (AED)': p.grandTotal,
    'Recoverable': p.isRecoverable ? 'YES' : 'NO',
  }));
  const purchaseSheet = XLSX.utils.json_to_sheet(purchaseRows.length > 0 ? purchaseRows : [{}]);
  XLSX.utils.book_append_sheet(wb, purchaseSheet, 'Purchase Bills');

  // 5. Validation Issues Sheet
  const issueRows = report.validationIssues.map(issue => ({
    'Severity': issue.severity,
    'Code': issue.code,
    'Message': issue.message,
    'Document Ref': issue.documentRef || '',
  }));
  const validationSheet = XLSX.utils.json_to_sheet(issueRows.length > 0 ? issueRows : [{ Status: 'All FTA Validation Checks Passed' }]);
  XLSX.utils.book_append_sheet(wb, validationSheet, 'Compliance Audit');

  const defaultName = `UAE_VAT_201_${report.period.fromDate}_to_${report.period.toDate}.xlsx`;
  XLSX.writeFile(wb, filename || defaultName);
}
