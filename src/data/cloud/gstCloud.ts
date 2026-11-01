/**
 * NAFID GST Integration — Cloud Repository
 * Phase 2A: REST API client for tenant GST configuration, taxpayer authorizations,
 * filing lifecycles, and Super Admin platform GSP management.
 *
 * Adheres to architecture rule R11: All network requests routed through cloudFetch.
 */

import { cloudFetch } from './client';
import type { GstProviderDefinition } from '../../types/gstProvider';

export interface GstStatusOverview {
  mode: 'MANAGED_GSP' | 'SHOP_OWNED_GSP' | 'OFFLINE';
  environment: 'SANDBOX' | 'PRODUCTION';
  activeProvider: {
    id: string;
    name: string;
    status: string;
  } | null;
  connectionStatus: 'READY' | 'CONFIGURED' | 'DISABLED' | 'OFFLINE';
  taxpayerAuthorizationsCount: number;
  availableProviders: GstProviderDefinition[];
}

export interface GstTaxpayerAuthItem {
  id: string;
  gstin: string;
  provider_id: string;
  status: 'PENDING' | 'AUTHORIZED' | 'EXPIRED' | 'REVOKED';
  authorized_services: string[];
  authorized_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GstFilingRecordItem {
  id: string;
  filing_period: string;
  return_type: 'GSTR1' | 'GSTR3B';
  status: string;
  filing_mode: 'MANAGED_GSP' | 'SHOP_OWNED_GSP' | 'OFFLINE_MANUAL';
  acknowledgement_number: string | null;
  filing_date: string | null;
  gross_taxable_value: number;
  total_tax_amount: number;
  summary_payload: unknown;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManagedGspPlatformConfig {
  configured: boolean;
  id?: string;
  provider_id?: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  is_enabled?: boolean;
  status?: string;
  masked_config?: Record<string, string>;
  allowed_tenants?: string[];
  monthly_quota?: number;
  updated_at?: string;
  updated_by?: string;
}

export const gstCloudApi = {
  // ── Tenant Shop Operations ──

  async getStatus(): Promise<GstStatusOverview> {
    return cloudFetch<GstStatusOverview>('/api/gst/status');
  },

  async setMode(params: {
    mode: 'MANAGED_GSP' | 'SHOP_OWNED_GSP' | 'OFFLINE';
    providerId?: string | null;
    environment?: 'SANDBOX' | 'PRODUCTION';
  }): Promise<{ success: boolean; settings: unknown }> {
    return cloudFetch('/api/gst/mode', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async configureShopConnection(params: {
    providerId: string;
    environment: 'SANDBOX' | 'PRODUCTION';
    credentials: Record<string, string>;
  }): Promise<{ success: boolean; connection: unknown }> {
    return cloudFetch('/api/gst/shop-connection', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async disconnectShopConnection(params: {
    providerId: string;
    environment: 'SANDBOX' | 'PRODUCTION';
  }): Promise<{ success: boolean }> {
    return cloudFetch('/api/gst/shop-connection', {
      method: 'DELETE',
      body: JSON.stringify(params),
    });
  },

  async getAuthorizations(): Promise<GstTaxpayerAuthItem[]> {
    return cloudFetch<GstTaxpayerAuthItem[]>('/api/gst/authorizations');
  },

  async registerAuthorization(params: {
    gstin: string;
    providerId: string;
  }): Promise<{ success: boolean; authorization: GstTaxpayerAuthItem }> {
    return cloudFetch('/api/gst/authorizations', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async revokeAuthorization(id: string): Promise<{ success: boolean; authorization: GstTaxpayerAuthItem }> {
    return cloudFetch(`/api/gst/authorizations/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
    });
  },

  async getFilings(period?: string): Promise<GstFilingRecordItem[]> {
    const query = period ? `?period=${encodeURIComponent(period)}` : '';
    return cloudFetch<GstFilingRecordItem[]>(`/api/gst/filings${query}`);
  },

  async prepareFiling(payload: {
    period: string;
    returnType: 'GSTR1' | 'GSTR3B';
    summaryPayload?: unknown;
    grossTaxable?: number;
    totalTax?: number;
  }): Promise<{ success: boolean; filing: GstFilingRecordItem }> {
    return cloudFetch('/api/gst/filings/prepare', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async approveFiling(payload: {
    period: string;
    returnType: 'GSTR1' | 'GSTR3B';
  }): Promise<{ success: boolean; filing: GstFilingRecordItem }> {
    return cloudFetch('/api/gst/filings/approve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async recordManualFiling(payload: {
    period: string;
    returnType: 'GSTR1' | 'GSTR3B';
    arn: string;
    filingDate: string;
    grossTaxable?: number;
    totalTax?: number;
  }): Promise<{ success: boolean; filing: GstFilingRecordItem }> {
    return cloudFetch('/api/gst/filings/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ── Super Admin Platform Operations ──

  async getManagedGspConfig(environment: 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION'): Promise<ManagedGspPlatformConfig> {
    return cloudFetch<ManagedGspPlatformConfig>(`/super-admin/gst/managed?environment=${encodeURIComponent(environment)}`);
  },

  async saveManagedGspConfig(params: {
    providerId: string;
    environment: 'SANDBOX' | 'PRODUCTION';
    credentials: Record<string, string>;
    isEnabled: boolean;
    allowedTenants?: string[];
    monthlyQuota?: number;
  }): Promise<{ success: boolean; connection: unknown }> {
    return cloudFetch('/super-admin/gst/managed', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async toggleManagedGsp(id: string, isEnabled: boolean): Promise<{ success: boolean; connection: unknown }> {
    return cloudFetch('/super-admin/gst/managed/toggle', {
      method: 'POST',
      body: JSON.stringify({ id, isEnabled }),
    });
  },

  async getAuditLogs(tenantId?: string, limit?: number): Promise<Array<{ id: string; tenant_id: string; actor_id: string; action: string; details: unknown; created_at: string }>> {
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return cloudFetch(`/super-admin/gst/audit-logs${qs}`);
  },
};
