import { getCurrencyPrefix } from '../../../localization/storeProfile';
import { formatPrintItem, shouldShowItemMrp, numberToIndianWords, getDocumentTitle, formatBalanceLines, formatTaxBreakupSection } from '../receiptCore';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "clean": CLEAN — Follows lines, table with RATE col, Amount in Words, traditional invoice */
export function renderCleanReceipt(ctx: ReceiptTextContext): string {
  const { data, charsPerLine, centerText, padRight, padLeft, wrapText, selectedBillSettings, printFullName, showBrand, isRateQty, appendInstructions, appendLoyaltyBlock } = ctx;
  let text = '';
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
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      text += `Note: ${billDesc.trim()}\n`;
    }
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
      if (fmt.pcsInfo) text += `  Qty: ${fmt.pcsInfo}\n`;
      if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
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
      if (fmt.pcsInfo) text += `  Qty: ${fmt.pcsInfo}\n`;
      if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
        text += `  MRP ${item.originalRate.toFixed(2)} @ ${fmt.displayRate}${item.discountLabel ? `  (${item.discountLabel})` : ''}\n`;
      }
    });
  }
  text += '\n';

  // ── Totals ──
  text += `${padRight('SUB TOTAL :', labelW)}  ${padLeft(`${getCurrencyPrefix()}${data.subtotal.toFixed(2)}`, totalW)}\n`;
  if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
    text += `${padRight('EXTRA / BONUS :', labelW)}  ${padLeft(`${getCurrencyPrefix()}+${data.extraBonus.toFixed(2)}`, totalW)}\n`;
  } else if (data.discount > 0) {
    const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `DISCOUNT (${data.discountValue}%) :` : 'DISCOUNT :';
    text += `${padRight(dLabel, labelW)}  ${padLeft(`${getCurrencyPrefix()}-${data.discount.toFixed(2)}`, totalW)}\n`;
  }

  const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
  const netPayable = Math.max(0, data.grandTotal - totalDeductions);
  const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
  text += `${padRight('Grand Total :', labelW)}  ${padLeft(`${getCurrencyPrefix()}${data.grandTotal.toFixed(2)}`, totalW)}\n`;
  if (data.scrapDeduction && data.scrapDeduction > 0) {
    text += `${padRight('Scrap Return Amount :', labelW)}  ${padLeft(`${getCurrencyPrefix()}-${data.scrapDeduction.toFixed(2)}`, totalW)}\n`;
  }
  if (data.returnDeduction && data.returnDeduction > 0) {
    text += `${padRight('Return Credit :', labelW)}  ${padLeft(`${getCurrencyPrefix()}-${data.returnDeduction.toFixed(2)}`, totalW)}\n`;
  }

  text += '\n';
  text += DASH + '\n';
  text += `${padRight('** GRAND TOTAL **', labelW)}  ${padLeft(`${getCurrencyPrefix()}${data.grandTotal.toFixed(2)}`, totalW)}\n`;
  text += DASH + '\n';

  if (totalDeductions > 0) {
    if (refundAmount > 0) {
      text += `${padRight('** REFUND AMOUNT **', labelW)}  ${padLeft(`${getCurrencyPrefix()}${refundAmount.toFixed(2)}`, totalW)}\n`;
      text += DASH + '\n';
      text += `Amount In Words: \n${numberToIndianWords(refundAmount)} Only.\n`;
    } else {
      text += `${padRight('** NET PAYABLE **', labelW)}  ${padLeft(`${getCurrencyPrefix()}${netPayable.toFixed(2)}`, totalW)}\n`;
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
      if (shouldShowItemMrp(data, item) && item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
      return sum;
    }, 0);
    const totalSaved = perProductSavings + data.discount;
    if (totalSaved > 0) {
      text += centerText(`YOU SAVED ${getCurrencyPrefix()}${totalSaved.toFixed(2)}`, charsPerLine) + '\n';
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
      } catch { /* ignore */ }
    }
  }

  // ── Tax Breakup ──
  text += formatTaxBreakupSection(data, charsPerLine, padLeft, padRight, centerText, '-');

  // ── Loyalty Points ──
  text = appendLoyaltyBlock(text);

  // ── Instructions ──
  text = appendInstructions(text);

  // ── Footer ──
  text += centerText('Thank You, Visit Again!', charsPerLine) + '\n';
  text += '\n';
  return text;
}
