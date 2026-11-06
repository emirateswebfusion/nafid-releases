import { renderTaxBreakup } from '../taxBreakup';
import { getEffectiveBillSettings, formatPrintItem, numberToIndianWords } from '../../receiptGenerator';
import { type InvoiceData, getDocumentTitle, formatItemNameForBill, renderHtmlBalanceRows } from '../invoiceHtmlCore';


export function generateHalfA4Html(data: InvoiceData, titleStr?: string): string {
  const isB2B = data.isB2B === true;
  const isGstBill = data.invoiceType === 'GST' || isB2B;
  const bs = getEffectiveBillSettings(data.billSettings, isGstBill);
  const title = titleStr || getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, isB2B, bs?.nonGstBillTitle);
  const grandTotal = Number(data.grandTotal) || 0;
  const netPayable = grandTotal - ((Number(data.scrapDeduction) || 0) + (Number(data.returnDeduction) || 0));
  const isVertical = data.a5Orientation === 'vertical';
  const isRateQty = bs?.itemColumnOrder === 'rate_qty';
  const itemsList = Array.isArray(data.items) ? data.items : [];

  const itemsHtml = itemsList.map((item, idx) => {
    const fmt = formatPrintItem(item, bs, isGstBill);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = bs?.showBrandName !== false && item.brand ? ` <span style="font-size:10px; color:#444;">(${item.brand})</span>` : '';
    const uomLower = (item.unit || '').trim().toLowerCase();
    const isWeightProd = item.billing_type === 'WEIGHT' || ['kg', 'kgs', 'g', 'gram', 'grams', 'gm', 'gms', 'ltr', 'ltrs', 'ml', 'mtr', 'mtrs'].includes(uomLower);
    const pcsNum = (item.pieces_override != null && item.pieces_override > 0) ? item.pieces_override : ((item.pieces_sold != null && item.pieces_sold > 0) ? item.pieces_sold : undefined);
    const pcsHtml = (isWeightProd && pcsNum != null && !fmt.isWeightHidden) ? ` <span style="font-size:10px; color:#555; font-weight: 600;">(${pcsNum} Pcs)</span>` : '';
    const middleCols = isRateQty
      ? `<td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; width: 75px;">${fmt.displayRate}</td><td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; width: 55px;">${fmt.displayQty}</td>`
      : `<td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; width: 55px;">${fmt.displayQty}</td><td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; width: 75px;">${fmt.displayRate}</td>`;
    return `
    <tr>
      <td style="text-align: left; padding: 2.5px 4px; font-size: 11.5px; width: 35px;">${idx + 1}</td>
      <td style="text-align: left; padding: 2.5px 4px; font-size: 11.5px; font-weight: 500;">${displayName}${brandHtml}${pcsHtml}</td>
      ${middleCols}
      <td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; font-weight: 600; width: 85px;">${fmt.displayTotal}</td>
    </tr>
    `;
  }).join('');

  const amountWords = numberToIndianWords(Math.max(0, netPayable));

  const pageCss = isVertical ? `
    @page {
      size: A5 portrait;
      margin: 3mm 4mm;
    }
    @media print {
      html, body {
        width: 148mm !important;
        max-width: 148mm !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bill-container {
        min-height: 196mm !important;
        page-break-after: avoid;
        break-after: avoid;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      color: #000;
      margin: 0;
      padding: 3mm 4mm;
      box-sizing: border-box;
      background: #fff;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      width: 148mm;
      max-width: 148mm;
    }
    .bill-container {
      width: 100%;
      max-width: 138mm;
      min-height: 196mm;
      box-sizing: border-box;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
  ` : `
    @page {
      size: A4 portrait;
      margin: 3mm 4mm;
    }
    @media print {
      html, body {
        width: 210mm !important;
        max-width: 210mm !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bill-container {
        min-height: 136mm !important;
        max-height: 142mm !important;
        page-break-after: avoid;
        break-after: avoid;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      color: #000;
      margin: 0;
      padding: 3mm 4mm;
      box-sizing: border-box;
      background: #fff;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      width: 210mm;
      max-width: 210mm;
    }
    .bill-container {
      width: 100%;
      max-width: 198mm;
      min-height: 136mm;
      max-height: 142mm;
      box-sizing: border-box;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="page-size" content="${isVertical ? 'A5' : 'half-a4'}">
  <meta name="page-orientation" content="portrait">
  <title>${title} - ${data.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; }
    ${pageCss}
    .shop-header {
      text-align: center;
      margin-bottom: 4px;
    }
    .shop-name {
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .shop-subtext {
      font-size: 10px;
      color: #333;
      margin-top: 1px;
    }
    .top-meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 2px;
    }
    .top-meta-table td {
      vertical-align: top;
      font-size: 11px;
      line-height: 1.35;
    }
    .divider-solid {
      border-top: 1px solid #000;
      margin: 3px 0;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
    }
    .items-table th {
      font-size: 11.5px;
      font-weight: bold;
      padding: 3px 4px;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      background: transparent;
    }
    .items-table td {
      border: none;
    }
    .summary-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 2px;
      padding-top: 2px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .ledger-table {
      border-collapse: collapse;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      line-height: 1.35;
      margin-top: 4px;
    }
    .ledger-table td {
      padding: 1px 2px;
    }
    .double-underline {
      border-bottom: 3px double #000;
      border-top: 1px dashed #000;
      font-weight: bold;
    }
    .footer-section {
      margin-top: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="bill-container">
    <div class="main-content" style="flex: 1 1 auto;">
      <!-- Shop Info at Top -->
      ${((isGstBill || bs?.showShopName !== false) && data.shopName || (isGstBill || bs?.showShopAddress !== false) && data.shopAddress || (isGstBill || bs?.showPhone !== false) && data.shopPhone || (isGstBill || bs?.showShopGstin !== false) && data.shopGstin || (isGstBill || bs?.showShopState !== false) && data.shopState) ? `
      <div class="shop-header">
        ${(isGstBill || bs?.showShopName !== false) && data.shopName ? `<div class="shop-name">${data.shopName}</div>` : ''}
        ${(isGstBill || bs?.showShopAddress !== false) && data.shopAddress ? `<div class="shop-subtext">${data.shopAddress}</div>` : ''}
        <div class="shop-subtext">
          ${(isGstBill || bs?.showPhone !== false) && data.shopPhone ? `<span>Ph: ${data.shopPhone}</span>` : ''}
          ${(isGstBill || bs?.showShopGstin !== false) && data.shopGstin ? `<span style="margin-left: 8px;">GSTIN: ${data.shopGstin}</span>` : ''}
          ${(isGstBill || bs?.showShopState !== false) && data.shopState ? `<span style="margin-left: 8px;">State: ${data.shopState}</span>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- Metadata Section -->
      <table class="top-meta-table">
        <tr>
          <td style="width: 32%;">
            <strong>No. :</strong> <span style="font-size: 12px; font-weight: bold;">${data.invoiceNumber}</span><br>
            <strong>Date :</strong> ${data.date}
            ${data.billerName && (isGstBill || bs?.showBillerName !== false) ? `<br><span style="font-size: 9.5px; color: #444;">Biller: ${data.billerName}</span>` : ''}
          </td>
          <td style="width: 36%; text-align: center;">
            ${(isGstBill || bs?.showTitle !== false) ? `<span style="font-size: 13.5px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">${title}</span>` : ''}
          </td>
          <td style="width: 32%; text-align: right;">
            ${(isGstBill || bs?.showCustomerName !== false) ? `<strong>To :</strong> <span style="font-weight: bold;">${data.customerName || 'Cash'}</span><br>` : ''}
            ${data.customerAddress && (isGstBill || bs?.showCustomerAddress !== false) ? `${data.customerAddress}<br>` : ''}
            ${data.customerPhone && (isGstBill || bs?.showCustomerPhone !== false) ? `Ph: ${data.customerPhone}<br>` : ''}
            ${(isGstBill || bs?.showCustomerGstin !== false) && data.customerGstin ? `GSTIN: ${data.customerGstin}<br>` : ''}
            ${data.customerState && (isGstBill || bs?.showCustomerState !== false) ? `State: ${data.customerState}` : ''}
          </td>
        </tr>
      </table>

      ${(data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo || data.shippingAddress) ? `
      <div style="margin: 2px 0 4px 0; padding: 3px 6px; background: #fafafa; border: 1px solid #eee; border-radius: 4px; font-size: 10px; color: #333; display: flex; flex-wrap: wrap; justify-content: space-between;">
        ${(isGstBill || bs?.showTransporterDetails !== false) && (data.transporterName || data.vehicleNumber || data.ewayBillNo || data.transporterDocNo) ? `<span><strong>Transport:</strong> ${[data.transporterName, data.vehicleNumber ? `Veh: ${data.vehicleNumber}` : '', data.transporterDocNo ? `Doc: ${data.transporterDocNo}` : '', data.ewayBillNo ? `E-Way: ${data.ewayBillNo}` : ''].filter(Boolean).join(' | ')}</span>` : ''}
        ${data.shippingAddress ? `<span><strong>Ship To:</strong> ${data.shippingName ? `<strong>${data.shippingName}</strong> - ` : ''}${data.shippingAddress}</span>` : ''}
      </div>` : ''}

      <div class="divider-solid"></div>

      <!-- Items Table across Full Width -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: left; width: 35px;">S No</th>
            <th style="text-align: left;">Description</th>
            ${isRateQty
              ? `<th style="text-align: right; width: 75px;">Rate</th><th style="text-align: right; width: 55px;">Qty</th>`
              : `<th style="text-align: right; width: 55px;">Qty</th><th style="text-align: right; width: 75px;">Rate</th>`}
            <th style="text-align: right; width: 85px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Bottom Page Footer (Anchored at bottom of Half A4 paper) -->
    ${renderTaxBreakup(data)}
  <div class="footer-section">
      <div class="divider-solid"></div>
      <div class="summary-grid">
        <!-- Left: Rupees in Words & Customer Ledger -->
        <div style="width: ${isVertical ? '50%' : '55%'};">
          <div style="font-size: 11px; font-weight: 600;">Rupees ${amountWords} Only</div>

          ${renderHtmlBalanceRows(data, 'table') ? `
          <table class="ledger-table">
            ${renderHtmlBalanceRows(data, 'table')}
          </table>
          ` : ''}

          ${bs?.showDescription !== false && (data.description || data.notes) ? `<div style="margin-top: 6px; font-size: 11.5px; color: #1a1a1a; line-height: 1.4;"><strong style="font-weight: bold; color: #000; font-size: 12px;">Description / Notes:</strong> ${(data.description || data.notes)!.replace(/\n/g, '<br>')}</div>` : ''}
          ${data.billSettings?.instructions ? `<div style="margin-top: 6px; font-size: 11.5px; color: #1a1a1a; line-height: 1.4;"><strong style="font-weight: bold; color: #000; font-size: 12px;">Terms:</strong> ${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}
        </div>

        <!-- Right: Totals & Signatory -->
        <div style="width: ${isVertical ? '48%' : '42%'}; text-align: right;">
          <table style="width: 100%; font-size: 11.5px;">
            ${((data.tax > 0 || (data.cgst != null && data.cgst > 0) || (data.sgst != null && data.sgst > 0) || (data.igst != null && data.igst > 0) || data.discount > 0) && data.subtotal) ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">Subtotal :</td>
              <td style="text-align: right; width: 85px;">${data.subtotal.toFixed(2)}</td>
            </tr>` : ''}
            ${data.discount > 0 ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">Discount :</td>
              <td style="text-align: right; width: 85px;">${data.discount.toFixed(2)}</td>
            </tr>` : ''}
            ${data.cgst != null && data.cgst > 0 ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">CGST :</td>
              <td style="text-align: right; width: 85px;">${data.cgst.toFixed(2)}</td>
            </tr>` : ''}
            ${data.sgst != null && data.sgst > 0 ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">SGST :</td>
              <td style="text-align: right; width: 85px;">${data.sgst.toFixed(2)}</td>
            </tr>` : ''}
            ${data.igst != null && data.igst > 0 ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">IGST :</td>
              <td style="text-align: right; width: 85px;">${data.igst.toFixed(2)}</td>
            </tr>` : ''}
            ${data.scrapDeduction && data.scrapDeduction > 0 ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">Scrap Return :</td>
              <td style="text-align: right; width: 85px; color: #dc2626;">- ${data.scrapDeduction.toFixed(2)}</td>
            </tr>` : ''}
            ${data.returnDeduction && data.returnDeduction > 0 ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">Return Credit :</td>
              <td style="text-align: right; width: 85px; color: #dc2626;">- ${data.returnDeduction.toFixed(2)}</td>
            </tr>` : ''}
            ${data.pointsRedeemed && data.pointsRedeemed > 0 ? `
            <tr>
              <td style="text-align: right; padding-right: 6px;">Points Redeemed (${data.pointsRedeemed} pts) :</td>
              <td style="text-align: right; width: 85px; color: #d97706;">- ${(data.pointsRedeemedDiscount || 0).toFixed(2)}</td>
            </tr>` : ''}
            <tr style="font-weight: bold; font-size: 13px;">
              <td style="text-align: right; padding-right: 6px; padding-top: 2px;">Total :</td>
              <td style="text-align: right; width: 85px; padding-top: 2px;">${netPayable.toFixed(2)}</td>
            </tr>
          </table>

          ${(data.pointsEarned || data.remainingPointsBalance != null) ? `
          <div style="margin-top: 8px; padding: 4px 8px; background: #ecfdf5; border: 1px dashed #10b981; border-radius: 4px; font-size: 10px; color: #065f46;">
            <strong>Loyalty Points:</strong> ${data.pointsEarned ? `Earned: +${data.pointsEarned} pts` : ''} ${data.pointsRedeemed ? `| Redeemed: -${data.pointsRedeemed} pts` : ''} ${data.remainingPointsBalance != null ? `| Balance: ${data.remainingPointsBalance} pts` : ''}
          </div>
          ` : ''}

          <!-- Signatory Section -->
          ${(bs?.showForShopName !== false && data.shopName) || bs?.showAuthorisedSignatory !== false ? `
          <div style="margin-top: 14px; font-size: 10px;">
            ${bs?.showForShopName !== false && data.shopName ? `<div>For <strong>${data.shopName.toUpperCase()}</strong></div>` : ''}
            ${bs?.showAuthorisedSignatory !== false ? `
            <div style="height: ${bs?.showForShopName !== false && data.shopName ? '22px' : '30px'};"></div>
            <div>Authorised Signatory</div>
            ` : ''}
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
