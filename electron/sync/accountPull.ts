import { getDb } from '../db/localDb.js';
import { withSyncApplyGuard } from '../db/statements/outbox.js';
import * as metadata from '../db/statements/sync/accountMetadata.js';
import { syncState } from './syncState.js';
import { FETCH_TIMEOUT_MS, PULL_MAX_PAGES, PULL_PAGE_SIZE } from './syncConfig.js';
import { fetchWithFallback, getMeta, pullPaginated } from './syncTransport.js';

/** Sequence pages resume across bounded cycles; timestamps/offsets cannot skip an old ledger on a fresh terminal. */
export async function pullAccountPages(opts: Parameters<typeof pullPaginated>[0], maxPages = PULL_MAX_PAGES) {
  if (syncState.currentActiveRoute !== 'CLOUD') return pullPaginated(opts);
  const db = getDb(), cursorKey = `account_pull_seq:${opts.tenantId}:${opts.table}`;
  const pendingKey = `account_pull_pending:${opts.tenantId}:${opts.table}`;
  let cursor = getMeta(cursorKey) ?? '0', count = 0, reconciled = 0;
  const size = opts.pageSize ?? PULL_PAGE_SIZE;
  for (let page = 0; page < maxPages; page++) {
    if (!syncState.isSyncActive) return { count, reconciled, failed: true, hasChanged: count > 0 };
    try {
      const query = new URLSearchParams({ after_seq: cursor, limit: String(size), offset: '0' });
      const { response } = await fetchWithFallback(`${opts.urlPath}?${query}`, {
        headers: { Authorization: `Bearer ${opts.token}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // An older cloud or LAN fallback has the old timestamp/offset protocol. Never assume sequence ordering.
      if (response.headers.get('X-Nafid-Account-Sequence') !== '1') return pullPaginated(opts);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error('Invalid account page');
      let next = cursor;
      for (const value of rows) {
        if (!value || typeof value !== 'object' || !/^\d+$/.test(String(value.server_seq))) throw new Error('Invalid account sequence');
        const seq = String(value.server_seq);
        if (BigInt(seq) <= BigInt(next)) throw new Error('Account page did not advance in sequence order');
        next = seq;
      }
      const done = rows.length < size;
      let pageReconciled = 0;
      withSyncApplyGuard(db, () => db.transaction(() => {
        pageReconciled = opts.processPage(rows as Record<string, unknown>[]);
        metadata.write(db).run(cursorKey, next);
        if (done) metadata.remove(db).run(pendingKey);
        else metadata.write(db).run(pendingKey, '1');
      })());
      reconciled += pageReconciled;
      count += rows.length; cursor = next; opts.onProgress?.(count);
      if (done) return { count, reconciled, failed: false, hasChanged: count > 0 };
    } catch (error) {
      console.error(`[SyncWorker] ${opts.label} sequence download stopped; page retained for retry:`, error);
      metadata.write(db).run(pendingKey, '1');
      return { count, reconciled, failed: true, hasChanged: count > 0 };
    }
  }
  return { count, reconciled, failed: false, hasChanged: count > 0 };
}
