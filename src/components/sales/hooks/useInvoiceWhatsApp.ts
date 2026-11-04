import type React from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { getSetting, type PrintFormatSettings } from '../../../data/settings';
import { parsePrintFormat } from '../../../utils/print/printFormatHelper';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, type ReceiptData, formatBillDateTime } from '../../../utils/print/receiptGenerator';
import { generateInvoiceHtml } from '../../../utils/print/invoiceHtmlGenerator';
import { formatWhatsAppBillMessage } from '../../../utils/print/whatsappBillHelper';
import { sendConfiguredBill } from '../../../data/whatsappSharing';
import type { SalesInvoiceItemRow, SalesInvoiceRow } from '../salesTypes';

export interface UseInvoiceWhatsAppContext {
  items: SalesInvoiceItemRow[];
  selectedInvoice: SalesInvoiceRow | null;
  setIsSendingWhatsApp: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (text: string, type: "success" | "error") => void;
}

/**
 * Send the selected invoice to the customer on WhatsApp (`handleSendWhatsAppInvoice`).
 */
export function useInvoiceWhatsApp(ctx: UseInvoiceWhatsAppContext) {
  const { items, selectedInvoice, setIsSendingWhatsApp, showToast } = ctx;
  const handleSendWhatsAppInvoice = async () => {
    if (!selectedInvoice || !isDesktopRuntime()) return;
    const custPhone = (selectedInvoice.customer_phone || '').trim();
    if (!custPhone) {
      showToast('Customer does not have a phone number saved on this bill', 'error');
      return;
    }
    if (!hasBridge('whatsappSendInvoice')) {
      showToast('WhatsApp service not available', 'error');
      return;
    }

    setIsSendingWhatsApp(true);
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
      const printFmtRaw = await getSetting<PrintFormatSettings>({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const invoiceType = selectedInvoice.invoice_type as string | undefined;
      const isB2B = Boolean(selectedInvoice.customer_gstin?.trim());
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const isHalfA4 = printFmt.format === 'half-a4';
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
      const taxVal = Number(selectedInvoice.tax_total) || 0;
      const cgst = isInterState ? undefined : taxVal / 2;
      const sgst = isInterState ? undefined : taxVal / 2;
      const igst = isInterState ? taxVal : undefined;

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
        invoiceNumber: selectedInvoice.invoice_number as string,
        date: formatBillDateTime(selectedInvoice.created_at as string),
        billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (selectedInvoice.biller_name || undefined) : undefined,
        items: items.map(item => ({
          name: item.name as string,
          quantity: Number(item.quantity) || 0,
          unit_price: item.unit_price,
          total: item.total,
          originalRate: item.originalRate,
          discountLabel: item.discountLabel,
          brand: item.brand_manufacturer || undefined,
          billing_type: item.billing_type as string | undefined,
          pieces_sold: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
          unit: item.unit as string | undefined,
        })),
        subtotal: selectedInvoice.subtotal,
        tax: selectedInvoice.tax_total,
        cgst,
        sgst,
        igst,
        discount: selectedInvoice.discount_total as number,
        discountType: selectedInvoice.discount_type as 'FIXED' | 'PERCENTAGE' | undefined,
        discountValue: selectedInvoice.discount_value as number | undefined,
        grandTotal: baseGrandTotal,
        scrapDeduction: scrapD > 0 ? scrapD : undefined,
        scrapInvoiceNumber: selectedInvoice.scrap_invoice_number || undefined,
        returnDeduction: returnD > 0 ? returnD : undefined,
        returnInvoiceNumber: selectedInvoice.return_invoice_number || undefined,
        invoiceType,
        receivedAmount: selectedInvoice.received_amount != null ? Number(selectedInvoice.received_amount) : undefined,
        paymentMethod: selectedInvoice.payment_method as string | undefined,
        balanceAmount: Number(selectedInvoice.balance_amount) || 0,
        customerName: selectedInvoice.customer_name || undefined,
        customerPhone: custPhone,
        customerAddress: selectedInvoice.customer_address || undefined,
        customerGstin: selectedInvoice.customer_gstin?.trim() || undefined,
        billSettings,
        isB2B,
      };

      const invoiceStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
      const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as Parameters<typeof generateInvoiceHtml>[1]);

      const waMessage = formatWhatsAppBillMessage({
        shopName: shopNameVal || useAuthStore.getState().shopName || 'Store',
        invoiceNumber: selectedInvoice.invoice_number as string,
        date: formatBillDateTime(selectedInvoice.created_at as string),
        customerName: selectedInvoice.customer_name || undefined,
        customerPhone: custPhone,
        items: items.map(i => ({
          name: i.name as string,
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price) || 0,
          total: Number(i.total) || 0
        })),
        subtotal: Number(selectedInvoice.subtotal) || 0,
        tax: Number(selectedInvoice.tax_total) || 0,
        cgst: Number(cgst) || 0,
        sgst: Number(sgst) || 0,
        igst: Number(igst) || 0,
        discount: Number(selectedInvoice.discount_total) || 0,
        grandTotal: baseGrandTotal,
        receivedAmount: selectedInvoice.received_amount != null ? Number(selectedInvoice.received_amount) : undefined,
        balanceAmount: Number(selectedInvoice.balance_amount) || 0,
        paymentMethod: selectedInvoice.payment_method as string | undefined,
      });

      const res = await sendConfiguredBill(tenantId || 'global', {
        phone: custPhone,
        message: waMessage,
        legacyHtml: invoiceHtml,
        a4Html: generateInvoiceHtml(receiptData, (printFmt.a4Style || 'boxed') as Parameters<typeof generateInvoiceHtml>[1]),
        receiptText: generateReceiptText(receiptData, printFmt.width ? Number(printFmt.width) / 10 : 8, undefined, printFmt.thermalStyle || 'standard'),
        invoiceNumber: selectedInvoice.invoice_number as string,
        receiptWidthMm: Number(printFmt.width) || 80,
      });

      if (res?.success) {
        showToast("Invoice sent via WhatsApp to " + custPhone + "!", 'success');
      } else {
        showToast("WhatsApp Send Failed: " + (res?.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      console.error('WhatsApp send invoice error:', err);
      showToast("WhatsApp error: " + ((err as Error)?.message || 'Failed to send'), 'error');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  return { handleSendWhatsAppInvoice };
}
