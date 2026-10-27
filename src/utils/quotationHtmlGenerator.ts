import { numberToIndianWords } from './receiptGenerator';
import { formatCurrency } from './money';
import { splitTaxAmount } from './checkoutLines';
import type { QuotationPrintData } from './quotationPrintTypes';

export type { QuotationPrintData, QuotationPrintItem } from './quotationPrintTypes';

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

    const taxableVal = (item.taxable_amount != null && Number(item.taxable_amount) > 0)
      ? Number(item.taxable_amount)
      : (rate * qty > 0 ? (rate * qty) : lineTotal);
    const taxRate = Number(item.tax_rate_percent) || 0;
    const halfRate = taxRate / 2;

    const cgstRate = item.cgst_rate != null ? Number(item.cgst_rate) : (isInterState ? 0 : halfRate);
    const taxSplit = splitTaxAmount(Math.round(taxableVal * (taxRate / 100) * 100) / 100);
    const cgstAmt = item.cgst_amount != null ? Number(item.cgst_amount) : (isInterState ? 0 : taxSplit.cgst);

    const sgstRate = item.sgst_rate != null ? Number(item.sgst_rate) : (isInterState ? 0 : halfRate);
    const sgstAmt = item.sgst_amount != null ? Number(item.sgst_amount) : (isInterState ? 0 : taxSplit.sgst);

    const igstRate = item.igst_rate != null ? Number(item.igst_rate) : (isInterState ? taxRate : 0);
    const igstAmt = item.igst_amount != null ? Number(item.igst_amount) : (isInterState ? Math.round(taxableVal * (taxRate / 100) * 100) / 100 : 0);

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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 10mm 12mm 10mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      font-feature-settings: "cv02", "cv03", "cv04", "cv11";
    }
    .quotation-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
      border: 1.5px solid #0f172a;
      padding: 12px 14px;
    }
    /* HEADER */
    .shop-header {
      text-align: center;
      padding-bottom: 7px;
      border-bottom: 1.5px solid #0f172a;
    }
    .shop-title {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 20px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      line-height: 1.2;
      color: #000000;
      margin: 0 0 3px 0;
    }
    .shop-meta-line {
      font-size: 10px;
      font-weight: 500;
      color: #000000;
      margin: 2px 0;
      line-height: 1.35;
    }
    .shop-meta-line strong {
      font-weight: 700;
      color: #000000;
    }
    .quotation-title-banner {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 18px;
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      border: 1.5px solid #0f172a;
      background: #f8fafc;
      color: #0f172a;
    }

    /* DETAILS SECTION */
    .details-grid {
      display: table;
      width: 100%;
      table-layout: fixed;
      border-bottom: 1.5px solid #000000;
      margin-top: 0;
    }
    .details-col-left, .details-col-right {
      display: table-cell;
      vertical-align: top;
      padding: 7px 9px;
    }
    .details-col-left {
      width: 56%;
      border-right: 1.5px solid #000000;
    }
    .details-col-right {
      width: 44%;
    }
    .section-label {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #000000;
      border-bottom: 1px dashed #000000;
      padding-bottom: 3px;
      margin-bottom: 4px;
    }
    .customer-name {
      font-size: 12.5px;
      font-weight: 700;
      color: #000000;
      margin-bottom: 2px;
    }
    .detail-text {
      font-size: 10px;
      color: #000000;
      margin: 2px 0;
      line-height: 1.35;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .meta-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .meta-label {
      font-weight: 600;
      color: #000000;
      width: 44%;
    }
    .meta-value {
      text-align: right;
      color: #000000;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .meta-value.mono {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.4px;
      font-variant-numeric: tabular-nums;
    }

    /* PRODUCT TABLE */
    table.product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
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
      background-color: #f8fafc;
      border: 1px solid #000000;
      border-top: none;
      padding: 6px 4px;
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      text-align: center;
      color: #000000;
    }
    table.product-table td {
      border: 1px solid #000000;
      padding: 5px 4px;
      vertical-align: middle;
      color: #000000;
      line-height: 1.3;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1;
    }
    .text-left { text-align: left !important; }
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .font-bold { font-weight: 700 !important; }
    .item-name {
      font-weight: 600;
      font-size: 10.5px;
      color: #000000;
      word-break: break-word;
      white-space: normal;
    }

    /* TOTALS & SUMMARY */
    .summary-section {
      width: 100%;
      border-top: 1.5px solid #000000;
      display: table;
      table-layout: fixed;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .words-and-terms {
      display: table-cell;
      width: 56%;
      vertical-align: top;
      padding: 8px 10px 8px 4px;
      border-right: 1.5px solid #000000;
    }
    .amounts-table-cell {
      display: table-cell;
      width: 44%;
      vertical-align: top;
      padding: 0;
    }
    .words-box {
      background: #f8fafc;
      border: 1px solid #000000;
      border-radius: 4px;
      padding: 6px 8px;
      margin-bottom: 8px;
    }
    .words-label {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #000000;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .words-value {
      font-size: 10.5px;
      font-weight: 700;
      color: #000000;
      line-height: 1.35;
    }
    .terms-box {
      padding: 4px 0;
    }
    .terms-title {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000000;
      margin-bottom: 3px;
    }
    .terms-text {
      font-size: 9.5px;
      color: #000000;
      line-height: 1.45;
      white-space: pre-line;
      margin: 0;
    }

    /* AMOUNTS TABLE */
    table.amounts-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    table.amounts-table td {
      padding: 4.5px 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    table.amounts-table tr:last-child td {
      border-bottom: none;
    }
    .amount-label {
      font-weight: 600;
      color: #000000;
      text-align: left;
    }
    .amount-value {
      text-align: right;
      font-weight: 600;
      color: #000000;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1;
    }
    .grand-total-row td {
      background: #f1f5f9;
      border-top: 1.5px solid #000000 !important;
      border-bottom: none !important;
      padding: 7px 8px !important;
    }
    .grand-total-row .amount-label {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000000;
    }
    .grand-total-row .amount-value {
      font-size: 13.5px;
      font-weight: 800;
      color: #000000;
      letter-spacing: 0.2px;
      font-variant-numeric: tabular-nums;
    }

    /* BANK DETAILS & SIGNATURE (BOTTOM OF FINAL PAGE) */
    .footer-section {
      width: 100%;
      border-top: 1.5px solid #000000;
      display: table;
      table-layout: fixed;
      margin-top: 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .bank-box {
      display: table-cell;
      width: 56%;
      vertical-align: top;
      padding: 6px 8px;
      border-right: 1.5px solid #000000;
      font-size: 9.5px;
    }
    .bank-title {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000000;
      border-bottom: 1px dashed #000000;
      padding-bottom: 2px;
      margin-bottom: 4px;
    }
    .bank-row {
      margin: 2px 0;
      color: #000000;
    }
    .bank-row strong {
      display: inline-block;
      width: 85px;
      color: #000000;
      font-weight: 700;
    }
    .signature-box {
      display: table-cell;
      width: 44%;
      vertical-align: bottom;
      text-align: right;
      padding: 8px 10px;
    }
    .sig-for-shop {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #000000;
      margin-bottom: 40px;
    }
    .sig-line {
      font-size: 9.5px;
      font-weight: 700;
      color: #000000;
      border-top: 1px dashed #000000;
      display: inline-block;
      padding-top: 4px;
      min-width: 140px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* SYSTEM FOOTER */
    .system-footer {
      text-align: center;
      font-size: 8.5px;
      color: #64748b;
      margin-top: 6px;
      padding-top: 4px;
      border-top: 1px dotted #cbd5e1;
    }

    @media print {
      body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .quotation-container {
        border: 1.5px solid #0f172a !important;
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
