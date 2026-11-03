import type { InvoiceData } from './invoiceHtml/invoiceHtmlCore';
import type { ReceiptData } from './receipt/receiptCore';
import { formatBillDateTime } from './receipt/receiptCore';
import { receiptCreditTotals } from '../pricing/receiptCredits';
import { formatCurrency } from '../pricing/money';
import { UAE_ARABIC_CSS, UAE_LABELS as L, bilingualHtml, bilingualText, getUaeArabicPrint, uaeDocumentTitle, uaeNumberLabel, uaePaymentMethod, uaeVatLabel, type BilingualLabel } from './uaeLabels';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const amount = (value: unknown) => formatCurrency(value);
const isPurchase = (data: InvoiceData | ReceiptData) => data.invoiceType === 'PURCHASE';

/** UAE documents use the stored tax total, never a fabricated Indian GST breakdown. */
export function generateUaeInvoiceHtml(data: InvoiceData): string {
  const arabic = getUaeArabicPrint().documents;
  const label = (pair: BilingualLabel) => bilingualHtml(pair, arabic);
  const head = (pair: BilingualLabel) => bilingualHtml(pair, arabic, '<br>');
  const title = uaeDocumentTitle(data);
  const credits = receiptCreditTotals(data);
  const detail = (pair: BilingualLabel, value: unknown) => value == null || value === '' ? '' : `<p><b>${label(pair)}:</b> ${escape(value)}</p>`;
  const row = (pair: BilingualLabel, value: number | undefined) => value == null || value === 0 ? '' : `<tr><th>${label(pair)}</th><td>${amount(value)}</td></tr>`;
  const payment = uaePaymentMethod(data.paymentMethod);
  const items = data.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escape(item.name)}${item.unit ? ` (${escape(item.unit)})` : ''}</td><td>${escape(item.quantity)}</td><td>${amount(item.unit_price)}</td><td>${amount(item.total)}</td><td>${escape(item.tax_rate_percent ?? item.gst_percent ?? '')}%</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>${escape(title.en)} ${escape(data.invoiceNumber)}</title><style>
    @page{margin:12mm}body{font:12px Arial,"Segoe UI",Tahoma,sans-serif;color:#111;margin:0}h1{font-size:22px}h2{font-size:17px}p{margin:5px 0}.parties{display:flex;justify-content:space-between;gap:20px}.parties>div{width:48%}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{border:1px solid #aaa;padding:7px;text-align:right}th:nth-child(2),td:nth-child(2){text-align:left}.totals{width:55%;margin-left:auto}.totals th{text-align:left}tr{break-inside:avoid}.notes{white-space:pre-wrap}footer{margin-top:20px;border-top:1px solid #aaa;padding-top:10px}${UAE_ARABIC_CSS}
    </style></head><body><h1>${label(title)}</h1><div class="parties"><div><h2>${escape(data.shopName)}</h2>
    ${detail(L.address, data.shopAddress)}${detail(L.trn, data.shopGstin)}${detail(L.phone, data.shopPhone)}${detail(L.email, data.shopEmail)}${detail(L.website, data.shopWebsite)}
    </div><div>${detail(uaeNumberLabel(data.invoiceType), data.invoiceNumber)}${detail(L.issueDate, formatBillDateTime(data.date))}${detail(isPurchase(data) ? L.supplier : L.customer, data.customerName)}${detail(L.customerAddress, data.customerAddress)}${detail(L.customerTrn, data.customerGstin)}${detail(L.customerPhone, data.customerPhone)}${detail(L.dueDate, data.dueDate)}${detail(L.biller, data.billerName)}</div></div>
    <p>${label(L.currency)}</p><table><thead><tr><th>#</th><th>${head(L.description)}</th><th>${head(L.quantity)}</th><th>${head(L.unitPrice)}</th><th>${head(L.amount)}</th><th>${head(L.vatRate)}</th></tr></thead><tbody>${items}</tbody></table>
    <table class="totals"><tbody>${row(L.subtotal, data.subtotal)}${row(L.discount, -data.discount)}${row(uaeVatLabel(data.items), data.tax)}${row(L.scrapCredit, -(data.scrapDeduction || 0))}${row(L.returnCredit, -(data.returnDeduction || 0))}${row(L.pointsDiscount, -(data.pointsRedeemedDiscount || 0))}<tr><th>${label(L.totalInclVat)}</th><td><b>${amount(credits.payable)}</b></td></tr>${row(L.refund, credits.refund)}${row(L.received, data.receivedAmount)}${row(L.balance, data.customerBalance ?? data.balanceAmount)}${row(L.previousBalance, data.oldBalance)}</tbody></table>
    ${payment ? `<p><b>${label(L.paymentMethod)}:</b> ${label(payment)}</p>` : ''}${detail(L.bank, data.bankName)}${detail(L.iban, data.bankAccount)}${detail(L.swift, data.bankIfsc)}${detail(L.branch, data.bankBranch)}${detail(L.shippingAddress, data.shippingAddress)}${detail(L.vehicle, data.vehicleNumber)}${detail(L.electronicRef, data.electronicRefNumber)}
    <div class="notes">${escape(data.description)}\n${escape(data.notes)}\n${escape(data.billSettings?.instructions)}</div><footer>${isPurchase(data) ? '' : `<p>${label(L.thankYou)}</p>`}${data.isReprint ? label(L.reprint) : ''}</footer></body></html>`;
}

/**
 * Thermal output keeps AED totals legible on both 58 mm and 80 mm paper. Arabic follows the thermal setting
 * (off by default): USB/driver printers render it through Chromium; network ESC/POS printers drop it in
 * `sanitizeForEscPos` and keep the English half.
 */
export function generateUaeReceipt(data: ReceiptData, width = 42): string {
  const arabic = getUaeArabicPrint().thermal;
  const text = (pair: BilingualLabel) => bilingualText(pair, arabic);
  const credits = receiptCreditTotals(data);
  const lines: string[] = [];
  const wrap = (value: string) => {
    for (const paragraph of value.split('\n')) {
      let remainder = paragraph;
      while (remainder.length > width) {
        // Break at the last space so a word (and an Arabic word's joined letters) is never split.
        const space = remainder.lastIndexOf(' ', width);
        const cut = space > 0 ? space : width;
        lines.push(remainder.slice(0, cut));
        remainder = remainder.slice(space > 0 ? cut + 1 : cut);
      }
      lines.push(remainder);
    }
  };
  const detail = (pair: BilingualLabel, value: unknown) => { if (value != null && value !== '') wrap(`${text(pair)}: ${String(value)}`); };
  const money = (pair: BilingualLabel, value: number | undefined) => { if (value != null && value !== 0) detail(pair, amount(value)); };
  const payment = uaePaymentMethod(data.paymentMethod);
  wrap(data.shopName); detail(L.address, data.shopAddress); detail(L.trn, data.shopGstin); detail(L.tel, data.shopPhone);
  wrap(text(uaeDocumentTitle(data))); detail(L.no, data.invoiceNumber); detail(L.date, formatBillDateTime(data.date));
  detail(isPurchase(data) ? L.supplier : L.customer, data.customerName); detail(L.address, data.customerAddress); detail(L.trn, data.customerGstin);
  lines.push('-'.repeat(width)); wrap(text(L.amountsNote));
  for (const item of data.items) { wrap(item.name); wrap(`${item.quantity} x ${amount(item.unit_price)} = ${amount(item.total)}`); }
  lines.push('-'.repeat(width)); money(L.subtotal, data.subtotal); money(L.discount, -data.discount); money(uaeVatLabel(data.items), data.tax);
  money(L.scrapCredit, -(data.scrapDeduction || 0)); money(L.returnCredit, -(data.returnDeduction || 0)); money(L.pointsDiscount, -(data.pointsRedeemedDiscount || 0));
  detail(L.totalInclVatShort, amount(credits.payable)); money(L.refund, credits.refund); money(L.received, data.receivedAmount); money(L.balance, data.customerBalance ?? data.balanceAmount);
  if (payment) detail(L.payment, text(payment)); detail(L.dueDate, data.dueDate); detail(L.biller, data.billerName);
  if (data.billSettings?.instructions) wrap(data.billSettings.instructions);
  if (!isPurchase(data)) wrap(text(L.thankYou));
  if (data.isReprint) wrap(text(L.reprint));
  return lines.join('\n') + '\n';
}
