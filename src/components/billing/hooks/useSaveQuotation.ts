import type * as B from '../billingTypes';
import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { v4 as uuidv4 } from 'uuid';
import { quotationsApi } from '../../../data/quotations';
import { buildQuotationLines } from '../../../utils/checkoutLines';
import { type QuotationPrintData, generateQuotationHtml } from '../../../utils/quotationHtmlGenerator';
import { getStoreTimezone } from '../../../utils/timezoneHelper';
import { printingApi } from '../../../data/printing';
import { displayInvoiceNumber } from '../../../utils/invoiceNumberHelper';
import type { CartItem, InvoiceType } from '../../../store/cartStore';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import type { Tab } from '../../../store/tabStore';

export interface UseSaveQuotationContext {
  bankAccountState: string;
  bankBranchState: string;
  bankIfscState: string;
  bankNameState: string;
  clearCart: () => void;
  customerAddress: string;
  customerGstin: string;
  customerName: string;
  customerPhone: string;
  customerState: string;
  editingQuotationId: string | null;
  editingQuotationNumber: string | null;
  enableThreeInvoiceSeries: boolean;
  getActiveTab: () => Tab | undefined;
  invoiceType: InvoiceType;
  isCashSettlementEnabled: boolean;
  items: CartItem[];
  quotationGstEnabledSetting: boolean;
  quotationTerms: string;
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveQuotationNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  setEditingQuotation: (quotationId: string | null, quotationNumber: string | null) => void;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setQuotationSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setQuotationSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  setQuotationTerms: React.Dispatch<React.SetStateAction<string>>;
  shopAddress: string;
  shopEmail: string;
  shopGstin: string;
  shopName: string | null;
  shopNameState: string;
  shopPhone: string;
  shopState: string;
  shopWebsite: string;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
  uiConfig: BillingUIConfig;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
  upiId: string;
  userName: string | null;
}

/**
 * Save (or update, when editing) the cart as a quotation and optionally print it on A4 (`handleSaveQuotation`).
 */
export function useSaveQuotation(ctx: UseSaveQuotationContext) {
  const { bankAccountState, bankBranchState, bankIfscState, bankNameState, clearCart, customerAddress, customerGstin, customerName, customerPhone, customerState, editingQuotationId, editingQuotationNumber, enableThreeInvoiceSeries, getActiveTab, invoiceType, isCashSettlementEnabled, items, quotationGstEnabledSetting, quotationTerms, reserveInvoiceNumberForTab, reserveQuotationNumberForTab, setEditingQuotation, setHardwareError, setQuotationMode, setQuotationSaving, setQuotationSuccess, setQuotationTerms, shopAddress, shopEmail, shopGstin, shopName, shopNameState, shopPhone, shopState, shopWebsite, syncActiveSnapshot, tenantId, uiConfig, updateActiveTab, upiId, userName } = ctx;
  const handleSaveQuotation = async (shouldPrint = true) => {
    if (items.length === 0) {
      setHardwareError('Cart is empty. Add items to quotation.');
      return;
    }
    if (!isDesktopRuntime()) return;
    setQuotationSaving(true);
    setHardwareError(null);
    try {
      const tid = tenantId || '';
      const quotationId = editingQuotationId || uuidv4();
      let quotationNumber = editingQuotationNumber || '';

      if (!editingQuotationId) {
        const numRes = await quotationsApi.getNextQuotationNumber({ tenant_id: 'global' });
        if (!numRes.success) { setHardwareError('Failed to generate number'); setQuotationSaving(false); return; }
        quotationNumber = numRes.quotationNumber || '';
      }

      const hasGstItems = items.some(i => (i as B.CartItem).is_gst_applicable || (i as B.CartItem).hsn_sac_code || Number(i.tax_rate_percent) > 0);
      const isGstQuotation = quotationGstEnabledSetting || invoiceType === 'GST' || hasGstItems;
      const isInterState = isGstQuotation && Boolean(customerState && shopState && customerState.trim().toLowerCase() !== shopState.trim().toLowerCase());

      const qItems = buildQuotationLines(items, { isGstQuotation, isInterState });

      const qSubtotal = qItems.reduce((s, i) => s + i.amount, 0);
      const qDiscountTotal = qItems.reduce((s, i) => s + (i.discount_amount || 0), 0);
      const qTaxTotal = isGstQuotation ? qItems.reduce((s, i) => s + (i.cgst_amount + i.sgst_amount + i.igst_amount), 0) : 0;
      const qGrandTotal = qSubtotal + qTaxTotal;

      const quotationPayload = {
        quotation_id: quotationId,
        tenant_id: tid,
        quotation_number: quotationNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress || null,
        customer_gstin: customerGstin || null,
        customer_state: customerState || null,
        is_gst: isGstQuotation ? 1 : 0,
        discount_total: qDiscountTotal,
        round_off: 0,
        biller_name: userName || null,
        terms_conditions: quotationTerms,
        subtotal: qSubtotal,
        tax_total: qTaxTotal,
        grand_total: qGrandTotal,
        items: qItems.map(i => ({ ...i, tenant_id: tid })),
      };

      if (editingQuotationId) {
        // Update existing quotation
        await quotationsApi.updateQuotation(quotationPayload);
      } else {
        // Save new quotation
        await quotationsApi.saveQuotation(quotationPayload);
      }

      if (shouldPrint) {
        const printData: QuotationPrintData = {
          shopName: shopNameState || shopName || 'My Shop',
          shopAddress: shopAddress || undefined,
          shopPhone: shopPhone || undefined,
          shopEmail: shopEmail || undefined,
          shopWebsite: shopWebsite || undefined,
          shopGstin: shopGstin || undefined,
          shopState: shopState || undefined,
          quotationNumber,
          date: new Date().toLocaleDateString('en-IN', { timeZone: getStoreTimezone(), day: '2-digit', month: 'long', year: 'numeric' }),
          validUntil: '15 Days from Issue Date',
          billerName: userName || undefined,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          customerAddress: customerAddress || undefined,
          customerGstin: customerGstin || undefined,
          customerState: customerState || undefined,
          reverseCharge: 'No',
          isGstEnabled: isGstQuotation,
          items: qItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
            hsn_code: item.hsn_code,
            uom: item.uom,
            weight: item.weight,
            base_price: item.base_price,
            discount_amount: item.discount_amount,
            discount_percent: item.discount_percent,
            taxable_amount: item.taxable_amount,
            tax_rate_percent: item.tax_rate_percent,
            cgst_rate: item.cgst_rate,
            cgst_amount: item.cgst_amount,
            sgst_rate: item.sgst_rate,
            sgst_amount: item.sgst_amount,
            igst_rate: item.igst_rate,
            igst_amount: item.igst_amount,
          })),
          subtotal: qSubtotal,
          discountTotal: qDiscountTotal,
          taxableAmount: qSubtotal,
          taxTotal: qTaxTotal,
          grandTotal: qGrandTotal,
          termsAndConditions: quotationTerms,
          bankName: bankNameState || undefined,
          bankAccount: bankAccountState || undefined,
          bankIfsc: bankIfscState || undefined,
          bankBranch: bankBranchState || undefined,
          upiId: upiId || undefined,
        };
        const fullHtml = generateQuotationHtml(printData);

        try {
          const printRes = await printingApi.printA4Html(tid, fullHtml);
          if (!printRes.success) {
            const pw = window.open('', '_blank');
            if (pw) {
              pw.document.write(fullHtml);
              pw.document.close();
              setTimeout(() => pw.print(), 500);
            }
          }
        } catch {
          const pw = window.open('', '_blank');
          if (pw) {
            pw.document.write(fullHtml);
            pw.document.close();
            setTimeout(() => pw.print(), 500);
          }
        }
      }

      setQuotationSuccess(`${editingQuotationId ? 'Updated' : 'Saved'} Quotation ${quotationNumber}${shouldPrint ? ' & Printed' : ''}`);
      clearCart();
      setEditingQuotation(null, null);

      const stayInQuotation = uiConfig.stayInQuotationModeAfterPrint ?? false;
      if (stayInQuotation) {
        setQuotationMode(true);
        updateActiveTab({ 
          customerName: '', 
          customerPhone: '', 
          customerGstin: '', 
          customerAddress: '', 
          paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', 
          receivedAmount: 0,
          reservedQuotationNumber: '',
        });
        setQuotationTerms('1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.');
        await reserveQuotationNumberForTab(true);
        syncActiveSnapshot();
      } else {
        setQuotationMode(false);
        updateActiveTab({ 
          customerName: '', 
          customerPhone: '', 
          customerGstin: '', 
          customerAddress: '', 
          paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', 
          receivedAmount: 0,
          reservedQuotationNumber: '',
        });
        syncActiveSnapshot();
        setQuotationTerms('1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.');
        await reserveInvoiceNumberForTab(true);
        const tab = getActiveTab();
        if (tab?.reservedInvoiceNumber) {
          updateActiveTab({ title: displayInvoiceNumber(tab.reservedInvoiceNumber, invoiceType, enableThreeInvoiceSeries) });
        }
      }
    } catch (e) {
      setHardwareError('Failed to save quotation');
      console.error(e);
    }
    setQuotationSaving(false);
    setTimeout(() => setQuotationSuccess(null), 4000);
  };

  return { handleSaveQuotation };
}
