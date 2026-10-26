import type React from 'react';
import { type PurchaseBill, type PurchaseBillItem } from '../purchaseTypes';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { purchasesApi } from '../../../data/purchases';
import { useAuthStore } from '../../../store/authStore';
import { settingsApi } from '../../../data/settings';
import { generatePurchaseBillHtml } from '../../../utils/invoiceHtmlGenerator';
import { printingApi } from '../../../data/printing';

export interface UsePurchaseBillPrintContext {
  setStatusMessage: React.Dispatch<React.SetStateAction<{ text: string; type: "success" | "error"; } | null>>;
  tenantId: string | null;
}

/** Print a saved purchase bill (`handlePrintBill`). */
export function usePurchaseBillPrint(ctx: UsePurchaseBillPrintContext) {
  const { setStatusMessage, tenantId } = ctx;
  const handlePrintBill = async (billToPrint: PurchaseBill, itemsToPrint?: PurchaseBillItem[]) => {
    try {
      let items = itemsToPrint;
      if (!items || items.length === 0) {
        if (isDesktopRuntime()) {
          items = await purchasesApi.getPurchaseBillItems(billToPrint.purchase_bill_id);
        }
      }
      if (!items) items = [];

      let shopName = useAuthStore.getState().shopName || 'NAFID POS';
      let shopAddress = '';
      let shopPhone = '';
      let shopGstin = '';

      if (hasBridge('settingsGet')) {
        const [sName, sAddr, sPh, sGstin] = await Promise.all([
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_name' }),
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_address' }),
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
          settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
        ]);
        if (sName) shopName = sName;
        if (sAddr) shopAddress = sAddr;
        if (sPh) shopPhone = sPh;
        if (sGstin) shopGstin = sGstin;
      }

      const htmlContent = generatePurchaseBillHtml(
        { shopName, shopAddress, shopPhone, shopGstin },
        billToPrint,
        items
      );

      if (hasBridge('printA4Html')) {
        const res = await printingApi.printA4Html(tenantId || 'global', htmlContent);
        if (!res?.success) {
          const pw = window.open('', '_blank');
          if (pw) {
            pw.document.write(htmlContent);
            pw.document.close();
            setTimeout(() => pw.print(), 500);
          }
        }
      } else {
        const pw = window.open('', '_blank');
        if (pw) {
          pw.document.write(htmlContent);
          pw.document.close();
          setTimeout(() => pw.print(), 500);
        }
      }
    } catch (err) {
      console.error('Failed to print purchase bill:', err);
      setStatusMessage({ text: 'Failed to print purchase bill', type: 'error' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  return { handlePrintBill };
}
