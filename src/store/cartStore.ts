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
  pieces_per_kg?: number;
  grade_id?: string;
  pricing_mode?: string;
  grade_rate?: number;
  discount_percent?: number | null;
  discount_flat?: number | null;
  offer_price?: number | null;
  sku_barcode?: string | null;
  brand_manufacturer?: string | null;
  isScrap?: boolean;
  scrap_category_id?: string;
}

export type InvoiceType = 'GST' | 'BILL_OF_SUPPLY';
export type UserRole = 'OWNER' | 'BILLER';
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
  isQuotationMode: boolean;
  editingQuotationId: string | null;
  editingQuotationNumber: string | null;
  editingInvoiceId: string | null;
  editingInvoiceNumber: string | null;
  editingInvoiceRole: 'OWNER' | 'BILLER' | null;

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
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
  setQuotationMode: (isQuotationMode: boolean) => void;
  setEditingQuotation: (quotationId: string | null, quotationNumber: string | null) => void;
  setEditingInvoice: (id: string | null, number: string | null, role: 'OWNER' | 'BILLER' | null) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      invoiceType: 'BILL_OF_SUPPLY',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'KL', // Default to same state (Kerala)
      shopState: 'KL', // Shop is in KL
      currentUserRole: 'OWNER',
      shopDomain: null,
      shopDomainConfirmed: false,
      scrapDeduction: 0,
      scrapInvoiceNumber: '',
      isQuotationMode: false,
      editingQuotationId: null,
      editingQuotationNumber: null,
      editingInvoiceId: null,
      editingInvoiceNumber: null,
      editingInvoiceRole: null,

      addItem: (newItem) =>
        set((state) => {
          const existingItem = state.items.find(i => i.product_id === newItem.product_id);
          if (existingItem) {
            return {
              items: state.items.map(i => {
                if (i.product_id === newItem.product_id) {
                  const delta = i.billing_type === 'WEIGHT' && !i.pieces_per_kg ? 0.1 : 1;
                  return { ...i, quantity: Number(i.quantity) + delta };
                }
                return i;
              }),
            };
          }
          return { items: [...state.items, { ...newItem, quantity: newItem.quantity ?? 1 }] };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter(i => i.product_id !== productId),
        })),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId ? { ...i, quantity } : i
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
      setQuotationMode: (isQuotationMode) => set({ isQuotationMode }),
      setEditingQuotation: (quotationId, quotationNumber) => set({ editingQuotationId: quotationId, editingQuotationNumber: quotationNumber }),
      setEditingInvoice: (id, number, role) => set({ editingInvoiceId: id, editingInvoiceNumber: number, editingInvoiceRole: role }),
      clearCart: () => set({ items: [], discountValue: 0, discountType: 'FIXED', invoiceType: 'BILL_OF_SUPPLY', customerState: 'KL', scrapDeduction: 0, scrapInvoiceNumber: '', isQuotationMode: false, editingQuotationId: null, editingQuotationNumber: null, editingInvoiceId: null, editingInvoiceNumber: null, editingInvoiceRole: null }),
    }),
    {
      name: 'vendora-cart-storage',
    }
  )
);

// Derived Selectors
export const useCartTotals = () => {
  const { items, invoiceType, discountType, discountValue, shopState, customerState } = useCartStore();

  let subtotal = 0;
  let totalTax = 0;
  let scrapTotal = 0;

  items.forEach(item => {
    if (item.isScrap) {
      const scrapAmount = item.base_price * (Number(item.quantity) || 0);
      scrapTotal += scrapAmount;
      return;
    }

    const rawRate = item.pricing_mode === 'GRADE_RATE' 
      ? (item.grade_rate || 0) 
      : item.base_price;

    let effectiveRate = rawRate;
    if (item.offer_price) {
      effectiveRate = Number(item.offer_price);
    } else if (item.discount_flat) {
      effectiveRate = rawRate - Number(item.discount_flat);
    } else if (item.discount_percent) {
      effectiveRate = rawRate * (1 - Number(item.discount_percent) / 100);
    }
    effectiveRate = Math.max(effectiveRate, 0);

    const qty = Number(item.quantity) || 0;
    const itemTotal = effectiveRate * qty;
    
    subtotal += itemTotal;

    if (invoiceType === 'GST') {
      totalTax += itemTotal * (item.tax_rate_percent / 100);
    }
  });

  const calculatedDiscount = discountType === 'PERCENTAGE'
    ? (subtotal * discountValue) / 100
    : discountValue;

  const effectiveDiscount = Math.min(calculatedDiscount, subtotal);
  const taxableAmount = subtotal - effectiveDiscount;

  const effectiveTaxRate = subtotal > 0 ? totalTax / subtotal : 0;
  const adjustedTax = taxableAmount * effectiveTaxRate;

  const isInterState = shopState !== customerState;
  
  const cgst = invoiceType === 'GST' && !isInterState ? adjustedTax / 2 : 0;
  const sgst = invoiceType === 'GST' && !isInterState ? adjustedTax / 2 : 0;
  const igst = invoiceType === 'GST' && isInterState ? adjustedTax : 0;

  const grandTotal = taxableAmount + adjustedTax;

  return { subtotal, cgst, sgst, igst, totalTax: adjustedTax, discount: effectiveDiscount, grandTotal, taxableAmount, scrapTotal };
};
