import React, { useCallback } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { v4 as uuidv4 } from 'uuid';
import { listRate, resolveLinePrice } from '../../../utils/linePricing';
import type { CartItem, InvoiceType } from '../../../store/cartStore';
import type { PaymentMethod, SplitDetails, Tab } from '../../../store/tabStore';

export interface UseHeldBillsContext {
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number; }) => void;
  balanceAmount: number;
  clearCart: () => void;
  currentSelectedUpi: { upi_id?: string; name?: string; source_id?: string } | null | undefined;
  customerAddress: string;
  customerGstin: string;
  customerName: string;
  customerPhone: string;
  customerState: string;
  discount: number;
  discountType: "FIXED" | "PERCENTAGE";
  discountValue: number;
  grandTotal: number;
  invoiceType: InvoiceType;
  isCashSettlementEnabled: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  rawSplitDetails: SplitDetails | undefined;
  receivedAmount: number;
  setCustomerState: (state: string) => void;
  setDiscount: (value: number, type: "FIXED" | "PERCENTAGE") => void;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setHeldBills: React.Dispatch<React.SetStateAction<unknown[]>>;
  setHeldBillsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setInfoToast: React.Dispatch<React.SetStateAction<string | null>>;
  setInvoiceType: (type: InvoiceType) => void;
  setShowHeldBillsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  splitDetails: SplitDetails;
  subtotal: number;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
  totalTax: number;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
  updatePiecesOverride: (productId: string, pieces: number | undefined) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
  userId: string | null;
}

/**
 * Held bills: list (`loadHeldBills`), hold the active cart (F3), recall a held bill into the cart and release one.
 * Desktop stores them as held invoices; the browser build keeps them in localStorage for 24 hours.
 */
export function useHeldBills(ctx: UseHeldBillsContext) {
  const { addItem, balanceAmount, clearCart, currentSelectedUpi, customerAddress, customerGstin, customerName, customerPhone, customerState, discount, discountType, discountValue, grandTotal, invoiceType, isCashSettlementEnabled, isQuotationMode, isReturnMode, isScrapMode, items, paymentMethod, rawSplitDetails, receivedAmount, setCustomerState, setDiscount, setHardwareError, setHeldBills, setHeldBillsLoading, setInfoToast, setInvoiceType, setShowHeldBillsPanel, splitDetails, subtotal, syncActiveSnapshot, tenantId, totalTax, updateActiveTab, updatePiecesOverride, updateQuantity, userId } = ctx;
  // Load active held bills from backend
  const loadHeldBills = useCallback(async () => {
    if (!isDesktopRuntime()) {
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
      const bills = await invoicesApi.getHeldBills({ tenant_id: tenantId || 'global' });
      if (Array.isArray(bills)) {
        setHeldBills(bills);
      }
    } catch (e) {
      console.error('Failed to load held bills', e);
    } finally {
      setHeldBillsLoading(false);
    }
  }, [tenantId, setHeldBills, setHeldBillsLoading]);

  // Rewrite handleHoldBill to save to backend
  const handleHoldBill = async () => {
    if (items.length === 0) return;
    // Don't allow holding in scrap or return mode
    if (isScrapMode || isReturnMode || isQuotationMode) return;
    if (!isDesktopRuntime()) {
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
      const rate = listRate(item);
      const qty = Number(item.quantity) || 0;
      const effectiveRateInfo = resolveLinePrice(item, rate);
      const effectiveRate = effectiveRateInfo.unitRate;
      const itemTotal = effectiveRate * qty;
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

    const result = await invoicesApi.holdBill({
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
    if (!isDesktopRuntime()) {
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
      const result = await invoicesApi.recallHeldBill({ invoice_id: targetId });
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
            } catch { /* ignore */ }
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
    if (!isDesktopRuntime()) {
      const stored = JSON.parse(localStorage.getItem('vendora-held-bills') || '[]');
      const remaining = stored.filter((b: any) => b.id !== invoiceId);
      localStorage.setItem('vendora-held-bills', JSON.stringify(remaining));
      setHeldBills(remaining);
      return;
    }
    try {
      const result = await invoicesApi.releaseHeldBill({ invoice_id: invoiceId });
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

  return { loadHeldBills, handleHoldBill, handleRecallHeldBill, handleReleaseHeldBill };
}
