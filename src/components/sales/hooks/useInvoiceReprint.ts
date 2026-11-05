import type { DisplayComboItem } from '../invoiceDisplayTypes';
import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { getSetting, type ReceiptPrinterConfig, type PrintFormatSettings } from '../../../data/settings';
import { parsePrintFormat, formatPrinterError } from '../../../utils/print/printFormatHelper';
import { DEFAULT_BILL_SETTINGS, type ReceiptData, formatBillDateTime, generateReceiptText } from '../../../utils/print/receiptGenerator';
import { combosApi } from '../../../data/combos';
import { getInvoiceTaxComponents } from '../../../utils/pricing/salesHistoryTax';
import { generateInvoiceHtml } from '../../../utils/print/invoiceHtmlGenerator';
import { printingApi } from '../../../data/printing';
import type { SalesInvoiceItemRow, SalesInvoiceRow } from '../salesTypes';

export interface UseInvoiceReprintContext {
  items: SalesInvoiceItemRow[];
  selectedInvoice: SalesInvoiceRow | null;
  setReprintSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (text: string, type: "success" | "error") => void;
}

/**
 * Reprint the selected invoice (`handleReprint`) on the configured printer: A4 HTML or thermal receipt.
 */
export function useInvoiceReprint(ctx: UseInvoiceReprintContext) {
  const { items, selectedInvoice, setReprintSuccess, showToast } = ctx;
  /* ── Reprint handler ── */
  const handleReprint = async () => {
    if (!selectedInvoice || !isDesktopRuntime()) return;
    try {
      const { tenantId } = useAuthStore.getState();
      const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin, shopStateVal, shopEmailVal, shopWebsiteVal] = await Promise.all([
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_name' }),
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_address' }),
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'upi_id' }),
        getSetting({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_state' }),
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_email' }),
        getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_website' }),
      ]);
      const receiptConfig = await getSetting<ReceiptPrinterConfig>({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 8.0;
      const printFmtRaw = await getSetting<PrintFormatSettings>({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const invoiceType = selectedInvoice.invoice_type as string | undefined;
      const isB2B = Boolean(selectedInvoice.customer_gstin?.trim());
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const isHalfA4 = printFmt.format === 'half-a4';
      const isA4 = printFmt.format === 'a4';
      const useA4 = isGstOrB2B || isA4 || isHalfA4;
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };
      const scrapD = Number(selectedInvoice.scrap_deduction) || 0;
      const returnD = Number(selectedInvoice.return_deduction) || 0;
      
      let baseGrandTotal = Number(selectedInvoice.grand_total);
      if (invoiceType !== 'SCRAP') {
        const sub = Number(selectedInvoice.subtotal) || 0;
        const tax = Number(selectedInvoice.tax_total) || 0;
        const disc = Number(selectedInvoice.discount_total) || 0;
        const ptsDisc = Number(selectedInvoice.points_redeemed_discount) || 0;
        baseGrandTotal = Math.max(0, sub + tax - disc - ptsDisc);
      }

      const isInterState = shopStateVal && selectedInvoice.customer_state && (shopStateVal !== selectedInvoice.customer_state);
      const { cgst, sgst, igst } = getInvoiceTaxComponents(selectedInvoice, items, Boolean(isInterState));

      // Fetch combo offers for fallback matching on historical bill reprints
      const allCombos = await combosApi.getComboOffers({ tenant_id: tenantId || 'global' });
      const combosList = Array.isArray(allCombos) ? allCombos : [];

      const receiptData: ReceiptData = {
        shopName: (isGstOrB2B || billSettings.showShopName !== false) ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: (isGstOrB2B || billSettings.showShopGstin !== false) ? (shopGstin || undefined) : undefined,
        shopState: (isGstOrB2B || billSettings.showShopState !== false) ? (shopStateVal || undefined) : undefined,
        shopAddress: (isGstOrB2B || billSettings.showShopAddress !== false) ? (shopAddr || undefined) : undefined,
        shopPhone: (isGstOrB2B || billSettings.showPhone !== false) ? (shopPh || undefined) : undefined,
        shopEmail: shopEmailVal || undefined,
        shopWebsite: shopWebsiteVal || undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        showPriceOverrideMrp: printFmt?.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
        invoiceNumber: selectedInvoice.invoice_number as string,
        date: formatBillDateTime(selectedInvoice.created_at as string),
        billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (selectedInvoice.biller_name || undefined) : undefined,
        items: items.map(item => {
          let comboItemsParsed: DisplayComboItem[] | undefined = undefined;
          if (item.combo_details) {
            try {
              const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
              if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
            } catch { /* ignore */ }
          }
          const iName = String(item?.name || '').toLowerCase().trim();
          const matchedCombo = combosList.find((c) => {
            const cName = String(c?.name || '').toLowerCase().trim();
            return (item?.combo_id && c?.combo_id === item.combo_id) ||
              (cName && iName && cName === iName) ||
              (item?.product_id && c?.combo_id === item.product_id);
          });
          if (!comboItemsParsed && matchedCombo && matchedCombo.items) {
            comboItemsParsed = matchedCombo.items;
          }
          const isComboItem = Boolean(item.combo_id || matchedCombo || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));
          const itemCgstR = Number(item.cgst_rate) || 0;
          const itemSgstR = Number(item.sgst_rate) || 0;
          const itemIgstR = Number(item.igst_rate) || 0;
          const rawRate = Number(item.tax_rate) || (itemCgstR + itemSgstR + itemIgstR);
          let calcRate = rawRate;
          const iTax = Number(item.tax_amount) || 0;
          if (!calcRate || calcRate <= 0) {
            const baseVal = (Number(item.unit_price) * Number(item.quantity)) || (Number(item.total) - iTax);
            if (baseVal > 0 && iTax > 0) {
              calcRate = Math.round((iTax / baseVal) * 100 * 10) / 10;
            }
          }
          const itemTaxPct = calcRate > 0 ? calcRate : 0;
          const hsnVal = item.hsn_sac_code || item.hsn_code || item.hsn || '';

          return {
            name: item.name as string,
            quantity: Number(item.quantity) || 0,
            unit_price: item.unit_price,
            total: item.total,
            originalRate: item.originalRate,
            discountLabel: item.discountLabel,
            brand: item.brand_manufacturer || undefined,
            billing_type: item.billing_type as string | undefined,
            pieces_sold: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
            pieces_override: item.pieces_override != null ? Number(item.pieces_override) : undefined,
            pieces_per_kg: item.pieces_per_kg,
            unit: item.unit as string | undefined,
            hsn: hsnVal || undefined,
            hsn_code: hsnVal || undefined,
            hsn_sac_code: hsnVal || undefined,
            tax_rate_percent: itemTaxPct || undefined,
            gst_percent: itemTaxPct || undefined,
            cgst_rate: itemCgstR || (isInterState ? 0 : itemTaxPct / 2) || undefined,
            sgst_rate: itemSgstR || (isInterState ? 0 : itemTaxPct / 2) || undefined,
            igst_rate: itemIgstR || (isInterState ? itemTaxPct : 0) || undefined,
            cgst_amount: Number(item.cgst_amount) || (isInterState ? 0 : iTax / 2) || undefined,
            sgst_amount: Number(item.sgst_amount) || (isInterState ? 0 : iTax / 2) || undefined,
            igst_amount: Number(item.igst_amount) || (isInterState ? iTax : 0) || undefined,
            isCombo: isComboItem,
            combo_items: comboItemsParsed,
          };
        }),
        subtotal: selectedInvoice.subtotal,
        tax: selectedInvoice.tax_total,
        cgst: cgst,
        sgst: sgst,
        igst: igst,
        discount: selectedInvoice.discount_total as number,
        discountType: selectedInvoice.discount_type as 'FIXED' | 'PERCENTAGE' | undefined,
        discountValue: selectedInvoice.discount_value as number | undefined,
        grandTotal: baseGrandTotal,
        scrapDeduction: scrapD > 0 ? scrapD : undefined,
        scrapInvoiceNumber: selectedInvoice.scrap_invoice_number || undefined,
        returnDeduction: returnD > 0 ? returnD : undefined,
        returnInvoiceNumber: selectedInvoice.return_invoice_number || undefined,
        isReprint: true,
        invoiceType,
        receivedAmount: selectedInvoice.received_amount != null ? Number(selectedInvoice.received_amount) : undefined,
        paymentMethod: selectedInvoice.payment_method as string | undefined,
        balanceAmount: (() => {
          if (selectedInvoice.balance_amount == null) return undefined;
          const rawBal = Number(selectedInvoice.balance_amount);
          const pmUpper = (selectedInvoice.payment_method || '').toUpperCase();
          if (pmUpper !== 'CREDIT' && pmUpper !== 'SPLIT' && rawBal < 0) return 0;
          return rawBal;
        })(),
        customerName: (isGstOrB2B || billSettings.showCustomerName !== false) ? (selectedInvoice.customer_name || undefined) : undefined,
        customerPhone: (isGstOrB2B || billSettings.showCustomerPhone !== false) ? (selectedInvoice.customer_phone || undefined) : undefined,
        customerAddress: (isGstOrB2B || billSettings.showCustomerAddress !== false) ? (selectedInvoice.customer_address || undefined) : undefined,
        customerGstin: selectedInvoice.customer_gstin?.trim() || undefined,
        billSettings,
        isB2B,
        a5Orientation: printFmt.a5Orientation || 'horizontal',
        customerState: (isGstOrB2B || billSettings.showCustomerState !== false) ? (selectedInvoice.customer_state || undefined) : undefined,
        description: selectedInvoice.description || selectedInvoice.notes || undefined,
        notes: selectedInvoice.notes || selectedInvoice.description || undefined,
      };
      if (useA4) {
        const invoiceStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
        const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as Parameters<typeof generateInvoiceHtml>[1]);
        const printResult = await printingApi.printA4Html(tenantId || 'global', invoiceHtml);
        if (!printResult.success) {
          if ((printResult as { useDefaultDialog?: boolean }).useDefaultDialog) {
            const pw = window.open('', '_blank');
            if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
          } else {
            showToast(formatPrinterError(printResult.error), 'error');
            return;
          }
        }
      } else {
        const thermalWidth = printFmt.width ? Number(printFmt.width) / 10 : receiptWidthCm;
        const thermalStyle = printFmt.thermalStyle || (printFmt.format === 'thermal' ? printFmt.style : undefined) || 'standard';
        const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
        const printResult = await printingApi.printReceipt(tenantId || 'global', receiptText);
        if ((printResult as { skipped?: boolean })?.skipped) {
          showToast(formatPrinterError('No printer configured'), 'error');
          return;
        } else if (printResult && !printResult.success) {
          showToast(formatPrinterError(printResult.error), 'error');
          return;
        }
      }
      setReprintSuccess(true);
    } catch (err) {
      console.error('Failed to reprint', err);
    }
  };

  return { handleReprint };
}
