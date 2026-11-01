import { describe, expect, it } from 'vitest';
import { serializeVat201Json } from '../../src/utils/export/vat201JsonSerializer';
import { exportFtaAuditFile } from '../../src/utils/export/ftaAuditFileExporter';
import type { Vat201Report } from '../../electron/services/vatReportService';

const mockReport: Vat201Report = {
  taxablePerson: {
    shopName: 'Test Shop LLC',
    trn: '100123456789003',
    emirate: 'DUBAI',
    country: 'AE',
  },
  period: {
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    label: '2026-10-01 to 2026-10-31',
  },
  section1Output: {
    standardRatedSupplies: {
      abuDhabi: { boxNo: '1a', description: 'Abu Dhabi', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      dubai: { boxNo: '1b', description: 'Dubai', amount: 10000, vatAmount: 500, adjustment: 0, adjustmentVat: 0 },
      sharjah: { boxNo: '1c', description: 'Sharjah', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      ajman: { boxNo: '1d', description: 'Ajman', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      ummAlQuwain: { boxNo: '1e', description: 'Umm Al Quwain', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      rasAlKhaimah: { boxNo: '1f', description: 'Ras Al Khaimah', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
      fujairah: { boxNo: '1g', description: 'Fujairah', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
    },
    touristRefunds: { boxNo: '2', description: 'Tourist', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
    reverseChargeSupplies: { boxNo: '3', description: 'RCM', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
    zeroRatedSupplies: { boxNo: '4', description: 'Zero Rated', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
    exemptSupplies: { boxNo: '5', description: 'Exempt', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
    goodsImported: { boxNo: '6', description: 'Import', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
    adjustmentsImported: { boxNo: '7', description: 'Import Adj', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0 },
    totalOutputTax: {
      totalAmount: 10000,
      totalVat: 500,
      totalAdjustment: 0,
      totalAdjustmentVat: 0,
      netOutputVatDue: 500,
    },
  },
  section2Input: {
    standardRatedExpenses: { boxNo: '9', description: 'Standard Purchases', amount: 2000, vatAmount: 100, adjustment: 0, adjustmentVat: 0, recoverableVat: 100 },
    reverseChargeExpenses: { boxNo: '10', description: 'RCM Purchases', amount: 0, vatAmount: 0, adjustment: 0, adjustmentVat: 0, recoverableVat: 0 },
    totalInputTax: {
      totalAmount: 2000,
      totalRecoverableVat: 100,
      totalAdjustment: 0,
      totalAdjustmentVat: 0,
      netInputVatRecoverable: 100,
    },
  },
  netDue: {
    totalDueTax: 500,
    totalRecoverableTax: 100,
    netVatPayable: 400,
    status: 'PAYABLE',
  },
  salesAudit: [
    {
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-10-15',
      customerName: 'Customer A',
      customerTrn: null,
      invoiceType: 'SIMPLIFIED',
      taxableAmount: 10000,
      vatRate: 5,
      vatAmount: 500,
      grandTotal: 10500,
      taxCategory: 'STANDARD',
      emirate: 'DUBAI',
      itemCount: 1,
    },
  ],
  creditNotesAudit: [],
  purchaseAudit: [
    {
      purchaseBillId: 'pb-1',
      billNumber: 'PB-001',
      billDate: '2026-10-10',
      supplierInvoiceNumber: 'SUP-01',
      supplierName: 'Supplier X',
      supplierTrn: '100999999999999',
      taxableAmount: 2000,
      vatAmount: 100,
      grandTotal: 2100,
      isRecoverable: true,
      itemCount: 1,
    },
  ],
  validationIssues: [],
  summary: {
    totalSalesInvoices: 1,
    totalCreditNotes: 0,
    totalPurchaseBills: 1,
    grossSales: 10500,
    netSalesTaxable: 10000,
    outputVat: 500,
    grossPurchases: 2100,
    recoverableInputVat: 100,
    netVatDue: 400,
  },
  generatedAt: '2026-10-31T12:00:00.000Z',
};

describe('VAT 201 Serializer and Exporters', () => {
  it('serializes Form VAT 201 into valid structured JSON', () => {
    const jsonStr = serializeVat201Json(mockReport);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.statutoryReturn).toBe('UAE_FTA_VAT_201');
    expect(parsed.vat201Boxes.section3NetDue.box14_netVatPayable).toBe(400);
    expect(parsed.vat201Boxes.section3NetDue.status).toBe('PAYABLE');
    expect(parsed.salesInvoices).toHaveLength(1);
    expect(parsed.purchaseBills).toHaveLength(1);
  });

  it('exports FTA Audit File (FAF) with standard sections and tab delimiters', () => {
    const faf = exportFtaAuditFile(mockReport);

    expect(faf).toContain('--- FTA AUDIT FILE (FAF) ---');
    expect(faf).toContain('Tax Registration Number (TRN): 100123456789003');
    expect(faf).toContain('--- SALES TRANSACTIONS (OUTPUT TAX) ---');
    expect(faf).toContain('INV-001');
    expect(faf).toContain('--- PURCHASE TRANSACTIONS (INPUT TAX) ---');
    expect(faf).toContain('PB-001');
    expect(faf).toContain('Box 14 Net VAT PAYABLE (AED):\t400.00');
  });
});
