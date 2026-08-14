import { useState, useRef, useEffect, useCallback } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  Search, X, Package, Trash, Recycle, RotateCcw, Minus, Plus, CreditCard,
  Store, LogOut, Settings, Phone, User, Scale,
  Wallet, Banknote, Smartphone, BookOpen, AlertCircle,
  CheckCircle2, Building, TrendingUp, FileText, Clock, Receipt, MapPin, Star, Gift, Save, RefreshCw, ArrowLeftRight, LayoutGrid, List, Loader2, Check, Tag, Layers
} from 'lucide-react';
import { useCartStore, useCartTotals } from '../store/cartStore';
import { useScaleStore } from '../store/scaleStore';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { useTabStore } from '../store/tabStore';
import { BillingTabBar } from './BillingTabBar';
import { CashierSettlement } from './CashierSettlement';

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

type PaymentMethod = 'PENDING' | 'CASH' | 'CARD' | 'UPI' | 'CREDIT';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Wallet; color: string }[] = [
  { value: 'PENDING', label: 'Pending', icon: Clock, color: 'text-gray-500' },
  { value: 'CARD', label: 'Card', icon: Wallet, color: 'text-blue-500' },
  { value: 'CREDIT', label: 'Credit', icon: BookOpen, color: 'text-amber-500' },
  { value: 'UPI', label: 'UPI', icon: Smartphone, color: 'text-violet-500' },
  { value: 'CASH', label: 'Cash', icon: Banknote, color: 'text-emerald-500' },
];

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toFixed(2)}`;
}

export function BillingPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const kRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discFlatRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const {
    items, invoiceType, setInvoiceType, clearCart, setDiscount,
    currentUserRole, setRole, discountType, discountValue,
    addItem, updateQuantity, removeItem, updateItemDiscount, removeItemDiscount, updateItemOfferPrice, updatePiecesOverride,
    customerState, setCustomerState,
    scrapDeduction: storeScrapDeduction, scrapInvoiceNumber: storeScrapInvoiceNumber,
    setScrapDeduction, clearScrapDeduction,
    returnDeduction: storeReturnDeduction, returnInvoiceNumber: storeReturnInvoiceNumber,
    setReturnDeduction, clearReturnDeduction,
    editingInvoiceId: editingActive, editingInvoiceNumber,
  } = useCartStore();
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

  // Pricing tier state
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [productPricingMap, setProductPricingMap] = useState<Record<string, Record<string, number>>>({});
  const [selectedTierId, setSelectedTierId] = useState('');
  const [allowBillerOverride, setAllowBillerOverride] = useState(true);
  const [partiesForTier, setPartiesForTier] = useState<any[]>([]);
  const canOverrideTier = authRole === 'OWNER' || allowBillerOverride;

  // Sync local discount state when items are added/removed (but NOT overwrite on every store change)
  useEffect(() => {
    setLocalDiscPcts(prev => {
      const ids = new Set(items.map(i => i.product_id));
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        if (!(item.product_id in prev)) {
          next[item.product_id] = item.discount_percent ?? 0;
          changed = true;
        }
      });
      Object.keys(next).forEach(id => {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setLocalDiscFlats(prev => {
      const ids = new Set(items.map(i => i.product_id));
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        if (!(item.product_id in prev)) {
          next[item.product_id] = item.discount_flat ?? 0;
          changed = true;
        }
      });
      Object.keys(next).forEach(id => {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      });
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
  const [newProductName, setNewProductName] = useState('');
  const [newProductItemCode, setNewProductItemCode] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductUom, setNewProductUom] = useState('Pcs');
  const [newProductPurchasePrice, setNewProductPurchasePrice] = useState('');
  const [newProductBasePrice, setNewProductBasePrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState('');
  const [newProductHsn, setNewProductHsn] = useState('');
  const [newProductTaxRate, setNewProductTaxRate] = useState(0);
  const [newProductDiscountPercent, setNewProductDiscountPercent] = useState('');
  const [newProductDiscountFlat, setNewProductDiscountFlat] = useState('');
  const [newProductOfferPrice, setNewProductOfferPrice] = useState('');
  const [newProductIsGstApplicable, setNewProductIsGstApplicable] = useState(true);
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
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<'saved' | 'printed' | false>(false);

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

  // Scrap mode (moved before displayGrandTotal which depends on it)
  const [isScrapMode, setIsScrapMode] = useState(false);
  const [enableScrap, setEnableScrap] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);
  const prevScrapMode = useRef(isScrapMode);
  const prevReturnMode = useRef(isReturnMode);
  // Clean up incompatible items when scrap mode changes
  useEffect(() => {
    if (prevScrapMode.current && !isScrapMode) {
      items.filter(i => i.isScrap).forEach(i => removeItem(i.product_id));
    } else if (!prevScrapMode.current && isScrapMode) {
      items.filter(i => !i.isScrap).forEach(i => removeItem(i.product_id));
      clearScrapDeduction();
    }
    prevScrapMode.current = isScrapMode;
  }, [isScrapMode]);

  // Clean up return items when return mode toggles
  useEffect(() => {
    if (prevReturnMode.current && !isReturnMode) {
      items.filter(i => i.isReturnItem).forEach(i => removeItem(i.product_id));
      setSelectedReturnInvoice(null);
    } else if (!prevReturnMode.current && isReturnMode) {
      items.filter(i => !i.isReturnItem).forEach(i => removeItem(i.product_id));
      clearReturnDeduction();
    }
    prevReturnMode.current = isReturnMode;
  }, [isReturnMode]);

  useEffect(() => {
    if (!enableScrap && isScrapMode) {
      setIsScrapMode(false);
    }
  }, [enableScrap, isScrapMode]);

  // Reset reserved invoice numbers when mode changes (but preserve when editing existing)
  const prevReserveMode = useRef<'normal' | 'scrap' | 'return' | 'quotation' | null>(null);
  useEffect(() => {
    const currentMode = isScrapMode ? 'scrap' : isReturnMode ? 'return' : isQuotationMode ? 'quotation' : 'normal';
    if (prevReserveMode.current !== currentMode && !editingInvoiceNumber) {
      prevReserveMode.current = currentMode;
      updateActiveTab({ reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '', reservedReturnNumber: '' });
    }
  }, [isScrapMode, isReturnMode, isQuotationMode]);

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

  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const addTab = useTabStore(s => s.addTab);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);
  const syncActiveSnapshot = useTabStore(s => s.syncActiveSnapshot);
  const getActiveTab = useTabStore(s => s.getActiveTab);

  const tabCounter = useRef(0);
  const initialized = useRef(false);

  const handleAddTab = async () => {
    let billNumber = '';
    let scrapNumber = '';
    let quotationNumber = '';
    let returnNumber = '';
    if (window.electronAPI) {
      const series = enableThreeInvoiceSeries ? 'normal' : undefined;
      try { const r = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series }); if (r?.success && r.invoiceNumber) billNumber = r.invoiceNumber; } catch { }
      try { const r = await window.electronAPI.dbPeekNextScrapInvoiceNumber({ tenant_id: 'global' }); if (r?.success && r.invoiceNumber) scrapNumber = r.invoiceNumber; } catch { }
      try { const r = await window.electronAPI.dbPeekNextQuotationNumber({ tenant_id: 'global' }); if (r?.success && r.quotationNumber) quotationNumber = r.quotationNumber; } catch { }
      try { const r = await window.electronAPI.dbPeekNextReturnNumber({ tenant_id: tenantId || 'global' }); if (r?.success && r.returnNumber) returnNumber = r.returnNumber; } catch { }
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
  const receivedAmount = activeTab?.receivedAmount ?? 0;
  const customerName = activeTab?.customerName ?? '';
  const customerPhone = activeTab?.customerPhone ?? '';
  const customerGstin = activeTab?.customerGstin ?? '';
  const customerAddress = activeTab?.customerAddress ?? '';

  const scrapPaymentStatus = activeTab?.scrapPaymentStatus ?? 'PENDING';

  const nextInvoiceNumber = activeTab?.reservedInvoiceNumber ?? '';
  const nextScrapInvoiceNumber = activeTab?.reservedScrapInvoiceNumber ?? '';
  const nextQuotationNumber = activeTab?.reservedQuotationNumber ?? '';
  const nextReturnNumber = activeTab?.reservedReturnNumber ?? '';

  const reserveInvoiceNumberForTab = useCallback(async () => {
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (isScrapMode || isQuotationMode || isReturnMode) return;
    if (tab.reservedInvoiceNumber) {
      updateActiveTab({ title: tab.reservedInvoiceNumber });
      return;
    }
    try {
      const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (customerGstin?.trim() ? 'gst_b2b' : 'gst_b2c') : 'normal') : undefined;
      const result = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
      if (result.success && result.invoiceNumber) {
        updateActiveTab({ reservedInvoiceNumber: result.invoiceNumber, title: result.invoiceNumber });
      }
    } catch (e) {
      console.error('Failed to peek invoice number', e);
    }
  }, [tenantId, getActiveTab, updateActiveTab, enableThreeInvoiceSeries, invoiceType, customerGstin, isScrapMode, isQuotationMode, isReturnMode]);

  const handleInvoiceTypeChange = async (type: 'GST' | 'BILL_OF_SUPPLY') => {
    setInvoiceType(type);
    setTimeout(() => {
      syncActiveSnapshot();
    }, 0);

    try {
      const series = enableThreeInvoiceSeries ? (type === 'GST' ? (customerGstin?.trim() ? 'gst_b2b' : 'gst_b2c') : 'normal') : undefined;
      const result = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
      if (result.success && result.invoiceNumber) {
        updateActiveTab({ 
          reservedInvoiceNumber: result.invoiceNumber,
          title: result.invoiceNumber
        });
      }
    } catch (e) {
      console.error('Failed to peek next invoice number on type change', e);
    }
  };

  const reserveScrapInvoiceNumberForTab = useCallback(async () => {
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.reservedScrapInvoiceNumber) {
      updateActiveTab({ title: tab.reservedScrapInvoiceNumber });
      return;
    }
    try {
      const result = await window.electronAPI.dbPeekNextScrapInvoiceNumber({ tenant_id: 'global' });
      if (result.success && result.invoiceNumber) {
        updateActiveTab({ reservedScrapInvoiceNumber: result.invoiceNumber, title: result.invoiceNumber });
      }
    } catch (e) {
      console.error('Failed to reserve scrap invoice number', e);
    }
  }, [getActiveTab, updateActiveTab]);

  const reserveQuotationNumberForTab = useCallback(async () => {
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.reservedQuotationNumber) {
      updateActiveTab({ title: tab.reservedQuotationNumber });
      return;
    }
    try {
      const result = await window.electronAPI.dbPeekNextQuotationNumber({ tenant_id: 'global' });
      if (result.success && result.quotationNumber) {
        updateActiveTab({ reservedQuotationNumber: result.quotationNumber, title: result.quotationNumber });
      }
    } catch (e) {
      console.error('Failed to reserve quotation number', e);
    }
  }, [getActiveTab, updateActiveTab]);

  const reserveReturnNumberForTab = useCallback(async () => {
    if (!window.electronAPI) return;
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.reservedReturnNumber) {
      updateActiveTab({ title: tab.reservedReturnNumber });
      return;
    }
    try {
      const result = await window.electronAPI.dbPeekNextReturnNumber({ tenant_id: tenantId || 'global' });
      if (result.success && result.returnNumber) {
        updateActiveTab({ reservedReturnNumber: result.returnNumber, title: result.returnNumber });
      }
    } catch (e) {
      console.error('Failed to reserve return number', e);
    }
  }, [getActiveTab, updateActiveTab, tenantId]);

  const totalDeductions = (storeScrapDeduction || 0) + (storeReturnDeduction || 0);
  const refundAmount = !isScrapMode && totalDeductions > grandTotal
    ? totalDeductions - grandTotal
    : 0;

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
    window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_scrap' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
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
        if (Array.isArray(res)) setPricingTiers(res.filter((t: any) => t.is_active === 1 && !t.is_deleted));
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
  const [quotationAddress, setQuotationAddress] = useState('');
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

    // Enable Scrap mode and clear cart
    setIsScrapMode(true);
    clearCart();
    clearScrapDeduction();
    useCartStore.getState().setEditingInvoice(invNum, invNum, 'OWNER');
    setDiscount(0, 'FIXED');

    const firstTx = detail.transactions[0];
    const savedPaymentStatus = firstTx.payment_status === 'CASH' ? 'CASH' : 'PENDING';

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
    if (isScrapMode || isReturnMode || isPastBillMode || searchQuery.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      if (!window.electronAPI) return;
      const { tenantId } = useAuthStore.getState();
      // GST invoices: only show GST-applicable products (quotations stay unfiltered)
      const isGstFilter = !isQuotationMode && invoiceType === 'GST';
      // Numeric searches fetch more results so client-side prefix filtering doesn't miss valid barcode matches
      const fetchLimit = /^\d+$/.test(searchQuery) ? 50 : 8;
      const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, search: searchQuery, limit: fetchLimit, ...(isGstFilter ? { isGst: 1 } : {}) });
      if (Array.isArray(products)) {
        // Client-side filter: for numeric searches, only show prefix matches on barcode/item_code
        // (backend fix in main.ts requires Electron restart, this works immediately)
        const filtered = /^\d+$/.test(searchQuery)
          ? products.filter(p => {
              const barcode = String(p.sku_barcode || '');
              const code = String(p.item_code || '');
              return barcode.startsWith(searchQuery) || code.startsWith(searchQuery);
            })
          : products;
        // Collapse duplicate service charge items to a single row
        const deduped: any[] = [];
        let serviceFound = false;
        for (const p of filtered) {
          if (Number(p.is_service_item) === 1) {
            if (serviceFound) continue;
            serviceFound = true;
          }
          deduped.push(p);
        }
        setResults(deduped);
        setSelectedIndex(0);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [searchQuery, isScrapMode, invoiceType, isQuotationMode]);

  // Fetch categories when product create form opens
  useEffect(() => {
    if (window.electronAPI && tenantId && showProductCreateForm) {
      window.electronAPI.dbGetProducts({ tenant_id: tenantId, limit: 200 })
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
    }
  }, [showProductCreateForm, tenantId]);

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
      const list = await window.electronAPI.dbGetPendingReturnInvoices({ tenant_id: tid, search: returnDeductionSearchQuery });
      if (Array.isArray(list)) {
        const q = returnDeductionSearchQuery.toUpperCase();
        const getNumPart = getNumericPart;
        const filtered = list.filter((r: any) => {
          const retNum = String(r.return_number).toUpperCase();
          const numPart = getNumPart(retNum);
          return retNum.includes(q) || (q.length >= 1 && getNumPart(q).length > 0 && numPart.includes(getNumPart(q)));
        });
        setReturnDeductionResults(filtered.slice(0, 8));
        if (filtered.length > 0 && returnDeductionInputRef.current) {
          const rect = returnDeductionInputRef.current.getBoundingClientRect();
          setReturnDeductionDropdownStyle({
            position: 'fixed',
            bottom: `${window.innerHeight - rect.top + 4}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
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
          const lastProduct = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, limit: 1, sortBy: 'created_at' });
          if (Array.isArray(lastProduct) && lastProduct.length > 0 && lastProduct[0].sku_barcode) {
            const lastBarcode = lastProduct[0].sku_barcode;
            const match = lastBarcode.match(/(\d+)[^\d]*$/);
            if (match) {
              const nextNum = (BigInt(match[1]) + 1n).toString();
              setNewProductBarcode(nextNum.padStart(match[1].length, '0'));
            }
          }
        } catch (err) {
          console.error("Failed to fetch last barcode", err);
        }
      })();
    }
  }, [showProductCreateForm]);



  // Listen for Edit Bill from Sales History — loads items directly into cart
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('editBillData');
      if (!raw) return;
      localStorage.removeItem('editBillData');

      try {
        const { invoice, items: invoiceItems, originalRole } = JSON.parse(raw);
        if (!invoiceItems?.length) return;

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
        for (const item of invoiceItems) {
          const p = productMap[item.product_id];
          if (p) {
            item.sku_barcode = p.sku_barcode || null;
            item.brand_manufacturer = p.brand_manufacturer || null;
            item.tax_rate_percent = p.gst_percent || 0;
            item.billing_type = p.billing_type || 'PIECES';
            item.pricing_mode = p.pricing_mode || 'FIXED';
            item.purchase_price = p.purchase_price || 0;
            item.grade_id = p.grade_id || null;
            item.grade_rate = p.grade_rate || null;
            item.uom = p.uom || 'PCS';
            item.hsn = p.hsn || '';

            // Recover MRP, offer, and discount from product data + sold price
            const mrp = Number(p.base_price) || 0;
            const soldPrice = Number(item.unit_price) || 0;
            item.base_price = Math.max(mrp, soldPrice);

            if (item.pricing_mode === 'GRADE_RATE' && item.grade_rate) {
              const rawRate = Number(item.grade_rate) || 0;
              if (soldPrice < rawRate) {
                const currentOffer = p.offer_price ? Number(p.offer_price) : null;
                if (currentOffer !== null && Math.abs(currentOffer - soldPrice) < 0.01) {
                  item.offer_price = currentOffer;
                } else {
                  item.discount_flat = Number((rawRate - soldPrice).toFixed(2));
                }
              }
            } else {
              if (soldPrice < mrp) {
                const currentOffer = p.offer_price ? Number(p.offer_price) : null;
                if (currentOffer !== null && Math.abs(currentOffer - soldPrice) < 0.01) {
                  item.offer_price = currentOffer;
                } else {
                  item.discount_flat = Number((mrp - soldPrice).toFixed(2));
                }
              } else if (soldPrice > mrp) {
                item.offer_price = soldPrice;
              }
            }
          } else {
            item.base_price = Number(item.unit_price) || 0;
          }
        }

        // Clear current cart and load items
        clearCart();

        // Set invoice type
        if (invoice.invoice_type === 'GST' || invoice.invoice_type === 'BILL_OF_SUPPLY') {
          setInvoiceType(invoice.invoice_type);
        }

        // Set discount
        if (Number(invoice.discount_value) > 0) {
          setDiscount(Number(invoice.discount_value), invoice.discount_type || 'FIXED');
        }

        // Restore scrap / return credits applied on the original bill
        if (Number(invoice.scrap_deduction) > 0 && invoice.scrap_invoice_number) {
          setScrapDeduction(Number(invoice.scrap_deduction), invoice.scrap_invoice_number);
        }
        if (Number(invoice.return_deduction) > 0 && invoice.return_invoice_number) {
          setReturnDeduction(Number(invoice.return_deduction), invoice.return_invoice_number);
        }

        // Add each item to cart
        invoiceItems.forEach((item: any) => {
          const productId = item.product_id || item.item_id || `edit-${Date.now()}-${Math.random()}`;
          addItem({
            item_id: item.item_id,
            product_id: productId,
            name: item.name || 'Product',
            base_price: Number(item.base_price) || 0,
            purchase_price: Number(item.purchase_price) || 0,
            tax_rate_percent: Number(item.tax_rate_percent) || 0,
      billing_type: item.billing_type,
      pricing_mode: item.pricing_mode,
      grade_id: item.grade_id,
      grade_rate: item.grade_rate,
      discount_percent: item.discount_percent ?? null,
            discount_flat: item.discount_flat ?? null,
            offer_price: item.offer_price ?? null,
            sku_barcode: item.sku_barcode || null,
            brand_manufacturer: item.brand_manufacturer || null,
          });
          // Set the quantity
          const qty = item.billing_type === 'WEIGHT'
            ? Number(item.calculated_weight || item.quantity) || 1
            : Number(item.quantity) || 1;
          if (qty > 0) {
            updateQuantity(productId, qty);
          }
        });

        // Restore customer state for correct tax type (CGST/SGST vs IGST)
        setCustomerState(invoice.customer_state || 'KL');

        // Set customer info
        updateActiveTab({
          customerName: invoice.customer_name || '',
          customerPhone: invoice.customer_phone || '',
          customerGstin: invoice.customer_gstin || '',
          customerAddress: invoice.customer_address || '',
          paymentMethod: invoice.payment_method || 'PENDING',
          receivedAmount: Number(invoice.received_amount) || 0,
        });

        // Mark as editing existing invoice (so checkout updates instead of creating new)
        useCartStore.getState().setEditingInvoice(invoice.invoice_id, invoice.invoice_number, originalRole || authRole);
        // Show the editing invoice number in the tab header
        updateActiveTab({ title: invoice.invoice_number });

        // Sync tab snapshot so items persist across tab switches
        syncActiveSnapshot();
      } catch (e) {
        console.error('Failed to load edit bill data', e);
      }
    };

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
    window.addEventListener('open-return-mode', handler);
    return () => window.removeEventListener('open-return-mode', handler);
  }, []);

  const getTierPriceForProduct = (product: any): number | undefined => {
    if (!selectedTierId || !product) return undefined;
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
    if (match?.pricing_tier_id) setSelectedTierId(match.pricing_tier_id);
  };

  const handleSelectProduct = (product: any) => {
    let piecesPerKg;
    if (product.billing_type === 'WEIGHT' && product.domain_attributes) {
      try {
        const da = typeof product.domain_attributes === 'string'
          ? JSON.parse(product.domain_attributes)
          : product.domain_attributes;
        const storedPpk = Number(da.pcs_per_kg) || 0;
        const totalPcs = Number(da.pcs) || 0;
        const stockKg = Number(product.current_stock) || 0;
        // Prefer stored ratio; fall back to computing from original pcs/stock
        piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 && stockKg > 0 ? totalPcs / stockKg : undefined);
      } catch {}
    }
    const tierPrice = getTierPriceForProduct(product);
    addItem({
      product_id: product.product_id,
      name: product.name,
      base_price: tierPrice ?? product.base_price,
      purchase_price: product.pricing_mode === 'GRADE_RATE' && product.grade_purchase_price !== undefined && product.grade_purchase_price !== null
        ? Number(product.grade_purchase_price)
        : (product.purchase_price ?? 0),
      tax_rate_percent: product.tax_rate_percent ?? 0,
      billing_type: product.billing_type,
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
    });
    setSearchQuery('');
    setResults([]);
    setTimeout(() => {
      const input = qtyRefs.current[product.product_id];
      if (input) { input.focus(); input.select(); }
    }, 0);
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
    setNewProductPurchasePrice('');
    setNewProductBasePrice('');
    setNewProductStock('');
    setNewProductReorderLevel('');
    setNewProductHsn('');
    setNewProductTaxRate(0);
    setNewProductDiscountPercent('');
    setNewProductDiscountFlat('');
    setNewProductOfferPrice('');
    setNewProductIsGstApplicable(true);
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

  const handleCreateAndAddProduct = async (retries = 3) => {
    if (!window.electronAPI || !tenantId || !newProductName.trim()) return;
    const productId = uuidv4();
    let finalBarcode = newProductBarcode;
    if (!finalBarcode) {
      const gen = await window.electronAPI.dbGenerateBarcode({ tenant_id: tenantId, item_code: newProductItemCode || undefined });
      finalBarcode = (gen?.success && gen?.barcode) || `${newProductItemCode || '0'}001`;
    }
    const purchasePrice = Number(newProductPurchasePrice) || 0;
    const basePrice = Number(newProductBasePrice) || purchasePrice;
    const selectedGrade = newProductGradeId ? newProductGrades.find(g => g.grade_id === newProductGradeId) : null;
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
      current_stock: Number(newProductStock) || 0,
      reorder_level: Number(newProductReorderLevel) || 0,
      is_gst_applicable: newProductIsGstApplicable ? 1 : 0,
      tax_rate_percent: newProductIsGstApplicable ? newProductTaxRate : 0,
      hsn_sac_code: newProductIsGstApplicable ? newProductHsn : null,
      discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
      discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
      offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
      billing_type: 'PIECE',
      grade_id: selectedGrade?.grade_id || null,
      pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
      is_deleted: 0,
      sync_status: 'PENDING',
    });
    if (res.success) {
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
        tax_rate_percent: newProductIsGstApplicable ? newProductTaxRate : 0,
        billing_type: 'PIECE',
        pricing_mode: selectedGrade ? 'GRADE_RATE' : 'FIXED_PRICE',
        grade_id: selectedGrade?.grade_id || null,
        grade_rate: selectedGrade ? Number(selectedGrade.rate) : null,
        sku_barcode: finalBarcode,
        brand_manufacturer: newProductBrand,
        discount_percent: newProductDiscountPercent ? Number(newProductDiscountPercent) : null,
        discount_flat: newProductDiscountFlat ? Number(newProductDiscountFlat) : null,
        offer_price: newProductOfferPrice ? Number(newProductOfferPrice) : null,
        current_stock: Number(newProductStock) || 0,
      });
      setSearchQuery('');
      setResults([]);
      resetProductForm();
    } else if (res.error?.includes('sku_barcode') && retries > 0 && !newProductBarcode) {
      const match = finalBarcode.match(/(\d+)(\D*)$/);
      const suffix = match ? match[2] || '' : '';
      const numPart = match ? match[1] : '001';
      const nextNum = String(parseInt(numPart, 10) + 1).padStart(numPart.length, '0');
      setNewProductBarcode(finalBarcode.replace(/(\d+)(\D*)$/, nextNum + suffix));
      setTimeout(() => handleCreateAndAddProduct(retries - 1), 100);
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
    setTimeout(() => {
      const input = qtyRefs.current[itemId];
      if (input) { input.focus(); input.select(); }
    }, 0);
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
    const handler = () => {
      const raw = localStorage.getItem('editQuotationData');
      if (!raw) return;
      localStorage.removeItem('editQuotationData');
      try {
        const { quotation, items: qItems } = JSON.parse(raw);
        if (!qItems?.length) return;
        clearCart();
        setQuotationMode(true);
        if (quotation.customer_name) updateActiveTab({ customerName: quotation.customer_name });
        if (quotation.customer_phone) updateActiveTab({ customerPhone: quotation.customer_phone });
        if (quotation.customer_address) setQuotationAddress(quotation.customer_address);
        if (quotation.terms_conditions) setQuotationTerms(quotation.terms_conditions);
        setEditingQuotation(quotation.quotation_id, quotation.quotation_number);
        qItems.forEach((item: any) => {
          const productId = item.product_id || item.item_id || `qtn-${Date.now()}-${Math.random()}`;
          addItem({
            product_id: productId,
            name: item.name || 'Product',
            base_price: Number(item.rate) || 0,
            purchase_price: Number(item.rate) || 0,
            tax_rate_percent: 0,
            billing_type: item.weight && Number(item.weight) > 0 ? 'WEIGHT' : undefined,
          });
          const qty = item.weight && Number(item.weight) > 0 ? Number(item.weight) : (Number(item.quantity) || 1);
          if (qty > 0) updateQuantity(productId, qty);
        });
        syncActiveSnapshot();
      } catch (e) {
        console.error('Failed to load quotation edit data', e);
      }
    };
    window.addEventListener('open-quotation-edit', handler);
    return () => window.removeEventListener('open-quotation-edit', handler);
  }, []);

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
            
            // Replicate the piece-per-kg logic from handleSelectProduct
            let piecesPerKg;
            if (prod.billing_type === 'WEIGHT' && prod.domain_attributes) {
              try {
                const da = typeof prod.domain_attributes === 'string'
                  ? JSON.parse(prod.domain_attributes)
                  : prod.domain_attributes;
                const storedPpk = Number(da.pcs_per_kg) || 0;
                const totalPcs = Number(da.pcs) || 0;
                const stockKg = Number(prod.current_stock) || 0;
                piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 && stockKg > 0 ? totalPcs / stockKg : undefined);
              } catch {}
            }

            addItem({
              product_id: prod.product_id,
              name: prod.name,
              base_price: prod.base_price,
              purchase_price: prod.pricing_mode === 'GRADE_RATE' && prod.grade_purchase_price !== undefined && prod.grade_purchase_price !== null
                ? Number(prod.grade_purchase_price)
                : (prod.purchase_price ?? 0),
              tax_rate_percent: prod.tax_rate_percent ?? 0,
              billing_type: prod.billing_type,
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
          customer_address: quotationAddress,
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
          customer_address: quotationAddress,
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
                  <p><strong>Address:</strong> ${quotationAddress || ''}</p>
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
      if (!editingQuotationId) {
        clearCart();
        updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', paymentMethod: 'PENDING', receivedAmount: 0 });
        syncActiveSnapshot();
        setQuotationAddress('');
        setQuotationTerms('1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.');
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
        if (trimmedQuery.length >= 2 && !isQuotationMode && window.electronAPI) {
          try {
            const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, barcode: trimmedQuery });
            if (Array.isArray(products) && products.length > 0) {
              e.preventDefault();
              handleSelectProduct(products[0]);
              // Keep focus in the search field
              setTimeout(() => {
                searchRef.current?.focus();
                searchRef.current?.select();
              }, 50);
              return;
            }
          } catch (err) {
            console.error('[BillingPage] Direct barcode lookup error:', err);
          }
        }

        if (results[selectedIndex]) {
          handleSelectProduct(results[selectedIndex]);
        } else if (!showProductCreateForm && searchQuery.length >= 2 && !isQuotationMode) {
          setShowProductCreateForm(true);
          setNewProductName(searchQuery);
        }
      }
    }
    else if (e.key === ' ' && searchQuery.trim() === '' && !isScrapMode && !isReturnMode && !isPastBillMode && !isQuotationMode) { e.preventDefault(); setShowProductCreateForm(true); setNewProductName(''); }
    else if (e.key === 'Escape') { setResults([]); setScrapSearchResults([]); setPastBillResults([]); setSearchQuery(''); setIsPastBillMode(false); }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const discInput = discRefs.current[productId];
      if (discInput) { discInput.focus(); discInput.select(); }
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
              scrap_invoice_number: scrapInvoiceNum,
              payment_status: scrapPaymentStatus,
            });
            if (!result.success) {
              setHardwareError(`Failed to save scrap item: ${result.error}`);
              setIsCheckingOut(false); return;
            }
          }
        }

        // Print scrap receipt (skip if saveOnly)
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
            setHardwareError('No printer configured. Receipt print skipped.');
          } else if (printResult && !printResult.success) {
            setHardwareError(`Printing issue: ${printResult.error || 'check printer'}`);
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

        setCheckoutSuccess(saveOnly ? 'saved' : 'printed');
        setIsCheckingOut(false);
        setTimeout(async () => {
          clearCart();
          useCartStore.getState().setEditingInvoice(null, null, null);
          updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', paymentMethod: 'PENDING', receivedAmount: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '' });
          syncActiveSnapshot();
          setCheckoutSuccess(false); // scrap mode reset
          await Promise.all([reserveScrapInvoiceNumberForTab(), reserveInvoiceNumberForTab()]);
          const tab = getActiveTab();
          if (tab?.reservedScrapInvoiceNumber) {
            updateActiveTab({ title: tab.reservedScrapInvoiceNumber });
          }
        }, 1800);
      } catch (error) {
        console.error('Failed to save scrap invoice error:', error);
        setHardwareError('Failed to save scrap invoice');
        setIsCheckingOut(false);
      }
      return;
    }

    // ── Normal Mode Checkout ──
    if (paymentMethod === 'CREDIT') {
      if (!customerName.trim() || !customerPhone.trim()) {
        setHardwareError('Please enter Customer Name and Phone Number for Credit');
        setIsCheckingOut(false);
        return;
      }
    }

    const isEditing = !!editingInvoiceId;

    const isPaymentPending = paymentMethod === 'PENDING';
    const effectiveReceivedAmount = isPaymentPending ? 0 : receivedAmount;
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
    const checkoutItems = regularCartItems.map(item => {
      if (item.isServiceItem) {
        const servicePrice = Number(item.offer_price ?? item.base_price) || 0;
        return { item_id: item.item_id || uuidv4(), product_id: item.product_id, name: item.name, quantity: 1, unit_price: servicePrice, tax_amount: 0, total: servicePrice, isServiceItem: true };
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
      const pieces_sold = item.pieces_override ?? (item.pieces_per_kg ? Math.round(qty * item.pieces_per_kg) : undefined);
      return { item_id: item.item_id || uuidv4(), product_id: item.product_id, name: item.name, quantity: qty, unit_price: unitPrice, tax_amount: itemTax, total, pieces_sold };
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
      return { name: item.name, quantity: qty, unit_price: unitPrice, total, originalRate, discountLabel, brand: item.brand_manufacturer || undefined };
    });

    try {
      const cfg = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;

      const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
      const openCashDrawerOnPending = printFmt?.openCashDrawerOnPending === true;
      const isB2B = invoiceType === 'GST' && customerGstin.trim() !== '';
      const useA4 = isB2B || printFmt?.format === 'a4';
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.billSettings || {}) };

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
      const wantsLoyalty = loyaltyEnabled && !!customerName.trim() && (!!customerPhone.trim() || !!customerAddress.trim() || loyaltyCustomerData.customerId);
      if (isEditing) {
        result = await window.electronAPI.dbUpdateInvoice({
          invoice_id, tenant_id: tenantId || 'global', role: editingInvoiceRole || authRole,
          subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: paymentMethod,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          customer_gstin: billSettings.showCustomerGstin ? (customerGstin || null) : null,
          customer_state: billSettings.showCustomerGstin ? (customerState || null) : null,
          customer_address: customerAddress || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
          items: checkoutItems,
        });
      } else {
        result = await window.electronAPI.dbCheckout({
          invoice_id, tenant_id: tenantId || 'unset', user_id: userId || 'unset', invoice_number,
          invoice_type: invoiceType, subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: paymentMethod,
          received_amount: effectiveReceivedAmount, balance_amount: effectiveBalanceAmount,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          customer_gstin: billSettings.showCustomerGstin ? (customerGstin || null) : null,
          customer_state: billSettings.showCustomerGstin ? (customerState || null) : null,
          customer_address: customerAddress || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
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
      if (!result.success) { setHardwareError(isEditing ? 'Update failed' : `Checkout failed: ${result.error}`); setIsCheckingOut(false); return; }

      // Auto-record cash out if there was a leftover refund amount and payment method is CASH
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
      if (!saveOnly) {
        try {
          if (useA4) {
            const invoiceHtml = generateInvoiceHtml(receiptData, printFmt?.style || 'standard');
            const printResult = await window.electronAPI.printA4Html(tenantId || 'global', invoiceHtml);
            if (!printResult.success && printResult.useDefaultDialog) {
              const pw = window.open('', '_blank');
              if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
            }
          } else {
            const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : width;
            const thermalStyle = printFmt?.style || 'standard';
            const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
            const printResult = await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
            if (!printResult.success) {
              console.warn('[Checkout] Print failed (invoice saved):', printResult.error);
              setHardwareError(`Printing issue: ${printResult.error || 'check printer'}`);
            } else if (printResult.skipped) {
              setHardwareError('No printer configured. Receipt print skipped.');
            }
          }
          if (!isPaymentPending || openCashDrawerOnPending) {
            await window.electronAPI.openCashDrawer(tenantId || 'global');
          }
        } catch (printErr: any) {
          console.warn('[Checkout] Print error (invoice already saved):', printErr);
          setHardwareError(`Print warning: ${printErr.message || 'check printer'}`);
        }
      }
    } catch {
      setHardwareError('Hardware communication error.'); setIsCheckingOut(false); return;
    }

    setCheckoutSuccess(saveOnly ? 'saved' : 'printed');
    setIsCheckingOut(false);
    setTimeout(async () => {
      clearCart();
      clearScrapDeduction();
      clearReturnDeduction();
      updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', paymentMethod: 'PENDING', receivedAmount: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '', reservedReturnNumber: '' });
      syncActiveSnapshot();
      setCheckoutSuccess(false); // normal mode reset
      await reserveInvoiceNumberForTab();
      const tab = getActiveTab();
      if (tab?.reservedInvoiceNumber) {
        const titlePrefix = (invoiceType === 'GST' && !enableThreeInvoiceSeries) ? 'GST-' : '';
        updateActiveTab({ title: `${titlePrefix}${tab.reservedInvoiceNumber}` });
      }
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
          setHardwareError('No printer configured. Receipt print skipped.');
        } else if (printResult && !printResult.success) {
          setHardwareError(`Printing issue: ${printResult.error || 'check printer'}`);
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

  // Held Bills state
  const [_heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldBillsPanel, setShowHeldBillsPanel] = useState(false);
  const [_heldBillsLoading, setHeldBillsLoading] = useState(false);

  // Load active held bills from backend
  const loadHeldBills = useCallback(async () => {
    if (!window.electronAPI) return;
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
      const bill = { id: uuidv4(), heldAt: new Date().toLocaleString('en-CA', { hour12: false }).replace(', ', 'T'), items, invoiceType, discountType, discountValue, customerName, customerPhone, paymentMethod, customerGstin };
      const stored = JSON.parse(localStorage.getItem('vendora-held-bills') || '[]');
      stored.push(bill);
      localStorage.setItem('vendora-held-bills', JSON.stringify(stored));
      clearCart(); updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '' }); syncActiveSnapshot();
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
  const _handleRecallHeldBill = async (heldInvoice: any) => {
    if (!window.electronAPI) return;
    setHeldBillsLoading(true);
    try {
      const result = await window.electronAPI.dbRecallHeldBill({ invoice_id: heldInvoice.invoice_id });
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
      if (Number(result.invoice?.discount_value) > 0) {
        setDiscount(Number(result.invoice.discount_value), result.invoice.discount_type || 'FIXED');
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
        paymentMethod: result.invoice?.payment_method || 'PENDING',
        receivedAmount: Number(result.invoice?.received_amount) || 0,
      });

      // Set customer state
      if (result.invoice?.customer_state) {
        setCustomerState(result.invoice.customer_state);
      }

      setShowHeldBillsPanel(false);
      syncActiveSnapshot();
    } catch (e) {
      setHardwareError('Failed to recall held bill');
      console.error(e);
    } finally {
      setHeldBillsLoading(false);
    }
  };

  // Release (delete) a held bill — revert stock, mark as expired
  const _handleReleaseHeldBill = async (invoiceId: string) => {
    if (!window.electronAPI) return;
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
    'F2': () => searchRef.current?.focus(),
    'F8': () => { discountRef.current?.focus(); },
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
      <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2 w-full max-w-md pointer-events-none">
        {hardwareError && (
          <div className="px-5 py-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2.5 text-destructive text-sm font-bold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{hardwareError}</span>
          </div>
        )}
        {checkoutSuccess && (
          <div className="px-5 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
            <CheckCircle2 className="w-4 h-4 shrink-0 animate-bounce" />
            <span>{checkoutSuccess === 'printed' ? 'Invoice completed & Receipt printed!' : 'Invoice saved successfully!'}</span>
          </div>
        )}
        {quotationSuccess && (
          <div className="px-5 py-3 bg-blue-500/10 border border-blue-500/25 rounded-xl flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-bold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto">
            <FileText className="w-4 h-4 shrink-0" />
            <span>{quotationSuccess}</span>
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
          {enableScrap && (
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
                "flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
                isScrapMode
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
              )}
              title="Scrap Mode"
            >
              <Recycle className={clsx("w-4 h-4", isScrapMode && "text-orange-500")} />
              <span>Scrap</span>
            </button>
          )}
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
              "flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
              isQuotationMode
                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
            )}
            title="Quotation Mode"
          >
            <FileText className={clsx("w-4 h-4", isQuotationMode && "text-blue-500")} />
            <span>Quotation</span>
          </button>
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
              "flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border",
              isReturnMode
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
            )}
            title="Return Mode"
          >
            <ArrowLeftRight className={clsx("w-4 h-4", isReturnMode && "text-rose-500")} />
            <span>Return</span>
          </button>
          {showCashRegister && (
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
                    isScrapMode ? "text-orange-500" :
                    isReturnMode ? "text-rose-500" :
                    isQuotationMode ? "text-blue-500" :
                    isPastBillMode ? "text-teal-500" :
                    "text-muted-foreground"
                  )} />
                  <input
                    ref={searchRef}
                    type="text"
                    autoFocus
                    placeholder={isScrapMode ? "Search scrap categories... (Scrap Mode)" : isReturnMode ? "Search invoices for return... (Return Mode)" : isQuotationMode ? "Search products... (Quotation Mode)" : isPastBillMode ? "Search past bills by invoice number..." : invoiceType === 'GST' ? "Search GST products or scan barcode... (Press F2)" : "Search products or scan barcode... (Press F2)"}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKey}
                    className="search-dynamic w-full pl-10 pr-9 py-2.5 bg-background rounded-xl text-sm font-medium text-foreground transition-all duration-300 placeholder:text-muted-foreground/50 focus:outline-none"
                    style={{
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: isScrapMode
                        ? 'rgb(249,115,22)'
                        : isReturnMode
                        ? 'rgb(244,63,94)'
                        : isQuotationMode
                        ? 'rgb(59,130,246)'
                        : isPastBillMode
                        ? 'rgb(20,184,166)'
                        : 'hsl(var(--border))',
                      boxShadow: isScrapMode
                        ? '0 0 0 3px rgba(249,115,22,0.15)'
                        : isReturnMode
                        ? '0 0 0 3px rgba(244,63,94,0.15)'
                        : isQuotationMode
                        ? '0 0 0 3px rgba(59,130,246,0.15)'
                        : isPastBillMode
                        ? '0 0 0 3px rgba(20,184,166,0.15)'
                        : undefined,
                      '--search-focus-color': isScrapMode
                        ? 'rgb(249,115,22)'
                        : isReturnMode
                        ? 'rgb(244,63,94)'
                        : isQuotationMode
                        ? 'rgb(59,130,246)'
                        : isPastBillMode
                        ? 'rgb(20,184,166)'
                        : undefined,
                      '--search-focus-shadow': isScrapMode
                        ? 'rgba(249,115,22,0.2)'
                        : isReturnMode
                        ? 'rgba(244,63,94,0.2)'
                        : isQuotationMode
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
                  <div className="max-h-[320px] overflow-y-auto">
                    {!isScrapMode && !isReturnMode && results.map((p, i) => {
                      const mrp = getTierPriceForProduct(p) ?? (p.pricing_mode === 'GRADE_RATE' ? (p.grade_rate || 0) : p.base_price);
                      const showOffer = p.offer_price && Number(p.offer_price) > 0;
                      const displayPrice = showOffer ? Number(p.offer_price) : mrp;
                      const isSelected = i === selectedIndex;
                      return (
                        <button
                          key={p.product_id}
                          onClick={() => handleSelectProduct(p)}
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
                            <div className="font-bold text-sm text-foreground truncate">
                              {p.name}
                              {Number(p.is_service_item) ? (
                                <span className="ml-1.5 text-[9px] font-bold text-violet-600 bg-violet-500/15 px-1.5 py-0.5 rounded uppercase align-middle">Service</span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              {!Number(p.is_service_item) && (
                                <>
                              <span className="font-mono bg-muted/70 px-1 py-0.5 rounded text-[10px]">{p.sku_barcode || 'NO BARCODE'}</span>
                              <span>&middot;</span>
                              <span className={clsx(
                                'font-semibold',
                                p.current_stock <= 0 ? 'text-destructive' : p.current_stock < 10 ? 'text-amber-500' : 'text-emerald-500'
                              )}>
                                Stock: {(() => {
                                  const ppk = p.domain_attributes ? (() => { try { const d = JSON.parse(typeof p.domain_attributes === 'string' ? p.domain_attributes : '{}'); const storedPpk = Number(d.pcs_per_kg) || 0; const totalPcs = Number(d.pcs) || 0; const stockKg = Number(p.current_stock) || 0; return storedPpk > 0 ? storedPpk : (totalPcs > 0 && stockKg > 0 ? totalPcs / stockKg : 0); } catch { return 0; } })() : 0;
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
                          onClick={() => handleSelectScrapItem(s)}
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
                          onClick={() => handleSelectReturnInvoice(inv)}
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
              {!isPastBillMode && !isScrapMode && !isReturnMode && !isQuotationMode && searchQuery.length >= 2 && results.length === 0 && !showProductCreateForm && (
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
            <div className="relative mb-2">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                placeholder="Customer Address (optional)"
                value={customerAddress}
                onChange={e => updateActiveTab({ customerAddress: e.target.value })}
                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-300"
              />
            </div>
            {pricingTiers.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1 rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <Select
                  size="sm"
                  triggerClassName="h-auto"
                  className="w-44"
                  value={selectedTierId}
                  onChange={v => { if (canOverrideTier) setSelectedTierId(v); }}
                  options={[
                    { value: '', label: 'Default (MRP)' },
                    ...pricingTiers.map(t => ({ value: t.pricing_tier_id, label: t.name })),
                  ]}
                  disabled={!canOverrideTier}
                />
                {selectedTierId && (
                  <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wider shrink-0">
                    {pricingTiers.find(t => t.pricing_tier_id === selectedTierId)?.name} prices
                  </span>
                )}
                {!canOverrideTier && (
                  <span className="text-[10px] text-muted-foreground shrink-0" title="Owner has disabled biller price overrides">🔒 locked</span>
                )}
              </div>
            )}
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
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-2 text-center max-w-xs mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground shadow-sm">
                  {emptyIcon}
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground/80">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">Search or scan to add items</p>
                </div>
                <div className="flex gap-1.5 mt-1">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-card border rounded shadow-sm">F2: Search</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-card border rounded shadow-sm">F8: {isScrapMode ? 'Extra' : 'Discount'}</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-card border rounded shadow-sm">F12: Print</kbd>
                </div>
              </div>
            ) : (
              items.map(item => {
                if (item.isServiceItem) {
                  const serviceAmount = Number(item.offer_price ?? item.base_price) || 0;
                  return (
                    <div key={item.product_id} className="flex items-center gap-3 px-3 py-2 bg-violet-500/5 border border-violet-500/30 hover:border-violet-500/50 rounded-xl transition-all duration-200 hover:shadow-sm group">
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
                          ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                          onChange={e => updateItemOfferPrice(item.product_id, e.target.value === '' ? 0 : Number(e.target.value))}
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
                    <div key={item.product_id} className="flex items-center gap-3 px-3 py-2 bg-rose-500/5 border border-rose-500/30 hover:border-rose-500/50 rounded-xl transition-all duration-200 hover:shadow-sm group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                          <span className="text-[9px] font-bold text-rose-600 bg-rose-500/15 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">Return</span>
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
                          ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                          className="w-12 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={qtyText}
                          onChange={e => {
                            const v = e.target.value === '' ? 1 : Math.min(avail, Math.max(0, Number(e.target.value)));
                            updateQuantity(item.product_id, v);
                          }}
                          onKeyDown={e => handleQtyKeyDown(e, item.product_id)}
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
                    (localDiscPcts[item.product_id] && localDiscPcts[item.product_id] > 0) ||
                    (localDiscFlats[item.product_id] && localDiscFlats[item.product_id] > 0) ||
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
                    <div key={item.product_id} className="flex items-center gap-3 px-3 py-2 bg-orange-500/5 border border-orange-500/30 hover:border-orange-500/50 rounded-xl transition-all duration-200 hover:shadow-sm group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                          <span className="text-[9px] font-bold text-orange-600 bg-orange-500/15 px-1.5 py-0.5 rounded uppercase shrink-0 leading-none">Scrap</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          <span className="text-orange-600 font-semibold">{formatCurrency(rate)}/{(item as any).unit || 'Kg'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 bg-orange-500/10 border border-orange-500/30 rounded-lg py-0.5 shrink-0">
                        <input type="number" step="0.001" min="0"
                          ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                          className="w-14 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={item.quantity === 0 ? 0 : item.quantity || ''}
                          onChange={e => updateQuantity(item.product_id, e.target.value === '' ? 0 : Number(e.target.value))}
                          onKeyDown={e => handleQtyKeyDown(e, item.product_id)}
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
                const isPiecesWeight = item.billing_type === 'WEIGHT' && !!item.pieces_per_kg;
                const weightKg = Number(item.quantity) || 0;
                const pieces = isPiecesWeight ? (item.pieces_override ?? Math.round(weightKg * item.pieces_per_kg!)) : 0;
                const qty = weightKg;

                // Explicit discount flag — avoids floating-point comparison bugs
                const hasItemDiscount = !!(
                  (item.offer_price !== null && item.offer_price !== undefined) ||
                  (item.discount_flat !== null && item.discount_flat !== undefined) ||
                  (item.discount_percent !== null && item.discount_percent !== undefined)
                );

                const hasAdHocDiscount = !!(
                  (localDiscPcts[item.product_id] && localDiscPcts[item.product_id] > 0) ||
                  (localDiscFlats[item.product_id] && localDiscFlats[item.product_id] > 0) ||
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

                const _ppk = item.pieces_per_kg!;
                const handlePcsChange = (pcsVal: number) => {
                  updatePiecesOverride(item.product_id, pcsVal > 0 ? pcsVal : undefined);
                };

                return (
                    <div key={item.product_id} className="flex items-center gap-3 px-3 py-2 bg-card border border-border/80 hover:border-primary/40 rounded-xl transition-all duration-200 hover:shadow-sm group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground truncate">{item.name}</span>
                        {item.sku_barcode && (
                          <span className="text-[10px] font-mono text-muted-foreground/50 truncate hidden sm:inline">{item.sku_barcode}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                        {item.brand_manufacturer && <span className="font-medium">{item.brand_manufacturer}</span>}
                        {!item.sku_barcode && !item.brand_manufacturer && <span className="italic">No barcode</span>}
                      </div>
                    </div>

                    {isPiecesWeight ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">Pcs</span>
                          <input type="number" min="1" step="1"
                            ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                            className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={pieces}
                            onChange={e => handlePcsChange(e.target.value === '' ? 1 : Number(e.target.value))}
                            onKeyDown={e => { if (e.key === 'Enter') { kRefs.current[item.product_id]?.focus(); e.preventDefault(); } else { handleQtyKeyDown(e, item.product_id); } }}
                          />
                        </div>
                        <div className="flex items-center gap-0.5 bg-muted/40 border border-border/80 rounded-lg px-1.5 py-0.5">
                          <span className="text-[8px] text-muted-foreground font-bold uppercase">Kgs</span>
                          <input type="number" min="0" step="0.001"
                            ref={(el) => { kRefs.current[item.product_id] = el; }}
                            className="w-9 text-center h-7 bg-transparent border-0 text-xs font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={weightKg}
                            onChange={e => updateQuantity(item.product_id, e.target.value === '' ? '' : Number(e.target.value))}
                            onKeyDown={e => handleQtyKeyDown(e, item.product_id)}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 shrink-0 bg-muted/40 border border-border/80 rounded-lg overflow-hidden">
                        <button onClick={() => { const q = Number(item.quantity); const step = item.billing_type === 'WEIGHT' ? 0.1 : 1; if (q > step) updateQuantity(item.product_id, +(q - step).toFixed(3)); else removeItem(item.product_id); }}
                          className="w-7 h-7 flex items-center justify-center bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 cursor-pointer font-bold"
                        ><Minus className="w-3 h-3" /></button>
                        <input type="number" min={item.billing_type === 'WEIGHT' ? '0' : '1'} step={item.billing_type === 'WEIGHT' ? '0.001' : '1'}
                          ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                          className="w-12 text-center h-7 bg-transparent border-0 text-sm font-black text-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={item.quantity}
                          onChange={e => updateQuantity(item.product_id, e.target.value === '' ? '' : Number(e.target.value))}
                          onKeyDown={e => handleQtyKeyDown(e, item.product_id)}
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

          {/* ── RIGHT PANEL HEADER ── */}
          <div className="shrink-0 px-5 py-2.5 border-b border-border bg-transparent">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">Transaction Console</p>
          </div>

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
                  { value: 'CASH' as const, label: 'Cash', icon: Banknote, color: 'text-emerald-500', activeBg: 'bg-emerald-500/10', activeText: 'text-emerald-600 dark:text-emerald-400', activeBorder: 'border-emerald-500', activeIconBg: 'bg-emerald-500/15' },
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
                    { value: 'CASH' as const, label: 'Cash', icon: Banknote, activeBg: 'bg-emerald-500/10', activeText: 'text-emerald-600 dark:text-emerald-400', activeBorder: 'border-emerald-500', activeIconBg: 'bg-emerald-500/15' },
                    { value: 'UPI' as const, label: 'UPI', icon: Smartphone, activeBg: 'bg-violet-500/10', activeText: 'text-violet-600 dark:text-violet-400', activeBorder: 'border-violet-500', activeIconBg: 'bg-violet-500/15' },
                    { value: 'CARD' as const, label: 'Card', icon: Wallet, activeBg: 'bg-blue-500/10', activeText: 'text-blue-600 dark:text-blue-400', activeBorder: 'border-blue-500', activeIconBg: 'bg-blue-500/15' },
                    { value: 'BANK_TRANSFER' as const, label: 'Bank Transfer', icon: Building, activeBg: 'bg-sky-500/10', activeText: 'text-sky-600 dark:text-sky-400', activeBorder: 'border-sky-500', activeIconBg: 'bg-sky-500/15' },
                    { value: 'STORE_CREDIT' as const, label: 'Store Credit', icon: Gift, activeBg: 'bg-amber-500/10', activeText: 'text-amber-600 dark:text-amber-400', activeBorder: 'border-amber-500', activeIconBg: 'bg-amber-500/15' },
                    { value: 'ADJUST_BILL' as const, label: 'Adjust Bill', icon: ArrowLeftRight, activeBg: 'bg-rose-500/10', activeText: 'text-rose-600 dark:text-rose-400', activeBorder: 'border-rose-500', activeIconBg: 'bg-rose-500/15' },
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
              <div className="grid grid-cols-6 gap-1.5">
                {PAYMENT_OPTIONS.map((opt, idx) => {
                  const isActive = paymentMethod === opt.value;
                  const span = idx < 3 ? 'col-span-2' : 'col-span-3';
                  let activeBg = '';
                  let activeText = '';
                  let activeBorder = '';
                  let activeIconBg = '';
                  if (opt.value === 'PENDING'){ activeBg = 'bg-gray-500/10';    activeText = 'text-gray-600 dark:text-gray-400';    activeBorder = 'border-gray-500';    activeIconBg = 'bg-gray-500/15'; }
                  if (opt.value === 'CASH')   { activeBg = 'bg-emerald-500/10'; activeText = 'text-emerald-600 dark:text-emerald-400'; activeBorder = 'border-emerald-500'; activeIconBg = 'bg-emerald-500/15'; }
                  if (opt.value === 'CARD')   { activeBg = 'bg-blue-500/10';    activeText = 'text-blue-600 dark:text-blue-400';    activeBorder = 'border-blue-500';    activeIconBg = 'bg-blue-500/15'; }
                  if (opt.value === 'UPI')    { activeBg = 'bg-violet-500/10';  activeText = 'text-violet-600 dark:text-violet-400';  activeBorder = 'border-violet-500';  activeIconBg = 'bg-violet-500/15'; }
                  if (opt.value === 'CREDIT') { activeBg = 'bg-amber-500/10';   activeText = 'text-amber-600 dark:text-amber-400';   activeBorder = 'border-amber-500';   activeIconBg = 'bg-amber-500/15'; }

                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateActiveTab({ paymentMethod: opt.value })}
                      className={clsx(
                        'flex flex-col items-center justify-center gap-1 py-2 rounded-2xl border-2 transition-all duration-200 active:scale-95 cursor-pointer',
                        span,
                        isActive
                          ? `${activeBg} ${activeBorder} ${activeText} shadow-sm`
                          : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'
                      )}
                    >
                      <div className={clsx(
                        'p-2 rounded-xl transition-colors',
                        isActive ? activeIconBg : 'bg-muted'
                      )}>
                        <opt.icon className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-xs font-extrabold">{opt.label}</span>
                    </button>
                  );
                })}
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
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Customer Address</label>
                  <input
                    type="text"
                    value={quotationAddress}
                    onChange={e => setQuotationAddress(e.target.value)}
                    placeholder="Customer address for quotation"
                    className="w-full bg-background border border-border rounded-lg p-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Terms & Conditions</label>
                  <textarea
                    value={quotationTerms}
                    onChange={e => setQuotationTerms(e.target.value)}
                    rows={3}
                    placeholder="Terms and conditions..."
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
              {(!isScrapMode || subtotal > 0) && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold text-sm">Items Subtotal</span>
                <span className="font-bold text-foreground text-sm">{formatCurrency(subtotal)}</span>
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
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-muted border rounded text-muted-foreground/60 shadow-sm">F8</kbd>
                      {extraBonus > 0 && (
                        <span className="text-xs font-black text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">+{formatCurrency(extraBonus)}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground font-semibold text-sm">Discount</span>
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-muted border rounded text-muted-foreground/60 shadow-sm">F8</kbd>
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
                              onClick={async () => {
                                const invNum = storeScrapInvoiceNumber;
                                clearScrapDeduction();
                                if (invNum && window.electronAPI) {
                                  await window.electronAPI.dbUpdateScrapInvoicePaymentStatus({
                                    tenant_id: tenantId || '',
                                    scrap_invoice_number: invNum,
                                    payment_status: 'PENDING',
                                  });
                                }
                              }}
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
                                    setScrapDeduction(res.totalAmount, q);
                                    setScrapDeductionSearchQuery('');
                                    setScrapDeductionResults([]);
                                    setScrapDeductionDropdownStyle(null);
                                    if (window.electronAPI) {
                                      await window.electronAPI.dbUpdateScrapInvoicePaymentStatus({ tenant_id: tenantId || '', scrap_invoice_number: q, payment_status: 'SETTLED' });
                                    }
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
                                          setScrapDeduction(detailRes.totalAmount, match.invoice_number);
                                          setScrapDeductionSearchQuery('');
                                          setScrapDeductionResults([]);
                                          setScrapDeductionDropdownStyle(null);
                                          if (window.electronAPI) {
                                            await window.electronAPI.dbUpdateScrapInvoicePaymentStatus({ tenant_id: tenantId || '', scrap_invoice_number: match.invoice_number, payment_status: 'SETTLED' });
                                          }
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
                    <div className="flex bg-muted/20 p-0.5 border-b border-border/40">
                      <button
                        onClick={() => setReturnDeductionSearchMode(false)}
                        className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg',
                          !returnDeductionSearchMode
                            ? 'bg-orange-500/10 text-orange-600 shadow-sm'
                            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >Scrap</button>
                      <button
                        onClick={() => setReturnDeductionSearchMode(true)}
                        className={clsx('flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer rounded-lg',
                          returnDeductionSearchMode
                            ? 'bg-rose-500/10 text-rose-600 shadow-sm'
                            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >Return</button>
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
                                    setScrapDeduction(res.totalAmount, q);
                                    setScrapDeductionSearchQuery('');
                                    setScrapDeductionResults([]);
                                    setScrapDeductionDropdownStyle(null);
                                    if (window.electronAPI) {
                                      await window.electronAPI.dbUpdateScrapInvoicePaymentStatus({ tenant_id: tenantId || '', scrap_invoice_number: q, payment_status: 'SETTLED' });
                                    }
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
                                          setScrapDeduction(detailRes.totalAmount, match.invoice_number);
                                          setScrapDeductionSearchQuery('');
                                          setScrapDeductionResults([]);
                                          setScrapDeductionDropdownStyle(null);
                                          if (window.electronAPI) {
                                            await window.electronAPI.dbUpdateScrapInvoicePaymentStatus({ tenant_id: tenantId || '', scrap_invoice_number: match.invoice_number, payment_status: 'SETTLED' });
                                          }
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
                <p className="text-xl font-black text-foreground leading-none">{formatCurrency(displayGrandTotal)}</p>
                {refundAmount > 0 && (
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
              {isQuotationMode && !editingQuotationId ? (
                /* ── Quotation Create Mode ── */
                <>
                  <button
                    onClick={() => handleSaveQuotation(false)}
                    disabled={quotationSaving || items.length === 0}
                    className="w-[20%] py-3 rounded-xl border-2 border-blue-400/60 text-blue-600 dark:text-blue-400 font-black text-sm flex items-center justify-center gap-1.5 hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleSaveQuotation()}
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
                        <span>SAVE &amp; PRINT</span>
                      </>
                    )}
                  </button>
                </>
              ) : editingQuotationId ? (
                /* ── Quotation Edit Mode ── */
                <>
                  <button
                    onClick={() => handleSaveQuotation(false)}
                    disabled={quotationSaving || items.length === 0}
                    className="w-[20%] py-3 rounded-xl border-2 border-blue-400/60 text-blue-600 dark:text-blue-400 font-black text-sm flex items-center justify-center gap-1.5 hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 shrink-0" />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={() => handleSaveQuotation(true)}
                    disabled={quotationSaving || items.length === 0}
                    className="w-[35%] py-3 flex items-center justify-center gap-2 rounded-xl border-2 border-blue-500 text-blue-500 font-black text-sm hover:bg-blue-500/10 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                  >
                    {quotationSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        <span>SAVING...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-4.5 h-4.5" />
                        <span>SAVE &amp; PRINT</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleCheckout()}
                    disabled={isCheckingOut || items.length === 0}
                    className="flex-1 py-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white font-black text-sm shadow-md hover:bg-emerald-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
                  >
                    {isCheckingOut ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>FINALIZING...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4.5 h-4.5" />
                        <span>PRINT &amp; BILL (F12)</span>
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
                    className="w-[20%] py-3 rounded-xl border-2 border-border text-muted-foreground font-black text-sm hover:bg-muted hover:text-foreground hover:border-muted-foreground/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer"
                  >
                    Hold
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
                      setScrapDeduction(res.totalAmount, inv.invoice_number);
                      setScrapDeductionSearchQuery('');
                      setScrapDeductionResults([]);
                      setScrapDeductionDropdownStyle(null);
                      if (window.electronAPI) {
                        await window.electronAPI.dbUpdateScrapInvoicePaymentStatus({
                          tenant_id: tenantId || '',
                          scrap_invoice_number: inv.invoice_number,
                          payment_status: 'SETTLED',
                        });
                      }
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
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4">
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
                    </div>
                  )}
                </section>
              </div>
              <div className="flex items-center justify-end px-5 py-3 border-t border-border bg-background">
                <button type="button" data-enter-submit onClick={async () => { await handleCreateAndAddProduct(); }} disabled={!newProductName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
                  <Save className="w-3.5 h-3.5" />
                  Add to Inventory
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
    </div>
  );
}


