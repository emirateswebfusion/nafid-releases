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

export function generateReceiptText(data: ReceiptData, widthCm: number = 5.8, charsPerLine?: number, style: 'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'boxed' = 'standard'): string {
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
    // Layout: "N. " (idxW+1=3) + name + " " + qty + " " + amt = charsPerLine
    // so nameW = charsPerLine - (idxW+1) - 1 - qtyW - 1 - amtW
    const qtyW = 4;
    const amtW = 8;
    const idxW = 2;
    const nameW = charsPerLine - (idxW + 1) - 1 - qtyW - 1 - amtW;

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
        // Rate | Weight | Total sub-line for scrap items
        const subLine = `  ${padLeft(item.unit_price.toFixed(2), 7)} ${padLeft(String(item.quantity), 5)} ${padLeft(item.total.toFixed(2), 8)}`;
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
      data.items.forEach((item) => {
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
    const B_ROW = (cells: string[], widths: number[]): string => {
      let line = '│';
      cells.forEach((c, i) => {
        const w = widths[i];
        const paddedCell = c.length > w ? c.substring(0, w) : c.padEnd(w);
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
    const bs = data.billSettings;
    text += B_TOP();

    // GSTIN on line 1, phone on line 2 (separate lines)
    if (bs?.showShopGstin && data.shopGstin) {
      text += B_LINE(centerText(`GSTIN: ${data.shopGstin}`, INNER));
    }
    if (bs?.showPhone && data.shopPhone) {
      text += B_LINE(centerText(`Ph: ${data.shopPhone}`, INNER));
    }

    // Shop name — UPPERCASE, centered
    if (bs?.showShopName) text += B_LINE(centerText(data.shopName.toUpperCase(), INNER));

    // Address — centered, split on comma if needed
    if (bs?.showShopAddress && data.shopAddress) {
      const addr = data.shopAddress;
      if (addr.length <= INNER) {
        text += B_LINE(centerText(addr, INNER));
      } else {
        const mid = addr.lastIndexOf(',', Math.floor(addr.length / 2) + 10);
        if (mid > 0) {
          text += B_LINE(centerText(addr.substring(0, mid + 1).trim(), INNER));
          text += B_LINE(centerText(addr.substring(mid + 1).trim(), INNER));
        } else {
          text += B_LINE(centerText(addr.substring(0, INNER), INNER));
        }
      }
    }

    text += B_MID();

    // ── Document Title ────────────────────────────────────────────────────────
    const showScrapT = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
    if (bs?.showTitle || showScrapT) {
      const docTitle = getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B);
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
    if (data.billerName) text += B_LINE(` Staff: ${data.billerName}`);

    // ── Customer Details ──────────────────────────────────────────────────────
    const showCN = data.customerName && bs?.showCustomerName;
    if (showCN || data.customerPhone || (data.customerGstin && bs?.showCustomerGstin) || data.customerAddress) {
      text += B_MID();
      text += B_LINE(' Customer Details:');
      if (data.customerName && showCN) text += B_LINE(` Name    : ${data.customerName}`);
      if (data.customerAddress) text += B_LINE(` Address : ${data.customerAddress}`);
      if (data.customerPhone) text += B_LINE(` Contact : ${data.customerPhone}`);
      if (data.customerGstin && bs?.showCustomerGstin) text += B_LINE(` GSTIN   : ${data.customerGstin}`);
    }

    // ── Item Table ────────────────────────────────────────────────────────────
    // Correct formula: sum(colWidths) = INNER - N_cols
    // so every B_ROW line = │ + sum(widths) + N pipes = 1+sum+N = charsPerLine ✓

    let colWidths: number[];
    let colLabels: string[];
    let nameW: number;
    let idxW: number;
    let qtyW: number;
    let rateW: number;
    let amtW: number;
    let mrpW: number | null;

    if (charsPerLine >= 42) {
      // 6 cols: Sr(2) Product Qty(4) MRP(6) Rate(6) Amt(7)
      // B_ROW: 1 + sum + 6 = charsPerLine  =>  sum = charsPerLine - 7
      idxW = 2; qtyW = 4; mrpW = 6; rateW = 6; amtW = 7;
      nameW = (charsPerLine - 7) - (idxW + qtyW + mrpW + rateW + amtW);
      colWidths = [idxW, nameW, qtyW, mrpW, rateW, amtW];
      colLabels = ['Sr', 'Product', 'Qty', 'MRP', 'Rate', 'Amount'];
    } else if (charsPerLine >= 36) {
      // 5 cols: Sr(2) Product Qty(3) Rate(6) Amt(7)
      // B_ROW: 1 + sum + 5 = charsPerLine  =>  sum = charsPerLine - 6
      idxW = 2; qtyW = 3; mrpW = null; rateW = 6; amtW = 7;
      nameW = (charsPerLine - 6) - (idxW + qtyW + rateW + amtW);
      colWidths = [idxW, nameW, qtyW, rateW, amtW];
      colLabels = ['Sr', 'Product', 'Qty', 'Rate', 'Amount'];
    } else {
      // 5 cols: Sr(2) Product Qty(3) Rate(5) Amt(5)
      // B_ROW: 1 + sum + 5 = charsPerLine  =>  sum = charsPerLine - 6
      idxW = 2; qtyW = 3; mrpW = null; rateW = 5; amtW = 5;
      nameW = (charsPerLine - 6) - (idxW + qtyW + rateW + amtW);
      if (nameW < 4) { nameW = 4; }
      colWidths = [idxW, nameW, qtyW, rateW, amtW];
      colLabels = ['Sr', 'Product', 'Qty', 'Rate', 'Amt'];
    }

    text += B_MID();
    text += B_ROW(colLabels, colWidths);
    text += B_SEP(colWidths);

    data.items.forEach((item, i) => {
      const idx = String(i + 1);
      const qty = String(item.quantity);
      const rate = item.unit_price.toFixed(2);
      const amt = item.total.toFixed(2);
      const mrpStr = mrpW && item.originalRate ? item.originalRate.toFixed(2) : '';

      // Truncate name to nameW (clean, no wrapping)
      const name = item.name.length > nameW
        ? item.name.substring(0, nameW - 2) + '..'
        : item.name;

      const cells = mrpW
        ? [idx, name, qty, mrpStr, rate, amt]
        : [idx, name, qty, rate, amt];
      text += B_ROW(cells, colWidths);

      // MRP offer note — aligned under the Product column with Sr. column divider intact
      if (data.showProductOffers !== false && item.originalRate != null && item.originalRate !== item.unit_price) {
        const offerWidths = [idxW, INNER - idxW - 1];
        // 1. Add a small gap row before the offer note (45% line-height) - no extra column dividers
        text += '[[LH:0.45]]' + B_ROW(['', ''], offerWidths);

        const offerLabel = ` MRP ${item.originalRate.toFixed(2)} @ ${item.unit_price.toFixed(2)}${item.discountLabel ? ` (${item.discountLabel})` : ''}`;
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
    // Format: │ Label                    |   123.00│
    // val field is right-aligned within valW chars; label fills the rest
    const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
    const netPayable = Math.max(0, data.grandTotal - totalDeductions);
    const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
    const netTotal = Math.round(netPayable);
    const roundOff = Math.round(netPayable) - netPayable;
    const refundTotal = Math.round(refundAmount);
    const refundRoundOff = Math.round(refundAmount) - refundAmount;

    // Align totals vertical separator exactly with the table's Amount column divider
    const VAL_W = amtW;                     // width of value field aligns with Amount col
    const LAB_W = INNER - VAL_W - 1;        // label fills rest; label + '│' + val = INNER
    const tRow = (label: string, val: string) => {
      const l = label.length > LAB_W ? label.substring(0, LAB_W) : label.padEnd(LAB_W);
      const v = val.length > VAL_W ? val.substring(0, VAL_W) : val.padStart(VAL_W);
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
      // 5 tax cols: B_ROW 1+sum+5=charsPerLine => sum=charsPerLine-6
      const taxSum = charsPerLine - 6;
      const tw = Math.floor(taxSum / 5);
      const twLast = taxSum - tw * 4;
      const taxWidths = [tw, tw, tw, tw, twLast];
      const taxCols = ['Taxable', 'CGST', 'SGST', 'IGST', 'Total GST'];
      text += B_ROW(taxCols, taxWidths);
      text += B_SEP(taxWidths);
      text += B_ROW(
        [
          data.subtotal.toFixed(2),
          data.cgst ? data.cgst.toFixed(2) : '0.00',
          data.sgst ? data.sgst.toFixed(2) : '0.00',
          data.igst ? data.igst.toFixed(2) : '0.00',
          data.tax.toFixed(2),
        ],
        taxWidths
      );
      text += B_MID();
    }

    // ── Amount in Words ───────────────────────────────────────────────────────
    text += B_LINE(' Amount in Words:');
    {
      const amountWords = `${numberToIndianWords(Math.max(0, netTotal))} ONLY`;
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

    // ── Barcode ───────────────────────────────────────────────────────────────
    const bcChars = '|'.repeat(Math.min(INNER - 2, 18));
    text += B_LINE(centerText(bcChars, INNER));
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
      // Align loyalty vertical separator with the Amount column divider
      const ptLW = INNER - amtW - 1;
      const ptVW = amtW;
      const ptRow = (l: string, v: string) =>
        B_LINE((l.length > ptLW ? l.substring(0, ptLW) : l.padEnd(ptLW)) + '│' + (v.length > ptVW ? v.substring(0, ptVW) : v.padStart(ptVW)));
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
