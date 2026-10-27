import { getEffectiveBillSettings, formatPrintItem } from '../../receiptGenerator';
import { getStoreTimezone } from '../../timezoneHelper';
import { type InvoiceData, shouldShowItemMrpHtml, formatItemNameForBill, renderHtmlBalanceRows } from '../invoiceHtmlCore';


export function generateModernHtml(data: InvoiceData, title: string): string {
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
      ? `<br><b style="font-size:10px; color:#059669; font-weight:900; letter-spacing:0.5px;">[COMBO OFFER]</b> <span style="font-size:9.5px; color:#6b7280; font-weight:bold; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    const middleCols = isRateQty
      ? `<td style="padding:6px 4px;font-size:11px;text-align:right;color:#374151">₹${fmt.displayRate}</td><td style="padding:6px 4px;font-size:11px;text-align:center;color:#374151">${fmt.displayQty}</td>`
      : `<td style="padding:6px 4px;font-size:11px;text-align:center;color:#374151">${fmt.displayQty}</td><td style="padding:6px 4px;font-size:11px;text-align:right;color:#374151">₹${fmt.displayRate}</td>`;
    const offerLabelText = item.discountLabel || (item.originalRate != null && item.originalRate !== item.unit_price ? 'Offer' : '');
    const offerHtml = shouldShowItemMrpHtml(data, item) && offerLabelText ? `<br><span style="font-size:9px;color:#dc2626;font-weight:600">${offerLabelText}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : '';
    return `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 4px;font-size:11px;color:#374151">${idx + 1}</td>
      <td style="padding:6px 4px;font-size:11px;color:#374151">${displayName}${brandHtml}${pcsHtml}${comboHtml}${offerHtml}</td>
      ${middleCols}
      <td style="padding:6px 4px;font-size:11px;text-align:right;color:#374151;font-weight:600">₹${fmt.displayTotal}</td>
    </tr>
  `;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="page-size" content="A4"><meta name="page-orientation" content="portrait"><title>${title} - ${data.shopName}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1f2937; padding: 0; margin: 0; background: #f9fafb; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
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
  .terms { margin-top: 20px; padding: 10px 14px; background: #f9fafb; border-radius: 6px; font-size: 13px; color: #1a1a1a; line-height: 1.5; }
  .terms strong { color: #000; font-size: 13.5px; }
  @media print { body { background: #fff; } .page { box-shadow: none; min-height: auto; } .header-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="page">
    <div class="header-bar">
      ${bs.showShopName !== false && data.shopName ? `<h1>${data.shopName}</h1>` : ''}
      ${bs.showShopAddress !== false && data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
      ${bs.showPhone !== false && data.shopPhone ? `<p>${data.shopPhone}</p>` : ''}
      ${data.shopGstin && bs.showShopGstin !== false ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
      ${data.shopState && bs.showShopState !== false ? `<p>State: ${data.shopState}</p>` : ''}
      ${bs.showTitle !== false ? `<div class="invoice-badge">${title}</div>` : ''}
    </div>

    <div class="info-grid">
      <div class="block">
        <p><span class="lbl">Invoice #</span><br>${data.invoiceNumber}</p>
        <p><span class="lbl">Date</span><br>${data.date}</p>
        ${data.billerName && bs.showBillerName !== false ? `<p><span class="lbl">Biller</span><br>${data.billerName}</p>` : ''}
      </div>
      <div class="block" style="text-align:right">
        ${data.customerName && bs.showCustomerName !== false ? `<p><span class="lbl">Customer</span><br>${data.customerName}</p>` : ''}
        ${data.customerAddress && bs.showCustomerAddress !== false ? `<p><span class="lbl">Address</span><br>${data.customerAddress}</p>` : ''}
        ${data.customerPhone && bs.showCustomerPhone !== false ? `<p><span class="lbl">Phone</span><br>${data.customerPhone}</p>` : ''}
        ${data.customerGstin && bs.showCustomerGstin !== false ? `<p><span class="lbl">GSTIN</span><br>${data.customerGstin}</p>` : ''}
        ${data.customerState && bs.showCustomerState !== false ? `<p><span class="lbl">State</span><br>${data.customerState}</p>` : ''}
      </div>
    </div>
    ${(data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo || data.shippingAddress) ? `
    <div style="margin-top: -10px; margin-bottom: 15px; padding: 10px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 11px; color: #166534; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between;">
      ${(data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo) ? `
      <div>
        <strong>Transport &amp; E-Way Details:</strong>
        ${data.transporterName ? `<span style="margin-left: 8px;">Transporter: <strong>${data.transporterName}</strong></span>` : ''}
        ${data.vehicleNumber ? `<span style="margin-left: 8px;">Veh: <strong>${data.vehicleNumber}</strong></span>` : ''}
        ${data.transporterDocNo ? `<span style="margin-left: 8px;">Doc: <strong>${data.transporterDocNo}</strong></span>` : ''}
        ${data.ewayBillNo ? `<span style="margin-left: 8px;">E-Way Bill: <strong>${data.ewayBillNo}</strong></span>` : ''}
      </div>` : ''}
      ${data.shippingAddress ? `
      <div>
        <strong>Ship To:</strong>
        <span style="margin-left: 8px;">${data.shippingName ? `<strong>${data.shippingName}</strong> - ` : ''}${data.shippingAddress}</span>
      </div>` : ''}
    </div>` : ''}

    <table>
      <thead><tr>
        <th style="text-align:center;width:30px">#</th>
        <th style="text-align:left">Item</th>
        ${isRateQty
          ? `<th style="text-align:right;width:80px">Rate</th><th style="text-align:center;width:60px">Qty</th>`
          : `<th style="text-align:center;width:60px">Qty</th><th style="text-align:right;width:80px">Rate</th>`}
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
      ${data.pointsRedeemed && data.pointsRedeemed > 0 ? `<div class="row"><span>Points Redeemed (${data.pointsRedeemed} pts)</span><span style="color:#d97706">-₹${(data.pointsRedeemedDiscount || 0).toFixed(2)}</span></div>` : ''}
      ${((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > data.grandTotal ? `
      <div class="row" style="font-weight:bold;color:#ea580c"><span>Refund Amount</span><span>₹${(((data.scrapDeduction || 0) + (data.returnDeduction || 0)) - data.grandTotal).toFixed(2)}</span></div>
      ` : ((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > 0 ? `
      <div class="row" style="font-weight:bold;color:#16a34a"><span>Net Payable</span><span>₹${(data.grandTotal - ((data.scrapDeduction || 0) + (data.returnDeduction || 0))).toFixed(2)}</span></div>
      ` : ''}
      ${renderHtmlBalanceRows(data, 'div')}
    </div>

    ${(data.pointsEarned || data.remainingPointsBalance != null) ? `
    <div style="margin-top: 10px; padding: 6px 12px; background: #ecfdf5; border: 1px dashed #10b981; border-radius: 6px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; color: #065f46;">
      <div><strong>Loyalty Points:</strong> ${data.pointsEarned ? `Earned: +${data.pointsEarned} pts` : ''} ${data.pointsRedeemed ? ` | Redeemed: -${data.pointsRedeemed} pts` : ''}</div>
      ${data.remainingPointsBalance != null ? `<div><strong>Current Balance:</strong> ${data.remainingPointsBalance} pts</div>` : ''}
    </div>` : ''}

    ${data.upiId ? `
    <div class="upi-box" style="text-align: center; margin-top: 15px; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
      ${data.showUpiQr !== false ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&amp;data=${encodeURIComponent(`upi://pay?pa=${data.upiId}&pn=${data.shopName || 'Store'}&am=${data.grandTotal.toFixed(2)}&cu=INR`)}" alt="UPI QR Code" style="width: 140px; height: 140px; margin: 0 auto 6px auto; display: block;" />` : ''}
      <p style="margin: 0; font-size: 11px; color: #166534; font-weight: 600;">Scan & Pay via UPI: <strong>${data.upiId}</strong></p>
    </div>` : ''}

    ${bs?.showDescription !== false && (data.description || data.notes) ? `<div class="terms" style="margin-top: 10px;"><strong>Description / Notes</strong><br>${(data.description || data.notes)!.replace(/\n/g, '<br>')}</div>` : ''}
    ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms & Conditions</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}
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
    <div class="footer">Generated by Nafid — ${new Date().toLocaleString('en-IN', { timeZone: getStoreTimezone() })}</div>
  </div>
</body></html>`;
}
