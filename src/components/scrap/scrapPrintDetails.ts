import type { ScrapInvoiceTxRow } from './scrapTypes';
import type { ReceiptData } from '../../utils/receiptGenerator';

type ScrapPrintSettings = {
  showBillerName?: boolean;
  showCustomerName?: boolean;
  showCustomerPhone?: boolean;
  showCustomerAddress?: boolean;
};

/** Maps only biller and customer details available in the scrap transaction query or current session. */
export function buildScrapPrintDetails(
  transaction: Pick<ScrapInvoiceTxRow, 'party_name' | 'customer_phone' | 'customer_address' | 'party_phone' | 'party_address'> | undefined,
  settings: ScrapPrintSettings,
  currentUserName?: string | null,
): Pick<ReceiptData, 'billerName' | 'customerName' | 'customerPhone' | 'customerAddress'> {
  return {
    billerName: settings.showBillerName !== false ? currentUserName || undefined : undefined,
    customerName: settings.showCustomerName !== false ? transaction?.party_name || undefined : undefined,
    customerPhone: settings.showCustomerPhone !== false
      ? transaction?.party_phone || transaction?.customer_phone || undefined
      : undefined,
    customerAddress: settings.showCustomerAddress !== false
      ? transaction?.party_address || transaction?.customer_address || undefined
      : undefined,
  };
}
