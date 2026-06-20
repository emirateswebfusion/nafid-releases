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
}

/**
 * Generates a properly formatted plain-text receipt suitable for thermal printers.
 * @param data The receipt data to print.
 * @param widthCm The width of the paper in centimeters (e.g., 5.8 or 8.0).
 * @returns The formatted plain text string.
 */
export function generateReceiptText(data: ReceiptData, widthCm: number = 5.8): string {
  // A standard 58mm printer usually prints 32 characters per line.
  // An 80mm printer usually prints 48 characters per line.
  const charsPerLine = widthCm >= 7.5 ? 48 : 32;

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

  const divider = '='.repeat(charsPerLine);
  const separator = '-'.repeat(charsPerLine);

  let text = '';
  
  // Header
  text += centerText(data.shopName, charsPerLine) + '\n';
  if (data.shopAddress) {
    text += centerText(data.shopAddress, charsPerLine) + '\n';
  }
  if (data.shopPhone) {
    text += centerText(`Phone: ${data.shopPhone}`, charsPerLine) + '\n';
  }
  if (data.shopGstin) {
    text += centerText(`GSTIN: ${data.shopGstin}`, charsPerLine) + '\n';
  }
  if (data.shopState) {
    text += centerText(`State Code: ${data.shopState}`, charsPerLine) + '\n';
  }
  if (data.isReprint) {
    text += centerText('INVOICE (REPRINT)', charsPerLine) + '\n';
  } else if (data.invoiceType === 'GST') {
    text += centerText('TAX INVOICE', charsPerLine) + '\n';
  } else {
    text += centerText('BILL OF SUPPLY', charsPerLine) + '\n';
  }
  text += divider + '\n';
  
  // Meta Info
  text += `INV No: ${data.invoiceNumber}\n`;
  text += `Date:   ${data.date}\n`;
  if (data.cashierName) {
    text += `Staff:  ${data.cashierName}\n`;
  }
  
  // Customer Details
  if (data.customerName || data.customerPhone || data.customerGstin) {
    text += separator + '\n';
    text += centerText('CUSTOMER DETAILS', charsPerLine) + '\n';
    if (data.customerName) text += `Name:   ${data.customerName}\n`;
    if (data.customerPhone) text += `Phone:  ${data.customerPhone}\n`;
    if (data.customerGstin) text += `GSTIN:  ${data.customerGstin}\n`;
    if (data.customerState) text += `State:  ${data.customerState}\n`;
  }
  
  text += divider + '\n';

  if (charsPerLine >= 48) {
    const qtyWidth = 4;
    const rateWidth = 8;
    const totalWidth = 9;
    const itemNameWidth = charsPerLine - qtyWidth - rateWidth - totalWidth - 3;
    
    text += padRight('Item Name', itemNameWidth) + ' ' + padLeft('Qty', qtyWidth) + ' ' + padLeft('Rate', rateWidth) + ' ' + padLeft('Total', totalWidth) + '\n';
    text += separator + '\n';
    
    data.items.forEach(item => {
      let name = item.name.length > itemNameWidth ? item.name.substring(0, itemNameWidth - 3) + '...' : item.name;
      let qtyStr = `${item.quantity}`;
      let rateStr = item.unit_price.toFixed(2);
      let totalStr = item.total.toFixed(2);

      text += padRight(name, itemNameWidth) + ' ' + padLeft(qtyStr, qtyWidth) + ' ' + padLeft(rateStr, rateWidth) + ' ' + padLeft(totalStr, totalWidth) + '\n';
      // Show discount label if present
      if (item.discountLabel && item.originalRate != null) {
        text += padRight(`  ${item.discountLabel} (was ${item.originalRate.toFixed(2)})`, itemNameWidth) + '\n';
      }
    });
  } else {
    // 58mm printer (32 chars) - Two line format
    text += padRight('Item', 16) + padLeft('Total', 16) + '\n';
    text += separator + '\n';
    
    data.items.forEach(item => {
      let name = item.name.length > charsPerLine ? item.name.substring(0, charsPerLine - 3) + '...' : item.name;
      text += name + '\n';
      let qtyRateStr = `  ${item.quantity} x ${item.unit_price.toFixed(2)}`;
      let totalStr = item.total.toFixed(2);
      text += padRight(qtyRateStr, charsPerLine - totalStr.length) + totalStr + '\n';
      // Show discount label if present
      if (item.discountLabel && item.originalRate != null) {
        text += `  ${item.discountLabel}\n`;
      }
    });
  }

  text += separator + '\n';

  // Totals
  const bottomTotalWidth = 8;
  const labelWidth = charsPerLine - bottomTotalWidth - 2;
  text += padRight('SUBTOTAL:', labelWidth) + '  ' + padLeft(data.subtotal.toFixed(2), bottomTotalWidth) + '\n';
  
  if (data.tax > 0) {
    if (data.igst && data.igst > 0) {
      text += padRight('IGST:', labelWidth) + '  ' + padLeft(data.igst.toFixed(2), bottomTotalWidth) + '\n';
    } else {
      if (data.cgst && data.cgst > 0) {
        text += padRight('CGST:', labelWidth) + '  ' + padLeft(data.cgst.toFixed(2), bottomTotalWidth) + '\n';
      }
      if (data.sgst && data.sgst > 0) {
        text += padRight('SGST:', labelWidth) + '  ' + padLeft(data.sgst.toFixed(2), bottomTotalWidth) + '\n';
      }
      if (!data.cgst && !data.sgst) {
        text += padRight('TAX:', labelWidth) + '  ' + padLeft(data.tax.toFixed(2), bottomTotalWidth) + '\n';
      }
    }
  }
  
  if (data.discount > 0) {
    let discountLabel = 'DISCOUNT:';
    if (data.discountType === 'PERCENTAGE' && data.discountValue) {
      discountLabel = `DISCOUNT (${data.discountValue}%):`;
    }
    text += padRight(discountLabel, labelWidth) + '  ' + padLeft(`-${data.discount.toFixed(2)}`, bottomTotalWidth) + '\n';
  }
  
  text += separator + '\n';
  text += padRight('GRAND TOTAL:', labelWidth) + '  ' + padLeft(data.grandTotal.toFixed(2), bottomTotalWidth) + '\n';
  if (data.receivedAmount != null && data.balanceAmount != null) {
    text += padRight('CUSTOMER GAVE:', labelWidth) + '  ' + padLeft(data.receivedAmount.toFixed(2), bottomTotalWidth) + '\n';
    text += padRight('CHANGE DUE:', labelWidth) + '  ' + padLeft(data.balanceAmount.toFixed(2), bottomTotalWidth) + '\n';
  }
  text += divider + '\n';

  // Footer
  if (data.upiId) {
    text += separator + '\n';
    text += centerText('PAY VIA UPI', charsPerLine) + '\n';
    text += centerText(data.upiId, charsPerLine) + '\n';

    // Generate QR code with pre-filled amount
    if (data.showUpiQr) {
      try {
        const upiUrl = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.shopName)}&am=${data.grandTotal.toFixed(2)}&cu=INR`;
        const qrAscii = generateQrAscii(upiUrl, charsPerLine);
        if (qrAscii) {
          text += '\n' + qrAscii + '\n';
        }
      } catch {
        // QR generation failed silently
      }
    }
  }
  text += separator + '\n';
  text += centerText('Thank you for your visit!', charsPerLine) + '\n';
  text += centerText('Have a great day', charsPerLine) + '\n';

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
