import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCartStore, useCartTotals } from '../store/cartStore';
import { useScaleStore } from '../store/scaleStore';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';
import { useTabStore, type SplitDetails } from '../store/tabStore';
import { BillingTabBar } from './BillingTabBar';
import { CashierSettlement } from './CashierSettlement';
import { useFeatureFlagsStore } from '../featureFlags';
import { DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../utils/upiConfig';
import { getNumericPart } from '../utils/invoiceNumberHelper';
import { BillerPinModal } from './BillerPinModal';
import { isAdminRole } from '../utils/permissions';
import { useBillingUIStore } from '../store/billingUIStore';

import { PAYMENT_OPTIONS } from './billing/BillingConstants';
import { TransportDetailsModal } from './billing/modals/TransportDetailsModal';
import { HeldBillsModal } from './billing/modals/HeldBillsModal';
import { ScrapInvoiceViewModal } from './billing/modals/ScrapInvoiceViewModal';
import { CreateNewGradeModal } from './billing/modals/CreateNewGradeModal';
import { CreateProductModal } from './billing/modals/CreateProductModal';
import { UpiAccountSelectModal } from './billing/modals/UpiAccountSelectModal';
import { BillingCartView } from './billing/views/BillingCartView';
import { BillingPaymentPanel } from './billing/views/BillingPaymentPanel';
import { BillingTotalsPanel } from './billing/views/BillingTotalsPanel';
import { BillingToasts } from './billing/views/BillingToasts';
import { DeductionDropdowns } from './billing/views/DeductionDropdowns';
import { BillingHeader } from './billing/views/BillingHeader';
import { ErpGridWorkspace } from './billing/views/ErpGridWorkspace';
import type { DeductionState } from './billing/views/DeductionEditor';
import { BillingCustomerDetails } from './billing/views/BillingCustomerDetails';
import { BillingSearchBar } from './billing/views/BillingSearchBar';
import { isDesktopRuntime } from '../data/client';
import { invoicesApi } from '../data/invoices';
import { productsApi } from '../data/products';
import { returnsApi } from '../data/returns';
import { scrapApi } from '../data/scrap';

import { createCheckoutHandler } from './billing/checkout/checkoutHandler';
import { useCustomerDirectory } from './billing/hooks/useCustomerDirectory';
import { useCustomerFieldState } from './billing/hooks/useCustomerFieldState';
import { useCustomerFieldHandlers } from './billing/hooks/useCustomerFieldHandlers';
import { useProductSearchState } from './billing/hooks/useProductSearchState';
import { useSearchResultsLoader } from './billing/hooks/useSearchResultsLoader';
import { useProductFormHandlers } from './billing/hooks/useProductFormHandlers';
import { useIncomingDocuments } from './billing/hooks/useIncomingDocuments';
import { useBillingShortcuts } from './billing/hooks/useBillingShortcuts';
import { useSearchSelection } from './billing/hooks/useSearchSelection';
import { useQuotationToggle } from './billing/hooks/useQuotationToggle';
import { useBillingSettings } from './billing/hooks/useBillingSettings';
import { useCartFocus } from './billing/hooks/useCartFocus';
import { useHeldBills } from './billing/hooks/useHeldBills';
import { useWhatsAppSend } from './billing/hooks/useWhatsAppSend';
import { useSaveQuotation } from './billing/hooks/useSaveQuotation';
import { useReturnFromCart } from './billing/hooks/useReturnFromCart';
import { useTabNumberRefresh } from './billing/hooks/useTabNumberRefresh';
import { useScrapInvoiceEdit } from './billing/hooks/useScrapInvoiceEdit';
import { useBillingEntry } from './billing/hooks/useBillingEntry';
import { usePricingTier } from './billing/hooks/usePricingTier';
import { useHardwareBarcodeScanner } from './billing/hooks/useHardwareBarcodeScanner';
import { useCustomerAutoMatch } from './billing/hooks/useCustomerAutoMatch';
import { useMostSoldProducts } from './billing/hooks/useMostSoldProducts';
import { useCartKeyboard } from './billing/hooks/useCartKeyboard';
import { useBillingSettingsLoader } from './billing/hooks/useBillingSettingsLoader';
import { useProductFormState } from './billing/hooks/useProductFormState';
import {
  peekNewTabNumbers, refreshInvoiceNumberForType, reserveGstSeriesNumber, reserveInvoiceNumber, reserveQuotationNumber,
  reserveReturnNumber, reserveScrapInvoiceNumber,
} from './billing/numberReservation';

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
    items: state.items,
    lastAddedProductId: state.lastAddedProductId,
    invoiceType: state.invoiceType,
    setInvoiceType: state.setInvoiceType,
    clearCart: state.clearCart,
    setDiscount: state.setDiscount,
    currentUserRole: state.currentUserRole,
    setRole: state.setRole,
    discountType: state.discountType,
    discountValue: state.discountValue,
    addItem: state.addItem,
    updateQuantity: state.updateQuantity,
    removeItem: state.removeItem,
    updateItemDiscount: state.updateItemDiscount,
    removeItemDiscount: state.removeItemDiscount,
    updateItemOfferPrice: state.updateItemOfferPrice,
    updatePiecesOverride: state.updatePiecesOverride,
    updateItemPricingTier: state.updateItemPricingTier,
    customerState: state.customerState,
    setCustomerState: state.setCustomerState,
    scrapDeduction: state.scrapDeduction,
    scrapInvoiceNumber: state.scrapInvoiceNumber,
    setScrapDeduction: state.setScrapDeduction,
    clearScrapDeduction: state.clearScrapDeduction,
    returnDeduction: state.returnDeduction,
    returnInvoiceNumber: state.returnInvoiceNumber,
    setReturnDeduction: state.setReturnDeduction,
    clearReturnDeduction: state.clearReturnDeduction,
    editingInvoiceId: state.editingInvoiceId,
    editingInvoiceNumber: state.editingInvoiceNumber,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleLiveWeight, scaleReading]);

  // Local state for per-item two-way discount binding (like CashierSettlement)
  const [localDiscPcts, setLocalDiscPcts] = useState<Record<string, number>>({});
  const [localDiscFlats, setLocalDiscFlats] = useState<Record<string, number>>({});
  // Local string state for Pcs and Kg inputs — lets user type multi-digit values
  // without every keystroke triggering a cross-field recalculation.
  const [localPcsStr, setLocalPcsStr] = useState<Record<string, string>>({});
  const [localKgStr, setLocalKgStr] = useState<Record<string, string>>({});

  // Pricing tier state
  const [productPricingMap, setProductPricingMap] = useState<Record<string, Record<string, number>>>({});
  const [selectedTierId, setSelectedTierId] = useState('');

  // Page-wise UPI Configuration and sources state
  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [isUpiSelectModalOpen, setIsUpiSelectModalOpen] = useState(false);
  const [isBillerPinModalOpen, setIsBillerPinModalOpen] = useState(false);
  const [partiesForTier, setPartiesForTier] = useState<any[]>([]);
  const canOverrideTier = isAdminRole(authRole) || allowBillerOverride;

  // Sync local discount + pcs/kg state when items are added/removed
  useEffect(() => {
    const ids = new Set(items.map(i => i.product_id));

    setLocalDiscPcts(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        if (!(item.product_id in prev)) { next[item.product_id] = item.discount_percent ?? 0; changed = true; }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
    setLocalDiscFlats(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        if (!(item.product_id in prev)) { next[item.product_id] = item.discount_flat ?? 0; changed = true; }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
    // Pcs/Kg local strings: initialise for new items, clean up removed items.
    // Do NOT overwrite if the user is mid-edit (key already present).
    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    setLocalPcsStr(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
        if (isPiecesWeight) {
          const numPcs = item.pieces_override ?? 1;
          const curNum = parseInt(prev[item.product_id] || '', 10);
          if (!(item.product_id in prev) || (item.pieces_override !== undefined && prev[item.product_id] !== '' && !isNaN(curNum) && curNum !== numPcs)) {
            next[item.product_id] = String(numPcs);
            changed = true;
          }
        }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
    setLocalKgStr(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
        if (isPiecesWeight) {
          const numKg = Number(item.quantity);
          const curNum = parseFloat(prev[item.product_id] || '');
          if (!(item.product_id in prev) || (item.quantity !== undefined && prev[item.product_id] !== '' && !isNaN(curNum) && curNum !== numKg)) {
            next[item.product_id] = String(item.quantity ?? '');
            changed = true;
          }
        }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
  }, [items]);

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
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [mostSoldProducts, setMostSoldProducts] = useState<any[]>([]);
  const [scrapDeductionSearchQuery, setScrapDeductionSearchQuery] = useState('');
  const [scrapDeductionResults, setScrapDeductionResults] = useState<any[]>([]);

  // Return deduction search (similar to scrap deduction search)
  const [returnDeductionSearchQuery, setReturnDeductionSearchQuery] = useState('');
  const [returnDeductionResults, setReturnDeductionResults] = useState<any[]>([]);
  const [, setReturnDeductionSearchMode] = useState(false);
  const [deductionTabMode, setDeductionTabMode] = useState<'scrap' | 'return' | 'points'>('scrap');

  // Loyalty points state
  const [loyaltyCustomerData, setLoyaltyCustomerData] = useState<{
    customerId: string | null;
    pointsBalance: number;
  }>({ customerId: null, pointsBalance: 0 });
  const [showLoyaltyRedemption, setShowLoyaltyRedemption] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Modern ERP B2C Grid States (Acro / Tally Desktop ERP Model)
  const [erpNarration, setErpNarration] = useState('');
  const [erpSalesRep, setErpSalesRep] = useState('');
  const [focusedRowProductId, setFocusedRowProductId] = useState<string | null>(null);

  const customerFields = useCustomerFieldState();
  const { setShowCustomerDropdown, customerNameInputRef } = customerFields;
  const paymentOptionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeCartProductIdRef = useRef<string | null>(null);

  const { focusFirstCartField, focusLastCartField, focusNextCartField, focusPrevCartField, focusCustomerFieldsReverse, handleRateUpDown, focusDescriptionOrDiscount } = useCartFocus({
    customerFields, activeCartProductIdRef, descriptionInputRef, discFlatRefs, discountRef, discRefs,
    invoiceType, items, kRefs, lastAddedProductId, pcsRefs, qtyRefs, rateKgRefs, ratePcRefs, searchRef,
    setFocusedRowProductId, showDescriptionState, tierRefs, totalInputRefs,
  });

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const isCheckingOutRef = useRef(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<'saved' | 'printed' | false>(false);
  const [upiAccountToast, setUpiAccountToast] = useState<string | null>(null);
  const [returnSuccessToast, setReturnSuccessToast] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [activeDiscField, setActiveDiscField] = useState<'PCT' | 'FLAT' | null>(null);
  const [localDiscText, setLocalDiscText] = useState<string>('');
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [overrideTotalInput, setOverrideTotalInput] = useState('');

  useEffect(() => {
    if (discountValue === 0) {
      setActiveDiscField(null);
      setLocalDiscText('');
    }
  }, [discountValue, activeTabId]);

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
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);
  const lastActiveTabId = useRef(activeTabId);
  const prevScrapMode = useRef(isScrapMode);
  const prevReturnMode = useRef(isReturnMode);
  // Clean up incompatible items when scrap mode changes
  useEffect(() => {
    if (lastActiveTabId.current !== activeTabId) {
      prevScrapMode.current = isScrapMode;
      return;
    }
    if (prevScrapMode.current && !isScrapMode) {
      items.filter(i => i.isScrap).forEach(i => removeItem(i.product_id));
    } else if (!prevScrapMode.current && isScrapMode) {
      items.filter(i => !i.isScrap).forEach(i => removeItem(i.product_id));
      clearScrapDeduction();
    }
    prevScrapMode.current = isScrapMode;
  }, [isScrapMode, activeTabId]);

  // Clean up return items when return mode toggles
  useEffect(() => {
    if (lastActiveTabId.current !== activeTabId) {
      prevReturnMode.current = isReturnMode;
      return;
    }
    if (prevReturnMode.current && !isReturnMode) {
      useCartStore.setState(s => ({
        items: s.items.filter(i => !i.isReturnItem)
      }));
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
      setSelectedReturnInvoice(null);
      reserveInvoiceNumberForTab();
      syncActiveSnapshot();
    } else if (!prevReturnMode.current && isReturnMode) {
      useCartStore.setState(s => ({
        items: s.items.filter(i => i.isReturnItem)
      }));
      clearReturnDeduction();
      reserveReturnNumberForTab();
      syncActiveSnapshot();
    }
    prevReturnMode.current = isReturnMode;
  }, [isReturnMode, activeTabId]);

  useEffect(() => {
    if (!enableScrap && isScrapMode) {
      setIsScrapMode(false);
    }
  }, [enableScrap, isScrapMode]);

  useEffect(() => {
    if (!featureFlags) return;
    if (featureFlags.quotations === false && isQuotationMode) setQuotationMode(false);
    if (featureFlags.returns === false && isReturnMode) setReturnMode(false);
    if (featureFlags.cash_settlement === false && activeTab?.paymentMethod === 'PENDING') {
      updateActiveTab({ paymentMethod: 'CASH' });
    }
  }, [featureFlags, isQuotationMode, isReturnMode, activeTab?.paymentMethod, setQuotationMode, setReturnMode, updateActiveTab]);

  useEffect(() => {
    if (!isCashSettlementEnabled && activeTab?.paymentMethod === 'PENDING') {
      updateActiveTab({ paymentMethod: 'CASH' });
    }
  }, [isCashSettlementEnabled, activeTab?.paymentMethod, updateActiveTab]);

  // Update tab title when mode changes (normal, scrap, quotation, return)
  const prevReserveMode = useRef<'normal' | 'scrap' | 'return' | 'quotation' | null>(null);
  useEffect(() => {
    syncActiveSnapshot();
    if (lastActiveTabId.current !== activeTabId) {
      prevReserveMode.current = isScrapMode ? 'scrap' : isReturnMode ? 'return' : isQuotationMode ? 'quotation' : 'normal';
      return;
    }
    const currentMode = isScrapMode ? 'scrap' : isReturnMode ? 'return' : isQuotationMode ? 'quotation' : 'normal';
    if (prevReserveMode.current !== currentMode && !editingInvoiceNumber) {
      prevReserveMode.current = currentMode;
      const tab = getActiveTab();
      if (tab) {
        let targetNum = tab.reservedInvoiceNumber;
        if (isScrapMode) targetNum = tab.reservedScrapInvoiceNumber;
        else if (isQuotationMode) targetNum = tab.reservedQuotationNumber;
        else if (isReturnMode) targetNum = tab.reservedReturnNumber;

        const shouldUpdate = !tab.title || tab.title === 'New' || tab.title === 'New Quote' || tab.title === tab.reservedInvoiceNumber || tab.title === tab.reservedScrapInvoiceNumber || tab.title === tab.reservedQuotationNumber || tab.title === tab.reservedReturnNumber || tab.title.startsWith('Bill ') || tab.title.startsWith('GST-');
        if (targetNum && shouldUpdate) {
          updateActiveTab({ title: targetNum });
        }
      }
    }
  }, [isScrapMode, isReturnMode, isQuotationMode, activeTabId, getActiveTab, updateActiveTab, editingInvoiceNumber, syncActiveSnapshot]);

  useEffect(() => {
    lastActiveTabId.current = activeTabId;
  }, [activeTabId]);

  // Local return mode transient state
  const [selectedReturnInvoice, setSelectedReturnInvoice] = useState<any | null>(null);
  const [returnProcessing, setReturnProcessing] = useState(false);
  const returnProcessingRef = useRef(false);
  const pendingCheckoutSaveOnlyRef = useRef<boolean | null>(null);
  const [returnProcessed, setReturnProcessed] = useState(false);

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
    if (Object.keys(updates).length) updateActiveTab(updates as any);
  };

  const rawPaymentMethod = activeTab?.paymentMethod;
  const defaultPaymentMethod = isCashSettlementEnabled ? 'PENDING' : 'CASH';
  const paymentMethod = (!isCashSettlementEnabled && (!rawPaymentMethod || rawPaymentMethod === 'PENDING'))
    ? 'CASH'
    : (rawPaymentMethod ?? defaultPaymentMethod);
  const rawSplitDetails = activeTab?.splitDetails;
  const splitDetails: SplitDetails = typeof rawSplitDetails === 'string'
    ? (() => {
        let curr: any = rawSplitDetails;
        while (typeof curr === 'string') {
          try { curr = JSON.parse(curr); } catch { break; }
        }
        return (typeof curr === 'object' && curr !== null) ? curr : { cash: 0, card: 0, upi: 0, bank_transfer: 0 };
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
    ? (upiSources.find((s: any) =>
         (activeTab?.selectedUpiSourceId && s.source_id === activeTab.selectedUpiSourceId) ||
         (activeTab?.selectedUpiId && (s.source_id === activeTab.selectedUpiId || s.upi_id === activeTab.selectedUpiId))
       )
       || (lastSelectedSourceId ? upiSources.find((s: any) => s.source_id === lastSelectedSourceId || s.upi_id === lastSelectedSourceId) : null)
       || upiSources.find((s: any) => s.is_default === 1)
       || upiSources[0])
    : null;

    const reserveInvoiceNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveInvoiceNumber({ tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isScrapMode, isQuotationMode, isReturnMode, editingActive }, forceRefresh);
  }, [tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isB2B, isScrapMode, isQuotationMode, isReturnMode, editingActive]);

  const handleInvoiceTypeChange = async (type: 'GST' | 'BILL_OF_SUPPLY') => {
    setInvoiceType(type);
    setTimeout(() => {
      syncActiveSnapshot();
    }, 0);

    await refreshInvoiceNumberForType({ tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, customerGstin }, type);
  };

  const reserveScrapInvoiceNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveScrapInvoiceNumber({ getActiveTab, updateActiveTab, editingActive }, forceRefresh);
  }, [getActiveTab, updateActiveTab, editingActive]);

  const reserveQuotationNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveQuotationNumber({ getActiveTab, updateActiveTab, editingQuotationId }, forceRefresh);
  }, [getActiveTab, updateActiveTab, editingQuotationId]);

  const reserveReturnNumberForTab = useCallback(async (forceRefresh = false) => {
    await reserveReturnNumber({ tenantId, getActiveTab, updateActiveTab }, forceRefresh);
  }, [tenantId, getActiveTab, updateActiveTab]);

  const toggleQuotationMode = useQuotationToggle({
    activeTabId, invoiceType, isQuotationMode, isScrapMode, isReturnMode, isPastBillMode, quotationGstEnabledSetting,
    setQuotationMode, setIsScrapMode, setReturnMode, setIsPastBillMode, setInvoiceType, reserveQuotationNumberForTab,
  });

  const totalDeductions = (storeScrapDeduction || 0) + (storeReturnDeduction || 0);
  // Return credit is consumed first (up to the bill total); its leftover stays as
  // pending ADJUST_BILL credit for a future bill (not cash-refunded). Only scrap
  // credit excess is refunded as cash (existing behavior).
  const returnConsumed = Math.min(storeReturnDeduction || 0, grandTotal);
  const refundAmount = !isScrapMode ? Math.max(0, totalDeductions - grandTotal) : 0;

  const returnSubtotal = items.filter(i => i.isReturnItem).reduce((sum, item) => {
    return sum + (Number(item.originalUnitPrice) || 0) * (Number(item.quantity) || 0);
  }, 0);
  const returnTaxTotal = items.filter(i => i.isReturnItem).reduce((sum, item) => {
    const origQty = Number(item.originalQuantity) || 1;
    return sum + ((Number(item.originalTaxAmount) || 0) / origQty) * (Number(item.quantity) || 0);
  }, 0);
  const returnTotal = returnSubtotal;
  const originalReturnTotal = items.filter(i => i.isReturnItem).reduce((sum, item) => {
    return sum + (Number(item.rawUnitPrice) || Number(item.originalUnitPrice) || 0) * (Number(item.quantity) || 0);
  }, 0);
  const returnDiscountTotal = Math.max(0, originalReturnTotal - returnTotal);
  const rawDisplayGrandTotal = isScrapMode
    ? scrapTotal + extraBonus
    : isReturnMode
      ? returnSubtotal + returnTaxTotal
      : Math.max(0, grandTotal - (storeScrapDeduction || 0) - (storeReturnDeduction || 0));

  const customerPointsBalance = Number(loyaltyCustomerData?.pointsBalance) || 0;
  const pointsRedeemedCalc = (isLoyaltyModuleEnabled && pointsToRedeem > 0)
    ? Math.min(pointsToRedeem, customerPointsBalance)
    : 0;
  const pointsRedeemedDiscountCalc = pointsRedeemedCalc * loyaltyRedemptionRate;

  const isGrandTotalOverridden = !isScrapMode && !isReturnMode && activeTab?.manualTotalOverride != null && activeTab.manualTotalOverride > 0;
  const displayGrandTotal = Math.max(
    0,
    (isGrandTotalOverridden ? activeTab.manualTotalOverride! : rawDisplayGrandTotal) - pointsRedeemedDiscountCalc
  );
  const balanceAmount = receivedAmount - displayGrandTotal;

  const startEditingTotal = useCallback(() => {
    if (isScrapMode || isReturnMode || items.length === 0) return;
    setOverrideTotalInput(String(displayGrandTotal || ''));
    setIsEditingTotal(true);
    setTimeout(() => {
      totalOverrideInputRef.current?.focus();
      totalOverrideInputRef.current?.select();
    }, 40);
  }, [isScrapMode, isReturnMode, items.length, displayGrandTotal]);

  const handleResetGrandTotalOverride = useCallback(() => {
    setDiscount(0, 'FIXED');
    updateActiveTab({ manualTotalOverride: null });
    setIsEditingTotal(false);
    setOverrideTotalInput('');
  }, [setDiscount, updateActiveTab]);

  const commitTotalOverride = useCallback(() => {
    if (!overrideTotalInput || overrideTotalInput.trim() === '') {
      handleResetGrandTotalOverride();
      return;
    }
    const targetVal = parseFloat(overrideTotalInput);
    if (isNaN(targetVal) || targetVal < 0) {
      setIsEditingTotal(false);
      return;
    }

    const effectiveTaxRate = (subtotal > 0 && totalTax > 0) ? (totalTax / Math.max(1, subtotal - (discount || 0))) : 0;
    const deductions = (storeScrapDeduction || 0) + (storeReturnDeduction || 0);
    const basePayableBeforeDiscount = Math.max(0, (subtotal * (1 + effectiveTaxRate)) - deductions);

    if (targetVal < basePayableBeforeDiscount) {
      const shortfall = basePayableBeforeDiscount - targetVal;
      const neededDisc = effectiveTaxRate > 0 ? shortfall / (1 + effectiveTaxRate) : shortfall;
      const roundedDisc = Math.round(neededDisc * 100) / 100;
      setDiscount(roundedDisc, 'FIXED');
    } else {
      setDiscount(0, 'FIXED');
    }

    updateActiveTab({ manualTotalOverride: targetVal });
    setIsEditingTotal(false);
    setInfoToast(`Grand Total overridden to ₹${targetVal.toFixed(2)}`);
    setTimeout(() => setInfoToast(null), 2500);
  }, [overrideTotalInput, subtotal, totalTax, discount, storeScrapDeduction, storeReturnDeduction, setDiscount, updateActiveTab, handleResetGrandTotalOverride]);

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

  // Scrap invoice view state
  const [showScrapInvoiceView, setShowScrapInvoiceView] = useState(false);
  const [scrapInvoiceViewData, setScrapInvoiceViewData] = useState<{ transactions: any[]; totalAmount: number; invoiceNumber: string } | null>(null);
  const [scrapInvoiceViewLoading, _setScrapInvoiceViewLoading] = useState(false);

  // Quotation state
  const [quotationTerms, setQuotationTerms] = useState('1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.');
  const [quotationSaving, setQuotationSaving] = useState(false);
  const [quotationSuccess, setQuotationSuccess] = useState<string | null>(null);

  const { loadScrapInvoiceForEdit } = useScrapInvoiceEdit({
    addItem, clearCart, clearScrapDeduction, editingInvoiceNumber, getActiveTab, isScrapMode, setDiscount,
    setIsPastBillMode, setIsScrapMode, setQuotationMode, setReturnMode, setSelectedReturnInvoice,
    syncActiveSnapshot, tenantId, updateActiveTab,
  });

  // Closing the billing page — clear modes persisted in the global cart store
  // (Return/Quotation) so the next open starts fresh, without a one-frame flash
  // of the previously active mode. Scrap & Past-Bill are local state and already
  // reset on remount. External flows (SalesHistory return, scrap edit) re-enable
  // their mode via events fired after remount.
  useEffect(() => {
    return () => {
      const currentActiveTab = useTabStore.getState().getActiveTab();
      if (currentActiveTab?.snapshot?.isQuotationMode) {
        return;
      }
      if (localStorage.getItem('pendingNewQuotation') === 'true' || localStorage.getItem('editQuotationData') || localStorage.getItem('editBillData')) {
        return;
      }
      const wasReturn = useCartStore.getState().isReturnMode || Boolean(currentActiveTab?.snapshot?.isReturnMode);
      if (wasReturn) {
        useTabStore.getState().updateActiveTab({
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
      useCartStore.getState().setReturnMode(false);
      useCartStore.getState().setQuotationMode(false);
    };
  }, []);

  useEffect(() => {
    const handleEditScrapInvoiceEvent = (e: any) => {
      const invNum = e.detail?.invoiceNumber;
      if (invNum) {
        useCartStore.getState().setIsScrapMode(true);
        updateActiveTab({ title: invNum, reservedScrapInvoiceNumber: invNum });
        loadScrapInvoiceForEdit(invNum);
      }
    };

    window.addEventListener('edit-scrap-invoice' as any, handleEditScrapInvoiceEvent as EventListener);
    return () => {
      window.removeEventListener('edit-scrap-invoice' as any, handleEditScrapInvoiceEvent as EventListener);
    };
  }, [loadScrapInvoiceForEdit, updateActiveTab]);

  useSearchResultsLoader({
    search: productSearch, tenantId, invoiceType, isScrapMode, isReturnMode, isQuotationMode,
    enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting,
  });

  useMostSoldProducts({
    setMostSoldProducts, tenantId, uiConfig,
  });

  // Scrap deduction search
  useEffect(() => {
    if (storeScrapDeduction > 0 || scrapDeductionSearchQuery.length < 1) { setScrapDeductionResults([]); return; }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const tid = tenantId || 'global';
      const list = await scrapApi.getScrapInvoiceList({ tenant_id: tid });
      if (Array.isArray(list)) {
        const q = scrapDeductionSearchQuery.toUpperCase();
        const getNumPart = getNumericPart;
        const filtered = list.filter(inv => {
          const invNum = String(inv.invoice_number).toUpperCase();
          const numPart = getNumPart(invNum);
          return (invNum.includes(q) || (q.length >= 1 && getNumPart(q).length > 0 && numPart.includes(getNumPart(q)))) &&
            inv.payment_status === 'PENDING';
        });
        setScrapDeductionResults(filtered.slice(0, 8));
        if (filtered.length > 0 && scrapDeductionInputRef.current) {
          const rect = scrapDeductionInputRef.current.getBoundingClientRect();
          setScrapDeductionDropdownStyle({
            position: 'fixed',
            bottom: `${window.innerHeight - rect.top + 4}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            zIndex: 9999,
          });
        } else {
          setScrapDeductionDropdownStyle(null);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [scrapDeductionSearchQuery, storeScrapDeduction, tenantId]);

  // Return deduction search
  useEffect(() => {
    if (storeReturnDeduction > 0 || returnDeductionSearchQuery.length < 1) { setReturnDeductionResults([]); return; }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const tid = tenantId || 'global';
      const list = await returnsApi.getPendingReturnInvoices({ tenant_id: tid });
      if (Array.isArray(list)) {
        const q = returnDeductionSearchQuery.toUpperCase();
        const getNumPart = getNumericPart;
        const qNum = getNumPart(q);
        const filtered = list.filter((r: any) => {
          const retNum = String(r.return_number).toUpperCase();
          const custName = String(r.customer_name || '').toUpperCase();
          const custPhone = String(r.customer_phone || '').toUpperCase();
          const numPart = getNumPart(retNum);
          return retNum.includes(q) ||
            custName.includes(q) ||
            custPhone.includes(q) ||
            (q.length >= 1 && qNum.length > 0 && (numPart.includes(qNum) || Number(numPart) === Number(qNum)));
        });
        setReturnDeductionResults(filtered.slice(0, 8));
        if (filtered.length > 0 && returnDeductionInputRef.current) {
          const rect = returnDeductionInputRef.current.getBoundingClientRect();
          setReturnDeductionDropdownStyle({
            position: 'fixed',
            bottom: `${window.innerHeight - rect.top + 4}px`,
            left: `${rect.left}px`,
            width: `${Math.max(rect.width, 280)}px`,
            zIndex: 9999,
          });
        } else {
          setReturnDeductionDropdownStyle(null);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [returnDeductionSearchQuery, storeReturnDeduction, tenantId]);

  const scrapDeductionInputRef = useRef<HTMLInputElement>(null);
  const [scrapDeductionDropdownStyle, setScrapDeductionDropdownStyle] = useState<React.CSSProperties | null>(null);
  const returnDeductionInputRef = useRef<HTMLInputElement>(null);
  const [returnDeductionDropdownStyle, setReturnDeductionDropdownStyle] = useState<React.CSSProperties | null>(null);
  const pointsDeductionInputRef = useRef<HTMLInputElement>(null);

  const { allCustomersList, filteredCustomerSuggestions, findMatchingParty, setCustomerSearchResults } = useCustomerDirectory({
    tenantId,
    staffCreditBilling: featureFlags?.staff_credit_billing,
    parties: partiesForTier,
    customerName,
    customerPhone,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setResults([]);
        setPastBillResults([]);
        setSearchQuery('');
        if (!productFormDialogRef.current?.contains(e.target as Node) && !gradeFormDialogRef.current?.contains(e.target as Node)) {
          setShowProductCreateForm(false);
        }
      }
      const scrapDropdown = document.getElementById('scrap-deduction-dropdown');
      if (scrapDeductionInputRef.current && !scrapDeductionInputRef.current.parentElement?.contains(e.target as Node) && !scrapDropdown?.contains(e.target as Node)) {
        setScrapDeductionResults([]);
        setScrapDeductionDropdownStyle(null);
      }
      const returnDropdown = document.getElementById('return-deduction-dropdown');
      if (returnDeductionInputRef.current && !returnDeductionInputRef.current.parentElement?.contains(e.target as Node) && !returnDropdown?.contains(e.target as Node)) {
        setReturnDeductionResults([]);
        setReturnDeductionDropdownStyle(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchContainerRef, setPastBillResults, setResults, setSearchQuery, gradeFormDialogRef, productFormDialogRef, setShowProductCreateForm]);

  useEffect(() => {
    if (!showProductCreateForm) return;

    const focusTimer = window.setTimeout(() => firstInputRef.current?.focus(), 50);
    let cancelled = false;

    // Editing must preserve the barcode belonging to the selected cart product.
    // Barcode generation here is only a convenience for a new product.
    if (!editingProductId && isDesktopRuntime() && tenantId) {
      (async () => {
        try {
          const gen = await productsApi.generateBarcode({ tenant_id: tenantId });
          if (!cancelled && gen?.success && gen?.barcode) {
            setNewProductBarcode(gen.barcode);
          }
        } catch (err) {
          console.error("Failed to generate auto barcode", err);
        }
      })();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
    };
  }, [showProductCreateForm, editingProductId, tenantId, firstInputRef, setNewProductBarcode]);

  const [isLoadingEditBill, setIsLoadingEditBill] = useState(false);

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

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-focusable-checkbox]');
    const idx = Array.from(focusable).indexOf(target as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    if (idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

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
  }, [hardwareError]);

  const { handleSaveQuotation } = useSaveQuotation({
    bankAccountState, bankBranchState, bankIfscState, bankNameState, clearCart, customerAddress, customerGstin,
    customerName, customerPhone, customerState, editingQuotationId, editingQuotationNumber,
    enableThreeInvoiceSeries, getActiveTab, invoiceType, isCashSettlementEnabled, items,
    quotationGstEnabledSetting, quotationTerms, reserveInvoiceNumberForTab, reserveQuotationNumberForTab,
    setEditingQuotation, setHardwareError, setQuotationMode, setQuotationSaving, setQuotationSuccess,
    setQuotationTerms, shopAddress, shopEmail, shopGstin, shopName, shopNameState, shopPhone, shopState,
    shopWebsite, syncActiveSnapshot, tenantId, uiConfig, updateActiveTab, upiId, userName,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === ' ' && !showProductCreateForm && !isScrapMode && !isReturnMode && !isPastBillMode) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !isEditable) {
          e.preventDefault();
          setShowProductCreateForm(true);
          setNewProductName('');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showProductCreateForm, isScrapMode, isReturnMode, isPastBillMode, setNewProductName, setShowProductCreateForm]);

  const fillRestForField = (field: 'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT') => {
    const cash = field === 'CASH' ? 0 : (Number(splitDetails.cash) || 0);
    const card = field === 'CARD' ? 0 : (Number(splitDetails.card) || 0);
    const upi = field === 'UPI' ? 0 : (Number(splitDetails.upi) || 0);
    const cheque = field === 'CHEQUE' ? 0 : (Number(splitDetails.cheque) || 0);
    const credit = field === 'CREDIT' ? 0 : (Number(splitDetails.credit) || 0);
    const bankTransfer = Number(splitDetails.bank_transfer) || 0;

    const otherSum = cash + card + upi + cheque + credit + bankTransfer;
    const rem = Math.max(0, Number((displayGrandTotal - otherSum).toFixed(2)));

    const nextDetails: SplitDetails = {
      ...splitDetails,
      [field.toLowerCase()]: rem,
    };

    const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);

    updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
    setInfoToast(`Filled Rest: ₹${rem} into ${field}`);
    setTimeout(() => setInfoToast(null), 1500);
  };

  const { handleQtyKeyDown, focusCartItemQuantityOrPcs, handlePcsKeyDown, handleSplitInputKeyDown, sanitizeQtyText, guardScannerInput, handleDiscKeyDown, handleDiscFlatKeyDown, handleTotalInputKeyDown } = useCartKeyboard({
    discFlatRefs, discountRef, discRefs, displayGrandTotal, fillRestForField, focusDescriptionOrDiscount,
    focusNextCartField, focusPrevCartField, items, lastAddedProductId, paymentMethod, paymentOptionRefs,
    pcsRefs, qtyKeyTimesRef, qtyRefs, qtySnapshotsRef, receivedInputRef, removeItem, searchRef, setInfoToast,
    splitCardInputRef, splitCashInputRef, splitChequeInputRef, splitCreditInputRef, splitDetails,
    splitUpiInputRef, totalInputRefs, updateActiveTab,
  });

  const handleCheckout = createCheckoutHandler({
    items, setHardwareError, isCheckingOutRef, activeTabId, setIsCheckingOut, isScrapMode, scrapTotal, extraBonus, scrapPaymentStatus, customerName, customerPhone, tenantId, customerAddress, userId: userId as string, userName, shopNameState, shopName, shopGstin, shopAddress, shopPhone, authRole, discount, customerState, setCheckoutSuccess, uiConfig, setIsScrapMode, closeTab, clearCart, updateActiveTab, isCashSettlementEnabled, reserveScrapInvoiceNumberForTab, reserveInvoiceNumberForTab, getActiveTab, syncActiveSnapshot, pendingCheckoutSaveOnlyRef, setIsBillerPinModalOpen, pcsRefs, qtyRefs, localPcsStr, invoiceType, isB2B, isQuotationMode, isReturnMode, customerGstin, paymentMethod, splitDetails, splitTotal, displayGrandTotal, loyaltyEnabled, pointsToRedeem, loyaltyCustomerData, loyaltyRedemptionRate, receivedAmount, refundAmount, balanceAmount, enableThreeInvoiceSeries, terminalCodeState, bosTaxRatePercent, bosTaxInclusive, loyaltyAwardOnPending, loyaltyEarningRate, isGrandTotalOverridden, activeTab, storeScrapDeduction, storeReturnDeduction, grandTotal, findMatchingParty, shopEmail, shopWebsite, bankNameState, bankAccountState, bankIfscState, bankBranchState, upiId, showUpiQr, subtotal, totalTax, cgst, sgst, igst, storeScrapInvoiceNumber, storeReturnInvoiceNumber, currentSelectedUpi, actualRefundPaid, returnConsumed, editingQuotationId, setPartiesForTier, setInvoiceType, clearScrapDeduction, clearReturnDeduction, setLoyaltyCustomerData, setShowLoyaltyRedemption, setPointsToRedeem,
  });

  const { handleProcessReturnFromCart } = useReturnFromCart({
    activeTabId, clearCart, clearReturnDeduction, closeTab, customerAddress, customerName, customerPhone,
    getActiveTab, isCashSettlementEnabled, items, reserveInvoiceNumberForTab, reserveReturnNumberForTab,
    returnDiscountTotal, returnProcessingRef, returnRefundMethod, selectedReturnInvoice, setHardwareError,
    setPartiesForTier, setReturnDeduction, setReturnMode, setReturnProcessed, setReturnProcessing,
    setReturnSuccessToast, setSelectedReturnInvoice, shopAddress, shopName, shopNameState, shopPhone,
    syncActiveSnapshot, tenantId, uiConfig, updateActiveTab, userId,
  });

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const { handleWhatsAppSendActiveBill } = useWhatsAppSend({
    activeTab, customerAddress, customerGstin, customerName, customerPhone, discount, displayGrandTotal,
    invoiceType, items, paymentMethod, receivedAmount, setHardwareError, setInfoToast, setIsSendingWhatsApp,
    shopAddress, shopGstin, shopName, shopNameState, shopPhone, subtotal, tenantId, totalTax,
  });

  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldBillsPanel, setShowHeldBillsPanel] = useState(false);
  const [heldBillsLoading, setHeldBillsLoading] = useState(false);

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
    customerPointsBalance,
    effectiveDeductionMode,
    isLoyaltyModuleEnabled,
    isReturnModuleEnabled,
    isScrapModuleEnabled,
    pointsDeductionInputRef,
    pointsRedeemedCalc,
    pointsRedeemedDiscountCalc,
    pointsToRedeem,
    returnDeductionInputRef,
    returnDeductionSearchQuery,
    scrapDeductionInputRef,
    scrapDeductionSearchQuery,
    setDeductionTabMode,
    setHardwareError,
    setPointsToRedeem,
    setReturnDeductionDropdownStyle,
    setReturnDeductionResults,
    setReturnDeductionSearchMode,
    setReturnDeductionSearchQuery,
    setScrapDeductionDropdownStyle,
    setScrapDeductionResults,
    setScrapDeductionSearchQuery,
    tenantId,
  };
  const searchBarSection = <BillingSearchBar
    getTierPriceForProduct={getTierPriceForProduct}
    handleSearchKey={handleSearchKey}
    handleSelectPastBill={handleSelectPastBill}
    handleSelectProduct={handleSelectProduct}
    handleSelectReturnInvoice={handleSelectReturnInvoice}
    handleSelectScrapItem={handleSelectScrapItem}
    invoiceType={invoiceType}
    isQuotationActive={isQuotationActive}
    isQuotationMode={isQuotationMode}
    isReturnMode={isReturnMode}
    isScrapActive={isScrapActive}
    isScrapMode={isScrapMode}
    productSearch={productSearch}
    searchRef={searchRef}
    setIsScrapMode={setIsScrapMode}
    setNewProductName={setNewProductName}
    setQuotationMode={setQuotationMode}
    setReturnMode={setReturnMode}
    setShowProductCreateForm={setShowProductCreateForm}
    showProductCreateForm={showProductCreateForm}
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

      <div 
        className={clsx(
          "flex flex-1 overflow-hidden bg-background transition-all duration-300",
          uiConfig.layoutModel === 'erp-grid-b2c' && "hidden",
          uiConfig.orientation === 'horizontal-stack' ? "flex-col" :
          uiConfig.layoutPosition === 'cart-right' ? "flex-row-reverse" : "flex-row"
        )}
      >
        {/* ═══ EXPRESS MOST SOLD PRODUCTS (3-COLUMN LAYOUT) ═══ */}
        {(uiConfig.orientation === 'three-column' || uiConfig.showQuickCategoryBar) && (
          <div className="w-[22%] border-r border-border bg-muted/20 p-3 space-y-2 shrink-0 hidden md:block overflow-y-auto">
            <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center justify-between">
              <span>Products - Most Sold</span>
              <TrendingUp className="w-3 h-3 text-amber-500" />
            </div>
            <div className="space-y-1.5">
              {mostSoldProducts.length > 0 ? (
                mostSoldProducts.map((prod) => (
                  <button
                    key={prod.product_id || prod.id || prod.name}
                    onClick={() => handleSelectProduct(prod)}
                    className="w-full text-left p-2.5 rounded-xl border border-border bg-card hover:bg-accent/10 hover:border-primary/40 text-foreground transition-all cursor-pointer shadow-xs active:scale-95 flex flex-col gap-0.5 group"
                  >
                    <div className="text-xs font-bold truncate group-hover:text-primary transition-colors">{prod.name}</div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                      <span>₹{prod.base_price || 0}</span>
                      {prod.current_stock !== undefined && (
                        <span className={clsx(prod.current_stock <= 5 ? "text-amber-500 font-bold" : "")}>
                          Stock: {prod.current_stock}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-xs text-muted-foreground italic text-center py-4">No products found</div>
              )}
            </div>
          </div>
        )}
        
        {/* ═══ TOP / LEFT SIDE: Search + Cart (Dynamic Width & Layout) ═══ */}
        <BillingCartView
          uiConfig={uiConfig}
          isLoadingEditBill={isLoadingEditBill}
          productPricingMap={productPricingMap}
          pricingTiers={pricingTiers}
          searchBarSection={searchBarSection}
          customerDetailsSection={<BillingCustomerDetails
            activeTab={activeTab}
            canOverrideTier={canOverrideTier}
            customerAddress={customerAddress}
            customerFields={customerFields}
            customerGstin={customerGstin}
            customerHandlers={customerHandlers}
            customerName={customerName}
            customerPhone={customerPhone}
            customerState={customerState}
            displayGrandTotal={displayGrandTotal}
            editingActive={editingActive}
            enableThreeInvoiceSeries={enableThreeInvoiceSeries}
            filteredCustomerSuggestions={filteredCustomerSuggestions}
            findMatchingParty={findMatchingParty}
            handleInvoiceTypeChange={handleInvoiceTypeChange}
            handlePricingTierChange={handlePricingTierChange}
            invoiceType={invoiceType}
            isB2B={isB2B}
            isQuotationMode={isQuotationMode}
            isReturnMode={isReturnMode}
            isScrapMode={isScrapMode}
            loyaltyCustomerData={loyaltyCustomerData}
            loyaltyEnabled={loyaltyEnabled}
            onGstSeriesChange={(series) => { void reserveGstSeriesNumber({ tenantId, getActiveTab, updateActiveTab }, series); }}
            paymentMethod={paymentMethod}
            pricingTiers={pricingTiers}
            receivedAmount={receivedAmount}
            selectedTierId={selectedTierId}
            setCustomerState={setCustomerState}
            setLoyaltyCustomerData={setLoyaltyCustomerData}
            splitDetails={splitDetails}
            uiConfig={uiConfig}
            updateActiveTab={updateActiveTab}
          />}
          localKgStr={localKgStr}
          setLocalKgStr={setLocalKgStr}
          localPcsStr={localPcsStr}
          setLocalPcsStr={setLocalPcsStr}
          localDiscPcts={localDiscPcts}
          setLocalDiscPcts={setLocalDiscPcts}
          localDiscFlats={localDiscFlats}
          setLocalDiscFlats={setLocalDiscFlats}
          itemRefs={itemRefs}
          qtyRefs={qtyRefs}
          pcsRefs={pcsRefs}
          kRefs={kRefs}
          rateKgRefs={rateKgRefs}
          ratePcRefs={ratePcRefs}
          discRefs={discRefs}
          discFlatRefs={discFlatRefs}
          totalInputRefs={totalInputRefs}
          pendingFocusProductIdRef={pendingFocusProductIdRef}
          activeCartProductIdRef={activeCartProductIdRef}
          setFocusedRowProductId={setFocusedRowProductId}
          focusNextCartField={focusNextCartField}
          focusPrevCartField={focusPrevCartField}
          handleRateUpDown={handleRateUpDown}
          handleEditProduct={handleEditProduct}
          handleQtyKeyDown={handleQtyKeyDown}
          handlePcsKeyDown={handlePcsKeyDown}
          handleDiscKeyDown={handleDiscKeyDown}
          handleDiscFlatKeyDown={handleDiscFlatKeyDown}
          handleTotalInputKeyDown={handleTotalInputKeyDown}
          guardScannerInput={guardScannerInput}
          sanitizeQtyText={sanitizeQtyText}
        />

        {/* ═══ RIGHT / BOTTOM SIDE: Transaction Console & Payment (Dynamic Width & Layout) ═══ */}
        <div 
          className={clsx(
            "bg-card dark:bg-card shadow-2xl z-25 transition-all duration-300",
            uiConfig.orientation === 'horizontal-stack'
              ? "w-full flex flex-row h-[320px] shrink-0 border-t-2 border-border overflow-hidden"
              : "flex flex-col " + (
                (uiConfig.orientation === 'three-column' || uiConfig.showQuickCategoryBar)
                  ? "w-[30%] border-l border-border"
                  : uiConfig.splitRatio === '50-50' ? "w-[50%] border-l border-border"
                  : uiConfig.splitRatio === '65-35' ? "w-[35%] border-l border-border"
                  : uiConfig.splitRatio === '70-30' ? "w-[30%] border-l border-border"
                  : "w-[42%] border-l border-border"
              )
          )}
        >

          {/* ── Scrollable content area (Left Side of Bottom Bar in Horizontal Stack Mode) ── */}
          <BillingPaymentPanel
            currentSelectedUpi={currentSelectedUpi}
            deductions={deductions}
            descriptionInputRef={descriptionInputRef}
            discountRef={discountRef}
            displayGrandTotal={displayGrandTotal}
            fillRestForField={fillRestForField}
            focusDescriptionOrDiscount={focusDescriptionOrDiscount}
            handleSplitInputKeyDown={handleSplitInputKeyDown}
            paymentMethod={paymentMethod}
            paymentOptionRefs={paymentOptionRefs}
            paymentOptions={paymentOptions}
            quotationTerms={quotationTerms}
            receivedInputRef={receivedInputRef}
            scrapPaymentStatus={scrapPaymentStatus}
            selectedReturnInvoice={selectedReturnInvoice}
            setInfoToast={setInfoToast}
            setIsUpiSelectModalOpen={setIsUpiSelectModalOpen}
            setQuotationTerms={setQuotationTerms}
            showDescriptionState={showDescriptionState}
            splitCardInputRef={splitCardInputRef}
            splitCashInputRef={splitCashInputRef}
            splitChequeInputRef={splitChequeInputRef}
            splitCreditInputRef={splitCreditInputRef}
            splitDetails={splitDetails}
            splitUpiInputRef={splitUpiInputRef}
            uiConfig={uiConfig}
            upiPageConfig={upiPageConfig}
            upiSources={upiSources}
          />

          {/* ── STICKY FOOTER / RIGHT SIDE OF BOTTOM BAR: Totals + Actions ── */}
          <BillingTotalsPanel
            activeDiscField={activeDiscField}
            activeTab={activeTab}
            actualRefundPaid={actualRefundPaid}
            cgst={cgst}
            checkoutBtnRef={checkoutBtnRef}
            commitTotalOverride={commitTotalOverride}
            customerName={customerName}
            customerPhone={customerPhone}
            deductions={deductions}
            descriptionInputRef={descriptionInputRef}
            discount={discount}
            discountPercentRef={discountPercentRef}
            discountRef={discountRef}
            displayGrandTotal={displayGrandTotal}
            enableScrap={enableScrap}
            extraBonus={extraBonus}
            findMatchingParty={findMatchingParty}
            focusDescriptionOrDiscount={focusDescriptionOrDiscount}
            grandTotal={grandTotal}
            handleCheckout={handleCheckout}
            handleHoldBill={handleHoldBill}
            handleProcessReturnFromCart={handleProcessReturnFromCart}
            handleResetGrandTotalOverride={handleResetGrandTotalOverride}
            handleSaveQuotation={handleSaveQuotation}
            handleWhatsAppSendActiveBill={handleWhatsAppSendActiveBill}
            igst={igst}
            isCheckingOut={isCheckingOut}
            isEditingTotal={isEditingTotal}
            isGrandTotalOverridden={isGrandTotalOverridden}
            isLoadingEditBill={isLoadingEditBill}
            isQuotationActive={isQuotationActive}
            isSendingWhatsApp={isSendingWhatsApp}
            localDiscText={localDiscText}
            originalReturnTotal={originalReturnTotal}
            overrideTotalInput={overrideTotalInput}
            paymentMethod={paymentMethod}
            paymentOptionRefs={paymentOptionRefs}
            qtyRefs={qtyRefs}
            quotationSaving={quotationSaving}
            rawDisplayGrandTotal={rawDisplayGrandTotal}
            receivedAmount={receivedAmount}
            receivedInputRef={receivedInputRef}
            refundAmount={refundAmount}
            returnDiscountTotal={returnDiscountTotal}
            returnProcessed={returnProcessed}
            returnProcessing={returnProcessing}
            returnTotal={returnTotal}
            scrapTotal={scrapTotal}
            searchRef={searchRef}
            setActiveDiscField={setActiveDiscField}
            setIsEditingTotal={setIsEditingTotal}
            setLocalDiscText={setLocalDiscText}
            setOverrideTotalInput={setOverrideTotalInput}
            setShowLoyaltyRedemption={setShowLoyaltyRedemption}
            sgst={sgst}
            showDescriptionState={showDescriptionState}
            splitDetails={splitDetails}
            splitTotal={splitTotal}
            startEditingTotal={startEditingTotal}
            subtotal={subtotal}
            totalKgs={totalKgs}
            totalOverrideInputRef={totalOverrideInputRef}
            totalPcs={totalPcs}
            totalProducts={totalProducts}
            totalTax={totalTax}
            uiConfig={uiConfig}
          />

        </div>

      </div>

      {/* ─── Held Bills / Drafts Modal ─── */}
      <HeldBillsModal
        isOpen={showHeldBillsPanel}
        onClose={() => setShowHeldBillsPanel(false)}
        heldBills={heldBills}
        heldBillsLoading={heldBillsLoading}
        handleRecallHeldBill={handleRecallHeldBill}
        handleReleaseHeldBill={handleReleaseHeldBill}
      />

      {/* ─── Scrap Invoice View Modal ─── */}
      <ScrapInvoiceViewModal
        isOpen={showScrapInvoiceView}
        onClose={() => {
          setShowScrapInvoiceView(false);
          setScrapInvoiceViewData(null);
        }}
        loading={scrapInvoiceViewLoading}
        data={scrapInvoiceViewData}
      />

      {/* ─── Return Deduction Dropdown (fixed position) ─── */}
      <DeductionDropdowns
        returnDeductionDropdownStyle={returnDeductionDropdownStyle} returnDeductionResults={returnDeductionResults}
        scrapDeductionDropdownStyle={scrapDeductionDropdownStyle} scrapDeductionResults={scrapDeductionResults}
        setHardwareError={setHardwareError} setReturnDeduction={setReturnDeduction}
        setReturnDeductionDropdownStyle={setReturnDeductionDropdownStyle}
        setReturnDeductionResults={setReturnDeductionResults}
        setReturnDeductionSearchQuery={setReturnDeductionSearchQuery} setScrapDeduction={setScrapDeduction}
        setScrapDeductionDropdownStyle={setScrapDeductionDropdownStyle}
        setScrapDeductionResults={setScrapDeductionResults} setScrapDeductionSearchQuery={setScrapDeductionSearchQuery}
        tenantId={tenantId}
      />

      <CreateProductModal
        isOpen={showProductCreateForm}
        handleFormKeyDown={handleFormKeyDown}
        resetProductForm={resetProductForm}
        generateProductBarcode={generateProductBarcode}
        invoiceType={invoiceType}
        handleProductGradeChange={handleProductGradeChange}
        handleProductPurchasePriceChange={handleProductPurchasePriceChange}
        handleProductBasePriceChange={handleProductBasePriceChange}
        enableRealPaperStock={enableRealPaperStock}
        pricingTiers={pricingTiers}
        handleCreateAndAddProduct={handleCreateAndAddProduct}
        productForm={productForm}
      />
      <div ref={gradeFormDialogRef}>
        <CreateNewGradeModal
          isOpen={newProductIsAddingGrade}
          onClose={() => {
            setNewProductIsAddingGrade(false);
            setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
          }}
          category={newProductCategory}
          form={newProductGradeForm}
          setForm={setNewProductGradeForm}
          onKeyDown={handleFormKeyDown}
          onSubmit={handleCreateNewGrade}
          saving={newProductSavingGrade}
        />
      </div>
      {cashRegisterOpen && (
        <CashierSettlement onClose={() => setCashRegisterOpen(false)} />
      )}

      <UpiAccountSelectModal
        isOpen={isUpiSelectModalOpen}
        onClose={() => setIsUpiSelectModalOpen(false)}
        upiSources={upiSources}
        currentSelectedUpi={currentSelectedUpi}
        updateActiveTab={updateActiveTab}
        setUpiAccountToast={setUpiAccountToast}
        focusDescriptionOrDiscount={focusDescriptionOrDiscount}
        paymentOptionRefs={paymentOptionRefs}
      />

      <TransportDetailsModal
        isOpen={showTransportModal}
        onClose={() => setShowTransportModal(false)}
        activeTab={activeTab}
        updateActiveTab={updateActiveTab}
      />

      <BillerPinModal
        isOpen={isBillerPinModalOpen}
        tenantId={tenantId || 'global'}
        onClose={() => {
          pendingCheckoutSaveOnlyRef.current = null;
          setIsBillerPinModalOpen(false);
        }}
        onVerified={(staff) => {
          useCartStore.getState().setBillerStaff(staff.staff_id, staff.name);
          setIsBillerPinModalOpen(false);
          const saveOnlyMode = pendingCheckoutSaveOnlyRef.current ?? false;
          pendingCheckoutSaveOnlyRef.current = null;
          setTimeout(() => {
            handleCheckout(saveOnlyMode);
          }, 50);
        }}
      />
    </div>
  );
}
