import { getEffectiveBillSettings, formatPrintItem } from '../../receiptGenerator';
import { getStoreTimezone } from '../../timezoneHelper';
import { type InvoiceData, shouldShowItemMrpHtml, formatItemNameForBill, renderHtmlBalanceRows } from '../invoiceHtmlCore';


export function generateClassicHtml(data: InvoiceData, title: string): string {
  const isGstBill = data.invoiceType === 'GST' || data.isB2B === true;
  const bs = getEffectiveBillSettings(data.billSettings, isGstBill);
  const isRateQty = bs?.itemColumnOrder === 'rate_qty';
  const itemsHtml = data.items.map((item, idx) => {
    const fmt = formatPrintItem(item, bs, isGstBill);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = bs?.showBrandName !== false && item.brand ? `<br><span style="font-size:9px;color:#6b7280;font-weight:600">${item.brand}</span>` : '';
    const uomLower = (item.unit || '').trim().toLowerCase();
    const isWeightProd = item.billing_type === 'WEIGHT' || ['kg', 'kgs', 'g', 'gram', 'grams', 'gm', 'gms', 'ltr', 'ltrs', 'ml', 'mtr', 'mtrs'].includes(uomLower);
    const pcsNum = (item.pieces_override != null && item.pieces_override > 0) ? item.pieces_override : ((item.pieces_sold != null && item.pieces_sold > 0) ? item.pieces_sold : undefined);
    const pcsHtml = (isWeightProd && pcsNum != null && !fmt.isWeightHidden) ? ` <span style="font-size:9px;color:#4b5563;font-weight:600">(${pcsNum} Pcs)</span>` : '';
    const comboHtml = item.isCombo && item.combo_items && item.combo_items.length > 0
      ? `<br><b style="font-size:10px; color:#1a1a1a; font-weight:900; letter-spacing:0.5px;">[COMBO OFFER]</b> <span style="font-size:9.5px; color:#555; font-weight:bold; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    const middleCols = isRateQty
      ? `<td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:right">₹${fmt.displayRate}</td><td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:center">${fmt.displayQty}</td>`
      : `<td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:center">${fmt.displayQty}</td><td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:right">₹${fmt.displayRate}</td>`;
    const offerLabelText = item.discountLabel || (item.originalRate != null && item.originalRate !== item.unit_price ? 'Offer' : '');
    const offerHtml = shouldShowItemMrpHtml(data, item) && offerLabelText ? `<br><span style="font-size:9px;color:#b91c1c;font-style:italic">${offerLabelText}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : '';
    return `
    <tr>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:center">${idx + 1}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px">${displayName}${brandHtml}${pcsHtml}${comboHtml}${offerHtml}</td>
      ${middleCols}
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:right">₹${fmt.displayTotal}</td>
    </tr>
  `;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="page-size" content="A4"><meta name="page-orientation" content="portrait"><title>${title} - ${data.shopName}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
  .outer-box { border: 2px double #333; padding: 20px; }
  .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 12px; }
  .header h1 { font-size: 24px; margin: 0; letter-spacing: 3px; font-weight: 700; }
  .header p { font-size: 11px; color: #555; margin: 2px 0; }
  .invoice-title { font-size: 18px; font-weight: bold; text-align: center; margin: 12px 0; letter-spacing: 4px; color: #1a1a1a; }
  .info-table { width: 100%; margin-bottom: 18px; font-size: 11px; }
  .info-table td { padding: 2px 4px; vertical-align: top; }
  .info-table .lbl { font-weight: 600; color: #555; }
  table.items { width: 100%; border-collapse: collapse; margin: 12px 0; }
  table.items tfoot { display: table-row-group; page-break-inside: avoid; break-inside: avoid; }
  table.items th { background: #e5e7eb; padding: 7px 6px; border: 1px solid #9ca3af; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; text-align: left; }
  table.items td { padding: 5px 6px; border: 1px solid #9ca3af; font-size: 11px; }
  table.items tfoot td { font-weight: bold; border-top: 2px solid #333; }
  .grand-total td { font-size: 13px; font-weight: bold; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .discount-badge { font-size: 9px; color: #b91c1c; font-style: italic; }
  .terms { margin-top: 22px; padding-top: 10px; border-top: 1px solid #333; font-size: 13px; color: #1a1a1a; line-height: 1.5; }
  .terms strong { color: #000; font-size: 13.5px; }
  .footer { text-align: center; font-size: 9px; color: #777; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 8px; font-style: italic; }
  .upi-box { text-align:center; margin-top: 12px; padding: 6px; border: 1px dashed #9ca3af; }
  .upi-box p { font-size: 11px; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } table.items th { background: #e5e7eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="outer-box">
    <div class="header">
      ${bs.showShopName !== false && data.shopName ? `<h1>${data.shopName}</h1>` : ''}
      ${bs.showShopAddress !== false && data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
      ${bs.showPhone !== false && data.shopPhone ? `<p>Phone: ${data.shopPhone}</p>` : ''}
      ${data.shopGstin && bs.showShopGstin !== false ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
      ${data.shopState && bs.showShopState !== false ? `<p>State: ${data.shopState}</p>` : ''}
    </div>
  ${bs.showTitle !== false ? `<div class="invoice-title">— ${title} —</div>` : ''}

    <table class="info-table">
      <tr>
        <td style="width:50%">
          <span class="lbl">Invoice No:</span> ${data.invoiceNumber}<br>
          <span class="lbl">Date:</span> ${data.date}<br>
          ${data.billerName && bs.showBillerName !== false ? `<span class="lbl">Biller:</span> ${data.billerName}<br>` : ''}
        </td>
        <td style="width:50%;text-align:right">
          ${data.customerName && bs.showCustomerName !== false ? `<span class="lbl">Customer:</span> ${data.customerName}<br>` : ''}
          ${data.customerAddress && bs.showCustomerAddress !== false ? `<span class="lbl">Address:</span> ${data.customerAddress}<br>` : ''}
          ${data.customerPhone && bs.showCustomerPhone !== false ? `<span class="lbl">Phone:</span> ${data.customerPhone}<br>` : ''}
          ${data.customerGstin && bs.showCustomerGstin !== false ? `<span class="lbl">GSTIN:</span> ${data.customerGstin}<br>` : ''}
          ${data.customerState && bs.showCustomerState !== false ? `<span class="lbl">State:</span> ${data.customerState}<br>` : ''}
        </td>
      </tr>
    </table>

    ${(data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo || data.shippingAddress) ? `
    <div style="margin-bottom: 12px; padding: 6px 10px; border: 1px solid #333; font-size: 11px; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between;">
      ${(data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo) ? `
      <div>
        <strong>Transporter / E-Way:</strong>
        ${data.transporterName ? `<span style="margin-left: 6px;">Transporter: <strong>${data.transporterName}</strong></span>` : ''}
        ${data.vehicleNumber ? `<span style="margin-left: 6px;">Veh: <strong>${data.vehicleNumber}</strong></span>` : ''}
        ${data.transporterDocNo ? `<span style="margin-left: 6px;">Doc: <strong>${data.transporterDocNo}</strong></span>` : ''}
        ${data.ewayBillNo ? `<span style="margin-left: 6px;">E-Way: <strong>${data.ewayBillNo}</strong></span>` : ''}
      </div>` : ''}
      ${data.shippingAddress ? `
      <div>
        <strong>Shipping Address:</strong>
        <span style="margin-left: 6px;">${data.shippingName ? `<strong>${data.shippingName}</strong> - ` : ''}${data.shippingAddress}</span>
      </div>` : ''}
    </div>` : ''}

    <table class="items">
      <thead><tr>
        <th style="width:32px;text-align:center">#</th>
        <th>Particulars</th>
        ${isRateQty
          ? `<th style="width:75px;text-align:right">Rate</th><th style="width:55px;text-align:center">Qty</th>`
          : `<th style="width:55px;text-align:center">Qty</th><th style="width:75px;text-align:right">Rate</th>`}
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
        ${data.pointsRedeemed && data.pointsRedeemed > 0 ? `<tr><td colspan="4" class="text-right">Points Redeemed (${data.pointsRedeemed} pts)</td><td class="text-right" style="color:#d97706">-₹${(data.pointsRedeemedDiscount || 0).toFixed(2)}</td></tr>` : ''}
        ${((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > data.grandTotal ? `
        <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#c2410c">Refund Amount</td><td class="text-right" style="font-weight:bold;color:#c2410c">₹${(((data.scrapDeduction || 0) + (data.returnDeduction || 0)) - data.grandTotal).toFixed(2)}</td></tr>
        ` : ((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > 0 ? `
        <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#15803d">Net Payable</td><td class="text-right" style="font-weight:bold;color:#15803d">₹${(data.grandTotal - ((data.scrapDeduction || 0) + (data.returnDeduction || 0))).toFixed(2)}</td></tr>
        ` : ''}
        ${renderHtmlBalanceRows(data, 'table')}
      </tfoot>
    </table>

    ${(data.pointsEarned || data.remainingPointsBalance != null) ? `
    <div style="margin-top: 8px; padding: 6px 12px; background: #ecfdf5; border: 1px dashed #10b981; border-radius: 6px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; color: #065f46;">
      <div><strong>Loyalty Points:</strong> ${data.pointsEarned ? `Earned: +${data.pointsEarned} pts` : ''} ${data.pointsRedeemed ? ` | Redeemed: -${data.pointsRedeemed} pts` : ''}</div>
      ${data.remainingPointsBalance != null ? `<div><strong>Current Balance:</strong> ${data.remainingPointsBalance} pts</div>` : ''}
    </div>` : ''}

    ${data.upiId ? `
    <div class="upi-box" style="text-align: center; margin-top: 15px; padding: 10px; border: 1px dashed #9ca3af; display: flex; flex-direction: column; align-items: center; justify-content: center;">
      ${data.showUpiQr !== false ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&amp;data=${encodeURIComponent(`upi://pay?pa=${data.upiId}&pn=${data.shopName || 'Store'}&am=${data.grandTotal.toFixed(2)}&cu=INR`)}" alt="UPI QR Code" style="width: 140px; height: 140px; margin: 0 auto 6px auto; display: block;" />` : ''}
      <p style="margin: 0; font-size: 11px; font-weight: 600;">Scan & Pay via UPI: <strong>${data.upiId}</strong></p>
    </div>` : ''}

    ${bs?.showDescription !== false && (data.description || data.notes) ? `<div class="terms" style="margin-top: 10px;"><strong>Description / Notes:</strong><br>${(data.description || data.notes)!.replace(/\n/g, '<br>')}</div>` : ''}
    ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms & Conditions:</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}
    ${(bs?.showForShopName !== false && data.shopName) || bs?.showAuthorisedSignatory !== false ? `
    <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
      <div style="text-align: right; font-size: 11px;">
        ${bs?.showForShopName !== false && data.shopName ? `<div style="font-weight: bold; text-transform: uppercase;">For ${data.shopName.toUpperCase()}</div>` : ''}
        ${bs?.showAuthorisedSignatory !== false ? `
        <div style="height: 35px;"></div>
        <div style="font-weight: bold;">Authorised Signatory</div>
        ` : ''}
      </div>
    </div>
    ` : ''}
    <div class="footer">This is a computer generated invoice — Generated by Nafid on ${new Date().toLocaleString('en-IN', { timeZone: getStoreTimezone() })}</div>
  </div>
</body></html>`;
}
