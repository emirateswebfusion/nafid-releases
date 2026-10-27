import { formatPrintItem, shouldShowItemMrp, getDocumentTitle, formatBalanceLines } from '../receiptCore';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "slim": SLIM — Ultra minimal, no lines, bare essentials */
export function renderSlimReceipt(ctx: ReceiptTextContext): string {
  const { data, charsPerLine, centerText, padRight, padLeft, wrapText, selectedBillSettings, printFullName, showBrand, isRateQty, appendInstructions, appendLoyaltyBlock } = ctx;
  let text = '';
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
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      text += `Note: ${billDesc.trim()}\n`;
    }
  }

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
    if (fmt.pcsInfo) text += ` Qty: ${fmt.pcsInfo}\n`;
    const qtyRateText = isRateQty ? `${fmt.displayRate}x${fmt.displayQty}` : `${fmt.displayQty}x${fmt.displayRate}`;
    if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
      text += ` ${qtyRateText}  MRP ${item.originalRate.toFixed(2)}${item.discountLabel ? ` (${item.discountLabel})` : ''}\n`;
    } else {
      text += ` ${qtyRateText}\n`;
      if (shouldShowItemMrp(data, item) && item.discountLabel) text += ` ${item.discountLabel}\n`;
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
      if (shouldShowItemMrp(data, item) && item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
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
  return text;
}
