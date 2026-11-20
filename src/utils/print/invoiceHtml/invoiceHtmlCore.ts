import { getCurrencyPrefix, getCurrencyDecimals } from '../../localization/storeProfile';
/** Shared invoice types and helpers of the A4 / A5 invoice HTML generators. */
import { DEFAULT_BILL_SETTINGS, type BillSettings } from '../receiptGenerator';


export interface InvoiceItemDisplay {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
  originalRate?: number;
  discountLabel?: string;
  isPriceOverride?: boolean;
  brand?: string;
  billing_type?: string | null;
  pieces_override?: number;
  pieces_sold?: number;
  pieces_per_kg?: number;
  unit?: string | null;
  hsn?: string;
  hsn_code?: string;
  tax_rate_percent?: number;
  gst_percent?: number;
  discountAmount?: number;
  isCombo?: boolean;
  combo_items?: Array<{ product_id: string; quantity: number; product_name?: string }>;
}

export interface InvoiceData {
  shopName: string;
  shopGstin?: string;
  shopPan?: string;
  shopState?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  shopWebsite?: string;
  logoUrl?: string;
  upiId?: string;
  showUpiQr?: boolean;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  billerName?: string;
  transporterName?: string;
  vehicleNumber?: string;
  transporterDocNo?: string;
  transporterDocDate?: string;
  ewayBillNo?: string;
  ewayBillDate?: string;
  irn?: string;
  certificationText?: string;
  electronicRefNumber?: string;
  ackNo?: string;
  ackDate?: string;
  bankAccount?: string;
  bankName?: string;
  bankIfsc?: string;
  bankBranch?: string;
  items: InvoiceItemDisplay[];
  subtotal: number;
  tax: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  discount: number;
  discountType?: string;
  discountValue?: number;
  grandTotal: number;
  receivedAmount?: number;
  balanceAmount?: number;
  oldBalance?: number;
  customerBalance?: number;
  paymentMethod?: string;
  isReprint?: boolean;
  invoiceType?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerState?: string;
  customerStateCode?: string;
  customerLandline?: string;
  customerAddress?: string;
  description?: string;
  notes?: string;
  shippingName?: string;
  shippingAddress?: string;
  shippingGstin?: string;
  scrapDeduction?: number;
  scrapInvoiceNumber?: string;
  returnDeduction?: number;
  returnInvoiceNumber?: string;
  pointsEarned?: number;
  previousPointsBalance?: number;
  pointsRedeemed?: number;
  pointsRedeemedDiscount?: number;
  remainingPointsBalance?: number;
  showProductOffers?: boolean;
  showPriceOverrideMrp?: boolean;
  billSettings?: BillSettings;
  isB2B?: boolean;
  a5Orientation?: 'horizontal' | 'vertical';
}

export function shouldShowItemMrpHtml(data: InvoiceData, item: InvoiceItemDisplay): boolean {
  if (item.isPriceOverride) {
    return data.showPriceOverrideMrp !== false;
  }
  return data.showProductOffers !== false;
}

export function getDocumentTitle(invoiceType?: string, _isReprint?: boolean, estimateMode?: boolean, isB2B?: boolean, nonGstBillTitle?: string): string {
  const nonGstTitle = (nonGstBillTitle === 'ESTIMATE' || (estimateMode && nonGstBillTitle !== 'BILL_OF_SUPPLY')) ? 'ESTIMATE' : 'BILL OF SUPPLY';
  let baseTitle: string;
  if (invoiceType === 'RETURN' || invoiceType === 'SALES_RETURN' || invoiceType === 'CREDIT_NOTE') {
    baseTitle = isB2B ? 'CREDIT NOTE' : 'SALES RETURN';
  } else if (isB2B) {
    baseTitle = 'TAX INVOICE';
  } else {
    switch (invoiceType) {
      case 'GST': baseTitle = 'TAX INVOICE'; break;
      case 'SCRAP': baseTitle = 'SCRAP BILL'; break;
      case 'QUOTATION': baseTitle = 'QUOTATION'; break;
      case 'BILL_OF_SUPPLY': baseTitle = nonGstTitle; break;
      case 'ESTIMATE': baseTitle = nonGstTitle; break;
      default: baseTitle = nonGstTitle; break;
    }
  }
  return baseTitle;
}

export function formatItemNameForBill(name: string, isCombo?: boolean): string {
  if (!name) return '';
  let formatted = name.replace(/\b(COMBO|Combo|combo)\b/g, '<b style="font-weight:900; letter-spacing:0.5px;">$1</b>');
  if (isCombo && !/\b(COMBO|Combo|combo)\b/i.test(name)) {
    formatted = `<b style="font-weight:900; color:#6b21a8; letter-spacing:0.5px;">[COMBO]</b> ${formatted}`;
  }
  return formatted;
}

export function renderHtmlBalanceRows(data: InvoiceData, layout: 'table' | 'div' = 'table'): string {
  const bs = data.billSettings || DEFAULT_BILL_SETTINGS;
  if (bs.showCreditBalance === false) return '';

  const pm = (data.paymentMethod || '').toUpperCase();
  const isCredit = pm === 'CREDIT' || (data.oldBalance != null && data.oldBalance !== 0) || (data.customerBalance != null) || (pm === 'SPLIT' && (data.customerBalance != null || data.oldBalance != null)) || (pm === '' && (data.customerBalance != null || data.oldBalance != null));

  let html = '';

  if (isCredit) {
    if (data.oldBalance != null && data.oldBalance !== 0) {
      const label = data.oldBalance > 0 ? 'Old Due' : 'Old Advance';
      const valStr = Math.abs(data.oldBalance).toFixed(2);
      if (layout === 'table') {
        html += `<tr><td style="padding-right: 10px; font-weight: bold;">${label}</td><td style="font-weight: bold;">:</td><td style="text-align: right; padding-left: 10px; font-weight: bold;">${getCurrencyPrefix()}${valStr}</td></tr>`;
      } else {
        html += `<div class="row"><span>${label}</span><span>${getCurrencyPrefix()}${valStr}</span></div>`;
      }
    }
    if (data.receivedAmount != null && data.receivedAmount > 0) {
      if (layout === 'table') {
        html += `<tr><td style="padding-right: 10px; font-weight: bold;">Cash Received</td><td style="font-weight: bold;">:</td><td style="text-align: right; padding-left: 10px; font-weight: bold;">${getCurrencyPrefix()}${data.receivedAmount.toFixed(getCurrencyDecimals())}</td></tr>`;
      } else {
        html += `<div class="row"><span>Cash Received</span><span>${getCurrencyPrefix()}${data.receivedAmount.toFixed(getCurrencyDecimals())}</span></div>`;
      }
    }
    const netBal = data.customerBalance ?? data.balanceAmount;
    if (netBal != null) {
      const label = netBal > 0 ? 'Balance Due' : netBal < 0 ? 'Advance Balance' : 'Balance Due';
      const valStr = Math.abs(netBal).toFixed(2);
      if (layout === 'table') {
        html += `<tr class="double-underline"><td style="padding-right: 10px; font-weight: bold;">${label}</td><td style="font-weight: bold;">:</td><td style="text-align: right; padding-left: 10px; font-weight: bold;">${getCurrencyPrefix()}${valStr}</td></tr>`;
      } else {
        html += `<div class="row" style="font-weight:bold"><span>${label}</span><span>${getCurrencyPrefix()}${valStr}</span></div>`;
      }
    }
  } else {
    if (data.receivedAmount != null && data.receivedAmount > 0) {
      if (layout === 'table') {
        html += `<tr><td style="padding-right: 10px; font-weight: bold;">Received</td><td style="font-weight: bold;">:</td><td style="text-align: right; padding-left: 10px; font-weight: bold;">${getCurrencyPrefix()}${data.receivedAmount.toFixed(getCurrencyDecimals())}</td></tr>`;
      } else {
        html += `<div class="row"><span>Received</span><span>${getCurrencyPrefix()}${data.receivedAmount.toFixed(getCurrencyDecimals())}</span></div>`;
      }
      const change = data.receivedAmount - data.grandTotal;
      if (change > 0) {
        if (layout === 'table') {
          html += `<tr class="double-underline"><td style="padding-right: 10px; font-weight: bold;">Change Return</td><td style="font-weight: bold;">:</td><td style="text-align: right; padding-left: 10px; font-weight: bold;">${getCurrencyPrefix()}${change.toFixed(getCurrencyDecimals())}</td></tr>`;
        } else {
          html += `<div class="row" style="font-weight:bold"><span>Change Return</span><span>${getCurrencyPrefix()}${change.toFixed(getCurrencyDecimals())}</span></div>`;
        }
      }
    } else if (data.balanceAmount != null && data.balanceAmount > 0 && !data.isReprint) {
      if (layout === 'table') {
        html += `<tr class="double-underline"><td style="padding-right: 10px; font-weight: bold;">Change Return</td><td style="font-weight: bold;">:</td><td style="text-align: right; padding-left: 10px; font-weight: bold;">${getCurrencyPrefix()}${data.balanceAmount.toFixed(getCurrencyDecimals())}</td></tr>`;
      } else {
        html += `<div class="row" style="font-weight:bold"><span>Change Return</span><span>${getCurrencyPrefix()}${data.balanceAmount.toFixed(getCurrencyDecimals())}</span></div>`;
      }
    }
  }

  return html;
}
