import { storeDate, storeDateTime } from '../../time/dateDisplay';
import { getStoreLocale } from '../../localization/storeProfile';
import { getCurrencyPrefix } from '../../localization/storeProfile';
import { isUaeStore } from '../../localization/storeProfile';
import { generateUaeInvoiceHtml } from '../uaeInvoice';
import { getStoreTimezone } from '../../time/timezoneHelper';
import { splitTaxAmount } from '../../pricing/checkoutLines';


export function generatePurchaseBillHtml(
  shopInfo: { shopName?: string | null; shopAddress?: string | null; shopPhone?: string | null; shopGstin?: string },
  bill: {
    bill_number: string;
    supplier_name: string;
    supplier_phone?: string | null;
    supplier_address?: string | null;
    supplier_gstin?: string | null;
    bill_date: string | null;
    invoice_number?: string | null;
    bill_type: string | null;
    payment_type?: string | null;
    notes?: string | null;
    total_amount: number | null;
    created_at?: string | null;
  },
  items: Array<{
    name: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    is_gst_applicable?: number | null;
    tax_rate_percent?: number | null;
    hsn_sac_code?: string | null;
    item_code?: string | null;
    sku_barcode?: string | null;
  }>
): string {
  if (isUaeStore()) {
    const lines = items.map(item => ({ name: item.name, quantity: item.quantity, unit_price: item.purchase_price, total: item.quantity * item.purchase_price, tax_rate_percent: bill.bill_type === 'GST' && (item.is_gst_applicable ?? 1) === 1 ? item.tax_rate_percent || 0 : 0 }));
    const subtotal = lines.reduce((sum, item) => sum + item.total, 0);
    const tax = lines.reduce((sum, item) => sum + item.total * item.tax_rate_percent / 100, 0);
    return generateUaeInvoiceHtml({ shopName: shopInfo.shopName || '', shopAddress: shopInfo.shopAddress || undefined, shopPhone: shopInfo.shopPhone || undefined, shopGstin: shopInfo.shopGstin, customerName: bill.supplier_name, customerAddress: bill.supplier_address || undefined, customerGstin: bill.supplier_gstin || undefined, invoiceNumber: bill.bill_number, invoiceType: 'PURCHASE', date: bill.bill_date || bill.created_at || '', items: lines, subtotal, tax, discount: 0, grandTotal: bill.total_amount ?? subtotal + tax, notes: bill.notes || undefined });
  }
  const isGst = bill.bill_type === 'GST';
  const title = isGst ? 'PURCHASE BILL (GST)' : 'PURCHASE ESTIMATE BILL';

  let totalTaxable = 0;
  let totalTax = 0;
  let totalQty = 0;

  const itemRows = items.map((item, index) => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.purchase_price) || 0;
    const itemTaxable = qty * rate;
    const taxRate = (isGst && (item.is_gst_applicable ?? 1) === 1) ? (Number(item.tax_rate_percent) || 0) : 0;
    const taxAmount = itemTaxable * (taxRate / 100);
    const itemTotal = itemTaxable + taxAmount;

    totalTaxable += itemTaxable;
    totalTax += taxAmount;
    totalQty += qty;

    return `
      <tr>
        <td style="text-align: center; padding: 6px 8px; border: 1px solid #d1d5db;">${index + 1}</td>
        <td style="padding: 6px 8px; border: 1px solid #d1d5db;">
          <div style="font-weight: 600; color: #111827;">${item.name || 'Item'}</div>
          ${item.item_code || item.sku_barcode ? `<div style="font-size: 10px; color: #6b7280;">Code: ${item.item_code || item.sku_barcode}</div>` : ''}
        </td>
        ${isGst ? `<td style="text-align: center; padding: 6px 8px; border: 1px solid #d1d5db;">${item.hsn_sac_code || '—'}</td>` : ''}
        <td style="text-align: center; padding: 6px 8px; border: 1px solid #d1d5db; font-weight: 600;">${qty}</td>
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db;">${getCurrencyPrefix()}${rate.toFixed(2)}</td>
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db;">${getCurrencyPrefix()}${itemTaxable.toFixed(2)}</td>
        ${isGst ? `<td style="text-align: center; padding: 6px 8px; border: 1px solid #d1d5db;">${taxRate}%</td>` : ''}
        ${isGst ? `<td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db;">${getCurrencyPrefix()}${taxAmount.toFixed(2)}</td>` : ''}
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db; font-weight: 700;">${getCurrencyPrefix()}${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const grandTotal = isGst ? (totalTaxable + totalTax) : (bill.total_amount ?? 0);
  const roundOff = Math.round(grandTotal) - grandTotal;
  const finalTotal = Math.round(grandTotal);

  const taxSplit = splitTaxAmount(totalTax);
  const formattedDate = bill.bill_date ? storeDate(bill.bill_date, getStoreLocale(), { timeZone: getStoreTimezone(), day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Bill - ${bill.bill_number}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #111827;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #111827;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .company-title {
      font-size: 20px;
      font-weight: 800;
      color: #111827;
      margin: 0 0 4px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .company-details {
      font-size: 11px;
      color: #4b5563;
      line-height: 1.4;
    }
    .doc-badge {
      text-align: right;
    }
    .doc-title {
      font-size: 16px;
      font-weight: 800;
      color: ${isGst ? '#059669' : '#d97706'};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .bill-meta {
      font-size: 11px;
      color: #374151;
      line-height: 1.5;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .info-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f9fafb;
    }
    .info-card-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
    }
    .info-card-name {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
    }
    .info-card-sub {
      font-size: 11px;
      color: #4b5563;
      margin-top: 2px;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    table.items-table th {
      background-color: #f3f4f6;
      color: #374151;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px;
      border: 1px solid #d1d5db;
    }
    .totals-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 12px;
    }
    .notes-box {
      width: 55%;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      background: #f9fafb;
      font-size: 12.5px;
      line-height: 1.45;
    }
    .totals-box {
      width: 40%;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      background: #fff;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      padding: 3px 0;
      color: #374151;
    }
    .totals-row.grand {
      border-top: 2px solid #111827;
      margin-top: 6px;
      padding-top: 6px;
      font-size: 14px;
      font-weight: 800;
      color: #111827;
    }
    .footer-sign {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .sign-box {
      text-align: center;
      width: 180px;
      border-top: 1px solid #9ca3af;
      padding-top: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="company-title">${shopInfo.shopName || 'STORE / BUSINESS NAME'}</h1>
      <div class="company-details">
        ${shopInfo.shopAddress ? `<div>${shopInfo.shopAddress}</div>` : ''}
        ${shopInfo.shopPhone ? `<div>Phone: ${shopInfo.shopPhone}</div>` : ''}
        ${shopInfo.shopGstin ? `<div>GSTIN: ${shopInfo.shopGstin}</div>` : ''}
      </div>
    </div>
    <div class="doc-badge">
      <div class="doc-title">${title}</div>
      <div class="bill-meta">
        <div><strong>Bill No:</strong> ${bill.bill_number}</div>
        <div><strong>Date:</strong> ${formattedDate}</div>
        ${bill.invoice_number ? `<div><strong>Ref/Inv No:</strong> ${bill.invoice_number}</div>` : ''}
        ${bill.payment_type ? `<div><strong>Payment:</strong> ${bill.payment_type}</div>` : ''}
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <div class="info-card-title">Supplier / Party Details</div>
      <div class="info-card-name">${bill.supplier_name}</div>
      ${bill.supplier_phone ? `<div class="info-card-sub">Phone: ${bill.supplier_phone}</div>` : ''}
      ${bill.supplier_gstin ? `<div class="info-card-sub">GSTIN: ${bill.supplier_gstin}</div>` : ''}
      ${bill.supplier_address ? `<div class="info-card-sub">${bill.supplier_address}</div>` : ''}
    </div>
    <div class="info-card">
      <div class="info-card-title">Billing Store / Purchaser</div>
      <div class="info-card-name">${shopInfo.shopName || 'Store'}</div>
      ${shopInfo.shopGstin ? `<div class="info-card-sub">GSTIN: ${shopInfo.shopGstin}</div>` : ''}
      ${shopInfo.shopPhone ? `<div class="info-card-sub">Phone: ${shopInfo.shopPhone}</div>` : ''}
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 40px;">#</th>
        <th>Item Description</th>
        ${isGst ? `<th style="width: 80px;">HSN/SAC</th>` : ''}
        <th style="width: 60px;">Qty</th>
        <th style="width: 90px; text-align: right;">Unit Price</th>
        <th style="width: 95px; text-align: right;">Taxable</th>
        ${isGst ? `<th style="width: 55px;">GST %</th>` : ''}
        ${isGst ? `<th style="width: 85px; text-align: right;">Tax</th>` : ''}
        <th style="width: 100px; text-align: right;">Total Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals-container">
    <div class="notes-box">
      <div style="font-weight: 700; color: #111827; margin-bottom: 4px; text-transform: uppercase; font-size: 11px;">Notes / Remarks</div>
      <div style="color: #1a1a1a; white-space: pre-line;">${(bill as typeof bill & { description?: string; notes?: string }).description || (bill as typeof bill & { description?: string; notes?: string }).notes || 'No extra notes recorded.'}</div>
    </div>
    <div class="totals-box">
      <div class="totals-row">
        <span>Total Items / Qty:</span>
        <span><strong>${items.length} items (${totalQty})</strong></span>
      </div>
      <div class="totals-row">
        <span>Subtotal / Taxable:</span>
        <span>${getCurrencyPrefix()}${totalTaxable.toFixed(2)}</span>
      </div>
      ${isGst && totalTax > 0 ? `
        <div class="totals-row">
          <span>CGST:</span>
          <span>${getCurrencyPrefix()}${taxSplit.cgst.toFixed(2)}</span>
        </div>
        <div class="totals-row">
          <span>SGST:</span>
          <span>${getCurrencyPrefix()}${taxSplit.sgst.toFixed(2)}</span>
        </div>
        <div class="totals-row" style="font-weight: 700;">
          <span>Total Tax:</span>
          <span>${getCurrencyPrefix()}${totalTax.toFixed(2)}</span>
        </div>
      ` : ''}
      ${roundOff !== 0 ? `
        <div class="totals-row">
          <span>Round Off:</span>
          <span>${getCurrencyPrefix()}${roundOff.toFixed(2)}</span>
        </div>
      ` : ''}
      <div class="totals-row grand">
        <span>Grand Total:</span>
        <span>${getCurrencyPrefix()}${finalTotal.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <div class="footer-sign">
    <div>
      <div style="font-size: 10px; color: #9ca3af;">Generated on ${storeDateTime(new Date(), getStoreLocale(), { timeZone: getStoreTimezone() })}</div>
    </div>
    <div class="sign-box">
      Authorized Signatory
    </div>
  </div>
</body>
</html>`;
}
