import React, { useEffect } from 'react';
import { listInvoices, getInvoiceItems, type Invoice } from '../../../data/invoices';
import { useCartStore, type CartItem } from '../../../store/cartStore';
import { useTabStore, type SplitDetails, type TabSnapshot, saveStoredTabs } from '../../../store/tabStore';
import { getProductsByIds } from '../../../data/products';
import { type PaymentMethod } from '../BillingConstants';
import { isDesktopRuntime } from '../../../data/client';
import { returnsApi } from '../../../data/returns';
import { v4 as uuidv4 } from 'uuid';
import type { Tab } from '../../../store/tabStore';
import type { InvoiceType } from '../../../store/cartStore';
import type { ProductSearchState } from './useProductSearchState';

export interface UseIncomingDocumentsContext {
  productSearch: ProductSearchState;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number; }) => void;
  addTab: (initialSnapshot?: TabSnapshot, title?: string) => string;
  applyPartyTier: (name: string, phone: string) => void;
  authRole: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  clearCart: () => void;
  isCashSettlementEnabled: boolean;
  quotationGstEnabledSetting: boolean;
  reserveQuotationNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveReturnNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  setCustomerState: (state: string) => void;
  setEditingQuotation: (quotationId: string | null, quotationNumber: string | null) => void;
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setInvoiceType: (type: InvoiceType) => void;
  setIsLoadingEditBill: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScrapMode: (isScrapMode: boolean) => void;
  setLocalKgStr: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setLocalPcsStr: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setQuotationMode: (isQuotationMode: boolean) => void;
  setQuotationTerms: React.Dispatch<React.SetStateAction<string>>;
  setReturnMode: (isReturnMode: boolean) => void;
  // The return flow stores a partial invoice (id, number, customer); BillingPage state is untyped.
  setSelectedReturnInvoice: React.Dispatch<React.SetStateAction<Partial<Invoice> | null>>;
  syncActiveSnapshot: () => void;
  /** Advances BillingPage's tab counter and returns the new value (used for `Bill N` titles). */
  nextTabNumber: () => number;
  tenantId: string | null;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

/**
 * Documents handed over from other screens through localStorage + a window event: Edit Bill and Return from Sales
 * History, and opening an existing or a new quotation. Each listener is registered once on mount, as before.
 */
export function useIncomingDocuments(ctx: UseIncomingDocumentsContext) {
  const { addItem, addTab, applyPartyTier, authRole, clearCart, isCashSettlementEnabled, nextTabNumber, quotationGstEnabledSetting, reserveQuotationNumberForTab, reserveReturnNumberForTab, searchRef, setCustomerState, setEditingQuotation, setHardwareError, setInvoiceType, setIsLoadingEditBill, setIsScrapMode, setLocalKgStr, setLocalPcsStr, setQuotationMode, setQuotationTerms, setReturnMode, setSelectedReturnInvoice, syncActiveSnapshot, tenantId, updateActiveTab } = ctx;
  const { setIsPastBillMode } = ctx.productSearch;
  // Listen for Edit Bill from Sales History — loads items directly into cart
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('editBillData');
      if (!raw) return;
      localStorage.removeItem('editBillData');

      try {
        const { invoice: localInvoice, items: invoiceItems, originalRole } = JSON.parse(raw);
        if (!invoiceItems?.length) return;

        setIsLoadingEditBill(true);

        let invoice = localInvoice;
        if (localInvoice?.invoice_id) {
          try {
            const fetched = await listInvoices({ search: localInvoice.invoice_number || localInvoice.invoice_id, tenant_id: localInvoice.tenant_id });
            if (Array.isArray(fetched) && fetched.length > 0) {
              const exact = fetched.find((i: any) => i.invoice_id === localInvoice.invoice_id);
              if (exact) {
                invoice = exact;
              }
            }
          } catch (e) {
            console.warn('Failed to fetch fresh invoice from DB for edit, using cached invoice data', e);
          }
        }

        const currentCartItems = useCartStore.getState().items;
        const currentEditingId = useCartStore.getState().editingInvoiceId;
        if (!useTabStore.getState().activeTabId || (currentCartItems.length > 0 && currentEditingId !== invoice.invoice_id)) {
          const tabNumber = nextTabNumber();
          addTab(undefined, invoice.invoice_number || `Bill ${tabNumber}`);
        }

        // Enrich items with product data (barcode, brand, tax rate, uom, hsn, pricing, etc.)
        const productIds = [...new Set(invoiceItems.map((i: any) => i.product_id).filter(Boolean))] as string[];
        const productMap: Record<string, any> = {};
        if (productIds.length > 0) {
          try {
            const products = await getProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
            if (Array.isArray(products)) {
              products.forEach((p: any) => { productMap[p.product_id] = p; });
            }
          } catch {}
        }

        const enrichedItems: CartItem[] = invoiceItems.map((item: any) => {
          const productId = item.product_id || item.item_id || `edit-${Date.now()}-${Math.random()}`;
          const p = productMap[item.product_id];
          const isPcsWeight = item.billing_type === 'WEIGHT' ||
                              (p && (p.billing_type === 'WEIGHT' || ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'].includes((p.uom || '').toLowerCase()))) ||
                              ['kgs', 'grams', 'mtrs', 'ltrs', 'kg', 'gram', 'mtr', 'ltr'].includes((item.uom || item.unit || '').toLowerCase()) ||
                              (item.pieces_sold != null && item.pieces_sold > 0 && Number(item.quantity) !== Number(item.pieces_sold)) ||
                              (item.pieces_override != null && item.pieces_override > 0 && Number(item.quantity) !== Number(item.pieces_override));

          let sku_barcode = item.sku_barcode || null;
          let brand_manufacturer = item.brand_manufacturer || null;

          const itemCgstR = Number(item.cgst_rate) || 0;
          const itemSgstR = Number(item.sgst_rate) || 0;
          const itemIgstR = Number(item.igst_rate) || 0;
          const combinedRate = itemCgstR + itemSgstR + itemIgstR;
          const pTaxRate = Number(p?.tax_rate_percent ?? (p as any)?.gst_percent ?? 0);

          let tax_rate_percent = combinedRate || Number(item.tax_rate_percent) || Number(item.item_tax_rate) || pTaxRate || 0;
          if (tax_rate_percent <= 0 && Number(item.tax_amount) > 0) {
            const itemBase = (Number(item.unit_price) * Number(item.quantity)) || (Number(item.total) - Number(item.tax_amount));
            if (itemBase > 0) {
              tax_rate_percent = Math.round((Number(item.tax_amount) / itemBase) * 100 * 10) / 10;
            }
          }

          let billing_type = isPcsWeight ? 'WEIGHT' : (item.billing_type || 'PIECE');
          let pricing_mode = item.pricing_mode || 'FIXED';
          let purchase_price = Number(item.purchase_price) || 0;
          let grade_id = item.grade_id || null;
          let grade_rate = item.grade_rate || null;
          let uom = item.uom || item.unit || (isPcsWeight ? 'Kgs' : 'PCS');
          let pieces_per_kg: number | undefined = undefined;
          let base_price = Number(item.base_price) || 0;
          let offer_price = item.offer_price ?? null;
          let discount_flat = item.discount_flat ?? null;
          let discount_percent = item.discount_percent ?? null;
          let catalog_discount_percent: number | null = null;
          let catalog_discount_flat: number | null = null;
          let catalog_offer_price: number | null = null;

          if (p) {
            sku_barcode = p.sku_barcode || null;
            brand_manufacturer = p.brand_manufacturer || null;
            if (pTaxRate > 0 && (tax_rate_percent <= 0 || combinedRate <= 0)) {
              tax_rate_percent = pTaxRate;
            }
            billing_type = isPcsWeight ? 'WEIGHT' : (p.billing_type || 'PIECE');
            pricing_mode = p.pricing_mode || 'FIXED';
            purchase_price = p.purchase_price || 0;
            grade_id = p.grade_id || null;
            grade_rate = p.grade_rate || null;
            uom = p.uom || (isPcsWeight ? 'Kgs' : 'PCS');

            if (p.billing_type === 'WEIGHT' && p.domain_attributes) {
              try {
                const da = typeof p.domain_attributes === 'string'
                  ? JSON.parse(p.domain_attributes)
                  : p.domain_attributes;
                const storedPpk = Number(da.pcs_per_kg) || 0;
                const totalPcs = Number(da.pcs) || 0;
                const stockKg = Number(p.current_stock) || 0;
                pieces_per_kg = storedPpk > 0 ? storedPpk : (totalPcs > 0 ? (stockKg > 0 ? totalPcs / stockKg : totalPcs) : undefined);
              } catch {}
            }

            // Catalog pricing metadata
            catalog_offer_price = p.offer_price != null ? Number(p.offer_price) : (p.catalog_offer_price != null ? Number(p.catalog_offer_price) : null);
            catalog_discount_flat = p.discount_flat != null ? Number(p.discount_flat) : (p.catalog_discount_flat != null ? Number(p.catalog_discount_flat) : null);
            catalog_discount_percent = p.discount_percent != null ? Number(p.discount_percent) : (p.catalog_discount_percent != null ? Number(p.catalog_discount_percent) : null);

            let mrp = Number(p.base_price) || 0;
            if (p.domain_attributes) {
              try {
                const da = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
                const isPaperItem = Boolean(item.isDummyStock || da.gst_type === 'PAPER');
                if (isPaperItem && da.paper_mrp != null && da.paper_mrp !== '' && Number(da.paper_mrp) > 0) {
                  mrp = Number(da.paper_mrp);
                }
              } catch {}
            }
            const soldPrice = Number(item.unit_price) || 0;
            base_price = Math.max(mrp, soldPrice);

            const rawRate = pricing_mode === 'GRADE_RATE' && grade_rate ? Number(grade_rate) : mrp;

            // Compute standard catalog effective price
            const catalogEffectivePrice = catalog_offer_price != null ? catalog_offer_price
              : catalog_discount_flat != null ? Math.max(0, rawRate - catalog_discount_flat)
              : catalog_discount_percent != null ? Math.max(0, rawRate * (1 - catalog_discount_percent / 100))
              : rawRate;

            if (Math.abs(soldPrice - catalogEffectivePrice) < 0.01) {
              // Sold at standard catalog price / offer! No ad-hoc discount was given on this bill.
              offer_price = null;
              discount_flat = null;
              discount_percent = null;
            } else if (soldPrice < catalogEffectivePrice) {
              // Cashier gave an additional ad-hoc discount below catalog price!
              discount_flat = Number((catalogEffectivePrice - soldPrice).toFixed(2));
              discount_percent = catalogEffectivePrice > 0 ? Number(((catalogEffectivePrice - soldPrice) / catalogEffectivePrice * 100).toFixed(2)) : null;
              offer_price = null;
            } else {
              // Sold at custom price higher than catalog
              offer_price = soldPrice;
              discount_flat = null;
              discount_percent = null;
            }
          } else {
            const itemBase = Number(item.base_price) || 0;
            const soldPrice = Number(item.unit_price) || 0;
            base_price = Math.max(itemBase, soldPrice);
            if (soldPrice > 0 && base_price > soldPrice && offer_price == null && discount_flat == null && discount_percent == null) {
              offer_price = soldPrice;
            }
          }

          const qty = billing_type === 'WEIGHT'
            ? Number(item.calculated_weight || item.quantity) || 1
            : Number(item.quantity) || 1;

          return {
            item_id: item.item_id,
            product_id: productId,
            name: item.name || 'Product',
            base_price,
            purchase_price,
            tax_rate_percent,
            billing_type,
            quantity: qty,
            pieces_override: item.pieces_sold != null ? Number(item.pieces_sold) : (item.pieces_override != null ? Number(item.pieces_override) : undefined),
            pieces_per_kg,
            pricing_mode,
            grade_id,
            grade_rate,
            discount_percent,
            discount_flat,
            offer_price,
            catalog_discount_percent,
            catalog_discount_flat,
            catalog_offer_price,
            sku_barcode,
            brand_manufacturer,
            uom,
            hsn_sac_code: item.hsn_sac_code || (item as any).hsn_code || p?.hsn_sac_code || (p as any)?.hsn_code || null,
            is_gst_applicable: item.is_gst_applicable !== undefined ? Boolean(item.is_gst_applicable) : ((p as any)?.is_gst_applicable !== 0),
          };
        });

        // Set discount
        const effDiscValue = Number(invoice.discount_value) > 0 
          ? Number(invoice.discount_value) 
          : (Number(invoice.discount_total) > 0 ? Number(invoice.discount_total) : 0);
        const effDiscType = invoice.discount_type || 'FIXED';

        // Populate local string cache with loaded bill values so edit bill values display instantly
        const loadedPcsMap: Record<string, string> = {};
        const loadedKgMap: Record<string, string> = {};
        enrichedItems.forEach(i => {
          if (i.pieces_override !== undefined) loadedPcsMap[i.product_id] = String(i.pieces_override);
          if (i.quantity !== undefined) loadedKgMap[i.product_id] = String(i.quantity);
        });
        setLocalPcsStr(loadedPcsMap);
        setLocalKgStr(loadedKgMap);

        // Clear previous state and set all loaded invoice data in ONE single atomic Zustand update!
        useCartStore.setState({
          items: enrichedItems,
          lastAddedProductId: enrichedItems.length > 0 ? enrichedItems[enrichedItems.length - 1].product_id : null,
          invoiceType: (invoice.invoice_type === 'GST' || invoice.invoice_type === 'BILL_OF_SUPPLY') ? invoice.invoice_type : useCartStore.getState().invoiceType,
          discountValue: effDiscValue,
          discountType: effDiscType,
          scrapDeduction: Number(invoice.scrap_deduction) > 0 && invoice.scrap_invoice_number ? Number(invoice.scrap_deduction) : 0,
          scrapInvoiceNumber: Number(invoice.scrap_deduction) > 0 && invoice.scrap_invoice_number ? invoice.scrap_invoice_number : '',
          returnDeduction: Number(invoice.return_deduction) > 0 && invoice.return_invoice_number ? Number(invoice.return_deduction) : 0,
          returnInvoiceNumber: Number(invoice.return_deduction) > 0 && invoice.return_invoice_number ? invoice.return_invoice_number : '',
          customerState: invoice.customer_state || 'KL',
          editingQuotationId: null,
          editingQuotationNumber: null,
          editingInvoiceId: invoice.invoice_id,
          editingInvoiceNumber: invoice.invoice_number,
          editingInvoiceRole: originalRole || authRole,
          isQuotationMode: false,
          isReturnMode: false,
          isScrapMode: false,
        });

        // Parse split_details safely (handles double/multi-encoded JSON string or object)
        let parsedSplitDetails: any = null;
        if (invoice.split_details) {
          let curr = invoice.split_details;
          while (typeof curr === 'string') {
            try {
              const p = JSON.parse(curr);
              curr = p;
            } catch {
              break;
            }
          }
          if (typeof curr === 'object' && curr !== null) {
            parsedSplitDetails = curr;
          }
        }

        const grandTotalVal = Number(invoice.grand_total) || 0;
        const rawPm = invoice.payment_method ? String(invoice.payment_method).toUpperCase() : 'PENDING';
        const pmUpper = (['PENDING', 'CASH', 'CARD', 'UPI', 'CHEQUE', 'CREDIT', 'SPLIT'].includes(rawPm) ? rawPm : 'PENDING') as PaymentMethod;

        let finalSplitDetails: SplitDetails = { cash: 0, card: 0, upi: 0, credit: 0, bank_transfer: 0 };

        if (parsedSplitDetails && (Number(parsedSplitDetails.cash) || Number(parsedSplitDetails.card) || Number(parsedSplitDetails.upi) || Number(parsedSplitDetails.credit) || Number(parsedSplitDetails.bank_transfer || parsedSplitDetails.bank))) {
          finalSplitDetails = {
            cash: Number(parsedSplitDetails.cash) || 0,
            card: Number(parsedSplitDetails.card) || 0,
            upi: Number(parsedSplitDetails.upi) || 0,
            credit: Number(parsedSplitDetails.credit) || 0,
            bank_transfer: Number(parsedSplitDetails.bank_transfer || parsedSplitDetails.bank) || 0,
          };
          if (parsedSplitDetails.upi_id) (finalSplitDetails as any).upi_id = parsedSplitDetails.upi_id;
          if (parsedSplitDetails.upi_name) (finalSplitDetails as any).upi_name = parsedSplitDetails.upi_name;
          if (parsedSplitDetails.upi_source_id) (finalSplitDetails as any).upi_source_id = parsedSplitDetails.upi_source_id;
        } else {
          // Pre-fill split details according to single payment method and received amount / grand total
          const amt = Number(invoice.received_amount) > 0 ? Number(invoice.received_amount) : grandTotalVal;
          if (pmUpper === 'CASH') finalSplitDetails.cash = amt;
          else if (pmUpper === 'CARD') finalSplitDetails.card = amt;
          else if (pmUpper === 'UPI') finalSplitDetails.upi = amt;
          else if (pmUpper === 'CREDIT') finalSplitDetails.credit = grandTotalVal;
          else if (pmUpper === 'SPLIT') finalSplitDetails.cash = amt;
        }

        const editPartyKey = `${(invoice.customer_name || '').trim().toLowerCase()}|${(invoice.customer_phone || '').trim()}`;
        let editingInvoiceContribution = 0;
        if (pmUpper === 'CREDIT') {
          editingInvoiceContribution = grandTotalVal - (Number(invoice.received_amount) || 0);
        } else if (pmUpper === 'SPLIT') {
          const nonCreditPaid = (Number(parsedSplitDetails?.cash) || 0)
            + (Number(parsedSplitDetails?.card) || 0)
            + (Number(parsedSplitDetails?.upi) || 0)
            + (Number(parsedSplitDetails?.cheque) || 0)
            + (Number(parsedSplitDetails?.bank_transfer || parsedSplitDetails?.bank) || 0);
          const splitCreditVal = Number(parsedSplitDetails?.credit) || 0;
          if (splitCreditVal > 0) editingInvoiceContribution = grandTotalVal - nonCreditPaid;
        }

        // Set customer info, payment details, and split details on active tab
        updateActiveTab({
          customerId: invoice.customer_id || '',
          manualTotalOverride: null,
          editingInvoiceContribution,
          editingInvoicePartyKey: editPartyKey,
          customerName: invoice.customer_name || '',
          customerPhone: invoice.customer_phone || '',
          customerGstin: invoice.customer_gstin || '',
          customerAddress: invoice.customer_address || '',
          billDate: invoice.created_at || null,
          paymentMethod: pmUpper,
          receivedAmount: Number(invoice.received_amount) || 0,
          actualRefundPaid: Number(invoice.actual_refund_paid) || 0,
          splitDetails: finalSplitDetails,
          selectedUpiId: parsedSplitDetails?.upi_id,
          selectedUpiSourceId: parsedSplitDetails?.upi_source_id,
          selectedUpiName: parsedSplitDetails?.upi_name,
          description: invoice.description || invoice.notes || '',
          title: invoice.invoice_number,
        });

        if (invoice.customer_name || invoice.customer_phone) {
          setTimeout(() => {
            applyPartyTier(invoice.customer_name || '', invoice.customer_phone || '');
          }, 50);
        }

        // Sync tab snapshot so items persist across tab switches
        syncActiveSnapshot();
        setTimeout(() => {
          window.focus();
          if (searchRef.current) {
            searchRef.current.focus();
            searchRef.current.select();
          }
        }, 100);
      } catch (e) {
        console.error('Failed to load edit bill data', e);
      } finally {
        setIsLoadingEditBill(false);
      }
    };

    handler();

    window.addEventListener('open-edit-bill', handler);
    return () => window.removeEventListener('open-edit-bill', handler);
  }, []);

  // Listen for Return from Sales History — activates return mode with pre-loaded invoice
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('returnBillData');
      if (!raw) return;
      localStorage.removeItem('returnBillData');
      try {
        const { invoice } = JSON.parse(raw);
        if (!invoice?.invoice_id) return;
        if (!isDesktopRuntime()) return;

        const [rawItems, returnedQtys] = await Promise.all([
          getInvoiceItems(invoice.invoice_id),
          returnsApi.getAlreadyReturnedQuantities(invoice.invoice_id),
        ]);

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          setHardwareError('Invoice has no items');
          return;
        }

        const returnedMap: Record<string, number> = {};
        (returnedQtys || []).forEach((r: any) => {
          returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
        });

        const invSubtotal = Number(invoice.subtotal) || rawItems.reduce((s: number, i: any) => s + (Number(i.unit_price) * Number(i.quantity)), 0);
        const invDiscount = (Number(invoice.discount_total) || 0) + (Number(invoice.points_redeemed_discount) || 0);
        const discountRatio = invSubtotal > 0 ? Math.min(1, Math.max(0, invDiscount / invSubtotal)) : 0;

        const enriched = rawItems
          .map((item: any) => {
            const origPrice = Number(item.unit_price) || 0;
            const effPrice = Number((origPrice * (1 - discountRatio)).toFixed(2));
            const origTax = Number(item.tax_amount) || 0;
            const effTax = Number((origTax * (1 - discountRatio)).toFixed(2));
            return {
              ...item,
              unit_price: effPrice,
              rawUnitPrice: origPrice,
              tax_amount: effTax,
              already_returned: returnedMap[item.item_id] || 0,
              available_to_return: Math.max(0, Number(item.quantity) - (returnedMap[item.item_id] || 0)),
            };
          })
          .filter((item: any) => item.available_to_return > 0);

        if (enriched.length === 0) {
          setHardwareError('All items have already been returned');
          return;
        }

        // Clear cart and activate return mode
        clearCart();
        await reserveReturnNumberForTab();
        setReturnMode(true);

        // Enrich with catalog product details if available
        const productIds: string[] = [...new Set((enriched || []).map((i: any) => i.product_id).filter(Boolean))];
        const productMap: Record<string, any> = {};
        if (productIds.length > 0) {
          try {
            const prods = await getProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
            if (Array.isArray(prods)) { prods.forEach((p: any) => { productMap[p.product_id] = p; }); }
          } catch (e) {}
        }

        // Load returnable items into cart
        enriched.forEach((item: any) => {
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
            name: item.name || catProd?.name || 'Product',
            base_price: Number(item.unit_price) || 0,
            purchase_price: Number(catProd?.purchase_price ?? item.unit_price) || 0,
            tax_rate_percent: Number(item.tax_rate_percent || item.item_tax_rate || catProd?.tax_rate_percent || (catProd as any)?.gst_percent || 0),
            billing_type: isWeightType ? 'WEIGHT' : (item.billing_type || catProd?.billing_type || 'PIECE'),
            uom: effectiveUom,
            pieces_per_kg: piecesPerKg || 1,
            pieces_override: Number(item.pieces_override ?? item.pieces ?? 1),
            isReturnItem: true,
            originalQuantity: Number(item.quantity) || 0,
            availableToReturn: item.available_to_return,
            alreadyReturned: item.already_returned,
            originalUnitPrice: Number(item.unit_price) || 0,
            rawUnitPrice: Number(item.rawUnitPrice ?? item.unit_price) || 0,
            originalTaxAmount: Number(item.tax_amount) || 0,
            returnSourceInvoiceId: invoice.invoice_id,
            returnSourceInvoiceNumber: invoice.invoice_number,
            quantity: item.available_to_return,
          });
        });

        // Set source invoice as the selected return invoice
        setSelectedReturnInvoice({
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          customer_name: invoice.customer_name,
          customer_phone: invoice.customer_phone,
        });

        // Pre-fill customer info
        updateActiveTab({
          customerName: invoice.customer_name || '',
          customerPhone: invoice.customer_phone || '',
        });

        syncActiveSnapshot();
      } catch (e) {
        console.error('Failed to load return bill data', e);
        setHardwareError('Failed to load invoice for return');
      }
    };

    handler();

    window.addEventListener('open-return-mode', handler);
    return () => window.removeEventListener('open-return-mode', handler);
  }, []);

  // Load invoice items into cart for return processing (like scrap loads categories)

  // Listen for open-quotation-edit event
  useEffect(() => {
    const handler = async () => {
      const raw = localStorage.getItem('editQuotationData');
      if (!raw) return;
      localStorage.removeItem('editQuotationData');
      try {
        const { quotation, items: qItems, convertToInvoice } = JSON.parse(raw);
        clearCart();
        if (convertToInvoice) {
          setQuotationMode(false);
          setEditingQuotation(null, null);
        } else {
          setQuotationMode(true);
          setEditingQuotation(quotation.quotation_id, quotation.quotation_number);
          if (quotation.quotation_number) updateActiveTab({ title: quotation.quotation_number });
        }
        if (quotation.customer_name) updateActiveTab({ customerName: quotation.customer_name });
        if (quotation.customer_phone) updateActiveTab({ customerPhone: quotation.customer_phone });
        if (quotation.customer_address) updateActiveTab({ customerAddress: quotation.customer_address });
        if (quotation.customer_gstin) updateActiveTab({ customerGstin: quotation.customer_gstin });
        if (quotation.customer_state) setCustomerState(quotation.customer_state);
        if (quotation.is_gst === 1 || Number(quotation.tax_total) > 0 || quotationGstEnabledSetting) {
          setInvoiceType('GST');
        } else {
          setInvoiceType('BILL_OF_SUPPLY');
        }
        if (quotation.terms_conditions) setQuotationTerms(quotation.terms_conditions);
        
        if (Array.isArray(qItems)) {
          const productIds = qItems.map((i: any) => i.product_id).filter(Boolean);
          const productsMap: Record<string, any> = {};
          if (productIds.length > 0) {
            try {
              const prods = await getProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
              if (Array.isArray(prods)) {
                prods.forEach((p: any) => { productsMap[p.product_id] = p; });
              }
            } catch (e) {
              console.error('Failed to fetch product details for quotation items:', e);
            }
          }

          qItems.forEach((item: any) => {
            const productId = item.product_id || item.item_id || `qtn-${Date.now()}-${Math.random()}`;
            const qty = item.weight && Number(item.weight) > 0 ? Number(item.weight) : (Number(item.quantity) || 1);
            const dbProduct = productsMap[productId] || {};
            const barcode = item.sku_barcode || item.barcode || dbProduct.sku_barcode || dbProduct.barcode || null;
            const brand = item.brand_manufacturer || dbProduct.brand_manufacturer || null;
            const uomVal = item.uom || dbProduct.uom || null;

            const soldRate = Number(item.rate) || 0;
            const mrp = Number(item.base_price || dbProduct.base_price) || 0;
            const basePrice = Math.max(mrp, soldRate);

            // Catalog offer/discount metadata from DB product
            const catalog_offer_price = dbProduct.offer_price != null ? Number(dbProduct.offer_price) : (dbProduct.catalog_offer_price != null ? Number(dbProduct.catalog_offer_price) : null);
            const catalog_discount_flat = dbProduct.discount_flat != null ? Number(dbProduct.discount_flat) : (dbProduct.catalog_discount_flat != null ? Number(dbProduct.catalog_discount_flat) : null);
            const catalog_discount_percent = dbProduct.discount_percent != null ? Number(dbProduct.discount_percent) : (dbProduct.catalog_discount_percent != null ? Number(dbProduct.catalog_discount_percent) : null);

            const rawRate = dbProduct.pricing_mode === 'GRADE_RATE' && dbProduct.grade_rate ? Number(dbProduct.grade_rate) : basePrice;
            const catalogEffectivePrice = catalog_offer_price != null ? catalog_offer_price
              : catalog_discount_flat != null ? Math.max(0, rawRate - catalog_discount_flat)
              : catalog_discount_percent != null ? Math.max(0, rawRate * (1 - catalog_discount_percent / 100))
              : rawRate;

            let offer_price = item.offer_price ?? null;
            let discount_flat = item.discount_flat ?? null;
            let discount_percent = item.discount_percent ?? null;

            if (offer_price == null && discount_flat == null && discount_percent == null) {
              if (Math.abs(soldRate - catalogEffectivePrice) < 0.01) {
                offer_price = null;
                discount_flat = null;
                discount_percent = null;
              } else if (soldRate < catalogEffectivePrice) {
                discount_flat = Number((catalogEffectivePrice - soldRate).toFixed(2));
                discount_percent = catalogEffectivePrice > 0 ? Number(((catalogEffectivePrice - soldRate) / catalogEffectivePrice * 100).toFixed(2)) : null;
              } else {
                offer_price = soldRate;
              }
            }

            addItem({
              product_id: productId,
              name: item.name || dbProduct.name || 'Product',
              base_price: basePrice,
              purchase_price: Number(dbProduct.purchase_price || item.purchase_price) || 0,
              tax_rate_percent: Number(item.tax_rate_percent || dbProduct.tax_rate_percent || (dbProduct as any).gst_percent || 0),
              hsn_sac_code: item.hsn_code || (item as any).hsn_sac_code || dbProduct.hsn_sac_code || dbProduct.hsn_code || null,
              is_gst_applicable: (dbProduct as any).is_gst_applicable !== 0,
              billing_type: item.weight && Number(item.weight) > 0 ? 'WEIGHT' : (dbProduct.billing_type || undefined),
              quantity: qty,
              offer_price,
              discount_flat,
              discount_percent,
              catalog_offer_price,
              catalog_discount_flat,
              catalog_discount_percent,
              sku_barcode: barcode,
              brand_manufacturer: brand,
              uom: uomVal,
            });
          });
        }
        syncActiveSnapshot();
        setTimeout(() => {
          window.focus();
          if (searchRef.current) {
            searchRef.current.focus();
            searchRef.current.select();
          }
        }, 100);
      } catch (e) {
        console.error('Failed to load quotation edit data', e);
      }
    };

    handler();

    window.addEventListener('open-quotation-edit', handler);
    return () => window.removeEventListener('open-quotation-edit', handler);
  }, []);

  // Listen for open-new-quotation event
  useEffect(() => {
    const handler = async () => {
      localStorage.removeItem('pendingNewQuotation');
      clearCart();
      setReturnMode(false);
      setIsScrapMode(false);
      setIsPastBillMode(false);
      setEditingQuotation(null, null);
      useCartStore.getState().setEditingInvoice(null, null, null);
      setQuotationMode(true);
      
      const quotationSnapshot: TabSnapshot = {
        items: [],
        invoiceType: 'BILL_OF_SUPPLY',
        discountType: 'FIXED',
        discountValue: 0,
        customerState: 'KL',
        scrapDeduction: 0,
        scrapInvoiceNumber: '',
        returnDeduction: 0,
        returnInvoiceNumber: '',
        isQuotationMode: true,
        isReturnMode: false,
        isScrapMode: false,
        returnRefundMethod: 'ADJUST_BILL',
        editingQuotationId: null,
        editingQuotationNumber: null,
        editingInvoiceId: null,
        editingInvoiceNumber: null,
        editingInvoiceRole: null,
        pendingScrapInvoiceToEdit: null,
      };

      const existingTabs = useTabStore.getState().tabs;
      const currentActiveTabId = useTabStore.getState().activeTabId;
      const activeTab = existingTabs.find(t => t.id === currentActiveTabId);

      if (activeTab && (!activeTab.snapshot?.items || activeTab.snapshot.items.length === 0) && !activeTab.snapshot?.editingInvoiceNumber) {
        updateActiveTab({
          title: 'New Quote',
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH',
          receivedAmount: 0,
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
        });
        const { tabs: currentTabs, activeTabId: curTabId } = useTabStore.getState();
        const updatedTabs = currentTabs.map(t => t.id === curTabId ? {
          ...t,
          title: 'New Quote',
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
          snapshot: quotationSnapshot,
        } : t);
        useTabStore.setState({ tabs: updatedTabs });
        saveStoredTabs(updatedTabs, curTabId);
        await reserveQuotationNumberForTab(true);
        syncActiveSnapshot();
      } else {
        addTab(quotationSnapshot, 'New Quote');
        await reserveQuotationNumberForTab(true);
      }

      setTimeout(() => {
        window.focus();
        if (searchRef.current) {
          searchRef.current.focus();
          searchRef.current.select();
        }
      }, 100);
    };

    if (localStorage.getItem('pendingNewQuotation') === 'true') {
      handler();
    }

    window.addEventListener('open-new-quotation', handler);
    return () => window.removeEventListener('open-new-quotation', handler);
  }, [clearCart, setReturnMode, setIsScrapMode, setEditingQuotation, setQuotationMode, updateActiveTab, syncActiveSnapshot, reserveQuotationNumberForTab, isCashSettlementEnabled, addTab, setIsPastBillMode, searchRef]);

}
