import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { invoicesApi } from '../../../data/invoices';
import type { InvoiceDetailsCacheEntry, UpiSourceOption } from '../salesTypes';
import type { SalesInvoiceRow } from '../salesTypes';

export interface UseCollectPaymentContext {
  collectPaymentMethod: "CASH" | "CARD" | "UPI" | "CHEQUE" | "CREDIT";
  collectReceivedAmount: number;
  collectUpiSourceId: string;
  invoiceDetailsCache: React.RefObject<Map<string, InvoiceDetailsCacheEntry>>;
  loadInvoices: (reset?: boolean) => Promise<void>;
  selectedInvoice: SalesInvoiceRow | null;
  setCollectPaymentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCollectPaymentSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setCollectPaymentSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedInvoice: React.Dispatch<React.SetStateAction<SalesInvoiceRow | null>>;
  showToast: (text: string, type: "success" | "error") => void;
  upiSources: UpiSourceOption[];
}

/**
 * Settle a pending invoice from Sales History (`handleCollectPayment`): records the payment with the chosen method,
 * amount and UPI account, then refreshes the invoice.
 */
export function useCollectPayment(ctx: UseCollectPaymentContext) {
  const { collectPaymentMethod, collectReceivedAmount, collectUpiSourceId, invoiceDetailsCache, loadInvoices, selectedInvoice, setCollectPaymentOpen, setCollectPaymentSaving, setCollectPaymentSuccess, setSelectedInvoice, showToast, upiSources } = ctx;
  const handleCollectPayment = async () => {
    if (!isDesktopRuntime() || !selectedInvoice) return;
    setCollectPaymentSaving(true);
    try {
      const { tenantId } = useAuthStore.getState();
      const isCreditPayment = collectPaymentMethod === 'CREDIT';
      const invGrandTotal = Number(selectedInvoice.grand_total) || 0;
      const balanceAmount = isCreditPayment
        ? Math.max(0, invGrandTotal - collectReceivedAmount)
        : (collectReceivedAmount > invGrandTotal ? (collectReceivedAmount - invGrandTotal) : 0);

      const selectedCollectSource = upiSources.find((s: any) => s.source_id === collectUpiSourceId) || upiSources[0];
      const collectSplitDetails = collectPaymentMethod === 'UPI' && selectedCollectSource
        ? { upi_id: selectedCollectSource.upi_id, upi_name: selectedCollectSource.name, upi_source_id: selectedCollectSource.source_id }
        : selectedInvoice.split_details;

      const result = await invoicesApi.updateInvoicePayment({
        invoice_id: selectedInvoice.invoice_id,
        tenant_id: tenantId || 'global',
        payment_method: collectPaymentMethod,
        received_amount: collectReceivedAmount,
        balance_amount: balanceAmount,
        split_details: collectSplitDetails,
      });

      if (result.success) {
        invoiceDetailsCache.current.delete(selectedInvoice.invoice_id);
        setCollectPaymentSuccess(true);
        // Refresh the selected invoice to show updated payment
        setSelectedInvoice({
          ...selectedInvoice,
          payment_method: collectPaymentMethod,
          received_amount: collectReceivedAmount,
          balance_amount: balanceAmount,
          split_details: collectSplitDetails && typeof collectSplitDetails === 'object' ? JSON.stringify(collectSplitDetails) : (collectSplitDetails && collectSplitDetails !== 'null' ? collectSplitDetails : null),
        });
        // Refresh the full list
        loadInvoices(true);
        // Dispatch event to refresh CashierSettlement drawer cash instantly
        window.dispatchEvent(new CustomEvent('checkout:completed'));
        setTimeout(() => {
          setCollectPaymentOpen(false);
          setCollectPaymentSuccess(false);
        }, 1500);
      } else {
        showToast('Failed to update payment: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (err: any) {
      console.error('Failed to collect payment', err);
      showToast('Failed to update payment: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setCollectPaymentSaving(false);
    }
  };

  return { handleCollectPayment };
}
