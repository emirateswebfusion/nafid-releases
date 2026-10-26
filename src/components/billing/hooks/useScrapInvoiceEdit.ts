import React, { useEffect, useCallback } from 'react';
import { useCartStore } from '../../../store/cartStore';
import { isDesktopRuntime } from '../../../data/client';
import { scrapApi } from '../../../data/scrap';
import { v4 as uuidv4 } from 'uuid';
import type { Tab } from '../../../store/tabStore';
import type { CartItem } from '../../../store/cartStore';
import type { Invoice } from '../../../data/invoices';

export interface UseScrapInvoiceEditContext {
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number; }) => void;
  clearCart: () => void;
  clearScrapDeduction: () => void;
  editingInvoiceNumber: string | null;
  getActiveTab: () => Tab | undefined;
  isScrapMode: boolean;
  setDiscount: (value: number, type: "FIXED" | "PERCENTAGE") => void;
  setIsPastBillMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScrapMode: (isScrapMode: boolean) => void;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setReturnMode: (isReturnMode: boolean) => void;
  setSelectedReturnInvoice: React.Dispatch<React.SetStateAction<Partial<Invoice> | null>>;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * Editing a saved scrap invoice: load it into the cart (`loadScrapInvoiceForEdit`), including when another screen asks
 * for it through the cart store (`pendingScrapInvoiceToEdit`), and keep the tab titled with the invoice number.
 */
export function useScrapInvoiceEdit(ctx: UseScrapInvoiceEditContext) {
  const { addItem, clearCart, clearScrapDeduction, editingInvoiceNumber, getActiveTab, isScrapMode, setDiscount, setIsPastBillMode, setIsScrapMode, setQuotationMode, setReturnMode, setSelectedReturnInvoice, syncActiveSnapshot, tenantId, updateActiveTab } = ctx;
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
    if (!invNum || !isDesktopRuntime()) return;
    const tid = tenantId || 'global';
    const detail = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tid, scrap_invoice_number: invNum });
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
    detail.transactions.forEach((tx) => {
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
  }, [tenantId, clearCart, addItem, updateActiveTab, setReturnMode, setQuotationMode, clearScrapDeduction, setDiscount, setIsPastBillMode]);

  useEffect(() => {
    if (pendingScrapInvoiceToEdit) {
      const invNum = pendingScrapInvoiceToEdit;
      useCartStore.getState().setPendingScrapInvoiceToEdit(null);
      updateActiveTab({ title: invNum, reservedScrapInvoiceNumber: invNum });
      loadScrapInvoiceForEdit(invNum);
    }
  }, [pendingScrapInvoiceToEdit, loadScrapInvoiceForEdit, updateActiveTab]);

  return { loadScrapInvoiceForEdit };
}
