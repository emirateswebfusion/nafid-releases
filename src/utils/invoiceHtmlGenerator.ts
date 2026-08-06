import type { BillSettings } from './receiptGenerator';

export interface InvoiceItemDisplay {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
  originalRate?: number;
  discountLabel?: string;
  brand?: string;
}

export interface InvoiceData {
  shopName: string;
  shopGstin?: string;
  shopState?: string;
  shopAddress?: string;
  shopPhone?: string;
  upiId?: string;
  invoiceNumber: string;
  date: string;
  billerName?: string;
  items: InvoiceItemDisplay[];
  subtotal: number;
  tax: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  discount: number;
  discountType?: string;
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
  customerAddress?: string;
  scrapDeduction?: number;
  scrapInvoiceNumber?: string;
  returnDeduction?: number;
  returnInvoiceNumber?: string;
  showProductOffers?: boolean;
  billSettings?: BillSettings;
  isB2B?: boolean;
}

function getDocumentTitle(invoiceType?: string, isReprint?: boolean, estimateMode?: boolean, isB2B?: boolean): string {
  if (isReprint) return 'INVOICE (REPRINT)';
  if (estimateMode) return 'BILL OF SUPPLY';
  switch (invoiceType) {
    case 'GST': return isB2B ? 'TAX INVOICE (B2B)' : 'TAX INVOICE (B2C)';
    case 'SCRAP': return 'SCRAP BILL';
    case 'BILL_OF_SUPPLY': return 'BILL OF SUPPLY';
    case 'ESTIMATE': return 'BILL OF SUPPLY';
    default: return 'INVOICE';
  }
}

export function generateInvoiceHtml(data: InvoiceData, style: 'standard' | 'modern' | 'classic' = 'standard'): string {
  const bs = data.billSettings;
  const isB2B = data.isB2B === true;
  const title = getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, isB2B);

  if (style === 'modern') return generateModernHtml(data, title);
  if (style === 'classic') return generateClassicHtml(data, title);
  return generateStandardHtml(data, title);
}

function generateStandardHtml(data: InvoiceData, title: string): string {
  const itemsHtml = data.items.map((item, idx) => {
    const brandHtml = data.billSettings?.showBrandName !== false && item.brand ? `<br><span class="brand-badge">${item.brand}</span>` : '';
    return `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td>${item.name}${brandHtml}${data.showProductOffers !== false && item.discountLabel ? `<br><span class="discount-badge">${item.discountLabel}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : ''}</td>
      <td class="text-center">${item.quantity}</td>
      <td class="text-right">₹${item.unit_price.toFixed(2)}</td>
      <td class="text-right">₹${item.total.toFixed(2)}</td>
    </tr>
  `;
  }).join('');



  return `<!DOCTYPE html>
<html><head><title>${title} - ${data.shopName}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; }
  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .header h1 { font-size: 22px; margin: 0; color: #1a1a1a; }
  .header p { font-size: 12px; color: #666; margin: 3px 0; }
  .invoice-title { font-size: 20px; font-weight: bold; text-align: center; margin: 15px 0; letter-spacing: 2px; color: #2563eb; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .info-block { flex: 1; }
  .info-block p { margin: 3px 0; font-size: 11px; }
  .info-block .label { color: #888; font-size: 10px; text-transform: uppercase; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #f0f4ff; padding: 8px 6px; border: 1px solid #d1d5db; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: bold; color: #374151; }
  td { padding: 7px 6px; border: 1px solid #d1d5db; font-size: 11px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .total-row td { font-weight: bold; border-top: 2px solid #333; }
  .grand-total td { font-size: 14px; font-weight: bold; color: #2563eb; }
  .discount-badge { font-size: 10px; color: #dc2626; font-weight: 600; }
  .brand-badge { font-size: 10px; color: #6b7280; font-weight: 600; }
  .terms { margin-top: 25px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #666; }
  .footer { text-align: center; font-size: 10px; color: #999; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } th { background: #f0f4ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="header">
    <h1>${data.shopName}</h1>
    ${data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
    ${data.shopPhone ? `<p>Phone: ${data.shopPhone}</p>` : ''}
    ${data.shopGstin && data.billSettings?.showShopGstin ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
  </div>
  <div class="invoice-title">${title}</div>
  <div class="info-row">
    <div class="info-block">
      <p><span class="label">Invoice #:</span> ${data.invoiceNumber}</p>
      <p><span class="label">Date:</span> ${data.date}</p>
      ${data.billerName ? `<p><span class="label">Biller:</span> ${data.billerName}</p>` : ''}
    </div>
    <div class="info-block" style="text-align:right">
      ${data.customerName && data.billSettings?.showCustomerName ? `<p><span class="label">Customer:</span> ${data.customerName}</p>` : ''}
      ${data.customerPhone ? `<p><span class="label">Phone:</span> ${data.customerPhone}</p>` : ''}
      ${data.customerGstin && data.billSettings?.showCustomerGstin ? `<p><span class="label">GSTIN:</span> ${data.customerGstin}</p>` : ''}
      ${data.customerState && data.billSettings?.showCustomerGstin ? `<p><span class="label">State:</span> ${data.customerState}</p>` : ''}
    </div>
  </div>
  <table>
    <thead><tr>
      <th class="text-center" style="width:36px">#</th>
      <th>Item</th>
      <th class="text-center" style="width:70px">Qty</th>
      <th class="text-right" style="width:80px">Rate</th>
      <th class="text-right" style="width:90px">Amount</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
    <tfoot>
      <tr class="total-row"><td colspan="4" class="text-right">Subtotal</td><td class="text-right">₹${data.subtotal.toFixed(2)}</td></tr>
      ${data.cgst != null && data.cgst > 0 ? `<tr><td colspan="4" class="text-right">CGST</td><td class="text-right">₹${data.cgst.toFixed(2)}</td></tr>` : ''}
      ${data.sgst != null && data.sgst > 0 ? `<tr><td colspan="4" class="text-right">SGST</td><td class="text-right">₹${data.sgst.toFixed(2)}</td></tr>` : ''}
      ${data.igst != null && data.igst > 0 ? `<tr><td colspan="4" class="text-right">IGST</td><td class="text-right">₹${data.igst.toFixed(2)}</td></tr>` : ''}
      ${data.discount > 0 ? `<tr><td colspan="4" class="text-right">Discount${data.discountType === 'PERCENTAGE' && data.discountValue ? ` (${data.discountValue}%)` : ''}</td><td class="text-right" style="color:#dc2626">-₹${data.discount.toFixed(2)}</td></tr>` : ''}
      <tr class="grand-total"><td colspan="4" class="text-right">Grand Total</td><td class="text-right">₹${data.grandTotal.toFixed(2)}</td></tr>
      ${data.scrapDeduction && data.scrapDeduction > 0 ? `<tr><td colspan="4" class="text-right">Scrap Return Amount (${data.scrapInvoiceNumber || ''})</td><td class="text-right" style="color:#dc2626">-₹${data.scrapDeduction.toFixed(2)}</td></tr>` : ''}
      ${data.returnDeduction && data.returnDeduction > 0 ? `<tr><td colspan="4" class="text-right">Return Credit (${data.returnInvoiceNumber || ''})</td><td class="text-right" style="color:#dc2626">-₹${data.returnDeduction.toFixed(2)}</td></tr>` : ''}
      ${((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > data.grandTotal ? `
      <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#ea580c">Refund Amount</td><td class="text-right" style="font-weight:bold;color:#ea580c">₹${(((data.scrapDeduction || 0) + (data.returnDeduction || 0)) - data.grandTotal).toFixed(2)}</td></tr>
      ` : ((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > 0 ? `
      <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#16a34a">Net Payable</td><td class="text-right" style="font-weight:bold;color:#16a34a">₹${(data.grandTotal - ((data.scrapDeduction || 0) + (data.returnDeduction || 0))).toFixed(2)}</td></tr>
      ` : ''}
      ${data.receivedAmount != null && data.balanceAmount != null ? `
      <tr><td colspan="4" class="text-right">Received</td><td class="text-right">₹${data.receivedAmount.toFixed(2)}</td></tr>
      <tr><td colspan="4" class="text-right">Balance</td><td class="text-right">₹${data.balanceAmount.toFixed(2)}</td></tr>` : ''}
    </tfoot>
  </table>
  ${data.upiId ? `<div style="text-align:center;margin-top:10px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px"><p style="font-size:11px;color:#666;margin:0">Pay via UPI: <strong>${data.upiId}</strong></p></div>` : ''}
  ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms & Conditions:</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}
  <div class="footer">Generated by Vendora POS — ${new Date().toLocaleString('en-IN')}</div>
</body></html>`;
}

function generateModernHtml(data: InvoiceData, title: string): string {
  const itemsHtml = data.items.map((item, idx) => {
    const brandHtml = data.billSettings?.showBrandName !== false && item.brand ? `<br><span style="font-size:9px;color:#6b7280;font-weight:600">${item.brand}</span>` : '';
    return `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 4px;font-size:11px;color:#374151">${idx + 1}</td>
      <td style="padding:6px 4px;font-size:11px;color:#374151">${item.name}${brandHtml}${data.showProductOffers !== false && item.discountLabel ? `<br><span style="font-size:9px;color:#dc2626;font-weight:600">${item.discountLabel}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : ''}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:center;color:#374151">${item.quantity}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:right;color:#374151">₹${item.unit_price.toFixed(2)}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:right;color:#374151;font-weight:600">₹${item.total.toFixed(2)}</td>
    </tr>
  `;
  }).join('');



  return `<!DOCTYPE html>
<html><head><title>${title} - ${data.shopName}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 12px; color: #1f2937; padding: 0; margin: 0; background: #f9fafb; }
  .page { background: #fff; max-width: 210mm; margin: 0 auto; padding: 30px 35px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-height: 297mm; }
  .header-bar { background: linear-gradient(135deg, #059669, #10b981); margin: -30px -35px 25px -35px; padding: 22px 35px; color: white; }
  .header-bar h1 { font-size: 20px; margin: 0; font-weight: 700; letter-spacing: -0.3px; }
  .header-bar p { font-size: 11px; margin: 2px 0; opacity: 0.85; }
  .invoice-badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 14px; border-radius: 4px; font-size: 10px; font-weight: 600; letter-spacing: 1.5px; margin-top: 6px; text-transform: uppercase; }
  .info-grid { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 14px 16px; background: #f9fafb; border-radius: 8px; }
  .info-grid .block p { margin: 2px 0; font-size: 10.5px; color: #4b5563; }
  .info-grid .block .lbl { color: #9ca3af; font-size: 9px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { padding: 8px 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
  .totals { margin-top: 15px; margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; color: #4b5563; }
  .totals .row.total { border-top: 2px solid #10b981; margin-top: 6px; padding-top: 8px; font-size: 14px; font-weight: 700; color: #059669; }
  .upi-box { text-align:center; margin-top: 15px; padding: 10px; background: #f0fdf4; border:1px solid #bbf7d0; border-radius:8px; }
  .upi-box p { font-size: 11px; color: #166534; margin: 0; }
  .footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
  .terms { margin-top: 20px; padding: 10px 14px; background: #f9fafb; border-radius: 6px; font-size: 10px; color: #6b7280; }
  .terms strong { color: #374151; }
  @media print { body { background: #fff; } .page { box-shadow: none; } .header-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="page">
    <div class="header-bar">
      <h1>${data.shopName}</h1>
      ${data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
      ${data.shopPhone ? `<p>${data.shopPhone}</p>` : ''}
      ${data.shopGstin && data.billSettings?.showShopGstin ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
      <div class="invoice-badge">${title}</div>
    </div>

    <div class="info-grid">
      <div class="block">
        <p><span class="lbl">Invoice #</span><br>${data.invoiceNumber}</p>
        <p><span class="lbl">Date</span><br>${data.date}</p>
        ${data.billerName ? `<p><span class="lbl">Biller</span><br>${data.billerName}</p>` : ''}
      </div>
      <div class="block" style="text-align:right">
        ${data.customerName && data.billSettings?.showCustomerName ? `<p><span class="lbl">Customer</span><br>${data.customerName}</p>` : ''}
        ${data.customerPhone ? `<p><span class="lbl">Phone</span><br>${data.customerPhone}</p>` : ''}
        ${data.customerGstin && data.billSettings?.showCustomerGstin ? `<p><span class="lbl">GSTIN</span><br>${data.customerGstin}</p>` : ''}
      </div>
    </div>

    <table>
      <thead><tr>
        <th style="text-align:center;width:30px">#</th>
        <th style="text-align:left">Item</th>
        <th style="text-align:center;width:60px">Qty</th>
        <th style="text-align:right;width:80px">Rate</th>
        <th style="text-align:right;width:90px">Amount</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>₹${data.subtotal.toFixed(2)}</span></div>
      ${data.cgst != null && data.cgst > 0 ? `<div class="row"><span>CGST</span><span>₹${data.cgst.toFixed(2)}</span></div>` : ''}
      ${data.sgst != null && data.sgst > 0 ? `<div class="row"><span>SGST</span><span>₹${data.sgst.toFixed(2)}</span></div>` : ''}
      ${data.igst != null && data.igst > 0 ? `<div class="row"><span>IGST</span><span>₹${data.igst.toFixed(2)}</span></div>` : ''}
      ${data.discount > 0 ? `<div class="row"><span>Discount${data.discountType === 'PERCENTAGE' && data.discountValue ? ` (${data.discountValue}%)` : ''}</span><span style="color:#dc2626">-₹${data.discount.toFixed(2)}</span></div>` : ''}
      <div class="row total"><span>Grand Total</span><span>₹${data.grandTotal.toFixed(2)}</span></div>
      ${data.scrapDeduction && data.scrapDeduction > 0 ? `<div class="row"><span>Scrap Return Amount (${data.scrapInvoiceNumber || ''})</span><span style="color:#dc2626">-₹${data.scrapDeduction.toFixed(2)}</span></div>` : ''}
      ${data.returnDeduction && data.returnDeduction > 0 ? `<div class="row"><span>Return Credit (${data.returnInvoiceNumber || ''})</span><span style="color:#dc2626">-₹${data.returnDeduction.toFixed(2)}</span></div>` : ''}
      ${((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > data.grandTotal ? `
      <div class="row" style="font-weight:bold;color:#ea580c"><span>Refund Amount</span><span>₹${(((data.scrapDeduction || 0) + (data.returnDeduction || 0)) - data.grandTotal).toFixed(2)}</span></div>
      ` : ((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > 0 ? `
      <div class="row" style="font-weight:bold;color:#16a34a"><span>Net Payable</span><span>₹${(data.grandTotal - ((data.scrapDeduction || 0) + (data.returnDeduction || 0))).toFixed(2)}</span></div>
      ` : ''}
      ${data.receivedAmount != null && data.balanceAmount != null ? `
      <div class="row"><span>Received</span><span>₹${data.receivedAmount.toFixed(2)}</span></div>
      <div class="row"><span>Balance</span><span>₹${data.balanceAmount.toFixed(2)}</span></div>` : ''}
    </div>

    ${data.upiId ? `<div class="upi-box"><p>Pay via UPI: <strong>${data.upiId}</strong></p></div>` : ''}

    ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms & Conditions</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}

    <div class="footer">Generated by Vendora POS — ${new Date().toLocaleString('en-IN')}</div>
  </div>
</body></html>`;
}

function generateClassicHtml(data: InvoiceData, title: string): string {
  const itemsHtml = data.items.map((item, idx) => {
    const brandHtml = data.billSettings?.showBrandName !== false && item.brand ? `<br><span style="font-size:9px;color:#6b7280;font-weight:600">${item.brand}</span>` : '';
    return `
    <tr>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:center">${idx + 1}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px">${item.name}${brandHtml}${data.showProductOffers !== false && item.discountLabel ? `<br><span style="font-size:9px;color:#b91c1c;font-style:italic">${item.discountLabel}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : ''}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:center">${item.quantity}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:right">₹${item.unit_price.toFixed(2)}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:right">₹${item.total.toFixed(2)}</td>
    </tr>
  `;
  }).join('');



  return `<!DOCTYPE html>
<html><head><title>${title} - ${data.shopName}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Times New Roman', 'Georgia', serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; }
  .outer-box { border: 2px double #333; padding: 20px; }
  .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 12px; }
  .header h1 { font-size: 24px; margin: 0; letter-spacing: 3px; font-weight: 700; }
  .header p { font-size: 11px; color: #555; margin: 2px 0; }
  .invoice-title { font-size: 18px; font-weight: bold; text-align: center; margin: 12px 0; letter-spacing: 4px; color: #1a1a1a; }
  .info-table { width: 100%; margin-bottom: 18px; font-size: 11px; }
  .info-table td { padding: 2px 4px; vertical-align: top; }
  .info-table .lbl { font-weight: 600; color: #555; }
  table.items { width: 100%; border-collapse: collapse; margin: 12px 0; }
  table.items th { background: #e5e7eb; padding: 7px 6px; border: 1px solid #9ca3af; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; text-align: left; }
  table.items td { padding: 5px 6px; border: 1px solid #9ca3af; font-size: 11px; }
  table.items tfoot td { font-weight: bold; border-top: 2px solid #333; }
  .grand-total td { font-size: 13px; font-weight: bold; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .discount-badge { font-size: 9px; color: #b91c1c; font-style: italic; }
  .terms { margin-top: 22px; padding-top: 10px; border-top: 1px solid #333; font-size: 10px; color: #555; }
  .terms strong { color: #1a1a1a; }
  .footer { text-align: center; font-size: 9px; color: #777; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 8px; font-style: italic; }
  .upi-box { text-align:center; margin-top: 12px; padding: 6px; border: 1px dashed #9ca3af; }
  .upi-box p { font-size: 11px; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } table.items th { background: #e5e7eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="outer-box">
    <div class="header">
      <h1>${data.shopName}</h1>
      ${data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
      ${data.shopPhone ? `<p>Phone: ${data.shopPhone}</p>` : ''}
    ${data.shopGstin && data.billSettings?.showShopGstin ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
  </div>
  <div class="invoice-title">— ${title} —</div>

    <table class="info-table">
      <tr>
        <td style="width:50%">
          <span class="lbl">Invoice No:</span> ${data.invoiceNumber}<br>
          <span class="lbl">Date:</span> ${data.date}<br>
          ${data.billerName ? `<span class="lbl">Biller:</span> ${data.billerName}<br>` : ''}
        </td>
        <td style="width:50%;text-align:right">
          ${data.customerName && data.billSettings?.showCustomerName ? `<span class="lbl">Customer:</span> ${data.customerName}<br>` : ''}
          ${data.customerPhone ? `<span class="lbl">Phone:</span> ${data.customerPhone}<br>` : ''}
          ${data.customerGstin && data.billSettings?.showCustomerGstin ? `<span class="lbl">GSTIN:</span> ${data.customerGstin}<br>` : ''}
          ${data.customerState && data.billSettings?.showCustomerGstin ? `<span class="lbl">State:</span> ${data.customerState}<br>` : ''}
        </td>
      </tr>
    </table>

    <table class="items">
      <thead><tr>
        <th style="width:32px;text-align:center">#</th>
        <th>Particulars</th>
        <th style="width:55px;text-align:center">Qty</th>
        <th style="width:75px;text-align:right">Rate</th>
        <th style="width:85px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot>
        <tr><td colspan="4" class="text-right">Subtotal</td><td class="text-right">₹${data.subtotal.toFixed(2)}</td></tr>
        ${data.cgst != null && data.cgst > 0 ? `<tr><td colspan="4" class="text-right">CGST</td><td class="text-right">₹${data.cgst.toFixed(2)}</td></tr>` : ''}
        ${data.sgst != null && data.sgst > 0 ? `<tr><td colspan="4" class="text-right">SGST</td><td class="text-right">₹${data.sgst.toFixed(2)}</td></tr>` : ''}
        ${data.igst != null && data.igst > 0 ? `<tr><td colspan="4" class="text-right">IGST</td><td class="text-right">₹${data.igst.toFixed(2)}</td></tr>` : ''}
        ${data.discount > 0 ? `<tr><td colspan="4" class="text-right">Discount${data.discountType === 'PERCENTAGE' && data.discountValue ? ` (${data.discountValue}%)` : ''}</td><td class="text-right" style="color:#b91c1c">-₹${data.discount.toFixed(2)}</td></tr>` : ''}
        <tr class="grand-total"><td colspan="4" class="text-right">Grand Total</td><td class="text-right">₹${data.grandTotal.toFixed(2)}</td></tr>
        ${data.scrapDeduction && data.scrapDeduction > 0 ? `<tr><td colspan="4" class="text-right">Scrap Return Amount (${data.scrapInvoiceNumber || ''})</td><td class="text-right" style="color:#b91c1c">-₹${data.scrapDeduction.toFixed(2)}</td></tr>` : ''}
        ${data.returnDeduction && data.returnDeduction > 0 ? `<tr><td colspan="4" class="text-right">Return Credit (${data.returnInvoiceNumber || ''})</td><td class="text-right" style="color:#b91c1c">-₹${data.returnDeduction.toFixed(2)}</td></tr>` : ''}
        ${((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > data.grandTotal ? `
        <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#c2410c">Refund Amount</td><td class="text-right" style="font-weight:bold;color:#c2410c">₹${(((data.scrapDeduction || 0) + (data.returnDeduction || 0)) - data.grandTotal).toFixed(2)}</td></tr>
        ` : ((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > 0 ? `
        <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#15803d">Net Payable</td><td class="text-right" style="font-weight:bold;color:#15803d">₹${(data.grandTotal - ((data.scrapDeduction || 0) + (data.returnDeduction || 0))).toFixed(2)}</td></tr>
        ` : ''}
        ${data.receivedAmount != null && data.balanceAmount != null ? `
        <tr><td colspan="4" class="text-right">Received</td><td class="text-right">₹${data.receivedAmount.toFixed(2)}</td></tr>
        <tr><td colspan="4" class="text-right">Balance</td><td class="text-right">₹${data.balanceAmount.toFixed(2)}</td></tr>` : ''}
      </tfoot>
    </table>

    ${data.upiId ? `<div class="upi-box"><p>Pay via UPI: <strong>${data.upiId}</strong></p></div>` : ''}

    ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms & Conditions:</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}

    <div class="footer">This is a computer generated invoice — Generated by Vendora POS on ${new Date().toLocaleString('en-IN')}</div>
  </div>
</body></html>`;
}
