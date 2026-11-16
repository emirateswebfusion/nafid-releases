import { round2, round1, splitTaxAmount } from './gstEngine.js';
import type { Db } from '../db/statements/types.js';
import * as combosSql from '../db/statements/combos.js';
import type { ProductRow } from '../services/typesA.js';

export interface ComboConstituent {
  product_id: string;
  quantity: number;
  product_name?: string;
  name?: string;
  product_price?: number;
  base_price?: number;
  unit_price?: number;
  tax_rate_percent?: number | string | null;
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  igst_rate?: number | null;
  is_gst_applicable?: number | boolean | null;
  hsn_sac_code?: string | null;
  sku_barcode?: string | null;
  uom?: string | null;
}

export interface ProRatedComboConstituent {
  product_id: string;
  product_name: string;
  quantity: number;
  total_quantity?: number;
  constituent_quantity: number;
  standalone_price: number;
  standalone_total: number;
  weight: number;
  allocated_turnover: number;
  allocated_taxable: number;
  tax_rate_percent: number;
  tax_amount: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  allocated_total: number;
  hsn_sac_code: string;
  uom: string;
}

export interface ComboTaxBreakdown {
  constituents: ProRatedComboConstituent[];
  totalTaxable: number;
  totalTax: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalAmount: number;
  effectiveTaxRate: number;
}

/**
 * Pure pro-ration engine for combo / bundle products in Electron main process.
 * Splits a combo line's price across child items based on their standalone prices/weights
 * and applies respective tax percentages (e.g. 5%, 18%) and GST/VAT splits.
 */
export function calculateComboTaxBreakdown(args: {
  comboPrice: number;
  quantity: number;
  constituents: ComboConstituent[];
  supplyType?: 'INTRA' | 'INTER';
  isTaxInclusive?: boolean;
}): ComboTaxBreakdown {
  const { comboPrice, quantity, constituents, supplyType = 'INTRA', isTaxInclusive = false } = args;
  const lineAmount = round2(Math.max(0, Number(comboPrice) || 0) * Math.max(0, Number(quantity) || 0));

  if (!Array.isArray(constituents) || constituents.length === 0 || lineAmount === 0) {
    return {
      constituents: [],
      totalTaxable: lineAmount,
      totalTax: 0,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalAmount: lineAmount,
      effectiveTaxRate: 0,
    };
  }

  // 1. Calculate standalone value per constituent (for 1 combo unit)
  const standalones = constituents.map(c => {
    const q = Math.max(0, Number(c.quantity) || 1);
    const p = Math.max(0, Number(c.product_price ?? c.base_price ?? c.unit_price) || 0);
    return { c, q, p, val: q * p };
  });

  const totalStandalone = standalones.reduce((sum, item) => sum + item.val, 0);

  // 2. Proportional weights based on standalone prices/quantities
  const weights = totalStandalone > 0
    ? standalones.map(s => s.val / totalStandalone)
    : standalones.map(() => 1 / standalones.length);

  // 3. Allocate line amount across constituents with exact cent preservation
  let allocatedSum = 0;
  const allocatedAmounts = weights.map(w => {
    const amt = round2(lineAmount * w);
    allocatedSum = round2(allocatedSum + amt);
    return amt;
  });

  const diff = round2(lineAmount - allocatedSum);
  if (Math.abs(diff) >= 0.005 && allocatedAmounts.length > 0) {
    const maxIdx = weights.indexOf(Math.max(...weights));
    allocatedAmounts[maxIdx] = round2(allocatedAmounts[maxIdx] + diff);
  }

  // 4. Compute tax & statutory splits per constituent
  let totalTaxable = 0;
  let totalTax = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalAllocated = 0;

  const resultConstituents: ProRatedComboConstituent[] = standalones.map((s, idx) => {
    const allocatedTurnover = allocatedAmounts[idx];
    const isGst = s.c.is_gst_applicable !== 0 && s.c.is_gst_applicable !== false;
    const rate = isGst
      ? Math.max(0, Number(s.c.tax_rate_percent) || (Number(s.c.cgst_rate || 0) + Number(s.c.sgst_rate || 0) + Number(s.c.igst_rate || 0)) || 0)
      : 0;

    let taxable: number;
    let tax: number;
    let lineTot: number;

    if (rate === 0) {
      taxable = allocatedTurnover;
      tax = 0;
      lineTot = allocatedTurnover;
    } else if (isTaxInclusive) {
      lineTot = allocatedTurnover;
      taxable = round2(lineTot / (1 + rate / 100));
      tax = round2(lineTot - taxable);
    } else {
      taxable = allocatedTurnover;
      tax = round2(taxable * (rate / 100));
      lineTot = round2(taxable + tax);
    }

    let cgstRate = 0, sgstRate = 0, igstRate = 0;
    let cgstAmt = 0, sgstAmt = 0, igstAmt = 0;

    if (tax > 0) {
      if (supplyType === 'INTER') {
        igstRate = rate;
        igstAmt = tax;
      } else {
        cgstRate = round1(rate / 2);
        sgstRate = round1(rate / 2);
        const split = splitTaxAmount(tax);
        cgstAmt = split.cgst;
        sgstAmt = split.sgst;
      }
    }

    totalTaxable = round2(totalTaxable + taxable);
    totalTax = round2(totalTax + tax);
    totalCgst = round2(totalCgst + cgstAmt);
    totalSgst = round2(totalSgst + sgstAmt);
    totalIgst = round2(totalIgst + igstAmt);
    totalAllocated = round2(totalAllocated + lineTot);

    const name = String(s.c.product_name || s.c.name || 'Component');
    const hsn = String(s.c.hsn_sac_code || '').trim();
    const uom = String(s.c.uom || 'PCS').trim();

    return {
      product_id: s.c.product_id,
      product_name: name,
      quantity: s.q,
      total_quantity: s.q * quantity,
      constituent_quantity: s.q,
      standalone_price: s.p,
      standalone_total: round2(s.val * quantity),
      weight: weights[idx],
      allocated_turnover: allocatedTurnover,
      allocated_taxable: taxable,
      tax_rate_percent: rate,
      tax_amount: tax,
      cgst_rate: cgstRate,
      cgst_amount: cgstAmt,
      sgst_rate: sgstRate,
      sgst_amount: sgstAmt,
      igst_rate: igstRate,
      igst_amount: igstAmt,
      allocated_total: lineTot,
      hsn_sac_code: hsn,
      uom,
    };
  });

  const effectiveTaxRate = totalTaxable > 0 ? round2((totalTax / totalTaxable) * 100) : 0;

  return {
    constituents: resultConstituents,
    totalTaxable,
    totalTax,
    totalCgst,
    totalSgst,
    totalIgst,
    totalAmount: totalAllocated,
    effectiveTaxRate,
  };
}

/**
 * Resolves child products of a combo from its stored combo_details JSON or from SQLite catalog.
 * Guarantees that historical invoices (like Bill #156) or newly billed invoices have their
 * constituent tax rates, base prices, quantities, and HSN codes available.
 */
export function resolveItemConstituents(
  db: Db,
  item: { combo_id?: string | null; combo_details?: string | null; product_id: string }
): ComboConstituent[] {
  if (item.combo_details) {
    try {
      const parsed = JSON.parse(item.combo_details);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0] as Record<string, unknown>;
        if (first.tax_rate_percent !== undefined && first.product_price !== undefined) {
          return parsed as ComboConstituent[];
        }
      }
    } catch { /* ignore */ }
  }

  const cid = item.combo_id || item.product_id;
  if (cid) {
    try {
      const fromDb = combosSql.findComboItemsByComboId(db).all(cid) as (ProductRow & { quantity: number; product_name?: string; product_price?: number })[];
      if (fromDb && fromDb.length > 0) {
        return fromDb.map(p => ({
          product_id: p.product_id,
          quantity: p.quantity,
          product_name: p.name || p.product_name,
          product_price: p.base_price ?? p.product_price,
          tax_rate_percent: p.tax_rate_percent,
          is_gst_applicable: p.is_gst_applicable,
          hsn_sac_code: p.hsn_sac_code,
          uom: p.uom,
        }));
      }
    } catch { /* ignore */ }
  }
  return [];
}

export interface GstRateBreakdownRow {
  rate: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
}

/**
 * Resolves the true taxable base of an invoice item line.
 * In Nafid POS, `item.total` is standardly the taxable base (quantity * unit_price).
 * If taxes were embedded in `item.total` (e.g. total ≈ base + tax), it safely extracts the taxable base.
 */
export function resolveItemTaxable(item: { total?: number | null; tax_amount?: number | null; unit_price?: number | null; quantity?: number | null }): number {
  const tot = Number(item.total) || 0;
  const tax = Number(item.tax_amount) || 0;
  const qty = Number(item.quantity) || 1;
  const up = Number(item.unit_price) || 0;
  const basePriceTotal = round2(up * qty);

  if (basePriceTotal > 0 && Math.abs(tot - (basePriceTotal + tax)) < 0.05 && tax > 0) {
    return round2(tot - tax);
  }
  if (basePriceTotal > 0 && Math.abs(tot - basePriceTotal) < 0.05) {
    return tot;
  }
  if (tot > tax + 0.005 && basePriceTotal === 0) {
    return round2(tot - tax);
  }
  return tot;
}

export function expandItemWithConstituents<T extends {
  product_id: string;
  total: number;
  tax_amount: number;
  quantity: number;
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  igst_rate?: number | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  igst_amount?: number | null;
  hsn_sac_code?: string | null;
  uom?: string | null;
  name?: string | null;
  combo_id?: string | null;
  combo_details?: string | null;
}>(
  item: T,
  db?: Db,
  supplyType: 'INTRA' | 'INTER' = 'INTRA'
): Array<{
  product_id: string;
  name: string;
  quantity: number;
  rate: number;
  taxable: number;
  tax_amount: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  total: number;
  hsn_sac_code: string;
  uom: string;
}> {
  const isCombo = Boolean(item.combo_id || (item.combo_details && item.combo_details !== 'null'));
  let constituents: ComboConstituent[] = [];
  if (isCombo) {
    if (db) {
      constituents = resolveItemConstituents(db, item);
    } else if (item.combo_details) {
      try {
        const parsed = JSON.parse(item.combo_details);
        if (Array.isArray(parsed) && parsed.length > 0) constituents = parsed as ComboConstituent[];
      } catch { /* ignore */ }
    }
  }

  const taxableTotal = resolveItemTaxable(item);
  const qty = Number(item.quantity) || 1;

  if (isCombo && constituents.length > 0) {
    const unitPrice = qty > 0 ? taxableTotal / qty : taxableTotal;
    const bd = calculateComboTaxBreakdown({
      comboPrice: unitPrice,
      quantity: qty,
      constituents,
      supplyType,
    });
    return bd.constituents.map(c => ({
      product_id: c.product_id,
      name: c.product_name,
      quantity: c.total_quantity ?? (c.quantity * qty),
      rate: c.tax_rate_percent,
      taxable: c.allocated_taxable,
      tax_amount: c.tax_amount,
      cgst_rate: c.cgst_rate,
      cgst_amount: c.cgst_amount,
      sgst_rate: c.sgst_rate,
      sgst_amount: c.sgst_amount,
      igst_rate: c.igst_rate,
      igst_amount: c.igst_amount,
      total: c.allocated_total,
      hsn_sac_code: c.hsn_sac_code,
      uom: c.uom,
    }));
  }

  const taxable = round2(taxableTotal);
  const rate = (Number(item.cgst_rate || 0) + Number(item.sgst_rate || 0) + Number(item.igst_rate || 0))
    || (taxable > 0 ? round2(((item.tax_amount || 0) / taxable) * 100) : 0);

  return [{
    product_id: item.product_id,
    name: item.name || '',
    quantity: item.quantity,
    rate,
    taxable,
    tax_amount: item.tax_amount || 0,
    cgst_rate: Number(item.cgst_rate || 0),
    cgst_amount: Number(item.cgst_amount || 0),
    sgst_rate: Number(item.sgst_rate || 0),
    sgst_amount: Number(item.sgst_amount || 0),
    igst_rate: Number(item.igst_rate || 0),
    igst_amount: Number(item.igst_amount || 0),
    total: item.total,
    hsn_sac_code: item.hsn_sac_code || '',
    uom: item.uom || 'NOS',
  }];
}
