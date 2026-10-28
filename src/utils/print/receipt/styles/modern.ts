import { formatPrintItem, shouldShowItemMrp, getDocumentTitle, formatBalanceLines, formatTaxBreakupSection } from '../receiptCore';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "modern": MODERN — Chic with ✦ stars, ▸ bullets, [brackets], >> arrows */
export function renderModernReceipt(ctx: ReceiptTextContext): string {
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
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      text += `  Note: ${billDesc.trim()}\n`;
    }
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
    if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
      text += `  MRP ₹${item.originalRate.toFixed(2)} → ₹${fmt.displayRate}`;
      text += item.discountLabel ? ` (~ ${item.discountLabel})\n` : '\n';
      text += `  ${qtyRateText}\n`;
    } else {
      text += `  ${qtyRateText}\n`;
      if (shouldShowItemMrp(data, item) && item.discountLabel) text += `  ~ ${item.discountLabel}\n`;
    }
  });

  text += THIN + '\n';

  // ── Totals ──
  text += `${padRight('SUBTOTAL', labelW)}  ${padLeft(data.subtotal.toFixed(2), totalW)}\n`;
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
      if (shouldShowItemMrp(data, item) && item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
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
  text += centerText('✦ Thank You! ✦', charsPerLine) + '\n';
  text += centerText('Visit Again', charsPerLine) + '\n';
  return text;
}
