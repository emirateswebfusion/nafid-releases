import { storeDateTime } from '../../../time/dateDisplay';
import { getStoreLocale } from '../../../localization/storeProfile';
import { getCurrencyPrefix, localizeCurrencyText } from '../../../localization/storeProfile';
import { getEffectiveBillSettings, formatPrintItem } from '../../receiptGenerator';
import { getStoreTimezone } from '../../../time/timezoneHelper';
import { type InvoiceData, shouldShowItemMrpHtml, formatItemNameForBill, renderHtmlBalanceRows } from '../invoiceHtmlCore';


export function generateStandardHtml(data: InvoiceData, title: string): string {
  const isGstBill = data.invoiceType === 'GST' || data.isB2B === true;
  const bs = getEffectiveBillSettings(data.billSettings, isGstBill);
  const isRateQty = bs?.itemColumnOrder === 'rate_qty';
  const itemsHtml = data.items.map((item, idx) => {
    const fmt = formatPrintItem(item, bs, isGstBill);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = bs?.showBrandName !== false && item.brand ? `<br><span class="brand-badge">${item.brand}</span>` : '';
    const uomLower = (item.unit || '').trim().toLowerCase();
    const isWeightProd = item.billing_type === 'WEIGHT' || ['kg', 'kgs', 'g', 'gram', 'grams', 'gm', 'gms', 'ltr', 'ltrs', 'ml', 'mtr', 'mtrs'].includes(uomLower);
    const pcsNum = (item.pieces_override != null && item.pieces_override > 0) ? item.pieces_override : ((item.pieces_sold != null && item.pieces_sold > 0) ? item.pieces_sold : undefined);
    const pcsHtml = (isWeightProd && pcsNum != null && !fmt.isWeightHidden) ? ` <span style="font-size:10px; color:#4b5563; font-weight:600;">(${pcsNum} Pcs)</span>` : '';
    const comboHtml = item.isCombo && item.combo_items && item.combo_items.length > 0
      ? `<br><b style="font-size:10.5px; color:#6b21a8; font-weight:900; letter-spacing:0.5px;">[COMBO OFFER]</b> <span style="font-size:10px; color:#4b5563; font-weight:bold; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    const middleCols = isRateQty
      ? `<td class="text-right">${getCurrencyPrefix()}${fmt.displayRate}</td><td class="text-center">${fmt.displayQty}</td>`
      : `<td class="text-center">${fmt.displayQty}</td><td class="text-right">${getCurrencyPrefix()}${fmt.displayRate}</td>`;
    const offerLabelText = item.discountLabel || (item.originalRate != null && item.originalRate !== item.unit_price ? 'Offer' : '');
    const offerHtml = shouldShowItemMrpHtml(data, item) && offerLabelText ? `<br><span class="discount-badge">${offerLabelText}${item.originalRate ? localizeCurrencyText(' (was ₹') + item.originalRate.toFixed(2) + ')' : ''}</span>` : '';
    return `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td>${displayName}${brandHtml}${pcsHtml}${comboHtml}${offerHtml}</td>
      ${middleCols}
      <td class="text-right">${getCurrencyPrefix()}${fmt.displayTotal}</td>
    </tr>
  `;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="page-size" content="A4"><meta name="page-orientation" content="portrait"><title>${title} - ${data.shopName}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .header h1 { font-size: 22px; margin: 0; color: #1a1a1a; }
  .header p { font-size: 12px; color: #666; margin: 3px 0; }
  .invoice-title { font-size: 20px; font-weight: bold; text-align: center; margin: 15px 0; letter-spacing: 2px; color: #2563eb; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .info-block { flex: 1; }
  .info-block p { margin: 3px 0; font-size: 11px; }
  .info-block .label { color: #888; font-size: 10px; text-transform: uppercase; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  tfoot { display: table-row-group; page-break-inside: avoid; break-inside: avoid; }
  th { background: #f0f4ff; padding: 8px 6px; border: 1px solid #d1d5db; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: bold; color: #374151; }
  td { padding: 7px 6px; border: 1px solid #d1d5db; font-size: 11px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .total-row td { font-weight: bold; border-top: 2px solid #333; }
  .grand-total td { font-size: 14px; font-weight: bold; color: #2563eb; }
  .discount-badge { font-size: 10px; color: #dc2626; font-weight: 600; }
  .brand-badge { font-size: 10px; color: #6b7280; font-weight: 600; }
  .terms { margin-top: 25px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 13px; color: #1a1a1a; line-height: 1.5; }
  .terms strong { color: #000; font-size: 13.5px; }
  .footer { text-align: center; font-size: 10px; color: #999; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } th { background: #f0f4ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="header">
    ${bs.showShopName !== false && data.shopName ? `<h1>${data.shopName}</h1>` : ''}
    ${bs.showShopAddress !== false && data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
    ${bs.showPhone !== false && data.shopPhone ? `<p>Phone: ${data.shopPhone}</p>` : ''}
    ${data.shopGstin && bs.showShopGstin !== false ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
    ${data.shopState && bs.showShopState !== false ? `<p>State: ${data.shopState}</p>` : ''}
  </div>
  ${bs.showTitle !== false ? `<div class="invoice-title">${title}</div>` : ''}
  <div class="info-row">
    <div class="info-block">
      <p><span class="label">Invoice #:</span> ${data.invoiceNumber}</p>
      <p><span class="label">Date:</span> ${data.date}</p>
      ${data.billerName && bs.showBillerName !== false ? `<p><span class="label">Biller:</span> ${data.billerName}</p>` : ''}
    </div>
    <div class="info-block" style="text-align:right">
      ${data.customerName && bs.showCustomerName !== false ? `<p><span class="label">Customer:</span> ${data.customerName}</p>` : ''}
      ${data.customerAddress && bs.showCustomerAddress !== false ? `<p><span class="label">Address:</span> ${data.customerAddress}</p>` : ''}
      ${data.customerPhone && bs.showCustomerPhone !== false ? `<p><span class="label">Phone:</span> ${data.customerPhone}</p>` : ''}
      ${data.customerGstin && bs.showCustomerGstin !== false ? `<p><span class="label">GSTIN:</span> ${data.customerGstin}</p>` : ''}
      ${data.customerState && bs.showCustomerState !== false ? `<p><span class="label">State:</span> ${data.customerState}</p>` : ''}
    </div>
  </div>
  ${(data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo || data.shippingAddress) ? `
  <div style="margin: -10px 0 15px 0; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 11px; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between;">
    ${(data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo) ? `
    <div>
      <strong style="color: #1e293b;">Transport &amp; E-Way Details:</strong>
      ${data.transporterName ? `<span style="margin-left: 8px;">Transporter: <strong>${data.transporterName}</strong></span>` : ''}
      ${data.vehicleNumber ? `<span style="margin-left: 8px;">Veh: <strong>${data.vehicleNumber}</strong></span>` : ''}
      ${data.transporterDocNo ? `<span style="margin-left: 8px;">Doc: <strong>${data.transporterDocNo}</strong></span>` : ''}
      ${data.ewayBillNo ? `<span style="margin-left: 8px;">E-Way Bill: <strong>${data.ewayBillNo}</strong></span>` : ''}
    </div>` : ''}
    ${data.shippingAddress ? `
    <div>
      <strong style="color: #1e293b;">Ship To:</strong>
      <span style="margin-left: 8px;">${data.shippingName ? `<strong>${data.shippingName}</strong> - ` : ''}${data.shippingAddress}</span>
    </div>` : ''}
  </div>` : ''}
  <table>
    <thead><tr>
      <th class="text-center" style="width:36px">#</th>
      <th>Item</th>
      ${isRateQty
        ? `<th class="text-right" style="width:80px">Rate</th><th class="text-center" style="width:70px">Qty</th>`
        : `<th class="text-center" style="width:70px">Qty</th><th class="text-right" style="width:80px">Rate</th>`}
      <th class="text-right" style="width:90px">Amount</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
    <tfoot>
      <tr class="total-row"><td colspan="4" class="text-right">Subtotal</td><td class="text-right">${getCurrencyPrefix()}${data.subtotal.toFixed(2)}</td></tr>
      ${data.cgst != null && data.cgst > 0 ? `<tr><td colspan="4" class="text-right">CGST</td><td class="text-right">${getCurrencyPrefix()}${data.cgst.toFixed(2)}</td></tr>` : ''}
      ${data.sgst != null && data.sgst > 0 ? `<tr><td colspan="4" class="text-right">SGST</td><td class="text-right">${getCurrencyPrefix()}${data.sgst.toFixed(2)}</td></tr>` : ''}
      ${data.igst != null && data.igst > 0 ? `<tr><td colspan="4" class="text-right">IGST</td><td class="text-right">${getCurrencyPrefix()}${data.igst.toFixed(2)}</td></tr>` : ''}
      ${data.discount > 0 ? `<tr><td colspan="4" class="text-right">Discount${data.discountType === 'PERCENTAGE' && data.discountValue ? ` (${data.discountValue}%)` : ''}</td><td class="text-right" style="color:#dc2626">-${getCurrencyPrefix()}${data.discount.toFixed(2)}</td></tr>` : ''}
      <tr class="grand-total"><td colspan="4" class="text-right">Grand Total</td><td class="text-right">${getCurrencyPrefix()}${data.grandTotal.toFixed(2)}</td></tr>
      ${data.scrapDeduction && data.scrapDeduction > 0 ? `<tr><td colspan="4" class="text-right">Scrap Return Amount (${data.scrapInvoiceNumber || ''})</td><td class="text-right" style="color:#dc2626">-${getCurrencyPrefix()}${data.scrapDeduction.toFixed(2)}</td></tr>` : ''}
      ${data.returnDeduction && data.returnDeduction > 0 ? `<tr><td colspan="4" class="text-right">Return Credit (${data.returnInvoiceNumber || ''})</td><td class="text-right" style="color:#dc2626">-${getCurrencyPrefix()}${data.returnDeduction.toFixed(2)}</td></tr>` : ''}
      ${data.pointsRedeemed && data.pointsRedeemed > 0 ? `<tr><td colspan="4" class="text-right">Points Redeemed (${data.pointsRedeemed} pts)</td><td class="text-right" style="color:#d97706">-${getCurrencyPrefix()}${(data.pointsRedeemedDiscount || 0).toFixed(2)}</td></tr>` : ''}
      ${((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > data.grandTotal ? `
      <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#ea580c">Refund Amount</td><td class="text-right" style="font-weight:bold;color:#ea580c">${getCurrencyPrefix()}${(((data.scrapDeduction || 0) + (data.returnDeduction || 0)) - data.grandTotal).toFixed(2)}</td></tr>
      ` : ((data.scrapDeduction || 0) + (data.returnDeduction || 0)) > 0 ? `
      <tr><td colspan="4" class="text-right" style="font-weight:bold;color:#16a34a">Net Payable</td><td class="text-right" style="font-weight:bold;color:#16a34a">${getCurrencyPrefix()}${(data.grandTotal - ((data.scrapDeduction || 0) + (data.returnDeduction || 0))).toFixed(2)}</td></tr>
      ` : ''}
      ${renderHtmlBalanceRows(data, 'table')}
    </tfoot>
  </table>
  ${(data.pointsEarned || data.remainingPointsBalance != null) ? `
  <div style="margin-top: 8px; padding: 6px 12px; background: #ecfdf5; border: 1px dashed #10b981; border-radius: 6px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; color: #065f46;">
    <div><strong>Loyalty Points:</strong> ${data.pointsEarned ? `Earned: +${data.pointsEarned} pts` : ''} ${data.pointsRedeemed ? ` | Redeemed: -${data.pointsRedeemed} pts` : ''}</div>
    ${data.remainingPointsBalance != null ? `<div><strong>Current Balance:</strong> ${data.remainingPointsBalance} pts</div>` : ''}
  </div>` : ''}
  ${bs?.showDescription !== false && (data.description || data.notes) ? `<div style="margin-top: 10px; font-size: 11px; color: #1e293b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px;"><strong style="font-weight: 700; color: #0f172a;">Description / Notes:</strong> ${(data.description || data.notes)!.replace(/\n/g, '<br>')}</div>` : ''}
  ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms &amp; Conditions:</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}
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
  <div class="footer">Generated by Nafid — ${storeDateTime(new Date(), getStoreLocale(), { timeZone: getStoreTimezone() })}</div>
</body></html>`;
}
