/**
 * GSTR-1 Report Service — Electron main process.
 *
 * Aggregates period invoice/return data into GSTR-1 tables:
 *  Table 4  – B2B (registered customers, intra + inter state)
 *  Table 5  – B2CL (inter-state B2C, invoice > ₹1,00,000)
 *  Table 7  – B2CS (intra-state B2C + small inter-state, net of returns)
 *  Table 9B – CDNR (Credit notes – registered customers)
 *  Table 9B – CDNUR (Credit notes – unregistered customers)
 *  Table 12 – HSN/SAC summary
 *  Table 13 – Documents issued (invoice & credit note serial ranges)
 *  Validation report
 *
 * Out of scope: automatic GSTN portal submission, GSTR-3B, ITC.
 */

import crypto from 'node:crypto';
import { getDb } from '../db/localDb.js';
import * as gstSql from '../db/statements/gstReports.js';
import { validateGSTIN } from '../utils/gstinValidator.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface GstPeriodFilter {
  tenant_id: string;
  from_date: string; // YYYY-MM-DD
  to_date: string;   // YYYY-MM-DD
}

export interface InvoiceRow {
  invoice_id: string;
  tenant_id: string;
  invoice_number: string;
  invoice_type: string | null;
  created_at: string;
  subtotal: number;
  tax_total: number;
  discount_total: number | null;
  grand_total: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  supply_type: string | null;
  cgst_total: number | null;
  sgst_total: number | null;
  igst_total: number | null;
  is_deleted: number;
}

export interface InvoiceItemRow {
  item_id: string;
  invoice_id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
  cgst_rate: number | null;
  sgst_rate: number | null;
  igst_rate: number | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  hsn_sac_code: string | null;
  uom: string | null;
  product_hsn: string | null;
}

export interface ReturnRow {
  return_id: string;
  return_number: string;
  credit_note_number: string | null;
  original_invoice_number: string | null;
  original_invoice_date: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  supply_type: string | null;
  grand_total: number;
  tax_total: number;
  subtotal: number;
  cgst_total: number | null;
  sgst_total: number | null;
  igst_total: number | null;
  note_type: string | null;
  created_at: string;
}

export interface ReturnItemRow {
  return_item_id: string;
  return_id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total: number;
  taxable_amount: number | null;
  cgst_rate: number | null;
  sgst_rate: number | null;
  igst_rate: number | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  hsn_sac_code: string | null;
  product_hsn: string | null;
}

// B2CL threshold: inter-state B2C invoices above this are in Table 5; rest go to Table 7
const B2CL_THRESHOLD = 100_000;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function effectiveHsn(item: { hsn_sac_code?: string | null; product_hsn?: string | null }): string {
  return (item.hsn_sac_code || item.product_hsn || '').trim();
}

function isB2B(inv: InvoiceRow): boolean {
  return !!(inv.customer_gstin && inv.customer_gstin.trim().length >= 15);
}

// ─────────────────────────────────────────────────────────────────────────────
// Table 4: B2B invoices (registered customers)
// ─────────────────────────────────────────────────────────────────────────────

export interface B2BInvoice {
  gstin: string;
  customer_name: string | null;
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
  pos: string;
  reverse_charge: 'Y' | 'N';
  invoice_type: string;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

function buildB2B(invoices: InvoiceRow[]): B2BInvoice[] {
  return invoices
    .filter(inv => isB2B(inv) && !inv.is_deleted)
    .map(inv => {
      const taxableValue = round2(inv.grand_total - (inv.tax_total || 0));
      const pos = (inv.customer_gstin || '').slice(0, 2);
      return {
        gstin: inv.customer_gstin!.trim(),
        customer_name: inv.customer_name || null,
        invoice_number: inv.invoice_number,
        invoice_date: inv.created_at.slice(0, 10),
        invoice_value: round2(inv.grand_total),
        pos,
        reverse_charge: 'N',
        invoice_type: 'Regular',
        taxable_value: taxableValue,
        igst: round2(inv.igst_total || 0),
        cgst: round2(inv.cgst_total || 0),
        sgst: round2(inv.sgst_total || 0),
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Table 5: B2CL (inter-state B2C, value > ₹1,00,000)
// ─────────────────────────────────────────────────────────────────────────────

export interface B2CLInvoice {
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
  pos: string;
  applicable_tax_rate: number;
  taxable_value: number;
  igst: number;
}

function buildB2CL(invoices: InvoiceRow[]): B2CLInvoice[] {
  return invoices
    .filter(inv =>
      !isB2B(inv) &&
      !inv.is_deleted &&
      (inv.supply_type || 'INTRA') === 'INTER' &&
      round2(inv.grand_total) > B2CL_THRESHOLD,
    )
    .map(inv => {
      const taxableValue = round2(inv.grand_total - (inv.tax_total || 0));
      const pos = (inv.customer_state || '').trim() || '00';
      const totalTax = round2(inv.tax_total || 0);
      const rate = taxableValue > 0 ? round2((totalTax / taxableValue) * 100) : 0;
      return {
        invoice_number: inv.invoice_number,
        invoice_date: inv.created_at.slice(0, 10),
        invoice_value: round2(inv.grand_total),
        pos,
        applicable_tax_rate: rate,
        taxable_value: taxableValue,
        igst: round2(inv.igst_total || 0),
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Table 7: B2CS (intra-state + small inter-state B2C, net of returns)
// ─────────────────────────────────────────────────────────────────────────────

export interface B2CSEntry {
  supply_type: 'INTRA' | 'INTER';
  pos: string;
  applicable_tax_rate: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  note: string;
}

function buildB2CS(
  invoices: InvoiceRow[],
  returns: ReturnRow[],
  shopStateCode: string,
): B2CSEntry[] {
  type Key = string;
  const map = new Map<Key, { supplyType: 'INTRA' | 'INTER'; pos: string; rate: number; taxable: number; igst: number; cgst: number; sgst: number }>();

  const addToMap = (supplyType: 'INTRA' | 'INTER', pos: string, rate: number, taxable: number, igst: number, cgst: number, sgst: number) => {
    const key: Key = `${supplyType}|${pos}|${rate}`;
    const existing = map.get(key);
    if (existing) {
      existing.taxable = round2(existing.taxable + taxable);
      existing.igst = round2(existing.igst + igst);
      existing.cgst = round2(existing.cgst + cgst);
      existing.sgst = round2(existing.sgst + sgst);
    } else {
      map.set(key, { supplyType, pos, rate, taxable: round2(taxable), igst: round2(igst), cgst: round2(cgst), sgst: round2(sgst) });
    }
  };

  // B2CS invoices: not B2B, not deleted, (intra-state OR (inter-state but <= 1,00,000))
  for (const inv of invoices) {
    if (isB2B(inv) || inv.is_deleted) continue;
    const supplyType = (inv.supply_type || 'INTRA') as 'INTRA' | 'INTER';
    if (supplyType === 'INTER' && round2(inv.grand_total) > B2CL_THRESHOLD) continue;

    const taxableValue = round2(inv.grand_total - (inv.tax_total || 0));
    const igst = round2(inv.igst_total || 0);
    const cgst = round2(inv.cgst_total || 0);
    const sgst = round2(inv.sgst_total || 0);
    const totalTax = round2(inv.tax_total || 0);
    const rate = taxableValue > 0 ? round2((totalTax / taxableValue) * 100) : 0;
    const pos = supplyType === 'INTER' ? ((inv.customer_state || '').trim() || '00') : shopStateCode;
    addToMap(supplyType, pos, rate, taxableValue, igst, cgst, sgst);
  }

  // Subtract B2CS returns (credit notes for unregistered customers)
  for (const ret of returns) {
    if (ret.customer_gstin && ret.customer_gstin.trim().length >= 15) continue; // B2B return → CDNR
    const supplyType = (ret.supply_type || 'INTRA') as 'INTRA' | 'INTER';
    const taxable = round2(ret.subtotal || 0);
    const igst = round2(ret.igst_total || 0);
    const cgst = round2(ret.cgst_total || 0);
    const sgst = round2(ret.sgst_total || 0);
    const totalTax = round2(ret.tax_total || 0);
    const rate = taxable > 0 ? round2((totalTax / taxable) * 100) : 0;
    const pos = supplyType === 'INTER' ? '00' : shopStateCode;
    // Subtract (returns reduce net sales)
    addToMap(supplyType, pos, rate, -taxable, -igst, -cgst, -sgst);
  }

  return Array.from(map.values()).map(e => ({
    supply_type: e.supplyType,
    pos: e.pos,
    applicable_tax_rate: e.rate,
    taxable_value: round2(e.taxable),
    igst: round2(e.igst),
    cgst: round2(e.cgst),
    sgst: round2(e.sgst),
    note: '',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Table 9B: CDNR (Credit notes – registered customers)
// ─────────────────────────────────────────────────────────────────────────────

export interface CDNREntry {
  gstin: string;
  customer_name: string | null;
  note_number: string;
  note_date: string;
  note_type: string;
  original_invoice_number: string | null;
  original_invoice_date: string | null;
  reason: string;
  note_value: number;
  pos: string;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export interface CDNUREntry {
  note_number: string;
  note_date: string;
  note_type: string;
  supply_type: string;
  original_invoice_number: string | null;
  original_invoice_date: string | null;
  reason: string;
  note_value: number;
  applicable_tax_rate: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

function buildCDNR(returns: ReturnRow[]): CDNREntry[] {
  return returns
    .filter(r => r.customer_gstin && r.customer_gstin.trim().length >= 15)
    .map(r => ({
      gstin: r.customer_gstin!.trim(),
      customer_name: r.customer_name || null,
      note_number: r.credit_note_number || r.return_number,
      note_date: r.created_at.slice(0, 10),
      note_type: r.note_type || 'C',
      original_invoice_number: r.original_invoice_number || null,
      original_invoice_date: r.original_invoice_date || null,
      reason: '01-Sales Return',
      note_value: round2(r.grand_total),
      pos: r.customer_gstin!.slice(0, 2),
      taxable_value: round2(r.subtotal || 0),
      igst: round2(r.igst_total || 0),
      cgst: round2(r.cgst_total || 0),
      sgst: round2(r.sgst_total || 0),
    }));
}

function buildCDNUR(returns: ReturnRow[]): CDNUREntry[] {
  return returns
    .filter(r => !(r.customer_gstin && r.customer_gstin.trim().length >= 15))
    .map(r => {
      const taxable = round2(r.subtotal || 0);
      const totalTax = round2(r.tax_total || 0);
      const rate = taxable > 0 ? round2((totalTax / taxable) * 100) : 0;
      return {
        note_number: r.credit_note_number || r.return_number,
        note_date: r.created_at.slice(0, 10),
        note_type: r.note_type || 'C',
        supply_type: r.supply_type || 'INTRA',
        original_invoice_number: r.original_invoice_number || null,
        original_invoice_date: r.original_invoice_date || null,
        reason: '01-Sales Return',
        note_value: round2(r.grand_total),
        applicable_tax_rate: rate,
        taxable_value: taxable,
        igst: round2(r.igst_total || 0),
        cgst: round2(r.cgst_total || 0),
        sgst: round2(r.sgst_total || 0),
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Table 12: HSN/SAC summary
// ─────────────────────────────────────────────────────────────────────────────

export interface HSNEntry {
  hsn_sc: string;
  description: string;
  uqc: string;
  total_quantity: number;
  total_value: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

function buildHSN(items: InvoiceItemRow[], returnItems: ReturnItemRow[]): HSNEntry[] {
  const map = new Map<string, { description: string; uqc: string; qty: number; value: number; taxable: number; igst: number; cgst: number; sgst: number }>();

  const addItem = (hsn: string, desc: string, uqc: string, qty: number, value: number, taxable: number, igst: number, cgst: number, sgst: number) => {
    if (!hsn) return;
    const existing = map.get(hsn);
    if (existing) {
      existing.qty += qty;
      existing.value = round2(existing.value + value);
      existing.taxable = round2(existing.taxable + taxable);
      existing.igst = round2(existing.igst + igst);
      existing.cgst = round2(existing.cgst + cgst);
      existing.sgst = round2(existing.sgst + sgst);
    } else {
      map.set(hsn, { description: desc, uqc, qty, value: round2(value), taxable: round2(taxable), igst: round2(igst), cgst: round2(cgst), sgst: round2(sgst) });
    }
  };

  for (const item of items) {
    const hsn = effectiveHsn(item);
    const taxable = round2(item.total - item.tax_amount);
    addItem(hsn, item.name, item.uom || 'NOS', item.quantity, round2(item.total), taxable,
      round2(item.igst_amount || 0), round2(item.cgst_amount || 0), round2(item.sgst_amount || 0));
  }

  // Subtract return items from HSN summary
  for (const ri of returnItems) {
    const hsn = effectiveHsn(ri);
    const taxable = round2(ri.taxable_amount || ri.total - ri.tax_amount);
    addItem(hsn, ri.name, 'NOS', -ri.quantity, -round2(ri.total), -taxable,
      -round2(ri.igst_amount || 0), -round2(ri.cgst_amount || 0), -round2(ri.sgst_amount || 0));
  }

  return Array.from(map.entries())
    .filter(([hsn]) => hsn.length > 0)
    .map(([hsn, v]) => ({
      hsn_sc: hsn,
      description: v.description,
      uqc: v.uqc,
      total_quantity: round2(v.qty),
      total_value: round2(v.value),
      taxable_value: round2(v.taxable),
      igst: round2(v.igst),
      cgst: round2(v.cgst),
      sgst: round2(v.sgst),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Table 13: Document issuance summary
// ─────────────────────────────────────────────────────────────────────────────

export interface DocIssueSummary {
  nature_of_document: string;
  from_doc: string | null;
  to_doc: string | null;
  total_docs: number;
  cancelled_docs: number;
  net_docs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  invoice_number: string | null;
  field: string;
  message: string;
}

function validate(invoices: InvoiceRow[], returns: ReturnRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const inv of invoices) {
    if (isB2B(inv)) {
      const gstin = inv.customer_gstin!.trim();
      const v = validateGSTIN(gstin);
      if (!v.isValid) {
        issues.push({ severity: 'BLOCKING', invoice_number: inv.invoice_number, field: 'customer_gstin', message: `Invalid GSTIN "${gstin}": ${v.error}` });
      }
    }

    const computedTax = round2((inv.cgst_total || 0) + (inv.sgst_total || 0) + (inv.igst_total || 0));
    const headerTax = round2(inv.tax_total || 0);
    if (Math.abs(computedTax - headerTax) > 1) {
      issues.push({ severity: 'WARNING', invoice_number: inv.invoice_number, field: 'tax_total', message: `Tax breakdown sum ₹${computedTax} differs from header tax_total ₹${headerTax}` });
    }
  }

  for (const ret of returns) {
    if (ret.customer_gstin && ret.customer_gstin.trim()) {
      const gstin = ret.customer_gstin.trim();
      const v = validateGSTIN(gstin);
      if (!v.isValid) {
        issues.push({ severity: 'BLOCKING', invoice_number: ret.return_number, field: 'customer_gstin', message: `Credit note ${ret.return_number} has invalid customer GSTIN "${gstin}": ${v.error}` });
      }
    }
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Period summary
// ─────────────────────────────────────────────────────────────────────────────

export interface GstPeriodSummary {
  period_from: string;
  period_to: string;
  total_invoices: number;
  total_taxable_value: number;
  total_tax: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_invoice_value: number;
  total_credit_notes: number;
  credit_note_value: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main GSTR-1 report
// ─────────────────────────────────────────────────────────────────────────────

export interface Gstr1Report {
  period_from: string;
  period_to: string;
  generated_at: string;
  summary: GstPeriodSummary;
  b2b: B2BInvoice[];
  b2cl: B2CLInvoice[];
  b2cs: B2CSEntry[];
  cdnr: CDNREntry[];
  cdnur: CDNUREntry[];
  hsn: HSNEntry[];
  doc_issue: DocIssueSummary[];
  validation_issues: ValidationIssue[];
}

/** IPC: db:getGstReport */
export function getGstReport(payload: GstPeriodFilter & { shop_state_code?: string }): Gstr1Report | { error: string } {
  try {
    const db = getDb();
    const { tenant_id, from_date, to_date, shop_state_code = '00' } = payload;

    const invoices = gstSql.findInvoicesForGstReport(db).all(tenant_id, from_date, to_date) as InvoiceRow[];
    const items = gstSql.findInvoiceItemsForGstReport(db).all(tenant_id, from_date, to_date) as InvoiceItemRow[];
    const returns = gstSql.findReturnsForGstReport(db).all(tenant_id, from_date, to_date) as ReturnRow[];
    const returnItems = gstSql.findReturnItemsForGstReport(db).all(tenant_id, from_date, to_date) as ReturnItemRow[];

    const invDocStats = gstSql.findInvoiceDocStats(db).get(tenant_id, from_date, to_date) as { from_doc: string | null; to_doc: string | null; total_docs: number; cancelled_docs: number } | undefined;
    const cnDocStats = gstSql.findCreditNoteDocStats(db).get(tenant_id, from_date, to_date) as { from_doc: string | null; to_doc: string | null; total_docs: number; cancelled_docs: number } | undefined;

    const activeInvoices = invoices.filter(i => !i.is_deleted);

    const b2b = buildB2B(activeInvoices);
    const b2cl = buildB2CL(activeInvoices);
    const b2cs = buildB2CS(activeInvoices, returns, shop_state_code);
    const cdnr = buildCDNR(returns);
    const cdnur = buildCDNUR(returns);
    const hsn = buildHSN(items, returnItems);
    const validationIssues = validate(activeInvoices, returns);

    const doc_issue: DocIssueSummary[] = [];
    if (invDocStats) {
      doc_issue.push({
        nature_of_document: 'Invoices for outward supply',
        from_doc: invDocStats.from_doc,
        to_doc: invDocStats.to_doc,
        total_docs: invDocStats.total_docs,
        cancelled_docs: invDocStats.cancelled_docs,
        net_docs: invDocStats.total_docs - invDocStats.cancelled_docs,
      });
    }
    if (cnDocStats) {
      doc_issue.push({
        nature_of_document: 'Credit notes',
        from_doc: cnDocStats.from_doc,
        to_doc: cnDocStats.to_doc,
        total_docs: cnDocStats.total_docs,
        cancelled_docs: cnDocStats.cancelled_docs,
        net_docs: cnDocStats.total_docs - cnDocStats.cancelled_docs,
      });
    }

    const totalTaxable = round2(activeInvoices.reduce((s, i) => s + round2(i.grand_total - (i.tax_total || 0)), 0));
    const totalTax = round2(activeInvoices.reduce((s, i) => s + round2(i.tax_total || 0), 0));
    const totalCgst = round2(activeInvoices.reduce((s, i) => s + round2(i.cgst_total || 0), 0));
    const totalSgst = round2(activeInvoices.reduce((s, i) => s + round2(i.sgst_total || 0), 0));
    const totalIgst = round2(activeInvoices.reduce((s, i) => s + round2(i.igst_total || 0), 0));
    const totalValue = round2(activeInvoices.reduce((s, i) => s + round2(i.grand_total), 0));
    const creditNoteValue = round2(returns.reduce((s, r) => s + round2(r.grand_total), 0));

    const summary: GstPeriodSummary = {
      period_from: from_date,
      period_to: to_date,
      total_invoices: activeInvoices.length,
      total_taxable_value: totalTaxable,
      total_tax: totalTax,
      total_cgst: totalCgst,
      total_sgst: totalSgst,
      total_igst: totalIgst,
      total_invoice_value: totalValue,
      total_credit_notes: returns.length,
      credit_note_value: creditNoteValue,
    };

    return {
      period_from: from_date,
      period_to: to_date,
      generated_at: new Date().toISOString(),
      summary,
      b2b,
      b2cl,
      b2cs,
      cdnr,
      cdnur,
      hsn,
      doc_issue,
      validation_issues: validationIssues,
    };
  } catch (err) {
    console.error('[db:getGstReport]', err);
    return { error: String(err) };
  }
}

export interface LocalGstFilingRow {
  id: string;
  period: string;
  return_type: string;
  status: 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'FILED';
  filing_mode: 'OFFLINE_MANUAL' | 'SHOP_GSP' | 'PLATFORM_GSP';
  acknowledgement_number?: string | null;
  filing_date?: string | null;
  gross_taxable_value: number;
  total_tax_amount: number;
  summary_payload?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** IPC: db:getLocalGstFilings */
export function getLocalGstFilings(): LocalGstFilingRow[] | { error: string } {
  try {
    const db = getDb();
    const rows = gstSql.getLocalGstFilings(db).all() as LocalGstFilingRow[];
    return rows;
  } catch (err) {
    console.error('[db:getLocalGstFilings]', err);
    return { error: String(err) };
  }
}

/** IPC: db:upsertLocalGstFiling */
export function upsertLocalGstFiling(payload: {
  id?: string;
  period: string;
  return_type: string;
  status: string;
  filing_mode: string;
  gross_taxable_value: number;
  total_tax_amount: number;
  summary_payload?: string;
  approved_by?: string;
  approved_at?: string;
}): { success: boolean; id?: string } | { error: string } {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = payload.id || crypto.randomUUID();
    gstSql.upsertLocalGstFiling(db).run(
      id,
      payload.period,
      payload.return_type,
      payload.status,
      payload.filing_mode,
      payload.gross_taxable_value,
      payload.total_tax_amount,
      payload.summary_payload || null,
      payload.approved_by || null,
      payload.approved_at || null,
      now,
      now
    );
    return { success: true, id };
  } catch (err) {
    console.error('[db:upsertLocalGstFiling]', err);
    return { error: String(err) };
  }
}

/** IPC: db:recordLocalManualAcknowledgement */
export function recordLocalManualAcknowledgement(payload: {
  id?: string;
  period: string;
  return_type: string;
  acknowledgement_number: string;
  filing_date: string;
  gross_taxable_value: number;
  total_tax_amount: number;
  approved_by?: string;
  approved_at?: string;
}): { success: boolean; id?: string } | { error: string } {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = payload.id || crypto.randomUUID();
    gstSql.recordLocalManualAcknowledgement(db).run(
      id,
      payload.period,
      payload.return_type,
      payload.acknowledgement_number,
      payload.filing_date,
      payload.gross_taxable_value,
      payload.total_tax_amount,
      payload.approved_by || null,
      payload.approved_at || null,
      now,
      now
    );
    return { success: true, id };
  } catch (err) {
    console.error('[db:recordLocalManualAcknowledgement]', err);
    return { error: String(err) };
  }
}
