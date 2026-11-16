import { moneyScale } from './moneyRounding';
import { isVatStore } from '../localization/storeProfile';
import { splitTaxAmount } from './checkoutLines';
import { calculateComboTaxBreakdown, type ComboConstituent } from './comboTax';

type TaxInvoice = { cgst_total?: number | null; sgst_total?: number | null; igst_total?: number | null; customer_name?: string | null; invoice_id: string; invoice_number?: string | null; created_at?: string | null; supply_type?: string | null; converted_from_invoice_id?: string | null; discount_total?: number | string | null; points_redeemed_discount?: number | string | null; tax_total?: number | string | null; subtotal?: number | string | null; grand_total?: number | string | null };
type TaxItem = { product_id: string; item_id?: string | null; cgst_rate?: number | string | null; sgst_rate?: number | string | null; igst_rate?: number | string | null; tax_rate?: number | string | null; quantity?: number | string | null; unit_price?: number | string | null; total?: number | string | null; tax_amount?: number | string | null; name?: string | null; hsn_sac_code?: string | null; hsn_code?: string | null; hsn?: string | null; uom?: string | null; unit?: string | null; combo_id?: string | null; combo_details?: string | null; combo_items?: unknown; isCombo?: boolean };
export interface InvoiceProductRow {
  invoice: TaxInvoice;
  item: TaxItem;
  invoiceId: string;
  invoiceNumber: string;
  createdAt: string;
  name: string;
  hsn: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  taxable: number;
  tax: number;
  discount: number;
  total: number;
  netTotal: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
}

export interface InvoiceProductTotals {
  totalSales: number;
  totalTax: number;
  totalDiscount: number;
  netRevenue: number;
  invoiceCount: number;
}

const round2 = (value: number) => Math.round((Number(value) || 0) * moneyScale()) / moneyScale();
const round1 = (value: number) => Math.round((Number(value) || 0) * 10) / 10;
const positive = (value: unknown) => Math.max(0, Number(value) || 0);

function getItemRate(item: TaxItem, taxable: number, tax: number): number {
  const splitRate = positive(item?.cgst_rate) + positive(item?.sgst_rate) + positive(item?.igst_rate);
  if (splitRate > 0) return round1(splitRate);
  const declaredRate = positive(item?.tax_rate);
  if (declaredRate > 0) return round1(declaredRate);
  if (taxable > 0 && tax > 0) return round1((tax / taxable) * 100);
  return 0;
}

function isInterStateInvoice(inv: TaxInvoice, items: TaxItem[]): boolean {
  if (String(inv?.supply_type || '').toUpperCase() === 'INTER') return true;
  return items.some((item: TaxItem) => positive(item?.igst_rate) > 0);
}

/** Stored header splits are authoritative; legacy bills use supply/item evidence and the cents splitter. */
export function getInvoiceTaxComponents(inv: TaxInvoice, items: TaxItem[], legacyInterState = false) {
  if (isVatStore()) return { cgst: 0, sgst: 0, igst: 0 };
  const tax = positive(inv.tax_total);
  const stored = { cgst: positive(inv.cgst_total), sgst: positive(inv.sgst_total), igst: positive(inv.igst_total) };
  if (Math.round((stored.cgst + stored.sgst + stored.igst) * 100) === Math.round(tax * 100)) return stored;
  if (isInterStateInvoice(inv, items) || legacyInterState) return { cgst: 0, sgst: 0, igst: tax };
  return { ...splitTaxAmount(tax), igst: 0 };
}

export function sortInvoicesByInvoiceNumber<T extends { invoice_number?: string | null } = TaxInvoice>(invoices: T[]): T[] {
  return [...(Array.isArray(invoices) ? invoices : [])].sort((a: T, b: T) =>
    String(a?.invoice_number || '').localeCompare(String(b?.invoice_number || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

export function buildInvoiceProductRows(inv: TaxInvoice, invoiceItems: TaxItem[]): InvoiceProductRow[] {
  const items = (Array.isArray(invoiceItems) ? invoiceItems : []).filter(Boolean);
  const interState = isInterStateInvoice(inv, items);
  const discountTotal = positive(inv?.discount_total);
  const pointsDiscount = positive(inv?.points_redeemed_discount);
  const invoiceTax = positive(inv?.tax_total);
  const invoiceSubtotalRaw = positive(inv?.subtotal);
  const storedItemTotalSum = items.reduce((sum, item) => sum + positive(item?.total), 0);
  const storedItemTaxSum = items.reduce((sum, item) => sum + positive(item?.tax_amount), 0);
  const taxesEmbedded = items.length > 0 && invoiceTax > 0 && invoiceSubtotalRaw > 0 &&
    !inv?.converted_from_invoice_id &&
    Math.abs(storedItemTotalSum - (invoiceSubtotalRaw + invoiceTax)) <
    Math.abs(storedItemTotalSum - invoiceSubtotalRaw);

  const normalized: Array<{
    item: TaxItem;
    quantity: number;
    unitPrice: number;
    taxable: number;
    tax: number;
    gstRate: number;
  }> = [];

  for (const item of items) {
    const quantity = positive(item?.quantity);
    const unitPrice = positive(item?.unit_price);
    const storedTotal = positive(item?.total);
    const storedTax = positive(item?.tax_amount);

    const isCombo = Boolean(item?.combo_id || item?.isCombo || (item?.combo_details && item.combo_details !== 'null'));
    let constituents: ComboConstituent[] = [];
    if (isCombo) {
      if (item?.combo_details) {
        try {
          const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
          if (Array.isArray(parsed) && parsed.length > 0) constituents = parsed as ComboConstituent[];
        } catch { /* ignore */ }
      }
      if (constituents.length === 0 && item?.combo_items) {
        try {
          const parsed = typeof item.combo_items === 'string' ? JSON.parse(item.combo_items) : item.combo_items;
          if (Array.isArray(parsed) && parsed.length > 0) constituents = parsed as ComboConstituent[];
        } catch { /* ignore */ }
      }
    }

    if (isCombo && constituents.length > 0) {
      const breakdown = calculateComboTaxBreakdown({
        comboPrice: unitPrice,
        quantity,
        constituents,
        supplyType: interState ? 'INTER' : 'INTRA',
      });
      for (const child of breakdown.constituents) {
        normalized.push({
          item: {
            ...item,
            product_id: child.product_id,
            name: `${item.name || 'Combo'} (${child.product_name})`,
            hsn_sac_code: child.hsn_sac_code,
            uom: child.uom,
            tax_rate: child.tax_rate_percent,
            cgst_rate: child.cgst_rate,
            sgst_rate: child.sgst_rate,
            igst_rate: child.igst_rate,
          },
          quantity: child.total_quantity ?? (child.quantity * quantity),
          unitPrice: (child.total_quantity ?? (child.quantity * quantity)) > 0 ? round2(child.allocated_taxable / (child.total_quantity ?? (child.quantity * quantity))) : child.standalone_price,
          taxable: child.allocated_taxable,
          tax: child.tax_amount,
          gstRate: child.tax_rate_percent,
        });
      }
      continue;
    }

    let taxable = taxesEmbedded ? storedTotal - storedTax : unitPrice * quantity;

    if (taxable <= 0) {
      taxable = storedTotal > storedTax + 0.005 ? storedTotal - storedTax : storedTotal;
    }

    taxable = round2(taxable);
    const tax = round2(storedTax);
    const gstRate = getItemRate(item, taxable, tax);

    normalized.push({
      item,
      quantity,
      unitPrice: quantity > 0 ? round2(taxable / quantity) : round2(unitPrice),
      taxable,
      tax,
      gstRate,
    });
  }

  const itemSubtotal = round2(normalized.reduce((sum, row) => sum + row.taxable, 0));
  const invoiceSubtotal = invoiceSubtotalRaw || itemSubtotal;
  const taxableBase = round2(Math.max(0, invoiceSubtotal - discountTotal - pointsDiscount));
  const taxableScale = invoiceSubtotal > 0 ? taxableBase / invoiceSubtotal : 1;
  const taxScale = storedItemTaxSum > 0
    ? invoiceTax / storedItemTaxSum
    : (invoiceSubtotal > 0 ? invoiceTax / invoiceSubtotal : 0);

  if (normalized.length === 0) {
    const rate = invoiceSubtotal > 0 ? round1((invoiceTax / invoiceSubtotal) * 100) : 0;
    const grossTotal = round2(taxableBase + invoiceTax);
    const storedGrand = Number(inv?.grand_total);
    const netRatio = grossTotal > 0 && Number.isFinite(storedGrand) ? Math.max(0, storedGrand / grossTotal) : 1;
    const taxSplit = splitTaxAmount(invoiceTax);
    const cgstAmount = isVatStore() || interState ? 0 : taxSplit.cgst;
    const sgstAmount = isVatStore() || interState ? 0 : taxSplit.sgst;

    return [{
      invoice: inv,
      item: null as unknown as TaxItem,
      invoiceId: String(inv?.invoice_id || ''),
      invoiceNumber: String(inv?.invoice_number || ''),
      createdAt: String(inv?.created_at || ''),
      name: 'General Bill Item',
      hsn: '',
      uom: 'PCS',
      quantity: 1,
      unitPrice: round2(taxableBase),
      gstRate: rate,
      taxable: taxableBase,
      tax: round2(invoiceTax),
      discount: round2(discountTotal + pointsDiscount),
      total: grossTotal,
      netTotal: round2(grossTotal * netRatio),
      cgstRate: isVatStore() || interState ? 0 : round1(rate / 2),
      cgstAmount,
      sgstRate: isVatStore() || interState ? 0 : round1(rate / 2),
      sgstAmount,
      igstRate: !isVatStore() && interState ? rate : 0,
      igstAmount: !isVatStore() && interState ? round2(invoiceTax) : 0,
    }];
  }

  const allocatedTax = storedItemTaxSum > 0 ? invoiceTax : round2(taxableBase * taxScale);
  const storedGrand = Number(inv?.grand_total);
  const grossInvoiceTotal = round2(taxableBase + allocatedTax);
  const netRatio = grossInvoiceTotal > 0 && Number.isFinite(storedGrand)
    ? Math.max(0, storedGrand / grossInvoiceTotal)
    : 1;

  const rows: InvoiceProductRow[] = normalized.map((entry: (typeof normalized)[number]) => {
    const taxable = round2(entry.taxable * taxableScale);
    const tax = storedItemTaxSum > 0
      ? round2(entry.tax * taxScale)
      : round2(taxable * taxScale);
    const discount = round2(entry.taxable - taxable);
    const total = round2(taxable + tax);
    const taxSplit = splitTaxAmount(tax);
    const cgstAmount = isVatStore() || interState ? 0 : taxSplit.cgst;
    const sgstAmount = isVatStore() || interState ? 0 : taxSplit.sgst;

    return {
      invoice: inv,
      item: entry.item,
      invoiceId: String(inv?.invoice_id || ''),
      invoiceNumber: String(inv?.invoice_number || ''),
      createdAt: String(inv?.created_at || ''),
      name: String(entry.item?.name || 'Item'),
      hsn: String(entry.item?.hsn_sac_code || entry.item?.hsn_code || entry.item?.hsn || ''),
      uom: String(entry.item?.uom || entry.item?.unit || 'PCS'),
      quantity: entry.quantity,
      unitPrice: entry.unitPrice,
      gstRate: round1(entry.gstRate),
      taxable,
      tax,
      discount,
      total,
      netTotal: round2(total * netRatio),
      cgstRate: isVatStore() || interState ? 0 : round1(entry.gstRate / 2),
      cgstAmount,
      sgstRate: isVatStore() || interState ? 0 : round1(entry.gstRate / 2),
      sgstAmount,
      igstRate: !isVatStore() && interState ? round1(entry.gstRate) : 0,
      igstAmount: !isVatStore() && interState ? tax : 0,
    };
  });

  const taxableDiff = round2(taxableBase - rows.reduce((sum, row) => sum + row.taxable, 0));
  const taxDiff = round2(invoiceTax - rows.reduce((sum, row) => sum + row.tax, 0));
  const allocateInvoiceTax = storedItemTaxSum > 0;
  if (rows.length > 0 && (Math.abs(taxableDiff) >= 0.01 || (allocateInvoiceTax && Math.abs(taxDiff) >= 0.01))) {
    const last = rows[rows.length - 1];
    last.taxable = round2(last.taxable + taxableDiff);
    if (allocateInvoiceTax) last.tax = round2(last.tax + taxDiff);
    last.discount = round2(last.discount - taxableDiff);
    last.total = round2(last.taxable + last.tax);
    last.netTotal = round2(last.total * netRatio);
    if (interState) {
      last.igstAmount = last.tax;
      last.igstRate = last.taxable > 0 ? round1((last.tax / last.taxable) * 100) : last.igstRate;
    } else {
      const taxSplit = splitTaxAmount(last.tax);
      last.cgstAmount = taxSplit.cgst;
      last.sgstAmount = taxSplit.sgst;
    }
  }

  return isVatStore() ? rows.map(row => ({ ...row, cgstRate: 0, sgstRate: 0, igstRate: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 })) : rows;
}

export function buildTaxFilteredProductRows(
  invoices: TaxInvoice[],
  itemsByInvoice: Record<string, TaxItem[]>,
  targetRate: number
): { rows: InvoiceProductRow[]; totals: InvoiceProductTotals } {
  const rows: InvoiceProductRow[] = [];
  const invoiceIds = new Set<string>();

  for (const inv of Array.isArray(invoices) ? invoices : []) {
    const invoiceRows = buildInvoiceProductRows(inv, itemsByInvoice[inv?.invoice_id] || []);
    for (const row of invoiceRows) {
      if (Math.round(row.gstRate) !== Math.round(targetRate)) continue;
      rows.push(row);
      invoiceIds.add(row.invoiceId);
    }
  }

  rows.sort((a, b) =>
    a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true, sensitivity: 'base' }) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  return {
    rows,
    totals: {
      totalSales: round2(rows.reduce((sum, row) => sum + row.total, 0)),
      totalTax: round2(rows.reduce((sum, row) => sum + row.tax, 0)),
      totalDiscount: round2(rows.reduce((sum, row) => sum + row.discount, 0)),
      netRevenue: round2(rows.reduce((sum, row) => sum + row.netTotal, 0)),
      invoiceCount: invoiceIds.size,
    },
  };
}
