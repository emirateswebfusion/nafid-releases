import type React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { isDesktopRuntime } from '../../../data/client';
import { purchasesApi } from '../../../data/purchases';
import type { PurchaseFormItem } from '../purchaseTypes';
import type { PurchaseBillEditingData } from '../purchaseTypes';

export interface UsePurchaseBillSaveContext {
  billDate: string;
  billItems: PurchaseFormItem[];
  billNumber: string;
  editingData: PurchaseBillEditingData | undefined;
  getBillTotal: () => number;
  getOtherSectionItems: (() => PurchaseFormItem[]) | undefined;
  invoiceNumber: string;
  manualRoundOff: string;
  notes: string;
  onSaved: () => void;
  onStatusMessage: (msg: { text: string; type: "success" | "error"; } | null) => void;
  paymentType: "CASH" | "CREDIT" | "UPI" | "BANK_TRANSFER";
  peekedBillNumber: string;
  setBillNumber: React.Dispatch<React.SetStateAction<string>>;
  setCreatedProductIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  supplierId: string;
  supplierName: string;
  tenantId: string;
  type: "GST" | "ESTIMATE";
}

/**
 * Save the bill being entered (`handleSave`): validates, creates or updates the purchase bill with its items and
 * reports back to the screen.
 */
export function usePurchaseBillSave(ctx: UsePurchaseBillSaveContext) {
  const { billDate, billItems, billNumber, editingData, getBillTotal, getOtherSectionItems, invoiceNumber, manualRoundOff, notes, onSaved, onStatusMessage, paymentType, peekedBillNumber, setBillNumber, setCreatedProductIds, setIsSaving, supplierId, supplierName, tenantId, type } = ctx;
  const handleSave = async (): Promise<boolean> => {
    if (billItems.length === 0) return true;
    if (!supplierName.trim()) {
      onStatusMessage({ text: 'Supplier name is required.', type: 'error' });
      setTimeout(() => onStatusMessage(null), 3000);
      return false;
    }

    setIsSaving(true);
    const total = getBillTotal();
    const autoRoundOff = Math.round(total) - total;
    const currentRoundOff = manualRoundOff !== '' ? (Number(manualRoundOff) || 0) : autoRoundOff;
    const totalAmount = Math.round(total + currentRoundOff);
    const billId = editingData?.purchase_bill_id || uuidv4();

    const otherItems = getOtherSectionItems ? getOtherSectionItems() : [];
    const otherProductIds = new Set(otherItems.map(i => i.product_id));

    if (isDesktopRuntime()) {

      let finalBillNumber = billNumber;
      if (!editingData && isDesktopRuntime() && tenantId) {
        try {
          const res = await purchasesApi.getNextPurchaseBillNumber({ tenant_id: tenantId, bill_type: type });
          if (res && res.success && res.billNumber) {
            if (!billNumber || billNumber === peekedBillNumber || billNumber.startsWith('AUTO-')) {
              finalBillNumber = res.billNumber;
              setBillNumber(finalBillNumber);
            }
          }
        } catch (err) {
          console.error('[PurchaseBillManager] Error fetching next bill number on save:', err);
        }
      }

      const payload = {
        purchase_bill_id: billId,
        tenant_id: tenantId,
        bill_number: type === 'ESTIMATE'
          ? (finalBillNumber ? (finalBillNumber.endsWith('-EST') ? finalBillNumber : finalBillNumber + '-EST') : `AUTO-${Date.now()}-EST`)
          : (finalBillNumber || `AUTO-${Date.now()}`),
        supplier_id: supplierId || null,
        supplier_name: supplierName.trim(),
        bill_date: billDate,
        invoice_number: invoiceNumber || null,
        notes: notes || null,
        total_amount: totalAmount,
        bill_type: type,
        payment_type: paymentType,
        items: billItems.map(item => ({
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: Number(item.quantity) || 0,
          purchase_price: Number(item.purchase_price) || 0,
          total_amount: (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0),
          selling_price: item.selling_price ? Number(item.selling_price) || null : null,
          offer_price: item.offer_price ? Number(item.offer_price) || null : null,
          is_gst_applicable: item.is_gst_applicable ?? (type === 'GST' ? 1 : 0),
          tax_rate_percent: type === 'GST' ? (item.tax_rate_percent ?? 0) : 0,
          hsn_sac_code: type === 'GST' ? (item.hsn_sac_code || null) : null,
          skip_stock_update: type === 'GST' ? ((otherProductIds.has(item.product_id) || item.skip_stock_update === 1) ? 1 : 0) : 0,
        })),
      };

      const res = editingData
        ? await purchasesApi.updatePurchaseBill(payload)
        : await purchasesApi.addPurchaseBill(payload);

      if (res.success) {
        setCreatedProductIds([]);
        onStatusMessage({ text: `${type} purchase bill ${editingData ? 'updated' : 'saved'} successfully!`, type: 'success' });
        onSaved();
        setIsSaving(false);
        setTimeout(() => onStatusMessage(null), 3000);
        return true;
      } else {
        onStatusMessage({ text: `Save failed: ${res.error || ''}`, type: 'error' });
        setIsSaving(false);
        setTimeout(() => onStatusMessage(null), 3000);
        return false;
      }
    }
    setIsSaving(false);
    return false;
  };

  return { handleSave };
}
