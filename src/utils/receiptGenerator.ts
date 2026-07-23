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
    default: return 'INVOICE';
  }
}

export function generateReceiptText(data: ReceiptData, widthCm: number = 5.8, charsPerLine?: number, style: 'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' = 'standard'): string {
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
    text += `  INV No:  ${data.invoiceNumber}\n`;
    text += `  Date:    ${data.date}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('SCRAP DEDUCTION', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
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
    text += `${data.invoiceNumber}  ${data.date}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
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
    text += `  INV:  ${data.invoiceNumber}\n`;
    text += `  Date: ${data.date}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('SCRAP', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
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

    // ── Meta ──
    text += `Date: ${data.date}\n`;
    text += `Receipt No: ${data.invoiceNumber}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('SCRAP DEDUCTION :', labelW)}  ${padLeft(`₹-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
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
    text += `  Invoice No:  ${data.invoiceNumber}\n`;
    text += `  Date:        ${data.date}\n`;
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

    const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
    if (data.scrapDeduction && data.scrapDeduction > 0) {
      text += `${padRight('Scrap Deduction:', labelW)}  ${padLeft(`-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
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

    // ── Footer ──
    text += centerText('Thank You, Visit Again!', charsPerLine) + '\n';
    text += THIN + '\n';
  }

  return text;
}

