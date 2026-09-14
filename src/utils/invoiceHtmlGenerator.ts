import { type BillSettings, formatPrintItem, numberToIndianWords } from './receiptGenerator';

export interface InvoiceItemDisplay {
  name: string;
  quantity: number | string;
  unit_price: number;
  total: number;
  originalRate?: number;
  discountLabel?: string;
  brand?: string;
  billing_type?: string;
  pieces_override?: number;
  pieces_per_kg?: number;
  unit?: string;
  hsn?: string;
  hsn_code?: string;
  tax_rate_percent?: number;
  gst_percent?: number;
  discountAmount?: number;
  isCombo?: boolean;
  combo_items?: Array<{ product_id: string; quantity: number; product_name?: string }>;
}

export interface InvoiceData {
  shopName: string;
  shopGstin?: string;
  shopPan?: string;
  shopState?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  logoUrl?: string;
  upiId?: string;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  billerName?: string;
  transporterName?: string;
  vehicleNumber?: string;
  transporterDocNo?: string;
  transporterDocDate?: string;
  ewayBillNo?: string;
  ewayBillDate?: string;
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  bankAccount?: string;
  bankName?: string;
  bankIfsc?: string;
  bankBranch?: string;
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
  oldBalance?: number;
  customerBalance?: number;
  paymentMethod?: string;
  isReprint?: boolean;
  invoiceType?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerState?: string;
  customerAddress?: string;
  shippingName?: string;
  shippingAddress?: string;
  shippingGstin?: string;
  scrapDeduction?: number;
  scrapInvoiceNumber?: string;
  returnDeduction?: number;
  returnInvoiceNumber?: string;
  showProductOffers?: boolean;
  billSettings?: BillSettings;
  isB2B?: boolean;
  a5Orientation?: 'horizontal' | 'vertical';
}

function getDocumentTitle(invoiceType?: string, isReprint?: boolean, estimateMode?: boolean, isB2B?: boolean, nonGstBillTitle?: string): string {
  const nonGstTitle = (nonGstBillTitle === 'ESTIMATE' || (estimateMode && nonGstBillTitle !== 'BILL_OF_SUPPLY')) ? 'ESTIMATE' : 'BILL OF SUPPLY';
  let baseTitle = '';
  if (isB2B) {
    baseTitle = 'TAX INVOICE';
  } else {
    switch (invoiceType) {
      case 'GST': baseTitle = 'TAX INVOICE'; break;
      case 'SCRAP': baseTitle = 'SCRAP BILL'; break;
      case 'RETURN':
      case 'SALES_RETURN':
      case 'CREDIT_NOTE': baseTitle = 'SALES RETURN'; break;
      case 'QUOTATION': baseTitle = 'QUOTATION'; break;
      case 'BILL_OF_SUPPLY': baseTitle = nonGstTitle; break;
      case 'ESTIMATE': baseTitle = nonGstTitle; break;
      default: baseTitle = nonGstTitle; break;
    }
  }
  return isReprint ? `${baseTitle} (REPRINT)` : baseTitle;
}

function formatItemNameForBill(name: string, isCombo?: boolean): string {
  if (!name) return '';
  let formatted = name.replace(/\b(COMBO|Combo|combo)\b/g, '<b style="font-weight:900; letter-spacing:0.5px;">$1</b>');
  if (isCombo && !/\b(COMBO|Combo|combo)\b/i.test(name)) {
    formatted = `<b style="font-weight:900; color:#6b21a8; letter-spacing:0.5px;">[COMBO]</b> ${formatted}`;
  }
  return formatted;
}

export function generateInvoiceHtml(data: InvoiceData, style: 'standard' | 'boxed' | 'modern' | 'classic' | 'half-a4' = 'standard'): string {
  const bs = data.billSettings;
  const isB2B = data.isB2B === true;
  const title = getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, isB2B, bs?.nonGstBillTitle);

  if (style === 'half-a4') return generateHalfA4Html(data, title);
  if (style === 'boxed') return generateBoxedHtml(data, title);
  if (style === 'modern') return generateModernHtml(data, title);
  if (style === 'classic') return generateClassicHtml(data, title);
  return generateStandardHtml(data, title);
}

export function generateHalfA4Html(data: InvoiceData, titleStr?: string): string {
  const bs = data.billSettings;
  const isB2B = data.isB2B === true;
  const isGstBill = data.invoiceType === 'GST' || isB2B;
  const title = titleStr || getDocumentTitle(data.invoiceType, data.isReprint, bs?.estimateMode, isB2B, bs?.nonGstBillTitle);
  const grandTotal = Number(data.grandTotal) || 0;
  const netPayable = grandTotal - ((Number(data.scrapDeduction) || 0) + (Number(data.returnDeduction) || 0));
  const isVertical = data.a5Orientation === 'vertical';
  const itemsList = Array.isArray(data.items) ? data.items : [];

  const itemsHtml = itemsList.map((item, idx) => {
    const fmt = formatPrintItem(item, data.billSettings);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = data.billSettings?.showBrandName !== false && item.brand ? ` <span style="font-size:10px; color:#444;">(${item.brand})</span>` : '';
    return `
    <tr>
      <td style="text-align: left; padding: 2.5px 4px; font-size: 11.5px; width: 35px;">${idx + 1}</td>
      <td style="text-align: left; padding: 2.5px 4px; font-size: 11.5px; font-weight: 500;">${displayName}${brandHtml}</td>
      <td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; width: 75px;">${fmt.displayRate}</td>
      <td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; width: 55px;">${fmt.displayQty}</td>
      <td style="text-align: right; padding: 2.5px 4px; font-size: 11.5px; font-weight: 600; width: 85px;">${fmt.displayTotal}</td>
    </tr>
    `;
  }).join('');

  const amountWords = numberToIndianWords(Math.max(0, netPayable));

  const oldBalance = data.oldBalance !== undefined
    ? data.oldBalance
    : (data.balanceAmount != null && data.receivedAmount != null && data.paymentMethod !== 'CREDIT'
      ? (data.balanceAmount - grandTotal + data.receivedAmount)
      : null);

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
            <th style="text-align: right; width: 75px;">Rate</th>
            <th style="text-align: right; width: 55px;">Qty</th>
            <th style="text-align: right; width: 85px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Bottom Page Footer (Anchored at bottom of Half A4 paper) -->
    <div class="footer-section">
      <div class="divider-solid"></div>
      <div class="summary-grid">
        <!-- Left: Rupees in Words & Customer Ledger -->
        <div style="width: ${isVertical ? '50%' : '55%'};">
          <div style="font-size: 11px; font-weight: 600;">Rupees ${amountWords} Only</div>

          ${(data.billSettings?.showCreditBalance !== false) && (data.receivedAmount != null || data.balanceAmount != null || data.oldBalance != null) ? `
          <table class="ledger-table">
            ${oldBalance != null && oldBalance !== 0 ? `
            <tr>
              <td style="padding-right: 10px; font-weight: bold;">Old Balance</td>
              <td style="font-weight: bold;">:</td>
              <td style="text-align: right; padding-left: 10px; font-weight: bold;">${oldBalance.toFixed(2)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding-right: 10px; font-weight: bold;">Sales</td>
              <td style="font-weight: bold;">:</td>
              <td style="text-align: right; padding-left: 10px; font-weight: bold;">${grandTotal.toFixed(2)}</td>
            </tr>
            ${data.receivedAmount != null && data.receivedAmount > 0 ? `
            <tr>
              <td style="padding-right: 10px; font-weight: bold;">${data.paymentMethod === 'CREDIT' ? 'Cash Received / Paid' : 'Cash Received'}</td>
              <td style="font-weight: bold;">:</td>
              <td style="text-align: right; padding-left: 10px; font-weight: bold;">${data.receivedAmount.toFixed(2)}</td>
            </tr>` : ''}
            ${data.balanceAmount != null ? `
            <tr class="double-underline">
              <td style="padding-right: 10px; font-weight: bold;">${data.paymentMethod === 'CREDIT' ? 'Balance Due' : 'Balance'}</td>
              <td style="font-weight: bold;">:</td>
              <td style="text-align: right; padding-left: 10px; font-weight: bold;">${Math.abs(data.balanceAmount).toFixed(2)}</td>
            </tr>` : ''}
          </table>
          ` : ''}

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
            <tr style="font-weight: bold; font-size: 13px;">
              <td style="text-align: right; padding-right: 6px; padding-top: 2px;">Total :</td>
              <td style="text-align: right; width: 85px; padding-top: 2px;">${netPayable.toFixed(2)}</td>
            </tr>
          </table>

          <!-- Signatory Section -->
          <div style="margin-top: 14px; font-size: 10px;">
            <div>For <strong>${data.shopName ? data.shopName.toUpperCase() : 'Store'}</strong></div>
            <div style="height: 22px;"></div>
            <div>Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function generateBoxedHtml(data: InvoiceData, title: string): string {
  const bs = data.billSettings;
  const isGstBill = data.invoiceType === 'GST' || data.isB2B === true;
  const grandTotal = Number(data.grandTotal) || 0;
  const netPayable = grandTotal - ((Number(data.scrapDeduction) || 0) + (Number(data.returnDeduction) || 0));
  const amountWords = numberToIndianWords(Math.max(0, netPayable));
  const itemsList = Array.isArray(data.items) ? data.items : [];

  const itemsHtml = itemsList.map((item, idx) => {
    const fmt = formatPrintItem(item, data.billSettings);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = bs?.showBrandName !== false && item.brand ? ` <span style="font-size:10px; color:#333; font-weight: 600;">(${item.brand})</span>` : '';
    const comboHtml = item.isCombo && item.combo_items && item.combo_items.length > 0
      ? `<br><b style="font-size:10px; color:#6b21a8; font-weight:800; letter-spacing:0.3px;">[COMBO OFFER]</b> <span style="font-size:9.5px; color:#4b5563; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    const offerHtml = data.showProductOffers !== false && item.discountLabel ? `<br><span style="font-size:9.5px; color:#dc2626; font-weight:600;">${item.discountLabel}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : '';

    const hsnCode = item.hsn || item.hsn_code || '-';
    const unitStr = item.unit || (item.billing_type === 'WEIGHT' ? 'Kg' : 'Pcs');
    const taxPct = item.tax_rate_percent != null ? `${item.tax_rate_percent.toFixed(2)}` : (item.gst_percent != null ? `${item.gst_percent.toFixed(2)}` : '-');
    const discStr = item.discountAmount && item.discountAmount > 0 ? item.discountAmount.toFixed(2) : '-';

    const isLastItem = idx === itemsList.length - 1 && itemsList.length >= 8;
    const rowClass = isLastItem ? 'class="last-row"' : '';
    return `
    <tr ${rowClass} style="height: 25px;">
      <td style="text-align: center; font-weight: 500;">${idx + 1}</td>
      <td style="text-align: left; font-weight: 500; line-height: 1.35; padding-left: 6px;">${displayName}${brandHtml}${comboHtml}${offerHtml}</td>
      <td style="text-align: center; font-weight: 500;">${hsnCode}</td>
      <td style="text-align: center; font-weight: 600; font-variant-numeric: tabular-nums;">${fmt.displayQty}</td>
      <td style="text-align: center; font-weight: 500;">${unitStr}</td>
      <td style="text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; padding-right: 4px;">${fmt.displayRate}</td>
      <td style="text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; padding-right: 4px;">${discStr}</td>
      <td style="text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; padding-right: 4px;">${taxPct}</td>
      <td style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; padding-right: 6px;">${fmt.displayTotal}</td>
    </tr>
    `;
  }).join('');

  const minRows = 8;
  let emptyRowsHtml = '';
  if (itemsList.length < minRows) {
    const padCount = minRows - itemsList.length;
    for (let i = 0; i < padCount; i++) {
      const isLastEmpty = i === padCount - 1;
      const rowClass = isLastEmpty ? 'class="last-row"' : '';
      emptyRowsHtml += `
      <tr ${rowClass} style="height: 25px;">
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
      </tr>`;
    }
  }

  const taxSummaryLine = `Sale @18% = ${data.subtotal.toFixed(2)}${data.igst != null && data.igst > 0 ? `, IGST = ${data.igst.toFixed(2)}` : (data.cgst != null || data.sgst != null ? `, CGST = ${(data.cgst || 0).toFixed(2)}, SGST = ${(data.sgst || 0).toFixed(2)}` : '')} | Total Sale = ${data.subtotal.toFixed(2)}, Tax = ${data.tax.toFixed(2)}, Cess = 0.00, Add. Cess = 0.00`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - ${data.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; }
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      color: #000;
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    .invoice-box {
      width: 100%;
      border: 1.5px solid #000;
      margin: 0 auto;
    }
    .top-header-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 10px;
      border-bottom: 1px solid #000;
      font-size: 11px;
      font-weight: 600;
      background: #f8fafc;
    }
    .company-header {
      text-align: center;
      padding: 10px;
      border-bottom: 1px solid #000;
    }
    .company-name {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .company-subtext {
      font-size: 11px;
      line-height: 1.35;
    }
    .details-grid {
      display: flex;
      border-bottom: 1px solid #000;
    }
    .details-col {
      width: 50%;
      padding: 6px 10px;
      font-size: 11px;
      line-height: 1.45;
    }
    .details-col.left {
      border-right: 1px solid #000;
    }
    .section-title {
      font-weight: 800;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: #f1f5f9;
      padding: 2.5px 6px;
      margin: -6px -10px 6px -10px;
      border-bottom: 1px solid #000;
    }
    .irn-bar {
      padding: 4px 10px;
      border-bottom: 1px solid #000;
      font-size: 10.5px;
      background: #fafafa;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border-bottom: 1.5px solid #000;
    }
    .items-table th {
      border-bottom: 1px solid #000;
      border-right: 1px solid #000;
      padding: 5px 4px;
      font-size: 10.5px;
      font-weight: bold;
      background: #f8fafc;
      text-transform: uppercase;
    }
    .items-table th:last-child {
      border-right: none;
    }
    .items-table td {
      border-right: 1px solid #000;
      border-bottom: 1px solid #e2e8f0;
      padding: 4px 4px;
      font-size: 11px;
      vertical-align: middle;
    }
    .items-table td:last-child {
      border-right: none;
    }
    .totals-box {
      border-bottom: 1px solid #000;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 12px;
      font-size: 11.5px;
      border-bottom: 1px solid #ddd;
    }
    .totals-row.grand {
      font-size: 14px;
      font-weight: 900;
      background: #f8fafc;
      border-bottom: 1px solid #000;
      padding: 6px 12px;
    }
    .words-bar {
      padding: 6px 12px;
      font-size: 11.5px;
      font-weight: 700;
      border-bottom: 1px solid #000;
      background: #fff;
    }
    .settlement-bar {
      padding: 6px 12px;
      font-size: 11px;
      border-bottom: 1px solid #000;
      background: #fafafa;
    }
    .footer-grid {
      display: flex;
      border-top: 1px solid #000;
      min-height: 120px;
    }
    .footer-col {
      padding: 8px 10px;
      font-size: 10.5px;
      line-height: 1.45;
    }
    .footer-col.terms {
      width: 38%;
      border-right: 1px solid #000;
    }
    .footer-col.bank {
      width: 34%;
      border-right: 1px solid #000;
    }
    .footer-col.sign {
      width: 28%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-align: center;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="top-header-line">
      <span>Page No. 1 of 1</span>
      <span style="font-size: 14px; font-weight: bold; letter-spacing: 0.5px;">${title}</span>
      <span>${data.isReprint ? 'Duplicate Copy' : 'Original Copy'}</span>
    </div>

    <div class="company-header">
      ${data.logoUrl ? `<div style="margin-bottom: 6px;"><img src="${data.logoUrl}" style="max-height: 48px; max-width: 180px; object-fit: contain;" alt="Shop Logo" /></div>` : ''}
      ${(isGstBill || bs?.showShopName !== false) && data.shopName ? `<div class="company-name">${data.shopName}</div>` : ''}
      ${(isGstBill || bs?.showShopAddress !== false) && data.shopAddress ? `<div class="company-subtext">${data.shopAddress}</div>` : ''}
      <div class="company-subtext">
        ${(isGstBill || bs?.showPhone !== false) && data.shopPhone ? `Mobile: +91 ${data.shopPhone}` : ''}
        ${data.shopPhone && data.shopEmail ? ' | ' : ''}
        ${data.shopEmail ? `Email: <strong>${data.shopEmail}</strong>` : ''}
      </div>
      <div class="company-subtext" style="font-weight: bold; margin-top: 3px;">
        ${(isGstBill || bs?.showShopGstin !== false) && data.shopGstin ? `GSTIN - ${data.shopGstin}` : ''}
        ${data.shopGstin && data.shopPan ? ' | ' : ''}
        ${data.shopPan ? `PAN - ${data.shopPan}` : ''}
      </div>
    </div>

    <!-- Invoice Details & Transporter Details Grid -->
    ${((isGstBill || bs?.showTransporterDetails !== false) && (data.transporterName || data.vehicleNumber || data.transporterDocNo || data.ewayBillNo)) ? `
    <div class="details-grid">
      <div class="details-col left">
        <div class="section-title">Invoice Details</div>
        <div><strong>Invoice Number</strong> : ${data.invoiceNumber}</div>
        <div><strong>Invoice Date</strong> : ${data.date}</div>
        ${data.dueDate ? `<div><strong>Due date</strong> : ${data.dueDate}</div>` : ''}
        <div><strong>Place of Supply</strong> : ${data.customerState || data.shopState || '-'}</div>
        <div><strong>Reverse Charge</strong> : No</div>
        ${data.billerName && (isGstBill || bs?.showBillerName !== false) ? `<div><strong>Biller</strong> : ${data.billerName}</div>` : ''}
      </div>
      <div class="details-col">
        <div class="section-title">Transporter Details</div>
        <div><strong>Transporter</strong> : ${data.transporterName || '-'}</div>
        <div><strong>Vehicle No.</strong> : ${data.vehicleNumber || '-'}</div>
        <div><strong>Transporter Doc No.</strong> : ${data.transporterDocNo || '-'}</div>
        <div><strong>Transporter Doc Date</strong> : ${data.transporterDocDate || '-'}</div>
        <div><strong>E-Way Bill No.</strong> : ${data.ewayBillNo || '-'}</div>
        <div><strong>E-Way Bill Date</strong> : ${data.ewayBillDate || '-'}</div>
      </div>
    </div>
    ` : `
    <div class="details-grid">
      <div class="details-col left" style="width: 50%;">
        <div class="section-title">Invoice Details</div>
        <div><strong>Invoice Number</strong> : ${data.invoiceNumber}</div>
        <div><strong>Invoice Date</strong> : ${data.date}</div>
        ${data.dueDate ? `<div><strong>Due date</strong> : ${data.dueDate}</div>` : ''}
      </div>
      <div class="details-col" style="width: 50%;">
        <div class="section-title" style="visibility: hidden; user-select: none;">&nbsp;</div>
        <div><strong>Place of Supply</strong> : ${data.customerState || data.shopState || '-'}</div>
        <div><strong>Reverse Charge</strong> : No</div>
        ${data.billerName && (isGstBill || bs?.showBillerName !== false) ? `<div><strong>Biller</strong> : ${data.billerName}</div>` : ''}
      </div>
    </div>
    `}

    <!-- Billing Details & Shipping Details Grid -->
    <div class="details-grid">
      ${(data.shippingAddress || data.shippingName || data.shippingGstin) ? `
      <div class="details-col left" style="width: 50%;">
        <div class="section-title">Billing Details (Billed To)</div>
        <div><strong>Name</strong> : ${data.customerName || 'Cash Customer'}</div>
        <div><strong>GSTIN:</strong> ${data.customerGstin || '-'} | <strong>Mobile:</strong> ${data.customerPhone || '-'}</div>
        ${data.customerAddress ? `<div><strong>Address:</strong> ${data.customerAddress}</div>` : ''}
      </div>
      <div class="details-col" style="width: 50%;">
        <div class="section-title">Shipping Details (Shipped To)</div>
        <div><strong>Name</strong> : ${data.shippingName || data.customerName || '-'}</div>
        <div><strong>GSTIN:</strong> ${data.shippingGstin || data.customerGstin || '-'}</div>
        <div><strong>Address:</strong> ${data.shippingAddress}</div>
      </div>
      ` : `
      <div class="details-col left" style="width: 100%; border-right: none;">
        <div class="section-title">Billing Details</div>
        <div><strong>Name</strong> : ${data.customerName || 'Cash Customer'}</div>
        <div><strong>GSTIN:</strong> ${data.customerGstin || '-'} | <strong>Mobile:</strong> ${data.customerPhone || '-'}</div>
        ${data.customerAddress ? `<div><strong>Address:</strong> ${data.customerAddress}</div>` : ''}
      </div>
      `}
    </div>

    ${data.irn ? `
    <div class="irn-bar">
      <strong>IRN-</strong> ${data.irn} | <strong>Ack No.-</strong> ${data.ackNo || '-'} | <strong>Ack Date-</strong> ${data.ackDate || '-'}
    </div>
    ` : ''}

    <table class="items-table">
      <colgroup>
        <col style="width: 32px;">
        <col style="width: auto;">
        <col style="width: 72px;">
        <col style="width: 44px;">
        <col style="width: 44px;">
        <col style="width: 76px;">
        <col style="width: 56px;">
        <col style="width: 52px;">
        <col style="width: 88px;">
      </colgroup>
      <thead>
        <tr>
          <th style="text-align: center;">Sr.</th>
          <th style="text-align: left; padding-left: 6px;">Item Description</th>
          <th style="text-align: center;">HSN/SAC</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: center;">Unit</th>
          <th style="text-align: right; padding-right: 4px;">List Price</th>
          <th style="text-align: right; padding-right: 4px;">Disc.</th>
          <th style="text-align: right; padding-right: 4px;">Tax %</th>
          <th style="text-align: right; padding-right: 6px;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
        ${emptyRowsHtml}
      </tbody>
    </table>

    <div class="totals-box">
      ${data.discount > 0 ? `
      <div class="totals-row">
        <span>Discount</span>
        <span>- ${data.discount.toFixed(2)}</span>
      </div>` : ''}

      <div class="totals-row grand">
        <span>Total</span>
        <span>${netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div class="words-bar">
        Rs. ${amountWords} Only
      </div>

      <div class="settlement-bar">
        <div><strong>Settled by - ${data.paymentMethod || 'Bank'} :</strong> ${grandTotal.toFixed(2)} | <strong>Invoice Balance :</strong> ${(Math.abs(data.balanceAmount || 0)).toFixed(2)}</div>
        <div style="margin-top: 2.5px; font-size: 10px; color: #111;">${taxSummaryLine}</div>
      </div>
    </div>

    <div class="footer-grid">
      <div class="footer-col terms">
        <div class="section-title" style="margin: -8px -10px 6px -10px;">Terms and Conditions</div>
        ${bs?.instructions ? bs.instructions.replace(/\n/g, '<br>') : '<div>E &amp; O.E.</div>'}
      </div>

      <div class="footer-col bank">
        <div class="section-title" style="margin: -8px -10px 6px -10px;">Bank Account Details</div>
        <div><strong>Account Number:</strong> ${data.bankAccount || '-'}</div>
        <div><strong>Bank:</strong> ${data.bankName || '-'}</div>
        <div><strong>IFSC:</strong> ${data.bankIfsc || '-'}</div>
        <div><strong>Branch:</strong> ${data.bankBranch || '-'}</div>
        ${data.upiId ? `<div style="margin-top: 3px;"><strong>UPI ID:</strong> ${data.upiId}</div>` : ''}
      </div>

      <div class="footer-col sign">
        <div class="section-title" style="margin: -8px -10px 6px -10px;">For ${data.shopName ? data.shopName.toUpperCase() : 'Company Name'}</div>
        <div style="height: 35px;"></div>
        <div style="font-weight: bold; font-size: 10.5px; border-top: 1px solid #000; padding-top: 4px; width: 80%; margin: 0 auto;">Authorized Signature</div>
      </div>
    </div>

    <div style="text-align: center; font-size: 9px; color: #666; padding: 4px; border-top: 1px solid #000; font-weight: 500;">
      Invoice Created by Nafid POS
    </div>
  </div>
</body>
</html>`;
}

function generateStandardHtml(data: InvoiceData, title: string): string {
  const isGstBill = data.invoiceType === 'GST' || data.isB2B === true;
  const itemsHtml = data.items.map((item, idx) => {
    const fmt = formatPrintItem(item, data.billSettings);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = data.billSettings?.showBrandName !== false && item.brand ? `<br><span class="brand-badge">${item.brand}</span>` : '';
    const comboHtml = item.isCombo && item.combo_items && item.combo_items.length > 0
      ? `<br><b style="font-size:10.5px; color:#6b21a8; font-weight:900; letter-spacing:0.5px;">[COMBO OFFER]</b> <span style="font-size:10px; color:#4b5563; font-weight:bold; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    return `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td>${displayName}${brandHtml}${comboHtml}${data.showProductOffers !== false && item.discountLabel ? `<br><span class="discount-badge">${item.discountLabel}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : ''}</td>
      <td class="text-center">${fmt.displayQty}</td>
      <td class="text-right">₹${fmt.displayRate}</td>
      <td class="text-right">₹${fmt.displayTotal}</td>
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
    ${(isGstBill || data.billSettings?.showShopName !== false) && data.shopName ? `<h1>${data.shopName}</h1>` : ''}
    ${(isGstBill || data.billSettings?.showShopAddress !== false) && data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
    ${(isGstBill || data.billSettings?.showPhone !== false) && data.shopPhone ? `<p>Phone: ${data.shopPhone}</p>` : ''}
    ${data.shopGstin && (isGstBill || data.billSettings?.showShopGstin !== false) ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
    ${data.shopState && (isGstBill || data.billSettings?.showShopState !== false) ? `<p>State: ${data.shopState}</p>` : ''}
  </div>
  ${(isGstBill || data.billSettings?.showTitle !== false) ? `<div class="invoice-title">${title}</div>` : ''}
  <div class="info-row">
    <div class="info-block">
      <p><span class="label">Invoice #:</span> ${data.invoiceNumber}</p>
      <p><span class="label">Date:</span> ${data.date}</p>
      ${data.billerName && (isGstBill || data.billSettings?.showBillerName !== false) ? `<p><span class="label">Biller:</span> ${data.billerName}</p>` : ''}
    </div>
    <div class="info-block" style="text-align:right">
      ${data.customerName && (isGstBill || data.billSettings?.showCustomerName !== false) ? `<p><span class="label">Customer:</span> ${data.customerName}</p>` : ''}
      ${data.customerAddress && (isGstBill || data.billSettings?.showCustomerAddress !== false) ? `<p><span class="label">Address:</span> ${data.customerAddress}</p>` : ''}
      ${data.customerPhone && (isGstBill || data.billSettings?.showCustomerPhone !== false) ? `<p><span class="label">Phone:</span> ${data.customerPhone}</p>` : ''}
      ${data.customerGstin && (isGstBill || data.billSettings?.showCustomerGstin !== false) ? `<p><span class="label">GSTIN:</span> ${data.customerGstin}</p>` : ''}
      ${data.customerState && (isGstBill || data.billSettings?.showCustomerState !== false) ? `<p><span class="label">State:</span> ${data.customerState}</p>` : ''}
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
      ${(data.billSettings?.showCreditBalance !== false) && (data.receivedAmount != null || data.balanceAmount != null || data.oldBalance != null) ? `
      ${data.oldBalance != null && data.oldBalance !== 0 ? `<tr><td colspan="4" class="text-right">Old Balance</td><td class="text-right">₹${data.oldBalance.toFixed(2)}</td></tr>` : ''}
      ${data.receivedAmount != null && data.receivedAmount > 0 ? `<tr><td colspan="4" class="text-right">${data.paymentMethod === 'CREDIT' ? 'Cash Received / Paid' : 'Received'}</td><td class="text-right">₹${data.receivedAmount.toFixed(2)}</td></tr>` : ''}
      ${data.balanceAmount != null ? `<tr><td colspan="4" class="text-right" style="font-weight:bold">${data.paymentMethod === 'CREDIT' ? 'Balance Due' : 'Balance'}</td><td class="text-right" style="font-weight:bold">₹${Math.abs(data.balanceAmount).toFixed(2)}</td></tr>` : ''}
      ` : ''}
    </tfoot>
  </table>
  ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms &amp; Conditions:</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}
  <div class="footer">Generated by Nafid — ${new Date().toLocaleString('en-IN')}</div>
</body></html>`;
}

function generateModernHtml(data: InvoiceData, title: string): string {
  const isGstBill = data.invoiceType === 'GST' || data.isB2B === true;
  const itemsHtml = data.items.map((item, idx) => {
    const fmt = formatPrintItem(item, data.billSettings);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = data.billSettings?.showBrandName !== false && item.brand ? `<br><span style="font-size:9px;color:#6b7280;font-weight:600">${item.brand}</span>` : '';
    const comboHtml = item.isCombo && item.combo_items && item.combo_items.length > 0
      ? `<br><b style="font-size:10px; color:#059669; font-weight:900; letter-spacing:0.5px;">[COMBO OFFER]</b> <span style="font-size:9.5px; color:#6b7280; font-weight:bold; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    return `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 4px;font-size:11px;color:#374151">${idx + 1}</td>
      <td style="padding:6px 4px;font-size:11px;color:#374151">${displayName}${brandHtml}${comboHtml}${data.showProductOffers !== false && item.discountLabel ? `<br><span style="font-size:9px;color:#dc2626;font-weight:600">${item.discountLabel}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : ''}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:center;color:#374151">${fmt.displayQty}</td>
      <td style="padding:6px 4px;font-size:11px;text-align:right;color:#374151">₹${fmt.displayRate}</td>
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
      ${(isGstBill || data.billSettings?.showShopName !== false) && data.shopName ? `<h1>${data.shopName}</h1>` : ''}
      ${(isGstBill || data.billSettings?.showShopAddress !== false) && data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
      ${(isGstBill || data.billSettings?.showPhone !== false) && data.shopPhone ? `<p>${data.shopPhone}</p>` : ''}
      ${data.shopGstin && (isGstBill || data.billSettings?.showShopGstin !== false) ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
      ${data.shopState && (isGstBill || data.billSettings?.showShopState !== false) ? `<p>State: ${data.shopState}</p>` : ''}
      ${(isGstBill || data.billSettings?.showTitle !== false) ? `<div class="invoice-badge">${title}</div>` : ''}
    </div>

    <div class="info-grid">
      <div class="block">
        <p><span class="lbl">Invoice #</span><br>${data.invoiceNumber}</p>
        <p><span class="lbl">Date</span><br>${data.date}</p>
        ${data.billerName && (isGstBill || data.billSettings?.showBillerName !== false) ? `<p><span class="lbl">Biller</span><br>${data.billerName}</p>` : ''}
      </div>
      <div class="block" style="text-align:right">
        ${data.customerName && (isGstBill || data.billSettings?.showCustomerName !== false) ? `<p><span class="lbl">Customer</span><br>${data.customerName}</p>` : ''}
        ${data.customerAddress && (isGstBill || data.billSettings?.showCustomerAddress !== false) ? `<p><span class="lbl">Address</span><br>${data.customerAddress}</p>` : ''}
        ${data.customerPhone && (isGstBill || data.billSettings?.showCustomerPhone !== false) ? `<p><span class="lbl">Phone</span><br>${data.customerPhone}</p>` : ''}
        ${data.customerGstin && (isGstBill || data.billSettings?.showCustomerGstin !== false) ? `<p><span class="lbl">GSTIN</span><br>${data.customerGstin}</p>` : ''}
        ${data.customerState && (isGstBill || data.billSettings?.showCustomerState !== false) ? `<p><span class="lbl">State</span><br>${data.customerState}</p>` : ''}
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
      ${(data.billSettings?.showCreditBalance !== false) && (data.receivedAmount != null || data.balanceAmount != null || data.oldBalance != null) ? `
      ${data.oldBalance != null && data.oldBalance !== 0 ? `<div class="row"><span>Old Balance</span><span>₹${data.oldBalance.toFixed(2)}</span></div>` : ''}
      ${data.receivedAmount != null && data.receivedAmount > 0 ? `<div class="row"><span>${data.paymentMethod === 'CREDIT' ? 'Cash Received / Paid' : 'Received'}</span><span>₹${data.receivedAmount.toFixed(2)}</span></div>` : ''}
      ${data.balanceAmount != null ? `<div class="row" style="font-weight:bold"><span>${data.paymentMethod === 'CREDIT' ? 'Balance Due' : 'Balance'}</span><span>₹${Math.abs(data.balanceAmount).toFixed(2)}</span></div>` : ''}
      ` : ''}
    </div>

    ${data.upiId ? `<div class="upi-box"><p>Pay via UPI: <strong>${data.upiId}</strong></p></div>` : ''}

    ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms & Conditions</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}

    <div class="footer">Generated by Nafid — ${new Date().toLocaleString('en-IN')}</div>
  </div>
</body></html>`;
}

function generateClassicHtml(data: InvoiceData, title: string): string {
  const isGstBill = data.invoiceType === 'GST' || data.isB2B === true;
  const itemsHtml = data.items.map((item, idx) => {
    const fmt = formatPrintItem(item, data.billSettings);
    const displayName = formatItemNameForBill(item.name, item.isCombo);
    const brandHtml = data.billSettings?.showBrandName !== false && item.brand ? `<br><span style="font-size:9px;color:#6b7280;font-weight:600">${item.brand}</span>` : '';
    const comboHtml = item.isCombo && item.combo_items && item.combo_items.length > 0
      ? `<br><b style="font-size:10px; color:#1a1a1a; font-weight:900; letter-spacing:0.5px;">[COMBO OFFER]</b> <span style="font-size:9.5px; color:#555; font-weight:bold; font-style:italic">Includes: ${item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}</span>`
      : '';
    return `
    <tr>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:center">${idx + 1}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px">${displayName}${brandHtml}${comboHtml}${data.showProductOffers !== false && item.discountLabel ? `<br><span style="font-size:9px;color:#b91c1c;font-style:italic">${item.discountLabel}${item.originalRate ? ' (was ₹' + item.originalRate.toFixed(2) + ')' : ''}</span>` : ''}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:center">${fmt.displayQty}</td>
      <td style="padding:5px 6px;border:1px solid #d1d5db;font-size:11px;text-align:right">₹${fmt.displayRate}</td>
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
      ${(isGstBill || data.billSettings?.showShopName !== false) && data.shopName ? `<h1>${data.shopName}</h1>` : ''}
      ${(isGstBill || data.billSettings?.showShopAddress !== false) && data.shopAddress ? `<p>${data.shopAddress}</p>` : ''}
      ${(isGstBill || data.billSettings?.showPhone !== false) && data.shopPhone ? `<p>Phone: ${data.shopPhone}</p>` : ''}
      ${data.shopGstin && (isGstBill || data.billSettings?.showShopGstin !== false) ? `<p>GSTIN: ${data.shopGstin}</p>` : ''}
      ${data.shopState && (isGstBill || data.billSettings?.showShopState !== false) ? `<p>State: ${data.shopState}</p>` : ''}
    </div>
  ${(isGstBill || data.billSettings?.showTitle !== false) ? `<div class="invoice-title">— ${title} —</div>` : ''}

    <table class="info-table">
      <tr>
        <td style="width:50%">
          <span class="lbl">Invoice No:</span> ${data.invoiceNumber}<br>
          <span class="lbl">Date:</span> ${data.date}<br>
          ${data.billerName && (isGstBill || data.billSettings?.showBillerName !== false) ? `<span class="lbl">Biller:</span> ${data.billerName}<br>` : ''}
        </td>
        <td style="width:50%;text-align:right">
          ${data.customerName && (isGstBill || data.billSettings?.showCustomerName !== false) ? `<span class="lbl">Customer:</span> ${data.customerName}<br>` : ''}
          ${data.customerAddress && (isGstBill || data.billSettings?.showCustomerAddress !== false) ? `<span class="lbl">Address:</span> ${data.customerAddress}<br>` : ''}
          ${data.customerPhone && (isGstBill || data.billSettings?.showCustomerPhone !== false) ? `<span class="lbl">Phone:</span> ${data.customerPhone}<br>` : ''}
          ${data.customerGstin && (isGstBill || data.billSettings?.showCustomerGstin !== false) ? `<span class="lbl">GSTIN:</span> ${data.customerGstin}<br>` : ''}
          ${data.customerState && (isGstBill || data.billSettings?.showCustomerState !== false) ? `<span class="lbl">State:</span> ${data.customerState}<br>` : ''}
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
        ${(data.billSettings?.showCreditBalance !== false) && (data.receivedAmount != null || data.balanceAmount != null || data.oldBalance != null) ? `
        ${data.oldBalance != null && data.oldBalance !== 0 ? `<tr><td colspan="4" class="text-right">Old Balance</td><td class="text-right">₹${data.oldBalance.toFixed(2)}</td></tr>` : ''}
        ${data.receivedAmount != null && data.receivedAmount > 0 ? `<tr><td colspan="4" class="text-right">${data.paymentMethod === 'CREDIT' ? 'Cash Received / Paid' : 'Received'}</td><td class="text-right">₹${data.receivedAmount.toFixed(2)}</td></tr>` : ''}
        ${data.balanceAmount != null ? `<tr><td colspan="4" class="text-right" style="font-weight:bold">${data.paymentMethod === 'CREDIT' ? 'Balance Due' : 'Balance'}</td><td class="text-right" style="font-weight:bold">₹${Math.abs(data.balanceAmount).toFixed(2)}</td></tr>` : ''}
        ` : ''}
      </tfoot>
    </table>

    ${data.upiId ? `<div class="upi-box"><p>Pay via UPI: <strong>${data.upiId}</strong></p></div>` : ''}

    ${data.billSettings?.instructions ? `<div class="terms"><strong>Terms & Conditions:</strong><br>${data.billSettings.instructions.replace(/\n/g, '<br>')}</div>` : ''}

    <div class="footer">This is a computer generated invoice — Generated by Nafid on ${new Date().toLocaleString('en-IN')}</div>
  </div>
</body></html>`;
}

export function generatePurchaseBillHtml(
  shopInfo: { shopName?: string; shopAddress?: string; shopPhone?: string; shopGstin?: string },
  bill: {
    bill_number: string;
    supplier_name: string;
    supplier_phone?: string;
    supplier_address?: string;
    supplier_gstin?: string;
    bill_date: string;
    invoice_number?: string;
    bill_type: string;
    payment_type?: string;
    notes?: string;
    total_amount: number;
    created_at?: string;
  },
  items: Array<{
    name: string;
    quantity: number;
    purchase_price: number;
    total_amount: number;
    is_gst_applicable?: number;
    tax_rate_percent?: number;
    hsn_sac_code?: string;
    item_code?: string;
    sku_barcode?: string;
  }>
): string {
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
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db;">₹${rate.toFixed(2)}</td>
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db;">₹${itemTaxable.toFixed(2)}</td>
        ${isGst ? `<td style="text-align: center; padding: 6px 8px; border: 1px solid #d1d5db;">${taxRate}%</td>` : ''}
        ${isGst ? `<td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db;">₹${taxAmount.toFixed(2)}</td>` : ''}
        <td style="text-align: right; padding: 6px 8px; border: 1px solid #d1d5db; font-weight: 700;">₹${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const grandTotal = isGst ? (totalTaxable + totalTax) : bill.total_amount;
  const roundOff = Math.round(grandTotal) - grandTotal;
  const finalTotal = Math.round(grandTotal);

  const halfTax = totalTax / 2;
  const formattedDate = bill.bill_date ? new Date(bill.bill_date.replace(' ', 'T')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

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
      <div style="color: #1a1a1a; white-space: pre-line;">${bill.notes || 'No extra notes recorded.'}</div>
    </div>
    <div class="totals-box">
      <div class="totals-row">
        <span>Total Items / Qty:</span>
        <span><strong>${items.length} items (${totalQty})</strong></span>
      </div>
      <div class="totals-row">
        <span>Subtotal / Taxable:</span>
        <span>₹${totalTaxable.toFixed(2)}</span>
      </div>
      ${isGst && totalTax > 0 ? `
        <div class="totals-row">
          <span>CGST:</span>
          <span>₹${halfTax.toFixed(2)}</span>
        </div>
        <div class="totals-row">
          <span>SGST:</span>
          <span>₹${halfTax.toFixed(2)}</span>
        </div>
        <div class="totals-row" style="font-weight: 700;">
          <span>Total Tax:</span>
          <span>₹${totalTax.toFixed(2)}</span>
        </div>
      ` : ''}
      ${roundOff !== 0 ? `
        <div class="totals-row">
          <span>Round Off:</span>
          <span>₹${roundOff.toFixed(2)}</span>
        </div>
      ` : ''}
      <div class="totals-row grand">
        <span>Grand Total:</span>
        <span>₹${finalTotal.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <div class="footer-sign">
    <div>
      <div style="font-size: 10px; color: #9ca3af;">Generated on ${new Date().toLocaleString('en-IN')}</div>
    </div>
    <div class="sign-box">
      Authorized Signatory
    </div>
  </div>
</body>
</html>`;
}
