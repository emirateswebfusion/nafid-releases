import type React from 'react';
import { type PurchaseBill } from '../purchaseTypes';
import { isDesktopRuntime } from '../../../data/client';
import { purchasesApi } from '../../../data/purchases';

export interface UsePurchaseBillSummariesContext {
  setBillSummaries: React.Dispatch<React.SetStateAction<Record<string, { totalQty: number; cgst: number; sgst: number; igst: number; taxableAmount: number; itemsCount: number; hasPaper?: boolean; isAllPaper?: boolean; }>>>;
}

/** Loads the purchase bill list (`loadBillSummaries`). */
export function usePurchaseBillSummaries(ctx: UsePurchaseBillSummariesContext) {
  const { setBillSummaries } = ctx;
  const loadBillSummaries = async (bills: PurchaseBill[]) => {
    if (!isDesktopRuntime()) return;
    const gstBills = bills.filter(b => b.bill_type === 'GST');
    if (gstBills.length === 0) {
      const summaries: Record<string, { totalQty: number; cgst: number; sgst: number; igst: number; taxableAmount: number; itemsCount: number; hasPaper?: boolean; isAllPaper?: boolean; }> = {};
      const estBills = bills.filter(b => b.bill_type === 'ESTIMATE');
      if (estBills.length > 0) {
        const estResults = await Promise.allSettled(
          estBills.map(b => purchasesApi.getPurchaseBillItems(b.purchase_bill_id))
        );
        estBills.forEach((bill, idx) => {
          const items: import("../purchaseTypes").PurchaseBillItem[] = (estResults[idx] as PromiseFulfilledResult<import("../purchaseTypes").PurchaseBillItem[]>)?.value || [];
          if (Array.isArray(items)) {
            const hasPaper = items.some(i => i.skip_stock_update === 1);
            const isAllPaper = items.length > 0 && items.every(i => i.skip_stock_update === 1);
            summaries[bill.purchase_bill_id] = {
              totalQty: items.reduce((a, i) => a + Number(i.quantity), 0),
              cgst: 0,
              sgst: 0,
              igst: 0,
              taxableAmount: bill.total_amount as number,
              itemsCount: items.length,
              hasPaper,
              isAllPaper,
            };
          }
        });
      }
      setBillSummaries(summaries);
      return;
    }
    const results = await Promise.allSettled(
      gstBills.map(b => purchasesApi.getPurchaseBillItems(b.purchase_bill_id))
    );
    const summaries: Record<string, { totalQty: number; cgst: number; sgst: number; igst: number; taxableAmount: number; itemsCount: number; hasPaper?: boolean; isAllPaper?: boolean; }> = {};
    gstBills.forEach((bill, idx) => {
      const items: import("../purchaseTypes").PurchaseBillItem[] = (results[idx] as PromiseFulfilledResult<import("../purchaseTypes").PurchaseBillItem[]>)?.value || [];
      if (Array.isArray(items)) {
        const totalGst = items.reduce((acc, item) => {
          const rate = item.tax_rate_percent || 0;
          if (item.is_gst_applicable === 1 && rate > 0) {
            return acc + Number(item.total_amount) * (rate / 100);
          }
          return acc;
        }, 0);
        const hasPaper = items.some(i => i.skip_stock_update === 1);
        const isAllPaper = items.length > 0 && items.every(i => i.skip_stock_update === 1);
        const isInterstate = !!bill.is_interstate;
        summaries[bill.purchase_bill_id] = {
          totalQty: items.reduce((a, i) => a + Number(i.quantity), 0),
          cgst: isInterstate ? 0 : totalGst / 2,
          sgst: isInterstate ? 0 : totalGst / 2,
          igst: isInterstate ? totalGst : 0,
          taxableAmount: (bill.total_amount ?? 0) - totalGst,
          itemsCount: items.length,
          hasPaper,
          isAllPaper,
        };
      }
    });
    // Also compute for Estimate bills (no tax)
    const estBills = bills.filter(b => b.bill_type === 'ESTIMATE');
    if (estBills.length > 0) {
      const estResults = await Promise.allSettled(
        estBills.map(b => purchasesApi.getPurchaseBillItems(b.purchase_bill_id))
      );
      estBills.forEach((bill, idx) => {
        const items: import("../purchaseTypes").PurchaseBillItem[] = (estResults[idx] as PromiseFulfilledResult<import("../purchaseTypes").PurchaseBillItem[]>)?.value || [];
        if (Array.isArray(items)) {
          const hasPaper = items.some(i => i.skip_stock_update === 1);
          const isAllPaper = items.length > 0 && items.every(i => i.skip_stock_update === 1);
          summaries[bill.purchase_bill_id] = {
            totalQty: items.reduce((a, i) => a + Number(i.quantity), 0),
            cgst: 0,
            sgst: 0,
            igst: 0,
            taxableAmount: bill.total_amount as number,
            itemsCount: items.length,
            hasPaper,
            isAllPaper,
          };
        }
      });
    }
    setBillSummaries(summaries);
  };

  return { loadBillSummaries };
}
