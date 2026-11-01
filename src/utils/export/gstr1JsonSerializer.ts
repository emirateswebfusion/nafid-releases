/**
 * GSTR-1 JSON Serializer — produces the exact schema accepted by the
 * GST Portal Offline Tool (version "GST3.1.3").
 *
 * Reference: GSTN API specification v1.3 (publicly available).
 * Out of scope: direct GSTN portal submission, GSP authentication.
 */

import type {
  B2BInvoice,
  B2CLInvoice,
  B2CSEntry,
  CDNREntry,
  CDNUREntry,
  HSNEntry,
  DocIssueSummary,
  GstPeriodSummary,
} from '../../../electron/services/gstReportService';

export interface Gstr1JsonPayload {
  gstin: string;
  fp: string; // Filing period MMYYYY
  version: string;
  hash: string;
  b2b: Gstr1B2B[];
  b2cl: Gstr1B2CL[];
  b2cs: Gstr1B2CS[];
  cdnr: Gstr1CDNR[];
  cdnur: Gstr1CDNUR[];
  hsn: { data: Gstr1HSN[] };
  doc_issue: { doc_det: Gstr1DocIssueDet[] };
}

// ── Official portal shapes ─────────────────────────────────────────────────

interface Gstr1B2BInv {
  inum: string;
  idt: string;       // DD-Mon-YYYY
  val: number;
  pos: string;       // 2-digit state code
  rchrg: 'Y' | 'N';
  inv_typ: string;
  itms: Array<{
    num: number;
    itm_det: {
      rt: number;
      txval: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    };
  }>;
}

export interface Gstr1B2B {
  ctin: string;
  inv: Gstr1B2BInv[];
}

interface Gstr1B2CLInv {
  inum: string;
  idt: string;
  val: number;
  pos: string;
  inv_typ: string;
  itms: Array<{
    num: number;
    itm_det: { rt: number; txval: number; iamt: number; csamt: number };
  }>;
}

export interface Gstr1B2CL {
  pos: string;
  inv: Gstr1B2CLInv[];
}

export interface Gstr1B2CS {
  sply_tp: string;
  pos: string;
  typ: string;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

interface Gstr1CDNRNote {
  ntty: string;    // 'C' or 'D'
  nt_num: string;
  nt_dt: string;
  val: number;
  pos: string;
  rchrg: 'Y' | 'N';
  inv_typ: string;
  itms: Array<{
    num: number;
    itm_det: { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number };
  }>;
}

export interface Gstr1CDNR {
  ctin: string;
  nt: Gstr1CDNRNote[];
}

export interface Gstr1CDNUR {
  ntty: string;
  nt_num: string;
  nt_dt: string;
  val: number;
  sply_tp: string;
  itms: Array<{
    num: number;
    itm_det: { rt: number; txval: number; iamt: number; csamt: number };
  }>;
}

export interface Gstr1HSN {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;
  qty: number;
  val: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface Gstr1DocIssueDet {
  doc_num: number;
  docs: Array<{
    num: number;
    from: string;
    to: string;
    totnum: number;
    cancel: number;
    net_issue: number;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function r(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function portalDate(isoDate: string): string {
  // YYYY-MM-DD → DD-Mon-YYYY
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = isoDate.split('-');
  return `${d}-${months[parseInt(m, 10) - 1]}-${y}`;
}

function filingPeriod(fromDate: string): string {
  // YYYY-MM-DD → MMYYYY
  const [y, m] = fromDate.split('-');
  return `${m}${y}`;
}

// ── Serializers ────────────────────────────────────────────────────────────

export function serializeGstr1Json(
  gstin: string,
  summary: GstPeriodSummary,
  b2b: B2BInvoice[],
  b2cl: B2CLInvoice[],
  b2cs: B2CSEntry[],
  cdnr: CDNREntry[],
  cdnur: CDNUREntry[],
  hsn: HSNEntry[],
  docIssue: DocIssueSummary[],
): Gstr1JsonPayload {
  // B2B: group by GSTIN
  const b2bMap = new Map<string, Gstr1B2BInv[]>();
  for (const inv of b2b) {
    const existing = b2bMap.get(inv.gstin) ?? [];
    const rate = inv.taxable_value > 0
      ? r((inv.igst + inv.cgst + inv.sgst) / inv.taxable_value * 100)
      : 0;
    existing.push({
      inum: inv.invoice_number,
      idt: portalDate(inv.invoice_date),
      val: r(inv.invoice_value),
      pos: inv.pos.padStart(2, '0'),
      rchrg: 'N',
      inv_typ: 'R',
      itms: [{
        num: 1,
        itm_det: {
          rt: rate,
          txval: r(inv.taxable_value),
          iamt: r(inv.igst),
          camt: r(inv.cgst),
          samt: r(inv.sgst),
          csamt: 0,
        },
      }],
    });
    b2bMap.set(inv.gstin, existing);
  }
  const b2bJson: Gstr1B2B[] = Array.from(b2bMap.entries()).map(([ctin, invs]) => ({ ctin, inv: invs }));

  // B2CL: group by POS
  const b2clMap = new Map<string, Gstr1B2CLInv[]>();
  for (const inv of b2cl) {
    const pos = inv.pos.padStart(2, '0');
    const existing = b2clMap.get(pos) ?? [];
    existing.push({
      inum: inv.invoice_number,
      idt: portalDate(inv.invoice_date),
      val: r(inv.invoice_value),
      pos,
      inv_typ: 'R',
      itms: [{
        num: 1,
        itm_det: {
          rt: r(inv.applicable_tax_rate),
          txval: r(inv.taxable_value),
          iamt: r(inv.igst),
          csamt: 0,
        },
      }],
    });
    b2clMap.set(pos, existing);
  }
  const b2clJson: Gstr1B2CL[] = Array.from(b2clMap.entries()).map(([pos, invs]) => ({ pos, inv: invs }));

  // B2CS
  const b2csJson: Gstr1B2CS[] = b2cs.map(e => ({
    sply_tp: e.supply_type,
    pos: e.pos.padStart(2, '0'),
    typ: 'OE',
    rt: r(e.applicable_tax_rate),
    txval: r(e.taxable_value),
    iamt: r(e.igst),
    camt: r(e.cgst),
    samt: r(e.sgst),
    csamt: 0,
  }));

  // CDNR: group by GSTIN
  const cdnrMap = new Map<string, Gstr1CDNRNote[]>();
  for (const cn of cdnr) {
    const existing = cdnrMap.get(cn.gstin) ?? [];
    const rate = cn.taxable_value > 0
      ? r((cn.igst + cn.cgst + cn.sgst) / cn.taxable_value * 100)
      : 0;
    existing.push({
      ntty: cn.note_type || 'C',
      nt_num: cn.note_number,
      nt_dt: portalDate(cn.note_date),
      val: r(cn.note_value),
      pos: cn.pos.padStart(2, '0'),
      rchrg: 'N',
      inv_typ: 'R',
      itms: [{
        num: 1,
        itm_det: {
          rt: rate,
          txval: r(cn.taxable_value),
          iamt: r(cn.igst),
          camt: r(cn.cgst),
          samt: r(cn.sgst),
          csamt: 0,
        },
      }],
    });
    cdnrMap.set(cn.gstin, existing);
  }
  const cdnrJson: Gstr1CDNR[] = Array.from(cdnrMap.entries()).map(([ctin, nt]) => ({ ctin, nt }));

  // CDNUR
  const cdnurJson: Gstr1CDNUR[] = cdnur.map(cn => {
    const rate = cn.taxable_value > 0 ? r(cn.applicable_tax_rate) : 0;
    return {
      ntty: cn.note_type || 'C',
      nt_num: cn.note_number,
      nt_dt: portalDate(cn.note_date),
      val: r(cn.note_value),
      sply_tp: cn.supply_type,
      itms: [{
        num: 1,
        itm_det: {
          rt: rate,
          txval: r(cn.taxable_value),
          iamt: r(cn.igst),
          csamt: 0,
        },
      }],
    };
  });

  // HSN
  const hsnJson: Gstr1HSN[] = hsn.map((h, idx) => ({
    num: idx + 1,
    hsn_sc: h.hsn_sc,
    desc: h.description,
    uqc: h.uqc.toUpperCase(),
    qty: r(h.total_quantity),
    val: r(h.total_value),
    txval: r(h.taxable_value),
    iamt: r(h.igst),
    camt: r(h.cgst),
    samt: r(h.sgst),
    csamt: 0,
  }));

  // Doc issue
  const docJson: Gstr1DocIssueDet[] = docIssue.map((d, idx) => ({
    doc_num: idx + 1,
    docs: [{
      num: 1,
      from: d.from_doc || '',
      to: d.to_doc || '',
      totnum: d.total_docs,
      cancel: d.cancelled_docs,
      net_issue: d.net_docs,
    }],
  }));

  return {
    gstin,
    fp: filingPeriod(summary.period_from),
    version: 'GST3.1.3',
    hash: 'hash',
    b2b: b2bJson,
    b2cl: b2clJson,
    b2cs: b2csJson,
    cdnr: cdnrJson,
    cdnur: cdnurJson,
    hsn: { data: hsnJson },
    doc_issue: { doc_det: docJson },
  };
}
