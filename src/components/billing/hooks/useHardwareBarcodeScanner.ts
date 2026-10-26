import React, { useEffect } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { bridgeEvents } from '../../../data/events';
import { listInvoices } from '../../../data/invoices';
import { listProducts } from '../../../data/products';
import type { Invoice } from '../../../data/invoices';
import type { ProductSearchResult } from '../productSearch';
import type { CartItem } from '../../../store/cartStore';

export interface UseHardwareBarcodeScannerContext {
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number; }) => void;
  handleSelectPastBill: (invoice: Invoice) => Promise<void>;
  handleSelectProduct: (product: ProductSearchResult) => void;
  handleSelectReturnInvoice: (inv: Invoice) => Promise<void>;
  isPastBillMode: boolean;
  isReturnMode: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setPastBillResults: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setResults: React.Dispatch<React.SetStateAction<ProductSearchResult[]>>;
  setReturnSearchResults: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  syncActiveSnapshot: () => void;
  tenantId: string | null;
}

/**
 * Hardware barcode scanner on the billing screen: depending on the mode, a scan finds the bill to return or to load as
 * a past bill, or adds the scanned product to the cart (with a short beep).
 * `tenantId as string` casts are type-only (the page passed the same value; the main process falls back to the session tenant).
 */
export function useHardwareBarcodeScanner(ctx: UseHardwareBarcodeScannerContext) {
  const { addItem, handleSelectPastBill, handleSelectProduct, handleSelectReturnInvoice, isPastBillMode, isReturnMode, searchRef, setHardwareError, setPastBillResults, setResults, setReturnSearchResults, setSearchQuery, syncActiveSnapshot, tenantId } = ctx;
  // Past bill selection: load selected invoice into cart for editing

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    const playBeep = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
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

    const unsubscribe = bridgeEvents.onBarcodeScanned(async (code: string) => {
      if (!code) return;
      console.log("[BillingPage] Barcode scanned from hardware:", code);
      
      // Determine what mode we are in
      if (isReturnMode) {
        // Search invoices for returns
        try {
          const invoices = await listInvoices({ tenant_id: tenantId as string, search: code });
          if (Array.isArray(invoices) && invoices.length > 0) {
            // Find an exact match by invoice number
            const exactMatch = invoices.find((inv) => inv.invoice_number === code);
            if (exactMatch) {
              handleSelectReturnInvoice(exactMatch);
              playBeep();
            } else {
              setSearchQuery(code);
              setReturnSearchResults(invoices.filter((inv) => inv.invoice_type !== 'SCRAP' && inv.invoice_type !== 'RETURN'));
            }
          }
        } catch (e) {
          console.error("Failed to search invoices for return barcode:", e);
        }
      } else if (isPastBillMode) {
        // Search past bills by invoice number
        try {
          const invoices = await listInvoices({ tenant_id: tenantId as string, search: code });
          if (Array.isArray(invoices) && invoices.length > 0) {
            const exactMatch = invoices.find((inv) => inv.invoice_number === code);
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
          const products = await listProducts({ tenant_id: tenantId as string, barcode: code });
          if (Array.isArray(products) && products.length > 0) {
            handleSelectProduct(products[0]);
            playBeep();
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
  }, [tenantId, isReturnMode, isPastBillMode, addItem, handleSelectReturnInvoice, handleSelectPastBill, syncActiveSnapshot, setPastBillResults, setResults, setReturnSearchResults, setSearchQuery]);

}
