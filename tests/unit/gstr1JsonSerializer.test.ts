import { describe, expect, it } from 'vitest';
import { serializeGstr1Json } from '../../src/utils/export/gstr1JsonSerializer';
import type {
  B2BInvoice,
  B2CLInvoice,
  B2CSEntry,
  CDNREntry,
  CDNUREntry,
  HSNEntry,
  DocIssueSummary,
  GstPeriodSummary,
} from '../../electron/services/gstReportService';

describe('GSTR-1 JSON Serializer', () => {
  const mockSummary: GstPeriodSummary = {
    period_from: '2026-10-01',
    period_to: '2026-10-31',
    total_invoices: 3,
    total_taxable_value: 150000,
    total_tax: 27000,
    total_cgst: 9000,
    total_sgst: 9000,
    total_igst: 9000,
    total_invoice_value: 177000,
    total_credit_notes: 1,
    credit_note_value: 1180,
  };

  const mockB2B: B2BInvoice[] = [
    {
      gstin: '32CEFPK8504N2ZA',
      customer_name: 'Kerala Tech Traders',
      invoice_number: 'INV-001',
      invoice_date: '2026-10-05',
      invoice_value: 118000,
      pos: '32',
      reverse_charge: 'N',
      invoice_type: 'Regular',
      taxable_value: 100000,
      igst: 0,
      cgst: 9000,
      sgst: 9000,
    },
  ];

  const mockB2CL: B2CLInvoice[] = [
    {
      invoice_number: 'INV-002',
      invoice_date: '2026-10-10',
      invoice_value: 118000,
      pos: '29',
      applicable_tax_rate: 18,
      taxable_value: 100000,
      igst: 18000,
    },
  ];

  const mockB2CS: B2CSEntry[] = [
    {
      supply_type: 'INTRA',
      pos: '32',
      applicable_tax_rate: 18,
      taxable_value: 50000,
      igst: 0,
      cgst: 4500,
      sgst: 4500,
      note: '',
    },
  ];

  const mockCDNR: CDNREntry[] = [
    {
      gstin: '32CEFPK8504N2ZA',
      customer_name: 'Kerala Tech Traders',
      note_number: 'CN-001',
      note_date: '2026-10-15',
      note_type: 'C',
      original_invoice_number: 'INV-001',
      original_invoice_date: '2026-10-05',
      reason: '01-Sales Return',
      note_value: 1180,
      pos: '32',
      taxable_value: 1000,
      igst: 0,
      cgst: 90,
      sgst: 90,
    },
  ];

  const mockCDNUR: CDNUREntry[] = [];

  const mockHSN: HSNEntry[] = [
    {
      hsn_sc: '8471',
      description: 'Computers',
      uqc: 'NOS',
      total_quantity: 5,
      total_value: 118000,
      taxable_value: 100000,
      igst: 0,
      cgst: 9000,
      sgst: 9000,
    },
  ];

  const mockDocIssue: DocIssueSummary[] = [
    {
      nature_of_document: 'Invoices for outward supply',
      from_doc: 'INV-001',
      to_doc: 'INV-003',
      total_docs: 3,
      cancelled_docs: 0,
      net_docs: 3,
    },
  ];

  it('produces official GSTN portal JSON structure with correct version and filing period', () => {
    const json = serializeGstr1Json(
      '32AAACB1234F1Z5',
      mockSummary,
      mockB2B,
      mockB2CL,
      mockB2CS,
      mockCDNR,
      mockCDNUR,
      mockHSN,
      mockDocIssue,
    );

    expect(json.gstin).toBe('32AAACB1234F1Z5');
    expect(json.fp).toBe('102026');
    expect(json.version).toBe('GST3.1.3');

    // B2B checks
    expect(json.b2b).toHaveLength(1);
    expect(json.b2b[0].ctin).toBe('32CEFPK8504N2ZA');
    expect(json.b2b[0].inv[0].inum).toBe('INV-001');
    expect(json.b2b[0].inv[0].idt).toBe('05-Oct-2026');
    expect(json.b2b[0].inv[0].val).toBe(118000);
    expect(json.b2b[0].inv[0].pos).toBe('32');
    expect(json.b2b[0].inv[0].itms[0].itm_det.camt).toBe(9000);
    expect(json.b2b[0].inv[0].itms[0].itm_det.samt).toBe(9000);

    // B2CL checks
    expect(json.b2cl).toHaveLength(1);
    expect(json.b2cl[0].pos).toBe('29');
    expect(json.b2cl[0].inv[0].inum).toBe('INV-002');
    expect(json.b2cl[0].inv[0].val).toBe(118000);

    // B2CS checks
    expect(json.b2cs).toHaveLength(1);
    expect(json.b2cs[0].pos).toBe('32');
    expect(json.b2cs[0].txval).toBe(50000);
    expect(json.b2cs[0].camt).toBe(4500);

    // CDNR checks
    expect(json.cdnr).toHaveLength(1);
    expect(json.cdnr[0].ctin).toBe('32CEFPK8504N2ZA');
    expect(json.cdnr[0].nt[0].nt_num).toBe('CN-001');
    expect(json.cdnr[0].nt[0].nt_dt).toBe('15-Oct-2026');
    expect(json.cdnr[0].nt[0].val).toBe(1180);

    // HSN checks
    expect(json.hsn.data).toHaveLength(1);
    expect(json.hsn.data[0].hsn_sc).toBe('8471');
    expect(json.hsn.data[0].uqc).toBe('NOS');
    expect(json.hsn.data[0].txval).toBe(100000);

    // Doc issue checks
    expect(json.doc_issue.doc_det).toHaveLength(1);
    expect(json.doc_issue.doc_det[0].docs[0].from).toBe('INV-001');
    expect(json.doc_issue.doc_det[0].docs[0].to).toBe('INV-003');
    expect(json.doc_issue.doc_det[0].docs[0].net_issue).toBe(3);
  });
});
