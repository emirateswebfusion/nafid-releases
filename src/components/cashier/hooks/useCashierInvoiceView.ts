import type { DisplayInvoiceItem, DisplayComboItem } from '../../sales/invoiceDisplayTypes';
import type { ComboOfferWithItems } from '../../../data/combos';
import type { Product } from '../../../data/products';
import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { useAuthStore } from '../../../store/authStore';
import { combosApi } from '../../../data/combos';
import { productsApi } from '../../../data/products';
import type { CashierInvoiceItemRow, CashierInvoiceRow } from '../cashierTypes';

export interface UseCashierInvoiceViewContext {
  setInvoiceItems: React.Dispatch<React.SetStateAction<CashierInvoiceItemRow[]>>;
  setLoadingItems: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedInvoice: React.Dispatch<React.SetStateAction<CashierInvoiceRow | null>>;
  setShowInvoiceModal: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Open an invoice in the cashier screen's detail dialog (`handleViewInvoice`), loading its items with MRP and combo
 * details. Not the same implementation as the Sales History one (`sales/hooks/useInvoiceDetails`); they have diverged.
 */
export function useCashierInvoiceView(ctx: UseCashierInvoiceViewContext) {
  const { setInvoiceItems, setLoadingItems, setSelectedInvoice, setShowInvoiceModal } = ctx;
  const handleViewInvoice = async (inv: CashierInvoiceRow) => {
    setSelectedInvoice(inv);
    setShowInvoiceModal(true);
    setLoadingItems(true);
    try {
      if (isDesktopRuntime()) {
        const data = await invoicesApi.getInvoiceItems(inv.invoice_id);
        setInvoiceItems(await enrichItemsWithMrp(Array.isArray(data) ? data : []));
      }
    } catch (err) {
      console.error('Failed to load invoice items', err);
    } finally {
      setLoadingItems(false);
    }
  };

  // Recover MRP / offer info for past invoices (invoice_items only stores the sold rate).
  // Mirrors the recovery logic used when editing a bill in BillingPage.
  const enrichItemsWithMrp = async (invoiceItems: DisplayInvoiceItem[]): Promise<DisplayInvoiceItem[]> => {
    const { tenantId } = useAuthStore.getState();
    let combosList: ComboOfferWithItems[] = [];
    try {
      const allCombos = await combosApi.getComboOffers({ tenant_id: tenantId || 'global' });
      if (Array.isArray(allCombos)) combosList = allCombos;
    } catch { /* ignore */ }

    const nonService = invoiceItems.filter((i) => !i.is_service_item);
    const productIds = [...new Set(nonService.map((i) => i.product_id).filter(Boolean))] as string[];
    const productMap: Record<string, Product> = {};
    if (productIds.length > 0) {
      try {
        const products = await productsApi.getProductsByIds({ tenant_id: tenantId || 'global', product_ids: productIds });
        if (Array.isArray(products)) {
          products.forEach((p) => { productMap[p.product_id] = p; });
        }
      } catch {
        // ignore product lookup failures
      }
    }
    return invoiceItems.map(item => {
      let comboItemsParsed: DisplayComboItem[] | undefined = undefined;
      if (item.combo_details) {
        try {
          const parsed = typeof item.combo_details === 'string' ? JSON.parse(item.combo_details) : item.combo_details;
          if (Array.isArray(parsed) && parsed.length > 0) comboItemsParsed = parsed;
        } catch { /* ignore */ }
      }

      const matchedCombo = combosList.find((c) =>
        (item.combo_id && c.combo_id === item.combo_id) ||
        (item.name && c.name && c.name.toLowerCase().trim() === item.name.toLowerCase().trim()) ||
        (item.product_id && c.combo_id === item.product_id)
      );

      if (!comboItemsParsed && matchedCombo && matchedCombo.items) {
        comboItemsParsed = matchedCombo.items;
      }

      const isComboItem = Boolean(item.combo_id || matchedCombo || (Array.isArray(comboItemsParsed) && comboItemsParsed.length > 0));

      const p = item.is_service_item ? null : productMap[item.product_id];
      const mrp = p ? (p.pricing_mode === 'GRADE_RATE' && Number(p.grade_rate) > 0 ? Number(p.grade_rate) : (Number(p.base_price) || 0)) : 0;
      const soldPrice = Number(item.unit_price) || 0;
      let originalRate: number | undefined;
      let discountLabel: string | undefined;
      if (mrp > 0 && soldPrice < mrp) {
        const offerPrice = p?.offer_price ? Number(p.offer_price) : null;
        if (offerPrice !== null && Math.abs(offerPrice - soldPrice) < 0.01) {
          originalRate = mrp;
          discountLabel = 'Offer';
        } else {
          const diff = mrp - soldPrice;
          if (diff >= 0.05) {
            originalRate = mrp;
            discountLabel = `-₹${diff.toFixed(0)}`;
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
        brand_manufacturer: p?.brand_manufacturer || item.brand_manufacturer || undefined,
        billing_type: p?.billing_type || item.billing_type || undefined,
        pieces_per_kg: pcsPerKg,
        unit: p?.uom || item.uom || item.unit || undefined,
        isCombo: isComboItem,
        combo_items: comboItemsParsed,
      };
    });
  };

  return { handleViewInvoice };
}
