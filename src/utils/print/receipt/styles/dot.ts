import { getCurrencyPrefix } from '../../../localization/storeProfile';
import { formatPrintItem, shouldShowItemMrp, getDocumentTitle, formatBalanceLines, formatTaxBreakupSection } from '../receiptCore';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "dot": DOT — Dot-leader retail style (item ... price) */
export function renderDotReceipt(ctx: ReceiptTextContext): string {
  const { data, charsPerLine, centerText, padRight, padLeft, wrapText, selectedBillSettings, printFullName, showBrand, isRateQty, appendInstructions, appendLoyaltyBlock } = ctx;
  let text = '';
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
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      text += `Note: ${billDesc.trim()}\n`;
    }
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
    if (fmt.pcsInfo) text += `  Qty: ${fmt.pcsInfo}\n`;
    const qtyRateText = isRateQty ? `${fmt.displayRate}x${fmt.displayQty}` : `${fmt.displayQty}x${fmt.displayRate}`;
    if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
      text += `  MRP ${item.originalRate.toFixed(2)} @ ${fmt.displayRate}${item.discountLabel ? ` (${item.discountLabel})` : ''}\n`;
      text += `  ${qtyRateText}\n`;
    } else {
      text += `  ${qtyRateText}\n`;
      if (shouldShowItemMrp(data, item) && item.discountLabel) text += `  ${item.discountLabel}\n`;
    }
  });
  text += DASH + '\n';

  // ── Totals ──
  const dotLine = (label: string, value: string) => text += `${dot(label, value, charsPerLine)}\n`;
  dotLine('SUBTOTAL', data.subtotal.toFixed(2));
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
  text += centerText(`${getCurrencyPrefix()} ${data.grandTotal.toFixed(2)}`, charsPerLine) + '\n';
  text += DASH + '\n';

  if (totalDeductions > 0) {
    if (refundAmount > 0) {
      text += centerText('** REFUND AMOUNT **', charsPerLine) + '\n';
      text += centerText(`${getCurrencyPrefix()} ${refundAmount.toFixed(2)}`, charsPerLine) + '\n';
      text += DASH + '\n';
    } else {
      text += centerText('** NET PAYABLE **', charsPerLine) + '\n';
      text += centerText(`${getCurrencyPrefix()} ${netPayable.toFixed(2)}`, charsPerLine) + '\n';
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
      if (shouldShowItemMrp(data, item) && item.originalRate != null) return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
      return sum;
    }, 0);
    const totalSaved = perProductSavings + data.discount;
    if (totalSaved > 0) {
      text += centerText(`YOU SAVED ${getCurrencyPrefix()}${totalSaved.toFixed(2)}`, charsPerLine) + '\n';
      text += DASH + '\n';
    }
  }

  // ── UPI ──
  if (data.upiId) {
    text += `UPI: ${data.upiId}\n`;
    text += DASH + '\n';
  }

  // ── Tax Breakup ──
  text += formatTaxBreakupSection(data, charsPerLine, padLeft, padRight, centerText, '.');

  // ── Loyalty Points ──
  text = appendLoyaltyBlock(text);

  // ── Instructions ──
  text = appendInstructions(text);

  // ── Footer ──
  text += centerText('Thank you, visit again!', charsPerLine) + '\n';
  return text;
}
