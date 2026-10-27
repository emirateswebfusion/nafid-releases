import type * as B from '../billingTypes';
import React, { useEffect } from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { scrapApi } from '../../../data/scrap';
import { getNumericPart } from '../../../utils/pricing/invoiceNumberHelper';
import { returnsApi } from '../../../data/returns';

export interface UseDeductionSyncContext {
  returnDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  returnDeductionSearchQuery: string;
  scrapDeductionInputRef: React.RefObject<HTMLInputElement | null>;
  scrapDeductionSearchQuery: string;
  setReturnDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  setReturnDeductionResults: React.Dispatch<React.SetStateAction<B.ReturnDeductionRow[]>>;
  setScrapDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  setScrapDeductionResults: React.Dispatch<React.SetStateAction<B.ScrapDeductionRow[]>>;
  storeReturnDeduction: number;
  storeScrapDeduction: number;
  tenantId: string | null;
}

/** Scrap / return deduction search: debounced lookups and positioning of their dropdowns. Effects in original order. */
export function useDeductionSync(ctx: UseDeductionSyncContext) {
  const { returnDeductionInputRef, returnDeductionSearchQuery, scrapDeductionInputRef, scrapDeductionSearchQuery, setReturnDeductionDropdownStyle, setReturnDeductionResults, setScrapDeductionDropdownStyle, setScrapDeductionResults, storeReturnDeduction, storeScrapDeduction, tenantId } = ctx;
  // Scrap deduction search
  useEffect(() => {
    if (storeScrapDeduction > 0 || scrapDeductionSearchQuery.length < 1) { setScrapDeductionResults([]); return; }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const tid = tenantId || 'global';
      const list = await scrapApi.getScrapInvoiceList({ tenant_id: tid });
      if (Array.isArray(list)) {
        const q = scrapDeductionSearchQuery.toUpperCase();
        const getNumPart = getNumericPart;
        const filtered = list.filter(inv => {
          const invNum = String(inv.invoice_number).toUpperCase();
          const numPart = getNumPart(invNum);
          return (invNum.includes(q) || (q.length >= 1 && getNumPart(q).length > 0 && numPart.includes(getNumPart(q)))) &&
            inv.payment_status === 'PENDING';
        });
        setScrapDeductionResults(filtered.slice(0, 8));
        if (filtered.length > 0 && scrapDeductionInputRef.current) {
          const rect = scrapDeductionInputRef.current.getBoundingClientRect();
          setScrapDeductionDropdownStyle({
            position: 'fixed',
            bottom: `${window.innerHeight - rect.top + 4}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            zIndex: 9999,
          });
        } else {
          setScrapDeductionDropdownStyle(null);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [scrapDeductionSearchQuery, storeScrapDeduction, tenantId, setScrapDeductionDropdownStyle, setScrapDeductionResults, scrapDeductionInputRef]);

  // Return deduction search
  useEffect(() => {
    if (storeReturnDeduction > 0 || returnDeductionSearchQuery.length < 1) { setReturnDeductionResults([]); return; }
    const t = setTimeout(async () => {
      if (!isDesktopRuntime()) return;
      const tid = tenantId || 'global';
      const list = await returnsApi.getPendingReturnInvoices({ tenant_id: tid });
      if (Array.isArray(list)) {
        const q = returnDeductionSearchQuery.toUpperCase();
        const getNumPart = getNumericPart;
        const qNum = getNumPart(q);
        const filtered = list.filter((r) => {
          const retNum = String(r.return_number).toUpperCase();
          const custName = String(r.customer_name || '').toUpperCase();
          const custPhone = String(r.customer_phone || '').toUpperCase();
          const numPart = getNumPart(retNum);
          return retNum.includes(q) ||
            custName.includes(q) ||
            custPhone.includes(q) ||
            (q.length >= 1 && qNum.length > 0 && (numPart.includes(qNum) || Number(numPart) === Number(qNum)));
        });
        setReturnDeductionResults(filtered.slice(0, 8));
        if (filtered.length > 0 && returnDeductionInputRef.current) {
          const rect = returnDeductionInputRef.current.getBoundingClientRect();
          setReturnDeductionDropdownStyle({
            position: 'fixed',
            bottom: `${window.innerHeight - rect.top + 4}px`,
            left: `${rect.left}px`,
            width: `${Math.max(rect.width, 280)}px`,
            zIndex: 9999,
          });
        } else {
          setReturnDeductionDropdownStyle(null);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [returnDeductionSearchQuery, storeReturnDeduction, tenantId, setReturnDeductionDropdownStyle, setReturnDeductionResults, returnDeductionInputRef]);

}
