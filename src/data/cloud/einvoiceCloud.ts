/**
 * UAE e-invoicing — cloud repository for `/api/einvoice` (nafid-server routes/einvoice.ts).
 * Settings and ASP credentials live on the server; terminals only read statuses through sync.
 */
import { cloudFetch } from './client';

export type EinvoiceMode = 'OFF' | 'VOLUNTARY' | 'MANDATORY';
export type AspEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface AspDefinition {
  id: string;
  name: string;
  legalEntity: string;
  status: 'ACTIVE' | 'CONTRACT_REQUIRED';
  environments: AspEnvironment[];
  credentialFields: { key: string; label: string; secret: boolean }[];
  notes: string;
}

export interface EinvoiceOverview {
  settings: { mode: EinvoiceMode; provider_id: string; environment: AspEnvironment; start_date: string | null };
  providers: AspDefinition[];
  connection: { provider_id: string; environment: AspEnvironment; masked_config: Record<string, string>; last_verified_at: string | null } | null;
  counts: { status: string; count: number }[];
}

export interface EinvoiceInboundItem {
  inbound_id: string;
  asp_reference: string;
  document_kind: 'INVOICE' | 'CREDIT_NOTE';
  document_number: string;
  issue_date: string | null;
  supplier_name: string | null;
  supplier_trn: string | null;
  currency: string;
  tax_exclusive_amount: string | number;
  tax_amount: string | number;
  payable_amount: string | number;
  lines: { name: string; quantity: number; unitCode: string; netAmount: number; vatRate: number }[];
  status: 'NEW' | 'RECORDED' | 'IGNORED';
  purchase_bill_id: string | null;
  received_at: string;
}

export const einvoiceCloud = {
  getOverview: () => cloudFetch<EinvoiceOverview>('/api/einvoice/overview'),
  saveSettings: (settings: { mode: EinvoiceMode; provider_id: string; environment: AspEnvironment; start_date: string }) =>
    cloudFetch<{ settings: EinvoiceOverview['settings'] }>('/api/einvoice/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  saveConnection: (provider_id: string, environment: AspEnvironment, credentials: Record<string, string>) =>
    cloudFetch<{ connected: boolean; message: string }>('/api/einvoice/connection', { method: 'POST', body: JSON.stringify({ provider_id, environment, credentials }) }),
  processNow: () => cloudFetch<{ mode: string; built: number; submitted: number; checked: number; received: number }>('/api/einvoice/process', { method: 'POST', body: '{}' }),
  retryDocument: (documentId: string) => cloudFetch<{ success: boolean }>(`/api/einvoice/documents/${encodeURIComponent(documentId)}/retry`, { method: 'POST', body: '{}' }),
  listInbound: (status?: 'NEW' | 'RECORDED' | 'IGNORED') =>
    cloudFetch<EinvoiceInboundItem[]>(`/api/einvoice/inbound${status ? `?status=${status}` : ''}`),
  setInboundStatus: (inboundId: string, status: 'NEW' | 'RECORDED' | 'IGNORED', purchase_bill_id?: string) =>
    cloudFetch<{ success: boolean }>(`/api/einvoice/inbound/${encodeURIComponent(inboundId)}`, { method: 'PATCH', body: JSON.stringify({ status, purchase_bill_id }) }),
};
