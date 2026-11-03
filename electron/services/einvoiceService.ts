import { getDb } from '../db/localDb.js';
import * as einvoiceSql from '../db/statements/einvoice.js';

/**
 * UAE e-invoicing on the terminal: read the mirrored server statuses and keep each business customer's
 * e-invoice identity (synced as `customers.einvoice_profile`). Building and transmitting happen on the server.
 */

const PROFILE_FIELDS = ['trn', 'peppolId', 'legalId', 'legalIdType', 'legalIdAuthority', 'passportCountry', 'street', 'city', 'emirate', 'countryCode'] as const;
const LEGAL_ID_TYPES = new Set(['TL', 'EID', 'PAS', 'CD']);

/** Keeps only known fields, as trimmed strings (max 200 chars) and booleans; rejects malformed codes. */
export function sanitizeEinvoiceProfile(input: unknown): { profile?: Record<string, string | boolean>; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Profile must be an object' };
  const source = input as Record<string, unknown>;
  const profile: Record<string, string | boolean> = {};
  for (const key of PROFILE_FIELDS) {
    const value = source[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string') return { error: `${key} must be text` };
    const text = value.trim().slice(0, 200);
    if (text) profile[key] = text;
  }
  for (const key of ['isBusiness', 'notOnPeppol'] as const) if (source[key] === true) profile[key] = true;
  if (profile.trn && !/^\d{15}$/.test(String(profile.trn))) return { error: 'TRN must be 15 digits' };
  if (profile.legalIdType && !LEGAL_ID_TYPES.has(String(profile.legalIdType))) return { error: 'Unknown legal ID type' };
  if (profile.countryCode && !/^[A-Z]{2}$/.test(String(profile.countryCode))) return { error: 'Country must be a 2-letter ISO code' };
  return { profile };
}

export function getEinvoiceStatuses({ tenant_id, document_ids }: { tenant_id: string; document_ids: unknown }) {
  const ids = Array.isArray(document_ids) ? document_ids.filter((id): id is string => typeof id === 'string').slice(0, 500) : [];
  if (ids.length === 0) return [];
  return einvoiceSql.selectEinvoiceStatuses(getDb()).all(tenant_id, JSON.stringify(ids));
}

export function getEinvoiceSummary({ tenant_id }: { tenant_id: string }) {
  return einvoiceSql.countEinvoiceStatuses(getDb()).all(tenant_id);
}

export function getCustomerEinvoiceProfile({ tenant_id, customer_id }: { tenant_id: string; customer_id: string }) {
  return einvoiceSql.selectCustomerEinvoiceProfile(getDb()).get(tenant_id, customer_id) ?? null;
}

export function saveCustomerEinvoiceProfile({ tenant_id, customer_id, profile }: { tenant_id: string; customer_id: string; profile: unknown }) {
  const clean = sanitizeEinvoiceProfile(profile);
  if (clean.error || !clean.profile) return { success: false, error: clean.error ?? 'Invalid profile' };
  const result = einvoiceSql.updateCustomerEinvoiceProfile(getDb()).run(JSON.stringify(clean.profile), tenant_id, customer_id);
  return result.changes > 0 ? { success: true } : { success: false, error: 'Customer not found' };
}
