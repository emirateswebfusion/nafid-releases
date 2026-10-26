import React, { useEffect } from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { purchasesApi } from '../../../data/purchases';
import { settingsApi } from '../../../data/settings';
import type { PurchaseFormItem } from '../purchaseTypes';
import type { PurchaseBillEditingData } from '../purchaseTypes';

export interface UsePurchaseBillEditLoadContext {
  editingData: PurchaseBillEditingData | undefined;
  onItemsLoaded: (() => void) | undefined;
  setBillItems: React.Dispatch<React.SetStateAction<PurchaseFormItem[]>>;
  setBillNumber: React.Dispatch<React.SetStateAction<string>>;
  setInvoiceNumber: React.Dispatch<React.SetStateAction<string>>;
  setManualRoundOff: React.Dispatch<React.SetStateAction<string>>;
  setPaymentType: React.Dispatch<React.SetStateAction<"CASH" | "CREDIT" | "UPI" | "BANK_TRANSFER">>;
  setPeekedBillNumber: React.Dispatch<React.SetStateAction<string>>;
  setPriceCoding: React.Dispatch<React.SetStateAction<Record<string, string> | null>>;
  tenantId: string;
  type: "GST" | "ESTIMATE";
}

/**
 * When editing a saved bill, loads its items into the form and restores its round-off.
 */
export function usePurchaseBillEditLoad(ctx: UsePurchaseBillEditLoadContext) {
  const { editingData, onItemsLoaded, setBillItems, setBillNumber, setInvoiceNumber, setManualRoundOff, setPaymentType, setPeekedBillNumber, setPriceCoding, tenantId, type } = ctx;
  useEffect(() => {
    if (editingData) {
      setBillNumber(editingData.bill_number);
      setInvoiceNumber(editingData.invoice_number || '');
      setPaymentType((editingData.payment_type || 'CASH') as 'CASH' | 'CREDIT' | 'UPI' | 'BANK_TRANSFER');
      setBillItems([]);
      if (isDesktopRuntime() && tenantId) {
        purchasesApi.getPurchaseBillItems(editingData.purchase_bill_id)
          .then(items => {
            if (Array.isArray(items)) {
              const mapped = items.map((item) => ({
                product_id: item.product_id,
                name: item.product_name || item.name,
                quantity: String(item.quantity),
                purchase_price: String(item.purchase_price),
                selling_price: item.product_base_price != null && Number(item.product_base_price) > 0
                  ? String(item.product_base_price)
                  : (item.selling_price != null && Number(item.selling_price) > 0 ? String(item.selling_price) : ''),
                offer_price: item.product_offer_price != null && Number(item.product_offer_price) > 0
                  ? String(item.product_offer_price)
                  : (item.offer_price != null && Number(item.offer_price) > 0 ? String(item.offer_price) : ''),
                stock: item.product_stock != null ? String(item.product_stock) : '',
                is_gst_applicable: item.is_gst_applicable,
                tax_rate_percent: item.tax_rate_percent,
                hsn_sac_code: item.hsn_sac_code,
                skip_stock_update: item.skip_stock_update !== undefined && item.skip_stock_update !== null
                  ? Number(item.skip_stock_update)
                  : 0,
              }));
              setBillItems(mapped);
              if (mapped.length > 0) onItemsLoaded?.();

              // Calculate the round-off for editing
              const baseTotal = mapped.reduce((sum: number, i: typeof mapped[number]) => sum + (Number(i.quantity) || 0) * (Number(i.purchase_price) || 0), 0);
              let unroundedTotal = baseTotal;
              if (type === 'GST') {
                const gstTotal = mapped.reduce((acc: number, item: typeof mapped[number]) => {
                  const rate = item.tax_rate_percent || 0;
                  const itemTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);
                  if ((item.is_gst_applicable ?? 1) === 1 && rate > 0) {
                    return acc + itemTotal * (rate / 100);
                  }
                  return acc;
                }, 0);
                unroundedTotal = baseTotal + gstTotal;
              }
              const diff = (editingData.total_amount ?? 0) - unroundedTotal;
              setManualRoundOff(Math.abs(diff) > 0.001 ? diff.toFixed(2) : '0.00');
            }
          })
          .catch(console.error);
      }
    } else {
      setBillItems([]);
      setManualRoundOff('');
      if (isDesktopRuntime() && tenantId) {
        const getNumFn = hasBridge('dbPeekNextPurchaseBillNumber') ? purchasesApi.peekNextPurchaseBillNumber : purchasesApi.getNextPurchaseBillNumber;
        getNumFn({ tenant_id: tenantId, bill_type: type })
          .then(res => {
            if (res.success && res.billNumber) {
              setBillNumber(res.billNumber);
              setPeekedBillNumber(res.billNumber);
            }
          })
          .catch(console.error);
      }
    }
    if (isDesktopRuntime() && tenantId) {
      settingsApi.get({ tenant_id: tenantId, key: 'price_coding' })
        .then(res => { if (res) setPriceCoding(res); })
        .catch(console.error);
    }
  }, [tenantId, editingData, type]);

}
