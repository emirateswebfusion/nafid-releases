import { formatPrintItem, shouldShowItemMrp, getDocumentTitle, formatBalanceLines, formatTaxBreakupSection } from '../receiptCore';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "luxe": LUXE — Elegant with section headers, padded borders, refined spacing */
export function renderLuxeReceipt(ctx: ReceiptTextContext): string {
  const { data, charsPerLine, centerText, padRight, padLeft, wrapText, selectedBillSettings, printFullName, showBrand, isRateQty, appendInstructions, appendLoyaltyBlock } = ctx;
  let text = '';
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
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      text += `  Note: ${billDesc.trim()}\n`;
    }
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
    if (fmt.pcsInfo) text += `     Qty: ${fmt.pcsInfo}\n`;
    const qtyRateText = isRateQty ? `${fmt.displayRate} \u00D7 ${fmt.displayQty}` : `${fmt.displayQty} \u00D7 ${fmt.displayRate}`;
    if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
      text += `     ${qtyRateText}`;
      text += `    MRP \u20B9${item.originalRate.toFixed(2)}`;
      text += item.discountLabel ? ` (${item.discountLabel})` : '';
      text += '\n';
    } else {
      text += `     ${qtyRateText}\n`;
      if (shouldShowItemMrp(data, item) && item.discountLabel) text += `     ${item.discountLabel}\n`;
    }
  });
  text += '\n';

  // ── Totals ──
  text += THIN + '\n';
  text += `${padRight('Subtotal', labelW)}  ${padLeft(`\u20B9${data.subtotal.toFixed(2)}`, totalW)}\n`;
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
  if (data.invoiceType !== 'SCRAP') {
    const perProductSavings = data.items.reduce((sum, item) => {
      if (shouldShowItemMrp(data, item) && item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
      return sum;
    }, 0);
    const totalSaved = perProductSavings + data.discount;
    if (totalSaved > 0) {
      text += centerText(`You Saved \u20B9${totalSaved.toFixed(2)}`, charsPerLine) + '\n';
      text += THIN + '\n';
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
      } catch { /* ignore */ }
    }
    text += THIN + '\n';
  }

  // ── Tax Breakup ──
  text += formatTaxBreakupSection(data, charsPerLine, padLeft, padRight, centerText, '-');

  // ── Loyalty Points ──
  text = appendLoyaltyBlock(text);

  // ── Instructions ──
  text = appendInstructions(text);

  // ── Footer ──
  text += centerText('Thank You, Visit Again!', charsPerLine) + '\n';
  text += THIN + '\n';
  return text;
}
