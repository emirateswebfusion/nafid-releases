import { type LedgerEntryData } from '../../utils/print/partyLedgerPdfGenerator';
import type { Party as DataParty } from '../../data/parties';

export interface Party extends DataParty {
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
  oldest_overdue_days?: number;
  connected_tenant_id?: string | null;
  connected_party_id?: string | null;
  connection_status?: 'UNLINKED' | 'PENDING' | 'CONNECTED' | string;
  connect_code?: string | null;
}

export type LedgerEntry = LedgerEntryData & { contextRunningBalance?: number };
export type PartyConnectionRequest = { request_id: string; status: string; sender_tenant_name: string; sender_connect_code: string };
export type PartyConnectionSearch = import('../../data/cloud/partyConnect').ConnectSearchResult & { domain_type?: string };

/** A bill opened from a ledger entry: a stored invoice, or a purchase / scrap / return document mapped to its fields. */
export type PartyPreviewInvoice = Partial<import('../../data/invoices').Invoice> & {
  created_at: string | null;
  payment_status?: string;
  tax_amount?: number;
  tax?: number;
  discount_amount?: number;
  discount?: number;
};

/** A line of a {@link PartyPreviewInvoice}. */
export type PartyPreviewItem = Partial<import('../../data/invoices').InvoiceItem> & {
  name: string | null;
  quantity: number;
  unit_price: number;
};

export type View = 'list' | 'ledger' | 'party_form' | 'tx_form';
