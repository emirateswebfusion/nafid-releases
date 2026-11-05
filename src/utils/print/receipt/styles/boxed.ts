import { getEffectiveBillSettings, formatPrintItem, shouldShowItemMrp, numberToIndianWords, getDocumentTitle } from '../receiptCore';
import { splitTaxAmount } from '../../../pricing/checkoutLines';
import type { ReceiptTextContext } from '../receiptText';

/** Thermal receipt style "boxed": BILL — Boxed receipt matching reference: strict alignment, columnar table */
export function renderBoxedReceipt(ctx: ReceiptTextContext): string {
  const { data, charsPerLine, centerText, padLeft, wrapText, selectedBillSettings, printFullName, showBrand, isRateQty } = ctx;
  let text = '';
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
  const B_ROW = (cells: string[], widths: number[], aligns?: ('left' | 'right' | 'center')[]): string => {
    let line = '│';
    cells.forEach((c, i) => {
      const w = widths[i];
      const align = aligns && aligns[i] ? aligns[i] : 'left';
      let paddedCell: string;
      if (c.length > w) {
        paddedCell = c.substring(0, w);
      } else if (align === 'right') {
        paddedCell = c.padStart(w);
      } else if (align === 'center') {
        paddedCell = centerText(c, w);
      } else {
        paddedCell = c.padEnd(w);
      }
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
  const isGstBill = data.invoiceType === 'GST' || Boolean(data.isB2B);
  const bs = getEffectiveBillSettings(data.billSettings, isGstBill);
  text += B_TOP();

  // 1. Shop name — UPPERCASE, centered
  if (bs?.showShopName !== false && data.shopName) {
    text += B_LINE(centerText(data.shopName.toUpperCase(), INNER));
  }

  // 2. Address — centered, with clean multi-line wrapping to prevent clipping
  if (bs?.showShopAddress !== false && data.shopAddress) {
    const addr = data.shopAddress;
    const words = addr.split(/\s+/);
    let currentLine = '';
    const lines: string[] = [];
    
    words.forEach(word => {
      if ((currentLine + (currentLine ? ' ' : '') + word).length <= INNER) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) lines.push(currentLine);
    
    lines.forEach(line => {
      text += B_LINE(centerText(line, INNER));
    });
  }

  // 3. Phone — centered
  if (bs?.showPhone !== false && data.shopPhone) {
    text += B_LINE(centerText(`Ph: ${data.shopPhone}`, INNER));
  }

  // 4. GSTIN — centered
  if (bs?.showShopGstin !== false && data.shopGstin) {
    text += B_LINE(centerText(`GSTIN: ${data.shopGstin}`, INNER));
  }

  // 5. State — centered
  if (bs?.showShopState !== false && data.shopState) {
    text += B_LINE(centerText(`State: ${data.shopState}`, INNER));
  }

  text += B_MID();

  // ── Document Title ────────────────────────────────────────────────────────
  const showScrapT = data.invoiceType === 'SCRAP' && (bs?.showScrapHeading || bs?.showTitle);
  if (bs?.showTitle !== false || showScrapT) {
    const docTitle = getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, data.isB2B, bs?.nonGstBillTitle);
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
  if (data.billerName && bs?.showBillerName !== false) text += B_LINE(` Staff: ${data.billerName}`);

  // ── Customer Details ──────────────────────────────────────────────────────
  const showCN = data.customerName && bs?.showCustomerName !== false;
  const showCP = data.customerPhone && bs?.showCustomerPhone !== false;
  const showCA = data.customerAddress && bs?.showCustomerAddress !== false;
  const showCG = data.customerGstin && bs?.showCustomerGstin !== false;
  const showCS = data.customerState && bs?.showCustomerState !== false;
  if (showCN || showCP || showCA || showCG || showCS) {
    text += B_MID();
    text += B_LINE(' Customer Details:');
    if (data.customerName && showCN) text += B_LINE(` Name    : ${data.customerName}`);
    if (data.customerAddress && showCA) text += B_LINE(` Address : ${data.customerAddress}`);
    if (data.customerPhone && showCP) text += B_LINE(` Contact : ${data.customerPhone}`);
    if (data.customerGstin && showCG) text += B_LINE(` GSTIN   : ${data.customerGstin}`);
    if (data.customerState && showCS) text += B_LINE(` State   : ${data.customerState}`);
  }
  if (bs?.showDescription !== false) {
    const billDesc = data.description || data.notes;
    if (billDesc && billDesc.trim()) {
      if (!showCN && !showCP && !showCA && !showCG && !showCS) {
        text += B_MID();
      }
      text += B_LINE(` Note    : ${billDesc.trim()}`);
    }
  }

  // ── Item Table ────────────────────────────────────────────────────────────
  // Correct formula: sum(colWidths) = INNER - N_cols
  // so every B_ROW line = │ + sum(widths) + N pipes = 1+sum+N = charsPerLine ✓

  let colWidths: number[];
  let colLabels: string[];
  let colAligns: ('left' | 'right' | 'center')[];
  let nameW: number;
  let idxW: number;
  let qtyW: number;
  let rateW: number;
  let amtW: number;
  let mrpW: number | null;

  if (charsPerLine >= 42) {
    // 5 cols: Sr(2) Product Qty(4) Rate(7) Amt(8)
    idxW = 2; qtyW = 6; mrpW = null; rateW = 7; amtW = 8;
    nameW = (charsPerLine - 6) - (idxW + qtyW + rateW + amtW);
    colWidths = isRateQty ? [idxW, nameW, rateW, qtyW, amtW] : [idxW, nameW, qtyW, rateW, amtW];
    colLabels = isRateQty ? ['Sr', 'Product', 'Rate', 'Qty', 'Amount'] : ['Sr', 'Product', 'Qty', 'Rate', 'Amount'];
    colAligns = ['center', 'left', 'right', 'right', 'right'];
  } else if (charsPerLine >= 36) {
    // 5 cols: Sr(2) Product Qty(3) Rate(7) Amt(8)
    idxW = 2; qtyW = 6; mrpW = null; rateW = 7; amtW = 8;
    nameW = (charsPerLine - 6) - (idxW + qtyW + rateW + amtW);
    colWidths = isRateQty ? [idxW, nameW, rateW, qtyW, amtW] : [idxW, nameW, qtyW, rateW, amtW];
    colLabels = isRateQty ? ['Sr', 'Product', 'Rate', 'Qty', 'Amount'] : ['Sr', 'Product', 'Qty', 'Rate', 'Amount'];
    colAligns = ['center', 'left', 'right', 'right', 'right'];
  } else {
    // 5 cols for narrow paper: Sr(2) Product Qty(3) Rate(7) Amt(7)
    idxW = 2; qtyW = 5; mrpW = null; rateW = 7; amtW = 7;
    nameW = Math.max(4, (charsPerLine - 6) - (idxW + qtyW + rateW + amtW));
    colWidths = isRateQty ? [idxW, nameW, rateW, qtyW, amtW] : [idxW, nameW, qtyW, rateW, amtW];
    colLabels = isRateQty ? ['Sr', 'Product', 'Rate', 'Qty', 'Amt'] : ['Sr', 'Product', 'Qty', 'Rate', 'Amt'];
    colAligns = ['center', 'left', 'right', 'right', 'right'];
  }

  text += B_MID();
  text += B_ROW(colLabels, colWidths, colAligns);
  text += B_SEP(colWidths);

  data.items.forEach((item, i) => {
    const fmt = formatPrintItem(item, selectedBillSettings);
    const idx = String(i + 1);
    const qty = fmt.displayQty;
    const rate = fmt.displayRate;
    const amt = fmt.displayTotal;
    const mrpStr = (shouldShowItemMrp(data, item) && mrpW && item.originalRate) ? item.originalRate.toFixed(2) : '';
    const isComboItem = Boolean(item.isCombo || (item.combo_items && item.combo_items.length > 0));
    const baseName = item.name || '';
    const rawName = isComboItem && !/\b(COMBO|Combo|combo)\b/i.test(baseName) ? `[COMBO] ${baseName}` : baseName;

    // Wrap name across multiple rows when printFullName is enabled
    const nameLines = printFullName
      ? wrapText(rawName, nameW)
      : [rawName.length > nameW ? rawName.substring(0, nameW - 2) + '..' : rawName];

    nameLines.forEach((name, li) => {
      const cells = mrpW
        ? [li === 0 ? idx : '', name, li === 0 ? (isRateQty ? rate : qty) : '', li === 0 ? mrpStr : '', li === 0 ? (isRateQty ? qty : rate) : '', li === 0 ? amt : '']
        : [li === 0 ? idx : '', name, li === 0 ? (isRateQty ? rate : qty) : '', li === 0 ? (isRateQty ? qty : rate) : '', li === 0 ? amt : ''];
      text += B_ROW(cells, colWidths, colAligns);
    });

    // Combo sub-line for included constituent items
    if (isComboItem && item.combo_items && item.combo_items.length > 0) {
      const comboWidths = [idxW, INNER - idxW - 1];
      const comboInc = ` Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}`;
      const incLines = wrapText(comboInc, INNER - idxW - 1);
      incLines.forEach(l => {
        text += B_ROW(['', l], comboWidths);
      });
    }

    // Brand name — printed under the Product column when enabled
    if (showBrand && item.brand) {
      const brandWidths = [idxW, INNER - idxW - 1];
      text += B_ROW(['', ` Brand: ${item.brand}`], brandWidths);
    }

    // MRP offer note — aligned under the Product column with Sr. column divider intact
    if (shouldShowItemMrp(data, item) && item.originalRate != null && item.originalRate !== item.unit_price) {
      const offerWidths = [idxW, INNER - idxW - 1];
      // 1. Add a small gap row before the offer note (45% line-height) - no extra column dividers
      text += '[[LH:0.45]]' + B_ROW(['', ''], offerWidths);

      const offerLabel = ` MRP ${item.originalRate.toFixed(2)} @ ${fmt.displayRate}${item.discountLabel ? ` (${item.discountLabel})` : ''}`;
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
  // Format: │ Label                    │   123.00│
  const totalDeductions = (data.scrapDeduction || 0) + (data.returnDeduction || 0);
  const netPayable = Math.max(0, data.grandTotal - totalDeductions);
  const refundAmount = totalDeductions > data.grandTotal ? totalDeductions - data.grandTotal : 0;
  const netTotal = Math.round(netPayable);
  const roundOff = Math.round(netPayable) - netPayable;
  const refundTotal = Math.round(refundAmount);
  const refundRoundOff = Math.round(refundAmount) - refundAmount;

  // Align totals vertical separator with minimum 8 chars for value field so 2-decimal numbers are never clipped
  const VAL_W = Math.max(amtW, 8);
  const tRow = (label: string, val: string) => {
    const effValW = Math.max(VAL_W, val.length);
    const effLabW = INNER - effValW - 1;
    const l = label.length > effLabW ? label.substring(0, effLabW) : label.padEnd(effLabW);
    const v = val.padStart(effValW);
    return B_LINE(l + '│' + v);
  };

  const itemsTotal = data.items.reduce((s, item) => s + (Number(item.total) || 0), 0);
  const grossSubtotal = itemsTotal > 0 ? itemsTotal : data.subtotal;

  text += tRow('Total', grossSubtotal.toFixed(2));
  if (data.extraBonus && data.extraBonus > 0 && data.invoiceType === 'SCRAP') {
    text += tRow('Bonus', `+${data.extraBonus.toFixed(2)}`);
  } else if (data.discount > 0) {
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
      (shouldShowItemMrp(data, item) && item.originalRate != null) ? s + (item.originalRate - item.unit_price) * Number(item.quantity) : s, 0);
    const totalSaved = perSaved + data.discount;
    if (totalSaved > 0) {
      text += B_MID();
      const savedMsg = centerText(`* * * YOU SAVED \u20B9${totalSaved.toFixed(2)} * * *`, INNER);
      text += B_LINE(savedMsg);
    }
  }

  text += B_MID();

  // ── Tax Breakup ───────────────────────────────────────────────────────────
  const isGst = data.invoiceType === 'GST' || Boolean(data.isB2B);
  const showBreakup = isGst || data.billSettings?.showBosTaxBreakup !== false;
  if (data.tax > 0 && showBreakup) {
    let taxCols: string[];
    let taxWidths: number[];
    let taxValues: string[];
    let taxAligns: ('left' | 'right' | 'center')[];

    const hasIgst = Boolean(data.igst && data.igst > 0);
    const split = splitTaxAmount(data.tax);
    const effectiveCgst = (data.cgst && data.cgst > 0) ? data.cgst : (!hasIgst ? split.cgst : 0);
    const effectiveSgst = (data.sgst && data.sgst > 0) ? data.sgst : (!hasIgst ? split.sgst : 0);
    const hasCgstSgst = Boolean(effectiveCgst > 0 || effectiveSgst > 0);
    const taxableVal = (data.subtotal > 0 && Math.abs(data.subtotal + data.tax - data.grandTotal) < 0.05 ? data.subtotal : Math.max(0, data.grandTotal - data.tax)).toFixed(2);

    if (charsPerLine >= 42) {
      if (!hasIgst || !hasCgstSgst) {
        if (hasIgst) {
          // 3 columns: Taxable, IGST, Total
          const taxSum = charsPerLine - 4;
          const wTaxable = Math.floor(taxSum * 0.36);
          const wIgst = Math.floor(taxSum * 0.32);
          const wTotal = taxSum - wTaxable - wIgst;
          taxWidths = [wTaxable, wIgst, wTotal];
          taxCols = ['Taxable', 'IGST', 'Total'];
          taxAligns = ['right', 'right', 'right'];
          taxValues = [taxableVal, (data.igst || data.tax).toFixed(2), data.tax.toFixed(2)];
        } else {
          // 4 columns: Taxable, CGST, SGST, Total (Clean Kerala Intra-State standard)
          const taxSum = charsPerLine - 5;
          const wTaxable = Math.max(8, Math.floor(taxSum * 0.28));
          const wCgst = Math.floor((taxSum - wTaxable) / 3);
          const wSgst = wCgst;
          const wTotal = taxSum - wTaxable - wCgst - wSgst;
          taxWidths = [wTaxable, wCgst, wSgst, wTotal];
          taxCols = ['Taxable', 'CGST', 'SGST', 'Total'];
          taxAligns = ['right', 'right', 'right', 'right'];
          taxValues = [taxableVal, effectiveCgst.toFixed(2), effectiveSgst.toFixed(2), data.tax.toFixed(2)];
        }
      } else {
        // 5 columns when both IGST and CGST exist (Inter-state mixed)
        const taxSum = charsPerLine - 6;
        const tw = Math.floor(taxSum / 5);
        const twLast = taxSum - tw * 4;
        taxWidths = [tw, tw, tw, tw, twLast];
        taxCols = ['Taxable', 'CGST', 'SGST', 'IGST', 'Total'];
        taxAligns = ['right', 'right', 'right', 'right', 'right'];
        taxValues = [taxableVal, effectiveCgst.toFixed(2), effectiveSgst.toFixed(2), (data.igst || 0).toFixed(2), data.tax.toFixed(2)];
      }
    } else if (hasIgst) {
      // 3 columns for Inter-State on narrow thermal printer
      const taxSum = charsPerLine - 4;
      const wTaxable = Math.max(7, Math.floor(taxSum * 0.38));
      const wIgst = Math.max(6, Math.floor(taxSum * 0.28));
      const wTotal = taxSum - wTaxable - wIgst;
      taxWidths = [wTaxable, wIgst, wTotal];
      taxCols = ['Taxable', 'IGST', 'Total GST'];
      taxAligns = ['right', 'right', 'right'];
      taxValues = [
        taxableVal,
        (data.igst || data.tax).toFixed(2),
        data.tax.toFixed(2),
      ];
    } else {
      // 4 columns for Intra-State (CGST+SGST) on narrow thermal printer
      const taxSum = charsPerLine - 5;
      const wTaxable = 7;
      const wCgst = 5;
      const wSgst = 5;
      const wTotal = taxSum - wTaxable - wCgst - wSgst;
      taxWidths = [wTaxable, wCgst, wSgst, wTotal];
      taxCols = ['Taxable', 'CGST', 'SGST', 'Total'];
      taxAligns = ['right', 'right', 'right', 'right'];
      taxValues = [
        taxableVal,
        effectiveCgst.toFixed(2),
        effectiveSgst.toFixed(2),
        data.tax.toFixed(2),
      ];
    }

    text += B_ROW(taxCols, taxWidths, taxAligns);
    text += B_SEP(taxWidths);
    text += B_ROW(taxValues, taxWidths, taxAligns);
    text += B_MID();
  }

  // ── Amount in Words ───────────────────────────────────────────────────────
  text += B_LINE(' Amount in Words:');
  {
    const amountWords = `${numberToIndianWords(refundAmount > 0 ? refundTotal : Math.max(0, netTotal))} ONLY`;
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

  // ── Authorised Signatory & For Shop Name ──────────────────────────────────
  if ((selectedBillSettings.showForShopName !== false && data.shopName) || selectedBillSettings.showAuthorisedSignatory !== false) {
    text += B_LINE('');
    if (selectedBillSettings.showForShopName !== false && data.shopName) {
      text += B_LINE(padLeft(`For ${data.shopName.toUpperCase()}`, INNER));
    }
    if (selectedBillSettings.showAuthorisedSignatory !== false) {
      if (selectedBillSettings.showForShopName !== false && data.shopName) {
        text += B_LINE('');
      }
      text += B_LINE(padLeft('Authorised Signatory', INNER));
    }
    text += B_MID();
  }

  // ── Barcode ───────────────────────────────────────────────────────────────
  if (selectedBillSettings.showBarcodeOnReceipt !== false) {
    text += `[[BARCODE:${data.invoiceNumber}]]\n`;
    text += B_MID();
  }

  // ── Prominent Total/Refund ────────────────────────────────────────────────
  const finalAmountLabel = refundAmount > 0 ? 'Refund Amount' : (totalDeductions > 0 || Math.abs(Math.round(data.grandTotal) - data.grandTotal) >= 0.005 ? 'Net Total' : 'Grand Total');
  const finalAmountValue = refundAmount > 0 ? Math.max(0, refundTotal) : Math.max(0, netTotal);
  text += `[[PROMINENT:${finalAmountLabel}: \u20B9${finalAmountValue.toFixed(2)}]]\n`;
  text += B_MID();

  // ── Footer ────────────────────────────────────────────────────────────────
  text += B_LINE(centerText('Thank You... Visit Again !', INNER));
  text += B_MID();

  // ── QR Code ───────────────────────────────────────────────────────────────
  if (data.upiId && data.showUpiQr) {
    try {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent((data.shopName || '').substring(0, 16))}&am=${Math.max(0, netTotal).toFixed(2)}&cu=INR`;
      text += '[[QR:' + upiUrl + ']]\n';
    } catch { /* ignore */ }
  }

  // ── Loyalty Points ────────────────────────────────────────────────────────
  const hasPoints =
    (data.pointsEarned != null && data.pointsEarned > 0) ||
    (data.previousPointsBalance != null && data.previousPointsBalance > 0) ||
    (data.pointsRedeemed != null && data.pointsRedeemed > 0) ||
    (data.remainingPointsBalance != null && data.remainingPointsBalance > 0);
  if (hasPoints) {
    const ptRow = (l: string, v: string) => {
      const effVW = Math.max(amtW, 8, v.length);
      const effLW = INNER - effVW - 1;
      const label = l.length > effLW ? l.substring(0, effLW) : l.padEnd(effLW);
      const val = v.padStart(effVW);
      return B_LINE(label + '│' + val);
    };
    text += ptRow('Bill Points', (data.pointsEarned || 0).toFixed(2));
    text += ptRow('Used Point', String(data.pointsRedeemed || 0));
    text += ptRow('Used Amt', data.pointsRedeemedDiscount ? data.pointsRedeemedDiscount.toFixed(2) : '0');
    text += ptRow('Balance Points', (data.remainingPointsBalance || 0).toFixed(2));
    text += B_MID();
  }

  text += B_BOT();
  return text;
}
