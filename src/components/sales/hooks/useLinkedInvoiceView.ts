import type React from 'react';
import { listInvoices } from '../../../data/invoices';
import type { SalesInvoiceRow } from '../salesTypes';

export interface UseLinkedInvoiceViewContext {
  accountingView: "REAL_SALES" | "TAX_FILING" | "ALL";
  handleSelectInvoice: (inv: SalesInvoiceRow) => Promise<void>;
  invoices: SalesInvoiceRow[];
  setAccountingView: React.Dispatch<React.SetStateAction<"REAL_SALES" | "TAX_FILING" | "ALL">>;
  showToast: (text: string, type: "success" | "error") => void;
}

/**
 * Open the GST copy / original bill linked to the selected invoice (`handleViewLinkedInvoice`), loading it when it is
 * not in the current list.
 */
export function useLinkedInvoiceView(ctx: UseLinkedInvoiceViewContext) {
  const { accountingView, handleSelectInvoice, invoices, setAccountingView, showToast } = ctx;
  const handleViewLinkedInvoice = async (targetInvoiceId?: string, targetInvoiceNumber?: string) => {
    if (!targetInvoiceId && !targetInvoiceNumber) {
      showToast('No linked bill details found', 'error');
      return;
    }
    try {
      // 1. First check in-memory loaded invoices for instant match
      let match = invoices.find((i) =>
        (targetInvoiceId && i.invoice_id === targetInvoiceId) ||
        (targetInvoiceNumber && i.invoice_number === targetInvoiceNumber) ||
        (targetInvoiceNumber && i.invoice_number?.trim().toUpperCase() === targetInvoiceNumber.trim().toUpperCase())
      );

      // 2. Query by invoice_id (new main.ts direct bypass)
      if (!match && targetInvoiceId) {
        try {
          const res = await listInvoices({
            invoice_id: targetInvoiceId,
            limit: 5,
            offset: 0,
          });
          if (Array.isArray(res) && res.length > 0) {
            match = res.find((i) => i.invoice_id === targetInvoiceId || (targetInvoiceNumber && i.invoice_number === targetInvoiceNumber)) || res[0];
          }
        } catch (err) {
          console.warn('[handleViewLinkedInvoice] Error querying by invoice_id:', err);
        }
      }

      // 3. Fallback: Query by invoice_number with search
      const searchKey = targetInvoiceNumber || targetInvoiceId;
      if (!match && searchKey) {
        try {
          const res = await listInvoices({
            search: searchKey,
            accounting_view: 'ALL',
            limit: 25,
            offset: 0,
          });
          if (Array.isArray(res)) {
            match = res.find((i) =>
              (targetInvoiceId && i.invoice_id === targetInvoiceId) ||
              (targetInvoiceNumber && i.invoice_number === targetInvoiceNumber) ||
              (targetInvoiceNumber && i.invoice_number?.trim().toUpperCase() === targetInvoiceNumber.trim().toUpperCase()) ||
              (targetInvoiceId && i.invoice_number === targetInvoiceId)
            );
          }
        } catch (err) {
          console.warn('[handleViewLinkedInvoice] Error querying by search:', err);
        }
      }

      if (match) {
        // Synchronize accounting view so the underlying list matches the active document
        if (match.invoice_type === 'BILL_OF_SUPPLY' && accountingView === 'TAX_FILING') {
          setAccountingView('REAL_SALES');
        } else if (match.invoice_type === 'GST' && accountingView === 'REAL_SALES') {
          setAccountingView('TAX_FILING');
        }
        await handleSelectInvoice(match);
      } else {
        showToast(`Linked bill "${targetInvoiceNumber || targetInvoiceId}" could not be found`, 'error');
      }
    } catch (e) {
      console.error('[handleViewLinkedInvoice] Failed to load linked invoice:', e);
      showToast('Could not open linked bill: ' + ((e as Error)?.message || 'Error'), 'error');
    }
  };

  return { handleViewLinkedInvoice };
}
