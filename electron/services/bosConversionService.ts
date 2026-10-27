import type { DomainAttributes, InvoiceItemRow, InvoiceRow, ProductRow, PurchaseBillItemRow, SeriesSetting, SettingRow } from './typesA.js';
import { getDb } from '../db/localDb.js';
import { getGuaranteedNextInvoiceNumber, peekGuaranteedNextInvoiceNumber, requestServerInvoiceNumber } from './invoiceNumberService.js';
import crypto from 'node:crypto';
import * as invoicesSql from '../db/statements/invoices.js';
import { splitTaxAmount } from '../utils/taxSplit.js';
/** Bill-of-supply to GST invoice conversion (preview and apply). Called by electron/ipc handlers via invoicesService. */

/** IPC `db:previewConvertBosToGst` */
export function previewConvertBosToGst(payload: {
  invoice_ids: string[];
  tenant_id: string;
  tax_mode?: 'EXCLUSIVE' | 'INCLUSIVE';
}) {
  try {
    const db = getDb();
    const parseSetting = (row: SettingRow | null | undefined): unknown => {
      if (!row) return null;
      try { return JSON.parse(row.value); } catch { return row.value; }
    };

    const profitPctRow = invoicesSql.findSettingsByKey(db).get(payload.tenant_id || 'global', 'gst_profit_percentage') as SettingRow | undefined;
    const profitPercentage = profitPctRow ? Number((parseSetting(profitPctRow) as number) || 0) || 30 : 30;
    const multiplier = 1 + (profitPercentage / 100);

    const taxInclusiveRow = invoicesSql.findSettingsByKey(db).get(payload.tenant_id || 'global', 'gst_conversion_tax_inclusive') as SettingRow | undefined;
    const isTaxInclusive = payload.tax_mode ? (payload.tax_mode === 'INCLUSIVE') : Boolean(taxInclusiveRow ? parseSetting(taxInclusiveRow) : false);

    let totalBosAmount = 0;
    let totalTaxableAmount = 0;
    let totalTaxAmount = 0;
    let totalConvertedAmount = 0;
    let hasRealGstAny = false;
    let hasPaperAny = false;
    let hasSkippedAny = false;

    const invoices: Array<{
      invoice_id: string;
      invoice_number: string;
      bos_grand_total: number;
      taxable_amount: number;
      tax_amount: number;
      converted_grand_total: number;
      points_discount: number;
      scrap_deduction: number;
      return_deduction: number;
      deductions_total: number;
      has_real_gst: boolean;
      has_paper: boolean;
      skipped_items: string[];
    }> = [];

    for (const invoice_id of payload.invoice_ids) {
      const inv = invoicesSql.findInvoicesByInvoiceId2(db).get(invoice_id) as InvoiceRow | undefined;
      if (!inv) continue;
      const tid = inv.tenant_id || payload.tenant_id || 'global';

      const items = invoicesSql.findInvoiceItemsByInvoiceId3(db).all(invoice_id) as InvoiceItemRow[];
      let newSubtotal = 0;
      let newTotalTax = 0;
      let hasRealGst = false;
      let hasPaper = false;
      const skippedItems: string[] = [];
      let convertedItemCount = 0;

      for (const item of items) {
        const cleanName = item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
        const gstProduct = invoicesSql.findOneProductByProductId(db).get(tid, item.product_id, cleanName + ' (GST)', cleanName, item.product_id) as ProductRow | undefined;

        if (!gstProduct) {
          skippedItems.push(item.name || item.product_id);
          continue;
        }

        const originalQty = Number(item.quantity) || 0;

        const gstStockRows = invoicesSql.findPurchaseBillItemsByProductIdAndBillType(db).all(gstProduct.product_id, tid) as PurchaseBillItemRow[];

        let da: DomainAttributes = {};
        try { da = JSON.parse(gstProduct.domain_attributes || '{}'); } catch { /* ignore */ }

        const isRealGstProduct = gstProduct.is_gst_applicable === 1 && da.gst_type !== 'PAPER';
        const isPaperProduct = !isRealGstProduct && (
          da.gst_type === 'PAPER' ||
          (da.paper_mrp !== undefined && da.paper_mrp !== null && Number(da.paper_mrp) > 0) ||
          (da.paper_purchase_price !== undefined && da.paper_purchase_price !== null && Number(da.paper_purchase_price) > 0) ||
          (da.gst_purchase_price !== undefined && da.gst_purchase_price !== null && Number(da.gst_purchase_price) > 0) ||
          (da.paper_stock !== undefined && Number(da.paper_stock) > 0)
        );

        if (isRealGstProduct) hasRealGst = true;
        if (isPaperProduct) hasPaper = true;

        if (!isRealGstProduct && !isPaperProduct && gstStockRows.length === 0) {
          skippedItems.push(item.name || item.product_id);
          continue;
        }

        const gstSoldRow = invoicesSql.findInvoiceItemsByProductIdAndInvoiceType(db).get(gstProduct.product_id, tid, invoice_id) as { total_gst_sold?: number | string | null } | undefined;
        const totalGstSold = gstSoldRow ? Number(gstSoldRow.total_gst_sold) : 0;

        let remainingSold = totalGstSold;
        const availableGstBatches: { item_id: string; qty: number; purchase_price: number; selling_price: number; offer_price: number; tax_rate_percent: number }[] = [];

        for (const batch of gstStockRows) {
          const batchQty = Number(batch.quantity) || 0;
          const alreadyConsumed = Math.min(batchQty, remainingSold);
          const availableQty = batchQty - alreadyConsumed;
          remainingSold = Math.max(0, remainingSold - alreadyConsumed);
          if (availableQty > 0) {
            availableGstBatches.push({
              item_id: batch.item_id,
              qty: availableQty,
              purchase_price: Number(batch.purchase_price) || 0,
              selling_price: Number(batch.selling_price) || 0,
              offer_price: Number(batch.offer_price) || 0,
              tax_rate_percent: Number(batch.tax_rate_percent) || 0,
            });
          }
        }

        if (gstStockRows.length === 0 && isPaperProduct && Number(da.paper_stock || 0) > 0) {
          const paperStock = Number(da.paper_stock) || 0;
          const availPaper = Math.max(0, paperStock - totalGstSold);
          if (availPaper > 0) {
            availableGstBatches.push({
              item_id: 'manual-paper-stock',
              qty: availPaper,
              purchase_price: Number(da.paper_purchase_price || da.gst_purchase_price || 0),
              selling_price: Number(da.paper_mrp || da.paper_base_price || 0),
              offer_price: Number(da.paper_offer_price || da.paper_offer || 0),
              tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
            });
          }
        } else if (isRealGstProduct && gstStockRows.length === 0) {
          const realStock = Math.max(0, Number(gstProduct.current_stock) || 0);
          const availReal = Math.max(0, realStock + originalQty - totalGstSold);
          if (availReal > 0) {
            availableGstBatches.push({
              item_id: 'real-gst-stock',
              qty: availReal,
              purchase_price: Number(gstProduct.purchase_price) || 0,
              selling_price: Number(gstProduct.base_price) || 0,
              offer_price: Number(gstProduct.offer_price) || 0,
              tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
            });
          }
        }

        const totalAvailableGstStock = availableGstBatches.reduce((sum, b) => sum + b.qty, 0);
        const qtyToConvert = isRealGstProduct ? originalQty : Math.min(originalQty, totalAvailableGstStock);

        if (qtyToConvert <= 0) {
          skippedItems.push(item.name || item.product_id);
          continue;
        }

        let newUnitPrice = 0;
        let batchTaxRate = 0;

        if (isRealGstProduct) {
          newUnitPrice = Number(item.unit_price) || 0;
          batchTaxRate = Number(item.tax_rate) || Number(gstProduct.tax_rate_percent) || 0;
        } else {
          let paperSellingPrice = 0;
          let paperPurchasePrice = 0;

          for (const batch of availableGstBatches) {
            if (batch.offer_price > 0 && !paperSellingPrice) {
              paperSellingPrice = batch.offer_price;
              if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
            } else if (batch.selling_price > 0 && !paperSellingPrice) {
              paperSellingPrice = batch.selling_price;
              if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
            }
            if (batch.purchase_price > 0 && !paperPurchasePrice) {
              paperPurchasePrice = batch.purchase_price;
              if (batch.tax_rate_percent > 0 && !batchTaxRate) batchTaxRate = batch.tax_rate_percent;
            }
          }

          if (!paperSellingPrice || paperSellingPrice <= 0) {
            if (da.paper_offer_price && Number(da.paper_offer_price) > 0) paperSellingPrice = Number(da.paper_offer_price);
            else if (da.paper_offer && Number(da.paper_offer) > 0) paperSellingPrice = Number(da.paper_offer);
            else if (da.paper_mrp && Number(da.paper_mrp) > 0) paperSellingPrice = Number(da.paper_mrp);
            else if (da.paper_base_price && Number(da.paper_base_price) > 0) paperSellingPrice = Number(da.paper_base_price);
          }

          if (!paperPurchasePrice || paperPurchasePrice <= 0) {
            paperPurchasePrice = Number(da.paper_purchase_price || da.gst_purchase_price || gstProduct.purchase_price) || 0;
          }

          if (paperSellingPrice > 0) {
            newUnitPrice = paperSellingPrice;
          } else if (paperPurchasePrice > 0) {
            newUnitPrice = Math.round(paperPurchasePrice * multiplier * 100) / 100;
          } else {
            newUnitPrice = Number(item.unit_price) || 0;
          }
        }

        if (!newUnitPrice || newUnitPrice <= 0) {
          newUnitPrice = Number(item.unit_price) || 0;
        }

        const taxRate = Number(gstProduct.tax_rate_percent) || batchTaxRate || Number(item.tax_rate) || 0;
        let itemTaxable = 0;
        let itemTax = 0;
        let itemTotal = 0;

        if (isTaxInclusive && taxRate > 0) {
          itemTotal = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
          itemTaxable = Math.round((itemTotal / (1 + taxRate / 100)) * 100) / 100;
          itemTax = Math.round((itemTotal - itemTaxable) * 100) / 100;
        } else {
          itemTaxable = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
          itemTax = Math.round(itemTaxable * (taxRate / 100) * 100) / 100;
          itemTotal = Math.round((itemTaxable + itemTax) * 100) / 100;
        }

        newSubtotal += itemTaxable;
        newTotalTax += itemTax;
        convertedItemCount++;

        if (qtyToConvert < originalQty) {
          skippedItems.push(`${item.name} (partial)`);
        }
      }

      newSubtotal = Math.round(newSubtotal * 100) / 100;
      newTotalTax = Math.round(newTotalTax * 100) / 100;

      let newDiscountTotal = 0;
      if (inv.discount_type === 'PERCENTAGE' && Number(inv.discount_value) > 0) {
        newDiscountTotal = Math.round(newSubtotal * (Number(inv.discount_value) / 100) * 100) / 100;
      } else if (inv.discount_type === 'FIXED' && Number(inv.discount_value) > 0) {
        newDiscountTotal = Math.min(Number(inv.discount_value), newSubtotal);
      }

      const taxableAmount = newSubtotal - newDiscountTotal;
      const effectiveTaxRate = newSubtotal > 0 ? newTotalTax / newSubtotal : 0;
      const adjustedTax = Math.round(taxableAmount * effectiveTaxRate * 100) / 100;
      const pointsDiscount = Math.max(0, Number(inv.points_redeemed_discount) || 0);
      const scrapDeduction = inv.scrap_invoice_number ? Math.max(0, Number(inv.scrap_deduction) || 0) : 0;
      const returnDeduction = inv.return_invoice_number ? Math.max(0, Number(inv.return_deduction) || 0) : 0;
      const deductionsTotal = Math.round((pointsDiscount + scrapDeduction + returnDeduction) * 100) / 100;
      const grossConvertedTotal = Math.round((taxableAmount + adjustedTax) * 100) / 100;
      const convertedGrandTotal = convertedItemCount > 0
        ? Math.max(0, Math.round((grossConvertedTotal - deductionsTotal) * 100) / 100)
        : Number(inv.grand_total) || 0;

      totalBosAmount += Number(inv.grand_total) || 0;
      totalTaxableAmount += taxableAmount;
      totalTaxAmount += adjustedTax;
      totalConvertedAmount += convertedGrandTotal;
      if (hasRealGst) hasRealGstAny = true;
      if (hasPaper) hasPaperAny = true;
      if (skippedItems.length > 0) hasSkippedAny = true;

      invoices.push({
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        bos_grand_total: Number(inv.grand_total) || 0,
        taxable_amount: taxableAmount,
        tax_amount: adjustedTax,
        converted_grand_total: convertedGrandTotal,
        points_discount: pointsDiscount,
        scrap_deduction: scrapDeduction,
        return_deduction: returnDeduction,
        deductions_total: deductionsTotal,
        has_real_gst: hasRealGst,
        has_paper: hasPaper,
        skipped_items: skippedItems,
      });
    }

    return {
      success: true,
      invoices,
      total_bos_amount: Math.round(totalBosAmount * 100) / 100,
      total_taxable_amount: Math.round(totalTaxableAmount * 100) / 100,
      total_tax_amount: Math.round(totalTaxAmount * 100) / 100,
      total_converted_amount: Math.round(totalConvertedAmount * 100) / 100,
      has_real_gst: hasRealGstAny,
      has_paper: hasPaperAny,
      has_skipped: hasSkippedAny,
    };
  } catch (error) {
    console.error('[db:previewConvertBosToGst]', error);
    return { success: false, error: (error as Error).message || 'Failed to preview conversion' };
  }
}

/** IPC `db:convertBosToGst` */
export async function convertBosToGst(payload: {
  invoice_ids: string[];
  tenant_id: string;
  user_id: string;
  tax_mode?: 'EXCLUSIVE' | 'INCLUSIVE';
}) {
  try {
    console.log('[convertBosToGst] Starting conversion for', payload.invoice_ids.length, 'invoices');
    const db = getDb();

    // Some settings are stored raw (server-synced) and some JSON-encoded — parse both.
    const parseSetting = (row: SettingRow | null | undefined): unknown => {
      if (!row) return null;
      try { return JSON.parse(row.value); } catch { return row.value; }
    };

    // Get shop state
    const shopStateRow = invoicesSql.findSettingsByKey(db).get(payload.tenant_id || 'global', 'shop_state') as SettingRow | undefined;
    const shopState: string = shopStateRow ? ((parseSetting(shopStateRow) as string) || 'KL') : 'KL';

    // Get profit percentage
    const profitPctRow = invoicesSql.findSettingsByKey(db).get(payload.tenant_id || 'global', 'gst_profit_percentage') as SettingRow | undefined;
    const profitPercentage = profitPctRow ? Number((parseSetting(profitPctRow) as number) || 0) || 30 : 30;
    const multiplier = 1 + (profitPercentage / 100);

    // Get tax inclusive setting
    const taxInclusiveRow = invoicesSql.findSettingsByKey(db).get(payload.tenant_id || 'global', 'gst_conversion_tax_inclusive') as SettingRow | undefined;
    const isTaxInclusive = payload.tax_mode ? (payload.tax_mode === 'INCLUSIVE') : Boolean(taxInclusiveRow ? parseSetting(taxInclusiveRow) : false);

    const results: { invoice_id: string; old_number: string; new_number: string; success: boolean; error?: string }[] = [];

    for (const invoice_id of payload.invoice_ids) {
      // Look up invoice number first so it's available even if the transaction fails
      let invoiceNumber = '';
      const invLookup = invoicesSql.findInvoicesByInvoiceIdInvoiceNumberAndInvoiceType(db).get(invoice_id) as InvoiceRow | undefined;
      if (invLookup) {
        invoiceNumber = invLookup.invoice_number;
      }

      try {
        const numberInvoice = invoicesSql.findInvoicesByInvoiceId2(db).get(invoice_id) as InvoiceRow | undefined;
        let preallocatedInvoiceNumber = '';
        if (numberInvoice && numberInvoice.invoice_type !== 'GST' && !numberInvoice.converted_to_invoice_id) {
          const numberTid = numberInvoice.tenant_id || payload.tenant_id || 'global';
          const numberTripleRow: SettingRow | undefined = invoicesSql.findSettingsByKey(db).get(numberTid, 'three_invoice_series') as SettingRow | undefined
            || invoicesSql.findSettingsByKey(db).get('global', 'three_invoice_series') as SettingRow | undefined;
          const numberTriple = numberTripleRow ? (parseSetting(numberTripleRow) as SeriesSetting) : null;
          const numberIsB2B = Boolean(numberInvoice.customer_gstin && String(numberInvoice.customer_gstin).trim() !== '');
          const numberSeries = numberTriple?.enabled ? (numberIsB2B ? 'gst_b2b' : 'gst_b2c') : 'gst';
          const numberConfigKey = numberSeries === 'gst_b2b' ? 'gst_b2b_invoice_counter_config'
            : numberSeries === 'gst_b2c' ? 'gst_b2c_invoice_counter_config'
            : 'gst_invoice_counter_config';
          const localNext = peekGuaranteedNextInvoiceNumber(db, numberTid, numberConfigKey);
          const serverAllocation = await requestServerInvoiceNumber(db, numberTid, numberSeries, numberConfigKey, localNext.counter, 1500);
          if (serverAllocation.success) preallocatedInvoiceNumber = serverAllocation.invoiceNumber;
        }

        const invoice = db.transaction(() => {
          // Get the invoice
          const inv = invoicesSql.findInvoicesByInvoiceId2(db).get(invoice_id) as InvoiceRow | undefined;
          if (!inv) throw new Error('Invoice not found');
          if (inv.invoice_type === 'GST') throw new Error('Invoice is already a GST invoice');
          if (inv.converted_to_invoice_id) throw new Error('Invoice is already converted');

          const tid = inv.tenant_id || payload.tenant_id || 'global';
          const oldInvoiceNumber = inv.invoice_number;

          // Check if three invoice series is enabled
          const tripleSeriesRow: SettingRow | undefined = invoicesSql.findSettingsByKey(db).get(tid, 'three_invoice_series') as SettingRow | undefined
            || invoicesSql.findSettingsByKey(db).get('global', 'three_invoice_series') as SettingRow | undefined;
          const tripleSeries = tripleSeriesRow ? (parseSetting(tripleSeriesRow) as SeriesSetting) : null;

          const isB2B = Boolean(inv.customer_gstin && inv.customer_gstin.trim() !== '');
          let configKey: string;

          if (tripleSeries && tripleSeries.enabled) {
            configKey = isB2B ? 'gst_b2b_invoice_counter_config' : 'gst_b2c_invoice_counter_config';
          } else {
            // Dedicated GST counter so GST invoices NEVER steal or continue regular Bill of Supply numbers
            const dualSeriesRow2: SettingRow | undefined = invoicesSql.findSettingsByKey(db).get(tid, 'dual_invoice_series') as SettingRow | undefined
              || invoicesSql.findSettingsByKey(db).get('global', 'dual_invoice_series') as SettingRow | undefined;
            const dualSeries2 = dualSeriesRow2 ? (parseSetting(dualSeriesRow2) as SeriesSetting) : null;
            if (dualSeries2 && dualSeries2.enabled) {
              configKey = 'gst_invoice_counter_config';
            } else {
              configKey = 'gst_invoice_counter_config';
            }
          }

          const { invoiceNumber: newInvoiceNumber } = preallocatedInvoiceNumber
            ? { invoiceNumber: preallocatedInvoiceNumber }
            : getGuaranteedNextInvoiceNumber(db, tid, configKey);

          // Get invoice items
          const items = invoicesSql.findInvoiceItemsByInvoiceId3(db).all(invoice_id) as InvoiceItemRow[];

          let newSubtotal = 0;
          let newTotalTax = 0;
          const copyItems: { item_id: string; source_item_id: string; product_id: string; name: string; quantity: number; is_service_item: number; newUnitPrice: number; newTotal: number; newTaxAmount: number; taxRate: number; bosUnitPrice: number; bosTax: number; bosTotal: number; qtyFromPaper: number; paperConsumed: { item_id: string; qty: number }[]; hsn_sac_code?: string | null; uom?: string | null }[] = [];
          const skippedItems: string[] = [];

          for (const item of items) {
            const cleanName = item.name.replace(/\s*\((GST|EST|Estimate)\)$/i, '').trim();
            const gstProduct = invoicesSql.findOneProductByProductId(db).get(tid, item.product_id, cleanName + ' (GST)', cleanName, item.product_id) as ProductRow | undefined;

            if (!gstProduct) {
              skippedItems.push(`${item.name || item.product_id} (Product not found)`);
              continue;
            }

            const originalQty = Number(item.quantity) || 0;

            // ─── Compute available GST stock WITH rates from all GST purchase bills (FIFO) ───
            // Includes both Real GST purchases (skip_stock_update = 0) and Paper GST purchases (skip_stock_update = 1)
            const gstStockRows = invoicesSql.findPurchaseBillItemsByProductIdAndBillType(db).all(gstProduct.product_id, tid) as PurchaseBillItemRow[];

            let da: DomainAttributes = {};
            try { da = JSON.parse(gstProduct.domain_attributes || '{}'); } catch { /* ignore */ }

            // A product is Real GST if is_gst_applicable is 1 and its gst_type is not explicitly PAPER
            const isRealGstProduct = gstProduct.is_gst_applicable === 1 && da.gst_type !== 'PAPER';

            const isPaperProduct = !isRealGstProduct && (
              da.gst_type === 'PAPER' ||
              (da.paper_mrp !== undefined && da.paper_mrp !== null && Number(da.paper_mrp) > 0) ||
              (da.paper_purchase_price !== undefined && da.paper_purchase_price !== null && Number(da.paper_purchase_price) > 0) ||
              (da.gst_purchase_price !== undefined && da.gst_purchase_price !== null && Number(da.gst_purchase_price) > 0) ||
              (da.paper_stock !== undefined && Number(da.paper_stock) > 0)
            );

            // ─── Rule 3: Skip estimate (not paper) products from bill conversion ───
            if (!isRealGstProduct && !isPaperProduct && gstStockRows.length === 0) {
              skippedItems.push(`${item.name || item.product_id} (Estimate non-paper product skipped)`);
              continue;
            }

            // Total GST quantity already sold on existing GST invoices
            const gstSoldRow = invoicesSql.findInvoiceItemsByProductIdAndInvoiceType(db).get(gstProduct.product_id, tid, invoice_id) as { total_gst_sold?: number | string | null } | undefined;
            const totalGstSold = gstSoldRow ? Number(gstSoldRow.total_gst_sold) : 0;

            // Calculate remaining qty per purchase bill item (FIFO consumption)
            let remainingSold = totalGstSold;
            const availableGstBatches: { item_id: string; qty: number; purchase_price: number; selling_price: number; offer_price: number; tax_rate_percent: number }[] = [];

            for (const batch of gstStockRows) {
              const batchQty = Number(batch.quantity) || 0;
              const alreadyConsumed = Math.min(batchQty, remainingSold);
              const availableQty = batchQty - alreadyConsumed;
              remainingSold = Math.max(0, remainingSold - alreadyConsumed);
              
              if (availableQty > 0) {
                availableGstBatches.push({
                  item_id: batch.item_id,
                  qty: availableQty,
                  purchase_price: Number(batch.purchase_price) || 0,
                  selling_price: Number(batch.selling_price) || 0,
                  offer_price: Number(batch.offer_price) || 0,
                  tax_rate_percent: Number(batch.tax_rate_percent) || 0,
                });
              }
            }

            // If manual paper stock is defined in product domain_attributes without purchase bill
            if (gstStockRows.length === 0 && isPaperProduct && Number(da.paper_stock || 0) > 0) {
              const paperStock = Number(da.paper_stock) || 0;
              const availPaper = Math.max(0, paperStock - totalGstSold);
              if (availPaper > 0) {
                availableGstBatches.push({
                  item_id: 'manual-paper-stock',
                  qty: availPaper,
                  purchase_price: Number(da.paper_purchase_price || da.gst_purchase_price || 0),
                  selling_price: Number(da.paper_mrp || da.paper_base_price || 0),
                  offer_price: Number(da.paper_offer_price || da.paper_offer || 0),
                  tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
                });
              }
            } else if (isRealGstProduct && gstStockRows.length === 0) {
              const realStock = Math.max(0, Number(gstProduct.current_stock) || 0);
              const availReal = Math.max(0, realStock + originalQty - totalGstSold);
              if (availReal > 0) {
                availableGstBatches.push({
                  item_id: 'real-gst-stock',
                  qty: availReal,
                  purchase_price: Number(gstProduct.purchase_price) || 0,
                  selling_price: Number(gstProduct.base_price) || 0,
                  offer_price: Number(gstProduct.offer_price) || 0,
                  tax_rate_percent: Number(gstProduct.tax_rate_percent) || 0,
                });
              }
            }

            const totalAvailableGstStock = availableGstBatches.reduce((sum, b) => sum + b.qty, 0);
            const qtyToConvert = isRealGstProduct ? originalQty : Math.min(originalQty, totalAvailableGstStock);

            if (qtyToConvert <= 0) {
              skippedItems.push(`${item.name || item.product_id} (0 of ${originalQty} converted - no GST stock available)`);
              continue;
            }

            // ─── Determine Unit Price based on user specifications: ───
            let newUnitPrice: number;
            let batchTaxRate = 0;

            if (isRealGstProduct) {
              // ─── Rule 1: Real GST product -> same BOS price (no any changes) ───
              newUnitPrice = Number(item.unit_price) || 0;
              batchTaxRate = Number(item.tax_rate) || Number(gstProduct.tax_rate_percent) || 0;
            } else {
              // ─── Rule 2: Paper details available -> use paper MRP/offer; if not available -> use settings percentage on purchase price ───
              let paperSellingPrice = 0;
              let paperPurchasePrice = 0;

              for (const batch of availableGstBatches) {
                if (batch.offer_price > 0 && !paperSellingPrice) {
                  paperSellingPrice = batch.offer_price;
                  if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
                } else if (batch.selling_price > 0 && !paperSellingPrice) {
                  paperSellingPrice = batch.selling_price;
                  if (batch.tax_rate_percent > 0) batchTaxRate = batch.tax_rate_percent;
                }
                if (batch.purchase_price > 0 && !paperPurchasePrice) {
                  paperPurchasePrice = batch.purchase_price;
                  if (batch.tax_rate_percent > 0 && !batchTaxRate) batchTaxRate = batch.tax_rate_percent;
                }
              }

              if (!paperSellingPrice || paperSellingPrice <= 0) {
                if (da.paper_offer_price && Number(da.paper_offer_price) > 0) {
                  paperSellingPrice = Number(da.paper_offer_price);
                } else if (da.paper_offer && Number(da.paper_offer) > 0) {
                  paperSellingPrice = Number(da.paper_offer);
                } else if (da.paper_mrp && Number(da.paper_mrp) > 0) {
                  paperSellingPrice = Number(da.paper_mrp);
                } else if (da.paper_base_price && Number(da.paper_base_price) > 0) {
                  paperSellingPrice = Number(da.paper_base_price);
                }
              }

              if (!paperPurchasePrice || paperPurchasePrice <= 0) {
                paperPurchasePrice = Number(da.paper_purchase_price || da.gst_purchase_price || gstProduct.purchase_price) || 0;
              }

              if (paperSellingPrice > 0) {
                newUnitPrice = paperSellingPrice;
              } else if (paperPurchasePrice > 0) {
                newUnitPrice = Math.round(paperPurchasePrice * multiplier * 100) / 100;
              } else {
                newUnitPrice = Number(item.unit_price) || 0;
              }
            }

            if (!newUnitPrice || newUnitPrice <= 0) {
              newUnitPrice = Number(item.unit_price) || 0;
            }

            const taxRate = Number(gstProduct.tax_rate_percent) || batchTaxRate || Number(item.tax_rate) || 0;
            let itemTaxable: number;
            let itemTax: number;
            let itemTotal: number;
            let finalUnitPrice: number;

            if (isTaxInclusive && taxRate > 0) {
              itemTotal = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
              itemTaxable = Math.round((itemTotal / (1 + taxRate / 100)) * 100) / 100;
              itemTax = Math.round((itemTotal - itemTaxable) * 100) / 100;
              finalUnitPrice = Math.round((newUnitPrice / (1 + taxRate / 100)) * 100) / 100;
            } else {
              itemTaxable = Math.round(newUnitPrice * qtyToConvert * 100) / 100;
              itemTax = Math.round(itemTaxable * (taxRate / 100) * 100) / 100;
              finalUnitPrice = newUnitPrice;
            }

            newSubtotal += itemTaxable;
            newTotalTax += itemTax;

            copyItems.push({
              item_id: crypto.randomUUID(),
              source_item_id: item.item_id as string,
              product_id: gstProduct.product_id,
              name: gstProduct.name,
              quantity: qtyToConvert,
              is_service_item: item.is_service_item ? 1 : 0,
              newUnitPrice: finalUnitPrice,
              newTotal: itemTaxable,
              newTaxAmount: itemTax,
              taxRate: Number(taxRate) || 0,
              bosUnitPrice: Number(item.unit_price) || 0,
              bosTax: Number(item.tax_amount) || 0,
              bosTotal: Number(item.total) || 0,
              qtyFromPaper: qtyToConvert,
              paperConsumed: [],
              hsn_sac_code: gstProduct.hsn_sac_code || item.hsn_sac_code || null,
              uom: gstProduct.uom || item.uom || 'PCS',
            });

            if (qtyToConvert < originalQty) {
              skippedItems.push(`${item.name || item.product_id} (${qtyToConvert} of ${originalQty} converted, balance ${originalQty - qtyToConvert} skipped - limited GST stock)`);
            }
          }

          if (copyItems.length === 0) {
            throw new Error(skippedItems.length > 0 ? skippedItems.join('; ') : 'No items have available GST stock. Conversion failed.');
          }

          newSubtotal = Math.round(newSubtotal * 100) / 100;
          newTotalTax = Math.round(newTotalTax * 100) / 100;

          // Recalculate discount on new subtotal
          let newDiscountTotal = 0;
          if (inv.discount_type === 'PERCENTAGE' && Number(inv.discount_value) > 0) {
            newDiscountTotal = Math.round(newSubtotal * (Number(inv.discount_value) / 100) * 100) / 100;
          } else if (inv.discount_type === 'FIXED' && Number(inv.discount_value) > 0) {
            newDiscountTotal = Math.min(Number(inv.discount_value), newSubtotal);
          }

          const taxableAmount = newSubtotal - newDiscountTotal;
          const effectiveTaxRate = newSubtotal > 0 ? newTotalTax / newSubtotal : 0;
          const adjustedTax = Math.round(taxableAmount * effectiveTaxRate * 100) / 100;
          const pointsDiscount = Math.max(0, Number(inv.points_redeemed_discount) || 0);
          const scrapDeduction = inv.scrap_invoice_number ? Math.max(0, Number(inv.scrap_deduction) || 0) : 0;
          const returnDeduction = inv.return_invoice_number ? Math.max(0, Number(inv.return_deduction) || 0) : 0;
          const deductionsTotal = Math.round((pointsDiscount + scrapDeduction + returnDeduction) * 100) / 100;
          const grossGrandTotal = Math.round((taxableAmount + adjustedTax) * 100) / 100;
          const newGrandTotal = Math.max(0, Math.round((grossGrandTotal - deductionsTotal) * 100) / 100);

          const newInvoiceId = crypto.randomUUID();

          const isInterStateConv = shopState.trim().toUpperCase() !== '' && (inv.customer_state || '').trim().toUpperCase() !== '' && shopState.trim().toUpperCase() !== (inv.customer_state || '').trim().toUpperCase();
          const convSupplyType: 'INTRA' | 'INTER' = isInterStateConv ? 'INTER' : 'INTRA';
          const invoiceTaxSplit = splitTaxAmount(adjustedTax);
          const convCgstTotal = isInterStateConv ? 0 : invoiceTaxSplit.cgst;
          const convSgstTotal = isInterStateConv ? 0 : invoiceTaxSplit.sgst;
          const convIgstTotal = isInterStateConv ? adjustedTax : 0;

          const originalReceived = Number(inv.received_amount) || 0;
          const wasFullyPaid = (Number(inv.grand_total) || 0) > 0
            && (Number(inv.balance_amount) || 0) <= 0
            && (String(inv.payment_method || '').toUpperCase() !== 'PENDING' || originalReceived > 0);
          const newReceivedAmount = wasFullyPaid ? newGrandTotal : Math.min(originalReceived, newGrandTotal);
          const newBalanceAmount = Math.max(0, Math.round((newGrandTotal - newReceivedAmount) * 100) / 100);

          // 1. Create the GST invoice as a NEW row (copy) — the BoS stays intact.
          //    No stock movement: stock was already deducted when the BoS was sold.
          //    Inherits the actual bill date (created_at) from the original Bill of Supply!
          const actualBillDate = inv.created_at || new Date().toISOString();

          invoicesSql.insertInvoice3(db).run(
            newInvoiceId,
            inv.tenant_id,
            inv.user_id,
            newInvoiceNumber,
            newSubtotal,
            adjustedTax,
            newDiscountTotal,
            inv.discount_type || 'FIXED',
            inv.discount_value || 0,
            newGrandTotal,
            inv.payment_method || 'CASH',
            inv.split_details || null,
            newReceivedAmount,
            newBalanceAmount,
            inv.customer_id || null,
            inv.customer_name || null,
            inv.customer_phone || null,
            inv.customer_gstin || null,
            inv.customer_state || null,
            inv.customer_address || null,
            inv.biller_staff_id || null,
            inv.sales_staff_id || null,
            inv.notes || null,
            inv.description || null,
            invoice_id,
            oldInvoiceNumber,
            convCgstTotal,
            convSgstTotal,
            convIgstTotal,
            convSupplyType,
            inv.points_redeemed ?? null,
            pointsDiscount > 0 ? pointsDiscount : null,
            scrapDeduction > 0 ? scrapDeduction : null,
            scrapDeduction > 0 ? (inv.scrap_invoice_number || null) : null,
            returnDeduction > 0 ? returnDeduction : null,
            returnDeduction > 0 ? (inv.return_invoice_number || null) : null,
            inv.counts_in_revenue ?? 1, inv.bill_purpose || 'SALE', actualBillDate
          );

          // 2. Copy the priced items — they remember their original BoS values so
          //    returns refund what the customer actually paid.
          const insertItemStmt = invoicesSql.insertInvoiceItem4(db);

          for (const ci of copyItems) {
            const itemTaxSplit = splitTaxAmount(ci.newTaxAmount);
            const itemCgst = isInterStateConv ? 0 : itemTaxSplit.cgst;
            const itemSgst = isInterStateConv ? 0 : itemTaxSplit.sgst;
            const itemIgst = isInterStateConv ? ci.newTaxAmount : 0;
            const itemCgstRate = isInterStateConv ? 0 : Math.round((ci.taxRate / 2) * 100) / 100;
            const itemSgstRate = isInterStateConv ? 0 : Math.round((ci.taxRate / 2) * 100) / 100;
            const itemIgstRate = isInterStateConv ? ci.taxRate : 0;

            insertItemStmt.run(
              ci.item_id,
              newInvoiceId,
              inv.tenant_id,
              ci.product_id,
              ci.name,
              ci.quantity,
              ci.newUnitPrice,
              ci.newTaxAmount,
              ci.newTotal,
              ci.is_service_item,
              ci.source_item_id,
              ci.bosUnitPrice,
              ci.bosTax,
              ci.bosTotal,
              ci.qtyFromPaper,
              itemCgstRate,
              itemSgstRate,
              itemIgstRate,
              itemCgst,
              itemSgst,
              itemIgst,
              convSupplyType,
              ci.hsn_sac_code || null,
              ci.uom || 'PCS',
              actualBillDate
            );
          }

          // 3. Mark the BoS as superseded — linked to its GST copy (original Estimate remains untouched)
          invoicesSql.updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber(db).run(newInvoiceId, newInvoiceNumber, invoice_id);

          return {
            old_number: oldInvoiceNumber,
            new_number: newInvoiceNumber,
            skipped: skippedItems.length > 0 ? skippedItems : undefined
          };
        })();

        results.push({
          invoice_id,
          old_number: invoice.old_number,
          new_number: invoice.new_number,
          success: true,
          ...(invoice.skipped ? { skipped_items: invoice.skipped } : {})
        });
        console.log('[convertBosToGst] Converted', invoice_id, '→', invoice.new_number);
      } catch (err) {
        console.error('[convertBosToGst] Failed', invoice_id, (err as Error).message);
        results.push({ invoice_id, old_number: invoiceNumber, new_number: '', success: false, error: (err as Error)?.message || 'Conversion failed' });
      }
    }

    console.log('[convertBosToGst] Completed', results.filter(r => r.success).length, '/', results.length);
    return { success: true, results };
  } catch (error) {
    console.error('[convertBosToGst] Fatal error', (error as Error).message);
    return { success: false, error: 'Operation failed' };
  }
}
