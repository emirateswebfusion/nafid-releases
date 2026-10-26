# 7. Sync outbox design (proposal)

Status: **proposal, not implemented**. Today's sync is pinned by `tests/characterization/sync-run.mts` (cloud push / pull,
login and no-login) and `lan-run.mts` (LAN primary / secondary); any change below must keep those green or update their
goldens in a reviewed diff. File references are to `nafid-pos` unless prefixed with `server:` (`nafid-server`).

## 7.1 How sync works today

**Push (terminal → cloud).** Every business write marks its row `sync_status = 'PENDING'` and bumps `updated_at`. Each
cycle (`electron/sync/syncCycle.ts`) runs the per-entity pushers in `electron/sync/entities/*Sync.ts`: select
`PENDING` rows of a table, post them in batches (`pushBatch`, `electron/sync/syncTransport.ts:200`) to
`POST /api/sync/<entity>`, and mark the ids the server returns in `synced[]` as `SYNCED`.

**Marking SYNCED.** `reconcilePending` (`syncTransport.ts:267`) sets `SYNCED` only if the row's timestamp still equals
the one that was pushed (`markSyncedIfUnchanged`), so an edit made while the batch was in flight stays `PENDING`. If
that statement cannot be prepared (table without the timestamp column) or fails for a row, it falls back to
`markSynced` **without** the timestamp check (`syncTransport.ts:276-292`).

**Pull (cloud → terminal).** `pullPaginated` (`syncTransport.ts:344`) pages through `delta-pull` per table using a
cursor stored in `sync_meta` (`pull_cursor:<tenant>:<table>`, `syncTransport.ts:301`), rewound by a few seconds
(`replaySince`, `:322`) to re-fetch rows with identical timestamps. Local upserts skip rows that are still `PENDING`
locally, so unsynced local edits win until they are pushed.

**Server merge.** Most sync repositories upsert by id with unconditional
`ON CONFLICT … DO UPDATE SET col = EXCLUDED.col` (e.g. `server:src/db/repositories/syncInvoices.ts:65`,
`syncCatalog.ts:20`). Exceptions: product stock only moves forward in time (`syncCatalog.ts:166`), cash drawers merge
with `GREATEST` (`syncCashier.ts:35`).

**LAN.** A primary terminal serves `/api/sync/*` to secondaries (`electron/sync/localHostServer.ts`), authenticated with
the shop pairing key. Rows a secondary sends are merged by `upsertTableRows` (`electron/sync/lanUpsert.ts`) and then
pushed to the cloud by the primary like its own rows.

## 7.2 Ways data can be lost, duplicated or resurrected

| # | Problem | Where | Effect |
|---|---|---|---|
| 1 | Last write wins on the server by **arrival order**, not by edit time | `server:syncInvoices.ts:65`, `syncCatalog.ts`, most `sync*.ts` upserts | A terminal that was offline pushes an old edit after another terminal's newer one: the newer edit is overwritten. |
| 2 | LAN ingest stamps `updated_at = now` and keeps / sets `PENDING` | `lanUpsert.ts:137-142` | The primary re-pushes secondary rows as if they were edited now: an old edit outranks newer cloud data on every timestamp comparison (#1, stock rule `syncCatalog.ts:166`), and timestamps stop meaning "edit time". |
| 3 | `markSynced` fallback ignores the timestamp | `syncTransport.ts:276-292` | An edit made while its row was in flight can be marked `SYNCED` without ever being pushed (lost update). |
| 4 | Pull cursor is a wall-clock timestamp | `syncTransport.ts:301-333` | Rows written on the server with a timestamp older than the cursor (client clock skew, delayed commits, #2) are never pulled; the replay window only covers a few seconds. |
| 5 | Hard deletes are not propagated | e.g. invoice items removed with `deleteInvoiceItemByInvoiceId` (`electron/db/statements/recycleBin.ts`) | Rows deleted locally stay on the server and other terminals; a later full pull can bring them back (resurrection). |
| 6 | No idempotency key on pushes | `pushBatch` retries after timeouts (`syncTransport.ts:210-258`) | Row upserts are idempotent by id, but any server-side side effect of a sync handler (stock, ledger, numbering) can apply twice when a request succeeded but its response was lost. |
| 7 | Pull guard is "local `PENDING` wins" | entity pull handlers | Combined with #1, the terminal that pushes last overwrites everyone, whichever edit was actually newer. |
| 8 | Status lives on the business row | every synced table | Any write path that forgets `sync_status = 'PENDING'` silently never syncs; the startup repairs had to be made idempotent for exactly this reason (`tests/characterization/startup-idempotency.mts`). |

## 7.3 Proposed design

### Outbox

```sql
CREATE TABLE sync_outbox (
  op_id        TEXT PRIMARY KEY,          -- uuid, idempotency key end to end
  tenant_id    TEXT NOT NULL,
  entity       TEXT NOT NULL,             -- 'invoices', 'invoice_items', ...
  entity_id    TEXT NOT NULL,
  op           TEXT NOT NULL,             -- 'UPSERT' | 'DELETE'
  row_version  INTEGER NOT NULL,          -- version the op produces
  payload      TEXT,                      -- JSON row (UPSERT) / NULL (DELETE)
  origin       TEXT NOT NULL,             -- terminal code
  created_at   TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  sent_at      TEXT
);
CREATE INDEX idx_sync_outbox_pending ON sync_outbox(tenant_id, sent_at, created_at);
```

- Every business write enqueues its op **in the same transaction** through one statements helper
  (`electron/db/statements/outbox.ts: enqueueOp`), called from the services that already write the row. This replaces
  per-table `PENDING` scanning (#8) and makes deletes first-class (`op = 'DELETE'`, tombstone; #5).
- The pusher sends ops in `created_at` order with their `op_id`; ops the server acknowledges get `sent_at`. Retries
  resend the same `op_id` (#6). `sync_status` stays for display only during the transition.

### Versions instead of timestamps

- Add `row_version INTEGER NOT NULL DEFAULT 0` to synced tables locally and on the server. Each local write sets
  `row_version = row_version + 1` and records `origin`.
- Server rule per op: apply if `incoming.row_version > stored.row_version`, or equal version and `origin` sorts higher
  (deterministic tie-break); otherwise reject with the server's current row in the response, which the client applies
  (conflict = server copy wins, client edit kept in the outbox with `last_error = 'conflict'` for review). Fixes #1, #7.
- `updated_at` remains informational and is never rewritten on relay (#2).

### Server side

- `sync_ops_applied (op_id PRIMARY KEY, tenant_id, applied_at)`: an op seen before is acknowledged without
  re-applying (#6); rows older than 30 days are pruned.
- `server_seq BIGSERIAL` (or a per-tenant sequence) on every synced table, set on each applied change. Pull cursors
  become "last `server_seq` seen" per table: no clock dependence, no replay window (#4).

### LAN

- The primary relays secondaries' ops unchanged (same `op_id`, `row_version`, `origin`) into its own outbox instead of
  re-stamping rows (#2). Secondaries pull from the primary by the primary's local sequence, mirroring the cloud rule.

## 7.4 Rollout (numbered migrations, one release each)

1. **Done:** POS migration `electron/db/migrations/002-sync-outbox.ts`; server migration `src/db/migrations/tenant/095_sync_versions.sql`. Schema only; no behaviour change.
   Until step 4 the new columns stay local: push bodies drop `row_version` / `origin` (`syncPushBody` in
   `electron/sync/syncTransport.ts`), and LAN ingest stores `row_version = 0` for rows from terminals without the
   migration (`electron/sync/lanUpsert.ts`). `sync-run.mts` (both modes) and `lan-run.mts` (same and mixed versions)
   are unchanged; IPC responses only gain the two columns.
2. **Dual write:** services enqueue ops and bump `row_version`; the pusher still uses `PENDING` rows. Characterization:
   `sync-run.mts` unchanged; new unit / characterization tests assert one op per write and per delete.
3. **Server accepts ops** (`POST /api/sync/ops`) with the version rule and idempotency table; old per-entity endpoints
   stay for older terminals.
4. **Switch the pusher** to the outbox and the puller to `server_seq`; `sync-run.mts` golden updated in a reviewed diff
   (request shape changes), `lan-run.mts` updated for relayed ops.
5. Remove `PENDING` scanning and the timestamp fallback (#3) once all terminals run step 4.

Tests that must stay green at every step: `tests/characterization/sync-run.mts` (login and `EQ_NO_LOGIN`),
`lan-run.mts`, `run.mts` (IPC), `startup-idempotency.mts`, `migrations.mts`, server `npm test` (golden master).

## 7.5 Open questions for the owner

1. Conflict policy: is "server copy wins, terminal edit kept for review" right for invoices, or should some fields
   (payments, settlement) merge?
2. Which tables need delete propagation first (invoice items, quotation items, staff attendance)?
3. Can older terminals be required to update before step 5, or must the old endpoints stay indefinitely?
4. Should the LAN primary also be the only terminal that talks to the cloud (simpler), or keep every terminal online?
