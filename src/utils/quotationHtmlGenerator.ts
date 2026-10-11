import { numberToIndianWords } from './receiptGenerator';
export { numberToIndianWords };

export interface QuotationPrintItem {
  name: string;
  quantity: number;
  rate: number; // Unit price
  amount: number; // Line total
  hsn_code?: string | null;
  uom?: string | null;
  billing_type?: string | null;
  weight?: number | null;
  base_price?: number | null;
  discount_amount?: number | null;
  discount_percent?: number | null;
  taxable_amount?: number | null;
  tax_rate_percent?: number | null;
  cgst_rate?: number | null;
  cgst_amount?: number | null;
  sgst_rate?: number | null;
  sgst_amount?: number | null;
  igst_rate?: number | null;
  igst_amount?: number | null;
  is_gst_applicable?: boolean | number | null;
}

export interface QuotationPrintData {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  shopWebsite?: string;
  shopGstin?: string;
  shopState?: string;
  shopStateCode?: string;

  quotationNumber: string;
  date: string;
  validUntil?: string;
  billerName?: string;

  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  customerState?: string;

  reverseCharge?: string; // 'No' | 'Yes'
  isGstEnabled: boolean;

  items: QuotationPrintItem[];

  subtotal: number;
  discountTotal?: number;
  taxableAmount?: number;
  taxTotal: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  roundOff?: number;
  grandTotal: number;

  termsAndConditions?: string;

  // Bank details
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankHolderName?: string;
  upiId?: string;
}

function escapeHtml(s: unknown): string {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(val: number): string {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(val: number): string {
  const num = Number(val) || 0;
  if (num % 1 === 0) return num.toString();
  return num.toFixed(3).replace(/\.?0+$/, '');
}

export function generateQuotationHtml(data: QuotationPrintData): string {
  const isGst = Boolean(data.isGstEnabled);
  const shopStateClean = (data.shopState || '').trim().toLowerCase();
  const customerStateClean = (data.customerState || '').trim().toLowerCase();
  const isInterState = isGst && Boolean(customerStateClean && shopStateClean && customerStateClean !== shopStateClean);

  // Check if any items have discounts
  const hasDiscounts = data.items.some(i => {
    const dAmt = Number(i.discount_amount) || 0;
    const dPct = Number(i.discount_percent) || 0;
    return dAmt > 0 || dPct > 0;
  });

  // Check if any items have HSN code (in GST mode, HSN/SAC column is always shown)
  const hasHsn = isGst || data.items.some(i => Boolean(i.hsn_code && i.hsn_code.trim()));

  // Fallback calculations for items if needed
  const processedItems = data.items.map((item, idx) => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const lineTotal = Number(item.amount) || (rate * qty);

    let dAmt = Number(item.discount_amount) || 0;
    const dPct = Number(item.discount_percent) || 0;
    if (dAmt === 0 && dPct > 0 && item.base_price) {
      dAmt = (Number(item.base_price) * (dPct / 100)) * qty;
    }

    const taxableVal = item.taxable_amount != null ? Number(item.taxable_amount) : (isGst ? lineTotal : lineTotal);
    const taxRate = Number(item.tax_rate_percent) || 0;
    const halfRate = taxRate / 2;

    let cgstRate = item.cgst_rate != null ? Number(item.cgst_rate) : (isInterState ? 0 : halfRate);
    let cgstAmt = item.cgst_amount != null ? Number(item.cgst_amount) : (isInterState ? 0 : Math.round(taxableVal * (halfRate / 100) * 100) / 100);

    let sgstRate = item.sgst_rate != null ? Number(item.sgst_rate) : (isInterState ? 0 : halfRate);
    let sgstAmt = item.sgst_amount != null ? Number(item.sgst_amount) : (isInterState ? 0 : Math.round(taxableVal * (halfRate / 100) * 100) / 100);

    let igstRate = item.igst_rate != null ? Number(item.igst_rate) : (isInterState ? taxRate : 0);
    let igstAmt = item.igst_amount != null ? Number(item.igst_amount) : (isInterState ? Math.round(taxableVal * (taxRate / 100) * 100) / 100 : 0);

    return {
      ...item,
      slNo: idx + 1,
      name: item.name || 'Item',
      quantity: qty,
      uom: item.uom || (item.billing_type === 'WEIGHT' ? 'KG' : 'PCS'),
      rate,
      discountAmount: dAmt,
      discountPercent: dPct,
      taxableValue: taxableVal,
      taxRate,
      cgstRate,
      cgstAmt,
      sgstRate,
      sgstAmt,
      igstRate,
      igstAmt,
      lineTotal,
    };
  });

  // Calculate totals
  const computedSubtotal = data.subtotal != null && Number(data.subtotal) > 0
    ? Number(data.subtotal)
    : processedItems.reduce((sum, i) => sum + (isGst ? i.taxableValue : i.lineTotal), 0);

  const computedDiscountTotal = data.discountTotal != null
    ? Number(data.discountTotal)
    : processedItems.reduce((sum, i) => sum + i.discountAmount, 0);

  const computedTaxableAmount = data.taxableAmount != null
    ? Number(data.taxableAmount)
    : processedItems.reduce((sum, i) => sum + i.taxableValue, 0);

  const computedCgstTotal = data.cgstTotal != null
    ? Number(data.cgstTotal)
    : processedItems.reduce((sum, i) => sum + i.cgstAmt, 0);

  const computedSgstTotal = data.sgstTotal != null
    ? Number(data.sgstTotal)
    : processedItems.reduce((sum, i) => sum + i.sgstAmt, 0);

  const computedIgstTotal = data.igstTotal != null
    ? Number(data.igstTotal)
    : processedItems.reduce((sum, i) => sum + i.igstAmt, 0);

  const computedTaxTotal = isGst
    ? (data.taxTotal != null ? Number(data.taxTotal) : (isInterState ? computedIgstTotal : (computedCgstTotal + computedSgstTotal)))
    : 0;

  const computedGrandTotal = Number(data.grandTotal) || (computedSubtotal + (isGst ? computedTaxTotal : 0));

  const amountInWords = numberToIndianWords(Math.round(computedGrandTotal * 100) / 100);

  const hasBankDetails = Boolean(
    (data.bankName && data.bankName.trim()) ||
    (data.bankAccount && data.bankAccount.trim()) ||
    (data.bankIfsc && data.bankIfsc.trim()) ||
    (data.upiId && data.upiId.trim())
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Quotation - ${escapeHtml(data.quotationNumber)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 10mm 14mm 10mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #111111 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .quotation-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
      border: 1.5px solid #1a1a1a;
      padding: 10px 12px;
    }
    /* HEADER */
    .shop-header {
      text-align: center;
      padding-bottom: 6px;
      border-bottom: 1.5px solid #1a1a1a;
    }
    .shop-title {
      font-size: 22px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      line-height: 1.2;
      color: #000000;
      margin: 0 0 2px 0;
    }
    .shop-meta-line {
      font-size: 10.5px;
      font-weight: 500;
      color: #222222;
      margin: 2px 0;
      line-height: 1.35;
    }
    .shop-meta-line strong {
      font-weight: 700;
      color: #000000;
    }
    .quotation-title-banner {
      display: inline-block;
      margin-top: 5px;
      padding: 3px 18px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      border: 1.5px solid #1a1a1a;
      background: #f7f7f7;
      color: #000000;
    }

    /* DETAILS SECTION */
    .details-grid {
      display: table;
      width: 100%;
      table-layout: fixed;
      border-bottom: 1.5px solid #1a1a1a;
      margin-top: 0;
    }
    .details-col-left, .details-col-right {
      display: table-cell;
      vertical-align: top;
      padding: 6px 8px;
    }
    .details-col-left {
      width: 58%;
      border-right: 1.5px solid #1a1a1a;
    }
    .details-col-right {
      width: 42%;
    }
    .section-label {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #333333;
      border-bottom: 1px dashed #aaaaaa;
      padding-bottom: 2px;
      margin-bottom: 4px;
    }
    .customer-name {
      font-size: 13px;
      font-weight: 700;
      color: #000000;
      margin-bottom: 2px;
    }
    .detail-text {
      font-size: 10.5px;
      color: #111111;
      margin: 1.5px 0;
      line-height: 1.3;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .meta-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .meta-label {
      font-weight: 700;
      color: #222222;
      width: 45%;
    }
    .meta-value {
      text-align: right;
      color: #000000;
      font-weight: 500;
    }
    .meta-value.mono {
      font-family: Consolas, "Courier New", monospace;
      font-weight: 700;
      font-size: 11.5px;
    }

    /* PRODUCT TABLE */
    table.product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin-top: 0;
      page-break-inside: auto;
    }
    table.product-table thead {
      display: table-header-group;
    }
    table.product-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table.product-table th {
      background-color: #f2f2f2;
      border: 1px solid #1a1a1a;
      border-top: none;
      padding: 5px 4px;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: center;
      color: #000000;
    }
    table.product-table td {
      border: 1px solid #1a1a1a;
      padding: 5px 4px;
      vertical-align: top;
      color: #111111;
      line-height: 1.3;
    }
    .text-left { text-align: left !important; }
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .font-bold { font-weight: 700 !important; }
    .item-name {
      font-weight: 600;
      word-break: break-word;
      white-space: normal;
    }

    /* TOTALS & SUMMARY */
    .summary-section {
      width: 100%;
      border-top: 1.5px solid #1a1a1a;
      display: table;
      table-layout: fixed;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .words-and-terms {
      display: table-cell;
      width: 58%;
      vertical-align: top;
      padding: 8px 10px 8px 4px;
      border-right: 1.5px solid #1a1a1a;
    }
    .amounts-table-cell {
      display: table-cell;
      width: 42%;
      vertical-align: top;
      padding: 0;
    }
    .words-box {
      background: #fafafa;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 6px 8px;
      margin-bottom: 8px;
    }
    .words-label {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #555555;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .words-value {
      font-size: 11px;
      font-weight: 700;
      color: #000000;
      line-height: 1.35;
    }
    .terms-box {
      padding: 4px 0;
    }
    .terms-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #333333;
      margin-bottom: 4px;
    }
    .terms-text {
      font-size: 10px;
      color: #444444;
      line-height: 1.4;
      white-space: pre-line;
      margin: 0;
    }

    /* AMOUNTS TABLE */
    table.amounts-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    table.amounts-table td {
      padding: 4px 8px;
      border-bottom: 1px solid #e0e0e0;
    }
    table.amounts-table tr:last-child td {
      border-bottom: none;
    }
    .amount-label {
      font-weight: 600;
      color: #333333;
      text-align: left;
    }
    .amount-value {
      text-align: right;
      font-weight: 600;
      color: #000000;
      font-family: Consolas, "Courier New", monospace;
    }
    .grand-total-row td {
      background: #f5f5f5;
      border-top: 1.5px solid #1a1a1a !important;
      border-bottom: none !important;
      padding: 7px 8px !important;
    }
    .grand-total-row .amount-label {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      color: #000000;
    }
    .grand-total-row .amount-value {
      font-size: 13.5px;
      font-weight: 800;
      color: #000000;
    }

    /* BANK DETAILS & SIGNATURE (BOTTOM OF FINAL PAGE) */
    .footer-section {
      width: 100%;
      border-top: 1.5px solid #1a1a1a;
      display: table;
      table-layout: fixed;
      margin-top: 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .bank-box {
      display: table-cell;
      width: 58%;
      vertical-align: top;
      padding: 6px 8px;
      border-right: 1.5px solid #1a1a1a;
      font-size: 10px;
    }
    .bank-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #333333;
      border-bottom: 1px dashed #aaaaaa;
      padding-bottom: 2px;
      margin-bottom: 4px;
    }
    .bank-row {
      margin: 2px 0;
      color: #222222;
    }
    .bank-row strong {
      display: inline-block;
      width: 85px;
      color: #000000;
    }
    .signature-box {
      display: table-cell;
      width: 42%;
      vertical-align: bottom;
      text-align: right;
      padding: 8px 10px;
    }
    .sig-for-shop {
      font-size: 10.5px;
      font-weight: 700;
      color: #000000;
      margin-bottom: 45px;
    }
    .sig-line {
      font-size: 10.5px;
      font-weight: 700;
      color: #000000;
      border-top: 1px dashed #555555;
      display: inline-block;
      padding-top: 3px;
      min-width: 140px;
      text-align: center;
    }

    /* SYSTEM FOOTER */
    .system-footer {
      text-align: center;
      font-size: 8.5px;
      color: #777777;
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dotted #ccc;
    }

    @media print {
      body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .quotation-container {
        border: 1.5px solid #000000 !important;
        max-width: 100% !important;
        padding: 8px 10px !important;
      }
    }
  </style>
</head>
<body>
  <div class="quotation-container">
    <!-- 1. BUSINESS HEADER -->
    <header class="shop-header">
      <h1 class="shop-title">${escapeHtml(data.shopName || 'NAFID STORE')}</h1>
      ${data.shopAddress ? `<div class="shop-meta-line">${escapeHtml(data.shopAddress)}</div>` : ''}
      <div class="shop-meta-line">
        ${[
          data.shopPhone ? `<strong>Phone:</strong> ${escapeHtml(data.shopPhone)}` : '',
          data.shopEmail ? `<strong>Email:</strong> ${escapeHtml(data.shopEmail)}` : '',
          data.shopGstin ? `<strong>GSTIN:</strong> ${escapeHtml(data.shopGstin)}` : '',
          data.shopState ? `<strong>State:</strong> ${escapeHtml(data.shopState)}` : '',
        ].filter(Boolean).join(' &nbsp;|&nbsp; ')}
      </div>
      <div>
        <span class="quotation-title-banner">QUOTATION</span>
      </div>
    </header>

    <!-- 2. CUSTOMER AND QUOTATION DETAILS -->
    <div class="details-grid">
      <div class="details-col-left">
        <div class="section-label">Receiver Details / Quotation To</div>
        <div class="customer-name">${escapeHtml(data.customerName || 'Cash Customer')}</div>
        ${data.customerAddress ? `<div class="detail-text">${escapeHtml(data.customerAddress)}</div>` : ''}
        ${data.customerPhone ? `<div class="detail-text"><strong>Phone:</strong> ${escapeHtml(data.customerPhone)}</div>` : ''}
        ${data.customerGstin ? `<div class="detail-text"><strong>GSTIN:</strong> ${escapeHtml(data.customerGstin)}</div>` : ''}
        ${data.customerState ? `<div class="detail-text"><strong>State:</strong> ${escapeHtml(data.customerState)}</div>` : ''}
      </div>

      <div class="details-col-right">
        <div class="section-label">Quotation Information</div>
        <table class="meta-table">
          <tr>
            <td class="meta-label">Quotation No.:</td>
            <td class="meta-value mono">${escapeHtml(data.quotationNumber)}</td>
          </tr>
          <tr>
            <td class="meta-label">Date:</td>
            <td class="meta-value">${escapeHtml(data.date)}</td>
          </tr>
          ${data.validUntil ? `
          <tr>
            <td class="meta-label">Valid Until:</td>
            <td class="meta-value">${escapeHtml(data.validUntil)}</td>
          </tr>` : ''}
          ${isGst ? `
          <tr>
            <td class="meta-label">Reverse Charge:</td>
            <td class="meta-value">${escapeHtml(data.reverseCharge || 'No')}</td>
          </tr>
          <tr>
            <td class="meta-label">Place of Supply:</td>
            <td class="meta-value">${escapeHtml(data.customerState || data.shopState || 'Local')}</td>
          </tr>` : ''}
          ${data.billerName ? `
          <tr>
            <td class="meta-label">Prepared By:</td>
            <td class="meta-value">${escapeHtml(data.billerName)}</td>
          </tr>` : ''}
        </table>
      </div>
    </div>

    <!-- 3. PRODUCT TABLE -->
    <table class="product-table">
      <thead>
        <tr>
          <th style="width: 4%;">#</th>
          <th class="text-left" style="width: ${isGst ? (hasDiscounts ? '26%' : '30%') : (hasDiscounts ? '44%' : '50%')};">Description of Goods</th>
          ${hasHsn ? `<th style="width: 8%;">HSN/SAC</th>` : ''}
          <th style="width: 7%;">Qty</th>
          <th style="width: 6%;">UOM</th>
          <th class="text-right" style="width: 9%;">Unit Price</th>
          ${hasDiscounts ? `<th class="text-right" style="width: 7%;">Disc.</th>` : ''}
          ${isGst ? `
            <th class="text-right" style="width: 9%;">Taxable Val</th>
            ${isInterState ? `
              <th style="width: 5%;">IGST %</th>
              <th class="text-right" style="width: 7%;">IGST Amt</th>
            ` : `
              <th style="width: 5%;">CGST %</th>
              <th class="text-right" style="width: 6%;">CGST Amt</th>
              <th style="width: 5%;">SGST %</th>
              <th class="text-right" style="width: 6%;">SGST Amt</th>
            `}
          ` : ''}
          <th class="text-right" style="width: ${isGst ? '10%' : '14%'};">Total</th>
        </tr>
      </thead>
      <tbody>
        ${processedItems.map(item => `
          <tr>
            <td class="text-center">${item.slNo}</td>
            <td class="text-left">
              <div class="item-name">${escapeHtml(item.name)}</div>
            </td>
            ${hasHsn ? `<td class="text-center">${escapeHtml(item.hsn_code || '-')}</td>` : ''}
            <td class="text-center">${formatNumber(item.quantity)}</td>
            <td class="text-center">${escapeHtml(item.uom)}</td>
            <td class="text-right">${formatCurrency(item.rate)}</td>
            ${hasDiscounts ? `<td class="text-right">${item.discountPercent ? `${item.discountPercent}%` : (item.discountAmount > 0 ? formatCurrency(item.discountAmount) : '-')}</td>` : ''}
            ${isGst ? `
              <td class="text-right">${formatCurrency(item.taxableValue)}</td>
              ${isInterState ? `
                <td class="text-center">${formatNumber(item.igstRate)}%</td>
                <td class="text-right">${formatCurrency(item.igstAmt)}</td>
              ` : `
                <td class="text-center">${formatNumber(item.cgstRate)}%</td>
                <td class="text-right">${formatCurrency(item.cgstAmt)}</td>
                <td class="text-center">${formatNumber(item.sgstRate)}%</td>
                <td class="text-right">${formatCurrency(item.sgstAmt)}</td>
              `}
            ` : ''}
            <td class="text-right font-bold">${formatCurrency(item.lineTotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- 4. TOTALS & SUMMARY SECTION -->
    <div class="summary-section">
      <div class="words-and-terms">
        <div class="words-box">
          <div class="words-label">Amount Chargeable (in words)</div>
          <div class="words-value">${escapeHtml(amountInWords)} Only</div>
        </div>

        <div class="terms-box">
          <div class="terms-title">Terms & Conditions</div>
          <p class="terms-text">${escapeHtml(data.termsAndConditions || '1. Prices are valid for 15 days from the date of quotation.\\n2. Goods delivery as per mutual agreement.\\n3. This is an estimate/quotation and not a tax invoice.')}</p>
        </div>
      </div>

      <div class="amounts-table-cell">
        <table class="amounts-table">
          <tr>
            <td class="amount-label">Subtotal</td>
            <td class="amount-value">${formatCurrency(computedSubtotal)}</td>
          </tr>
          ${computedDiscountTotal > 0 ? `
          <tr>
            <td class="amount-label">Discount Total</td>
            <td class="amount-value" style="color: #c00;">-${formatCurrency(computedDiscountTotal)}</td>
          </tr>` : ''}
          ${isGst ? `
          <tr>
            <td class="amount-label">Taxable Amount</td>
            <td class="amount-value">${formatCurrency(computedTaxableAmount)}</td>
          </tr>
          ${isInterState ? `
          <tr>
            <td class="amount-label">Integrated Tax (IGST)</td>
            <td class="amount-value">${formatCurrency(computedIgstTotal)}</td>
          </tr>` : `
          <tr>
            <td class="amount-label">Central Tax (CGST)</td>
            <td class="amount-value">${formatCurrency(computedCgstTotal)}</td>
          </tr>
          <tr>
            <td class="amount-label">State Tax (SGST)</td>
            <td class="amount-value">${formatCurrency(computedSgstTotal)}</td>
          </tr>`}
          ` : ''}
          ${data.roundOff ? `
          <tr>
            <td class="amount-label">Round Off</td>
            <td class="amount-value">${formatCurrency(data.roundOff)}</td>
          </tr>` : ''}
          <tr class="grand-total-row">
            <td class="amount-label">Grand Total</td>
            <td class="amount-value">${formatCurrency(computedGrandTotal)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- 5. BANK ACCOUNT DETAILS & AUTHORIZED SIGNATORY -->
    <div class="footer-section">
      <div class="bank-box">
        ${hasBankDetails ? `
          <div class="bank-title">Bank Account Details</div>
          ${data.bankName ? `<div class="bank-row"><strong>Bank Name:</strong> ${escapeHtml(data.bankName)}</div>` : ''}
          ${data.bankHolderName ? `<div class="bank-row"><strong>A/C Holder:</strong> ${escapeHtml(data.bankHolderName)}</div>` : ''}
          ${data.bankAccount ? `<div class="bank-row"><strong>Account No.:</strong> ${escapeHtml(data.bankAccount)}</div>` : ''}
          ${data.bankBranch ? `<div class="bank-row"><strong>Branch:</strong> ${escapeHtml(data.bankBranch)}</div>` : ''}
          ${data.bankIfsc ? `<div class="bank-row"><strong>IFSC Code:</strong> ${escapeHtml(data.bankIfsc)}</div>` : ''}
          ${data.upiId ? `<div class="bank-row"><strong>UPI ID:</strong> ${escapeHtml(data.upiId)}</div>` : ''}
        ` : `
          <div class="bank-title">Payment Information</div>
          <div class="detail-text" style="color: #666;">Please contact our store for payment methods and bank transfer details.</div>
        `}
      </div>

      <div class="signature-box">
        <div class="sig-for-shop">For <strong>${escapeHtml(data.shopName || 'NAFID STORE')}</strong></div>
        <div class="sig-line">Authorized Signatory</div>
      </div>
    </div>

    <div class="system-footer">
      This is a computer-generated quotation issued on ${escapeHtml(new Date().toLocaleDateString('en-IN'))}.
    </div>
  </div>
</body>
</html>`;
}
