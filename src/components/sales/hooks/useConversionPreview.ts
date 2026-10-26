import type { DisplayInvoiceItem } from '../invoiceDisplayTypes';
import type { Product } from '../../../data/products';
import React, { useEffect } from 'react';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { invoicesApi, getInvoiceItems } from '../../../data/invoices';
import { getProductsByIds } from '../../../data/products';
import type { SalesInvoiceRow } from '../salesTypes';

type ConversionPreview = { total_bos_amount?: number; total_taxable_amount?: number; total_tax_amount?: number; total_converted_amount?: number; has_real_gst?: boolean; has_paper?: boolean; has_skipped?: boolean; invoices?: { invoice_id: string; invoice_number: string; bos_grand_total: number; taxable_amount?: number; tax_amount?: number; converted_grand_total: number; points_discount?: number; scrap_deduction?: number; return_deduction?: number; deductions_total?: number; has_real_gst: boolean; has_paper: boolean; skipped_items: string[]; }[]; };

export interface UseConversionPreviewContext {
  conversionOpen: boolean;
  conversionTaxMode: "EXCLUSIVE" | "INCLUSIVE";
  selectedBosInvoices: SalesInvoiceRow[];
  setConversionPreview: React.Dispatch<React.SetStateAction<ConversionPreview | null>>;
  setConversionPreviewLoading: React.Dispatch<React.SetStateAction<boolean>>;
  tenantId: string | null;
}

/** While the GST conversion dialog is open, builds the preview for the selected Bill of Supply invoices and tax mode. */
export function useConversionPreview(ctx: UseConversionPreviewContext) {
  const { conversionOpen, conversionTaxMode, selectedBosInvoices, setConversionPreview, setConversionPreviewLoading, tenantId } = ctx;
  useEffect(() => {
    if (!conversionOpen || selectedBosInvoices.length === 0) {
      setConversionPreview(null);
      return;
    }
    let cancelled = false;
    setConversionPreviewLoading(true);
    const tid = tenantId || 'global';

    const runPreview = async () => {
      // 1. Try IPC preview first
      if (hasBridge('dbPreviewConvertBosToGst')) {
        try {
          const res = await invoicesApi.previewConvertBosToGst({
            invoice_ids: selectedBosInvoices.map(i => i.invoice_id),
            tenant_id: tid,
            tax_mode: conversionTaxMode,
          });
          if (res?.success && res.invoices && res.invoices.length > 0) {
            if (!cancelled) {
              setConversionPreview(res);
              setConversionPreviewLoading(false);
            }
            return;
          }
        } catch (err) {
          console.warn('[SalesHistory] IPC previewConvertBosToGst failed or not registered, using client fallback:', err);
        }
      }

      // 2. Robust Client-side fallback so preview updates immediately even before app restart
      try {
        let totalBos = 0;
        let totalTaxable = 0;
        let totalTax = 0;
        let totalConverted = 0;
        let hasRealGst = false;
        let hasPaper = false;
        const previewInvoices: NonNullable<ConversionPreview['invoices']> = [];

        const allProductIds = new Set<string>();
        const invoiceItemsMap: Record<string, DisplayInvoiceItem[]> = {};

        for (const inv of selectedBosInvoices) {
          if (isDesktopRuntime()) {
            const items = await getInvoiceItems(inv.invoice_id);
            invoiceItemsMap[inv.invoice_id] = Array.isArray(items) ? items : [];
            for (const itm of invoiceItemsMap[inv.invoice_id]) {
              if (itm.product_id) allProductIds.add(itm.product_id);
            }
          }
        }

        const productsMap: Record<string, Product> = {};
        if (allProductIds.size > 0) {
          try {
            const prods = await getProductsByIds({
              tenant_id: tid,
              product_ids: Array.from(allProductIds)
            });
            if (Array.isArray(prods)) {
              for (const p of prods) productsMap[p.product_id] = p;
            }
          } catch { /* ignore */ }
        }

        for (const inv of selectedBosInvoices) {
          const items = invoiceItemsMap[inv.invoice_id] || [];
          let newSubtotal = 0;
          let newTotalTax = 0;
          const skippedItems: string[] = [];
          const isTaxInclusive = conversionTaxMode === 'INCLUSIVE';

          for (const item of items) {
            const prod = productsMap[item.product_id];
            let da: Record<string, unknown> = {};
            if (prod?.domain_attributes) {
              try { da = JSON.parse(prod.domain_attributes); } catch { /* ignore */ }
            }
            const isReal = prod ? (prod.is_gst_applicable === 1 && da.gst_type !== 'PAPER') : false;
            const isPaper = prod ? (!isReal && (da.gst_type === 'PAPER' || Number(da.paper_mrp || 0) > 0 || Number(da.paper_purchase_price || 0) > 0 || Number(da.gst_purchase_price || 0) > 0 || Number(da.paper_stock || 0) > 0)) : false;

            if (isReal) hasRealGst = true;
            if (isPaper) hasPaper = true;

            const qty = Number(item.quantity) || 1;
            const taxRate = Number(prod?.tax_rate_percent || item.tax_rate || 18);
            let unitPrice = Number(item.unit_price) || 0;

            if (isPaper) {
              if (Number(da.paper_offer_price || 0) > 0) unitPrice = Number(da.paper_offer_price);
              else if (Number(da.paper_mrp || 0) > 0) unitPrice = Number(da.paper_mrp);
            }

            if (!unitPrice) unitPrice = Number(item.unit_price) || 0;

            let itemTaxable = 0;
            let itemTax = 0;
            let itemTotal = 0;

            if (isTaxInclusive && taxRate > 0) {
              itemTotal = Math.round(unitPrice * qty * 100) / 100;
              itemTaxable = Math.round((itemTotal / (1 + taxRate / 100)) * 100) / 100;
              itemTax = Math.round((itemTotal - itemTaxable) * 100) / 100;
            } else {
              itemTaxable = Math.round(unitPrice * qty * 100) / 100;
              itemTax = Math.round(itemTaxable * (taxRate / 100) * 100) / 100;
              itemTotal = Math.round((itemTaxable + itemTax) * 100) / 100;
            }

            newSubtotal += itemTaxable;
            newTotalTax += itemTax;
          }

          let discount = 0;
          if (inv.discount_type === 'PERCENTAGE' && Number(inv.discount_value) > 0) {
            discount = Math.round(newSubtotal * (Number(inv.discount_value) / 100) * 100) / 100;
          } else if (inv.discount_type === 'FIXED' && Number(inv.discount_value) > 0) {
            discount = Math.min(Number(inv.discount_value), newSubtotal);
          }

          const taxable = newSubtotal - discount;
          const effRate = newSubtotal > 0 ? newTotalTax / newSubtotal : 0;
          const adjTax = Math.round(taxable * effRate * 100) / 100;
          const pointsDiscount = Math.max(0, Number(inv.points_redeemed_discount) || 0);
          const scrapDeduction = inv.scrap_invoice_number ? Math.max(0, Number(inv.scrap_deduction) || 0) : 0;
          const returnDeduction = inv.return_invoice_number ? Math.max(0, Number(inv.return_deduction) || 0) : 0;
          const deductionsTotal = Math.round((pointsDiscount + scrapDeduction + returnDeduction) * 100) / 100;
          const grossTotal = Math.round((taxable + adjTax) * 100) / 100;
          const convTotal = items.length > 0
            ? Math.max(0, Math.round((grossTotal - deductionsTotal) * 100) / 100)
            : Number(inv.grand_total) || 0;

          totalBos += Number(inv.grand_total) || 0;
          totalTaxable += taxable;
          totalTax += adjTax;
          totalConverted += convTotal;

          previewInvoices.push({
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number as string,
            bos_grand_total: Number(inv.grand_total) || 0,
            taxable_amount: taxable,
            tax_amount: adjTax,
            converted_grand_total: convTotal,
            points_discount: pointsDiscount,
            scrap_deduction: scrapDeduction,
            return_deduction: returnDeduction,
            deductions_total: deductionsTotal,
            has_real_gst: hasRealGst,
            has_paper: hasPaper,
            skipped_items: skippedItems,
          });
        }

        if (!cancelled) {
          setConversionPreview({
            invoices: previewInvoices,
            total_bos_amount: Math.round(totalBos * 100) / 100,
            total_taxable_amount: Math.round(totalTaxable * 100) / 100,
            total_tax_amount: Math.round(totalTax * 100) / 100,
            total_converted_amount: Math.round(totalConverted * 100) / 100,
            has_real_gst: hasRealGst,
            has_paper: hasPaper,
            has_skipped: false,
          });
        }
      } catch (e) {
        console.error('[SalesHistory] Client preview fallback error:', e);
      } finally {
        if (!cancelled) setConversionPreviewLoading(false);
      }
    };

    runPreview();
    return () => { cancelled = true; };
  }, [conversionOpen, conversionTaxMode, selectedBosInvoices, tenantId, setConversionPreview, setConversionPreviewLoading]);

}
