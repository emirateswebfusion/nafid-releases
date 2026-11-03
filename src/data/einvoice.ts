import { bindBridge } from './client';
import type { CustomersRow, EinvoiceDocumentsRow } from './dbRows';

/** Renderer-side API for UAE e-invoicing (Peppol PINT AE). Statuses are mirrored from the server by the sync worker. */

export type EinvoiceStatus = 'NOT_REQUIRED' | 'QUEUED' | 'VALIDATION_FAILED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'REPORTED' | 'FAILED';

/** `db:getEinvoiceStatuses` row of the local `einvoice_documents` mirror (`errors` is a JSON array of `{ rule, message }`). */
export type EinvoiceStatusRow = Pick<EinvoiceDocumentsRow, 'document_id' | 'document_number' | 'buyer_endpoint' | 'fta_reference' | 'errors' | 'updated_at'> & {
  document_kind: 'INVOICE' | 'CREDIT_NOTE';
  document_type: 'TAX' | 'COMMERCIAL' | null;
  status: EinvoiceStatus;
};

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

/** `db:getCustomerEinvoiceProfile` row. */
export type CustomerEinvoiceRow = Pick<CustomersRow, 'customer_id' | 'name' | 'phone' | 'address' | 'gstin' | 'einvoice_profile'>;

export const einvoiceApi = bindBridge({
  getStatuses: 'dbGetEinvoiceStatuses',
  getSummary: 'dbGetEinvoiceSummary',
  getCustomerProfile: 'dbGetCustomerEinvoiceProfile',
  saveCustomerProfile: 'dbSaveCustomerEinvoiceProfile',
});
