import type { ScrapInvoiceDetails } from '../../data/scrap';
import type { PartyPreviewInvoice, PartyPreviewItem, Party } from './partyTypes';

/** Maps the real scrap detail contract to the invoice-shaped values used by the party bill preview. */
export function mapScrapInvoiceToPartyPreview(
  scrap: ScrapInvoiceDetails,
  fallbackDate: string,
  party: Pick<Party, 'name' | 'phone'> | null,
): { invoice: PartyPreviewInvoice; items: PartyPreviewItem[] } {
  const firstTransaction = scrap.transactions[0];
  return {
    invoice: {
      invoice_number: scrap.invoiceNumber,
      invoice_type: 'SCRAP',
      created_at: firstTransaction?.transaction_date || firstTransaction?.created_at || fallbackDate,
      payment_method: scrap.paymentStatus,
      payment_status: scrap.paymentStatus,
      customer_name: firstTransaction?.party_name || party?.name || null,
      customer_phone: firstTransaction?.customer_phone || party?.phone || null,
      customer_address: firstTransaction?.customer_address || null,
      grand_total: scrap.totalAmount,
      subtotal: scrap.totalAmount,
    },
    items: scrap.transactions.map(transaction => ({
      item_id: transaction.transaction_id,
      product_id: transaction.scrap_category_id,
      name: transaction.scrap_category_name || 'Unknown',
      quantity: Number(transaction.quantity) || 0,
      unit_price: Number(transaction.rate) || 0,
      total: Number(transaction.total_amount) || 0,
    })),
  };
}
