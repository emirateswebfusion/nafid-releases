import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import type { DisplayInvoiceItem, DisplayComboItem } from '../invoiceDisplayTypes';
import type { Product } from '../../../data/products';
import type { ComboOfferWithItems } from '../../../data/combos';
import React, { useRef, useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { combosApi } from '../../../data/combos';
import { getProductsByIds } from '../../../data/products';
import { getInvoiceItems } from '../../../data/invoices';
import { returnsApi } from '../../../data/returns';
import type { InvoiceDetailsCacheEntry, SalesInvoiceItemRow } from '../salesTypes';

export interface UseInvoiceDetailsContext {
  invoiceDetailsCache: React.RefObject<Map<string, InvoiceDetailsCacheEntry>>;
  selectedInvoiceIdRef: React.RefObject<string | null>;
  setItems: React.Dispatch<React.SetStateAction<SalesInvoiceItemRow[]>>;
  withTimeout: <T>(promise: Promise<T>, ms: number, fallback: T) => Promise<T>;
}

/** Loads (and caches) the selected invoice's items and returns for the Sales History drawer, adding MRP and combo details. */
export function useInvoiceDetails(ctx: UseInvoiceDetailsContext) {
  const { invoiceDetailsCache, selectedInvoiceIdRef, setItems, withTimeout } = ctx;
  // Recover MRP / offer info for past invoices (invoice_items only stores the sold rate).
  // Mirrors the recovery logic used when editing a bill in BillingPage.
  const enrichItemsWithMrp = async (invoiceItems: DisplayInvoiceItem[]): Promise<DisplayInvoiceItem[]> => {
    if (!Array.isArray(invoiceItems) || invoiceItems.length === 0) return [];
    try {
      const { tenantId } = useAuthStore.getState();
      const effectiveTenantId = tenantId || 'global';
      let combosList: ComboOfferWithItems[] = [];
      
      // Only query combo offers if at least one item looks like a combo
      const mightHaveCombos = invoiceItems.some((i) => 
        Boolean(i?.combo_id || i?.isCombo || (i?.combo_details && i.combo_details !== 'null'))
      );
      if (mightHaveCombos && hasBridge('dbGetComboOffers')) {
        if (combosCacheRef.current && Date.now() - combosCacheRef.current.timestamp < 60000) {
          combosList = combosCacheRef.current.data;
        } else {
          try {
            const allCombos = await withTimeout(
              combosApi.getComboOffers({ tenant_id: effectiveTenantId }),
              1500,
              []
            );
            if (Array.isArray(allCombos)) {
              combosList = allCombos;
              combosCacheRef.current = { data: allCombos, timestamp: Date.now() };
            }
          } catch {
            // ignore combo lookup failure
          }
        }
      }

      const nonService = invoiceItems.filter((i) => !i?.is_service_item);
      const productIds = [...new Set(nonService.map((i) => i?.product_id).filter(Boolean))] as string[];
      const missingProductIds = productIds.filter(id => !productsCacheRef.current.has(id));

      if (missingProductIds.length > 0) {
        try {
          const products = await withTimeout(
            getProductsByIds({ tenant_id: effectiveTenantId, product_ids: missingProductIds }),
            1500,
            []
          );
          if (Array.isArray(products)) {
            products.forEach((p) => { if (p?.product_id) productsCacheRef.current.set(p.product_id, p); });
          }
        } catch {
          // ignore product lookup failures
        }
      }

      const productMap: Record<string, Product> = {};
      productIds.forEach(id => {
        const p = productsCacheRef.current.get(id);
        if (p) productMap[id] = p;
      });

      return invoiceItems.map(item => {
        try {
          let comboItemsParsed: DisplayComboItem[] | undefined = undefined;
          if (item?.combo_details) {
            try {
              const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
              if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
            } catch { /* ignore */ }
          }

          const itemNameClean = String(item?.name || '').toLowerCase().trim();
          const matchedCombo = combosList.find((c) => {
            const cNameClean = String(c?.name || '').toLowerCase().trim();
            return (item?.combo_id && c?.combo_id === item.combo_id) ||
              (cNameClean && itemNameClean && cNameClean === itemNameClean) ||
              (item?.product_id && c?.combo_id === item.product_id);
          });

          if (!comboItemsParsed && matchedCombo && matchedCombo.items) {
            comboItemsParsed = matchedCombo.items;
          }

          const isComboItem = Boolean(item?.combo_id || matchedCombo || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));

          const p = item?.is_service_item ? null : productMap[item?.product_id];
          const mrp = p ? (p.pricing_mode === 'GRADE_RATE' && Number(p.grade_rate) > 0 ? Number(p.grade_rate) : (Number(p.base_price) || 0)) : 0;
          const soldPrice = Number(item?.unit_price) || 0;
          let originalRate: number | undefined;
          let discountLabel: string | undefined;
          let isPriceOverride = false;
          if (mrp > 0 && soldPrice < mrp) {
            const offerPrice = p?.offer_price ? Number(p.offer_price) : null;
            const catalogDiscFlat = p?.discount_flat ? Number(p.discount_flat) : null;
            const catalogDiscPct = p?.discount_percent ? Number(p.discount_percent) : null;
            const catalogPrice = offerPrice !== null ? offerPrice
              : catalogDiscFlat !== null ? mrp - catalogDiscFlat
              : catalogDiscPct !== null ? mrp * (1 - catalogDiscPct / 100)
              : mrp;

            if (offerPrice !== null && Math.abs(offerPrice - soldPrice) < 0.01) {
              originalRate = mrp;
              discountLabel = 'Offer';
              isPriceOverride = false;
            } else if (catalogPrice < mrp && Math.abs(catalogPrice - soldPrice) < 0.01) {
              originalRate = mrp;
              discountLabel = catalogDiscFlat ? `-${getCurrencyPrefix()}${catalogDiscFlat.toFixed(0)}` : catalogDiscPct ? `${catalogDiscPct}% OFF` : 'Offer';
              isPriceOverride = false;
            } else {
              const diff = mrp - soldPrice;
              if (diff >= 0.05) {
                originalRate = mrp;
                discountLabel = `-${getCurrencyPrefix()}${diff.toFixed(0)}`;
                isPriceOverride = true;
              }
            }
          }
          let pcsPerKg: number | undefined;
          if (p?.domain_attributes) {
            try {
              const attrs = typeof p.domain_attributes === 'string' ? JSON.parse(p.domain_attributes) : p.domain_attributes;
              if (attrs?.pcs_per_kg) pcsPerKg = Number(attrs.pcs_per_kg);
            } catch { /* ignore */ }
          }
          return {
            ...item,
            originalRate,
            discountLabel,
            isPriceOverride,
            brand_manufacturer: p?.brand_manufacturer || item?.brand_manufacturer || undefined,
            billing_type: p?.billing_type || item?.billing_type || undefined,
            pieces_per_kg: pcsPerKg,
            hsn_sac_code: item?.hsn_sac_code || p?.hsn_sac_code || undefined,
            unit: p?.uom || item?.uom || item?.unit || undefined,
            isCombo: isComboItem,
            combo_items: comboItemsParsed,
          };
        } catch {
          return item;
        }
      });
    } catch {
      return invoiceItems;
    }
  };

  const productsCacheRef = useRef<Map<string, Product>>(new Map());

  const combosCacheRef = useRef<{ data: ComboOfferWithItems[]; timestamp: number } | null>(null);

  const fetchInvoiceDetails = useCallback(async (invoiceId: string): Promise<{ items: DisplayInvoiceItem[]; returned: Awaited<ReturnType<typeof returnsApi.getAlreadyReturnedQuantities>>; canReturn: boolean }> => {
    const cached = invoiceDetailsCache.current.get(invoiceId);
    if (cached && !cached.promise) {
      return cached;
    }
    if (cached?.promise) {
      return cached.promise;
    }

    const promise = (async () => {
      if (!isDesktopRuntime()) {
        return { items: [], returned: [], canReturn: true };
      }
      try {
        const [data, returned] = await Promise.all([
          withTimeout(
            getInvoiceItems(invoiceId).catch((err) => {
              console.error('[SalesHistory] dbGetInvoiceItems error:', err);
              return [];
            }),
            3000,
            []
          ),
          withTimeout(
            returnsApi.getAlreadyReturnedQuantities(invoiceId).catch((err) => {
              console.error('[SalesHistory] dbGetAlreadyReturnedQuantities error:', err);
              return [];
            }),
            3000,
            []
          ),
        ]);

        const invoiceItems = Array.isArray(data) ? data : [];
        const returnedMap: Record<string, number> = {};
        (Array.isArray(returned) ? returned : []).forEach((r) => {
          if (r?.invoice_item_id) {
            returnedMap[r.invoice_item_id] = Number(r.returned_qty) || 0;
          }
        });
        const fullyReturned = invoiceItems.length > 0 && invoiceItems.every((item) =>
          Number(item.quantity) - (returnedMap[item.item_id] || 0) <= 0
        );

        const result = {
          items: invoiceItems,
          returned: Array.isArray(returned) ? returned : [],
          canReturn: !fullyReturned,
        };

        invoiceDetailsCache.current.set(invoiceId, result);

        // Pre-enrich with MRP and combos in background
        enrichItemsWithMrp(invoiceItems).then((enriched) => {
          if (Array.isArray(enriched) && enriched.length > 0) {
            const entry = invoiceDetailsCache.current.get(invoiceId);
            if (entry) {
              entry.items = enriched;
            }
            if (selectedInvoiceIdRef.current === invoiceId) {
              setItems(enriched);
            }
          }
        }).catch(() => {});

        return result;
      } catch (e) {
        invoiceDetailsCache.current.delete(invoiceId);
        throw e;
      }
    })();

    invoiceDetailsCache.current.set(invoiceId, { items: [], returned: [], canReturn: true, promise });
    return promise;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enrichItemsWithMrp and withTimeout excluded: the cached invoice fetcher keeps its original mount-time closure.
  }, []);

  return { fetchInvoiceDetails };
}
