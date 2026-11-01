/**
 * UAE Federal Tax Authority (FTA) Audit File (FAF) Exporter.
 * Formats period accounting records according to the FTA FAF specification.
 */

import type { Vat201Report } from '../../../electron/services/vatReportService';

export function exportFtaAuditFile(report: Vat201Report): string {
  const lines: string[] = [];

  // 1. Company Information Header
  lines.push('--- FTA AUDIT FILE (FAF) ---');
  lines.push(`Taxable Person Name (EN): ${report.taxablePerson.shopName}`);
  lines.push(`Tax Registration Number (TRN): ${report.taxablePerson.trn || 'N/A'}`);
  lines.push(`Emirate: ${report.taxablePerson.emirate}`);
  lines.push(`Period Start Date: ${report.period.fromDate}`);
  lines.push(`Period End Date: ${report.period.toDate}`);
  lines.push(`FAF Creation Date: ${report.generatedAt}`);
  lines.push(`Tax Authority: Federal Tax Authority (FTA) - UAE`);
  lines.push('');

  // 2. Sales Audit Section
  lines.push('--- SALES TRANSACTIONS (OUTPUT TAX) ---');
  lines.push([
    'Transaction Type',
    'Document Number',
    'Document Date',
    'Customer Name',
    'Customer TRN',
    'Emirate',
    'Invoice Type',
    'Net Taxable Amount (AED)',
    'VAT Rate (%)',
    'VAT Amount (AED)',
    'Gross Total (AED)',
    'Tax Category',
  ].join('\t'));

  for (const sale of report.salesAudit) {
    lines.push([
      'Sales Invoice',
      sale.invoiceNumber,
      sale.invoiceDate,
      `"${sale.customerName.replace(/"/g, '""')}"`,
      sale.customerTrn || 'N/A',
      sale.emirate,
      sale.invoiceType,
      sale.taxableAmount.toFixed(2),
      `${sale.vatRate}%`,
      sale.vatAmount.toFixed(2),
      sale.grandTotal.toFixed(2),
      sale.taxCategory,
    ].join('\t'));
  }

  for (const ret of report.creditNotesAudit) {
    lines.push([
      'Credit Note',
      ret.creditNoteNumber,
      ret.returnDate,
      `"${ret.customerName.replace(/"/g, '""')}"`,
      ret.customerTrn || 'N/A',
      ret.emirate,
      'CREDIT_NOTE',
      `-${ret.taxableAmount.toFixed(2)}`,
      '5%',
      `-${ret.vatAmount.toFixed(2)}`,
      `-${ret.grandTotal.toFixed(2)}`,
      'STANDARD_ADJUSTMENT',
    ].join('\t'));
  }

  lines.push('');

  // 3. Purchases Audit Section
  lines.push('--- PURCHASE TRANSACTIONS (INPUT TAX) ---');
  lines.push([
    'Transaction Type',
    'Bill Number',
    'Supplier Invoice No',
    'Bill Date',
    'Supplier Name',
    'Supplier TRN',
    'Net Taxable Amount (AED)',
    'VAT Amount (AED)',
    'Gross Total (AED)',
    'Recoverable VAT (AED)',
    'Status',
  ].join('\t'));

  for (const pur of report.purchaseAudit) {
    lines.push([
      'Purchase Bill',
      pur.billNumber,
      pur.supplierInvoiceNumber || 'N/A',
      pur.billDate,
      `"${pur.supplierName.replace(/"/g, '""')}"`,
      pur.supplierTrn || 'N/A',
      pur.taxableAmount.toFixed(2),
      pur.vatAmount.toFixed(2),
      pur.grandTotal.toFixed(2),
      pur.vatAmount.toFixed(2),
      'RECOVERABLE',
    ].join('\t'));
  }

  lines.push('');

  // 4. VAT 201 Return Summary
  lines.push('--- VAT RETURN 201 BOX SUMMARY ---');
  lines.push(`Box 1a Standard Rated Abu Dhabi:\t${report.section1Output.standardRatedSupplies.abuDhabi.amount.toFixed(2)}\tVAT: ${report.section1Output.standardRatedSupplies.abuDhabi.vatAmount.toFixed(2)}\tAdj: ${report.section1Output.standardRatedSupplies.abuDhabi.adjustment.toFixed(2)}`);
  lines.push(`Box 1b Standard Rated Dubai:\t${report.section1Output.standardRatedSupplies.dubai.amount.toFixed(2)}\tVAT: ${report.section1Output.standardRatedSupplies.dubai.vatAmount.toFixed(2)}\tAdj: ${report.section1Output.standardRatedSupplies.dubai.adjustment.toFixed(2)}`);
  lines.push(`Box 1c Standard Rated Sharjah:\t${report.section1Output.standardRatedSupplies.sharjah.amount.toFixed(2)}\tVAT: ${report.section1Output.standardRatedSupplies.sharjah.vatAmount.toFixed(2)}\tAdj: ${report.section1Output.standardRatedSupplies.sharjah.adjustment.toFixed(2)}`);
  lines.push(`Box 1d Standard Rated Ajman:\t${report.section1Output.standardRatedSupplies.ajman.amount.toFixed(2)}\tVAT: ${report.section1Output.standardRatedSupplies.ajman.vatAmount.toFixed(2)}\tAdj: ${report.section1Output.standardRatedSupplies.ajman.adjustment.toFixed(2)}`);
  lines.push(`Box 1e Standard Rated Umm Al Quwain:\t${report.section1Output.standardRatedSupplies.ummAlQuwain.amount.toFixed(2)}\tVAT: ${report.section1Output.standardRatedSupplies.ummAlQuwain.vatAmount.toFixed(2)}\tAdj: ${report.section1Output.standardRatedSupplies.ummAlQuwain.adjustment.toFixed(2)}`);
  lines.push(`Box 1f Standard Rated Ras Al Khaimah:\t${report.section1Output.standardRatedSupplies.rasAlKhaimah.amount.toFixed(2)}\tVAT: ${report.section1Output.standardRatedSupplies.rasAlKhaimah.vatAmount.toFixed(2)}\tAdj: ${report.section1Output.standardRatedSupplies.rasAlKhaimah.adjustment.toFixed(2)}`);
  lines.push(`Box 1g Standard Rated Fujairah:\t${report.section1Output.standardRatedSupplies.fujairah.amount.toFixed(2)}\tVAT: ${report.section1Output.standardRatedSupplies.fujairah.vatAmount.toFixed(2)}\tAdj: ${report.section1Output.standardRatedSupplies.fujairah.adjustment.toFixed(2)}`);
  lines.push(`Box 4 Zero-Rated Supplies (AED):\t${report.section1Output.zeroRatedSupplies.amount.toFixed(2)}`);
  lines.push(`Box 5 Exempt Supplies (AED):\t${report.section1Output.exemptSupplies.amount.toFixed(2)}`);
  lines.push(`Box 8 Total Output Tax Due (AED):\t${report.section1Output.totalOutputTax.netOutputVatDue.toFixed(2)}`);
  lines.push(`Box 9 Standard Rated Expenses (AED):\t${report.section2Input.standardRatedExpenses.amount.toFixed(2)}\tRecoverable VAT: ${report.section2Input.standardRatedExpenses.vatAmount.toFixed(2)}`);
  lines.push(`Box 11 Total Input Tax Recoverable (AED):\t${report.section2Input.totalInputTax.netInputVatRecoverable.toFixed(2)}`);
  lines.push(`Box 12 Total Due Tax (AED):\t${report.netDue.totalDueTax.toFixed(2)}`);
  lines.push(`Box 13 Total Recoverable Tax (AED):\t${report.netDue.totalRecoverableTax.toFixed(2)}`);
  lines.push(`Box 14 Net VAT ${report.netDue.status} (AED):\t${report.netDue.netVatPayable.toFixed(2)}`);

  return lines.join('\n');
}
