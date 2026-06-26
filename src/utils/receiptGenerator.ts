import QRCode from 'qrcode';

export interface ReceiptItem {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
  originalRate?: number;
  discountLabel?: string;
}

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
  cashierName?: string;
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
  scrapDeduction?: number;
  scrapInvoiceNumber?: string;
}

/**
 * Generates a properly formatted plain-text receipt suitable for thermal printers.
 * @param data The receipt data to print.
 * @param widthCm The width of the paper in centimeters (e.g., 5.8 or 8.0).
 * @param charsPerLine Optional explicit character count per line.
 * @param style The receipt layout style.
 * @returns The formatted plain text string.
 */
export function generateReceiptText(data: ReceiptData, widthCm: number = 5.8, charsPerLine?: number, style: 'standard' | 'compact' | 'modern' | 'classic' = 'standard'): string {
  if (charsPerLine == null) {
    charsPerLine = widthCm >= 7.5 ? 42 : 32;
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

  const heavyDivider = style === 'compact' ? '-'.repeat(charsPerLine) : style === 'classic' ? '='.repeat(charsPerLine) : '='.repeat(charsPerLine);
  const lightDivider = style === 'compact' ? '-'.repeat(charsPerLine) : style === 'classic' ? '-'.repeat(charsPerLine) : '-'.repeat(charsPerLine);

  let text = '';

  // ── Header ──────────────────────────────────────────────────────────────────
  if (style === 'compact') {
    text += `${data.shopName}\n`;
    if (data.shopAddress) text += `${data.shopAddress}\n`;
    if (data.shopPhone) text += `Ph: ${data.shopPhone}\n`;
    if (data.shopGstin) text += `GST: ${data.shopGstin}\n`;
  } else if (style === 'modern') {
    text += centerText(`✦ ${data.shopName} ✦`, charsPerLine) + '\n';
    if (data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
    if (data.shopPhone) text += centerText(`📞 ${data.shopPhone}`, charsPerLine) + '\n';
    if (data.shopGstin) text += centerText(`GST: ${data.shopGstin}`, charsPerLine) + '\n';
  } else if (style === 'classic') {
    text += centerText(`*** ${data.shopName} ***`, charsPerLine) + '\n';
    if (data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
    if (data.shopPhone) text += centerText(`Phone: ${data.shopPhone}`, charsPerLine) + '\n';
    if (data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
  } else {
    text += centerText(data.shopName, charsPerLine) + '\n';
    if (data.shopAddress) text += centerText(data.shopAddress, charsPerLine) + '\n';
    if (data.shopPhone) text += centerText(`Phone: ${data.shopPhone}`, charsPerLine) + '\n';
    if (data.shopGstin) text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
  }

  if (data.shopState && style !== 'compact') {
    text += centerText(`State Code: ${data.shopState}`, charsPerLine) + '\n';
  }

  if (style === 'modern') {
    if (data.isReprint) text += centerText('[ REPRINT ]', charsPerLine) + '\n';
    else if (data.invoiceType === 'GST') text += centerText('[ TAX INVOICE ]', charsPerLine) + '\n';
    else text += centerText('[ BILL OF SUPPLY ]', charsPerLine) + '\n';
  } else if (style === 'classic') {
    if (data.isReprint) text += centerText('--- INVOICE (REPRINT) ---', charsPerLine) + '\n';
    else if (data.invoiceType === 'GST') text += centerText('--- TAX INVOICE ---', charsPerLine) + '\n';
    else text += centerText('--- BILL OF SUPPLY ---', charsPerLine) + '\n';
  } else {
    if (data.isReprint) text += centerText('INVOICE (REPRINT)', charsPerLine) + '\n';
    else if (data.invoiceType === 'GST') text += centerText('TAX INVOICE', charsPerLine) + '\n';
    else text += centerText('BILL OF SUPPLY', charsPerLine) + '\n';
  }

  text += heavyDivider + '\n';

  // ── Meta Info ───────────────────────────────────────────────────────────────
  if (style === 'compact') {
    text += `${data.invoiceNumber}  ${data.date}\n`;
    if (data.cashierName) text += `${data.cashierName}\n`;
  } else if (style === 'modern') {
    text += `INV:  ${data.invoiceNumber}\n`;
    text += `Date: ${data.date}\n`;
    if (data.cashierName) text += `Staff: ${data.cashierName}\n`;
  } else {
    text += `INV No: ${data.invoiceNumber}\n`;
    text += `Date:   ${data.date}\n`;
    if (data.cashierName) text += `Staff:  ${data.cashierName}\n`;
  }

  // ── Customer Details ────────────────────────────────────────────────────────
  if (data.customerName || data.customerPhone || data.customerGstin) {
    if (style === 'compact') {
      if (data.customerName) text += `${data.customerName}`;
      if (data.customerPhone) text += `  ${data.customerPhone}`;
      text += '\n';
      if (data.customerGstin) text += `GST: ${data.customerGstin}\n`;
    } else {
      text += lightDivider + '\n';
      if (style === 'modern') text += centerText('[ CUSTOMER ]', charsPerLine) + '\n';
      else text += centerText('CUSTOMER DETAILS', charsPerLine) + '\n';
      if (data.customerName) text += `Name:   ${data.customerName}\n`;
      if (data.customerPhone) text += `Phone:  ${data.customerPhone}\n`;
      if (data.customerGstin) text += `GSTIN:  ${data.customerGstin}\n`;
      if (data.customerState) text += `State:  ${data.customerState}\n`;
    }
  }

  text += heavyDivider + '\n';

  // ── Line Items ──────────────────────────────────────────────────────────────
  if (style === 'compact') {
    data.items.forEach(item => {
      const name = item.name.length > charsPerLine - 14 ? item.name.substring(0, charsPerLine - 17) + '...' : item.name;
      const totalStr = item.total.toFixed(2);
      text += `${name}`;
      text += ' '.repeat(Math.max(1, charsPerLine - name.length - totalStr.length));
      text += `${totalStr}\n`;
      text += `  ${item.quantity} x ${item.unit_price.toFixed(2)}\n`;
      if (item.discountLabel) text += `  ${item.discountLabel}\n`;
    });
  } else if (style === 'modern') {
    text += centerText('[ ITEMS ]', charsPerLine) + '\n';
    data.items.forEach(item => {
      const name = item.name.length > charsPerLine - 12 ? item.name.substring(0, charsPerLine - 15) + '...' : item.name;
      text += `${name}\n`;
      const qty = `${item.quantity} x ${item.unit_price.toFixed(2)}`;
      const total = item.total.toFixed(2);
      text += `  ${qty}` + ' '.repeat(Math.max(1, charsPerLine - 2 - qty.length - total.length)) + `${total}\n`;
      if (item.discountLabel) text += `  ~ ${item.discountLabel}\n`;
    });
  } else if (style === 'classic') {
    data.items.forEach((item, i) => {
      const name = item.name.length > charsPerLine - 6 ? item.name.substring(0, charsPerLine - 9) + '...' : item.name;
      text += `${i + 1}. ${name}` + ' '.repeat(Math.max(1, charsPerLine - 3 - name.length - item.total.toFixed(2).length)) + `${item.total.toFixed(2)}\n`;
      text += `    ${item.quantity} x ${item.unit_price.toFixed(2)}\n`;
      if (item.discountLabel) text += `    [${item.discountLabel}]\n`;
    });
  } else if (charsPerLine >= 42) {
    const qtyWidth = 4;
    const rateWidth = 8;
    const totalWidth = 9;
    const itemNameWidth = charsPerLine - qtyWidth - rateWidth - totalWidth - 3;

    text += padRight('Item Name', itemNameWidth) + ' ' + padLeft('Qty', qtyWidth) + ' ' + padLeft('Rate', rateWidth) + ' ' + padLeft('Total', totalWidth) + '\n';
    text += lightDivider + '\n';

    data.items.forEach(item => {
      const name = item.name.length > itemNameWidth ? item.name.substring(0, itemNameWidth - 3) + '...' : item.name;
      text += padRight(name, itemNameWidth) + ' ' + padLeft(`${item.quantity}`, qtyWidth) + ' ' + padLeft(item.unit_price.toFixed(2), rateWidth) + ' ' + padLeft(item.total.toFixed(2), totalWidth) + '\n';
      if (item.discountLabel && item.originalRate != null) {
        const discountLine = `  ${item.discountLabel} (was ${item.originalRate.toFixed(2)})`;
        text += (discountLine.length > charsPerLine ? discountLine.substring(0, charsPerLine - 3) + '...' : discountLine) + '\n';
      }
    });
  } else {
    text += padRight('Item', 16) + padLeft('Total', 16) + '\n';
    text += lightDivider + '\n';

    data.items.forEach(item => {
      const name = item.name.length > charsPerLine ? item.name.substring(0, charsPerLine - 3) + '...' : item.name;
      text += name + '\n';
      const qtyRateStr = `  ${item.quantity} x ${item.unit_price.toFixed(2)}`;
      const totalStr = item.total.toFixed(2);
      text += padRight(qtyRateStr, charsPerLine - totalStr.length) + totalStr + '\n';
      if (item.discountLabel && item.originalRate != null) {
        text += `  ${item.discountLabel}\n`;
      }
    });
  }

  text += lightDivider + '\n';

  // ── Totals ──────────────────────────────────────────────────────────────────
  const bottomTotalWidth = 8;
  const labelWidth = charsPerLine - bottomTotalWidth - 2;

  if (style === 'compact') {
    text += padRight('Subtotal', labelWidth) + '  ' + padLeft(data.subtotal.toFixed(2), bottomTotalWidth) + '\n';
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += padRight('IGST', labelWidth) + '  ' + padLeft(data.igst.toFixed(2), bottomTotalWidth) + '\n';
      else {
        if (data.cgst && data.cgst > 0) text += padRight('CGST', labelWidth) + '  ' + padLeft(data.cgst.toFixed(2), bottomTotalWidth) + '\n';
        if (data.sgst && data.sgst > 0) text += padRight('SGST', labelWidth) + '  ' + padLeft(data.sgst.toFixed(2), bottomTotalWidth) + '\n';
      }
    }
    if (data.discount > 0) text += padRight('Discount', labelWidth) + '  ' + padLeft(`-${data.discount.toFixed(2)}`, bottomTotalWidth) + '\n';
  } else if (style === 'modern') {
    text += padRight('SUBTOTAL:', labelWidth) + '  ' + padLeft(data.subtotal.toFixed(2), bottomTotalWidth) + '\n';
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) text += padRight('IGST:', labelWidth) + '  ' + padLeft(data.igst.toFixed(2), bottomTotalWidth) + '\n';
      else {
        if (data.cgst && data.cgst > 0) text += padRight('CGST:', labelWidth) + '  ' + padLeft(data.cgst.toFixed(2), bottomTotalWidth) + '\n';
        if (data.sgst && data.sgst > 0) text += padRight('SGST:', labelWidth) + '  ' + padLeft(data.sgst.toFixed(2), bottomTotalWidth) + '\n';
      }
    }
    if (data.discount > 0) {
      const dLabel = data.discountType === 'PERCENTAGE' && data.discountValue ? `DISCOUNT (${data.discountValue}%):` : 'DISCOUNT:';
      text += padRight(dLabel, labelWidth) + '  ' + padLeft(`-${data.discount.toFixed(2)}`, bottomTotalWidth) + '\n';
    }
  } else {
    text += padRight('SUBTOTAL:', labelWidth) + '  ' + padLeft(data.subtotal.toFixed(2), bottomTotalWidth) + '\n';
    if (data.tax > 0) {
      if (data.igst && data.igst > 0) {
        text += padRight('IGST:', labelWidth) + '  ' + padLeft(data.igst.toFixed(2), bottomTotalWidth) + '\n';
      } else {
        if (data.cgst && data.cgst > 0) text += padRight('CGST:', labelWidth) + '  ' + padLeft(data.cgst.toFixed(2), bottomTotalWidth) + '\n';
        if (data.sgst && data.sgst > 0) text += padRight('SGST:', labelWidth) + '  ' + padLeft(data.sgst.toFixed(2), bottomTotalWidth) + '\n';
        if (!data.cgst && !data.sgst) text += padRight('TAX:', labelWidth) + '  ' + padLeft(data.tax.toFixed(2), bottomTotalWidth) + '\n';
      }
    }
    if (data.discount > 0) {
      let dLabel = 'DISCOUNT:';
      if (data.discountType === 'PERCENTAGE' && data.discountValue) dLabel = `DISCOUNT (${data.discountValue}%):`;
      text += padRight(dLabel, labelWidth) + '  ' + padLeft(`-${data.discount.toFixed(2)}`, bottomTotalWidth) + '\n';
    }
  }

  const finalGrandTotal = data.grandTotal - (data.scrapDeduction || 0);
  if (data.scrapDeduction && data.scrapDeduction > 0) {
    const scrapLabel = style === 'compact' ? 'Scrap' : `SCRAP (${data.scrapInvoiceNumber || ''}):`;
    text += padRight(scrapLabel, labelWidth) + '  ' + padLeft(`-${data.scrapDeduction.toFixed(2)}`, bottomTotalWidth) + '\n';
  }

  text += lightDivider + '\n';

  if (style === 'compact') {
    text += padRight('GRAND TOTAL', labelWidth) + '  ' + padLeft(Math.max(0, finalGrandTotal).toFixed(2), bottomTotalWidth) + '\n';
  } else if (style === 'modern') {
    text += padRight('>> GRAND TOTAL <<', labelWidth) + '  ' + padLeft(Math.max(0, finalGrandTotal).toFixed(2), bottomTotalWidth) + '\n';
  } else {
    text += padRight('GRAND TOTAL:', labelWidth) + '  ' + padLeft(Math.max(0, finalGrandTotal).toFixed(2), bottomTotalWidth) + '\n';
  }

  if (data.receivedAmount != null && data.balanceAmount != null) {
    if (style === 'compact') {
      text += padRight('Paid', labelWidth) + '  ' + padLeft(data.receivedAmount.toFixed(2), bottomTotalWidth) + '\n';
      text += padRight('Change', labelWidth) + '  ' + padLeft(data.balanceAmount.toFixed(2), bottomTotalWidth) + '\n';
    } else {
      text += padRight('CUSTOMER GAVE:', labelWidth) + '  ' + padLeft(data.receivedAmount.toFixed(2), bottomTotalWidth) + '\n';
      text += padRight('CHANGE DUE:', labelWidth) + '  ' + padLeft(data.balanceAmount.toFixed(2), bottomTotalWidth) + '\n';
    }
  }

  text += heavyDivider + '\n';

  // ── You Saved (per-product + bill-level) ──────────────────────────────────────
  const perProductSavings = data.items.reduce((sum, item) => {
    if (item.originalRate != null) {
      return sum + (item.originalRate - item.unit_price) * Number(item.quantity);
    }
    return sum;
  }, 0);
  const totalSaved = perProductSavings + data.discount;
  if (totalSaved > 0) {
    const saved = totalSaved.toFixed(2);
    if (style === 'compact') {
      text += `  ** YOU SAVED ₹${saved} **\n`;
    } else if (style === 'modern') {
      text += centerText(`✦ You saved ₹${saved} ✦`, charsPerLine) + '\n';
    } else if (style === 'classic') {
      text += centerText(`*** YOU SAVED ₹${saved} ***`, charsPerLine) + '\n';
    } else {
      text += centerText(`*** YOU SAVED ₹${saved} ***`, charsPerLine) + '\n';
    }
    text += lightDivider + '\n';
  }

  // ── UPI / Footer ────────────────────────────────────────────────────────────
  if (data.upiId) {
    if (style === 'compact') {
      text += `UPI: ${data.upiId}\n`;
    } else {
      text += lightDivider + '\n';
      if (style === 'modern') text += centerText('[ PAYMENT ]', charsPerLine) + '\n';
      else text += centerText('PAY VIA UPI', charsPerLine) + '\n';
      text += centerText(data.upiId, charsPerLine) + '\n';
    }

    if (data.showUpiQr) {
      try {
        const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.shopName)}&am=${data.grandTotal.toFixed(2)}&cu=INR`;
        const qrAscii = generateQrAscii(upiUrl, charsPerLine);
        if (qrAscii) text += '\n' + qrAscii + '\n';
      } catch {}
    }
  }

  if (style === 'compact') {
    text += lightDivider + '\n';
    text += centerText('THANK YOU', charsPerLine) + '\n';
  } else if (style === 'modern') {
    text += lightDivider + '\n';
    text += centerText('✦ Thank You! ✦', charsPerLine) + '\n';
  } else if (style === 'classic') {
    text += lightDivider + '\n';
    text += centerText('* Thank you, visit again! *', charsPerLine) + '\n';
  } else {
    text += lightDivider + '\n';
    text += centerText('Thank you for your visit!', charsPerLine) + '\n';
    text += centerText('Have a great day', charsPerLine) + '\n';
  }

  return text;
}

/**
 * Generates a QR code as ASCII art using Unicode block characters.
 */
function generateQrAscii(text: string, maxWidth: number): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const modules = qr.modules.data;

  // Scale down the QR if it's wider than the receipt
  // Each module takes 2 characters (██) so width in chars = size * 2 + margins
  const margin = 4;
  const rawWidth = size * 2 + margin * 2;

  let result = '';

  if (rawWidth <= maxWidth) {
    // Fit directly with spaces margin
    const leftPad = ' '.repeat(Math.max(0, Math.floor((maxWidth - rawWidth) / 2)));

    for (let row = 0; row < size; row += 2) {
      let line = leftPad + ' '.repeat(margin);
      for (let col = 0; col < size; col++) {
        const top = modules[row * size + col] !== 0;
        const bottom = row + 1 < size ? modules[(row + 1) * size + col] !== 0 : false;

        if (top && bottom) line += '█';
        else if (top && !bottom) line += '▀';
        else if (!top && bottom) line += '▄';
        else line += ' ';
        line += ' '; // extra space for readability
      }
      result += line + '\n';
    }
  } else {
    // Too wide - use smaller rendering with 1-char blocks
    const scale = Math.ceil(rawWidth / maxWidth);
    const scaledSize = Math.max(1, Math.floor(size / scale));
    const scaledWidth = scaledSize * 2 + margin * 2;
    const leftPad = ' '.repeat(Math.max(0, Math.floor((maxWidth - scaledWidth) / 2)));

    for (let r = 0; r < scaledSize; r++) {
      let line = leftPad + ' '.repeat(margin);
      const srcRow = Math.min(Math.floor(r * scale), size - 1);
      for (let c = 0; c < scaledSize; c++) {
        const srcCol = Math.min(Math.floor(c * scale), size - 1);
        const val = modules[srcRow * size + srcCol] !== 0;
        line += val ? '██' : '  ';
      }
      result += line + '\n';
    }
  }

  // Remove trailing newline
  return result.replace(/\n$/, '');
}
