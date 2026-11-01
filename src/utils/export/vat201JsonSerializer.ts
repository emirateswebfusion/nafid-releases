/**
 * Form VAT 201 Return & Audit JSON Serializer.
 */

import type { Vat201Report } from '../../../electron/services/vatReportService';

export function serializeVat201Json(report: Vat201Report): string {
  const exportPayload = {
    schemaVersion: '1.0.0',
    statutoryReturn: 'UAE_FTA_VAT_201',
    authority: 'Federal Tax Authority (FTA) United Arab Emirates',
    generatedAt: report.generatedAt,
    taxablePerson: report.taxablePerson,
    period: report.period,
    vat201Boxes: {
      section1Outputs: {
        box1_standardRatedSuppliesByEmirate: report.section1Output.standardRatedSupplies,
        box2_touristRefunds: report.section1Output.touristRefunds,
        box3_reverseChargeSupplies: report.section1Output.reverseChargeSupplies,
        box4_zeroRatedSupplies: report.section1Output.zeroRatedSupplies,
        box5_exemptSupplies: report.section1Output.exemptSupplies,
        box6_goodsImported: report.section1Output.goodsImported,
        box7_adjustmentsImported: report.section1Output.adjustmentsImported,
        box8_totalsOutputTax: report.section1Output.totalOutputTax,
      },
      section2Inputs: {
        box9_standardRatedExpenses: report.section2Input.standardRatedExpenses,
        box10_reverseChargeExpenses: report.section2Input.reverseChargeExpenses,
        box11_totalsInputTax: report.section2Input.totalInputTax,
      },
      section3NetDue: {
        box12_totalDueTax: report.netDue.totalDueTax,
        box13_totalRecoverableTax: report.netDue.totalRecoverableTax,
        box14_netVatPayable: report.netDue.netVatPayable,
        status: report.netDue.status,
      },
    },
    summary: report.summary,
    salesInvoices: report.salesAudit,
    creditNotes: report.creditNotesAudit,
    purchaseBills: report.purchaseAudit,
    validationIssues: report.validationIssues,
  };

  return JSON.stringify(exportPayload, null, 2);
}
