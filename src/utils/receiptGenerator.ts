export interface ReceiptItem {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
}

export interface ReceiptData {
  shopName: string;
  invoiceNumber: string;
  date: string;
  cashierName?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  isReprint?: boolean;
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
  if (data.isReprint) {
    text += centerText('INVOICE (REPRINT)', charsPerLine) + '\n';
  } else {
    text += centerText('INVOICE', charsPerLine) + '\n';
  }
  text += divider + '\n';
  
  // Meta Info
  text += `INV No: ${data.invoiceNumber}\n`;
  text += `Date:   ${data.date}\n`;
  if (data.cashierName) {
    text += `Staff:  ${data.cashierName}\n`;
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
      let name = item.name.length > itemNameWidth ? item.name.substring(0, itemNameWidth - 2) + '..' : item.name;
      let qtyStr = `${item.quantity}`;
      let rateStr = item.unit_price.toFixed(2);
      let totalStr = item.total.toFixed(2);

      text += padRight(name, itemNameWidth) + ' ' + padLeft(qtyStr, qtyWidth) + ' ' + padLeft(rateStr, rateWidth) + ' ' + padLeft(totalStr, totalWidth) + '\n';
    });
  } else {
    // 58mm printer (32 chars) - Two line format
    text += padRight('Item', 16) + padLeft('Total', 16) + '\n';
    text += separator + '\n';
    
    data.items.forEach(item => {
      text += item.name + '\n';
      let qtyRateStr = `  ${item.quantity} x ${item.unit_price.toFixed(2)}`;
      let totalStr = item.total.toFixed(2);
      text += padRight(qtyRateStr, charsPerLine - totalStr.length) + totalStr + '\n';
    });
  }

  text += separator + '\n';

  // Totals
  const bottomTotalWidth = 8;
  const labelWidth = charsPerLine - bottomTotalWidth - 2;
  text += padRight('SUBTOTAL:', labelWidth) + '  ' + padLeft(data.subtotal.toFixed(2), bottomTotalWidth) + '\n';
  
  if (data.tax > 0) {
    text += padRight('TAX:', labelWidth) + '  ' + padLeft(data.tax.toFixed(2), bottomTotalWidth) + '\n';
  }
  
  if (data.discount > 0) {
    text += padRight('DISCOUNT:', labelWidth) + '  ' + padLeft(`-${data.discount.toFixed(2)}`, bottomTotalWidth) + '\n';
  }
  
  text += separator + '\n';
  text += padRight('GRAND TOTAL:', labelWidth) + '  ' + padLeft(data.grandTotal.toFixed(2), bottomTotalWidth) + '\n';
  text += divider + '\n';

  // Footer
  text += centerText('Thank you for your visit!', charsPerLine) + '\n';
  text += centerText('Have a great day', charsPerLine) + '\n';

  return text;
}
