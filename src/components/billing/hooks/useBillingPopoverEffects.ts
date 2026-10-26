import type * as B from '../billingTypes';
import React, { useEffect } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { productsApi } from '../../../data/products';
import type { ProductSearchResult } from '../productSearch';
import type { Invoice } from '../../../data/invoices';

export interface UseBillingPopoverEffectsContext {
  editingProductId: string | null;
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  gradeFormDialogRef: React.RefObject<HTMLDivElement | null>;
  productFormDialogRef: React.RefObject<HTMLDivElement | null>;
  returnDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  scrapDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  searchContainerRef: React.RefObject<HTMLDivElement | null>;
  setNewProductBarcode: React.Dispatch<React.SetStateAction<string>>;
  setPastBillResults: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setResults: React.Dispatch<React.SetStateAction<ProductSearchResult[]>>;
  setReturnDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  setReturnDeductionResults: React.Dispatch<React.SetStateAction<B.ReturnDeductionRow[]>>;
  setScrapDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  setScrapDeductionResults: React.Dispatch<React.SetStateAction<B.ScrapDeductionRow[]>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setShowProductCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
  showProductCreateForm: boolean;
  tenantId: string | null;
}

/** Closes the search, past-bill and deduction dropdowns on outside clicks, and focuses / resets the product create form. */
export function useBillingPopoverEffects(ctx: UseBillingPopoverEffectsContext) {
  const { editingProductId, firstInputRef, gradeFormDialogRef, productFormDialogRef, returnDeductionInputRef, scrapDeductionInputRef, searchContainerRef, setNewProductBarcode, setPastBillResults, setResults, setReturnDeductionDropdownStyle, setReturnDeductionResults, setScrapDeductionDropdownStyle, setScrapDeductionResults, setSearchQuery, setShowProductCreateForm, showProductCreateForm, tenantId } = ctx;
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
  }, [searchContainerRef, setPastBillResults, setResults, setSearchQuery, gradeFormDialogRef, productFormDialogRef, setShowProductCreateForm, setReturnDeductionDropdownStyle, setReturnDeductionResults, setScrapDeductionDropdownStyle, setScrapDeductionResults]);

  useEffect(() => {
    if (!showProductCreateForm) return;

    const focusTimer = window.setTimeout(() => firstInputRef.current?.focus(), 50);
    let cancelled = false;

    // Editing must preserve the barcode belonging to the selected cart product.
    // Barcode generation here is only a convenience for a new product.
    if (!editingProductId && isDesktopRuntime() && tenantId) {
      (async () => {
        try {
          const gen = await productsApi.generateBarcode({ tenant_id: tenantId });
          if (!cancelled && gen?.success && gen?.barcode) {
            setNewProductBarcode(gen.barcode);
          }
        } catch (err) {
          console.error("Failed to generate auto barcode", err);
        }
      })();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
    };
  }, [showProductCreateForm, editingProductId, tenantId, firstInputRef, setNewProductBarcode]);

}
