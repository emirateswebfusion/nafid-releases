/**
 * NAFID GST Integration — Provider Types
 * Phase 2A: Strongly typed provider definitions for POS client.
 */

export type GstProviderCategory = 'RETURN_GSP' | 'EINVOICE_GSP' | 'EWAY_GSP';

export type GstServiceCapability = 
  | 'GSTR1_FILING'
  | 'GSTR3B_FILING'
  | 'TAXPAYER_AUTH'
  | 'GSTR1_STATUS'
  | 'GSTR3B_STATUS'
  | 'E_INVOICE_GENERATE'
  | 'E_WAY_BILL_GENERATE';

export type GstAuthMechanism = 'OAUTH2' | 'API_KEY_SECRET' | 'CERTIFICATE';

export type GstProviderStatus = 'ACTIVE' | 'SANDBOX_ONLY' | 'COMING_SOON' | 'DISABLED';

export interface GstCredentialFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  description: string;
}

export interface GstProviderDefinition {
  id: string;
  name: string;
  category: GstProviderCategory;
  supportedServices: GstServiceCapability[];
  authMechanism: GstAuthMechanism;
  sandboxAvailable: boolean;
  productionAvailable: boolean;
  status: GstProviderStatus;
  credentialFields: GstCredentialFieldSchema[];
  consentRequirements: string;
  documentationUrl?: string;
}
