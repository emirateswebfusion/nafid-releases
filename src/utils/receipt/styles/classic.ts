import { formatPrintItem, shouldShowItemMrp, getDocumentTitle, formatBalanceLines } from '../receiptCore';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "classic": CLASSIC — Ornate vintage, *** banners, verbose labels, numbered items */
export function renderClassicReceipt(ctx: ReceiptTextContext): string {
  const { data, charsPerLine, centerText, padRight, padLeft, wrapText, selectedBillSettings, printFullName, showBrand, isRateQty, appendInstructions, appendLoyaltyBlock } = ctx;
  let text = '';
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
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      text += `  Note:    ${billDesc.trim()}\n`;
    }
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
    if (fmt.pcsInfo) text += `     Qty: ${fmt.pcsInfo}\n`;
    const qtyRateText = isRateQty ? `${fmt.displayRate} x ${fmt.displayQty}` : `${fmt.displayQty} x ${fmt.displayRate}`;
    if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
      text += `     MRP ₹${item.originalRate.toFixed(2)} → ₹${fmt.displayRate}`;
      text += item.discountLabel ? `  [${item.discountLabel}]\n` : '\n';
      text += `     ${qtyRateText}\n`;
    } else {
      text += `     ${qtyRateText}\n`;
      if (shouldShowItemMrp(data, item) && item.discountLabel) text += `     [${item.discountLabel}]\n`;
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
      if (shouldShowItemMrp(data, item) && item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
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
      } catch { /* ignore */ }
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
  return text;
}
