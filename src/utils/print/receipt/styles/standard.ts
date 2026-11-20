import { getCurrencyPrefix } from '../../../localization/storeProfile';
import { formatPrintItem, shouldShowItemMrp, getDocumentTitle, formatBalanceLines, formatTaxBreakupSection } from '../receiptCore';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "standard": STANDARD — Clean framed design, borders items, centered grand total */
export function renderStandardReceipt(ctx: ReceiptTextContext): string {
  const { data, charsPerLine, centerText, padRight, padLeft, wrapText, selectedBillSettings, printFullName, showBrand, isRateQty, appendInstructions } = ctx;
  let text = '';
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
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      text += `  Note: ${billDesc.trim()}\n`;
    }
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
    if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
      const mrpLine = `  MRP ${getCurrencyPrefix()}${item.originalRate.toFixed(2)} → ${getCurrencyPrefix()}${fmt.displayRate}`;
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
  text += centerText(`${getCurrencyPrefix()} ${data.grandTotal.toFixed(2)}`, charsPerLine) + '\n';
  text += FRAME + '\n';

  if (totalDeductions > 0) {
    if (refundAmount > 0) {
      text += centerText('** REFUND AMOUNT **', charsPerLine) + '\n';
      text += centerText(`${getCurrencyPrefix()} ${refundAmount.toFixed(2)}`, charsPerLine) + '\n';
      text += FRAME + '\n';
    } else {
      text += centerText('** NET PAYABLE **', charsPerLine) + '\n';
      text += centerText(`${getCurrencyPrefix()} ${netPayable.toFixed(2)}`, charsPerLine) + '\n';
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
      text += centerText(`++ You Saved ${getCurrencyPrefix()}${totalSaved.toFixed(2)} ++`, charsPerLine) + '\n';
      text += LIGHT + '\n';
    }
  }

  // ── Tax Breakup ──
  text += formatTaxBreakupSection(data, charsPerLine, padLeft, padRight, centerText, '-');

  // ── UPI ──
  if (data.upiId) {
    text += centerText('PAY VIA UPI', charsPerLine) + '\n';
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

  // ── Instructions ──
  text = ctx.appendLoyaltyBlock(appendInstructions(text));

  // ── Footer ──
  text += centerText('Thank you for your visit!', charsPerLine) + '\n';
  text += centerText('Have a great day!', charsPerLine) + '\n';
  text += FRAME + '\n';
  return text;
}
