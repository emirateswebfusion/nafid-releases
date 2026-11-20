import { priceReturnSource } from '../../../utils/pricing/returnPricing';
import { calculateComboTaxBreakdown, type ComboConstituent } from '../../../utils/pricing/comboTax';
import type * as B from '../billingTypes';
import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { getInvoiceItems, listInvoices } from '../../../data/invoices';
import { returnsApi } from '../../../data/returns';
import { getProductsByIds, listProducts } from '../../../data/products';
import { v4 as uuidv4 } from 'uuid';
import type { ProductSearchResult } from '../productSearch';
import type { Invoice } from '../../../data/invoices';
import type { Tab } from '../../../store/tabStore';
import type { CartItem } from '../../../store/cartStore';
import type { PricingTier } from '../../../utils/pricing/pricingTierHelper';
import type { ProductSearchState } from './useProductSearchState';
import type { CustomerFieldState } from './useCustomerFieldState';

/** What the search-selection handlers read from the billing screen. */
export interface UseSearchSelectionContext {
  productSearch: ProductSearchState;
  customerFields: CustomerFieldState;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number; }) => void;
  authRole: "ADMIN" | "SUPER_ADMIN" | "STAFF" | null;
  clearCart: () => void;
  focusCustomerFieldsReverse: () => void;
  focusFirstCartField: (pidOverride?: string) => boolean;
  focusLastCartField: (pidOverride?: string) => boolean;
  getTierPriceForProduct: (product: Pick<ProductSearchResult, 'product_id'> & Pick<B.BillingProduct, 'tier_prices'>) => number | undefined;
  isReturnMode: boolean;
  isScrapMode: boolean;
  items: CartItem[];
  pcsRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  pendingFocusProductIdRef: React.RefObject<string | null>;
  pricingTiers: PricingTier[];
  qtyRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  rateKgRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  ratePcRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  selectedTierId: string;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setNewProductName: React.Dispatch<React.SetStateAction<string>>;
  setReturnMode: (isReturnMode: boolean) => void;
  setReturnRefundMethod: (method: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT" | "ADJUST_BILL" | "CREDIT") => void;
  setSelectedReturnInvoice: React.Dispatch<React.SetStateAction<Partial<Invoice> | null>>;
  setShowProductCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
  showProductCreateForm: boolean;
  tenantId: string | null;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * Choosing a row from the billing search dropdown (product, combo, scrap category, returnable invoice, past bill)
 * and the search box's keyboard handling. Rebuilt every render; owns no React state.
 */
export function useSearchSelection(ctx: UseSearchSelectionContext) {
  const { addItem, authRole, clearCart, focusCustomerFieldsReverse, focusFirstCartField, focusLastCartField, getTierPriceForProduct, isReturnMode, isScrapMode, items, pcsRefs, pendingFocusProductIdRef, pricingTiers, qtyRefs, rateKgRefs, ratePcRefs, reserveReturnNumberForTab, selectedTierId, setHardwareError, setNewProductName, setReturnMode, setReturnRefundMethod, setSelectedReturnInvoice, setShowProductCreateForm, showProductCreateForm, tenantId, updateActiveTab } = ctx;
  const { setSearchQuery, setResults, setScrapSearchResults, setReturnSearchResults, setPastBillResults, setIsPastBillMode, scrapSearchResults, isPastBillMode, pastBillResults, results, setSelectedIndex, searchQuery, selectedIndex, returnSearchResults } = ctx.productSearch;
  const { customerNameInputRef } = ctx.customerFields;

  const handleSelectProduct = (product: B.BillingProduct) => {
    if (product?.isCombo) {
      const constituents = (product.combo_items || []) as ComboConstituent[];
      const breakdown = calculateComboTaxBreakdown({
        comboPrice: Number(product.combo_price) || 0,
        quantity: 1,
        constituents,
      });
      addItem({
        product_id: product.product_id,
        name: product.name,
        base_price: product.combo_price as number,
        purchase_price: 0,
        tax_rate_percent: breakdown.effectiveTaxRate,
        uom: 'Combo',
        billing_type: 'PIECE',
        sku_barcode: product.sku_barcode || null,
        isCombo: true,
        combo_id: product.combo_id,
        combo_price: product.combo_price,
        combo_items: product.combo_items,
        quantity: 1,
      });
      setSearchQuery('');
      setResults([]);
      pendingFocusProductIdRef.current = product.product_id;
      return;
    }

    let piecesPerKg;
    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    const isWeightProduct = product.billing_type === 'WEIGHT' || weightUoms.includes((product.uom || '').toLowerCase());
    const effectiveBillingType: 'WEIGHT' | 'PIECE' = isWeightProduct ? 'WEIGHT' : 'PIECE';

    if (isWeightProduct && product.domain_attributes) {
      try {
        const da = typeof product.domain_attributes === 'string'
          ? JSON.parse(product.domain_attributes)
          : product.domain_attributes;
        const storedPpk = Number(da.pcs_per_kg) || 0;
        const totalPcs = Number(da.pcs) || 0;
        const stockKg = Number(product.current_stock) || 0;
        // Prefer stored ratio; fall back to pcs count even when stock is 0/negative
        piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
      } catch {
        piecesPerKg = 1;
      }
    } else if (isWeightProduct) {
      piecesPerKg = 1;
    }
    const tierPrice = getTierPriceForProduct(product);
    const hasTierPrice = tierPrice != null;
    addItem({
      product_id: product.product_id,
      name: product.name,
      base_price: tierPrice ?? product.base_price,
      purchase_price: product.pricing_mode === 'GRADE_RATE' && product.grade_purchase_price !== undefined && product.grade_purchase_price !== null
        ? Number(product.grade_purchase_price)
        : (product.purchase_price ?? 0),
      tax_rate_percent: Number(product.tax_rate_percent ?? (product as B.BillingProduct).gst_percent ?? 0),
      hsn_sac_code: product.hsn_sac_code || (product as B.BillingProduct).hsn_code || (product as B.BillingProduct).hsn || null,
      is_gst_applicable: (product as B.BillingProduct).is_gst_applicable !== 0,
      uom: product.uom as string,
      billing_type: effectiveBillingType,
      pieces_per_kg: piecesPerKg,
      grade_id: product.grade_id ?? null as unknown as string,
      pricing_mode: tierPrice != null ? 'FIXED_PRICE' : product.pricing_mode as string,
      grade_rate: product.grade_rate ?? null as unknown as number,
      original_pricing_mode: product.pricing_mode as string,
      original_grade_id: product.grade_id ?? null as unknown as string,
      original_grade_rate: product.grade_rate ?? null as unknown as number,
      discount_percent: hasTierPrice ? null : (product.discount_percent ?? null),
      discount_flat: hasTierPrice ? null : (product.discount_flat ?? null),
      offer_price: hasTierPrice ? null : (product.offer_price ?? null),
      catalog_discount_percent: hasTierPrice ? null : (product.catalog_discount_percent !== undefined ? product.catalog_discount_percent : (product.discount_percent ?? null)),
      catalog_discount_flat: hasTierPrice ? null : (product.catalog_discount_flat !== undefined ? product.catalog_discount_flat : (product.discount_flat ?? null)),
      catalog_offer_price: hasTierPrice ? null : (product.catalog_offer_price !== undefined ? product.catalog_offer_price : (product.offer_price ?? null)),
      sku_barcode: product.sku_barcode || null,
      brand_manufacturer: product.brand_manufacturer || null,
      isServiceItem: Number(product.is_service_item) ? true : undefined,
      pricing_tier_id: selectedTierId || null,
      pricing_tier_name: pricingTiers.find(t => t.pricing_tier_id === selectedTierId)?.name || null,
      original_base_price: product.base_price,
      is_tier_overridden: false,
    });
    setSearchQuery('');
    setResults([]);
    pendingFocusProductIdRef.current = product.product_id;
    setTimeout(() => {
      const pid = product.product_id;
      const input = pcsRefs.current[pid] || qtyRefs.current[pid] || ratePcRefs.current[pid] || rateKgRefs.current[pid];
      if (input) {
        input.focus();
        input.select();
        pendingFocusProductIdRef.current = null;
      }
    }, 50);
  };

  const handleSelectScrapItem = (cat: import('../productSearch').ScrapCategoryResult) => {
    const rate = Number(cat.purchase_price ?? cat.rate ?? cat.selling_price) || 0;
    const scrapProdId = `SCRAP-${cat.scrap_category_id}`;
    const existing = items.find(i => i.product_id === scrapProdId || (i.isScrap && i.scrap_category_id === cat.scrap_category_id));
    const targetId = existing ? existing.product_id : scrapProdId;

    addItem({
      product_id: targetId,
      name: cat.name,
      base_price: rate,
      purchase_price: rate,
      tax_rate_percent: 0,
      uom: cat.unit || 'Kg',
      unit: cat.unit || 'Kg',
      billing_type: 'WEIGHT',
      isScrap: true,
      scrap_category_id: cat.scrap_category_id,
      quantity: existing ? (Number(existing.quantity) || 0) + 1 : 1,
    });
    setSearchQuery('');
    setScrapSearchResults([]);
    pendingFocusProductIdRef.current = targetId;
    setTimeout(() => {
      const input = qtyRefs.current[targetId];
      if (input) {
        input.focus();
        input.select();
        pendingFocusProductIdRef.current = null;
      }
    }, 50);
  };

  const handleSelectReturnInvoice = async (inv: B.BillingInvoice) => {
    if (!isDesktopRuntime()) return;
    setSearchQuery('');
    setReturnSearchResults([]);
    setSelectedReturnInvoice(inv);
    try {
      const [rawItems, returnedQtys] = await Promise.all([
        getInvoiceItems(inv.invoice_id as string),
        returnsApi.getAlreadyReturnedQuantities(inv.invoice_id as string),
      ]);
      const returnedMap: Record<string, number> = {};
      (returnedQtys || []).forEach((r) => {
        returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
      });
      const invSubtotal = Number(inv.subtotal) || (rawItems || []).reduce((s: number, i) => s + (Number(i.unit_price) * Number(i.quantity)), 0);
      const invDiscount = (Number(inv.discount_total) || 0) + (Number(inv.points_redeemed_discount) || 0);
      const enriched = (rawItems || []).map((item) => ({
        ...item,
        ...priceReturnSource(Number(item.unit_price) || 0, Number(item.tax_amount) || 0, invSubtotal, invDiscount),
        already_returned: returnedMap[item.item_id] || 0,
        available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
      })).filter((item) => item.available_to_return > 0);

      if (enriched.length === 0) {
        setSelectedReturnInvoice(null);
        setHardwareError(`Invoice ${inv.invoice_number} has already been fully returned. No items left to return.`);
        return;
      }

      // Pre-fill customer info from selected return invoice
      updateActiveTab({
        customerName: inv.customer_name || '',
        customerPhone: inv.customer_phone || '',
        customerGstin: inv.customer_gstin || '',
        customerAddress: inv.customer_address || '',
      });

      // Clear cart first, reserve return number, and set return mode
      clearCart();
      await reserveReturnNumberForTab();
      setReturnMode(true);

      const invPm = (inv.payment_method || '').toUpperCase();
      let invSplitCredit = 0;
      if (inv.split_details) {
        try {
          const s = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
          invSplitCredit = Number(s?.credit) || 0;
        } catch { /* ignore */ }
      }
      const isCreditInv = invPm === 'CREDIT' || invSplitCredit > 0 || (Number(inv.balance_amount) > 0 && invPm !== 'CASH');
      setReturnRefundMethod(isCreditInv ? 'CREDIT' : 'ADJUST_BILL');

      // Enrich with catalog product details if available
      const productIds: string[] = [...new Set((enriched || []).map((i) => i.product_id).filter(Boolean))];
      const productMap: Record<string, B.BillingProduct> = {};
      if (productIds.length > 0) {
        try {
          const prods = await getProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
          if (Array.isArray(prods)) { prods.forEach((p) => { productMap[p.product_id] = p; }); }
        } catch { /* ignore */ }
      }

      enriched.forEach((item: B.BillingInvoiceItem) => {
        const catProd = productMap[item.product_id];
        const productId = item.product_id || `return-${uuidv4()}`;

        let piecesPerKg = item.pieces_per_kg || catProd?.pieces_per_kg;
        if (!piecesPerKg && catProd?.domain_attributes) {
          try {
            const da = typeof catProd.domain_attributes === 'string' ? JSON.parse(catProd.domain_attributes) : catProd.domain_attributes;
            const storedPpk = Number(da.pcs_per_kg) || 0;
            const totalPcs = Number(da.pcs) || 0;
            const stockKg = Number(catProd.current_stock) || 0;
            piecesPerKg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : 1);
          } catch {
            piecesPerKg = 1;
          }
        }

        const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
        const effectiveUom = item.uom || catProd?.uom || 'PCS';
        const isWeightType = item.billing_type === 'WEIGHT' || catProd?.billing_type === 'WEIGHT' || weightUoms.includes(effectiveUom.toLowerCase());

        addItem({
          product_id: productId,
          invoiceItemId: item.item_id,
          name: item.name || item.product_name || catProd?.name || 'Product',
          sku_barcode: catProd?.sku_barcode || item.sku_barcode || '',
          item_code: catProd?.item_code || item.item_code || '',
          base_price: Number(item.unit_price) || 0,
          purchase_price: Number(catProd?.purchase_price ?? item.unit_price) || 0,
          tax_rate_percent: Number(item.tax_rate_percent || item.item_tax_rate || catProd?.tax_rate_percent || (catProd as B.BillingProduct)?.gst_percent || 0),
          billing_type: isWeightType ? 'WEIGHT' : (item.billing_type || catProd?.billing_type || 'PIECE'),
          uom: effectiveUom,
          pieces_per_kg: piecesPerKg || 1,
          pieces_override: Number(item.pieces_override ?? item.pieces ?? 1),
          isReturnItem: true,
          originalQuantity: Number(item.quantity) || 0,
          availableToReturn: item.available_to_return,
          alreadyReturned: item.already_returned,
          originalUnitPrice: Number(item.unit_price) || 0,
          rawUnitPrice: Math.max(Number(catProd?.base_price) || 0, Number(item.rawUnitPrice ?? item.unit_price) || 0),
          originalTaxAmount: Number(item.tax_amount) || 0,
          returnSourceInvoiceId: inv.invoice_id,
          returnSourceInvoiceNumber: inv.invoice_number,
          quantity: 0, // Require an explicit return quantity
        });
      });
    } catch (e) {
      console.error('Failed to load return invoice', e);
      setSelectedReturnInvoice(null);
      setHardwareError('Failed to load invoice for return. Please try again.');
    }
  };

  const handleSelectPastBill = async (invoice: B.BillingInvoice) => {
    if (!invoice || !isDesktopRuntime()) return;
    try {
      let invId = invoice.invoice_id || invoice.id;
      let fullInvoice = invoice;

      if (!invId && invoice.invoice_number) {
        const fetched = await listInvoices({ search: invoice.invoice_number, tenant_id: invoice.tenant_id || tenantId as string });
        if (Array.isArray(fetched) && fetched.length > 0) {
          const matched = fetched.find((i) => i.invoice_number === invoice.invoice_number) || fetched[0];
          invId = matched.invoice_id;
          fullInvoice = matched;
        }
      }

      if (!invId) {
        setHardwareError('Invoice ID not found');
        return;
      }

      const items = await getInvoiceItems(invId);
      if (!Array.isArray(items) || items.length === 0) {
        setHardwareError('Invoice has no items');
        return;
      }
      localStorage.setItem('editBillData', JSON.stringify({
        invoice: fullInvoice,
        items,
        originalRole: authRole,
      }));
      setSearchQuery('');
      setPastBillResults([]);
      setIsPastBillMode(false);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-edit-bill'));
      }, 50);
    } catch (e) {
      setHardwareError('Failed to fetch invoice');
      console.error(e);
    }
  };

  const handleSearchKey = async (e: React.KeyboardEvent) => {
    const maxLen = isScrapMode ? scrapSearchResults.length : isPastBillMode ? pastBillResults.length : results.length;
    if (e.key === 'ArrowDown') {
      if (maxLen > 0) {
        setSelectedIndex(i => Math.min(i + 1, maxLen - 1));
        e.preventDefault();
      } else if (searchQuery.trim() === '') {
        e.preventDefault();
        if (items.length > 0) {
          focusFirstCartField();
        } else {
          customerNameInputRef.current?.focus();
          customerNameInputRef.current?.select();
        }
      }
    }
    else if (e.key === 'ArrowUp') {
      if (maxLen > 0 && selectedIndex > 0) {
        setSelectedIndex(i => Math.max(i - 1, 0));
        e.preventDefault();
      } else if (searchQuery.trim() === '') {
        e.preventDefault();
        customerNameInputRef.current?.focus();
        customerNameInputRef.current?.select();
      }
    }
    else if (e.key === 'ArrowRight') {
      if (maxLen === 0 && searchQuery.trim() === '') {
        e.preventDefault();
        focusFirstCartField();
      }
    }
    else if (e.key === 'ArrowLeft') {
      const inputEl = e.currentTarget as HTMLInputElement;
      if (maxLen === 0 && (searchQuery.trim() === '' || inputEl.selectionStart === 0)) {
        e.preventDefault();
        if (items.length > 0) {
          focusLastCartField();
        } else {
          focusCustomerFieldsReverse();
        }
      }
    }
    else if (e.key === 'Enter') {
      if (searchQuery.trim() === '' && maxLen === 0) {
        if (items.length > 0) {
          e.preventDefault();
          focusFirstCartField();
          return;
        }
      }
      if (isScrapMode) {
        if (scrapSearchResults[selectedIndex]) handleSelectScrapItem(scrapSearchResults[selectedIndex]);
      } else if (isReturnMode) {
        if (returnSearchResults[selectedIndex]) handleSelectReturnInvoice(returnSearchResults[selectedIndex]);
      } else if (isPastBillMode) {
        if (pastBillResults[selectedIndex]) handleSelectPastBill(pastBillResults[selectedIndex]);
      } else {
        // Normal billing / quotation mode:
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery.length >= 1 && isDesktopRuntime()) {
          try {
            // tenantId can be null before login completes; it is passed through unchanged, as before.
            const products = await listProducts({ tenant_id: tenantId as string, barcode: trimmedQuery });
            if (Array.isArray(products) && products.length > 0) {
              e.preventDefault();
              // handleSelectProduct already schedules a 50ms timeout to focus the qty input.
              // Do NOT add a competing setTimeout here -- it would race and steal focus from qty.
              handleSelectProduct(products[0]);
              return;
            }
          } catch (err) {
            console.error('[BillingPage] Direct barcode lookup error:', err);
          }
        }

        if (results[selectedIndex]) {
          handleSelectProduct(results[selectedIndex]);
        } else if (!showProductCreateForm && searchQuery.length >= 1) {
          setShowProductCreateForm(true);
          setNewProductName(searchQuery);
        }
      }
    }
    else if (e.key === ' ' && searchQuery.trim() === '' && !isScrapMode && !isReturnMode && !isPastBillMode) { e.preventDefault(); setShowProductCreateForm(true); setNewProductName(''); }
    else if (e.key === 'Escape') { setResults([]); setScrapSearchResults([]); setPastBillResults([]); setSearchQuery(''); setIsPastBillMode(false); }
  };

  return { handleSelectProduct, handleSelectScrapItem, handleSelectReturnInvoice, handleSelectPastBill, handleSearchKey };
}
