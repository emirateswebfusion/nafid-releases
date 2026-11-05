import { isUaeStore, getStoreVatInclusive } from '../utils/localization/storeProfile';
import { calculateVat } from '../utils/pricing/vat';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { listRate, resolveLinePrice } from '../utils/pricing/linePricing';
import { splitTaxAmount, resolveSupplyType } from '../utils/pricing/checkoutLines';

export interface CartItem {
  item_id?: string;
  product_id: string;
  name: string;
  base_price: number;
  purchase_price: number;
  tax_rate_percent: number;
  quantity: number | string;
  billing_type?: string;
  uom?: string;
  pieces_per_kg?: number;
  grade_id?: string | null;
  pricing_mode?: string;
  grade_rate?: number | null;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  catalog_discount_percent?: number | null;
  catalog_discount_flat?: number | null;
  catalog_offer_price?: number | null;
  sku_barcode?: string | null;
  item_code?: string | null;
  brand_manufacturer?: string | null;
  current_stock?: number;
  isScrap?: boolean;
  scrap_category_id?: string;
  isServiceItem?: boolean;
  pieces_override?: number;
  isReturnItem?: boolean;
  unit?: string;
  invoiceItemId?: string;
  originalQuantity?: number;
  availableToReturn?: number;
  alreadyReturned?: number;
  originalUnitPrice?: number;
  rawUnitPrice?: number;
  originalTaxAmount?: number;
  returnSourceInvoiceId?: string;
  returnSourceInvoiceNumber?: string | null;
  isCombo?: boolean;
  combo_id?: string;
  combo_items?: Array<{ product_id: string; quantity: number; product_name?: string }>;
  combo_price?: number;
  hsn_sac_code?: string | null;
  is_gst_applicable?: boolean;
  pricing_tier_id?: string | null;
  pricing_tier_name?: string | null;
  is_tier_overridden?: boolean;
  original_base_price?: number;
  original_pricing_mode?: string;
  original_grade_id?: string | null;
  original_grade_rate?: number | null;
}

export type InvoiceType = 'GST' | 'BILL_OF_SUPPLY';
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OWNER' | 'MANAGER' | 'BILLER' | 'STAFF';
export type ShopDomain = 'GENERAL' | 'HARDWARE' | 'JEWELRY' | 'GROCERY';

interface CartState {
  items: CartItem[];
  invoiceType: InvoiceType;
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: number;
  customerState: string;
  shopState: string;
  currentUserRole: UserRole;
  shopDomain: ShopDomain | null;
  shopDomainConfirmed: boolean;
  scrapDeduction: number;
  scrapInvoiceNumber: string;
  returnDeduction: number;
  returnInvoiceNumber: string;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  isFilingOnly: boolean;
  filingPreviousInvoiceType?: InvoiceType;
  returnRefundMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'ADJUST_BILL' | 'CREDIT';
  editingQuotationId: string | null;
  editingQuotationNumber: string | null;
  editingInvoiceId: string | null;
  editingInvoiceNumber: string | null;
  editingInvoiceRole: UserRole | null;
  pendingScrapInvoiceToEdit: string | null;

  lastAddedProductId: string | null;

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
  updatePiecesOverride: (productId: string, pieces: number | undefined) => void;
  updateItemDiscount: (productId: string, type: 'PERCENT' | 'FLAT', value: number) => void;
  removeItemDiscount: (productId: string) => void;
  updateItemOfferPrice: (productId: string, price: number | null) => void;
  updateItemPricingTier: (productId: string, tierId: string | null, tierName: string | null, newPrice: number) => void;
  setDiscount: (value: number, type: 'FIXED' | 'PERCENTAGE') => void;
  setInvoiceType: (type: InvoiceType) => void;
  setCustomerState: (state: string) => void;
  setRole: (role: UserRole) => void;
  setDomain: (domain: ShopDomain) => void;
  confirmDomain: () => void;
  resetDomainConfirmation: () => void;
  setScrapDeduction: (amount: number, invoiceNumber: string) => void;
  setScrapInvoiceNumber: (invoiceNumber: string) => void;
  clearScrapDeduction: () => void;
  setReturnDeduction: (amount: number, returnInvoiceNumber: string) => void;
  clearReturnDeduction: () => void;
  setReturnMode: (isReturnMode: boolean) => void;
  setIsScrapMode: (isScrapMode: boolean) => void;
  salesStaffId: string | null;
  salesStaffName: string | null;
  billerStaffId: string | null;
  billerStaffName: string | null;

  setSalesStaff: (id: string | null, name: string | null) => void;
  setBillerStaff: (id: string | null, name: string | null) => void;
  clearStaff: () => void;

  setReturnRefundMethod: (method: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'ADJUST_BILL' | 'CREDIT') => void;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setEditingQuotation: (quotationId: string | null, quotationNumber: string | null) => void;
  setEditingInvoice: (id: string | null, number: string | null, role: UserRole | null) => void;
  setPendingScrapInvoiceToEdit: (invoiceNumber: string | null) => void;
  setLastAddedProductId: (id: string | null) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      lastAddedProductId: null,
      salesStaffId: null,
      salesStaffName: null,
      billerStaffId: null,
      billerStaffName: null,
      invoiceType: 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'KL', // Default to same state (Kerala)
      shopState: 'KL', // Shop is in KL
      currentUserRole: 'ADMIN',
      shopDomain: 'GENERAL',
      shopDomainConfirmed: true,
      scrapDeduction: 0,
      scrapInvoiceNumber: '',
      returnDeduction: 0,
      returnInvoiceNumber: '',
      isQuotationMode: false,
      isReturnMode: false,
      isScrapMode: false,
      isFilingOnly: false,
      returnRefundMethod: 'ADJUST_BILL',
      editingQuotationId: null,
      editingQuotationNumber: null,
      editingInvoiceId: null,
      editingInvoiceNumber: null,
      editingInvoiceRole: null,
      pendingScrapInvoiceToEdit: null,
      setSalesStaff: (id, name) => set({ salesStaffId: id, salesStaffName: name }),
      setBillerStaff: (id, name) => set({ billerStaffId: id, billerStaffName: name }),
      clearStaff: () => set({ salesStaffId: null, salesStaffName: null, billerStaffId: null, billerStaffName: null }),
      setPendingScrapInvoiceToEdit: (invoiceNumber) => set({ pendingScrapInvoiceToEdit: invoiceNumber }),
      setIsScrapMode: (isScrapMode) => set({ isScrapMode, ...(isScrapMode ? { isFilingOnly: false } : {}) }),
      setLastAddedProductId: (id) => set({ lastAddedProductId: id }),

      addItem: (newItem) =>
        set((state) => {
          const existingItem = state.items.find(i => i.product_id === newItem.product_id);
          if (existingItem) {
            return {
              lastAddedProductId: newItem.product_id,
              items: state.items.map(i => {
                if (i.product_id === newItem.product_id) {
                  const delta = i.billing_type === 'WEIGHT' ? 0.1 : 1;
                  return { ...i, quantity: Number(i.quantity) + delta };
                }
                return i;
              }),
            };
          }
          const catalogDiscPct = newItem.catalog_discount_percent !== undefined ? newItem.catalog_discount_percent : (newItem.discount_percent ?? null);
          const catalogDiscFlat = newItem.catalog_discount_flat !== undefined ? newItem.catalog_discount_flat : (newItem.discount_flat ?? null);
          const catalogOfferPrice = newItem.catalog_offer_price !== undefined ? newItem.catalog_offer_price : (newItem.offer_price ?? null);
          const origPrice = newItem.original_base_price ?? newItem.base_price;
          return {
            lastAddedProductId: newItem.product_id,
            items: [
              ...state.items,
              {
                ...newItem,
                original_base_price: origPrice,
                catalog_discount_percent: catalogDiscPct,
                catalog_discount_flat: catalogDiscFlat,
                catalog_offer_price: catalogOfferPrice,
                quantity: newItem.quantity ?? 1,
                pieces_override: newItem.pieces_override ?? 1,
              },
            ],
          };
        }),

      removeItem: (productId) =>
        set((state) => ({
          lastAddedProductId: state.lastAddedProductId === productId ? null : state.lastAddedProductId,
          items: state.items.filter(i => i.product_id !== productId),
        })),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId ? { ...i, quantity } : i
          ),
        })),

      updatePiecesOverride: (productId, pieces) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId ? { ...i, pieces_override: pieces } : i
          ),
        })),
      updateItemDiscount: (productId, type, value) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId
              ? {
                  ...i,
                  discount_percent: type === 'PERCENT' ? value : null,
                  discount_flat: type === 'FLAT' ? value : null,
                  offer_price: null,
                }
              : i
          ),
        })),
      removeItemDiscount: (productId) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId
              ? {
                  ...i,
                  discount_percent: i.catalog_discount_percent ?? null,
                  discount_flat: i.catalog_discount_flat ?? null,
                  offer_price: i.catalog_offer_price ?? null,
                }
              : i
          ),
        })),
      updateItemOfferPrice: (productId, price) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId
              ? { ...i, offer_price: price, discount_percent: null, discount_flat: null, is_tier_overridden: true }
              : i
          ),
        })),
      updateItemPricingTier: (productId, tierId, tierName, newPrice) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId
              ? {
                  ...i,
                  pricing_tier_id: tierId,
                  pricing_tier_name: tierName,
                  is_tier_overridden: true,
                  base_price: newPrice,
                  // A per-item tier is an explicit unit price, so catalog promos must not
                  // override it in the cart total or when the invoice is saved.
                  offer_price: null,
                  discount_percent: null,
                  discount_flat: null,
                  catalog_offer_price: null,
                  catalog_discount_percent: null,
                  catalog_discount_flat: null,
                  original_pricing_mode: i.original_pricing_mode ?? i.pricing_mode,
                  original_grade_id: i.original_grade_id ?? i.grade_id ?? null,
                  original_grade_rate: i.original_grade_rate ?? i.grade_rate ?? null,
                  pricing_mode: 'FIXED_PRICE',
                }
              : i
          ),
        })),
      setDiscount: (value, type) => set({ discountValue: value, discountType: type }),
      setInvoiceType: (invoiceType) => set({ invoiceType }),
      setCustomerState: (customerState) => set({ customerState }),
      setRole: (role) => set({ currentUserRole: role }),
      setDomain: (domain) => set({ shopDomain: domain }),
      confirmDomain: () => set({ shopDomainConfirmed: true }),
      resetDomainConfirmation: () => set({ shopDomainConfirmed: false }),
      setScrapDeduction: (amount, invoiceNumber) => set({ scrapDeduction: amount, scrapInvoiceNumber: invoiceNumber }),
      setScrapInvoiceNumber: (invoiceNumber) => set({ scrapInvoiceNumber: invoiceNumber }),
      clearScrapDeduction: () => set({ scrapDeduction: 0, scrapInvoiceNumber: '' }),
      setReturnDeduction: (amount, returnInvoiceNumber) => set({ returnDeduction: amount, returnInvoiceNumber }),
      clearReturnDeduction: () => set({ returnDeduction: 0, returnInvoiceNumber: '' }),
      setReturnMode: (isReturnMode) =>
        set((state) => ({
          isReturnMode,
          ...(isReturnMode ? { isFilingOnly: false } : {}),
          items: isReturnMode
            ? state.items.filter(i => i.isReturnItem)
            : state.items.filter(i => !i.isReturnItem),
        })),
      setReturnRefundMethod: (returnRefundMethod) => set({ returnRefundMethod }),
      setQuotationMode: (isQuotationMode) => {
        set({ isQuotationMode, ...(isQuotationMode ? { isFilingOnly: false } : {}) });
        try {
          (window as Window & { useTabStore?: { getState?: () => { syncActiveSnapshot?: () => void } } }).useTabStore?.getState?.()?.syncActiveSnapshot?.();
        } catch { /* ignore */ }
      },
      setEditingQuotation: (quotationId, quotationNumber) => set({ editingQuotationId: quotationId, editingQuotationNumber: quotationNumber }),
      setEditingInvoice: (id, number, role) => set({ editingInvoiceId: id, editingInvoiceNumber: number, editingInvoiceRole: role }),
      clearCart: () => set((state) => ({ items: [], lastAddedProductId: null, discountValue: 0, discountType: 'FIXED', invoiceType: state.isFilingOnly ? (state.filingPreviousInvoiceType || state.invoiceType) : state.invoiceType, customerState: 'KL', scrapDeduction: 0, scrapInvoiceNumber: '', returnDeduction: 0, returnInvoiceNumber: '', isFilingOnly: false, filingPreviousInvoiceType: undefined, isQuotationMode: state.isQuotationMode, isReturnMode: state.isReturnMode, isScrapMode: state.isScrapMode, returnRefundMethod: 'ADJUST_BILL', editingQuotationId: null, editingQuotationNumber: null, editingInvoiceId: null, editingInvoiceNumber: null, editingInvoiceRole: null, pendingScrapInvoiceToEdit: null })),
    }),
    {
      name: 'nafid-cart-storage',
    }
  )
);

export interface LoyaltyInfo {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  previousPointsBalance: number;
  pointsEarned: number;
  pointsRedeemed: number;
  pointsRedeemedDiscount: number;
  remainingPointsBalance: number;
}

// Derived Selectors
export const useCartTotals = (bosTaxRatePercent = 0, bosTaxInclusive = false) => {
  const { items, invoiceType, discountType, discountValue, shopState, customerState, returnDeduction } = useCartStore(
    useShallow((state) => ({
      items: state.items,
      invoiceType: state.invoiceType,
      discountType: state.discountType,
      discountValue: state.discountValue,
      shopState: state.shopState,
      customerState: state.customerState,
      returnDeduction: state.returnDeduction,
    })),
  );

  let subtotal = 0;
  let totalTax = 0;
  let scrapTotal = 0;
  let serviceTotal = 0;
  let serviceTax = 0;

  items.forEach(item => {
    if (item.isReturnItem) return;
    if (item.isServiceItem) {
      const price = Number(item.offer_price ?? item.base_price) || 0;
      const vat = calculateVat(price, invoiceType === 'GST' ? item.tax_rate_percent : 0, getStoreVatInclusive());
      serviceTotal += isUaeStore() ? vat.taxable : price;
      if (isUaeStore()) serviceTax += vat.tax;
      return;
    }

    const rawRate = listRate(item);

    const isScrap = !!item.isScrap;

    const effectiveRate = resolveLinePrice(item, rawRate, isScrap ? 'scrap' : 'sale').unitRate;

    const qty = Number(item.quantity) || 0;
    const itemTotal = effectiveRate * qty;

    if (item.isScrap) {
      scrapTotal += itemTotal;
      return;
    }
    
    subtotal += itemTotal;

    if (invoiceType === 'GST') {
      if (isUaeStore()) {
        const vat = calculateVat(itemTotal, item.tax_rate_percent, getStoreVatInclusive());
        totalTax += vat.tax;
        subtotal += vat.taxable - itemTotal;
      } else totalTax += itemTotal * (item.tax_rate_percent / 100);
    } else if (invoiceType === 'BILL_OF_SUPPLY' && bosTaxRatePercent > 0) {
      if (bosTaxInclusive) {
        const rate = bosTaxRatePercent / 100;
        const tax = itemTotal * (rate / (1 + rate));
        totalTax += tax;
        subtotal -= tax;
      } else {
        totalTax += itemTotal * (bosTaxRatePercent / 100);
      }
    }
  });

  const discountableBase = subtotal;
  const calculatedDiscount = discountType === 'PERCENTAGE'
    ? (discountableBase * discountValue) / 100
    : discountValue;

  const effectiveDiscount = subtotal > 0 ? Math.min(calculatedDiscount, subtotal) : calculatedDiscount;
  const taxableAmount = subtotal - effectiveDiscount;

  const effectiveTaxRate = subtotal > 0 ? totalTax / subtotal : 0;
  const adjustedTax = taxableAmount * effectiveTaxRate + serviceTax;

  const isInterState = resolveSupplyType(invoiceType, shopState || '', customerState || '') === 'INTER';
  
  const hasTax = adjustedTax > 0;

  const taxSplit = !isUaeStore() && hasTax && !isInterState ? splitTaxAmount(adjustedTax) : null;
  const cgst = taxSplit?.cgst || 0;
  const sgst = taxSplit?.sgst || 0;
  const igst = !isUaeStore() && hasTax && isInterState ? adjustedTax : 0;

  const grandTotal = taxableAmount + adjustedTax + serviceTotal;

  const extraBonus = subtotal > 0 ? 0 : effectiveDiscount;

  const displayedSubtotal = subtotal + serviceTotal;

  return { subtotal: displayedSubtotal, cgst, sgst, igst, totalTax: adjustedTax, discount: effectiveDiscount, grandTotal, taxableAmount, scrapTotal, extraBonus, returnDeduction, serviceTotal };
};
