import { useState, useRef, useEffect, useCallback } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  Search, X, Package, Trash, Recycle, RotateCcw, Minus, Plus, CreditCard,
  Store, LogOut, Settings, Phone, User, Scale,
  Wallet, Banknote, Smartphone, BookOpen, AlertCircle,
  CheckCircle2, Building, TrendingUp, FileText, Clock, Receipt, MapPin, Star, Gift, Save, RefreshCw, ArrowLeftRight, LayoutGrid, List, Loader2, Check, Tag, Layers, Users, PauseCircle, Play, Split, ChevronRight
} from 'lucide-react';
import { useCartStore, useCartTotals, type CartItem } from '../store/cartStore';
import { useScaleStore } from '../store/scaleStore';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { parsePrintFormat, formatPrinterError } from '../utils/printFormatHelper';
import { useTabStore } from '../store/tabStore';
import { BillingTabBar } from './BillingTabBar';
import { CashierSettlement } from './CashierSettlement';
import { loadFeatureFlags } from '../featureFlags';
import { sortProductsBySearchPriority } from '../utils/productSort';
import { Skeleton } from './ui/Skeleton';
import { getUpiPageConfig, DEFAULT_UPI_PAGE_CONFIG, type UpiPageConfig } from '../utils/upiConfig';
import { getNextOffsetInvoiceNumber } from '../utils/invoiceNumberHelper';

const INDIAN_STATES = [
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'PB', name: 'Punjab' },
  { code: 'BR', name: 'Bihar' },
  { code: 'OD', name: 'Odisha' },
  { code: 'AS', name: 'Assam' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'GA', name: 'Goa' },
];

type PaymentMethod = 'PENDING' | 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Wallet; color: string }[] = [
  { value: 'PENDING', label: 'Pending', icon: Clock, color: 'text-gray-500' },
  { value: 'CARD', label: 'Card', icon: Wallet, color: 'text-blue-500' },
  { value: 'CREDIT', label: 'Credit', icon: BookOpen, color: 'text-amber-500' },
  { value: 'UPI', label: 'UPI', icon: Smartphone, color: 'text-violet-500' },
  { value: 'CASH', label: 'Cash', icon: Banknote, color: 'text-emerald-500' },
  { value: 'SPLIT', label: 'Split', icon: Split, color: 'text-purple-500' },
];

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toFixed(2)}`;
}

const scannerBurstTracker: Record<string, { count: number; lastTime: number; snapshot: number | string }> = {};

function detectScannerBurst(
  keyTimes: Record<string, number>,
  snapshots: Record<string, number | string>,
  productId: string,
  currentValue: number | string,
  restore: (v: number | string) => void,
): boolean {
  const now = Date.now();
  const tracker = scannerBurstTracker[productId] || { count: 0, lastTime: 0, snapshot: currentValue };
  if (tracker.lastTime && now - tracker.lastTime <= 35) {
    tracker.count += 1;
    tracker.lastTime = now;
    scannerBurstTracker[productId] = tracker;
    if (tracker.count >= 4) {
      if (tracker.snapshot !== undefined) restore(tracker.snapshot);
      return true;
    }
  } else {
    scannerBurstTracker[productId] = { count: 1, lastTime: now, snapshot: currentValue };
  }
  return false;
}

export function BillingPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const kRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discFlatRefs = useRef<Record<string, HTMLInputElement | null>>({});
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
    addItem, updateQuantity, removeItem, updateItemDiscount, removeItemDiscount, updateItemOfferPrice, updatePiecesOverride,
    customerState, setCustomerState,
    scrapDeduction: storeScrapDeduction, scrapInvoiceNumber: storeScrapInvoiceNumber,
    setScrapDeduction, clearScrapDeduction,
    returnDeduction: storeReturnDeduction, returnInvoiceNumber: storeReturnInvoiceNumber,
    setReturnDeduction, clearReturnDeduction,
    editingInvoiceId: editingActive, editingInvoiceNumber,
  } = useCartStore();

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (lastAddedProductId && itemRefs.current[lastAddedProductId]) {
      itemRefs.current[lastAddedProductId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [lastAddedProductId, items]);

  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const addTab = useTabStore(s => s.addTab);
  const closeTab = useTabStore(s => s.closeTab);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);
  const syncActiveSnapshot = useTabStore(s => s.syncActiveSnapshot);
  const getActiveTab = useTabStore(s => s.getActiveTab);
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

  // Pricing tier state
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [productPricingMap, setProductPricingMap] = useState<Record<string, Record<string, number>>>({});
  const [selectedTierId, setSelectedTierId] = useState('');

  // Page-wise UPI Configuration and sources state
  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [upiSources, setUpiSources] = useState<any[]>([]);
  const [isUpiSelectModalOpen, setIsUpiSelectModalOpen] = useState(false);
  const [allowBillerOverride, setAllowBillerOverride] = useState(true);
  const [partiesForTier, setPartiesForTier] = useState<any[]>([]);
  const canOverrideTier = authRole === 'OWNER' || allowBillerOverride;

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
          // Only initialise for brand-new items — NEVER overwrite a value the user has already typed.
          if (!(item.product_id in prev)) {
            const pcs = item.pieces_override ?? 1;
            next[item.product_id] = String(pcs);
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
          if (!(item.product_id in prev) || (item.quantity !== undefined && (isNaN(curNum) || curNum !== numKg))) {
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
    const rate = item.pricing_mode === 'GRADE_RATE' ? (item.grade_rate || 0) : item.base_price;
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
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const productFormDialogRef = useRef<HTMLDivElement>(null);
  const gradeFormDialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [showProductCreateForm, setShowProductCreateForm] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductItemCode, setNewProductItemCode] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
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
  const [autoPrintBarcode, setAutoPrintBarcode] = useState(true);
  const [productFormView, setProductFormView] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('productFormView') as 'grid' | 'list') || 'grid';
  });
  const [configuredCategories, setConfiguredCategories] = useState<string[]>([]);
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

  // Loyalty points state
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(100);
  const [loyaltyRedemptionRate, setLoyaltyRedemptionRate] = useState(1);
  const [loyaltyCustomerData, setLoyaltyCustomerData] = useState<{
    customerId: string | null;
    pointsBalance: number;
  }>({ customerId: null, pointsBalance: 0 });
  const [showLoyaltyRedemption, setShowLoyaltyRedemption] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const isCheckingOutRef = useRef(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<'saved' | 'printed' | false>(false);
  const [upiAccountToast, setUpiAccountToast] = useState<string | null>(null);

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

  // Safety sync: ensure scrap mode remains active when editing a scrap invoice
  useEffect(() => {
    if (editingInvoiceNumber && (editingInvoiceNumber.includes('SCR') || editingInvoiceNumber.includes('Scrap')) && !isScrapMode) {
      setIsScrapMode(true);
    }
  }, [editingInvoiceNumber, isScrapMode, setIsScrapMode]);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean> | null>(null);
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
      items.filter(i => i.isReturnItem).forEach(i => removeItem(i.product_id));
      setSelectedReturnInvoice(null);
    } else if (!prevReturnMode.current && isReturnMode) {
      items.filter(i => !i.isReturnItem).forEach(i => removeItem(i.product_id));
      clearReturnDeduction();
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
    if (!featureFlags.quotations && isQuotationMode) setQuotationMode(false);
    if (!featureFlags.returns && isReturnMode) setReturnMode(false);
  }, [featureFlags, isQuotationMode, isReturnMode, setQuotationMode, setReturnMode]);

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

        const shouldUpdate = !tab.title || tab.title === 'New' || tab.title === tab.reservedInvoiceNumber || tab.title === tab.reservedScrapInvoiceNumber || tab.title === tab.reservedQuotationNumber || tab.title === tab.reservedReturnNumber || tab.title.startsWith('Bill ') || tab.title.startsWith('GST-');
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
  const [returnProcessed, setReturnProcessed] = useState(false);

  const receivedInputRef = useRef<HTMLInputElement>(null);
  const [shopNameState, setShopNameState] = useState('');
  const [shopGstin, setShopGstin] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);

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

  const activeTab = tabs.find(t => t.id === activeTabId);
  const paymentMethod = activeTab?.paymentMethod ?? 'PENDING';
  const splitDetails = activeTab?.splitDetails ?? { cash: 0, card: 0, upi: 0, bank_transfer: 0 };
  const splitTotal = paymentMethod === 'SPLIT' ? ((Number(splitDetails.cash) || 0) + (Number(splitDetails.card) || 0) + (Number(splitDetails.upi) || 0) + (Number(splitDetails.bank_transfer) || 0)) : 0;
  const receivedAmount = activeTab?.receivedAmount ?? 0;
  const customerName = activeTab?.customerName || '';
  const customerPhone = activeTab?.customerPhone || '';
  const customerGstin = activeTab?.customerGstin || '';
  const customerAddress = activeTab?.customerAddress || '';

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
    if (isScrapMode || isQuotationMode || isReturnMode) return;
    if (editingActive) return;

    try {
      const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (customerGstin?.trim() ? 'gst_b2b' : 'gst_b2c') : 'normal') : undefined;
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
  }, [tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isScrapMode, isQuotationMode, isReturnMode, editingActive]);

  const handleInvoiceTypeChange = async (type: 'GST' | 'BILL_OF_SUPPLY') => {
    setInvoiceType(type);
    setTimeout(() => {
      syncActiveSnapshot();
    }, 0);

    try {
      const tab = getActiveTab();
      const series = enableThreeInvoiceSeries ? (type === 'GST' ? (customerGstin?.trim() ? 'gst_b2b' : 'gst_b2c') : 'normal') : undefined;
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
          const shouldUpdateTitle = !tab.title || tab.title === 'New' || tab.title === oldReserved || tab.title.startsWith('Bill ');
          updateActiveTab({
            reservedQuotationNumber: nextNum,
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

  const returnTotal = items.filter(i => i.isReturnItem).reduce((sum, item) => {
    return sum + (Number(item.originalUnitPrice) || 0) * (Number(item.quantity) || 0);
  }, 0);
  const displayGrandTotal = isScrapMode
    ? scrapTotal + extraBonus
    : isReturnMode
      ? returnTotal
      : Math.max(0, grandTotal - (storeScrapDeduction || 0) - (storeReturnDeduction || 0));
  const balanceAmount = receivedAmount - displayGrandTotal;
  const _bothActive = storeScrapDeduction > 0 && storeReturnDeduction > 0;

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
    useTabStore.setState({ tabs: [], activeTabId: '' });

    tabCounter.current++;
    addTab(undefined, `Bill ${tabCounter.current}`);
    useCartStore.getState().setEditingInvoice(null, null, null);
  }, []);

  // receivedAmount stays 0 until user enters a value — no auto-fill to grandTotal

  useEffect(() => {
    searchRef.current?.focus();
  }, [activeTabId]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.dbEnsureServiceItem({ tenant_id: tenantId || 'global' }).catch(() => {});
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' }).then((v: any) => {
      setShopNameState(typeof v === 'string' ? v : '');
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
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }).then((v: any) => {
      setUpiId(typeof v === 'string' ? v : '');
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }).then((v: any) => {
      if (v !== null && v !== undefined) setShowUpiQr(Boolean(v));
    });
    getUpiPageConfig(tenantId || 'global').then(setUpiPageConfig);
    if (window.electronAPI?.dbPaymentGetSources) {
      window.electronAPI.dbPaymentGetSources(tenantId || 'global').then((sources: any[]) => {
        if (Array.isArray(sources)) {
          setUpiSources(sources.filter((s: any) => s.type === 'UPI' && (s.is_enabled === 1 || s.is_enabled === true)));
        }
      }).catch(() => {});
    }
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_scrap' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
    loadFeatureFlags(tenantId || 'global').then(flags => setFeatureFlags(flags));
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_cash_register' }).then((v: any) => {
      if (v !== null && v !== undefined) setShowCashRegister(Boolean(v));
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'auto_print_barcode' }).then((v: any) => {
      if (v !== null && v !== undefined) setAutoPrintBarcode(Boolean(v));
    });
    window.electronAPI.settingsGet({ tenant_id: 'global', key: 'three_invoice_series' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableThreeInvoiceSeries(Boolean(v.enabled));
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'loyalty_config' }).then((v: any) => {
      if (v) {
        setLoyaltyEnabled(Boolean(v.enabled));
        if (v.earningRate) setLoyaltyEarningRate(Number(v.earningRate));
        if (v.redemptionRate) setLoyaltyRedemptionRate(Number(v.redemptionRate));
      }
    });
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' }).then((v: any) => {
      if (v?.billSettings?.bosTaxRatePercent != null) {
        setBosTaxRatePercent(Number(v.billSettings.bosTaxRatePercent));
      }
      if (v?.billSettings?.bosTaxInclusive != null) {
        setBosTaxInclusive(Boolean(v.billSettings.bosTaxInclusive));
      }
    });
    window.electronAPI.dbGetPricingTiers(tenantId || 'global')
      .then((res: any) => {
        if (Array.isArray(res)) setPricingTiers(res.filter((t: any) => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted));
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
  }, [tenantId]);

  // Re-peek invoice number when customer GSTIN goes empty ↔ filled (B2C ↔ B2B switch)
  const prevHasGstin = useRef(false);
  useEffect(() => {
    if (!enableThreeInvoiceSeries || invoiceType !== 'GST') return;
    const hasGstin = !!(customerGstin?.trim());
    if (prevHasGstin.current !== hasGstin) {
      prevHasGstin.current = hasGstin;
      const series = hasGstin ? 'gst_b2b' : 'gst_b2c';
      window.electronAPI?.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series }).then(result => {
        if (result.success && result.invoiceNumber) {
          updateActiveTab({ reservedInvoiceNumber: result.invoiceNumber, title: result.invoiceNumber });
        }
      });
    }
  }, [customerGstin, enableThreeInvoiceSeries, invoiceType, tenantId, getActiveTab, updateActiveTab]);

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
    reserveInvoiceNumberForTab();
    if (isScrapMode) {
      reserveScrapInvoiceNumberForTab();
    } else if (isQuotationMode) {
      reserveQuotationNumberForTab();
    } else if (isReturnMode) {
      reserveReturnNumberForTab();
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
        product_id: tx.scrap_category_id,
        scrap_category_id: tx.scrap_category_id,
        name: tx.scrap_category_name || 'Scrap Item',
        base_price: Number(tx.rate),
        purchase_price: Number(tx.rate),
        tax_rate_percent: 0,
        quantity: Number(tx.quantity),
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
    // In scrap mode, return mode, or past bill mode, skip product search
    if (isScrapMode || isReturnMode || isPastBillMode || searchQuery.length < 1) { setResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      // GST invoices: only show GST-applicable products (quotations stay unfiltered)
      const isGstFilter = !isQuotationMode && invoiceType === 'GST';
      // Fetch up to 100 results so numeric or text searches capture all matching items
      const fetchLimit = 100;
      
      try {
        const [products, combos] = await Promise.all([
          window.electronAPI.dbGetProducts({ tenant_id: tenantId, search: searchQuery, limit: fetchLimit, ...(isGstFilter ? { isGst: 1 } : {}) }),
          window.electronAPI.dbGetComboOffers({ tenant_id: tenantId, search: searchQuery, only_active: true }),
        ]);

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
        const q = searchQuery.trim().toLowerCase();

        const sortedProds = sortProductsBySearchPriority(rawProducts, searchQuery);
        const filteredProds = sortedProds.filter(p => {
          const barcode = String(p.sku_barcode || '').trim().toLowerCase();
          const code = String(p.item_code || '').trim().toLowerCase();
          const name = String(p.name || '').trim().toLowerCase();
          const brand = String(p.brand_manufacturer || '').trim().toLowerCase();
          const cat = String(p.category || '').trim().toLowerCase();
          const hsn = String(p.hsn_sac_code || '').trim().toLowerCase();
          return (
            barcode.includes(q) ||
            code.includes(q) ||
            name.includes(q) ||
            brand.includes(q) ||
            cat.includes(q) ||
            hsn.includes(q)
          );
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
        setResults([...comboResults, ...deduped]);
        setSelectedIndex(0);
      } catch (err) {
        console.error('[BillingPage] Product search error:', err);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery, isScrapMode, invoiceType, isQuotationMode]);

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

  // Customer autofill search by name or phone
  useEffect(() => {
    const nameQuery = customerName.trim();
    const phoneQuery = customerPhone.trim();
    if ((!nameQuery && !phoneQuery) || nameQuery.length < 2 || !window.electronAPI || !loyaltyEnabled) {
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
          setCustomerSearchResults(results.filter((c: any) => {
            if (nameQuery && c.name) return c.name.toLowerCase().includes(nameQuery.toLowerCase());
            if (phoneQuery && c.phone) return c.phone.includes(phoneQuery);
            return false;
          }));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [customerName, customerPhone, tenantId, loyaltyEnabled]);

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
    if (showProductCreateForm) {
      setTimeout(() => firstInputRef.current?.focus(), 50);
      (async () => {
        if (!window.electronAPI || !tenantId) return;
        try {
          const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId });
          if (gen?.success && gen?.barcode) {
            setNewProductBarcode(gen.barcode);
          }
        } catch (err) {
          console.error("Failed to generate auto barcode", err);
        }
      })();
    }
  }, [showProductCreateForm]);

  const [isLoadingEditBill, setIsLoadingEditBill] = useState(false);

  // Listen for Edit Bill from Sales History — loads items directly into cart
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('editBillData');
      if (!raw) return;
      localStorage.removeItem('editBillData');

      try {
        const { invoice, items: invoiceItems, originalRole } = JSON.parse(raw);
        if (!invoiceItems?.length) return;

        setIsLoadingEditBill(true);

        if (!useTabStore.getState().activeTabId) {
          tabCounter.current++;
          addTab(undefined, `Bill ${tabCounter.current}`);
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
          let tax_rate_percent = Number(item.tax_rate_percent) || 0;
          let billing_type = isPcsWeight ? 'WEIGHT' : (item.billing_type || 'PIECE');
          let pricing_mode = item.pricing_mode || 'FIXED';
          let purchase_price = Number(item.purchase_price) || 0;
          let grade_id = item.grade_id || null;
          let grade_rate = item.grade_rate || null;
          let uom = item.uom || item.unit || (isPcsWeight ? 'Kgs' : 'PCS');
          const pcsValForPpk = item.pieces_sold != null ? Number(item.pieces_sold) : (item.pieces_override != null ? Number(item.pieces_override) : undefined);
          let pieces_per_kg: number | undefined = (pcsValForPpk !== undefined && Number(item.quantity) > 0) ? (pcsValForPpk / Number(item.quantity)) : undefined;
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
            tax_rate_percent = p.gst_percent || 0;
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

            const mrp = Number(p.base_price) || 0;
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
            base_price = Number(item.base_price || item.unit_price) || 0;
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

        // Set customer info and title on active tab
        updateActiveTab({
          customerName: invoice.customer_name || '',
          customerPhone: invoice.customer_phone || '',
          customerGstin: invoice.customer_gstin || '',
          customerAddress: invoice.customer_address || '',
          paymentMethod: invoice.payment_method || 'PENDING',
          receivedAmount: Number(invoice.received_amount) || 0,
          title: invoice.invoice_number,
        });

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

        const enriched = rawItems
          .map((item: any) => ({
            ...item,
            already_returned: returnedMap[item.item_id] || 0,
            available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
          }))
          .filter((item: any) => item.available_to_return > 0);

        if (enriched.length === 0) {
          setHardwareError('All items have already been returned');
          return;
        }

        // Clear cart and activate return mode
        clearCart();
        await reserveReturnNumberForTab();
        setReturnMode(true);

        // Load returnable items into cart
        enriched.forEach((item: any) => {
          const productId = item.product_id || `return-${uuidv4()}`;
          addItem({
            product_id: productId,
            invoiceItemId: item.item_id,
            name: item.name || 'Product',
            base_price: Number(item.unit_price) || 0,
            purchase_price: Number(item.unit_price) || 0,
            tax_rate_percent: Number(item.tax_rate_percent) || 0,
            billing_type: item.billing_type,
            isReturnItem: true,
            originalQuantity: Number(item.quantity) || 0,
            availableToReturn: item.available_to_return,
            alreadyReturned: item.already_returned,
            originalUnitPrice: Number(item.unit_price) || 0,
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
    const m = productPricingMap[product.product_id];
    if (!m) return undefined;
    const v = m[selectedTierId];
    return v != null && v > 0 ? v : undefined;
  };

  const applyPartyTier = (name: string, phone: string) => {
    if (!name && !phone) return;
    const match = partiesForTier.find(p =>
      (name && p.name?.toLowerCase() === name.toLowerCase()) ||
      (phone && p.phone && String(p.phone) === phone)
    );
    if (match?.pricing_tier_id && pricingTiers.some(t => t.pricing_tier_id === match.pricing_tier_id)) {
      setSelectedTierId(match.pricing_tier_id);
    } else if (match) {
      setSelectedTierId('');
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
    // For heavy items (1 piece > 1 Kg), default to 1 piece instead of 1 Kg (which rounds to 0 pcs)
    const initialQtyForProduct = (isWeightProduct && piecesPerKg && piecesPerKg > 0 && piecesPerKg < 1)
      ? +(1 / piecesPerKg).toFixed(3)
      : undefined;
    const tierPrice = getTierPriceForProduct(product);
    addItem({
      product_id: product.product_id,
      name: product.name,
      base_price: tierPrice ?? product.base_price,
      purchase_price: product.pricing_mode === 'GRADE_RATE' && product.grade_purchase_price !== undefined && product.grade_purchase_price !== null
        ? Number(product.grade_purchase_price)
        : (product.purchase_price ?? 0),
      tax_rate_percent: product.tax_rate_percent ?? 0,
      uom: product.uom,
      billing_type: effectiveBillingType,
      pieces_per_kg: piecesPerKg,
      grade_id: tierPrice != null ? null : product.grade_id,
      pricing_mode: tierPrice != null ? 'FIXED_PRICE' : product.pricing_mode,
      grade_rate: tierPrice != null ? null : product.grade_rate,
      discount_percent: product.discount_percent ?? null,
      discount_flat: product.discount_flat ?? null,
      offer_price: product.offer_price ?? null,
      sku_barcode: product.sku_barcode || null,
      brand_manufacturer: product.brand_manufacturer || null,
      isServiceItem: Number(product.is_service_item) ? true : undefined,
      quantity: initialQtyForProduct,
    });
    setSearchQuery('');
    setResults([]);
    pendingFocusProductIdRef.current = product.product_id;
    setTimeout(() => {
      const input = qtyRefs.current[product.product_id];
      if (input) {
        input.focus();
        input.select();
        pendingFocusProductIdRef.current = null;
      }
    }, 50);
  };

  const resetProductForm = () => {
    setShowProductCreateForm(false);
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
      if (!newProductBasePrice && newProductGradeForm.rate) setNewProductBasePrice(newProductGradeForm.rate);
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

  const handleCreateAndAddProduct = async (retries = 3, isAutoGenerated = false, asTemp = false) => {
    if (!window.electronAPI || !tenantId || !newProductName.trim()) return;
    const purchasePrice = Number(newProductPurchasePrice) || 0;
    const basePrice = Number(newProductBasePrice) || purchasePrice;
    const qty = Number(newProductStock) || 0;
    const isGstProduct = (invoiceType === 'GST') || newProductIsGstApplicable;

    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightBilling = weightUoms.includes((newProductUom || '').toLowerCase());
    const billingType: 'WEIGHT' | 'PIECE' = isWeightBilling ? 'WEIGHT' : 'PIECE';

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
        current_stock: 0,
      });
      if (qty > 0) updateQuantity(productId, qty);
      setSearchQuery('');
      setResults([]);
      resetProductForm();
      return;
    }

    const wasAutoGenerated = isAutoGenerated || !newProductBarcode;
    const productId = uuidv4();
    let finalBarcode = newProductBarcode;
    if (!finalBarcode) {
      const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
      finalBarcode = (gen?.success && gen?.barcode) || `${newProductItemCode || '0'}001`;
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
      domain_attributes: isWeightBilling && rawPcs > 0 ? JSON.stringify(domainAttrsObj) : '{}',
      grade_id: selectedGrade?.grade_id || null,
      pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
      is_deleted: 0,
      sync_status: 'PENDING',
    });
    if (res.success) {
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
    const itemId = uuidv4();
    addItem({
      product_id: itemId,
      name: cat.name,
      base_price: Number(cat.purchase_price) || 0,
      purchase_price: Number(cat.purchase_price) || 0,
      tax_rate_percent: 0,
      billing_type: 'WEIGHT',
      isScrap: true,
      scrap_category_id: cat.scrap_category_id,
      quantity: 0,
    });
    setSearchQuery('');
    setScrapSearchResults([]);
    pendingFocusProductIdRef.current = itemId;
    setTimeout(() => {
      const input = qtyRefs.current[itemId];
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
      const enriched = (rawItems || []).map((item: any) => ({
        ...item,
        already_returned: returnedMap[item.item_id] || 0,
        available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
      })).filter((item: any) => item.available_to_return > 0);

      if (enriched.length === 0) {
        setSelectedReturnInvoice(null);
        setHardwareError(`Invoice ${inv.invoice_number} has already been fully returned. No items left to return.`);
        return;
      }

      // Clear entire cart (both regular AND previously loaded return items) to
      // avoid mixing items from a previously selected invoice into this return
      items.forEach(i => removeItem(i.product_id));
      enriched.forEach((item: any) => {
        const productId = item.product_id || `return-${uuidv4()}`;
        addItem({
          product_id: productId,
          invoiceItemId: item.item_id,
          name: item.name || 'Product',
          base_price: Number(item.unit_price) || 0,
          purchase_price: Number(item.unit_price) || 0,
          tax_rate_percent: Number(item.tax_rate_percent) || 0,
          billing_type: item.billing_type,
          isReturnItem: true,
          originalQuantity: Number(item.quantity) || 0,
          availableToReturn: item.available_to_return,
          alreadyReturned: item.already_returned,
          originalUnitPrice: Number(item.unit_price) || 0,
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

            addItem({
              product_id: productId,
              name: item.name || dbProduct.name || 'Product',
              base_price: Number(item.rate) || 0,
              purchase_price: Number(item.rate) || 0,
              tax_rate_percent: 0,
              billing_type: item.weight && Number(item.weight) > 0 ? 'WEIGHT' : (dbProduct.billing_type || undefined),
              quantity: qty,
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
      clearCart();
      setReturnMode(false);
      setIsScrapMode(false);
      setEditingQuotation(null, null);
      useCartStore.getState().setEditingInvoice(null, null, null);
      setQuotationMode(true);
      
      updateActiveTab({
        customerName: '',
        customerPhone: '',
        customerGstin: '',
        customerAddress: '',
        paymentMethod: 'PENDING',
        receivedAmount: 0,
        reservedQuotationNumber: '',
      });
      await reserveQuotationNumberForTab(true);
      syncActiveSnapshot();
      setTimeout(() => {
        window.focus();
        if (searchRef.current) {
          searchRef.current.focus();
          searchRef.current.select();
        }
      }, 100);
    };

    window.addEventListener('open-new-quotation', handler);
    return () => window.removeEventListener('open-new-quotation', handler);
  }, [reserveQuotationNumberForTab]);

  // Past bill selection: load selected invoice into cart for editing
  const handleSelectPastBill = async (invoice: any) => {
    if (!window.electronAPI) return;
    try {
      const items = await window.electronAPI.dbGetInvoiceItems(invoice.invoice_id);
      if (!Array.isArray(items) || items.length === 0) {
        setHardwareError('Invoice has no items');
        return;
      }
      localStorage.setItem('editBillData', JSON.stringify({
        invoice,
        items,
        originalRole: authRole,
      }));
      setSearchQuery('');
      setPastBillResults([]);
      setIsPastBillMode(false);
      window.dispatchEvent(new CustomEvent('open-edit-bill'));
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
            // Add the product directly to the cart
            const prod = products[0];
            
            const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
            const isWeightProduct = prod.billing_type === 'WEIGHT' || weightUoms.includes((prod.uom || '').toLowerCase());
            const effectiveBillingType: 'WEIGHT' | 'PIECE' = isWeightProduct ? 'WEIGHT' : 'PIECE';

            // Replicate the piece-per-kg logic from handleSelectProduct
            let piecesPerKg;
            if (isWeightProduct && prod.domain_attributes) {
              try {
                const da = typeof prod.domain_attributes === 'string'
                  ? JSON.parse(prod.domain_attributes)
                  : prod.domain_attributes;
                const storedPpk = Number(da.pcs_per_kg) || 0;
                const totalPcs = Number(da.pcs) || 0;
                const stockKg = Number(prod.current_stock) || 0;
                // Prefer stored ratio; fall back to pcs count even when stock is 0/negative
                piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
              } catch {
                piecesPerKg = 1;
              }
            } else if (isWeightProduct) {
              piecesPerKg = 1;
            }
            // For heavy items (1 piece > 1 Kg), default to 1 piece
            const initialQtyForScan = (isWeightProduct && piecesPerKg && piecesPerKg > 0 && piecesPerKg < 1)
              ? +(1 / piecesPerKg).toFixed(3)
              : undefined;

            addItem({
              product_id: prod.product_id,
              name: prod.name,
              base_price: prod.base_price,
              purchase_price: prod.pricing_mode === 'GRADE_RATE' && prod.grade_purchase_price !== undefined && prod.grade_purchase_price !== null
                ? Number(prod.grade_purchase_price)
                : (prod.purchase_price ?? 0),
              tax_rate_percent: prod.tax_rate_percent ?? 0,
              uom: prod.uom,
              billing_type: effectiveBillingType,
              pieces_per_kg: piecesPerKg,
              grade_id: prod.grade_id,
              pricing_mode: prod.pricing_mode,
              grade_rate: prod.grade_rate,
              discount_percent: prod.discount_percent ?? null,
              discount_flat: prod.discount_flat ?? null,
              offer_price: prod.offer_price ?? null,
              sku_barcode: prod.sku_barcode || null,
              brand_manufacturer: prod.brand_manufacturer || null,
              isServiceItem: Number(prod.is_service_item) ? true : undefined,
              quantity: initialQtyForScan,
            });
            syncActiveSnapshot();
            playBeep();

            // Keep focus on search input for next scan!
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
      const enriched = (rawItems || []).map((item: any) => ({
        ...item,
        already_returned: returnedMap[item.item_id] || 0,
        available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
      })).filter((item: any) => item.available_to_return > 0);

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
        return {
          product_id: item.product_id,
          name: item.name,
          quantity: item.available_to_return,
          base_price: Number(item.unit_price) || 0,
          purchase_price: Number(item.unit_price) || 0,
          tax_rate_percent: Number(p?.gst_percent || item.gst_percent) || 0,
          pricing_mode: 'FIXED',
          isReturnItem: true,
          invoiceItemId: item.item_id,
          originalQuantity: Number(item.quantity) || 0,
          availableToReturn: item.available_to_return,
          alreadyReturned: item.already_returned,
          originalUnitPrice: Number(item.unit_price) || 0,
          originalTaxAmount: Number(item.tax_amount) || 0,
          returnSourceInvoiceId: invoice.invoice_id,
          returnSourceInvoiceNumber: invoice.invoice_number,
          uom: p?.uom || 'PCS',
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
    if (items.length === 0) return;
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

      const qItems = items.map(item => {
        const rate = item.pricing_mode === 'GRADE_RATE' ? (item.grade_rate || 0) : item.base_price;
        const qty = Number(item.quantity) || 0;
        const amount = rate * qty;
        return {
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: qty,
          weight: item.billing_type === 'WEIGHT' ? qty : 0,
          rate,
          amount,
        };
      });

      const qSubtotal = qItems.reduce((s, i) => s + i.amount, 0);
      const qTaxTotal = invoiceType === 'GST' ? qSubtotal * 0.18 : 0;
      const qGrandTotal = qSubtotal + qTaxTotal;

      if (editingQuotationId) {
        // Update existing quotation
        await window.electronAPI.dbUpdateQuotation({
          quotation_id: quotationId,
          tenant_id: tid,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress || null,
          terms_conditions: quotationTerms,
          subtotal: qSubtotal,
          tax_total: qTaxTotal,
          grand_total: qGrandTotal,
          items: qItems.map(i => ({ ...i, tenant_id: tid })),
        });
      } else {
        // Save new quotation
        await window.electronAPI.dbSaveQuotation({
          quotation_id: quotationId,
          tenant_id: tid,
          quotation_number: quotationNumber,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress || null,
          terms_conditions: quotationTerms,
          subtotal: qSubtotal,
          tax_total: qTaxTotal,
          grand_total: qGrandTotal,
          items: qItems.map(i => ({ ...i, tenant_id: tid })),
        });
      }

      if (shouldPrint) {
        const fullHtml = `<!DOCTYPE html>
          <html>
            <head>
              <title>Quotation - ${shopName}</title>
              <style>
                @page { size: A4; margin: 15mm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
                .header h1 { font-size: 24px; margin: 0; }
                .header p { font-size: 13px; color: #666; margin: 3px 0; }
                .qtn-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #f5f5f5; padding: 8px 6px; border: 1px solid #ddd; text-align: left; font-size: 10px; text-transform: uppercase; }
                td { padding: 6px; border: 1px solid #ddd; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .total-row td { font-weight: bold; }
                .terms { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; }
                .terms h3 { font-size: 14px; margin-bottom: 8px; }
                .terms p { font-size: 11px; color: #555; white-space: pre-line; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>${shopNameState || shopName || 'Shop'}</h1>
                <p>${shopAddress || ''}</p>
                <p>Phone: ${shopPhone || ''}</p>
                ${shopGstin ? `<p>GST: ${shopGstin}</p>` : ''}
                <h2 style="margin-top: 10px;">QUOTATION</h2>
              </div>
              <div class="qtn-info">
                <div>
                  <p><strong>Quotation #:</strong> ${quotationNumber}</p>
                  <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
                <div style="text-align: right;">
                  <p><strong>Customer:</strong> ${customerName || 'N/A'}</p>
                  <p><strong>Phone:</strong> ${customerPhone || ''}</p>
                  <p><strong>Address:</strong> ${customerAddress || ''}</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th class="text-center" style="width: 40px;">#</th>
                    <th>Item</th>
                    <th class="text-center" style="width: 100px;">Qty/Weight</th>
                    <th class="text-right" style="width: 80px;">Rate</th>
                    <th class="text-right" style="width: 100px;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${qItems.map((item, idx) => `
                    <tr>
                      <td class="border p-2 text-center">${idx + 1}</td>
                      <td class="border p-2">${item.name}</td>
                      <td class="border p-2 text-center">${item.quantity}${item.weight > 0 ? ` (${item.weight.toFixed(3)} ${item.weight > 0 ? 'KG' : ''})` : ''}</td>
                      <td class="border p-2 text-right">\u20B9${item.rate.toFixed(2)}</td>
                      <td class="border p-2 text-right font-bold">\u20B9${item.amount.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan="4" class="text-right">Subtotal</td>
                    <td class="text-right">\u20B9${qSubtotal.toFixed(2)}</td>
                  </tr>
                  ${qTaxTotal > 0 ? `<tr><td colspan="4" class="text-right">GST (18%)</td><td class="text-right">\u20B9${qTaxTotal.toFixed(2)}</td></tr>` : ''}
                  <tr class="total-row" style="font-size: 16px;">
                    <td colspan="4" class="text-right">Grand Total</td>
                    <td class="text-right" style="color: #2563eb;">\u20B9${qGrandTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
              <div class="terms">
                <h3>Terms & Conditions</h3>
                <p>${quotationTerms || '1. This quotation is valid for 15 days from the date of issue.'}</p>
              </div>
              <p style="text-align: center; font-size: 10px; color: #999; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
                Generated by Vendora POS — ${new Date().toLocaleString('en-IN')}
              </p>
            </body>
          </html>`;

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

      setQuotationSuccess(`${editingQuotationId ? 'Updated' : 'Saved'} Quotation ${quotationNumber}`);
      clearCart();
      setEditingQuotation(null, null);
      setQuotationMode(false);
      updateActiveTab({ 
        customerName: '', 
        customerPhone: '', 
        customerGstin: '', 
        customerAddress: '', 
        paymentMethod: 'PENDING', 
        receivedAmount: 0,
        reservedQuotationNumber: '',
      });
      syncActiveSnapshot();
      setQuotationTerms('1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.');
      reserveInvoiceNumberForTab();
      const tab = getActiveTab();
      if (tab?.reservedInvoiceNumber) {
        const titlePrefix = (invoiceType === 'GST' && !enableThreeInvoiceSeries) ? 'GST-' : '';
        updateActiveTab({ title: `${titlePrefix}${tab.reservedInvoiceNumber}` });
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
      if (e.key === ' ' && !showProductCreateForm && !isScrapMode && !isReturnMode && !isPastBillMode && !isQuotationMode) {
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
  }, [showProductCreateForm, isScrapMode, isReturnMode, isPastBillMode, isQuotationMode]);

  const handleSearchKey = async (e: React.KeyboardEvent) => {
    const maxLen = isScrapMode ? scrapSearchResults.length : isPastBillMode ? pastBillResults.length : results.length;
    if (e.key === 'ArrowDown') { setSelectedIndex(i => Math.min(i + 1, maxLen - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSelectedIndex(i => Math.max(i - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (isScrapMode) {
        if (scrapSearchResults[selectedIndex]) handleSelectScrapItem(scrapSearchResults[selectedIndex]);
      } else if (isReturnMode) {
        if (returnSearchResults[selectedIndex]) handleSelectReturnInvoice(returnSearchResults[selectedIndex]);
      } else if (isPastBillMode) {
        if (pastBillResults[selectedIndex]) handleSelectPastBill(pastBillResults[selectedIndex]);
      } else {
        // Normal billing / quotation mode:
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery.length >= 1 && !isQuotationMode && window.electronAPI) {
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
        } else if (!showProductCreateForm && searchQuery.length >= 1 && !isQuotationMode) {
          setShowProductCreateForm(true);
          setNewProductName(searchQuery);
        }
      }
    }
    else if (e.key === ' ' && searchQuery.trim() === '' && !isScrapMode && !isReturnMode && !isPastBillMode && !isQuotationMode) { e.preventDefault(); setShowProductCreateForm(true); setNewProductName(''); }
    else if (e.key === 'Escape') { setResults([]); setScrapSearchResults([]); setPastBillResults([]); setSearchQuery(''); setIsPastBillMode(false); }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent, _productId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // After confirming qty, return focus to the search field so the cashier
      // can immediately scan or type the next product barcode.
      searchRef.current?.focus();
      searchRef.current?.select();
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
    if (e.key === 'Enter') {
      e.preventDefault();
      const flatInput = discFlatRefs.current[productId];
      if (flatInput) { flatInput.focus(); flatInput.select(); }
    }
  };

  const handleDiscFlatKeyDown = (e: React.KeyboardEvent, _productId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchRef.current?.focus();
    }
  };

  const handleCheckout = async (saveOnly = false) => {
    if (items.length === 0) return;
    if (!window.electronAPI) return;
    if (isCheckingOutRef.current) return;
    isCheckingOutRef.current = true;

    let scrapPrintSuccess = true;
    let printSuccess = true;

    const cartStore = useCartStore.getState();
    const editingInvoiceId = cartStore.editingInvoiceId;
    const editingInvoiceNumber = cartStore.editingInvoiceNumber;
    const editingInvoiceRole = cartStore.editingInvoiceRole;

    setIsCheckingOut(true);
    setHardwareError(null);

    if (isScrapMode) {
      try {
        let scrapInvoiceNum = editingInvoiceNumber;
        const finalScrapGrandTotal = scrapTotal + extraBonus;

        if (scrapPaymentStatus === 'CREDIT') {
          if (!customerName.trim() || !customerPhone.trim()) {
            setHardwareError('Please enter Customer Name and Phone Number for Credit payment');
            setIsCheckingOut(false);
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
            setIsCheckingOut(false); return;
          }
        } else {
          const numRes = await window.electronAPI.dbGetNextScrapInvoiceNumber({ tenant_id: 'global' });
          if (!numRes.success || !numRes.invoiceNumber) {
            setHardwareError('Failed to generate scrap invoice number');
            setIsCheckingOut(false); return;
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
              setIsCheckingOut(false); return;
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
            shopName: scrapBillSettings.showShopName ? (shopNameState || shopName || 'My Shop') : '',
            shopGstin: scrapBillSettings.showShopGstin ? (shopGstin || undefined) : undefined,
            shopAddress: scrapBillSettings.showShopAddress ? (shopAddress || undefined) : undefined,
            shopPhone: scrapBillSettings.showPhone ? (shopPhone || undefined) : undefined,
            upiId: undefined,
            showUpiQr: false,
            showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
            invoiceNumber: scrapInvoiceNum || '',
            invoiceType: 'SCRAP',
            date: formatBillDateTime(new Date()),
            billerName: userName || authRole || undefined,
            items: scrapReceiptItems,
            subtotal: scrapTotal,
            tax: 0,
            discount: discount,
            discountType: cartState.discountType,
            discountValue: cartState.discountValue,
            grandTotal: finalScrapGrandTotal,
            extraBonus: extraBonus,
            customerName: scrapBillSettings.showCustomerName ? (customerName || undefined) : undefined,
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
        setIsCheckingOut(false);
        setTimeout(async () => {
          const tabsCount = useTabStore.getState().tabs.length;
          const currentActiveId = activeTabId;
          if (tabsCount > 1) {
            closeTab(currentActiveId);
          } else {
            clearCart();
            useCartStore.getState().setEditingInvoice(null, null, null);
            updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', paymentMethod: 'PENDING', receivedAmount: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '' });
            syncActiveSnapshot();
            await Promise.all([reserveScrapInvoiceNumberForTab(), reserveInvoiceNumberForTab()]);
            const tab = getActiveTab();
            if (tab?.reservedScrapInvoiceNumber) {
              updateActiveTab({ title: tab.reservedScrapInvoiceNumber });
            }
          }
          setCheckoutSuccess(false); // scrap mode reset
        }, 1800);
      } catch (error) {
        console.error('Failed to save scrap invoice error:', error);
        setHardwareError('Failed to save scrap invoice');
        setIsCheckingOut(false);
      }
      return;
    }

    // ── Normal Mode Checkout ──
    // Read PCS directly from DOM input elements (100% reliable — avoids ALL React state closure/batching issues)
    const pcsSnapshot: Record<string, number> = {};
    items.forEach(item => {
      const domInput = qtyRefs.current[item.product_id];
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

    if (paymentMethod === 'CREDIT') {
      if (!(customerName || '').trim() || !(customerPhone || '').trim()) {
        setHardwareError('Please enter Customer Name and Phone Number for Credit');
        setIsCheckingOut(false);
        return;
      }
    }

    if (paymentMethod === 'SPLIT') {
      if (splitTotal <= 0) {
        setHardwareError('Please enter split payment breakdown amounts for Cash, Card, or UPI');
        setIsCheckingOut(false);
        return;
      }
    }

    const isEditing = !!editingInvoiceId;

    const isPaymentPending = paymentMethod === 'PENDING';
    const effectiveReceivedAmount = isPaymentPending ? 0 : (paymentMethod === 'SPLIT' ? splitTotal : receivedAmount);
    const effectiveBalanceAmount = isPaymentPending ? 0 : (refundAmount > 0 ? 0 : balanceAmount);

    const invoice_id = isEditing ? editingInvoiceId : uuidv4();
    const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (customerGstin?.trim() ? 'gst_b2b' : 'gst_b2c') : 'normal') : undefined;
    let invoice_number: string;
    if (isEditing && editingInvoiceNumber) {
      invoice_number = editingInvoiceNumber;
    } else {
      const serverResult = await window.electronAPI.dbGetNextServerInvoiceNumber({ tenant_id: tenantId || 'global', series });
      if (serverResult.success && serverResult.invoiceNumber) {
        invoice_number = serverResult.invoiceNumber;
      } else {
        const localResult = await window.electronAPI.dbGetNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
        invoice_number = localResult.success && localResult.invoiceNumber
          ? localResult.invoiceNumber
          : `${tenantId?.substring(0, 4).toUpperCase() || 'POS1'}-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;
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

      const rate = item.pricing_mode === 'GRADE_RATE' ? (item.grade_rate || 0) : item.base_price;
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

      const rate = item.pricing_mode === 'GRADE_RATE' ? (item.grade_rate || 0) : item.base_price;
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
      const mrpRate = rate;
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
      }
      return {
        name: item.name,
        quantity: qty,
        unit_price: unitPrice,
        total,
        originalRate,
        discountLabel,
        brand: item.brand_manufacturer || undefined,
        billing_type: item.billing_type,
        pieces_override: item.pieces_override,
        pieces_per_kg: item.pieces_per_kg,
        unit: item.unit,
        isCombo: item.isCombo,
        combo_items: item.combo_items,
      };
    });

    try {
      const cfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;

      const printFmtRaw = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const openCashDrawerOnPending = printFmt.openCashDrawerOnPending === true;
      const isHalfA4 = printFmt.format === 'half-a4';
      const isA4 = printFmt.format === 'a4';
      const isB2B = Boolean(customerGstin?.trim());
      const useA4 = isB2B || isA4 || isHalfA4;
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };

      const state = useCartStore.getState();
      // Calculate loyalty points
      const previousPointsBalance = loyaltyCustomerData.customerId ? loyaltyCustomerData.pointsBalance : 0;
      const pointsEarned = loyaltyEnabled && loyaltyCustomerData.customerId && (paymentMethod !== 'PENDING')
        ? Math.floor(displayGrandTotal / loyaltyEarningRate)
        : 0;
      const pointsRedeemed = showLoyaltyRedemption && loyaltyCustomerData.customerId
        ? Math.min(pointsToRedeem, loyaltyCustomerData.pointsBalance)
        : 0;
      const pointsRedeemedDiscount = pointsRedeemed * loyaltyRedemptionRate;
      const remainingPointsBalance = previousPointsBalance + pointsEarned - pointsRedeemed;
      // Adjust grand total for points redemption discount
      const effectiveGrandTotal = Math.max(0, displayGrandTotal - pointsRedeemedDiscount);

      // Pass grand total BEFORE scrap deduction so the receipt can properly show
      // the scrap deduction line and compute the correct final grand total.
      // Without this fix, scrap deduction was subtracted twice (here and in receiptGenerator).
      const grandTotalBeforeScrap = Math.max(0, grandTotal - pointsRedeemedDiscount);

      const receiptData: ReceiptData = {
        shopName: billSettings.showShopName ? (shopNameState || shopName || 'My Shop') : '',
        shopGstin: billSettings.showShopGstin ? (shopGstin || undefined) : undefined,
        shopState: billSettings.showShopState ? (state.shopState || undefined) : undefined,
        shopAddress: billSettings.showShopAddress ? (shopAddress || undefined) : undefined,
        shopPhone: billSettings.showPhone ? (shopPhone || undefined) : undefined,
        upiId: upiId || undefined,
        showUpiQr: showUpiQr,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
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
        ...(paymentMethod === 'CASH' && !isPaymentPending ? { receivedAmount: effectiveReceivedAmount, balanceAmount: effectiveBalanceAmount } : {}),
        invoiceType,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerGstin: billSettings.showCustomerGstin ? (customerGstin || undefined) : undefined,
        customerState: billSettings.showCustomerGstin ? (customerState || undefined) : undefined,
        billSettings,
        isB2B,
      };

      let result: any;
      const wantsLoyalty = loyaltyEnabled && !!(customerName || '').trim() && (!!(customerPhone || '').trim() || !!(customerAddress || '').trim() || loyaltyCustomerData.customerId);
      if (isEditing) {
        result = await window.electronAPI.dbUpdateInvoice({
          invoice_id, tenant_id: tenantId || 'global', role: editingInvoiceRole || authRole,
          subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: paymentMethod,
          split_details: paymentMethod === 'SPLIT'
            ? { ...(splitDetails || {}), upi_id: currentSelectedUpi?.upi_id, upi_name: currentSelectedUpi?.name, upi_source_id: currentSelectedUpi?.source_id }
            : (paymentMethod === 'UPI' && currentSelectedUpi
                ? { upi_id: currentSelectedUpi.upi_id, upi_name: currentSelectedUpi.name, upi_source_id: currentSelectedUpi.source_id }
                : (splitDetails || undefined)),
          customer_name: customerName || null, customer_phone: customerPhone || null,
          customer_gstin: billSettings.showCustomerGstin ? (customerGstin || null) : null,
          customer_state: billSettings.showCustomerGstin ? (customerState || null) : null,
          customer_address: customerAddress || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
          // GST totals for edited invoice
          cgst_total: cgst, sgst_total: sgst, igst_total: igst, supply_type: _supplyType,
          items: checkoutItems,
        });
      } else {
        result = await window.electronAPI.dbCheckout({
          invoice_id, tenant_id: tenantId || 'unset', user_id: userId || 'unset', invoice_number,
          invoice_type: invoiceType, subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: paymentMethod,
          split_details: paymentMethod === 'SPLIT'
            ? { ...(splitDetails || {}), upi_id: currentSelectedUpi?.upi_id, upi_name: currentSelectedUpi?.name, upi_source_id: currentSelectedUpi?.source_id }
            : (paymentMethod === 'UPI' && currentSelectedUpi
                ? { upi_id: currentSelectedUpi.upi_id, upi_name: currentSelectedUpi.name, upi_source_id: currentSelectedUpi.source_id }
                : (splitDetails || undefined)),
          received_amount: effectiveReceivedAmount, balance_amount: effectiveBalanceAmount,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          customer_gstin: billSettings.showCustomerGstin ? (customerGstin || null) : null,
          customer_state: billSettings.showCustomerGstin ? (customerState || null) : null,
          customer_address: customerAddress || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
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
        isCheckingOutRef.current = false;
        setIsCheckingOut(false);
        return;
      }

      // Consume ADJUST_BILL return credit. Only the portion actually applied to this
      // bill (clamped to the bill total) is settled; any leftover stays as pending
      // credit for a future bill. Editing a bill never re-consumes credit.
      if (!isEditing && storeReturnDeduction > 0 && storeReturnInvoiceNumber && window.electronAPI) {
        try {
          const consumed = Math.min(storeReturnDeduction, grandTotal);
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
            const invoiceStyle = isHalfA4 ? 'half-a4' : (printFmt.style || 'standard');
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
            const thermalStyle = printFmt.style || 'standard';
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
            await window.electronAPI.openCashDrawer(tenantId || 'global');
          }
        } catch (printErr: any) {
          printSuccess = false;
          console.warn('[Checkout] Print error (invoice already saved):', printErr);
          setHardwareError(formatPrinterError(printErr.message));
          setTimeout(() => setHardwareError(null), 5000);
        }
      }
    } catch (err: any) {
      console.error('[Checkout Error]', err);
      setHardwareError(`Checkout failed: ${err?.message || 'Unexpected error'}`);
      isCheckingOutRef.current = false;
      setIsCheckingOut(false);
      return;
    }

    setCheckoutSuccess(saveOnly || !printSuccess ? 'saved' : 'printed');
    isCheckingOutRef.current = false;
    setIsCheckingOut(false);

    // Notify the cashier settlement page (if open) to refresh instantly
    try {
      window.dispatchEvent(new CustomEvent('checkout:completed', { detail: { invoice_id: invoice_id || '', invoice_number: invoice_number || '' } }));
    } catch (e) { /* ignore */ }
    setTimeout(async () => {
      const tabsCount = useTabStore.getState().tabs.length;
      const currentActiveId = activeTabId;
      if (tabsCount > 1) {
        closeTab(currentActiveId);
      } else {
        clearCart();
        clearScrapDeduction();
        clearReturnDeduction();
        updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', paymentMethod: 'PENDING', receivedAmount: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '', reservedReturnNumber: '' });
        syncActiveSnapshot();
        await reserveInvoiceNumberForTab();
        const tab = getActiveTab();
        if (tab?.reservedInvoiceNumber) {
          const titlePrefix = (invoiceType === 'GST' && !enableThreeInvoiceSeries) ? 'GST-' : '';
          updateActiveTab({ title: `${titlePrefix}${tab.reservedInvoiceNumber}` });
        }
      }
      setCheckoutSuccess(false); // normal mode reset
    }, 1800);
  };

  // ── Return Mode: process return from cart items (replaces old 2-phase flow) ──
  const handleProcessReturnFromCart = async (saveOnly = false) => {
    if (!window.electronAPI || !selectedReturnInvoice) return;
    const returnCartItems = items.filter(i => i.isReturnItem && Number(i.quantity) > 0);
    if (returnCartItems.length === 0) return;
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
          discount: 0,
          grandTotal: returnSubtotal + returnTaxTotal,
          invoiceType: 'RETURN',
          customerName: selectedReturnInvoice.customer_name || customerName || undefined,
          customerPhone: selectedReturnInvoice.customer_phone || customerPhone || undefined,
          billSettings,
        };
        const { generateReceiptText } = await import('../utils/receiptGenerator');
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

      setReturnProcessed(true);
      setTimeout(() => {
        setReturnProcessed(false);
        setReturnMode(false);
        setSelectedReturnInvoice(null);
        clearCart();
      }, 2000);
    } catch (e) {
      console.error('Return processing failed', e);
      setHardwareError('Return processing failed. Please try again.');
    } finally {
      setReturnProcessing(false);
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
    const invoice_number = nextInvoiceNumber || `${tenantId?.substring(0, 4).toUpperCase() || 'POS1'}-HLD-${Date.now()}`;

    const lineItems = items.map((item) => {
      const rate = item.pricing_mode === 'GRADE_RATE' ? (item.grade_rate || 0) : item.base_price;
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
            offer_price: item.offer_price ?? null,
            sku_barcode: item.sku_barcode || null,
            brand_manufacturer: item.brand_manufacturer || null,
          });
          const qty = Number(item.quantity) || 1;
          if (qty > 0) {
            updateQuantity(item.product_id, qty);
          }
        }
      }

      // Restore customer info
      updateActiveTab({
        customerName: result.invoice?.customer_name || '',
        customerPhone: result.invoice?.customer_phone || '',
        customerGstin: result.invoice?.customer_gstin || '',
        customerAddress: result.invoice?.customer_address || '',
        paymentMethod: 'PENDING',
        receivedAmount: Number(result.invoice?.received_amount) || 0,
      });

      // Set customer state
      if (result.invoice?.customer_state) {
        setCustomerState(result.invoice.customer_state);
      }

      setShowHeldBillsPanel(false);
      syncActiveSnapshot();
      loadHeldBills();
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
      // Close active tab first if there are multiple tabs
      const { tabs, activeTabId, closeTab } = useTabStore.getState();
      if (tabs.length > 1 && activeTabId) {
        closeTab(activeTabId);
        return;
      }
      // Otherwise close/logout the page
      if (authRole === 'OWNER') setRole('OWNER');
      else logout();
    },
    'F1': () => {
      // Normal Billing Mode
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
      if (next) reserveQuotationNumberForTab();
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    'F7': async () => {
      // Return Mode
      if (featureFlags && featureFlags.returns === false) return;
      const next = !isReturnMode;
      if (next) await reserveReturnNumberForTab();
      setReturnMode(next);
      if (next && isScrapMode) setIsScrapMode(false);
      if (next && isQuotationMode) setQuotationMode(false);
      if (next && isPastBillMode) setIsPastBillMode(false);
      if (!next) { setSelectedReturnInvoice(null); }
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    'F8': () => { discountRef.current?.focus(); },
    'F9': () => {
      // Scrap Deduction
      setReturnDeductionSearchMode(false);
      setTimeout(() => scrapDeductionInputRef.current?.focus(), 100);
    },
    'F10': () => {
      // Return Deduction
      setReturnDeductionSearchMode(true);
      setTimeout(() => returnDeductionInputRef.current?.focus(), 100);
    },
    'F12': () => {
      if (isScrapMode) {
        handleCheckout();
      } else if (isReturnMode) {
        handleProcessReturnFromCart();
      } else if (isQuotationMode && !editingQuotationId) {
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
            <div className="p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
              <Store className="w-4 h-4" />
            </div>
            <div className="min-w-0 leading-tight">
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
              <span              className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                {authRole === 'OWNER' ? 'Owner' : (userName || currentUserRole || 'Staff')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={async () => {
                const tab = getActiveTab();
                clearCart();
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
                  customerName: '', 
                  customerPhone: '', 
                  customerGstin: '', 
                  customerAddress: '', 
                  paymentMethod: 'PENDING', 
                  receivedAmount: 0, 
                  reservedInvoiceNumber: normalInvoiceNumber,
                  title: fallbackTitle 
                });
                syncActiveSnapshot();
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              title="Clear Cart"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Clear Cart</span>
            </button>
          )}
          {(!featureFlags || featureFlags.sales_history || isScrapMode) && (
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
          {enableScrap && (!featureFlags || featureFlags.scrap) && (
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
          {(!featureFlags || featureFlags.quotations) && (
          <button
              onClick={() => {
                const next = !isQuotationMode;
                setQuotationMode(next);
                if (next && isScrapMode) setIsScrapMode(false);
                if (next && isReturnMode) setReturnMode(false);
                if (next && isPastBillMode) setIsPastBillMode(false);
                if (next) reserveQuotationNumberForTab();
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
          {(!featureFlags || featureFlags.returns) && (
          <button
            onClick={async () => {
              const next = !isReturnMode;
              if (next) await reserveReturnNumberForTab();
              setReturnMode(next);
              if (next && isScrapMode) setIsScrapMode(false);
              if (next && isQuotationMode) setQuotationMode(false);
              if (next && isPastBillMode) setIsPastBillMode(false);
              if (!next) { setSelectedReturnInvoice(null); }
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
          {showCashRegister && (!featureFlags || featureFlags.cash_register) && (
            <button
              onClick={() => setCashRegisterOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
              title="Cash Register"
            >
              <Banknote className="w-4 h-4 text-primary" />
              <span>Register</span>
            </button>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border/40" />
          <button
            onClick={authRole === 'OWNER' ? () => setRole('OWNER') : logout}
            className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
            title={authRole === 'OWNER' ? 'Dashboard' : 'Logout'}
          >
            {authRole === 'OWNER' ? <X className="w-4 h-4 text-destructive" /> : <LogOut className="w-4 h-4 text-destructive" />}
          </button>
        </div>
        </div>
      </header>

      {/* ─── TABS BAR ─── */}
      <div className="shrink-0 bg-muted/20 border-b border-border">
        <BillingTabBar onAddTab={handleAddTab} enableThreeInvoiceSeries={enableThreeInvoiceSeries} />
      </div>

      {/* ─── MAIN POS WORKSPACE ─── */}
      <div className="flex flex-1 overflow-hidden bg-background">
        
        {/* ═══ LEFT SIDE: Search + Cart (58%) ═══ */}
        <div className="flex flex-col w-[58%] border-r border-border bg-muted/10">
          
          {/* Prominent Search bar */}
          <div className="p-3 pb-2.5 bg-card border-b border-border">
            <div ref={searchContainerRef} className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className={clsx(
                    "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300",
                    isScrapActive ? "text-orange-500" :
                    isReturnMode ? "text-rose-500" :
                    isQuotationActive ? "text-blue-500" :
                    isPastBillMode ? "text-teal-500" :
                    "text-muted-foreground"
                  )} />
                  <input
                    ref={searchRef}
                    type="text"
                    autoFocus
                    placeholder={isScrapActive ? "Search scrap categories... (Scrap Mode)" : isReturnMode ? "Search invoices for return... (Return Mode)" : isQuotationActive ? "Search products... (Quotation Mode)" : isPastBillMode ? "Search past bills by invoice number..." : invoiceType === 'GST' ? "Search GST products or scan barcode... (Press F2)" : "Search products or scan barcode... (Press F2)"}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
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
                      '--search-focus-color': isScrapActive
                        ? 'rgb(249,115,22)'
                        : isReturnMode
                        ? 'rgb(244,63,94)'
                        : isQuotationActive
                        ? 'rgb(59,130,246)'
                        : isPastBillMode
                        ? 'rgb(20,184,166)'
                        : undefined,
                      '--search-focus-shadow': isScrapActive
                        ? 'rgba(249,115,22,0.2)'
                        : isReturnMode
                        ? 'rgba(244,63,94,0.2)'
                        : isQuotationActive
                        ? 'rgba(59,130,246,0.2)'
                        : isPastBillMode
                        ? 'rgba(20,184,166,0.2)'
                        : undefined,
                    } as React.CSSProperties}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setResults([]); searchRef.current?.focus(); }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full text-muted-foreground transition-colors border border-destructive/30"
                    >
                      <X className="w-4 h-4 text-destructive" />
                    </button>
                  )}
                </div>

                <div className="flex items-center border border-border rounded-xl overflow-hidden shrink-0">
                  {shopDomain === 'JEWELRY' && !isScrapMode && !isReturnMode && !isPastBillMode && !isQuotationMode && (
                    <>
                      <button
                        onClick={() => scaleReading ? lockScaleWeight() : setScaleReading(true)}
                        className={clsx(
                          "flex items-center gap-1.5 px-3 py-2.5 transition-all text-sm font-bold cursor-pointer active:scale-95 border-0",
                          scaleReading ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                        )}
                        title={scaleReading ? "Lock the current weight" : "Read weight from the connected weighing scale"}
                      >
                        <Scale className="w-4 h-4" />
                        <span className="hidden sm:inline">{scaleReading ? 'Lock' : 'Read Scale'}</span>
                        {scaleReading && (
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-white/25 text-white min-w-[52px] text-center">
                            {scaleLiveWeight > 0 ? `${scaleLiveWeight.toFixed(2)}g` : '...'}
                          </span>
                        )}
                      </button>
                      <div className="w-px h-5 bg-border/60" />
                    </>
                  )}
                  {!isScrapMode && !isReturnMode && !isPastBillMode && !isQuotationMode && (
                    <button
                      onClick={() => { setShowProductCreateForm(true); setNewProductName(''); }}
                      className="flex items-center gap-1.5 px-3 py-2.5 transition-all text-sm font-bold cursor-pointer active:scale-95 bg-primary/10 text-primary hover:bg-primary/20 border-0"
                      title="Add new product"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">Add</span>
                    </button>
                  )}
                  {!isScrapMode && !isReturnMode && !isPastBillMode && !isQuotationMode && (
                    <div className="w-px h-5 bg-border/60" />
                  )}
                  <button
                    onClick={() => {
                      const next = !isPastBillMode;
                      setIsPastBillMode(next);
                      if (next) {
                        // Entering Past Bill mode — exit any other active mode
                        if (isScrapMode) {
                          setIsScrapMode(false);
                          if (editingInvoiceNumber) {
                            useCartStore.getState().setEditingInvoice(null, null, null);
                            setDiscount(0, 'FIXED');
                          }
                          updateActiveTab({ scrapPaymentStatus: 'PENDING', reservedScrapInvoiceNumber: '' });
                        }
                        if (isReturnMode) {
                          setReturnMode(false);
                          setSelectedReturnInvoice(null);
                        }
                        if (isQuotationMode) setQuotationMode(false);
                      }
                      setSearchQuery('');
                      setResults([]);
                      setPastBillResults([]);
                      if (next) setTimeout(() => searchRef.current?.focus(), 100);
                    }}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-2.5 transition-all text-sm font-bold cursor-pointer active:scale-95 border-0",
                      isPastBillMode
                        ? "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    title="Search past bills by invoice number"
                  >
                    <Clock className={clsx("w-4 h-4", isPastBillMode && "text-teal-500")} />
                    <span className="hidden sm:inline">{isPastBillMode ? 'Searching Bills' : 'Past Bill'}</span>
                  </button>
                </div>
              </div>



              {isPastBillMode && pastBillResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="max-h-[320px] overflow-y-auto">
                    <div className="px-3 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                      Past Bills ({pastBillResults.length})
                    </div>
                      {pastBillResults.map((inv, i) => {
                      const isSelected = i === selectedIndex;
                      return (
                        <div
                          key={inv.invoice_id}
                          className={clsx(
                            'flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 transition-colors',
                            isSelected ? 'bg-teal-500/10 border-l-4 border-l-teal-500 pl-2' : 'hover:bg-teal-500/5'
                          )}
                        >
                          <button
                            onClick={() => handleSelectPastBill(inv)}
                            onMouseEnter={() => setSelectedIndex(i)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <div className={clsx(
                              'p-2 rounded-xl shrink-0 transition-colors',
                              isSelected ? 'bg-teal-500/15 text-teal-500' : 'bg-teal-500/10 text-teal-500'
                            )}>
                              <Receipt className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-foreground truncate">{inv.invoice_number}</div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <span>{inv.customer_name || 'Walk-in'}</span>
                                <span>&middot;</span>
                                <span>{new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-black text-teal-600 dark:text-teal-400 mr-1">{formatCurrency(inv.grand_total)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReturnFromPastBill(inv); }}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors cursor-pointer"
                              title="Return this invoice"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!isPastBillMode && (isScrapMode ? scrapSearchResults.length > 0 : isReturnMode ? returnSearchResults.length > 0 : results.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-200">
                  {!isScrapMode && !isReturnMode && (
                    <div className="px-3 py-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border flex items-center justify-between">
                      <span>Products found ({results.length})</span>
                      {searchQuery && <span className="text-primary font-bold">Matching "{searchQuery}"</span>}
                    </div>
                  )}
                  <div className="max-h-[350px] overflow-y-auto">
                    {!isScrapMode && !isReturnMode && results.map((p, i) => {
                      const mrp = getTierPriceForProduct(p) ?? (p.pricing_mode === 'GRADE_RATE' ? (p.grade_rate || 0) : p.base_price);
                      const showOffer = p.offer_price && Number(p.offer_price) > 0;
                      const displayPrice = showOffer ? Number(p.offer_price) : mrp;
                      const isSelected = i === selectedIndex;
                      return (
                        <button
                          key={p.product_id}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectProduct(p); }}
                          onMouseEnter={() => setSelectedIndex(i)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border last:border-0 cursor-pointer',
                            isSelected ? 'bg-primary/5 border-l-4 border-l-primary pl-2' : 'hover:bg-muted/40'
                          )}
                        >
                          <div className={clsx(
                            'p-2 rounded-xl shrink-0 transition-colors',
                            isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          )}>
                            <Package className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-foreground truncate flex items-center gap-1.5">
                              <span>{p.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '')}</span>
                              {/\s*\((GST|EST|Estimate)\)$/i.test(p.name) && (
                                <span className={clsx(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase align-middle select-none",
                                  p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1].toUpperCase() === 'GST'
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                )}>
                                  {p.name.match(/\s*\((GST|EST|Estimate)\)$/i)?.[1]}
                                </span>
                              )}
                              {Number(p.is_service_item) ? (
                                <span className="ml-1.5 text-[9px] font-bold text-violet-600 bg-violet-500/15 px-1.5 py-0.5 rounded uppercase align-middle">Service</span>
                              ) : null}
                              {p.isCombo ? (
                                <span className="ml-1.5 text-[9px] font-bold text-purple-600 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded uppercase align-middle">COMBO OFFER</span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              {p.isCombo && p.combo_items ? (
                                <span className="text-purple-600 dark:text-purple-400 font-medium text-[11px]">
                                  Includes: {p.combo_items.map((ci: any) => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}
                                </span>
                              ) : !Number(p.is_service_item) && (
                                <>
                              <span className="font-mono bg-muted/70 px-1 py-0.5 rounded text-[10px]">{p.sku_barcode || 'NO BARCODE'}</span>
                              <span>&middot;</span>
                              <span className={clsx(
                                'font-semibold',
                                p.current_stock <= 0 ? 'text-destructive' : p.current_stock < 10 ? 'text-amber-500' : 'text-emerald-500'
                              )}>
                                Stock: {(() => {
                                  const ppk = p.domain_attributes ? (() => { try { const d = JSON.parse(typeof p.domain_attributes === 'string' ? p.domain_attributes : '{}'); const storedPpk = Number(d.pcs_per_kg) || 0; const totalPcs = Number(d.pcs) || 0; const stockKg = Number(p.current_stock) || 0; return storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 0); } catch { return 0; } })() : 0;
                                  const unit = p.billing_type === 'WEIGHT' ? 'Kg' : 'Pcs';
                                  return ppk > 0 ? `${Number(p.current_stock).toFixed(2)} Kg (${Math.round(Number(p.current_stock) * ppk)} pcs)` : `${p.current_stock} ${unit}`;
                                })()}
                              </span>
                              </>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {showOffer ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground/70 font-semibold">MRP:</span>
                                <span className="text-xs font-semibold text-muted-foreground line-through">{formatCurrency(mrp)}</span>
                                <span className="text-[10px] text-emerald-500 font-semibold ml-1">Offer:</span>
                                <span className="font-black text-sm text-emerald-500">{formatCurrency(displayPrice)}</span>
                              </div>
                            ) : (
                              <div className="font-black text-sm text-primary">{formatCurrency(displayPrice)}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {isScrapMode && scrapSearchResults.map((s, i) => {
                      const rate = Number(s.purchase_price) || 0;
                      const stock = Number(s.current_stock) || 0;
                      const isSelected = i === selectedIndex;
                      return (
                        <button
                          key={s.scrap_category_id}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectScrapItem(s); }}
                          onMouseEnter={() => setSelectedIndex(i)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border last:border-0 cursor-pointer',
                            isSelected ? 'bg-orange-500/10 border-l-4 border-l-orange-500 pl-2' : 'hover:bg-orange-500/5'
                          )}
                        >
                          <div className={clsx(
                            'p-2 rounded-xl shrink-0 transition-colors',
                            isSelected ? 'bg-orange-500/15 text-orange-500' : 'bg-orange-500/10 text-orange-500'
                          )}>
                            <Recycle className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-foreground truncate">{s.name}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span className="font-semibold text-orange-600 dark:text-orange-400">Scrap</span>
                              <span>&middot;</span>
                              <span className={clsx(
                                'font-semibold',
                                stock <= 0 ? 'text-destructive' : 'text-emerald-500'
                              )}>
                                Stock: {stock.toFixed(1)} {s.unit || 'Kgs'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-orange-500">{formatCurrency(rate)}/{s.unit || 'Kg'}</div>
                          </div>
                        </button>
                      );
                    })}
                    {isReturnMode && returnSearchResults.map((inv, i) => {
                      const isSelected = i === selectedIndex;
                      return (
                        <button
                          key={inv.invoice_id}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectReturnInvoice(inv); }}
                          onMouseEnter={() => setSelectedIndex(i)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border last:border-0 cursor-pointer',
                            isSelected ? 'bg-rose-500/10 border-l-4 border-l-rose-500 pl-2' : 'hover:bg-rose-500/5'
                          )}
                        >
                          <div className={clsx(
                            'p-2 rounded-xl shrink-0 transition-colors',
                            isSelected ? 'bg-rose-500/15 text-rose-500' : 'bg-rose-500/10 text-rose-500'
                          )}>
                            <ArrowLeftRight className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-foreground truncate">{inv.invoice_number}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              <span className="font-semibold text-rose-600 dark:text-rose-400">Return</span>
                              <span>&middot;</span>
                              <span>{inv.customer_name || 'Walk-in'}</span>
                              <span>&middot;</span>
                              <span>{new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black text-sm text-rose-600">{formatCurrency(inv.grand_total)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!isPastBillMode && !isScrapMode && !isReturnMode && !isQuotationMode && searchQuery.length >= 1 && results.length === 0 && !showProductCreateForm && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-200">
                  <button
                    type="button"
                    onClick={() => { setShowProductCreateForm(true); setNewProductName(searchQuery); }}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted transition-colors cursor-pointer border-0 rounded-xl"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-primary">Create "{searchQuery}"</p>
                      <p className="text-[11px] text-muted-foreground">Add as a new product</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>



          {/* Customer details — moved to top of cart */}
          <div className="px-4 py-2.5 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <User className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-muted-foreground/50')} />
                <input
                  placeholder={'Customer Name (optional)'}
                  value={customerName}
                  onChange={e => {
                    updateActiveTab({ customerName: e.target.value });
                    applyPartyTier(e.target.value, customerPhone);
                    if (loyaltyEnabled && e.target.value.length >= 2) {
                      window.electronAPI?.dbFindCustomers({ tenant_id: tenantId || 'global', name: e.target.value }).then((res: any) => {
                        if (Array.isArray(res)) setCustomerSearchResults(res.filter((c: any) => c.name?.toLowerCase().includes(e.target.value.toLowerCase())));
                      });
                    }
                  }}
                  className={clsx(
                    'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 transition-all duration-300',
                    paymentMethod === 'CREDIT'
                      ? 'border-amber-400 bg-amber-500/5 focus:ring-amber-500/30 focus:border-amber-500'
                      : 'border-border focus:ring-primary/20 focus:border-primary'
                  )}
                />
                {customerSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-[200px] overflow-y-auto">
                    {customerSearchResults.map((c: any) => (
                      <button key={c.customer_id}
                        onClick={() => {
                          updateActiveTab({ customerName: c.name, customerPhone: c.phone || '', customerAddress: c.address || '' });
                          applyPartyTier(c.name, c.phone || '');
                          setLoyaltyCustomerData({ customerId: c.customer_id, pointsBalance: Number(c.current_points_balance) || 0 });
                          setCustomerSearchResults([]);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 border-b border-border last:border-0 cursor-pointer">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-foreground truncate">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground">{c.phone || c.address || 'No details'}</div>
                        </div>
                        {Number(c.current_points_balance) > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600 shrink-0">{Number(c.current_points_balance).toFixed(0)} pts</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative flex-1">
                <Phone className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-muted-foreground/50')} />
                <input
                  placeholder={'Phone Number (optional)'}
                  value={customerPhone}
                  onChange={e => {
                    updateActiveTab({ customerPhone: e.target.value });
                    applyPartyTier(customerName, e.target.value);
                    if (loyaltyEnabled && e.target.value.length >= 5) {
                      window.electronAPI?.dbFindCustomers({ tenant_id: tenantId || 'global', phone: e.target.value }).then((res: any) => {
                        if (Array.isArray(res)) setCustomerSearchResults(res.filter((c: any) => c.phone?.includes(e.target.value)));
                      });
                    }}
                  }
                  className={clsx(
                    'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 transition-all duration-300',
                    paymentMethod === 'CREDIT'
                      ? 'border-amber-400 bg-amber-500/5 focus:ring-amber-500/30 focus:border-amber-500'
                      : 'border-border focus:ring-primary/20 focus:border-primary'
                  )}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <input
                  placeholder="Customer Address (optional)"
                  value={customerAddress}
                  onChange={e => updateActiveTab({ customerAddress: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-300"
                />
              </div>
              {pricingTiers.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Select
                    size="sm"
                    triggerClassName="h-auto py-2"
                    className="w-40 sm:w-44"
                    value={selectedTierId}
                    onChange={v => { if (canOverrideTier) setSelectedTierId(v); }}
                    options={[
                      { value: '', label: 'Default (MRP)' },
                      ...pricingTiers.map(t => ({ value: t.pricing_tier_id, label: t.name })),
                    ]}
                    disabled={!canOverrideTier}
                  />
                  {selectedTierId && (
                    <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wider shrink-0 hidden lg:inline">
                      {pricingTiers.find(t => t.pricing_tier_id === selectedTierId)?.name} prices
                    </span>
                  )}
                  {!canOverrideTier && (
                    <span className="text-[10px] text-muted-foreground shrink-0" title="Owner has disabled biller price overrides">🔒 locked</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
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
                    <div className="flex-1">
                      <Select size="sm" triggerClassName="h-auto" value={customerState} onChange={setCustomerState} options={INDIAN_STATES.map(s => ({value:s.code,label:s.name+' ('+s.code+')'}))} className="w-full" />
                    </div>
                    <div className="relative flex-1">
                      <Building className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                      <input
                        placeholder="GSTIN"
                        value={customerGstin}
                        onChange={e => updateActiveTab({ customerGstin: e.target.value.toUpperCase() })}
                        maxLength={15}
                        className="w-full pl-7 pr-2 py-1 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase"
                      />
                    </div>
                </div>
              )}
              {/* Loyalty Points Display & Redemption */}
              {loyaltyEnabled && !isScrapMode && !isQuotationMode && loyaltyCustomerData.customerId && (
                <div className="flex items-center gap-2 ml-auto">
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <Star className="w-3 h-3 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600">{loyaltyCustomerData.pointsBalance.toFixed(0)} pts</span>
                  </div>
                  {loyaltyCustomerData.pointsBalance > 0 && !showLoyaltyRedemption && (
                    <button onClick={() => { setShowLoyaltyRedemption(true); setPointsToRedeem(0); }}
                      className="px-2 py-1 text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-all cursor-pointer">
                      Redeem
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Points Redemption Input */}
            {showLoyaltyRedemption && loyaltyCustomerData.customerId && (
              <div className="mt-2 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-xs font-bold text-amber-600 shrink-0">Redeem Points</span>
                  <input type="number" min="0" max={loyaltyCustomerData.pointsBalance}
                    value={pointsToRedeem || ''}
                    onChange={e => setPointsToRedeem(e.target.value === '' ? 0 : Math.min(Number(e.target.value), loyaltyCustomerData.pointsBalance))}
                    className="w-20 text-center py-1 bg-background border border-amber-500/30 rounded-lg text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="0" />
                  <span className="text-xs text-muted-foreground">pts</span>
                  <span className="text-xs font-bold text-amber-600">
                    = -{formatCurrency(pointsToRedeem * loyaltyRedemptionRate)}
                  </span>
                  <button
                    onClick={() => { setShowLoyaltyRedemption(false); setPointsToRedeem(0); }}
                    className="ml-auto p-1 text-muted-foreground hover:text-destructive rounded-lg transition-colors cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {pointsToRedeem > 0 && (
                  <p className="text-[10px] text-amber-600 mt-1 font-semibold">
                    Discount: {formatCurrency(pointsToRedeem * loyaltyRedemptionRate)} will be applied
                  </p>
                )}
              </div>
            )}
          </div>

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
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F8: {isScrapMode ? 'Extra' : 'Discount'}</span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-primary/10 text-primary rounded-full shadow-2xs">F12: Print</span>
                </div>
              </div>
            ) : (
              items.map(item => {
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
                          {isLastAdded && (
                            <span className="text-[9px] font-black text-violet-600 bg-violet-500/20 border border-violet-500/40 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none animate-pulse">★ LAST ADDED</span>
                          )}
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
                          onKeyDown={e => guardScannerInput(e, item.product_id, serviceAmount || '', v => updateItemOfferPrice(item.product_id, v === '' ? 0 : Number(v)))}
                          onFocus={e => e.target.select()}
                          placeholder="0"
                        />
                      </div>
                      <div className="font-black text-sm text-violet-600 dark:text-violet-400 shrink-0 min-w-[65px] text-right">{formatCurrency(serviceAmount)}</div>
                      <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                if (item.isReturnItem) {
                  const rate = Number(item.originalUnitPrice) || 0;
                  const qtyText = Number(item.quantity) || 0;
                  const total = rate * qtyText;
                  const avail = item.availableToReturn ?? 0;
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
                          {isLastAdded && (
                            <span className="text-[9px] font-black text-rose-600 bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none animate-pulse">★ LAST ADDED</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          <span className="font-semibold">{formatCurrency(rate)}/unit</span>
                          <span className="mx-1">&middot;</span>
                          <span>Avail: {avail}</span>
                          {(item.alreadyReturned ?? 0) > 0 && (
                            <><span className="mx-1">&middot;</span><span>Ret: {item.alreadyReturned}</span></>
                          )}
                          {item.returnSourceInvoiceNumber && (
                            <><span className="mx-1">&middot;</span><span className="text-[9px]">Inv: {item.returnSourceInvoiceNumber}</span></>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 bg-rose-500/10 border border-rose-500/30 rounded-lg py-0.5 shrink-0">
                        <button onClick={() => { const q = Number(item.quantity); if (q > 1) updateQuantity(item.product_id, q - 1); }}
                          className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                        ><Minus className="w-3 h-3" /></button>
                        <input type="number" min="0" max={avail} step="1"
                          ref={(el) => {
                            qtyRefs.current[item.product_id] = el;
                            if (el && pendingFocusProductIdRef.current === item.product_id) {
                              el.focus();
                              el.select();
                              pendingFocusProductIdRef.current = null;
                            }
                          }}
                          className="w-12 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={qtyText}
                          onChange={e => {
                            const v = e.target.value === '' ? 1 : Math.min(avail, Math.max(0, Number(e.target.value)));
                            updateQuantity(item.product_id, v);
                          }}
                          onKeyDown={e => { guardScannerInput(e, item.product_id, qtyText, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                        />
                        <button onClick={() => { const q = Number(item.quantity); if (q < avail) updateQuantity(item.product_id, q + 1); }}
                          className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                        ><Plus className="w-3 h-3" /></button>
                      </div>
                      <div className="text-right shrink-0 min-w-[70px]">
                        <div className="font-black text-sm text-rose-600 dark:text-rose-400">{formatCurrency(total)}</div>
                        {item.originalQuantity && (
                          <div className="text-[9px] text-muted-foreground/50">Sold: {item.originalQuantity}</div>
                        )}
                      </div>
                      <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
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
                          <span className="text-[9px] font-bold text-orange-600 bg-orange-500/15 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">Scrap</span>
                          {isLastAdded && (
                            <span className="text-[9px] font-black text-orange-600 bg-orange-500/20 border border-orange-500/40 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none animate-pulse">★ LAST ADDED</span>
                          )}
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
                        <input type="number" min="0" step="any" inputMode="decimal"
                          className={`w-20 text-right bg-transparent border-0 font-black text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${hasItemBonus ? 'text-emerald-500' : 'text-orange-600 dark:text-orange-400'}`}
                          value={total}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0 || qty <= 0) {
                              removeItemDiscount(item.product_id);
                            } else {
                              const newTotal = parseFloat(val);
                              const newUnitPrice = newTotal / qty;
                              if (Math.abs(newUnitPrice - rate) < 0.001) {
                                removeItemDiscount(item.product_id);
                              } else {
                                updateItemOfferPrice(item.product_id, newUnitPrice);
                              }
                            }
                            setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                            setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                            syncActiveSnapshot();
                          }}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => handleDiscKeyDown(e, item.product_id)}
                        />
                        {hasItemBonus && (
                          <div className="text-[9px] text-muted-foreground/50 line-through font-semibold -mt-0.5 text-right">{formatCurrency(rate * qty)}</div>
                        )}
                      </div>

                      <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                const rate = item.pricing_mode === 'GRADE_RATE' ? (item.grade_rate || 0) : item.base_price;
                const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
                const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
                const _ppk = item.pieces_per_kg || 1;
                const weightKg = Number(item.quantity) || 0;
                const pieces = isPiecesWeight ? (item.pieces_override ?? 1) : 0;
                const qty = weightKg;

                // Explicit discount flag — avoids floating-point comparison bugs
                const hasItemDiscount = !!(
                  (item.offer_price !== null && item.offer_price !== undefined) ||
                  (item.discount_flat !== null && item.discount_flat !== undefined) ||
                  (item.discount_percent !== null && item.discount_percent !== undefined)
                );

                const hasAdHocDiscount = !!(
                  (localDiscPcts[item.product_id] !== undefined && localDiscPcts[item.product_id] !== null && localDiscPcts[item.product_id] !== (item.catalog_discount_percent ?? 0)) ||
                  (localDiscFlats[item.product_id] !== undefined && localDiscFlats[item.product_id] !== null && localDiscFlats[item.product_id] !== (item.catalog_discount_flat ?? 0)) ||
                  (item.discount_percent !== null && item.discount_percent !== undefined && item.discount_percent !== (item.catalog_discount_percent ?? null)) ||
                  (item.discount_flat !== null && item.discount_flat !== undefined && item.discount_flat !== (item.catalog_discount_flat ?? null)) ||
                  (item.offer_price !== null && item.offer_price !== undefined && item.offer_price !== (item.catalog_offer_price ?? null))
                );

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
                const total = effectivePrice * qty;

                // Commit Pcs value to store independently without altering Kg
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
                // Commit Kg value to store independently
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
                      "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 hover:shadow-sm group",
                      isLastAdded
                        ? "ring-2 ring-primary bg-primary/10 border-primary shadow-md scale-[1.01]"
                        : "bg-card border border-border/80 hover:border-primary/40"
                    )}
                  >
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
                        {isLastAdded && (
                          <span className="text-[9px] font-black text-primary bg-primary/20 border border-primary/40 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none animate-pulse">★ LAST ADDED</span>
                        )}
                        {item.sku_barcode && (
                          <span className="text-[10px] font-mono text-muted-foreground/50 truncate hidden sm:inline">{item.sku_barcode}</span>
                        )}
                      </div>
                      {item.isCombo && item.combo_items && (
                        <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
                          Includes: {item.combo_items.map(ci => `${ci.product_name || 'Product'} (x${ci.quantity})`).join(', ')}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                        {item.brand_manufacturer && <span className="font-medium">{item.brand_manufacturer}</span>}
                        {!item.sku_barcode && !item.brand_manufacturer && <span className="italic">No barcode</span>}
                        <span className="text-muted-foreground/40">&middot;</span>
                        <span className="font-bold text-primary">
                          {item.billing_type === 'WEIGHT' ? (
                            isPiecesWeight ? (
                              `${formatCurrency(effectivePrice)}/Kg (${formatCurrency(effectivePrice / _ppk)}/Pc)`
                            ) : (
                              `${formatCurrency(effectivePrice)}/Kg`
                            )
                          ) : (
                            `${formatCurrency(effectivePrice)}/Pc`
                          )}
                        </span>
                      </div>
                    </div>

                    {isPiecesWeight ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">Pcs</span>
                          <input
                            type="text" inputMode="numeric"
                            ref={(el) => {
                              qtyRefs.current[item.product_id] = el;
                              if (el && pendingFocusProductIdRef.current === item.product_id) {
                                el.focus();
                                el.select();
                                pendingFocusProductIdRef.current = null;
                              }
                            }}
                            className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={localPcsStr[item.product_id] ?? String(pieces)}
                            onFocus={e => e.target.select()}
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
                                const pid = item.product_id;
                                setTimeout(() => {
                                  const kInput = kRefs.current[pid];
                                  if (kInput) { kInput.focus(); kInput.select(); }
                                }, 0);
                                e.preventDefault();
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">Kgs</span>
                          <input type="text" inputMode="decimal"
                            ref={(el) => { kRefs.current[item.product_id] = el; }}
                            className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={localKgStr[item.product_id] ?? String(item.quantity ?? '')}
                            onFocus={e => e.target.select()}
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
                                e.preventDefault();
                                searchRef.current?.focus();
                                searchRef.current?.select();
                              }
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
                          className="w-12 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={item.quantity}
                          onChange={e => updateQuantity(item.product_id, sanitizeQtyText(e.target.value))}
                          onKeyDown={e => { guardScannerInput(e, item.product_id, item.quantity, v => updateQuantity(item.product_id, v)); handleQtyKeyDown(e, item.product_id); }}
                        />
                        <button onClick={() => { const step = item.billing_type === 'WEIGHT' ? 0.1 : 1; updateQuantity(item.product_id, +((Number(item.quantity) || 0) + step).toFixed(3)); }}
                          className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                        ><Plus className="w-3 h-3" /></button>
                        <span className="text-[10px] text-muted-foreground font-black uppercase pr-1.5">{item.billing_type === 'WEIGHT' ? 'Kg' : 'Pcs'}</span>
                      </div>
                    )}

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
                          onFocus={e => e.target.select()}
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
                          onFocus={e => e.target.select()}
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
                      <input type="number" min="0" step="any" inputMode="decimal"
                        className={`w-20 text-right bg-transparent border-0 font-black text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${hasItemDiscount ? 'text-emerald-500' : 'text-foreground'}`}
                        value={total}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) <= 0 || qty <= 0) {
                            removeItemDiscount(item.product_id);
                          } else {
                            const newTotal = parseFloat(val);
                            const newUnitPrice = newTotal / qty;
                            if (Math.abs(newUnitPrice - rate) < 0.001) {
                              removeItemDiscount(item.product_id);
                            } else {
                              updateItemOfferPrice(item.product_id, newUnitPrice);
                            }
                          }
                          setLocalDiscPcts(p => ({ ...p, [item.product_id]: 0 }));
                          setLocalDiscFlats(p => ({ ...p, [item.product_id]: 0 }));
                          syncActiveSnapshot();
                        }}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => handleDiscFlatKeyDown(e, item.product_id)}
                      />
                      {hasItemDiscount && (
                        <div className="text-[9px] text-muted-foreground/50 line-through font-semibold -mt-0.5 text-right">{formatCurrency(rate * qty)}</div>
                      )}
                    </div>

                    <button onClick={() => removeItem(item.product_id)} className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover:opacity-100" title="Remove Item">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ RIGHT SIDE: Transaction Console & Payment (42%) ═══ */}
        <div className="flex flex-col w-[42%] bg-card dark:bg-card shadow-2xl z-25 border-l border-border">

          {/* ── Scrollable content area ── */}
          <div className="flex-1 overflow-y-auto px-5 py-2">
            {/* Payment / Refund method grid — replaced by Quotation/Return Details in those modes */}
            <div className={clsx(
              'overflow-hidden transition-all duration-400 ease-in-out',
              isQuotationMode || editingQuotationId
                ? 'max-h-0 opacity-0 scale-95 py-0'
                : 'max-h-[280px] opacity-100 scale-100'
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
                    { value: 'ADJUST_BILL' as const, label: 'Adjust Bill', icon: ArrowLeftRight, activeBg: 'bg-rose-500/10', activeText: 'text-rose-600 dark:text-rose-400', activeBorder: 'border-rose-500', activeIconBg: 'bg-rose-500/15' },
                    { value: 'CASH' as const, label: 'Cash', icon: Banknote, activeBg: 'bg-emerald-500/10', activeText: 'text-emerald-600 dark:text-emerald-400', activeBorder: 'border-emerald-500', activeIconBg: 'bg-emerald-500/15' },
                    { value: 'UPI' as const, label: 'UPI', icon: Smartphone, activeBg: 'bg-violet-500/10', activeText: 'text-violet-600 dark:text-violet-400', activeBorder: 'border-violet-500', activeIconBg: 'bg-violet-500/15' },
                    { value: 'CARD' as const, label: 'Card', icon: Wallet, activeBg: 'bg-blue-500/10', activeText: 'text-blue-600 dark:text-blue-400', activeBorder: 'border-blue-500', activeIconBg: 'bg-blue-500/15' },
                    { value: 'BANK_TRANSFER' as const, label: 'Bank Transfer', icon: Building, activeBg: 'bg-sky-500/10', activeText: 'text-sky-600 dark:text-sky-400', activeBorder: 'border-sky-500', activeIconBg: 'bg-sky-500/15' },
                    { value: 'STORE_CREDIT' as const, label: 'Store Credit', icon: Gift, activeBg: 'bg-amber-500/10', activeText: 'text-amber-600 dark:text-amber-400', activeBorder: 'border-amber-500', activeIconBg: 'bg-amber-500/15' },
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
                    <span className="text-xs text-muted-foreground">Original Invoice: <span className="font-bold text-foreground">{selectedReturnInvoice.invoice_number}</span></span>
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">{selectedReturnInvoice.customer_name || 'Walk-in'}</span>
                  </div>
                )}
              </div>
              ) : (
                <div>
                  <div className="grid grid-cols-6 gap-2">
                      {PAYMENT_OPTIONS.map((opt) => {
                        const isActive = paymentMethod === opt.value;
                        const span = 'col-span-2';

                        // ── In SPLIT mode: Morph Cash, Card, UPI, and Credit buttons into interactive input tiles ──
                        if (paymentMethod === 'SPLIT') {
                          if (opt.value === 'CASH') {
                            return (
                              <div key="CASH" className="col-span-2 flex flex-col justify-between p-2 rounded-2xl border-2 border-emerald-500 bg-emerald-500/10 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all shadow-xs h-[72px]">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                                    <Banknote className="w-4 h-4" />
                                    <span>Cash</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rem = Math.max(0, Number((displayGrandTotal - (Number(splitDetails.card) || 0) - (Number(splitDetails.upi) || 0) - (Number(splitDetails.credit) || 0)).toFixed(2)));
                                      updateActiveTab({ splitDetails: { ...splitDetails, cash: rem } });
                                    }}
                                    className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer bg-emerald-500/15 px-1.5 py-0.5 rounded-md"
                                  >
                                    Fill Rest
                                  </button>
                                </div>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-500/80">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.cash || ''}
                                    onChange={(e) => updateActiveTab({ splitDetails: { ...splitDetails, cash: e.target.value === '' ? 0 : Number(e.target.value) } })}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-1 bg-background/90 border border-emerald-500/30 focus:border-emerald-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6.5"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'CARD') {
                            return (
                              <div key="CARD" className="col-span-2 flex flex-col justify-between p-2 rounded-2xl border-2 border-blue-500 bg-blue-500/10 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-xs h-[72px]">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-extrabold text-xs">
                                    <Wallet className="w-4 h-4" />
                                    <span>Card</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rem = Math.max(0, Number((displayGrandTotal - (Number(splitDetails.cash) || 0) - (Number(splitDetails.upi) || 0) - (Number(splitDetails.credit) || 0)).toFixed(2)));
                                      updateActiveTab({ splitDetails: { ...splitDetails, card: rem } });
                                    }}
                                    className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer bg-blue-500/15 px-1.5 py-0.5 rounded-md"
                                  >
                                    Fill Rest
                                  </button>
                                </div>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-blue-500/80">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.card || ''}
                                    onChange={(e) => updateActiveTab({ splitDetails: { ...splitDetails, card: e.target.value === '' ? 0 : Number(e.target.value) } })}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-1 bg-background/90 border border-blue-500/30 focus:border-blue-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6.5"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'UPI') {
                            return (
                              <div key="UPI" className="col-span-2 flex flex-col justify-between p-2 rounded-2xl border-2 border-violet-500 bg-violet-500/10 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all shadow-xs h-[72px]">
                                <div className="flex items-center justify-between">
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
                                      <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300 truncate max-w-[65px]">
                                        ({currentSelectedUpi.name})
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rem = Math.max(0, Number((displayGrandTotal - (Number(splitDetails.cash) || 0) - (Number(splitDetails.card) || 0) - (Number(splitDetails.credit) || 0)).toFixed(2)));
                                      updateActiveTab({ splitDetails: { ...splitDetails, upi: rem } });
                                    }}
                                    className="text-[10px] font-extrabold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer bg-violet-500/15 px-1.5 py-0.5 rounded-md shrink-0"
                                  >
                                    Fill Rest
                                  </button>
                                </div>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-violet-500/80">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.upi || ''}
                                    onChange={(e) => updateActiveTab({ splitDetails: { ...splitDetails, upi: e.target.value === '' ? 0 : Number(e.target.value) } })}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-1 bg-background/90 border border-violet-500/30 focus:border-violet-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6.5"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'CREDIT') {
                            return (
                              <div key="CREDIT" className="col-span-2 flex flex-col justify-between p-2 rounded-2xl border-2 border-amber-500 bg-amber-500/10 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all shadow-xs h-[72px]">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-extrabold text-xs">
                                    <BookOpen className="w-4 h-4" />
                                    <span>Credit</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rem = Math.max(0, Number((displayGrandTotal - (Number(splitDetails.cash) || 0) - (Number(splitDetails.card) || 0) - (Number(splitDetails.upi) || 0)).toFixed(2)));
                                      updateActiveTab({ splitDetails: { ...splitDetails, credit: rem } });
                                    }}
                                    className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer bg-amber-500/15 px-1.5 py-0.5 rounded-md"
                                  >
                                    Fill Rest
                                  </button>
                                </div>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-amber-500/80">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={splitDetails.credit || ''}
                                    onChange={(e) => updateActiveTab({ splitDetails: { ...splitDetails, credit: e.target.value === '' ? 0 : Number(e.target.value) } })}
                                    placeholder="0"
                                    className="w-full pl-5 pr-1.5 py-1 bg-background/90 border border-amber-500/30 focus:border-amber-500 rounded-xl text-xs font-black text-right text-foreground outline-none no-spinners h-6.5"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (opt.value === 'SPLIT') {
                            return (
                              <button
                                key="SPLIT"
                                type="button"
                                onClick={() => updateActiveTab({ paymentMethod: 'CASH' })}
                                className="col-span-2 flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-2xl border-2 border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-sm transition-all duration-200 active:scale-95 cursor-pointer h-[72px]"
                                title="Click again to deactivate Split Mode"
                              >
                                <div className="p-1.5 rounded-xl bg-purple-500/15 transition-colors">
                                  <Split className="w-4.5 h-4.5" />
                                </div>
                                <span className="text-xs font-extrabold">Split</span>
                              </button>
                            );
                          }
                        }

                        // ── Single Mode: Standard button options ──
                        let activeBg = '';
                        let activeText = '';
                        let activeBorder = '';
                        let activeIconBg = '';
                        if (opt.value === 'PENDING'){ activeBg = 'bg-gray-500/10';    activeText = 'text-gray-600 dark:text-gray-400';    activeBorder = 'border-gray-500';    activeIconBg = 'bg-gray-500/15'; }
                        if (opt.value === 'CASH')   { activeBg = 'bg-emerald-500/10'; activeText = 'text-emerald-600 dark:text-emerald-400'; activeBorder = 'border-emerald-500'; activeIconBg = 'bg-emerald-500/15'; }
                        if (opt.value === 'CARD')   { activeBg = 'bg-blue-500/10';    activeText = 'text-blue-600 dark:text-blue-400';    activeBorder = 'border-blue-500';    activeIconBg = 'bg-blue-500/15'; }
                        if (opt.value === 'UPI')    { activeBg = 'bg-violet-500/10';  activeText = 'text-violet-600 dark:text-violet-400';  activeBorder = 'border-violet-500';  activeIconBg = 'bg-violet-500/15'; }
                        if (opt.value === 'CREDIT') { activeBg = 'bg-amber-500/10';   activeText = 'text-amber-600 dark:text-amber-400';   activeBorder = 'border-amber-500';   activeIconBg = 'bg-amber-500/15'; }
                        if (opt.value === 'SPLIT')  { activeBg = 'bg-purple-500/10';  activeText = 'text-purple-600 dark:text-purple-400';  activeBorder = 'border-purple-500';  activeIconBg = 'bg-purple-500/15'; }

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              if (opt.value === 'UPI') {
                                updateActiveTab({ paymentMethod: 'UPI' });
                                if (upiPageConfig.billing && upiSources.length > 0) {
                                  setIsUpiSelectModalOpen(true);
                                }
                              } else if (opt.value === 'SPLIT') {
                                if (paymentMethod === 'SPLIT') {
                                  updateActiveTab({ paymentMethod: 'CASH' });
                                } else {
                                  if (splitTotal === 0 && displayGrandTotal > 0) {
                                    updateActiveTab({ paymentMethod: 'SPLIT', splitDetails: { cash: displayGrandTotal, card: 0, upi: 0, bank_transfer: 0 } });
                                  } else {
                                    updateActiveTab({ paymentMethod: 'SPLIT' });
                                  }
                                }
                              } else {
                                updateActiveTab({ paymentMethod: opt.value });
                              }
                            }}
                            className={clsx(
                              'flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer h-[72px]',
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
              <div className="space-y-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl mt-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {editingQuotationId ? `Editing Quotation ${editingQuotationNumber}` : 'New Quotation'}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Terms & Conditions</label>
                  <textarea
                    value={quotationTerms}
                    onChange={e => setQuotationTerms(e.target.value)}
className="w-full bg-background border border-border rounded-lg p-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* ── STICKY FOOTER: Totals + Actions ── */}
          <div className="shrink-0 border-t border-border bg-background">

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

              {(!isScrapMode ? subtotal > 0 : scrapTotal > 0) && (
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
                {/* Inline discount/extra input */}
                <div className={clsx("flex items-center border rounded-xl p-0.5 shadow-sm", isScrapMode ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/50 border-border")}>
                  <div className="flex bg-card rounded-lg mr-1 border border-border/30">
                    <button
                      onClick={() => setDiscount(discountValue || 0, 'FIXED')}
                      className={clsx(
                        'px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer',
                        discountType === 'FIXED' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >₹</button>
                    <button
                      onClick={() => setDiscount(discountValue || 0, 'PERCENTAGE')}
                      className={clsx(
                        'px-2 py-1 text-xs font-black rounded-lg transition-all cursor-pointer',
                        discountType === 'PERCENTAGE' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >%</button>
                  </div>
                  <input
                    ref={discountRef}
                    type="number"
                    min="0"
                    max={discountType === 'PERCENTAGE' ? '100' : undefined}
                    value={discountValue > 0 ? discountValue : ''}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '' || raw === null) {
                        setDiscount(0, discountType);
                      } else {
                        const parsed = Number(raw);
                        if (!isNaN(parsed) && parsed >= 0) {
                          setDiscount(parsed, discountType);
                        }
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Delete' || e.key === 'Backspace') {
                        const input = e.target as HTMLInputElement;
                        // If selection covers all, clear on next tick
                        if (input.selectionStart === 0 && input.selectionEnd === input.value.length) {
                          setDiscount(0, discountType);
                        }
                      }
                    }}
                    placeholder="0"
                    inputMode="decimal"
                    className="w-24 h-9 bg-transparent border-0 text-base text-right pr-3 font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              </div>



            {/* ── Adjustment Block (Normal Mode Only): combined scrap + return deduction ── */}
            <div className={clsx(
              'transition-all duration-400 ease-in-out',
              !isScrapMode && !isQuotationMode && !isReturnMode && (storeScrapDeduction > 0 || storeReturnDeduction > 0 || enableScrap)
                ? 'max-h-[350px] opacity-100 scale-100'
                : 'max-h-0 opacity-0 scale-95'
            )}>
              <div className={clsx(
                "px-0 py-0 mt-1 border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm",
                storeScrapDeduction > 0 && storeReturnDeduction > 0
                  ? "border-primary/20 bg-muted/5"
                  : storeScrapDeduction > 0
                    ? "border-orange-500/25 bg-orange-500/[0.01]"
                    : storeReturnDeduction > 0
                      ? "border-rose-500/25 bg-rose-500/[0.01]"
                      : "border-orange-500/20 bg-orange-500/[0.01]"
              )}>
                {(storeScrapDeduction > 0 || storeReturnDeduction > 0) ? (
                  <div className="p-2 space-y-1.5 bg-muted/40 border-b border-border/50">
                    <div className="flex items-center justify-between px-1 mb-0.5">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Applied Credits</p>
                      {(storeScrapDeduction > 0 && storeReturnDeduction > 0) && (
                        <span className="text-[9px] font-bold text-foreground bg-primary/10 px-2 py-0.5 rounded-full">
                          Total Adj: -{formatCurrency((storeScrapDeduction || 0) + (storeReturnDeduction || 0))}
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1.5 items-center">
                      {/* Column 1: Scrap Card OR Scrap Input (if Return is applied but Scrap is not) */}
                      {storeScrapDeduction > 0 ? (
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
                              onClick={() => clearScrapDeduction()}
                              title="Remove Scrap Credit"
                              className="p-0.5 text-orange-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            ref={scrapDeductionInputRef}
                            type="text"
                            placeholder="Type scrap # & Enter..."
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
                        </div>
                      )}

                      {/* Column 2: Return Card OR Return Input (if Scrap is applied but Return is not) */}
                      {storeReturnDeduction > 0 ? (
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
                              onClick={() => {
                                clearReturnDeduction();
                              }}
                              title="Remove Return Credit"
                              className="p-0.5 text-rose-600/50 hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            ref={returnDeductionInputRef}
                            type="text"
                            placeholder="Type return # & Enter..."
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
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Neither is applied: show standard selector tabs and full-width input */
                  <div>
                    <div className="flex bg-muted/20 p-0.5 border-b border-border/40 gap-1">
                      <button
                        onClick={() => setReturnDeductionSearchMode(false)}
                        className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                          !returnDeductionSearchMode
                            ? 'bg-orange-500/10 text-orange-600 shadow-sm'
                            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >
                        <span>Scrap Deduction</span>
                        <span className="inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F9</span>
                      </button>
                      <button
                        onClick={() => setReturnDeductionSearchMode(true)}
                        className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg flex items-center justify-center gap-1.5',
                          returnDeductionSearchMode
                            ? 'bg-rose-500/10 text-rose-600 shadow-sm'
                            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >
                        <span>Return Deduction</span>
                        <span className="inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F10</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <div className="flex-1 relative">
                        {!returnDeductionSearchMode ? (
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
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

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

            {/* Grand Total + Received + Change */}
            <div className="mx-3 my-1.5 flex items-center gap-1.5 px-3 py-3 bg-primary/10 border-2 border-primary/25 rounded-2xl">
              {/* Total amount */}
              <div className="shrink-0">
                <p className="text-[9px] font-black text-primary uppercase tracking-wider">
                  {isReturnMode ? 'Return Total' : isScrapMode ? 'Scrap Total' : (storeScrapDeduction > 0 || storeReturnDeduction > 0) ? 'After Adj.' : 'Total'}
                </p>
                {isLoadingEditBill ? (
                  <Skeleton className="h-6 w-28 my-1 rounded-md" />
                ) : (
                  <p className="text-xl font-black text-foreground leading-none">{formatCurrency(displayGrandTotal)}</p>
                )}
                {refundAmount > 0 && !isLoadingEditBill && (
                  <p className="text-[10px] font-black text-orange-600 mt-1">
                    Refund Amount: {formatCurrency(refundAmount)}
                  </p>
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
                    placeholder={grandTotal.toFixed(2)}
                    inputMode="decimal"
                    className="w-full pl-5 pr-2 py-1.5 bg-background/80 border border-border focus:border-primary focus:ring-1 focus:ring-primary/15 rounded-lg text-sm font-black text-right text-foreground placeholder:text-muted-foreground/35 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              {/* Change input — hidden in scrap/return/quotation/PENDING/CARD/UPI mode */}
              <div className={clsx('flex-1 min-w-0 max-w-[120px] transition-all duration-300', isScrapMode || isReturnMode || isQuotationMode || editingQuotationId || paymentMethod === 'PENDING' || paymentMethod === 'CARD' || paymentMethod === 'UPI' ? 'opacity-0 pointer-events-none' : 'opacity-100')}>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-0.5">
                  {paymentMethod === 'CREDIT' ? 'Balance' : 'Change'}
                </p>
                <div className="relative">
                  <span className={clsx(
                    'absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black',
                    balanceAmount >= 0 ? 'text-emerald-500' : 'text-destructive'
                  )}>₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={Math.abs(balanceAmount)}
                    readOnly
                    inputMode="decimal"
                    className={clsx(
                      'w-full pl-5 pr-2 py-1.5 border rounded-lg text-sm font-black text-right transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                      balanceAmount >= 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    )}
                  />
                </div>
              </div>
            </div>



            {/* Action buttons */}
            <div className="flex gap-2.5 px-4 py-3">
              {isQuotationActive ? (
                /* ── Quotation Mode (Create or Edit) ── */
                <>
                  <button
                    onClick={() => handleSaveQuotation(false)}
                    disabled={quotationSaving || items.length === 0}
                    className="w-[25%] py-3 rounded-xl border-2 border-blue-400/60 text-blue-600 dark:text-blue-400 font-black text-sm flex items-center justify-center gap-1.5 hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleSaveQuotation(true)}
                    disabled={quotationSaving || items.length === 0}
                    className="flex-1 py-3 flex items-center justify-center gap-2 rounded-xl bg-blue-500 text-white font-black text-sm shadow-md hover:bg-blue-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {quotationSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>SAVING...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4.5 h-4.5" />
                        <span>{editingQuotationId ? 'UPDATE & PRINT (F12)' : 'SAVE & PRINT (F12)'}</span>
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
                    className="w-[20%] py-3 rounded-xl border-2 border-rose-400/60 text-rose-600 dark:text-rose-400 font-black text-sm flex items-center justify-center gap-1.5 hover:bg-rose-500/10 hover:border-rose-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleProcessReturnFromCart()}
                    disabled={returnProcessing || items.length === 0}
                    className="flex-1 py-3 flex items-center justify-center gap-2 rounded-xl bg-rose-500 text-white font-black text-sm shadow-md hover:bg-rose-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {returnProcessed ? (
                      <><CheckCircle2 className="w-4.5 h-4.5" /><span>RETURN PROCESSED!</span></>
                    ) : returnProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>PROCESSING...</span>
                      </>
                    ) : (
                      <>
                        <ArrowLeftRight className="w-4.5 h-4.5" />
                        <span>PROCESS &amp; PRINT (F12)</span>
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
                    className="w-[20%] py-3 rounded-xl border-2 border-orange-400/60 text-orange-600 dark:text-orange-400 font-black text-sm flex items-center justify-center gap-1.5 hover:bg-orange-500/10 hover:border-orange-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleCheckout()}
                    disabled={isCheckingOut || items.length === 0}
                    className="flex-1 py-3 flex items-center justify-center gap-2 rounded-xl bg-orange-500 text-white font-black text-sm shadow-md hover:bg-orange-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {isCheckingOut ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>SAVING...</span>
                      </>
                    ) : (
                      <>
                        <Recycle className="w-4.5 h-4.5" />
                        <span>SAVE &amp; PRINT (F12)</span>
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
                    className="relative w-[22%] py-3 rounded-xl border-2 border-border text-muted-foreground font-black text-sm hover:bg-muted hover:text-foreground hover:border-muted-foreground/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center justify-center gap-1"
                    title="Hold Bill (F3)"
                  >
                    <span>Hold</span>
                    <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-4.5 px-1.5 text-[9px] font-black rounded-full leading-none shadow-sm border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F3</span>
                  </button>
                  <button
                    onClick={() => handleCheckout(true)}
                    disabled={isCheckingOut || items.length === 0}
                    className="w-[20%] py-3 rounded-xl border-2 border-amber-400/60 text-amber-600 dark:text-amber-400 font-black text-sm flex items-center justify-center gap-1.5 hover:bg-amber-500/10 hover:border-amber-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleCheckout()}
                    disabled={isCheckingOut || items.length === 0}
                    className="flex-1 py-3 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-md hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {isCheckingOut ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        <span>FINALIZING...</span>
                      </>
                    ) : editingActive ? (
                      <>
                        <CreditCard className="w-4.5 h-4.5" />
                        <span>UPDATE &amp; PRINT (F12)</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4.5 h-4.5" />
                        <span>PRINT &amp; CHECKOUT (F12)</span>
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
                const createdTime = bill.created_at ? new Date(bill.created_at).toLocaleString() : (bill.heldAt ? new Date(bill.heldAt).toLocaleString() : '');
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
                      <div className="col-span-2 text-center text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('en-IN')}</div>
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
                    <span className="text-amber-500 font-semibold">Pending</span> · {Number(inv.total_qty || 0).toFixed(1)} qty · {new Date(inv.created_at).toLocaleDateString('en-IN')}
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
                  <span className="text-xs font-black text-primary uppercase tracking-wider">New Product</span>
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
                          <button type="button" onClick={async () => {
                            if (!window.electronAPI || !tenantId) return;
                            const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
                            if (gen.success && gen.barcode) setNewProductBarcode(gen.barcode);
                          }}
                            className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full cursor-pointer">
                            <RefreshCw className="w-2.5 h-2.5 inline-block" /> Auto
                          </button>
                        </div>
                        <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-widest text-sm" />
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
                            <button type="button" onClick={async () => {
                              if (!window.electronAPI || !tenantId) return;
                              const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
                              if (gen.success && gen.barcode) setNewProductBarcode(gen.barcode);
                            }}
                              className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full transition-all cursor-pointer">
                              <RefreshCw className="w-3 h-3" /> Auto Generate
                            </button>
                          </div>
                          <input type="text" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none font-mono tracking-widest shadow-sm text-sm" />
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
                          onChange={v => setNewProductGradeId(v)}
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
                        <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
                        <div className="relative">
                          {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{prefix}</span>}
                          <input
                            type="number" step="0.01"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            value={field === 'purchasePrice' ? newProductPurchasePrice : field === 'basePrice' ? newProductBasePrice : field === 'stock' ? newProductStock : newProductReorderLevel}
                            onChange={e => {
                              const val = e.target.value;
                              if (field === 'purchasePrice') setNewProductPurchasePrice(val);
                              else if (field === 'basePrice') setNewProductBasePrice(val);
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
                    <div className={clsx('flex-1 min-w-0 overflow-hidden transition-all duration-500 ease-in-out', (['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'].includes((newProductUom || '').toLowerCase())) ? 'max-w-[250px] opacity-100' : 'max-w-0 opacity-0')}>
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
                          {newProductIsGstApplicable && (
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
                  Add to Inventory
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
                {upiSources.map((s: any) => {
                  const isSelected = currentSelectedUpi
                    ? (s.source_id === currentSelectedUpi.source_id || (s.upi_id && s.upi_id === currentSelectedUpi.upi_id))
                    : (s.is_default === 1 || upiSources[0]?.source_id === s.source_id);
                  return (
                    <button
                      key={s.source_id}
                      type="button"
                      onClick={() => {
                        updateActiveTab({
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
                      }}
                      className={clsx(
                        'w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.98]',
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
    </div>
  );
}


