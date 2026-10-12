export interface WhatsAppBillDetails {
  shopName: string;
  shopPhone?: string;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    name: string;
    quantity: number | string;
    unit_price: number;
    total: number;
  }>;
  grandTotal: number;
  receivedAmount?: number;
  balanceAmount?: number;
  paymentMethod?: string;
  dueDate?: string;
  creditPeriodDays?: number;
  oldBalance?: number;
  customerBalance?: number;
}

export function formatWhatsAppBillMessage(data: WhatsAppBillDetails): string {
  const shop = data.shopName || 'STORE';
  const inv = data.invoiceNumber;
  const date = data.date;
  const cust = data.customerName ? `\n👤 *Customer:* ${data.customerName}` : '';
  const total = Number(data.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const received = Number(data.receivedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const balance = Number(data.balanceAmount || 0);

  // Items breakdown (up to first 8 items for a clean preview, followed by ... if more)
  let itemsText = '';
  if (data.items && data.items.length > 0) {
    itemsText += '\n\n📦 *Bill Items:*';
    const previewItems = data.items.slice(0, 8);
    previewItems.forEach((item, idx) => {
      const itemTotal = Number(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      itemsText += `\n${idx + 1}. ${item.name} (${item.quantity}x) - ₹${itemTotal}`;
    });
    if (data.items.length > 8) {
      itemsText += `\n...and ${data.items.length - 8} more item(s)`;
    }
  }

  // Credit / Payment Details
  let paymentText = `\n\n💳 *Payment Mode:* ${data.paymentMethod || 'CASH'}`;
  paymentText += `\n💵 *Total Amount:* ₹${total}`;
  if (data.receivedAmount !== undefined) {
    paymentText += `\n✅ *Paid Amount:* ₹${received}`;
  }

  if (balance > 0) {
    const balFormatted = balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    paymentText += `\n⚠️ *Due Balance:* ₹${balFormatted}`;
    if (data.dueDate) {
      paymentText += `\n📅 *Credit Period Due Date:* *${data.dueDate}*`;
      if (data.creditPeriodDays) {
        paymentText += ` (${data.creditPeriodDays} Days)`;
      }
    }
  }

  if (data.customerBalance && data.customerBalance > 0) {
    const totalOutstanding = Number(data.customerBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    paymentText += `\n📊 *Total Outstanding Ledger Due:* ₹${totalOutstanding}`;
  }

  const footer = `\n\n🙏 *Thank you for your business!*\n📄 Detailed PDF invoice is attached below.`;

  return `🧾 *INVOICE: ${inv}*\n🏢 *${shop}*\n📅 *Date:* ${date}${cust}${itemsText}${paymentText}${footer}`;
}
