export interface ReceiptItem {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
  originalRate?: number;
  discountLabel?: string;
}

export interface BillSettings {
  showShopName: boolean;
  showShopAddress: boolean;
  showPhone: boolean;
  showShopGstin: boolean;
  showShopState: boolean;
  showTitle: boolean;
  showCustomerName: boolean;
  showCustomerGstin: boolean;
  estimateMode: boolean;
  showScrapHeading: boolean;
  showBosTaxBreakup: boolean;
  bosTaxRatePercent: number;
  bosTaxInclusive: boolean;
  instructions?: string;
}

export const DEFAULT_BILL_SETTINGS: BillSettings = {
  showShopName: true,
  showShopAddress: true,
  showPhone: true,
  showShopGstin: true,
  showShopState: true,
  showTitle: true,
  showCustomerName: true,
  showCustomerGstin: true,
  estimateMode: false,
  showScrapHeading: true,
  showBosTaxBreakup: false,
  bosTaxRatePercent: 0,
  bosTaxInclusive: false,
  instructions: '',
};

export interface ReceiptData {
  shopName: string;
  shopGstin?: string;
  shopState?: string;
  shopAddress?: string;
  shopPhone?: string;
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
  isReprint?: boolean;
  invoiceType?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerState?: string;
  customerAddress?: string;
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
}

/**
 * Generates a properly formatted plain-text receipt suitable for thermal printers.
 * @param data The receipt data to print.
 * @param widthCm The width of the paper in centimeters (e.g., 5.8 or 8.0).
 * @param charsPerLine Optional explicit character count per line.
 * @param style The receipt layout style.
 * @returns The formatted plain text string.
 */
function numberToIndianWords(amount: number): string {
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

function getDocumentTitle(invoiceType?: string, isReprint?: boolean, estimateMode?: boolean, isB2B?: boolean): string {
  if (isReprint) return '( R E P R I N T )';
  if (estimateMode) return 'BILL OF SUPPLY';
  switch (invoiceType) {
    case 'GST': return isB2B ? 'TAX INVOICE (B2B)' : 'TAX INVOICE (B2C)';
    case 'SCRAP': return 'SCRAP BILL';
    case 'BILL_OF_SUPPLY': return 'BILL OF SUPPLY';
    case 'ESTIMATE': return 'BILL OF SUPPLY';
    case 'RETURN': return 'RETURN INVOICE';
    default: return 'INVOICE';
  }
}

export function generateReceiptText(data: ReceiptData, widthCm: number = 5.8, charsPerLine?: number, style: 'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'bill' = 'standard'): string {
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

  const appendInstructions = (t: string): string => {
    const instr = data.billSettings?.instructions;
    if (!instr) return t;
    const lines = instr.split('\n').filter(l => l.trim());
    if (lines.length === 0) return t;
    const dash = '-'.repeat(charsPerLine);
    let out = t + '\n' + dash + '\n';
    out += centerText('INSTRUCTIONS', charsPerLine) + '\n';
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
    const bs = data.billSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = bs?.showShopName || bs?.showShopAddress || bs?.showPhone || bs?.showShopGstin || bs?.showShopState || bs?.showTitle || showScrapH;
    if (hasHeader) {
      text += FRAME + '\n';
      if (bs?.showShopName) text += centerText(data.shopName, charsPerLine) + '\n';
      if (bs?.showShopAddress && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone && data.shopPhone) text += centerText(`Ph: ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showShopState && data.shopState) text += centerText(`State: ${data.shopState}`, charsPerLine) + '\n';
      const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
      if (bs?.showTitle || showScrap) {
        if (data.isReprint) text += centerText('( R E P R I N T )', charsPerLine) + '\n';
        else {
          const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B);
          text += centerText(`-- ${docTitle} --`, charsPerLine) + '\n';
        }
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
    if (data.billerName) text += `  Staff:   ${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin)) {
      text += LIGHT + '\n';
      text += centerText('CUSTOMER', charsPerLine) + '\n';
      if (showCustName) text += `  ${data.customerName}\n`;
      if (data.customerPhone) text += `  ${data.customerPhone}\n`;
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `  GSTIN: ${data.customerGstin}\n`;
    }

    text += LIGHT + '\n';

    // ── Items (table: # | Item | Qty | Amount) ──
    const qtyW = 4;
    const amtW = 10;
    const idxW = 2;
    const nameW = charsPerLine - idxW - 1 - qtyW - 1 - amtW;

    text += `${'# '.padEnd(idxW + 1)}${padRight('Item', nameW)} ${padLeft('Qty', qtyW)} ${padLeft('Amount', amtW)}\n`;
    text += LIGHT + '\n';

    data.items.forEach((item, i) => {
      const name = item.name.length > nameW ? item.name.substring(0, nameW - 2) + '..' : item.name;
      const qty = String(item.quantity);
      const total = item.total.toFixed(2);
      text += `${i + 1}.${' '.repeat(Math.max(1, idxW + 1 - String(i + 1).length - 1))}${padRight(name, nameW)} ${padLeft(qty, qtyW)} ${padLeft(total, amtW)}\n`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        const mrpLine = `  MRP ₹${item.originalRate.toFixed(2)} → ₹${item.unit_price.toFixed(2)}`;
        const clipped = mrpLine.length > charsPerLine ? mrpLine.substring(0, charsPerLine - 3) + '..' : mrpLine;
        text += `${clipped}${item.discountLabel ? `  (${item.discountLabel})` : ''}\n`;
      } else if (data.invoiceType === 'SCRAP') {
        text += `  ${padLeft(item.unit_price.toFixed(2), 7)} ${padLeft(String(item.quantity), 5)} ${padLeft(item.total.toFixed(2), 8)}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0) - (data.returnDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('SCRAP DEDUCTION', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('RETURN DEDUCTION', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += FRAME + '\n';
    text += centerText('** GRAND TOTAL **', charsPerLine) + '\n';
    text += centerText(`₹ ${Math.max(0, finalGrandTotal).toFixed(2)}`, charsPerLine) + '\n';
    text += FRAME + '\n';

    if (data.receivedAmount != null && data.balanceAmount != null) {
      text += `${padRight('RECEIVED', labelW)}  ${padLeft(data.receivedAmount.toFixed(2), totalW)}\n`;
      text += `${padRight('BALANCE', labelW)}  ${padLeft(data.balanceAmount.toFixed(2), totalW)}\n`;
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
          const finalTotal = Math.max(0, data.grandTotal - (data.scrapDeduction || 0));
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
    const bs = data.billSettings;
    if (bs?.showShopName) text += `${data.shopName}\n`;
    if (bs?.showShopAddress && data.shopAddress) text += `${data.shopAddress}\n`;
    if (bs?.showPhone && data.shopPhone) text += `${data.shopPhone}\n`;
    if (bs?.showShopGstin && data.shopGstin) text += `GST: ${data.shopGstin}\n`;
    if (bs?.showShopState && data.shopState) text += `${data.shopState}\n`;
    if (bs?.showTitle || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B)} --`, charsPerLine) + '\n';
    text += DASH + '\n';
    text += `${data.invoiceType === 'RETURN' ? 'RET No' : 'INV No'}: ${data.invoiceNumber}  ${data.date}\n`;
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += `Ref Inv: ${data.referenceInvoiceNumber}\n`;
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += `Refund Method: ${data.refundMethod}\n`;
    }
    if (data.billerName) text += `${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin)) {
      if (showCustName) text += `${data.customerName}`;
      if (data.customerPhone) text += `  ${data.customerPhone}`;
      text += '\n';
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `GST: ${data.customerGstin}\n`;
    }

    text += DASH + '\n';

    // ── Items (name + total right-aligned, qty inline) ──
    data.items.forEach(item => {
      const name = item.name.length > charsPerLine - 14 ? item.name.substring(0, charsPerLine - 17) + '..' : item.name;
      const total = item.total.toFixed(2);
      text += `${name}${' '.repeat(Math.max(1, charsPerLine - name.length - total.length))}${total}\n`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += ` MRP ${item.originalRate.toFixed(2)}@${item.unit_price.toFixed(2)}`;
        if (item.discountLabel) text += ` (${item.discountLabel})`;
        text += ` ${item.quantity}x${item.unit_price.toFixed(2)}\n`;
      } else {
        text += ` ${item.quantity}x${item.unit_price.toFixed(2)}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0) - (data.returnDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += DASH + '\n';
    text += `${padRight('** GRAND TOTAL **', labelW)}  ${padLeft(Math.max(0, finalGrandTotal).toFixed(2), totalW)}\n`;

    if (data.receivedAmount != null && data.balanceAmount != null) {
      text += `${padRight('Paid', labelW)}  ${padLeft(data.receivedAmount.toFixed(2), totalW)}\n`;
      text += `${padRight('Change', labelW)}  ${padLeft(data.balanceAmount.toFixed(2), totalW)}\n`;
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
    const bs = data.billSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = bs?.showShopName || bs?.showShopAddress || bs?.showPhone || bs?.showShopGstin || bs?.showShopState || bs?.showTitle || showScrapH;
    if (hasHeader) {
      if (bs?.showShopName) text += centerText(`✦ ${data.shopName} ✦`, charsPerLine) + '\n';
      if (bs?.showShopAddress && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone && data.shopPhone) text += centerText(`📞 ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin && data.shopGstin) text += centerText(`GST: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showShopState && data.shopState) text += centerText(`State: ${data.shopState}`, charsPerLine) + '\n';
      const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
      if (bs?.showTitle || showScrap) {
        if (data.isReprint) text += centerText('[ REPRINT ]', charsPerLine) + '\n';
        else {
          const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B);
          text += centerText(`[ ${docTitle} ]`, charsPerLine) + '\n';
        }
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
    if (data.billerName) text += `  Staff: ${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin)) {
      text += THIN + '\n';
      text += centerText('[ CUSTOMER ]', charsPerLine) + '\n';
      if (showCustName) text += `  ${data.customerName}\n`;
      if (data.customerPhone) text += `  ${data.customerPhone}\n`;
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `  GSTIN: ${data.customerGstin}\n`;
    }

    text += THIN + '\n';
    text += centerText('[ ITEMS ]', charsPerLine) + '\n';

    // ── Items (▸ bullets, qty+rate on separate line) ──
    data.items.forEach(item => {
      const name = item.name.length > charsPerLine - 12 ? item.name.substring(0, charsPerLine - 15) + '..' : item.name;
      const total = item.total.toFixed(2);
      text += `▸ ${name}${' '.repeat(Math.max(1, charsPerLine - 2 - name.length - total.length))}${total}\n`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `  MRP ₹${item.originalRate.toFixed(2)} → ₹${item.unit_price.toFixed(2)}`;
        text += item.discountLabel ? ` (~ ${item.discountLabel})\n` : '\n';
        text += `  ${item.quantity} x ${item.unit_price.toFixed(2)}\n`;
      } else {
        text += `  ${item.quantity} x ${item.unit_price.toFixed(2)}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0) - (data.returnDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('SCRAP', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('RETURN', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += THIN + '\n';
    text += centerText('>> ** GRAND TOTAL ** <<', charsPerLine) + '\n';
    text += centerText(`₹ ${Math.max(0, finalGrandTotal).toFixed(2)}`, charsPerLine) + '\n';
    text += THIN + '\n';

    if (data.receivedAmount != null && data.balanceAmount != null) {
      text += `${padRight('RECEIVED', labelW)}  ${padLeft(data.receivedAmount.toFixed(2), totalW)}\n`;
      text += `${padRight('CHANGE', labelW)}  ${padLeft(data.balanceAmount.toFixed(2), totalW)}\n`;
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
          const finalTotal = Math.max(0, data.grandTotal - (data.scrapDeduction || 0));
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
    const bs = data.billSettings;
    if (bs?.showShopName) { text += '\n'; text += centerText(data.shopName, charsPerLine) + '\n'; }
    if (bs?.showShopAddress && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
    if (bs?.showPhone && data.shopPhone) text += centerText(`Ph: ${data.shopPhone}`, charsPerLine) + '\n';
    if (bs?.showShopGstin && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
    if (bs?.showTitle || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B)} --`, charsPerLine) + '\n';
    if (bs?.showShopName || bs?.showShopAddress || bs?.showPhone || bs?.showShopGstin || bs?.showTitle || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += '\n';

    text += `Date: ${data.date}\n`;
    text += `${data.invoiceType === 'RETURN' ? 'Return No' : 'Receipt No'}: ${data.invoiceNumber}\n`;
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += `Ref Invoice: ${data.referenceInvoiceNumber}\n`;
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += `Refund Method: ${data.refundMethod}\n`;
    }
    if (data.billerName) text += `Staff: ${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin)) {
      if (showCustName) text += `${data.customerName}\n`;
      if (data.customerPhone) text += `${data.customerPhone}\n`;
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `GSTIN: ${data.customerGstin}\n`;
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
      text += `${padRight('ITEM', nameW)} ${padLeft('QTY', qtyW)} ${padLeft('RATE', rateW)} ${padLeft('AMOUNT', amtW)}\n`;
      data.items.forEach((item, i) => {
        const name = item.name.length > nameW ? item.name.substring(0, nameW - 2) + '..' : item.name;
        const qty = Number(item.quantity).toFixed(3).replace(/\.0+$/, '');
        const rate = item.unit_price.toFixed(2);
        const amt = item.total.toFixed(2);
        text += `${padRight(name, nameW)} ${padLeft(qty, qtyW)} ${padLeft(rate, rateW)} ${padLeft(amt, amtW)}\n`;
        if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
          text += `  MRP ${item.originalRate.toFixed(2)} @ ${item.unit_price.toFixed(2)}${item.discountLabel ? `  (${item.discountLabel})` : ''}\n`;
        }
      });
    } else {
      text += `${padRight('No', idxW)} ${padRight('ITEM', nameW)} ${padLeft('QTY', qtyW)} ${padLeft('RATE', rateW)} ${padLeft('AMOUNT', amtW)}\n`;
      data.items.forEach((item, i) => {
        const name = item.name.length > nameW ? item.name.substring(0, nameW - 2) + '..' : item.name;
        const qty = Number(item.quantity).toFixed(3).replace(/\.0+$/, '');
        const rate = item.unit_price.toFixed(2);
        const amt = item.total.toFixed(2);
        text += `${padRight(String(i + 1), idxW)} ${padRight(name, nameW)} ${padLeft(qty, qtyW)} ${padLeft(rate, rateW)} ${padLeft(amt, amtW)}\n`;
        if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
          text += `  MRP ${item.originalRate.toFixed(2)} @ ${item.unit_price.toFixed(2)}${item.discountLabel ? `  (${item.discountLabel})` : ''}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0) - (data.returnDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('SCRAP DEDUCTION :', labelW)}  ${padLeft(`₹-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('RETURN DEDUCTION :', labelW)}  ${padLeft(`₹-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += DASH + '\n';
    text += `${padRight('** NET PAYABLE **', labelW)}  ${padLeft(`₹${Math.max(0, finalGrandTotal).toFixed(2)}`, totalW)}\n`;
    text += DASH + '\n';

    // ── Amount in Words ──
    text += `Amount In Words: \n${numberToIndianWords(Math.max(0, finalGrandTotal))} Only.\n`;
    text += '\n';

    // ── Payment ──
    if (data.receivedAmount != null && data.balanceAmount != null) {
      text += `${padRight('AMOUNT RECEIVED :', labelW)}  ${padLeft(`₹${data.receivedAmount.toFixed(2)}`, totalW)}\n`;
      text += `${padRight('BALANCE RETURN :', labelW)}  ${padLeft(`₹${data.balanceAmount.toFixed(2)}`, totalW)}\n`;
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
          const finalTotal = Math.max(0, data.grandTotal - (data.scrapDeduction || 0));
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
    const bs = data.billSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = bs?.showShopName || bs?.showShopAddress || bs?.showPhone || bs?.showShopGstin || bs?.showShopState || bs?.showTitle || showScrapH;
    if (hasHeader) {
      text += FRAME + '\n';
      if (bs?.showShopName) text += centerText(`*** ${data.shopName} ***`, charsPerLine) + '\n';
      if (bs?.showShopAddress && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone && data.shopPhone) text += centerText(`Phone: ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showShopState && data.shopState) text += centerText(`State Code: ${data.shopState}`, charsPerLine) + '\n';
      const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
      if (bs?.showTitle || showScrap) {
        if (data.isReprint) text += centerText('--- INVOICE (REPRINT) ---', charsPerLine) + '\n';
        else {
          const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B);
          text += centerText(`--- ${docTitle} ---`, charsPerLine) + '\n';
        }
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
    if (data.billerName) text += `  Biller:      ${data.billerName}\n`;

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin)) {
      text += LIGHT + '\n';
      text += centerText('CUSTOMER DETAILS', charsPerLine) + '\n';
      if (showCustName) text += `  Name:   ${data.customerName}\n`;
      if (data.customerPhone) text += `  Phone:  ${data.customerPhone}\n`;
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `  GSTIN:  ${data.customerGstin}\n`;
    }

    text += LIGHT + '\n';

    // ── Items (numbered: "1. Name             ₹XXX") ──
    data.items.forEach((item, i) => {
      const name = item.name.length > charsPerLine - 14 ? item.name.substring(0, charsPerLine - 17) + '..' : item.name;
      const total = item.total.toFixed(2);
      const prefix = `${i + 1}. `;
      text += `${prefix}${name}${' '.repeat(Math.max(1, charsPerLine - prefix.length - name.length - total.length))}${total}\n`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `     MRP ₹${item.originalRate.toFixed(2)} → ₹${item.unit_price.toFixed(2)}`;
        text += item.discountLabel ? `  [${item.discountLabel}]\n` : '\n';
        text += `     ${item.quantity} x ${item.unit_price.toFixed(2)}\n`;
      } else {
        text += `     ${item.quantity} x ${item.unit_price.toFixed(2)}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0) - (data.returnDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Deduction:', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += `${padRight('Return Deduction:', labelW)}  ${padLeft(`-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
    }

    text += '\n';
    text += FRAME + '\n';
    text += centerText('***** GRAND TOTAL *****', charsPerLine) + '\n';
    text += centerText(`₹ ${Math.max(0, finalGrandTotal).toFixed(2)}`, charsPerLine) + '\n';
    text += FRAME + '\n';

    if (data.receivedAmount != null && data.balanceAmount != null) {
      text += `${padRight('Amount Received:', labelW)}  ${padLeft(data.receivedAmount.toFixed(2), totalW)}\n`;
      text += `${padRight('Change Due:', labelW)}  ${padLeft(data.balanceAmount.toFixed(2), totalW)}\n`;
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
          const finalTotal = Math.max(0, data.grandTotal - (data.scrapDeduction || 0));
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
    const labelW = charsPerLine - totalW - 2;

    // ── Header centered ──
    const bs = data.billSettings;
    const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
    const hasHeader = bs?.showShopName || bs?.showShopAddress || bs?.showPhone || bs?.showShopGstin || bs?.showTitle || showScrap;
    if (hasHeader) {
      if (bs?.showShopName) text += centerText(data.shopName, charsPerLine) + '\n';
      if (bs?.showShopAddress && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone && data.shopPhone) text += centerText(data.shopPhone, charsPerLine) + '\n';
      if (bs?.showShopGstin && data.shopGstin) text += centerText(`GST: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showTitle || showScrap) {
        if (data.isReprint) text += centerText('REPRINT', charsPerLine) + '\n';
        else {
          const docTitle = getDocumentTitle(data.invoiceType, false, bs?.estimateMode, data.isB2B);
          text += centerText(docTitle, charsPerLine) + '\n';
        }
      }
      text += '\n';
    }
    text += `${data.invoiceNumber}     ${data.date}\n`;
    if (data.billerName) text += `Staff: ${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin)) {
      if (showCustName && data.customerPhone) text += `${data.customerName}  ${data.customerPhone}\n`;
      else if (showCustName) text += `${data.customerName}\n`;
      else if (data.customerPhone) text += `${data.customerPhone}\n`;
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `GST: ${data.customerGstin}\n`;
    }

    // ── Items (dot leaders between name and total) ──
    const dot = (left: string, right: string, width: number): string => {
      const avail = width - left.length - right.length;
      if (avail <= 1) return left.substring(0, width - right.length - 1) + ' ' + right;
      return left + ' ' + '.'.repeat(avail - 1) + ' ' + right;
    };

    data.items.forEach(item => {
      const name = item.name.length > charsPerLine - totalW - 4 ? item.name.substring(0, charsPerLine - totalW - 7) + '..' : item.name;
      const total = item.total.toFixed(2);
      text += `${dot(name, total, charsPerLine)}\n`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `  MRP ${item.originalRate.toFixed(2)} @ ${item.unit_price.toFixed(2)}${item.discountLabel ? ` (${item.discountLabel})` : ''}\n`;
        text += `  ${item.quantity}x${item.unit_price.toFixed(2)}\n`;
      } else {
        text += `  ${item.quantity}x${item.unit_price.toFixed(2)}\n`;
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
    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) dotLine('SCRAP DEDUCTION', `-${data.scrapDeduction.toFixed(2)}`);
    text += '\n';
    text += DASH + '\n';
    text += centerText('** GRAND TOTAL **', charsPerLine) + '\n';
    text += centerText(`₹ ${Math.max(0, finalGrandTotal).toFixed(2)}`, charsPerLine) + '\n';
    text += DASH + '\n';

    // ── Payment ──
    if (data.receivedAmount != null && data.balanceAmount != null) {
      dotLine('RECEIVED', data.receivedAmount.toFixed(2));
      dotLine('CHANGE', data.balanceAmount.toFixed(2));
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
    const bs = data.billSettings;
    if (bs?.showShopName) text += `${data.shopName}\n`;
    if (bs?.showShopAddress && data.shopAddress) text += `${data.shopAddress}\n`;
    if (bs?.showPhone && data.shopPhone) text += `${data.shopPhone}\n`;
    if (bs?.showShopGstin && data.shopGstin) text += `GST: ${data.shopGstin}\n`;
    if (bs?.showTitle || (data.invoiceType === 'SCRAP' && bs?.showScrapHeading)) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B)} --`, charsPerLine) + '\n';
    text += `\n${data.invoiceNumber}  ${data.date}\n`;
    if (data.billerName) text += `${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    if (data.customerName && data.billSettings?.showCustomerName) text += `${data.customerName}\n`;
    if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `GST: ${data.customerGstin}\n`;

    // ── Items (name + total right-aligned, no qty/rate unless offer) ──
    data.items.forEach(item => {
      const name = item.name.length > charsPerLine - totalW - 2 ? item.name.substring(0, charsPerLine - totalW - 5) + '..' : item.name;
      const total = item.total.toFixed(2);
      text += `${name}${' '.repeat(Math.max(1, charsPerLine - name.length - total.length))}${total}\n`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += ` ${item.quantity}x${item.unit_price.toFixed(2)}  MRP ${item.originalRate.toFixed(2)}${item.discountLabel ? ` (${item.discountLabel})` : ''}\n`;
      } else {
        text += ` ${item.quantity}x${item.unit_price.toFixed(2)}\n`;
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
    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) text += `${padRight('SCRAP', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    text += '\n';
    text += `${padRight('** GRAND TOTAL **', labelW)}  ${padLeft(Math.max(0, finalGrandTotal).toFixed(2), totalW)}\n`;
    text += '\n';

    // ── Payment ──
    if (data.receivedAmount != null && data.balanceAmount != null) {
      text += `${padRight('RECEIVED', labelW)}  ${padLeft(data.receivedAmount.toFixed(2), totalW)}\n`;
      text += `${padRight('CHANGE', labelW)}  ${padLeft(data.balanceAmount.toFixed(2), totalW)}\n`;
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
    const bs = data.billSettings;
    const showScrapH = data.invoiceType === 'SCRAP' && bs?.showScrapHeading;
    const hasHeader = bs?.showShopName || bs?.showShopAddress || bs?.showPhone || bs?.showShopGstin || bs?.showTitle || showScrapH;
    if (hasHeader) {
      text += THICK + '\n';
      if (bs?.showShopName) text += centerText(` ${data.shopName} `, charsPerLine) + '\n';
      if (bs?.showShopAddress && data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
      if (bs?.showPhone && data.shopPhone) text += centerText(`\u260E ${data.shopPhone}`, charsPerLine) + '\n';
      if (bs?.showShopGstin && data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
      if (bs?.showTitle || showScrapH) text += centerText(`-- ${getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B)} --`, charsPerLine) + '\n';
      text += THICK + '\n';
    }
    text += `  Invoice: ${data.invoiceNumber}\n`;
    text += `  Date:    ${data.date}\n`;
    if (data.billerName) text += `  Staff:   ${data.billerName}\n`;
    text += '\n';

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin)) {
      text += THIN + '\n';
      text += centerText('CUSTOMER', charsPerLine) + '\n';
      if (showCustName) text += `  ${data.customerName}\n`;
      if (data.customerPhone) text += `  ${data.customerPhone}\n`;
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += `  GSTIN: ${data.customerGstin}\n`;
      text += '\n';
    }

    // ── Items (numbered with blank line between groups) ──
    text += THIN + '\n';
    text += centerText('ITEMS', charsPerLine) + '\n';
    text += THIN + '\n';

    data.items.forEach((item, i) => {
      const name = item.name.length > charsPerLine - 14 ? item.name.substring(0, charsPerLine - 17) + '..' : item.name;
      const total = item.total.toFixed(2);
      const prefix = `${i + 1}.`;
      text += `${prefix} ${name}${' '.repeat(Math.max(1, charsPerLine - prefix.length - 1 - name.length - total.length))}${total}\n`;
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `     ${item.quantity} \u00D7 ${item.unit_price.toFixed(2)}`;
        text += `    MRP \u20B9${item.originalRate.toFixed(2)}`;
        text += item.discountLabel ? ` (${item.discountLabel})` : '';
        text += '\n';
      } else {
        text += `     ${item.quantity} \u00D7 ${item.unit_price.toFixed(2)}\n`;
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
    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Deduction', labelW)}  ${padLeft(`-\u20B9${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
    }
    text += '\n';
    text += THICK + '\n';
    text += centerText('* * * GRAND TOTAL * * *', charsPerLine) + '\n';
    text += centerText(`\u20B9 ${Math.max(0, finalGrandTotal).toFixed(2)}`, charsPerLine) + '\n';
    text += THICK + '\n';

    // ── Payment ──
    if (data.receivedAmount != null && data.balanceAmount != null) {
      text += `${padRight('Received', labelW)}  ${padLeft(`\u20B9${data.receivedAmount.toFixed(2)}`, totalW)}\n`;
      text += `${padRight('Change', labelW)}  ${padLeft(`\u20B9${data.balanceAmount.toFixed(2)}`, totalW)}\n`;
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
          const finalTotal = Math.max(0, data.grandTotal - (data.scrapDeduction || 0));
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
  //  BILL — Boxed receipt with +--+ borders, product table, tax breakup, round-off
  // ══════════════════════════════════════════════════════════════════════════════
  else if (style === 'bill') {
    // ── Helpers ──
    const boxLine = (content: string) => '│' + content + '│\n';
    const boxSep = (segments: number[]) => {
      let s = '├';
      for (const w of segments) s += '─'.repeat(w) + '┼';
      return s.slice(0, -1) + '┤\n';
    };
    const boxRow = (cells: string[], widths: number[]) => {
      let line = '│';
      cells.forEach((c, i) => {
        line += (c.length > widths[i] ? c.substring(0, widths[i]) : c.padEnd(widths[i])) + '│';
      });
      return line + '\n';
    };

    const topBox = () => `┌${'─'.repeat(charsPerLine - 2)}┐\n`;
    const botBox = () => `└${'─'.repeat(charsPerLine - 2)}┘\n`;
    const midBox = () => `├${'─'.repeat(charsPerLine - 2)}┤\n`;

    // ── Header ──
    const bs = data.billSettings;
    text += topBox();
    if (bs?.showShopGstin && data.shopGstin) {
      const gstLine = ` GSTIN: ${data.shopGstin}`;
      const phoneLine = data.shopPhone ? `Ph: ${data.shopPhone}` : '';
      const avail = charsPerLine - 2 - gstLine.length;
      text += boxLine(gstLine + (phoneLine ? ' '.repeat(Math.max(2, avail - phoneLine.length)) + phoneLine : ' '.repeat(avail)));
    }
    if (bs?.showShopName) text += boxLine(centerText(data.shopName, charsPerLine - 2)) + '\n';
    if (bs?.showShopAddress && data.shopAddress) text += boxLine(centerText(data.shopAddress, charsPerLine - 2));
    text += midBox();

    // ── Document Title ──
    const showScrap = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
    if (bs?.showTitle || showScrap) {
      const docTitle = getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B);
      text += boxLine(centerText(docTitle, charsPerLine - 2));
      text += midBox();
    }

    // ── Bill Info ──
    const invLabel = data.invoiceType === 'RETURN' ? 'RET No' : 'Bill No';
    const dateStr = `${data.date}`;
    const billInfoLine = `${invLabel} : ${data.invoiceNumber}`;
    const spaceAvail = charsPerLine - 2 - billInfoLine.length;
    const datePart = `Date : ${dateStr}`;
    text += boxLine(billInfoLine + ' '.repeat(Math.max(1, spaceAvail - datePart.length)) + datePart);
    if (data.invoiceType === 'RETURN' && data.referenceInvoiceNumber) {
      text += boxLine(`Ref Inv: ${data.referenceInvoiceNumber}`);
    }
    if (data.invoiceType === 'RETURN' && data.refundMethod) {
      text += boxLine(`Refund: ${data.refundMethod}`);
    }
    if (data.billerName) text += boxLine(`Staff: ${data.billerName}`);

    // ── Customer ──
    const showCustName = data.customerName && data.billSettings?.showCustomerName;
    if (showCustName || data.customerPhone || (data.customerGstin && data.billSettings?.showCustomerGstin) || data.customerAddress) {
      text += midBox();
      text += boxLine(` Customer Details:`);
      if (data.customerName) text += boxLine(` Name    : ${data.customerName}`);
      if (data.customerAddress) text += boxLine(` Address : ${data.customerAddress}`);
      if (data.customerPhone) text += boxLine(` Contact : ${data.customerPhone}`);
      if (data.customerGstin && data.billSettings?.showCustomerGstin) text += boxLine(` GSTIN   : ${data.customerGstin}`);
    }

    // ── Item Table ──
    // Column layout adapts to width
    const sepW = 1;
    const idxW = 3;  // "Sr#" or "Sr"
    let qtyW = 6;    // adjust
    let mrpW: number | null = null;
    let rateW = 6;
    let amtW = 6;
    let nameW: number;

    if (charsPerLine >= 42) {
      // Full table with MRP
      mrpW = 6;
      nameW = charsPerLine - 2 - idxW - sepW - qtyW - sepW - mrpW - sepW - rateW - sepW - amtW - sepW * 5;
      if (nameW < 5) { nameW = 8; mrpW = 0; }
    } else if (charsPerLine >= 36) {
      // With MRP
      mrpW = 6;
      qtyW = 5;
      rateW = 6;
      amtW = 6;
      nameW = charsPerLine - 2 - idxW - sepW - qtyW - sepW - mrpW - sepW - rateW - sepW - amtW - sepW * 5;
      if (nameW < 5) { nameW = 7; mrpW = 0; }
    } else {
      // No MRP, compact
      mrpW = null;
      qtyW = 5;
      rateW = 5;
      amtW = 6;
      nameW = charsPerLine - 2 - idxW - sepW - qtyW - sepW - rateW - sepW - amtW - sepW * 4;
      if (nameW < 4) { nameW = 4; amtW = 5; rateW = 4; qtyW = 4; }
    }

    // Build column widths array
    const colWidths: number[] = [idxW];
    const colLabels: string[] = ['Sr#'];
    colWidths.push(nameW); colLabels.push('Product');
    colWidths.push(qtyW); colLabels.push('Qty');
    if (mrpW && mrpW > 0) { colWidths.push(mrpW); colLabels.push('MRP'); }
    colWidths.push(rateW); colLabels.push('Rate');
    colWidths.push(amtW); colLabels.push('Amt');

    // Header separator
    text += midBox();
    text += boxRow(colLabels, colWidths);
    text += boxSep(colWidths);

    // Items
    data.items.forEach((item, i) => {
      const idx = String(i + 1);
      const name = item.name;
      const qty = String(item.quantity);
      const rate = item.unit_price.toFixed(2);
      const amt = item.total.toFixed(2);
      const mrpStr = item.originalRate ? item.originalRate.toFixed(2) : '';

      const cells = [idx, name, qty];
      if (mrpW && mrpW > 0) cells.push(mrpStr);
      cells.push(rate, amt);
      text += boxRow(cells, colWidths);

      // Show MRP savings or pack info
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        const savings = `MRP ${item.originalRate.toFixed(2)} @ ${item.unit_price.toFixed(2)}`;
        const info = `${savings}${item.discountLabel ? ` (${item.discountLabel})` : ''}`;
        text += boxLine(` ${info.substring(0, charsPerLine - 4)}`);
      }
    });

    // Table footer
    text += boxSep(colWidths);

    // ── Totals ──
    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0) - (data.returnDeduction || 0);
    const totalLabel = 'Total';
    const totalAmt = data.subtotal.toFixed(2);
    text += boxLine(` ${padRight(totalLabel, charsPerLine - 4 - totalAmt.length - 2)} | ${totalAmt}`);

    if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `Discount (${data.discountValue}%)` : 'Discount';
      text += boxLine(` ${padRight(dLabel, charsPerLine - 4 - 6 - 2)} | -${data.discount.toFixed(2)}`);
    }

    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += boxLine(` ${padRight('Scrap Deduction', charsPerLine - 4 - 8 - 2)} | -${data.scrapDeduction.toFixed(2)}`);
    }
    if (data.returnDeduction && data.returnDeduction > 0) {
      text += boxLine(` ${padRight('Return Deduction', charsPerLine - 4 - 8 - 2)} | -${data.returnDeduction.toFixed(2)}`);
    }

    const roundOff = Math.round(finalGrandTotal) - finalGrandTotal;
    const netTotal = Math.round(finalGrandTotal);
    if (Math.abs(roundOff) > 0) {
      text += boxLine(` ${padRight('Round Off', charsPerLine - 4 - 6 - 2)} | ${roundOff.toFixed(2)}`);
    }
    text += boxLine(` ${padRight('Net Total', charsPerLine - 4 - 6 - 2)} | ${Math.max(0, netTotal).toFixed(2)}`);

    // ── You Saved (skip for scrap) ──
    if (data.invoiceType !== 'SCRAP') {
      const perProductSavings = data.items.reduce((sum, item) => {
        if (item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
        return sum;
      }, 0);
      const totalSaved = perProductSavings + data.discount;
      if (totalSaved > 0) {
        text += boxLine(centerText(`YOU SAVED ₹${totalSaved.toFixed(2)}`, charsPerLine - 2));
      }
    }

    text += midBox();

    // ── Tax Breakup Table ──
    if (data.tax > 0) {
      const taxCols = ['Taxable', 'CGST', 'SGST', 'IGST', 'Total GST'];
      const taxW = Math.floor((charsPerLine - 2 - 6) / 5);
      const taxWidths = [taxW, taxW, taxW, taxW, charsPerLine - 2 - taxW * 4 - 4];
      text += boxRow(taxCols, taxWidths);
      text += boxSep(taxWidths);
      const taxable = (data.subtotal).toFixed(2);
      const cgst = data.cgst ? data.cgst.toFixed(2) : '0.00';
      const sgst = data.sgst ? data.sgst.toFixed(2) : '0.00';
      const igst = data.igst ? data.igst.toFixed(2) : '0.00';
      const totalGst = data.tax.toFixed(2);
      text += boxRow([taxable, cgst, sgst, igst, totalGst], taxWidths);
      text += midBox();
    }

    // ── Amount in Words ──
    text += boxLine(` Amount in Words: `);
    text += boxLine(centerText(`${numberToIndianWords(Math.max(0, netTotal))} ONLY`, charsPerLine - 2));
    text += midBox();

    // ── Instructions / Terms ──
    const instr = data.billSettings?.instructions;
    if (instr) {
      text += boxLine(` Terms & Conditions`);
      const lines = instr.split('\n').filter(l => l.trim());
      for (const line of lines) {
        text += boxLine(centerText(line.trim(), charsPerLine - 2));
      }
      text += midBox();
    }

    // ── Barcode placeholder ──
    const barcodeChars = '|'.repeat(Math.min(charsPerLine - 6, 14));
    text += boxLine(centerText(barcodeChars, charsPerLine - 2));
    text += boxLine(centerText('BARCODE', charsPerLine - 2));
    text += midBox();

    // ── QR + Loyalty Points ──
    const points = data.pointsEarned || data.previousPointsBalance || data.pointsRedeemed || data.remainingPointsBalance;
    if (data.upiId || points) {
      if (data.upiId) {
        text += boxLine(` [QR CODE]${' '.repeat(2)}${data.upiId}`);
        if (data.showUpiQr) {
          try {
            const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${Math.max(0, netTotal).toFixed(2)}&cu=INR`;
            text += '[[QR:' + upiUrl + ']]\n';
          } catch {}
        }
      }
      if (points) {
        text += boxLine(` Bill Points    : ${(data.pointsEarned || 0).toFixed(2)}`);
        text += boxLine(` Used Points    : ${(data.pointsRedeemed || 0).toFixed(0)}`);
        if (data.pointsRedeemedDiscount) text += boxLine(` Used Amount    : ${data.pointsRedeemedDiscount.toFixed(2)}`);
        text += boxLine(` Balance Points : ${(data.remainingPointsBalance || 0).toFixed(2)}`);
      }
      text += midBox();
    }

    // ── Footer ──
    text += boxLine(centerText('Thank You. Visit Again.', charsPerLine - 2));
    text += botBox();
  }

  return text;
}

