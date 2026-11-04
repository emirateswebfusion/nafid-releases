import { getStoreLocale, getCurrencyPrefix, getStoreProfile } from '../localization/storeProfile';
import { formatPurchaseLedgerMessage } from './whatsappSharing';
import { withNafidFooter } from './messageFooter';

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
  subtotal?: number;
  tax?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  discount?: number;
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
  const total = Number(data.grandTotal || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const received = Number(data.receivedAmount || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const balance = Number(data.balanceAmount || 0);

  // Items breakdown (up to first 8 items for a clean preview, followed by ... if more)
  let itemsText = '';
  if (data.items && data.items.length > 0) {
    itemsText += '\n\n📦 *Bill Items:*';
    const previewItems = data.items.slice(0, 8);
    previewItems.forEach((item, idx) => {
      const itemTotal = Number(item.total || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2 });
      itemsText += `\n${idx + 1}. ${item.name} (${item.quantity}x) - ${getCurrencyPrefix()}${itemTotal}`;
    });
    if (data.items.length > 8) {
      itemsText += `\n...and ${data.items.length - 8} more item(s)`;
    }
  }

  // Credit / Payment Details
  let paymentText = `\n\n💳 *Payment Mode:* ${data.paymentMethod || 'CASH'}`;

  if (data.tax !== undefined && data.tax > 0) {
    if (data.subtotal !== undefined) {
      const subtotalFmt = Number(data.subtotal || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      paymentText += `\n📋 *Subtotal:* ${getCurrencyPrefix()}${subtotalFmt}`;
    }
    if (data.cgst && data.sgst && (data.cgst > 0 || data.sgst > 0)) {
      const cgstFmt = Number(data.cgst || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sgstFmt = Number(data.sgst || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      paymentText += `\n🏛️ *CGST:* ${getCurrencyPrefix()}${cgstFmt}`;
      paymentText += `\n🏛️ *SGST:* ${getCurrencyPrefix()}${sgstFmt}`;
    } else if (data.igst && data.igst > 0) {
      const igstFmt = Number(data.igst || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      paymentText += `\n🏛️ *IGST:* ${getCurrencyPrefix()}${igstFmt}`;
    } else {
      const taxLabel = getStoreProfile().taxName || 'Tax';
      const taxFmt = Number(data.tax || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      paymentText += `\n🏛️ *${taxLabel}:* ${getCurrencyPrefix()}${taxFmt}`;
    }
  }

  if (data.discount !== undefined && data.discount > 0) {
    const discFmt = Number(data.discount || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    paymentText += `\n🏷️ *Discount:* -${getCurrencyPrefix()}${discFmt}`;
  }

  paymentText += `\n💵 *Total Amount:* ${getCurrencyPrefix()}${total}`;
  if (data.receivedAmount !== undefined) {
    paymentText += `\n✅ *Paid Amount:* ${getCurrencyPrefix()}${received}`;
  }

  if (balance > 0) {
    const balFormatted = balance.toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    paymentText += `\n⚠️ *Due Balance:* ${getCurrencyPrefix()}${balFormatted}`;
    if (data.dueDate) {
      paymentText += `\n📅 *Credit Period Due Date:* *${data.dueDate}*`;
      if (data.creditPeriodDays) {
        paymentText += ` (${data.creditPeriodDays} Days)`;
      }
    }
  }

  if (data.customerBalance && data.customerBalance > 0) {
    const totalOutstanding = Number(data.customerBalance).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2 });
    paymentText += `\n📊 *Total Outstanding Ledger Due:* ${getCurrencyPrefix()}${totalOutstanding}`;
  }

  const footer = `\n\n🙏 *Thank you for your business!*\n📄 Detailed PDF invoice is attached below.`;

  return withNafidFooter(`🧾 *INVOICE: ${inv}*\n🏢 *${shop}*\n📅 *Date:* ${date}${cust}${itemsText}${paymentText}${footer}`);
}

export interface WhatsAppStatementDetails {
  shopName: string;
  partyName: string;
  partyType?: string;
  phone?: string | null;
  balance: number;
  balanceLabel?: string;
  totalDebit?: number;
  totalCredit?: number;
  entryCount: number;
  lastDate?: string;
}

export function formatWhatsAppStatementMessage(data: WhatsAppStatementDetails): string {
  const shop = data.shopName || 'STORE';
  const bal = Math.abs(data.balance).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const typeText = data.balance > 0 ? 'Receivable (Due)' : data.balance < 0 ? 'Payable (Advance/Credit)' : 'Settled';

  return withNafidFooter(`📑 *ACCOUNT STATEMENT*\n🏢 *${shop}*\n👤 *Party:* ${data.partyName} (${data.partyType || 'Customer'})\n\n💰 *Current Balance:* ${getCurrencyPrefix()}${bal} [${data.balanceLabel || typeText}]\n📊 *Total Entries:* ${data.entryCount}${data.lastDate ? `\n📅 *Last Activity:* ${data.lastDate}` : ''}\n\n🙏 *Thank you!*`);
}

export interface WhatsAppStaffSalaryDetails {
  shopName: string;
  staffName: string;
  staffCode?: string;
  monthlySalary?: number;
  currentBalance: number;
  monthYear?: string;
}

export function formatWhatsAppStaffSalaryMessage(data: WhatsAppStaffSalaryDetails): string {
  const shop = data.shopName || 'STORE';
  const bal = Number(data.currentBalance || 0).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sal = data.monthlySalary ? Number(data.monthlySalary).toLocaleString(getStoreLocale(), { minimumFractionDigits: 2 }) : null;

  return withNafidFooter(`👤 *STAFF SALARY STATEMENT*\n🏢 *${shop}*\n👔 *Employee:* ${data.staffName} (${data.staffCode || 'Staff'})\n${sal ? `💼 *Monthly Salary:* ${getCurrencyPrefix()}${sal}\n` : ''}💰 *Pending Balance:* ${getCurrencyPrefix()}${bal}\n\n🙏 *Thank you!*`);
}

export interface WhatsAppLedgerTxDetails {
  openingBalance: number;
  amount: number;
  newBalance: number;
  paymentMethod: string;
  transactionType?: 'CREDIT' | 'DEBIT';
  description?: string;
  partyName?: string;
  shopName?: string;
  includeShopName?: boolean;
}

export function formatWhatsAppLedgerTxMessage(data: WhatsAppLedgerTxDetails): string {
  if (/^purchase bill\b/i.test(data.description || '')) {
    const message = formatPurchaseLedgerMessage({ credit_amount: 0, debit_amount: data.amount, running_balance: data.newBalance });
    const withShop = data.includeShopName && data.shopName?.trim() ? `${message}\n\n— *${data.shopName.trim()}*` : message;
    return data.paymentMethod === 'CASH' ? withNafidFooter(withShop) : withShop;
  }
  const methodMap: Record<string, string> = {
    UPI: 'UPI',
    CASH: 'Cash',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank',
    BANK: 'Bank',
    CHEQUE: 'Cheque',
    OTHER: 'Other',
  };
  const methodName = methodMap[data.paymentMethod?.toUpperCase()] || data.paymentMethod || 'Payment';

  const formatAmt = (val: number) => {
    const num = Number(val) || 0;
    return Number.isInteger(num) ? num.toString() : num.toFixed(2);
  };

  const ob = formatAmt(data.openingBalance);
  const amt = formatAmt(data.amount);
  const bal = formatAmt(data.newBalance);

  // Column alignment so numbers align uniformly
  // Example:
  // OB      ₹ 0/-
  // Bank    ₹ 15000/-
  // Bal     ₹ 15000/-
  const labelWidth = Math.max('OB'.length, methodName.length, 'Bal'.length);
  const padLabel = (lbl: string) => lbl + ' '.repeat(Math.max(1, labelWidth - lbl.length + 2));

  let message = `${padLabel('OB')}${getCurrencyPrefix()} ${ob}/-\n${padLabel(methodName)}${getCurrencyPrefix()} ${amt}/-\n${padLabel('Bal')}${getCurrencyPrefix()} ${bal}/-`;

  if (data.includeShopName && data.shopName && data.shopName.trim()) {
    message += `\n\n— *${data.shopName.trim()}*`;
  }

  return withNafidFooter(message);
}
