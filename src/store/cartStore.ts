import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  product_id: string;
  name: string;
  base_price: number;
  purchase_price: number;
  tax_rate_percent: number;
  quantity: number | string;
}

export type InvoiceType = 'GST' | 'BILL_OF_SUPPLY';
export type UserRole = 'OWNER' | 'CASHIER';
export type ShopDomain = 'GENERAL' | 'HARDWARE' | 'JEWELRY' | 'GROCERY';

interface CartState {
  items: CartItem[];
  invoiceType: InvoiceType;
  discount: number;
  customerState: string;
  shopState: string;
  currentUserRole: UserRole;
  shopDomain: ShopDomain | null;
  shopDomainConfirmed: boolean;

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
  setDiscount: (discount: number) => void;
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
      discount: 0,
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
              items: state.items.map(i =>
                i.product_id === newItem.product_id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...newItem, quantity: 1 }] };
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

      setDiscount: (discount) => set({ discount }),
      setInvoiceType: (invoiceType) => set({ invoiceType }),
      setCustomerState: (customerState) => set({ customerState }),
      setRole: (role) => set({ currentUserRole: role }),
      setDomain: (domain) => set({ shopDomain: domain }),
      confirmDomain: () => set({ shopDomainConfirmed: true }),
      resetDomainConfirmation: () => set({ shopDomainConfirmed: false }),
      clearCart: () => set({ items: [], discount: 0 }),
    }),
    {
      name: 'vendora-cart-storage',
    }
  )
);

// Derived Selectors
export const useCartTotals = () => {
  const { items, invoiceType, discount, shopState, customerState } = useCartStore();

  let subtotal = 0;
  let totalTax = 0;

  items.forEach(item => {
    const itemTotal = item.base_price * (Number(item.quantity) || 0);
    subtotal += itemTotal;

    if (invoiceType === 'GST') {
      totalTax += itemTotal * (item.tax_rate_percent / 100);
    }
  });

  const isInterState = shopState !== customerState;
  
  const cgst = invoiceType === 'GST' && !isInterState ? totalTax / 2 : 0;
  const sgst = invoiceType === 'GST' && !isInterState ? totalTax / 2 : 0;
  const igst = invoiceType === 'GST' && isInterState ? totalTax : 0;

  const grandTotal = subtotal + totalTax - discount;

  return { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal };
};
