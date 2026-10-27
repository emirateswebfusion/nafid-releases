import { getEffectiveBillSettings, formatPrintItem, numberToIndianWords } from '../../receiptGenerator';
import { splitTaxAmount } from '../../../pricing/checkoutLines';
import { type InvoiceData, shouldShowItemMrpHtml, formatItemNameForBill } from '../invoiceHtmlCore';


export function generateBoxedHtml(data: InvoiceData, title: string): string {
  const isGstBill = data.invoiceType === 'GST' || data.isB2B === true;
  const bs = getEffectiveBillSettings(data.billSettings, isGstBill);
  const isRateQty = bs?.itemColumnOrder === 'rate_qty';
  const grandTotal = Number(data.grandTotal) || 0;
  const scrapDed = Number(data.scrapDeduction) || 0;
  const returnDed = Number(data.returnDeduction) || 0;
  const netPayable = grandTotal - (scrapDed + returnDed);
  const roundOff = Math.round(netPayable) - netPayable;
  const finalTotal = Math.round(netPayable);
  const amountWords = numberToIndianWords(Math.max(0, finalTotal));
  const itemsList = Array.isArray(data.items) ? data.items : [];

  let totalQtySum = 0;
  let totalTaxableSum = 0;
  let totalCgstSum = 0;
  let totalSgstSum = 0;
  let totalAmountSum = 0;

  const itemsHtml = itemsList.map((item, idx) => {
    const fmt = formatPrintItem(item, bs, isGstBill);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = bs?.showBrandName !== false && item.brand ? ` <span style="font-size:9.5px; color:#333; font-weight: 600;">(${item.brand})</span>` : '';
    const uomLower = (item.unit || '').trim().toLowerCase();
    const isWeightProd = item.billing_type === 'WEIGHT' || ['kg', 'kgs', 'g', 'gram', 'grams', 'gm', 'gms', 'ltr', 'ltrs', 'ml', 'mtr', 'mtrs'].includes(uomLower);
    const pcsNum = (item.pieces_override != null && item.pieces_override > 0) ? item.pieces_override : ((item.pieces_sold != null && item.pieces_sold > 0) ? item.pieces_sold : undefined);
    const pcsHtml = (isWeightProd && pcsNum != null && !fmt.isWeightHidden) ? ` <span style="font-size:9.5px; color:#4b5563; font-weight: 600;">(${pcsNum} Pcs)</span>` : '';
    const comboHtml = item.isCombo && item.combo_items && item.combo_items.length > 0
      ? `<br><b style="font-size:9.5px; color:#6b21a8; font-weight:800; letter-spacing:0.3px;">[COMBO OFFER]</b> <span style="font-size:9px; color:#4b5563; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    const offerLabelText = item.discountLabel || (item.originalRate != null && item.originalRate !== item.unit_price ? 'Offer' : '');
    const offerHtml = shouldShowItemMrpHtml(data, item) && offerLabelText ? `<br><span style="font-size:9px; color:#dc2626; font-weight:600;">${offerLabelText}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : '';

    const hsnCode = item.hsn || item.hsn_code || '-';
    const qtyNum = Number(item.quantity) || 1;
    const itemTotal = Number(item.total) || 0;
    const gstRate = item.tax_rate_percent != null ? Number(item.tax_rate_percent) : (item.gst_percent != null ? Number(item.gst_percent) : (data.tax > 0 ? 18 : 0));

    let taxableVal: number;
    let cgstPct = 0;
    let sgstPct = 0;
    let cgstAmt = 0;
    let sgstAmt = 0;
    let unitPriceVal: number;

    if (gstRate > 0) {
      taxableVal = itemTotal / (1 + gstRate / 100);
      unitPriceVal = qtyNum > 0 ? taxableVal / qtyNum : taxableVal;
      const totalTax = itemTotal - taxableVal;
      cgstPct = gstRate / 2;
      sgstPct = gstRate / 2;
      const taxSplit = splitTaxAmount(totalTax);
      cgstAmt = taxSplit.cgst;
      sgstAmt = taxSplit.sgst;
    } else {
      taxableVal = itemTotal;
      unitPriceVal = qtyNum > 0 ? taxableVal / qtyNum : taxableVal;
    }

    totalQtySum += qtyNum;
    totalTaxableSum += taxableVal;
    totalCgstSum += cgstAmt;
    totalSgstSum += sgstAmt;
    totalAmountSum += itemTotal;

    const qtyRateCols = isRateQty
      ? `<td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${unitPriceVal.toFixed(2)}</td><td style="text-align: center; border-right: 1px solid #000; padding: 3px 3px; font-weight: 600;">${fmt.displayQty}</td>`
      : `<td style="text-align: center; border-right: 1px solid #000; padding: 3px 3px; font-weight: 600;">${fmt.displayQty}</td><td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${unitPriceVal.toFixed(2)}</td>`;

    return `
    <tr style="height: 22px;">
      <td style="text-align: center; border-right: 1px solid #000; padding: 3px 3px;">${idx + 1}</td>
      <td style="text-align: left; border-right: 1px solid #000; padding: 3px 5px; font-weight: 500;">${displayName}${brandHtml}${pcsHtml}${comboHtml}${offerHtml}</td>
      <td style="text-align: center; border-right: 1px solid #000; padding: 3px 3px;">${hsnCode}</td>
      ${qtyRateCols}
      <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${taxableVal.toFixed(2)}</td>
      <td style="text-align: center; border-right: 1px solid #000; padding: 3px 2px;">${cgstPct > 0 ? cgstPct : ''}</td>
      <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${cgstAmt > 0 ? cgstAmt.toFixed(2) : ''}</td>
      <td style="text-align: center; border-right: 1px solid #000; padding: 3px 2px;">${sgstPct > 0 ? sgstPct : ''}</td>
      <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${sgstAmt > 0 ? sgstAmt.toFixed(2) : ''}</td>
      <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px; font-weight: 700;">${itemTotal.toFixed(2)}</td>
    </tr>
    `;
  }).join('');

  const minRows = 8;
  let emptyRowsHtml = '';
  if (itemsList.length < minRows) {
    const padCount = minRows - itemsList.length;
    for (let i = 0; i < padCount; i++) {
      emptyRowsHtml += `
      <tr style="height: 22px;">
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
        <td style="border-right: 1px solid #000;">&nbsp;</td>
      </tr>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - ${data.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
    }
    @page {
      size: A4 portrait;
      margin: 6mm 8mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10.5px;
      color: #000;
      background: #fff;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    .invoice-box {
      width: 100%;
      height: 282mm;
      border: 1.5px solid #000;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 1px solid #000;
    }
    .header-table td {
      vertical-align: top;
      padding: 5px 8px;
      font-size: 10.5px;
      line-height: 1.35;
    }
    .shop-title {
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .grid-2col {
      display: flex;
      border-bottom: 1px solid #000;
    }
    .grid-col {
      width: 50%;
      padding: 4px 8px;
      font-size: 10.5px;
      line-height: 1.4;
    }
    .grid-col.left {
      border-right: 1px solid #000;
    }
    .table-container {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .items-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .items-table tbody {
      height: 100%;
    }
    .items-table tr.fill-row {
      height: 100%;
    }
    .items-table th {
      font-size: 9.5px;
      font-weight: bold;
      background: #fff;
      vertical-align: middle;
      border-right: 1px solid #000;
      border-bottom: 1px solid #000;
    }
    .items-table th:last-child {
      border-right: 1px solid #000;
    }
    .items-table td {
      font-size: 10px;
      vertical-align: middle;
    }
    .items-table td:last-child {
      border-right: 1px solid #000;
    }
    .footer-container {
      margin-top: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-box {
        height: 282mm;
      }
      .footer-container {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-box">
    <!-- Top Header -->
    <table class="header-table">
      <tr>
        <td style="width: 32%;">
          E-Mail : ${data.shopEmail || ''}<br>
          Web : ${data.shopWebsite || ''}
        </td>
        <td style="width: 36%; text-align: center;">
          ${(bs?.showShopName !== false && data.shopName) ? `<div class="shop-title">${data.shopName}</div>` : ''}
          ${(bs?.showShopAddress !== false && data.shopAddress) ? `<div>${data.shopAddress}</div>` : ''}
        </td>
        <td style="width: 32%; text-align: right;">
          ${data.shopPhone ? `Phone : ${data.shopPhone}` : ''}
        </td>
      </tr>
    </table>

    <!-- Subtitle Bar -->
    <div style="text-align: center; font-size: 12px; font-weight: 800; padding: 3px 0; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #000;">
      ${title}
    </div>

    <!-- GST & Supply Details Grid -->
    <div class="grid-2col">
      <div class="grid-col left">
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; line-height: 1.45;">
          <tr>
            <td style="width: 215px; font-weight: bold;">GST Number</td>
            <td style="width: 15px; text-align: center; font-weight: bold;">:</td>
            <td>${data.shopGstin || '-'}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Invoice Number</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td style="font-weight: bold;">${data.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Invoice Date</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>${data.date}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Tax Is Payable On Reverse Charge</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>${bs?.reverseCharge ? 'Yes' : 'No'}</td>
          </tr>
        </table>
      </div>
      <div class="grid-col">
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; line-height: 1.45;">
          <tr>
            <td style="width: 160px; font-weight: bold;">Transportation Mode</td>
            <td style="width: 15px; text-align: center; font-weight: bold;">:</td>
            <td>${data.transporterName || ''}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Vehicle Number</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>${data.vehicleNumber || ''}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Date &amp; Time of Supply</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>${data.date}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Place Of Supply</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>${data.customerState || data.shopState || ''}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Receiver & Consignee Details Grid -->
    <div class="grid-2col">
      <div class="grid-col left">
        <div style="font-weight: 800; text-decoration: underline; margin-bottom: 3px;">Details of Receiver (Billed to)</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; line-height: 1.45;">
          <tr>
            <td style="width: 80px; font-weight: bold; vertical-align: top;">Name</td>
            <td style="width: 15px; text-align: center; font-weight: bold; vertical-align: top;">:</td>
            <td style="font-weight: bold; vertical-align: top;">${data.customerName || ''}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; vertical-align: top;">Address</td>
            <td style="text-align: center; font-weight: bold; vertical-align: top;">:</td>
            <td style="vertical-align: top;">${data.customerAddress || ''}</td>
          </tr>
          <tr>
            <td style="font-weight: bold;">State</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>
              <span style="display: inline-block; min-width: 60px;">${data.customerState || ''}</span>
              <strong style="margin-left: 15px;">State Code :</strong> ${data.customerStateCode || ''}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold;">Mobile No.</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>
              <span style="display: inline-block; min-width: 60px;">${data.customerPhone || ''}</span>
              <strong style="margin-left: 15px;">Phone :</strong> ${data.customerLandline || ''}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold;">GST No</td>
            <td style="text-align: center; font-weight: bold;">:</td>
            <td>${data.customerGstin || ''}</td>
          </tr>
        </table>
      </div>
      <div class="grid-col">
        <div style="font-weight: 800; text-decoration: underline; margin-bottom: 3px;">Details of Consignee (Shipped to)</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; line-height: 1.45;">
          <tr>
            <td style="width: 80px; font-weight: bold; vertical-align: top;">Name</td>
            <td style="width: 15px; text-align: center; font-weight: bold; vertical-align: top;">:</td>
            <td style="font-weight: bold; vertical-align: top;">${data.shippingName || data.customerName || ''}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; vertical-align: top;">Address</td>
            <td style="text-align: center; font-weight: bold; vertical-align: top;">:</td>
            <td style="vertical-align: top;">${data.shippingAddress || data.customerAddress || ''}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Items Table -->
    <div class="table-container">
    <table class="items-table">
      <colgroup>
        <col style="width: 32px;" />
        <col />
        <col style="width: 65px;" />
        ${isRateQty
          ? '<col style="width: 65px;" /><col style="width: 36px;" />'
          : '<col style="width: 36px;" /><col style="width: 65px;" />'}
        <col style="width: 72px;" />
        <col style="width: 28px;" />
        <col style="width: 60px;" />
        <col style="width: 28px;" />
        <col style="width: 60px;" />
        <col style="width: 75px;" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2" style="text-align: center; padding: 4px 2px;">Sl<br>No</th>
          <th rowspan="2" style="text-align: left; padding: 4px 5px;">Description of Goods</th>
          <th rowspan="2" style="text-align: center; padding: 4px 2px;">Hsn Code<br>(GST)</th>
          ${isRateQty
            ? `<th rowspan="2" style="text-align: right; padding: 4px 4px;">Unit<br>Price</th><th rowspan="2" style="text-align: center; padding: 4px 2px;">Qty</th>`
            : `<th rowspan="2" style="text-align: center; padding: 4px 2px;">Qty</th><th rowspan="2" style="text-align: right; padding: 4px 4px;">Unit<br>Price</th>`}
          <th rowspan="2" style="text-align: right; padding: 4px 4px;">Taxable<br>Value</th>
          <th colspan="2" style="text-align: center; padding: 2px 2px;">CGST</th>
          <th colspan="2" style="text-align: center; padding: 2px 2px;">SGST</th>
          <th rowspan="2" style="text-align: right; padding: 4px 5px;">Total</th>
        </tr>
        <tr>
          <th style="text-align: center; padding: 2px 2px;">%</th>
          <th style="text-align: right; padding: 2px 4px;">Amount</th>
          <th style="text-align: center; padding: 2px 2px;">%</th>
          <th style="text-align: right; padding: 2px 4px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
        ${emptyRowsHtml}
        <tr class="fill-row">
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
        </tr>
        <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000; font-weight: bold; font-size: 10px; height: 22px;">
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          ${isRateQty
            ? `<td style="border-right: 1px solid #000;">&nbsp;</td><td style="text-align: center; border-right: 1px solid #000; padding: 3px 3px;">${totalQtySum}</td>`
            : `<td style="text-align: center; border-right: 1px solid #000; padding: 3px 3px;">${totalQtySum}</td><td style="border-right: 1px solid #000;">&nbsp;</td>`}
          <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${totalTaxableSum.toFixed(2)}</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${totalCgstSum > 0 ? totalCgstSum.toFixed(2) : ''}</td>
          <td style="border-right: 1px solid #000;">&nbsp;</td>
          <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${totalSgstSum > 0 ? totalSgstSum.toFixed(2) : ''}</td>
          <td style="text-align: right; border-right: 1px solid #000; padding: 3px 5px;">${totalAmountSum.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    </div>

    <!-- Bottom Page Footer -->
    <div class="footer-container">
      <!-- E&OE & Totals Section -->
      <div style="display: flex; border-bottom: 1px solid #000;">
        <div style="width: 65%; border-right: 1px solid #000; padding: 4px 8px; font-size: 10.5px; line-height: 1.35;">
          <div style="font-weight: bold;">E&amp;OE</div>
          <div style="margin-top: 2px;">
            <strong>Invoice Value (In Words)</strong><br>
            ( Rupees ${amountWords} Only )
          </div>
          ${(() => {
            const certText = data.certificationText !== undefined ? data.certificationText : (bs?.certificationText !== undefined ? bs.certificationText : 'Certified that the Particulars given above are true and correct');
            return certText ? `<div style="margin-top: 3px; font-size: 10px;">${certText}</div>` : '';
          })()}
          ${(() => {
            const elecNum = data.electronicRefNumber || bs?.electronicRefNumber || data.irn || '';
            return elecNum ? `<div style="font-size: 10px;">Electronic Reference Number : ${elecNum}</div>` : '';
          })()}
          ${bs?.showDescription !== false && (data.description || data.notes) ? `
          <div style="margin-top: 4px; font-size: 10px; color: #1a1a1a; line-height: 1.35;">
            <strong>Description / Remarks:</strong> ${(data.description || data.notes)!.replace(/\n/g, '<br>')}
          </div>` : ''}
        </div>
        <div style="width: 35%; padding: 4px 8px; display: flex; flex-direction: column; justify-content: space-between; font-size: 10.5px;">
          <div>
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <span>Round To</span>
              <span>${roundOff.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-weight: bold; font-size: 12px; border-top: 1px solid #000; border-bottom: 1px solid #000; margin-top: 2px;">
              <span>Total</span>
              <span>${finalTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Footer Grid (Bank Details & Signatory) -->
      <div style="display: flex;">
        <div style="width: 65%; border-right: 1px solid #000; padding: 5px 8px; font-size: 10.5px; line-height: 1.45;">
          <div style="font-weight: bold; margin-bottom: 2px; text-decoration: underline;">Bank Details :-</div>
          <div><strong>Bank Name :</strong> ${data.bankName || ''}</div>
          <div><strong>Branch :</strong> ${data.bankBranch || ''}</div>
          <div><strong>A/C No :</strong> ${data.bankAccount || ''}</div>
          <div><strong>IFSC :</strong> ${data.bankIfsc || ''}</div>
        </div>
        <div style="width: 35%; padding: 5px 8px; display: flex; flex-direction: column; justify-content: space-between; font-size: 10.5px; text-align: right;">
          <div></div>
          ${(bs?.showForShopName !== false && data.shopName) || bs?.showAuthorisedSignatory !== false ? `
          <div>
            ${bs?.showForShopName !== false && data.shopName ? `<div style="font-weight: bold; font-size: 10.5px; text-transform: uppercase;">FOR ${data.shopName.toUpperCase()}</div>` : ''}
            ${bs?.showAuthorisedSignatory !== false ? `
            <div style="height: ${bs?.showForShopName !== false && data.shopName ? '30px' : '40px'};"></div>
            <div style="font-weight: bold; font-size: 10px;">Authorised Signatory</div>
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
