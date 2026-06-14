import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  product_id: string;
  name: string;
  base_price: number;
  purchase_price: number;
  tax_rate_percent: number;
  quantity: number | string;
  billing_type?: string;
  grade_id?: string;
  pricing_mode?: string;
  average_weight_per_piece?: number;
  weight_override_allowed?: boolean | number;
  calculated_weight?: number;
  grade_rate?: number;
}

export type InvoiceType = 'GST' | 'BILL_OF_SUPPLY';
export type UserRole = 'OWNER' | 'CASHIER';
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

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
  updateWeight: (productId: string, weight: number) => void;
  setDiscount: (value: number, type: 'FIXED' | 'PERCENTAGE') => void;
  setInvoiceType: (type: InvoiceType) => void;
  setCustomerState: (state: string) => void;
  setRole: (role: UserRole) => void;
  setDomain: (domain: ShopDomain) => void;
  confirmDomain: () => void;
  resetDomainConfirmation: () => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      invoiceType: 'GST',
      discountType: 'FIXED',
      discountValue: 0,
      customerState: 'MH', // Default to same state (Maharashtra)
      shopState: 'MH', // Shop is in MH
      currentUserRole: 'OWNER', // Default to OWNER for demo
      shopDomain: null,
      shopDomainConfirmed: false,

      addItem: (newItem) =>
        set((state) => {
          const existingItem = state.items.find(i => i.product_id === newItem.product_id);
          if (existingItem) {
            return {
              items: state.items.map(i => {
                if (i.product_id === newItem.product_id) {
                  const newQuantity = Number(i.quantity) + 1;
                  const newWeight = i.billing_type === 'WEIGHT' && i.average_weight_per_piece 
                    ? newQuantity * i.average_weight_per_piece 
                    : i.calculated_weight;
                  return { ...i, quantity: newQuantity, calculated_weight: newWeight };
                }
                return i;
              }),
            };
          }
          const initialWeight = newItem.billing_type === 'WEIGHT' && newItem.average_weight_per_piece
            ? 1 * newItem.average_weight_per_piece
            : undefined;
          return { items: [...state.items, { ...newItem, quantity: 1, calculated_weight: initialWeight }] };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter(i => i.product_id !== productId),
        })),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map(i => {
            if (i.product_id === productId) {
               const newWeight = i.billing_type === 'WEIGHT' && i.average_weight_per_piece 
                    ? Number(quantity) * i.average_weight_per_piece 
                    : i.calculated_weight;
               return { ...i, quantity, calculated_weight: newWeight };
            }
            return i;
          }),
        })),
        
      updateWeight: (productId, weight) =>
        set((state) => ({
          items: state.items.map(i =>
            i.product_id === productId ? { ...i, calculated_weight: weight } : i
          ),
        })),

      setDiscount: (value, type) => set({ discountValue: value, discountType: type }),
      setInvoiceType: (invoiceType) => set({ invoiceType }),
      setCustomerState: (customerState) => set({ customerState }),
      setRole: (role) => set({ currentUserRole: role }),
      setDomain: (domain) => set({ shopDomain: domain }),
      confirmDomain: () => set({ shopDomainConfirmed: true }),
      resetDomainConfirmation: () => set({ shopDomainConfirmed: false }),
      clearCart: () => set({ items: [], discountValue: 0, discountType: 'FIXED' }),
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

  items.forEach(item => {
    const effectiveRate = item.pricing_mode === 'GRADE_RATE' 
      ? item.base_price + (item.grade_rate || 0) 
      : item.base_price;
      
    const itemTotal = item.billing_type === 'WEIGHT'
      ? effectiveRate * (item.calculated_weight || 0)
      : effectiveRate * (Number(item.quantity) || 0);
    
    subtotal += itemTotal;

    if (invoiceType === 'GST') {
      totalTax += itemTotal * (item.tax_rate_percent / 100);
    }
  });

  const isInterState = shopState !== customerState;
  
  const cgst = invoiceType === 'GST' && !isInterState ? totalTax / 2 : 0;
  const sgst = invoiceType === 'GST' && !isInterState ? totalTax / 2 : 0;
  const igst = invoiceType === 'GST' && isInterState ? totalTax : 0;

  const calculatedDiscount = discountType === 'PERCENTAGE'
    ? (subtotal * discountValue) / 100
    : discountValue;

  const grandTotal = subtotal + totalTax - calculatedDiscount;

  return { subtotal, cgst, sgst, igst, totalTax, discount: calculatedDiscount, grandTotal };
};
