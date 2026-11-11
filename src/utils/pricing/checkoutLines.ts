import { roundMoney } from './moneyRounding';
import { moneyScale } from './moneyRounding';
import { getCurrencyPrefix } from '../localization/storeProfile';
import { isVatStore, getStoreVatInclusive } from '../localization/storeProfile';
import { calculateVat } from './vat';
import { v4 as uuidv4 } from 'uuid';
import type { CartItem } from '../../store/cartStore';
import { listRate, resolveLinePrice } from './linePricing';

/**
 * Pure builders for the checkout payload and the printed receipt lines.
 * BillingPage gathers state; these functions own the per-line money math.
 */
export type SupplyType = 'INTRA' | 'INTER';
export type InvoiceKind = 'GST' | 'BILL_OF_SUPPLY' | string;

function round2(amount: number): number {
  return Math.round(amount * moneyScale()) / moneyScale();
}

/** Splits intra-state GST amounts while preserving the rounded total tax. */
export function splitTaxAmount(tax: number): { cgst: number; sgst: number } {
  const cgst = round2(tax / 2);
  return { cgst, sgst: round2(tax - cgst) };
}

/** Inter-state only for GST invoices when both states are known and differ. */
export function resolveSupplyType(invoiceType: InvoiceKind, shopState: string, customerState: string): SupplyType {
  if (isVatStore()) return 'INTRA';
  const shop = shopState.trim().toUpperCase();
  const customer = customerState.trim().toUpperCase();
  return invoiceType === 'GST' && shop !== '' && customer !== '' && shop !== customer ? 'INTER' : 'INTRA';
}

export interface CheckoutLineContext {
  invoiceType: InvoiceKind;
  supplyType: SupplyType;
  /** Bill-of-supply tax (some states levy it); 0 = none. */
  bosTaxRatePercent: number;
  bosTaxInclusive: boolean;
  /** Piece counts captured for weighed items, by product id. */
  pcsSnapshot: Record<string, number>;
  newId?: () => string;
}

/** Invoice lines sent to `db:checkout` (unit price, tax and the CGST/SGST/IGST split). */
export function buildCheckoutLines(items: CartItem[], ctx: CheckoutLineContext) {
  const { invoiceType, supplyType, bosTaxRatePercent, bosTaxInclusive, pcsSnapshot, newId = uuidv4 } = ctx;
  return items.map(item => {
    if (item.isServiceItem && !isVatStore()) {
      const servicePrice = Number(item.offer_price ?? item.base_price) || 0;
      return { item_id: item.item_id || newId(), product_id: item.product_id, name: item.name, quantity: 1, unit_price: servicePrice, tax_amount: 0, total: servicePrice, isServiceItem: true, cgst_rate: 0, sgst_rate: 0, igst_rate: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, hsn_sac_code: null, supply_type: supplyType };
    }

    const rate = listRate(item);
    const qty = item.isServiceItem ? 1 : Number(item.quantity) || 0;

    const effectiveRateInfo = resolveLinePrice(item, rate);
    const effectiveRate = effectiveRateInfo.unitRate;

    const rawTotal = effectiveRate * qty;
    const vat = calculateVat(rawTotal, item.tax_rate_percent, getStoreVatInclusive());
    const total = isVatStore() && invoiceType === 'GST' ? vat.taxable : rawTotal;
    const unitPrice = qty > 0 ? total / qty : effectiveRate;
    const itemTax = invoiceType === 'GST' ? (isVatStore() ? vat.tax : total * (item.tax_rate_percent / 100))
      : (invoiceType === 'BILL_OF_SUPPLY' && bosTaxRatePercent > 0
        ? (bosTaxInclusive ? total * (bosTaxRatePercent / 100 / (1 + bosTaxRatePercent / 100)) : total * (bosTaxRatePercent / 100))
        : 0);
    const pieces_sold = pcsSnapshot[item.product_id] ?? 1;

    // ── GST split (Indian GST Act compliance) ────────────────────────────────
    // INTRA-state → CGST = rate/2, SGST = rate/2; INTER-state → IGST = rate
    const taxRatePercent = invoiceType === 'GST' ? (item.tax_rate_percent || 0) : (bosTaxRatePercent || 0);
    const halfRate = taxRatePercent / 2;
    let cgst_rate = 0, sgst_rate = 0, igst_rate = 0;
    let cgst_amount = 0, sgst_amount = 0, igst_amount = 0;
    if (itemTax > 0 && !isVatStore()) {
      if (supplyType === 'INTER') {
        igst_rate = taxRatePercent;
        igst_amount = round2(itemTax);
      } else {
        cgst_rate = halfRate;
        sgst_rate = halfRate;
        const split = splitTaxAmount(itemTax);
        cgst_amount = split.cgst;
        sgst_amount = split.sgst;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    return {
      item_id: item.item_id || newId(),
      product_id: item.product_id,
      name: item.name,
      quantity: qty,
      unit_price: unitPrice,
      tax_amount: itemTax,
      total,
      pieces_sold,
      ...(item.isServiceItem ? { isServiceItem: true } : {}),
      billing_type: item.billing_type,
      uom: item.uom || item.unit,
      ...(item.isCombo ? { isCombo: true } : {}),
      ...(item.combo_id ? { combo_id: item.combo_id } : {}),
      ...(item.combo_items ? { combo_items: item.combo_items } : {}),
      // GST split
      cgst_rate, sgst_rate, igst_rate,
      cgst_amount, sgst_amount, igst_amount,
      hsn_sac_code: item.hsn_sac_code || null,
      supply_type: supplyType,
    };
  });
}

/** Lines for the printed receipt: unit price plus the MRP/discount label shown to the customer. */
export function buildReceiptLines(items: CartItem[], pcsSnapshot: Record<string, number | undefined>, taxable = true) {
  return items.map(item => {
    if (item.isServiceItem && !isVatStore()) {
      const servicePrice = Number(item.offer_price ?? item.base_price) || 0;
      return { name: item.name, quantity: 1, unit_price: servicePrice, total: servicePrice, originalRate: undefined, discountLabel: 'Service' };
    }

    const rate = listRate(item);
    const qty = item.isServiceItem ? 1 : Number(item.quantity) || 0;
    const effectiveRateInfo = resolveLinePrice(item, rate);
    const catalogPriceRec = effectiveRateInfo.catalogRate;
    const isAdhocOfferRec = effectiveRateInfo.adjustment === 'offer';
    const isAdhocDiscFlatRec = effectiveRateInfo.adjustment === 'flat';
    const isAdhocDiscPctRec = effectiveRateInfo.adjustment === 'percent';
    const effectiveRate = effectiveRateInfo.unitRate;
    const rawTotal = effectiveRate * qty;
    const total = isVatStore() && taxable ? calculateVat(rawTotal, item.tax_rate_percent, getStoreVatInclusive()).taxable : rawTotal;
    const unitPrice = qty > 0 ? total / qty : effectiveRate;
    const mrpRate = (item.original_base_price != null && Number(item.original_base_price) > rate)
      ? Number(item.original_base_price)
      : rate;
    let originalRate: number | undefined;
    let discountLabel: string | undefined;
    if (isAdhocOfferRec) {
      originalRate = mrpRate;
      discountLabel = 'Offer';
    } else if (isAdhocDiscFlatRec) {
      originalRate = mrpRate;
      discountLabel = `-${getCurrencyPrefix()}${Number(item.discount_flat).toFixed(0)}`;
    } else if (isAdhocDiscPctRec) {
      originalRate = mrpRate;
      discountLabel = `${item.discount_percent}% OFF`;
    } else if (catalogPriceRec < mrpRate) {
      originalRate = mrpRate;
      discountLabel = 'Offer';
    } else if (mrpRate > effectiveRate + 0.005) {
      originalRate = mrpRate;
      discountLabel = 'Offer';
    }
    const isPriceOverride = isAdhocOfferRec || isAdhocDiscFlatRec || isAdhocDiscPctRec || Boolean(item.is_tier_overridden) || (mrpRate > effectiveRate + 0.005 && catalogPriceRec >= mrpRate);
    const pcsVal = pcsSnapshot[item.product_id] ?? item.pieces_override;
    return {
      name: item.name,
      quantity: qty,
      unit_price: unitPrice,
      total,
      originalRate,
      discountLabel,
      isPriceOverride,
      hsn_sac_code: item.hsn_sac_code || undefined,
      hsn: item.hsn_sac_code || undefined,
      tax_rate_percent: item.tax_rate_percent,
      brand: item.brand_manufacturer || undefined,
      billing_type: item.billing_type,
      pieces_sold: pcsVal != null ? Number(pcsVal) : undefined,
      pieces_override: pcsVal != null ? Number(pcsVal) : undefined,
      pieces_per_kg: item.pieces_per_kg,
      unit: item.unit || item.uom,
      isCombo: item.isCombo,
      combo_items: item.combo_items,
    };
  });
}

/** Quotation lines: discounts, taxable amount and a rounded CGST/SGST/IGST split per line. */
export function buildQuotationLines(items: CartItem[], opts: { isGstQuotation: boolean; isInterState: boolean; newId?: () => string }) {
  const { isGstQuotation, isInterState, newId = uuidv4 } = opts;
  return items.map(item => {
    const rate = listRate(item);
    const effectiveRateInfo = resolveLinePrice(item, rate);
    const effectiveRate = effectiveRateInfo.unitRate;

    const qty = item.isServiceItem ? 1 : Number(item.quantity) || 0;
    const rawAmount = effectiveRate * qty;
    const itemTaxRate = isGstQuotation && (item as CartItem & { is_gst_applicable?: boolean; hsn_code?: string; hsn?: string }).is_gst_applicable !== false ? (Number(item.tax_rate_percent) || 0) : 0;
    const amount = isVatStore() && isGstQuotation ? calculateVat(rawAmount, itemTaxRate, getStoreVatInclusive()).taxable : rawAmount;
    const dAmt = Math.max(0, (rate - effectiveRate) * qty);
    const itemTax = isGstQuotation ? roundMoney(amount * (itemTaxRate / 100)) : 0;
    const halfRate = itemTaxRate / 2;
    const cgst_rate = isVatStore() || isInterState ? 0 : halfRate;
    const sgst_rate = isVatStore() || isInterState ? 0 : halfRate;
    const igst_rate = !isVatStore() && isInterState ? itemTaxRate : 0;
    const taxSplit = splitTaxAmount(itemTax);
    const cgst_amount = isVatStore() || isInterState ? 0 : taxSplit.cgst;
    const sgst_amount = isVatStore() || isInterState ? 0 : taxSplit.sgst;
    const igst_amount = !isVatStore() && isInterState ? itemTax : 0;

    return {
      item_id: item.item_id || newId(),
      product_id: item.product_id,
      name: item.name,
      quantity: qty,
      weight: item.billing_type === 'WEIGHT' ? qty : 0,
      rate: isVatStore() && isGstQuotation && qty > 0 ? amount / qty : effectiveRate,
      base_price: rate,
      discount_flat: item.discount_flat ?? null,
      discount_percent: item.discount_percent ?? null,
      offer_price: item.offer_price ?? null,
      discount_amount: dAmt,
      hsn_code: item.hsn_sac_code || (item as CartItem & { is_gst_applicable?: boolean; hsn_code?: string; hsn?: string }).hsn_code || (item as CartItem & { is_gst_applicable?: boolean; hsn_code?: string; hsn?: string }).hsn || null,
      uom: item.uom || item.unit || (item.billing_type === 'WEIGHT' ? 'KG' : 'PCS'),
      taxable_amount: amount,
      tax_rate_percent: itemTaxRate,
      cgst_rate,
      cgst_amount,
      sgst_rate,
      sgst_amount,
      igst_rate,
      igst_amount,
      amount,
    };
  });
}
