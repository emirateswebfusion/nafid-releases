import type { InvoiceData } from './invoiceHtml/invoiceHtmlCore';
import type { ReceiptData } from './receipt/receiptCore';
import { formatBillDateTime } from './receipt/receiptCore';
import { receiptCreditTotals } from '../pricing/receiptCredits';
import { formatCurrency } from '../pricing/money';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const amount = (value: unknown) => formatCurrency(value);
function documentTitle(data: InvoiceData | ReceiptData): string {
  if (['RETURN', 'SALES_RETURN', 'CREDIT_NOTE'].includes(data.invoiceType || '')) return 'TAX CREDIT NOTE';
  if (data.invoiceType === 'PURCHASE') return 'PURCHASE BILL';
  if (data.invoiceType === 'QUOTATION') return 'QUOTATION';
  if (data.invoiceType === 'ESTIMATE') return 'ESTIMATE';
  return data.invoiceType === 'GST' || data.isB2B ? 'TAX INVOICE' : 'INVOICE';
}

/** UAE documents use the stored tax total, never a fabricated Indian GST breakdown. */
export function generateUaeInvoiceHtml(data: InvoiceData): string {
  const credits = receiptCreditTotals(data);
  const detail = (label: string, value: unknown) => value == null || value === '' ? '' : `<p><b>${label}:</b> ${escape(value)}</p>`;
  const row = (label: string, value: number | undefined) => value == null || value === 0 ? '' : `<tr><th>${label}</th><td>${amount(value)}</td></tr>`;
  const items = data.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escape(item.name)}${item.unit ? ` (${escape(item.unit)})` : ''}</td><td>${escape(item.quantity)}</td><td>${amount(item.unit_price)}</td><td>${amount(item.total)}</td><td>${escape(item.tax_rate_percent ?? item.gst_percent ?? '')}%</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>${escape(documentTitle(data))} ${escape(data.invoiceNumber)}</title><style>
    @page{margin:12mm}body{font:12px Arial,sans-serif;color:#111;margin:0}h1{font-size:22px}h2{font-size:17px}p{margin:5px 0}.parties{display:flex;justify-content:space-between;gap:20px}.parties>div{width:48%}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{border:1px solid #aaa;padding:7px;text-align:right}th:nth-child(2),td:nth-child(2){text-align:left}.totals{width:55%;margin-left:auto}.totals th{text-align:left}tr{break-inside:avoid}.notes{white-space:pre-wrap}footer{margin-top:20px;border-top:1px solid #aaa;padding-top:10px}
    </style></head><body><h1>${escape(documentTitle(data))}</h1><div class="parties"><div><h2>${escape(data.shopName)}</h2>
    ${detail('Address', data.shopAddress)}${detail('TRN', data.shopGstin)}${detail('Phone', data.shopPhone)}${detail('Email', data.shopEmail)}${detail('Website', data.shopWebsite)}
    </div><div>${detail('Invoice No.', data.invoiceNumber)}${detail('Issue date', formatBillDateTime(data.date))}${detail('Customer', data.customerName)}${detail('Customer address', data.customerAddress)}${detail('Customer TRN', data.customerGstin)}${detail('Customer phone', data.customerPhone)}${detail('Due date', data.dueDate)}${detail('Biller', data.billerName)}</div></div>
    <p>Currency: AED (UAE Dirham)</p><table><thead><tr><th>#</th><th>Description</th><th>Quantity</th><th>Unit price (excl. VAT)</th><th>Amount (excl. VAT)</th><th>VAT rate</th></tr></thead><tbody>${items}</tbody></table>
    <table class="totals"><tbody>${row('Subtotal', data.subtotal)}${row('Discount', -data.discount)}${row('VAT', data.tax)}${row('Scrap credit', -(data.scrapDeduction || 0))}${row('Return credit', -(data.returnDeduction || 0))}${row('Points discount', -(data.pointsRedeemedDiscount || 0))}<tr><th>Total (including VAT)</th><td><b>${amount(credits.payable)}</b></td></tr>${row('Refund amount', credits.refund)}${row('Received', data.receivedAmount)}${row('Balance', data.customerBalance ?? data.balanceAmount)}${row('Previous balance', data.oldBalance)}</tbody></table>
    ${detail('Payment method', data.paymentMethod)}${detail('Bank', data.bankName)}${detail('IBAN / Account', data.bankAccount)}${detail('SWIFT / BIC', data.bankIfsc)}${detail('Branch', data.bankBranch)}${detail('Shipping address', data.shippingAddress)}${detail('Vehicle', data.vehicleNumber)}${detail('Electronic reference', data.electronicRefNumber)}
    <div class="notes">${escape(data.description)}\n${escape(data.notes)}\n${escape(data.billSettings?.instructions)}</div><footer>${data.isReprint ? 'Copy / Reprint' : ''}</footer></body></html>`;
}

/** Thermal output keeps AED totals legible on both 58 mm and 80 mm paper. */
export function generateUaeReceipt(data: ReceiptData, width = 42): string {
  const credits = receiptCreditTotals(data);
  const lines: string[] = [];
  const wrap = (text: string) => {
    for (const paragraph of text.split('\n')) {
      let remainder = paragraph;
      while (remainder.length > width) { lines.push(remainder.slice(0, width)); remainder = remainder.slice(width); }
      lines.push(remainder);
    }
  };
  const detail = (label: string, value: unknown) => { if (value != null && value !== '') wrap(`${label}: ${String(value)}`); };
  const money = (label: string, value: number | undefined) => { if (value != null && value !== 0) detail(label, amount(value)); };
  wrap(data.shopName); detail('Address', data.shopAddress); detail('TRN', data.shopGstin); detail('Tel', data.shopPhone);
  wrap(documentTitle(data)); detail('No.', data.invoiceNumber); detail('Date', formatBillDateTime(data.date));
  detail('Customer', data.customerName); detail('Address', data.customerAddress); detail('TRN', data.customerGstin);
  lines.push('-'.repeat(width)); wrap('All amounts in AED; rates exclude VAT');
  for (const item of data.items) { wrap(item.name); wrap(`${item.quantity} x ${amount(item.unit_price)} = ${amount(item.total)}`); }
  lines.push('-'.repeat(width)); money('Subtotal', data.subtotal); money('Discount', -data.discount); money('VAT', data.tax);
  money('Scrap credit', -(data.scrapDeduction || 0)); money('Return credit', -(data.returnDeduction || 0)); money('Points discount', -(data.pointsRedeemedDiscount || 0));
  detail('TOTAL incl. VAT', amount(credits.payable)); money('Refund amount', credits.refund); money('Received', data.receivedAmount); money('Balance', data.customerBalance ?? data.balanceAmount);
  detail('Payment', data.paymentMethod); detail('Due date', data.dueDate); detail('Biller', data.billerName);
  if (data.billSettings?.instructions) wrap(data.billSettings.instructions);
  if (data.isReprint) wrap('Copy / Reprint');
  return lines.join('\n') + '\n';
}
