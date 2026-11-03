import { bindBridge } from './client';

/** Renderer-side API for UAE e-invoicing (Peppol PINT AE). Statuses are mirrored from the server by the sync worker. */

export type EinvoiceStatus = 'NOT_REQUIRED' | 'QUEUED' | 'VALIDATION_FAILED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'REPORTED' | 'FAILED';

/** A row of the local `einvoice_documents` mirror (`errors` is a JSON array of `{ rule, message }`). */
export interface EinvoiceStatusRow {
  document_id: string;
  document_kind: 'INVOICE' | 'CREDIT_NOTE';
  document_number: string;
  document_type: 'TAX' | 'COMMERCIAL' | null;
  status: EinvoiceStatus;
  buyer_endpoint: string | null;
  fta_reference: string | null;
  errors: string;
  updated_at: string;
}

/** `customers.einvoice_profile` JSON: the buyer identity a PINT AE invoice needs. */
export interface BuyerEinvoiceProfile {
  isBusiness?: boolean;
  trn?: string;
  peppolId?: string;
  notOnPeppol?: boolean;
  legalId?: string;
  legalIdType?: 'TL' | 'EID' | 'PAS' | 'CD';
  legalIdAuthority?: string;
  passportCountry?: string;
  street?: string;
  city?: string;
  emirate?: string;
  countryCode?: string;
}

export interface CustomerEinvoiceRow {
  customer_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  einvoice_profile: string | null;
}

export const einvoiceApi = bindBridge({
  getStatuses: 'dbGetEinvoiceStatuses',
  getSummary: 'dbGetEinvoiceSummary',
  getCustomerProfile: 'dbGetCustomerEinvoiceProfile',
  saveCustomerProfile: 'dbSaveCustomerEinvoiceProfile',
});
