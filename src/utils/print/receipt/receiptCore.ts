import { getStoreTimezone } from '../../time/timezoneHelper';

export interface ReceiptItem {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
  qty?: number | string;
  unitPrice?: number;
  totalPrice?: number;
  originalRate?: number;
  discountLabel?: string;
  isPriceOverride?: boolean;
  brand?: string;
  billing_type?: string | null;
  pieces_sold?: number;
  pieces_override?: number;
  pieces_per_kg?: number;
  unit?: string | null;
  hsn?: string;
  hsn_code?: string;
  hsn_sac_code?: string;
  tax_rate_percent?: number;
  gst_percent?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  isCombo?: boolean;
  combo_items?: Array<{ product_id: string; quantity: number; product_name?: string }>;
}

export interface BillSettings {
  showShopName: boolean;
  showShopAddress: boolean;
  showPhone: boolean;
  showShopGstin: boolean;
  showShopState: boolean;
  showTitle: boolean;
  showBillerName?: boolean;
  showCustomerName: boolean;
  showCustomerPhone?: boolean;
  showCustomerAddress?: boolean;
  showCustomerGstin: boolean;
  showCustomerState?: boolean;
  estimateMode: boolean;
  nonGstBillTitle?: 'BILL_OF_SUPPLY' | 'ESTIMATE';
  showScrapHeading: boolean;
  showBosTaxBreakup: boolean;
  bosTaxRatePercent: number;
  bosTaxInclusive: boolean;
  printFullName?: boolean;
  showBrandName?: boolean;
  instructions?: string;
  certificationText?: string;
  electronicRefNumber?: string;
  showWeightDetails?: boolean;
  showPcsForWeightProducts?: boolean;
  showPcsUnit?: boolean;
  showCreditBalance?: boolean;
  showTransporterDetails?: boolean;
  showBarcodeOnReceipt?: boolean;
  showAuthorisedSignatory?: boolean;
  showForShopName?: boolean;
  showDescription?: boolean;
  reverseCharge?: boolean;
  itemColumnOrder?: 'qty_rate' | 'rate_qty';
  quotationGstEnabled?: boolean;
}

export const DEFAULT_BILL_SETTINGS: BillSettings = {
  showShopName: true,
  showShopAddress: true,
  showPhone: true,
  showShopGstin: true,
  showShopState: true,
  showTitle: true,
  showBillerName: true,
  showCustomerName: true,
  showCustomerPhone: true,
  showCustomerAddress: true,
  showCustomerGstin: true,
  showCustomerState: true,
  estimateMode: false,
  nonGstBillTitle: 'BILL_OF_SUPPLY',
  showScrapHeading: true,
  showBosTaxBreakup: false,
  bosTaxRatePercent: 0,
  bosTaxInclusive: false,
  printFullName: true,
  showBrandName: true,
  instructions: '',
  certificationText: 'Certified that the Particulars given above are true and correct',
  electronicRefNumber: '',
  showWeightDetails: true,
  showPcsForWeightProducts: true,
  showPcsUnit: false,
  showCreditBalance: true,
  showTransporterDetails: true,
  showBarcodeOnReceipt: true,
  showAuthorisedSignatory: true,
  showForShopName: true,
  showDescription: true,
  reverseCharge: false,
  itemColumnOrder: 'qty_rate',
  quotationGstEnabled: true,
};

export function getEffectiveBillSettings(bs?: BillSettings, isGstBill?: boolean): BillSettings {
  const base = { ...DEFAULT_BILL_SETTINGS, ...(bs || {}) };
  if (!isGstBill) return base;
  return {
    ...base,
    showShopName: true,
    showShopAddress: true,
    showPhone: true,
    showShopGstin: true,
    showShopState: true,
    showTitle: true,
    showBillerName: true,
    showCustomerName: true,
    showCustomerPhone: true,
    showCustomerAddress: true,
    showCustomerGstin: true,
    showCustomerState: true,
    showTransporterDetails: true,
    printFullName: true,
    showBrandName: true,
    showWeightDetails: true,
    showPcsForWeightProducts: true,
    showPcsUnit: true,
    showCreditBalance: true,
    showBarcodeOnReceipt: true,
    showAuthorisedSignatory: true,
    showForShopName: true,
  };
}

export function formatPrintItem(item: ReceiptItem, bs?: BillSettings, isGstBill?: boolean): {
  displayQty: string;
  displayRate: string;
  displayTotal: string;
  isWeightHidden: boolean;
  pcsInfo?: string;
} {
  const effectiveBs = getEffectiveBillSettings(bs, isGstBill);
  const showWeightDetails = effectiveBs.showWeightDetails !== false;
  const uomLower = (item.unit || '').trim().toLowerCase();
  const isWeightUnit = ['kg', 'kgs', 'g', 'gram', 'grams', 'gm', 'gms', 'ltr', 'ltrs', 'ml', 'mtr', 'mtrs'].includes(uomLower);
  const isWeightProduct = item.billing_type === 'WEIGHT' || isWeightUnit ||
                          (item.pieces_sold != null && item.pieces_sold > 0 && Number(item.quantity) !== Number(item.pieces_sold)) ||
                          (item.pieces_override != null && item.pieces_override > 0 && Number(item.quantity) !== Number(item.pieces_override));
  const isWeightHidden = !showWeightDetails && isWeightProduct;

  let qtyStr: string;
  let rateVal = item.unit_price;

  if (isWeightHidden) {
    const pcs = (item.pieces_override != null && item.pieces_override > 0)
      ? item.pieces_override
      : ((item.pieces_sold != null && item.pieces_sold > 0) ? item.pieces_sold : 1);
    if (pcs > 0) {
      rateVal = item.total / pcs;
    }
    const appendPcs = bs?.showPcsUnit !== false || bs?.showPcsForWeightProducts !== false;
    qtyStr = appendPcs ? `${pcs} PCS` : `${pcs}`;
  } else {
    const numQty = Number(item.quantity);
    const rawQtyStr = isNaN(numQty)
      ? String(item.quantity)
      : (isWeightProduct ? numQty.toFixed(3).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1') : String(numQty));

    if (bs?.showPcsUnit) {
      qtyStr = `${rawQtyStr} PCS`;
    } else {
      qtyStr = rawQtyStr;
    }
  }

  const rawPcsVal = (item.pieces_override != null && item.pieces_override > 0)
    ? item.pieces_override
    : ((item.pieces_sold != null && item.pieces_sold > 0) ? item.pieces_sold : undefined);
  const pcsInfo = (isWeightProduct && rawPcsVal != null && !isWeightHidden) ? `${rawPcsVal} Pcs` : undefined;

  return {
    displayQty: qtyStr,
    displayRate: rateVal.toFixed(2),
    displayTotal: item.total.toFixed(2),
    isWeightHidden,
    pcsInfo,
  };
}

let appTimeFormat: '12h' | '24h' = '12h';

export function setAppTimeFormat(format: '12h' | '24h') {
  appTimeFormat = format;
}

export function getAppTimeFormat(): '12h' | '24h' {
  return appTimeFormat;
}

export function parseUTCDate(dateInput: Date | string | number | null | undefined): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'number') return new Date(dateInput);

  const dateStr = String(dateInput).trim();
  if (!dateStr) return new Date();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // If string explicitly contains UTC 'Z' or offset like +04:00, let Date parse absolute instant
  if (/Z$/i.test(dateStr) || /[+-]\d{2}:?\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }

  // Standard SQL / SQLite datetime stored in UTC (e.g. "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss")
  const match = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
  if (match) {
    const [_, y, m, d, hh, mm, ss, ms] = match;
    return new Date(Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || 0),
      Number((ms || '0').substring(0, 3))
    ));
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date(dateInput as string) : d;
}

export function formatBillDateTime(date: Date | string | number): string {
  const d = parseUTCDate(date);
  if (isNaN(d.getTime())) return String(date);
  const tz = getStoreTimezone();
  
  try {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const parts = Object.fromEntries(formatter.formatToParts(d).map(p => [p.type, p.value]));
    const datePart = `${parts.day}/${parts.month}/${parts.year}`;
    const timeStr = d.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: appTimeFormat !== '24h'
    });
    return `${datePart}, ${timeStr}`;
  } catch {
    return d.toLocaleString('en-IN', { timeZone: tz });
  }
}

export interface ReceiptData {
  shopName: string;
  shopGstin?: string;
  shopState?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  shopWebsite?: string;
  upiId?: string;
  showUpiQr?: boolean;
  invoiceNumber: string;
  date: string;
  billerName?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  discount: number;
  discountType?: 'FIXED' | 'PERCENTAGE';
  discountValue?: number;
  grandTotal: number;
  receivedAmount?: number;
  balanceAmount?: number;
  oldBalance?: number;
  customerBalance?: number;
  paymentMethod?: string;
  splitDetails?: string | Record<string, number>;
  isReprint?: boolean;
  invoiceType?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerState?: string;
  customerAddress?: string;
  description?: string;
  notes?: string;
  transporterName?: string;
  vehicleNumber?: string;
  transporterDocNo?: string;
  transporterDocDate?: string;
  ewayBillNo?: string;
  ewayBillDate?: string;
  shippingName?: string;
  shippingAddress?: string;
  shippingGstin?: string;
  scrapDeduction?: number;
  scrapInvoiceNumber?: string;
  returnDeduction?: number;
  returnInvoiceNumber?: string;
  referenceInvoiceNumber?: string | null;
  refundMethod?: string;
  showProductOffers?: boolean;
  showPriceOverrideMrp?: boolean;
  billSettings?: BillSettings;
  isB2B?: boolean;
  // Loyalty points fields
  pointsEarned?: number;
  previousPointsBalance?: number;
  pointsRedeemed?: number;
  pointsRedeemedDiscount?: number;
  remainingPointsBalance?: number;
  extraBonus?: number;
  a5Orientation?: 'horizontal' | 'vertical';
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
  dueDate?: string;
  creditPeriodDays?: number;
}

export function shouldShowItemMrp(data: ReceiptData, item: ReceiptItem): boolean {
  if (item.isPriceOverride) {
    return data.showPriceOverrideMrp !== false;
  }
  return data.showProductOffers !== false;
}

/**
 * Generates a properly formatted plain-text receipt suitable for thermal printers.
 * @param data The receipt data to print.
 * @param widthCm The width of the paper in centimeters (e.g., 5.8 or 8.0).
 * @param charsPerLine Optional explicit character count per line.
 * @param style The receipt layout style.
 * @returns The formatted plain text string.
 */
export function numberToIndianWords(amount: number): string {
  if (amount === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convertBelow1000 = (n: number): string => {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const r = n % 100;
    let s = '';
    if (h > 0) s += ones[h] + ' Hundred ';
    if (r > 0) {
      if (r < 20) s += ones[r] + ' ';
      else s += tens[Math.floor(r / 10)] + ' ' + (r % 10 > 0 ? ones[r % 10] + ' ' : '');
    }
    return s.trim();
  };
  const whole = Math.floor(amount);
  const paise = Math.round((amount - whole) * 100);
  let words = '';
  if (whole > 0) {
    const crores = Math.floor(whole / 10000000);
    const lakhs = Math.floor((whole % 10000000) / 100000);
    const thousands = Math.floor((whole % 100000) / 1000);
    const remainder = whole % 1000;
    if (crores > 0) words += convertBelow1000(crores) + ' Crore ';
    if (lakhs > 0) words += convertBelow1000(lakhs) + ' Lakh ';
    if (thousands > 0) words += convertBelow1000(thousands) + ' Thousand ';
    if (remainder > 0) words += convertBelow1000(remainder) + ' ';
  }
  words = words.trim();
  if (paise > 0) words += ' and ' + convertBelow1000(paise) + ' Paise';
  return words || 'Zero';
}

export function getDocumentTitle(invoiceType?: string, _isReprint?: boolean, estimateMode?: boolean, isB2B?: boolean, nonGstBillTitle?: string): string {
  if (isB2B) return 'TAX INVOICE';
  const nonGstTitle = (nonGstBillTitle === 'ESTIMATE' || (estimateMode && nonGstBillTitle !== 'BILL_OF_SUPPLY')) ? 'ESTIMATE' : 'BILL OF SUPPLY';
  switch (invoiceType) {
    case 'GST': return 'TAX INVOICE';
    case 'SCRAP': return 'SCRAP BILL';
    case 'BILL_OF_SUPPLY': return nonGstTitle;
    case 'ESTIMATE': return nonGstTitle;
    case 'RETURN': return 'RETURN INVOICE';
    default: return isB2B ? 'TAX INVOICE' : nonGstTitle;
  }
}

export function formatBalanceLines(
  data: ReceiptData,
  labelW: number,
  totalW: number,
  padRight: (text: string, width: number) => string,
  padLeft: (text: string, width: number) => string
): string[] {
  const lines: string[] = [];
  const bs = data.billSettings || DEFAULT_BILL_SETTINGS;
  if (bs.showCreditBalance === false) return lines;

  const pm = (data.paymentMethod || '').toUpperCase();
  const isCredit = pm === 'CREDIT' || (data.oldBalance != null && data.oldBalance !== 0) || (data.customerBalance != null) || (pm === 'SPLIT' && (data.customerBalance != null || data.oldBalance != null)) || (pm === '' && (data.customerBalance != null || data.oldBalance != null));

  let rawSd: string | Record<string, number> | undefined = data.splitDetails || (data as ReceiptData & { split_details?: string | Record<string, number> }).split_details;
  if (typeof rawSd === 'string') {
    try { rawSd = JSON.parse(rawSd); } catch { /* ignore */ }
  }

  if (pm === 'SPLIT' && rawSd && typeof rawSd === 'object') {
    lines.push(padRight('--- PAY SPLIT ---', labelW + totalW + 2));
    if (Number(rawSd.cash) > 0) lines.push(`${padRight('CASH', labelW)}  ${padLeft(Number(rawSd.cash).toFixed(2), totalW)}`);
    if (Number(rawSd.upi) > 0) lines.push(`${padRight('UPI', labelW)}  ${padLeft(Number(rawSd.upi).toFixed(2), totalW)}`);
    if (Number(rawSd.card) > 0) lines.push(`${padRight('CARD', labelW)}  ${padLeft(Number(rawSd.card).toFixed(2), totalW)}`);
    if (Number(rawSd.credit) > 0) lines.push(`${padRight('CREDIT', labelW)}  ${padLeft(Number(rawSd.credit).toFixed(2), totalW)}`);
    if (Number(rawSd.bank_transfer || rawSd.bank) > 0) lines.push(`${padRight('BANK', labelW)}  ${padLeft(Number(rawSd.bank_transfer || rawSd.bank).toFixed(2), totalW)}`);
    const netBal = data.customerBalance ?? data.balanceAmount;
    if (netBal != null && Number(rawSd.credit) > 0) {
      if (netBal > 0) lines.push(`${padRight('BALANCE DUE', labelW)}  ${padLeft(netBal.toFixed(2), totalW)}`);
      else if (netBal < 0) lines.push(`${padRight('ADVANCE BAL', labelW)}  ${padLeft(Math.abs(netBal).toFixed(2), totalW)}`);
    }
    return lines;
  }

  if (isCredit) {
    if (data.oldBalance != null && data.oldBalance !== 0) {
      if (data.oldBalance > 0) {
        lines.push(`${padRight('OLD DUE', labelW)}  ${padLeft(data.oldBalance.toFixed(2), totalW)}`);
      } else {
        lines.push(`${padRight('OLD ADVANCE', labelW)}  ${padLeft(Math.abs(data.oldBalance).toFixed(2), totalW)}`);
      }
    }
    if (data.receivedAmount != null && data.receivedAmount > 0) {
      lines.push(`${padRight('CASH RCVD', labelW)}  ${padLeft(data.receivedAmount.toFixed(2), totalW)}`);
    }
    const netBal = data.customerBalance ?? data.balanceAmount;
    if (netBal != null) {
      if (netBal > 0) {
        lines.push(`${padRight('BALANCE DUE', labelW)}  ${padLeft(netBal.toFixed(2), totalW)}`);
      } else if (netBal < 0) {
        lines.push(`${padRight('ADVANCE BAL', labelW)}  ${padLeft(Math.abs(netBal).toFixed(2), totalW)}`);
      } else {
        lines.push(`${padRight('BALANCE DUE', labelW)}  ${padLeft('0.00', totalW)}`);
      }
    }
    if (data.dueDate) {
      lines.push(`${padRight('PAYMENT DUE DATE', labelW)}  ${padLeft(String(data.dueDate), totalW)}`);
    }
  } else {
    if (data.receivedAmount != null && data.receivedAmount > 0) {
      lines.push(`${padRight('RECEIVED', labelW)}  ${padLeft(data.receivedAmount.toFixed(2), totalW)}`);
      const change = data.receivedAmount - data.grandTotal;
      if (change > 0) {
        lines.push(`${padRight('CHANGE RETURN', labelW)}  ${padLeft(change.toFixed(2), totalW)}`);
      }
    } else if (data.balanceAmount != null && data.balanceAmount > 0 && !data.isReprint) {
      lines.push(`${padRight('CHANGE RETURN', labelW)}  ${padLeft(data.balanceAmount.toFixed(2), totalW)}`);
    }
  }
  return lines;
}

/** Formats a clean, dedicated Tax Breakup table for thermal printed receipts. */
export function formatTaxBreakupSection(
  data: ReceiptData,
  charsPerLine: number,
  padLeft: (text: string, width: number) => string,
  _padRight: (text: string, width: number) => string,
  centerText: (text: string, width: number) => string,
  sepChar: string = '-'
): string {
  if (!data.tax || data.tax <= 0) return '';
  const isGst = data.invoiceType === 'GST' || Boolean(data.isB2B);
  if (!isGst && data.billSettings?.showBosTaxBreakup === false) return '';

  const hasIgst = Boolean(data.igst && data.igst > 0);
  const rawTaxable = (data.subtotal > 0 && Math.abs(data.subtotal + data.tax - data.grandTotal) < 0.05)
    ? data.subtotal
    : Math.max(0, data.grandTotal - data.tax);
  const taxableVal = rawTaxable.toFixed(2);
  const totalTaxVal = data.tax.toFixed(2);
  const sep = sepChar.repeat(charsPerLine);

  let out = '';
  out += centerText('TAX BREAKUP', charsPerLine) + '\n';

  if (charsPerLine >= 40) {
    const colCount = 5;
    const w = Math.floor(charsPerLine / colCount);
    const wLast = charsPerLine - (w * (colCount - 1));
    const widths = [w, w, w, w, wLast];
    const headers = ['Taxable', 'CGST', 'SGST', 'IGST', 'Total GST'];
    const values = [
      taxableVal,
      data.cgst ? data.cgst.toFixed(2) : '0.00',
      data.sgst ? data.sgst.toFixed(2) : '0.00',
      data.igst ? data.igst.toFixed(2) : '0.00',
      totalTaxVal,
    ];
    out += headers.map((h, i) => padLeft(h, widths[i])).join('') + '\n';
    out += values.map((v, i) => padLeft(v, widths[i])).join('') + '\n';
  } else if (hasIgst) {
    const w1 = Math.floor(charsPerLine * 0.38);
    const w2 = Math.floor(charsPerLine * 0.31);
    const w3 = charsPerLine - w1 - w2;
    const widths = [w1, w2, w3];
    const headers = ['Taxable', 'IGST', 'Total GST'];
    const values = [
      taxableVal,
      data.igst ? data.igst.toFixed(2) : '0.00',
      totalTaxVal,
    ];
    out += headers.map((h, i) => padLeft(h, widths[i])).join('') + '\n';
    out += values.map((v, i) => padLeft(v, widths[i])).join('') + '\n';
  } else {
    const w = Math.floor(charsPerLine / 4);
    const wLast = charsPerLine - (w * 3);
    const widths = [w, w, w, wLast];
    const headers = ['Taxable', 'CGST', 'SGST', 'Total'];
    const values = [
      taxableVal,
      data.cgst ? data.cgst.toFixed(2) : '0.00',
      data.sgst ? data.sgst.toFixed(2) : '0.00',
      totalTaxVal,
    ];
    out += headers.map((h, i) => padLeft(h, widths[i])).join('') + '\n';
    out += values.map((v, i) => padLeft(v, widths[i])).join('') + '\n';
  }

  out += sep + '\n';
  return out;
}
