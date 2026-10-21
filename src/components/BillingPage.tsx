import { generateQuotationHtml, type QuotationPrintData } from '../utils/quotationHtmlGenerator';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  Search, X, Package, Trash, Recycle, RotateCcw, Minus, Plus, CreditCard,
  Store, LogOut, Settings, Phone, User, Scale,
  Wallet, Banknote, Smartphone, QrCode, BookOpen, AlertCircle,
  CheckCircle2, Building, TrendingUp, FileText, Clock, Receipt, MapPin, Star, Gift, Save, RefreshCw, ArrowLeftRight, MessageSquare, LayoutGrid, List, Loader2, Check, Tag, Layers, Users, PauseCircle, Play, Split, ChevronRight, Truck, Pencil, Shield, Percent, Coins,
  ArrowLeft, ArrowRight, Calendar
} from 'lucide-react';
import { useCartStore, useCartTotals, type CartItem } from '../store/cartStore';
import { useScaleStore } from '../store/scaleStore';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { SingleDatePicker } from './ui/SingleDatePicker';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, parseUTCDate, type ReceiptData } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { formatWhatsAppBillMessage } from '../utils/whatsappBillHelper';
import { WhatsAppIcon } from './ui/WhatsAppIcon';
import { parsePrintFormat, formatPrinterError } from '../utils/printFormatHelper';
import { useTabStore, type TabSnapshot, type SplitDetails, saveStoredTabs } from '../store/tabStore';
import { BillingTabBar } from './BillingTabBar';
import { CashierSettlement } from './CashierSettlement';
import { useFeatureFlagsStore, type FeatureFlags } from '../featureFlags';
import { sortProductsBySearchPriority, cleanSearchText } from '../utils/productSort';
import { Skeleton } from './ui/Skeleton';
import { getUpiPageConfig, DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../utils/upiConfig';
import { getNextOffsetInvoiceNumber } from '../utils/invoiceNumberHelper';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { BillerPinModal } from './BillerPinModal';
import { isAdminRole, formatRoleName } from '../utils/permissions';
import { sortTiersWithMrp, MRP_TIER_ID } from '../utils/pricingTierHelper';
import { useBillingUIStore, isHeaderButtonVisible, QUICK_PAGES_LIST, INTERNAL_HEADER_BUTTON_CAPACITY, type EntryFieldKey, type EntryFieldFlowPreset, ENTRY_FIELD_FLOW_PRESETS } from '../store/billingUIStore';
import Barcode from 'react-barcode';


import {
  INDIAN_STATES,
  PAYMENT_OPTIONS,
  type PaymentMethod,
  formatCurrency,
  toLocalDatetimeInputString,
  formatDisplayBillDate,
  detectScannerBurst
} from './billing/BillingConstants';
import { ItemRateInput } from './billing/ui/ItemRateInput';
import { ItemTotalInput } from './billing/ui/ItemTotalInput';
import { CustomerOutstandingBadge } from './billing/ui/CustomerOutstandingBadge';
import { BillDescriptionCard } from './billing/ui/BillDescriptionCard';

export function BillingPage() {
  const { config: uiConfig } = useBillingUIStore();

  // Helper to get effective entry field flow from config
  const getEntryFieldFlow = useCallback((): EntryFieldKey[] => {
    if (uiConfig.entryFieldFlowPreset === 'custom' && uiConfig.entryFieldFlowCustom) {
      return uiConfig.entryFieldFlowCustom;
    }
    const preset = uiConfig.entryFieldFlowPreset || 'full';
    return ENTRY_FIELD_FLOW_PRESETS[preset] || ENTRY_FIELD_FLOW_PRESETS.full;
  }, [uiConfig.entryFieldFlowPreset, uiConfig.entryFieldFlowCustom]);

  // Helper to check if a field is in the flow
  const isFieldInFlow = useCallback((field: EntryFieldKey): boolean => {
    return getEntryFieldFlow().includes(field);
  }, [getEntryFieldFlow]);

  // Helper to get next field in flow
  const getNextFieldInFlow = useCallback((currentField: EntryFieldKey, isWeightItem: boolean): EntryFieldKey | null => {
    const flow = getEntryFieldFlow();
    const currentIndex = flow.indexOf(currentField);
    if (currentIndex === -1) return null;
    
    // For weight items, 'weight' comes after 'qty' in the flow
    // We need to check if the next field should be 'weight' instead
    for (let i = currentIndex + 1; i < flow.length; i++) {
      const nextField = flow[i];
      // Skip 'weight' if not a weight item
      if (nextField === 'weight' && !isWeightItem) continue;
      return nextField;
    }
    return null;
  }, [getEntryFieldFlow]);

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
  const upiSourceRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
    currentUserRole, setRole, discountType, discountValue,
    addItem, updateQuantity, removeItem, updateItemDiscount, removeItemDiscount, updateItemOfferPrice, updatePiecesOverride, updateItemPricingTier,
    customerState, setCustomerState,
    scrapDeduction: storeScrapDeduction, scrapInvoiceNumber: storeScrapInvoiceNumber,
    setScrapDeduction, clearScrapDeduction,
    returnDeduction: storeReturnDeduction, returnInvoiceNumber: storeReturnInvoiceNumber,
    setReturnDeduction, clearReturnDeduction,
    editingInvoiceId: editingActive, editingInvoiceNumber, setEditingInvoice,
  } = useCartStore();

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
  const { shopName, role: authRole, tenantId, userId, userName, logout } = useAuthStore();
  const shopDomain = useCartStore(s => s.shopDomain);
  const scaleLiveWeight = useScaleStore(s => s.liveWeight);
  const scaleReading = useScaleStore(s => s.reading);
  const setScaleReading = useScaleStore(s => s.setReading);
  const lockScaleWeight = useScaleStore(s => s.lockWeight);
  const [bosTaxRatePercent, setBosTaxRatePercent] = useState(0);
  const [bosTaxInclusive, setBosTaxInclusive] = useState(false);

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
  const [localPcPriceStr, setLocalPcPriceStr] = useState<Record<string, string>>({});
  const [localKgRateStr, setLocalKgRateStr] = useState<Record<string, string>>({});

  // Pricing tier state
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [productPricingMap, setProductPricingMap] = useState<Record<string, Record<string, number>>>({});
  const [productPricingMapLoaded, setProductPricingMapLoaded] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState('');

  // Page-wise UPI Configuration and sources state
  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [upiSources, setUpiSources] = useState<any[]>([]);
  const [isUpiSelectModalOpen, setIsUpiSelectModalOpen] = useState(false);
  const [isBillerPinModalOpen, setIsBillerPinModalOpen] = useState(false);
  const [allowBillerOverride, setAllowBillerOverride] = useState(true);
  const [partiesForTier, setPartiesForTier] = useState<any[]>([]);
  const canOverrideTier = isAdminRole(authRole) || allowBillerOverride;

  // Auto-focus selected or first UPI account option when UPI modal opens
  useEffect(() => {
    if (isUpiSelectModalOpen && upiSources.length > 0) {
      const active = currentSelectedUpi
        ? upiSources.find((s: any) => s.source_id === currentSelectedUpi.source_id || (s.upi_id && s.upi_id === currentSelectedUpi.upi_id))
        : (upiSources.find((s: any) => s.is_default === 1) || upiSources[0]);

      const keyId = active?.source_id || active?.upi_id || upiSources[0]?.source_id || upiSources[0]?.upi_id || '0';

      setTimeout(() => {
        upiSourceRefs.current[keyId]?.focus();
      }, 50);
    }
  }, [isUpiSelectModalOpen, upiSources]);

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
  const _totalItemSavings = items.reduce((sum, item) => {
    if (item.isScrap) return sum;
    const rate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0) ? Number(item.grade_rate) : Number(item.base_price || 0);
    const qty = Number(item.quantity) || 0;
    const rawTotal = rate * qty;
    const catalogPrice = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
      : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
      : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
      : rate;
    const isAdhocOffer = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
    const isAdhocDiscFlat = item.discount_flat != null && item.discount_flat !== item.catalog_discount_flat;
    const isAdhocDiscPct = item.discount_percent != null && item.discount_percent !== item.catalog_discount_percent;
    let effectivePrice = catalogPrice;
    if (isAdhocOffer) {
      effectivePrice = Number(item.offer_price);
    } else if (isAdhocDiscFlat) {
      effectivePrice = catalogPrice - Number(item.discount_flat);
    } else if (isAdhocDiscPct) {
      effectivePrice = catalogPrice * (1 - Number(item.discount_percent) / 100);
    }
    effectivePrice = Math.max(effectivePrice, 0);
    const total = effectivePrice * qty;
    return sum + (rawTotal - total);
  }, 0);

  const [searchQuery, setSearchQuery] = useState('');
  const [isProductSearching, setIsProductSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const productFormDialogRef = useRef<HTMLDivElement>(null);
  const gradeFormDialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [showProductCreateForm, setShowProductCreateForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductItemCode, setNewProductItemCode] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [editingProductSnapshot, setEditingProductSnapshot] = useState<any | null>(null);
  const [productPriceCoding, setProductPriceCoding] = useState<Record<string, string> | null>(null);
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductUom, setNewProductUom] = useState('Pcs');
  const [newProductPcs, setNewProductPcs] = useState('');
  const [newProductPurchasePrice, setNewProductPurchasePrice] = useState('');
  const [newProductBasePrice, setNewProductBasePrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState('');
  const [newProductHsn, setNewProductHsn] = useState('');
  const [newProductTaxRate, setNewProductTaxRate] = useState(0);
  const [newProductDiscountPercent, setNewProductDiscountPercent] = useState('');
  const [newProductDiscountFlat, setNewProductDiscountFlat] = useState('');
  const [newProductOfferPrice, setNewProductOfferPrice] = useState('');
  const [newProductIsGstApplicable, setNewProductIsGstApplicable] = useState(false);
  const [newProductIsDummy, setNewProductIsDummy] = useState(false);
  const [newProductIsCustomCategory, setNewProductIsCustomCategory] = useState(false);
  const [productFormTierPrices, setProductFormTierPrices] = useState<Record<string, string>>({});
  const [autoPrintBarcode, setAutoPrintBarcode] = useState(true);
  const [productFormView, setProductFormView] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('productFormView') as 'grid' | 'list') || 'grid';
  });
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
  const [mostSoldProducts, setMostSoldProducts] = useState<any[]>([]);
  const [newProductGrades, setNewProductGrades] = useState<any[]>([]);
  const [newProductGradeId, setNewProductGradeId] = useState('');
  const [newProductIsAddingGrade, setNewProductIsAddingGrade] = useState(false);
  const [newProductSavingGrade, setNewProductSavingGrade] = useState(false);
  const [newProductGradeForm, setNewProductGradeForm] = useState({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
  const [isPastBillMode, setIsPastBillMode] = useState(false);
  const [pastBillResults, setPastBillResults] = useState<any[]>([]);
  const getNumericPart = (s: string) => (s.match(/\d+/g) || []).join('');
  const [scrapDeductionSearchQuery, setScrapDeductionSearchQuery] = useState('');
  const [scrapDeductionResults, setScrapDeductionResults] = useState<any[]>([]);

  // Return deduction search (similar to scrap deduction search)
  const [returnDeductionSearchQuery, setReturnDeductionSearchQuery] = useState('');
  const [returnDeductionResults, setReturnDeductionResults] = useState<any[]>([]);
  const [returnDeductionSearchMode, setReturnDeductionSearchMode] = useState(false);
  const [deductionTabMode, setDeductionTabMode] = useState<'scrap' | 'return' | 'points'>('scrap');

  // Loyalty points state
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(100);
  const [loyaltyRedemptionRate, setLoyaltyRedemptionRate] = useState(1);
  const [loyaltyAwardOnPending, setLoyaltyAwardOnPending] = useState(false);
  const [loyaltyCustomerData, setLoyaltyCustomerData] = useState<{
    customerId: string | null;
    pointsBalance: number;
  }>({ customerId: null, pointsBalance: 0 });
  const [showLoyaltyRedemption, setShowLoyaltyRedemption] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Modern ERP B2C Grid States (Acro / Tally Desktop ERP Model)
  const [erpVoucherNo, setErpVoucherNo] = useState('');
  const [erpNarration, setErpNarration] = useState('');
  const [erpSalesRep, setErpSalesRep] = useState('');
  const [erpCooly, setErpCooly] = useState<number | string>('');
  const [erpFreight, setErpFreight] = useState<number | string>('');
  const [focusedRowProductId, setFocusedRowProductId] = useState<string | null>(null);

  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [allCustomersList, setAllCustomersList] = useState<any[]>([]);
  const [allStaffList, setAllStaffList] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(0);
  const customerNameContainerRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const customerNameInputRef = useRef<HTMLInputElement>(null);
  const customerPhoneInputRef = useRef<HTMLInputElement>(null);
  const customerAddressInputRef = useRef<HTMLInputElement>(null);
  const customerGstinInputRef = useRef<HTMLInputElement>(null);
  const paymentOptionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const skipCustomerDropdownOnFocusRef = useRef(false);
  const activeCartProductIdRef = useRef<string | null>(null);

  const focusCartField = useCallback((field: string, productId: string): boolean => {
    let el: HTMLElement | null = null;
    if (field === 'pcs') el = pcsRefs.current[productId] || null;
    else if (field === 'qty' || field === 'weight') el = qtyRefs.current[productId] || kRefs.current[productId] || null;
    else if (field === 'rate') el = ratePcRefs.current[productId] || rateKgRefs.current[productId] || null;
    else if (field === 'discount') el = discRefs.current[productId] || null;
    else if (field === 'discountFlat') el = discFlatRefs.current[productId] || null;
    else if (field === 'tier') el = tierRefs.current[productId] || null;
    else if (field === 'grandTotal') el = totalInputRefs.current[productId] || null;

    if (el) {
      el.focus();
      if ('select' in el && typeof (el as any).select === 'function') {
        (el as any).select();
      }
      activeCartProductIdRef.current = productId;
      setFocusedRowProductId(productId);
      return true;
    }
    return false;
  }, []);

  const focusFirstCartField = useCallback((pidOverride?: string): boolean => {
    if (items.length === 0) return false;
    const targetPid = pidOverride || activeCartProductIdRef.current || lastAddedProductId || items[0]?.product_id;
    if (!targetPid) return false;
    const order = ['pcs', 'qty', 'rate', 'discount', 'discountFlat', 'grandTotal'];
    for (const f of order) {
      if (focusCartField(f, targetPid)) return true;
    }
    return false;
  }, [items, lastAddedProductId, focusCartField]);

  const focusLastCartField = useCallback((pidOverride?: string): boolean => {
    if (items.length === 0) return false;
    const targetPid = pidOverride || activeCartProductIdRef.current || lastAddedProductId || items[items.length - 1]?.product_id;
    if (!targetPid) return false;
    const order = ['grandTotal', 'tier', 'discountFlat', 'discount', 'rate', 'qty', 'pcs'];
    for (const f of order) {
      if (focusCartField(f, targetPid)) return true;
    }
    return false;
  }, [items, lastAddedProductId, focusCartField]);

  const focusNextCartField = useCallback((currentField: string, productId: string) => {
    activeCartProductIdRef.current = productId;
    const order = ['pcs', 'qty', 'rate', 'discount', 'discountFlat', 'tier', 'grandTotal'];
    const idx = order.indexOf(currentField);
    if (idx !== -1) {
      for (let i = idx + 1; i < order.length; i++) {
        if (focusCartField(order[i], productId)) return;
      }
    }
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [focusCartField]);

  const focusPrevCartField = useCallback((currentField: string, productId: string) => {
    activeCartProductIdRef.current = productId;
    const order = ['pcs', 'qty', 'rate', 'discount', 'discountFlat', 'tier', 'grandTotal'];
    const idx = order.indexOf(currentField);
    if (idx !== -1) {
      for (let i = idx - 1; i >= 0; i--) {
        if (focusCartField(order[i], productId)) return;
      }
    }
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [focusCartField]);

  const focusCustomerFieldsReverse = useCallback(() => {
    if (invoiceType === 'GST' && customerGstinInputRef.current) {
      customerGstinInputRef.current.focus();
      customerGstinInputRef.current.select();
    } else if (customerAddressInputRef.current) {
      customerAddressInputRef.current.focus();
      customerAddressInputRef.current.select();
    } else if (customerPhoneInputRef.current) {
      customerPhoneInputRef.current.focus();
      customerPhoneInputRef.current.select();
    } else if (customerNameInputRef.current) {
      customerNameInputRef.current.focus();
      customerNameInputRef.current.select();
    }
  }, [invoiceType]);

  const handleRateUpDown = useCallback((productId: string, direction: 'up' | 'down') => {
    const idx = items.findIndex(i => i.product_id === productId);
    if (idx === -1) return;
    if (direction === 'down') {
      if (idx < items.length - 1) {
        const nextPid = items[idx + 1].product_id;
        const nextRate = ratePcRefs.current[nextPid] || rateKgRefs.current[nextPid] || qtyRefs.current[nextPid];
        if (nextRate) { nextRate.focus(); if ('select' in nextRate) (nextRate as any).select(); }
      }
    } else {
      if (idx > 0) {
        const prevPid = items[idx - 1].product_id;
        const prevRate = ratePcRefs.current[prevPid] || rateKgRefs.current[prevPid] || qtyRefs.current[prevPid];
        if (prevRate) { prevRate.focus(); if ('select' in prevRate) (prevRate as any).select(); }
      } else {
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
  }, [items]);

  const searchResultListRef = useRef<HTMLDivElement>(null);
  const pastBillListRef = useRef<HTMLDivElement>(null);
  const customerListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchResultListRef.current && selectedIndex >= 0) {
      const container = searchResultListRef.current;
      const selectedEl = container.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`);
      if (selectedEl) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = selectedEl.offsetTop;
        const elBottom = elTop + selectedEl.offsetHeight;

        if (elTop < containerTop) {
          container.scrollTop = elTop;
        } else if (elBottom > containerBottom) {
          container.scrollTop = elBottom - container.clientHeight;
        }
      }
    }
    if (pastBillListRef.current && selectedIndex >= 0) {
      const container = pastBillListRef.current;
      const selectedEl = container.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`);
      if (selectedEl) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = selectedEl.offsetTop;
        const elBottom = elTop + selectedEl.offsetHeight;

        if (elTop < containerTop) {
          container.scrollTop = elTop;
        } else if (elBottom > containerBottom) {
          container.scrollTop = elBottom - container.clientHeight;
        }
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (customerListRef.current && showCustomerDropdown && selectedCustomerIndex >= 0) {
      const container = customerListRef.current;
      const selectedEl = container.querySelector<HTMLElement>(`[data-customer-index="${selectedCustomerIndex}"]`);
      if (selectedEl) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = selectedEl.offsetTop;
        const elBottom = elTop + selectedEl.offsetHeight;

        if (elTop < containerTop) {
          container.scrollTop = elTop;
        } else if (elBottom > containerBottom) {
          container.scrollTop = elBottom - container.clientHeight;
        }
      }
    }
  }, [selectedCustomerIndex, showCustomerDropdown]);

  const focusInputWithoutDropdown = (inputEl: HTMLInputElement | null, selectAll = true) => {
    if (!inputEl) return;
    skipCustomerDropdownOnFocusRef.current = true;
    inputEl.focus();
    if (selectAll) inputEl.select();
    setTimeout(() => {
      skipCustomerDropdownOnFocusRef.current = false;
    }, 150);
  };

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const isCheckingOutRef = useRef(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<'saved' | 'printed' | false>(false);
  const [upiAccountToast, setUpiAccountToast] = useState<string | null>(null);
  const [returnSuccessToast, setReturnSuccessToast] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [showDescriptionState, setShowDescriptionState] = useState(true);
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

  const focusDescriptionOrDiscount = useCallback(() => {
    setTimeout(() => {
      if (showDescriptionState && descriptionInputRef.current) {
        descriptionInputRef.current.focus();
        descriptionInputRef.current.select();
      } else if (discountRef.current) {
        discountRef.current.focus();
        discountRef.current.select();
      }
    }, 30);
  }, [showDescriptionState]);

  // Three invoice series (Normal, GST B2B, GST B2C)
  const [enableThreeInvoiceSeries, setEnableThreeInvoiceSeries] = useState(false);
  const _gstSeries = invoiceType === 'GST' && enableThreeInvoiceSeries;

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
  const [enableScrap, setEnableScrap] = useState(true);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);
  const [showPaperInGstSetting, setShowPaperInGstSetting] = useState(true);
  const [showPaperInEstSetting, setShowPaperInEstSetting] = useState(false);

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
  const effectiveReturnSearchMode = isScrapModuleEnabled ? returnDeductionSearchMode : true;
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
  const [returnSearchResults, setReturnSearchResults] = useState<any[]>([]);
  const [selectedReturnInvoice, setSelectedReturnInvoice] = useState<any | null>(null);
  const [returnProcessing, setReturnProcessing] = useState(false);
  const returnProcessingRef = useRef(false);
  const pendingCheckoutSaveOnlyRef = useRef<boolean | null>(null);
  const [returnProcessed, setReturnProcessed] = useState(false);

  const [terminalCodeState, setTerminalCodeState] = useState('POS1');
  const [shopNameState, setShopNameState] = useState('');
  const [shopGstin, setShopGstin] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopState, setShopState] = useState('');
  const [quotationGstEnabledSetting, setQuotationGstEnabledSetting] = useState(true);
  const [shopEmail, setShopEmail] = useState('');
  const [shopWebsite, setShopWebsite] = useState('');
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [bankNameState, setBankNameState] = useState('');
  const [bankAccountState, setBankAccountState] = useState('');
  const [bankIfscState, setBankIfscState] = useState('');
  const [bankBranchState, setBankBranchState] = useState('');

  // useTabStore values are destructured at the top of the component

  const tabCounter = useRef(0);
  const initialized = useRef(false);

  const handleAddTab = async () => {
    let billNumber = '';
    let scrapNumber = '';
    let quotationNumber = '';
    let returnNumber = '';
    const allTabs = useTabStore.getState().tabs;
    if (window.electronAPI) {
      const series = enableThreeInvoiceSeries ? 'normal' : undefined;
      try {
        const r = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
        if (r?.success && r.invoiceNumber) {
          const reserved = allTabs.map(t => t.reservedInvoiceNumber);
          billNumber = getNextOffsetInvoiceNumber(r.invoiceNumber, reserved);
        }
      } catch { }
      try {
        const r = await window.electronAPI.dbPeekNextScrapInvoiceNumber({ tenant_id: 'global' });
        if (r?.success && r.invoiceNumber) {
          const reserved = allTabs.map(t => t.reservedScrapInvoiceNumber);
          scrapNumber = getNextOffsetInvoiceNumber(r.invoiceNumber, reserved);
        }
      } catch { }
      try {
        const r = await window.electronAPI.dbPeekNextQuotationNumber({ tenant_id: 'global' });
        if (r?.success && r.quotationNumber) {
          const reserved = allTabs.map(t => t.reservedQuotationNumber);
          quotationNumber = getNextOffsetInvoiceNumber(r.quotationNumber, reserved);
        }
      } catch { }
      try {
        const r = await window.electronAPI.dbPeekNextReturnNumber({ tenant_id: tenantId || 'global' });
        if (r?.success && r.returnNumber) {
          const reserved = allTabs.map(t => t.reservedReturnNumber);
          returnNumber = getNextOffsetInvoiceNumber(r.returnNumber, reserved);
        }
      } catch { }
    }
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
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (isScrapMode || isQuotationMode || isReturnMode || tab.snapshot?.isQuotationMode) return;
    if (editingActive) return;

    try {
      const tabIsB2B = (invoiceType === 'GST') && (Boolean(customerGstin?.trim()) || Boolean(tab?.isB2B));
      const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (tabIsB2B ? 'gst_b2b' : 'gst_b2c') : 'normal') : (invoiceType === 'GST' ? 'gst' : undefined);
      const result = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
      if (result.success && result.invoiceNumber) {
        const allTabs = useTabStore.getState().tabs;
        const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedInvoiceNumber);
        const nextNum = getNextOffsetInvoiceNumber(result.invoiceNumber, otherTabsReserved);
        const oldReserved = tab.reservedInvoiceNumber;
        if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
          const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === oldReserved || tab.title.startsWith('Bill ') || tab.title.startsWith('GST-');
          updateActiveTab({
            reservedInvoiceNumber: nextNum,
            title: shouldUpdateTitle ? nextNum : tab.title
          });
        }
      }
    } catch (e) {
      console.error('Failed to peek invoice number', e);
    }
  }, [tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isB2B, isScrapMode, isQuotationMode, isReturnMode, editingActive]);

  const handleInvoiceTypeChange = async (type: 'GST' | 'BILL_OF_SUPPLY') => {
    setInvoiceType(type);
    setTimeout(() => {
      syncActiveSnapshot();
    }, 0);

    try {
      const tab = getActiveTab();
      const tabIsB2B = (type === 'GST') && (Boolean(customerGstin?.trim()) || Boolean(tab?.isB2B));
      const series = enableThreeInvoiceSeries ? (type === 'GST' ? (tabIsB2B ? 'gst_b2b' : 'gst_b2c') : 'normal') : (type === 'GST' ? 'gst' : undefined);
      const result = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
      if (result.success && result.invoiceNumber) {
        const allTabs = useTabStore.getState().tabs;
        const otherTabsReserved = allTabs.filter(t => t?.id !== tab?.id).map(t => t.reservedInvoiceNumber);
        const nextNum = getNextOffsetInvoiceNumber(result.invoiceNumber, otherTabsReserved);
        updateActiveTab({ 
          reservedInvoiceNumber: nextNum,
          title: nextNum
        });
      }
    } catch (e) {
      console.error('Failed to peek next invoice number on type change', e);
    }
  };

  const reserveScrapInvoiceNumberForTab = useCallback(async (forceRefresh = false) => {
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (editingActive) return;

    try {
      const result = await window.electronAPI.dbPeekNextScrapInvoiceNumber({ tenant_id: 'global' });
      if (result.success && result.invoiceNumber) {
        const allTabs = useTabStore.getState().tabs;
        const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedScrapInvoiceNumber);
        const nextNum = getNextOffsetInvoiceNumber(result.invoiceNumber, otherTabsReserved);
        const oldReserved = tab.reservedScrapInvoiceNumber;
        if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
          const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === oldReserved || tab.title.startsWith('Bill ');
          updateActiveTab({
            reservedScrapInvoiceNumber: nextNum,
            title: shouldUpdateTitle ? nextNum : tab.title
          });
        }
      }
    } catch (e) {
      console.error('Failed to reserve scrap invoice number', e);
    }
  }, [getActiveTab, updateActiveTab, editingActive]);

  const reserveQuotationNumberForTab = useCallback(async (forceRefresh = false) => {
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (editingQuotationId) return;

    try {
      const result = await window.electronAPI.dbPeekNextQuotationNumber({ tenant_id: 'global' });
      if (result.success && result.quotationNumber) {
        const allTabs = useTabStore.getState().tabs;
        const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedQuotationNumber);
        const nextNum = getNextOffsetInvoiceNumber(result.quotationNumber, otherTabsReserved);
        const oldReserved = tab.reservedQuotationNumber;
        if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
          const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === 'New Quote' || tab.title === oldReserved || tab.title.startsWith('Bill ') || (tab.reservedInvoiceNumber && tab.title === tab.reservedInvoiceNumber);
          updateActiveTab({
            reservedQuotationNumber: nextNum,
            reservedInvoiceNumber: '',
            title: shouldUpdateTitle ? nextNum : tab.title
          });
        }
      }
    } catch (e) {
      console.error('Failed to reserve quotation number', e);
    }
  }, [getActiveTab, updateActiveTab, editingQuotationId]);

  const reserveReturnNumberForTab = useCallback(async (forceRefresh = false) => {
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;

    try {
      const result = await window.electronAPI.dbPeekNextReturnNumber({ tenant_id: tenantId || 'global' });
      if (result.success && result.returnNumber) {
        const allTabs = useTabStore.getState().tabs;
        const otherTabsReserved = allTabs.filter(t => t.id !== tab.id).map(t => t.reservedReturnNumber);
        const nextNum = getNextOffsetInvoiceNumber(result.returnNumber, otherTabsReserved);
        const oldReserved = tab.reservedReturnNumber;
        if (forceRefresh || !oldReserved || oldReserved !== nextNum) {
          const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === oldReserved || tab.title.startsWith('Bill ');
          updateActiveTab({
            reservedReturnNumber: nextNum,
            title: shouldUpdateTitle ? nextNum : tab.title
          });
        }
      }
    } catch (e) {
      console.error('Failed to reserve return number', e);
    }
  }, [tenantId, getActiveTab, updateActiveTab]);

  const totalDeductions = (storeScrapDeduction || 0) + (storeReturnDeduction || 0);
  // Return credit is consumed first (up to the bill total); its leftover stays as
  // pending ADJUST_BILL credit for a future bill (not cash-refunded). Only scrap
  // credit excess is refunded as cash (existing behavior).
  const returnConsumed = Math.min(storeReturnDeduction || 0, grandTotal);
  const scrapConsumed = Math.min(storeScrapDeduction || 0, Math.max(0, grandTotal - returnConsumed));
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
  const _bothActive = storeScrapDeduction > 0 && storeReturnDeduction > 0;

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

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const currentUiConfig = useBillingUIStore.getState().config;
    const navSource = sessionStorage.getItem('last_pos_nav_source') || 'page_exit';
    
    // Evaluate exact toggle based on navigation source
    const preserveCart = navSource === 'header_button'
      ? (currentUiConfig.preserveCartOnHeaderNavigation !== false)
      : (currentUiConfig.preserveCartOnPageExit !== false);

    sessionStorage.removeItem('last_pos_nav_source');

    const isPendingNewQuotation = localStorage.getItem('pendingNewQuotation') === 'true';
    if (isPendingNewQuotation) {
      localStorage.removeItem('pendingNewQuotation');
    }
    const editQ = localStorage.getItem('editQuotationData');
    const isQActive = isPendingNewQuotation || isQuotationMode || Boolean(editQ);

    const existingTabs = useTabStore.getState().tabs;
    const currentActiveTabId = useTabStore.getState().activeTabId;

    if (isPendingNewQuotation) {
      // Dedicated robust Quotation Mode initialization
      useCartStore.getState().clearCart();
      useCartStore.getState().setReturnMode(false);
      useCartStore.getState().setIsScrapMode(false);
      useCartStore.getState().setEditingQuotation(null, null);
      useCartStore.getState().setEditingInvoice(null, null, null);
      useCartStore.getState().setQuotationMode(true);

      const quotationSnapshot: TabSnapshot = {
        items: [],
        invoiceType: quotationGstEnabledSetting ? 'GST' : 'BILL_OF_SUPPLY',
        discountType: 'FIXED',
        discountValue: 0,
        customerState: 'KL',
        scrapDeduction: 0,
        scrapInvoiceNumber: '',
        returnDeduction: 0,
        returnInvoiceNumber: '',
        isQuotationMode: true,
        isReturnMode: false,
        isScrapMode: false,
        returnRefundMethod: 'ADJUST_BILL',
        editingQuotationId: null,
        editingQuotationNumber: null,
        editingInvoiceId: null,
        editingInvoiceNumber: null,
        editingInvoiceRole: null,
        pendingScrapInvoiceToEdit: null,
      };

      const activeTab = existingTabs.find(t => t.id === currentActiveTabId);
      // If current active tab is clean (no items and not editing), adapt it to New Quote
      if (activeTab && (!activeTab.snapshot?.items || activeTab.snapshot.items.length === 0) && !activeTab.snapshot?.editingInvoiceNumber) {
        updateActiveTab({
          title: 'New Quote',
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH',
          receivedAmount: 0,
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
        });
        const { tabs: currentTabs, activeTabId: curTabId } = useTabStore.getState();
        const updatedTabs = currentTabs.map(t => t.id === curTabId ? {
          ...t,
          title: 'New Quote',
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
          snapshot: quotationSnapshot,
        } : t);
        useTabStore.setState({ tabs: updatedTabs });
        saveStoredTabs(updatedTabs, curTabId);
        useCartStore.setState({
          items: [],
          isQuotationMode: true,
          isReturnMode: false,
          isScrapMode: false,
          editingQuotationId: null,
          editingQuotationNumber: null,
          editingInvoiceId: null,
          editingInvoiceNumber: null,
        });
        syncActiveSnapshot();
        reserveQuotationNumberForTab(true);
      } else {
        // Otherwise append a new dedicated tab for Quotation mode
        addTab(quotationSnapshot, 'New Quote');
        reserveQuotationNumberForTab(true);
      }
      setTimeout(() => {
        window.focus();
        if (searchRef.current) {
          searchRef.current.focus();
          searchRef.current.select();
        }
      }, 100);
    } else if (preserveCart && existingTabs.length > 0 && !isQActive) {
      // PRESERVE CART & TABS
      let activeTab = existingTabs.find(t => t.id === currentActiveTabId);
      if (!activeTab) {
        activeTab = existingTabs[0];
        useTabStore.setState({ activeTabId: activeTab.id });
      }
      if (activeTab.snapshot) {
        const isRet = Boolean(activeTab.snapshot.isReturnMode);
        const rawItems = activeTab.snapshot.items || [];
        const hasReturnItems = rawItems.some((i: any) => i.isReturnItem);
        const sanitizedItems = isRet
          ? rawItems.filter((i: any) => i.isReturnItem)
          : rawItems.filter((i: any) => !i.isReturnItem);

        if (!isRet && (hasReturnItems || activeTab.reservedReturnNumber)) {
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

        useCartStore.setState({
          items: sanitizedItems,
          invoiceType: activeTab.snapshot.invoiceType || 'BILL_OF_SUPPLY',
          discountType: activeTab.snapshot.discountType || 'FIXED',
          discountValue: activeTab.snapshot.discountValue || 0,
          customerState: activeTab.snapshot.customerState || 'KL',
          scrapDeduction: activeTab.snapshot.scrapDeduction || 0,
          scrapInvoiceNumber: activeTab.snapshot.scrapInvoiceNumber || '',
          returnDeduction: activeTab.snapshot.returnDeduction || 0,
          returnInvoiceNumber: activeTab.snapshot.returnInvoiceNumber || '',
          isQuotationMode: activeTab.snapshot.isQuotationMode || false,
          isReturnMode: activeTab.snapshot.isReturnMode || false,
          isScrapMode: activeTab.snapshot.isScrapMode || false,
          returnRefundMethod: activeTab.snapshot.returnRefundMethod || 'ADJUST_BILL',
          editingQuotationId: activeTab.snapshot.editingQuotationId || null,
          editingQuotationNumber: activeTab.snapshot.editingQuotationNumber || null,
          editingInvoiceId: activeTab.snapshot.editingInvoiceId || null,
          editingInvoiceNumber: activeTab.snapshot.editingInvoiceNumber || null,
          editingInvoiceRole: activeTab.snapshot.editingInvoiceRole || null,
          pendingScrapInvoiceToEdit: activeTab.snapshot.pendingScrapInvoiceToEdit || null,
        });
      }
      tabCounter.current = Math.max(1, existingTabs.length);
    } else {
      // LEGACY RESET or NEW EXPLICIT QUOTATION
      useTabStore.setState({ tabs: [], activeTabId: '' });

      tabCounter.current++;
      if (isQActive) {
        useCartStore.getState().setQuotationMode(true);
        const snapshot: TabSnapshot = {
          items: [],
          invoiceType: 'BILL_OF_SUPPLY',
          discountType: 'FIXED',
          discountValue: 0,
          customerState: 'KL',
          scrapDeduction: 0,
          scrapInvoiceNumber: '',
          returnDeduction: 0,
          returnInvoiceNumber: '',
          isQuotationMode: true,
          isReturnMode: false,
          isScrapMode: false,
          returnRefundMethod: 'ADJUST_BILL',
          editingQuotationId: null,
          editingQuotationNumber: null,
          editingInvoiceId: null,
          editingInvoiceNumber: null,
          editingInvoiceRole: null,
          pendingScrapInvoiceToEdit: null,
        };
        addTab(snapshot, `New Quote`);
        reserveQuotationNumberForTab(true);
      } else {
        addTab(undefined, `Bill ${tabCounter.current}`);
      }
      useCartStore.getState().setEditingInvoice(null, null, null);
    }

    return () => {
      // Unmount cleanup: sync active cart snapshot to tabStore when navigating away from BillingPage
      const cfg = useBillingUIStore.getState().config;
      const src = sessionStorage.getItem('last_pos_nav_source') || 'page_exit';
      const shouldSync = src === 'header_button'
        ? (cfg.preserveCartOnHeaderNavigation !== false)
        : (cfg.preserveCartOnPageExit !== false);

      if (shouldSync) {
        useTabStore.getState().syncActiveSnapshot();
      }
    };
  }, []);

  // receivedAmount stays 0 until user enters a value — no auto-fill to grandTotal

  useEffect(() => {
    if (uiConfig.entryFocusOrder === 'customer-first') {
      customerNameInputRef.current?.focus();
    } else {
      searchRef.current?.focus();
    }
  }, [activeTabId, uiConfig.entryFocusOrder]);

  useEffect(() => {
    if (!window.electronAPI) return;
    setProductPricingMapLoaded(false);
    window.electronAPI.dbEnsureServiceItem({ tenant_id: tenantId || 'global' }).catch(() => {});
    window.electronAPI.settingsGet({ tenant_id: 'global', key: 'terminal_code' }).then((v: any) => {
      if (typeof v === 'string' && v.trim()) {
        setTerminalCodeState(v.trim().replace(/^["']|["']$/g, '').toUpperCase());
      }
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }).then((v: any) => {
      const resolved = typeof v === 'string' && v.trim() ? v.trim() : (shopName || '');
      setShopNameState(resolved);
      if (resolved) useAuthStore.setState({ shopName: resolved });
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }).then((v: any) => {
      setShopGstin(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }).then((v: any) => {
      setShopAddress(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }).then((v: any) => {
      setShopPhone(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_state' }).then((v: any) => {
      setShopState(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'quotation_gst_enabled' }).then((v: any) => {
      if (v !== undefined && v !== null) setQuotationGstEnabledSetting(v !== 'false' && v !== false);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_email' }).then((v: any) => {
      setShopEmail(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_website' }).then((v: any) => {
      setShopWebsite(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }).then((v: any) => {
      setUpiId(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }).then((v: any) => {
      if (v !== null && v !== undefined) setShowUpiQr(Boolean(v));
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_name' }).then((v: any) => {
      if (typeof v === 'string') setBankNameState(v);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_account_number' }).then((v: any) => {
      if (typeof v === 'string') setBankAccountState(v);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_ifsc' }).then((v: any) => {
      if (typeof v === 'string') setBankIfscState(v);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_branch' }).then((v: any) => {
      if (typeof v === 'string') setBankBranchState(v);
    });
    getUpiPageConfig(tenantId || 'global').then(setUpiPageConfig);
    if (window.electronAPI?.dbPaymentGetSources) {
      window.electronAPI.dbPaymentGetSources(tenantId || 'global').then((sources: any[]) => {
        if (Array.isArray(sources)) {
          setUpiSources(sources.filter((s: any) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
        }
      }).catch(() => {});
    }
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_real_paper_stock' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableRealPaperStock(Boolean(v));
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_paper_stock_in_gst' }).then((v: any) => {
      if (v !== null && v !== undefined) setShowPaperInGstSetting(Boolean(v));
      else setShowPaperInGstSetting(true);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_paper_stock_in_estimate' }).then((v: any) => {
      if (v !== null && v !== undefined) setShowPaperInEstSetting(Boolean(v));
      else setShowPaperInEstSetting(false);
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_scrap' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
    loadFlags(tenantId || 'global');
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_cash_register' }).then((v: any) => {
      if (v !== null && v !== undefined) setShowCashRegister(Boolean(v));
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'auto_print_barcode' }).then((v: any) => {
      if (v !== null && v !== undefined) setAutoPrintBarcode(Boolean(v));
    });
    window.electronAPI.settingsGet({ tenant_id: 'global', key: 'three_invoice_series' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableThreeInvoiceSeries(Boolean(v.enabled));
    });
    const reloadLoyaltyConfig = () => {
      Promise.all([
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'loyalty_config' }),
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'feature_flags' }),
      ]).then(([rawCfg, rawFlags]: [any, any]) => {
        let cfg = rawCfg;
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch {} }
        let flags = rawFlags;
        if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch {} }

        let isEnabled = false;
        let eRate = 100;
        let rRate = 1;
        let awardOnPending = false;

        if (cfg && typeof cfg === 'object') {
          if (cfg.enabled !== undefined) isEnabled = Boolean(cfg.enabled);
          if (cfg.earningRate) eRate = Number(cfg.earningRate) || 100;
          if (cfg.redemptionRate) rRate = Number(cfg.redemptionRate) || 1;
          if (cfg.awardPointsOnPending !== undefined) awardOnPending = Boolean(cfg.awardPointsOnPending);
        }
        if (flags && typeof flags.loyalty === 'boolean') {
          isEnabled = flags.loyalty || isEnabled;
        }

        setLoyaltyEnabled(isEnabled);
        setLoyaltyEarningRate(Math.max(1, eRate));
        setLoyaltyRedemptionRate(Math.max(0.01, rRate));
        setLoyaltyAwardOnPending(awardOnPending);
      }).catch(() => {});
    };
    reloadLoyaltyConfig();
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' }).then((v: any) => {
      if (v?.billSettings?.bosTaxRatePercent != null) {
        setBosTaxRatePercent(Number(v.billSettings.bosTaxRatePercent));
      }
      if (v?.billSettings?.bosTaxInclusive != null) {
        setBosTaxInclusive(Boolean(v.billSettings.bosTaxInclusive));
      }
      if (v?.billSettings?.showDescription !== undefined) {
        setShowDescriptionState(v.billSettings.showDescription !== false);
      }
    });
    Promise.all([
      window.electronAPI.dbGetPricingTiers(tenantId || 'global'),
      window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'mrp_sort_order' })
    ])
      .then(([res, mrpSortRes]: [any, any]) => {
        if (Array.isArray(res)) {
          const active = res.filter((t: any) => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
          const mrpSortOrder = (mrpSortRes !== null && mrpSortRes !== undefined && !isNaN(Number(mrpSortRes))) ? Number(mrpSortRes) : 0;
          const sortedWithMrp = sortTiersWithMrp(active, mrpSortOrder);
          setPricingTiers(sortedWithMrp);
          const defaultTier = active.find((t: any) => t.is_default === 1 || t.is_default === true || t.is_default === '1');
          if (defaultTier) {
            setSelectedTierId(defaultTier.pricing_tier_id);
          }
        }
      })
      .catch(console.error);
    window.electronAPI.dbGetProductPricing(tenantId || 'global')
      .then((rows: any) => {
        if (Array.isArray(rows)) {
          const map: Record<string, Record<string, number>> = {};
          for (const r of rows) {
            if (!map[r.product_id]) map[r.product_id] = {};
            map[r.product_id][r.pricing_tier_id] = Number(r.price) || 0;
          }
          setProductPricingMap(map);
          setProductPricingMapLoaded(true);
        }
      })
      .catch(console.error);
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'allow_biller_price_override' })
      .then((v: any) => {
        if (v !== null && v !== undefined) setAllowBillerOverride(Boolean(v));
      })
      .catch(console.error);
    window.electronAPI.dbGetParties(tenantId || 'global')
      .then((res: any) => {
        if (Array.isArray(res)) setPartiesForTier(res);
      })
      .catch(console.error);

    const unsubSync = window.electronAPI?.onSyncDataUpdated?.(() => {
      const tid = tenantId || 'global';
      Promise.all([
        window.electronAPI.dbGetPricingTiers(tid),
        window.electronAPI.settingsGet({ tenant_id: tid, key: 'mrp_sort_order' })
      ])
        .then(([res, mrpSortRes]: [any, any]) => {
          if (Array.isArray(res)) {
            const active = res.filter((t: any) => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted);
            const mrpSortOrder = (mrpSortRes !== null && mrpSortRes !== undefined && !isNaN(Number(mrpSortRes))) ? Number(mrpSortRes) : 0;
            const sortedWithMrp = sortTiersWithMrp(active, mrpSortOrder);
            setPricingTiers(sortedWithMrp);
            const defaultTier = active.find((t: any) => t.is_default === 1 || t.is_default === true || t.is_default === '1');
            if (defaultTier) {
              setSelectedTierId(prev => prev || defaultTier.pricing_tier_id);
            }
          }
        })
        .catch(console.error);

      window.electronAPI.dbGetProductPricing(tid)
        .then((rows: any) => {
          if (Array.isArray(rows)) {
            const map: Record<string, Record<string, number>> = {};
            for (const r of rows) {
              if (!map[r.product_id]) map[r.product_id] = {};
              map[r.product_id][r.pricing_tier_id] = Number(r.price) || 0;
            }
            setProductPricingMap(map);
            setProductPricingMapLoaded(true);
          }
        })
        .catch(console.error);
    });

    return () => {
      if (typeof unsubSync === 'function') unsubSync();
    };
  }, [tenantId]);

  // Listen for settings updates to immediately refresh Computer Code display and tab bill numbers
  useEffect(() => {
    const handleSettingsUpdated = (e: any) => {
      const newCode = e?.detail?.terminalCode;
      if (newCode) {
        setTerminalCodeState(newCode);
      } else if (window.electronAPI) {
        window.electronAPI.settingsGet({ tenant_id: 'global', key: 'terminal_code' }).then((v: any) => {
          if (typeof v === 'string' && v.trim()) {
            setTerminalCodeState(v.trim().replace(/^["']|["']$/g, '').toUpperCase());
          }
        });
      }
      if (e?.detail?.shopName) {
        setShopNameState(e.detail.shopName);
        useAuthStore.setState({ shopName: e.detail.shopName });
      } else if (window.electronAPI) {
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }).then((v: any) => {
          if (typeof v === 'string' && v.trim()) {
            setShopNameState(v.trim());
            useAuthStore.setState({ shopName: v.trim() });
          }
        });
      }
      if (window.electronAPI) {
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }).then((v: any) => {
          if (typeof v === 'string') setShopAddress(v);
        });
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }).then((v: any) => {
          if (typeof v === 'string') setShopPhone(v);
        });
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }).then((v: any) => {
          if (typeof v === 'string') setShopGstin(v);
        });
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_name' }).then((v: any) => {
          if (typeof v === 'string') setBankNameState(v);
        });
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_account_number' }).then((v: any) => {
          if (typeof v === 'string') setBankAccountState(v);
        });
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_ifsc' }).then((v: any) => {
          if (typeof v === 'string') setBankIfscState(v);
        });
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'bank_branch' }).then((v: any) => {
          if (typeof v === 'string') setBankBranchState(v);
        });
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' }).then((v: any) => {
          if (v?.billSettings?.showDescription !== undefined) {
            setShowDescriptionState(v.billSettings.showDescription !== false);
          }
        });
        Promise.all([
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'loyalty_config' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'feature_flags' }),
        ]).then(([rawCfg, rawFlags]: [any, any]) => {
          let cfg = rawCfg;
          if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch {} }
          let flags = rawFlags;
          if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch {} }

          let isEnabled = false;
          let eRate = 100;
          let rRate = 1;
          let awardOnPending = false;

          if (cfg && typeof cfg === 'object') {
            if (cfg.enabled !== undefined) isEnabled = Boolean(cfg.enabled);
            if (cfg.earningRate) eRate = Number(cfg.earningRate) || 100;
            if (cfg.redemptionRate) rRate = Number(cfg.redemptionRate) || 1;
            if (cfg.awardPointsOnPending !== undefined) awardOnPending = Boolean(cfg.awardPointsOnPending);
          }
          if (flags && typeof flags.loyalty === 'boolean') {
            isEnabled = flags.loyalty || isEnabled;
          }

          setLoyaltyEnabled(isEnabled);
          setLoyaltyEarningRate(Math.max(1, eRate));
          setLoyaltyRedemptionRate(Math.max(0.01, rRate));
          setLoyaltyAwardOnPending(awardOnPending);
        }).catch(() => {});
      }
      loadFlags(tenantId || 'global');
      if (isScrapMode) reserveScrapInvoiceNumberForTab(true);
      else if (isQuotationMode) reserveQuotationNumberForTab(true);
      else if (isReturnMode) reserveReturnNumberForTab(true);
      else reserveInvoiceNumberForTab(true);
    };
    window.addEventListener('settings:updated', handleSettingsUpdated);
    return () => window.removeEventListener('settings:updated', handleSettingsUpdated);
  }, [reserveInvoiceNumberForTab, reserveScrapInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab, isScrapMode, isQuotationMode, isReturnMode]);

  // Re-peek invoice number when customer GSTIN / B2B mode changes (B2C ↔ B2B switch)
  const prevIsB2B = useRef(false);
  useEffect(() => {
    if (!enableThreeInvoiceSeries || invoiceType !== 'GST') return;
    if (prevIsB2B.current !== isB2B) {
      prevIsB2B.current = isB2B;
      const series = isB2B ? 'gst_b2b' : 'gst_b2c';
      window.electronAPI?.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series }).then(result => {
        if (result.success && result.invoiceNumber) {
          updateActiveTab({ reservedInvoiceNumber: result.invoiceNumber, title: result.invoiceNumber });
        }
      });
    }
  }, [isB2B, enableThreeInvoiceSeries, invoiceType, tenantId, getActiveTab, updateActiveTab]);

  const [scrapSearchResults, setScrapSearchResults] = useState<any[]>([]);

  // Scrap invoice view state
  const [showScrapInvoiceView, setShowScrapInvoiceView] = useState(false);
  const [scrapInvoiceViewData, setScrapInvoiceViewData] = useState<{ transactions: any[]; totalAmount: number; invoiceNumber: string } | null>(null);
  const [scrapInvoiceViewLoading, _setScrapInvoiceViewLoading] = useState(false);

  // Quotation state
  const [quotationTerms, setQuotationTerms] = useState('1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.');
  const [quotationSaving, setQuotationSaving] = useState(false);
  const [quotationSuccess, setQuotationSuccess] = useState<string | null>(null);

  // Reserve invoice/scrap/quotation/return number when tab becomes active without a reservation
  useEffect(() => {
    if (isScrapMode) {
      reserveScrapInvoiceNumberForTab();
    } else if (isQuotationMode) {
      reserveQuotationNumberForTab();
    } else if (isReturnMode) {
      reserveReturnNumberForTab();
    } else {
      reserveInvoiceNumberForTab();
    }
  }, [activeTabId, reserveInvoiceNumberForTab, reserveScrapInvoiceNumberForTab, reserveQuotationNumberForTab, reserveReturnNumberForTab, isScrapMode, isQuotationMode, isReturnMode]);

  // Whenever checkout/billing completes, invalidate stale reserved numbers across tabs and re-peek
  useEffect(() => {
    const handleInvoiceCreated = async () => {
      const { tabs } = useTabStore.getState();
      let updatedTabs = [...tabs];

      let baseNormal = '';
      let baseScrap = '';
      let baseQuotation = '';
      let baseReturn = '';

      if (window.electronAPI) {
        try {
          const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (customerGstin?.trim() ? 'gst_b2b' : 'gst_b2c') : 'normal') : undefined;
          const r = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
          if (r?.success && r.invoiceNumber) baseNormal = r.invoiceNumber;
        } catch {}

        try {
          const r = await window.electronAPI.dbPeekNextScrapInvoiceNumber({ tenant_id: 'global' });
          if (r?.success && r.invoiceNumber) baseScrap = r.invoiceNumber;
        } catch {}

        try {
          const r = await window.electronAPI.dbPeekNextQuotationNumber({ tenant_id: 'global' });
          if (r?.success && r.quotationNumber) baseQuotation = r.quotationNumber;
        } catch {}

        try {
          const r = await window.electronAPI.dbPeekNextReturnNumber({ tenant_id: tenantId || 'global' });
          if (r?.success && r.returnNumber) baseReturn = r.returnNumber;
        } catch {}
      }

      const reservedNormalList: string[] = [];
      const reservedScrapList: string[] = [];
      const reservedQuotationList: string[] = [];
      const reservedReturnList: string[] = [];

      updatedTabs = updatedTabs.map(t => {
        if (t.snapshot.editingInvoiceId || t.snapshot.editingQuotationId) return t;

        const nextNormal = baseNormal ? getNextOffsetInvoiceNumber(baseNormal, reservedNormalList) : '';
        if (nextNormal) reservedNormalList.push(nextNormal);

        const nextScrap = baseScrap ? getNextOffsetInvoiceNumber(baseScrap, reservedScrapList) : '';
        if (nextScrap) reservedScrapList.push(nextScrap);

        const nextQuotation = baseQuotation ? getNextOffsetInvoiceNumber(baseQuotation, reservedQuotationList) : '';
        if (nextQuotation) reservedQuotationList.push(nextQuotation);

        const nextReturn = baseReturn ? getNextOffsetInvoiceNumber(baseReturn, reservedReturnList) : '';
        if (nextReturn) reservedReturnList.push(nextReturn);

        const isScrap = t.snapshot.isScrapMode;
        const isQuotation = t.snapshot.isQuotationMode;
        const isReturn = t.snapshot.isReturnMode;
        const activeNum = isReturn ? nextReturn : isScrap ? nextScrap : isQuotation ? nextQuotation : nextNormal;

        const oldTitle = t.title;
        const shouldUpdateTitle = !oldTitle || oldTitle === 'New' || oldTitle === t.reservedInvoiceNumber || oldTitle === t.reservedScrapInvoiceNumber || oldTitle === t.reservedQuotationNumber || oldTitle === t.reservedReturnNumber || oldTitle.startsWith('Bill ') || oldTitle.startsWith('GST-');

        return {
          ...t,
          reservedInvoiceNumber: nextNormal,
          reservedScrapInvoiceNumber: nextScrap,
          reservedQuotationNumber: nextQuotation,
          reservedReturnNumber: nextReturn,
          title: shouldUpdateTitle && activeNum ? activeNum : t.title,
        };
      });

      useTabStore.setState({ tabs: updatedTabs });
    };

    window.addEventListener('checkout:completed', handleInvoiceCreated);
    window.addEventListener('invoice:created', handleInvoiceCreated);
    return () => {
      window.removeEventListener('checkout:completed', handleInvoiceCreated);
      window.removeEventListener('invoice:created', handleInvoiceCreated);
    };
  }, [tenantId, enableThreeInvoiceSeries, invoiceType, customerGstin]);

  // Ensure tab title stays synced with scrap editing invoice number
  useEffect(() => {
    if (isScrapMode && editingInvoiceNumber) {
      const tab = getActiveTab();
      if (tab && tab.title !== editingInvoiceNumber) {
        updateActiveTab({ title: editingInvoiceNumber, reservedScrapInvoiceNumber: editingInvoiceNumber });
      }
    }
  }, [isScrapMode, editingInvoiceNumber, getActiveTab, updateActiveTab]);

  const pendingScrapInvoiceToEdit = useCartStore(s => s.pendingScrapInvoiceToEdit);

  const loadScrapInvoiceForEdit = useCallback(async (invNum: string) => {
    if (!invNum || !window.electronAPI) return;
    const tid = tenantId || 'global';
    const detail = await window.electronAPI.dbGetScrapInvoiceByNumber({ tenant_id: tid, scrap_invoice_number: invNum });
    if (!detail || !detail.transactions || detail.transactions.length === 0) return;

    // Explicitly disable Return, Quotation & Past Bill modes first
    setReturnMode(false);
    setQuotationMode(false);
    setIsPastBillMode(false);
    setSelectedReturnInvoice(null);

    // Clear cart first, then enable Scrap mode
    clearCart();
    clearScrapDeduction();
    setIsScrapMode(true);
    useCartStore.getState().setEditingInvoice(invNum, invNum, 'OWNER');
    setDiscount(0, 'FIXED');

    const firstTx = detail.transactions[0];
    const savedPaymentStatus = ['CASH', 'CREDIT', 'SETTLED'].includes(firstTx.payment_status) ? firstTx.payment_status : 'PENDING';

    updateActiveTab({
      customerName: firstTx.party_name || '',
      customerPhone: firstTx.customer_phone || '',
      customerAddress: firstTx.customer_address || '',
      reservedReturnNumber: '',
      reservedInvoiceNumber: '',
      reservedQuotationNumber: '',
      reservedScrapInvoiceNumber: invNum,
      scrapPaymentStatus: savedPaymentStatus,
      paymentMethod: savedPaymentStatus === 'CASH' ? 'CASH' : 'PENDING',
      receivedAmount: 0,
      title: invNum,
    });

    // Populate scrap items cleanly into cart
    detail.transactions.forEach((tx: any) => {
      addItem({
        product_id: tx.transaction_id || uuidv4(),
        scrap_category_id: tx.scrap_category_id,
        name: tx.scrap_category_name || 'Scrap Item',
        base_price: Number(tx.rate),
        purchase_price: Number(tx.rate),
        tax_rate_percent: 0,
        quantity: Number(tx.quantity) || 0,
        isScrap: true,
        billing_type: 'WEIGHT',
        unit: tx.unit || 'Kgs',
      });
    });
    syncActiveSnapshot();
  }, [tenantId, clearCart, addItem, updateActiveTab, setReturnMode, setQuotationMode, clearScrapDeduction, setDiscount]);

  useEffect(() => {
    if (pendingScrapInvoiceToEdit) {
      const invNum = pendingScrapInvoiceToEdit;
      useCartStore.getState().setPendingScrapInvoiceToEdit(null);
      updateActiveTab({ title: invNum, reservedScrapInvoiceNumber: invNum });
      loadScrapInvoiceForEdit(invNum);
    }
  }, [pendingScrapInvoiceToEdit, loadScrapInvoiceForEdit, updateActiveTab]);

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

  useEffect(() => {
    // In scrap mode, return mode, or past bill mode, or queries under 1 char, skip product search
    const trimmed = searchQuery.trim();
    if (isScrapMode || isReturnMode || isPastBillMode || trimmed.length < 1) {
      setResults([]);
      setIsProductSearching(false);
      return;
    }
    setIsProductSearching(true);
    let isCurrent = true;
    const t = setTimeout(async () => {
      if (!window.electronAPI) {
        setIsProductSearching(false);
        return;
      }
      const { tenantId } = useAuthStore.getState();
      // GST invoices: only show GST-applicable products (quotations stay unfiltered)
      const isGstFilter = !isQuotationMode && invoiceType === 'GST';
      // Fetch up to 200 results so numeric or text searches capture all matching items without UI lag
      const fetchLimit = 200;
      
      const backendSearch = trimmed;

      try {
        const [products, combos] = await Promise.all([
          window.electronAPI.dbGetProducts({ tenant_id: tenantId, search: backendSearch, limit: fetchLimit, ...(isGstFilter ? { isGst: 1 } : {}) }),
          window.electronAPI.dbGetComboOffers({ tenant_id: tenantId, search: trimmed, only_active: true }),
        ]);

        if (!isCurrent) return;

        const comboResults = (Array.isArray(combos) ? combos : []).map((c: any) => ({
          product_id: c.combo_id,
          name: c.name,
          sku_barcode: c.sku_barcode || '',
          item_code: c.sku_barcode || '',
          base_price: c.combo_price,
          purchase_price: 0,
          current_stock: 999,
          uom: 'Combo',
          billing_type: 'PIECE',
          isCombo: true,
          combo_id: c.combo_id,
          combo_price: c.combo_price,
          combo_items: c.items,
          description: c.description,
        }));

        const rawProducts = Array.isArray(products) ? products : [];
        const sortedProds = sortProductsBySearchPriority(rawProducts, trimmed);

        const filteredProds = sortedProds.filter(p => {
          const isPaperOnlyProduct = (() => {
            try {
              const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
              const isMarkedPaper = Boolean(da && da.gst_type === 'PAPER');
              const hasRealStock = Number(p.current_stock || 0) > 0;
              const hasRealPricing = (Number(p.base_price || 0) > 0) || (Number(p.purchase_price || 0) > 0);
              // A product is only paper-only if it is marked PAPER and has neither real stock nor real shop pricing.
              // If it has real shop pricing or real stock, it is a real product in the shop (even if currently Out of Stock).
              return isMarkedPaper && !hasRealStock && !hasRealPricing;
            } catch { return false; }
          })();

          if (isPaperOnlyProduct) {
            if (!enableRealPaperStock) return false;
            if (invoiceType === 'GST' && !showPaperInGstSetting) {
              return false;
            }
            if (invoiceType !== 'GST' && !showPaperInEstSetting) {
              return false;
            }
          }

          const q = trimmed.toLowerCase();
          if (!q) return false;
          const qNoSpace = q.replace(/\s+/g, '');
          const qClean = cleanSearchText(q);
          const qWords = q.split(/[^\p{L}\p{N}]+/gu).filter(w => w.length > 0);

          const rawFields = [
            String(p.sku_barcode || '').toLowerCase(),
            String(p.item_code || '').toLowerCase(),
            String(p.name || '').toLowerCase(),
            String(p.brand_manufacturer || '').toLowerCase(),
            String(p.category || '').toLowerCase(),
            String(p.hsn_sac_code || '').toLowerCase(),
          ];

          const fieldsData = rawFields.map(val => ({
            raw: val,
            noSpace: val.replace(/\s+/g, ''),
            clean: cleanSearchText(val),
          }));

          const combinedRaw = rawFields.join(' ');
          const combinedNoSpace = combinedRaw.replace(/\s+/g, '');
          const combinedClean = cleanSearchText(combinedRaw);

          // 1. Direct full query matches (raw, no-space, or special-char-clean)
          if (
            combinedRaw.includes(q) ||
            (qNoSpace.length > 0 && combinedNoSpace.includes(qNoSpace)) ||
            (qClean.length > 0 && combinedClean.includes(qClean))
          ) {
            return true;
          }

          // 2. All query words match across product fields
          const isWordMatch = (w: string) => {
            const wLower = w.toLowerCase();
            const wNoSpace = wLower.replace(/\s+/g, '');
            const wClean = cleanSearchText(wLower);
            return fieldsData.some(f =>
              f.raw.includes(wLower) ||
              (wNoSpace.length > 0 && f.noSpace.includes(wNoSpace)) ||
              (wClean.length > 0 && f.clean.includes(wClean))
            ) ||
            combinedRaw.includes(wLower) ||
            (wNoSpace.length > 0 && combinedNoSpace.includes(wNoSpace)) ||
            (wClean.length > 0 && combinedClean.includes(wClean));
          };

          return qWords.length > 0 && qWords.every(isWordMatch);
        });

        const deduped: any[] = [];
        let serviceFound = false;
        for (const p of filteredProds) {
          const isServiceCharge = Number(p.is_service_item) === 1 || String(p.name || '').trim().toLowerCase() === 'service charge';
          if (isServiceCharge) {
            if (serviceFound) continue;
            serviceFound = true;
          }
          deduped.push(p);
        }

        if (!isCurrent) return;
        setResults([...comboResults, ...deduped].slice(0, 50));
        setSelectedIndex(0);
      } catch (err) {
        if (!isCurrent) return;
        console.error('[BillingPage] Product search error:', err);
      } finally {
        if (isCurrent) setIsProductSearching(false);
      }
    }, 120);
    return () => {
      isCurrent = false;
      clearTimeout(t);
    };
  }, [searchQuery, isScrapMode, isReturnMode, isPastBillMode, invoiceType, isQuotationMode, enableRealPaperStock, showPaperInGstSetting, showPaperInEstSetting]);

  // Fetch categories & grades immediately so options are ready instantly when form opens
  const loadCategoriesAndGrades = useCallback(() => {
    if (!window.electronAPI || !tenantId) return;
    window.electronAPI.dbGetProducts({ tenant_id: tenantId, limit: 500 })
      .then((res: any[]) => {
        if (Array.isArray(res)) {
          const cats = [...new Set(res.map(p => p.category).filter(Boolean))] as string[];
          setConfiguredCategories(cats);
        }
      })
      .catch(console.error);
    window.electronAPI.dbGetGrades(tenantId)
      .then((res: any[]) => {
        if (Array.isArray(res)) setNewProductGrades(res);
      })
      .catch(console.error);
  }, [tenantId]);

  useEffect(() => {
    loadCategoriesAndGrades();
  }, [loadCategoriesAndGrades]);

  useEffect(() => {
    if (showProductCreateForm) {
      loadCategoriesAndGrades();
    }
  }, [showProductCreateForm, loadCategoriesAndGrades]);

  useEffect(() => {
    if (!window.electronAPI || !tenantId) {
      setProductPriceCoding(null);
      return;
    }
    window.electronAPI.settingsGet({ tenant_id: tenantId, key: 'price_coding' })
      .then((value: any) => setProductPriceCoding(value && typeof value === 'object' ? value : null))
      .catch(() => setProductPriceCoding(null));
  }, [tenantId]);

  // Fetch most sold products for 3-column express layout
  useEffect(() => {
    if (!window.electronAPI || !tenantId) return;
    let cancelled = false;

    const fetchMostSold = async () => {
      try {
        if (window.electronAPI.dbGetProductSalesSummary) {
          const summary = await window.electronAPI.dbGetProductSalesSummary({ tenant_id: tenantId || 'global' });
          if (!cancelled && Array.isArray(summary) && summary.length > 0) {
            const sorted = summary
              .filter((p: any) => Number(p.is_service_item) !== 1 && String(p.name || '').trim().toLowerCase() !== 'service charge')
              .sort((a: any, b: any) => ((Number(b.gst_qty || 0) + Number(b.bos_qty || 0)) - (Number(a.gst_qty || 0) + Number(a.bos_qty || 0))));
            if (sorted.length > 0) {
              setMostSoldProducts(sorted.slice(0, 30));
              return;
            }
          }
        }
        const prods = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, limit: 30 });
        if (!cancelled && Array.isArray(prods)) {
          setMostSoldProducts(prods.filter((p: any) => Number(p.is_service_item) !== 1 && String(p.name || '').trim().toLowerCase() !== 'service charge'));
        }
      } catch (err) {
        console.error('[BillingPage] Failed to fetch most sold products:', err);
      }
    };

    fetchMostSold();
    return () => { cancelled = true; };
  }, [tenantId, uiConfig.orientation, uiConfig.showQuickCategoryBar]);

  // Scrap category search (when scrap mode active - categories ARE items)
  useEffect(() => {
    if (!isScrapMode || searchQuery.length < 2) { setScrapSearchResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      const cats = await window.electronAPI.dbGetScrapCategoriesBySearch({ tenant_id: tenantId || '', search: searchQuery });
      if (Array.isArray(cats)) {
        setScrapSearchResults(cats);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery, isScrapMode]);

  // Past bill search (when past bill mode active)
  useEffect(() => {
    if (!isPastBillMode || searchQuery.length < 2) { setPastBillResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const tid = tenantId || 'global';
      const invoices = await window.electronAPI.dbGetInvoices({
        tenant_id: tid,
        search: searchQuery.trim(),
        limit: 10,
      });
      if (Array.isArray(invoices)) {
        setPastBillResults(invoices);
        setSelectedIndex(0);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, isPastBillMode, tenantId]);

  // Invoice search for Return Mode — feeds main search dropdown
  useEffect(() => {
    if (!isReturnMode || searchQuery.length < 2) { setReturnSearchResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const tid = tenantId || 'global';
      const invoices = await window.electronAPI.dbGetReturnableInvoices({
        tenant_id: tid,
        search: searchQuery.trim(),
        limit: 10,
      });
      if (Array.isArray(invoices)) {
        setReturnSearchResults(invoices);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, isReturnMode, tenantId]);

  // Scrap deduction search
  useEffect(() => {
    if (storeScrapDeduction > 0 || scrapDeductionSearchQuery.length < 1) { setScrapDeductionResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const tid = tenantId || 'global';
      const list = await window.electronAPI.dbGetScrapInvoiceList({ tenant_id: tid });
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
      if (!window.electronAPI) return;
      const tid = tenantId || 'global';
      const list = await window.electronAPI.dbGetPendingReturnInvoices({ tenant_id: tid });
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

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const scrapDeductionInputRef = useRef<HTMLInputElement>(null);
  const [scrapDeductionDropdownStyle, setScrapDeductionDropdownStyle] = useState<React.CSSProperties | null>(null);
  const returnDeductionInputRef = useRef<HTMLInputElement>(null);
  const [returnDeductionDropdownStyle, setReturnDeductionDropdownStyle] = useState<React.CSSProperties | null>(null);
  const pointsDeductionInputRef = useRef<HTMLInputElement>(null);

  // Load all existing customers for fast autocomplete
  useEffect(() => {
    if (window.electronAPI?.dbGetCustomers) {
      window.electronAPI.dbGetCustomers({ tenant_id: tenantId || 'global' })
        .then((data: any) => {
          if (Array.isArray(data)) {
            setAllCustomersList(data);
          }
        })
        .catch(() => {});
    }
  }, [tenantId]);

  // Load all active staff when staff credit billing feature flag is enabled
  useEffect(() => {
    if (featureFlags?.staff_credit_billing && window.electronAPI?.dbGetStaff) {
      window.electronAPI.dbGetStaff({ tenant_id: tenantId || 'global', status: 'ACTIVE' })
        .then((data: any) => {
          if (Array.isArray(data)) {
            setAllStaffList(data);
          }
        })
        .catch(() => {});
    } else {
      setAllStaffList([]);
    }
  }, [featureFlags?.staff_credit_billing, tenantId]);

  // Customer autofill search by name or phone
  useEffect(() => {
    const nameQuery = customerName.trim();
    const phoneQuery = customerPhone.trim();
    if ((!nameQuery && !phoneQuery) || !window.electronAPI) {
      setCustomerSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results = await window.electronAPI.dbFindCustomers({
          tenant_id: tenantId || 'global',
          name: nameQuery || undefined,
          phone: phoneQuery || undefined,
        });
        if (Array.isArray(results)) {
          setCustomerSearchResults(results);
        }
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [customerName, customerPhone, tenantId]);

  // Memoize party map and party customer list so they are not rebuilt on every keystroke
  const cachedPartyMap = useMemo(() => {
    const map = new Map<string, any>();
    const isStaffEnabled = Boolean(featureFlags?.staff_credit_billing);
    (partiesForTier || []).forEach((p: any) => {
      if (!p || !p.name) return;
      const pType = String(p.party_type || '').toUpperCase();
      // In billing page, strictly NO suppliers!
      if (pType === 'SUPPLIER') return;
      // Staff only when ON in settings
      if (pType === 'STAFF' && !isStaffEnabled) return;

      const pName = (p.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const pPhone = (p.phone || '').trim();
      if (pName) map.set(pName, p);
      if (pPhone) map.set(pPhone, p);
      if (pName && pPhone) map.set(`${pName}|${pPhone}`, p);
    });
    return map;
  }, [partiesForTier, featureFlags?.staff_credit_billing]);

  const cachedPartyCustomers = useMemo(() => {
    const isStaffEnabled = Boolean(featureFlags?.staff_credit_billing);
    return (partiesForTier || [])
      .filter((p: any) => {
        if (!p || !p.name) return false;
        const pType = String(p.party_type || '').toUpperCase();
        // In billing page, strictly NO suppliers!
        if (pType === 'SUPPLIER') return false;
        // Staff only when ON in settings
        if (pType === 'STAFF' && !isStaffEnabled) return false;
        return true;
      })
      .map((p: any) => {
        const pPhone = (p.phone || '').trim();
        const pNormName = (p.name || '').trim().toLowerCase();
        const cust = (allCustomersList || []).find((c: any) => {
          if (!c) return false;
          const cPhone = String(c.phone || '').trim();
          const cName = String(c.name || '').trim().toLowerCase();
          return (pPhone && cPhone === pPhone) || (pNormName && cName === pNormName);
        });
        return {
          name: p.name,
          phone: p.phone,
          address: p.address,
          gstin: p.gstin,
          customer_gstin: p.gstin,
          party_id: p.party_id,
          customer_id: cust?.customer_id || p.customer_id || undefined,
          current_points_balance: cust ? Number(cust.current_points_balance) || 0 : undefined,
          balance: p.balance,
          party_type: p.party_type,
          is_staff: String(p.party_type || '').toUpperCase() === 'STAFF',
        };
      });
  }, [partiesForTier, allCustomersList, featureFlags?.staff_credit_billing]);

  // Compute filtered & deduplicated customer suggestions (including staff if enabled)
  const filteredCustomerSuggestions = useMemo(() => {
    const qName = customerName.trim().replace(/\s+/g, ' ').toLowerCase();
    const qPhone = customerPhone.trim();
    if (!qName && !qPhone) return [];

    const isStaffEnabled = Boolean(featureFlags?.staff_credit_billing);
    const staffItems = (isStaffEnabled && Array.isArray(allStaffList)) ? allStaffList.map(s => ({
      customer_id: s.staff_id,
      staff_id: s.staff_id,
      is_staff: true,
      name: s.name,
      phone: s.phone || '',
      staff_code: s.staff_code,
      role_designation: s.role_designation,
      balance: s.current_balance,
    })) : [];

    const combined = [...staffItems, ...cachedPartyCustomers, ...customerSearchResults, ...allCustomersList];
    const seen = new Set<string>();
    const matched: any[] = [];

    for (const c of combined) {
      if (!c || !c.name) continue;
      const pType = String(c.party_type || '').toUpperCase();
      // In billing page, strictly NO suppliers!
      if (pType === 'SUPPLIER') continue;

      const isStaff = Boolean(c.is_staff || pType === 'STAFF');
      // Staff only when ON in settings
      if (isStaff && !isStaffEnabled) continue;

      const cNormName = c.name.trim().replace(/\s+/g, ' ').toLowerCase();
      const cPhone = (c.phone || '').trim();
      const key = isStaff ? `staff|${c.staff_id || c.name}` : `${cNormName}|${cPhone}`;
      if (seen.has(key)) continue;

      const matchesName = qName ? cNormName.includes(qName) : false;
      const matchesPhone = qPhone ? cPhone.includes(qPhone) : false;

      if (matchesName || matchesPhone) {
        seen.add(key);
        const pMatch = isStaff ? null : (cachedPartyMap.get(key) || cachedPartyMap.get(cNormName) || (cPhone ? cachedPartyMap.get(cPhone) : null));
        const mergedBal = c.balance ?? (pMatch ? pMatch.balance : undefined);
        matched.push({
          ...c,
          is_staff: isStaff,
          balance: mergedBal,
        });
        if (matched.length >= 15) break;
      }
    }
    return matched;
  }, [customerName, customerPhone, customerSearchResults, allCustomersList, allStaffList, featureFlags?.staff_credit_billing, cachedPartyCustomers, cachedPartyMap]);

  const findMatchingParty = useCallback((name?: string, phone?: string) => {
    const cleanName = (name || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim();
    if (!cleanName && !cleanPhone) return null;
    const isStaffEnabled = Boolean(featureFlags?.staff_credit_billing);
    const combinedList = [
      ...(partiesForTier || []).filter((p: any) => {
        if (!p) return false;
        const pType = String(p.party_type || '').toUpperCase();
        if (pType === 'SUPPLIER') return false;
        if (pType === 'STAFF' && !isStaffEnabled) return false;
        return true;
      }),
      ...(allCustomersList || []).filter((c: any) => String(c?.party_type || '').toUpperCase() !== 'SUPPLIER'),
      ...(customerSearchResults || []).filter((c: any) => String(c?.party_type || '').toUpperCase() !== 'SUPPLIER'),
    ];
    const match = combinedList.find((c: any) => {
      if (!c) return false;
      const cName = (c.name || '').trim().toLowerCase();
      const cPhone = String(c.phone || '').trim();
      const matchName = cleanName && cName && (
        cName === cleanName ||
        cName.replace(/^[.\s]+/, '') === cleanName.replace(/^[.\s]+/, '')
      );
      const matchPhone = cleanPhone && cPhone && cPhone === cleanPhone;
      return Boolean(matchName || matchPhone);
    }) || null;

    if (match) {
      const cust = (allCustomersList || []).find((c: any) => {
        if (!c) return false;
        const cp = String(c.phone || '').trim();
        const cn = String(c.name || '').trim().toLowerCase();
        return (cleanPhone && cp && cp === cleanPhone) || (cleanName && cn && cn === cleanName);
      });
      return {
        ...match,
        customer_id: match.customer_id || cust?.customer_id,
        current_points_balance: match.current_points_balance ?? (cust ? Number(cust.current_points_balance) || 0 : undefined),
      };
    }
    return null;
  }, [partiesForTier, allCustomersList, customerSearchResults, featureFlags?.staff_credit_billing]);

  // Debounce party tier application & loyalty customer auto-matching during customer typing so typing is never blocked
  useEffect(() => {
    const cleanName = customerName.trim().toLowerCase();
    const cleanPhone = customerPhone.trim();
    if (!cleanName && !cleanPhone) {
      if (loyaltyCustomerData.customerId) {
        setLoyaltyCustomerData({ customerId: null, pointsBalance: 0 });
        setPointsToRedeem(0);
        setShowLoyaltyRedemption(false);
      }
      return;
    }
    const timer = setTimeout(() => {
      applyPartyTier(customerName, customerPhone);
      const matched = findMatchingParty(customerName, customerPhone);
      const custMatch = (allCustomersList || []).find((c: any) => {
        if (!c) return false;
        const cp = String(c.phone || '').trim();
        const cn = String(c.name || '').trim().toLowerCase();
        if (cleanPhone && cp && cp === cleanPhone) return true;
        if (cleanName && cn && cn === cleanName) return true;
        return false;
      });

      const resolvedCustId = (matched && matched.customer_id) || custMatch?.customer_id;
      const resolvedPoints = custMatch?.current_points_balance !== undefined
        ? Number(custMatch.current_points_balance) || 0
        : (matched?.current_points_balance !== undefined ? Number(matched.current_points_balance) || 0 : 0);

      if (resolvedCustId) {
        setLoyaltyCustomerData({
          customerId: resolvedCustId,
          pointsBalance: Number(resolvedPoints) || 0,
        });
        if (!activeTab?.customerId) {
          updateActiveTab({ customerId: resolvedCustId });
        }
      } else if (cleanPhone || cleanName) {
        // Query backend directly if not loaded in memory yet
        if (window.electronAPI?.dbFindCustomers) {
          window.electronAPI.dbFindCustomers({
            tenant_id: tenantId || 'global',
            phone: cleanPhone || undefined,
            name: cleanName || undefined,
          }).then((res: any) => {
            const list = Array.isArray(res) ? res : [];
            const found = list.find((c: any) =>
              (cleanPhone && String(c.phone || '').trim() === cleanPhone) ||
              (cleanName && String(c.name || '').trim().toLowerCase() === cleanName)
            ) || list[0];
            if (found && found.customer_id) {
              setLoyaltyCustomerData({
                customerId: found.customer_id,
                pointsBalance: Number(found.current_points_balance) || 0,
              });
              if (!activeTab?.customerId) {
                updateActiveTab({ customerId: found.customer_id });
              }
            }
          }).catch(() => {});
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [customerName, customerPhone, findMatchingParty, allCustomersList, tenantId]);

  // Ensure redeemed points does not exceed active customer balance
  useEffect(() => {
    const bal = Number(loyaltyCustomerData?.pointsBalance) || 0;
    if (!loyaltyCustomerData.customerId || bal <= 0) {
      if (pointsToRedeem > 0) setPointsToRedeem(0);
      if (showLoyaltyRedemption) setShowLoyaltyRedemption(false);
    } else if (pointsToRedeem > bal) {
      setPointsToRedeem(bal);
    }
  }, [loyaltyCustomerData.customerId, loyaltyCustomerData.pointsBalance]);

  // Click outside to dismiss customer suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerNameContainerRef.current && !customerNameContainerRef.current.contains(e.target as Node) &&
        customerPhoneInputRef.current && !customerPhoneInputRef.current.contains(e.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectCustomerSuggestion = (c: any) => {
    skipCustomerDropdownOnFocusRef.current = true;
    const cleanName = (c.name || '').trim().replace(/\s+/g, ' ');
    const cleanPhone = (c.phone || '').trim();
    const cleanAddress = (c.address || '').trim();

    updateActiveTab({
      customerId: c.customer_id || '',
      isStaffCustomer: Boolean(c.is_staff),
      staffId: c.is_staff ? (c.staff_id || c.customer_id) : undefined,
      customerName: cleanName,
      customerPhone: cleanPhone,
      customerAddress: cleanAddress,
      customerGstin: c.gstin || c.customer_gstin || '',
    });
    applyPartyTier(cleanName, cleanPhone);
    if (c.customer_id) {
      setLoyaltyCustomerData({
        customerId: c.customer_id,
        pointsBalance: Number(c.current_points_balance) || 0,
      });
    }
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
    setTimeout(() => {
      focusInputWithoutDropdown(customerPhoneInputRef.current);
    }, 40);
  };

  const handleCustomerNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCustomerDropdown && filteredCustomerSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev + 1) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev - 1 + filteredCustomerSuggestions.length) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredCustomerSuggestions[selectedCustomerIndex]) {
          selectCustomerSuggestion(filteredCustomerSuggestions[selectedCustomerIndex]);
        } else {
          setShowCustomerDropdown(false);
          focusInputWithoutDropdown(customerPhoneInputRef.current);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCustomerDropdown(false);
        return;
      }
    }

    // Dropdown not showing or no suggestions
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      focusInputWithoutDropdown(customerPhoneInputRef.current);
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionEnd === input.value.length) {
        e.preventDefault();
        setShowCustomerDropdown(false);
        focusInputWithoutDropdown(customerPhoneInputRef.current);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  };

  const handleCustomerPhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCustomerDropdown && filteredCustomerSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev + 1) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCustomerIndex(prev => (prev - 1 + filteredCustomerSuggestions.length) % filteredCustomerSuggestions.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredCustomerSuggestions[selectedCustomerIndex]) {
          selectCustomerSuggestion(filteredCustomerSuggestions[selectedCustomerIndex]);
        } else {
          setShowCustomerDropdown(false);
          customerAddressInputRef.current?.focus();
          customerAddressInputRef.current?.select();
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCustomerDropdown(false);
        return;
      }
    }

    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      customerAddressInputRef.current?.focus();
      customerAddressInputRef.current?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      focusInputWithoutDropdown(customerNameInputRef.current);
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        setShowCustomerDropdown(false);
        focusInputWithoutDropdown(customerNameInputRef.current);
      }
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionEnd === input.value.length) {
        e.preventDefault();
        setShowCustomerDropdown(false);
        customerAddressInputRef.current?.focus();
        customerAddressInputRef.current?.select();
      }
    }
  };

  const handleCustomerAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (invoiceType === 'GST' && customerGstinInputRef.current) {
        customerGstinInputRef.current.focus();
        customerGstinInputRef.current.select();
      } else {
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusInputWithoutDropdown(customerPhoneInputRef.current);
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        focusInputWithoutDropdown(customerPhoneInputRef.current);
      }
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionEnd === input.value.length) {
        e.preventDefault();
        if (invoiceType === 'GST' && customerGstinInputRef.current) {
          customerGstinInputRef.current.focus();
          customerGstinInputRef.current.select();
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }
    }
  };

  const handleCustomerGstinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown') {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      customerAddressInputRef.current?.focus();
      customerAddressInputRef.current?.select();
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        customerAddressInputRef.current?.focus();
        customerAddressInputRef.current?.select();
      }
    }
  };

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
  }, []);

  useEffect(() => {
    if (!showProductCreateForm) return;

    const focusTimer = window.setTimeout(() => firstInputRef.current?.focus(), 50);
    let cancelled = false;

    // Editing must preserve the barcode belonging to the selected cart product.
    // Barcode generation here is only a convenience for a new product.
    if (!editingProductId && window.electronAPI && tenantId) {
      (async () => {
        try {
          const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId });
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
  }, [showProductCreateForm, editingProductId, tenantId]);

  const [isLoadingEditBill, setIsLoadingEditBill] = useState(false);

  // Listen for Edit Bill from Sales History — loads items directly into cart
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('editBillData');
      if (!raw) return;
      localStorage.removeItem('editBillData');

      try {
        const { invoice: localInvoice, items: invoiceItems, originalRole } = JSON.parse(raw);
        if (!invoiceItems?.length) return;

        setIsLoadingEditBill(true);

        let invoice = localInvoice;
        if (window.electronAPI?.dbGetInvoices && localInvoice?.invoice_id) {
          try {
            const fetched = await window.electronAPI.dbGetInvoices({ search: localInvoice.invoice_number || localInvoice.invoice_id, tenant_id: localInvoice.tenant_id });
            if (Array.isArray(fetched) && fetched.length > 0) {
              const exact = fetched.find((i: any) => i.invoice_id === localInvoice.invoice_id);
              if (exact) {
                invoice = exact;
              }
            }
          } catch (e) {
            console.warn('Failed to fetch fresh invoice from DB for edit, using cached invoice data', e);
          }
        }

        const currentCartItems = useCartStore.getState().items;
        const currentEditingId = useCartStore.getState().editingInvoiceId;
        if (!useTabStore.getState().activeTabId || (currentCartItems.length > 0 && currentEditingId !== invoice.invoice_id)) {
          tabCounter.current++;
          addTab(undefined, invoice.invoice_number || `Bill ${tabCounter.current}`);
        }

        // Enrich items with product data (barcode, brand, tax rate, uom, hsn, pricing, etc.)
        const productIds = [...new Set(invoiceItems.map((i: any) => i.product_id).filter(Boolean))] as string[];
        const productMap: Record<string, any> = {};
        if (productIds.length > 0) {
          try {
            const products = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
            if (Array.isArray(products)) {
              products.forEach((p: any) => { productMap[p.product_id] = p; });
            }
          } catch {}
        }

        const enrichedItems: CartItem[] = invoiceItems.map((item: any) => {
          const productId = item.product_id || item.item_id || `edit-${Date.now()}-${Math.random()}`;
          const p = productMap[item.product_id];
          const isPcsWeight = item.billing_type === 'WEIGHT' ||
                              (p && (p.billing_type === 'WEIGHT' || ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'].includes((p.uom || '').toLowerCase()))) ||
                              ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'].includes((item.uom || item.unit || '').toLowerCase()) ||
                              (item.pieces_sold != null && item.pieces_sold > 0 && Number(item.quantity) !== Number(item.pieces_sold)) ||
                              (item.pieces_override != null && item.pieces_override > 0 && Number(item.quantity) !== Number(item.pieces_override));

          let sku_barcode = item.sku_barcode || null;
          let brand_manufacturer = item.brand_manufacturer || null;

          const itemCgstR = Number(item.cgst_rate) || 0;
          const itemSgstR = Number(item.sgst_rate) || 0;
          const itemIgstR = Number(item.igst_rate) || 0;
          const combinedRate = itemCgstR + itemSgstR + itemIgstR;
          const pTaxRate = Number(p?.tax_rate_percent ?? (p as any)?.gst_percent ?? 0);

          let tax_rate_percent = combinedRate || Number(item.tax_rate_percent) || Number(item.item_tax_rate) || pTaxRate || 0;
          if (tax_rate_percent <= 0 && Number(item.tax_amount) > 0) {
            const itemBase = (Number(item.unit_price) * Number(item.quantity)) || (Number(item.total) - Number(item.tax_amount));
            if (itemBase > 0) {
              tax_rate_percent = Math.round((Number(item.tax_amount) / itemBase) * 100 * 10) / 10;
            }
          }

          let billing_type = isPcsWeight ? 'WEIGHT' : (item.billing_type || 'PIECE');
          let pricing_mode = item.pricing_mode || 'FIXED';
          let purchase_price = Number(item.purchase_price) || 0;
          let grade_id = item.grade_id || null;
          let grade_rate = item.grade_rate || null;
          let uom = item.uom || item.unit || (isPcsWeight ? 'Kgs' : 'PCS');
          let pieces_per_kg: number | undefined = undefined;
          let base_price = Number(item.base_price) || 0;
          let offer_price = item.offer_price ?? null;
          let discount_flat = item.discount_flat ?? null;
          let discount_percent = item.discount_percent ?? null;
          let catalog_discount_percent: number | null = null;
          let catalog_discount_flat: number | null = null;
          let catalog_offer_price: number | null = null;

          if (p) {
            sku_barcode = p.sku_barcode || null;
            brand_manufacturer = p.brand_manufacturer || null;
            if (pTaxRate > 0 && (tax_rate_percent <= 0 || combinedRate <= 0)) {
              tax_rate_percent = pTaxRate;
            }
            billing_type = isPcsWeight ? 'WEIGHT' : (p.billing_type || 'PIECE');
            pricing_mode = p.pricing_mode || 'FIXED';
            purchase_price = p.purchase_price || 0;
            grade_id = p.grade_id || null;
            grade_rate = p.grade_rate || null;
            uom = p.uom || (isPcsWeight ? 'Kgs' : 'PCS');

            if (p.billing_type === 'WEIGHT' && p.domain_attributes) {
              try {
                const da = typeof p.domain_attributes === 'string'
                  ? JSON.parse(p.domain_attributes)
                  : p.domain_attributes;
                const storedPpk = Number(da.pcs_per_kg) || 0;
                const totalPcs = Number(da.pcs) || 0;
                const stockKg = Number(p.current_stock) || 0;
                pieces_per_kg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : undefined);
              } catch {}
            }

            // Catalog pricing metadata
            catalog_offer_price = p.offer_price != null ? Number(p.offer_price) : (p.catalog_offer_price != null ? Number(p.catalog_offer_price) : null);
            catalog_discount_flat = p.discount_flat != null ? Number(p.discount_flat) : (p.catalog_discount_flat != null ? Number(p.catalog_discount_flat) : null);
            catalog_discount_percent = p.discount_percent != null ? Number(p.discount_percent) : (p.catalog_discount_percent != null ? Number(p.catalog_discount_percent) : null);

            let mrp = Number(p.base_price) || 0;
            if (p.domain_attributes) {
              try {
                const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
                const isPaperItem = Boolean(item.isDummyStock || da.gst_type === 'PAPER');
                if (isPaperItem && da.paper_mrp != null && da.paper_mrp !== '' && Number(da.paper_mrp) > 0) {
                  mrp = Number(da.paper_mrp);
                }
              } catch {}
            }
            const soldPrice = Number(item.unit_price) || 0;
            base_price = Math.max(mrp, soldPrice);

            const rawRate = pricing_mode === 'GRADE_RATE' && grade_rate ? Number(grade_rate) : mrp;

            // Compute standard catalog effective price
            const catalogEffectivePrice = catalog_offer_price != null ? catalog_offer_price
              : catalog_discount_flat != null ? Math.max(0, rawRate - catalog_discount_flat)
              : catalog_discount_percent != null ? Math.max(0, rawRate * (1 - catalog_discount_percent / 100))
              : rawRate;

            if (Math.abs(soldPrice - catalogEffectivePrice) < 0.01) {
              // Sold at standard catalog price / offer! No ad-hoc discount was given on this bill.
              offer_price = null;
              discount_flat = null;
              discount_percent = null;
            } else if (soldPrice < catalogEffectivePrice) {
              // Cashier gave an additional ad-hoc discount below catalog price!
              discount_flat = Number((catalogEffectivePrice - soldPrice).toFixed(2));
              discount_percent = catalogEffectivePrice > 0 ? Number(((catalogEffectivePrice - soldPrice) / catalogEffectivePrice * 100).toFixed(2)) : null;
              offer_price = null;
            } else {
              // Sold at custom price higher than catalog
              offer_price = soldPrice;
              discount_flat = null;
              discount_percent = null;
            }
          } else {
            const itemBase = Number(item.base_price) || 0;
            const soldPrice = Number(item.unit_price) || 0;
            base_price = Math.max(itemBase, soldPrice);
            if (soldPrice > 0 && base_price > soldPrice && offer_price == null && discount_flat == null && discount_percent == null) {
              offer_price = soldPrice;
            }
          }

          const qty = billing_type === 'WEIGHT'
            ? Number(item.calculated_weight || item.quantity) || 1
            : Number(item.quantity) || 1;

          return {
            item_id: item.item_id,
            product_id: productId,
            name: item.name || 'Product',
            base_price,
            purchase_price,
            tax_rate_percent,
            billing_type,
            quantity: qty,
            pieces_override: item.pieces_sold != null ? Number(item.pieces_sold) : (item.pieces_override != null ? Number(item.pieces_override) : undefined),
            pieces_per_kg,
            pricing_mode,
            grade_id,
            grade_rate,
            discount_percent,
            discount_flat,
            offer_price,
            catalog_discount_percent,
            catalog_discount_flat,
            catalog_offer_price,
            sku_barcode,
            brand_manufacturer,
            uom,
            hsn_sac_code: item.hsn_sac_code || (item as any).hsn_code || p?.hsn_sac_code || (p as any)?.hsn_code || null,
            is_gst_applicable: item.is_gst_applicable !== undefined ? Boolean(item.is_gst_applicable) : ((p as any)?.is_gst_applicable !== 0),
          };
        });

        // Set discount
        const effDiscValue = Number(invoice.discount_value) > 0 
          ? Number(invoice.discount_value) 
          : (Number(invoice.discount_total) > 0 ? Number(invoice.discount_total) : 0);
        const effDiscType = invoice.discount_type || 'FIXED';

        // Populate local string cache with loaded bill values so edit bill values display instantly
        const loadedPcsMap: Record<string, string> = {};
        const loadedKgMap: Record<string, string> = {};
        enrichedItems.forEach(i => {
          if (i.pieces_override !== undefined) loadedPcsMap[i.product_id] = String(i.pieces_override);
          if (i.quantity !== undefined) loadedKgMap[i.product_id] = String(i.quantity);
        });
        setLocalPcsStr(loadedPcsMap);
        setLocalKgStr(loadedKgMap);

        // Clear previous state and set all loaded invoice data in ONE single atomic Zustand update!
        useCartStore.setState({
          items: enrichedItems,
          lastAddedProductId: enrichedItems.length > 0 ? enrichedItems[enrichedItems.length - 1].product_id : null,
          invoiceType: (invoice.invoice_type === 'GST' || invoice.invoice_type === 'BILL_OF_SUPPLY') ? invoice.invoice_type : useCartStore.getState().invoiceType,
          discountValue: effDiscValue,
          discountType: effDiscType,
          scrapDeduction: Number(invoice.scrap_deduction) > 0 && invoice.scrap_invoice_number ? Number(invoice.scrap_deduction) : 0,
          scrapInvoiceNumber: Number(invoice.scrap_deduction) > 0 && invoice.scrap_invoice_number ? invoice.scrap_invoice_number : '',
          returnDeduction: Number(invoice.return_deduction) > 0 && invoice.return_invoice_number ? Number(invoice.return_deduction) : 0,
          returnInvoiceNumber: Number(invoice.return_deduction) > 0 && invoice.return_invoice_number ? invoice.return_invoice_number : '',
          customerState: invoice.customer_state || 'KL',
          editingQuotationId: null,
          editingQuotationNumber: null,
          editingInvoiceId: invoice.invoice_id,
          editingInvoiceNumber: invoice.invoice_number,
          editingInvoiceRole: originalRole || authRole,
          isQuotationMode: false,
          isReturnMode: false,
          isScrapMode: false,
        });

        // Parse split_details safely (handles double/multi-encoded JSON string or object)
        let parsedSplitDetails: any = null;
        if (invoice.split_details) {
          let curr = invoice.split_details;
          while (typeof curr === 'string') {
            try {
              const p = JSON.parse(curr);
              curr = p;
            } catch {
              break;
            }
          }
          if (typeof curr === 'object' && curr !== null) {
            parsedSplitDetails = curr;
          }
        }

        const grandTotalVal = Number(invoice.grand_total) || 0;
        const rawPm = invoice.payment_method ? String(invoice.payment_method).toUpperCase() : 'PENDING';
        const pmUpper = (['PENDING', 'CASH', 'CARD', 'UPI', 'CHEQUE', 'CREDIT', 'SPLIT'].includes(rawPm) ? rawPm : 'PENDING') as PaymentMethod;

        let finalSplitDetails: SplitDetails = { cash: 0, card: 0, upi: 0, credit: 0, bank_transfer: 0 };

        if (parsedSplitDetails && (Number(parsedSplitDetails.cash) || Number(parsedSplitDetails.card) || Number(parsedSplitDetails.upi) || Number(parsedSplitDetails.credit) || Number(parsedSplitDetails.bank_transfer || parsedSplitDetails.bank))) {
          finalSplitDetails = {
            cash: Number(parsedSplitDetails.cash) || 0,
            card: Number(parsedSplitDetails.card) || 0,
            upi: Number(parsedSplitDetails.upi) || 0,
            credit: Number(parsedSplitDetails.credit) || 0,
            bank_transfer: Number(parsedSplitDetails.bank_transfer || parsedSplitDetails.bank) || 0,
          };
          if (parsedSplitDetails.upi_id) (finalSplitDetails as any).upi_id = parsedSplitDetails.upi_id;
          if (parsedSplitDetails.upi_name) (finalSplitDetails as any).upi_name = parsedSplitDetails.upi_name;
          if (parsedSplitDetails.upi_source_id) (finalSplitDetails as any).upi_source_id = parsedSplitDetails.upi_source_id;
        } else {
          // Pre-fill split details according to single payment method and received amount / grand total
          const amt = Number(invoice.received_amount) > 0 ? Number(invoice.received_amount) : grandTotalVal;
          if (pmUpper === 'CASH') finalSplitDetails.cash = amt;
          else if (pmUpper === 'CARD') finalSplitDetails.card = amt;
          else if (pmUpper === 'UPI') finalSplitDetails.upi = amt;
          else if (pmUpper === 'CREDIT') finalSplitDetails.credit = grandTotalVal;
          else if (pmUpper === 'SPLIT') finalSplitDetails.cash = amt;
        }

        const editPartyKey = `${(invoice.customer_name || '').trim().toLowerCase()}|${(invoice.customer_phone || '').trim()}`;
        let editingInvoiceContribution = 0;
        if (pmUpper === 'CREDIT') {
          editingInvoiceContribution = grandTotalVal - (Number(invoice.received_amount) || 0);
        } else if (pmUpper === 'SPLIT') {
          const nonCreditPaid = (Number(parsedSplitDetails?.cash) || 0)
            + (Number(parsedSplitDetails?.card) || 0)
            + (Number(parsedSplitDetails?.upi) || 0)
            + (Number(parsedSplitDetails?.cheque) || 0)
            + (Number(parsedSplitDetails?.bank_transfer || parsedSplitDetails?.bank) || 0);
          const splitCreditVal = Number(parsedSplitDetails?.credit) || 0;
          if (splitCreditVal > 0) editingInvoiceContribution = grandTotalVal - nonCreditPaid;
        }

        // Set customer info, payment details, and split details on active tab
        updateActiveTab({
          customerId: invoice.customer_id || '',
          manualTotalOverride: null,
          editingInvoiceContribution,
          editingInvoicePartyKey: editPartyKey,
          customerName: invoice.customer_name || '',
          customerPhone: invoice.customer_phone || '',
          customerGstin: invoice.customer_gstin || '',
          customerAddress: invoice.customer_address || '',
          billDate: invoice.created_at || null,
          paymentMethod: pmUpper,
          receivedAmount: Number(invoice.received_amount) || 0,
          actualRefundPaid: Number(invoice.actual_refund_paid) || 0,
          splitDetails: finalSplitDetails,
          selectedUpiId: parsedSplitDetails?.upi_id,
          selectedUpiSourceId: parsedSplitDetails?.upi_source_id,
          selectedUpiName: parsedSplitDetails?.upi_name,
          description: invoice.description || invoice.notes || '',
          title: invoice.invoice_number,
        });

        if (invoice.customer_name || invoice.customer_phone) {
          setTimeout(() => {
            applyPartyTier(invoice.customer_name || '', invoice.customer_phone || '');
          }, 50);
        }

        // Sync tab snapshot so items persist across tab switches
        syncActiveSnapshot();
        setTimeout(() => {
          window.focus();
          if (searchRef.current) {
            searchRef.current.focus();
            searchRef.current.select();
          }
        }, 100);
      } catch (e) {
        console.error('Failed to load edit bill data', e);
      } finally {
        setIsLoadingEditBill(false);
      }
    };

    handler();

    window.addEventListener('open-edit-bill', handler);
    return () => window.removeEventListener('open-edit-bill', handler);
  }, []);

  // Listen for Return from Sales History — activates return mode with pre-loaded invoice
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('returnBillData');
      if (!raw) return;
      localStorage.removeItem('returnBillData');
      try {
        const { invoice } = JSON.parse(raw);
        if (!invoice?.invoice_id) return;
        if (!window.electronAPI) return;

        const [rawItems, returnedQtys] = await Promise.all([
          window.electronAPI.dbGetInvoiceItems(invoice.invoice_id),
          window.electronAPI.dbGetAlreadyReturnedQuantities(invoice.invoice_id),
        ]);

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          setHardwareError('Invoice has no items');
          return;
        }

        const returnedMap: Record<string, number> = {};
        (returnedQtys || []).forEach((r: any) => {
          returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
        });

        const invSubtotal = Number(invoice.subtotal) || rawItems.reduce((s: number, i: any) => s + (Number(i.unit_price) * Number(i.quantity)), 0);
        const invDiscount = (Number(invoice.discount_total) || 0) + (Number(invoice.points_redeemed_discount) || 0);
        const discountRatio = invSubtotal > 0 ? Math.min(1, Math.max(0, invDiscount / invSubtotal)) : 0;

        const enriched = rawItems
          .map((item: any) => {
            const origPrice = Number(item.unit_price) || 0;
            const effPrice = Number((origPrice * (1 - discountRatio)).toFixed(2));
            const origTax = Number(item.tax_amount) || 0;
            const effTax = Number((origTax * (1 - discountRatio)).toFixed(2));
            return {
              ...item,
              unit_price: effPrice,
              rawUnitPrice: origPrice,
              tax_amount: effTax,
              already_returned: returnedMap[item.item_id] || 0,
              available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
            };
          })
          .filter((item: any) => item.available_to_return > 0);

        if (enriched.length === 0) {
          setHardwareError('All items have already been returned');
          return;
        }

        // Clear cart and activate return mode
        clearCart();
        await reserveReturnNumberForTab();
        setReturnMode(true);

        // Enrich with catalog product details if available
        const productIds: string[] = [...new Set((enriched || []).map((i: any) => i.product_id).filter(Boolean))];
        const productMap: Record<string, any> = {};
        if (productIds.length > 0 && window.electronAPI?.dbGetProductsByIds) {
          try {
            const prods = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
            if (Array.isArray(prods)) { prods.forEach((p: any) => { productMap[p.product_id] = p; }); }
          } catch (e) {}
        }

        // Load returnable items into cart
        enriched.forEach((item: any) => {
          const catProd = productMap[item.product_id];
          const productId = item.product_id || `return-${uuidv4()}`;

          let piecesPerKg = item.pieces_per_kg || catProd?.pieces_per_kg;
          if (!piecesPerKg && catProd?.domain_attributes) {
            try {
              const da = typeof catProd.domain_attributes === 'string' ? JSON.parse(catProd.domain_attributes) : catProd.domain_attributes;
              const storedPpk = Number(da.pcs_per_kg) || 0;
              const totalPcs = Number(da.pcs) || 0;
              const stockKg = Number(catProd.current_stock) || 0;
              piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
            } catch {
              piecesPerKg = 1;
            }
          }

          const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
          const effectiveUom = item.uom || catProd?.uom || 'PCS';
          const isWeightType = item.billing_type === 'WEIGHT' || catProd?.billing_type === 'WEIGHT' || weightUoms.includes(effectiveUom.toLowerCase());

          addItem({
            product_id: productId,
            invoiceItemId: item.item_id,
            name: item.name || catProd?.name || 'Product',
            base_price: Number(item.unit_price) || 0,
            purchase_price: Number(catProd?.purchase_price ?? item.unit_price) || 0,
            tax_rate_percent: Number(item.tax_rate_percent || item.item_tax_rate || catProd?.tax_rate_percent || (catProd as any)?.gst_percent || 0),
            billing_type: isWeightType ? 'WEIGHT' : (item.billing_type || catProd?.billing_type || 'PIECE'),
            uom: effectiveUom,
            pieces_per_kg: piecesPerKg || 1,
            pieces_override: Number(item.pieces_override ?? item.pieces ?? 1),
            isReturnItem: true,
            originalQuantity: Number(item.quantity) || 0,
            availableToReturn: item.available_to_return,
            alreadyReturned: item.already_returned,
            originalUnitPrice: Number(item.unit_price) || 0,
            rawUnitPrice: Number(item.rawUnitPrice ?? item.unit_price) || 0,
            originalTaxAmount: Number(item.tax_amount) || 0,
            returnSourceInvoiceId: invoice.invoice_id,
            returnSourceInvoiceNumber: invoice.invoice_number,
            quantity: item.available_to_return,
          });
        });

        // Set source invoice as the selected return invoice
        setSelectedReturnInvoice({
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          customer_name: invoice.customer_name,
          customer_phone: invoice.customer_phone,
        });

        // Pre-fill customer info
        updateActiveTab({
          customerName: invoice.customer_name || '',
          customerPhone: invoice.customer_phone || '',
        });

        syncActiveSnapshot();
      } catch (e) {
        console.error('Failed to load return bill data', e);
        setHardwareError('Failed to load invoice for return');
      }
    };

    handler();

    window.addEventListener('open-return-mode', handler);
    return () => window.removeEventListener('open-return-mode', handler);
  }, []);

  const getTierPriceForProduct = (product: any): number | undefined => {
    if (!selectedTierId || !product) return undefined;
    if (!pricingTiers.some(t => t.pricing_tier_id === selectedTierId)) return undefined;
    const v = productPricingMap[product.product_id]?.[selectedTierId]
      ?? product.tier_prices?.[selectedTierId];
    const price = Number(v);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  };

  const applyPricingTierToCart = useCallback((tierId: string) => {
    const tier = pricingTiers.find(t => t.pricing_tier_id === tierId);
    let itemsChanged = false;
    const nextItems = useCartStore.getState().items.map(item => {
      if (item.isScrap || item.isReturnItem || item.isCombo || item.isServiceItem || item.is_tier_overridden) {
        return item;
      }

      const tierPrice = Number(productPricingMap[item.product_id]?.[tierId]);
      const hasTierPrice = Boolean(tierId) && Number.isFinite(tierPrice) && tierPrice > 0;
      const originalPricingMode = item.original_pricing_mode ?? item.pricing_mode;
      const basePrice = hasTierPrice ? tierPrice : (item.original_base_price ?? item.base_price);
      const pricingMode = hasTierPrice ? 'FIXED_PRICE' : originalPricingMode;
      const tierName = tierId ? (tier?.name || null) : null;
      const originalGradeId = item.original_grade_id ?? item.grade_id ?? null;
      const originalGradeRate = item.original_grade_rate ?? item.grade_rate ?? null;
      const tierPriceStateIsCurrent = !hasTierPrice || (
        item.offer_price == null &&
        item.discount_percent == null &&
        item.discount_flat == null &&
        item.catalog_offer_price == null &&
        item.catalog_discount_percent == null &&
        item.catalog_discount_flat == null
      );

      if (
        item.base_price === basePrice &&
        item.pricing_mode === pricingMode &&
        item.pricing_tier_id === (tierId || null) &&
        item.pricing_tier_name === tierName &&
        item.original_pricing_mode === originalPricingMode &&
        item.original_grade_id === originalGradeId &&
        item.original_grade_rate === originalGradeRate &&
        tierPriceStateIsCurrent
      ) {
        return item;
      }

      itemsChanged = true;

      return {
        ...item,
        base_price: basePrice,
        pricing_mode: pricingMode,
        original_pricing_mode: originalPricingMode,
        original_grade_id: originalGradeId,
        original_grade_rate: originalGradeRate,
        pricing_tier_id: tierId || null,
        pricing_tier_name: tierName,
        ...(hasTierPrice ? {
          offer_price: null,
          discount_percent: null,
          discount_flat: null,
          catalog_offer_price: null,
          catalog_discount_percent: null,
          catalog_discount_flat: null,
        } : {}),
      };
    });
    if (itemsChanged) {
      useCartStore.setState({ items: nextItems });
      syncActiveSnapshot();
    }
  }, [pricingTiers, productPricingMap, syncActiveSnapshot]);

  const handlePricingTierChange = useCallback((tierId: string) => {
    setSelectedTierId(tierId);
    applyPricingTierToCart(tierId);
  }, [applyPricingTierToCart]);

  useEffect(() => {
    if (productPricingMapLoaded) {
      applyPricingTierToCart(selectedTierId);
    }
  }, [productPricingMapLoaded, productPricingMap, selectedTierId, applyPricingTierToCart]);

  const applyPartyTier = (name: string, phone: string) => {
    const defaultTier = pricingTiers.find(t => t.is_default === 1 || t.is_default === true || t.is_default === '1');
    const defaultTierId = defaultTier ? defaultTier.pricing_tier_id : '';
    if (!name && !phone) {
      if (!selectedTierId) handlePricingTierChange(defaultTierId);
      return;
    }
    const match = findMatchingParty(name, phone);
    if (match?.pricing_tier_id && pricingTiers.some(t => t.pricing_tier_id === match.pricing_tier_id)) {
      handlePricingTierChange(match.pricing_tier_id);
    }
  };

  const handleSelectProduct = (product: any) => {
    if (product?.isCombo) {
      addItem({
        product_id: product.product_id,
        name: product.name,
        base_price: product.combo_price,
        purchase_price: 0,
        tax_rate_percent: 0,
        uom: 'Combo',
        billing_type: 'PIECE',
        sku_barcode: product.sku_barcode || null,
        isCombo: true,
        combo_id: product.combo_id,
        combo_price: product.combo_price,
        combo_items: product.combo_items,
        quantity: 1,
      });
      setSearchQuery('');
      setResults([]);
      pendingFocusProductIdRef.current = product.product_id;
      return;
    }

    let piecesPerKg;
    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightProduct = product.billing_type === 'WEIGHT' || weightUoms.includes((product.uom || '').toLowerCase());
    const effectiveBillingType: 'WEIGHT' | 'PIECE' = isWeightProduct ? 'WEIGHT' : 'PIECE';

    if (isWeightProduct && product.domain_attributes) {
      try {
        const da = typeof product.domain_attributes === 'string'
          ? JSON.parse(product.domain_attributes)
          : product.domain_attributes;
        const storedPpk = Number(da.pcs_per_kg) || 0;
        const totalPcs = Number(da.pcs) || 0;
        const stockKg = Number(product.current_stock) || 0;
        // Prefer stored ratio; fall back to pcs count even when stock is 0/negative
        piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
      } catch {
        piecesPerKg = 1;
      }
    } else if (isWeightProduct) {
      piecesPerKg = 1;
    }
    const tierPrice = getTierPriceForProduct(product);
    const hasTierPrice = tierPrice != null;
    addItem({
      product_id: product.product_id,
      name: product.name,
      base_price: tierPrice ?? product.base_price,
      purchase_price: product.pricing_mode === 'GRADE_RATE' && product.grade_purchase_price !== undefined && product.grade_purchase_price !== null
        ? Number(product.grade_purchase_price)
        : (product.purchase_price ?? 0),
      tax_rate_percent: Number(product.tax_rate_percent ?? (product as any).gst_percent ?? 0),
      hsn_sac_code: product.hsn_sac_code || (product as any).hsn_code || (product as any).hsn || null,
      is_gst_applicable: (product as any).is_gst_applicable !== 0,
      uom: product.uom,
      billing_type: effectiveBillingType,
      pieces_per_kg: piecesPerKg,
      grade_id: product.grade_id ?? null,
      pricing_mode: tierPrice != null ? 'FIXED_PRICE' : product.pricing_mode,
      grade_rate: product.grade_rate ?? null,
      original_pricing_mode: product.pricing_mode,
      original_grade_id: product.grade_id ?? null,
      original_grade_rate: product.grade_rate ?? null,
      discount_percent: hasTierPrice ? null : (product.discount_percent ?? null),
      discount_flat: hasTierPrice ? null : (product.discount_flat ?? null),
      offer_price: hasTierPrice ? null : (product.offer_price ?? null),
      catalog_discount_percent: hasTierPrice ? null : (product.catalog_discount_percent !== undefined ? product.catalog_discount_percent : (product.discount_percent ?? null)),
      catalog_discount_flat: hasTierPrice ? null : (product.catalog_discount_flat !== undefined ? product.catalog_discount_flat : (product.discount_flat ?? null)),
      catalog_offer_price: hasTierPrice ? null : (product.catalog_offer_price !== undefined ? product.catalog_offer_price : (product.offer_price ?? null)),
      sku_barcode: product.sku_barcode || null,
      brand_manufacturer: product.brand_manufacturer || null,
      isServiceItem: Number(product.is_service_item) ? true : undefined,
      pricing_tier_id: selectedTierId || null,
      pricing_tier_name: pricingTiers.find(t => t.pricing_tier_id === selectedTierId)?.name || null,
      original_base_price: product.base_price,
      is_tier_overridden: false,
    });
    setSearchQuery('');
    setResults([]);
    pendingFocusProductIdRef.current = product.product_id;
    setTimeout(() => {
      const pid = product.product_id;
      const input = pcsRefs.current[pid] || qtyRefs.current[pid] || ratePcRefs.current[pid] || rateKgRefs.current[pid];
      if (input) {
        input.focus();
        input.select();
        pendingFocusProductIdRef.current = null;
      }
    }, 50);
  };

  const resetProductForm = () => {
    setShowProductCreateForm(false);
    setEditingProductId(null);
    setEditingProductSnapshot(null);
    setNewProductName('');
    setNewProductItemCode('');
    setNewProductBarcode('');
    setNewProductBrand('');
    setNewProductCategory('');
    setNewProductGradeId('');
    setNewProductIsAddingGrade(false);
    setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    setNewProductUom('Pcs');
    setNewProductPcs('');
    setNewProductPurchasePrice('');
    setNewProductBasePrice('');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn('');
    setNewProductTaxRate(0);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice('');
    setNewProductIsGstApplicable(false);
    setNewProductIsDummy(false);
    setNewProductIsCustomCategory(false);
    setProductFormTierPrices({});
  };

  const encodeProductPurchasePrice = (price: string | number | null | undefined) => {
    if (!productPriceCoding || price === '' || price === null || price === undefined) return '';
    const numeric = Number(price);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    return String(numeric).split('').map(char => char === '.' ? '.' : (productPriceCoding[char] || '')).join('');
  };

  const stripProductPurchasePriceCode = (barcode: string, price: string | number | null | undefined) => {
    const code = encodeProductPurchasePrice(price);
    for (const candidate of [code, code.replace(/\./g, '')]) {
      if (candidate && barcode.endsWith(candidate)) return barcode.slice(0, -candidate.length);
    }
    return barcode;
  };

  const handleProductPurchasePriceChange = (value: string) => {
    const barcodeWithoutOldPriceCode = stripProductPurchasePriceCode(newProductBarcode, newProductPurchasePrice);
    const barcode = barcodeWithoutOldPriceCode ? `${barcodeWithoutOldPriceCode}${encodeProductPurchasePrice(value)}` : '';
    setNewProductPurchasePrice(value);
    if (barcode !== newProductBarcode) setNewProductBarcode(barcode);
  };

  const handleProductBasePriceChange = (value: string) => {
    setNewProductBasePrice(value);
    if (newProductDiscountPercent !== '') {
      const mrp = Number(value) || 0;
      const pct = Number(newProductDiscountPercent);
      setNewProductDiscountFlat(mrp > 0 && Number.isFinite(pct) ? ((mrp * pct) / 100).toFixed(2) : '');
    }
  };

  const handleProductGradeChange = (gradeId: string) => {
    setNewProductGradeId(gradeId);
    if (!gradeId) return;
    const grade = newProductGrades.find(g => g.grade_id === gradeId);
    if (!grade) return;
    setNewProductBasePrice(String(Number(grade.rate) || 0));
    handleProductPurchasePriceChange(String(Number(grade.purchase_price) || 0));
    if (newProductDiscountPercent !== '') {
      const mrp = Number(grade.rate) || 0;
      const pct = Number(newProductDiscountPercent);
      setNewProductDiscountFlat(mrp > 0 && Number.isFinite(pct) ? ((mrp * pct) / 100).toFixed(2) : '');
    }
  };

  const generateProductBarcode = async () => {
    if (!window.electronAPI || !tenantId) return;
    try {
      const result = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
      if (result.success && result.barcode) {
        setNewProductBarcode(`${result.barcode}${encodeProductPurchasePrice(newProductPurchasePrice)}`);
      }
    } catch (error: any) {
      setHardwareError('Failed to generate barcode: ' + (error?.message || ''));
    }
  };

  const handleCreateNewGrade = async () => {
    if (!window.electronAPI || !tenantId || !newProductCategory.trim() || !newProductGradeForm.grade_name.trim()) return;
    setNewProductSavingGrade(true);
    const gradeId = uuidv4();
    const res = await window.electronAPI.dbAddGrade({
      grade_id: gradeId,
      tenant_id: tenantId,
      category: newProductCategory.trim(),
      grade_name: newProductGradeForm.grade_name.trim(),
      rate: Number(newProductGradeForm.rate) || 0,
      purchase_price: Number(newProductGradeForm.purchase_price) || 0,
      offer_price: Number(newProductGradeForm.offer_price) || 0,
    });
    if (res.success) {
      const fresh = await window.electronAPI.dbGetGrades(tenantId);
      if (Array.isArray(fresh)) setNewProductGrades(fresh);
      setNewProductGradeId(gradeId);
      setNewProductBasePrice(String(Number(newProductGradeForm.rate) || 0));
      handleProductPurchasePriceChange(String(Number(newProductGradeForm.purchase_price) || 0));
      setNewProductOfferPrice(newProductGradeForm.offer_price || '');
      if (newProductDiscountPercent !== '') {
        const mrp = Number(newProductGradeForm.rate) || 0;
        const pct = Number(newProductDiscountPercent);
        setNewProductDiscountFlat(mrp > 0 && Number.isFinite(pct) ? ((mrp * pct) / 100).toFixed(2) : '');
      }
      setNewProductIsAddingGrade(false);
      setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
    } else {
      setHardwareError('Failed to create grade: ' + (res.error || ''));
    }
    setNewProductSavingGrade(false);
  };

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

  const handleEditProduct = async (item: CartItem) => {
    setEditingProductId(item.product_id);
    let prodDetails: any = null;
    let productPricingRows: any[] = [];
    if (window.electronAPI) {
      const tid = tenantId || 'global';
      const [productResult, pricingResult] = await Promise.allSettled([
        window.electronAPI.dbGetProductsByIds({ tenant_id: tid, product_ids: [item.product_id] }),
        window.electronAPI.dbGetProductPricing(tid),
      ]);
      if (productResult.status === 'fulfilled' && Array.isArray(productResult.value) && productResult.value.length > 0) {
        prodDetails = productResult.value[0];
      } else if (productResult.status === 'rejected') {
        console.error('Failed to fetch product for editing', productResult.reason);
      }
      if (pricingResult.status === 'fulfilled' && Array.isArray(pricingResult.value)) {
        productPricingRows = pricingResult.value;
      } else if (pricingResult.status === 'rejected') {
        console.error('Failed to fetch product tier prices for editing', pricingResult.reason);
      }
    }

    const hasProductRecord = Boolean(prodDetails);
    const p = prodDetails || item;
    setEditingProductSnapshot(p);
    setNewProductName(p.name || item.name || '');
    setNewProductItemCode(p.item_code ?? (hasProductRecord ? '' : item.item_code || ''));
    // Keep the barcode attached to this cart item; use the product lookup only when the cart has none.
    const selectedCartBarcode = String(item.sku_barcode ?? '').trim();
    const selectedProductBarcode = selectedCartBarcode || String(p.sku_barcode ?? '').trim();
    setNewProductBarcode(selectedProductBarcode);
    setNewProductBrand(p.brand_manufacturer ?? (hasProductRecord ? '' : item.brand_manufacturer || ''));
    setNewProductCategory(p.category || '');
    setNewProductUom(p.uom || item.uom || 'Pcs');

    if (p.domain_attributes) {
      try {
        const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
        const pcs = da.pcs ?? da.pcs_stock;
        setNewProductPcs(pcs != null && pcs !== 0 ? String(pcs) : '');
      } catch {
        setNewProductPcs('');
      }
    } else {
      setNewProductPcs('');
    }

    setNewProductPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : (!hasProductRecord && item.purchase_price != null ? String(item.purchase_price) : ''));
    const effectiveBasePrice = p.pricing_mode === 'GRADE_RATE' && p.grade_rate != null
      ? p.grade_rate
      : (p.base_price ?? (!hasProductRecord ? item.base_price : undefined));
    setNewProductBasePrice(effectiveBasePrice != null ? String(effectiveBasePrice) : '');
    setNewProductStock(p.current_stock != null ? String(p.current_stock) : (!hasProductRecord && item.quantity != null ? String(item.quantity) : ''));
    setNewProductReorderLevel(p.reorder_level != null ? String(p.reorder_level) : '');
    setNewProductHsn(p.hsn_sac_code || '');
    setNewProductTaxRate(p.tax_rate_percent != null ? Number(p.tax_rate_percent) : (!hasProductRecord && item.tax_rate_percent != null ? Number(item.tax_rate_percent) : 0));
    setNewProductDiscountPercent(p.discount_percent != null ? String(p.discount_percent) : (!hasProductRecord && item.discount_percent != null ? String(item.discount_percent) : ''));
    setNewProductDiscountFlat(p.discount_flat != null ? String(p.discount_flat) : (!hasProductRecord && item.discount_flat != null ? String(item.discount_flat) : ''));
    setNewProductOfferPrice(p.offer_price != null ? String(p.offer_price) : (!hasProductRecord && item.offer_price != null ? String(item.offer_price) : ''));
    setNewProductIsGstApplicable(Boolean(p.is_gst_applicable ?? (!hasProductRecord ? (item as any).is_gst_applicable : false)));
    setNewProductGradeId(p.grade_id ?? (!hasProductRecord ? item.grade_id : '') ?? '');
    setNewProductIsCustomCategory(!configuredCategories.includes(p.category || '') && Boolean(p.category));
    const tierPrices: Record<string, string> = {};
    for (const row of productPricingRows) {
      if (row.product_id === item.product_id && row.price != null && row.price !== '') {
        tierPrices[row.pricing_tier_id] = String(row.price);
      }
    }
    setProductFormTierPrices(tierPrices);

    setShowProductCreateForm(true);
  };

  const handleCreateAndAddProduct = async (retries = 3, isAutoGenerated = false, asTemp = false) => {
    if (!window.electronAPI || !tenantId || !newProductName.trim()) return;
    const purchasePrice = Number(newProductPurchasePrice) || 0;
    const basePrice = newProductBasePrice.trim() === '' ? 0 : Number(newProductBasePrice);
    const qty = Number(newProductStock) || 0;
    const isGstProduct = (invoiceType === 'GST') || newProductIsGstApplicable;

    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightBilling = weightUoms.includes((newProductUom || '').toLowerCase());
    const billingType: 'WEIGHT' | 'PIECE' = isWeightBilling ? 'WEIGHT' : 'PIECE';

    if (editingProductId) {
      const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
      const selectedGradeRate = selectedGrade?.rate ?? (
        editingProductSnapshot?.grade_id === newProductGradeId ? editingProductSnapshot?.grade_rate : null
      );
      const savedBillingType = isWeightBilling || (
        editingProductSnapshot?.uom === newProductUom && editingProductSnapshot?.billing_type === 'WEIGHT'
      ) ? 'WEIGHT' : 'PIECE';
      const rawPcs = Number(newProductPcs) || 0;
      let domainAttrsObj: Record<string, any> = {};
      try {
        const existingDomainAttributes = editingProductSnapshot?.domain_attributes;
        const parsedAttributes = typeof existingDomainAttributes === 'string'
          ? JSON.parse(existingDomainAttributes || '{}')
          : existingDomainAttributes;
        domainAttrsObj = parsedAttributes && typeof parsedAttributes === 'object' && !Array.isArray(parsedAttributes)
          ? { ...parsedAttributes }
          : {};
      } catch {
        domainAttrsObj = {};
      }
      if (savedBillingType === 'WEIGHT' && rawPcs > 0) {
        domainAttrsObj.pcs_per_kg = qty > 0 ? rawPcs / qty : rawPcs;
        domainAttrsObj.pcs_stock = rawPcs;
        domainAttrsObj.pcs = rawPcs;
      } else {
        delete domainAttrsObj.pcs_per_kg;
        domainAttrsObj.pcs_stock = 0;
        domainAttrsObj.pcs = 0;
      }

      let finalBarcode = newProductBarcode.trim();
      if (!finalBarcode) {
        try {
          const generated = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
          if (!generated.success || !generated.barcode) throw new Error(generated.error || 'Barcode could not be generated');
          finalBarcode = `${generated.barcode}${encodeProductPurchasePrice(newProductPurchasePrice)}`;
        } catch (error: any) {
          setHardwareError('Failed to generate barcode: ' + (error?.message || ''));
          return;
        }
      }

      const tierRows = Object.entries(productFormTierPrices).map(([pricing_tier_id, price]) => ({
        pricing_tier_id,
        price: price.trim() === '' ? null : Number(price),
      }));

      if (window.electronAPI) {
        const res = await window.electronAPI.dbUpdateProduct({
          ...(editingProductSnapshot || {}),
          product_id: editingProductId,
          tenant_id: tenantId,
          name: newProductName.trim(),
          sku_barcode: finalBarcode,
          item_code: newProductItemCode ? newProductItemCode.toUpperCase() : null,
          category: newProductCategory,
          brand_manufacturer: newProductBrand,
          uom: newProductUom,
          purchase_price: purchasePrice,
          base_price: basePrice,
          current_stock: qty,
          reorder_level: Number(newProductReorderLevel) || 0,
          is_gst_applicable: newProductIsGstApplicable ? 1 : 0,
          tax_rate_percent: newProductTaxRate,
          hsn_sac_code: newProductHsn,
          discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
          discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
          offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
          billing_type: savedBillingType,
          domain_attributes: JSON.stringify(domainAttrsObj),
          grade_id: newProductGradeId || null,
          pricing_mode: newProductGradeId ? 'GRADE_RATE' : 'FIXED_PRICE',
          is_deleted: editingProductSnapshot?.is_deleted ?? 0,
          sync_status: 'PENDING',
        });
        if (!res.success) {
          setHardwareError('Failed to update product: ' + (res.error || ''));
          return;
        }

        if (tierRows.length > 0) {
          const pricingResult = await window.electronAPI.dbSetProductPricing({
            tenant_id: tenantId,
            product_id: editingProductId,
            pricing: tierRows,
          });
          if (!pricingResult.success) {
            setHardwareError('Product updated, but tier prices could not be saved: ' + (pricingResult.error || ''));
            return;
          }
          setProductPricingMap(prev => {
            const nextPrices = { ...(prev[editingProductId] || {}) };
            for (const row of tierRows) {
              if (row.price == null) delete nextPrices[row.pricing_tier_id];
              else nextPrices[row.pricing_tier_id] = row.price;
            }
            return { ...prev, [editingProductId]: nextPrices };
          });
        }
      }

      useCartStore.setState((state) => ({
        items: state.items.map((i) => {
          if (i.product_id === editingProductId) {
            return {
              ...i,
              name: newProductName.trim(),
              base_price: basePrice,
              // Tier synchronization falls back to original_base_price when no tier price is set.
              original_base_price: basePrice,
              purchase_price: purchasePrice,
              tax_rate_percent: newProductIsGstApplicable ? newProductTaxRate : 0,
              hsn_sac_code: newProductHsn,
              uom: newProductUom,
              billing_type: savedBillingType,
              pieces_per_kg: savedBillingType === 'WEIGHT' && rawPcs > 0 ? (qty > 0 ? rawPcs / qty : rawPcs) : undefined,
              sku_barcode: finalBarcode,
              item_code: newProductItemCode.toUpperCase(),
              brand_manufacturer: newProductBrand,
              discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
              discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
              offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
              catalog_discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
              catalog_discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
              catalog_offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
              grade_id: newProductGradeId || undefined,
              pricing_mode: newProductGradeId ? 'GRADE_RATE' : 'FIXED_PRICE',
              grade_rate: selectedGradeRate != null ? Number(selectedGradeRate) : undefined,
              original_pricing_mode: newProductGradeId ? 'GRADE_RATE' : 'FIXED_PRICE',
              original_grade_id: newProductGradeId || null,
              original_grade_rate: selectedGradeRate != null ? Number(selectedGradeRate) : null,
            };
          }
          return i;
        }),
      }));
      syncActiveSnapshot();
      resetProductForm();
      return;
    }

    // TEMP item — billing only: no product row, no barcode, no stock/inventory changes
    if (asTemp) {
      const productId = uuidv4();
      handleSelectProduct({
        product_id: productId,
        name: newProductName.trim(),
        base_price: basePrice,
        purchase_price: purchasePrice,
        tax_rate_percent: isGstProduct ? newProductTaxRate : (newProductIsGstApplicable ? newProductTaxRate : 0),
        uom: newProductUom,
        billing_type: billingType,
        pricing_mode: 'FIXED_PRICE',
        grade_id: null,
        grade_rate: null,
        sku_barcode: null,
        brand_manufacturer: newProductBrand,
        discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        catalog_discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        catalog_discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        catalog_offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        current_stock: 0,
      });
      if (qty > 0) updateQuantity(productId, qty);
      setSearchQuery('');
      setResults([]);
      resetProductForm();
      return;
    }

    const wasAutoGenerated = isAutoGenerated || !newProductBarcode.trim();
    const productId = uuidv4();
    let finalBarcode = newProductBarcode.trim();
    if (!finalBarcode) {
      const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
      const generatedBarcode = (gen?.success && gen?.barcode) || `${newProductItemCode || '0'}001`;
      finalBarcode = `${generatedBarcode}${encodeProductPurchasePrice(newProductPurchasePrice)}`;
    }
    const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
    const initialStock = (isGstProduct && qty > 0) ? 0 : qty;

    const rawPcs = Number(newProductPcs) || 0;
    const domainAttrsObj: Record<string, any> = {};
    if (isWeightBilling && rawPcs > 0) {
      domainAttrsObj.pcs_per_kg = initialStock > 0 ? rawPcs / initialStock : rawPcs;
      domainAttrsObj.pcs_stock = rawPcs;
      domainAttrsObj.pcs = rawPcs;
    }
    if (isGstProduct) {
      domainAttrsObj.gst_type = newProductIsDummy ? 'PAPER' : 'REAL';
    }

    const res = await window.electronAPI.dbAddProduct({
      product_id: productId,
      tenant_id: tenantId,
      name: newProductName.trim(),
      sku_barcode: finalBarcode,
      item_code: newProductItemCode.toUpperCase(),
      category: newProductCategory,
      brand_manufacturer: newProductBrand,
      uom: newProductUom,
      purchase_price: purchasePrice,
      base_price: basePrice,
      current_stock: initialStock,
      reorder_level: Number(newProductReorderLevel) || 0,
      is_gst_applicable: isGstProduct ? 1 : (newProductIsGstApplicable ? 1 : 0),
      tax_rate_percent: isGstProduct ? newProductTaxRate : (newProductIsGstApplicable ? newProductTaxRate : 0),
      hsn_sac_code: isGstProduct ? newProductHsn : (newProductIsGstApplicable ? newProductHsn : null),
      discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
      discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
      offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
      billing_type: billingType,
      domain_attributes: JSON.stringify(domainAttrsObj),
      grade_id: selectedGrade?.grade_id || null,
      pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
      is_deleted: 0,
      sync_status: 'PENDING',
    });
    if (res.success) {
      const tierRows = Object.entries(productFormTierPrices).map(([pricing_tier_id, price]) => ({
        pricing_tier_id,
        price: price.trim() === '' ? null : Number(price),
      }));
      if (tierRows.length > 0) {
        const pricingResult = await window.electronAPI.dbSetProductPricing({
          tenant_id: tenantId,
          product_id: productId,
          pricing: tierRows,
        });
        if (pricingResult.success) {
          setProductPricingMap(prev => {
            const nextPrices: Record<string, number> = {};
            for (const row of tierRows) if (row.price != null) nextPrices[row.pricing_tier_id] = row.price;
            return { ...prev, [productId]: nextPrices };
          });
        } else {
          setHardwareError('Product created, but tier prices could not be saved: ' + (pricingResult.error || ''));
        }
      }

      // Create a purchase bill if it's a GST product and quantity > 0
      if (isGstProduct && qty > 0) {
        const purchaseBillId = uuidv4();
        const itemId = uuidv4();
        const totalAmt = qty * purchasePrice;
        await window.electronAPI.dbAddPurchaseBill({
          purchase_bill_id: purchaseBillId,
          tenant_id: tenantId,
          bill_number: `AUTO-BILL-${Date.now()}`,
          supplier_id: null,
          supplier_name: 'Unknown Supplier',
          bill_date: new Date().toLocaleDateString('en-CA'),
          invoice_number: null,
          notes: `Auto-created on fly from billing page for product: ${newProductName.trim()}`,
          total_amount: totalAmt,
          bill_type: 'GST',
          items: [{
            item_id: itemId,
            product_id: productId,
            name: newProductName.trim(),
            quantity: qty,
            purchase_price: purchasePrice,
            total_amount: totalAmt,
            is_gst_applicable: 1,
            tax_rate_percent: newProductTaxRate,
            hsn_sac_code: newProductHsn || '',
            skip_stock_update: newProductIsDummy ? 1 : 0,
          }],
        });
      }

      if (autoPrintBarcode && window.electronAPI && finalBarcode) {
        window.electronAPI.printBarcode(tenantId, finalBarcode, basePrice > 0 ? basePrice : undefined, newProductName.trim(), 1).then((r: any) => {
          if (!r?.success) console.warn('[BillingPage] Auto barcode print failed:', r?.error || 'No barcode printer configured');
        }).catch((e: any) => console.warn('[BillingPage] Auto barcode print error:', e?.message || e));
      }
      handleSelectProduct({
        product_id: productId,
        name: newProductName.trim(),
        base_price: basePrice,
        tier_prices: Object.fromEntries(tierRows.filter(row => row.price != null).map(row => [row.pricing_tier_id, row.price])),
        purchase_price: purchasePrice,
        tax_rate_percent: isGstProduct ? newProductTaxRate : (newProductIsGstApplicable ? newProductTaxRate : 0),
        uom: newProductUom,
        billing_type: billingType,
        domain_attributes: isWeightBilling && rawPcs > 0 ? domainAttrsObj : undefined,
        pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
        grade_id: selectedGrade?.grade_id || null,
        grade_rate: selectedGrade ? Number(selectedGrade.rate) : null,
        sku_barcode: finalBarcode,
        brand_manufacturer: newProductBrand,
        discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        catalog_discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        catalog_discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        catalog_offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        current_stock: newProductIsDummy ? 0 : qty,
      });
      setSearchQuery('');
      setResults([]);
      resetProductForm();
    } else if (res.error?.includes('sku_barcode') && retries > 0 && wasAutoGenerated) {
      const match = finalBarcode.match(/(\d+)(\D*)$/);
      const suffix = match ? match[2] || '' : '';
      const numPart = match ? match[1] : '001';
      const nextNum = String(parseInt(numPart, 10) + 1).padStart(numPart.length, '0');
      const incrementedBarcode = finalBarcode.replace(/(\d+)(\D*)$/, nextNum + suffix);
      setNewProductBarcode(incrementedBarcode);
      setTimeout(() => handleCreateAndAddProduct(retries - 1, true), 100);
    } else {
      setHardwareError('Failed to create product: ' + (res.error || ''));
    }
  };

  const handleSelectScrapItem = (cat: any) => {
    const rate = Number(cat.purchase_price ?? cat.rate ?? cat.selling_price) || 0;
    const scrapProdId = `SCRAP-${cat.scrap_category_id}`;
    const existing = items.find(i => i.product_id === scrapProdId || (i.isScrap && i.scrap_category_id === cat.scrap_category_id));
    const targetId = existing ? existing.product_id : scrapProdId;

    addItem({
      product_id: targetId,
      name: cat.name,
      base_price: rate,
      purchase_price: rate,
      tax_rate_percent: 0,
      uom: cat.unit || 'Kg',
      unit: cat.unit || 'Kg',
      billing_type: 'WEIGHT',
      isScrap: true,
      scrap_category_id: cat.scrap_category_id,
      quantity: existing ? (Number(existing.quantity) || 0) + 1 : 1,
    });
    setSearchQuery('');
    setScrapSearchResults([]);
    pendingFocusProductIdRef.current = targetId;
    setTimeout(() => {
      const input = qtyRefs.current[targetId];
      if (input) {
        input.focus();
        input.select();
        pendingFocusProductIdRef.current = null;
      }
    }, 50);
  };

  // Load invoice items into cart for return processing (like scrap loads categories)
  const handleSelectReturnInvoice = async (inv: any) => {
    if (!window.electronAPI) return;
    setSearchQuery('');
    setReturnSearchResults([]);
    setSelectedReturnInvoice(inv);
    try {
      const [rawItems, returnedQtys] = await Promise.all([
        window.electronAPI.dbGetInvoiceItems(inv.invoice_id),
        window.electronAPI.dbGetAlreadyReturnedQuantities(inv.invoice_id),
      ]);
      const returnedMap: Record<string, number> = {};
      (returnedQtys || []).forEach((r: any) => {
        returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
      });
      const invSubtotal = Number(inv.subtotal) || (rawItems || []).reduce((s: number, i: any) => s + (Number(i.unit_price) * Number(i.quantity)), 0);
      const invDiscount = (Number(inv.discount_total) || 0) + (Number(inv.points_redeemed_discount) || 0);
      const discountRatio = invSubtotal > 0 ? Math.min(1, Math.max(0, invDiscount / invSubtotal)) : 0;

      const enriched = (rawItems || []).map((item: any) => {
        const origPrice = Number(item.unit_price) || 0;
        const effPrice = Number((origPrice * (1 - discountRatio)).toFixed(2));
        const origTax = Number(item.tax_amount) || 0;
        const effTax = Number((origTax * (1 - discountRatio)).toFixed(2));
        return {
          ...item,
          unit_price: effPrice,
          rawUnitPrice: origPrice,
          tax_amount: effTax,
          already_returned: returnedMap[item.item_id] || 0,
          available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
        };
      }).filter((item: any) => item.available_to_return > 0);

      if (enriched.length === 0) {
        setSelectedReturnInvoice(null);
        setHardwareError(`Invoice ${inv.invoice_number} has already been fully returned. No items left to return.`);
        return;
      }

      // Pre-fill customer info from selected return invoice
      updateActiveTab({
        customerName: inv.customer_name || '',
        customerPhone: inv.customer_phone || '',
        customerGstin: inv.customer_gstin || '',
        customerAddress: inv.customer_address || '',
      });

      // Clear cart first, reserve return number, and set return mode
      clearCart();
      await reserveReturnNumberForTab();
      setReturnMode(true);

      const invPm = (inv.payment_method || '').toUpperCase();
      let invSplitCredit = 0;
      if (inv.split_details) {
        try {
          const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
          invSplitCredit = Number(s?.credit) || 0;
        } catch {}
      }
      const isCreditInv = invPm === 'CREDIT' || invSplitCredit > 0 || (Number(inv.balance_amount) > 0 && invPm !== 'CASH');
      setReturnRefundMethod(isCreditInv ? 'CREDIT' : 'ADJUST_BILL');

      // Enrich with catalog product details if available
      const productIds: string[] = [...new Set((enriched || []).map((i: any) => i.product_id).filter(Boolean))];
      const productMap: Record<string, any> = {};
      if (productIds.length > 0 && window.electronAPI?.dbGetProductsByIds) {
        try {
          const prods = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
          if (Array.isArray(prods)) { prods.forEach((p: any) => { productMap[p.product_id] = p; }); }
        } catch (e) {}
      }

      enriched.forEach((item: any) => {
        const catProd = productMap[item.product_id];
        const productId = item.product_id || `return-${uuidv4()}`;

        let piecesPerKg = item.pieces_per_kg || catProd?.pieces_per_kg;
        if (!piecesPerKg && catProd?.domain_attributes) {
          try {
            const da = typeof catProd.domain_attributes === 'string' ? JSON.parse(catProd.domain_attributes) : catProd.domain_attributes;
            const storedPpk = Number(da.pcs_per_kg) || 0;
            const totalPcs = Number(da.pcs) || 0;
            const stockKg = Number(catProd.current_stock) || 0;
            piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
          } catch {
            piecesPerKg = 1;
          }
        }

        const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
        const effectiveUom = item.uom || catProd?.uom || 'PCS';
        const isWeightType = item.billing_type === 'WEIGHT' || catProd?.billing_type === 'WEIGHT' || weightUoms.includes(effectiveUom.toLowerCase());

        addItem({
          product_id: productId,
          invoiceItemId: item.item_id,
          name: item.name || item.product_name || catProd?.name || 'Product',
          sku_barcode: catProd?.sku_barcode || item.sku_barcode || '',
          item_code: catProd?.item_code || item.item_code || '',
          base_price: Number(item.unit_price) || 0,
          purchase_price: Number(catProd?.purchase_price ?? item.unit_price) || 0,
          tax_rate_percent: Number(item.tax_rate_percent || item.item_tax_rate || catProd?.tax_rate_percent || (catProd as any)?.gst_percent || 0),
          billing_type: isWeightType ? 'WEIGHT' : (item.billing_type || catProd?.billing_type || 'PIECE'),
          uom: effectiveUom,
          pieces_per_kg: piecesPerKg || 1,
          pieces_override: Number(item.pieces_override ?? item.pieces ?? 1),
          isReturnItem: true,
          originalQuantity: Number(item.quantity) || 0,
          availableToReturn: item.available_to_return,
          alreadyReturned: item.already_returned,
          originalUnitPrice: Number(item.unit_price) || 0,
          rawUnitPrice: Number(item.rawUnitPrice ?? item.unit_price) || 0,
          originalTaxAmount: Number(item.tax_amount) || 0,
          returnSourceInvoiceId: inv.invoice_id,
          returnSourceInvoiceNumber: inv.invoice_number,
          quantity: item.available_to_return, // default return qty = max available
        });
      });
    } catch (e) {
      console.error('Failed to load return invoice', e);
      setSelectedReturnInvoice(null);
      setHardwareError('Failed to load invoice for return. Please try again.');
    }
  };

  // Listen for open-quotation-edit event
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('editQuotationData');
      if (!raw) return;
      localStorage.removeItem('editQuotationData');
      try {
        const { quotation, items: qItems, convertToInvoice } = JSON.parse(raw);
        clearCart();
        if (convertToInvoice) {
          setQuotationMode(false);
          setEditingQuotation(null, null);
        } else {
          setQuotationMode(true);
          setEditingQuotation(quotation.quotation_id, quotation.quotation_number);
          if (quotation.quotation_number) updateActiveTab({ title: quotation.quotation_number });
        }
        if (quotation.customer_name) updateActiveTab({ customerName: quotation.customer_name });
        if (quotation.customer_phone) updateActiveTab({ customerPhone: quotation.customer_phone });
        if (quotation.customer_address) updateActiveTab({ customerAddress: quotation.customer_address });
        if (quotation.customer_gstin) updateActiveTab({ customerGstin: quotation.customer_gstin });
        if (quotation.customer_state) setCustomerState(quotation.customer_state);
        if (quotation.is_gst === 1 || Number(quotation.tax_total) > 0 || quotationGstEnabledSetting) {
          setInvoiceType('GST');
        } else {
          setInvoiceType('BILL_OF_SUPPLY');
        }
        if (quotation.terms_conditions) setQuotationTerms(quotation.terms_conditions);
        
        if (Array.isArray(qItems)) {
          const productIds = qItems.map((i: any) => i.product_id).filter(Boolean);
          let productsMap: Record<string, any> = {};
          if (productIds.length > 0 && window.electronAPI?.dbGetProductsByIds) {
            try {
              const prods = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
              if (Array.isArray(prods)) {
                prods.forEach((p: any) => { productsMap[p.product_id] = p; });
              }
            } catch (e) {
              console.error('Failed to fetch product details for quotation items:', e);
            }
          }

          qItems.forEach((item: any) => {
            const productId = item.product_id || item.item_id || `qtn-${Date.now()}-${Math.random()}`;
            const qty = item.weight && Number(item.weight) > 0 ? Number(item.weight) : (Number(item.quantity) || 1);
            const dbProduct = productsMap[productId] || {};
            const barcode = item.sku_barcode || item.barcode || dbProduct.sku_barcode || dbProduct.barcode || null;
            const brand = item.brand_manufacturer || dbProduct.brand_manufacturer || null;
            const uomVal = item.uom || dbProduct.uom || null;

            const soldRate = Number(item.rate) || 0;
            const mrp = Number(item.base_price || dbProduct.base_price) || 0;
            const basePrice = Math.max(mrp, soldRate);

            // Catalog offer/discount metadata from DB product
            const catalog_offer_price = dbProduct.offer_price != null ? Number(dbProduct.offer_price) : (dbProduct.catalog_offer_price != null ? Number(dbProduct.catalog_offer_price) : null);
            const catalog_discount_flat = dbProduct.discount_flat != null ? Number(dbProduct.discount_flat) : (dbProduct.catalog_discount_flat != null ? Number(dbProduct.catalog_discount_flat) : null);
            const catalog_discount_percent = dbProduct.discount_percent != null ? Number(dbProduct.discount_percent) : (dbProduct.catalog_discount_percent != null ? Number(dbProduct.catalog_discount_percent) : null);

            const rawRate = dbProduct.pricing_mode === 'GRADE_RATE' && dbProduct.grade_rate ? Number(dbProduct.grade_rate) : basePrice;
            const catalogEffectivePrice = catalog_offer_price != null ? catalog_offer_price
              : catalog_discount_flat != null ? Math.max(0, rawRate - catalog_discount_flat)
              : catalog_discount_percent != null ? Math.max(0, rawRate * (1 - catalog_discount_percent / 100))
              : rawRate;

            let offer_price = item.offer_price ?? null;
            let discount_flat = item.discount_flat ?? null;
            let discount_percent = item.discount_percent ?? null;

            if (offer_price == null && discount_flat == null && discount_percent == null) {
              if (Math.abs(soldRate - catalogEffectivePrice) < 0.01) {
                offer_price = null;
                discount_flat = null;
                discount_percent = null;
              } else if (soldRate < catalogEffectivePrice) {
                discount_flat = Number((catalogEffectivePrice - soldRate).toFixed(2));
                discount_percent = catalogEffectivePrice > 0 ? Number(((catalogEffectivePrice - soldRate) / catalogEffectivePrice * 100).toFixed(2)) : null;
              } else {
                offer_price = soldRate;
              }
            }

            addItem({
              product_id: productId,
              name: item.name || dbProduct.name || 'Product',
              base_price: basePrice,
              purchase_price: Number(dbProduct.purchase_price || item.purchase_price) || 0,
              tax_rate_percent: Number(item.tax_rate_percent || dbProduct.tax_rate_percent || (dbProduct as any).gst_percent || 0),
              hsn_sac_code: item.hsn_code || (item as any).hsn_sac_code || dbProduct.hsn_sac_code || dbProduct.hsn_code || null,
              is_gst_applicable: (dbProduct as any).is_gst_applicable !== 0,
              billing_type: item.weight && Number(item.weight) > 0 ? 'WEIGHT' : (dbProduct.billing_type || undefined),
              quantity: qty,
              offer_price,
              discount_flat,
              discount_percent,
              catalog_offer_price,
              catalog_discount_flat,
              catalog_discount_percent,
              sku_barcode: barcode,
              brand_manufacturer: brand,
              uom: uomVal,
            });
          });
        }
        syncActiveSnapshot();
        setTimeout(() => {
          window.focus();
          if (searchRef.current) {
            searchRef.current.focus();
            searchRef.current.select();
          }
        }, 100);
      } catch (e) {
        console.error('Failed to load quotation edit data', e);
      }
    };

    handler();

    window.addEventListener('open-quotation-edit', handler);
    return () => window.removeEventListener('open-quotation-edit', handler);
  }, []);

  // Listen for open-new-quotation event
  useEffect(() => {
    const handler = async () => {
      localStorage.removeItem('pendingNewQuotation');
      clearCart();
      setReturnMode(false);
      setIsScrapMode(false);
      setIsPastBillMode(false);
      setEditingQuotation(null, null);
      useCartStore.getState().setEditingInvoice(null, null, null);
      setQuotationMode(true);
      
      const quotationSnapshot: TabSnapshot = {
        items: [],
        invoiceType: 'BILL_OF_SUPPLY',
        discountType: 'FIXED',
        discountValue: 0,
        customerState: 'KL',
        scrapDeduction: 0,
        scrapInvoiceNumber: '',
        returnDeduction: 0,
        returnInvoiceNumber: '',
        isQuotationMode: true,
        isReturnMode: false,
        isScrapMode: false,
        returnRefundMethod: 'ADJUST_BILL',
        editingQuotationId: null,
        editingQuotationNumber: null,
        editingInvoiceId: null,
        editingInvoiceNumber: null,
        editingInvoiceRole: null,
        pendingScrapInvoiceToEdit: null,
      };

      const existingTabs = useTabStore.getState().tabs;
      const currentActiveTabId = useTabStore.getState().activeTabId;
      const activeTab = existingTabs.find(t => t.id === currentActiveTabId);

      if (activeTab && (!activeTab.snapshot?.items || activeTab.snapshot.items.length === 0) && !activeTab.snapshot?.editingInvoiceNumber) {
        updateActiveTab({
          title: 'New Quote',
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH',
          receivedAmount: 0,
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
        });
        const { tabs: currentTabs, activeTabId: curTabId } = useTabStore.getState();
        const updatedTabs = currentTabs.map(t => t.id === curTabId ? {
          ...t,
          title: 'New Quote',
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
          snapshot: quotationSnapshot,
        } : t);
        useTabStore.setState({ tabs: updatedTabs });
        saveStoredTabs(updatedTabs, curTabId);
        await reserveQuotationNumberForTab(true);
        syncActiveSnapshot();
      } else {
        addTab(quotationSnapshot, 'New Quote');
        await reserveQuotationNumberForTab(true);
      }

      setTimeout(() => {
        window.focus();
        if (searchRef.current) {
          searchRef.current.focus();
          searchRef.current.select();
        }
      }, 100);
    };

    if (localStorage.getItem('pendingNewQuotation') === 'true') {
      handler();
    }

    window.addEventListener('open-new-quotation', handler);
    return () => window.removeEventListener('open-new-quotation', handler);
  }, [clearCart, setReturnMode, setIsScrapMode, setEditingQuotation, setQuotationMode, updateActiveTab, syncActiveSnapshot, reserveQuotationNumberForTab, isCashSettlementEnabled, addTab]);

  // Past bill selection: load selected invoice into cart for editing
  const handleSelectPastBill = async (invoice: any) => {
    if (!invoice || !window.electronAPI) return;
    try {
      let invId = invoice.invoice_id || invoice.id;
      let fullInvoice = invoice;

      if (!invId && invoice.invoice_number) {
        const fetched = await window.electronAPI.dbGetInvoices({ search: invoice.invoice_number, tenant_id: invoice.tenant_id || tenantId });
        if (Array.isArray(fetched) && fetched.length > 0) {
          const matched = fetched.find((i: any) => i.invoice_number === invoice.invoice_number) || fetched[0];
          invId = matched.invoice_id;
          fullInvoice = matched;
        }
      }

      if (!invId) {
        setHardwareError('Invoice ID not found');
        return;
      }

      const items = await window.electronAPI.dbGetInvoiceItems(invId);
      if (!Array.isArray(items) || items.length === 0) {
        setHardwareError('Invoice has no items');
        return;
      }
      localStorage.setItem('editBillData', JSON.stringify({
        invoice: fullInvoice,
        items,
        originalRole: authRole,
      }));
      setSearchQuery('');
      setPastBillResults([]);
      setIsPastBillMode(false);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-edit-bill'));
      }, 50);
    } catch (e) {
      setHardwareError('Failed to fetch invoice');
      console.error(e);
    }
  };

  useEffect(() => {
    if (!window.electronAPI) return;

    const playBeep = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 1350; // high-pitched clear beep
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime); // safe volume
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08); // fade fast
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      } catch (e) {
        console.warn('Audio feedback failed:', e);
      }
    };

    const unsubscribe = window.electronAPI.onBarcodeScanned(async (code: string) => {
      if (!code) return;
      console.log("[BillingPage] Barcode scanned from hardware:", code);
      
      // Determine what mode we are in
      if (isReturnMode) {
        // Search invoices for returns
        try {
          const invoices = await window.electronAPI.dbGetInvoices({ tenant_id: tenantId, search: code });
          if (Array.isArray(invoices) && invoices.length > 0) {
            // Find an exact match by invoice number
            const exactMatch = invoices.find((inv: any) => inv.invoice_number === code);
            if (exactMatch) {
              handleSelectReturnInvoice(exactMatch);
              playBeep();
            } else {
              setSearchQuery(code);
              setReturnSearchResults(invoices.filter((inv: any) => inv.invoice_type !== 'SCRAP' && inv.invoice_type !== 'RETURN'));
            }
          }
        } catch (e) {
          console.error("Failed to search invoices for return barcode:", e);
        }
      } else if (isPastBillMode) {
        // Search past bills by invoice number
        try {
          const invoices = await window.electronAPI.dbGetInvoices({ tenant_id: tenantId, search: code });
          if (Array.isArray(invoices) && invoices.length > 0) {
            const exactMatch = invoices.find((inv: any) => inv.invoice_number === code);
            if (exactMatch) {
              handleSelectPastBill(exactMatch);
              playBeep();
            } else {
              setSearchQuery(code);
              setPastBillResults(invoices);
            }
          }
        } catch (e) {
          console.error("Failed to search past bills for barcode:", e);
        }
      } else {
        // Normal billing mode: search product by barcode/item_code
        try {
          const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, barcode: code });
          if (Array.isArray(products) && products.length > 0) {
            handleSelectProduct(products[0]);
            playBeep();
            setSearchQuery('');
            setResults([]);
            setTimeout(() => {
              searchRef.current?.focus();
            }, 50);
          } else {
            // Fallback: put the scanned code in search query to let the user see no products matched
            setSearchQuery(code);
            setResults([]);
            setHardwareError(`Product not found for barcode: ${code}`);
            setTimeout(() => setHardwareError(null), 3000);
          }
        } catch (e) {
          console.error("Failed to query product for barcode:", e);
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [tenantId, isReturnMode, isPastBillMode, addItem, handleSelectReturnInvoice, handleSelectPastBill, syncActiveSnapshot]);

  const handleReturnFromPastBill = async (invoice: any) => {
    if (!window.electronAPI) return;
    try {
      const [rawItems, returnedQtys] = await Promise.all([
        window.electronAPI.dbGetInvoiceItems(invoice.invoice_id),
        window.electronAPI.dbGetAlreadyReturnedQuantities(invoice.invoice_id),
      ]);
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        setHardwareError('Invoice has no items');
        return;
      }
      const returnedMap: Record<string, number> = {};
      (returnedQtys || []).forEach((r: any) => {
        returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
      });
      const invSubtotal = Number(invoice.subtotal) || (rawItems || []).reduce((s: number, i: any) => s + (Number(i.unit_price) * Number(i.quantity)), 0);
      const invDiscount = (Number(invoice.discount_total) || 0) + (Number(invoice.points_redeemed_discount) || 0);
      const discountRatio = invSubtotal > 0 ? Math.min(1, Math.max(0, invDiscount / invSubtotal)) : 0;

      const enriched = (rawItems || []).map((item: any) => {
        const origPrice = Number(item.unit_price) || 0;
        const effPrice = Number((origPrice * (1 - discountRatio)).toFixed(2));
        const origTax = Number(item.tax_amount) || 0;
        const effTax = Number((origTax * (1 - discountRatio)).toFixed(2));
        return {
          ...item,
          unit_price: effPrice,
          rawUnitPrice: origPrice,
          tax_amount: effTax,
          already_returned: returnedMap[item.item_id] || 0,
          available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
        };
      }).filter((item: any) => item.available_to_return > 0);

      if (enriched.length === 0) { setHardwareError('All items already returned'); return; }

      // Enrich with product data (gst_percent, uom, hsn)
      const productIds: string[] = [...new Set(enriched.map((i: any) => i.product_id).filter(Boolean))];
      const productMap: Record<string, any> = {};
      if (productIds.length > 0) {
        try {
          const products = await window.electronAPI.dbGetProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
          if (Array.isArray(products)) { products.forEach((p: any) => { productMap[p.product_id] = p; }); }
        } catch {}
      }

      setSearchQuery('');
      setPastBillResults([]);
      setIsPastBillMode(false);
      clearCart();
      await reserveReturnNumberForTab();
      setReturnMode(true);
      const cartItems = enriched.map((item: any) => {
        const p = productMap[item.product_id];
        let piecesPerKg = item.pieces_per_kg || p?.pieces_per_kg;
        if (!piecesPerKg && p?.domain_attributes) {
          try {
            const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
            const storedPpk = Number(da.pcs_per_kg) || 0;
            const totalPcs = Number(da.pcs) || 0;
            const stockKg = Number(p.current_stock) || 0;
            piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
          } catch {
            piecesPerKg = 1;
          }
        }

        const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
        const effectiveUom = item.uom || p?.uom || 'PCS';
        const isWeightType = item.billing_type === 'WEIGHT' || p?.billing_type === 'WEIGHT' || weightUoms.includes(effectiveUom.toLowerCase());

        return {
          product_id: item.product_id,
          name: item.name,
          quantity: item.available_to_return,
          base_price: Number(item.unit_price) || 0,
          purchase_price: Number(p?.purchase_price ?? item.unit_price) || 0,
          tax_rate_percent: Number(p?.tax_rate_percent ?? (p as any)?.gst_percent ?? item.tax_rate_percent ?? item.gst_percent ?? 0),
          billing_type: isWeightType ? 'WEIGHT' : (item.billing_type || p?.billing_type || 'PIECE'),
          pricing_mode: 'FIXED',
          isReturnItem: true,
          invoiceItemId: item.item_id,
          originalQuantity: Number(item.quantity) || 0,
          availableToReturn: item.available_to_return,
          alreadyReturned: item.already_returned,
          originalUnitPrice: Number(item.unit_price) || 0,
          rawUnitPrice: Number(item.rawUnitPrice ?? item.unit_price) || 0,
          originalTaxAmount: Number(item.tax_amount) || 0,
          returnSourceInvoiceId: invoice.invoice_id,
          returnSourceInvoiceNumber: invoice.invoice_number,
          uom: effectiveUom,
          pieces_per_kg: piecesPerKg || 1,
          pieces_override: Number(item.pieces_override ?? item.pieces ?? 1),
          hsn: p?.hsn || '',
          brand_manufacturer: p?.brand_manufacturer || item.brand_manufacturer || null,
        };
      });
      for (const ci of cartItems) {
        addItem(ci);
      }
      setSelectedReturnInvoice({
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        customer_phone: invoice.customer_phone,
      });
    } catch (e) {
      setHardwareError('Failed to load invoice for return');
      console.error(e);
    }
  };

  // Auto-dismiss hardware error after 3 seconds
  useEffect(() => {
    if (!hardwareError) return;
    const t = setTimeout(() => setHardwareError(null), 3000);
    return () => clearTimeout(t);
  }, [hardwareError]);

  const handleSaveQuotation = async (shouldPrint = true) => {
    if (items.length === 0) {
      setHardwareError('Cart is empty. Add items to quotation.');
      return;
    }
    if (!window.electronAPI) return;
    setQuotationSaving(true);
    setHardwareError(null);
    try {
      const tid = tenantId || '';
      let quotationId = editingQuotationId || uuidv4();
      let quotationNumber = editingQuotationNumber || '';

      if (!editingQuotationId) {
        const numRes = await window.electronAPI.dbGetNextQuotationNumber({ tenant_id: 'global' });
        if (!numRes.success) { setHardwareError('Failed to generate number'); setQuotationSaving(false); return; }
        quotationNumber = numRes.quotationNumber || '';
      }

      const hasGstItems = items.some(i => (i as any).is_gst_applicable || (i as any).hsn_sac_code || Number(i.tax_rate_percent) > 0);
      const isGstQuotation = quotationGstEnabledSetting || invoiceType === 'GST' || hasGstItems;
      const isInterState = isGstQuotation && Boolean(customerState && shopState && customerState.trim().toLowerCase() !== shopState.trim().toLowerCase());

      const qItems = items.map(item => {
        const rate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0) ? Number(item.grade_rate) : Number(item.base_price || 0);
        const catalogPriceChk = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
          : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
          : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
          : rate;
        const isAdhocOfferC = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
        const isAdhocDiscFlatC = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
        const isAdhocDiscPctC = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
        let effectiveRate = catalogPriceChk;
        if (isAdhocOfferC) {
          effectiveRate = Number(item.offer_price);
        } else if (isAdhocDiscFlatC) {
          effectiveRate = catalogPriceChk - Number(item.discount_flat);
        } else if (isAdhocDiscPctC) {
          effectiveRate = catalogPriceChk * (1 - Number(item.discount_percent) / 100);
        }
        effectiveRate = Math.max(effectiveRate, 0);

        const qty = Number(item.quantity) || 0;
        const amount = effectiveRate * qty;
        const dAmt = Math.max(0, (rate - effectiveRate) * qty);

        const itemTaxRate = isGstQuotation && (item as any).is_gst_applicable !== false ? (Number(item.tax_rate_percent) || 0) : 0;
        const itemTax = isGstQuotation ? Math.round(amount * (itemTaxRate / 100) * 100) / 100 : 0;
        const halfRate = itemTaxRate / 2;
        const cgst_rate = isInterState ? 0 : halfRate;
        const sgst_rate = isInterState ? 0 : halfRate;
        const igst_rate = isInterState ? itemTaxRate : 0;
        const cgst_amount = isInterState ? 0 : Math.round((itemTax / 2) * 100) / 100;
        const sgst_amount = isInterState ? 0 : Math.round((itemTax / 2) * 100) / 100;
        const igst_amount = isInterState ? itemTax : 0;

        return {
          item_id: item.item_id || uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: qty,
          weight: item.billing_type === 'WEIGHT' ? qty : 0,
          rate: effectiveRate,
          base_price: rate,
          discount_flat: item.discount_flat ?? null,
          discount_percent: item.discount_percent ?? null,
          offer_price: item.offer_price ?? null,
          discount_amount: dAmt,
          hsn_code: item.hsn_sac_code || (item as any).hsn_code || (item as any).hsn || null,
          uom: item.uom || item.unit || (item.billing_type === 'WEIGHT' ? 'KG' : 'PCS'),
          taxable_amount: amount,
          tax_rate_percent: itemTaxRate,
          cgst_rate,
          cgst_amount,
          sgst_rate,
          sgst_amount,
          igst_rate,
          igst_amount,
          amount,
        };
      });

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
        await window.electronAPI.dbUpdateQuotation(quotationPayload);
      } else {
        // Save new quotation
        await window.electronAPI.dbSaveQuotation(quotationPayload);
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
          const printRes = await window.electronAPI.printA4Html(tid, fullHtml);
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
          const titlePrefix = (invoiceType === 'GST' && !enableThreeInvoiceSeries) ? 'GST-' : '';
          updateActiveTab({ title: `${titlePrefix}${tab.reservedInvoiceNumber}` });
        }
      }
    } catch (e) {
      setHardwareError('Failed to save quotation');
      console.error(e);
    }
    setQuotationSaving(false);
    setTimeout(() => setQuotationSuccess(null), 4000);
  };

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
  }, [showProductCreateForm, isScrapMode, isReturnMode, isPastBillMode]);

  const handleSearchKey = async (e: React.KeyboardEvent) => {
    const maxLen = isScrapMode ? scrapSearchResults.length : isPastBillMode ? pastBillResults.length : results.length;
    if (e.key === 'ArrowDown') {
      if (maxLen > 0) {
        setSelectedIndex(i => Math.min(i + 1, maxLen - 1));
        e.preventDefault();
      } else if (searchQuery.trim() === '') {
        e.preventDefault();
        if (items.length > 0) {
          focusFirstCartField();
        } else {
          customerNameInputRef.current?.focus();
          customerNameInputRef.current?.select();
        }
      }
    }
    else if (e.key === 'ArrowUp') {
      if (maxLen > 0 && selectedIndex > 0) {
        setSelectedIndex(i => Math.max(i - 1, 0));
        e.preventDefault();
      } else if (searchQuery.trim() === '') {
        e.preventDefault();
        customerNameInputRef.current?.focus();
        customerNameInputRef.current?.select();
      }
    }
    else if (e.key === 'ArrowRight') {
      if (maxLen === 0 && searchQuery.trim() === '') {
        e.preventDefault();
        focusFirstCartField();
      }
    }
    else if (e.key === 'ArrowLeft') {
      const inputEl = e.currentTarget as HTMLInputElement;
      if (maxLen === 0 && (searchQuery.trim() === '' || inputEl.selectionStart === 0)) {
        e.preventDefault();
        if (items.length > 0) {
          focusLastCartField();
        } else {
          focusCustomerFieldsReverse();
        }
      }
    }
    else if (e.key === 'Enter') {
      if (searchQuery.trim() === '' && maxLen === 0) {
        if (items.length > 0) {
          e.preventDefault();
          focusFirstCartField();
          return;
        }
      }
      if (isScrapMode) {
        if (scrapSearchResults[selectedIndex]) handleSelectScrapItem(scrapSearchResults[selectedIndex]);
      } else if (isReturnMode) {
        if (returnSearchResults[selectedIndex]) handleSelectReturnInvoice(returnSearchResults[selectedIndex]);
      } else if (isPastBillMode) {
        if (pastBillResults[selectedIndex]) handleSelectPastBill(pastBillResults[selectedIndex]);
      } else {
        // Normal billing / quotation mode:
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery.length >= 1 && window.electronAPI) {
          try {
            const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, barcode: trimmedQuery });
            if (Array.isArray(products) && products.length > 0) {
              e.preventDefault();
              // handleSelectProduct already schedules a 50ms timeout to focus the qty input.
              // Do NOT add a competing setTimeout here -- it would race and steal focus from qty.
              handleSelectProduct(products[0]);
              return;
            }
          } catch (err) {
            console.error('[BillingPage] Direct barcode lookup error:', err);
          }
        }

        if (results[selectedIndex]) {
          handleSelectProduct(results[selectedIndex]);
        } else if (!showProductCreateForm && searchQuery.length >= 1) {
          setShowProductCreateForm(true);
          setNewProductName(searchQuery);
        }
      }
    }
    else if (e.key === ' ' && searchQuery.trim() === '' && !isScrapMode && !isReturnMode && !isPastBillMode) { e.preventDefault(); setShowProductCreateForm(true); setNewProductName(''); }
    else if (e.key === 'Escape') { setResults([]); setScrapSearchResults([]); setPastBillResults([]); setSearchQuery(''); setIsPastBillMode(false); }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('qty', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('qty', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        qtyRefs.current[nextId]?.focus();
        qtyRefs.current[nextId]?.select();
      } else {
        e.preventDefault();
        if (discountRef.current) {
          discountRef.current.focus();
          discountRef.current.select();
        } else if (receivedInputRef.current && (paymentMethod === 'CASH' || paymentMethod === 'CREDIT')) {
          receivedInputRef.current.focus();
          receivedInputRef.current.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        qtyRefs.current[prevId]?.focus();
        qtyRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    } else if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      const idx = items.findIndex(i => i.product_id === productId);
      removeItem(productId);
      setTimeout(() => {
        const remaining = useCartStore.getState().items;
        if (remaining.length > 0) {
          const targetItem = remaining[Math.min(idx, remaining.length - 1)];
          if (pcsRefs.current[targetItem.product_id]) {
            pcsRefs.current[targetItem.product_id]?.focus();
            pcsRefs.current[targetItem.product_id]?.select();
          } else {
            qtyRefs.current[targetItem.product_id]?.focus();
            qtyRefs.current[targetItem.product_id]?.select();
          }
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }, 50);
    }
  };

  const focusCartItemQuantityOrPcs = () => {
    if (items.length === 0) return;
    const targetId = lastAddedProductId || items[items.length - 1].product_id;
    if (pcsRefs.current[targetId]) {
      pcsRefs.current[targetId]?.focus();
      pcsRefs.current[targetId]?.select();
      return;
    }
    if (qtyRefs.current[targetId]) {
      qtyRefs.current[targetId]?.focus();
      qtyRefs.current[targetId]?.select();
      return;
    }
    for (const item of items) {
      if (pcsRefs.current[item.product_id]) {
        pcsRefs.current[item.product_id]?.focus();
        pcsRefs.current[item.product_id]?.select();
        return;
      }
      if (qtyRefs.current[item.product_id]) {
        qtyRefs.current[item.product_id]?.focus();
        qtyRefs.current[item.product_id]?.select();
        return;
      }
    }
  };

  const handlePcsKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('pcs', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('pcs', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        if (pcsRefs.current[nextId]) {
          pcsRefs.current[nextId]?.focus();
          pcsRefs.current[nextId]?.select();
        } else {
          qtyRefs.current[nextId]?.focus();
          qtyRefs.current[nextId]?.select();
        }
      } else {
        e.preventDefault();
        if (discountRef.current) {
          discountRef.current.focus();
          discountRef.current.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        if (pcsRefs.current[prevId]) {
          pcsRefs.current[prevId]?.focus();
          pcsRefs.current[prevId]?.select();
        } else {
          qtyRefs.current[prevId]?.focus();
          qtyRefs.current[prevId]?.select();
        }
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    } else if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      const idx = items.findIndex(i => i.product_id === productId);
      removeItem(productId);
      setTimeout(() => {
        const remaining = useCartStore.getState().items;
        if (remaining.length > 0) {
          const targetItem = remaining[Math.min(idx, remaining.length - 1)];
          if (pcsRefs.current[targetItem.product_id]) {
            pcsRefs.current[targetItem.product_id]?.focus();
            pcsRefs.current[targetItem.product_id]?.select();
          } else {
            qtyRefs.current[targetItem.product_id]?.focus();
            qtyRefs.current[targetItem.product_id]?.select();
          }
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }, 50);
    }
  };

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

  const handleSplitInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    currentField: 'CASH' | 'CARD' | 'UPI' | 'CHEQUE' | 'CREDIT'
  ) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      updateActiveTab({ paymentMethod: 'CASH' });
      setInfoToast('Split Payment Closed (Switched to Cash)');
      setTimeout(() => setInfoToast(null), 2000);
      setTimeout(() => paymentOptionRefs.current['CASH']?.focus(), 50);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      fillRestForField(currentField);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const currentSplitTotal = (Number(splitDetails.cash) || 0) + (Number(splitDetails.card) || 0) + (Number(splitDetails.upi) || 0) + (Number(splitDetails.cheque) || 0) + (Number(splitDetails.credit) || 0);
      if (currentField === 'CREDIT' || (Math.abs(currentSplitTotal - displayGrandTotal) < 0.01 && displayGrandTotal > 0)) {
        focusDescriptionOrDiscount();
      } else {
        if (currentField === 'CASH') splitCardInputRef.current?.focus();
        else if (currentField === 'CARD') splitUpiInputRef.current?.focus();
        else if (currentField === 'UPI') splitChequeInputRef.current?.focus();
        else if (currentField === 'CHEQUE') splitCreditInputRef.current?.focus();
        else focusDescriptionOrDiscount();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentField === 'CASH') splitCardInputRef.current?.focus();
      else if (currentField === 'CARD') splitUpiInputRef.current?.focus();
      else if (currentField === 'UPI') splitChequeInputRef.current?.focus();
      else if (currentField === 'CHEQUE') splitCreditInputRef.current?.focus();
      else splitCashInputRef.current?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentField === 'CREDIT') splitChequeInputRef.current?.focus();
      else if (currentField === 'CHEQUE') splitUpiInputRef.current?.focus();
      else if (currentField === 'UPI') splitCardInputRef.current?.focus();
      else if (currentField === 'CARD') splitCashInputRef.current?.focus();
      else splitCreditInputRef.current?.focus();
    }
  };

  const sanitizeQtyText = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    return cleaned === '' ? '' : cleaned.replace(/^\./, '0.');
  };

  const guardScannerInput = (e: React.KeyboardEvent, productId: string, currentValue: number | string, restore: (v: number | string) => void) => {
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
    if (detectScannerBurst(qtyKeyTimesRef.current, qtySnapshotsRef.current, productId, currentValue, restore)) {
      e.preventDefault();
    }
  };

  const handleDiscKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('discount', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('discount', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        discRefs.current[nextId]?.focus();
        discRefs.current[nextId]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        discRefs.current[prevId]?.focus();
        discRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
  };

  const handleDiscFlatKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('discountFlat', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('discountFlat', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        discFlatRefs.current[nextId]?.focus();
        discFlatRefs.current[nextId]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        discFlatRefs.current[prevId]?.focus();
        discFlatRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
  };

  const handleTierKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('tier', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('tier', productId);
    }
  };

  const handleTotalInputKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusNextCartField('grandTotal', productId);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusPrevCartField('grandTotal', productId);
    } else if (e.key === 'ArrowDown') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx !== -1 && idx < items.length - 1) {
        e.preventDefault();
        const nextId = items[idx + 1].product_id;
        totalInputRefs.current[nextId]?.focus();
        totalInputRefs.current[nextId]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      const idx = items.findIndex(i => i.product_id === productId);
      if (idx > 0) {
        e.preventDefault();
        const prevId = items[idx - 1].product_id;
        totalInputRefs.current[prevId]?.focus();
        totalInputRefs.current[prevId]?.select();
      } else {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
  };

  const handleCheckout = async (saveOnly = false) => {
    if (items.length === 0) {
      setHardwareError('Cart is empty. Add items to checkout.');
      setTimeout(() => setHardwareError(null), 4000);
      return;
    }
    if (!window.electronAPI) return;
    if (isCheckingOutRef.current) return;
    isCheckingOutRef.current = true;

    const checkoutTabId = activeTabId;
    let scrapPrintSuccess = true;
    let printSuccess = true;

    const cartStore = useCartStore.getState();
    const editingInvoiceId = cartStore.editingInvoiceId;
    const editingInvoiceNumber = cartStore.editingInvoiceNumber;
    const editingInvoiceRole = cartStore.editingInvoiceRole;

    setIsCheckingOut(true);
    setHardwareError(null);

    try {
      if (isScrapMode) {
        let scrapInvoiceNum = editingInvoiceNumber;
        const finalScrapGrandTotal = scrapTotal + extraBonus;

        if (scrapPaymentStatus === 'CREDIT') {
          if (!customerName.trim() || !customerPhone.trim()) {
            setHardwareError('Please enter Customer Name and Phone Number for Credit payment');
            return;
          }
        }

        if (editingInvoiceNumber) {
          const scrapItemsForUpdate = items.map(item => {
            const rawRate = item.base_price;
            const catalogPriceScrap1 = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
              : item.catalog_discount_flat != null ? rawRate + Number(item.catalog_discount_flat)
              : item.catalog_discount_percent != null ? rawRate * (1 + Number(item.catalog_discount_percent) / 100)
              : rawRate;
            const isAdhocOfferS1 = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
            const isAdhocDiscFlatS1 = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
            const isAdhocDiscPctS1 = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
            let effectiveRate = catalogPriceScrap1;
            if (isAdhocOfferS1) {
              effectiveRate = Number(item.offer_price);
            } else if (isAdhocDiscFlatS1) {
              effectiveRate = catalogPriceScrap1 + Number(item.discount_flat);
            } else if (isAdhocDiscPctS1) {
              effectiveRate = catalogPriceScrap1 * (1 + Number(item.discount_percent) / 100);
            }
            return {
              scrap_category_id: item.scrap_category_id || item.product_id,
              quantity: Number(item.quantity) || 0,
              rate: Math.max(effectiveRate, 0),
              notes: '',
            };
          });

          const result = await window.electronAPI.dbUpdateScrapInvoiceFull({
            tenant_id: tenantId || 'global',
            scrap_invoice_number: editingInvoiceNumber,
            party_name: customerName || null,
            customer_phone: customerPhone || null,
            customer_address: customerAddress || null,
            payment_status: scrapPaymentStatus,
            items: scrapItemsForUpdate,
          });

          if (!result.success) {
            setHardwareError(`Failed to update scrap invoice: ${result.error}`);
            return;
          }
        } else {
          const numRes = await window.electronAPI.dbGetNextScrapInvoiceNumber({ tenant_id: 'global' });
          if (!numRes.success || !numRes.invoiceNumber) {
            setHardwareError('Failed to generate scrap invoice number');
            return;
          }
          scrapInvoiceNum = numRes.invoiceNumber;

          for (const item of items) {
            const rawRate = item.base_price;
            const catalogPriceScrap2 = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
              : item.catalog_discount_flat != null ? rawRate + Number(item.catalog_discount_flat)
              : item.catalog_discount_percent != null ? rawRate * (1 + Number(item.catalog_discount_percent) / 100)
              : rawRate;
            const isAdhocOfferS2 = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
            const isAdhocDiscFlatS2 = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
            const isAdhocDiscPctS2 = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
            let effectiveRate = catalogPriceScrap2;
            if (isAdhocOfferS2) {
              effectiveRate = Number(item.offer_price);
            } else if (isAdhocDiscFlatS2) {
              effectiveRate = catalogPriceScrap2 + Number(item.discount_flat);
            } else if (isAdhocDiscPctS2) {
              effectiveRate = catalogPriceScrap2 * (1 + Number(item.discount_percent) / 100);
            }
            effectiveRate = Math.max(effectiveRate, 0);
            const qty = Number(item.quantity) || 0;
            const totalAmount = effectiveRate * qty;

            const result = await window.electronAPI.dbAddScrapTransaction({
              transaction_id: uuidv4(),
              tenant_id: tenantId || 'unset',
              type: 'PURCHASE',
              scrap_category_id: item.scrap_category_id,
              quantity: qty,
              rate: effectiveRate,
              total_amount: totalAmount,
              party_name: customerName || null,
              customer_phone: customerPhone || null,
              customer_address: customerAddress || null,
              notes: '',
              scrap_invoice_number: scrapInvoiceNum || '',
              payment_status: scrapPaymentStatus,
            });
            if (!result.success) {
              setHardwareError(`Failed to save scrap item: ${result.error}`);
              return;
            }
          }
        }

        // CREDIT scrap → record in party ledger (idempotent per invoice; non-CREDIT removes it)
        await window.electronAPI.dbUpsertScrapCreditLedger({
          tenant_id: tenantId || 'unset',
          scrap_invoice_number: scrapInvoiceNum || '',
          payment_status: scrapPaymentStatus,
          party_name: customerName || null,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
          user_id: userId || undefined,
          user_name: userName || undefined,
        }).catch(() => {});

        // Print scrap receipt (skip if saveOnly)
        scrapPrintSuccess = true;
        if (!saveOnly) {
          const cfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
          const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;
          const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
          const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : width;
          const thermalStyle = printFmt?.style || 'standard';

          // Group scrap items by category for receipt
          const scrapGrouped = items.reduce((acc, item) => {
            const key = item.scrap_category_id || item.product_id;
            const rawRate = item.base_price;
            const catalogPriceScrapGrp = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
              : item.catalog_discount_flat != null ? rawRate + Number(item.catalog_discount_flat)
              : item.catalog_discount_percent != null ? rawRate * (1 + Number(item.catalog_discount_percent) / 100)
              : rawRate;
            const isAdhocOfferSG = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
            const isAdhocDiscFlatSG = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
            const isAdhocDiscPctSG = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
            let effectiveRate = catalogPriceScrapGrp;
            if (isAdhocOfferSG) {
              effectiveRate = Number(item.offer_price);
            } else if (isAdhocDiscFlatSG) {
              effectiveRate = catalogPriceScrapGrp + Number(item.discount_flat);
            } else if (isAdhocDiscPctSG) {
              effectiveRate = catalogPriceScrapGrp * (1 + Number(item.discount_percent) / 100);
            }
            effectiveRate = Math.max(effectiveRate, 0);
            const qty = Number(item.quantity) || 0;

            if (!acc[key]) {
              acc[key] = { name: item.name, quantity: 0, unit_price: effectiveRate, total: 0 };
            }
            acc[key].quantity += qty;
            acc[key].total += effectiveRate * qty;
            if (acc[key].quantity > 0) {
              acc[key].unit_price = acc[key].total / acc[key].quantity;
            }
            return acc;
          }, {} as Record<string, { name: string; quantity: number; unit_price: number; total: number }>);
          const scrapReceiptItems = Object.values(scrapGrouped).map(item => ({
            name: item.name,
            quantity: item.quantity.toFixed(3),
            unit_price: item.unit_price,
            total: item.total,
          }));

          const scrapBillSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.scrapBillSettings || {}) };
          const cartState = useCartStore.getState();
          const receiptData: ReceiptData = {
            shopName: scrapBillSettings.showShopName !== false ? (shopNameState || shopName || 'My Shop') : '',
            shopGstin: scrapBillSettings.showShopGstin !== false ? (shopGstin || undefined) : undefined,
            shopAddress: scrapBillSettings.showShopAddress !== false ? (shopAddress || undefined) : undefined,
            shopPhone: scrapBillSettings.showPhone !== false ? (shopPhone || undefined) : undefined,
            upiId: undefined,
            showUpiQr: false,
            showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
            showPriceOverrideMrp: printFmt?.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
            invoiceNumber: scrapInvoiceNum || '',
            invoiceType: 'SCRAP',
            date: formatBillDateTime(new Date()),
            billerName: scrapBillSettings.showBillerName !== false ? (userName || authRole || undefined) : undefined,
            items: scrapReceiptItems,
            subtotal: scrapTotal,
            tax: 0,
            discount: discount,
            discountType: cartState.discountType,
            discountValue: cartState.discountValue,
            grandTotal: finalScrapGrandTotal,
            extraBonus: extraBonus,
            customerName: scrapBillSettings.showCustomerName !== false ? (customerName || undefined) : undefined,
            customerPhone: scrapBillSettings.showCustomerPhone !== false ? (customerPhone || undefined) : undefined,
            customerAddress: scrapBillSettings.showCustomerAddress !== false ? (customerAddress || undefined) : undefined,
            customerState: scrapBillSettings.showCustomerState !== false ? (customerState || undefined) : undefined,
            billSettings: scrapBillSettings,
          };

          const scrapReceiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
          const printResult = await window.electronAPI.printReceipt(tenantId || 'global', scrapReceiptText);
          if (printResult?.skipped) {
            scrapPrintSuccess = false;
            setHardwareError(formatPrinterError('No printer configured'));
            setTimeout(() => setHardwareError(null), 5000);
          } else if (printResult && !printResult.success) {
            scrapPrintSuccess = false;
            setHardwareError(formatPrinterError(printResult.error));
            setTimeout(() => setHardwareError(null), 5000);
          }
        }

        // Cash drawer: record CASH_OUT for scrap cash payments
        if (scrapPaymentStatus === 'CASH' && window.electronAPI) {
          await window.electronAPI.dbCashierAddTransaction({
            tenant_id: tenantId || 'unset',
            type: 'CASH_OUT',
            amount: finalScrapGrandTotal,
            category: 'Scrap Purchase',
            notes: `Scrap purchase ${scrapInvoiceNum}`,
            user_id: userId || 'unset',
            user_name: userName || undefined,
          }).catch(() => {});
        }

        setCheckoutSuccess(saveOnly || !scrapPrintSuccess ? 'saved' : 'printed');
        setTimeout(async () => {
          const tabsCount = useTabStore.getState().tabs.length;
          const targetTabId = checkoutTabId;
          const stayInScrap = uiConfig.stayInScrapModeAfterPrint ?? false;

          if (tabsCount > 1 && !stayInScrap) {
            setIsScrapMode(false);
            closeTab(targetTabId);
          } else {
            clearCart();
            useCartStore.getState().setEditingInvoice(null, null, null);
            updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', receivedAmount: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '' });
            
            if (stayInScrap) {
              setIsScrapMode(true);
              await reserveScrapInvoiceNumberForTab(true);
            } else {
              setIsScrapMode(false);
              await Promise.all([reserveScrapInvoiceNumberForTab(true), reserveInvoiceNumberForTab(true)]);
              const tab = getActiveTab();
              if (tab?.reservedInvoiceNumber) {
                updateActiveTab({ title: tab.reservedInvoiceNumber });
              }
            }
            syncActiveSnapshot();
          }
          setCheckoutSuccess(false); // scrap mode reset
        }, 1800);
        return;
      }

      // ── Normal Mode Checkout ──
      const flags = useFeatureFlagsStore.getState().flags;
      if (flags?.biller_pin && !useCartStore.getState().billerStaffId) {
        pendingCheckoutSaveOnlyRef.current = saveOnly;
        setIsBillerPinModalOpen(true);
        return;
      }
      // Read PCS directly from DOM input elements (100% reliable — avoids ALL React state closure/batching issues)
      const pcsSnapshot: Record<string, number> = {};
      const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
      items.forEach(item => {
        const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
        const domInput = isPiecesWeight ? pcsRefs.current[item.product_id] : qtyRefs.current[item.product_id];
        if (domInput) {
          const domVal = domInput.value.replace(/[^\d]/g, '');
          const parsed = parseInt(domVal, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            pcsSnapshot[item.product_id] = parsed;
            return;
          }
        }
        const strVal = localPcsStr[item.product_id];
        if (strVal !== undefined && strVal !== '') {
          const parsed = parseInt(strVal, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            pcsSnapshot[item.product_id] = parsed;
            return;
          }
        }
        pcsSnapshot[item.product_id] = item.pieces_override ?? 1;
      });

      if (invoiceType === 'GST' && isB2B && !isQuotationMode && !isReturnMode && !isScrapMode) {
        if (!(customerGstin || '').trim()) {
          setHardwareError('Customer GSTIN is required for B2B GST Tax Invoices under GST rules.');
          return;
        }
        if (!(customerName || '').trim() || !(customerPhone || '').trim() || !(customerAddress || '').trim()) {
          setHardwareError('Customer Name, Mobile Phone, and Address are required for GST Tax Invoices under GST rules.');
          return;
        }
      }

      if (paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && (Number(splitDetails?.credit) || 0) > 0)) {
        if (!(customerName || '').trim() || !(customerPhone || '').trim()) {
          setHardwareError('Please enter Customer Name and Phone Number for Credit');
          return;
        }
      }

      if (paymentMethod === 'SPLIT') {
        const totalSplitEntered = splitTotal + (Number(splitDetails?.credit) || 0);
        if (totalSplitEntered <= 0) {
          setHardwareError('Please enter split payment breakdown amounts for Cash, Card, UPI, or Credit');
          return;
        }
        if (displayGrandTotal > 0 && totalSplitEntered < displayGrandTotal && Math.abs(displayGrandTotal - totalSplitEntered) > 0.01) {
          const shortfall = (displayGrandTotal - totalSplitEntered).toFixed(2);
          setHardwareError(`Split payment total (₹${totalSplitEntered.toFixed(2)}) is less than Grand Total (₹${displayGrandTotal.toFixed(2)}). Remaining shortfall: ₹${shortfall}`);
          return;
        }
      }

      const isEditing = !!editingInvoiceId;

      const pointsRedeemedCalc = loyaltyEnabled && pointsToRedeem > 0 ? Math.min(pointsToRedeem, Number(loyaltyCustomerData.pointsBalance) || 0) : 0;
      const pointsRedeemedDiscountCalc = pointsRedeemedCalc * loyaltyRedemptionRate;
      const effectiveGrandTotal = displayGrandTotal;

      const effectiveFinalPaymentMethod = paymentMethod === 'SPLIT' ? 'SPLIT' : paymentMethod;
      const isPaymentPending = effectiveFinalPaymentMethod === 'PENDING';
      const defaultFullPaid = (effectiveFinalPaymentMethod === 'CASH' || effectiveFinalPaymentMethod === 'UPI' || effectiveFinalPaymentMethod === 'CARD') ? effectiveGrandTotal : 0;
      const effectiveReceivedAmount = isPaymentPending ? 0 : (effectiveFinalPaymentMethod === 'SPLIT' ? splitTotal : ((receivedAmount && receivedAmount > 0) ? receivedAmount : defaultFullPaid));
      const effectiveBalanceAmount = isPaymentPending ? 0 : (refundAmount > 0 ? 0 : balanceAmount);

      const invoice_id = isEditing ? editingInvoiceId : uuidv4();
      const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (isB2B ? 'gst_b2b' : 'gst_b2c') : 'normal') : (invoiceType === 'GST' ? 'gst' : undefined);
      let invoice_number: string;
      if (isEditing && editingInvoiceNumber) {
        invoice_number = editingInvoiceNumber;
      } else {
        const localPeek = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
        const serverResult = await window.electronAPI.dbGetNextServerInvoiceNumber({ tenant_id: tenantId || 'global', series, start: localPeek?.counter });
        if (serverResult.success && serverResult.invoiceNumber) {
          invoice_number = serverResult.invoiceNumber;
        } else {
          const localResult = await window.electronAPI.dbGetNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
          invoice_number = localResult.success && localResult.invoiceNumber
            ? localResult.invoiceNumber
            : `${terminalCodeState || 'POS1'}-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;
        }
      }

      // Build line items for the invoice (regular items only — scrap items not in cart in normal mode)
      const regularCartItems = items.filter(item => !item.isScrap);
      // Determine supply type (intra vs inter-state) once for the whole invoice
      const _shopStateCart = useCartStore.getState().shopState || '';
      const _customerStateCart = customerState || '';
      const _isInterState = invoiceType === 'GST'
        && _shopStateCart.trim().toUpperCase() !== ''
        && _customerStateCart.trim().toUpperCase() !== ''
        && _shopStateCart.trim().toUpperCase() !== _customerStateCart.trim().toUpperCase();
      const _supplyType: 'INTRA' | 'INTER' = _isInterState ? 'INTER' : 'INTRA';

      const checkoutItems = regularCartItems.map(item => {
        if (item.isServiceItem) {
          const servicePrice = Number(item.offer_price ?? item.base_price) || 0;
          return { item_id: item.item_id || uuidv4(), product_id: item.product_id, name: item.name, quantity: 1, unit_price: servicePrice, tax_amount: 0, total: servicePrice, isServiceItem: true, cgst_rate: 0, sgst_rate: 0, igst_rate: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, hsn_sac_code: null, supply_type: _supplyType };
        }

        const rate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0) ? Number(item.grade_rate) : Number(item.base_price || 0);
        const qty = Number(item.quantity) || 0;

        const catalogPriceChk = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
          : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
          : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
          : rate;
        const isAdhocOfferC = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
        const isAdhocDiscFlatC = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
        const isAdhocDiscPctC = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
        let effectiveRate = catalogPriceChk;
        if (isAdhocOfferC) {
          effectiveRate = Number(item.offer_price);
        } else if (isAdhocDiscFlatC) {
          effectiveRate = catalogPriceChk - Number(item.discount_flat);
        } else if (isAdhocDiscPctC) {
          effectiveRate = catalogPriceChk * (1 - Number(item.discount_percent) / 100);
        }
        effectiveRate = Math.max(effectiveRate, 0);

        const total = effectiveRate * qty;
        const unitPrice = qty > 0 ? total / qty : effectiveRate;
        const itemTax = invoiceType === 'GST' ? total * (item.tax_rate_percent / 100)
          : (invoiceType === 'BILL_OF_SUPPLY' && bosTaxRatePercent > 0
            ? (bosTaxInclusive ? total * (bosTaxRatePercent / 100 / (1 + bosTaxRatePercent / 100)) : total * (bosTaxRatePercent / 100))
            : 0);
        const pieces_sold = pcsSnapshot[item.product_id] ?? 1;

        // ── GST split (Indian GST Act compliance) ────────────────────────────────
        // INTRA-state → CGST = rate/2, SGST = rate/2; INTER-state → IGST = rate
        const taxRatePercent = invoiceType === 'GST' ? (item.tax_rate_percent || 0) : (bosTaxRatePercent || 0);
        const halfRate = taxRatePercent / 2;
        const round2 = (n: number) => Math.round(n * 100) / 100;
        let cgst_rate = 0, sgst_rate = 0, igst_rate = 0;
        let cgst_amount = 0, sgst_amount = 0, igst_amount = 0;
        if (itemTax > 0) {
          if (_supplyType === 'INTER') {
            igst_rate = taxRatePercent;
            igst_amount = round2(itemTax);
          } else {
            cgst_rate = halfRate;
            sgst_rate = halfRate;
            cgst_amount = round2(itemTax / 2);
            sgst_amount = round2(itemTax / 2);
          }
        }
        // ─────────────────────────────────────────────────────────────────────────

        return {
          item_id: item.item_id || uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: qty,
          unit_price: unitPrice,
          tax_amount: itemTax,
          total,
          pieces_sold,
          billing_type: item.billing_type,
          uom: item.uom || item.unit,
          // GST split
          cgst_rate, sgst_rate, igst_rate,
          cgst_amount, sgst_amount, igst_amount,
          hsn_sac_code: item.hsn_sac_code || null,
          supply_type: _supplyType,
        };
      });

      // Build receipt display items
      const receiptItems = regularCartItems.map(item => {
        if (item.isServiceItem) {
          const servicePrice = Number(item.offer_price ?? item.base_price) || 0;
          return { name: item.name, quantity: 1, unit_price: servicePrice, total: servicePrice, originalRate: undefined, discountLabel: 'Service' };
        }

        const rate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0) ? Number(item.grade_rate) : Number(item.base_price || 0);
        const qty = Number(item.quantity) || 0;
        const catalogPriceRec = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
          : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
          : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
          : rate;
        const isAdhocOfferRec = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
        const isAdhocDiscFlatRec = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
        const isAdhocDiscPctRec = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
        let effectiveRate = catalogPriceRec;
        if (isAdhocOfferRec) {
          effectiveRate = Number(item.offer_price);
        } else if (isAdhocDiscFlatRec) {
          effectiveRate = catalogPriceRec - Number(item.discount_flat);
        } else if (isAdhocDiscPctRec) {
          effectiveRate = catalogPriceRec * (1 - Number(item.discount_percent) / 100);
        }
        effectiveRate = Math.max(effectiveRate, 0);
        const total = effectiveRate * qty;
        const unitPrice = qty > 0 ? total / qty : effectiveRate;
        const mrpRate = (item.original_base_price != null && Number(item.original_base_price) > rate)
          ? Number(item.original_base_price)
          : rate;
        let originalRate: number | undefined;
        let discountLabel: string | undefined;
        if (isAdhocOfferRec) {
          originalRate = mrpRate;
          discountLabel = 'Offer';
        } else if (isAdhocDiscFlatRec) {
          originalRate = mrpRate;
          discountLabel = `-₹${Number(item.discount_flat).toFixed(0)}`;
        } else if (isAdhocDiscPctRec) {
          originalRate = mrpRate;
          discountLabel = `${item.discount_percent}% OFF`;
        } else if (catalogPriceRec < mrpRate) {
          originalRate = mrpRate;
          discountLabel = 'Offer';
        } else if (mrpRate > effectiveRate + 0.005) {
          originalRate = mrpRate;
          discountLabel = 'Offer';
        }
        const isPriceOverride = isAdhocOfferRec || isAdhocDiscFlatRec || isAdhocDiscPctRec || Boolean(item.is_tier_overridden) || (mrpRate > effectiveRate + 0.005 && catalogPriceRec >= mrpRate);
        const pcsVal = pcsSnapshot[item.product_id] ?? item.pieces_override;
        return {
          name: item.name,
          quantity: qty,
          unit_price: unitPrice,
          total,
          originalRate,
          discountLabel,
          isPriceOverride,
          brand: item.brand_manufacturer || undefined,
          billing_type: item.billing_type,
          pieces_sold: pcsVal != null ? Number(pcsVal) : undefined,
          pieces_override: pcsVal != null ? Number(pcsVal) : undefined,
          pieces_per_kg: item.pieces_per_kg,
          unit: item.unit || item.uom,
          isCombo: item.isCombo,
          combo_items: item.combo_items,
        };
      });

      const cfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;

      const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const openCashDrawerOnPending = printFmt.openCashDrawerOnPending === true;
      const isHalfA4 = printFmt.format === 'half-a4';
      const isA4 = printFmt.format === 'a4';
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const useA4 = isGstOrB2B || isA4 || isHalfA4;
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };

      const state = useCartStore.getState();
      // Calculate loyalty points
      const previousPointsBalance = Number(loyaltyCustomerData.pointsBalance) || 0;
      const hasCustomerForPoints = Boolean(loyaltyCustomerData.customerId || (customerPhone && customerPhone.trim()));
      const shouldAwardPointsNow = paymentMethod !== 'PENDING' || loyaltyAwardOnPending;
      const pointsEarned = loyaltyEnabled && hasCustomerForPoints && shouldAwardPointsNow
        ? Math.floor(displayGrandTotal / (loyaltyEarningRate > 0 ? loyaltyEarningRate : 100))
        : 0;
      const pointsRedeemed = loyaltyEnabled && pointsToRedeem > 0
        ? Math.min(pointsToRedeem, Number(loyaltyCustomerData.pointsBalance) || 0)
        : 0;
      const pointsRedeemedDiscount = pointsRedeemed * loyaltyRedemptionRate;
      const remainingPointsBalance = previousPointsBalance + pointsEarned - pointsRedeemed;
      // Adjust grand total for points redemption discount (already calculated above as effectiveGrandTotal)

      // Pass grand total BEFORE scrap deduction so the receipt can properly show
      // the scrap deduction line and compute the correct final grand total.
      // Without this fix, scrap deduction was subtracted twice (here and in receiptGenerator).
      const grandTotalBeforeScrap = Math.max(0, (isGrandTotalOverridden ? (activeTab!.manualTotalOverride! + (storeScrapDeduction || 0) + (storeReturnDeduction || 0)) : grandTotal) - pointsRedeemedDiscount);

      const cleanCustName = (customerName || '').trim();
      const cleanCustPhone = (customerPhone || '').trim();
      const matchedParty = findMatchingParty(cleanCustName, cleanCustPhone);
      const currentPartyKey = `${cleanCustName.toLowerCase()}|${cleanCustPhone}`;
      const isStaffParty = String(matchedParty?.party_type || '').toUpperCase() === 'STAFF';
      const editingContribution = isEditing && !isStaffParty && activeTab?.editingInvoicePartyKey === currentPartyKey
        ? (Number(activeTab?.editingInvoiceContribution) || 0)
        : 0;
      const partyOldBalance = matchedParty ? (Number(matchedParty.balance) || 0) - editingContribution : 0;
      const splitCreditAmount = Number(splitDetails?.credit) || 0;
      const isSplitCreditBill = effectiveFinalPaymentMethod === 'SPLIT' && splitCreditAmount > 0;
      const splitNonCreditPaid = (Number(splitDetails?.cash) || 0)
        + (Number(splitDetails?.card) || 0)
        + (Number(splitDetails?.upi) || 0)
        + (Number(splitDetails?.cheque) || 0)
        + (Number(splitDetails?.bank_transfer) || 0);
      const newPartyContribution = effectiveFinalPaymentMethod === 'CREDIT'
        ? Math.max(0, effectiveGrandTotal - (effectiveReceivedAmount || 0))
        : isSplitCreditBill
        ? Math.max(0, effectiveGrandTotal - splitNonCreditPaid)
        : 0;
      const partyNewBalance = partyOldBalance + newPartyContribution;
      const tracksPartyBalance = partyOldBalance !== 0 || effectiveFinalPaymentMethod === 'CREDIT' || isSplitCreditBill;
      const splitDetailsForSave: SplitDetails = { ...(splitDetails || {}) };
      if (effectiveFinalPaymentMethod !== 'SPLIT') {
        splitDetailsForSave.cash = 0;
        splitDetailsForSave.card = 0;
        splitDetailsForSave.upi = 0;
        splitDetailsForSave.cheque = 0;
        splitDetailsForSave.bank_transfer = 0;
        if (effectiveFinalPaymentMethod !== 'CREDIT') splitDetailsForSave.credit = 0;
      }

      // ── Credit Limit & Credit Period Enforcement ──────────────────────────────
      // Determine how much of THIS bill is on credit
      let billCreditAmount = 0;
      if (effectiveFinalPaymentMethod === 'CREDIT') {
        billCreditAmount = Math.max(0, effectiveGrandTotal);
      } else if (effectiveFinalPaymentMethod === 'SPLIT') {
        billCreditAmount = Math.max(0, Number(splitDetails.credit) || 0);
      }

      // Check credit period expiry restriction (Cash purchases remain 100% available)
      if (billCreditAmount > 0 && matchedParty) {
        const creditPeriodEnabled = Boolean((matchedParty as any).credit_period_enabled);
        const restrictOnExpiry = (matchedParty as any).restrict_on_credit_expiry !== false && (matchedParty as any).restrict_on_credit_expiry !== 0;
        const hasOverdue = Boolean((matchedParty as any).has_overdue);

        if (creditPeriodEnabled && restrictOnExpiry && hasOverdue) {
          const overdueCount = (matchedParty as any).overdue_bills_count || 1;
          const overdueAmt = (matchedParty as any).overdue_amount ? ` (₹${Number((matchedParty as any).overdue_amount).toFixed(2)})` : '';
          setHardwareError(
            `Credit purchases restricted for ${matchedParty.name}! Customer has ${overdueCount} overdue bill${overdueCount !== 1 ? 's' : ''}${overdueAmt} exceeding credit period. Please collect outstanding dues or switch to Cash/Card/UPI.`
          );
          return;
        }
      }

      // Block checkout if the party's credit balance would exceed their limit.
      if (matchedParty && Number(matchedParty.credit_limit) > 0 && newPartyContribution > 0) {
        const creditLimit = Number(matchedParty.credit_limit);
        const projectedBalance = partyOldBalance + newPartyContribution;
        if (projectedBalance > creditLimit) {
          const excess = projectedBalance - creditLimit;
          const fmtNum = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          setHardwareError(
            `Credit Limit Exceeded for ${matchedParty.name}! Limit: �,1${fmtNum(creditLimit)}, Current Due: �,1${fmtNum(partyOldBalance)}, Bill Credit: �,1${fmtNum(newPartyContribution)}. Exceeds limit by �,1${fmtNum(excess)} �?" Cannot complete bill.`
          );
          return;
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      const receiptData: ReceiptData = {
        shopName: (invoiceType === 'GST' || billSettings.showShopName !== false) ? (shopNameState || shopName || 'My Shop') : '',
        shopGstin: (invoiceType === 'GST' || billSettings.showShopGstin !== false) ? (shopGstin || undefined) : undefined,
        shopState: (invoiceType === 'GST' || billSettings.showShopState !== false) ? (state.shopState || undefined) : undefined,
        shopAddress: (invoiceType === 'GST' || billSettings.showShopAddress !== false) ? (shopAddress || undefined) : undefined,
        shopPhone: (invoiceType === 'GST' || billSettings.showPhone !== false) ? (shopPhone || undefined) : undefined,
        shopEmail: shopEmail || undefined,
        shopWebsite: shopWebsite || undefined,
        bankName: bankNameState || undefined,
        bankAccount: bankAccountState || undefined,
        bankIfsc: bankIfscState || undefined,
        bankBranch: bankBranchState || undefined,
        upiId: upiId || undefined,
        showUpiQr: showUpiQr,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        showPriceOverrideMrp: printFmt?.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
        invoiceNumber: invoice_number, date: formatBillDateTime(new Date()),
        billerName: useAuthStore.getState().userName || useAuthStore.getState().role || undefined,
        items: receiptItems,
        subtotal, tax: totalTax,
        cgst: invoiceType === 'GST' ? cgst : (billSettings.showBosTaxBreakup ? cgst : undefined),
        sgst: invoiceType === 'GST' ? sgst : (billSettings.showBosTaxBreakup ? sgst : undefined),
        igst: invoiceType === 'GST' ? igst : (billSettings.showBosTaxBreakup ? igst : undefined),
        discount, discountType: state.discountType,
        discountValue: state.discountValue, grandTotal: grandTotalBeforeScrap,
        pointsEarned: pointsEarned > 0 ? pointsEarned : undefined,
        previousPointsBalance: previousPointsBalance > 0 ? previousPointsBalance : undefined,
        pointsRedeemed: pointsRedeemed > 0 ? pointsRedeemed : undefined,
        pointsRedeemedDiscount: pointsRedeemedDiscount > 0 ? pointsRedeemedDiscount : undefined,
        remainingPointsBalance: remainingPointsBalance > 0 ? remainingPointsBalance : undefined,
        scrapDeduction: storeScrapDeduction || undefined, scrapInvoiceNumber: storeScrapInvoiceNumber || undefined,
        returnDeduction: storeReturnDeduction || undefined, returnInvoiceNumber: storeReturnInvoiceNumber || undefined,
        ...(effectiveFinalPaymentMethod === 'CREDIT'
          ? {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              receivedAmount: effectiveReceivedAmount,
              balanceAmount: partyNewBalance,
              customerBalance: partyNewBalance,
              paymentMethod: 'CREDIT',
            }
          : (effectiveFinalPaymentMethod === 'CASH' && !isPaymentPending)
          ? {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              receivedAmount: effectiveReceivedAmount,
              balanceAmount: partyOldBalance !== 0 ? partyNewBalance : effectiveBalanceAmount,
              customerBalance: partyOldBalance !== 0 ? partyNewBalance : undefined,
              paymentMethod: 'CASH',
            }
          : isSplitCreditBill
          ? {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              receivedAmount: effectiveGrandTotal - splitCreditAmount,
              balanceAmount: partyNewBalance,
              customerBalance: partyNewBalance,
              paymentMethod: 'SPLIT',
            }
          : {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              customerBalance: partyOldBalance !== 0 ? partyNewBalance : undefined,
              ...(effectiveFinalPaymentMethod === 'SPLIT' ? { receivedAmount: effectiveReceivedAmount } : {}),
              paymentMethod: effectiveFinalPaymentMethod,
            }
        ),
        invoiceType,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        customerGstin: customerGstin?.trim() || undefined,
        transporterName: activeTab?.transporterName || undefined,
        vehicleNumber: activeTab?.vehicleNumber || undefined,
        transporterDocNo: activeTab?.transporterDocNo || undefined,
        transporterDocDate: activeTab?.transporterDocDate || undefined,
        ewayBillNo: activeTab?.ewayBillNo || undefined,
        ewayBillDate: activeTab?.ewayBillDate || undefined,
        shippingName: activeTab?.shippingName || undefined,
        shippingAddress: activeTab?.shippingAddress || undefined,
        shippingGstin: activeTab?.shippingGstin || undefined,
        customerState: customerState || undefined,
        description: activeTab?.description || undefined,
        notes: activeTab?.description || undefined,
        billSettings,
        isB2B,
        a5Orientation: printFmt.a5Orientation || 'horizontal',
        ...(billCreditAmount > 0 && matchedParty && (matchedParty as any).credit_period_enabled ? {
          dueDate: (() => {
            const days = Number((matchedParty as any).credit_period_days) || 30;
            const d = new Date();
            d.setDate(d.getDate() + days);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          })(),
          creditPeriodDays: Number((matchedParty as any).credit_period_days) || 30,
        } : {}),
      };

      let result: any;
      const wantsLoyalty = loyaltyEnabled && !!(customerName || '').trim() && (!!(customerPhone || '').trim() || !!(customerAddress || '').trim() || loyaltyCustomerData.customerId);
      if (isEditing) {
        result = await window.electronAPI.dbUpdateInvoice({
          invoice_id, tenant_id: tenantId || 'global', role: editingInvoiceRole || authRole,
          permissions: useAuthStore.getState().permissions || [],
          user_id: userId || undefined,
          created_at: activeTab?.billDate || undefined,
          subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: effectiveFinalPaymentMethod,
          received_amount: effectiveReceivedAmount,
          balance_amount: effectiveFinalPaymentMethod === 'CREDIT'
            ? partyNewBalance
            : isSplitCreditBill
            ? partyNewBalance
            : (partyOldBalance !== 0 ? partyNewBalance : effectiveBalanceAmount),
          split_details: {
            ...splitDetailsForSave,
            ...(currentSelectedUpi ? { upi_id: currentSelectedUpi.upi_id, upi_name: currentSelectedUpi.name, upi_source_id: currentSelectedUpi.source_id } : {}),
            ...(partyOldBalance !== 0 ? { old_due: partyOldBalance, old_balance: partyOldBalance } : {}),
            ...(tracksPartyBalance ? { new_due: partyNewBalance } : {})
          },
          customer_id: activeTab?.customerId || loyaltyCustomerData.customerId || null,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          is_staff: Boolean(activeTab?.isStaffCustomer),
          staff_id: activeTab?.staffId || (activeTab?.isStaffCustomer ? activeTab.customerId : null),
          customer_gstin: (invoiceType === 'GST' || billSettings.showCustomerGstin !== false) ? (customerGstin || null) : null,
          customer_state: (invoiceType === 'GST' || billSettings.showCustomerState !== false) ? (customerState || null) : null,
          customer_address: customerAddress || null,
          description: activeTab?.description || null,
          notes: activeTab?.description || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
          actual_refund_paid: refundAmount > 0 && paymentMethod !== 'PENDING'
            ? (actualRefundPaid > 0 ? actualRefundPaid : refundAmount)
            : 0,
          // GST totals for edited invoice
          cgst_total: cgst, sgst_total: sgst, igst_total: igst, supply_type: _supplyType,
          items: checkoutItems,
          loyalty_enabled: wantsLoyalty,
          loyalty_customer_id: activeTab?.customerId || loyaltyCustomerData.customerId || null,
          points_earned: pointsEarned,
          points_redeemed: pointsRedeemed,
          points_redeemed_discount: pointsRedeemedDiscount,
          previous_points_balance: previousPointsBalance,
          remaining_points_balance: remainingPointsBalance,
        });
      } else {
        result = await window.electronAPI.dbCheckout({
          invoice_id, tenant_id: tenantId || 'unset', user_id: userId || 'unset',
          biller_staff_id: useCartStore.getState().billerStaffId || null,
          sales_staff_id: useCartStore.getState().salesStaffId || null,
          created_at: activeTab?.billDate || undefined,
          invoice_number,
          invoice_type: invoiceType, subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: effectiveFinalPaymentMethod,
          split_details: {
            ...splitDetailsForSave,
            ...(currentSelectedUpi ? { upi_id: currentSelectedUpi.upi_id, upi_name: currentSelectedUpi.name, upi_source_id: currentSelectedUpi.source_id } : {}),
            ...(partyOldBalance !== 0 ? { old_due: partyOldBalance, old_balance: partyOldBalance } : {}),
            ...(tracksPartyBalance ? { new_due: partyNewBalance } : {})
          },
          received_amount: effectiveReceivedAmount,
          balance_amount: effectiveFinalPaymentMethod === 'CREDIT'
            ? partyNewBalance
            : isSplitCreditBill
            ? partyNewBalance
            : (partyOldBalance !== 0 ? partyNewBalance : effectiveBalanceAmount),
          customer_id: activeTab?.customerId || loyaltyCustomerData.customerId || null,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          is_staff: Boolean(activeTab?.isStaffCustomer),
          staff_id: activeTab?.staffId || (activeTab?.isStaffCustomer ? activeTab.customerId : null),
          customer_gstin: (invoiceType === 'GST' || billSettings.showCustomerGstin !== false) ? (customerGstin || null) : null,
          customer_state: (invoiceType === 'GST' || billSettings.showCustomerState !== false) ? (customerState || null) : null,
          customer_address: customerAddress || null,
          description: activeTab?.description || null,
          notes: activeTab?.description || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
          actual_refund_paid: refundAmount > 0 && paymentMethod !== 'PENDING'
            ? (actualRefundPaid > 0 ? actualRefundPaid : refundAmount)
            : 0,
          // GST invoice-level totals (Indian GST Act compliance)
          cgst_total: cgst, sgst_total: sgst, igst_total: igst, supply_type: _supplyType,
          items: checkoutItems,
          scrap_items: [],
          loyalty_enabled: wantsLoyalty,
          loyalty_customer_id: loyaltyCustomerData.customerId,
          points_earned: pointsEarned,
          points_redeemed: pointsRedeemed,
          points_redeemed_discount: pointsRedeemedDiscount,
          previous_points_balance: previousPointsBalance,
          remaining_points_balance: remainingPointsBalance,
        });
      }
      if (!result.success) {
        setHardwareError(isEditing ? `Update failed: ${result.error || 'Unknown error'}` : `Checkout failed: ${result.error || 'Unknown error'}`);
        return;
      }

      // Ensure receipt printing and activeTab title use the exact confirmed invoice_number returned by DB/checkout
      const confirmedInvoiceNumber = (result && result.invoice_number) ? result.invoice_number : invoice_number;
      invoice_number = confirmedInvoiceNumber;
      receiptData.invoiceNumber = confirmedInvoiceNumber;
      if (result && result.created_at) {
        receiptData.date = formatBillDateTime(result.created_at);
      }

      // Consume ADJUST_BILL return credit. Only the portion actually applied to this
      // bill (clamped to the bill total) is settled; any leftover stays as pending
      // credit for a future bill. Editing a bill never re-consumes credit.
      if (!isEditing && storeReturnDeduction > 0 && storeReturnInvoiceNumber && window.electronAPI) {
        try {
          const consumed = Math.min(storeReturnDeduction, returnConsumed > 0 ? returnConsumed : grandTotal);
          await window.electronAPI.dbSettleReturnInvoice({
            tenant_id: tenantId || 'global',
            return_number: storeReturnInvoiceNumber,
            adjusted_invoice_number: invoice_number,
            amount: consumed,
          });
        } catch (e) {
          console.error('Failed to settle ADJUST_BILL return credit:', e);
        }
      }

      // Auto-record cash out if there was a leftover refund amount and payment method is CASH.
      // refundAmount only covers SCRAP credit excess — ADJUST_BILL leftover stays as credit.
      if (refundAmount > 0 && paymentMethod === 'CASH' && window.electronAPI) {
        try {
          await window.electronAPI.dbCashierAddTransaction({
            tenant_id: tenantId || 'global',
            type: 'CASH_OUT',
            amount: refundAmount,
            category: 'CREDIT_REFUND',
            notes: `Refund leftover credits for invoice ${invoice_number}`,
            user_id: userId,
            user_name: useAuthStore.getState().userName || undefined
          });
        } catch (e) {
          console.error('Failed to log auto cash-out for scrap refund:', e);
        }
      }

      // Update tab title to reflect the completed invoice number
      updateActiveTab({ title: invoice_number });

      // If this was a quotation being billed, mark it as CONVERTED
      if (editingQuotationId) {
        try {
          await window.electronAPI.dbUpdateQuotationStatus({
            quotation_id: editingQuotationId,
            status: 'CONVERTED',
            converted_to_invoice: 1,
            invoice_id,
          });
        } catch (e) {
          console.error('Failed to update quotation status', e);
        }
      }

      // ── Print receipt AFTER successful save (non-fatal) ──
      printSuccess = true;
      if (!saveOnly) {
        try {
          if (useA4) {
            const invoiceStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
            const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as any);
            const printResult = await window.electronAPI.printA4Html(tenantId || 'global', invoiceHtml);
            if (!printResult.success) {
              printSuccess = false;
              if ((printResult as any).useDefaultDialog) {
                const pw = window.open('', '_blank');
                if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
              } else {
                setHardwareError(formatPrinterError(printResult.error));
                setTimeout(() => setHardwareError(null), 5000);
              }
            }
          } else {
            const thermalWidth = printFmt.width ? Number(printFmt.width) / 10 : width;
            const thermalStyle = printFmt.thermalStyle || (printFmt.format === 'thermal' ? printFmt.style : undefined) || 'standard';
            const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
            const printResult = await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
            if (!printResult.success) {
              printSuccess = false;
              console.warn('[Checkout] Print failed (invoice saved):', printResult.error);
              setHardwareError(formatPrinterError(printResult.error));
              setTimeout(() => setHardwareError(null), 5000);
            } else if (printResult.skipped) {
              printSuccess = false;
              setHardwareError(formatPrinterError('No printer configured'));
              setTimeout(() => setHardwareError(null), 5000);
            }
          }
          if (!isPaymentPending || openCashDrawerOnPending) {
            window.electronAPI.openCashDrawer(tenantId || 'global').catch(() => {});
          }
        } catch (printErr: any) {
          printSuccess = false;
          console.warn('[Checkout] Print error (invoice already saved):', printErr);
          setHardwareError(formatPrinterError(printErr.message));
          setTimeout(() => setHardwareError(null), 5000);
        }
      }

      setCheckoutSuccess(saveOnly || !printSuccess ? 'saved' : 'printed');

      // ── Send Bill via WhatsApp (Automatic if enabled & phone present) ──
      const isAutoWhatsApp = localStorage.getItem('auto_whatsapp_send') === 'true';
      const custPhone = (customerPhone || activeTab?.customerPhone || '').trim();
      if (isAutoWhatsApp && custPhone && window.electronAPI?.whatsappSendInvoice) {
        try {
          const invStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
          const fullHtml = generateInvoiceHtml(receiptData, invStyle as any);
          const waMessage = formatWhatsAppBillMessage({
            shopName: receiptData.shopName || shopName || 'Store',
            invoiceNumber: confirmedInvoiceNumber,
            date: receiptData.date || new Date().toLocaleDateString('en-IN'),
            customerName: customerName || undefined,
            customerPhone: custPhone,
            items: (receiptItems || []).map((i: any) => ({
              name: i.name,
              quantity: i.quantity,
              unit_price: Number(i.unit_price) || 0,
              total: Number(i.total) || 0
            })),
            grandTotal: effectiveGrandTotal,
            receivedAmount: effectiveReceivedAmount,
            balanceAmount: tracksPartyBalance ? partyNewBalance : effectiveBalanceAmount,
            paymentMethod: effectiveFinalPaymentMethod,
            dueDate: (receiptData as any).dueDate,
            creditPeriodDays: (receiptData as any).creditPeriodDays,
            customerBalance: partyOldBalance !== 0 ? partyNewBalance : undefined,
          });

          window.electronAPI.whatsappSendInvoice({
            phone: custPhone,
            message: waMessage,
            htmlContent: fullHtml,
            fileName: `Invoice_${confirmedInvoiceNumber}.pdf`
          }).catch((err) => console.warn('[WhatsApp Auto Send Error]:', err));
        } catch (e) {
          console.warn('[WhatsApp Build Error]:', e);
        }
      }

      // Notify the cashier settlement page (if open) to refresh instantly
      try {
        window.dispatchEvent(new CustomEvent('checkout:completed', { detail: { invoice_id: invoice_id || '', invoice_number: invoice_number || '' } }));
      } catch (e) { /* ignore */ }
      // Refresh parties list so party balances update immediately
      window.electronAPI.dbGetParties(tenantId || 'global')
        .then((res: any) => {
          if (Array.isArray(res)) setPartiesForTier(res);
        })
        .catch(console.error);
      setTimeout(async () => {
        const tabsCount = useTabStore.getState().tabs.length;
        const targetTabId = checkoutTabId;
        if (invoiceType === 'GST') {
          setInvoiceType('BILL_OF_SUPPLY');
        }
        if (tabsCount > 1) {
          closeTab(targetTabId);
        } else {
          clearCart();
          clearScrapDeduction();
          clearReturnDeduction();
          setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
          setShowLoyaltyRedemption(false);
          setPointsToRedeem(0);
          updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', customerId: '', manualTotalOverride: null, editingInvoiceContribution: 0, editingInvoicePartyKey: '', billDate: null, paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', receivedAmount: 0, actualRefundPaid: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '', reservedReturnNumber: '' });
          syncActiveSnapshot();
          await reserveInvoiceNumberForTab();
          const tab = getActiveTab();
          if (tab?.reservedInvoiceNumber) {
            updateActiveTab({ title: tab.reservedInvoiceNumber });
          }
        }
        setCheckoutSuccess(false); // normal mode reset
      }, 1800);
    } catch (err: any) {
      console.error('[Checkout Error]', err);
      setHardwareError(`Checkout failed: ${err?.message || 'Unexpected error'}`);
    } finally {
      isCheckingOutRef.current = false;
      setIsCheckingOut(false);
    }
  };

  // ── Return Mode: process return from cart items (replaces old 2-phase flow) ──
  const handleProcessReturnFromCart = async (saveOnly = false) => {
    if (!window.electronAPI) return;
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
      const numRes = await window.electronAPI.dbGetNextReturnNumber({ tenant_id: tid });
      const returnNumber = numRes.success && numRes.returnNumber ? numRes.returnNumber : `RTN-${Date.now()}`;
      const returnSubtotal = returnCartItems.reduce((s, item) => s + (Number(item.originalUnitPrice) || 0) * (Number(item.quantity) || 0), 0);
      const returnTaxTotal = returnCartItems.reduce((s, item) => {
        const origQty = Number(item.originalQuantity) || 1;
        return s + ((Number(item.originalTaxAmount) || 0) / origQty) * (Number(item.quantity) || 0);
      }, 0);
      const returnItems = returnCartItems.map(item => ({
        return_item_id: uuidv4(),
        product_id: item.product_id,
        invoice_item_id: item.invoiceItemId || undefined,
        name: item.name,
        brand_manufacturer: item.brand_manufacturer || null,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.originalUnitPrice) || 0,
        tax_amount: ((Number(item.originalTaxAmount) || 0) / Math.max(1, Number(item.originalQuantity) || 1)) * (Number(item.quantity) || 0),
        total: (Number(item.originalUnitPrice) || 0) * (Number(item.quantity) || 0),
      }));

      const result = await window.electronAPI.dbCreateReturn({
        return_id: uuidv4(),
        invoice_id: selectedReturnInvoice.invoice_id,
        tenant_id: tid,
        user_id: userId || undefined,
        return_number: returnNumber,
        customer_name: selectedReturnInvoice.customer_name || customerName || undefined,
        customer_phone: selectedReturnInvoice.customer_phone || customerPhone || undefined,
        customer_address: (selectedReturnInvoice as any)?.customer_address || customerAddress || undefined,
        subtotal: returnSubtotal,
        tax_total: returnTaxTotal,
        grand_total: returnSubtotal + returnTaxTotal,
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

      if (returnRefundMethod === 'CASH') {
        try {
          await window.electronAPI.dbCashierAddTransaction({
            tenant_id: tid,
            type: 'CASH_OUT',
            amount: returnSubtotal + returnTaxTotal,
            category: 'RETURN_REFUND',
            notes: `Return refund for ${returnNumber} (Ref: ${selectedReturnInvoice.invoice_number})`,
            user_id: userId,
            user_name: useAuthStore.getState().userName || undefined,
          });
        } catch (e) { console.error('Failed to log return cash out', e); }
      }

      if (returnRefundMethod === 'ADJUST_BILL') {
        setReturnDeduction(returnSubtotal + returnTaxTotal, returnNumber);
      }

      if (!saveOnly) {
        const cfg = await window.electronAPI.settingsGet({ tenant_id: tid, key: 'receipt_printer_config' });
        const printFmt = await window.electronAPI.settingsGet({ tenant_id: tid, key: 'print_format' });
        const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : (cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8);
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
          grandTotal: returnSubtotal + returnTaxTotal,
          invoiceType: 'RETURN',
          customerName: selectedReturnInvoice.customer_name || customerName || undefined,
          customerPhone: selectedReturnInvoice.customer_phone || customerPhone || undefined,
          customerAddress: (selectedReturnInvoice as any)?.customer_address || customerAddress || undefined,
          customerState: (selectedReturnInvoice as any)?.customer_state || undefined,
          billSettings,
        };
        const receiptText = generateReceiptText(returnReceiptData, thermalWidth, undefined, thermalStyle);
        const printResult = await window.electronAPI.printReceipt(tid, receiptText);
        if (printResult?.skipped) {
          setHardwareError(formatPrinterError('No printer configured'));
          setTimeout(() => setHardwareError(null), 5000);
        } else if (printResult && !printResult.success) {
          setHardwareError(formatPrinterError(printResult.error));
          setTimeout(() => setHardwareError(null), 5000);
        }
      }

      // Refresh parties list so party balances update immediately
      window.electronAPI.dbGetParties(tid)
        .then((res: any) => {
          if (Array.isArray(res)) setPartiesForTier(res);
        })
        .catch(console.error);

      // Notify other views (cashier settlement, history)
      try {
        window.dispatchEvent(new CustomEvent('checkout:completed', { detail: { return_number: returnNumber } }));
      } catch (e) { /* ignore */ }

      setReturnProcessed(true);
      setReturnSuccessToast(saveOnly ? `Return ${returnNumber} saved successfully!` : `Return ${returnNumber} processed & receipt printed!`);
      setTimeout(async () => {
        setReturnProcessed(false);
        const tabsCount = useTabStore.getState().tabs.length;
        const currentActiveId = activeTabId;
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

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

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
    if (!window.electronAPI?.whatsappSendInvoice) {
      setHardwareError('WhatsApp service not available in this environment');
      setTimeout(() => setHardwareError(null), 3500);
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };

      const isB2B = Boolean(customerGstin?.trim()) || Boolean(activeTab?.isB2B);
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const isHalfA4 = printFmt.format === 'half-a4';
      const invStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');

      const billNo = activeTab?.reservedInvoiceNumber || activeTab?.title || 'ACTIVE';
      const receiptItems = items.map(item => {
        const rate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0) ? Number(item.grade_rate) : Number(item.base_price || 0);
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

      const fullHtml = generateInvoiceHtml(activeReceiptData, invStyle as any);
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

      const sendRes = await window.electronAPI.whatsappSendInvoice({
        phone: custPhone,
        message: waMessage,
        htmlContent: fullHtml,
        fileName: "Invoice_" + billNo + ".pdf"
      });

      if (sendRes?.success) {
        setInfoToast("Invoice PDF sent to WhatsApp (" + custPhone + ") successfully!");
        setTimeout(() => setInfoToast(null), 4000);
      } else {
        setHardwareError("WhatsApp Send Failed: " + (sendRes?.error || 'Unknown error'));
        setTimeout(() => setHardwareError(null), 5000);
      }
    } catch (err: any) {
      console.error('[WhatsApp Manual Send Error]:', err);
      setHardwareError("WhatsApp Error: " + (err?.message || 'Could not send'));
      setTimeout(() => setHardwareError(null), 5000);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldBillsPanel, setShowHeldBillsPanel] = useState(false);
  const [heldBillsLoading, setHeldBillsLoading] = useState(false);

  // Load active held bills from backend
  const loadHeldBills = useCallback(async () => {
    if (!window.electronAPI) {
      const stored = JSON.parse(localStorage.getItem('vendora-held-bills') || '[]');
      const now = Date.now();
      const valid = stored.filter((b: any) => {
        const time = new Date(b.heldAt).getTime();
        return !isNaN(time) && (now - time < 24 * 60 * 60 * 1000);
      });
      if (valid.length !== stored.length) {
        localStorage.setItem('vendora-held-bills', JSON.stringify(valid));
      }
      setHeldBills(valid);
      return;
    }
    setHeldBillsLoading(true);
    try {
      const bills = await window.electronAPI.dbGetHeldBills({ tenant_id: tenantId || 'global' });
      if (Array.isArray(bills)) {
        setHeldBills(bills);
      }
    } catch (e) {
      console.error('Failed to load held bills', e);
    } finally {
      setHeldBillsLoading(false);
    }
  }, [tenantId]);

  // Auto-expire stale holds on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.dbExpireStaleHeldBills({ tenant_id: tenantId || 'global' }).catch(() => {});
    loadHeldBills();
  }, [tenantId, loadHeldBills]);

  // Refresh held bills after a hold or release
  useEffect(() => {
    if (showHeldBillsPanel) {
      loadHeldBills();
    }
  }, [showHeldBillsPanel, loadHeldBills]);

  // Rewrite handleHoldBill to save to backend
  const handleHoldBill = async () => {
    if (items.length === 0) return;
    // Don't allow holding in scrap or return mode
    if (isScrapMode || isReturnMode || isQuotationMode) return;
    if (!window.electronAPI) {
      // Fallback for non-electron: save to localStorage
      const bill = { id: uuidv4(), heldAt: new Date().toISOString(), items: [...items], invoiceType, discountType, discountValue, customerName, customerPhone, paymentMethod, customerGstin };
      const stored = JSON.parse(localStorage.getItem('vendora-held-bills') || '[]');
      stored.push(bill);
      localStorage.setItem('vendora-held-bills', JSON.stringify(stored));
      clearCart(); updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '' }); syncActiveSnapshot();
      loadHeldBills();
      return;
    }

    // Build invoice payload similar to checkout
    const invoice_id = uuidv4();
    const invoice_number = `${tenantId?.substring(0, 4).toUpperCase() || 'POS1'}-HLD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const lineItems = items.map((item) => {
      const rate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0) ? Number(item.grade_rate) : Number(item.base_price || 0);
      const qty = Number(item.quantity) || 0;
      const catalogPriceLine = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
        : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
        : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
        : rate;
      const isAdhocOfferL = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
      const isAdhocDiscFlatL = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
      const isAdhocDiscPctL = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
      let effectiveRate = catalogPriceLine;
      if (isAdhocOfferL) {
        effectiveRate = Number(item.offer_price);
      } else if (isAdhocDiscFlatL) {
        effectiveRate = catalogPriceLine - Number(item.discount_flat);
      } else if (isAdhocDiscPctL) {
        effectiveRate = catalogPriceLine * (1 - Number(item.discount_percent) / 100);
      }
      effectiveRate = Math.max(effectiveRate, 0);
      let itemTotal = effectiveRate * qty;
      const taxAmount = invoiceType === 'GST' ? itemTotal * (item.tax_rate_percent / 100) : 0;
      return {
        item_id: uuidv4(),
        product_id: item.product_id,
        name: item.name,
        quantity: qty,
        unit_price: qty > 0 ? itemTotal / qty : rate,
        tax_amount: taxAmount,
        total: itemTotal,
        isServiceItem: item.isServiceItem ? true : false,
        pieces_sold: item.pieces_override ?? 1,
        billing_type: item.billing_type,
        uom: item.uom || item.unit
      };
    });

    const result = await window.electronAPI.dbHoldBill({
      invoice_id,
      tenant_id: tenantId || 'global',
      user_id: userId || 'unknown',
      invoice_number,
      subtotal,
      tax_total: totalTax,
      discount_total: discount,
      discount_type: discountType,
      discount_value: discountValue,
      grand_total: grandTotal,
      payment_method: paymentMethod || 'PENDING',
      split_details: paymentMethod === 'SPLIT'
        ? { ...(splitDetails || {}), upi_id: currentSelectedUpi?.upi_id, upi_name: currentSelectedUpi?.name, upi_source_id: currentSelectedUpi?.source_id }
        : (rawSplitDetails || null),
      received_amount: receivedAmount ?? 0,
      balance_amount: balanceAmount,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      customer_gstin: customerGstin || null,
      customer_state: customerState || null,
      customer_address: customerAddress || null,
      items: lineItems,
      hold_note: null,
    });

    if (!result.success) {
      setHardwareError('Failed to hold bill: ' + (result.error || 'Unknown error'));
      return;
    }

    clearCart();
    updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '' });
    syncActiveSnapshot();
    loadHeldBills();
    setInfoToast(`Bill ${invoice_number} held successfully! (F3)`);
    setTimeout(() => setInfoToast(null), 3500);
  };

  // Recall a held bill — load its items back into cart
  const handleRecallHeldBill = async (heldInvoice: any) => {
    if (!window.electronAPI) {
      const stored = JSON.parse(localStorage.getItem('vendora-held-bills') || '[]');
      const target = stored.find((b: any) => b.id === (heldInvoice.id || heldInvoice.invoice_id));
      if (target) {
        clearCart();
        if (Array.isArray(target.items)) {
          for (const item of target.items) {
            addItem(item);
            if (item.quantity) updateQuantity(item.product_id, item.quantity);
            if (item.pieces_override) updatePiecesOverride(item.product_id, item.pieces_override);
          }
        }
        updateActiveTab({
          customerName: target.customerName || '',
          customerPhone: target.customerPhone || '',
          customerGstin: target.customerGstin || '',
        });
        const remaining = stored.filter((b: any) => b.id !== (heldInvoice.id || heldInvoice.invoice_id));
        localStorage.setItem('vendora-held-bills', JSON.stringify(remaining));
        setHeldBills(remaining);
      }
      setShowHeldBillsPanel(false);
      return;
    }

    setHeldBillsLoading(true);
    try {
      const targetId = heldInvoice.invoice_id || heldInvoice.id;
      const result = await window.electronAPI.dbRecallHeldBill({ invoice_id: targetId });
      if (!result.success) {
        setHardwareError(result.error || 'Failed to recall held bill');
        return;
      }

      // Clear current cart
      clearCart();

      // Restore invoice type
      if (result.invoice?.invoice_type === 'GST' || result.invoice?.invoice_type === 'BILL_OF_SUPPLY') {
        setInvoiceType(result.invoice.invoice_type);
      }

      // Restore discount
      const effDiscValue = Number(result.invoice?.discount_value) > 0 
        ? Number(result.invoice.discount_value) 
        : (Number(result.invoice?.discount_total) > 0 ? Number(result.invoice.discount_total) : 0);
      const effDiscType = result.invoice?.discount_type || 'FIXED';
      if (effDiscValue > 0) {
        setDiscount(effDiscValue, effDiscType);
      }

      // Restore items
      if (Array.isArray(result.items)) {
        for (const item of result.items) {
          const basePrice = Number(item.base_price || item.unit_price) || 0;
          const heldUnitPrice = Number(item.unit_price) || 0;

          // Preserve exact held unit rate if it differs from MRP, or if item had custom offer price
          const restoredOfferPrice = (heldUnitPrice > 0 && Math.abs(heldUnitPrice - basePrice) > 0.001)
            ? heldUnitPrice
            : (item.offer_price ?? (heldUnitPrice > 0 ? heldUnitPrice : null));

          let comboItems: any[] | undefined = undefined;
          if (item.combo_details) {
            try {
              comboItems = JSON.parse(item.combo_details);
            } catch {}
          }

          addItem({
            product_id: item.product_id,
            name: item.name || 'Product',
            base_price: basePrice,
            purchase_price: Number(item.purchase_price) || 0,
            tax_rate_percent: Number(item.gst_percent || item.tax_rate_percent) || 0,
            billing_type: item.billing_type || 'PIECE',
            pricing_mode: item.pricing_mode || 'FIXED_PRICE',
            grade_id: item.grade_id || null,
            grade_rate: item.grade_rate || null,
            discount_percent: item.discount_percent ?? null,
            discount_flat: item.discount_flat ?? null,
            offer_price: restoredOfferPrice,
            catalog_offer_price: item.offer_price ?? null,
            sku_barcode: item.sku_barcode || null,
            brand_manufacturer: item.brand_manufacturer || null,
            isServiceItem: Boolean(item.is_service_item),
            pieces_override: item.pieces_sold != null ? Number(item.pieces_sold) : undefined,
            isCombo: Boolean(item.combo_id || comboItems),
            combo_id: item.combo_id || undefined,
            combo_items: comboItems,
            hsn_sac_code: item.hsn || item.hsn_sac_code || null,
            uom: item.uom || undefined,
          });

          const qty = Number(item.quantity) || 1;
          if (qty > 0) {
            updateQuantity(item.product_id, qty);
          }
          if (item.pieces_sold != null && Number(item.pieces_sold) > 0) {
            updatePiecesOverride(item.product_id, Number(item.pieces_sold));
          }
        }
      }

      // Parse split_details safely
      let recalledSplitDetails: any = null;
      if (result.invoice?.split_details && result.invoice.split_details !== 'null') {
        let curr = result.invoice.split_details;
        while (typeof curr === 'string') {
          try { curr = JSON.parse(curr); } catch { break; }
        }
        if (curr && typeof curr === 'object') recalledSplitDetails = curr;
      }

      // Restore customer info & split payment details
      updateActiveTab({
        customerName: result.invoice?.customer_name || '',
        customerPhone: result.invoice?.customer_phone || '',
        customerGstin: result.invoice?.customer_gstin || '',
        customerAddress: result.invoice?.customer_address || '',
        paymentMethod: (!isCashSettlementEnabled && (!result.invoice?.payment_method || result.invoice?.payment_method === 'PENDING')) ? 'CASH' : (result.invoice?.payment_method || (isCashSettlementEnabled ? 'PENDING' : 'CASH')),
        receivedAmount: Number(result.invoice?.received_amount) || 0,
        splitDetails: recalledSplitDetails || undefined,
        selectedUpiId: recalledSplitDetails?.upi_id,
        selectedUpiName: recalledSplitDetails?.upi_name,
        selectedUpiSourceId: recalledSplitDetails?.upi_source_id,
      });

      // Set customer state
      if (result.invoice?.customer_state) {
        setCustomerState(result.invoice.customer_state);
      }

      setShowHeldBillsPanel(false);
      syncActiveSnapshot();
      loadHeldBills();
      setInfoToast(`Held bill ${heldInvoice.invoice_number || ''} loaded into cart`);
      setTimeout(() => setInfoToast(null), 3500);
    } catch (e) {
      setHardwareError('Failed to recall held bill');
      console.error(e);
    } finally {
      setHeldBillsLoading(false);
    }
  };

  // Release (delete) a held bill — revert stock, mark as expired
  const handleReleaseHeldBill = async (invoiceId: string) => {
    if (!window.electronAPI) {
      const stored = JSON.parse(localStorage.getItem('vendora-held-bills') || '[]');
      const remaining = stored.filter((b: any) => b.id !== invoiceId);
      localStorage.setItem('vendora-held-bills', JSON.stringify(remaining));
      setHeldBills(remaining);
      return;
    }
    try {
      const result = await window.electronAPI.dbReleaseHeldBill({ invoice_id: invoiceId });
      if (result.success) {
        loadHeldBills();
      } else {
        setHardwareError(result.error || 'Failed to release held bill');
      }
    } catch (e) {
      setHardwareError('Failed to release held bill');
      console.error(e);
    }
  };

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
      let initialSplit: SplitDetails = { cash: 0, card: 0, upi: 0, cheque: 0, credit: 0, bank_transfer: 0 };
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

  const emptyIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );

  const renderSearchBarSection = () => (
    <div className="p-3 pb-2.5 bg-card border-b border-border">
      <div ref={searchContainerRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            {isProductSearching ? (
              <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
            ) : (
              <Search className={clsx(
                "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300",
                isScrapActive ? "text-orange-500" :
                isReturnMode ? "text-rose-500" :
                isQuotationActive ? "text-blue-500" :
                isPastBillMode ? "text-teal-500" :
                "text-muted-foreground"
              )} />
            )}
            <input
              ref={searchRef}
              type="text"
              autoFocus={uiConfig.entryFocusOrder !== 'customer-first'}
              placeholder={isScrapActive ? "Search scrap categories... (Scrap Mode)" : isReturnMode ? "Search invoices for return... (Return Mode)" : isQuotationActive ? "Search products... (Quotation Mode)" : isPastBillMode ? "Search past bills by invoice number..." : invoiceType === 'GST' ? "Search GST products or scan barcode... (Press F2)" : "Search products or scan barcode... (Press F2)"}
              value={searchQuery}
              onChange={e => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) {
                  setResults([]);
                  setScrapSearchResults([]);
                  setReturnSearchResults([]);
                  setPastBillResults([]);
                }
              }}
              onKeyDown={handleSearchKey}
              className="search-dynamic w-full pl-10 pr-9 py-2.5 bg-background rounded-xl text-sm font-medium text-foreground transition-all duration-300 placeholder:text-muted-foreground/50 focus:outline-none"
              style={{
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: isScrapActive
                  ? 'rgb(249,115,22)'
                  : isReturnMode
                  ? 'rgb(244,63,94)'
                  : isQuotationActive
                  ? 'rgb(59,130,246)'
                  : isPastBillMode
                  ? 'rgb(20,184,166)'
                  : 'hsl(var(--border))',
                boxShadow: isScrapActive
                  ? '0 0 0 3px rgba(249,115,22,0.15)'
                  : isReturnMode
                  ? '0 0 0 3px rgba(244,63,94,0.15)'
                  : isQuotationActive
                  ? '0 0 0 3px rgba(59,130,246,0.15)'
                  : isPastBillMode
                  ? '0 0 0 3px rgba(20,184,166,0.15)'
                  : undefined,
              } as React.CSSProperties}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setResults([]);
                  setScrapSearchResults([]);
                  setReturnSearchResults([]);
                  setPastBillResults([]);
                  searchRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowProductCreateForm(true); setNewProductName(searchQuery); }}
            className="flex items-center gap-1 px-3 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 cursor-pointer shadow-2xs"
            title="Create product (Press Space when search empty)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>

          {/* Past Bill Mode Toggle */}
          <button
            type="button"
            onClick={async () => {
              const next = !isPastBillMode;
              setIsPastBillMode(next);
              if (next && isScrapMode) setIsScrapMode(false);
              if (next && isReturnMode) setReturnMode(false);
              if (next && isQuotationMode) setQuotationMode(false);
              setPastBillResults([]);
              if (next) setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className={clsx(
              "flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 cursor-pointer border",
              isPastBillMode
                ? "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/40 shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border-border/40"
            )}
            title="Past Bill Lookup Mode"
          >
            <Clock className={clsx("w-3.5 h-3.5", isPastBillMode ? "text-teal-500" : "text-muted-foreground")} />
            <span>Past Bill</span>
          </button>
        </div>

        {/* Floating Search Dropdown */}
        {isPastBillMode && searchQuery.trim().length > 0 && pastBillResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-2.5 bg-teal-500/10 border-b border-border flex items-center justify-between text-xs font-semibold select-none">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="font-extrabold tracking-tight text-teal-700 dark:text-teal-300 uppercase text-[11px]">Past Bills</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                  {pastBillResults.length} Found
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">Select bill to load details</span>
            </div>
            <div ref={searchResultListRef} className="max-h-[400px] overflow-y-auto custom-scrollbar divide-y divide-border">
              {pastBillResults.map((inv: any, i: number) => (
                <button
                  key={inv.invoice_id || inv.invoice_number}
                  data-search-index={i}
                  onClick={() => {
                    handleSelectPastBill(inv);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group border-l-4",
                    selectedIndex === i
                      ? "bg-teal-500/10 border-l-teal-500 font-bold"
                      : "hover:bg-muted/50 border-l-transparent text-foreground"
                  )}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground group-hover:text-teal-600 transition-colors">{inv.invoice_number}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border uppercase">{inv.payment_method}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {inv.customer_name || 'Walk-in Customer'} {inv.customer_phone ? `(${inv.customer_phone})` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-mono font-black text-foreground block">{formatCurrency(inv.grand_total)}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">{parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 bg-muted/60 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-medium select-none">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↑</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↵ Enter</kbd>
                  <span>View Bill</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">Esc</kbd>
                <span>Close</span>
              </span>
            </div>
          </div>
        )}

        {!isPastBillMode && searchQuery.trim().length > 0 && (isScrapMode ? scrapSearchResults.length > 0 : isReturnMode ? returnSearchResults.length > 0 : results.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header Bar */}
            <div className="px-4 py-2.5 bg-muted/80 border-b border-border flex items-center justify-between text-xs font-semibold select-none">
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-extrabold tracking-tight text-foreground uppercase text-[11px]">
                  {isScrapMode ? 'Scrap Categories' : isReturnMode ? 'Returnable Invoices' : 'Search Results'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  {isScrapMode ? scrapSearchResults.length : isReturnMode ? returnSearchResults.length : results.length} Found
                </span>
              </div>
              {searchQuery && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                  <span>Matching:</span>
                  <span className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold text-xs">"{searchQuery}"</span>
                </div>
              )}
            </div>

            {/* Results List */}
            <div ref={searchResultListRef} className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-border">
              {isScrapMode ? (
                scrapSearchResults.map((cat: any, i: number) => {
                  const rate = Number(cat.purchase_price ?? cat.rate ?? cat.selling_price) || 0;
                  return (
                    <button
                      key={cat.scrap_category_id}
                      data-search-index={i}
                      onClick={() => handleSelectScrapItem(cat)}
                      className={clsx(
                        "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group border-l-4",
                        selectedIndex === i
                          ? "bg-orange-500/10 border-l-orange-500 font-bold"
                          : "hover:bg-muted/50 border-l-transparent text-foreground"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground group-hover:text-orange-600 transition-colors">{cat.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20 uppercase">Scrap</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-orange-600 dark:text-orange-400 text-sm">
                          {formatCurrency(rate)}/{cat.unit || 'Kg'}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : isReturnMode ? (
                returnSearchResults.map((inv: any, i: number) => (
                  <button
                    key={inv.invoice_id}
                    data-search-index={i}
                    onClick={() => handleSelectReturnInvoice(inv)}
                    className={clsx(
                      "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group border-l-4",
                      selectedIndex === i
                        ? "bg-rose-500/10 border-l-rose-500 font-bold"
                        : "hover:bg-muted/50 border-l-transparent text-foreground"
                    )}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground group-hover:text-rose-600 transition-colors">{inv.invoice_number}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {inv.customer_name || 'Walk-in Customer'} {inv.customer_phone ? `(${inv.customer_phone})` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm block">
                        {formatCurrency(inv.grand_total)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                results.map((p, i) => {
                  const basePrice = getTierPriceForProduct(p) ?? Number(p.base_price || 0);

                  let finalPrice: number | null = null;
                  if (p.offer_price != null && Number(p.offer_price) > 0) {
                    finalPrice = Number(p.offer_price);
                  } else if (p.discount_flat != null && Number(p.discount_flat) > 0) {
                    finalPrice = Math.max(0, basePrice - Number(p.discount_flat));
                  } else if (p.discount_percent != null && Number(p.discount_percent) > 0) {
                    finalPrice = Math.max(0, basePrice * (1 - Number(p.discount_percent) / 100));
                  }

                  const hasDiscount = finalPrice !== null && finalPrice < basePrice;
                  const displayPrice = hasDiscount ? finalPrice! : basePrice;
                  const weightUoms = ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'];
                  const isWeightProduct = p.billing_type === 'WEIGHT' || weightUoms.includes(String(p.uom || '').toLowerCase());
                  let piecesPerKg = Number(p.pieces_per_kg) || 0;
                  if (isWeightProduct && piecesPerKg <= 0 && p.domain_attributes) {
                    try {
                      const attrs = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
                      const storedPcsPerKg = Number(attrs?.pcs_per_kg) || 0;
                      const totalPcs = Number(attrs?.pcs) || 0;
                      const stockKg = Number(p.current_stock) || 0;
                      piecesPerKg = storedPcsPerKg > 0 ? storedPcsPerKg : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 0);
                    } catch {}
                  }
                  const unitPriceRows = isWeightProduct
                    ? [
                        ...(piecesPerKg > 0 ? [{ label: '/pc', base: basePrice / piecesPerKg, current: displayPrice / piecesPerKg }] : []),
                        { label: '/kg', base: basePrice, current: displayPrice },
                      ]
                    : [{ label: '/pc', base: basePrice, current: displayPrice }];

                  return (
                    <button
                      key={p.product_id}
                      data-search-index={i}
                      onClick={() => handleSelectProduct(p)}
                      className={clsx(
                        "w-full text-left px-4 py-3 transition-all duration-150 flex items-center justify-between cursor-pointer group select-none border-l-4",
                        selectedIndex === i
                          ? "bg-primary/10 border-l-primary shadow-xs font-semibold text-foreground"
                          : "hover:bg-muted/60 border-l-transparent text-foreground"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className={clsx(
                            "font-bold text-sm text-foreground transition-colors truncate",
                            selectedIndex === i ? "text-primary" : "group-hover:text-primary"
                          )}>
                            {p.name}
                          </span>
                          {p.isCombo && (
                            <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              COMBO
                            </span>
                          )}
                          {p.sku_barcode && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-sans">SKU</span>
                              {p.sku_barcode}
                            </span>
                          )}
                          {p.item_code && p.item_code !== p.sku_barcode && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                              <span className="text-[9px] uppercase tracking-wider text-primary/80 font-sans font-normal">CODE</span>
                              {p.item_code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {p.brand_manufacturer && (
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-muted-foreground">Brand:</span>
                              <span className="font-bold text-foreground">{p.brand_manufacturer}</span>
                            </span>
                          )}
                          {p.category && (
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-muted-foreground">Cat:</span>
                              <span className="text-foreground">{p.category}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end justify-center pl-2">
                        {hasDiscount ? (
                          <div className="flex flex-col items-end">
                            {unitPriceRows.map(row => (
                              <div key={row.label} className="flex items-center gap-1.5">
                                {row.current < row.base - 0.005 && (
                                  <span className="font-mono text-xs font-semibold text-muted-foreground/70 line-through">
                                    {formatCurrency(row.base)}{row.label}
                                  </span>
                                )}
                                <span className="font-mono font-black text-base text-emerald-600 dark:text-emerald-400 tracking-tight group-hover:scale-105 transition-transform">
                                  {formatCurrency(row.current)}{row.label}
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded uppercase">
                                {p.offer_price ? 'OFFER' : p.discount_percent ? `${p.discount_percent}% OFF` : 'DISCOUNT'}
                              </span>
                              {p.current_stock <= 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                                  Out of Stock
                                </span>
                              ) : p.current_stock <= 5 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            {unitPriceRows.map(row => (
                              <div key={row.label} className="font-mono font-black text-base text-foreground tracking-tight group-hover:scale-105 transition-transform">
                                {formatCurrency(row.current)}{row.label}
                              </div>
                            ))}
                            <div className="mt-1">
                              {p.current_stock <= 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                                  Out of Stock
                                </span>
                              ) : p.current_stock <= 5 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Stock: {p.current_stock} {p.uom || 'Pcs'}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Navigation Hints */}
            <div className="px-4 py-2 bg-muted/60 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-medium select-none">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↑</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">↵ Enter</kbd>
                  <span>Select Item</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-background border border-border rounded text-foreground shadow-2xs">Esc</kbd>
                <span>Close</span>
              </span>
            </div>
          </div>
        )}

        {!isPastBillMode && !isScrapMode && !isReturnMode && searchQuery.trim().length >= 2 && results.length === 0 && !showProductCreateForm && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
            <button
              type="button"
              onClick={() => { setShowProductCreateForm(true); setNewProductName(searchQuery); }}
              className="w-full text-left p-4 flex items-center justify-between hover:bg-primary/5 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                  <Plus className="w-5 h-5 shrink-0" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                    Create "<span className="text-primary font-extrabold">{searchQuery}</span>"
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Item not found. Click or press Enter to add to inventory</p>
                </div>
              </div>
              <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground shadow-sm">
                + Add Product
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderCustomerDetailsSection = () => (
    <div className="px-4 py-2.5 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1" ref={customerNameContainerRef}>
          <User className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-slate-600 dark:text-slate-400')} />
          <input
            ref={customerNameInputRef}
            autoFocus={uiConfig.entryFocusOrder === 'customer-first'}
            placeholder={isB2B ? "Customer Name * [F4]" : "Customer Name [F4]"}
            value={customerName}
            onFocus={() => {
              if (!skipCustomerDropdownOnFocusRef.current && (customerName.trim() || customerPhone.trim())) {
                setShowCustomerDropdown(true);
              }
            }}
            onChange={e => {
              const val = e.target.value;
              if (!val.trim() && !customerPhone.trim()) {
                updateActiveTab({ customerId: '', customerName: '', customerAddress: '', customerGstin: '', isStaffCustomer: false, staffId: undefined });
                setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
                setShowCustomerDropdown(false);
              } else {
                updateActiveTab({ customerName: val });
                setShowCustomerDropdown(true);
                setSelectedCustomerIndex(0);
              }
            }}
            onKeyDown={handleCustomerNameKeyDown}
            className={clsx(
              'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground font-semibold placeholder:font-normal placeholder:text-muted-foreground/60 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all duration-300',
              paymentMethod === 'CREDIT'
                ? 'border-amber-400 bg-amber-500/5 dark:bg-amber-950/30 dark:border-amber-500/60 focus:ring-amber-500/30 focus:border-amber-500'
                : (isB2B && !isQuotationMode && !isReturnMode && !isScrapMode && !customerName.trim())
                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-border focus:ring-primary/20 focus:border-primary'
            )}
          />
          {activeTab?.isStaffCustomer && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800 pointer-events-none select-none">
              STAFF
            </span>
          )}
          {showCustomerDropdown && (customerName.trim() || customerPhone.trim()) && filteredCustomerSuggestions.length > 0 && (
            <div ref={customerDropdownRef} className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div ref={customerListRef} className="max-h-[220px] overflow-y-auto divide-y divide-border/60 custom-scrollbar">
                {filteredCustomerSuggestions.slice(0, 15).map((c, index) => (
                  <button
                    key={c.is_staff ? `staff-${c.staff_id || index}` : (c.customer_id || c.party_id || c.phone || index)}
                    data-customer-index={index}
                    type="button"
                    onClick={() => selectCustomerSuggestion(c)}
                    className={clsx(
                      "w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border dark:border-slate-800 last:border-0 cursor-pointer transition-colors",
                      index === selectedCustomerIndex
                        ? "bg-primary/15 text-primary font-bold dark:bg-primary/25"
                        : "hover:bg-muted/60 dark:hover:bg-slate-800/60"
                    )}
                  >
                    {c.is_staff ? (
                      <div className="w-5 h-5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <User className={clsx("w-4 h-4 shrink-0 transition-colors", index === selectedCustomerIndex ? "text-primary dark:text-blue-300" : "text-muted-foreground dark:text-gray-400")} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={clsx("text-xs font-bold truncate transition-colors", index === selectedCustomerIndex ? "text-primary dark:text-blue-300" : "text-slate-900 dark:text-gray-100")}>{c.name}</span>
                        {c.is_staff && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black tracking-wider uppercase bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            STAFF
                          </span>
                        )}
                      </div>
                      <div className={clsx("text-[10px] transition-colors", index === selectedCustomerIndex ? "text-primary/80 dark:text-blue-300/80" : "text-muted-foreground dark:text-gray-400")}>
                        {c.is_staff
                          ? [c.staff_code ? `Code: ${c.staff_code}` : null, c.role_designation, c.phone].filter(Boolean).join(' • ')
                          : (c.phone || c.address || 'No phone/address')}
                      </div>
                    </div>
                    {!c.is_staff && Number(c.current_points_balance) > 0 && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">{Number(c.current_points_balance).toFixed(0)} pts</span>
                    )}
                    {c.balance != null && Number(c.balance) !== 0 && (
                      <span className={clsx("text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded", Number(c.balance) > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                        {c.is_staff ? (Number(c.balance) < 0 ? `Owes: ₹${Math.abs(Number(c.balance)).toFixed(2)}` : `Bal: ₹${Number(c.balance).toFixed(2)}`) : `Bal: ₹${Math.abs(Number(c.balance)).toFixed(2)}`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative flex-1 min-w-0">
          <Phone className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-slate-600 dark:text-slate-400')} />
          <input
            ref={customerPhoneInputRef}
            placeholder={isB2B ? "Phone *" : "Phone Number"}
            value={customerPhone}
            onFocus={() => {
              if (!skipCustomerDropdownOnFocusRef.current && (customerName.trim() || customerPhone.trim())) {
                setShowCustomerDropdown(true);
              }
            }}
            onChange={e => {
              const val = e.target.value;
              if (!val.trim() && !customerName.trim()) {
                updateActiveTab({ customerId: '', customerPhone: '', customerAddress: '', customerGstin: '', isStaffCustomer: false, staffId: undefined });
                setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
                setShowCustomerDropdown(false);
              } else {
                updateActiveTab({ customerPhone: val });
                setShowCustomerDropdown(true);
                setSelectedCustomerIndex(0);
              }
            }}
            onKeyDown={handleCustomerPhoneKeyDown}
            className={clsx(
              'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground font-semibold placeholder:font-normal placeholder:text-muted-foreground/60 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all duration-300',
              paymentMethod === 'CREDIT'
                ? 'border-amber-400 bg-amber-500/5 dark:bg-amber-950/30 dark:border-amber-500/60 focus:ring-amber-500/30 focus:border-amber-500'
                : (isB2B && !isQuotationMode && !isReturnMode && !isScrapMode && !customerPhone.trim())
                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-border focus:ring-primary/20 focus:border-primary'
            )}
          />
        </div>
        <CustomerOutstandingBadge partyObj={(() => {
          const p = findMatchingParty(customerName, customerPhone);
          if (!p) return null;
          const key = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
          const isStaff = String(p.party_type || '').toUpperCase() === 'STAFF';
          const contribution = editingActive && !isStaff && activeTab?.editingInvoicePartyKey === key
            ? (Number(activeTab?.editingInvoiceContribution) || 0)
            : 0;
          return { name: p.name, phone: p.phone, balance: (Number(p.balance) || 0) - contribution };
        })()} />
        {loyaltyEnabled && !isScrapMode && !isQuotationMode && (loyaltyCustomerData.customerId || (customerPhone && customerPhone.trim())) && (
          <div className="flex items-center shrink-0">
            <div
              className="h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 shadow-2xs whitespace-nowrap"
              title={`Customer Loyalty Balance: ${(Number(loyaltyCustomerData?.pointsBalance) || 0).toFixed(0)} points`}
            >
              <span className="font-extrabold text-[11px] uppercase tracking-wider opacity-90">Points:</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-black bg-emerald-600 text-white shadow-2xs">
                {(Number(loyaltyCustomerData?.pointsBalance) || 0).toFixed(0)} pts
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Credit Limit Warning Banner */}
      {(() => {
        if (paymentMethod !== 'CREDIT' && !(paymentMethod === 'SPLIT' && Number(splitDetails.credit) > 0)) return null;
        const party = findMatchingParty(customerName, customerPhone);
        if (!party || !(Number(party.credit_limit) > 0)) return null;
        const limit = Number(party.credit_limit);
        const key = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
        const isStaff = String(party.party_type || '').toUpperCase() === 'STAFF';
        const editingContribution = editingActive && !isStaff && activeTab?.editingInvoicePartyKey === key
          ? (Number(activeTab?.editingInvoiceContribution) || 0)
          : 0;
        const currentBal = (Number(party.balance) || 0) - editingContribution;
        const splitPaid = (Number(splitDetails.cash) || 0)
          + (Number(splitDetails.card) || 0)
          + (Number(splitDetails.upi) || 0)
          + (Number(splitDetails.cheque) || 0)
          + (Number(splitDetails.bank_transfer) || 0);
        const billCredit = paymentMethod === 'CREDIT'
          ? Math.max(0, displayGrandTotal - (Number(receivedAmount) || 0))
          : Math.max(0, displayGrandTotal - splitPaid);
        const projected = currentBal + billCredit;
        const available = Math.max(0, limit - currentBal);
        const exceeded = projected > limit;
        const excess = exceeded ? projected - limit : 0;
        const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div className={`mb-2 rounded-xl px-3 py-2 border text-xs flex flex-col gap-1 transition-all duration-300 ${
            exceeded
              ? 'border-red-400 bg-red-500/10 text-red-700 dark:text-red-400'
              : 'border-amber-400 bg-amber-500/8 text-amber-700 dark:text-amber-400'
          }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold flex items-center gap-1">
                {exceeded ? '🚫' : '💳'} Credit Limit: ₹{fmtN(limit)}
              </span>
              <span className="font-semibold">Current Bal: ₹{fmtN(currentBal)}</span>
              <span className="font-semibold">Bill Credit: ₹{fmtN(billCredit)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-current/20 pt-1 font-extrabold">
              <span>Projected Total: ₹{fmtN(projected)}</span>
              {exceeded ? (
                <span className="text-red-600 dark:text-red-300 underline">EXCEEDS LIMIT BY ₹{fmtN(excess)}!</span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400">Available: ₹{fmtN(available - billCredit)}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Real-time Credit Period & Overdue Status Warning Banner */}
      {(() => {
        const party = findMatchingParty(customerName, customerPhone);
        if (!party || !(party as any).credit_period_enabled) return null;
        const isCreditTx = paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && Number(splitDetails.credit) > 0);
        const hasOverdue = Boolean((party as any).has_overdue);
        const isRestricted = (party as any).restrict_on_credit_expiry !== false && (party as any).restrict_on_credit_expiry !== 0;
        const overdueCount = (party as any).overdue_bills_count || 0;
        const overdueAmt = Number((party as any).overdue_amount || 0);
        const creditDays = (party as any).credit_period_days || 30;
        const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (hasOverdue) {
          return (
            <div className={`mb-2 rounded-xl px-3 py-2 border text-xs flex flex-col gap-1 transition-all duration-300 ${
              isCreditTx && isRestricted
                ? 'border-rose-500 bg-rose-500/15 text-rose-800 dark:text-rose-300 shadow-xs'
                : 'border-amber-400 bg-amber-500/10 text-amber-800 dark:text-amber-300'
            }`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-extrabold flex items-center gap-1">
                  ⚠️ Overdue Payment Alert ({overdueCount} bill{overdueCount !== 1 ? 's' : ''})
                </span>
                <span className="font-mono font-bold">Total Overdue: ₹{fmtN(overdueAmt)}</span>
              </div>
              <p className="text-[11px] font-semibold leading-snug">
                {isCreditTx && isRestricted ? (
                  <span className="text-rose-700 dark:text-rose-400 font-extrabold">
                    🚫 Further credit purchases are restricted for this customer until overdue bills are settled. Switch to Cash/Card/UPI.
                  </span>
                ) : (
                  <span>
                    Customer has {overdueCount} bill(s) past the {creditDays}-day credit period. {isCreditTx ? 'Credit purchase is permitted under owner policy.' : ''}
                  </span>
                )}
              </p>
            </div>
          );
        }

        if (isCreditTx) {
          const projectedDueDate = new Date();
          projectedDueDate.setDate(projectedDueDate.getDate() + creditDays);
          const dueStr = projectedDueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            <div className="mb-2 rounded-xl px-3 py-1.5 border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs flex items-center justify-between gap-2">
              <span className="font-bold flex items-center gap-1">
                ⏳ Credit Period: {creditDays} Days
              </span>
              <span className="font-mono font-semibold text-[11px]">Payment Due By: {dueStr}</span>
            </div>
          );
        }

        return null;
      })()}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          <input
            ref={customerAddressInputRef}
            placeholder={isB2B ? "Customer Address *" : "Customer Address"}
            value={customerAddress}
            onChange={e => updateActiveTab({ customerAddress: e.target.value })}
            onKeyDown={handleCustomerAddressKeyDown}
            className={clsx(
              'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground font-semibold placeholder:font-normal placeholder:text-muted-foreground/60 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all duration-300',
              (isB2B && !isQuotationMode && !isReturnMode && !isScrapMode && !customerAddress.trim())
                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-border focus:ring-primary/20 focus:border-primary'
            )}
          />
        </div>
        {pricingTiers.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Select
              size="sm"
              triggerClassName="h-auto py-2"
              className="w-40 sm:w-44"
              value={selectedTierId}
              onChange={v => { if (canOverrideTier) handlePricingTierChange(v); }}
              options={pricingTiers.map(t => {
                const isMrp = t.is_mrp || t.pricing_tier_id === '' || t.pricing_tier_id === MRP_TIER_ID;
                const labelText = isMrp ? 'MRP' : t.name;
                const isDefault = t.is_default === 1 || t.is_default === true || t.is_default === '1';
                return {
                  value: isMrp ? '' : t.pricing_tier_id,
                  label: isDefault ? `⭐ ${labelText}` : labelText
                };
              })}
              disabled={!canOverrideTier}
            />
            {!canOverrideTier && (
              <span className="text-[10px] text-muted-foreground shrink-0" title="Owner has disabled biller price overrides">🔒 locked</span>
            )}
          </div>
        )}
        <SingleDatePicker
          value={activeTab?.billDate}
          onChange={val => updateActiveTab({ billDate: val })}
          isEditing={Boolean(editingActive)}
          align="right"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border">
          <button
            onClick={() => handleInvoiceTypeChange('BILL_OF_SUPPLY')}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
              invoiceType === 'BILL_OF_SUPPLY'
                ? 'bg-card text-foreground shadow-sm border border-border/20'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Bill of Supply
          </button>
          <button
            onClick={() => handleInvoiceTypeChange('GST')}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
              invoiceType === 'GST'
                ? 'bg-card text-foreground shadow-sm border border-border/20'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            GST Invoice
          </button>
        </div>
        {invoiceType === 'GST' && (
          <div className="flex items-center gap-2 flex-1">
              <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    updateActiveTab({ isB2B: false, customerGstin: '' });
                    if (enableThreeInvoiceSeries) {
                      window.electronAPI?.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series: 'gst_b2c' }).then(result => {
                        if (result.success && result.invoiceNumber) {
                          updateActiveTab({ reservedInvoiceNumber: result.invoiceNumber, title: result.invoiceNumber });
                        }
                      });
                    }
                  }}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap',
                    !isB2B
                      ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-sm border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="B2C Consumer GST Invoice (Customer Name, Phone & Address optional)"
                >
                  B2C
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateActiveTab({ isB2B: true });
                    if (enableThreeInvoiceSeries) {
                      window.electronAPI?.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series: 'gst_b2b' }).then(result => {
                        if (result.success && result.invoiceNumber) {
                          updateActiveTab({ reservedInvoiceNumber: result.invoiceNumber, title: result.invoiceNumber });
                        }
                      });
                    }
                    setTimeout(() => customerGstinInputRef.current?.focus(), 50);
                  }}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap',
                    isB2B
                      ? 'bg-card text-blue-600 dark:text-blue-400 shadow-sm border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="B2B Business Tax Invoice (Customer Name, Phone, Address & GSTIN required)"
                >
                  B2B
                </button>
              </div>
              <div className="flex-1">
                <Select size="sm" triggerClassName="h-auto" value={customerState} onChange={setCustomerState} options={INDIAN_STATES.map(s => ({value:s.code,label:s.name+' ('+s.code+')'}))} className="w-full" />
              </div>
              <div className="relative flex-1">
                <Building className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <input
                  ref={customerGstinInputRef}
                  placeholder={isB2B ? "GSTIN *" : "GSTIN (optional)"}
                  value={customerGstin}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    updateActiveTab({ customerGstin: val, isB2B: Boolean(val.trim()) || isB2B });
                  }}
                  onKeyDown={handleCustomerGstinKeyDown}
                  maxLength={15}
                  className={clsx(
                    "w-full pl-7 pr-2 py-1 bg-background border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 uppercase",
                    (isB2B && !customerGstin.trim())
                      ? "border-rose-400 dark:border-rose-700 focus:ring-rose-500/20"
                      : "border-border focus:ring-primary/20"
                  )}
                />
              </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderErpGridB2CWorkspace = () => {
    const selectedParty = findMatchingParty(customerName, customerPhone);
    const uiPartyKey = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
    const uiIsStaffParty = String(selectedParty?.party_type || '').toUpperCase() === 'STAFF';
    const uiEditingContribution = editingActive && !uiIsStaffParty && activeTab?.editingInvoicePartyKey === uiPartyKey
      ? (Number(activeTab?.editingInvoiceContribution) || 0)
      : 0;
    const partyBalance = selectedParty ? (Number(selectedParty.balance) || 0) - uiEditingContribution : 0;
    
    // Focused row item for live stock row indicator
    const activeRowItem = items.find(i => i.product_id === focusedRowProductId) || items[items.length - 1];
    const activeStockDisplay = activeRowItem ? (activeRowItem.current_stock != null ? String(activeRowItem.current_stock) : '—') : '0.00';

    // Sum calculations for footer row
    let totQty = 0;
    let totExcl = 0;
    let totDisc = 0;
    let totSgst = 0;
    let totCgst = 0;
    let totIgst = 0;
    let totNet = 0;

    const coolyVal = Number(erpCooly) || 0;
    const freightVal = Number(erpFreight) || 0;
    const netPayableWithAddons = grandTotal + coolyVal + freightVal;
    const changeDue = Math.max(0, Number(receivedAmount || 0) - netPayableWithAddons);
    const balDue = Math.max(0, netPayableWithAddons - Number(receivedAmount || 0));

    return (
      <div className="flex flex-col flex-1 overflow-hidden bg-background">
        
        {/* ─── ERP TOP HEADER FORM METADATA PANEL ─── */}
        <div className="bg-card border-b border-border px-5 py-3 shrink-0 shadow-xs">
          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            {/* Invoice No */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Invoice No</label>
              <input
                type="text"
                readOnly
                value={editingActive ? (editingInvoiceNumber || '') : `${(invoiceType === 'GST' && !enableThreeInvoiceSeries) ? 'GST-' : ''}${nextInvoiceNumber || '6019'}`}
                className="w-full px-2.5 py-1.5 bg-muted/50 border border-border rounded-lg font-mono font-bold text-primary text-xs"
              />
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">
                Date
              </label>
              <SingleDatePicker
                value={activeTab?.billDate}
                onChange={val => updateActiveTab({ billDate: val })}
                isEditing={Boolean(editingActive)}
                triggerClassName="w-full py-1.5"
                align="left"
              />
            </div>

            {/* Party / Bill To */}
            <div className="space-y-1 col-span-1 sm:col-span-2 relative">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Party / Bill To</label>
              <div className="relative">
                <input
                  ref={customerNameInputRef}
                  placeholder="Select Party / Customer Name [F4]"
                  value={customerName}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onChange={e => {
                    const val = e.target.value;
                    updateActiveTab({ customerName: val });
                    applyPartyTier(val, customerPhone);
                    setShowCustomerDropdown(true);
                  }}
                  className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 text-xs"
                />
              </div>
            </div>

            {/* GST No */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">GST No</label>
              <input
                ref={customerGstinInputRef}
                placeholder="GSTIN Number"
                value={customerGstin}
                onChange={e => updateActiveTab({ customerGstin: e.target.value.toUpperCase() })}
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-mono uppercase text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Price Tier */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Price Mode</label>
              <Select
                size="sm"
                triggerClassName="h-8 py-1"
                className="w-full"
                value={selectedTierId}
                onChange={v => { if (canOverrideTier) handlePricingTierChange(v); }}
                options={pricingTiers.map(t => {
                  const isMrp = t.is_mrp || t.pricing_tier_id === '' || t.pricing_tier_id === MRP_TIER_ID;
                  const labelText = isMrp ? 'MRP' : t.name;
                  return {
                    value: isMrp ? '' : t.pricing_tier_id,
                    label: labelText
                  };
                })}
              />
            </div>

            {/* Description / Bill Notes */}
            <div className="space-y-1 col-span-1 sm:col-span-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Description / Notes</label>
              <input
                type="text"
                placeholder="Bill Description / Remarks"
                value={activeTab?.description || ''}
                onChange={e => updateActiveTab({ description: e.target.value })}
                onKeyDown={e => e.stopPropagation()}
                onKeyUp={e => e.stopPropagation()}
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-medium text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Rep / Salesperson */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Rep / Salesperson</label>
              <input
                type="text"
                value={erpSalesRep}
                onChange={e => setErpSalesRep(e.target.value)}
                placeholder="Sales Rep Name"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-medium text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Narration */}
            <div className="space-y-1 col-span-1 sm:col-span-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Narration / Notes</label>
              <input
                type="text"
                value={erpNarration}
                onChange={e => setErpNarration(e.target.value)}
                placeholder="Remarks or invoice terms..."
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-medium text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        {/* ─── SEARCH & BARCODE INPUT HEADER ─── */}
        <div className="px-5 py-2.5 bg-card/60 border-b border-border shrink-0 relative z-30">
          {renderSearchBarSection()}
        </div>

        {/* ─── FULL WIDTH SPREADSHEET ERP ITEM TABLE ─── */}
        <div className="flex-1 overflow-auto bg-background p-3">
          <div className="border border-border rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-700 text-white font-extrabold uppercase text-[10px] tracking-wider select-none border-b border-emerald-800">
                  <th className="py-2.5 px-2 text-center w-10">Sl.No.</th>
                  <th className="py-2.5 px-2.5 w-24">Barcode</th>
                  <th className="py-2.5 px-2.5 w-24">Item Code</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-2.5 text-center w-16">Qty</th>
                  <th className="py-2.5 px-2.5 text-right w-20">Rate</th>
                  <th className="py-2.5 px-2.5 text-right w-20">Rate (Incl)</th>
                  <th className="py-2.5 px-2.5 text-right w-24">Total</th>
                  <th className="py-2.5 px-2.5 text-right w-16">Disc</th>
                  <th className="py-2.5 px-2.5 text-right w-16">SGST</th>
                  <th className="py-2.5 px-2.5 text-right w-16">CGST</th>
                  <th className="py-2.5 px-2.5 text-right w-16">IGST</th>
                  <th className="py-2.5 px-3 text-right w-28">Net Amount</th>
                  <th className="py-2.5 px-2 text-center w-10">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-semibold text-foreground">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-muted-foreground italic">
                      No line items added yet. Search products or scan barcode above to populate ERP invoice table.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const isFocusedRow = item.product_id === (focusedRowProductId || lastAddedProductId);
                    const qty = Number(item.quantity) || 0;
                    const baseRate = Number(item.offer_price ?? item.base_price) || 0;
                    const taxRatePct = Number(item.tax_rate_percent ?? (invoiceType === 'GST' ? 18 : 0));
                    const isInterState = Boolean(customerState && shopDomain && customerState !== shopDomain);
                    
                    const exclTotal = baseRate * qty;
                    const taxAmountTotal = exclTotal * (taxRatePct / 100);
                    const inclTotal = exclTotal + taxAmountTotal;
                    const rateIncl = baseRate * (1 + taxRatePct / 100);

                    const sgstVal = invoiceType === 'GST' && !isInterState ? taxAmountTotal / 2 : 0;
                    const cgstVal = invoiceType === 'GST' && !isInterState ? taxAmountTotal / 2 : 0;
                    const igstVal = invoiceType === 'GST' && isInterState ? taxAmountTotal : 0;
                    const discVal = Number(item.discount_flat || 0);

                    totQty += qty;
                    totExcl += exclTotal;
                    totDisc += discVal;
                    totSgst += sgstVal;
                    totCgst += cgstVal;
                    totIgst += igstVal;
                    totNet += inclTotal - discVal;

                    return (
                      <tr
                        key={item.product_id}
                        onClick={() => setFocusedRowProductId(item.product_id)}
                        className={clsx(
                          "transition-colors cursor-pointer text-xs",
                          idx % 2 === 0 ? "bg-emerald-500/5 dark:bg-emerald-950/20" : "bg-card",
                          isFocusedRow ? "bg-emerald-500/20 font-bold ring-1 ring-emerald-500/50" : "hover:bg-emerald-500/10"
                        )}
                      >
                        <td className="py-2 px-2 text-center font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="py-2 px-2.5 font-mono text-xs">{item.sku_barcode || '—'}</td>
                        <td className="py-2 px-2.5 font-mono text-xs text-muted-foreground">{item.item_code || '—'}</td>
                        <td className="py-2 px-3 font-bold text-foreground">
                          {item.name}
                          {item.isServiceItem && <span className="ml-2 text-[9px] px-1 py-0.2 bg-violet-500/20 text-violet-600 rounded">SRV</span>}
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <input
                            ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                            type="number"
                            step="any"
                            min="1"
                            value={qty}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => handleQtyKeyDown(e, item.product_id)}
                            onChange={(e) => updateQuantity(item.product_id, Number(e.target.value) || 1)}
                            className="w-14 text-center bg-background border border-border rounded px-1 py-0.5 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono">₹{baseRate.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{rateIncl.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono">₹{exclTotal.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-emerald-600">₹{discVal.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{sgstVal.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{cgstVal.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{igstVal.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-mono font-black text-emerald-700 dark:text-emerald-400">
                          ₹{(inclTotal - discVal).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeItem(item.product_id); }}
                            className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Table Footer Status & Column Totals */}
            <div className="bg-emerald-950 text-emerald-100 font-mono text-xs px-4 py-2 border-t border-emerald-800 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <span className="font-extrabold text-amber-400 uppercase tracking-wider text-[11px]">
                  Stock: <strong className="text-white font-mono">{activeStockDisplay}</strong>
                </span>
                <span className="text-emerald-400/80">|</span>
                <span className="font-bold text-[11px]">Total Items: {items.length}</span>
              </div>

              <div className="flex items-center gap-5 text-right font-extrabold">
                <span>Total Qty: <strong className="text-white">{totQty}</strong></span>
                <span>Excl: <strong className="text-white">₹{totExcl.toFixed(2)}</strong></span>
                <span>SGST: <strong className="text-white">₹{totSgst.toFixed(2)}</strong></span>
                <span>CGST: <strong className="text-white">₹{totCgst.toFixed(2)}</strong></span>
                <span>IGST: <strong className="text-white">₹{totIgst.toFixed(2)}</strong></span>
                <span className="text-amber-300 text-sm">Net Amount: <strong className="text-amber-400">₹{totNet.toFixed(2)}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── BOTTOM ERP SETTLEMENT CONSOLE ─── */}
        <div className="bg-card border-t-2 border-border px-5 py-3 shrink-0 shadow-lg space-y-2.5">
          
          {/* Top Row: Payment Method Selector + Deductions */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-3 py-2 rounded-xl border border-border/60 text-xs font-bold">
            
            {/* Payment Method Options */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">Payment Method:</span>
              {[
                { value: 'CASH', label: 'Cash', icon: Banknote },
                { value: 'UPI', label: 'UPI / QR', icon: QrCode },
                { value: 'CARD', label: 'Card', icon: CreditCard },
                { value: 'CREDIT', label: 'Credit', icon: BookOpen },
                { value: 'PENDING', label: 'Pending', icon: Clock },
              ].map((opt) => {
                const isActive = paymentMethod === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateActiveTab({ paymentMethod: opt.value as PaymentMethod })}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background text-foreground border-border hover:bg-muted/60"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Deduction Section (Scrap, Return & Points Credits) */}
            {(isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled || storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">Deduction:</span>
                {(isScrapModuleEnabled || storeScrapDeduction > 0) && (
                  storeScrapDeduction > 0 ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 rounded-lg text-xs font-bold">
                      <Recycle className="w-3.5 h-3.5" />
                      <span>Scrap: -{formatCurrency(storeScrapDeduction)}</span>
                      <button type="button" onClick={() => clearScrapDeduction()} className="hover:text-destructive p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        ref={scrapDeductionInputRef}
                        type="text"
                        placeholder="Scrap # & Enter"
                        value={scrapDeductionSearchQuery}
                        onChange={e => setScrapDeductionSearchQuery(e.target.value.toUpperCase())}
                        onKeyDown={async e => {
                          if (e.key === 'Enter') {
                            const q = scrapDeductionSearchQuery.trim();
                            if (!q) return;
                            try {
                              const res = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: q });
                              if (res && res.totalAmount) {
                                if (res.paymentStatus === 'SETTLED') {
                                  setHardwareError(`Scrap credit ${q} already redeemed.`);
                                  return;
                                }
                                setScrapDeduction(res.totalAmount, q);
                                setScrapDeductionSearchQuery('');
                              } else {
                                setHardwareError(`Scrap invoice "${q}" not found`);
                              }
                            } catch {
                              setHardwareError('Failed to fetch scrap invoice');
                            }
                          }
                        }}
                        className="w-32 px-2.5 py-1 bg-background border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                      />
                    </div>
                  )
                )}

                {(isReturnModuleEnabled || storeReturnDeduction > 0) && (
                  storeReturnDeduction > 0 ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Return: -{formatCurrency(storeReturnDeduction)}</span>
                      <button type="button" onClick={() => clearReturnDeduction()} className="hover:text-destructive p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        ref={returnDeductionInputRef}
                        type="text"
                        placeholder="Return # & Enter"
                        value={returnDeductionSearchQuery}
                        onChange={e => setReturnDeductionSearchQuery(e.target.value.toUpperCase())}
                        onKeyDown={async e => {
                          if (e.key === 'Enter') {
                            const q = returnDeductionSearchQuery.trim();
                            if (!q) return;
                            try {
                              const res = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: q });
                              if (res && res.grand_total) {
                                const remaining = res.grand_total - (res.adjusted_amount || 0);
                                if (remaining > 0) {
                                  setReturnDeduction(remaining, q);
                                  setReturnDeductionSearchQuery('');
                                } else {
                                  setHardwareError('Return already fully adjusted');
                                }
                              } else {
                                setHardwareError(`Return "${q}" not found`);
                              }
                            } catch {
                              setHardwareError('Failed to fetch return');
                            }
                          }
                        }}
                        className="w-32 px-2.5 py-1 bg-background border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                      />
                    </div>
                  )
                )}

                {isLoyaltyModuleEnabled && (
                  pointsRedeemedDiscountCalc > 0 ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold">
                      <Coins className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Loyalty ({pointsRedeemedCalc} pts): -{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                      <button type="button" onClick={() => { setPointsToRedeem(0); }} className="hover:text-destructive p-0.5 cursor-pointer" title="Remove Loyalty Discount">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={customerPointsBalance > 0 ? `Pts (Max ${customerPointsBalance})` : "Pts: 0"}
                        disabled={customerPointsBalance <= 0}
                        value={pointsToRedeem > 0 ? pointsToRedeem : ''}
                        onChange={e => {
                          const clean = e.target.value.replace(/\D/g, '');
                          const num = clean === '' ? 0 : Number(clean);
                          const val = Math.max(0, Math.min(num, customerPointsBalance));
                          setPointsToRedeem(clean === '' ? 0 : val);
                        }}
                        className="w-28 px-2 py-1 bg-background border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {customerPointsBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => setPointsToRedeem(customerPointsBalance)}
                          className="px-1.5 py-1 text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-md border border-emerald-500/20 cursor-pointer"
                        >
                          Max
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

          </div>

          {/* Bottom Row: Totals, Old Balance, Settlement & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/20 px-3 py-2.5 rounded-xl border border-border">
            
            <div className="flex items-center gap-5 text-xs font-bold flex-wrap">
              {/* Old Balance */}
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Old Balance</div>
                <div className={clsx("font-mono font-black text-xs mt-0.5", partyBalance > 0 ? "text-rose-600" : "text-muted-foreground/80")}>
                  {partyBalance > 0 ? `₹${partyBalance.toFixed(2)}` : '-'}
                </div>
              </div>

              <div className="h-7 w-px bg-border/80" />

              {/* Discount % */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Discount %</div>
                <input
                  ref={discountRef}
                  type="number"
                  step="any"
                  value={discountValue || ''}
                  onChange={e => setDiscount(Number(e.target.value) || 0, 'PERCENTAGE')}
                  placeholder="0.00 %"
                  className="w-20 px-2 py-1 bg-background border border-border rounded font-mono font-bold text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="h-7 w-px bg-border/80" />

              {/* Cash Received */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Cash Recd</div>
                <input
                  ref={receivedInputRef}
                  type="number"
                  step="any"
                  value={receivedAmount || ''}
                  onChange={e => updateActiveTab({ receivedAmount: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-24 px-2 py-1 bg-background border border-border rounded font-mono font-bold text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="h-7 w-px bg-border/80" />

              {/* Net Payable */}
              <div>
                <div className="flex items-center gap-1">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Net Payable</div>
                  {isGrandTotalOverridden && (
                    <span className="text-[8px] font-extrabold text-amber-600 bg-amber-500/15 px-1 py-0.2 rounded">Overridden</span>
                  )}
                </div>
                <div
                  className="font-mono text-base font-black text-primary cursor-pointer hover:underline"
                  onClick={startEditingTotal}
                  title="Click to edit total"
                >
                  ₹{displayGrandTotal.toFixed(2)}
                </div>
              </div>

              {/* Balance / Change */}
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Balance / Change</div>
                <div className={clsx("font-mono font-bold text-xs mt-0.5", balanceAmount >= 0 ? "text-emerald-600" : "text-amber-600")}>
                  ₹{Math.abs(balanceAmount).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCheckout(true)}
                disabled={isCheckingOut || items.length === 0}
                className="px-4 py-2.5 rounded-xl border-2 border-emerald-600/60 text-emerald-700 dark:text-emerald-400 font-black text-xs hover:bg-emerald-500/10 transition-all cursor-pointer shadow-xs uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => handleCheckout()}
                disabled={isCheckingOut || items.length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 transition-all cursor-pointer shadow-md uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>PRINT (F12)</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* ─── FLOATING TOASTS ─── */}
      <div className="fixed bottom-5 left-5 z-[9999] flex flex-col items-start gap-2.5 w-full max-w-md pointer-events-none">
        {hardwareError && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className="p-2 rounded-xl bg-red-500/25 text-red-400 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">HARDWARE & PRINT ALERT</span>
              <span className="text-white font-bold text-xs block leading-tight">{hardwareError}</span>
            </div>
          </div>
        )}
        {checkoutSuccess && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className="p-2 rounded-xl bg-emerald-500/25 text-emerald-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">CHECKOUT COMPLETE</span>
              <span className="text-white font-bold text-xs block leading-tight">{checkoutSuccess === 'printed' ? 'Invoice completed & Receipt printed!' : 'Invoice saved successfully!'}</span>
            </div>
          </div>
        )}
        {quotationSuccess && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className="p-2 rounded-xl bg-blue-500/25 text-blue-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">QUOTATION SAVED</span>
              <span className="text-white font-bold text-xs block leading-tight">{quotationSuccess}</span>
            </div>
          </div>
        )}
        {returnSuccessToast && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className="p-2 rounded-xl bg-rose-500/25 text-rose-400 shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">RETURN PROCESSED</span>
              <span className="text-white font-bold text-xs block leading-tight">{returnSuccessToast}</span>
            </div>
          </div>
        )}
        {infoToast && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
            <div className="p-2 rounded-xl bg-amber-500/25 text-amber-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">NOTIFICATION</span>
              <span className="text-white font-bold text-xs block leading-tight">{infoToast}</span>
            </div>
          </div>
        )}
        {upiAccountToast && (
          <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto max-w-sm">
            <div className="p-2 rounded-xl bg-violet-500/25 text-violet-400 shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 leading-snug">
              <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">UPI Account Selected</span>
              <span className="text-white font-black text-xs truncate block">{upiAccountToast}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── TOP HEADER ─── */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                if (isAdminRole(authRole)) setRole('ADMIN');
                window.dispatchEvent(new CustomEvent('open-dashboard'));
              }}
              className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
              title="Return to Dashboard"
            >
              <Store className="w-4 h-4" />
            </button>
            <div className="min-w-0 leading-tight select-none" data-panic-click="true" data-panic-target="LOGO">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground truncate block">{shopName || 'Billing Terminal'}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={clsx(
                'text-xs font-bold font-mono px-2 py-0.5 rounded-md border shrink-0 min-w-[90px] text-center',
                isReturnMode
                  ? 'text-rose-600 bg-rose-500/10 border-rose-500/20'
                  : isScrapMode
                    ? 'text-orange-600 bg-orange-500/10 border-orange-500/20'
                    : isQuotationMode
                      ? 'text-blue-600 bg-blue-500/10 border-blue-500/20'
                      : 'text-primary bg-primary/10 border-primary/20'
              )}>
                {isReturnMode ? (nextReturnNumber || '') : isScrapMode ? (nextScrapInvoiceNumber || '') : isQuotationMode ? (nextQuotationNumber || '') : (editingActive ? (editingInvoiceNumber || '') : `${(invoiceType === 'GST' && !enableThreeInvoiceSeries) ? 'GST-' : ''}${nextInvoiceNumber || ''}`)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isHeaderButtonVisible(uiConfig, 'showClearCart') && (
            items.length > 0 ||
            Boolean(customerName?.trim()) ||
            Boolean(customerPhone?.trim()) ||
            Boolean(customerAddress?.trim()) ||
            Boolean(customerGstin?.trim()) ||
            Boolean(activeTab?.billDate) ||
            Boolean(activeTab?.customerId) ||
            Boolean(activeTab?.description?.trim()) ||
            (discountValue && Number(discountValue) > 0) ||
            Boolean(localDiscText?.trim()) ||
            (activeTab?.snapshot?.discountValue && Number(activeTab.snapshot.discountValue) > 0) ||
            Boolean(storeScrapDeduction) ||
            Boolean(storeReturnDeduction) ||
            Boolean(activeTab?.transporterName?.trim()) ||
            Boolean(activeTab?.vehicleNumber?.trim()) ||
            Boolean(activeTab?.transporterDocNo?.trim()) ||
            Boolean(activeTab?.ewayBillNo?.trim()) ||
            Boolean(activeTab?.shippingName?.trim()) ||
            Boolean(activeTab?.shippingAddress?.trim()) ||
            Boolean(activeTab?.shippingGstin?.trim()) ||
            Boolean(activeTab?.manualTotalOverride) ||
            Boolean(activeTab?.receivedAmount && Number(activeTab.receivedAmount) > 0) ||
            Boolean(editingActive) ||
            Boolean(loyaltyCustomerData?.customerId) ||
            Boolean(pointsToRedeem && pointsToRedeem > 0)
          ) && (
            <button
              onClick={async () => {
                const tab = getActiveTab();
                clearCart();
                setDiscount(0, 'FIXED');
                setActiveDiscField(null);
                setLocalDiscText('');
                setShowCustomerDropdown(false);
                setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
                setShowLoyaltyRedemption(false);
                setPointsToRedeem(0);
                let normalInvoiceNumber = '';
                if (window.electronAPI) {
                  try {
                    const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? 'gst_b2c' : 'normal') : undefined;
                    const result = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
                    if (result.success && result.invoiceNumber) {
                      normalInvoiceNumber = result.invoiceNumber;
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }
                const fallbackTitle = normalInvoiceNumber || tab?.reservedScrapInvoiceNumber || '';
                updateActiveTab({ 
                  customerId: '',
                  customerName: '', 
                  customerPhone: '', 
                  customerGstin: '', 
                  customerAddress: '', 
                  billDate: null,
                  description: '',
                  transporterName: '',
                  vehicleNumber: '',
                  transporterDocNo: '',
                  transporterDocDate: '',
                  ewayBillNo: '',
                  ewayBillDate: '',
                  shippingName: '',
                  shippingAddress: '',
                  shippingGstin: '',
                  manualTotalOverride: null,
                  paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', 
                  receivedAmount: 0, 
                  reservedInvoiceNumber: normalInvoiceNumber,
                  title: fallbackTitle 
                });
                syncActiveSnapshot();
                if (uiConfig.entryFocusOrder === 'customer-first') {
                  customerNameInputRef.current?.focus();
                } else {
                  searchRef.current?.focus();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              title="Clear Cart"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Clear Cart</span>
            </button>
          )}
          {isHeaderButtonVisible(uiConfig, 'showHistory') && (!featureFlags || featureFlags.sales_history || isScrapMode) && (
          <button
            onClick={() => {
              if (isScrapMode) {
                window.dispatchEvent(new CustomEvent('open-scrap-manager', { detail: { initialView: 'invoices' } }));
              } else {
                window.dispatchEvent(new CustomEvent('open-sales-history'));
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 font-bold text-sm cursor-pointer"
            title="Sales History"
          >
            <TrendingUp className="w-4 h-4 text-primary" />
            <span>History</span>
          </button>
          )}
          {isHeaderButtonVisible(uiConfig, 'showHeldBills') && (
          <button
            onClick={() => {
              loadHeldBills();
              setShowHeldBillsPanel(true);
            }}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95 font-bold text-sm cursor-pointer border",
              heldBills.length > 0
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
            )}
            title="View Held Bills / Drafts"
          >
            <PauseCircle className={clsx("w-4 h-4", heldBills.length > 0 ? "text-amber-500" : "text-primary")} />
            <span>Held Bills</span>
            {heldBills.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1.5 text-[9px] font-black rounded-full bg-amber-500 text-white leading-none shadow-xs">
                {heldBills.length}
              </span>
            )}
          </button>
          )}
          {isHeaderButtonVisible(uiConfig, 'showTransport') && (
          <button
            onClick={() => setShowTransportModal(true)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95 font-bold text-sm cursor-pointer border",
              (activeTab?.transporterName || activeTab?.vehicleNumber || activeTab?.ewayBillNo)
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
            )}
            title="Transporter & E-Way Bill Details"
          >
            <Truck className={clsx("w-4 h-4", (activeTab?.transporterName || activeTab?.vehicleNumber || activeTab?.ewayBillNo) ? "text-emerald-500" : "text-primary")} />
            <span>Transport</span>
            {(activeTab?.transporterName || activeTab?.vehicleNumber || activeTab?.ewayBillNo) && (
              <span className="inline-flex items-center justify-center min-w-[8px] h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </button>
          )}
          {isHeaderButtonVisible(uiConfig, 'showScrap') && enableScrap && (!featureFlags || featureFlags.scrap) && (
            <button
              onClick={() => {
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
              }}
              className={clsx(
                "relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
                isScrapActive
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
              )}
              title="Scrap Mode (F5)"
            >
              <Recycle className={clsx("w-4 h-4", isScrapActive && "text-orange-500")} />
              <span>Scrap</span>
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F5</span>
            </button>
          )}
          {(isHeaderButtonVisible(uiConfig, 'showQuotation') || isQuotationActive) && (!featureFlags || featureFlags.quotations) && (
          <button
              onClick={() => {
                const next = !isQuotationMode;
                setQuotationMode(next);
                if (next && isScrapMode) setIsScrapMode(false);
                if (next && isReturnMode) setReturnMode(false);
                if (next && isPastBillMode) setIsPastBillMode(false);
                if (next && quotationGstEnabledSetting) setInvoiceType('GST');
                if (next) reserveQuotationNumberForTab();
                syncActiveSnapshot();
                setTimeout(() => searchRef.current?.focus(), 100);
              }}
            className={clsx(
              "relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
              isQuotationActive
                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
            )}
            title="Quotation Mode (F6)"
          >
            <FileText className={clsx("w-4 h-4", isQuotationActive && "text-blue-500")} />
            <span>Quotation</span>
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F6</span>
          </button>
          )}
          {isHeaderButtonVisible(uiConfig, 'showReturn') && (!featureFlags || featureFlags.returns) && (
          <button
            onClick={async () => {
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
            }}
            className={clsx(
              "relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
              isReturnMode
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
            )}
            title="Return Mode (F7)"
          >
            <ArrowLeftRight className={clsx("w-4 h-4", isReturnMode && "text-rose-500")} />
            <span>Return</span>
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F7</span>
          </button>
          )}
          {isHeaderButtonVisible(uiConfig, 'showRegister') && showCashRegister && (
            <button
              onClick={() => setCashRegisterOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              title="Cash Register"
            >
              <Banknote className="w-4 h-4 text-primary" />
              <span>Register</span>
            </button>
          )}
          {/* ─── QUICK PAGE SHORTCUTS (EASY ENTER TO LEDGER, CUSTOMERS, ETC.) ─── */}
          {uiConfig.showQuickActions !== false && (uiConfig.quickPageShortcuts || ['ledger']).map((pageKey) => {
            const pageDef = QUICK_PAGES_LIST.find(p => p.key === pageKey);
            if (!pageDef) return null;
            if (pageDef.featureKey && featureFlags && (featureFlags as any)[pageDef.featureKey] === false) return null;

            return (
              <button
                key={pageKey}
                onClick={() => {
                  sessionStorage.setItem('last_pos_nav_source', 'header_button');
                  window.dispatchEvent(new CustomEvent(pageDef.eventName));
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/60 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                title={`Quick Enter: ${pageDef.label}`}
              >
                {pageKey === 'ledger' && <BookOpen className="w-4 h-4 text-emerald-500" />}
                {pageKey === 'customers' && <Users className="w-4 h-4 text-blue-500" />}
                {pageKey === 'inventory' && <Package className="w-4 h-4 text-amber-500" />}
                {pageKey === 'purchase_bills' && <FileText className="w-4 h-4 text-purple-500" />}
                {pageKey === 'financial_report' && <TrendingUp className="w-4 h-4 text-cyan-500" />}
                {pageKey === 'stock_report' && <Package className="w-4 h-4 text-teal-500" />}
                {pageKey === 'staff' && <User className="w-4 h-4 text-indigo-500" />}
                {pageKey === 'combo_offers' && <Layers className="w-4 h-4 text-rose-500" />}
                {pageKey === 'warranties' && <Shield className="w-4 h-4 text-green-500" />}
                <span>{pageDef.label.split(' ')[0]}</span>
              </button>
            );
          })}
          <button
            onClick={() => {
              sessionStorage.setItem('last_pos_nav_source', 'header_button');
              window.dispatchEvent(new CustomEvent('open-settings-manager'));
            }}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border/40" />
          <button
            onClick={() => {
              sessionStorage.setItem('last_pos_nav_source', 'page_exit');
              if (isAdminRole(authRole)) setRole('ADMIN');
              window.dispatchEvent(new CustomEvent('open-dashboard'));
            }}
            className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
            title="Dashboard"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
        </div>
      </header>

      {/* ─── TABS BAR ─── */}
      <div className="shrink-0 bg-muted/20 border-b border-border">
        <BillingTabBar onAddTab={handleAddTab} enableThreeInvoiceSeries={enableThreeInvoiceSeries} />
      </div>

      {/* ─── MAIN POS WORKSPACE ─── */}
      {uiConfig.layoutModel === 'erp-grid-b2c' && renderErpGridB2CWorkspace()}

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
        <div 
          className={clsx(
            "flex flex-col transition-all duration-300",
            uiConfig.orientation === 'horizontal-stack' ? "w-full flex-1 min-h-[200px] border-b-2 border-border overflow-hidden" :
            (uiConfig.orientation === 'three-column' || uiConfig.showQuickCategoryBar) ? "w-[48%] border-r border-border" :
            uiConfig.splitRatio === '50-50' ? "w-[50%] border-r border-border" :
            uiConfig.splitRatio === '65-35' ? "w-[65%] border-r border-border" :
            uiConfig.splitRatio === '70-30' ? "w-[70%] border-r border-border" : "w-[58%] border-r border-border"
          )}
        >
          
          {uiConfig.entryFocusOrder === 'customer-first' ? (
            <>
              {renderCustomerDetailsSection()}
              {renderSearchBarSection()}
            </>
          ) : (
            <>
              {renderSearchBarSection()}
              {renderCustomerDetailsSection()}
            </>
          )}

          {/* Cart List */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {isLoadingEditBill ? (
              <div className="space-y-3 py-3">
                {[1, 2, 3].map(n => (
                  <div key={n} className="p-3.5 bg-card border border-border/60 rounded-xl space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <Skeleton className="h-4 w-1/2 rounded-md" />
                      <Skeleton className="h-4 w-1/5 rounded-md" />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <Skeleton className="h-3 w-1/3 rounded-md" />
                      <Skeleton className="h-6 w-1/4 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-2 text-center max-w-xs mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground shadow-sm">
                  {emptyIcon}
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground/80">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">Search or scan to add items</p>
                </div>
                <div className="flex gap-1.5 mt-1 flex-wrap justify-center">
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F1: Normal</span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F2: Search</span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F4: Customer</span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F8: {isScrapMode ? 'Extra' : 'Discount'}</span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F11: Pay Mode</span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F12: Print</span>
                </div>
              </div>
            ) : (
              items.map((item, idx) => {
                const isLastAdded = item.product_id === lastAddedProductId;

                if (item.isServiceItem) {
                  const serviceAmount = Number(item.offer_price ?? item.base_price) || 0;
                  return (
                    <div
                      key={item.product_id}
                      ref={el => { itemRefs.current[item.product_id] = el; }}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 hover:shadow-sm group",
                        isLastAdded
                          ? "ring-2 ring-violet-500 bg-violet-500/15 border-violet-500 shadow-md scale-[1.01]"
                          : "bg-violet-500/5 border border-violet-500/30 hover:border-violet-500/50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                          <span className="text-[9px] font-bold text-violet-600 bg-violet-500/15 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">Service</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          <span className="text-violet-600 font-semibold">Enter amount</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 bg-violet-500/10 border border-violet-500/30 rounded-lg py-0.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground font-black uppercase pl-2">₹</span>
                        <input type="number" step="any" min="0"
                          className="w-24 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={serviceAmount || ''}
                          ref={(el) => {
                            qtyRefs.current[item.product_id] = el;
                            if (el && pendingFocusProductIdRef.current === item.product_id) {
                              el.focus();
                              el.select();
                              pendingFocusProductIdRef.current = null;
                            }
                          }}
                          onChange={e => updateItemOfferPrice(item.product_id, e.target.value === '' ? 0 : Number(e.target.value))}
                          onKeyDown={e => {
                            guardScannerInput(e, item.product_id, serviceAmount || '', v => updateItemOfferPrice(item.product_id, v === '' ? 0 : Number(v)));
                            handleQtyKeyDown(e, item.product_id);
                          }}
                          onFocus={e => e.target.select()}
                          placeholder="0"
                        />
                      </div>
                      <div className="font-black text-sm text-violet-600 dark:text-violet-400 shrink-0 min-w-[65px] text-right">{formatCurrency(serviceAmount)}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Item">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }

                if (item.isReturnItem) {
                  if (!isReturnMode) return null;
                  const rate = Number(item.originalUnitPrice) || 0;
                  const rawRate = Number(item.rawUnitPrice) || rate;
                  const qtyText = Number(item.quantity) || 0;
                  const total = rate * qtyText;
                  const rawTotal = rawRate * qtyText;
                  const avail = item.availableToReturn ?? 0;

                  const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
                  const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
                  const ppk = item.pieces_per_kg || 1;
                  const pieces = item.pieces_override ?? 1;

                  return (
                    <div
                      key={item.product_id}
                      ref={el => { itemRefs.current[item.product_id] = el; }}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 hover:shadow-sm group",
                        isLastAdded
                          ? "ring-2 ring-rose-500 bg-rose-500/15 border-rose-500 shadow-md scale-[1.01]"
                          : "bg-rose-500/5 border border-rose-500/30 hover:border-rose-500/50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                          <span className="text-[9px] font-bold text-rose-600 bg-rose-500/15 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">Return</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1 flex-wrap">
                          <span className="font-semibold">
                            {isPiecesWeight ? (
                              `${formatCurrency(rate)}/Kg`
                            ) : (
                              `${formatCurrency(rate)}/unit`
                            )}
                          </span>
                          {rawRate > rate + 0.005 && (
                            <span className="text-[9px] text-muted-foreground/50 line-through font-mono">
                              {formatCurrency(rawRate)}
                            </span>
                          )}
                          <span className="mx-0.5">&middot;</span>
                          <span>Avail: {avail} {isPiecesWeight ? 'Kg' : ''}</span>
                          {(item.alreadyReturned ?? 0) > 0 && (
                            <><span className="mx-0.5">&middot;</span><span>Ret: {item.alreadyReturned} {isPiecesWeight ? 'Kg' : ''}</span></>
                          )}
                          {item.returnSourceInvoiceNumber && (
                            <><span className="mx-0.5">&middot;</span><span className="text-[9px]">Inv: {item.returnSourceInvoiceNumber}</span></>
                          )}
                        </div>
                      </div>

                      {isPiecesWeight ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex items-center gap-0.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-1.5 py-0.5">
                            <span className="text-[8px] text-rose-600 dark:text-rose-400 font-bold uppercase">Pcs</span>
                            <input
                              type="text" inputMode="numeric"
                              className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={localPcsStr[item.product_id] ?? String(pieces)}
                              onFocus={e => e.target.select()}
                              onChange={e => {
                                const raw = e.target.value.replace(/[^\d]/g, '');
                                setLocalPcsStr(p => ({ ...p, [item.product_id]: raw }));
                                const pcsVal = parseInt(raw, 10);
                                if (!isNaN(pcsVal) && pcsVal >= 0) {
                                  updatePiecesOverride(item.product_id, pcsVal);
                                }
                              }}
                              onBlur={e => {
                                if (!localPcsStr[item.product_id] || parseInt(localPcsStr[item.product_id], 10) <= 0) {
                                  updatePiecesOverride(item.product_id, 1);
                                  setLocalPcsStr(p => ({ ...p, [item.product_id]: '1' }));
                                }
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-0.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-1.5 py-0.5">
                            <span className="text-[8px] text-rose-600 dark:text-rose-400 font-bold uppercase">Kgs</span>
                            <input
                              type="text" inputMode="decimal"
                              ref={(el) => {
                                qtyRefs.current[item.product_id] = el;
                                if (el && pendingFocusProductIdRef.current === item.product_id) {
                                  el.focus();
                                  el.select();
                                  pendingFocusProductIdRef.current = null;
                                }
                              }}
                              className="w-14 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={localKgStr[item.product_id] ?? String(item.quantity ?? '')}
                              onFocus={e => e.target.select()}
                              onChange={e => {
                                const raw = sanitizeQtyText(e.target.value);
                                setLocalKgStr(p => ({ ...p, [item.product_id]: raw }));
                                const num = parseFloat(raw);
                                if (!isNaN(num) && num > 0) {
                                  updateQuantity(item.product_id, Math.min(avail, +num.toFixed(3)));
                                }
                              }}
                              onBlur={e => {
                                const val = Number(item.quantity);
                                const validVal = (!val || isNaN(val) || val <= 0) ? 0.1 : Math.min(avail, val);
                                updateQuantity(item.product_id, validVal);
                                setLocalKgStr(p => ({ ...p, [item.product_id]: String(validVal) }));
                              }}
                              onKeyDown={e => {
                                guardScannerInput(e, item.product_id, qtyText, v => updateQuantity(item.product_id, Math.min(avail, Number(v))));
                                handleQtyKeyDown(e, item.product_id);
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5 bg-rose-500/10 border border-rose-500/30 rounded-lg py-0.5 shrink-0">
                          <button onClick={() => { const q = Number(item.quantity); if (q > 1) updateQuantity(item.product_id, q - 1); }}
                            className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                          ><Minus className="w-3 h-3" /></button>
                          <input type="text" inputMode="numeric"
                            ref={(el) => {
                              qtyRefs.current[item.product_id] = el;
                              if (el && pendingFocusProductIdRef.current === item.product_id) {
                                el.focus();
                                el.select();
                                pendingFocusProductIdRef.current = null;
                              }
                            }}
                            className="w-12 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.quantity === '' ? '' : (item.quantity ?? qtyText)}
                            onFocus={e => e.target.select()}
                            onBlur={e => {
                              const num = Number(e.target.value);
                              const validVal = (!e.target.value || isNaN(num) || num <= 0) ? 1 : Math.min(avail, num);
                              updateQuantity(item.product_id, validVal);
                            }}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^\d]/g, '');
                              if (raw === '') {
                                updateQuantity(item.product_id, '');
                              } else {
                                const num = parseInt(raw, 10);
                                updateQuantity(item.product_id, isNaN(num) ? '' : Math.min(avail, Math.max(0, num)));
                              }
                            }}
                            onKeyDown={e => { guardScannerInput(e, item.product_id, qtyText, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                          />
                          <button onClick={() => { const q = Number(item.quantity); if (q < avail) updateQuantity(item.product_id, q + 1); }}
                            className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                          ><Plus className="w-3 h-3" /></button>
                        </div>
                      )}
                      <div className="text-right shrink-0 min-w-[80px]">
                        {rawTotal > total + 0.005 && (
                          <div className="text-[10px] text-muted-foreground/50 line-through font-semibold font-mono">
                            {formatCurrency(rawTotal)}
                          </div>
                        )}
                        <div className="font-black text-sm text-rose-600 dark:text-rose-400 font-mono">{formatCurrency(total)}</div>
                        {item.originalQuantity && (
                          <div className="text-[9px] text-muted-foreground/50">Sold: {item.originalQuantity}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Item">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }
                if (item.isScrap) {
                  const rate = item.base_price;
                  const qty = Number(item.quantity) || 0;

                  const hasItemBonus = !!(
                    (item.offer_price !== null && item.offer_price !== undefined) ||
                    (item.discount_flat !== null && item.discount_flat !== undefined) ||
                    (item.discount_percent !== null && item.discount_percent !== undefined)
                  );

                  const hasAdHocBonus = !!(
                    (localDiscPcts[item.product_id] !== undefined && localDiscPcts[item.product_id] !== null && localDiscPcts[item.product_id] !== (item.catalog_discount_percent ?? 0)) ||
                    (localDiscFlats[item.product_id] !== undefined && localDiscFlats[item.product_id] !== null && localDiscFlats[item.product_id] !== (item.catalog_discount_flat ?? 0)) ||
                    (item.discount_percent !== null && item.discount_percent !== undefined && item.discount_percent !== (item.catalog_discount_percent ?? null)) ||
                    (item.discount_flat !== null && item.discount_flat !== undefined && item.discount_flat !== (item.catalog_discount_flat ?? null)) ||
                    (item.offer_price !== null && item.offer_price !== undefined && item.offer_price !== (item.catalog_offer_price ?? null))
                  );

                  const catalogPriceScrapDisp = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
                    : item.catalog_discount_flat != null ? rate + Number(item.catalog_discount_flat)
                    : item.catalog_discount_percent != null ? rate * (1 + Number(item.catalog_discount_percent) / 100)
                    : rate;
                  const isAdhocOfferSD = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
                  const isAdhocDiscFlatSD = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
                  const isAdhocDiscPctSD = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);
                  let effectivePrice = catalogPriceScrapDisp;
                  if (isAdhocOfferSD) { effectivePrice = Number(item.offer_price); }
                  else if (isAdhocDiscFlatSD) { effectivePrice = catalogPriceScrapDisp + Number(item.discount_flat); }
                  else if (isAdhocDiscPctSD) { effectivePrice = catalogPriceScrapDisp * (1 + Number(item.discount_percent) / 100); }
                  effectivePrice = Math.max(effectivePrice, 0);
                  const total = effectivePrice * qty;

                  return (
                    <div
                      key={item.product_id}
                      ref={el => { itemRefs.current[item.product_id] = el; }}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 hover:shadow-sm group",
                        isLastAdded
                          ? "ring-2 ring-orange-500 bg-orange-500/15 border-orange-500 shadow-md scale-[1.01]"
                          : "bg-orange-500/5 border border-orange-500/30 hover:border-orange-500/50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          <span className="text-orange-600 font-semibold">{formatCurrency(rate)}/{(item as any).unit || 'Kg'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 bg-orange-500/10 border border-orange-500/30 rounded-lg py-0.5 shrink-0">
                        <input type="text" inputMode="decimal"
                          ref={(el) => {
                            qtyRefs.current[item.product_id] = el;
                            if (el && pendingFocusProductIdRef.current === item.product_id) {
                              el.focus();
                              el.select();
                              pendingFocusProductIdRef.current = null;
                            }
                          }}
                          className="w-14 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={item.quantity === 0 ? 0 : item.quantity || ''}
                          onFocus={e => e.target.select()}
                          onChange={e => updateQuantity(item.product_id, sanitizeQtyText(e.target.value))}
                          onKeyDown={e => { guardScannerInput(e, item.product_id, qty, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                          placeholder="Kg"
                        />
                        <span className="text-[10px] text-muted-foreground font-black uppercase pr-1.5">Kg</span>
                      </div>

                      <div className="flex items-center shrink-0">
                        <div className="flex items-center border border-emerald-500/30 rounded-lg overflow-hidden focus-within:border-emerald-500/60 transition-all bg-emerald-500/5">
                          <input
                            type="number" min="0" max="100" step="any" inputMode="decimal"
                            ref={el => { discRefs.current[item.product_id] = el; }}
                            className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={localDiscPcts[item.product_id] !== undefined
                              ? (localDiscPcts[item.product_id] || '')
                              : (item.discount_percent ?? '')
                            }
                            onChange={e => {
                              const val = e.target.value;
                              const scrapConvPrice = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
                                : item.catalog_discount_flat != null ? rate + Number(item.catalog_discount_flat)
                                : item.catalog_discount_percent != null ? rate * (1 + Number(item.catalog_discount_percent) / 100)
                                : rate;
                              if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                                setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                                setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                                removeItemDiscount(item.product_id);
                              } else {
                                const pct = parseFloat(val);
                                const flat = scrapConvPrice > 0 ? Math.round(scrapConvPrice * pct / 100 * 100) / 100 : 0;
                                setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                                setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                                updateItemDiscount(item.product_id, 'PERCENT', pct);
                              }
                              syncActiveSnapshot();
                            }}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => {
                              handleDiscKeyDown(e, item.product_id);
                            }}
                            placeholder="+%"
                          />
                          <span className="w-px h-4 bg-emerald-500/30 shrink-0" />
                          <input
                            type="number" min="0" step="any" inputMode="decimal"
                            ref={el => { discFlatRefs.current[item.product_id] = el; }}
                            className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={localDiscFlats[item.product_id] !== undefined
                              ? (localDiscFlats[item.product_id] || '')
                              : (item.discount_flat ?? '')
                            }
                            onChange={e => {
                              const val = e.target.value;
                              const scrapConvPrice = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
                                : item.catalog_discount_flat != null ? rate + Number(item.catalog_discount_flat)
                                : item.catalog_discount_percent != null ? rate * (1 + Number(item.catalog_discount_percent) / 100)
                                : rate;
                              if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                                setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                                setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                                removeItemDiscount(item.product_id);
                              } else {
                                const flat = parseFloat(val);
                                const pct = scrapConvPrice > 0 ? Math.round(flat / scrapConvPrice * 100 * 100) / 100 : 0;
                                setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                                setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                                updateItemDiscount(item.product_id, 'FLAT', flat);
                              }
                              syncActiveSnapshot();
                            }}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => {
                              handleDiscFlatKeyDown(e, item.product_id);
                            }}
                            placeholder="+₹"
                          />
                          {hasAdHocBonus && (
                            <button
                              type="button"
                              onClick={() => {
                                removeItemDiscount(item.product_id);
                                setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                                setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                                syncActiveSnapshot();
                              }}
                              className="h-7 w-6 flex items-center justify-center text-[9px] font-bold text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                              title="Clear item extra"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 min-w-[70px]">
                        <ItemTotalInput
                          productId={item.product_id}
                          total={total}
                          rate={rate}
                          qty={qty}
                          hasDiscount={hasItemBonus}
                          isScrap={true}
                          onUpdateOfferPrice={updateItemOfferPrice}
                          onRemoveDiscount={removeItemDiscount}
                          onClearLocalDiscounts={pid => {
                            setLocalDiscPcts(p => ({ ...p, [pid]: 0 }));
                            setLocalDiscFlats(p => ({ ...p, [pid]: 0 }));
                          }}
                          syncActiveSnapshot={syncActiveSnapshot}
                          onKeyDown={e => handleDiscKeyDown(e, item.product_id)}
                        />
                        {hasItemBonus && (
                          <div className="text-[9px] text-muted-foreground/50 line-through font-semibold -mt-0.5 text-right">{formatCurrency(rate * qty)}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Item">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }

                const rate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0) ? Number(item.grade_rate) : Number(item.base_price || 0);
                const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
                const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
                const piecesPerKg = Number(item.pieces_per_kg) || 1;
                const weightKg = Number(item.quantity) || 0;
                const pieces = isPiecesWeight ? (item.pieces_override ?? 1) : 0;
                const qty = weightKg;

                const catalogPriceItem = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
                  : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
                  : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
                  : rate;
                const isAdhocOfferI = item.offer_price != null && item.offer_price !== item.catalog_offer_price;
                const isAdhocDiscFlatI = item.discount_flat != null && item.discount_flat !== item.catalog_discount_flat;
                const isAdhocDiscPctI = item.discount_percent != null && item.discount_percent !== item.catalog_discount_percent;
                let effectivePrice = catalogPriceItem;
                if (isAdhocOfferI) { effectivePrice = Number(item.offer_price); }
                else if (isAdhocDiscFlatI) { effectivePrice = catalogPriceItem - Number(item.discount_flat); }
                else if (isAdhocDiscPctI) { effectivePrice = catalogPriceItem * (1 - Number(item.discount_percent) / 100); }
                effectivePrice = Math.max(effectivePrice, 0);
                const pricePerPiece = isPiecesWeight ? effectivePrice / piecesPerKg : null;
                const total = effectivePrice * qty;

                // Explicit discount flag — avoids floating-point comparison bugs
                const hasItemDiscount = (rate * qty > total + 0.005) || !!(
                  (item.offer_price !== null && item.offer_price !== undefined) ||
                  (item.discount_flat !== null && item.discount_flat !== undefined) ||
                  (item.discount_percent !== null && item.discount_percent !== undefined) ||
                  (item.catalog_offer_price !== null && item.catalog_offer_price !== undefined) ||
                  (item.catalog_discount_flat !== null && item.catalog_discount_flat !== undefined) ||
                  (item.catalog_discount_percent !== null && item.catalog_discount_percent !== undefined)
                );

                const hasAdHocDiscount = !!(
                  (localDiscPcts[item.product_id] !== undefined && localDiscPcts[item.product_id] !== null && localDiscPcts[item.product_id] !== (item.catalog_discount_percent ?? 0)) ||
                  (localDiscFlats[item.product_id] !== undefined && localDiscFlats[item.product_id] !== null && localDiscFlats[item.product_id] !== (item.catalog_discount_flat ?? 0)) ||
                  (item.discount_percent !== null && item.discount_percent !== undefined && item.discount_percent !== (item.catalog_discount_percent ?? null)) ||
                  (item.discount_flat !== null && item.discount_flat !== undefined && item.discount_flat !== (item.catalog_discount_flat ?? null)) ||
                  (item.offer_price !== null && item.offer_price !== undefined && item.offer_price !== (item.catalog_offer_price ?? null))
                );

                // Commit Pcs value to store (entirely independent from Kg)
                const commitPcs = (pcsStr: string, isFinal = false) => {
                  const pcsVal = parseInt(pcsStr, 10);
                  if (!isNaN(pcsVal) && pcsVal >= 0) {
                    updatePiecesOverride(item.product_id, pcsVal);
                    setLocalPcsStr(p => ({ ...p, [item.product_id]: String(pcsVal) }));
                  } else if (pcsStr === '' && isFinal) {
                    updatePiecesOverride(item.product_id, 1);
                    setLocalPcsStr(p => ({ ...p, [item.product_id]: '1' }));
                  } else if (isFinal) {
                    const fallback = item.pieces_override ?? 1;
                    setLocalPcsStr(p => ({ ...p, [item.product_id]: String(fallback) }));
                  }
                };
                // Commit Kg value to store (entirely independent from Pcs)
                const commitKg = (kgStr: string, isFinal = false) => {
                  const cleaned = sanitizeQtyText(kgStr);
                  const kgVal = parseFloat(cleaned);
                  if (!isNaN(kgVal) && kgVal > 0) {
                    updateQuantity(item.product_id, +kgVal.toFixed(3));
                  } else if (isFinal) {
                    // Restore display on blur/final if empty or invalid
                    setLocalKgStr(p => ({ ...p, [item.product_id]: String(item.quantity ?? '') }));
                  }
                };

                return (
                  <div
                    key={item.product_id}
                    ref={el => { itemRefs.current[item.product_id] = el; }}
                    className={clsx(
                      "flex items-center gap-3 px-3.5 py-2.5 my-0.5 rounded-xl transition-all duration-200 hover:shadow-md group min-h-[52px]",
                      isLastAdded
                        ? "ring-2 ring-primary bg-primary/10 border-primary shadow-md scale-[1.005]"
                        : "bg-card border border-border/80 hover:border-primary/40"
                    )}
                  >
                    {/* Serial Number Badge */}
                    <span className="text-xs font-black text-primary/80 dark:text-primary-foreground/90 bg-primary/10 border border-primary/20 rounded-lg px-2 py-1 flex items-center justify-center shrink-0 min-w-[2.25rem] h-8 select-none shadow-2xs">
                      #{idx + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground truncate flex items-center gap-1.5">
                          <span>{item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                          {/\s*\((GST|EST|Estimate)\)$/i.test(item.name) && (
                            <span className={clsx(
                              "text-[8px] px-1.2 py-0.2 rounded font-black tracking-wide border uppercase select-none leading-none",
                              item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1].toUpperCase() === 'GST'
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            )}>
                              {item.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                            </span>
                          )}
                        </span>
                        {item.isCombo && (
                          <span className="text-[9px] font-bold text-purple-600 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">
                            COMBO OFFER
                          </span>
                        )}
                      </div>
                      {item.isCombo && item.combo_items && (
                        <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
                          Includes: {item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5 flex-wrap">
                        {item.sku_barcode ? (
                          <span className="font-mono px-1.5 py-0.2 rounded bg-muted text-foreground font-semibold border border-border">
                            {item.sku_barcode}
                          </span>
                        ) : item.item_code ? (
                          <span className="font-mono px-1.5 py-0.2 rounded bg-muted text-foreground font-semibold border border-border">
                            Code: {item.item_code}
                          </span>
                        ) : (
                          <span className="italic">No barcode</span>
                        )}
                        {pricePerPiece !== null && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono font-bold">
                            {formatCurrency(pricePerPiece)}/pc
                          </span>
                        )}
                        {item.brand_manufacturer && (
                          <span className="font-medium">&middot; {item.brand_manufacturer}</span>
                        )}
                      </div>
                    </div>

                    {/* Quantity Controls (First) */}
                    {isPiecesWeight ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">Pcs</span>
                          <input
                            type="text" inputMode="numeric"
                            ref={(el) => {
                              pcsRefs.current[item.product_id] = el;
                              if (el && pendingFocusProductIdRef.current === item.product_id) {
                                el.focus();
                                el.select();
                                pendingFocusProductIdRef.current = null;
                              }
                            }}
                            className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={localPcsStr[item.product_id] ?? String(pieces)}
                            onFocus={e => {
                              e.target.select();
                              activeCartProductIdRef.current = item.product_id;
                              setFocusedRowProductId(item.product_id);
                            }}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^\d]/g, '');
                              setLocalPcsStr(p => ({ ...p, [item.product_id]: raw }));
                              commitPcs(raw, false);
                            }}
                            onBlur={e => commitPcs(e.target.value, true)}
                            onKeyDown={e => {
                              guardScannerInput(e, item.product_id, pieces, v => {
                                const pcsStr = String(Math.round(Number(v)));
                                setLocalPcsStr(p => ({ ...p, [item.product_id]: pcsStr }));
                                commitPcs(pcsStr, true);
                              });
                              if (e.key === 'Enter') {
                                commitPcs(e.currentTarget.value, true);
                              }
                              handlePcsKeyDown(e, item.product_id);
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">Kgs</span>
                          <input type="text" inputMode="decimal"
                            ref={(el) => {
                              qtyRefs.current[item.product_id] = el;
                              kRefs.current[item.product_id] = el;
                              if (el && !pcsRefs.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
                                el.focus();
                                el.select();
                                pendingFocusProductIdRef.current = null;
                              }
                            }}
                            className="w-16 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={localKgStr[item.product_id] ?? String(item.quantity ?? '')}
                            onFocus={e => {
                              e.target.select();
                              activeCartProductIdRef.current = item.product_id;
                              setFocusedRowProductId(item.product_id);
                            }}
                            onChange={e => {
                              const raw = sanitizeQtyText(e.target.value);
                              setLocalKgStr(p => ({ ...p, [item.product_id]: raw }));
                              commitKg(raw, false);
                            }}
                            onBlur={e => commitKg(e.target.value, true)}
                            onKeyDown={e => {
                              guardScannerInput(e, item.product_id, weightKg, v => {
                                const kgStr = String(v);
                                setLocalKgStr(p => ({ ...p, [item.product_id]: kgStr }));
                                commitKg(kgStr, true);
                              });
                              if (e.key === 'Enter') {
                                commitKg(e.currentTarget.value, true);
                              }
                              handleQtyKeyDown(e, item.product_id);
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 shrink-0 bg-muted/40 border border-border/80 rounded-lg overflow-hidden">
                        <button onClick={() => { const q = Number(item.quantity); const step = item.billing_type === 'WEIGHT' ? 0.1 : 1; if (q > step) updateQuantity(item.product_id, +(q - step).toFixed(3)); else removeItem(item.product_id); }}
                          className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                        ><Minus className="w-3 h-3" /></button>
                        <input type="text" inputMode="decimal"
                          ref={(el) => {
                            qtyRefs.current[item.product_id] = el;
                            if (el && pendingFocusProductIdRef.current === item.product_id) {
                              el.focus();
                              el.select();
                              pendingFocusProductIdRef.current = null;
                            }
                          }}
                          className={clsx(
                            "text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            (item.billing_type === 'WEIGHT' || item.isScrap) ? "w-20 min-w-[5rem]" : "w-12"
                          )}
                          value={item.quantity}
                          onFocus={e => {
                            e.target.select();
                            activeCartProductIdRef.current = item.product_id;
                            setFocusedRowProductId(item.product_id);
                          }}
                          onBlur={e => {
                            const val = Number(e.target.value);
                            if (!e.target.value || isNaN(val) || val <= 0) {
                              updateQuantity(item.product_id, item.billing_type === 'WEIGHT' ? 0.1 : 1);
                            }
                          }}
                          onChange={e => updateQuantity(item.product_id, sanitizeQtyText(e.target.value))}
                          onKeyDown={e => { guardScannerInput(e, item.product_id, item.quantity, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                        />
                        <button onClick={() => { const step = item.billing_type === 'WEIGHT' ? 0.1 : 1; updateQuantity(item.product_id, +((Number(item.quantity) || 0) + step).toFixed(3)); }}
                          className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                        ><Plus className="w-3 h-3" /></button>
                        <span className="text-[10px] text-muted-foreground font-black uppercase pr-1.5">{item.billing_type === 'WEIGHT' ? 'Kg' : 'Pcs'}</span>
                      </div>
                    )}

                    {/* Rate Edit Inputs Column (Second - After Qty) */}
                    <div className="flex items-center gap-1 shrink-0">
                      {item.billing_type === 'WEIGHT' ? (
                        <ItemRateInput
                          productId={item.product_id}
                          rate={effectivePrice}
                          qty={qty}
                          unitLabel="/Kg"
                          placeholder="Rate/Kg"
                          title="Edit rate per Kg"
                          purchasePrice={item.purchase_price}
                          showPurchasePrice={uiConfig?.showPurchasePriceInPOS ?? false}
                          tierPricesMap={productPricingMap[item.product_id]}
                          pricingTiers={pricingTiers}
                          basePrice={item.original_base_price ?? item.base_price}
                          selectedTierId={item.pricing_tier_id}
                          onSelectTier={(pid, tid, tname, price) => {
                            updateItemPricingTier(pid, tid, tname, price);
                            syncActiveSnapshot();
                          }}
                          onUpdateOfferPrice={(pid, price) => {
                            updateItemOfferPrice(pid, price);
                          }}
                          syncActiveSnapshot={syncActiveSnapshot}
                          inputRef={(el) => {
                            rateKgRefs.current[item.product_id] = el;
                            if (el && !pcsRefs.current[item.product_id] && !qtyRefs.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
                              el.focus();
                              el.select();
                              pendingFocusProductIdRef.current = null;
                            }
                          }}
                          onKeyDownNext={() => focusNextCartField('rate', item.product_id)}
                          onKeyDownBack={() => focusPrevCartField('rate', item.product_id)}
                          onKeyDownDown={() => handleRateUpDown(item.product_id, 'down')}
                          onKeyDownUp={() => handleRateUpDown(item.product_id, 'up')}
                          onFocus={() => {
                            activeCartProductIdRef.current = item.product_id;
                            setFocusedRowProductId(item.product_id);
                          }}
                        />
                      ) : (
                        <ItemRateInput
                          productId={item.product_id}
                          rate={effectivePrice}
                          qty={qty}
                          unitLabel="/Pc"
                          placeholder="Rate/Pc"
                          title="Edit rate per Piece"
                          purchasePrice={item.purchase_price}
                          showPurchasePrice={uiConfig?.showPurchasePriceInPOS ?? false}
                          tierPricesMap={productPricingMap[item.product_id]}
                          pricingTiers={pricingTiers}
                          basePrice={item.original_base_price ?? item.base_price}
                          selectedTierId={item.pricing_tier_id}
                          onSelectTier={(pid, tid, tname, price) => {
                            updateItemPricingTier(pid, tid, tname, price);
                            syncActiveSnapshot();
                          }}
                          onUpdateOfferPrice={(pid, price) => {
                            updateItemOfferPrice(pid, price);
                          }}
                          syncActiveSnapshot={syncActiveSnapshot}
                          inputRef={(el) => {
                            ratePcRefs.current[item.product_id] = el;
                            if (el && !pcsRefs.current[item.product_id] && !qtyRefs.current[item.product_id] && pendingFocusProductIdRef.current === item.product_id) {
                              el.focus();
                              el.select();
                              pendingFocusProductIdRef.current = null;
                            }
                          }}
                          onKeyDownNext={() => focusNextCartField('rate', item.product_id)}
                          onKeyDownBack={() => focusPrevCartField('rate', item.product_id)}
                          onKeyDownDown={() => handleRateUpDown(item.product_id, 'down')}
                          onKeyDownUp={() => handleRateUpDown(item.product_id, 'up')}
                          onFocus={() => {
                            activeCartProductIdRef.current = item.product_id;
                            setFocusedRowProductId(item.product_id);
                          }}
                        />
                      )}
                    </div>

                    <div className="flex items-center shrink-0">
                      <div className="flex items-center border border-border/60 rounded-lg overflow-hidden focus-within:border-primary/60 transition-all bg-muted/10">
                        <input
                          type="number" min="0" max="100" step="any" inputMode="decimal"
                          ref={el => { discRefs.current[item.product_id] = el; }}
                          className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={localDiscPcts[item.product_id] !== undefined
                            ? (localDiscPcts[item.product_id] || '')
                            : (item.discount_percent ?? '')
                          }
                          onChange={e => {
                            const val = e.target.value;
                            const convCatalogPrice = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
                              : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
                              : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
                              : rate;
                            if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                              setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                              setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                              removeItemDiscount(item.product_id);
                            } else {
                              const pct = parseFloat(val);
                              const flat = convCatalogPrice > 0 ? Math.round(convCatalogPrice * pct / 100 * 100) / 100 : 0;
                              setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                              setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                              updateItemDiscount(item.product_id, 'PERCENT', pct);
                            }
                            syncActiveSnapshot();
                          }}
                          onFocus={e => {
                            e.target.select();
                            activeCartProductIdRef.current = item.product_id;
                            setFocusedRowProductId(item.product_id);
                          }}
                          onKeyDown={e => {
                            handleDiscKeyDown(e, item.product_id);
                          }}
                          placeholder="%"
                        />
                        <span className="w-px h-4 bg-border/40 shrink-0" />
                        <input
                          type="number" min="0" step="any" inputMode="decimal"
                          ref={el => { discFlatRefs.current[item.product_id] = el; }}
                          className="w-10 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={localDiscFlats[item.product_id] !== undefined
                            ? (localDiscFlats[item.product_id] || '')
                            : (item.discount_flat ?? '')
                          }
                          onChange={e => {
                            const val = e.target.value;
                            const convCatalogPrice = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
                              : item.catalog_discount_flat != null ? rate - Number(item.catalog_discount_flat)
                              : item.catalog_discount_percent != null ? rate * (1 - Number(item.catalog_discount_percent) / 100)
                              : rate;
                            if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                              setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                              setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                              removeItemDiscount(item.product_id);
                            } else {
                              const flat = parseFloat(val);
                              const pct = convCatalogPrice > 0 ? Math.round(flat / convCatalogPrice * 100 * 100) / 100 : 0;
                              setLocalDiscFlats(p => ({ ...p, [item.product_id]: flat }));
                              setLocalDiscPcts(p => ({ ...p, [item.product_id]: pct }));
                              updateItemDiscount(item.product_id, 'FLAT', flat);
                            }
                            syncActiveSnapshot();
                          }}
                          onFocus={e => {
                            e.target.select();
                            activeCartProductIdRef.current = item.product_id;
                            setFocusedRowProductId(item.product_id);
                          }}
                          onKeyDown={e => {
                            handleDiscFlatKeyDown(e, item.product_id);
                          }}
                          placeholder="₹"
                        />
                        {hasAdHocDiscount && (
                          <button
                            type="button"
                            onClick={() => {
                              removeItemDiscount(item.product_id);
                              setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                              setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                              syncActiveSnapshot();
                            }}
                            className="h-7 w-6 flex items-center justify-center text-[9px] font-bold text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                            title="Clear ad-hoc billing discount"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 min-w-[70px]">
                      <ItemTotalInput
                        productId={item.product_id}
                        total={total}
                        rate={rate}
                        qty={qty}
                        hasDiscount={hasItemDiscount}
                        inputRef={el => { totalInputRefs.current[item.product_id] = el; }}
                        onUpdateOfferPrice={updateItemOfferPrice}
                        onRemoveDiscount={removeItemDiscount}
                        onClearLocalDiscounts={pid => {
                          setLocalDiscPcts(p => ({ ...p, [pid]: 0 }));
                          setLocalDiscFlats(p => ({ ...p, [pid]: 0 }));
                        }}
                        syncActiveSnapshot={syncActiveSnapshot}
                        onKeyDown={e => handleTotalInputKeyDown(e, item.product_id)}
                        onKeyDownNext={() => focusNextCartField('grandTotal', item.product_id)}
                        onKeyDownBack={() => focusPrevCartField('grandTotal', item.product_id)}
                        onFocus={() => {
                          activeCartProductIdRef.current = item.product_id;
                          setFocusedRowProductId(item.product_id);
                        }}
                      />
                      {(hasItemDiscount || rate * qty > total + 0.005) && rate * qty > total + 0.005 && (
                        <div className="text-[9px] text-muted-foreground/50 line-through font-semibold -mt-0.5 text-right">{formatCurrency(rate * qty)}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleEditProduct(item)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Edit Product">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

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
          <div className={clsx(
            uiConfig.orientation === 'horizontal-stack'
              ? "w-1/2 border-r border-border h-full overflow-y-auto px-5 py-3 shrink-0"
              : "flex-1 overflow-y-auto px-5 py-2"
          )}>
            {/* Payment / Refund method grid — replaced by Quotation/Return Details in those modes */}
            <div className={clsx(
              'overflow-hidden transition-all duration-400 ease-in-out',
              isQuotationMode || editingQuotationId
                ? 'max-h-0 opacity-0 scale-95 py-0'
                : 'max-h-[500px] opacity-100 scale-100'
            )}>
              {isScrapMode ? (
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: 'PENDING' as const, label: 'Pending', icon: Clock, color: 'text-gray-500', activeBg: 'bg-gray-500/10', activeText: 'text-gray-600 dark:text-gray-400', activeBorder: 'border-gray-500', activeIconBg: 'bg-gray-500/15' },
                  { value: 'SETTLED' as const, label: 'Settled', icon: CheckCircle2, color: 'text-blue-500', activeBg: 'bg-blue-500/10', activeText: 'text-blue-600 dark:text-blue-400', activeBorder: 'border-blue-500', activeIconBg: 'bg-blue-500/15' },
                  { value: 'CASH' as const, label: 'Cash', icon: Banknote, color: 'text-emerald-500', activeBg: 'bg-emerald-500/10', activeText: 'text-emerald-600 dark:text-emerald-400', activeBorder: 'border-emerald-500', activeIconBg: 'bg-emerald-500/15' },
                  { value: 'CREDIT' as const, label: 'Credit', icon: Users, color: 'text-amber-500', activeBg: 'bg-amber-500/10', activeText: 'text-amber-600 dark:text-amber-400', activeBorder: 'border-amber-500', activeIconBg: 'bg-amber-500/15' },
                ].map(opt => {
                  const isActive = scrapPaymentStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateActiveTab({ scrapPaymentStatus: opt.value })}
                      className={clsx(
                        'flex flex-col items-center justify-center gap-1 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer col-span-1',
                        isActive
                          ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText} shadow-sm`
                          : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                      )}
                    >
                      <div className={clsx(
                        'p-2 rounded-xl transition-colors',
                        isActive ? opt.activeIconBg : 'bg-muted'
                      )}>
                        <opt.icon className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-xs font-extrabold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              ) : isReturnMode ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-6 gap-1.5">
                  {[
                    { value: 'CREDIT' as const, label: 'Credit Balance', icon: CreditCard, activeBg: 'bg-amber-500/10', activeText: 'text-amber-600 dark:text-amber-400', activeBorder: 'border-amber-500', activeIconBg: 'bg-amber-500/15' },
                    { value: 'ADJUST_BILL' as const, label: 'Adjust Bill', icon: ArrowLeftRight, activeBg: 'bg-rose-500/10', activeText: 'text-rose-600 dark:text-rose-400', activeBorder: 'border-rose-500', activeIconBg: 'bg-rose-500/15' },
                    { value: 'CASH' as const, label: 'Cash', icon: Banknote, activeBg: 'bg-emerald-500/10', activeText: 'text-emerald-600 dark:text-emerald-400', activeBorder: 'border-emerald-500', activeIconBg: 'bg-emerald-500/15' },
                    { value: 'UPI' as const, label: 'UPI', icon: Smartphone, activeBg: 'bg-violet-500/10', activeText: 'text-violet-600 dark:text-violet-400', activeBorder: 'border-violet-500', activeIconBg: 'bg-violet-500/15' },
                    { value: 'CARD' as const, label: 'Card', icon: Wallet, activeBg: 'bg-blue-500/10', activeText: 'text-blue-600 dark:text-blue-400', activeBorder: 'border-blue-500', activeIconBg: 'bg-blue-500/15' },
                    { value: 'STORE_CREDIT' as const, label: 'Store Credit', icon: Gift, activeBg: 'bg-purple-500/10', activeText: 'text-purple-600 dark:text-purple-400', activeBorder: 'border-purple-500', activeIconBg: 'bg-purple-500/15' },
                  ].map(opt => {
                    const isActive = returnRefundMethod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setReturnRefundMethod(opt.value)}
                        className={clsx(
                          'flex flex-col items-center justify-center gap-1 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer col-span-2',
                          isActive
                            ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText} shadow-sm`
                            : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                        )}
                      >
                        <div className={clsx(
                          'p-2 rounded-xl transition-colors',
                          isActive ? opt.activeIconBg : 'bg-muted'
                        )}>
                          <opt.icon className="w-4.5 h-4.5" />
                        </div>
                        <span className="text-xs font-extrabold">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedReturnInvoice && (
                  <div className="flex items-center justify-between px-3 py-2 bg-rose-500/5 border border-rose-500/10 rounded-xl mt-1">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">Original Invoice: <span className="font-bold text-foreground">{selectedReturnInvoice.invoice_number}</span></span>
                      {(() => {
                        const pm = (selectedReturnInvoice.payment_method || '').toUpperCase();
                        let splitCredit = 0;
                        if (selectedReturnInvoice.split_details) {
                          try {
                            const s = typeof selectedReturnInvoice.split_details === 'string' ? JSON.parse(selectedReturnInvoice.split_details) : selectedReturnInvoice.split_details;
                            splitCredit = Number(s?.credit) || 0;
                          } catch {}
                        }
                        const isCredit = pm === 'CREDIT' || splitCredit > 0 || (Number(selectedReturnInvoice.balance_amount) > 0 && pm !== 'CASH');
                        if (isCredit) {
                          const due = Number(selectedReturnInvoice.balance_amount || selectedReturnInvoice.grand_total) || 0;
                          return (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                              Credit Bill · Balance Due: ₹{due.toFixed(2)}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">{selectedReturnInvoice.customer_name || 'Walk-in'}</span>
                  </div>
                )}
              </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      Payment Method
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground/70 bg-muted/60 px-2 py-0.5 rounded-full">
                      Arrows: Select &middot; Enter: Confirm / Print
                    </span>
                  </div>
                  <div className="grid grid-cols-8 gap-2">
                      {paymentOptions.map((opt, idx) => {
                        const isActive = paymentMethod === opt.value;
                        const span = opt.value === 'SPLIT'
                          ? 'col-span-2 col-start-7 row-start-1 row-span-2'
                          : 'col-span-2';

                        const shortcutBadge = opt.value === 'CASH' ? 'Alt+1'
                          : opt.value === 'UPI' ? 'Alt+2'
                          : opt.value === 'CARD' ? 'Alt+3'
                          : opt.value === 'CREDIT' ? 'Alt+4'
                          : opt.value === 'SPLIT' ? 'Alt+5'
                          : opt.value === 'PENDING' ? 'Alt+6'
                          : null;

                        const handlePaymentSelect = () => {
                          if (opt.value === 'UPI') {
                            updateActiveTab({ paymentMethod: 'UPI' });
                            if (upiPageConfig.billing && upiSources.length > 0) {
                              setIsUpiSelectModalOpen(true);
                            }
                          } else if (opt.value === 'SPLIT') {
                            if (paymentMethod !== 'SPLIT') {
                              const prevMethod = paymentMethod;
                              let initialSplit: SplitDetails = { cash: 0, card: 0, upi: 0, cheque: 0, credit: 0, bank_transfer: 0 };
                              if (displayGrandTotal > 0) {
                                if (prevMethod === 'UPI') initialSplit.upi = displayGrandTotal;
                                else if (prevMethod === 'CARD') initialSplit.card = displayGrandTotal;
                                else if (prevMethod === 'CREDIT') initialSplit.credit = displayGrandTotal;
                                else if (prevMethod === 'CHEQUE') initialSplit.cheque = displayGrandTotal;
                                else initialSplit.cash = displayGrandTotal;

                                updateActiveTab({ paymentMethod: 'SPLIT', splitDetails: initialSplit, receivedAmount: (initialSplit.credit ? 0 : displayGrandTotal) });
                              } else {
                                updateActiveTab({ paymentMethod: 'SPLIT' });
                              }
                            }
                            setTimeout(() => {
                              splitCashInputRef.current?.focus();
                              splitCashInputRef.current?.select();
                            }, 40);
                          } else if (opt.value === 'CREDIT') {
                            if (paymentMethod !== 'CREDIT') {
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
                            }
                            setTimeout(() => {
                              splitCreditInputRef.current?.focus();
                              splitCreditInputRef.current?.select();
                            }, 40);
                          } else {
                            updateActiveTab({ paymentMethod: opt.value });
                          }
                        };

                        const handlePaymentOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
                          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            const prevIdx = (idx - 1 + paymentOptions.length) % paymentOptions.length;
                            const prevOpt = paymentOptions[prevIdx];
                            if (prevOpt.value !== 'CREDIT' && prevOpt.value !== 'SPLIT') {
                              updateActiveTab({ paymentMethod: prevOpt.value });
                            }
                            setTimeout(() => paymentOptionRefs.current[prevOpt.value]?.focus(), 15);
                          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const nextIdx = (idx + 1) % paymentOptions.length;
                            const nextOpt = paymentOptions[nextIdx];
                            if (nextOpt.value !== 'CREDIT' && nextOpt.value !== 'SPLIT') {
                              updateActiveTab({ paymentMethod: nextOpt.value });
                            }
                            setTimeout(() => paymentOptionRefs.current[nextOpt.value]?.focus(), 15);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            handlePaymentSelect();
                            if (opt.value === 'CASH') {
                              setTimeout(() => {
                                receivedInputRef.current?.focus();
                                receivedInputRef.current?.select();
                              }, 30);
                            } else if (opt.value === 'SPLIT' || opt.value === 'CREDIT') {
                              // Focus automatically shifts to split/credit input inside handlePaymentSelect
                            } else if (opt.value === 'UPI') {
                              if (!upiPageConfig.billing || upiSources.length === 0) {
                                focusDescriptionOrDiscount();
                              }
                            } else {
                              focusDescriptionOrDiscount();
                            }
                          }
                        };

                        // ── In SPLIT or CREDIT mode: Morph Cash, Card, UPI, Cheque, and Credit buttons into interactive input tiles ──
                        if (paymentMethod === 'SPLIT' || paymentMethod === 'CREDIT') {
                          if (opt.value === 'CASH') {
                            return (
                              <div key="CASH" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all shadow-xs h-[82px]')}>
                                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs min-w-0">
                                  <Banknote className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">Cash</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => fillRestForField('CASH')}
                                  title="Fill remaining balance (Shortcut: F)"
                                  className="w-full text-[9.5px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 active:scale-95 cursor-pointer bg-emerald-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                                >
                                  Fill Rest [F]
                                </button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-500/80">₹</span>
                                  <input
                                    ref={splitCashInputRef}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.cash || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                                      const nextDetails = { ...splitDetails, cash: val };
                                      const nextRec = val + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                      updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                    }}
                                    onKeyDown={(e) => handleSplitInputKeyDown(e, 'CASH')}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-emerald-500/30 focus:border-emerald-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'CARD') {
                            return (
                              <div key="CARD" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-blue-500 bg-blue-500/10 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-xs h-[82px]')}>
                                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-extrabold text-xs min-w-0">
                                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">Card</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => fillRestForField('CARD')}
                                  title="Fill remaining balance (Shortcut: F)"
                                  className="w-full text-[9.5px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 active:scale-95 cursor-pointer bg-blue-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                                >
                                  Fill Rest [F]
                                </button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-blue-500/80">₹</span>
                                  <input
                                    ref={splitCardInputRef}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.card || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                                      const nextDetails = { ...splitDetails, card: val };
                                      const nextRec = (Number(nextDetails.cash) || 0) + val + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                      updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                    }}
                                    onKeyDown={(e) => handleSplitInputKeyDown(e, 'CARD')}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-blue-500/30 focus:border-blue-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'UPI') {
                            return (
                              <div key="UPI" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-violet-500 bg-violet-500/10 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all shadow-xs h-[82px]')}>
                                <div
                                  className="flex items-center gap-1 text-violet-600 dark:text-violet-400 font-extrabold text-xs cursor-pointer hover:underline min-w-0"
                                  onClick={() => {
                                    if (upiPageConfig.billing && upiSources.length > 0) {
                                      setIsUpiSelectModalOpen(true);
                                    }
                                  }}
                                  title={currentSelectedUpi ? `Click to change UPI account: ${currentSelectedUpi.name} (${currentSelectedUpi.upi_id || ''})` : undefined}
                                >
                                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                                  <span className="shrink-0">UPI</span>
                                  {currentSelectedUpi && (
                                    <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300 truncate">
                                      ({currentSelectedUpi.name})
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => fillRestForField('UPI')}
                                  title="Fill remaining balance (Shortcut: F)"
                                  className="w-full text-[9.5px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400 hover:bg-violet-500/25 active:scale-95 cursor-pointer bg-violet-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                                >
                                  Fill Rest [F]
                                </button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-violet-500/80">₹</span>
                                  <input
                                    ref={splitUpiInputRef}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.upi || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                                      const nextDetails = { ...splitDetails, upi: val };
                                      const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + val + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                      updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                    }}
                                    onKeyDown={(e) => handleSplitInputKeyDown(e, 'UPI')}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-violet-500/30 focus:border-violet-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'CHEQUE') {
                            return (
                              <div key="CHEQUE" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-indigo-500 bg-indigo-500/10 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-xs h-[82px]')}>
                                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs min-w-0">
                                  <FileText className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">Cheque</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => fillRestForField('CHEQUE')}
                                  title="Fill remaining balance (Shortcut: F)"
                                  className="w-full text-[9.5px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/25 active:scale-95 cursor-pointer bg-indigo-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                                >
                                  Fill Rest [F]
                                </button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-indigo-500/80">₹</span>
                                  <input
                                    ref={splitChequeInputRef}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.cheque || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                                      const nextDetails = { ...splitDetails, cheque: val };
                                      const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + val + (Number(nextDetails.bank_transfer) || 0);
                                      updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                    }}
                                    onKeyDown={(e) => handleSplitInputKeyDown(e, 'CHEQUE')}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-indigo-500/30 focus:border-indigo-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'CREDIT') {
                            return (
                              <div key="CREDIT" className={clsx(span, 'flex flex-col justify-between p-1.5 rounded-2xl border-2 border-amber-500 bg-amber-500/10 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all shadow-xs h-[82px]')}>
                                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-extrabold text-xs min-w-0">
                                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">Credit</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => fillRestForField('CREDIT')}
                                  title="Fill remaining balance (Shortcut: F)"
                                  className="w-full text-[9.5px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 active:scale-95 cursor-pointer bg-amber-500/15 py-0.5 rounded-md transition-all text-center leading-tight"
                                >
                                  Fill Rest [F]
                                </button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-amber-500/80">₹</span>
                                  <input
                                    ref={splitCreditInputRef}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.credit || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                                      const nextDetails = { ...splitDetails, credit: val };
                                      const nextRec = (Number(nextDetails.cash) || 0) + (Number(nextDetails.card) || 0) + (Number(nextDetails.upi) || 0) + (Number(nextDetails.cheque) || 0) + (Number(nextDetails.bank_transfer) || 0);
                                      updateActiveTab({ splitDetails: nextDetails, receivedAmount: nextRec });
                                    }}
                                    onKeyDown={(e) => handleSplitInputKeyDown(e, 'CREDIT')}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-0.5 bg-background/90 border border-amber-500/30 focus:border-amber-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'SPLIT') {
                            const isSplitActive = paymentMethod === 'SPLIT';
                            return (
                              <button
                                key="SPLIT"
                                ref={el => { paymentOptionRefs.current['SPLIT'] = el; }}
                                type="button"
                                onClick={() => {
                                  updateActiveTab({ paymentMethod: 'CASH' });
                                  setInfoToast('Split Payment Closed (Switched to Cash)');
                                  setTimeout(() => setInfoToast(null), 2000);
                                  setTimeout(() => paymentOptionRefs.current['CASH']?.focus(), 50);
                                }}
                                onKeyDown={handlePaymentOptionKeyDown}
                                className={clsx(
                                  span,
                                  'flex flex-col justify-between p-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer h-[172px] focus:outline-none focus:ring-2 shadow-sm',
                                  isSplitActive
                                    ? 'border-purple-600 bg-purple-600 text-white dark:bg-purple-600 dark:border-purple-500 focus:ring-purple-400'
                                    : 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 focus:ring-amber-500'
                                )}
                                title="Click or press Esc to close multi-payment breakdown and reset to single Cash payment"
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-1 font-extrabold text-xs">
                                    <Split className="w-4 h-4 shrink-0" />
                                    <span>{isSplitActive ? 'Split ON' : 'Multi Pay'}</span>
                                  </div>
                                </div>
                                <div className="w-full flex flex-col items-center justify-center gap-1 mt-1">
                                  <span className={clsx(
                                    'text-xs font-black px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors',
                                    isSplitActive
                                      ? 'bg-white/20 text-white hover:bg-white/30'
                                      : 'bg-amber-500/20 text-amber-800 dark:text-amber-200 hover:bg-amber-500/30'
                                  )}>
                                    <X className="w-3.5 h-3.5 shrink-0 stroke-[3]" />
                                    <span>Close</span>
                                  </span>
                                  <span className="text-[9px] opacity-80 font-mono font-bold tracking-tight">
                                    [Esc]
                                  </span>
                                </div>
                              </button>
                            );
                          }
                        }

                        // ── Single Mode: Standard button options ──
                        let activeBg = '';
                        let activeText = '';
                        let activeBorder = '';
                        let activeIconBg = '';
                        let activeFocusRing = '';
                        if (opt.value === 'PENDING'){ activeBg = 'bg-gray-500/10';    activeText = 'text-gray-600 dark:text-gray-400';    activeBorder = 'border-gray-500';    activeIconBg = 'bg-gray-500/15'; activeFocusRing = 'focus:ring-gray-500 focus:border-gray-500'; }
                        if (opt.value === 'CASH')   { activeBg = 'bg-emerald-500/10'; activeText = 'text-emerald-600 dark:text-emerald-400'; activeBorder = 'border-emerald-500'; activeIconBg = 'bg-emerald-500/15'; activeFocusRing = 'focus:ring-emerald-500 focus:border-emerald-500'; }
                        if (opt.value === 'CARD')   { activeBg = 'bg-blue-500/10';    activeText = 'text-blue-600 dark:text-blue-400';    activeBorder = 'border-blue-500';    activeIconBg = 'bg-blue-500/15'; activeFocusRing = 'focus:ring-blue-500 focus:border-blue-500'; }
                        if (opt.value === 'UPI')    { activeBg = 'bg-violet-500/10';  activeText = 'text-violet-600 dark:text-violet-400';  activeBorder = 'border-violet-500';  activeIconBg = 'bg-violet-500/15'; activeFocusRing = 'focus:ring-violet-500 focus:border-violet-500'; }
                        if (opt.value === 'CHEQUE'){ activeBg = 'bg-indigo-500/10'; activeText = 'text-indigo-600 dark:text-indigo-400'; activeBorder = 'border-indigo-500'; activeIconBg = 'bg-indigo-500/15'; activeFocusRing = 'focus:ring-indigo-500 focus:border-indigo-500'; }
                        if (opt.value === 'CREDIT') { activeBg = 'bg-amber-500/10';   activeText = 'text-amber-600 dark:text-amber-400';   activeBorder = 'border-amber-500';   activeIconBg = 'bg-amber-500/15'; activeFocusRing = 'focus:ring-amber-500 focus:border-amber-500'; }
                        if (opt.value === 'SPLIT')  { activeBg = 'bg-purple-500/10';  activeText = 'text-purple-600 dark:text-purple-400';  activeBorder = 'border-purple-500';  activeIconBg = 'bg-purple-500/15'; activeFocusRing = 'focus:ring-purple-500 focus:border-purple-500'; }

                        return (
                          <button
                            key={opt.value}
                            ref={el => { paymentOptionRefs.current[opt.value] = el; }}
                            type="button"
                            onClick={handlePaymentSelect}
                            onKeyDown={handlePaymentOptionKeyDown}
                            className={clsx(
                              'flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer focus:outline-none focus:ring-2',
                              opt.value === 'SPLIT' ? 'h-[172px]' : 'h-[82px]',
                              activeFocusRing,
                              span,
                              isActive
                                ? `${activeBg} ${activeBorder} ${activeText} shadow-sm`
                                : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                            )}
                          >
                            <div className={clsx(
                              'p-1 rounded-lg transition-colors',
                              isActive ? activeIconBg : 'bg-muted'
                            )}>
                              <opt.icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex flex-col items-center leading-tight min-w-0 max-w-full px-1">
                              <span className="text-[11px] font-extrabold">{opt.label}</span>
                              {opt.value === 'UPI' && currentSelectedUpi && (
                                <span
                                  className={clsx(
                                    'text-[9px] font-black truncate max-w-[110px] mt-0.5 px-1.5 py-0.5 rounded-md shadow-2xs transition-colors',
                                    isActive
                                      ? 'bg-violet-600 text-white'
                                      : 'bg-muted-foreground/15 text-foreground'
                                  )}
                                  title={`${currentSelectedUpi.name}${currentSelectedUpi.upi_id ? ` (${currentSelectedUpi.upi_id})` : ''}`}
                                >
                                  {currentSelectedUpi.name}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>

            {/* ── Quotation Details — smoothly replaces payment methods ── */}
            <div className={clsx(
              'overflow-hidden transition-all duration-400 ease-in-out',
              isQuotationMode || editingQuotationId
                ? 'max-h-[500px] opacity-100 scale-100'
                : 'max-h-0 opacity-0 scale-95'
            )}>
              <div className="p-3.5 bg-blue-500/5 border border-blue-500/20 rounded-2xl mt-1">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Terms & Conditions</label>
                  <textarea
                    value={quotationTerms}
                    onChange={e => setQuotationTerms(e.target.value)}
                    rows={3}
                    className="w-full bg-background border border-border rounded-lg p-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Scrap & Return Deduction section in Left Panel for Top/Bottom Stack layout */}
            {/* Scrap & Return Deduction section in Left Panel for Top/Bottom Stack layout */}
            {uiConfig.orientation === 'horizontal-stack' && (
              <div className="mt-3">
                <div className={clsx(
                  'transition-all duration-400 ease-in-out',
                  !isScrapMode && !isQuotationMode && !isReturnMode && (isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled || storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0)
                    ? 'max-h-[500px] opacity-100 scale-100'
                    : 'max-h-0 opacity-0 scale-95 pointer-events-none'
                )}>
                  <div className={clsx(
                    "px-0 py-0 mt-1 border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm",
                    ((storeScrapDeduction > 0 ? 1 : 0) + (storeReturnDeduction > 0 ? 1 : 0) + (pointsRedeemedDiscountCalc > 0 ? 1 : 0)) > 1
                      ? "border-primary/20 bg-muted/5"
                      : storeScrapDeduction > 0
                        ? "border-orange-500/25 bg-orange-500/[0.01]"
                        : storeReturnDeduction > 0
                          ? "border-rose-500/25 bg-rose-500/[0.01]"
                          : pointsRedeemedDiscountCalc > 0
                            ? "border-emerald-500/25 bg-emerald-500/[0.01]"
                            : "border-border/60 bg-muted/5"
                  )}>
                    {/* Applied Credits Summary Row */}
                    {(storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0) && (
                      <div className="p-2 space-y-1.5 bg-muted/40 border-b border-border/50">
                        <div className="flex items-center justify-between px-1 mb-0.5">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Applied Credits</p>
                          {((storeScrapDeduction > 0 ? 1 : 0) + (storeReturnDeduction > 0 ? 1 : 0) + (pointsRedeemedDiscountCalc > 0 ? 1 : 0)) > 1 && (
                            <span className="text-[9px] font-bold text-foreground bg-primary/10 px-2 py-0.5 rounded-full">
                              Total Adj: -{formatCurrency((storeScrapDeduction || 0) + (storeReturnDeduction || 0) + (pointsRedeemedDiscountCalc || 0))}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 items-center">
                          {storeScrapDeduction > 0 && (
                            <div className="flex items-center justify-between p-1.5 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 rounded-xl transition-all duration-200 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <div className="p-1 bg-orange-500/10 text-orange-600 rounded-lg shrink-0">
                                  <Recycle className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[8px] font-black text-orange-600 uppercase tracking-wider leading-none">Scrap Credit</p>
                                  <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{storeScrapInvoiceNumber}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-1">
                                <span className="text-[11px] font-black text-orange-600">-{formatCurrency(storeScrapDeduction)}</span>
                                <button
                                  type="button"
                                  onClick={() => clearScrapDeduction()}
                                  title="Remove Scrap Credit"
                                  className="p-0.5 text-orange-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}

                          {storeReturnDeduction > 0 && (
                            <div className="flex items-center justify-between p-1.5 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-xl transition-all duration-200 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <div className="p-1 bg-rose-500/10 text-rose-600 rounded-lg shrink-0">
                                  <ArrowLeftRight className="w-3.5 h-3.5 text-rose-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[8px] font-black text-rose-600 uppercase tracking-wider leading-none">Return Credit</p>
                                  <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{storeReturnInvoiceNumber}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-1">
                                <span className="text-[11px] font-black text-rose-600">-{formatCurrency(storeReturnDeduction)}</span>
                                <button
                                  type="button"
                                  onClick={() => clearReturnDeduction()}
                                  title="Remove Return Credit"
                                  className="p-0.5 text-rose-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}

                          {pointsRedeemedDiscountCalc > 0 && (
                            <div className="flex items-center justify-between p-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded-xl transition-all duration-200 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <div className="p-1 bg-emerald-500/10 text-emerald-600 rounded-lg shrink-0">
                                  <Coins className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[8px] font-black text-emerald-600 uppercase tracking-wider leading-none">Points Credit</p>
                                  <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{pointsRedeemedCalc} pts</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-1">
                                <span className="text-[11px] font-black text-emerald-600">-{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                                <button
                                  type="button"
                                  onClick={() => setPointsToRedeem(0)}
                                  title="Remove Points Credit"
                                  className="p-0.5 text-emerald-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Deduction Tabs (Scrap / Return / Points) */}
                    {(isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled) && (
                      <div>
                        <div className="flex bg-muted/20 p-0.5 border-b border-border/40 gap-1">
                          {isScrapModuleEnabled && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeductionTabMode('scrap');
                                setReturnDeductionSearchMode(false);
                                setTimeout(() => scrapDeductionInputRef.current?.focus(), 50);
                              }}
                              className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                                effectiveDeductionMode === 'scrap'
                                  ? 'bg-orange-500/10 text-orange-600 shadow-sm'
                                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                              )}
                            >
                              <Recycle className="w-3.5 h-3.5" />
                              <span>Scrap</span>
                              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F9</span>
                            </button>
                          )}

                          {isReturnModuleEnabled && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeductionTabMode('return');
                                setReturnDeductionSearchMode(true);
                                setTimeout(() => returnDeductionInputRef.current?.focus(), 50);
                              }}
                              className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                                effectiveDeductionMode === 'return'
                                  ? 'bg-rose-500/10 text-rose-600 shadow-sm'
                                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                              )}
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                              <span>Return</span>
                              <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F10</span>
                            </button>
                          )}

                          {isLoyaltyModuleEnabled && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeductionTabMode('points');
                                setTimeout(() => pointsDeductionInputRef.current?.focus(), 50);
                              }}
                              className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                                effectiveDeductionMode === 'points'
                                  ? 'bg-emerald-500/10 text-emerald-600 shadow-sm'
                                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                              )}
                            >
                              <Coins className="w-3.5 h-3.5" />
                              <span>Points</span>
                              <span className="inline-flex items-center justify-center min-w-[20px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">Alt+L</span>
                            </button>
                          )}
                        </div>

                        {/* Dynamic Single Input Row */}
                        <div className="flex items-center gap-1 px-2 py-1.5">
                          <div className="flex-1 relative">
                            {effectiveDeductionMode === 'scrap' ? (
                              storeScrapDeduction > 0 ? (
                                <div className="flex items-center justify-between px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs font-bold text-orange-600">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <Recycle className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">Scrap #{storeScrapInvoiceNumber}: -{formatCurrency(storeScrapDeduction)} applied</span>
                                  </div>
                                  <button type="button" onClick={() => clearScrapDeduction()} className="text-orange-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <input
                                  ref={scrapDeductionInputRef}
                                  type="text"
                                  placeholder="Type scrap invoice number & Enter..."
                                  value={scrapDeductionSearchQuery}
                                  onChange={e => setScrapDeductionSearchQuery(e.target.value.toUpperCase())}
                                  onKeyDown={async e => {
                                    if (e.key === 'Enter') {
                                      const q = scrapDeductionSearchQuery.trim();
                                      if (!q) return;
                                      try {
                                        const res = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: q });
                                        if (res && res.totalAmount) {
                                          if (res.paymentStatus === 'SETTLED') {
                                            setHardwareError(`Scrap credit ${q} has already been redeemed.`);
                                            return;
                                          }
                                          setScrapDeduction(res.totalAmount, q);
                                          setScrapDeductionSearchQuery('');
                                          setScrapDeductionResults([]);
                                          setScrapDeductionDropdownStyle(null);
                                        } else {
                                          const getNumPart = getNumericPart;
                                          const numQ = getNumPart(q);
                                          const list = await window.electronAPI!.dbGetScrapInvoiceList({ tenant_id: tenantId || '' });
                                          if (Array.isArray(list)) {
                                            const match = list.find(inv =>
                                              inv.payment_status === 'PENDING' && getNumPart(String(inv.invoice_number)).includes(numQ)
                                            );
                                            if (match) {
                                              const detailRes = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: match.invoice_number });
                                              if (detailRes && detailRes.totalAmount) {
                                                if (detailRes.paymentStatus === 'SETTLED') {
                                                  setHardwareError(`Scrap credit ${match.invoice_number} has already been redeemed.`);
                                                  return;
                                                }
                                                setScrapDeduction(detailRes.totalAmount, match.invoice_number);
                                                setScrapDeductionSearchQuery('');
                                                setScrapDeductionResults([]);
                                                setScrapDeductionDropdownStyle(null);
                                                return;
                                              }
                                            }
                                          }
                                          setHardwareError(`Scrap invoice "${q}" not found`);
                                        }
                                      } catch (e) {
                                        setHardwareError('Failed to fetch scrap invoice');
                                      }
                                    }
                                    if (e.key === 'Escape') { setScrapDeductionResults([]); setScrapDeductionSearchQuery(''); setScrapDeductionDropdownStyle(null); }
                                  }}
                                  className="w-full pl-2.5 pr-2.5 py-1.5 bg-background border border-border hover:border-orange-500/40 rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 uppercase transition-all duration-200"
                                />
                              )
                            ) : effectiveDeductionMode === 'return' ? (
                              storeReturnDeduction > 0 ? (
                                <div className="flex items-center justify-between px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-600">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">Return #{storeReturnInvoiceNumber}: -{formatCurrency(storeReturnDeduction)} applied</span>
                                  </div>
                                  <button type="button" onClick={() => clearReturnDeduction()} className="text-rose-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <input
                                  ref={returnDeductionInputRef}
                                  type="text"
                                  placeholder="Type return number & Enter..."
                                  value={returnDeductionSearchQuery}
                                  onChange={e => setReturnDeductionSearchQuery(e.target.value.toUpperCase())}
                                  onKeyDown={async e => {
                                    if (e.key === 'Enter') {
                                      const q = returnDeductionSearchQuery.trim();
                                      if (!q) return;
                                      try {
                                        const res = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: q });
                                        if (res && res.grand_total) {
                                          const remaining = res.grand_total - (res.adjusted_amount || 0);
                                          if (remaining > 0) {
                                            setReturnDeduction(remaining, q);
                                            setReturnDeductionSearchQuery('');
                                            setReturnDeductionResults([]);
                                            setReturnDeductionDropdownStyle(null);
                                          } else {
                                            setHardwareError('Return already fully adjusted');
                                          }
                                        } else {
                                          const getNumPart = getNumericPart;
                                          const numQ = getNumPart(q);
                                          const list = await window.electronAPI!.dbGetPendingReturnInvoices({ tenant_id: tenantId || '' });
                                          if (Array.isArray(list)) {
                                            const match = list.find((r: any) => getNumPart(String(r.return_number)).includes(numQ));
                                            if (match) {
                                              const detailRes = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: match.return_number });
                                              if (detailRes && detailRes.grand_total) {
                                                const remaining = detailRes.grand_total - (detailRes.adjusted_amount || 0);
                                                if (remaining > 0) {
                                                  setReturnDeduction(remaining, match.return_number);
                                                  setReturnDeductionSearchQuery('');
                                                  setReturnDeductionResults([]);
                                                  setReturnDeductionDropdownStyle(null);
                                                  return;
                                                }
                                              }
                                            }
                                          }
                                          setHardwareError(`Return "${q}" not found`);
                                        }
                                      } catch (e) {
                                        setHardwareError('Failed to fetch return');
                                      }
                                    }
                                    if (e.key === 'Escape') { setReturnDeductionResults([]); setReturnDeductionSearchQuery(''); setReturnDeductionDropdownStyle(null); }
                                  }}
                                  className="w-full pl-2.5 pr-2.5 py-1.5 bg-background border border-border hover:border-rose-500/40 rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 uppercase transition-all duration-200"
                                />
                              )
                            ) : (
                              /* Points Dynamic Input */
                              <div className="flex items-center gap-1.5 w-full">
                                <input
                                  ref={pointsDeductionInputRef}
                                  type="text"
                                  inputMode="numeric"
                                  placeholder={customerPointsBalance > 0 ? `Enter points to redeem (Max ${customerPointsBalance} pts)...` : "0 pts available"}
                                  disabled={customerPointsBalance <= 0}
                                  value={pointsToRedeem > 0 ? pointsToRedeem : ''}
                                  onChange={e => {
                                    const clean = e.target.value.replace(/\D/g, '');
                                    const num = clean === '' ? 0 : Number(clean);
                                    const val = Math.max(0, Math.min(num, customerPointsBalance));
                                    setPointsToRedeem(clean === '' ? 0 : val);
                                  }}
                                  className="w-full pl-2.5 pr-2 py-1.5 bg-background border border-border hover:border-emerald-500/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-mono font-bold text-foreground placeholder:text-muted-foreground/30 focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                {customerPointsBalance > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setPointsToRedeem(customerPointsBalance)}
                                    className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl border border-emerald-500/20 transition-all shrink-0 cursor-pointer"
                                    title="Redeem maximum available points"
                                  >
                                    Max
                                  </button>
                                )}
                                {pointsRedeemedDiscountCalc > 0 && (
                                  <div className="flex items-center gap-1 text-xs font-black text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-xl shrink-0">
                                    <span>-{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                                    <button
                                      type="button"
                                      onClick={() => setPointsToRedeem(0)}
                                      className="p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
                                      title="Clear Points"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Bill Description Card (Directly Below Payment Methods in Scrollable Area) ── */}
            {showDescriptionState && (
              <BillDescriptionCard
                activeTabId={activeTabId}
                inputRef={descriptionInputRef}
                onKeyDown={() => {
                  if (discountRef.current) {
                    discountRef.current.focus();
                    discountRef.current.select();
                  }
                }}
              />
            )}

          </div>

          {/* ── STICKY FOOTER / RIGHT SIDE OF BOTTOM BAR: Totals + Actions ── */}
          <div className={clsx(
            uiConfig.orientation === 'horizontal-stack'
              ? "w-1/2 h-full overflow-y-auto flex flex-col justify-between bg-card px-5 py-3 shrink-0 border-l border-border"
              : "shrink-0 border-t border-border bg-background"
          )}>

            {/* Calculation breakdown */}
            <div className="px-5 pt-2.5 pb-0 space-y-1.5 text-xs border-b border-border">
              <div className="flex justify-between items-center pb-1 border-b border-border/40 text-muted-foreground transition-all duration-300">
                <span className="font-bold text-xs text-muted-foreground">Items Summary</span>
                <span className="font-extrabold text-xs text-foreground flex items-center gap-1.5">
                  <span className={clsx(items.length === 0 && 'text-muted-foreground/60')}>{totalProducts} {totalProducts === 1 ? 'Product' : 'Products'}</span>
                  <span className={clsx(items.length === 0 && 'text-muted-foreground/40')}>&middot;</span>
                  <span className={clsx(items.length === 0 && 'text-muted-foreground/60')}>{totalPcs} Pcs</span>
                  {totalKgs > 0 && (
                    <>
                      <span>&middot;</span>
                      <span className="text-amber-600 dark:text-amber-400">{totalKgs.toFixed(3)} Kg</span>
                    </>
                  )}
                </span>
              </div>

              {isReturnMode && returnDiscountTotal > 0.005 ? (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">Original Items Total</span>
                    <span className="font-semibold text-muted-foreground line-through font-mono">{formatCurrency(originalReturnTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">Invoice Discount Deducted</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">-{formatCurrency(returnDiscountTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold text-sm">Net Return Subtotal</span>
                    <span className="font-bold text-foreground text-sm font-mono">{formatCurrency(returnTotal)}</span>
                  </div>
                </>
              ) : (!isScrapMode ? subtotal > 0 : scrapTotal > 0) && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold text-sm">Items Subtotal</span>
                  <span className="font-bold text-foreground text-sm">{formatCurrency(isScrapMode ? scrapTotal : subtotal)}</span>
                </div>
              )}

              {invoiceType === 'GST' && totalTax > 0 && (
                <>
                  {igst > 0 ? (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">IGST (Out of State)</span>
                      <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(igst)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-sm">CGST</span>
                        <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(cgst)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-sm">SGST</span>
                        <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(sgst)}</span>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Discount row / Extra Bonus — hidden in return mode */}
              <div className={clsx('overflow-hidden transition-all duration-300 ease-in-out', isReturnMode ? 'max-h-0 opacity-0' : 'max-h-[60px] opacity-100')}>
              <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <div className="flex items-center gap-1.5">
                  {isScrapMode ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm flex items-center gap-1">
                        <span className="text-[10px] px-1 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded font-bold leading-none">+</span>
                        Extra / Bonus
                      </span>
                      <span className="inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 leading-none shadow-xs">F8</span>
                      {extraBonus > 0 && (
                        <span className="text-xs font-black text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">+{formatCurrency(extraBonus)}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground font-semibold text-sm">Discount</span>
                      <span className="inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 leading-none shadow-xs">F8</span>
                      {discount > 0 && (
                        <span className="text-xs font-black text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">-{formatCurrency(discount)}</span>
                      )}
                    </>
                  )}
                </div>
                {/* Merged 2-Column Discount Input (Percentage % | Flat Amount ₹) */}
                {(() => {
                  const discBase = isScrapMode ? scrapTotal : subtotal;

                  let pctVal = '';
                  let flatVal = '';

                  if (activeDiscField === 'PCT') {
                    pctVal = localDiscText;
                    const p = parseFloat(localDiscText);
                    if (discBase > 0 && !isNaN(p) && p > 0) {
                      flatVal = String(+((discBase * p) / 100).toFixed(2));
                    }
                  } else if (activeDiscField === 'FLAT') {
                    flatVal = localDiscText;
                    const f = parseFloat(localDiscText);
                    if (discBase > 0 && !isNaN(f) && f > 0) {
                      pctVal = String(+((f / discBase) * 100).toFixed(2));
                    }
                  } else {
                    if (discountType === 'PERCENTAGE') {
                      pctVal = discountValue > 0 ? String(discountValue) : '';
                      flatVal = discBase > 0 && discountValue > 0 ? String(+((discBase * discountValue) / 100).toFixed(2)) : '';
                    } else {
                      flatVal = discountValue > 0 ? String(discountValue) : '';
                      pctVal = discBase > 0 && discountValue > 0 ? String(+((discountValue / discBase) * 100).toFixed(2)) : '';
                    }
                  }

                  if (pctVal === '0' || pctVal === '0.00' || pctVal === '0.0') pctVal = '';
                  if (flatVal === '0' || flatVal === '0.00' || flatVal === '0.0') flatVal = '';

                  const commonKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isPct: boolean) => {
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      const input = e.target as HTMLInputElement;
                      if (input.selectionStart === 0 && input.selectionEnd === input.value.length) {
                        setDiscount(0, discountType);
                        setActiveDiscField(null);
                        setLocalDiscText('');
                      }
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCheckout();
                    } else if (e.key === 'ArrowRight' && isPct) {
                      e.preventDefault();
                      discountRef.current?.focus();
                      discountRef.current?.select();
                    } else if (e.key === 'ArrowLeft' && !isPct) {
                      e.preventDefault();
                      discountPercentRef.current?.focus();
                      discountPercentRef.current?.select();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (paymentMethod === 'CASH' || paymentMethod === 'CREDIT') {
                        receivedInputRef.current?.focus();
                        receivedInputRef.current?.select();
                      } else {
                        paymentOptionRefs.current[paymentMethod]?.focus();
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (showDescriptionState && descriptionInputRef.current) {
                        descriptionInputRef.current.focus();
                        descriptionInputRef.current.select();
                      } else if (items.length > 0) {
                        const lastItem = items[items.length - 1];
                        qtyRefs.current[lastItem.product_id]?.focus();
                        qtyRefs.current[lastItem.product_id]?.select();
                      } else {
                        searchRef.current?.focus();
                        searchRef.current?.select();
                      }
                    }
                  };

                  return (
                    <div className={clsx(
                      "flex items-center border rounded-xl overflow-hidden shadow-xs transition-all",
                      isScrapMode
                        ? "bg-emerald-500/10 border-emerald-500/30 focus-within:border-emerald-500/60"
                        : "bg-muted/30 border-border/70 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15"
                    )}>
                      {/* Percentage Input Column */}
                      <div className="flex items-center px-2 py-0.5 gap-1">
                        <Percent className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 pointer-events-none" />
                        <input
                          ref={discountPercentRef}
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          inputMode="decimal"
                          value={pctVal}
                          onChange={e => {
                            const raw = e.target.value;
                            setActiveDiscField('PCT');
                            setLocalDiscText(raw);
                            if (activeTab?.manualTotalOverride) updateActiveTab({ manualTotalOverride: null });
                            if (raw === '' || raw === null || parseFloat(raw) === 0) {
                              setDiscount(0, 'PERCENTAGE');
                            } else {
                              const parsed = Number(raw);
                              if (!isNaN(parsed) && parsed >= 0) {
                                setDiscount(parsed, 'PERCENTAGE');
                              }
                            }
                          }}
                          onFocus={e => {
                            setActiveDiscField('PCT');
                            if (discountType === 'PERCENTAGE' && discountValue > 0) {
                              setLocalDiscText(String(discountValue));
                            }
                            e.target.select();
                          }}
                          onBlur={() => {
                            setActiveDiscField(null);
                          }}
                          onKeyDown={e => commonKeyDown(e, true)}
                          placeholder=""
                          className="w-11 h-7 text-center bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>

                      {/* Vertical Separator */}
                      <span className="w-px h-4 bg-border/50 shrink-0" />

                      {/* Flat Amount Input Column */}
                      <div className="flex items-center px-2 py-0.5 gap-1">
                        <span className="text-xs font-black text-muted-foreground/60 shrink-0 pointer-events-none select-none">₹</span>
                        <input
                          ref={discountRef}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={flatVal}
                          onChange={e => {
                            const raw = e.target.value;
                            setActiveDiscField('FLAT');
                            setLocalDiscText(raw);
                            if (activeTab?.manualTotalOverride) updateActiveTab({ manualTotalOverride: null });
                            if (raw === '' || raw === null || parseFloat(raw) === 0) {
                              setDiscount(0, 'FIXED');
                            } else {
                              const parsed = Number(raw);
                              if (!isNaN(parsed) && parsed >= 0) {
                                setDiscount(parsed, 'FIXED');
                              }
                            }
                          }}
                          onFocus={e => {
                            setActiveDiscField('FLAT');
                            if (discountType === 'FIXED' && discountValue > 0) {
                              setLocalDiscText(String(discountValue));
                            }
                            e.target.select();
                          }}
                          onBlur={() => {
                            setActiveDiscField(null);
                          }}
                          onKeyDown={e => commonKeyDown(e, false)}
                          placeholder=""
                          className="w-14 h-7 text-right pr-0.5 bg-transparent border-0 text-xs font-bold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>



            {/* ── Adjustment Block (Normal Mode Only): combined scrap + return deduction ── */}
            {uiConfig.orientation !== 'horizontal-stack' && (
            <div className={clsx(
              'transition-all duration-400 ease-in-out',
              !isScrapMode && !isQuotationMode && !isReturnMode && (isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled || storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0)
                ? 'max-h-[500px] opacity-100 scale-100'
                : 'max-h-0 opacity-0 scale-95 pointer-events-none'
            )}>
              <div className={clsx(
                "px-0 py-0 mt-1 border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm",
                ((storeScrapDeduction > 0 ? 1 : 0) + (storeReturnDeduction > 0 ? 1 : 0) + (pointsRedeemedDiscountCalc > 0 ? 1 : 0)) > 1
                  ? "border-primary/20 bg-muted/5"
                  : storeScrapDeduction > 0
                    ? "border-orange-500/25 bg-orange-500/[0.01]"
                    : storeReturnDeduction > 0
                      ? "border-rose-500/25 bg-rose-500/[0.01]"
                      : pointsRedeemedDiscountCalc > 0
                        ? "border-emerald-500/25 bg-emerald-500/[0.01]"
                        : "border-border/60 bg-muted/5"
              )}>
                {/* Applied Credits Summary Row */}
                {(storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0) && (
                  <div className="p-2 space-y-1.5 bg-muted/40 border-b border-border/50">
                    <div className="flex items-center justify-between px-1 mb-0.5">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Applied Credits</p>
                      {((storeScrapDeduction > 0 ? 1 : 0) + (storeReturnDeduction > 0 ? 1 : 0) + (pointsRedeemedDiscountCalc > 0 ? 1 : 0)) > 1 && (
                        <span className="text-[9px] font-bold text-foreground bg-primary/10 px-2 py-0.5 rounded-full">
                          Total Adj: -{formatCurrency((storeScrapDeduction || 0) + (storeReturnDeduction || 0) + (pointsRedeemedDiscountCalc || 0))}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 items-center">
                      {storeScrapDeduction > 0 && (
                        <div className="flex items-center justify-between p-1.5 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 rounded-xl transition-all duration-200 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <div className="p-1 bg-orange-500/10 text-orange-600 rounded-lg shrink-0">
                              <Recycle className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[8px] font-black text-orange-600 uppercase tracking-wider leading-none">Scrap Credit</p>
                              <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{storeScrapInvoiceNumber}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            <span className="text-[11px] font-black text-orange-600">-{formatCurrency(storeScrapDeduction)}</span>
                            <button
                              type="button"
                              onClick={() => clearScrapDeduction()}
                              title="Remove Scrap Credit"
                              className="p-0.5 text-orange-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {storeReturnDeduction > 0 && (
                        <div className="flex items-center justify-between p-1.5 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-xl transition-all duration-200 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <div className="p-1 bg-rose-500/10 text-rose-600 rounded-lg shrink-0">
                              <ArrowLeftRight className="w-3.5 h-3.5 text-rose-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[8px] font-black text-rose-600 uppercase tracking-wider leading-none">Return Credit</p>
                              <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{storeReturnInvoiceNumber}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            <span className="text-[11px] font-black text-rose-600">-{formatCurrency(storeReturnDeduction)}</span>
                            <button
                              type="button"
                              onClick={() => clearReturnDeduction()}
                              title="Remove Return Credit"
                              className="p-0.5 text-rose-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {pointsRedeemedDiscountCalc > 0 && (
                        <div className="flex items-center justify-between p-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded-xl transition-all duration-200 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <div className="p-1 bg-emerald-500/10 text-emerald-600 rounded-lg shrink-0">
                              <Coins className="w-3.5 h-3.5 text-emerald-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[8px] font-black text-emerald-600 uppercase tracking-wider leading-none">Points Credit</p>
                              <p className="text-[10px] font-mono font-bold text-foreground truncate mt-0.5">{pointsRedeemedCalc} pts</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            <span className="text-[11px] font-black text-emerald-600">-{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                            <button
                              type="button"
                              onClick={() => setPointsToRedeem(0)}
                              title="Remove Points Credit"
                              className="p-0.5 text-emerald-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Deduction Tabs (Scrap / Return / Points) */}
                {(isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled) && (
                  <div>
                    <div className="flex bg-muted/20 p-0.5 border-b border-border/40 gap-1">
                      {isScrapModuleEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeductionTabMode('scrap');
                            setReturnDeductionSearchMode(false);
                            setTimeout(() => scrapDeductionInputRef.current?.focus(), 50);
                          }}
                          className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                            effectiveDeductionMode === 'scrap'
                              ? 'bg-orange-500/10 text-orange-600 shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <Recycle className="w-3.5 h-3.5" />
                          <span>Scrap</span>
                          <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F9</span>
                        </button>
                      )}

                      {isReturnModuleEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeductionTabMode('return');
                            setReturnDeductionSearchMode(true);
                            setTimeout(() => returnDeductionInputRef.current?.focus(), 50);
                          }}
                          className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                            effectiveDeductionMode === 'return'
                              ? 'bg-rose-500/10 text-rose-600 shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>Return</span>
                          <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F10</span>
                        </button>
                      )}

                      {isLoyaltyModuleEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeductionTabMode('points');
                            setTimeout(() => pointsDeductionInputRef.current?.focus(), 50);
                          }}
                          className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                            effectiveDeductionMode === 'points'
                              ? 'bg-emerald-500/10 text-emerald-600 shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>Points</span>
                          <span className="inline-flex items-center justify-center min-w-[20px] h-4 px-1 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">Alt+L</span>
                        </button>
                      )}
                    </div>

                    {/* Dynamic Single Input Row */}
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <div className="flex-1 relative">
                        {effectiveDeductionMode === 'scrap' ? (
                          storeScrapDeduction > 0 ? (
                            <div className="flex items-center justify-between px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs font-bold text-orange-600">
                              <div className="flex items-center gap-1.5 truncate">
                                <Recycle className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Scrap #{storeScrapInvoiceNumber}: -{formatCurrency(storeScrapDeduction)} applied</span>
                              </div>
                              <button type="button" onClick={() => clearScrapDeduction()} className="text-orange-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <input
                              ref={scrapDeductionInputRef}
                              type="text"
                              placeholder="Type scrap invoice number & Enter..."
                              value={scrapDeductionSearchQuery}
                              onChange={e => setScrapDeductionSearchQuery(e.target.value.toUpperCase())}
                              onKeyDown={async e => {
                                if (e.key === 'Enter') {
                                  const q = scrapDeductionSearchQuery.trim();
                                  if (!q) return;
                                  try {
                                    const res = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: q });
                                    if (res && res.totalAmount) {
                                      if (res.paymentStatus === 'SETTLED') {
                                        setHardwareError(`Scrap credit ${q} has already been redeemed.`);
                                        return;
                                      }
                                      setScrapDeduction(res.totalAmount, q);
                                      setScrapDeductionSearchQuery('');
                                      setScrapDeductionResults([]);
                                      setScrapDeductionDropdownStyle(null);
                                    } else {
                                      const getNumPart = getNumericPart;
                                      const numQ = getNumPart(q);
                                      const list = await window.electronAPI!.dbGetScrapInvoiceList({ tenant_id: tenantId || '' });
                                      if (Array.isArray(list)) {
                                        const match = list.find(inv =>
                                          inv.payment_status === 'PENDING' && getNumPart(String(inv.invoice_number)).includes(numQ)
                                        );
                                        if (match) {
                                          const detailRes = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: match.invoice_number });
                                          if (detailRes && detailRes.totalAmount) {
                                            if (detailRes.paymentStatus === 'SETTLED') {
                                              setHardwareError(`Scrap credit ${match.invoice_number} has already been redeemed.`);
                                              return;
                                            }
                                            setScrapDeduction(detailRes.totalAmount, match.invoice_number);
                                            setScrapDeductionSearchQuery('');
                                            setScrapDeductionResults([]);
                                            setScrapDeductionDropdownStyle(null);
                                            return;
                                          }
                                        }
                                      }
                                      setHardwareError(`Scrap invoice "${q}" not found`);
                                    }
                                  } catch (e) {
                                    setHardwareError('Failed to fetch scrap invoice');
                                  }
                                }
                                if (e.key === 'Escape') { setScrapDeductionResults([]); setScrapDeductionSearchQuery(''); setScrapDeductionDropdownStyle(null); }
                              }}
                              className="w-full pl-2.5 pr-2.5 py-1.5 bg-background border border-border hover:border-orange-500/40 rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 uppercase transition-all duration-200"
                            />
                          )
                        ) : effectiveDeductionMode === 'return' ? (
                          storeReturnDeduction > 0 ? (
                            <div className="flex items-center justify-between px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-600">
                              <div className="flex items-center gap-1.5 truncate">
                                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Return #{storeReturnInvoiceNumber}: -{formatCurrency(storeReturnDeduction)} applied</span>
                              </div>
                              <button type="button" onClick={() => clearReturnDeduction()} className="text-rose-600/70 hover:text-destructive p-0.5 cursor-pointer shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <input
                              ref={returnDeductionInputRef}
                              type="text"
                              placeholder="Type return number & Enter..."
                              value={returnDeductionSearchQuery}
                              onChange={e => setReturnDeductionSearchQuery(e.target.value.toUpperCase())}
                              onKeyDown={async e => {
                                if (e.key === 'Enter') {
                                  const q = returnDeductionSearchQuery.trim();
                                  if (!q) return;
                                  try {
                                    const res = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: q });
                                    if (res && res.grand_total) {
                                      const remaining = res.grand_total - (res.adjusted_amount || 0);
                                      if (remaining > 0) {
                                        setReturnDeduction(remaining, q);
                                        setReturnDeductionSearchQuery('');
                                        setReturnDeductionResults([]);
                                        setReturnDeductionDropdownStyle(null);
                                      } else {
                                        setHardwareError('Return already fully adjusted');
                                      }
                                    } else {
                                      const getNumPart = getNumericPart;
                                      const numQ = getNumPart(q);
                                      const list = await window.electronAPI!.dbGetPendingReturnInvoices({ tenant_id: tenantId || '' });
                                      if (Array.isArray(list)) {
                                        const match = list.find((r: any) => getNumPart(String(r.return_number)).includes(numQ));
                                        if (match) {
                                          const detailRes = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: match.return_number });
                                          if (detailRes && detailRes.grand_total) {
                                            const remaining = detailRes.grand_total - (detailRes.adjusted_amount || 0);
                                            if (remaining > 0) {
                                              setReturnDeduction(remaining, match.return_number);
                                              setReturnDeductionSearchQuery('');
                                              setReturnDeductionResults([]);
                                              setReturnDeductionDropdownStyle(null);
                                              return;
                                            }
                                          }
                                        }
                                      }
                                      setHardwareError(`Return "${q}" not found`);
                                    }
                                  } catch (e) {
                                    setHardwareError('Failed to fetch return');
                                  }
                                }
                                if (e.key === 'Escape') { setReturnDeductionResults([]); setReturnDeductionSearchQuery(''); setReturnDeductionDropdownStyle(null); }
                              }}
                              className="w-full pl-2.5 pr-2.5 py-1.5 bg-background border border-border hover:border-rose-500/40 rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 uppercase transition-all duration-200"
                            />
                          )
                        ) : (
                          /* Points Dynamic Input */
                          <div className="flex items-center gap-1.5 w-full">
                            <input
                              ref={pointsDeductionInputRef}
                              type="text"
                              inputMode="numeric"
                              placeholder={customerPointsBalance > 0 ? `Enter points to redeem (Max ${customerPointsBalance} pts)...` : "0 pts available"}
                              disabled={customerPointsBalance <= 0}
                              value={pointsToRedeem > 0 ? pointsToRedeem : ''}
                              onChange={e => {
                                const clean = e.target.value.replace(/\D/g, '');
                                const num = clean === '' ? 0 : Number(clean);
                                const val = Math.max(0, Math.min(num, customerPointsBalance));
                                setPointsToRedeem(clean === '' ? 0 : val);
                              }}
                              className="w-full pl-2.5 pr-2 py-1.5 bg-background border border-border hover:border-emerald-500/40 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-mono font-bold text-foreground placeholder:text-muted-foreground/30 focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            {customerPointsBalance > 0 && (
                              <button
                                type="button"
                                onClick={() => setPointsToRedeem(customerPointsBalance)}
                                className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl border border-emerald-500/20 transition-all shrink-0 cursor-pointer"
                                title="Redeem maximum available points"
                              >
                                Max
                              </button>
                            )}
                            {pointsRedeemedDiscountCalc > 0 && (
                              <div className="flex items-center gap-1 text-xs font-black text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-xl shrink-0">
                                <span>-{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                                <button
                                  type="button"
                                  onClick={() => setPointsToRedeem(0)}
                                  className="p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
                                  title="Clear Points"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Scrap items row — shown in scrap mode with scrap cart items */}
            <div className={clsx(
              'overflow-hidden transition-all duration-300 ease-in-out',
              scrapTotal > 0 && isScrapMode && !isQuotationMode && enableScrap
                ? 'max-h-[80px] opacity-100'
                : 'max-h-0 opacity-0'
            )}>
              <div className="flex justify-between items-center pt-1 border-t border-border/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-orange-600">Scrap Items</span>
                  {Object.values(
                    items.filter(i => i.isScrap).reduce((acc, s) => {
                      const key = s.scrap_category_id || '';
                      if (!acc[key]) acc[key] = { name: s.name, quantity: 0 };
                      acc[key].quantity += Number(s.quantity || 0);
                      return acc;
                    }, {} as Record<string, { name: string; quantity: number }>)
                  ).map(s => (
                    <span key={s.name} className="text-[10px] text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded-full ml-1">
                      {s.name} {s.quantity.toFixed(3)}Kg
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded-full">
                    {formatCurrency(scrapTotal)}
                  </span>
                </div>
              </div>
            </div>

            </div>

            {/* Loyalty Redemption Discount in Totals */}
            {pointsRedeemedDiscountCalc > 0 && (
              <div className="mx-3 mb-1 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Gift className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300 truncate">
                    Loyalty Discount ({pointsRedeemedCalc} pts)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono">
                    -{formatCurrency(pointsRedeemedDiscountCalc)}
                  </span>
                  <button
                    onClick={() => { setPointsToRedeem(0); setShowLoyaltyRedemption(false); }}
                    title="Remove Loyalty Discount"
                    className="p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Grand Total + Received + Change */}
            <div className="mx-3 my-1.5 flex items-center gap-1.5 px-3 py-3 bg-primary/10 border-2 border-primary/25 rounded-2xl">
              {/* Total amount */}
              <div className={clsx(
                'flex min-w-0 items-start justify-between gap-2',
                refundAmount > 0 && !isLoadingEditBill && paymentMethod !== 'CASH' && paymentMethod !== 'CREDIT' ? 'flex-[1.5]' : 'flex-1'
              )}>
                <div className="min-w-0 shrink-0">
                  <p className="text-[9px] font-black text-primary uppercase tracking-wider">
                    {isReturnMode ? 'Return Total' : isScrapMode ? 'Scrap Total' : (storeScrapDeduction > 0 || storeReturnDeduction > 0) ? 'After Adj.' : 'Total'}
                  </p>
                  {isLoadingEditBill ? (
                    <Skeleton className="h-6 w-28 my-1 rounded-md" />
                  ) : isEditingTotal ? (
                    <div className="relative mt-1">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-sm font-black text-primary select-none">₹</span>
                      <input
                        ref={totalOverrideInputRef}
                        type="number"
                        step="any"
                        min="0"
                        value={overrideTotalInput}
                        onChange={(e) => setOverrideTotalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitTotalOverride();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsEditingTotal(false);
                          }
                        }}
                        onBlur={() => commitTotalOverride()}
                        placeholder={String(rawDisplayGrandTotal)}
                        className="w-32 pl-5 pr-2 py-0.5 bg-background border-2 border-primary rounded-xl text-xl font-black text-foreground outline-none no-spinners shadow-xs"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <p
                      onClick={startEditingTotal}
                      title="Click to edit total"
                      className="text-xl font-black text-foreground leading-none cursor-pointer mt-0.5 hover:text-primary transition-colors select-none"
                    >
                      {formatCurrency(displayGrandTotal)}
                    </p>
                  )}
                  {isGrandTotalOverridden && !isLoadingEditBill && (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20">
                        Overridden (Base: {formatCurrency(rawDisplayGrandTotal + (discount || 0))})
                      </span>
                      <button
                        type="button"
                        onClick={handleResetGrandTotalOverride}
                        title="Reset to calculated total"
                        className="text-[9px] font-extrabold text-destructive hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                  {refundAmount > 0 && !isLoadingEditBill && (
                    <p className="mt-1.5 text-[10px] font-black text-orange-600">
                      Refund: {formatCurrency(refundAmount)}
                    </p>
                  )}
                </div>
                {refundAmount > 0 && !isLoadingEditBill && paymentMethod !== 'CASH' && paymentMethod !== 'CREDIT' && (
                  <div className="mt-1 ml-auto flex shrink-0 flex-col items-end gap-1">
                    <div className="inline-flex w-[190px] max-w-full items-center justify-between gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-2.5 py-1.5 shadow-sm">
                      <span className="text-[10px] font-black uppercase tracking-wide text-orange-700 dark:text-orange-300">Paid</span>
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-orange-600/70">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={actualRefundPaid || ''}
                          placeholder={String(refundAmount)}
                          onChange={e => updateActiveTab({ actualRefundPaid: e.target.value === '' ? 0 : Number(e.target.value) })}
                          onFocus={e => e.target.select()}
                          aria-label="Amount paid as refund"
                          className="no-spinners h-8 w-full rounded-lg border border-orange-300/50 bg-background/90 pl-6 pr-2 text-right text-sm font-black tabular-nums text-orange-700 shadow-inner transition-colors placeholder:text-orange-400/60 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400/30 dark:text-orange-300"
                        />
                      </div>
                    </div>
                    {actualRefundPaid > refundAmount && (
                      <p className="text-[9px] font-bold text-rose-500">
                        Over by {formatCurrency(actualRefundPaid - refundAmount)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {/* Divider — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
              <div className={clsx('w-px h-8 bg-primary/20 transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0' : 'opacity-100')} />
              {/* Received input — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
              <div className={clsx('flex-1 min-w-0 transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
                  {paymentMethod === 'CREDIT' ? 'Paid' : 'Received'}
                </p>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground/60">₹</span>
                  <input
                    ref={receivedInputRef}
                    type="number"
                    min="0"
                    step="any"
                    value={receivedAmount || ''}
                    onChange={e => updateActiveTab({ receivedAmount: e.target.value === '' ? 0 : Number(e.target.value) })}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        focusDescriptionOrDiscount();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        focusDescriptionOrDiscount();
                      } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
                        e.preventDefault();
                        paymentOptionRefs.current[paymentMethod]?.focus();
                      }
                    }}
                    placeholder={(Number(grandTotal) || 0).toFixed(2)}
                    inputMode="decimal"
                    className="w-full pl-5 pr-2 py-1.5 bg-background/80 border border-border focus:border-primary focus:ring-1 focus:ring-primary/15 rounded-lg text-sm font-black text-right text-foreground placeholder:text-muted-foreground/35 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              {/* Change / New Total Due input — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
              {(() => {
                const effectivePaid = paymentMethod === 'CREDIT'
                  ? (receivedAmount || 0)
                  : paymentMethod === 'SPLIT'
                  ? (splitTotal > 0 ? splitTotal : Math.max(0, displayGrandTotal - (Number(splitDetails?.credit) || 0)))
                  : paymentMethod === 'PENDING'
                  ? 0
                  : ((receivedAmount && receivedAmount > 0) ? receivedAmount : displayGrandTotal);

                const selectedPartyObj = findMatchingParty(customerName, customerPhone);
                const uiPartyKey = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
                const uiIsStaffParty = String(selectedPartyObj?.party_type || '').toUpperCase() === 'STAFF';
                const uiEditingContribution = editingActive && !uiIsStaffParty && activeTab?.editingInvoicePartyKey === uiPartyKey
                  ? (Number(activeTab?.editingInvoiceContribution) || 0)
                  : 0;
                const partyOldBalance = selectedPartyObj ? (Number(selectedPartyObj.balance) || 0) - uiEditingContribution : 0;
                const isCreditCustomer = partyOldBalance !== 0 || paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && Number(splitDetails?.credit) > 0);

                if (isCreditCustomer) {
                  const netNewDue = partyOldBalance + displayGrandTotal - effectivePaid;
                  const isDue = netNewDue > 0;
                  return (
                    <div className={clsx('flex-1 min-w-0 max-w-[150px] transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
                      <p className="text-[9px] font-black uppercase tracking-wider mb-0.5 text-amber-600 dark:text-amber-400">
                        {isDue ? 'New Total Due' : 'Advance Balance'}
                      </p>
                      <div className="relative">
                        <span className={clsx(
                          'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                          isDue ? 'text-amber-500' : 'text-emerald-500'
                        )}>₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={Math.abs(netNewDue).toFixed(2)}
                          readOnly
                          inputMode="decimal"
                          className={clsx(
                            'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                            isDue
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                          )}
                        />
                      </div>
                    </div>
                  );
                }

                // Regular Cash / Non-Credit Customer:
                const isOverpaid = effectivePaid >= displayGrandTotal;
                const changeVal = Math.abs(effectivePaid - displayGrandTotal);

                return (
                  <div className={clsx('flex-1 min-w-0 max-w-[140px] transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
                      Change
                    </p>
                    <div className="relative">
                      <span className={clsx(
                        'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                        isOverpaid ? 'text-emerald-500' : 'text-amber-500'
                      )}>₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={changeVal.toFixed(2)}
                        readOnly
                        inputMode="decimal"
                        className={clsx(
                          'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                          isOverpaid
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        )}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>



            {/* Action buttons (Dynamic responsive scaling based on desktop screen size) */}
            <div className="flex gap-1.5 sm:gap-2 md:gap-2.5 px-2.5 py-2 sm:px-3.5 sm:py-2.5 md:px-4 md:py-3 transition-all">
              {isQuotationActive ? (
                /* ── Quotation Mode (Create or Edit) ── */
                <>
                  <button
                    onClick={() => handleSaveQuotation(false)}
                    disabled={quotationSaving || items.length === 0}
                    className="w-[20%] sm:w-[22%] md:w-[25%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-blue-400/60 text-blue-600 dark:text-blue-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
                  >
                    <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={handleWhatsAppSendActiveBill}
                    disabled={isSendingWhatsApp || items.length === 0}
                    className="px-2.5 sm:px-3 md:px-3.5 py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-emerald-500/10 hover:border-emerald-500 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
                    title="Send Active Bill via WhatsApp"
                  >
                    {isSendingWhatsApp ? (
                      <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
                    ) : (
                      <WhatsAppIcon className="w-4 h-4 fill-emerald-500 text-emerald-500 shrink-0" />
                    )}
                    <span className="hidden sm:inline">WhatsApp</span>
                  </button>
                  <button
                    onClick={() => handleSaveQuotation(true)}
                    disabled={quotationSaving || items.length === 0}
                    className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-blue-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-blue-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {quotationSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                        <span className="truncate">SAVING...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                        <span className="truncate">{editingQuotationId ? 'UPDATE & PRINT (F12)' : 'SAVE & PRINT (F12)'}</span>
                      </>
                    )}
                  </button>
                </>
              ) : isReturnMode ? (
                /* ── Return Mode ── */
                <>
                  <button
                    onClick={() => handleProcessReturnFromCart(true)}
                    disabled={returnProcessing || items.length === 0}
                    className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-rose-400/60 text-rose-600 dark:text-rose-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-rose-500/10 hover:border-rose-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
                  >
                    <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleProcessReturnFromCart()}
                    disabled={returnProcessing || items.length === 0}
                    className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-rose-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-rose-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {returnProcessed ? (
                      <><CheckCircle2 className="w-4 h-4 shrink-0" /><span className="truncate">RETURN PROCESSED!</span></>
                    ) : returnProcessing ? (
                      <>
                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                        <span className="truncate">PROCESSING...</span>
                      </>
                    ) : (
                      <>
                        <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                        <span className="truncate">PROCESS &amp; PRINT (F12)</span>
                      </>
                    )}
                  </button>
                </>
              ) : isScrapMode ? (
                /* ── Scrap Mode ── */
                <>
                  <button
                    onClick={() => handleCheckout(true)}
                    disabled={isCheckingOut || items.length === 0}
                    className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-orange-400/60 text-orange-600 dark:text-orange-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-orange-500/10 hover:border-orange-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
                  >
                    <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleCheckout()}
                    disabled={isCheckingOut || items.length === 0}
                    className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-orange-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-orange-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {isCheckingOut ? (
                      <>
                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                        <span className="truncate">SAVING...</span>
                      </>
                    ) : (
                      <>
                        <Recycle className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                        <span className="truncate">SAVE &amp; PRINT (F12)</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                /* ── Normal Billing Mode ── */
                <>
                  <button
                    onClick={handleHoldBill}
                    disabled={items.length === 0}
                    className="relative w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-border text-muted-foreground font-black text-xs sm:text-xs md:text-sm lg:text-base hover:bg-muted hover:text-foreground hover:border-muted-foreground/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer flex items-center justify-center gap-1 shrink-0"
                    title="Hold Bill (F3)"
                  >
                    <span>Hold</span>
                    <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-4 sm:h-4.5 px-1 sm:px-1.5 text-[8px] sm:text-[9px] font-black rounded-full leading-none shadow-xs border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F3</span>
                  </button>
                  <button
                    onClick={() => handleCheckout(true)}
                    disabled={isCheckingOut || items.length === 0}
                    className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-amber-400/60 text-amber-600 dark:text-amber-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-amber-500/10 hover:border-amber-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
                  >
                    <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    ref={checkoutBtnRef}
                    onClick={() => handleCheckout()}
                    disabled={isCheckingOut || items.length === 0}
                    className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {isCheckingOut ? (
                      <>
                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin shrink-0" />
                        <span className="truncate">FINALIZING...</span>
                      </>
                    ) : editingActive ? (
                      <>
                        <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                        <span className="truncate">UPDATE &amp; PRINT (F12)</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                        <span className="truncate">PRINT (F12)</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ─── Held Bills / Drafts Modal ─── */}
      <Modal
        isOpen={showHeldBillsPanel}
        onClose={() => setShowHeldBillsPanel(false)}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <PauseCircle className="w-5 h-5 text-amber-500" />
            <span>Held Bills / Drafts ({heldBills.length})</span>
          </div>
        }
      >
        <div className="space-y-3 min-w-[540px] max-w-2xl text-foreground">
          {heldBillsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : heldBills.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground space-y-2">
              <PauseCircle className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="font-bold text-sm text-foreground/80">No Held Bills</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                When you click <strong className="text-foreground">Hold (F3)</strong> on active items in cart, they will be saved here so you can resume them anytime within 24 hours.
              </p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-2.5 pr-1">
              {heldBills.map((bill: any) => {
                const billId = bill.invoice_id || bill.id;
                const invNum = bill.invoice_number || bill.id?.substring(0, 8) || 'HLD';
                const createdTime = bill.created_at ? parseUTCDate(bill.created_at).toLocaleString('en-IN', { timeZone: getStoreTimezone() }) : (bill.heldAt ? parseUTCDate(bill.heldAt).toLocaleString('en-IN', { timeZone: getStoreTimezone() }) : '');
                const totalAmt = Number(bill.grand_total) || 0;
                const itemCount = Array.isArray(bill.items) ? bill.items.length : 0;
                const customer = bill.customer_name || bill.customerName || (bill.customer_phone || bill.customerPhone ? (bill.customer_phone || bill.customerPhone) : 'Walk-in Customer');

                return (
                  <div key={billId} className="flex items-center justify-between p-3.5 bg-card border border-border/80 hover:border-amber-500/50 rounded-2xl transition-all duration-200 shadow-2xs group gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-foreground">{invNum}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">HELD</span>
                        <span className="text-xs text-muted-foreground">{createdTime}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>👤 <strong className="text-foreground/80">{customer}</strong></span>
                        {itemCount > 0 && <span>• {itemCount} Item{itemCount > 1 ? 's' : ''}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-base font-black text-foreground">{formatCurrency(totalAmt)}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRecallHeldBill(bill)}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                          title="Resume / Recall Bill"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Take / Resume</span>
                        </button>
                        <button
                          onClick={() => handleReleaseHeldBill(billId)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-95 cursor-pointer"
                          title="Discard / Delete Held Bill"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* ─── Scrap Invoice View Modal ─── */}
      <Modal
        isOpen={showScrapInvoiceView}
        onClose={() => { setShowScrapInvoiceView(false); setScrapInvoiceViewData(null); }}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Recycle className="w-5 h-5 text-orange-500" />
            <span>Scrap Invoice {scrapInvoiceViewData?.invoiceNumber || ''}</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[520px] text-foreground">
          {scrapInvoiceViewLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : scrapInvoiceViewData ? (
            <>
              <div className="flex items-center justify-between p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Deduction</p>
                  <p className="text-2xl font-black text-orange-500 mt-1">{formatCurrency(scrapInvoiceViewData.totalAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Invoice</p>
                  <p className="text-sm font-bold text-foreground mt-1">{scrapInvoiceViewData.invoiceNumber}</p>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
                  <div className="col-span-4">Category</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Total</div>
                  <div className="col-span-2 text-center">Date</div>
                </div>
                <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
                  {scrapInvoiceViewData.transactions.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">No transactions found</div>
                  ) : scrapInvoiceViewData.transactions.map((tx: any) => (
                    <div key={tx.transaction_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm bg-card hover:bg-muted/20 transition-colors">
                      <div className="col-span-4 font-bold text-foreground/90 truncate">{tx.scrap_category_name || 'Unknown'}</div>
                      <div className="col-span-2 text-right font-semibold">{Number(tx.quantity).toFixed(3)}</div>
                      <div className="col-span-2 text-right font-semibold">{formatCurrency(tx.rate)}</div>
                      <div className="col-span-2 text-right font-bold text-orange-600">{formatCurrency(tx.total_amount)}</div>
                      <div className="col-span-2 text-center text-xs text-muted-foreground">{parseUTCDate(tx.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}</div>
                    </div>
                  ))}
                </div>
              </div>

              {scrapInvoiceViewData.transactions.length > 0 && (
                <div className="flex justify-end pt-1">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground font-semibold">Total Items:</span>
                    <span className="font-bold">{scrapInvoiceViewData.transactions.length}</span>
                    <span className="text-muted-foreground/40">|</span>
                    <span className="text-muted-foreground font-semibold">Grand Total:</span>
                    <span className="font-black text-lg text-orange-600">{formatCurrency(scrapInvoiceViewData.totalAmount)}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">No data found for this scrap invoice</div>
          )}

          <div className="flex justify-end pt-2 border-t border-border">
            <button
              onClick={() => { setShowScrapInvoiceView(false); setScrapInvoiceViewData(null); }}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Return Deduction Dropdown (fixed position) ─── */}
      {returnDeductionResults.length > 0 && returnDeductionDropdownStyle && (
        <div id="return-deduction-dropdown" style={returnDeductionDropdownStyle} className="bg-card border border-border rounded-xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="max-h-[260px] overflow-y-auto">
            <div className="px-3 py-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border">
              Returns with Pending Balance
            </div>
            {returnDeductionResults.map((r, _i) => (
              <button
                key={r.return_number}
                onClick={async () => {
                  try {
                    const res = await window.electronAPI!.dbGetReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: r.return_number });
                    if (res && res.grand_total) {
                      const remaining = res.grand_total - (res.adjusted_amount || 0);
                      if (remaining > 0) {
                        setReturnDeduction(remaining, r.return_number);
                        setReturnDeductionSearchQuery('');
                        setReturnDeductionResults([]);
                        setReturnDeductionDropdownStyle(null);
                      } else {
                        setHardwareError('Return already fully adjusted');
                      }
                    }
                  } catch (e) {
                    setHardwareError('Failed to fetch return');
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-rose-500/5 border-b border-border last:border-0 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{r.return_number}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.customer_name || 'N/A'}</p>
                </div>
                <span className="text-xs font-black text-rose-600 shrink-0">{formatCurrency(r.grand_total - (r.adjusted_amount || 0))}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Scrap Deduction Dropdown (fixed position, outside overflow containers) ─── */}
      {scrapDeductionResults.length > 0 && scrapDeductionDropdownStyle && (
        <div id="scrap-deduction-dropdown" style={scrapDeductionDropdownStyle} className="bg-card border border-border rounded-xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="max-h-[260px] overflow-y-auto">
            <div className="px-3 py-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border">
              Pending Scrap Invoices
            </div>
            {scrapDeductionResults.map((inv, _i) => (
              <button
                key={inv.invoice_number}
                onClick={async () => {
                  try {
                    const res = await window.electronAPI!.dbGetScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: inv.invoice_number });
                    if (res && res.totalAmount) {
                      if (res.paymentStatus === 'SETTLED') {
                        setHardwareError(`Scrap credit ${inv.invoice_number} has already been redeemed.`);
                        return;
                      }
                      setScrapDeduction(res.totalAmount, inv.invoice_number);
                      setScrapDeductionSearchQuery('');
                      setScrapDeductionResults([]);
                      setScrapDeductionDropdownStyle(null);
                    } else {
                      setHardwareError('Scrap invoice not found');
                    }
                  } catch (e) {
                    setHardwareError('Failed to fetch scrap invoice');
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-500/5 border-b border-border last:border-0 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-foreground truncate">{inv.invoice_number}</div>
                  <div className="text-[10px] text-muted-foreground">
                    <span className="text-amber-500 font-semibold">Pending</span> · {Number(inv.total_qty || 0).toFixed(1)} qty · {parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}
                  </div>
                </div>
                <div className="text-xs font-black text-orange-600">{formatCurrency(inv.total_amount)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Create Product Modal ─── */}
      {showProductCreateForm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[100]" />
          <div ref={productFormDialogRef} className="fixed inset-0 z-[101] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) resetProductForm(); }}>
            <div className="w-full max-w-6xl bg-card dark:bg-card border border-border rounded-[28px] shadow-2xl overflow-hidden" onKeyDown={handleFormKeyDown}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-primary uppercase tracking-wider">{editingProductId ? 'Edit Product' : 'New Product'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => {
                    const next = productFormView === 'grid' ? 'list' : 'grid';
                    setProductFormView(next);
                    localStorage.setItem('productFormView', next);
                  }}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-border/30"
                    title={productFormView === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}>
                    {productFormView === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={resetProductForm}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
                    title="Close">
                    <X className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
              <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3" data-enter-nav>
                {/* 1. Basic Details */}
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Package className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-primary uppercase tracking-wider">1. Basic Details</span>
                  </div>
                  {productFormView === 'list' ? (
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Name *</label>
                        <input ref={firstInputRef} type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                      </div>
                      <div className="flex-1 min-w-[90px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Code</label>
                        <input type="text" maxLength={10} value={newProductItemCode} onChange={e => setNewProductItemCode(e.target.value.toUpperCase())}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest uppercase text-sm" />
                      </div>
                      <div className="flex-1 min-w-[110px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Category</label>
                        {newProductIsCustomCategory ? (
                          <div className="relative">
                            <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Category"
                              className="w-full bg-background border border-border rounded-lg p-2.5 pr-9 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                            <button type="button" onClick={() => { setNewProductIsCustomCategory(false); setNewProductCategory(''); }} title="Cancel custom category"
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer transition-all">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <Select
                            value={configuredCategories.includes(newProductCategory) ? newProductCategory : (newProductCategory ? 'CUSTOM' : '')}
                            onChange={v => {
                              if (v === 'CUSTOM') { setNewProductIsCustomCategory(true); setNewProductCategory(''); }
                              else { setNewProductCategory(v); }
                            }}
                            placeholder="Select"
                            options={[
                              ...configuredCategories.map(c => ({ value: String(c), label: String(c) })),
                              { value: 'CUSTOM', label: 'Custom...' }
                            ]}
                            triggerClassName="rounded-lg h-[40px] text-sm"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-[90px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Brand</label>
                        <input type="text" value={newProductBrand} onChange={e => setNewProductBrand(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm" />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                          <button type="button" onClick={generateProductBarcode}
                            className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full cursor-pointer">
                            <RefreshCw className="w-2.5 h-2.5 inline-block" /> Auto
                          </button>
                        </div>
                        <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest text-sm" />
                        {newProductBarcode && <div className="mt-2 flex justify-center overflow-hidden rounded bg-white py-1"><Barcode value={newProductBarcode} width={1} height={32} displayValue={false} margin={0} /></div>}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Name *</label>
                          <input ref={firstInputRef} type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Item Code</label>
                          <input type="text" maxLength={10} value={newProductItemCode} onChange={e => setNewProductItemCode(e.target.value.toUpperCase())}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm uppercase text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Category</label>
                            {newProductIsCustomCategory ? (
                              <div className="relative">
                                <input type="text" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} placeholder="Enter category"
                                  className="w-full bg-background border border-border rounded-xl p-3 pr-10 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                                <button type="button" onClick={() => { setNewProductIsCustomCategory(false); setNewProductCategory(''); }} title="Cancel custom category"
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer transition-all">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <Select
                                value={configuredCategories.includes(newProductCategory) ? newProductCategory : (newProductCategory ? 'CUSTOM' : '')}
                                onChange={v => {
                                  if (v === 'CUSTOM') {
                                    setNewProductIsCustomCategory(true);
                                    setNewProductCategory('');
                                  } else {
                                    setNewProductCategory(v);
                                  }
                                }}
                                placeholder="-- Select Category --"
                                options={[
                                  ...configuredCategories.map(c => ({ value: String(c), label: String(c) })),
                                  { value: 'CUSTOM', label: 'Custom...' }
                                ]}
                                triggerClassName="rounded-xl h-[46px]"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Brand / Mfg</label>
                            <input type="text" value={newProductBrand} onChange={e => setNewProductBrand(e.target.value)}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" />
                          </div>
                        </div>
                      </div>
                      <div className="bg-muted/20 p-4 rounded-xl border border-border flex flex-col justify-center shadow-sm">
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Barcode *</label>
                            <button type="button" onClick={generateProductBarcode}
                              className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all cursor-pointer">
                              <RefreshCw className="w-3 h-3" /> Auto Generate
                            </button>
                          </div>
                          <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm text-sm" />
                          {newProductBarcode && <div className="mt-3 flex justify-center overflow-hidden rounded-xl border border-border bg-white py-2"><Barcode value={newProductBarcode} height={48} displayValue={true} background="#ffffff" /></div>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Grade selection / creation */}
                  {newProductCategory.trim() && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Grade</label>
                        {!newProductIsAddingGrade && (
                          <button
                            type="button"
                            onClick={() => setNewProductIsAddingGrade(true)}
                            className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> New Grade
                          </button>
                        )}
                      </div>
                      {newProductGrades.filter(g => g.category === newProductCategory).length > 0 && !newProductIsAddingGrade && (
                        <Select
                          value={newProductGradeId}
                          onChange={handleProductGradeChange}
                          placeholder="No grade (manual pricing)"
                          searchable
                          options={newProductGrades.filter(g => g.category === newProductCategory).map(g => ({
                            value: g.grade_id,
                            label: (g.grade_name || '(General)') + ' (₹' + g.rate + ')'
                          }))}
                          triggerClassName="rounded-lg h-[40px] text-sm"
                        />
                      )}
                    </div>
                  )}
                </section>

                {/* 2. Inventory & Pricing */}
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Package className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Inventory & Pricing</span>
                  </div>
                  <div className="flex gap-4">
                    {[
                      { label: 'Purchase Price', field: 'purchasePrice', prefix: '₹' },
                      { label: 'MRP *', field: 'basePrice', prefix: '₹' },
                      { label: 'Current Stock', field: 'stock' },
                      { label: 'Low Stock Alert', field: 'reorderLevel' },
                    ].map(({ label, field, prefix }) => (
                      <div key={field} className="flex-1 min-w-0">
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {label}
                          {(field === 'basePrice' || field === 'purchasePrice') && newProductGradeId && (
                            <span className="ml-1.5 font-normal normal-case text-indigo-500">(from grade)</span>
                          )}
                        </label>
                        <div className="relative">
                          {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{prefix}</span>}
                          <input
                            type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={field === 'purchasePrice' ? newProductPurchasePrice : field === 'basePrice' ? newProductBasePrice : field === 'stock' ? newProductStock : newProductReorderLevel}
                            onChange={e => {
                              const val = e.target.value;
                              if (field === 'purchasePrice') handleProductPurchasePriceChange(val);
                              else if (field === 'basePrice') handleProductBasePriceChange(val);
                              else if (field === 'stock') setNewProductStock(val);
                              else setNewProductReorderLevel(val);
                            }}
                            className={clsx(
                              'w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm',
                              prefix && 'pl-8',
                              field === 'basePrice' && 'text-emerald-600 dark:text-emerald-400 font-bold'
                            )}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="flex-1 min-w-0">
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">UOM</label>
                      <Select
                        value={newProductUom}
                        onChange={v => setNewProductUom(v)}
                        options={['Pcs', 'Kgs', 'Grams', 'Mtrs', 'Ltrs', 'Box', 'Dozen'].map(u => ({ value: u, label: u }))}
                        triggerClassName="rounded-xl h-[46px]"
                      />
                    </div>
                    <div className={clsx('flex-1 min-w-0 overflow-hidden transition-all duration-500 ease-in-out', (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((newProductUom || '').toLowerCase()) || (editingProductSnapshot?.uom === newProductUom && editingProductSnapshot?.billing_type === 'WEIGHT')) ? 'max-w-[250px] opacity-100' : 'max-w-0 opacity-0')}>
                      <div className="flex items-center gap-1 mb-1.5">
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider">Pcs</label>
                        <span className="text-[10px] text-muted-foreground/60 font-normal normal-case">(optional)</span>
                      </div>
                      <input
                        type="number" min="1" step="1"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        value={newProductPcs}
                        onChange={e => setNewProductPcs(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm"
                        placeholder="e.g. 20"
                      />
                    </div>
                  </div>
                  {pricingTiers.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500">
                          <Layers className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-violet-500 uppercase tracking-wider">Tier Prices</span>
                        <span className="text-[10px] text-muted-foreground font-normal normal-case">(blank = use MRP)</span>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        {pricingTiers.map((tier: any) => (
                          <div key={tier.pricing_tier_id} className="flex-1 min-w-[140px]">
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5 truncate">
                              {tier.name}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                              <input
                                type="number" step="0.01"
                                onWheel={e => (e.target as HTMLInputElement).blur()}
                                value={productFormTierPrices[tier.pricing_tier_id] ?? ''}
                                onChange={e => setProductFormTierPrices(prev => ({ ...prev, [tier.pricing_tier_id]: e.target.value }))}
                                placeholder={newProductBasePrice ? `= ${newProductBasePrice}` : 'MRP'}
                                className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm pl-8"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* 3. Discount & Offers */}
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                      <Package className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-blue-500 uppercase tracking-wider">3. Discount & Offers</span>
                  </div>
                  {productFormView === 'list' ? (
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 min-w-[100px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Disc %</label>
                        <input type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={newProductDiscountPercent}
                          onChange={e => {
                            const val = e.target.value;
                            setNewProductDiscountPercent(val);
                            if (val) {
                              const mrp = Number(newProductBasePrice) || 0;
                              const pct = parseFloat(val);
                              const flat = mrp > 0 && !isNaN(pct) ? ((mrp * pct) / 100).toFixed(2) : '';
                              setNewProductDiscountFlat(flat);
                            } else {
                              setNewProductDiscountFlat('');
                            }
                            setNewProductOfferPrice('');
                          }}
                          disabled={!!newProductOfferPrice}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                      </div>
                      <div className="flex-1 min-w-[100px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Disc ₹</label>
                        <input type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={newProductDiscountFlat}
                          onChange={e => {
                            const val = e.target.value;
                            setNewProductDiscountFlat(val);
                            if (val) {
                              const mrp = Number(newProductBasePrice) || 0;
                              const flat = parseFloat(val);
                              const pct = mrp > 0 && !isNaN(flat) ? ((flat / mrp) * 100).toFixed(2) : '';
                              setNewProductDiscountPercent(pct);
                            } else {
                              setNewProductDiscountPercent('');
                            }
                            setNewProductOfferPrice('');
                          }}
                          disabled={!!newProductOfferPrice}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                      </div>
                      <div className="flex-1 min-w-[110px]">
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Offer Price ₹</label>
                        <input type="number" step="0.01"
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          value={newProductOfferPrice}
                          onChange={e => {
                            setNewProductOfferPrice(e.target.value);
                            setNewProductDiscountPercent('');
                            setNewProductDiscountFlat('');
                          }}
                          disabled={!!newProductDiscountPercent || !!newProductDiscountFlat}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 no-spinners text-sm" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-foreground">Discount</h4>
                          <span className="text-xs text-muted-foreground">Applies to MRP</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Percentage (%)</label>
                            <input type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={newProductDiscountPercent}
                              onChange={e => {
                                const val = e.target.value;
                                setNewProductDiscountPercent(val);
                                if (val) {
                                  const mrp = Number(newProductBasePrice) || 0;
                                  const pct = parseFloat(val);
                                  const flat = mrp > 0 && !isNaN(pct) ? ((mrp * pct) / 100).toFixed(2) : '';
                                  setNewProductDiscountFlat(flat);
                                } else {
                                  setNewProductDiscountFlat('');
                                }
                                setNewProductOfferPrice('');
                              }}
                              disabled={!!newProductOfferPrice}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Flat Amount (₹)</label>
                            <input type="number" step="0.01"
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              value={newProductDiscountFlat}
                              onChange={e => {
                                const val = e.target.value;
                                setNewProductDiscountFlat(val);
                                if (val) {
                                  const mrp = Number(newProductBasePrice) || 0;
                                  const flat = parseFloat(val);
                                  const pct = mrp > 0 && !isNaN(flat) ? ((flat / mrp) * 100).toFixed(2) : '';
                                  setNewProductDiscountPercent(pct);
                                } else {
                                  setNewProductDiscountPercent('');
                                }
                                setNewProductOfferPrice('');
                              }}
                              disabled={!!newProductOfferPrice}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 bg-muted/10 p-4 rounded-xl border border-border">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-foreground">Offer</h4>
                          <span className="text-xs text-muted-foreground">Overrides MRP</span>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Final Offer Price (₹)</label>
                          <input type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={newProductOfferPrice}
                            onChange={e => {
                              setNewProductOfferPrice(e.target.value);
                              setNewProductDiscountPercent('');
                              setNewProductDiscountFlat('');
                            }}
                            disabled={!!newProductDiscountPercent || !!newProductDiscountFlat}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm disabled:opacity-50 no-spinners text-sm" />
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* 4. Taxes & Config */}
                <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                    <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                      <Package className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-orange-500 uppercase tracking-wider">4. Taxes & Config</span>
                  </div>
                  {productFormView === 'list' ? (
                    <div className="flex gap-3 items-start">
                      {invoiceType === 'GST' ? (
                        <>
                          <div className="min-w-[140px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Stock Type</label>
                            <div
                              onClick={() => setNewProductIsDummy(!newProductIsDummy)}
                              onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsDummy(!newProductIsDummy); } }}
                              data-focusable-checkbox
                              tabIndex={-1}
                              className={clsx(
                                'flex items-center justify-center gap-1.5 border-2 rounded-lg py-2.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98] h-[40px]',
                                !newProductIsDummy
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
                              )}
                            >
                              <input type="checkbox" checked={newProductIsDummy} onChange={e => setNewProductIsDummy(e.target.checked)}
                                className="w-3 h-3 rounded pointer-events-none accent-primary" />
                              <span className="font-bold text-xs select-none">
                                {newProductIsDummy ? 'Paper' : 'Real'}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">HSN / SAC Code</label>
                            <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)}
                              className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest text-sm" />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-lg h-[40px] text-sm"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="min-w-[140px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">GST Applicable</label>
                            <div
                              onClick={() => setNewProductIsGstApplicable(!newProductIsGstApplicable)}
                              onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsGstApplicable(!newProductIsGstApplicable); } }}
                              data-focusable-checkbox
                              tabIndex={-1}
                              className={clsx(
                                'flex items-center justify-center gap-1.5 border-2 rounded-lg py-2.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98] h-[40px]',
                                newProductIsGstApplicable
                                  ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                  : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:border-border'
                              )}
                            >
                              <input type="checkbox" checked={newProductIsGstApplicable} onChange={e => setNewProductIsGstApplicable(e.target.checked)}
                                className="w-3 h-3 rounded pointer-events-none accent-primary" />
                              <span className={clsx('font-bold text-xs select-none', newProductIsGstApplicable ? 'text-primary' : 'text-muted-foreground')}>
                                {newProductIsGstApplicable ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </div>
                          {newProductIsGstApplicable && (
                            <div className="min-w-[120px]">
                              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Stock Type</label>
                              <div
                                onClick={() => setNewProductIsDummy(!newProductIsDummy)}
                                onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsDummy(!newProductIsDummy); } }}
                                data-focusable-checkbox
                                tabIndex={-1}
                                className={clsx(
                                  'flex items-center justify-center gap-1.5 border-2 rounded-lg py-2.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98] h-[40px]',
                                  !newProductIsDummy
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
                                )}
                              >
                                <input type="checkbox" checked={newProductIsDummy} onChange={e => setNewProductIsDummy(e.target.checked)}
                                  className="w-3 h-3 rounded pointer-events-none accent-primary" />
                                <span className="font-bold text-xs select-none">
                                  {newProductIsDummy ? 'Paper' : 'Real'}
                                </span>
                              </div>
                            </div>
                          )}
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">HSN / SAC Code</label>
                            <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)} disabled={!newProductIsGstApplicable}
                              className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 font-mono tracking-widest text-sm" />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              disabled={!newProductIsGstApplicable}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-lg h-[40px] text-sm"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={clsx('grid gap-4', (invoiceType !== 'GST' && newProductIsGstApplicable) ? 'grid-cols-4' : 'grid-cols-3')}>
                      {invoiceType === 'GST' ? (
                        <>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Stock Type</label>
                            <div
                              onClick={() => setNewProductIsDummy(!newProductIsDummy)}
                              onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsDummy(!newProductIsDummy); } }}
                              data-focusable-checkbox
                              tabIndex={-1}
                              className={clsx(
                                'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]',
                                !newProductIsDummy
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
                              )}
                            >
                              <input type="checkbox" id="dummy" checked={newProductIsDummy} onChange={e => setNewProductIsDummy(e.target.checked)}
                                className={clsx('w-3.5 h-3.5 rounded pointer-events-none', !newProductIsDummy ? 'accent-emerald-500' : 'accent-amber-500')} />
                              <label htmlFor="dummy" className="font-bold text-xs cursor-pointer select-none">
                                {newProductIsDummy ? 'Paper' : 'Real'}
                              </label>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">HSN / SAC Code</label>
                            <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm font-mono tracking-widest text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-xl h-[46px]"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GST Applicable</label>
                            <div
                              onClick={() => setNewProductIsGstApplicable(!newProductIsGstApplicable)}
                              onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsGstApplicable(!newProductIsGstApplicable); } }}
                              data-focusable-checkbox
                              tabIndex={-1}
                              className={clsx(
                                'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]',
                                newProductIsGstApplicable
                                  ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                  : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:border-border'
                              )}
                            >
                              <input type="checkbox" id="gst" checked={newProductIsGstApplicable} onChange={e => setNewProductIsGstApplicable(e.target.checked)}
                                className={clsx('w-3.5 h-3.5 rounded pointer-events-none', newProductIsGstApplicable ? 'accent-primary' : 'accent-muted-foreground')} />
                              <label htmlFor="gst" className={clsx('font-bold text-xs cursor-pointer select-none', newProductIsGstApplicable ? 'text-primary' : 'text-muted-foreground')}>
                                {newProductIsGstApplicable ? 'Enabled' : 'Disabled'}
                              </label>
                            </div>
                          </div>
                          {enableRealPaperStock && newProductIsGstApplicable && (
                            <div>
                              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Stock Type</label>
                              <div
                                onClick={() => setNewProductIsDummy(!newProductIsDummy)}
                                onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setNewProductIsDummy(!newProductIsDummy); } }}
                                data-focusable-checkbox
                                tabIndex={-1}
                                className={clsx(
                                  'flex items-center justify-center gap-1.5 border-2 rounded-xl py-3.5 px-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]',
                                  !newProductIsDummy
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-sm'
                                )}
                              >
                                <input type="checkbox" id="dummy" checked={newProductIsDummy} onChange={e => setNewProductIsDummy(e.target.checked)}
                                  className={clsx('w-3.5 h-3.5 rounded pointer-events-none', !newProductIsDummy ? 'accent-emerald-500' : 'accent-amber-500')} />
                                <label htmlFor="dummy" className="font-bold text-xs cursor-pointer select-none">
                                  {newProductIsDummy ? 'Paper' : 'Real'}
                                </label>
                              </div>
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">HSN / SAC Code</label>
                            <input type="text" value={newProductHsn} onChange={e => setNewProductHsn(e.target.value)} disabled={!newProductIsGstApplicable}
                              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none disabled:opacity-50 transition-all shadow-sm font-mono tracking-widest text-sm" />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tax Rate %</label>
                            <Select
                              value={String(newProductTaxRate)}
                              onChange={v => setNewProductTaxRate(parseFloat(v))}
                              disabled={!newProductIsGstApplicable}
                              options={[0, 5, 12, 18, 28].map(r => ({ value: String(r), label: r + '%' }))}
                              triggerClassName="rounded-xl h-[46px]"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>

              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-background">
                <button type="button" data-enter-submit onClick={async () => { await handleCreateAndAddProduct(); }} disabled={!newProductName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Save className="w-3.5 h-3.5" />
                  {editingProductId ? 'Update Product' : 'Add to Inventory'}
                </button>
                <button type="button" onClick={() => handleCreateAndAddProduct(3, false, true)} disabled={!newProductName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-50 text-violet-600 dark:text-violet-400 border border-violet-500/40 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                  title="Save as temp item — appears only on this bill, no barcode, not saved to inventory or stock">
                  <Clock className="w-3.5 h-3.5" />
                  Save as Temp
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <div ref={gradeFormDialogRef}>
        {newProductIsAddingGrade && (
          <Modal
            isOpen={newProductIsAddingGrade}
            onClose={() => { setNewProductIsAddingGrade(false); setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
            title="Create New Grade"
            className="max-w-lg backdrop-blur-none"
            overlayClassName="z-[110]"
            closeButton={
              <button type="button" onClick={() => { setNewProductIsAddingGrade(false); setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' }); }}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
                title="Close">
                <X className="w-4 h-4 text-destructive" />
              </button>
            }
          >
          <div className="space-y-3" onKeyDown={handleFormKeyDown} data-enter-nav>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              Grade for category: <span className="font-bold text-foreground">{newProductCategory}</span>
            </p>
            <section className="bg-background border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Tag className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-wider">Grade Details</span>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Grade Name *</label>
                  <input
                    autoFocus
                    placeholder="e.g. Grade A, Scrap, Heavy"
                    value={newProductGradeForm.grade_name}
                    onChange={e => setNewProductGradeForm({ ...newProductGradeForm, grade_name: e.target.value })}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newProductGradeForm.purchase_price}
                        onChange={e => setNewProductGradeForm({ ...newProductGradeForm, purchase_price: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Base MRP (₹/Kg)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newProductGradeForm.rate}
                        onChange={e => setNewProductGradeForm({ ...newProductGradeForm, rate: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Offer (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                      <input
                        type="number" step="0.01"
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        value={newProductGradeForm.offer_price}
                        onChange={e => setNewProductGradeForm({ ...newProductGradeForm, offer_price: e.target.value })}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                data-enter-submit
                onClick={handleCreateNewGrade}
                disabled={newProductSavingGrade || !newProductGradeForm.grade_name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/95 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                {newProductSavingGrade ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save Grade
              </button>
            </div>
          </div>
        </Modal>
        )}
      </div>
      {cashRegisterOpen && (
        <CashierSettlement onClose={() => setCashRegisterOpen(false)} />
      )}

      {/* ── UPI Account Selection Dialog Modal ── */}
      {isUpiSelectModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[150] animate-in fade-in duration-200"
            onClick={() => setIsUpiSelectModalOpen(false)}
          />
          <div className="fixed inset-0 z-[151] flex items-center justify-center p-4 select-none">
            <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 bg-violet-500/5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground tracking-tight">Select UPI Account</h3>
                    <p className="text-[11px] text-muted-foreground font-medium">Choose receiving account for UPI payments</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUpiSelectModalOpen(false)}
                  className="p-1.5 rounded-xl text-destructive hover:bg-destructive/10 border border-destructive/30 transition-all cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5 text-destructive" />
                </button>
              </div>

              {/* Modal Content - UPI Account Options */}
              <div className="p-5 overflow-y-auto space-y-2.5 flex-1">
                {upiSources.map((s: any, idx: number) => {
                  const isSelected = currentSelectedUpi
                    ? (s.source_id === currentSelectedUpi.source_id || (s.upi_id && s.upi_id === currentSelectedUpi.upi_id))
                    : (s.is_default === 1 || upiSources[0]?.source_id === s.source_id);
                  const keyId = s.source_id || s.upi_id || String(idx);

                  const selectThisUpi = () => {
                    updateActiveTab({
                      paymentMethod: 'UPI',
                      selectedUpiId: s.upi_id || s.source_id || '',
                      selectedUpiSourceId: s.source_id || '',
                      selectedUpiName: s.name
                    });
                    try {
                      localStorage.setItem('last_selected_upi_source_id', s.source_id || s.upi_id || '');
                    } catch (e) {}
                    setIsUpiSelectModalOpen(false);
                    setUpiAccountToast(`${s.name}${s.upi_id ? ` (${s.upi_id})` : ''}`);
                    setTimeout(() => setUpiAccountToast(null), 3500);
                    focusDescriptionOrDiscount();
                  };

                  return (
                    <button
                      key={keyId}
                      ref={el => { upiSourceRefs.current[keyId] = el; }}
                      type="button"
                      onClick={selectThisUpi}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const nextIdx = (idx + 1) % upiSources.length;
                          const next = upiSources[nextIdx];
                          const nextKey = next?.source_id || next?.upi_id || String(nextIdx);
                          upiSourceRefs.current[nextKey]?.focus();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const prevIdx = (idx - 1 + upiSources.length) % upiSources.length;
                          const prev = upiSources[prevIdx];
                          const prevKey = prev?.source_id || prev?.upi_id || String(prevIdx);
                          upiSourceRefs.current[prevKey]?.focus();
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          selectThisUpi();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setIsUpiSelectModalOpen(false);
                          setTimeout(() => paymentOptionRefs.current['UPI']?.focus(), 50);
                        }
                      }}
                      className={clsx(
                        'w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-violet-500',
                        isSelected
                          ? 'bg-violet-500/15 border-violet-500 text-violet-700 dark:text-violet-300 font-extrabold shadow-sm ring-1 ring-violet-500/50'
                          : 'bg-background hover:bg-muted/50 border-border/80 text-foreground'
                      )}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-black truncate flex items-center gap-2">
                          {s.name}
                          {s.is_default === 1 && (
                            <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-md font-black tracking-wider uppercase">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground truncate">
                          {s.upi_id || 'No UPI ID'}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-border/80 bg-muted/30 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsUpiSelectModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showTransportModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Transporter & E-Way Bill Details</h3>
                  <p className="text-xs text-muted-foreground">Add transport information for GST Boxed invoices</p>
                </div>
              </div>
              <button onClick={() => setShowTransportModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-3">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block border-b border-border/60 pb-1">Transporter Information</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Transporter Name</label>
                    <input type="text" value={activeTab?.transporterName || ''} onChange={(e) => updateActiveTab({ transporterName: e.target.value })} placeholder="e.g. Sanjay Transportation" className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Vehicle Number</label>
                    <input type="text" value={activeTab?.vehicleNumber || ''} onChange={(e) => updateActiveTab({ vehicleNumber: e.target.value.toUpperCase() })} placeholder="e.g. KL-07-AB-1234" className="w-full text-xs font-mono font-medium uppercase bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Transporter Doc / LR No.</label>
                    <input type="text" value={activeTab?.transporterDocNo || ''} onChange={(e) => updateActiveTab({ transporterDocNo: e.target.value })} placeholder="e.g. DOC12345" className="w-full text-xs font-mono font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Transporter Doc Date</label>
                    <input type="date" value={activeTab?.transporterDocDate || ''} onChange={(e) => updateActiveTab({ transporterDocDate: e.target.value })} className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">E-Way Bill Number</label>
                    <input type="text" value={activeTab?.ewayBillNo || ''} onChange={(e) => updateActiveTab({ ewayBillNo: e.target.value })} placeholder="e.g. 101019999999" className="w-full text-xs font-mono font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">E-Way Bill Date</label>
                    <input type="date" value={activeTab?.ewayBillDate || ''} onChange={(e) => updateActiveTab({ ewayBillDate: e.target.value })} className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block border-b border-border/60 pb-1">Separate Shipping Details (Optional)</span>
                <div className="space-y-2.5">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Shipping Recipient Name</label>
                    <input type="text" value={activeTab?.shippingName || ''} onChange={(e) => updateActiveTab({ shippingName: e.target.value })} placeholder="Same as customer name if left blank" className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Shipping Address</label>
                    <input type="text" value={activeTab?.shippingAddress || ''} onChange={(e) => updateActiveTab({ shippingAddress: e.target.value })} placeholder="Full delivery address" className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
              <button type="button" onClick={() => { updateActiveTab({ transporterName: '', vehicleNumber: '', transporterDocNo: '', transporterDocDate: '', ewayBillNo: '', ewayBillDate: '', shippingName: '', shippingAddress: '', shippingGstin: '' }); setShowTransportModal(false); }} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive cursor-pointer">Clear All</button>
              <button type="button" onClick={() => setShowTransportModal(false)} className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-xs hover:bg-primary/90 cursor-pointer">Save & Close</button>
            </div>
          </div>
        </div>
      )}

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
