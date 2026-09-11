import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  grade_id?: string;
  pricing_mode?: string;
  grade_rate?: number;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  catalog_discount_percent?: number | null;
  catalog_discount_flat?: number | null;
  catalog_offer_price?: number | null;
  sku_barcode?: string | null;
  brand_manufacturer?: string | null;
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
  originalTaxAmount?: number;
  returnSourceInvoiceId?: string;
  returnSourceInvoiceNumber?: string;
  isCombo?: boolean;
  combo_id?: string;
  combo_items?: Array<{ product_id: string; quantity: number; product_name?: string }>;
  combo_price?: number;
  hsn_sac_code?: string | null;
}

export type InvoiceType = 'GST' | 'BILL_OF_SUPPLY';
export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'BILLER' | 'SUPER_ADMIN';
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
  returnRefundMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'ADJUST_BILL';
  editingQuotationId: string | null;
  editingQuotationNumber: string | null;
  editingInvoiceId: string | null;
  editingInvoiceNumber: string | null;
  editingInvoiceRole: 'OWNER' | 'ADMIN' | 'STAFF' | 'BILLER' | null;
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
  setReturnRefundMethod: (method: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'ADJUST_BILL') => void;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setEditingQuotation: (quotationId: string | null, quotationNumber: string | null) => void;
  setEditingInvoice: (id: string | null, number: string | null, role: 'OWNER' | 'BILLER' | null) => void;
  setPendingScrapInvoiceToEdit: (invoiceNumber: string | null) => void;
  setLastAddedProductId: (id: string | null) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      lastAddedProductId: null,
      invoiceType: 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'KL', // Default to same state (Kerala)
      shopState: 'KL', // Shop is in KL
      currentUserRole: 'OWNER',
      shopDomain: 'GENERAL',
      shopDomainConfirmed: true,
      scrapDeduction: 0,
      scrapInvoiceNumber: '',
      returnDeduction: 0,
      returnInvoiceNumber: '',
      isQuotationMode: false,
      isReturnMode: false,
      isScrapMode: false,
      returnRefundMethod: 'ADJUST_BILL',
      editingQuotationId: null,
      editingQuotationNumber: null,
      editingInvoiceId: null,
      editingInvoiceNumber: null,
      editingInvoiceRole: null,
      pendingScrapInvoiceToEdit: null,
      setPendingScrapInvoiceToEdit: (invoiceNumber) => set({ pendingScrapInvoiceToEdit: invoiceNumber }),
      setIsScrapMode: (isScrapMode) => set({ isScrapMode }),
      setLastAddedProductId: (id) => set({ lastAddedProductId: id }),

      addItem: (newItem) =>
        set((state) => {
          const existingItem = state.items.find(i => i.product_id === newItem.product_id);
          if (existingItem) {
            return {
              lastAddedProductId: newItem.product_id,
              items: state.items.map(i => {
                if (i.product_id === newItem.product_id) {
                  const delta = i.billing_type === 'WEIGHT' && !i.pieces_per_kg ? 0.1 : 1;
                  return { ...i, quantity: Number(i.quantity) + delta };
                }
                return i;
              }),
            };
          }
          const catalogDiscPct = newItem.catalog_discount_percent !== undefined ? newItem.catalog_discount_percent : (newItem.discount_percent ?? null);
          const catalogDiscFlat = newItem.catalog_discount_flat !== undefined ? newItem.catalog_discount_flat : (newItem.discount_flat ?? null);
          const catalogOfferPrice = newItem.catalog_offer_price !== undefined ? newItem.catalog_offer_price : (newItem.offer_price ?? null);
          return {
            lastAddedProductId: newItem.product_id,
            items: [
              ...state.items,
              {
                ...newItem,
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
              ? { ...i, offer_price: price, discount_percent: null, discount_flat: null }
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
      setReturnMode: (isReturnMode) => set({ isReturnMode }),
      setReturnRefundMethod: (returnRefundMethod) => set({ returnRefundMethod }),
      setQuotationMode: (isQuotationMode) => {
        set({ isQuotationMode });
        try {
          (window as any).useTabStore?.getState?.()?.syncActiveSnapshot?.();
        } catch {}
      },
      setEditingQuotation: (quotationId, quotationNumber) => set({ editingQuotationId: quotationId, editingQuotationNumber: quotationNumber }),
      setEditingInvoice: (id, number, role) => set({ editingInvoiceId: id, editingInvoiceNumber: number, editingInvoiceRole: role }),
      clearCart: () => set((state) => ({ items: [], lastAddedProductId: null, discountValue: 0, discountType: 'FIXED', invoiceType: state.invoiceType, customerState: 'KL', scrapDeduction: 0, scrapInvoiceNumber: '', returnDeduction: 0, returnInvoiceNumber: '', isQuotationMode: state.isQuotationMode, isReturnMode: state.isReturnMode, isScrapMode: state.isScrapMode, returnRefundMethod: 'ADJUST_BILL', editingQuotationId: null, editingQuotationNumber: null, editingInvoiceId: null, editingInvoiceNumber: null, editingInvoiceRole: null, pendingScrapInvoiceToEdit: null })),
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
  const { items, invoiceType, discountType, discountValue, shopState, customerState, returnDeduction } = useCartStore();

  let subtotal = 0;
  let totalTax = 0;
  let scrapTotal = 0;
  let serviceTotal = 0;

  items.forEach(item => {
    if (item.isServiceItem) {
      serviceTotal += Number(item.offer_price ?? item.base_price) || 0;
      return;
    }

    const rawRate = (item.pricing_mode === 'GRADE_RATE' && item.grade_rate != null && Number(item.grade_rate) > 0)
      ? Number(item.grade_rate)
      : Number(item.base_price || 0);

    const isScrap = !!item.isScrap;

    const catalogPrice = item.catalog_offer_price != null ? Number(item.catalog_offer_price)
      : item.catalog_discount_flat != null ? (isScrap ? rawRate + Number(item.catalog_discount_flat) : rawRate - Number(item.catalog_discount_flat))
      : item.catalog_discount_percent != null ? (isScrap ? rawRate * (1 + Number(item.catalog_discount_percent) / 100) : rawRate * (1 - Number(item.catalog_discount_percent) / 100))
      : rawRate;

    const isAdhocOffer = item.offer_price != null && (item.catalog_offer_price == null || item.offer_price !== item.catalog_offer_price);
    const isAdhocDiscFlat = item.discount_flat != null && (item.catalog_discount_flat == null || item.discount_flat !== item.catalog_discount_flat);
    const isAdhocDiscPct = item.discount_percent != null && (item.catalog_discount_percent == null || item.discount_percent !== item.catalog_discount_percent);

    let effectiveRate = catalogPrice;
    if (isAdhocOffer) {
      effectiveRate = Number(item.offer_price);
    } else if (isAdhocDiscFlat) {
      effectiveRate = item.isScrap ? catalogPrice + Number(item.discount_flat) : catalogPrice - Number(item.discount_flat);
    } else if (isAdhocDiscPct) {
      effectiveRate = item.isScrap ? catalogPrice * (1 + Number(item.discount_percent) / 100) : catalogPrice * (1 - Number(item.discount_percent) / 100);
    }
    effectiveRate = Math.max(effectiveRate, 0);

    const qty = Number(item.quantity) || 0;
    const itemTotal = effectiveRate * qty;

    if (item.isScrap) {
      scrapTotal += itemTotal;
      return;
    }
    
    subtotal += itemTotal;

    if (invoiceType === 'GST') {
      totalTax += itemTotal * (item.tax_rate_percent / 100);
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
  const adjustedTax = taxableAmount * effectiveTaxRate;

  const isInterState = shopState !== customerState;
  
  const hasTax = invoiceType === 'GST' || (invoiceType === 'BILL_OF_SUPPLY' && bosTaxRatePercent > 0);

  const cgst = hasTax && !isInterState ? adjustedTax / 2 : 0;
  const sgst = hasTax && !isInterState ? adjustedTax / 2 : 0;
  const igst = hasTax && isInterState ? adjustedTax : 0;

  const grandTotal = taxableAmount + adjustedTax + serviceTotal;

  const extraBonus = subtotal > 0 ? 0 : effectiveDiscount;

  const displayedSubtotal = subtotal + serviceTotal;

  return { subtotal: displayedSubtotal, cgst, sgst, igst, totalTax: adjustedTax, discount: effectiveDiscount, grandTotal, taxableAmount, scrapTotal, extraBonus, returnDeduction, serviceTotal };
};
