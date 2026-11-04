import { getDb } from '../db/localDb.js';
import { toSqliteDate } from './syncConfig.js';
import { notifyPullProgress } from './syncProgress.js';
import { fetchWithFallback, pullPaginated } from './syncTransport.js';
import { getStoreCountrySetting } from '../services/storeCountryService.js';
import * as einvoiceSql from '../db/statements/einvoice.js';

/**
 * UAE e-invoicing after a cloud sync: ask the server to process newly synced invoices / credit notes
 * (build PINT AE, submit to the shop's ASP, poll status), then mirror the server-owned statuses.
 * Never blocks checkout and never fails the sync cycle: an older server (404) or a network error is ignored.
 */
export async function syncEinvoices(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  if (getStoreCountrySetting(db, tenantId) !== 'AE') return false;
  try {
    const { response } = await fetchWithFallback('/api/einvoice/process', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok && response.status !== 404) console.warn(`[SyncWorker] E-invoice processing returned HTTP ${response.status}`);
  } catch (err) {
    console.warn('[SyncWorker] E-invoice processing skipped:', (err as Error).message);
  }

  const upsert = einvoiceSql.upsertEinvoiceDocument(db);
  const text = (value: unknown) => (value == null ? null : String(value));
  const result = await pullPaginated({
    token,
    tenantId,
    table: 'einvoice_documents',
    urlPath: '/api/sync/einvoice-documents',
    label: 'e-invoice statuses',
    onProgress: (fetched) => notifyPullProgress('einvoice_documents', fetched),
    processPage: (rows) => {
      db.transaction((page: Record<string, unknown>[]) => {
        for (const r of page) {
          upsert.run({
            document_id: String(r.document_id), tenant_id: text(r.tenant_id) ?? tenantId,
            document_kind: String(r.document_kind), document_number: String(r.document_number ?? ''),
            document_type: text(r.document_type), status: String(r.status), buyer_endpoint: text(r.buyer_endpoint),
            provider_id: text(r.provider_id), asp_reference: text(r.asp_reference), fta_reference: text(r.fta_reference),
            errors: typeof r.errors === 'string' ? r.errors : JSON.stringify(r.errors ?? []),
            attempts: Number(r.attempts) || 0,
            submitted_at: r.submitted_at ? toSqliteDate(r.submitted_at as string) : null,
            created_at: toSqliteDate(r.created_at as string | null | undefined),
            updated_at: toSqliteDate(r.updated_at as string | null | undefined),
          });
        }
      })(rows);
      return 0;
    },
  });
  return result.hasChanged && result.count > 0;
}
