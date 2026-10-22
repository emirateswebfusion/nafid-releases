import type React from 'react';
import type { Invoice } from '../../../data/invoices';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import { useCartStore, type InvoiceType } from '../../../store/cartStore';
import { type PaymentMethod } from '../BillingConstants';
import type { SplitDetails, Tab } from '../../../store/tabStore';
import type { FeatureFlags } from '../../../featureFlags';
import type { ProductSearchState } from './useProductSearchState';
import type { CustomerFieldState } from './useCustomerFieldState';

export interface UseBillingShortcutsContext {
  productSearch: ProductSearchState;
  customerFields: CustomerFieldState;
  discountRef: React.RefObject<HTMLInputElement | null>;
  displayGrandTotal: number;
  editingInvoiceNumber: string | null;
  enableScrap: boolean;
  featureFlags: FeatureFlags | null;
  focusCartItemQuantityOrPcs: () => void;
  handleCheckout: (saveOnly?: boolean) => Promise<void>;
  handleHoldBill: () => Promise<void>;
  handleProcessReturnFromCart: (saveOnly?: boolean) => Promise<void>;
  handleSaveQuotation: (shouldPrint?: boolean) => Promise<void>;
  isCashSettlementEnabled: boolean;
  isLoyaltyModuleEnabled: boolean;
  isQuotationActive: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isReturnModuleEnabled: boolean;
  isScrapMode: boolean;
  isScrapModuleEnabled: boolean;
  isUpiSelectModalOpen: boolean;
  paymentMethod: PaymentMethod;
  paymentOptionRefs: React.RefObject<Record<string, HTMLButtonElement | null>>;
  pointsDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  quotationGstEnabledSetting: boolean;
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveQuotationNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveScrapInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  returnDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  scrapDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setDeductionTabMode: React.Dispatch<React.SetStateAction<"scrap" | "return" | "points">>;
  setDiscount: (value: number, type: "FIXED" | "PERCENTAGE") => void;
  setInfoToast: React.Dispatch<React.SetStateAction<string | null>>;
  setInvoiceType: (type: InvoiceType) => void;
  setIsScrapMode: (isScrapMode: boolean) => void;
  setIsUpiSelectModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setReturnDeductionSearchMode: React.Dispatch<React.SetStateAction<boolean>>;
  setReturnMode: (isReturnMode: boolean) => void;
  setSelectedReturnInvoice: React.Dispatch<React.SetStateAction<Invoice | null>>;
  splitCashInputRef: React.RefObject<HTMLInputElement | null>;
  splitCreditInputRef: React.RefObject<HTMLInputElement | null>;
  startEditingTotal: () => void;
  syncActiveSnapshot: () => void;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

export function useBillingShortcuts(ctx: UseBillingShortcutsContext) {
  const { discountRef, displayGrandTotal, editingInvoiceNumber, enableScrap, featureFlags, focusCartItemQuantityOrPcs, handleCheckout, handleHoldBill, handleProcessReturnFromCart, handleSaveQuotation, isCashSettlementEnabled, isLoyaltyModuleEnabled, isQuotationActive, isQuotationMode, isReturnMode, isReturnModuleEnabled, isScrapMode, isScrapModuleEnabled, isUpiSelectModalOpen, paymentMethod, paymentOptionRefs, pointsDeductionInputRef, quotationGstEnabledSetting, reserveInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab, reserveScrapInvoiceNumberForTab, returnDeductionInputRef, scrapDeductionInputRef, searchRef, setDeductionTabMode, setDiscount, setInfoToast, setInvoiceType, setIsScrapMode, setIsUpiSelectModalOpen, setQuotationMode, setReturnDeductionSearchMode, setReturnMode, setSelectedReturnInvoice, splitCashInputRef, splitCreditInputRef, startEditingTotal, syncActiveSnapshot, updateActiveTab } = ctx;
  const { setIsPastBillMode, isPastBillMode } = ctx.productSearch;
  const { customerNameInputRef } = ctx.customerFields;
  useKeyboardShortcuts({
    'Escape': () => {
      // If UPI selection modal is open, close it first and return focus to UPI button
      if (isUpiSelectModalOpen) {
        setIsUpiSelectModalOpen(false);
        setTimeout(() => paymentOptionRefs.current['UPI']?.focus(), 50);
        return;
      }
      // If Split mode or Credit mode is open, close it first and return focus to payment section
      if (paymentMethod === 'SPLIT' || paymentMethod === 'CREDIT') {
        updateActiveTab({ paymentMethod: 'CASH' });
        setInfoToast('Split Payment Closed (Switched to Cash)');
        setTimeout(() => setInfoToast(null), 2000);
        setTimeout(() => paymentOptionRefs.current['CASH']?.focus(), 50);
        return;
      }
      // In normal mode, return focus to Product Search without closing tab or logging out
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    'F1': () => {
      // Normal Billing Mode
      if (isReturnMode) {
        updateActiveTab({
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          customerId: '',
          receivedAmount: 0,
          actualRefundPaid: 0,
          reservedReturnNumber: '',
        });
      }
      setIsScrapMode(false);
      setReturnMode(false);
      setQuotationMode(false);
      setIsPastBillMode(false);
      setSelectedReturnInvoice(null);
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    'F2': () => searchRef.current?.focus(),
    'F3': () => {
      // Save as Temp / Hold Bill
      handleHoldBill();
    },
    'F5': () => {
      // Scrap Mode (F5)
      if (!enableScrap || (featureFlags && featureFlags.scrap === false)) return;
      const next = !isScrapMode;
      setIsScrapMode(next);
      if (next && isQuotationMode) setQuotationMode(false);
      if (next && isReturnMode) setReturnMode(false);
      if (next && isPastBillMode) setIsPastBillMode(false);
      if (next) {
        reserveScrapInvoiceNumberForTab();
      } else {
        if (editingInvoiceNumber) {
          useCartStore.getState().setEditingInvoice(null, null, null);
          setDiscount(0, 'FIXED');
        }
        updateActiveTab({ scrapPaymentStatus: 'PENDING', reservedScrapInvoiceNumber: '' });
      }
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    'F6': () => {
      // Quotation Mode (F6)
      if (featureFlags && featureFlags.quotations === false) return;
      const next = !isQuotationMode;
      setQuotationMode(next);
      if (next && isScrapMode) setIsScrapMode(false);
      if (next && isReturnMode) setReturnMode(false);
      if (next && isPastBillMode) setIsPastBillMode(false);
      if (next && quotationGstEnabledSetting) setInvoiceType('GST');
      if (next) reserveQuotationNumberForTab();
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    'F7': async () => {
      // Return Mode
      if (featureFlags && featureFlags.returns === false) return;
      const next = !isReturnMode;
      if (next) {
        await reserveReturnNumberForTab();
        setReturnMode(true);
        if (isScrapMode) setIsScrapMode(false);
        if (isQuotationMode) setQuotationMode(false);
        if (isPastBillMode) setIsPastBillMode(false);
      } else {
        updateActiveTab({
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          customerId: '',
          receivedAmount: 0,
          actualRefundPaid: 0,
          reservedReturnNumber: '',
        });
        setReturnMode(false);
        setSelectedReturnInvoice(null);
        await reserveInvoiceNumberForTab();
      }
      syncActiveSnapshot();
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    'F4': () => {
      customerNameInputRef.current?.focus();
      customerNameInputRef.current?.select();
    },
    'Alt+q': () => {
      focusCartItemQuantityOrPcs();
    },
    'Alt+Q': () => {
      focusCartItemQuantityOrPcs();
    },
    'Alt+c': () => {
      focusCartItemQuantityOrPcs();
    },
    'Alt+C': () => {
      focusCartItemQuantityOrPcs();
    },
    'F8': () => { discountRef.current?.focus(); },
    'F9': () => {
      // Scrap Deduction
      if (!isScrapModuleEnabled) return;
      setDeductionTabMode('scrap');
      setReturnDeductionSearchMode(false);
      setTimeout(() => scrapDeductionInputRef.current?.focus(), 100);
    },
    'F10': () => {
      // Return Deduction
      if (!isReturnModuleEnabled) return;
      setDeductionTabMode('return');
      setReturnDeductionSearchMode(true);
      setTimeout(() => returnDeductionInputRef.current?.focus(), 100);
    },
    'Alt+l': () => {
      // Points Deduction
      if (!isLoyaltyModuleEnabled) return;
      setDeductionTabMode('points');
      setTimeout(() => pointsDeductionInputRef.current?.focus(), 100);
    },
    'Alt+L': () => {
      // Points Deduction
      if (!isLoyaltyModuleEnabled) return;
      setDeductionTabMode('points');
      setTimeout(() => pointsDeductionInputRef.current?.focus(), 100);
    },
    'F11': () => {
      // Cycle payment method
      const order: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'CREDIT', 'SPLIT'];
      if (isCashSettlementEnabled) order.push('PENDING');
      const currentIdx = order.indexOf(paymentMethod as PaymentMethod);
      const nextIdx = (currentIdx + 1) % order.length;
      const nextMethod = order[nextIdx];
      updateActiveTab({ paymentMethod: nextMethod });
      setInfoToast(`Payment Mode: ${nextMethod}`);
      setTimeout(() => setInfoToast(null), 2500);
    },
    'Alt+p': () => {
      const order: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'CREDIT', 'SPLIT'];
      if (isCashSettlementEnabled) order.push('PENDING');
      const currentIdx = order.indexOf(paymentMethod as PaymentMethod);
      const nextIdx = (currentIdx + 1) % order.length;
      const nextMethod = order[nextIdx];
      updateActiveTab({ paymentMethod: nextMethod });
      setInfoToast(`Payment Mode: ${nextMethod}`);
      setTimeout(() => setInfoToast(null), 2500);
    },
    'Alt+P': () => {
      const order: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'CREDIT', 'SPLIT'];
      if (isCashSettlementEnabled) order.push('PENDING');
      const currentIdx = order.indexOf(paymentMethod as PaymentMethod);
      const nextIdx = (currentIdx + 1) % order.length;
      const nextMethod = order[nextIdx];
      updateActiveTab({ paymentMethod: nextMethod });
      setInfoToast(`Payment Mode: ${nextMethod}`);
      setTimeout(() => setInfoToast(null), 2500);
    },
    'Alt+t': () => { startEditingTotal(); },
    'Alt+T': () => { startEditingTotal(); },
    'Alt+1': () => { updateActiveTab({ paymentMethod: 'CASH' }); setInfoToast('Payment Mode: CASH'); setTimeout(() => setInfoToast(null), 2000); },
    'Alt+2': () => { updateActiveTab({ paymentMethod: 'UPI' }); setInfoToast('Payment Mode: UPI'); setTimeout(() => setInfoToast(null), 2000); },
    'Alt+3': () => { updateActiveTab({ paymentMethod: 'CARD' }); setInfoToast('Payment Mode: CARD'); setTimeout(() => setInfoToast(null), 2000); },
    'Alt+4': () => {
      const initialCreditSplit: SplitDetails = {
        cash: 0,
        card: 0,
        upi: 0,
        cheque: 0,
        credit: displayGrandTotal,
        bank_transfer: 0,
      };
      updateActiveTab({
        paymentMethod: 'CREDIT',
        splitDetails: initialCreditSplit,
        receivedAmount: 0,
      });
      setInfoToast('Payment Mode: CREDIT (Press Esc to close)');
      setTimeout(() => setInfoToast(null), 2000);
      setTimeout(() => splitCreditInputRef.current?.focus(), 60);
    },
    'Alt+5': () => {
      const prevMethod = paymentMethod;
      const initialSplit: SplitDetails = { cash: 0, card: 0, upi: 0, cheque: 0, credit: 0, bank_transfer: 0 };
      if (displayGrandTotal > 0) {
        if (prevMethod === 'UPI') initialSplit.upi = displayGrandTotal;
        else if (prevMethod === 'CARD') initialSplit.card = displayGrandTotal;
        else if (prevMethod === 'CREDIT') initialSplit.credit = displayGrandTotal;
        else if (prevMethod === 'CHEQUE') initialSplit.cheque = displayGrandTotal;
        else initialSplit.cash = displayGrandTotal;
      }
      updateActiveTab({
        paymentMethod: 'SPLIT',
        splitDetails: initialSplit,
        receivedAmount: (initialSplit.credit ? 0 : displayGrandTotal)
      });
      setInfoToast('Payment Mode: SPLIT (Press Esc to close)');
      setTimeout(() => setInfoToast(null), 2500);
      setTimeout(() => splitCashInputRef.current?.focus(), 60);
    },
    'Alt+6': () => { if (isCashSettlementEnabled) { updateActiveTab({ paymentMethod: 'PENDING' }); setInfoToast('Payment Mode: PENDING'); setTimeout(() => setInfoToast(null), 2000); } },
    'F12': () => {
      if (isScrapMode) {
        handleCheckout();
      } else if (isReturnMode) {
        handleProcessReturnFromCart();
      } else if (isQuotationActive) {
        handleSaveQuotation();
      } else {
        handleCheckout();
      }
    },
  });

}
