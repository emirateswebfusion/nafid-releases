import { getStoreTimezone } from './timezoneHelper';

export interface ReceiptItem {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
  originalRate?: number;
  discountLabel?: string;
  brand?: string;
  billing_type?: string;
  pieces_sold?: number;
  pieces_override?: number;
  pieces_per_kg?: number;
  unit?: string;
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
  showWeightDetails?: boolean;
  showPcsForWeightProducts?: boolean;
  showPcsUnit?: boolean;
  showCreditBalance?: boolean;
  showTransporterDetails?: boolean;
  showBarcodeOnReceipt?: boolean;
  showAuthorisedSignatory?: boolean;
  showForShopName?: boolean;
  reverseCharge?: boolean;
  itemColumnOrder?: 'qty_rate' | 'rate_qty';
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
  showWeightDetails: true,
  showPcsForWeightProducts: true,
  showPcsUnit: false,
  showCreditBalance: true,
  showTransporterDetails: true,
  showBarcodeOnReceipt: true,
  showAuthorisedSignatory: true,
  showForShopName: true,
  reverseCharge: false,
  itemColumnOrder: 'qty_rate',
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
    let pcs = (item.pieces_override != null && item.pieces_override > 0)
      ? item.pieces_override
      : ((item.pieces_sold != null && item.pieces_sold > 0) ? item.pieces_sold : 1);
    if (pcs > 0) {
      rateVal = item.total / pcs;
    }
    const appendPcs = bs?.showPcsUnit !== false || bs?.showPcsForWeightProducts !== false;
    qtyStr = appendPcs ? `${pcs} PCS` : `${pcs}`;
  } else {
    const numQty = Number(item.quantity);
    let rawQtyStr = isNaN(numQty)
      ? String(item.quantity)
      : (isWeightProduct ? numQty.toFixed(3).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1') : String(numQty));

    if (bs?.showPcsUnit) {
      qtyStr = `${rawQtyStr} PCS`;
    } else {
      qtyStr = rawQtyStr;
    }
  }

  return {
    displayQty: qtyStr,
    displayRate: rateVal.toFixed(2),
    displayTotal: item.total.toFixed(2),
    isWeightHidden,
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

  let dateStr = String(dateInput).trim();
  if (!dateStr) return new Date();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Strip trailing Z or +00:00 offset to ensure JavaScript Date parses local ISO strings as local time
  dateStr = dateStr.replace(/Z$/i, '').replace(/\+00:?00$/i, '');
  if (dateStr.includes(' ')) {
    dateStr = dateStr.replace(' ', 'T');
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date(dateInput as any) : d;
}

export function formatBillDateTime(date: Date | string | number): string {
  const d = parseUTCDate(date);
  if (isNaN(d.getTime())) return String(date);
  const tz = getStoreTimezone();
  const [dd, mm, yyyy] = d.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).split('/');
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: appTimeFormat !== '24h'
  });
  return `${dd}/${mm}/${yyyy}, ${timeStr}`;
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
  isReprint?: boolean;
  invoiceType?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerState?: string;
  customerAddress?: string;
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
  referenceInvoiceNumber?: string;
  refundMethod?: string;
  showProductOffers?: boolean;
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

function getDocumentTitle(invoiceType?: string, _isReprint?: boolean, estimateMode?: boolean, isB2B?: boolean, nonGstBillTitle?: string): string {
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
  const isCredit = pm === 'CREDIT' || (pm === 'SPLIT' && (data.customerBalance != null || data.oldBalance != null)) || (pm === '' && (data.customerBalance != null || data.oldBalance != null));

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

export type ReceiptStyle = 'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'boxed';

export function generateReceiptText(data: ReceiptData, widthCm: number = 5.8, charsPerLine?: number, style: ReceiptStyle | string = 'standard'): string {
  if (charsPerLine == null) {
    charsPerLine = widthCm >= 7.5 ? 36 : 32;
  }

  const centerText = (text: string, width: number): string => {
    if (text.length >= width) return text.substring(0, width);
    const padLeft = Math.floor((width - text.length) / 2);
    return ' '.repeat(padLeft) + text + ' '.repeat(width - text.length - padLeft);
  };

  const padRight = (text: string, width: number): string => {
    return text.length > width ? text.substring(0, width) : text.padEnd(width, ' ');
  };

  const padLeft = (text: string, width: number): string => {
    return text.length > width ? text.substring(0, width) : text.padStart(width, ' ');
  };

  // Wraps text to fit the given width, breaking on word boundaries and hard-breaking
  // very long single words. Used when printFullName is enabled.
  const wrapText = (text: string, width: number): string[] => {
    if (!text) return [''];
    if (width <= 0) return [text];
    if (text.length <= width) return [text];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let current = '';
    const flush = () => {
      if (current) { lines.push(current); current = ''; }
    };
    for (const word of words) {
      if ((current + (current ? ' ' : '') + word).length <= width) {
        current += (current ? ' ' : '') + word;
      } else {
        flush();
        if (word.length > width) {
          let chunk = word;
          while (chunk.length > width) {
            lines.push(chunk.substring(0, width));
            chunk = chunk.substring(width);
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    flush();
    return lines;
  };

  const isGstBill = data.invoiceType === 'GST' || Boolean(data.isB2B);
  const selectedBillSettings = getEffectiveBillSettings(data.billSettings, isGstBill);
  const printFullName = selectedBillSettings.printFullName !== false;
  const showBrand = selectedBillSettings.showBrandName !== false;
  const isRateQty = selectedBillSettings.itemColumnOrder === 'rate_qty';

  const appendInstructions = (t: string): string => {
    const instr = data.billSettings?.instructions;
    if (!instr) return t;
    const lines = instr.split('\n').filter(l => l.trim());
    if (lines.length === 0) return t;
    const dash = '-'.repeat(charsPerLine);
    let out = t + '\n' + dash + '\n';
    out += centerText('TERMS & CONDITIONS', charsPerLine) + '\n';
    for (const line of lines) {
      out += centerText(line.trim(), charsPerLine) + '\n';
    }
    out += dash + '\n';
    return out;
  };

  const appendLoyaltyBlock = (t: string): string => {
    const points = data.pointsEarned || data.previousPointsBalance || data.pointsRedeemed || data.remainingPointsBalance;
    if (!points) return t;
    const dash = '-'.repeat(charsPerLine);
    const lw = charsPerLine - 12 - 2;
    const tw = 12;
    let out = t + '\n';
    out += centerText('LOYALTY POINTS', charsPerLine) + '\n';
    if (data.previousPointsBalance != null && data.previousPointsBalance > 0) {
      out += `${padRight('Previous Balance', lw)}  ${padLeft(data.previousPointsBalance.toFixed(0), tw)}\n`;
    }
    if (data.pointsEarned && data.pointsEarned > 0) {
      out += `${padRight('Earned This Bill', lw)}  ${padLeft(`+${data.pointsEarned.toFixed(0)}`, tw)}\n`;
    }
    if (data.pointsRedeemed && data.pointsRedeemed > 0) {
      out += `${padRight('Redeemed', lw)}  ${padLeft(`-${data.pointsRedeemed.toFixed(0)}`, tw)}\n`;
      if (data.pointsRedeemedDiscount && data.pointsRedeemedDiscount > 0) {
        out += `${padRight('Discount Value', lw)}  ${padLeft(`-${data.pointsRedeemedDiscount.toFixed(2)}`, tw)}\n`;
      }
    }
    if (data.remainingPointsBalance != null) {
      out += `${padRight('Balance', lw)}  ${padLeft(data.remainingPointsBalance.toFixed(0), tw)}\n`;
    }
    out += dash + '\n';
    return out;
  };

  let text = '';

  // ══════════════════════════════════════════════════════════════════════════════
  //  STANDARD — Clean framed design, borders items, centered grand total
  // ══════════════════════════════════════════════════════════════════════════════
  if (style === 'standard') {
    const FRAME = '='.repeat(charsPerLine);
    const LIGHT = '-'.repeat(charsPerLine);

    // ── Header ──
    const bs = selectedBillSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = (bs?.showShopName !== false && Boolean(data.shopName)) ||
                      (bs?.showShopAddress !== false && Boolean(data.shopAddress)) ||
                      (bs?.showPhone !== false && Boolean(data.shopPhone)) ||
                      (bs?.showShopGstin !== false && Boolean(data.shopGstin)) ||
                      (bs?.showShopState !== false && Boolean(data.shopState)) ||
                      bs?.showTitle !== false || showScrapH;
    if (hasHeader) {
      text += FRAME + '\n';
      if (bs?.showShopName !== false && data.shopName) text += centerText(data.shopName, charsPerLine) + '\n';
      if (bs?.showShopAddress !== false && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone !== false && data.shopPhone) text += centerText(`Ph: ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin !== false && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showShopState !== false && data.shopState) text += centerText(`State: ${data.shopState}`, charsPerLine) + '\n';
      const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
      if (bs?.showTitle !== false || showScrap) {
        const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle);
        text += centerText(`-- ${docTitle} --`, charsPerLine) + '\n';
      }
      text += FRAME + '\n';
    }

    // ── Meta ──
    text += `  ${data.invoiceType === 'RETURN' ? 'RET No:  ' : 'INV No:  '}${data.invoiceNumber}\n`;
    text += `  Date:    ${data.date}\n`;
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += `  Ref Inv: ${data.referenceInvoiceNumber}\n`;
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += `  Refund Method: ${data.refundMethod}\n`;
    }
    if (data.billerName && bs?.showBillerName !== false) text += `  Staff:   ${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName || showCustPhone || showCustAddress || showCustGstin || showCustState) {
      text += LIGHT + '\n';
      text += centerText('CUSTOMER', charsPerLine) + '\n';
      if (showCustName) text += `  ${data.customerName}\n`;
      if (showCustPhone) text += `  Ph: ${data.customerPhone}\n`;
      if (showCustAddress) text += `  ${data.customerAddress}\n`;
      if (showCustGstin) text += `  GSTIN: ${data.customerGstin}\n`;
      if (showCustState) text += `  State: ${data.customerState}\n`;
    }
    if (data.transporterName || data.vehicleNumber || data.ewayBillNo) {
      text += `  Transport: ${[data.transporterName, data.vehicleNumber ? `Veh:${data.vehicleNumber}` : ''].filter(Boolean).join(' ')}\n`;
      if (data.ewayBillNo) text += `  E-Way Bill: ${data.ewayBillNo}\n`;
    }

    text += LIGHT + '\n';

    // ── Items (table: # | Item | Qty | Amount) ──
    // Layout: "N. " (idxW+1=3) + name + " " + qty + " " + amt = charsPerLine
    // so nameW = charsPerLine - (idxW+1) - 1 - qtyW - 1 - amtW
    const qtyW = 4;
    const amtW = 8;
    const idxW = 2;
    const nameW = charsPerLine - (idxW + 1) - 1 - qtyW - 1 - amtW;

    text += `${'# '.padEnd(idxW + 1)}${padRight('Item', nameW)} ${padLeft('Qty', qtyW)} ${padLeft('Amount', amtW)}\n`;
    text += LIGHT + '\n';

    data.items.forEach((item, i) => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const qty = fmt.displayQty;
      const total = fmt.displayTotal;
      const isComboItem = Boolean(item.isCombo || (item.combo_items && item.combo_items.length > 0));
      const baseName = item.name || '';
      const rawName = isComboItem && !/\b(COMBO|Combo|combo)\b/i.test(baseName) ? `[COMBO] ${baseName}` : baseName;
      const nameLines = printFullName ? wrapText(rawName, nameW) : [rawName.length > nameW ? rawName.substring(0, nameW - 2) + '..' : rawName];
      nameLines.forEach((name, li) => {
        if (li === 0) {
          text += `${i + 1}.${' '.repeat(Math.max(1, idxW + 1 - String(i + 1).length - 1))}${padRight(name, nameW)} ${padLeft(qty, qtyW)} ${padLeft(total, amtW)}\n`;
        } else {
          text += `${' '.repeat(idxW + 1)}${padRight(name, nameW)}${' '.repeat(1 + qtyW + 1 + amtW)}\n`;
        }
      });
      if (showBrand && item.brand) {
        const brandLine = `  Brand: ${item.brand}`;
        text += `${brandLine.substring(0, charsPerLine)}\n`;
      }
      if (item.isCombo || (item.combo_items && item.combo_items.length > 0)) {
        const comboTag = `  [COMBO OFFER]`;
        text += `${comboTag.substring(0, charsPerLine)}\n`;
        if (item.combo_items && item.combo_items.length > 0) {
          const comboInc = `  Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}`;
          text += `${comboInc.substring(0, charsPerLine)}\n`;
        }
      }
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        const mrpLine = `  MRP ₹${item.originalRate.toFixed(2)} → ₹${fmt.displayRate}`;
        const clipped = mrpLine.length > charsPerLine ? mrpLine.substring(0, charsPerLine - 3) + '..' : mrpLine;
        text += `${clipped}${item.discountLabel ? `  (${item.discountLabel})` : ''}\n`;
      } else if (data.invoiceType === 'SCRAP') {
        // Rate | Weight | Total sub-line for scrap items
        const subLine = isRateQty
          ? `  ${padLeft(fmt.displayRate, 7)} ${padLeft(qty, 5)} ${padLeft(fmt.displayTotal, 8)}`
          : `  ${padLeft(qty, 5)} ${padLeft(fmt.displayRate, 7)} ${padLeft(fmt.displayTotal, 8)}`;
        text += subLine.substring(0, charsPerLine) + '\n';
      }
    });

    text += LIGHT + '\n';

    // ── Totals ──
    const totalW = 10;
    const labelW = charsPerLine - totalW - 2;
    text += `${padRight('SUBTOTAL', labelW)}  ${padLeft(data.subtotal.toFixed(2), totalW)}\n`;
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += `${padRight('IGST', labelW)}  ${padLeft(data.igst.toFixed(2), totalW)}\n`;
      else {
        if (data.cgst && data.cgst > 0) text += `${padRight('CGST', labelW)}  ${padLeft(data.cgst.toFixed(2), totalW)}\n`;
        if (data.sgst && data.sgst > 0) text += `${padRight('SGST', labelW)}  ${padLeft(data.sgst.toFixed(2), totalW)}\n`;
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      text += `${padRight('EXTRA / BONUS', labelW)}  ${padLeft(`+${data.extraBonus.toFixed(2)}`, totalW)}\n`;
    } else if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `DISCOUNT (${data.discountValue}%)` : 'DISCOUNT';
      text += `${padRight(dLabel, labelW)}  ${padLeft(`-${data.discount.toFixed(2)}`, totalW)}\n`;
    }

    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    text += `${padRight('Grand Total', labelW)}  ${padLeft(data.grandTotal.toFixed(2), totalW)}\n`;
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Return Amount', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return Credit', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += FRAME + '\n';
    text += centerText('** GRAND TOTAL **', charsPerLine) + '\n';
    text += centerText(`₹ ${data.grandTotal.toFixed(2)}`, charsPerLine) + '\n';
    text += FRAME + '\n';

    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += centerText('** REFUND AMOUNT **', charsPerLine) + '\n';
        text += centerText(`₹ ${refundAmount.toFixed(2)}`, charsPerLine) + '\n';
        text += FRAME + '\n';
      } else {
        text += centerText('** NET PAYABLE **', charsPerLine) + '\n';
        text += centerText(`₹ ${netPayable.toFixed(2)}`, charsPerLine) + '\n';
        text += FRAME + '\n';
      }
    }

    const bLines = formatBalanceLines(data, labelW, totalW, padRight, padLeft);
    if (bLines.length > 0) {
      bLines.forEach(line => { text += line + '\n'; });
      text += LIGHT + '\n';
    }

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += centerText(`++ You Saved ₹${totalSaved.toFixed(2)} ++`, charsPerLine) + '\n';
        text += LIGHT + '\n';
      }
    }

    // ── UPI ──
    if (data.upiId) {
      text += centerText('PAY VIA UPI', charsPerLine) + '\n';
      text += centerText(data.upiId, charsPerLine) + '\n';
      if (data.showUpiQr) {
        try {
          const finalTotal = netPayable;
          const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${finalTotal.toFixed(2)}&cu=INR`;
          text += '\n[[QR:' + upiUrl + ']]\n';
        } catch {}
      }
      text += LIGHT + '\n';
    }

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += centerText('Thank you for your visit!', charsPerLine) + '\n';
    text += centerText('Have a great day!', charsPerLine) + '\n';
    text += FRAME + '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  COMPACT — Ultra dense, left-aligned, no colons, bare minimum
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'compact') {
    const DASH = '-'.repeat(charsPerLine);
    const totalW = 10;
    const labelW = charsPerLine - totalW - 2;

    // ── Header ──
    const bs = selectedBillSettings;
    if (bs?.showShopName !== false && data.shopName) text += `${data.shopName}\n`;
    if (bs?.showShopAddress !== false && data.shopAddress) text += `${data.shopAddress}\n`;
    if (bs?.showPhone !== false && data.shopPhone) text += `${data.shopPhone}\n`;
    if (bs?.showShopGstin !== false && data.shopGstin) text += `GST: ${data.shopGstin}\n`;
    if (bs?.showShopState !== false && data.shopState) text += `${data.shopState}\n`;
    if (bs?.showTitle !== false || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle)} --`, charsPerLine) + '\n';
    text += DASH + '\n';
    text += `${data.invoiceType === 'RETURN' ? 'RET No' : 'INV No'}: ${data.invoiceNumber}  ${data.date}\n`;
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += `Ref Inv: ${data.referenceInvoiceNumber}\n`;
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += `Refund Method: ${data.refundMethod}\n`;
    }
    if (data.billerName && bs?.showBillerName !== false) text += `${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName || showCustPhone || showCustAddress || showCustGstin || showCustState) {
      if (showCustName) text += `${data.customerName}`;
      if (showCustPhone) text += `  ${data.customerPhone}`;
      if (showCustName || showCustPhone) text += '\n';
      if (showCustAddress) text += `${data.customerAddress}\n`;
      if (showCustGstin) text += `GST: ${data.customerGstin}\n`;
      if (showCustState) text += `State: ${data.customerState}\n`;
    }

    text += DASH + '\n';

    // ── Items (name + total right-aligned, qty inline) ──
    data.items.forEach(item => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const total = fmt.displayTotal;
      const rawName = item.name || '';
      const nameLines = printFullName ? wrapText(rawName, charsPerLine - total.length - 2) : [rawName.length > charsPerLine - 14 ? rawName.substring(0, charsPerLine - 17) + '..' : rawName];
      nameLines.forEach((name, li) => {
        if (li === 0) {
          text += `${name}${' '.repeat(Math.max(1, charsPerLine - name.length - total.length))}${total}\n`;
        } else {
          text += `${name}\n`;
        }
      });
      if (showBrand && item.brand) text += ` ${item.brand}\n`;
      const qtyRateText = isRateQty ? `${fmt.displayRate}x${fmt.displayQty}` : `${fmt.displayQty}x${fmt.displayRate}`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += ` MRP ${item.originalRate.toFixed(2)}@${fmt.displayRate}`;
        if (item.discountLabel) text += ` (${item.discountLabel})`;
        text += ` ${qtyRateText}\n`;
      } else {
        text += ` ${qtyRateText}\n`;
        if (data.showProductOffers !== false && item.discountLabel) text += `  ${item.discountLabel}\n`;
      }
    });

    text += DASH + '\n';

    // ── Totals ──
    text += `${padRight('Subtotal', labelW)}  ${padLeft(data.subtotal.toFixed(2), totalW)}\n`;
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += `${padRight('IGST', labelW)}  ${padLeft(data.igst.toFixed(2), totalW)}\n`;
      else {
        if (data.cgst && data.cgst > 0) text += `${padRight('CGST', labelW)}  ${padLeft(data.cgst.toFixed(2), totalW)}\n`;
        if (data.sgst && data.sgst > 0) text += `${padRight('SGST', labelW)}  ${padLeft(data.sgst.toFixed(2), totalW)}\n`;
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      text += `${padRight('Extra / Bonus', labelW)}  ${padLeft(`+${data.extraBonus.toFixed(2)}`, totalW)}\n`;
    } else if (data.discount > 0) text += `${padRight('Discount', labelW)}  ${padLeft(`-${data.discount.toFixed(2)}`, totalW)}\n`;

    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    text += `${padRight('Grand Total', labelW)}  ${padLeft(data.grandTotal.toFixed(2), totalW)}\n`;
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Return Amount', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return Credit', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += DASH + '\n';
    text += `${padRight('** GRAND TOTAL **', labelW)}  ${padLeft(data.grandTotal.toFixed(2), totalW)}\n`;
    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += `${padRight('** REFUND AMOUNT **', labelW)}  ${padLeft(refundAmount.toFixed(2), totalW)}\n`;
      } else {
        text += `${padRight('** NET PAYABLE **', labelW)}  ${padLeft(netPayable.toFixed(2), totalW)}\n`;
      }
    }

    const bLines = formatBalanceLines(data, labelW, totalW, padRight, padLeft);
    if (bLines.length > 0) {
      bLines.forEach(line => { text += line + '\n'; });
    }

    text += DASH + '\n';

    // ── Loyalty Points ──
    text = appendLoyaltyBlock(text);

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings: number = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += ` ** SAVED ₹${totalSaved.toFixed(2)} **\n`;
        text += DASH + '\n';
      }
    }

    // ── UPI ──
    if (data.upiId) {
      text += `UPI: ${data.upiId}\n`;
      text += DASH + '\n';
    }

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += centerText('THANK YOU', charsPerLine) + '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  MODERN — Chic with ✦ stars, ▸ bullets, [brackets], >> arrows
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'modern') {
    const THICK = '='.repeat(charsPerLine);
    const THIN = '-'.repeat(charsPerLine);
    const totalW = 10;
    const labelW = charsPerLine - totalW - 2;

    // ── Header ──
    const bs = selectedBillSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = (bs?.showShopName !== false && Boolean(data.shopName)) ||
                      (bs?.showShopAddress !== false && Boolean(data.shopAddress)) ||
                      (bs?.showPhone !== false && Boolean(data.shopPhone)) ||
                      (bs?.showShopGstin !== false && Boolean(data.shopGstin)) ||
                      (bs?.showShopState !== false && Boolean(data.shopState)) ||
                      bs?.showTitle !== false || showScrapH;
    if (hasHeader) {
      if (bs?.showShopName !== false && data.shopName) text += centerText(`✦ ${data.shopName} ✦`, charsPerLine) + '\n';
      if (bs?.showShopAddress !== false && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone !== false && data.shopPhone) text += centerText(`📞 ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin !== false && data.shopGstin) text += centerText(`GST: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showShopState !== false && data.shopState) text += centerText(`State: ${data.shopState}`, charsPerLine) + '\n';
      const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
      if (bs?.showTitle !== false || showScrap) {
        const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle);
        text += centerText(`[ ${docTitle} ]`, charsPerLine) + '\n';
      }
      text += THICK + '\n';
    }
    text += `  ${data.invoiceType === 'RETURN' ? 'RET' : 'INV'}:  ${data.invoiceNumber}\n`;
    text += `  Date: ${data.date}\n`;
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += `  Ref:  ${data.referenceInvoiceNumber}\n`;
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += `  Refund Method: ${data.refundMethod}\n`;
    }
    if (data.billerName && bs?.showBillerName !== false) text += `  Staff: ${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName || showCustPhone || showCustAddress || showCustGstin || showCustState) {
      text += THIN + '\n';
      text += centerText('[ CUSTOMER ]', charsPerLine) + '\n';
      if (showCustName) text += `  ${data.customerName}\n`;
      if (showCustPhone) text += `  Ph: ${data.customerPhone}\n`;
      if (showCustAddress) text += `  ${data.customerAddress}\n`;
      if (showCustGstin) text += `  GSTIN: ${data.customerGstin}\n`;
      if (showCustState) text += `  State: ${data.customerState}\n`;
    }

    text += THIN + '\n';
    text += centerText('[ ITEMS ]', charsPerLine) + '\n';

    // ── Items (▸ bullets, qty+rate on separate line) ──
    data.items.forEach(item => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const total = fmt.displayTotal;
      const rawName = item.name || '';
      const nameLines = printFullName ? wrapText(rawName, charsPerLine - total.length - 4) : [rawName.length > charsPerLine - 12 ? rawName.substring(0, charsPerLine - 15) + '..' : rawName];
      nameLines.forEach((name, li) => {
        if (li === 0) {
          text += `▸ ${name}${' '.repeat(Math.max(1, charsPerLine - 2 - name.length - total.length))}${total}\n`;
        } else {
          text += `  ${name}\n`;
        }
      });
      if (showBrand && item.brand) text += `  Brand: ${item.brand}\n`;
      const qtyRateText = isRateQty ? `${fmt.displayRate} x ${fmt.displayQty}` : `${fmt.displayQty} x ${fmt.displayRate}`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `  MRP ₹${item.originalRate.toFixed(2)} → ₹${fmt.displayRate}`;
        text += item.discountLabel ? ` (~ ${item.discountLabel})\n` : '\n';
        text += `  ${qtyRateText}\n`;
      } else {
        text += `  ${qtyRateText}\n`;
        if (data.showProductOffers !== false && item.discountLabel) text += `  ~ ${item.discountLabel}\n`;
      }
    });

    text += THIN + '\n';

    // ── Totals ──
    text += `${padRight('SUBTOTAL', labelW)}  ${padLeft(data.subtotal.toFixed(2), totalW)}\n`;
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += `${padRight('IGST', labelW)}  ${padLeft(data.igst.toFixed(2), totalW)}\n`;
      else {
        if (data.cgst && data.cgst > 0) text += `${padRight('CGST', labelW)}  ${padLeft(data.cgst.toFixed(2), totalW)}\n`;
        if (data.sgst && data.sgst > 0) text += `${padRight('SGST', labelW)}  ${padLeft(data.sgst.toFixed(2), totalW)}\n`;
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      text += `${padRight('EXTRA / BONUS', labelW)}  ${padLeft(`+${data.extraBonus.toFixed(2)}`, totalW)}\n`;
    } else if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `DISCOUNT (${data.discountValue}%)` : 'DISCOUNT';
      text += `${padRight(dLabel, labelW)}  ${padLeft(`-${data.discount.toFixed(2)}`, totalW)}\n`;
    }

    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    text += `${padRight('Grand Total', labelW)}  ${padLeft(data.grandTotal.toFixed(2), totalW)}\n`;
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Return Amount', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return Credit', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += THIN + '\n';
    text += centerText('>> ** GRAND TOTAL ** <<', charsPerLine) + '\n';
    text += centerText(`₹ ${data.grandTotal.toFixed(2)}`, charsPerLine) + '\n';
    text += THIN + '\n';

    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += centerText('>> ** REFUND AMOUNT ** <<', charsPerLine) + '\n';
        text += centerText(`₹ ${refundAmount.toFixed(2)}`, charsPerLine) + '\n';
        text += THIN + '\n';
      } else {
        text += centerText('>> ** NET PAYABLE ** <<', charsPerLine) + '\n';
        text += centerText(`₹ ${netPayable.toFixed(2)}`, charsPerLine) + '\n';
        text += THIN + '\n';
      }
    }

    const bLines = formatBalanceLines(data, labelW, totalW, padRight, padLeft);
    if (bLines.length > 0) {
      bLines.forEach(line => { text += line + '\n'; });
      text += THIN + '\n';
    }

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += centerText(`✦ Saved ${totalSaved.toFixed(2)} ✦`, charsPerLine) + '\n';
        text += THIN + '\n';
      }
    }

    // ── UPI ──
    if (data.upiId) {
      text += centerText('[ PAYMENT ]', charsPerLine) + '\n';
      text += centerText(data.upiId, charsPerLine) + '\n';
      if (data.showUpiQr) {
        try {
          const finalTotal = netPayable;
          const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${finalTotal.toFixed(2)}&cu=INR`;
          text += '\n[[QR:' + upiUrl + ']]\n';
        } catch {}
      }
      text += THIN + '\n';
    }

    // ── Loyalty Points ──
    text = appendLoyaltyBlock(text);

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += centerText('✦ Thank You! ✦', charsPerLine) + '\n';
    text += centerText('Visit Again', charsPerLine) + '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  CLEAN — Follows lines, table with RATE col, Amount in Words, traditional invoice
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'clean') {
    const DASH = '-'.repeat(charsPerLine);
    const totalW = 10;
    const labelW = charsPerLine - totalW - 2;

    // ── Header ──
    const bs = selectedBillSettings;
    if (bs?.showShopName !== false && data.shopName) { text += '\n'; text += centerText(data.shopName, charsPerLine) + '\n'; }
    if (bs?.showShopAddress !== false && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
    if (bs?.showPhone !== false && data.shopPhone) text += centerText(`Ph: ${data.shopPhone}`, charsPerLine) + '\n';
    if (bs?.showShopGstin !== false && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
    if (bs?.showTitle !== false || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle)} --`, charsPerLine) + '\n';
    if ((bs?.showShopName !== false && data.shopName) || (bs?.showShopAddress !== false && data.shopAddress) || (bs?.showPhone !== false && data.shopPhone) || (bs?.showShopGstin !== false && data.shopGstin) || bs?.showTitle !== false || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += '\n';

    text += `Date: ${data.date}\n`;
    text += `${data.invoiceType === 'RETURN' ? 'Return No' : 'Receipt No'}: ${data.invoiceNumber}\n`;
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += `Ref Invoice: ${data.referenceInvoiceNumber}\n`;
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += `Refund Method: ${data.refundMethod}\n`;
    }
    if (data.billerName && bs?.showBillerName !== false) text += `Staff: ${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName || showCustPhone || showCustAddress || showCustGstin || showCustState) {
      if (showCustName) text += `${data.customerName}\n`;
      if (showCustPhone) text += `Ph: ${data.customerPhone}\n`;
      if (showCustAddress) text += `${data.customerAddress}\n`;
      if (showCustGstin) text += `GSTIN: ${data.customerGstin}\n`;
      if (showCustState) text += `State: ${data.customerState}\n`;
    }
    text += '\n';

    // ── Items table: No | ITEM | QTY | RATE | AMOUNT ──
    const colGap = 1;
    const idxW = 2;
    const qtyW = 5;
    const rateW = 7;
    const amtW = 8;
    let nameW = charsPerLine - idxW - colGap - qtyW - colGap - rateW - colGap - amtW;
    if (nameW < 6) {
      nameW = charsPerLine - qtyW - colGap - rateW - colGap - amtW;
      text += isRateQty
        ? `${padRight('ITEM', nameW)} ${padLeft('RATE', rateW)} ${padLeft('QTY', qtyW)} ${padLeft('AMOUNT', amtW)}\n`
        : `${padRight('ITEM', nameW)} ${padLeft('QTY', qtyW)} ${padLeft('RATE', rateW)} ${padLeft('AMOUNT', amtW)}\n`;
      data.items.forEach((item) => {
        const fmt = formatPrintItem(item, selectedBillSettings);
        const qty = fmt.displayQty;
        const rate = fmt.displayRate;
        const amt = fmt.displayTotal;
        const rawName = item.name || '';
        const nameLines = printFullName ? wrapText(rawName, nameW) : [rawName.length > nameW ? rawName.substring(0, nameW - 2) + '..' : rawName];
        nameLines.forEach((name, li) => {
          if (li === 0) {
            text += isRateQty
              ? `${padRight(name, nameW)} ${padLeft(rate, rateW)} ${padLeft(qty, qtyW)} ${padLeft(amt, amtW)}\n`
              : `${padRight(name, nameW)} ${padLeft(qty, qtyW)} ${padLeft(rate, rateW)} ${padLeft(amt, amtW)}\n`;
          } else {
            text += `${padRight(name, nameW)}${' '.repeat(colGap + qtyW + colGap + rateW + colGap + amtW)}\n`;
          }
        });
        if (showBrand && item.brand) text += `  Brand: ${item.brand}\n`;
        if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
          text += `  MRP ${item.originalRate.toFixed(2)} @ ${fmt.displayRate}${item.discountLabel ? `  (${item.discountLabel})` : ''}\n`;
        }
      });
    } else {
      text += isRateQty
        ? `${padRight('No', idxW)} ${padRight('ITEM', nameW)} ${padLeft('RATE', rateW)} ${padLeft('QTY', qtyW)} ${padLeft('AMOUNT', amtW)}\n`
        : `${padRight('No', idxW)} ${padRight('ITEM', nameW)} ${padLeft('QTY', qtyW)} ${padLeft('RATE', rateW)} ${padLeft('AMOUNT', amtW)}\n`;
      data.items.forEach((item, i) => {
        const fmt = formatPrintItem(item, selectedBillSettings);
        const qty = fmt.displayQty;
        const rate = fmt.displayRate;
        const amt = fmt.displayTotal;
        const rawName = item.name || '';
        const nameLines = printFullName ? wrapText(rawName, nameW) : [rawName.length > nameW ? rawName.substring(0, nameW - 2) + '..' : rawName];
        nameLines.forEach((name, li) => {
          if (li === 0) {
            text += isRateQty
              ? `${padRight(String(i + 1), idxW)} ${padRight(name, nameW)} ${padLeft(rate, rateW)} ${padLeft(qty, qtyW)} ${padLeft(amt, amtW)}\n`
              : `${padRight(String(i + 1), idxW)} ${padRight(name, nameW)} ${padLeft(qty, qtyW)} ${padLeft(rate, rateW)} ${padLeft(amt, amtW)}\n`;
          } else {
            text += `${' '.repeat(idxW + colGap)}${padRight(name, nameW)}${' '.repeat(colGap + qtyW + colGap + rateW + colGap + amtW)}\n`;
          }
        });
        if (showBrand && item.brand) text += `  Brand: ${item.brand}\n`;
        if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
          text += `  MRP ${item.originalRate.toFixed(2)} @ ${fmt.displayRate}${item.discountLabel ? `  (${item.discountLabel})` : ''}\n`;
        }
      });
    }
    text += '\n';

    // ── Totals ──
    text += `${padRight('SUB TOTAL :', labelW)}  ${padLeft(`₹${data.subtotal.toFixed(2)}`, totalW)}\n`;
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += `${padRight('IGST :', labelW)}  ${padLeft(`₹${data.igst.toFixed(2)}`, totalW)}\n`;
      else {
        if (data.cgst && data.cgst > 0) text += `${padRight('CGST :', labelW)}  ${padLeft(`₹${data.cgst.toFixed(2)}`, totalW)}\n`;
        if (data.sgst && data.sgst > 0) text += `${padRight('SGST :', labelW)}  ${padLeft(`₹${data.sgst.toFixed(2)}`, totalW)}\n`;
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      text += `${padRight('EXTRA / BONUS :', labelW)}  ${padLeft(`₹+${data.extraBonus.toFixed(2)}`, totalW)}\n`;
    } else if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `DISCOUNT (${data.discountValue}%) :` : 'DISCOUNT :';
      text += `${padRight(dLabel, labelW)}  ${padLeft(`₹-${data.discount.toFixed(2)}`, totalW)}\n`;
    }

    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    text += `${padRight('Grand Total :', labelW)}  ${padLeft(`₹${data.grandTotal.toFixed(2)}`, totalW)}\n`;
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Return Amount :', labelW)}  ${padLeft(`₹-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return Credit :', labelW)}  ${padLeft(`₹-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += DASH + '\n';
    text += `${padRight('** GRAND TOTAL **', labelW)}  ${padLeft(`₹${data.grandTotal.toFixed(2)}`, totalW)}\n`;
    text += DASH + '\n';

    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += `${padRight('** REFUND AMOUNT **', labelW)}  ${padLeft(`₹${refundAmount.toFixed(2)}`, totalW)}\n`;
        text += DASH + '\n';
        text += `Amount In Words: \n${numberToIndianWords(refundAmount)} Only.\n`;
      } else {
        text += `${padRight('** NET PAYABLE **', labelW)}  ${padLeft(`₹${netPayable.toFixed(2)}`, totalW)}\n`;
        text += DASH + '\n';
        text += `Amount In Words: \n${numberToIndianWords(netPayable)} Only.\n`;
      }
    } else {
      text += `Amount In Words: \n${numberToIndianWords(data.grandTotal)} Only.\n`;
    }
    text += '\n';

    // ── Payment ──
    const bLines = formatBalanceLines(data, labelW, totalW, padRight, padLeft);
    if (bLines.length > 0) {
      bLines.forEach(line => { text += line + '\n'; });
    }
    text += '\n';

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += centerText(`YOU SAVED ₹${totalSaved.toFixed(2)}`, charsPerLine) + '\n';
        text += '\n';
      }
    }

    // ── UPI ──
    if (data.upiId) {
      text += centerText('PAYMENT VIA UPI', charsPerLine) + '\n';
      text += centerText(data.upiId, charsPerLine) + '\n';
      if (data.showUpiQr) {
        try {
          const finalTotal = netPayable;
          const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${finalTotal.toFixed(2)}&cu=INR`;
          text += '\n[[QR:' + upiUrl + ']]\n';
        } catch {}
      }
    }

    // ── Loyalty Points ──
    text = appendLoyaltyBlock(text);

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += centerText('Thank You, Visit Again!', charsPerLine) + '\n';
    text += '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  CLASSIC — Ornate vintage, *** banners, verbose labels, numbered items
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'classic') {
    const FRAME = '='.repeat(charsPerLine);
    const LIGHT = '-'.repeat(charsPerLine);
    const totalW = 10;
    const labelW = charsPerLine - totalW - 2;

    // ── Header (ornate banner with ***) ──
    const bs = selectedBillSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = (bs?.showShopName !== false && Boolean(data.shopName)) ||
                      (bs?.showShopAddress !== false && Boolean(data.shopAddress)) ||
                      (bs?.showPhone !== false && Boolean(data.shopPhone)) ||
                      (bs?.showShopGstin !== false && Boolean(data.shopGstin)) ||
                      (bs?.showShopState !== false && Boolean(data.shopState)) ||
                      bs?.showTitle !== false || showScrapH;
    if (hasHeader) {
      text += FRAME + '\n';
      if (bs?.showShopName !== false && data.shopName) text += centerText(`*** ${data.shopName} ***`, charsPerLine) + '\n';
      if (bs?.showShopAddress !== false && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone !== false && data.shopPhone) text += centerText(`Phone: ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin !== false && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showShopState !== false && data.shopState) text += centerText(`State Code: ${data.shopState}`, charsPerLine) + '\n';
      const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
      if (bs?.showTitle !== false || showScrap) {
        const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle);
        text += centerText(`--- ${docTitle} ---`, charsPerLine) + '\n';
      }
      text += FRAME + '\n';
    }

    // ── Meta ──
    text += `  ${data.invoiceType === 'RETURN' ? 'Return No:  ' : 'Invoice No:  '}${data.invoiceNumber}\n`;
    text += `  Date:        ${data.date}\n`;
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += `  Ref Invoice: ${data.referenceInvoiceNumber}\n`;
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += `  Refund Method: ${data.refundMethod}\n`;
    }
    if (data.billerName && bs?.showBillerName !== false) text += `  Biller:      ${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName || showCustPhone || showCustAddress || showCustGstin || showCustState) {
      text += LIGHT + '\n';
      text += centerText('CUSTOMER DETAILS', charsPerLine) + '\n';
      if (showCustName) text += `  Name:    ${data.customerName}\n`;
      if (showCustPhone) text += `  Phone:   ${data.customerPhone}\n`;
      if (showCustAddress) text += `  Address: ${data.customerAddress}\n`;
      if (showCustGstin) text += `  GSTIN:   ${data.customerGstin}\n`;
      if (showCustState) text += `  State:   ${data.customerState}\n`;
    }

    text += LIGHT + '\n';

    // ── Items (numbered: "1. Name             ₹XXX") ──
    data.items.forEach((item, i) => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const total = fmt.displayTotal;
      const prefix = `${i + 1}. `;
      const rawName = item.name || '';
      const nameLines = printFullName ? wrapText(rawName, charsPerLine - prefix.length - total.length - 1) : [rawName.length > charsPerLine - 14 ? rawName.substring(0, charsPerLine - 17) + '..' : rawName];
      nameLines.forEach((name, li) => {
        if (li === 0) {
          text += `${prefix}${name}${' '.repeat(Math.max(1, charsPerLine - prefix.length - name.length - total.length))}${total}\n`;
        } else {
          text += `${' '.repeat(prefix.length)}${name}\n`;
        }
      });
      if (showBrand && item.brand) text += `     Brand: ${item.brand}\n`;
      const qtyRateText = isRateQty ? `${fmt.displayRate} x ${fmt.displayQty}` : `${fmt.displayQty} x ${fmt.displayRate}`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `     MRP ₹${item.originalRate.toFixed(2)} → ₹${fmt.displayRate}`;
        text += item.discountLabel ? `  [${item.discountLabel}]\n` : '\n';
        text += `     ${qtyRateText}\n`;
      } else {
        text += `     ${qtyRateText}\n`;
        if (data.showProductOffers !== false && item.discountLabel) text += `     [${item.discountLabel}]\n`;
      }
    });

    text += LIGHT + '\n';

    // ── Totals (verbose labels with colons) ──
    text += `${padRight('Subtotal:', labelW)}  ${padLeft(data.subtotal.toFixed(2), totalW)}\n`;
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += `${padRight('IGST:', labelW)}  ${padLeft(data.igst.toFixed(2), totalW)}\n`;
      else {
        if (data.cgst && data.cgst > 0) text += `${padRight('CGST @2.5%:', labelW)}  ${padLeft(data.cgst.toFixed(2), totalW)}\n`;
        if (data.sgst && data.sgst > 0) text += `${padRight('SGST @2.5%:', labelW)}  ${padLeft(data.sgst.toFixed(2), totalW)}\n`;
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      text += `${padRight('Extra / Bonus:', labelW)}  ${padLeft(`+${data.extraBonus.toFixed(2)}`, totalW)}\n`;
    } else if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `Discount (${data.discountValue}%):` : 'Discount:';
      text += `${padRight(dLabel, labelW)}  ${padLeft(`-${data.discount.toFixed(2)}`, totalW)}\n`;
    }

    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    text += `${padRight('Grand Total:', labelW)}  ${padLeft(data.grandTotal.toFixed(2), totalW)}\n`;
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Return Amount:', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return Credit:', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`
    }

    text += '\n';
    text += FRAME + '\n';
    text += centerText('***** GRAND TOTAL *****', charsPerLine) + '\n';
    text += centerText(`₹ ${data.grandTotal.toFixed(2)}`, charsPerLine) + '\n';
    text += FRAME + '\n';

    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += centerText('***** REFUND AMOUNT *****', charsPerLine) + '\n';
        text += centerText(`₹ ${refundAmount.toFixed(2)}`, charsPerLine) + '\n';
        text += FRAME + '\n';
      } else {
        text += centerText('***** NET PAYABLE *****', charsPerLine) + '\n';
        text += centerText(`₹ ${netPayable.toFixed(2)}`, charsPerLine) + '\n';
        text += FRAME + '\n';
      }
    }

    const bLines = formatBalanceLines(data, labelW, totalW, padRight, padLeft);
    if (bLines.length > 0) {
      bLines.forEach(line => { text += line + '\n'; });
      text += LIGHT + '\n';
    }

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += centerText(`*** YOU SAVED ₹${totalSaved.toFixed(2)} ***`, charsPerLine) + '\n';
        text += LIGHT + '\n';
      }
    }

    // ── UPI ──
    if (data.upiId) {
      text += centerText('PAYMENT VIA UPI', charsPerLine) + '\n';
      text += centerText(data.upiId, charsPerLine) + '\n';
      if (data.showUpiQr) {
        try {
          const finalTotal = netPayable;
          const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${finalTotal.toFixed(2)}&cu=INR`;
          text += '\n[[QR:' + upiUrl + ']]\n';
        } catch {}
      }
      text += LIGHT + '\n';
    }

    // ── Loyalty Points ──
    text = appendLoyaltyBlock(text);

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += centerText('* Thank you, visit again! *', charsPerLine) + '\n';
    text += FRAME + '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  DOT — Dot-leader retail style (item ... price)
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'dot') {
    const DASH = '-'.repeat(charsPerLine);
    const totalW = 10;

    // ── Header centered ──
    const bs = selectedBillSettings;
    const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
    const hasHeader = (bs?.showShopName !== false && Boolean(data.shopName)) ||
                      (bs?.showShopAddress !== false && Boolean(data.shopAddress)) ||
                      (bs?.showPhone !== false && Boolean(data.shopPhone)) ||
                      (bs?.showShopGstin !== false && Boolean(data.shopGstin)) ||
                      bs?.showTitle !== false || showScrap;
    if (hasHeader) {
      if (bs?.showShopName !== false && data.shopName) text += centerText(data.shopName, charsPerLine) + '\n';
      if (bs?.showShopAddress !== false && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone !== false && data.shopPhone) text += centerText(data.shopPhone, charsPerLine) + '\n';
      if (bs?.showShopGstin !== false && data.shopGstin) text += centerText(`GST: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showTitle !== false || showScrap) {
        const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle);
        text += centerText(docTitle, charsPerLine) + '\n';
      }
      text += '\n';
    }
    text += `${data.invoiceNumber}     ${data.date}\n`;
    if (data.billerName && bs?.showBillerName !== false) text += `Staff: ${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName || showCustPhone || showCustAddress || showCustGstin || showCustState) {
      if (showCustName && showCustPhone) text += `${data.customerName}  ${data.customerPhone}\n`;
      else if (showCustName) text += `${data.customerName}\n`;
      else if (showCustPhone) text += `${data.customerPhone}\n`;
      if (showCustAddress) text += `${data.customerAddress}\n`;
      if (showCustGstin) text += `GST: ${data.customerGstin}\n`;
      if (showCustState) text += `State: ${data.customerState}\n`;
    }

    // ── Items (dot leaders between name and total) ──
    const dot = (left: string, right: string, width: number): string => {
      const avail = width - left.length - right.length;
      if (avail <= 1) return left.substring(0, width - right.length - 1) + ' ' + right;
      return left + ' ' + '.'.repeat(avail - 1) + ' ' + right;
    };

    data.items.forEach(item => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const total = fmt.displayTotal;
      const rawName = item.name || '';
      const nameLines = printFullName ? wrapText(rawName, charsPerLine - totalW - 4) : [rawName.length > charsPerLine - totalW - 4 ? rawName.substring(0, charsPerLine - totalW - 7) + '..' : rawName];
      nameLines.forEach((name, li) => {
        if (li === 0) {
          text += `${dot(name, total, charsPerLine)}\n`;
        } else {
          text += `  ${name}\n`;
        }
      });
      if (showBrand && item.brand) text += `  Brand: ${item.brand}\n`;
      const qtyRateText = isRateQty ? `${fmt.displayRate}x${fmt.displayQty}` : `${fmt.displayQty}x${fmt.displayRate}`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `  MRP ${item.originalRate.toFixed(2)} @ ${fmt.displayRate}${item.discountLabel ? ` (${item.discountLabel})` : ''}\n`;
        text += `  ${qtyRateText}\n`;
      } else {
        text += `  ${qtyRateText}\n`;
        if (data.showProductOffers !== false && item.discountLabel) text += `  ${item.discountLabel}\n`;
      }
    });
    text += DASH + '\n';

    // ── Totals ──
    const dotLine = (label: string, value: string) => text += `${dot(label, value, charsPerLine)}\n`;
    dotLine('SUBTOTAL', data.subtotal.toFixed(2));
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) dotLine('IGST', data.igst.toFixed(2));
      else {
        if (data.cgst && data.cgst > 0) dotLine('CGST', data.cgst.toFixed(2));
        if (data.sgst && data.sgst > 0) dotLine('SGST', data.sgst.toFixed(2));
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      dotLine('EXTRA / BONUS', `+${data.extraBonus.toFixed(2)}`);
    } else if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `DISCOUNT (${data.discountValue}%)` : 'DISCOUNT';
      dotLine(dLabel, `-${data.discount.toFixed(2)}`);
    }
    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    dotLine('Grand Total', data.grandTotal.toFixed(2));
    if (data.scrapDeduction && data.scrapDeduction > 0) dotLine('Scrap Return Amount', `-${data.scrapDeduction.toFixed(2)}`);
    if (data.returnDeduction && data.returnDeduction > 0) dotLine('Return Credit', `-${data.returnDeduction.toFixed(2)}`);
    text += '\n';
    text += DASH + '\n';
    text += centerText('** GRAND TOTAL **', charsPerLine) + '\n';
    text += centerText(`₹ ${data.grandTotal.toFixed(2)}`, charsPerLine) + '\n';
    text += DASH + '\n';

    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += centerText('** REFUND AMOUNT **', charsPerLine) + '\n';
        text += centerText(`₹ ${refundAmount.toFixed(2)}`, charsPerLine) + '\n';
        text += DASH + '\n';
      } else {
        text += centerText('** NET PAYABLE **', charsPerLine) + '\n';
        text += centerText(`₹ ${netPayable.toFixed(2)}`, charsPerLine) + '\n';
        text += DASH + '\n';
      }
    }

    // ── Payment ──
    const bLines = formatBalanceLines(data, charsPerLine - 12, 10, (s) => s.trim(), (s) => s.trim());
    if (bLines.length > 0) {
      bLines.forEach(line => {
        const parts = line.split(/\s{2,}/);
        if (parts.length >= 2) {
          dotLine(parts[0], parts[1]);
        }
      });
      text += DASH + '\n';
    }

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += centerText(`YOU SAVED ₹${totalSaved.toFixed(2)}`, charsPerLine) + '\n';
        text += DASH + '\n';
      }
    }

    // ── UPI ──
    if (data.upiId) {
      text += `UPI: ${data.upiId}\n`;
      text += DASH + '\n';
    }

    // ── Loyalty Points ──
    text = appendLoyaltyBlock(text);

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += centerText('Thank you, visit again!', charsPerLine) + '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  SLIM — Ultra minimal, no lines, bare essentials
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'slim') {
    const totalW = 10;
    const labelW = charsPerLine - totalW - 2;

    // ── Header ──
    const bs = selectedBillSettings;
    if (bs?.showShopName !== false && data.shopName) text += `${data.shopName}\n`;
    if (bs?.showShopAddress !== false && data.shopAddress) text += `${data.shopAddress}\n`;
    if (bs?.showPhone !== false && data.shopPhone) text += `${data.shopPhone}\n`;
    if (bs?.showShopGstin !== false && data.shopGstin) text += `GST: ${data.shopGstin}\n`;
    if (bs?.showTitle !== false || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle)} --`, charsPerLine) + '\n';
    text += `\n${data.invoiceNumber}  ${data.date}\n`;
    if (data.billerName && bs?.showBillerName !== false) text += `${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName) text += `${data.customerName}\n`;
    if (showCustPhone) text += `Ph: ${data.customerPhone}\n`;
    if (showCustAddress) text += `${data.customerAddress}\n`;
    if (showCustGstin) text += `GST: ${data.customerGstin}\n`;
    if (showCustState) text += `State: ${data.customerState}\n`;

    // ── Items (name + total right-aligned, no qty/rate unless offer) ──
    data.items.forEach(item => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const total = fmt.displayTotal;
      const rawName = item.name || '';
      const nameLines = printFullName ? wrapText(rawName, charsPerLine - total.length - 2) : [rawName.length > charsPerLine - totalW - 2 ? rawName.substring(0, charsPerLine - totalW - 5) + '..' : rawName];
      nameLines.forEach((name, li) => {
        if (li === 0) {
          text += `${name}${' '.repeat(Math.max(1, charsPerLine - name.length - total.length))}${total}\n`;
        } else {
          text += `${name}\n`;
        }
      });
      if (showBrand && item.brand) text += ` ${item.brand}\n`;
      const qtyRateText = isRateQty ? `${fmt.displayRate}x${fmt.displayQty}` : `${fmt.displayQty}x${fmt.displayRate}`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += ` ${qtyRateText}  MRP ${item.originalRate.toFixed(2)}${item.discountLabel ? ` (${item.discountLabel})` : ''}\n`;
      } else {
        text += ` ${qtyRateText}\n`;
        if (data.showProductOffers !== false && item.discountLabel) text += ` ${item.discountLabel}\n`;
      }
    });

    // ── Totals ──
    text += `\n${padRight('SUBTOTAL', labelW)}  ${padLeft(data.subtotal.toFixed(2), totalW)}\n`;
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += `${padRight('IGST', labelW)}  ${padLeft(data.igst.toFixed(2), totalW)}\n`;
      else {
        if (data.cgst && data.cgst > 0) text += `${padRight('CGST', labelW)}  ${padLeft(data.cgst.toFixed(2), totalW)}\n`;
        if (data.sgst && data.sgst > 0) text += `${padRight('SGST', labelW)}  ${padLeft(data.sgst.toFixed(2), totalW)}\n`;
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      text += `${padRight('EXTRA / BONUS', labelW)}  ${padLeft(`+${data.extraBonus.toFixed(2)}`, totalW)}\n`;
    } else     if (data.discount > 0) text += `${padRight('DISCOUNT', labelW)}  ${padLeft(`-${data.discount.toFixed(2)}`, totalW)}\n`;
    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    text += `${padRight('Grand Total', labelW)}  ${padLeft(data.grandTotal.toFixed(2), totalW)}\n`;
    if (data.scrapDeduction && data.scrapDeduction > 0) text += `${padRight('Scrap Return Amount', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    if (data.returnDeduction && data.returnDeduction > 0) text += `${padRight('Return Credit', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    text += '\n';
    text += `${padRight('** GRAND TOTAL **', labelW)}  ${padLeft(data.grandTotal.toFixed(2), totalW)}\n`;
    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += `${padRight('** REFUND AMOUNT **', labelW)}  ${padLeft(refundAmount.toFixed(2), totalW)}\n`;
      } else {
        text += `${padRight('** NET PAYABLE **', labelW)}  ${padLeft(netPayable.toFixed(2), totalW)}\n`;
      }
    }
    text += '\n';

    // ── Payment ──
    const bLines = formatBalanceLines(data, labelW, totalW, padRight, padLeft);
    if (bLines.length > 0) {
      bLines.forEach(line => { text += line + '\n'; });
    }

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += `\nYOU SAVED ₹${totalSaved.toFixed(2)}\n`;
      }
    }

    // ── UPI ──
    if (data.upiId) {
      text += `\nUPI: ${data.upiId}\n`;
    }

    // ── Loyalty Points ──
    text = appendLoyaltyBlock(text);

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += `\nThank You\n`;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  LUXE — Elegant with section headers, padded borders, refined spacing
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'luxe') {
    const THICK = '='.repeat(charsPerLine);
    const THIN = '-'.repeat(charsPerLine);
    const totalW = 10;
    const labelW = charsPerLine - totalW - 2;

    // ── Header ──
    const bs = selectedBillSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = (bs?.showShopName !== false && Boolean(data.shopName)) ||
                      (bs?.showShopAddress !== false && Boolean(data.shopAddress)) ||
                      (bs?.showPhone !== false && Boolean(data.shopPhone)) ||
                      (bs?.showShopGstin !== false && Boolean(data.shopGstin)) ||
                      bs?.showTitle !== false || showScrapH;
    if (hasHeader) {
      text += THICK + '\n';
      if (bs?.showShopName !== false && data.shopName) text += centerText(` ${data.shopName} `, charsPerLine) + '\n';
      if (bs?.showShopAddress !== false && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone !== false && data.shopPhone) text += centerText(`☎ ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin !== false && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showTitle !== false || showScrapH) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle)} --`, charsPerLine) + '\n';
      text += THICK + '\n';
    }
    text += `  Invoice: ${data.invoiceNumber}\n`;
    text += `  Date:    ${data.date}\n`;
    if (data.billerName && bs?.showBillerName !== false) text += `  Staff:   ${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    const showCustName = data.customerName && bs?.showCustomerName !== false;
    const showCustPhone = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCustAddress = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCustGstin = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCustState = data.customerState && bs?.showCustomerState !== false;
    if (showCustName || showCustPhone || showCustAddress || showCustGstin || showCustState) {
      text += THIN + '\n';
      text += centerText('CUSTOMER', charsPerLine) + '\n';
      if (showCustName) text += `  ${data.customerName}\n`;
      if (showCustPhone) text += `  Ph: ${data.customerPhone}\n`;
      if (showCustAddress) text += `  ${data.customerAddress}\n`;
      if (showCustGstin) text += `  GSTIN: ${data.customerGstin}\n`;
      if (showCustState) text += `  State: ${data.customerState}\n`;
      text += '\n';
    }

    // ── Items (numbered with blank line between groups) ──
    text += THIN + '\n';
    text += centerText('ITEMS', charsPerLine) + '\n';
    text += THIN + '\n';

    data.items.forEach((item, i) => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const total = fmt.displayTotal;
      const prefix = `${i + 1}.`;
      const rawName = item.name || '';
      const nameLines = printFullName ? wrapText(rawName, charsPerLine - prefix.length - 1 - total.length - 1) : [rawName.length > charsPerLine - 14 ? rawName.substring(0, charsPerLine - 17) + '..' : rawName];
      nameLines.forEach((name, li) => {
        if (li === 0) {
          text += `${prefix} ${name}${' '.repeat(Math.max(1, charsPerLine - prefix.length - 1 - name.length - total.length))}${total}\n`;
        } else {
          text += `${' '.repeat(prefix.length + 1)}${name}\n`;
        }
      });
      if (showBrand && item.brand) text += `     Brand: ${item.brand}\n`;
      const qtyRateText = isRateQty ? `${fmt.displayRate} \u00D7 ${fmt.displayQty}` : `${fmt.displayQty} \u00D7 ${fmt.displayRate}`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `     ${qtyRateText}`;
        text += `    MRP \u20B9${item.originalRate.toFixed(2)}`;
        text += item.discountLabel ? ` (${item.discountLabel})` : '';
        text += '\n';
      } else {
        text += `     ${qtyRateText}\n`;
        if (data.showProductOffers !== false && item.discountLabel) text += `     ${item.discountLabel}\n`;
      }
    });
    text += '\n';

    // ── Totals ──
    text += THIN + '\n';
    text += `${padRight('Subtotal', labelW)}  ${padLeft(`\u20B9${data.subtotal.toFixed(2)}`, totalW)}\n`;
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += `${padRight('IGST', labelW)}  ${padLeft(`\u20B9${data.igst.toFixed(2)}`, totalW)}\n`;
      else {
        if (data.cgst && data.cgst > 0) text += `${padRight('CGST', labelW)}  ${padLeft(`\u20B9${data.cgst.toFixed(2)}`, totalW)}\n`;
        if (data.sgst && data.sgst > 0) text += `${padRight('SGST', labelW)}  ${padLeft(`\u20B9${data.sgst.toFixed(2)}`, totalW)}\n`;
      }
    }
    if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
      text += `${padRight('Extra / Bonus', labelW)}  ${padLeft(`+\u20B9${data.extraBonus.toFixed(2)}`, totalW)}\n`;
    } else if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `Discount (${data.discountValue}%)` : 'Discount';
      text += `${padRight(dLabel, labelW)}  ${padLeft(`-\u20B9${data.discount.toFixed(2)}`, totalW)}\n`;
    }
    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    text += `${padRight('Grand Total', labelW)}  ${padLeft(`\u20B9${data.grandTotal.toFixed(2)}`, totalW)}\n`;
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Return Amount', labelW)}  ${padLeft(`-\u20B9${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return Credit', labelW)}  ${padLeft(`-\u20B9${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }
    text += '\n';
    text += THICK + '\n';
    text += centerText('* * * GRAND TOTAL * * *', charsPerLine) + '\n';
    text += centerText(`\u20B9 ${data.grandTotal.toFixed(2)}`, charsPerLine) + '\n';
    text += THICK + '\n';

    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        text += centerText('* * * REFUND AMOUNT * * *', charsPerLine) + '\n';
        text += centerText(`\u20B9 ${refundAmount.toFixed(2)}`, charsPerLine) + '\n';
        text += THICK + '\n';
      } else {
        text += centerText('* * * NET PAYABLE * * *', charsPerLine) + '\n';
        text += centerText(`\u20B9 ${netPayable.toFixed(2)}`, charsPerLine) + '\n';
        text += THICK + '\n';
      }
    }

    // ── Payment ──
    const bLines = formatBalanceLines(data, labelW, totalW, padRight, padLeft);
    if (bLines.length > 0) {
      bLines.forEach(line => { text += line + '\n'; });
      text += THIN + '\n';
    }

    // ── You Saved ──
    const perProductSavings = data.items.reduce((sum, item) => {
      if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
      return sum;
    }, 0);
    const totalSaved = perProductSavings + data.discount;
    if (totalSaved > 0) {
      text += centerText(`You Saved \u20B9${totalSaved.toFixed(2)}`, charsPerLine) + '\n';
      text += THIN + '\n';
    }

    // ── UPI ──
    if (data.upiId) {
      text += centerText('PAYMENT VIA UPI', charsPerLine) + '\n';
      text += centerText(data.upiId, charsPerLine) + '\n';
      if (data.showUpiQr) {
        try {
          const finalTotal = netPayable;
          const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${finalTotal.toFixed(2)}&cu=INR`;
          text += '\n[[QR:' + upiUrl + ']]\n';
        } catch {}
      }
      text += THIN + '\n';
    }

    // ── Loyalty Points ──
    text = appendLoyaltyBlock(text);

    // ── Instructions ──
    text = appendInstructions(text);

    // ── Footer ──
    text += centerText('Thank You, Visit Again!', charsPerLine) + '\n';
    text += THIN + '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  BILL — Boxed receipt matching reference: strict alignment, columnar table
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'boxed') {
    const INNER = charsPerLine - 2; // usable width inside │ ... │

    // ── Helpers ──────────────────────────────────────────────────────────────

    // B_LINE: always pads/clips content to exactly INNER columns
    const B_LINE = (content: string): string => {
      const c = content.length > INNER ? content.substring(0, INNER) : content.padEnd(INNER);
      return '│' + c + '│\n';
    };

    // B_TOP / B_MID / B_BOT: full-width solid single-line rules
    const B_TOP = () => '┌' + '─'.repeat(INNER) + '┐\n';
    const B_MID = () => '├' + '─'.repeat(INNER) + '┤\n';
    const B_BOT = () => '└' + '─'.repeat(INNER) + '┘\n';

    // B_ROW: builds a table row from cells+widths.
    //   sum(widths) must equal INNER - N_cols so total line = exactly charsPerLine
    const B_ROW = (cells: string[], widths: number[], aligns?: ('left' | 'right' | 'center')[]): string => {
      let line = '│';
      cells.forEach((c, i) => {
        const w = widths[i];
        const align = aligns && aligns[i] ? aligns[i] : 'left';
        let paddedCell = c;
        if (c.length > w) {
          paddedCell = c.substring(0, w);
        } else if (align === 'right') {
          paddedCell = c.padStart(w);
        } else if (align === 'center') {
          paddedCell = centerText(c, w);
        } else {
          paddedCell = c.padEnd(w);
        }
        line += paddedCell + '│';
      });
      // Final safety clamp
      return (line.length > charsPerLine
        ? line.substring(0, charsPerLine)
        : line.padEnd(charsPerLine)) + '\n';
    };

    // B_SEP: solid single-line separator row between table header and data rows
    //   ├──┼──┼──┤
    const B_SEP = (widths: number[]): string => {
      let s = '├';
      widths.forEach((w, i) => {
        s += '─'.repeat(w) + (i < widths.length - 1 ? '┼' : '┤');
      });
      return s + '\n';
    };

    // ── Header ───────────────────────────────────────────────────────────────
    const isGstBill = data.invoiceType === 'GST' || Boolean(data.isB2B);
    const bs = getEffectiveBillSettings(data.billSettings, isGstBill);
    text += B_TOP();

    // 1. Shop name — UPPERCASE, centered
    if (bs?.showShopName !== false && data.shopName) {
      text += B_LINE(centerText(data.shopName.toUpperCase(), INNER));
    }

    // 2. Address — centered, with clean multi-line wrapping to prevent clipping
    if (bs?.showShopAddress !== false && data.shopAddress) {
      const addr = data.shopAddress;
      const words = addr.split(/\s+/);
      let currentLine = '';
      const lines: string[] = [];
      
      words.forEach(word => {
        if ((currentLine + (currentLine ? ' ' : '') + word).length <= INNER) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) lines.push(currentLine);
      
      lines.forEach(line => {
        text += B_LINE(centerText(line, INNER));
      });
    }

    // 3. Phone — centered
    if (bs?.showPhone !== false && data.shopPhone) {
      text += B_LINE(centerText(`Ph: ${data.shopPhone}`, INNER));
    }

    // 4. GSTIN — centered
    if (bs?.showShopGstin !== false && data.shopGstin) {
      text += B_LINE(centerText(`GSTIN: ${data.shopGstin}`, INNER));
    }

    // 5. State — centered
    if (bs?.showShopState !== false && data.shopState) {
      text += B_LINE(centerText(`State: ${data.shopState}`, INNER));
    }

    text += B_MID();

    // ── Document Title ────────────────────────────────────────────────────────
    const showScrapT = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
    if (bs?.showTitle !== false || showScrapT) {
      const docTitle = getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle);
      text += B_LINE(centerText(docTitle, INNER));
      text += B_MID();
    }

    // ── Bill Info ─────────────────────────────────────────────────────────────
    const invLabel = data.invoiceType === 'RETURN' ? 'RET No' : 'Bill No';
    const billPart = `${invLabel}: ${data.invoiceNumber}`;
    const datePart = `Date: ${data.date}`;
    const combinedLen = billPart.length + 1 + datePart.length;
    if (combinedLen <= INNER) {
      // Both fit on one line
      const billGap = INNER - billPart.length - datePart.length;
      text += B_LINE(billPart + ' '.repeat(billGap) + datePart);
    } else {
      // Date is long (e.g. full locale timestamp) — put on separate line
      text += B_LINE(` ${billPart}`);
      text += B_LINE(` ${datePart}`);
    }
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) text += B_LINE(` Ref Inv: ${data.referenceInvoiceNumber}`);
    if (data.invoiceType === 'RETURN' && data.refundMethod) text += B_LINE(` Refund: ${data.refundMethod}`);
    if (data.billerName && bs?.showBillerName !== false) text += B_LINE(` Staff: ${data.billerName}`);

    // ── Customer Details ──────────────────────────────────────────────────────
    const showCN = data.customerName && bs?.showCustomerName !== false;
    const showCP = data.customerPhone && bs?.showCustomerPhone !== false;
    const showCA = data.customerAddress && bs?.showCustomerAddress !== false;
    const showCG = data.customerGstin && bs?.showCustomerGstin !== false;
    const showCS = data.customerState && bs?.showCustomerState !== false;
    if (showCN || showCP || showCA || showCG || showCS) {
      text += B_MID();
      text += B_LINE(' Customer Details:');
      if (data.customerName && showCN) text += B_LINE(` Name    : ${data.customerName}`);
      if (data.customerAddress && showCA) text += B_LINE(` Address : ${data.customerAddress}`);
      if (data.customerPhone && showCP) text += B_LINE(` Contact : ${data.customerPhone}`);
      if (data.customerGstin && showCG) text += B_LINE(` GSTIN   : ${data.customerGstin}`);
      if (data.customerState && showCS) text += B_LINE(` State   : ${data.customerState}`);
    }

    // ── Item Table ────────────────────────────────────────────────────────────
    // Correct formula: sum(colWidths) = INNER - N_cols
    // so every B_ROW line = │ + sum(widths) + N pipes = 1+sum+N = charsPerLine ✓

    let colWidths: number[];
    let colLabels: string[];
    let colAligns: ('left' | 'right' | 'center')[];
    let nameW: number;
    let idxW: number;
    let qtyW: number;
    let rateW: number;
    let amtW: number;
    let mrpW: number | null;

    if (charsPerLine >= 42) {
      // 6 cols: Sr(2) Product Qty(4) MRP(6) Rate(6) Amt(7)
      idxW = 2; qtyW = 4; mrpW = 6; rateW = 6; amtW = 7;
      nameW = (charsPerLine - 7) - (idxW + qtyW + mrpW + rateW + amtW);
      colWidths = isRateQty ? [idxW, nameW, rateW, mrpW, qtyW, amtW] : [idxW, nameW, qtyW, mrpW, rateW, amtW];
      colLabels = isRateQty ? ['Sr', 'Product', 'Rate', 'MRP', 'Qty', 'Amount'] : ['Sr', 'Product', 'Qty', 'MRP', 'Rate', 'Amount'];
      colAligns = ['center', 'left', 'right', 'right', 'right', 'right'];
    } else if (charsPerLine >= 36) {
      // 5 cols: Sr(2) Product Qty(3) Rate(6) Amt(7)
      idxW = 2; qtyW = 3; mrpW = null; rateW = 6; amtW = 7;
      nameW = (charsPerLine - 6) - (idxW + qtyW + rateW + amtW);
      colWidths = isRateQty ? [idxW, nameW, rateW, qtyW, amtW] : [idxW, nameW, qtyW, rateW, amtW];
      colLabels = isRateQty ? ['Sr', 'Product', 'Rate', 'Qty', 'Amount'] : ['Sr', 'Product', 'Qty', 'Rate', 'Amount'];
      colAligns = ['center', 'left', 'right', 'right', 'right'];
    } else {
      // 5 cols: Sr(2) Product Qty(3) Rate(5) Amt(5)
      idxW = 2; qtyW = 3; mrpW = null; rateW = 5; amtW = 5;
      nameW = (charsPerLine - 6) - (idxW + qtyW + rateW + amtW);
      if (nameW < 4) { nameW = 4; }
      colWidths = isRateQty ? [idxW, nameW, rateW, qtyW, amtW] : [idxW, nameW, qtyW, rateW, amtW];
      colLabels = isRateQty ? ['Sr', 'Product', 'Rate', 'Qty', 'Amt'] : ['Sr', 'Product', 'Qty', 'Rate', 'Amt'];
      colAligns = ['center', 'left', 'right', 'right', 'right'];
    }

    text += B_MID();
    text += B_ROW(colLabels, colWidths, colAligns);
    text += B_SEP(colWidths);

    data.items.forEach((item, i) => {
      const fmt = formatPrintItem(item, selectedBillSettings);
      const idx = String(i + 1);
      const qty = fmt.displayQty;
      const rate = fmt.displayRate;
      const amt = fmt.displayTotal;
      const mrpStr = mrpW && item.originalRate ? item.originalRate.toFixed(2) : '';
      const isComboItem = Boolean(item.isCombo || (item.combo_items && item.combo_items.length > 0));
      const baseName = item.name || '';
      const rawName = isComboItem && !/\b(COMBO|Combo|combo)\b/i.test(baseName) ? `[COMBO] ${baseName}` : baseName;

      // Wrap name across multiple rows when printFullName is enabled
      const nameLines = printFullName
        ? wrapText(rawName, nameW)
        : [rawName.length > nameW ? rawName.substring(0, nameW - 2) + '..' : rawName];

      nameLines.forEach((name, li) => {
        const cells = mrpW
          ? [li === 0 ? idx : '', name, li === 0 ? (isRateQty ? rate : qty) : '', li === 0 ? mrpStr : '', li === 0 ? (isRateQty ? qty : rate) : '', li === 0 ? amt : '']
          : [li === 0 ? idx : '', name, li === 0 ? (isRateQty ? rate : qty) : '', li === 0 ? (isRateQty ? qty : rate) : '', li === 0 ? amt : ''];
        text += B_ROW(cells, colWidths, colAligns);
      });

      // Combo sub-line for included constituent items
      if (isComboItem && item.combo_items && item.combo_items.length > 0) {
        const comboWidths = [idxW, INNER - idxW - 1];
        const comboInc = ` Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}`;
        const incLines = wrapText(comboInc, INNER - idxW - 1);
        incLines.forEach(l => {
          text += B_ROW(['', l], comboWidths);
        });
      }

      // Brand name — printed under the Product column when enabled
      if (showBrand && item.brand) {
        const brandWidths = [idxW, INNER - idxW - 1];
        text += B_ROW(['', ` Brand: ${item.brand}`], brandWidths);
      }

      // MRP offer note — aligned under the Product column with Sr. column divider intact
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        const offerWidths = [idxW, INNER - idxW - 1];
        // 1. Add a small gap row before the offer note (45% line-height) - no extra column dividers
        text += '[[LH:0.45]]' + B_ROW(['', ''], offerWidths);

        const offerLabel = ` MRP ${item.originalRate.toFixed(2)} @ ${fmt.displayRate}${item.discountLabel ? ` (${item.discountLabel})` : ''}`;
        // 2. Print as 2-column row: empty Sr. column, offer label in remaining space
        text += B_ROW(['', offerLabel], offerWidths);

        // 3. Add a small gap row after the offer note (45% line-height) - no extra column dividers
        text += '[[LH:0.45]]' + B_ROW(['', ''], offerWidths);
      }

      // Add separator line after each item (except the last one)
      if (i < data.items.length - 1) {
        text += B_SEP(colWidths);
      }
    });

    // Close item table with a clean horizontal line (no extra column dividers)
    text += B_MID();

    // ── Totals ────────────────────────────────────────────────────────────────
    // Format: │ Label                    │   123.00│
    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    const netTotal = Math.round(netPayable);
    const roundOff = Math.round(netPayable) - netPayable;
    const refundTotal = Math.round(refundAmount);
    const refundRoundOff = Math.round(refundAmount) - refundAmount;

    // Align totals vertical separator with minimum 8 chars for value field so 2-decimal numbers are never clipped
    const VAL_W = Math.max(amtW, 8);
    const LAB_W = Math.max(4, INNER - VAL_W - 1);
    const tRow = (label: string, val: string) => {
      const effValW = Math.max(VAL_W, val.length);
      const effLabW = INNER - effValW - 1;
      const l = label.length > effLabW ? label.substring(0, effLabW) : label.padEnd(effLabW);
      const v = val.padStart(effValW);
      return B_LINE(l + '│' + v);
    };

    text += tRow('Total', data.subtotal.toFixed(2));
    text += tRow('Grand Total', data.grandTotal.toFixed(2));
    if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `Discount (${data.discountValue}%)` : 'Discount';
      text += tRow(dLabel, `-${data.discount.toFixed(2)}`);
    }
    if (data.scrapDeduction && data.scrapDeduction > 0) text += tRow('Scrap Return Amount', `-${data.scrapDeduction.toFixed(2)}`);
    if (data.returnDeduction && data.returnDeduction > 0) text += tRow('Return Credit', `-${data.returnDeduction.toFixed(2)}`);

    if (totalDeductions > 0) {
      if (refundAmount > 0) {
        if (Math.abs(refundRoundOff) >= 0.005) text += tRow('Round Off', `${refundRoundOff >= 0 ? '+' : ''}${refundRoundOff.toFixed(2)}`);
        text += tRow('Refund Amount', `${Math.max(0, refundTotal).toFixed(2)}`);
      } else {
        if (Math.abs(roundOff) >= 0.005) text += tRow('Round Off', `${roundOff >= 0 ? '+' : ''}${roundOff.toFixed(2)}`);
        text += tRow('Net Total', `${Math.max(0, netTotal).toFixed(2)}`);
      }
    } else {
      const gtRoundOff = Math.round(data.grandTotal) - data.grandTotal;
      if (Math.abs(gtRoundOff) >= 0.005) text += tRow('Round Off', `${gtRoundOff >= 0 ? '+' : ''}${gtRoundOff.toFixed(2)}`);
      text += tRow('Net Total', `${Math.max(0, Math.round(data.grandTotal)).toFixed(2)}`);
    }

    // ── You Saved ─────────────────────────────────────────────────────────────
    if (data.invoiceType !== 'SCRAP') {
      const perSaved = data.items.reduce((s, item) =>
        item.originalRate != null ? s + (item.originalRate - item.unit_price) * Number(item.quantity) : s, 0);
      const totalSaved = perSaved + data.discount;
      if (totalSaved > 0) {
        text += B_MID();
        const savedMsg = centerText(`* * * YOU SAVED \u20B9${totalSaved.toFixed(2)} * * *`, INNER);
        text += B_LINE(savedMsg);
      }
    }

    text += B_MID();

    // ── Tax Breakup ───────────────────────────────────────────────────────────
    if (data.tax > 0) {
      let taxCols: string[];
      let taxWidths: number[];
      let taxValues: string[];
      let taxAligns: ('left' | 'right' | 'center')[];

      const hasIgst = Boolean(data.igst && data.igst > 0);

      if (charsPerLine >= 42) {
        // 5 columns for 80mm/48-char printers
        const taxSum = charsPerLine - 6;
        const tw = Math.floor(taxSum / 5);
        const twLast = taxSum - tw * 4;
        taxWidths = [tw, tw, tw, tw, twLast];
        taxCols = ['Taxable', 'CGST', 'SGST', 'IGST', 'Total GST'];
        taxAligns = ['right', 'right', 'right', 'right', 'right'];
        taxValues = [
          data.subtotal.toFixed(2),
          data.cgst ? data.cgst.toFixed(2) : '0.00',
          data.sgst ? data.sgst.toFixed(2) : '0.00',
          data.igst ? data.igst.toFixed(2) : '0.00',
          data.tax.toFixed(2),
        ];
      } else if (hasIgst) {
        // 3 columns for Inter-State on narrow thermal printer
        const taxSum = charsPerLine - 4;
        const wTaxable = Math.max(7, Math.floor(taxSum * 0.38));
        const wIgst = Math.max(6, Math.floor(taxSum * 0.28));
        const wTotal = taxSum - wTaxable - wIgst;
        taxWidths = [wTaxable, wIgst, wTotal];
        taxCols = ['Taxable', 'IGST', 'Total GST'];
        taxAligns = ['right', 'right', 'right'];
        taxValues = [
          data.subtotal.toFixed(2),
          data.igst ? data.igst.toFixed(2) : '0.00',
          data.tax.toFixed(2),
        ];
      } else {
        // 4 columns for Intra-State (CGST+SGST) on narrow thermal printer
        const taxSum = charsPerLine - 5;
        const wTaxable = 7;
        const wCgst = 5;
        const wSgst = 5;
        const wTotal = taxSum - wTaxable - wCgst - wSgst;
        taxWidths = [wTaxable, wCgst, wSgst, wTotal];
        taxCols = ['Taxable', 'CGST', 'SGST', 'Total'];
        taxAligns = ['right', 'right', 'right', 'right'];
        taxValues = [
          data.subtotal.toFixed(2),
          data.cgst ? data.cgst.toFixed(2) : '0.00',
          data.sgst ? data.sgst.toFixed(2) : '0.00',
          data.tax.toFixed(2),
        ];
      }

      text += B_ROW(taxCols, taxWidths, taxAligns);
      text += B_SEP(taxWidths);
      text += B_ROW(taxValues, taxWidths, taxAligns);
      text += B_MID();
    }

    // ── Amount in Words ───────────────────────────────────────────────────────
    text += B_LINE(' Amount in Words:');
    {
      const amountWords = `${numberToIndianWords(refundAmount > 0 ? refundTotal : Math.max(0, netTotal))} ONLY`;
      // Wrap long words string across multiple lines (INNER - 1 usable chars per line)
      const wordLineW = INNER - 1;
      let remaining = amountWords;
      while (remaining.length > 0) {
        if (remaining.length <= wordLineW) {
          text += B_LINE(` ${remaining}`);
          break;
        }
        // Break at a space within the limit
        let breakAt = remaining.lastIndexOf(' ', wordLineW);
        if (breakAt <= 0) breakAt = wordLineW;
        text += B_LINE(` ${remaining.substring(0, breakAt)}`);
        remaining = remaining.substring(breakAt).trimStart();
      }
    }
    text += B_MID();

    // ── Terms & Conditions ────────────────────────────────────────────────────
    const instr = bs?.instructions;
    if (instr) {
      text += B_LINE(' Terms & Conditions:');
      for (const line of instr.split('\n').filter(l => l.trim())) {
        text += B_LINE(` ${line.trim()}`);
      }
      text += B_MID();
    }

    // ── Authorised Signatory & For Shop Name ──────────────────────────────────
    if ((selectedBillSettings.showForShopName !== false && data.shopName) || selectedBillSettings.showAuthorisedSignatory !== false) {
      text += B_LINE('');
      if (selectedBillSettings.showForShopName !== false && data.shopName) {
        text += B_LINE(padLeft(`For ${data.shopName.toUpperCase()}`, INNER));
      }
      if (selectedBillSettings.showAuthorisedSignatory !== false) {
        if (selectedBillSettings.showForShopName !== false && data.shopName) {
          text += B_LINE('');
        }
        text += B_LINE(padLeft('Authorised Signatory', INNER));
      }
      text += B_MID();
    }

    // ── Barcode ───────────────────────────────────────────────────────────────
    if (selectedBillSettings.showBarcodeOnReceipt !== false) {
      text += `[[BARCODE:${data.invoiceNumber}]]\n`;
      text += B_MID();
    }

    // ── Prominent Total/Refund ────────────────────────────────────────────────
    const finalAmountLabel = refundAmount > 0 ? 'Refund Amount' : 'Net Total';
    const finalAmountValue = refundAmount > 0 ? Math.max(0, refundTotal) : Math.max(0, netTotal);
    text += `[[PROMINENT:${finalAmountLabel}: \u20B9${finalAmountValue.toFixed(2)}]]\n`;
    text += B_MID();

    // ── Footer ────────────────────────────────────────────────────────────────
    text += B_LINE(centerText('Thank You... Visit Again !', INNER));
    text += B_MID();

    // ── QR Code ───────────────────────────────────────────────────────────────
    if (data.upiId && data.showUpiQr) {
      try {
        const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${Math.max(0, netTotal).toFixed(2)}&cu=INR`;
        text += '[[QR:' + upiUrl + ']]\n';
      } catch {}
    }

    // ── Loyalty Points ────────────────────────────────────────────────────────
    const hasPoints =
      (data.pointsEarned != null && data.pointsEarned > 0) ||
      (data.previousPointsBalance != null && data.previousPointsBalance > 0) ||
      (data.pointsRedeemed != null && data.pointsRedeemed > 0) ||
      (data.remainingPointsBalance != null && data.remainingPointsBalance > 0);
    if (hasPoints) {
      const ptRow = (l: string, v: string) => {
        const effVW = Math.max(amtW, 8, v.length);
        const effLW = INNER - effVW - 1;
        const label = l.length > effLW ? l.substring(0, effLW) : l.padEnd(effLW);
        const val = v.padStart(effVW);
        return B_LINE(label + '│' + val);
      };
      text += ptRow('Bill Points', (data.pointsEarned || 0).toFixed(2));
      text += ptRow('Used Point', String(data.pointsRedeemed || 0));
      text += ptRow('Used Amt', data.pointsRedeemedDiscount ? data.pointsRedeemedDiscount.toFixed(2) : '0');
      text += ptRow('Balance Points', (data.remainingPointsBalance || 0).toFixed(2));
      text += B_MID();
    }

    text += B_BOT();
  }

  return text;
}
