import { type LedgerEntryData } from '../../utils/partyLedgerPdfGenerator';

export interface Party {
  party_id: string;
  name: string;
  phone: string;
  address: string;
  gstin: string;
  balance: number;
  current_balance?: number;
  gst_balance?: number;
  estimate_balance?: number;
  current_gst_balance?: number;
  current_estimate_balance?: number;
  balance_type: 'RECEIVABLE' | 'PAYABLE';
  party_type?: 'CUSTOMER' | 'SUPPLIER' | 'STAFF' | 'CUSTOM' | string;
  custom_category?: string | null;
  notes: string;
  last_transaction_date: string;
  created_at: string;
  pricing_tier_id?: string | null;
  credit_limit?: number;
  credit_period_enabled?: boolean | number;
  credit_period_days?: number;
  credit_period_basis?: 'BILL_BASED' | 'OLDEST_UNPAID' | string;
  restrict_on_credit_expiry?: boolean | number;
  whatsapp_alerts_enabled?: boolean | number;
  has_overdue?: boolean;
  overdue_bills_count?: number;
  overdue_amount?: number;
  oldest_overdue_days?: number;
  connected_tenant_id?: string | null;
  connected_party_id?: string | null;
  connection_status?: 'UNLINKED' | 'PENDING' | 'CONNECTED' | string;
  connect_code?: string | null;
}

export type LedgerEntry = LedgerEntryData & { contextRunningBalance?: number }; export type PartyConnectionRequest = { request_id: string; status: string; sender_tenant_name: string; sender_connect_code: string }; export type PartyConnectionSearch = import('../../data/cloud/partyConnect').ConnectSearchResult & { domain_type?: string }; export type PartyPreviewInvoice = Omit<Partial<import('../../data/invoices').Invoice>, 'created_at'> & { created_at: string; tax_amount?: number; tax?: number; discount_amount?: number; discount?: number }; export type PartyPreviewItem = Omit<Partial<import('../../data/invoices').InvoiceItem>, 'name' | 'quantity' | 'unit_price'> & { name: string; quantity: number; unit_price: number };

export type View = 'list' | 'ledger' | 'party_form' | 'tx_form';
