import type * as B from '../billingTypes';
import type React from 'react';
import { hasBridge } from '../../../data/client';
import { getSetting, type PrintFormatSettings } from '../../../data/settings';
import { parsePrintFormat } from '../../../utils/print/printFormatHelper';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, type ReceiptData, formatBillDateTime } from '../../../utils/print/receiptGenerator';
import { listRate } from '../../../utils/pricing/linePricing';
import { useAuthStore } from '../../../store/authStore';
import { generateInvoiceHtml } from '../../../utils/print/invoiceHtmlGenerator';
import { formatWhatsAppBillMessage } from '../../../utils/print/whatsappBillHelper';
import { sendConfiguredBill } from '../../../data/whatsappSharing';
import type { CartItem, InvoiceType } from '../../../store/cartStore';
import type { Tab, PaymentMethod } from '../../../store/tabStore';

export interface UseWhatsAppSendContext {
  activeTab: Tab | undefined;
  customerAddress: string;
  customerGstin: string;
  customerName: string;
  customerPhone: string;
  discount: number;
  displayGrandTotal: number;
  invoiceType: InvoiceType;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  receivedAmount: number;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setInfoToast: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSendingWhatsApp: React.Dispatch<React.SetStateAction<boolean>>;
  shopAddress: string;
  shopGstin: string;
  shopName: string | null;
  shopNameState: string;
  shopPhone: string;
  subtotal: number;
  tenantId: string | null;
  totalTax: number;
}

/**
 * Send the active bill to the customer on WhatsApp (`handleWhatsAppSendActiveBill`): formats the bill message and
 * hands it to the WhatsApp channel. Saves nothing.
 */
export function useWhatsAppSend(ctx: UseWhatsAppSendContext) {
  const { activeTab, customerAddress, customerGstin, customerName, customerPhone, discount, displayGrandTotal, invoiceType, items, paymentMethod, receivedAmount, setHardwareError, setInfoToast, setIsSendingWhatsApp, shopAddress, shopGstin, shopName, shopNameState, shopPhone, subtotal, tenantId, totalTax } = ctx;
  const handleWhatsAppSendActiveBill = async () => {
    if (items.length === 0) {
      setHardwareError('No items in the active bill to send');
      setTimeout(() => setHardwareError(null), 3500);
      return;
    }
    const custPhone = (customerPhone || activeTab?.customerPhone || '').trim();
    if (!custPhone) {
      setHardwareError('Please enter Customer Mobile Number to send via WhatsApp');
      setTimeout(() => setHardwareError(null), 4000);
      return;
    }
    if (!hasBridge('whatsappSendInvoice')) {
      setHardwareError('WhatsApp service not available in this environment');
      setTimeout(() => setHardwareError(null), 3500);
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const printFmtRaw = await getSetting<PrintFormatSettings>({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };

      const isB2B = Boolean(customerGstin?.trim()) || Boolean(activeTab?.isB2B);
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const isHalfA4 = printFmt.format === 'half-a4';
      const invStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');

      const billNo = activeTab?.reservedInvoiceNumber || activeTab?.title || 'ACTIVE';
      const receiptItems = items.map(item => {
        const rate = listRate(item);
        const qty = Number(item.quantity) || 0;
        const total = rate * qty;
        return {
          name: item.name,
          quantity: qty,
          unit_price: rate,
          total,
          brand: item.brand_manufacturer || undefined,
          billing_type: item.billing_type,
          unit: item.unit || item.uom,
        };
      });

      const activeReceiptData: ReceiptData = {
        shopName: shopNameState || shopName || 'My Shop',
        shopGstin: (isGstOrB2B || billSettings.showShopGstin !== false) ? (shopGstin || undefined) : undefined,
        shopAddress: (isGstOrB2B || billSettings.showShopAddress !== false) ? (shopAddress || undefined) : undefined,
        shopPhone: (isGstOrB2B || billSettings.showPhone !== false) ? (shopPhone || undefined) : undefined,
        invoiceNumber: billNo,
        date: formatBillDateTime(new Date()),
        billerName: (isGstOrB2B || billSettings.showBillerName !== false) ? (useAuthStore.getState().userName || undefined) : undefined,
        items: receiptItems,
        subtotal,
        tax: totalTax,
        discount,
        grandTotal: displayGrandTotal,
        paymentMethod,
        customerName: customerName || undefined,
        customerPhone: custPhone,
        customerAddress: customerAddress || undefined,
        customerGstin: customerGstin?.trim() || undefined,
        billSettings,
        isB2B,
      };

      const fullHtml = generateInvoiceHtml(activeReceiptData, invStyle as B.InvoiceStyle);
      const waMessage = formatWhatsAppBillMessage({
        shopName: shopNameState || shopName || 'Store',
        invoiceNumber: billNo,
        date: new Date().toLocaleDateString('en-IN'),
        customerName: customerName || undefined,
        customerPhone: custPhone,
        items: receiptItems.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: Number(i.unit_price) || 0,
          total: Number(i.total) || 0
        })),
        grandTotal: displayGrandTotal,
        receivedAmount: paymentMethod === 'CASH' ? Number(receivedAmount || displayGrandTotal) : displayGrandTotal,
        balanceAmount: paymentMethod === 'CREDIT' ? displayGrandTotal : 0,
        paymentMethod,
      });

      const sendRes = await sendConfiguredBill(tenantId || 'global', {
        phone: custPhone,
        message: waMessage,
        legacyHtml: fullHtml,
        a4Html: generateInvoiceHtml(activeReceiptData, (printFmt.a4Style || 'boxed') as B.InvoiceStyle),
        receiptText: generateReceiptText(activeReceiptData, printFmt.width ? Number(printFmt.width) / 10 : 8, undefined, printFmt.thermalStyle || 'standard'),
        receiptWidthMm: Number(printFmt.width) || 80, invoiceNumber: billNo,
      });

      if (sendRes?.success) {
        setInfoToast("Bill sent to WhatsApp (" + custPhone + ") successfully!");
        setTimeout(() => setInfoToast(null), 4000);
      } else {
        setHardwareError("WhatsApp Send Failed: " + (sendRes?.error || 'Unknown error'));
        setTimeout(() => setHardwareError(null), 5000);
      }
    } catch (err) {
      console.error('[WhatsApp Manual Send Error]:', err);
      setHardwareError("WhatsApp Error: " + ((err as Error)?.message || 'Could not send'));
      setTimeout(() => setHardwareError(null), 5000);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  return { handleWhatsAppSendActiveBill };
}
