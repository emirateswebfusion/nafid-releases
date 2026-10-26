import type React from 'react';
import { parsePrintFormat } from '../../../utils/printFormatHelper';
import { DEFAULT_BILL_SETTINGS, type ReceiptData, formatBillDateTime } from '../../../utils/receiptGenerator';
import { type ComboOffer, type InvoiceRecord, type InvoiceItemRow, type ComboItemLine, type InvoiceStyle } from '../customerTypes';
import { settingsApi } from '../../../data/settings';
import { combosApi } from '../../../data/combos';
import { hasBridge } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { useAuthStore } from '../../../store/authStore';
import { formatDateTime } from '../customerFormat';
import { generateInvoiceHtml } from '../../../utils/invoiceHtmlGenerator';
import { printingApi } from '../../../data/printing';
import type { Customer } from '../customerTypes';

export interface UseCustomerInvoiceExportsContext {
  billFilterEnd: string;
  billFilterStart: string;
  filteredInvoices: InvoiceRecord[];
  selectedCustomer: Customer | null;
  setExportingFilteredInvoices: React.Dispatch<React.SetStateAction<boolean>>;
  setExportingPdf: React.Dispatch<React.SetStateAction<boolean>>;
  setInvoiceBusyId: React.Dispatch<React.SetStateAction<string | null>>;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
}

/**
 * Customer purchases exports: one invoice as CSV, the filtered invoices as CSV or PDF, built with the shop's bill
 * settings (`loadBillConfig`, `buildInvoiceData`).
 */
export function useCustomerInvoiceExports(ctx: UseCustomerInvoiceExportsContext) {
  const { billFilterEnd, billFilterStart, filteredInvoices, selectedCustomer, setExportingFilteredInvoices, setExportingPdf, setInvoiceBusyId, showStatus, tenantId } = ctx;
  type BillConfig = {
    shopNameVal: string | null | undefined; shopAddr: string | null | undefined;
    shopPh: string | null | undefined; shopGstin: string | null | undefined;
    shopStateVal: string | null | undefined; upiVal: string | null | undefined;
    showQr: unknown; printFmt: ReturnType<typeof parsePrintFormat>;
    billSettings: typeof DEFAULT_BILL_SETTINGS; receiptWidthCm: number;
    shopEmailVal: string | null | undefined; shopWebsiteVal: string | null | undefined;
    combos: ComboOffer[];
  };

  const loadBillConfig = async (): Promise<BillConfig> => {
    const tId = tenantId || 'global';
    const [shopNameVal, shopAddr, shopPh, shopGstin, shopStateVal, upiVal, showQr, printFmtRaw, receiptConfig, shopEmailVal, shopWebsiteVal, combosRaw] = await Promise.all([
      settingsApi.get({ tenant_id: tId, key: 'shop_name' }),
      settingsApi.get({ tenant_id: tId, key: 'shop_address' }),
      settingsApi.get({ tenant_id: tId, key: 'shop_phone' }),
      settingsApi.get({ tenant_id: tId, key: 'shop_gstin' }),
      settingsApi.get({ tenant_id: tId, key: 'shop_state' }),
      settingsApi.get({ tenant_id: tId, key: 'upi_id' }),
      settingsApi.get({ tenant_id: tId, key: 'show_upi_qr' }),
      settingsApi.get({ tenant_id: tId, key: 'print_format' }),
      settingsApi.get({ tenant_id: tId, key: 'receipt_printer_config' }),
      settingsApi.get({ tenant_id: tId, key: 'shop_email' }),
      settingsApi.get({ tenant_id: tId, key: 'shop_website' }),
      combosApi.getComboOffers({ tenant_id: tId }),
    ]);
    const printFmt = parsePrintFormat(printFmtRaw);
    const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };
    const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
    const combos: ComboOffer[] = Array.isArray(combosRaw) ? combosRaw : [];
    return { shopNameVal, shopAddr, shopPh, shopGstin, shopStateVal, upiVal, showQr, printFmt, billSettings, receiptWidthCm, shopEmailVal, shopWebsiteVal, combos };
  };

  const buildInvoiceData = async (inv: InvoiceRecord, cfg: BillConfig) => {
    let items: InvoiceItemRow[];
    try {
      const data = hasBridge('dbGetInvoiceItems') ? await invoicesApi.getInvoiceItems(inv.invoice_id) : [];
      items = Array.isArray(data) ? data : [];
    } catch {
      items = [];
    }

    const { printFmt, billSettings } = cfg;
    const isB2B = inv.invoice_type === 'GST' && !!(inv.customer_gstin && String(inv.customer_gstin).trim());
    const isGstOrB2B = inv.invoice_type === 'GST' || isB2B;
    const scrapD = Number(inv.scrap_deduction) || 0;
    const returnD = Number(inv.return_deduction) || 0;
    const isInterState = !!(cfg.shopStateVal && inv.customer_state && cfg.shopStateVal !== inv.customer_state);
    const taxVal = Number(inv.tax_total) || 0;
    // Stored grand_total is already net of scrap/return deductions, but the generators show
    // "Net Payable = grandTotal - deductions", so pass the pre-deduction base (same as
    // SalesHistory's reprint) — otherwise deductions would be subtracted twice.
    let baseGrandTotal = Number(inv.grand_total) || 0;
    if (inv.invoice_type !== 'SCRAP') {
      baseGrandTotal = Math.max(0, (Number(inv.subtotal) || 0) + taxVal - (Number(inv.discount_total) || 0) - (Number(inv.points_redeemed_discount) || 0));
    }

    const receiptData: ReceiptData = {
      shopName: (isGstOrB2B || billSettings.showShopName !== false) ? (cfg.shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
      shopGstin: (isGstOrB2B || billSettings.showShopGstin !== false) ? (cfg.shopGstin || undefined) : undefined,
      shopState: (isGstOrB2B || billSettings.showShopState !== false) ? (cfg.shopStateVal || undefined) : undefined,
      shopAddress: (isGstOrB2B || billSettings.showShopAddress !== false) ? (cfg.shopAddr || undefined) : undefined,
      shopPhone: (isGstOrB2B || billSettings.showPhone !== false) ? (cfg.shopPh || undefined) : undefined,
      shopEmail: cfg.shopEmailVal || undefined,
      shopWebsite: cfg.shopWebsiteVal || undefined,
      upiId: cfg.upiVal || undefined,
      showUpiQr: cfg.showQr !== null && cfg.showQr !== undefined ? Boolean(cfg.showQr) : true,
      showProductOffers: printFmt.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
      showPriceOverrideMrp: printFmt.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
      invoiceNumber: inv.invoice_number as string,
      invoiceType: inv.invoice_type as string | undefined,
      date: formatBillDateTime(inv.created_at as string),
      billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (inv.biller_name || useAuthStore.getState().userName || undefined) : undefined,
      items: items.map(item => {
        let comboItemsParsed: ComboItemLine[] | undefined;
        if (item.combo_details) {
          try {
            const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
            if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
          } catch { /* corrupted combo_details — render as a normal line */ }
        }
        const matchedCombo = cfg.combos.find(c =>
          (item.combo_id && c.combo_id === item.combo_id) ||
          (item.name && c.name && c.name.toLowerCase().trim() === item.name.toLowerCase().trim()) ||
          (item.product_id && c.combo_id === item.product_id)
        );
        if (!comboItemsParsed && matchedCombo?.items) comboItemsParsed = matchedCombo.items;
        const isComboItem = Boolean(item.combo_id || matchedCombo || (comboItemsParsed && comboItemsParsed.length > 0));
        return {
          name: item.name || '',
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          total: Number(item.total) || 0,
          billing_type: item.billing_type,
          pieces_sold: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
          pieces_override: item.pieces_override != null ? Number(item.pieces_override) : undefined,
          unit: item.unit || item.uom,
          brand: item.brand_manufacturer || undefined,
          isCombo: isComboItem,
          combo_items: comboItemsParsed,
        };
      }),
      subtotal: Number(inv.subtotal) || 0,
      tax: taxVal,
      cgst: isInterState ? undefined : taxVal / 2,
      sgst: isInterState ? undefined : taxVal / 2,
      igst: isInterState ? taxVal : undefined,
      discount: Number(inv.discount_total) || 0,
      discountType: inv.discount_type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED',
      discountValue: Number(inv.discount_value) || 0,
      grandTotal: baseGrandTotal,
      receivedAmount: inv.received_amount != null ? Number(inv.received_amount) : undefined,
      balanceAmount: (() => {
        if (inv.balance_amount == null) return undefined;
        const rawBal = Number(inv.balance_amount);
        const pmUpper = (inv.payment_method || '').toUpperCase();
        if (pmUpper !== 'CREDIT' && pmUpper !== 'SPLIT' && rawBal < 0) return 0;
        return rawBal;
      })(),
      paymentMethod: inv.payment_method as string | undefined,
      isReprint: true,
      customerName: (isGstOrB2B || billSettings.showCustomerName !== false) ? (inv.customer_name || undefined) : undefined,
      customerPhone: (isGstOrB2B || billSettings.showCustomerPhone !== false) ? (inv.customer_phone || undefined) : undefined,
      customerAddress: (isGstOrB2B || billSettings.showCustomerAddress !== false) ? (inv.customer_address || undefined) : undefined,
      customerGstin: inv.customer_gstin ? String(inv.customer_gstin).trim() || undefined : undefined,
      customerState: (isGstOrB2B || billSettings.showCustomerState !== false) ? (inv.customer_state || undefined) : undefined,
      scrapDeduction: scrapD > 0 ? scrapD : undefined,
      scrapInvoiceNumber: inv.scrap_invoice_number || undefined,
      returnDeduction: returnD > 0 ? returnD : undefined,
      returnInvoiceNumber: inv.return_invoice_number || undefined,
      description: inv.description || inv.notes || undefined,
      notes: inv.notes || inv.description || undefined,
      billSettings,
      isB2B,
      a5Orientation: printFmt.a5Orientation || 'horizontal',
    };

    const isHalfA4 = printFmt.format === 'half-a4';
    const invoiceStyle = (!isGstOrB2B && isHalfA4)
      ? 'half-a4'
      : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');

    return { receiptData, isGstOrB2B, invoiceStyle: invoiceStyle as InvoiceStyle };
  };

  const handleDownloadInvoiceCsv = async (inv: InvoiceRecord) => {
    setInvoiceBusyId(inv.invoice_id);
    try {
      const escape = (val: unknown) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      const typeLabel = (inv: InvoiceRecord) => {
        if (inv.invoice_type === 'GST' && inv.customer_gstin) return 'B2B';
        if (inv.invoice_type === 'GST') return 'B2C';
        if (inv.invoice_type === 'BILL_OF_SUPPLY') return 'Bill of Supply';
        if (inv.invoice_type === 'ESTIMATE') return 'Estimate';
        if (inv.invoice_type === 'SCRAP') return 'Scrap';
        return inv.invoice_type || '';
      };
      const headers = [
        'Invoice No', 'Date & Time', 'Type', 'Payment Method',
        'Subtotal (₹)', 'Tax (₹)', 'Discount (₹)', 'Grand Total (₹)',
        'Received (₹)', 'Balance (₹)', 'Points Earned', 'Points Redeemed',
        'Biller', 'Description / Remarks',
      ];
      const row = [
        escape(inv.invoice_number),
        escape(formatDateTime(inv.created_at)),
        escape(typeLabel(inv)),
        escape(inv.payment_method || ''),
        escape((inv.subtotal || 0).toFixed(2)),
        escape((inv.tax_total || 0).toFixed(2)),
        escape((inv.discount_total || 0).toFixed(2)),
        escape((inv.grand_total || 0).toFixed(2)),
        escape((inv.received_amount || 0).toFixed(2)),
        escape((inv.balance_amount || 0).toFixed(2)),
        escape(inv.points_earned || 0),
        escape(inv.points_redeemed || 0),
        escape(inv.biller_name || useAuthStore.getState().userName || ''),
        escape(inv.description || inv.notes || ''),
      ];
      const csvContent = [headers.join(','), row.join(',')].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = String(inv.invoice_number).replace(/[^a-zA-Z0-9._-]+/g, '-');
      link.download = `invoice-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showStatus(`Downloaded invoice ${inv.invoice_number} as CSV`, 'success');
    } catch (err) {
      console.error('Invoice CSV download failed:', err);
      showStatus('Download failed', 'error');
    } finally { setInvoiceBusyId(null); }
  };

  const handleDownloadFilteredInvoicesCsv = async () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      showStatus('No bills to export in current filter', 'error');
      return;
    }
    setExportingFilteredInvoices(true);
    try {
      const escape = (val: unknown) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      const typeLabel = (inv: InvoiceRecord) => {
        if (inv.invoice_type === 'GST' && inv.customer_gstin) return 'B2B';
        if (inv.invoice_type === 'GST') return 'B2C';
        if (inv.invoice_type === 'BILL_OF_SUPPLY') return 'Bill of Supply';
        if (inv.invoice_type === 'ESTIMATE') return 'Estimate';
        if (inv.invoice_type === 'SCRAP') return 'Scrap';
        return inv.invoice_type || '';
      };
      const headers = [
        'Invoice No', 'Date & Time', 'Customer Name', 'Customer Phone', 'Type', 'Payment Method',
        'Subtotal (₹)', 'Tax (₹)', 'Discount (₹)', 'Grand Total (₹)',
        'Received (₹)', 'Balance (₹)', 'Points Earned', 'Points Redeemed',
        'Biller', 'Description / Remarks',
      ];
      const rows = filteredInvoices.map(inv => [
        escape(inv.invoice_number),
        escape(formatDateTime(inv.created_at)),
        escape(selectedCustomer?.name || inv.customer_name || ''),
        escape(selectedCustomer?.phone || inv.customer_phone || ''),
        escape(typeLabel(inv)),
        escape(inv.payment_method || ''),
        escape((inv.subtotal || 0).toFixed(2)),
        escape((inv.tax_total || 0).toFixed(2)),
        escape((inv.discount_total || 0).toFixed(2)),
        escape((inv.grand_total || 0).toFixed(2)),
        escape((inv.received_amount || 0).toFixed(2)),
        escape((inv.balance_amount || 0).toFixed(2)),
        escape(inv.points_earned || 0),
        escape(inv.points_redeemed || 0),
        escape(inv.biller_name || useAuthStore.getState().userName || ''),
        escape(inv.description || inv.notes || ''),
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeCustomer = (selectedCustomer?.name || 'customer').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const rangeLabel = billFilterStart || billFilterEnd ? `${billFilterStart || 'start'}_to_${billFilterEnd || 'end'}` : 'all_dates';
      link.download = `customer_bills_${safeCustomer}_${rangeLabel}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showStatus(`Exported ${filteredInvoices.length} bill(s) as CSV`, 'success');
    } catch (err) {
      console.error('Filtered bills CSV export failed:', err);
      showStatus('Export failed', 'error');
    } finally {
      setExportingFilteredInvoices(false);
    }
  };

  const handleDownloadFilteredInvoicesPdf = async () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      showStatus('No bills to export in current filter', 'error');
      return;
    }
    setExportingPdf(true);
    try {
      const cfg = await loadBillConfig();
      const billBodies: string[] = [];

      for (const inv of filteredInvoices) {
        const { receiptData, invoiceStyle } = await buildInvoiceData(inv, cfg);
        const singleHtml = generateInvoiceHtml(receiptData, invoiceStyle);

        // Extract content inside <body>...</body> if present, else use full HTML
        const bodyMatch = singleHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : singleHtml;
        billBodies.push(bodyContent);
      }

      const safeCustomerName = (selectedCustomer?.name || 'Customer').replace(/[^a-zA-Z0-9._-]+/g, '_');
      const docTitle = `Bills_${safeCustomerName}_${billFilterStart || 'start'}_to_${billFilterEnd || 'end'}`;

      const combinedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 8mm;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bill-page-break {
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        clear: both;
      }
      .bill-page-break:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .bill-page-break {
      page-break-after: always;
      break-after: page;
      padding-bottom: 20px;
    }
    .bill-page-break:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  </style>
</head>
<body>
  ${billBodies.map((body, idx) => `<div class="bill-page-break" id="invoice-page-${idx + 1}">${body}</div>`).join('\n')}
</body>
</html>`;

      if (hasBridge('printA4Html')) {
        const res = await printingApi.printA4Html(tenantId || 'global', combinedHtml);
        if (!res?.success && (res as { useDefaultDialog?: boolean })?.useDefaultDialog) {
          const pw = window.open('', '_blank', 'width=900,height=700');
          if (pw) {
            pw.document.write(combinedHtml);
            pw.document.close();
            setTimeout(() => pw.print(), 500);
          }
        }
      } else {
        const pw = window.open('', '_blank', 'width=900,height=700');
        if (pw) {
          pw.document.write(combinedHtml);
          pw.document.close();
          setTimeout(() => pw.print(), 500);
        }
      }

      showStatus(`Generated PDF for ${filteredInvoices.length} bill(s) (1 per page)`, 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showStatus('Failed to generate PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  return { handleDownloadInvoiceCsv, handleDownloadFilteredInvoicesCsv, handleDownloadFilteredInvoicesPdf };
}
