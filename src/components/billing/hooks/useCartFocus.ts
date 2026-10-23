import React, { useCallback } from 'react';
import type { CartItem, InvoiceType } from '../../../store/cartStore';
import type { CustomerFieldState } from './useCustomerFieldState';

export interface UseCartFocusContext {
  customerFields: CustomerFieldState;
  activeCartProductIdRef: React.RefObject<string | null>;
  descriptionInputRef: React.RefObject<HTMLInputElement | null>;
  discFlatRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  discountRef: React.RefObject<HTMLInputElement | null>;
  discRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  invoiceType: InvoiceType;
  items: CartItem[];
  kRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  lastAddedProductId: string | null;
  pcsRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  qtyRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  rateKgRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  ratePcRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setFocusedRowProductId: React.Dispatch<React.SetStateAction<string | null>>;
  showDescriptionState: boolean;
  tierRefs: React.RefObject<Record<string, HTMLSelectElement | null>>;
  totalInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
}

/**
 * Focus movement in the billing cart: first / last / next / previous editable field of a line, rate up/down between
 * lines, back into the customer fields, and to the bill description or discount. Memoised as before (useCallback).
 */
export function useCartFocus(ctx: UseCartFocusContext) {
  const { activeCartProductIdRef, descriptionInputRef, discFlatRefs, discountRef, discRefs, invoiceType, items, kRefs, lastAddedProductId, pcsRefs, qtyRefs, rateKgRefs, ratePcRefs, searchRef, setFocusedRowProductId, showDescriptionState, tierRefs, totalInputRefs } = ctx;
  const { customerGstinInputRef, customerAddressInputRef, customerPhoneInputRef, customerNameInputRef } = ctx.customerFields;
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
  }, [activeCartProductIdRef, discFlatRefs, discRefs, kRefs, pcsRefs, qtyRefs, rateKgRefs, ratePcRefs, setFocusedRowProductId, tierRefs, totalInputRefs]);

  const focusFirstCartField = useCallback((pidOverride?: string): boolean => {
    if (items.length === 0) return false;
    const targetPid = pidOverride || activeCartProductIdRef.current || lastAddedProductId || items[0]?.product_id;
    if (!targetPid) return false;
    const order = ['pcs', 'qty', 'rate', 'discount', 'discountFlat', 'grandTotal'];
    for (const f of order) {
      if (focusCartField(f, targetPid)) return true;
    }
    return false;
  }, [items, lastAddedProductId, focusCartField, activeCartProductIdRef]);

  const focusLastCartField = useCallback((pidOverride?: string): boolean => {
    if (items.length === 0) return false;
    const targetPid = pidOverride || activeCartProductIdRef.current || lastAddedProductId || items[items.length - 1]?.product_id;
    if (!targetPid) return false;
    const order = ['grandTotal', 'tier', 'discountFlat', 'discount', 'rate', 'qty', 'pcs'];
    for (const f of order) {
      if (focusCartField(f, targetPid)) return true;
    }
    return false;
  }, [items, lastAddedProductId, focusCartField, activeCartProductIdRef]);

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
  }, [focusCartField, activeCartProductIdRef, searchRef]);

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
  }, [focusCartField, activeCartProductIdRef, searchRef]);

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
  }, [invoiceType, customerNameInputRef, customerPhoneInputRef, customerAddressInputRef, customerGstinInputRef]);

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
  }, [items, qtyRefs, rateKgRefs, ratePcRefs, searchRef]);

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
  }, [showDescriptionState, descriptionInputRef, discountRef]);

  return { focusCartField, focusFirstCartField, focusLastCartField, focusNextCartField, focusPrevCartField, focusCustomerFieldsReverse, handleRateUpDown, focusDescriptionOrDiscount };
}
