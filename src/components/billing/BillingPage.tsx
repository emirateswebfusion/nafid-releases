import { useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCartStore, useCartTotals } from '../../store/cartStore';
import { useScaleStore } from '../../store/scaleStore';
import { useAuthStore } from '../../store/authStore';
import { useTabStore, type SplitDetails } from '../../store/tabStore';
import { BillingTabBar } from './BillingTabBar';
import { useFeatureFlagsStore } from '../../config/featureFlags';
import { isAdminRole } from '../../utils/permissions';
import { useBillingUIStore } from '../../store/billingUIStore';

import { PAYMENT_OPTIONS } from './BillingConstants';
import { BillingToasts } from './views/BillingToasts';
import { BillingHeader } from './views/BillingHeader';
import { ErpGridWorkspace } from './views/ErpGridWorkspace';
import type { DeductionState } from './views/DeductionEditor';
import { BillingSearchBar } from './views/BillingSearchBar';
import { isDesktopRuntime } from '../../data/client';
import { invoicesApi } from '../../data/invoices';

import { createCheckoutHandler } from './checkout/checkoutHandler';
import { useCustomerDirectory } from './hooks/useCustomerDirectory';
import { useCustomerFieldState } from './hooks/useCustomerFieldState';
import { useCustomerFieldHandlers } from './hooks/useCustomerFieldHandlers';
import { useProductSearchState } from './hooks/useProductSearchState';
import { useSearchResultsLoader } from './hooks/useSearchResultsLoader';
import { useProductFormHandlers } from './hooks/useProductFormHandlers';
import { useIncomingDocuments } from './hooks/useIncomingDocuments';
import { useBillingShortcuts } from './hooks/useBillingShortcuts';
import { useSearchSelection } from './hooks/useSearchSelection';
import { useQuotationToggle } from './hooks/useQuotationToggle';
import { useBillingSettings } from './hooks/useBillingSettings';
import { useCartFocus } from './hooks/useCartFocus';
import { useHeldBills } from './hooks/useHeldBills';
import { useWhatsAppSend } from './hooks/useWhatsAppSend';
import { useSaveQuotation } from './hooks/useSaveQuotation';
import { useReturnFromCart } from './hooks/useReturnFromCart';
import { useTabNumberRefresh } from './hooks/useTabNumberRefresh';
import { useScrapInvoiceEdit } from './hooks/useScrapInvoiceEdit';
import { useBillingEntry } from './hooks/useBillingEntry';
import { usePricingTier } from './hooks/usePricingTier';
import { useHardwareBarcodeScanner } from './hooks/useHardwareBarcodeScanner';
import { useCustomerAutoMatch } from './hooks/useCustomerAutoMatch';
import { useMostSoldProducts } from './hooks/useMostSoldProducts';
import { useCartKeyboard } from './hooks/useCartKeyboard';
import { useBillingSettingsLoader } from './hooks/useBillingSettingsLoader';
import { useProductFormState } from './hooks/useProductFormState';
import { useBillingModeSync } from './hooks/useBillingModeSync';
import { useCartLocalInputsSync } from './hooks/useCartLocalInputsSync';
import { useNumberReservations } from './hooks/useNumberReservations';
import { useGrandTotalOverride } from './hooks/useGrandTotalOverride';
import { useBillingTotals } from './hooks/useBillingTotals';
import { useBillingQuickActions } from './hooks/useBillingQuickActions';
import { useDeductionSync } from './hooks/useDeductionSync';
import { useScrapInvoiceEditEvents } from './hooks/useScrapInvoiceEditEvents';
import { useBillingPopoverEffects } from './hooks/useBillingPopoverEffects';
import {
  peekNewTabNumbers,
} from './numberReservation';
import { BillingWorkspace } from './views/BillingWorkspace';
import { BillingModals } from './views/BillingModals';
import { useBillingPageState } from './hooks/useBillingPageState';

export function BillingPage() {
  const { config: uiConfig } = useBillingUIStore();

  // Helper to get effective entry field flow from config

  // Helper to check if a field is in the flow

  // Helper to get next field in flow

  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const discountPercentRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pcsRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const ratePcRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rateKgRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const kRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discFlatRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tierRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const totalInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const checkoutBtnRef = useRef<HTMLButtonElement | null>(null);
  const splitCashInputRef = useRef<HTMLInputElement>(null);
  const splitCardInputRef = useRef<HTMLInputElement>(null);
  const splitUpiInputRef = useRef<HTMLInputElement>(null);
  const splitChequeInputRef = useRef<HTMLInputElement>(null);
  const splitCreditInputRef = useRef<HTMLInputElement>(null);
  const totalOverrideInputRef = useRef<HTMLInputElement>(null);
  // Scanner-burst protection for qty-like inputs: a barcode scanner types digits at
  // ~10-20ms intervals. If the qty field has focus when the trigger is pulled, those
  // digits land in the input instead of being added to the cart. We detect the burst
  // (2nd printable key <= 50ms after the 1st) and revert the leaked first digit.
  const qtyKeyTimesRef = useRef<Record<string, number>>({});
  const qtySnapshotsRef = useRef<Record<string, number | string>>({});
  const pendingFocusProductIdRef = useRef<string | null>(null);

  const {
    items, lastAddedProductId, invoiceType, setInvoiceType, clearCart, setDiscount,
    setRole, discountType, discountValue,
    addItem, updateQuantity, removeItem, updatePiecesOverride, customerState, setCustomerState,
    scrapDeduction: storeScrapDeduction, scrapInvoiceNumber: storeScrapInvoiceNumber,
    setScrapDeduction, clearScrapDeduction,
    returnDeduction: storeReturnDeduction, returnInvoiceNumber: storeReturnInvoiceNumber,
    setReturnDeduction, clearReturnDeduction,
    editingInvoiceId: editingActive, editingInvoiceNumber,
  } = useCartStore(useShallow((state) => ({
    items: state.items, lastAddedProductId: state.lastAddedProductId, invoiceType: state.invoiceType,
    setInvoiceType: state.setInvoiceType, clearCart: state.clearCart, setDiscount: state.setDiscount,
    currentUserRole: state.currentUserRole, setRole: state.setRole, discountType: state.discountType,
    discountValue: state.discountValue, addItem: state.addItem, updateQuantity: state.updateQuantity,
    removeItem: state.removeItem, updateItemDiscount: state.updateItemDiscount,
    removeItemDiscount: state.removeItemDiscount, updateItemOfferPrice: state.updateItemOfferPrice,
    updatePiecesOverride: state.updatePiecesOverride, updateItemPricingTier: state.updateItemPricingTier,
    customerState: state.customerState, setCustomerState: state.setCustomerState,
    scrapDeduction: state.scrapDeduction, scrapInvoiceNumber: state.scrapInvoiceNumber,
    setScrapDeduction: state.setScrapDeduction, clearScrapDeduction: state.clearScrapDeduction,
    returnDeduction: state.returnDeduction, returnInvoiceNumber: state.returnInvoiceNumber,
    setReturnDeduction: state.setReturnDeduction, clearReturnDeduction: state.clearReturnDeduction,
    editingInvoiceId: state.editingInvoiceId, editingInvoiceNumber: state.editingInvoiceNumber,
    setEditingInvoice: state.setEditingInvoice,
  })));

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const receivedInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (lastAddedProductId && itemRefs.current[lastAddedProductId]) {
      itemRefs.current[lastAddedProductId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [lastAddedProductId]);

  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const addTab = useTabStore(s => s.addTab);
  const closeTab = useTabStore(s => s.closeTab);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);
  const syncActiveSnapshot = useTabStore(s => s.syncActiveSnapshot);
  const getActiveTab = useTabStore(s => s.getActiveTab);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const { shopName, role: authRole, tenantId, userId, userName } = useAuthStore();
  const shopDomain = useCartStore(s => s.shopDomain);
  const scaleLiveWeight = useScaleStore(s => s.liveWeight);
  const scaleReading = useScaleStore(s => s.reading);
  const billingSettings = useBillingSettings();
  const {
    bosTaxRatePercent, bosTaxInclusive, pricingTiers, productPricingMapLoaded, upiSources, allowBillerOverride,
    loyaltyEnabled, loyaltyEarningRate, loyaltyRedemptionRate, loyaltyAwardOnPending, showDescriptionState, enableThreeInvoiceSeries,
    enableScrap, showCashRegister, enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting, terminalCodeState,
    shopNameState, shopGstin, shopAddress, shopPhone, shopState, quotationGstEnabledSetting,
    shopEmail, shopWebsite, upiId, showUpiQr, bankNameState, bankAccountState,
    bankIfscState, bankBranchState,
  } = billingSettings;

  // While reading, apply the live scale weight (grams) to the last WEIGHT item in the cart (kg)
  useEffect(() => {
    if (!scaleReading) return;
    const lastWeightItem = [...items].reverse().find(i => i.billing_type === 'WEIGHT' && !i.isScrap && !i.isReturnItem);
    if (!lastWeightItem) return;
    const kg = scaleLiveWeight / 1000;
    if (kg > 0) updateQuantity(lastWeightItem.product_id, +kg.toFixed(3));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- items/updateQuantity excluded: re-running on every cart change would re-apply the scale weight after the user edits a quantity
  }, [scaleLiveWeight, scaleReading]);

  const bp = useBillingPageState();
  const {
    localDiscPcts, setLocalDiscPcts, localDiscFlats, setLocalDiscFlats, localPcsStr, setLocalPcsStr,
    localKgStr, setLocalKgStr, productPricingMap, setProductPricingMap, selectedTierId, setSelectedTierId,
    upiPageConfig, setUpiPageConfig, isUpiSelectModalOpen, setIsUpiSelectModalOpen, isBillerPinModalOpen, setIsBillerPinModalOpen,
    partiesForTier, setPartiesForTier, showTransportModal, setShowTransportModal, mostSoldProducts, setMostSoldProducts,
    scrapDeductionSearchQuery, setScrapDeductionSearchQuery, scrapDeductionResults, setScrapDeductionResults, returnDeductionSearchQuery, setReturnDeductionSearchQuery,
    returnDeductionResults, setReturnDeductionResults, setReturnDeductionSearchMode, deductionTabMode, setDeductionTabMode, loyaltyCustomerData,
    setLoyaltyCustomerData, showLoyaltyRedemption, setShowLoyaltyRedemption, pointsToRedeem, setPointsToRedeem, erpNarration,
    setErpNarration, erpSalesRep, setErpSalesRep, focusedRowProductId, setFocusedRowProductId, isCheckingOut,
    setIsCheckingOut, hardwareError, setHardwareError, checkoutSuccess, setCheckoutSuccess, upiAccountToast,
    setUpiAccountToast, returnSuccessToast, setReturnSuccessToast, infoToast, setInfoToast, activeDiscField,
    setActiveDiscField, localDiscText, setLocalDiscText, isEditingTotal, setIsEditingTotal, overrideTotalInput,
    setOverrideTotalInput, cashRegisterOpen, setCashRegisterOpen, selectedReturnInvoice, setSelectedReturnInvoice, returnProcessing,
    setReturnProcessing, returnProcessed, setReturnProcessed, showScrapInvoiceView, setShowScrapInvoiceView, scrapInvoiceViewData,
    setScrapInvoiceViewData, scrapInvoiceViewLoading, quotationTerms, setQuotationTerms, quotationSaving, setQuotationSaving,
    quotationSuccess, setQuotationSuccess, scrapDeductionDropdownStyle, setScrapDeductionDropdownStyle, returnDeductionDropdownStyle, setReturnDeductionDropdownStyle,
    isLoadingEditBill, setIsLoadingEditBill, isSendingWhatsApp, setIsSendingWhatsApp, heldBills, setHeldBills,
    showHeldBillsPanel, setShowHeldBillsPanel, heldBillsLoading, setHeldBillsLoading,
  } = bp;

  const canOverrideTier = isAdminRole(authRole) || allowBillerOverride;

  useCartLocalInputsSync({
    items, setLocalDiscFlats, setLocalDiscPcts, setLocalKgStr, setLocalPcsStr,
  });

  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal, scrapTotal, extraBonus, returnDeduction: _cartReturnDeduction } = useCartTotals(bosTaxRatePercent, bosTaxInclusive);

  // Calculate total savings from per-item offers/discounts (before global F8 discount)

  const productSearch = useProductSearchState();
  const {
    setSearchQuery, setResults, isPastBillMode, setIsPastBillMode, setPastBillResults, setReturnSearchResults,
    searchContainerRef,
  } = productSearch;
  const productForm = useProductFormState(tenantId);
  const {
    productFormDialogRef, gradeFormDialogRef, firstInputRef, showProductCreateForm, setShowProductCreateForm, editingProductId,
    setNewProductName, setNewProductBarcode, newProductCategory, newProductIsAddingGrade, setNewProductIsAddingGrade, newProductSavingGrade,
    newProductGradeForm, setNewProductGradeForm,
  } = productForm;

  const customerFields = useCustomerFieldState();
  const { setShowCustomerDropdown, customerNameInputRef } = customerFields;
  const paymentOptionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeCartProductIdRef = useRef<string | null>(null);

  const { focusFirstCartField, focusLastCartField, focusNextCartField, focusPrevCartField, focusCustomerFieldsReverse, handleRateUpDown, focusDescriptionOrDiscount } = useCartFocus({
    customerFields, activeCartProductIdRef, descriptionInputRef, discFlatRefs, discountRef, discRefs,
    invoiceType, items, kRefs, lastAddedProductId, pcsRefs, qtyRefs, rateKgRefs, ratePcRefs, searchRef,
    setFocusedRowProductId, showDescriptionState, tierRefs, totalInputRefs,
  });

  const isCheckingOutRef = useRef(false);

  useEffect(() => {
    if (discountValue === 0) {
      setActiveDiscField(null);
      setLocalDiscText('');
    }
  }, [discountValue, activeTabId, setActiveDiscField, setLocalDiscText]);

  // Three invoice series (Normal, GST B2B, GST B2C)

  // Mode flags from cartStore (must be before any destructuring that references them)
  const isReturnMode = useCartStore(s => s.isReturnMode);
  const setReturnMode = useCartStore(s => s.setReturnMode);
  const returnRefundMethod = useCartStore(s => s.returnRefundMethod);
  const setReturnRefundMethod = useCartStore(s => s.setReturnRefundMethod);
  const isQuotationMode = useCartStore(s => s.isQuotationMode);
  const setQuotationMode = useCartStore(s => s.setQuotationMode);
  const editingQuotationId = useCartStore(s => s.editingQuotationId);
  const editingQuotationNumber = useCartStore(s => s.editingQuotationNumber);
  const setEditingQuotation = useCartStore(s => s.setEditingQuotation);
  const isQuotationActive = isQuotationMode || Boolean(editingQuotationId);

  // Scrap mode (moved before displayGrandTotal which depends on it)
  const isScrapMode = useCartStore(s => s.isScrapMode);
  const setIsScrapMode = useCartStore(s => s.setIsScrapMode);
  const isScrapActive = isScrapMode || Boolean(editingInvoiceNumber && (editingInvoiceNumber.includes('SCR') || editingInvoiceNumber.includes('Scrap')));

  // Safety sync: ensure scrap mode remains active when editing a scrap invoice
  useEffect(() => {
    if (editingInvoiceNumber && (editingInvoiceNumber.includes('SCR') || editingInvoiceNumber.includes('Scrap')) && !isScrapMode) {
      setIsScrapMode(true);
    }
  }, [editingInvoiceNumber, isScrapMode, setIsScrapMode]);
  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();
  const isCashSettlementEnabled = featureFlags ? featureFlags.cash_settlement !== false : true;
  const paymentOptions = useMemo(() => {
    return isCashSettlementEnabled
      ? PAYMENT_OPTIONS
      : PAYMENT_OPTIONS.filter((opt) => opt.value !== 'PENDING');
  }, [isCashSettlementEnabled]);
  const isScrapModuleEnabled = enableScrap && (!featureFlags || featureFlags.scrap !== false);
  const isReturnModuleEnabled = !featureFlags || featureFlags.returns !== false;
  const isLoyaltyModuleEnabled = loyaltyEnabled && (!featureFlags || featureFlags.loyalty !== false);
  const effectiveDeductionMode: 'scrap' | 'return' | 'points' = useMemo(() => {
    if (deductionTabMode === 'scrap' && !isScrapModuleEnabled) {
      if (isReturnModuleEnabled) return 'return';
      if (isLoyaltyModuleEnabled) return 'points';
    }
    if (deductionTabMode === 'return' && !isReturnModuleEnabled) {
      if (isScrapModuleEnabled) return 'scrap';
      if (isLoyaltyModuleEnabled) return 'points';
    }
    if (deductionTabMode === 'points' && !isLoyaltyModuleEnabled) {
      if (isScrapModuleEnabled) return 'scrap';
      if (isReturnModuleEnabled) return 'return';
    }
    return deductionTabMode;
  }, [deductionTabMode, isScrapModuleEnabled, isReturnModuleEnabled, isLoyaltyModuleEnabled]);

  const returnProcessingRef = useRef(false);
  const pendingCheckoutSaveOnlyRef = useRef<boolean | null>(null);

  // useTabStore values are destructured at the top of the component

  const tabCounter = useRef(0);

  const handleAddTab = async () => {
    const { billNumber, scrapNumber, quotationNumber, returnNumber } = await peekNewTabNumbers({ tenantId, enableThreeInvoiceSeries });
    tabCounter.current++;
    const title = billNumber || scrapNumber || quotationNumber || returnNumber || `Bill ${tabCounter.current}`;
    addTab(undefined, title);
    const updates: Record<string, string> = {};
    if (billNumber) updates.reservedInvoiceNumber = billNumber;
    if (scrapNumber) updates.reservedScrapInvoiceNumber = scrapNumber;
    if (quotationNumber) updates.reservedQuotationNumber = quotationNumber;
    if (returnNumber) updates.reservedReturnNumber = returnNumber;
    if (Object.keys(updates).length) updateActiveTab(updates);
  };

  const rawPaymentMethod = activeTab?.paymentMethod;
  const defaultPaymentMethod = isCashSettlementEnabled ? 'PENDING' : 'CASH';
  const paymentMethod = (!isCashSettlementEnabled && (!rawPaymentMethod || rawPaymentMethod === 'PENDING'))
    ? 'CASH'
    : (rawPaymentMethod ?? defaultPaymentMethod);
  const rawSplitDetails = activeTab?.splitDetails;
  const splitDetails: SplitDetails = typeof rawSplitDetails === 'string'
    ? (() => {
        let curr: unknown = rawSplitDetails;
        while (typeof curr === 'string') {
          try { curr = JSON.parse(curr); } catch { break; }
        }
        return (typeof curr === 'object' && curr !== null) ? curr as SplitDetails : { cash: 0, card: 0, upi: 0, bank_transfer: 0 };
      })()
    : (rawSplitDetails ?? { cash: 0, card: 0, upi: 0, bank_transfer: 0 });
  const splitTotal = (paymentMethod === 'SPLIT' || paymentMethod === 'CREDIT') ? ((Number(splitDetails.cash) || 0) + (Number(splitDetails.card) || 0) + (Number(splitDetails.upi) || 0) + (Number(splitDetails.cheque) || 0) + (Number(splitDetails.bank_transfer) || 0)) : 0;
  const receivedAmount = activeTab?.receivedAmount ?? 0;
  const actualRefundPaid = activeTab?.actualRefundPaid ?? 0;
  const customerName = activeTab?.customerName || '';
  const customerPhone = activeTab?.customerPhone || '';
  const customerGstin = activeTab?.customerGstin || '';
  const customerAddress = activeTab?.customerAddress || '';
  const isB2B = (invoiceType === 'GST') && (Boolean(customerGstin?.trim()) || Boolean(activeTab?.isB2B));

  const scrapPaymentStatus = activeTab?.scrapPaymentStatus ?? 'PENDING';
  const nextInvoiceNumber = activeTab?.reservedInvoiceNumber ?? '';
  const nextScrapInvoiceNumber = activeTab?.reservedScrapInvoiceNumber ?? '';
  const nextQuotationNumber = activeTab?.reservedQuotationNumber ?? '';
  const nextReturnNumber = activeTab?.reservedReturnNumber ?? '';

  const lastSelectedSourceId = typeof localStorage !== 'undefined' ? localStorage.getItem('last_selected_upi_source_id') : null;

  const currentSelectedUpi = upiPageConfig.billing && upiSources.length > 0
    ? (upiSources.find((s) =>
         (activeTab?.selectedUpiSourceId && s.source_id === activeTab.selectedUpiSourceId) ||
         (activeTab?.selectedUpiId && (s.source_id === activeTab.selectedUpiId || s.upi_id === activeTab.selectedUpiId))
       )
       || (lastSelectedSourceId ? upiSources.find((s) => s.source_id === lastSelectedSourceId || s.upi_id === lastSelectedSourceId) : null)
       || upiSources.find((s) => s.is_default === 1)
       || upiSources[0])
    : null;

  const { reserveInvoiceNumberForTab, handleInvoiceTypeChange, reserveScrapInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab } = useNumberReservations({
    customerGstin, editingActive, editingQuotationId, enableThreeInvoiceSeries, getActiveTab, invoiceType,
    isB2B, isQuotationMode, isReturnMode, isScrapMode, setInvoiceType, syncActiveSnapshot, tenantId,
    updateActiveTab,
  });

  useBillingModeSync({
    activeTab, activeTabId, clearReturnDeduction, clearScrapDeduction, editingInvoiceNumber, enableScrap,
    featureFlags, getActiveTab, isCashSettlementEnabled, isQuotationMode, isReturnMode, isScrapMode, items,
    removeItem, reserveInvoiceNumberForTab, reserveReturnNumberForTab, setIsScrapMode, setQuotationMode,
    setReturnMode, setSelectedReturnInvoice, syncActiveSnapshot, updateActiveTab,
  });

  const toggleQuotationMode = useQuotationToggle({
    activeTabId, invoiceType, isQuotationMode, isScrapMode, isReturnMode, isPastBillMode, quotationGstEnabledSetting,
    setQuotationMode, setIsScrapMode, setReturnMode, setIsPastBillMode, setInvoiceType, reserveQuotationNumberForTab,
  });

  const {
    returnConsumed, refundAmount, returnTotal, originalReturnTotal,
    returnDiscountTotal, rawDisplayGrandTotal, customerPointsBalance, pointsRedeemedCalc, pointsRedeemedDiscountCalc,
    isGrandTotalOverridden, displayGrandTotal, balanceAmount,
  } = useBillingTotals({
    activeTab, extraBonus, grandTotal, isLoyaltyModuleEnabled, isReturnMode, isScrapMode, items,
    loyaltyCustomerData, loyaltyRedemptionRate, pointsToRedeem, receivedAmount, scrapTotal,
    storeReturnDeduction, storeScrapDeduction,
  });

  const { startEditingTotal, handleResetGrandTotalOverride, commitTotalOverride } = useGrandTotalOverride({
    discount, displayGrandTotal, isReturnMode, isScrapMode, items, overrideTotalInput, setDiscount,
    setInfoToast, setIsEditingTotal, setOverrideTotalInput, storeReturnDeduction, storeScrapDeduction, subtotal,
    totalOverrideInputRef, totalTax, updateActiveTab,
  });

  const totalProducts = items.length;
  const totalKgs = items.reduce((sum, item) => {
    if (item.billing_type === 'WEIGHT') {
      return sum + (Number(item.quantity) || 0);
    }
    return sum;
  }, 0);
  const totalPcs = items.reduce((sum, item) => {
    if (item.billing_type === 'WEIGHT' || ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((item.uom || '').toLowerCase())) {
      const pieces = item.pieces_override ?? 1;
      return sum + pieces;
    }
    return sum + (Number(item.quantity) || 0);
  }, 0);

  useBillingEntry({
    addTab, isCashSettlementEnabled, isQuotationMode, quotationGstEnabledSetting, reserveQuotationNumberForTab,
    searchRef, syncActiveSnapshot, tabCounterRef: tabCounter, updateActiveTab,
  });

  // receivedAmount stays 0 until user enters a value — no auto-fill to grandTotal

  useEffect(() => {
    if (uiConfig.entryFocusOrder === 'customer-first') {
      customerNameInputRef.current?.focus();
    } else {
      searchRef.current?.focus();
    }
  }, [activeTabId, uiConfig.entryFocusOrder, customerNameInputRef]);

  useBillingSettingsLoader({
    billingSettings, productForm, isQuotationMode, isReturnMode, isScrapMode, loadFlags,
    reserveInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab,
    reserveScrapInvoiceNumberForTab, setPartiesForTier, setProductPricingMap, setSelectedTierId,
    setUpiPageConfig, shopName, tenantId,
  });

  useTabNumberRefresh({
    activeTabId, customerGstin, enableThreeInvoiceSeries, getActiveTab, invoiceType, isB2B, isQuotationMode,
    isReturnMode, isScrapMode, reserveInvoiceNumberForTab, reserveQuotationNumberForTab,
    reserveReturnNumberForTab, reserveScrapInvoiceNumberForTab, tenantId, updateActiveTab,
  });

  const { loadScrapInvoiceForEdit } = useScrapInvoiceEdit({
    addItem, clearCart, clearScrapDeduction, editingInvoiceNumber, getActiveTab, isScrapMode, setDiscount,
    setIsPastBillMode, setIsScrapMode, setQuotationMode, setReturnMode, setSelectedReturnInvoice,
    syncActiveSnapshot, tenantId, updateActiveTab,
  });

  useScrapInvoiceEditEvents({
    loadScrapInvoiceForEdit, updateActiveTab,
  });

  useSearchResultsLoader({
    search: productSearch, tenantId, invoiceType, isScrapMode, isReturnMode, isQuotationMode,
    enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting,
  });

  useMostSoldProducts({
    setMostSoldProducts, tenantId, uiConfig,
  });

  const scrapDeductionInputRef = useRef<HTMLInputElement>(null);
  const returnDeductionInputRef = useRef<HTMLInputElement>(null);
  const pointsDeductionInputRef = useRef<HTMLInputElement>(null);

  useDeductionSync({
    returnDeductionInputRef, returnDeductionSearchQuery, scrapDeductionInputRef, scrapDeductionSearchQuery,
    setReturnDeductionDropdownStyle, setReturnDeductionResults, setScrapDeductionDropdownStyle,
    setScrapDeductionResults, storeReturnDeduction, storeScrapDeduction, tenantId,
  });

  const { allCustomersList, filteredCustomerSuggestions, findMatchingParty, setCustomerSearchResults } = useCustomerDirectory({
    tenantId,
    staffCreditBilling: featureFlags?.staff_credit_billing,
    parties: partiesForTier,
    customerName,
    customerPhone,
  });

  useBillingPopoverEffects({
    editingProductId, firstInputRef, gradeFormDialogRef, productFormDialogRef, returnDeductionInputRef,
    scrapDeductionInputRef, searchContainerRef, setNewProductBarcode, setPastBillResults, setResults,
    setReturnDeductionDropdownStyle, setReturnDeductionResults, setScrapDeductionDropdownStyle,
    setScrapDeductionResults, setSearchQuery, setShowProductCreateForm, showProductCreateForm, tenantId,
  });

  const { getTierPriceForProduct, handlePricingTierChange, applyPartyTier } = usePricingTier({
    findMatchingParty, pricingTiers, productPricingMap, productPricingMapLoaded, selectedTierId,
    setSelectedTierId, syncActiveSnapshot,
  });

  useCustomerAutoMatch({
    activeTab, allCustomersList, applyPartyTier, customerName, customerPhone, findMatchingParty,
    loyaltyCustomerData, pointsToRedeem, setLoyaltyCustomerData, setPointsToRedeem, setShowLoyaltyRedemption,
    showLoyaltyRedemption, tenantId, updateActiveTab,
  });

  const customerHandlers = useCustomerFieldHandlers({
    fields: customerFields, filteredCustomerSuggestions, invoiceType, searchRef,
    updateActiveTab, applyPartyTier, setLoyaltyCustomerData, setCustomerSearchResults,
  });

  useIncomingDocuments({
    productSearch, addItem, addTab, applyPartyTier, authRole, clearCart, isCashSettlementEnabled,
    quotationGstEnabledSetting, reserveQuotationNumberForTab, reserveReturnNumberForTab, searchRef,
    setCustomerState, setEditingQuotation, setHardwareError, setInvoiceType, setIsLoadingEditBill,
    setIsScrapMode, setLocalKgStr, setLocalPcsStr, setQuotationMode, setQuotationTerms, setReturnMode,
    setSelectedReturnInvoice, syncActiveSnapshot, nextTabNumber: () => ++tabCounter.current, tenantId, updateActiveTab,
  });

  const { handleSelectProduct, handleSelectScrapItem, handleSelectReturnInvoice, handleSelectPastBill, handleSearchKey } = useSearchSelection({
    productSearch, customerFields, addItem, authRole, clearCart, focusCustomerFieldsReverse,
    focusFirstCartField, focusLastCartField, getTierPriceForProduct, isReturnMode, isScrapMode, items, pcsRefs,
    pendingFocusProductIdRef, pricingTiers, qtyRefs, rateKgRefs, ratePcRefs, reserveReturnNumberForTab,
    selectedTierId, setHardwareError, setNewProductName, setReturnMode, setReturnRefundMethod,
    setSelectedReturnInvoice, setShowProductCreateForm, showProductCreateForm, tenantId, updateActiveTab,
  });

  const { resetProductForm, handleProductPurchasePriceChange, handleProductBasePriceChange, handleProductGradeChange, generateProductBarcode, handleCreateNewGrade, handleEditProduct, handleCreateAndAddProduct } = useProductFormHandlers({
    productForm, productSearch, handleSelectProduct, invoiceType, setHardwareError, setProductPricingMap,
    syncActiveSnapshot, tenantId, updateQuantity,
  });

  useHardwareBarcodeScanner({
    addItem, handleSelectPastBill, handleSelectProduct, handleSelectReturnInvoice, isPastBillMode, isReturnMode,
    searchRef, setHardwareError, setPastBillResults, setResults, setReturnSearchResults, setSearchQuery,
    syncActiveSnapshot, tenantId,
  });

  // Auto-dismiss hardware error after 3 seconds
  useEffect(() => {
    if (!hardwareError) return;
    const t = setTimeout(() => setHardwareError(null), 3000);
    return () => clearTimeout(t);
  }, [hardwareError, setHardwareError]);

  const { handleSaveQuotation } = useSaveQuotation({
    bankAccountState, bankBranchState, bankIfscState, bankNameState, clearCart, customerAddress, customerGstin,
    customerName, customerPhone, customerState, editingQuotationId, editingQuotationNumber,
    enableThreeInvoiceSeries, getActiveTab, invoiceType, isCashSettlementEnabled, items,
    quotationGstEnabledSetting, quotationTerms, reserveInvoiceNumberForTab, reserveQuotationNumberForTab,
    setEditingQuotation, setHardwareError, setQuotationMode, setQuotationSaving, setQuotationSuccess,
    setQuotationTerms, shopAddress, shopEmail, shopGstin, shopName, shopNameState, shopPhone, shopState,
    shopWebsite, syncActiveSnapshot, tenantId, uiConfig, updateActiveTab, upiId, userName,
  });

  const { fillRestForField } = useBillingQuickActions({
    displayGrandTotal, isPastBillMode, isReturnMode, isScrapMode, setInfoToast, setNewProductName,
    setShowProductCreateForm, showProductCreateForm, splitDetails, updateActiveTab,
  });

  const { handleQtyKeyDown, focusCartItemQuantityOrPcs, handlePcsKeyDown, handleSplitInputKeyDown, sanitizeQtyText, guardScannerInput, handleDiscKeyDown, handleDiscFlatKeyDown, handleTotalInputKeyDown } = useCartKeyboard({
    discFlatRefs, discountRef, discRefs, displayGrandTotal, fillRestForField, focusDescriptionOrDiscount,
    focusNextCartField, focusPrevCartField, items, lastAddedProductId, paymentMethod, paymentOptionRefs,
    pcsRefs, qtyKeyTimesRef, qtyRefs, qtySnapshotsRef, receivedInputRef, removeItem, searchRef, setInfoToast,
    splitCardInputRef, splitCashInputRef, splitChequeInputRef, splitCreditInputRef, splitDetails,
    splitUpiInputRef, totalInputRefs, updateActiveTab,
  });

  const handleCheckout = (saveOnly = false) => createCheckoutHandler({
    items, setHardwareError, isCheckingOutRef, activeTabId, setIsCheckingOut, isScrapMode, scrapTotal, extraBonus, scrapPaymentStatus, customerName, customerPhone, tenantId, customerAddress, userId: userId as string, userName, shopNameState, shopName, shopGstin, shopAddress, shopPhone, authRole, discount, customerState, setCheckoutSuccess, uiConfig, setIsScrapMode, closeTab, clearCart, updateActiveTab, isCashSettlementEnabled, reserveScrapInvoiceNumberForTab, reserveInvoiceNumberForTab, getActiveTab, syncActiveSnapshot, pendingCheckoutSaveOnlyRef, setIsBillerPinModalOpen, pcsRefs, qtyRefs, localPcsStr, invoiceType, isB2B, isQuotationMode, isReturnMode, customerGstin, paymentMethod, splitDetails, splitTotal, displayGrandTotal, loyaltyEnabled, pointsToRedeem, loyaltyCustomerData, loyaltyRedemptionRate, receivedAmount, refundAmount, balanceAmount, enableThreeInvoiceSeries, terminalCodeState, bosTaxRatePercent, bosTaxInclusive, loyaltyAwardOnPending, loyaltyEarningRate, isGrandTotalOverridden, activeTab, storeScrapDeduction, storeReturnDeduction, grandTotal, findMatchingParty, shopEmail, shopWebsite, bankNameState, bankAccountState, bankIfscState, bankBranchState, upiId, showUpiQr, subtotal, totalTax, cgst, sgst, igst, storeScrapInvoiceNumber, storeReturnInvoiceNumber, currentSelectedUpi, actualRefundPaid, returnConsumed, editingQuotationId, setPartiesForTier, setInvoiceType, clearScrapDeduction, clearReturnDeduction, setLoyaltyCustomerData, setShowLoyaltyRedemption, setPointsToRedeem,
  })(saveOnly);

  const { handleProcessReturnFromCart } = useReturnFromCart({
    activeTabId, clearCart, clearReturnDeduction, closeTab, customerAddress, customerName, customerPhone,
    getActiveTab, isCashSettlementEnabled, items, reserveInvoiceNumberForTab, reserveReturnNumberForTab,
    returnDiscountTotal, returnProcessingRef, returnRefundMethod, selectedReturnInvoice, setHardwareError,
    setPartiesForTier, setReturnDeduction, setReturnMode, setReturnProcessed, setReturnProcessing,
    setReturnSuccessToast, setSelectedReturnInvoice, shopAddress, shopName, shopNameState, shopPhone,
    syncActiveSnapshot, tenantId, uiConfig, updateActiveTab, userId,
  });

  const { handleWhatsAppSendActiveBill } = useWhatsAppSend({
    activeTab, customerAddress, customerGstin, customerName, customerPhone, discount, displayGrandTotal,
    invoiceType, items, paymentMethod, receivedAmount, setHardwareError, setInfoToast, setIsSendingWhatsApp,
    shopAddress, shopGstin, shopName, shopNameState, shopPhone, subtotal, tenantId, totalTax,
  });

  const { loadHeldBills, handleHoldBill, handleRecallHeldBill, handleReleaseHeldBill } = useHeldBills({
    addItem, balanceAmount, clearCart, currentSelectedUpi, customerAddress, customerGstin, customerName,
    customerPhone, customerState, discount, discountType, discountValue, grandTotal, invoiceType,
    isCashSettlementEnabled, isQuotationMode, isReturnMode, isScrapMode, items, paymentMethod, rawSplitDetails,
    receivedAmount, setCustomerState, setDiscount, setHardwareError, setHeldBills, setHeldBillsLoading,
    setInfoToast, setInvoiceType, setShowHeldBillsPanel, splitDetails, subtotal, syncActiveSnapshot, tenantId,
    totalTax, updateActiveTab, updatePiecesOverride, updateQuantity, userId,
  });

  // Auto-expire stale holds on mount
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    invoicesApi.expireStaleHeldBills({ tenant_id: tenantId || 'global' }).catch(() => {});
    loadHeldBills();
  }, [tenantId, loadHeldBills]);

  // Refresh held bills after a hold or release
  useEffect(() => {
    if (showHeldBillsPanel) {
      loadHeldBills();
    }
  }, [showHeldBillsPanel, loadHeldBills]);

  useBillingShortcuts({
    productSearch, customerFields, discountRef, displayGrandTotal, editingInvoiceNumber, enableScrap,
    featureFlags, focusCartItemQuantityOrPcs, handleCheckout, handleHoldBill, handleProcessReturnFromCart,
    handleSaveQuotation, isCashSettlementEnabled, isLoyaltyModuleEnabled, isQuotationActive, isQuotationMode,
    isReturnMode, isReturnModuleEnabled, isScrapMode, isScrapModuleEnabled, isUpiSelectModalOpen, paymentMethod,
    paymentOptionRefs, pointsDeductionInputRef, reserveInvoiceNumberForTab,
    reserveReturnNumberForTab, reserveScrapInvoiceNumberForTab,
    returnDeductionInputRef, scrapDeductionInputRef, searchRef, setDeductionTabMode, setDiscount, setInfoToast,
    setIsScrapMode, setIsUpiSelectModalOpen, setQuotationMode, setReturnDeductionSearchMode,
    setReturnMode, setSelectedReturnInvoice, splitCashInputRef, splitCreditInputRef, startEditingTotal,
    syncActiveSnapshot, toggleQuotationMode, updateActiveTab,
  });
  const deductions: DeductionState = {
    customerPointsBalance, effectiveDeductionMode, isLoyaltyModuleEnabled, isReturnModuleEnabled,
    isScrapModuleEnabled, pointsDeductionInputRef, pointsRedeemedCalc, pointsRedeemedDiscountCalc, pointsToRedeem,
    returnDeductionInputRef, returnDeductionSearchQuery, scrapDeductionInputRef, scrapDeductionSearchQuery,
    setDeductionTabMode, setHardwareError, setPointsToRedeem, setReturnDeductionDropdownStyle,
    setReturnDeductionResults, setReturnDeductionSearchMode, setReturnDeductionSearchQuery,
    setScrapDeductionDropdownStyle, setScrapDeductionResults, setScrapDeductionSearchQuery, tenantId,
  };
  const searchBarSection = <BillingSearchBar
    getTierPriceForProduct={getTierPriceForProduct} handleSearchKey={handleSearchKey}
    handleSelectPastBill={handleSelectPastBill} handleSelectProduct={handleSelectProduct}
    handleSelectReturnInvoice={handleSelectReturnInvoice} handleSelectScrapItem={handleSelectScrapItem}
    invoiceType={invoiceType} isQuotationActive={isQuotationActive} isQuotationMode={isQuotationMode}
    isReturnMode={isReturnMode} isScrapActive={isScrapActive} isScrapMode={isScrapMode} productSearch={productSearch}
    searchRef={searchRef} setIsScrapMode={setIsScrapMode} setNewProductName={setNewProductName}
    setQuotationMode={setQuotationMode} setReturnMode={setReturnMode}
    setShowProductCreateForm={setShowProductCreateForm} showProductCreateForm={showProductCreateForm}
    uiConfig={uiConfig}
  />;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ─── FLOATING TOASTS ─── */}
      <BillingToasts
        checkoutSuccess={checkoutSuccess} hardwareError={hardwareError} infoToast={infoToast}
        quotationSuccess={quotationSuccess} returnSuccessToast={returnSuccessToast} upiAccountToast={upiAccountToast}
      />

      {/* ─── TOP HEADER ─── */}
      <BillingHeader
        activeTab={activeTab} authRole={authRole} clearCart={clearCart} customerAddress={customerAddress}
        customerGstin={customerGstin} customerName={customerName} customerNameInputRef={customerNameInputRef}
        customerPhone={customerPhone} discountValue={discountValue} editingActive={editingActive}
        editingInvoiceNumber={editingInvoiceNumber} enableScrap={enableScrap}
        enableThreeInvoiceSeries={enableThreeInvoiceSeries} featureFlags={featureFlags} getActiveTab={getActiveTab}
        heldBills={heldBills} invoiceType={invoiceType} isCashSettlementEnabled={isCashSettlementEnabled}
        isPastBillMode={isPastBillMode} isQuotationActive={isQuotationActive} isQuotationMode={isQuotationMode}
        isReturnMode={isReturnMode} isScrapActive={isScrapActive} isScrapMode={isScrapMode} items={items}
        loadHeldBills={loadHeldBills} localDiscText={localDiscText} loyaltyCustomerData={loyaltyCustomerData}
        nextInvoiceNumber={nextInvoiceNumber} nextQuotationNumber={nextQuotationNumber}
        nextReturnNumber={nextReturnNumber} nextScrapInvoiceNumber={nextScrapInvoiceNumber}
        pointsToRedeem={pointsToRedeem} reserveInvoiceNumberForTab={reserveInvoiceNumberForTab}
        reserveReturnNumberForTab={reserveReturnNumberForTab}
        reserveScrapInvoiceNumberForTab={reserveScrapInvoiceNumberForTab} searchRef={searchRef}
        setActiveDiscField={setActiveDiscField} setCashRegisterOpen={setCashRegisterOpen} setDiscount={setDiscount}
        setIsPastBillMode={setIsPastBillMode} setIsScrapMode={setIsScrapMode} setLocalDiscText={setLocalDiscText}
        setLoyaltyCustomerData={setLoyaltyCustomerData} setPointsToRedeem={setPointsToRedeem}
        setQuotationMode={setQuotationMode} setReturnMode={setReturnMode} setRole={setRole}
        setSelectedReturnInvoice={setSelectedReturnInvoice} setShowCustomerDropdown={setShowCustomerDropdown}
        setShowHeldBillsPanel={setShowHeldBillsPanel} setShowLoyaltyRedemption={setShowLoyaltyRedemption}
        setShowTransportModal={setShowTransportModal} shopName={shopName} showCashRegister={showCashRegister}
        storeReturnDeduction={storeReturnDeduction} storeScrapDeduction={storeScrapDeduction}
        syncActiveSnapshot={syncActiveSnapshot} tenantId={tenantId} toggleQuotationMode={toggleQuotationMode}
        uiConfig={uiConfig} updateActiveTab={updateActiveTab}
      />

      {/* ─── TABS BAR ─── */}
      <div className="shrink-0 bg-muted/20 border-b border-border">
        <BillingTabBar onAddTab={handleAddTab} enableThreeInvoiceSeries={enableThreeInvoiceSeries} />
      </div>

      {/* ─── MAIN POS WORKSPACE ─── */}
      {uiConfig.layoutModel === 'erp-grid-b2c' && <ErpGridWorkspace
        activeTab={activeTab}
        applyPartyTier={applyPartyTier}
        balanceAmount={balanceAmount}
        canOverrideTier={canOverrideTier}
        clearReturnDeduction={clearReturnDeduction}
        clearScrapDeduction={clearScrapDeduction}
        customerFields={customerFields}
        customerGstin={customerGstin}
        customerName={customerName}
        customerPhone={customerPhone}
        customerState={customerState}
        deductions={deductions}
        discountRef={discountRef}
        discountValue={discountValue}
        displayGrandTotal={displayGrandTotal}
        editingActive={editingActive}
        editingInvoiceNumber={editingInvoiceNumber}
        enableThreeInvoiceSeries={enableThreeInvoiceSeries}
        erpNarration={erpNarration}
        erpSalesRep={erpSalesRep}
        findMatchingParty={findMatchingParty}
        focusedRowProductId={focusedRowProductId}
        handleCheckout={handleCheckout}
        handlePricingTierChange={handlePricingTierChange}
        handleQtyKeyDown={handleQtyKeyDown}
        invoiceType={invoiceType}
        isCheckingOut={isCheckingOut}
        isGrandTotalOverridden={isGrandTotalOverridden}
        items={items}
        lastAddedProductId={lastAddedProductId}
        nextInvoiceNumber={nextInvoiceNumber}
        paymentMethod={paymentMethod}
        pricingTiers={pricingTiers}
        qtyRefs={qtyRefs}
        receivedAmount={receivedAmount}
        receivedInputRef={receivedInputRef}
        removeItem={removeItem}
        searchBarSection={searchBarSection}
        selectedTierId={selectedTierId}
        setDiscount={setDiscount}
        setErpNarration={setErpNarration}
        setErpSalesRep={setErpSalesRep}
        setFocusedRowProductId={setFocusedRowProductId}
        setReturnDeduction={setReturnDeduction}
        setScrapDeduction={setScrapDeduction}
        shopDomain={shopDomain}
        startEditingTotal={startEditingTotal}
        storeReturnDeduction={storeReturnDeduction}
        storeScrapDeduction={storeScrapDeduction}
        updateActiveTab={updateActiveTab}
        updateQuantity={updateQuantity}
      />}

      <BillingWorkspace
        activeCartProductIdRef={activeCartProductIdRef} activeDiscField={activeDiscField} activeTab={activeTab}
        actualRefundPaid={actualRefundPaid} canOverrideTier={canOverrideTier} cgst={cgst}
        checkoutBtnRef={checkoutBtnRef} commitTotalOverride={commitTotalOverride}
        currentSelectedUpi={currentSelectedUpi} customerAddress={customerAddress} customerFields={customerFields}
        customerGstin={customerGstin} customerHandlers={customerHandlers} customerName={customerName}
        customerPhone={customerPhone} customerState={customerState} deductions={deductions}
        descriptionInputRef={descriptionInputRef} discFlatRefs={discFlatRefs} discount={discount}
        discountPercentRef={discountPercentRef} discountRef={discountRef} discRefs={discRefs}
        displayGrandTotal={displayGrandTotal} editingActive={editingActive} enableScrap={enableScrap}
        enableThreeInvoiceSeries={enableThreeInvoiceSeries} extraBonus={extraBonus} fillRestForField={fillRestForField}
        filteredCustomerSuggestions={filteredCustomerSuggestions} findMatchingParty={findMatchingParty}
        focusDescriptionOrDiscount={focusDescriptionOrDiscount} focusNextCartField={focusNextCartField}
        focusPrevCartField={focusPrevCartField} getActiveTab={getActiveTab} grandTotal={grandTotal}
        guardScannerInput={guardScannerInput} handleCheckout={handleCheckout}
        handleDiscFlatKeyDown={handleDiscFlatKeyDown} handleDiscKeyDown={handleDiscKeyDown}
        handleEditProduct={handleEditProduct} handleHoldBill={handleHoldBill}
        handleInvoiceTypeChange={handleInvoiceTypeChange} handlePcsKeyDown={handlePcsKeyDown}
        handlePricingTierChange={handlePricingTierChange} handleProcessReturnFromCart={handleProcessReturnFromCart}
        handleQtyKeyDown={handleQtyKeyDown} handleRateUpDown={handleRateUpDown}
        handleResetGrandTotalOverride={handleResetGrandTotalOverride} handleSaveQuotation={handleSaveQuotation}
        handleSelectProduct={handleSelectProduct} handleSplitInputKeyDown={handleSplitInputKeyDown}
        handleTotalInputKeyDown={handleTotalInputKeyDown} handleWhatsAppSendActiveBill={handleWhatsAppSendActiveBill}
        igst={igst} invoiceType={invoiceType} isB2B={isB2B} isCheckingOut={isCheckingOut}
        isEditingTotal={isEditingTotal} isGrandTotalOverridden={isGrandTotalOverridden}
        isLoadingEditBill={isLoadingEditBill} isQuotationActive={isQuotationActive} isQuotationMode={isQuotationMode}
        isReturnMode={isReturnMode} isScrapMode={isScrapMode} isSendingWhatsApp={isSendingWhatsApp} itemRefs={itemRefs}
        kRefs={kRefs} localDiscFlats={localDiscFlats} localDiscPcts={localDiscPcts} localDiscText={localDiscText}
        localKgStr={localKgStr} localPcsStr={localPcsStr} loyaltyCustomerData={loyaltyCustomerData}
        loyaltyEnabled={loyaltyEnabled} mostSoldProducts={mostSoldProducts} originalReturnTotal={originalReturnTotal}
        overrideTotalInput={overrideTotalInput} paymentMethod={paymentMethod} paymentOptionRefs={paymentOptionRefs}
        paymentOptions={paymentOptions} pcsRefs={pcsRefs} pendingFocusProductIdRef={pendingFocusProductIdRef}
        pricingTiers={pricingTiers} productPricingMap={productPricingMap} qtyRefs={qtyRefs}
        quotationSaving={quotationSaving} quotationTerms={quotationTerms} rateKgRefs={rateKgRefs}
        ratePcRefs={ratePcRefs} rawDisplayGrandTotal={rawDisplayGrandTotal} receivedAmount={receivedAmount}
        receivedInputRef={receivedInputRef} refundAmount={refundAmount} returnDiscountTotal={returnDiscountTotal}
        returnProcessed={returnProcessed} returnProcessing={returnProcessing} returnTotal={returnTotal}
        sanitizeQtyText={sanitizeQtyText} scrapPaymentStatus={scrapPaymentStatus} scrapTotal={scrapTotal}
        searchBarSection={searchBarSection} searchRef={searchRef} selectedReturnInvoice={selectedReturnInvoice}
        selectedTierId={selectedTierId} setActiveDiscField={setActiveDiscField} setCustomerState={setCustomerState}
        setFocusedRowProductId={setFocusedRowProductId} setInfoToast={setInfoToast}
        setIsEditingTotal={setIsEditingTotal} setIsUpiSelectModalOpen={setIsUpiSelectModalOpen}
        setLocalDiscFlats={setLocalDiscFlats} setLocalDiscPcts={setLocalDiscPcts} setLocalDiscText={setLocalDiscText}
        setLocalKgStr={setLocalKgStr} setLocalPcsStr={setLocalPcsStr} setLoyaltyCustomerData={setLoyaltyCustomerData}
        setOverrideTotalInput={setOverrideTotalInput} setQuotationTerms={setQuotationTerms}
        setShowLoyaltyRedemption={setShowLoyaltyRedemption} sgst={sgst} showDescriptionState={showDescriptionState}
        splitCardInputRef={splitCardInputRef} splitCashInputRef={splitCashInputRef}
        splitChequeInputRef={splitChequeInputRef} splitCreditInputRef={splitCreditInputRef} splitDetails={splitDetails}
        splitTotal={splitTotal} splitUpiInputRef={splitUpiInputRef} startEditingTotal={startEditingTotal}
        subtotal={subtotal} tenantId={tenantId} totalInputRefs={totalInputRefs} totalKgs={totalKgs}
        totalOverrideInputRef={totalOverrideInputRef} totalPcs={totalPcs} totalProducts={totalProducts}
        totalTax={totalTax} uiConfig={uiConfig} updateActiveTab={updateActiveTab} upiPageConfig={upiPageConfig}
        upiSources={upiSources}
      />

      <BillingModals
        activeTab={activeTab} cashRegisterOpen={cashRegisterOpen} currentSelectedUpi={currentSelectedUpi}
        enableRealPaperStock={enableRealPaperStock} focusDescriptionOrDiscount={focusDescriptionOrDiscount}
        generateProductBarcode={generateProductBarcode} gradeFormDialogRef={gradeFormDialogRef}
        handleCheckout={handleCheckout} handleCreateAndAddProduct={handleCreateAndAddProduct}
        handleCreateNewGrade={handleCreateNewGrade} handleProductBasePriceChange={handleProductBasePriceChange}
        handleProductGradeChange={handleProductGradeChange}
        handleProductPurchasePriceChange={handleProductPurchasePriceChange} handleRecallHeldBill={handleRecallHeldBill}
        handleReleaseHeldBill={handleReleaseHeldBill} heldBills={heldBills} heldBillsLoading={heldBillsLoading}
        invoiceType={invoiceType} isBillerPinModalOpen={isBillerPinModalOpen}
        isUpiSelectModalOpen={isUpiSelectModalOpen} newProductCategory={newProductCategory}
        newProductGradeForm={newProductGradeForm} newProductIsAddingGrade={newProductIsAddingGrade}
        newProductSavingGrade={newProductSavingGrade} paymentOptionRefs={paymentOptionRefs}
        pendingCheckoutSaveOnlyRef={pendingCheckoutSaveOnlyRef} pricingTiers={pricingTiers} productForm={productForm}
        resetProductForm={resetProductForm} returnDeductionDropdownStyle={returnDeductionDropdownStyle}
        returnDeductionResults={returnDeductionResults} scrapDeductionDropdownStyle={scrapDeductionDropdownStyle}
        scrapDeductionResults={scrapDeductionResults} scrapInvoiceViewData={scrapInvoiceViewData}
        scrapInvoiceViewLoading={scrapInvoiceViewLoading} setCashRegisterOpen={setCashRegisterOpen}
        setHardwareError={setHardwareError} setIsBillerPinModalOpen={setIsBillerPinModalOpen}
        setIsUpiSelectModalOpen={setIsUpiSelectModalOpen} setNewProductGradeForm={setNewProductGradeForm}
        setNewProductIsAddingGrade={setNewProductIsAddingGrade} setReturnDeduction={setReturnDeduction}
        setReturnDeductionDropdownStyle={setReturnDeductionDropdownStyle}
        setReturnDeductionResults={setReturnDeductionResults}
        setReturnDeductionSearchQuery={setReturnDeductionSearchQuery} setScrapDeduction={setScrapDeduction}
        setScrapDeductionDropdownStyle={setScrapDeductionDropdownStyle}
        setScrapDeductionResults={setScrapDeductionResults} setScrapDeductionSearchQuery={setScrapDeductionSearchQuery}
        setScrapInvoiceViewData={setScrapInvoiceViewData} setShowHeldBillsPanel={setShowHeldBillsPanel}
        setShowScrapInvoiceView={setShowScrapInvoiceView} setShowTransportModal={setShowTransportModal}
        setUpiAccountToast={setUpiAccountToast} showHeldBillsPanel={showHeldBillsPanel}
        showProductCreateForm={showProductCreateForm} showScrapInvoiceView={showScrapInvoiceView}
        showTransportModal={showTransportModal} tenantId={tenantId} updateActiveTab={updateActiveTab}
        upiSources={upiSources}
      />
    </div>
  );
}
