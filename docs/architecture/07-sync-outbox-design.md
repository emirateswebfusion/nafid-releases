# 7. Sync outbox design (proposal)

Status: **rollout steps 1–4 implemented; outbox engine defaults OFF; field checks pending (§7.6)**. Today's sync is pinned by `tests/characterization/sync-run.mts` (cloud
push / pull, login and no-login) and `lan-run.mts` (LAN primary / secondary); any change below must keep those green or
update their goldens in a reviewed diff. File references are to `nafid-pos` unless prefixed with `server:` (`nafid-server`).

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
`ON CONFLICT … DO UPDATE SET col = EXCLUDED.col` (e.g. `server:src/db/repositories/sync/invoices.ts:65`,
`sync/catalog.ts:20`). Exceptions: product stock only moves forward in time (`sync/catalog.ts:166`), cash drawers merge
with `GREATEST` (`sync/cashier.ts:35`).

**LAN.** A primary terminal serves `/api/sync/*` to secondaries (`electron/sync/localHostServer.ts`), authenticated with
the shop pairing key. Rows a secondary sends are merged by `upsertTableRows` (`electron/sync/lanUpsert.ts`) and then
pushed to the cloud by the primary like its own rows.

## 7.2 Ways data can be lost, duplicated or resurrected

| # | Problem | Where | Effect |
|---|---|---|---|
| 1 | Last write wins on the server by **arrival order**, not by edit time | `server:sync/invoices.ts:65`, `sync/catalog.ts`, most `sync/*.ts` upserts | A terminal that was offline pushes an old edit after another terminal's newer one: the newer edit is overwritten. |
| 2 | LAN ingest stamps `updated_at = now` and keeps / sets `PENDING` | `lanUpsert.ts:137-142` | The primary re-pushes secondary rows as if they were edited now: an old edit outranks newer cloud data on every timestamp comparison (#1, stock rule `sync/catalog.ts:166`), and timestamps stop meaning "edit time". |
| 3 | `markSynced` fallback ignores the timestamp | `syncTransport.ts:276-292` | An edit made while its row was in flight can be marked `SYNCED` without ever being pushed (lost update). |
| 4 | Pull cursor is a wall-clock timestamp | `syncTransport.ts:301-333` | Rows written on the server with a timestamp older than the cursor (client clock skew, delayed commits, #2) are never pulled; the replay window only covers a few seconds. |
| 5 | Hard deletes are not propagated | e.g. invoice items removed with `deleteInvoiceItemByInvoiceId` (`electron/db/statements/recycleBin.ts`) | Rows deleted locally stay on the server and other terminals; a later full pull can bring them back (resurrection). Note: for products, `pullProducts` now protects against resurrecting soft-deleted items into local installations when the row does not exist locally. |
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

- Rollout step 2 records local row changes with three SQLite triggers per table in `SYNCED_TABLES`. The migration
  discovers columns and primary keys with `PRAGMA table_info`; updates watch every business column except
  `sync_status`, `updated_at`, `row_version` and `origin`. Inserts create `UPSERT` ops and set the new row's `origin`;
  business updates increment `row_version` and refresh `origin`; deletes create `DELETE` tombstones. Re-running the
  migration drops and recreates the triggers without enqueueing existing rows.
- Each op gets a random 32-character hex `op_id`, an ISO UTC `created_at`, a full `json_object` payload for upserts,
  and the terminal origin from `sync_meta.origin`. The migration creates that origin once as an 8-character lowercase
  hex id. Composite primary keys are joined with `:` in primary-key order. If a synced table has no primary key, the
  trigger generator uses its first `*_id` column; it fails migration if neither exists.
- The single-row `sync_apply_guard` marks the synchronous apply of data received from cloud or LAN. `withSyncApplyGuard`
  supports nested calls and removes the row in `finally`, including when the callback throws. The generic paginated
  pull wraps its row-application callback; direct user and lightweight-bill pulls and the LAN upsert are guarded too.
  Table tenant ids are used directly; when a table lacks `tenant_id`, the trigger reads it from its parent row where
  possible and otherwise records `global`.
- The existing pusher remains unchanged: it sends `PENDING` rows and strips `row_version` / `origin` from push bodies.
  Step 2 therefore dual-writes trigger ops while the legacy pusher still runs. The later outbox pusher will send ops
  in `created_at` order with their `op_id`; acknowledged ops get `sent_at` and retries resend the same id (#6).
  `sync_status` remains during the transition.

### Versions instead of timestamps

- Add `row_version INTEGER NOT NULL DEFAULT 0` to synced tables locally and on the server. In step 2, inserts use the
  row's current version (normally zero), business updates use `OLD.row_version + 1`, and deletes emit a tombstone at
  `OLD.row_version + 1`; the update trigger records the current terminal in the row's `origin`.
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
2. **Done (dual write):** SQLite triggers record local inserts, business updates and deletes for every synced table;
   cloud / LAN row applies use `sync_apply_guard`. The pusher still uses `PENDING` rows and strips the two local-only
   columns. `migrations.mts` asserts all triggers, insert / update / status-only / delete versions, nested and throwing
   guards, and idempotent trigger recreation. `sync-run.mts`, `run.mts`, `startup-idempotency.mts` and `lan-run.mts`
   remain characterization gates.
3. **Server accepts ops** (`POST /api/sync/ops`) with the version rule and idempotency table; old per-entity endpoints
   stay for older terminals.
4. **Done (opt-in):** Settings → Network & Connectivity → **Sync engine (beta)** (owner/admin only)
   sets the device-local `sync_engine` to `outbox`; absent or `legacy` keeps today's behavior. Switch the toggle off
   to return to legacy. LAN and HYBRID PRIMARY/SECONDARY terminals always use legacy, including cloud fallback.
   `outboxSync.ts` pushes at most 200 ops per batch; each cycle snapshots the queue boundary and attempts an op once.
   Applied/duplicate ops get `sent_at`; conflicts retain `last_error = 'conflict'` and `sent_at`, with the full server
   row applied under the guard. Other result statuses retry next cycle; after 10 attempts they remain for review,
   stop sending and appear as a count in sync progress. Concurrent edits keep their PENDING badge.
   Pull uses `/api/sync/changes`, atomically applies each page and advances `sync_meta.server_seq_cursor` (with a
   tenant marker to reset it on account changes). Rows with unsent local ops are skipped. Boolean tombstones become
   local soft deletes; outgoing DELETE ops are unchanged. Device settings and the legacy wipe-command key never
   leave the terminal through this engine. Urgent/fast sync uses the same serialized cycle.
   `outbox-run.mts` covers the new contract; legacy sync/IPC harnesses remain unchanged.
   Not covered: LAN op relay, version guards on old endpoints, server hard-delete tombstones, or the domain-specific
   side effects of old handlers. Old sync UPDATE/upsert paths now advance `server_seq`, but still lack version guards.
   Generic ops apply rows only: test with a real shop before rollout; keep older terminals in mind.
5. Remove `PENDING` scanning and the timestamp fallback (#3) once all terminals run step 4.

Tests that must stay green at every step: `tests/characterization/sync-run.mts` (login and `EQ_NO_LOGIN`),
`lan-run.mts`, `run.mts` (IPC), `startup-idempotency.mts`, `migrations.mts`, server `npm test` (golden master).

## 7.5 Open questions for the owner

1. Conflict policy: is "server copy wins, terminal edit kept for review" right for invoices, or should some fields
   (payments, settlement) merge?
2. Which tables need delete propagation first (invoice items, quotation items, staff attendance)?
3. Can older terminals be required to update before step 5, or must the old endpoints stay indefinitely?
4. Should the LAN primary also be the only terminal that talks to the cloud (simpler), or keep every terminal online?

## 7.6 Pending field checks (owner, recorded 28 Oct 2026)

Code and automated tests for these are merged; they still need a check in a real shop. The shop currently has
**one computer**, configured as the **LAN PRIMARY**.

1. **Install the current build.** Bump the version, `npm run package`, install it on the shop computer (it updates from
   `emirateswebfusion/nafid-releases`).
2. **Sync engine (beta), about one week.** LAN and HYBRID PRIMARY/SECONDARY terminals always use the legacy engine
   (§7.4 step 4), so the beta cannot run on the shop computer as it is configured today. Decide one of:
   - *One computer for the foreseeable future:* switch Settings → Network & Connectivity to plain cloud mode (back up
     `%APPDATA%\Nafid` first), enable **Sync engine (beta)** and use the app normally for a week; or
   - *A second computer is planned:* keep LAN PRIMARY and run the beta once the second terminal exists.

   Watch for: sync progress showing ops "for review" (`last_error`), missing or doubled bills/payments in the cloud
   dashboard, conflicts. Then do step 5 (§7.4) and schedule `pruneSyncOps` on the server (`03-sync-api.md`).
3. **LAN push restriction (POS PR #20, `electron/sync/lanTables.ts`).** Covered by `tests/unit/lanTables.test.ts`, not
   yet exercised with two real terminals. When a second terminal is paired, check that bills, payments, customers,
   products, cash drawer and settings made on the secondary still reach the primary, and that staff accounts edited
   on the primary still appear on the secondary (pull). A push to staff tables must answer 403.

## 7.7 Tables added after migration 002

`SYNCED_TABLES` stays frozen with migration 002 (its tables must exist when it runs). Later synced tables are listed by
their own migration and joined in `electron/db/migrations/syncedTables.ts` (`ALL_SYNCED_TABLES`), which the outbox
engine uses for enqueueing and applying. First: the seven restaurant tables of migration 016 (`RESTAURANT_SYNCED_TABLES`).
Their legacy push / pull is `electron/sync/entities/restaurantSync.ts`, run only when `feature_flags.restaurant_mode`
is on, so retail sync requests are unchanged (`sync-run.mts`, `lan-run.mts` and the IPC harness compared HEAD vs
candidate on 3 Nov 2026: identical apart from per-run random ids). Migration 015 also adds `BEFORE UPDATE ... RAISE(IGNORE)`
triggers so no writer (local, LAN ingest, cloud pull) can take an order, line or kitchen status back.

## 7.8 Legacy invoice line-order compatibility

Legacy invoice pull preserves the surviving line order already saved on the receiving terminal via
`invoiceItemOrder.ts`. Push and local invoice reads explicitly use SQLite row order. This changes neither
payload fields nor server endpoints, and does not introduce a schema migration or a shared line-position
contract. The current server can return items without their original position. First imports, LAN ingest
and beta/outbox row application do not gain a global order guarantee from this helper. A future guarantee
across terminals requires a coordinated POS/server position contract and migrations, not a UI sort or a
timestamp heuristic. Existing order already lost cannot be reconstructed. The local rule and tests are
documented in [data access](03-data-access.md#saved-invoice-line-order) and
[business rules](04-business-rules.md#saved-bill-line-order).
