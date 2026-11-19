import { priceReturnLine, totalReturnLines } from '../../../utils/pricing/returnPricing';
import type * as B from '../billingTypes';
import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { returnsApi } from '../../../data/returns';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '../../../store/authStore';
import { getSetting, type ReceiptPrinterConfig, type PrintFormatSettings } from '../../../data/settings';
import { DEFAULT_BILL_SETTINGS, type ReceiptData, formatBillDateTime, generateReceiptText } from '../../../utils/print/receiptGenerator';
import { printingApi } from '../../../data/printing';
import { formatPrinterError } from '../../../utils/print/printFormatHelper';
import { listParties } from '../../../data/parties';
import { useTabStore } from '../../../store/tabStore';
import type { CartItem } from '../../../store/cartStore';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import type { Tab } from '../../../store/tabStore';
import type { Invoice } from '../../../data/invoices';
import { offerCardTerminalRefund } from '../../app/cardTerminalStep';

export interface UseReturnFromCartContext {
  activeTabId: string;
  clearCart: () => void;
  clearReturnDeduction: () => void;
  closeTab: (id: string) => void;
  customerAddress: string;
  customerName: string;
  customerPhone: string;
  getActiveTab: () => Tab | undefined;
  isCashSettlementEnabled: boolean;
  items: CartItem[];
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  returnDiscountTotal: number;
  returnProcessingRef: React.RefObject<boolean>;
  returnRefundMethod: "ADJUST_BILL" | "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT" | "CREDIT";
  selectedReturnInvoice: Partial<Invoice> | null;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setPartiesForTier: React.Dispatch<React.SetStateAction<B.Party[]>>;
  setReturnDeduction: (amount: number, returnInvoiceNumber: string) => void;
  setReturnMode: (isReturnMode: boolean) => void;
  setReturnProcessed: React.Dispatch<React.SetStateAction<boolean>>;
  setReturnProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setReturnSuccessToast: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedReturnInvoice: React.Dispatch<React.SetStateAction<Partial<Invoice> | null>>;
  shopAddress: string;
  shopName: string | null;
  shopNameState: string;
  shopPhone: string;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
  uiConfig: BillingUIConfig;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
  userId: string | null;
}

/**
 * Process a sales return from the cart in return mode (`handleProcessReturnFromCart`): saves the return and its refund atomically in the main process, prints the return receipt unless `saveOnly`, then resets the tab.
 */
export function useReturnFromCart(ctx: UseReturnFromCartContext) {
  const { activeTabId, clearCart, clearReturnDeduction, closeTab, customerAddress, customerName, customerPhone, getActiveTab, isCashSettlementEnabled, items, reserveInvoiceNumberForTab, reserveReturnNumberForTab, returnDiscountTotal, returnProcessingRef, returnRefundMethod, selectedReturnInvoice, setHardwareError, setPartiesForTier, setReturnDeduction, setReturnMode, setReturnProcessed, setReturnProcessing, setReturnSuccessToast, setSelectedReturnInvoice, shopAddress, shopName, shopNameState, shopPhone, syncActiveSnapshot, tenantId, uiConfig, updateActiveTab, userId } = ctx;
  // ── Return Mode: process return from cart items (replaces old 2-phase flow) ──
  const handleProcessReturnFromCart = async (saveOnly = false) => {
    if (!isDesktopRuntime()) return;
    if (returnProcessingRef.current) return;
    returnProcessingRef.current = true;

    if (!selectedReturnInvoice) {
      returnProcessingRef.current = false;
      setHardwareError('No original invoice selected for return.');
      return;
    }
    const returnCartItems = items.filter(i => i.isReturnItem && Number(i.quantity) > 0);
    if (returnCartItems.length === 0) {
      returnProcessingRef.current = false;
      setHardwareError('No return items selected in cart.');
      return;
    }
    const returnTabId = activeTabId;
    setReturnProcessing(true);
    try {
      const tid = tenantId || 'global';
      const numRes = await returnsApi.getNextReturnNumber({ tenant_id: tid });
      const returnNumber = numRes.success && numRes.returnNumber ? numRes.returnNumber : `RTN-${Date.now()}`;
      const { subtotal: returnSubtotal, tax: returnTaxTotal, total: returnGrandTotal } = totalReturnLines(returnCartItems);
      const returnItems = returnCartItems.map(item => ({
        return_item_id: uuidv4(),
        product_id: item.product_id,
        invoice_item_id: item.invoiceItemId || undefined,
        name: item.name,
        brand_manufacturer: item.brand_manufacturer || null,
        quantity: Number(item.quantity) || 0,
        ...priceReturnLine(item),
      }));

      const result = await returnsApi.createReturn({
        return_id: uuidv4(),
        invoice_id: selectedReturnInvoice.invoice_id,
        tenant_id: tid,
        user_id: userId || undefined,
        return_number: returnNumber,
        customer_name: selectedReturnInvoice.customer_name || customerName || undefined,
        customer_phone: selectedReturnInvoice.customer_phone || customerPhone || undefined,
        customer_address: (selectedReturnInvoice as B.BillingInvoice)?.customer_address || customerAddress || undefined,
        subtotal: returnSubtotal,
        tax_total: returnTaxTotal,
        grand_total: returnGrandTotal,
        reason: '',
        refund_method: returnRefundMethod,
        adjusted_invoice_number: undefined,
        items: returnItems,
      });
      if (!result.success) {
        setHardwareError(`Failed to save return: ${result.error || 'Unknown error'}`);
        setReturnProcessing(false);
        return;
      }

      if (returnRefundMethod === 'CARD') {
        await offerCardTerminalRefund({ tenantId: tid, invoiceId: selectedReturnInvoice.invoice_id, amount: returnGrandTotal, originalSplitDetails: selectedReturnInvoice.split_details });
      }

      if (returnRefundMethod === 'ADJUST_BILL') {
        setReturnDeduction(returnGrandTotal, returnNumber);
      }

      if (!saveOnly) {
        const cfg = await getSetting<ReceiptPrinterConfig>({ tenant_id: tid, key: 'receipt_printer_config' });
        const printFmt = await getSetting<PrintFormatSettings>({ tenant_id: tid, key: 'print_format' });
        const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : (cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 8.0);
        const thermalStyle = printFmt?.style || 'standard';
        const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.billSettings || {}) };
        const returnReceiptData: ReceiptData = {
          shopName: shopNameState || shopName || 'My Shop',
          shopPhone: shopPhone || undefined,
          shopAddress: shopAddress || undefined,
          invoiceNumber: returnNumber,
          referenceInvoiceNumber: selectedReturnInvoice.invoice_number,
          refundMethod: returnRefundMethod.replace('_', ' '),
          date: formatBillDateTime(new Date()),
          billerName: useAuthStore.getState().userName || undefined,
          items: returnItems.map(ri => ({ name: ri.name, quantity: ri.quantity, unit_price: ri.unit_price, total: ri.total, brand: ri.brand_manufacturer || undefined })),
          subtotal: returnSubtotal,
          tax: returnTaxTotal,
          discount: returnDiscountTotal,
          grandTotal: returnGrandTotal,
          invoiceType: 'RETURN',
          customerName: selectedReturnInvoice.customer_name || customerName || undefined,
          customerPhone: selectedReturnInvoice.customer_phone || customerPhone || undefined,
          customerAddress: (selectedReturnInvoice as B.BillingInvoice)?.customer_address || customerAddress || undefined,
          customerState: (selectedReturnInvoice as B.BillingInvoice)?.customer_state || undefined,
          billSettings,
        };
        const receiptText = generateReceiptText(returnReceiptData, thermalWidth, undefined, thermalStyle);
        const printResult = await printingApi.printReceipt(tid, receiptText);
        if (printResult?.skipped) {
          setHardwareError(formatPrinterError('No printer configured'));
          setTimeout(() => setHardwareError(null), 5000);
        } else if (printResult && !printResult.success) {
          setHardwareError(formatPrinterError(printResult.error));
          setTimeout(() => setHardwareError(null), 5000);
        }
      }

      // Refresh parties list so party balances update immediately
      listParties(tid)
        .then((res) => {
          if (Array.isArray(res)) setPartiesForTier(res);
        })
        .catch(console.error);

      // Notify other views (cashier settlement, history)
      try {
        window.dispatchEvent(new CustomEvent('checkout:completed', { detail: { return_number: returnNumber } }));
      } catch { /* ignore */ }

      setReturnProcessed(true);
      setReturnSuccessToast(saveOnly ? `Return ${returnNumber} saved successfully!` : `Return ${returnNumber} processed & receipt printed!`);
      setTimeout(async () => {
        setReturnProcessed(false);
        const tabsCount = useTabStore.getState().tabs.length;
        const stayInReturn = uiConfig.stayInReturnModeAfterPrint ?? false;

        setSelectedReturnInvoice(null);
        clearCart();
        if (returnRefundMethod !== 'ADJUST_BILL') {
          clearReturnDeduction();
        }
        setReturnSuccessToast(null);

        // Always clear customer and payment state for the completed return
        updateActiveTab({
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          customerId: '',
          paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH',
          receivedAmount: 0,
          actualRefundPaid: 0,
          reservedReturnNumber: '',
        });

        if (tabsCount > 1 && !stayInReturn) {
          setReturnMode(false);
          closeTab(returnTabId);
        } else {
          if (stayInReturn) {
            setReturnMode(true);
            await reserveReturnNumberForTab(true);
          } else {
            setReturnMode(false);
            await reserveInvoiceNumberForTab(true);
            const tab = getActiveTab();
            if (tab?.reservedInvoiceNumber) {
              updateActiveTab({ title: tab.reservedInvoiceNumber });
            }
          }
          syncActiveSnapshot();
        }
      }, 1800);
    } catch (e) {
      console.error('Return processing failed', e);
      setHardwareError('Return processing failed. Please try again.');
    } finally {
      returnProcessingRef.current = false;
      setReturnProcessing(false);
    }
  };

  return { handleProcessReturnFromCart };
}
