# Multi-terminal party and ledger synchronization

This contract supersedes the timestamp/alias behavior for party accounts and ledger entries described in the
historical outbox proposal. It applies to both cloud engines. Other domains retain their existing protocols.

## Financial identity

`party_id` and `ledger_id` are financial identities. Different IDs remain independent even when names, phone numbers,
amounts or descriptions match. Cloud upload, cloud download and startup repair must not merge party accounts by
contact details. Explicit user-requested account merging remains a separate operation. Customer profile cleanup is
not authority to reassign a party ledger. Ambiguous customer deletion must resolve an exact account ID or refuse before changing any records.

POS migration **025-preserve-party-identities** drops the old partial CUSTOMER name/phone unique index and resets
party/ledger timestamp cursors for a complete download. The obsolete startup index recreation is removed; restarting
must not reintroduce it. No account/payment is automatically restored, deleted or reassigned. No synced column is
added. `src/data/dbRows.ts` is regenerated from the current schema through the canonical generator.

## Compare against the captured cloud revision

`accountConcurrency.ts` in the server data layer serializes writes by tenant/table/ID, including concurrent first
inserts. A cloud revision is the opaque string `<row_version>:<origin>`. POS stores the last applied/acknowledged
revision in `sync_meta` under `account_base:<tenant>:<table>:<id>`.

- Legacy account uploads attach optional `_sync_base` to each party or ledger entry. They retain logical
  `row_version`/`origin`; other legacy entities keep their previous serialization.
- A new identity may be inserted. Identical business-content retries are acknowledged without another write.
- A different existing value is accepted only when `_sync_base` matches its current cloud revision. A higher local
  counter, later arrival or future wall clock does not authorize replacing an unseen cloud edit.
- Unverifiable/stale edits remain failed conflicts; they are never included in `synced`. The local pending edit is
  retained. Previously installed clients may create IDs and retry identical content, but must upgrade before normal
  editing of existing financial records can establish captured revisions. Do not clear their databases to bypass this.
- Successful responses add `versions: [{ id, base, server_seq, row_version, origin }]`. POS stores the receipt and
  marks only the acknowledged snapshot synced. An edit made during HTTP remains pending with its own contents.
- Outbox operations carry `_sync_base` on the operation envelope. They use the same data-layer decision. Financial
  conflict responses retain local rows and operations for review rather than applying the server copy over them.
  Applied-operation retries do not grant a baseline for an intervening edit from another terminal.

Derived balance/running-balance updates may advance `server_seq` without changing the business revision under tenant
migration107. Therefore `server_seq` is a download cursor, not the edit baseline. Actual ledger writes and balance
recalculation commit together; a failed recalculation rolls back the request rather than issuing a false acknowledgement.
Ledger parent ownership is tenant-scoped and active parent accounts are checked before new active postings.

## Retrying a lost server acknowledgement

The server may accept an edit with a captured current baseline while rebasing its lower local counter to a newer
cloud version. If the HTTP response is lost, the same applied operation must return a duplicate receipt when its
business content still matches the stored account, even when the accepted counter differs from the request.
`accountContentMatches` owns this comparison for both ordinary no-op retries and already-applied outbox requests.
The duplicate path performs no write/recalculation and does not advance the sequence. Different intervening content,
a missing row or a restored account after a delete still conflicts and cannot grant a receipt.

This is a compatible server-only correction at the existing API URL. POS 2.2.83 already consumes duplicate receipts
with snapshot guards; no new installer, endpoint, schema or migration is required. Regression coverage includes
server `accountRetry.test.ts`, real PostgreSQL integration/native regressions and POS `outboxLedgerConflict.test.ts`.
Existing manual-review markers/historical mismatches are not automatically removed by this correction.

## Ordered outbox edits and local balances

The outbox selects only the earliest unsent operation for each financial identity. A subsequent edit waits for its
predecessor's receipt before attaching the next captured revision; failed or exhausted predecessors block later edits
of that identity. Other accounts remain eligible. This prevents false self-conflicts and prevents an older retry
from replacing a later accepted edit. Migration026 adds a partial pending-identity index; it changes no records or
wire fields. Existing strict cloud revision checks remain unchanged.

Account changes downloaded by the outbox collect both previous and incoming party IDs. Before advancing the page
cursor, the same transaction recalculates each affected account once using the canonical ledger balance statement.
This includes protected local pending ledger rows and all GST/estimate buckets. Party-only downloads preserve the
local ledger projection; accounts with no ledger history retain their remote opening-only balance. Deletion of the
last entry and reassignment zero the old account. A recalculation failure rolls back the page and retains the cursor.

Coverage: `outboxLedgerConflict.test.ts` (consecutive edits, blocked/exhausted predecessors, protected pending totals,
ledger-only changes, deletion, reassignment and estimate buckets), plus outbox and migration characterization.

## Commit visibility before a financial sequence page

A PostgreSQL sequence number is allocated before commit. A transaction with a lower number may still be invisible
when a higher-numbered transaction commits; a plain `server_seq > cursor` read could otherwise strand the later commit.
Before sequence-based account reads and the outbox changes feed, the server obtains a short transaction-scoped
`SHARE MODE NOWAIT` fence on `parties` and `party_ledger`. The standard tenant transaction uses READ COMMITTED, so the
following SELECT sees preceding commits and new financial writers cannot allocate row sequences during that page.
A busy writer fails the read immediately rather than waiting in a conflicting lock order. The client retains the
previous cursor and retries; no successful partial page/cursor is emitted. Readers can coexist. New writers may wait
briefly for the page transaction; this is deliberately scoped to financial tables, not a global guarantee for all sync
domains. Keep page reads bounded and preserve lock/statement timeouts. Non-sequence legacy requests keep their protocol.

Coverage: server `accountReadFence.test.ts`, a real PostgreSQL lower-sequence late-commit test, and POS
`accountSequencePull.test.ts` busy-page cursor retention. This server correction requires no client wire/schema change.

## Complete, resumable cloud downloads

Parties and ledger entries negotiate sequence pages on their existing GET endpoints:

```text
GET /api/sync/parties?after_seq=0&limit=500&offset=0
GET /api/sync/party-ledger?after_seq=0&limit=500&offset=0
X-Nafid-Account-Sequence: 1  (response header)
```

The server returns existing row arrays in strictly increasing `server_seq` order, filtered by tenant and sequence.
POS `accountPull.ts` validates advancement using BigInt, applies each page and persists its cursor in the same SQLite
transaction. A failed page/cursor write rolls back. The next cycle resumes after the last committed page, including
when the cycle's bounded page budget is exhausted. Equal timestamps and more than 25,000 rows cannot strand older
entries behind a descending-offset cursor. A shorter/empty page completes the dataset.

The per-table keys are `account_pull_seq:<tenant>:<table>` and `account_pull_pending:<tenant>:<table>`. Accounts are
pulled independently before the generic timestamp change-status shortcut; party accounts precede their ledger.
The remaining generic shortcut uses the earliest relevant cursor and does not skip a missing dataset cursor.
Older endpoints/LAN without the response header fall back to the existing timestamp protocol; the client never
assumes sequence support from a successful HTTP status alone.

Applied cloud rows preserve logical versions/origins and capture their revision. Pending local rows remain protected;
a downloaded copy is not an upload acknowledgement. Party-page failures propagate and retain the page for retry.
LAN party and ledger ingest retain the existing version/origin ordering, including protection against stale copies;
financial push serialization now actually carries these metadata fields.

## Truthful completion and reconciliation

Unresolved conflicts are recorded as `account_conflict:<tenant>:<table>:<id>`. Sync progress reports their count and
unfinished downloads and pending uploads, including network failures. Background cycles broadcast the same outcome.
The outbox engine ignores timestamp-engine download markers. Technical outcomes remain in the sync progress state and
retained review metadata; they are not broadcast as cashier warning toasts or raw dashboard labels. `SyncStatusFooter`
shows simple active progress and genuine success only; an unresolved cycle uses the normal footer without claiming
100% completion. Super Dashboard has a SUPER_ADMIN-only shop sync support page. Authenticated terminals send bounded operational
snapshots to `/support/sync-reports`; only SUPER_ADMIN can read the cross-shop list. Shop ADMIN/STAFF cannot
read it and have no developer support panel in Settings. Authentication recovery controls remain actionable.

`activeAccountConflicts` counts only matching tenant party/ledger rows still PENDING or FAILED. Old markers whose
records have since synced or no longer exist remain retained for support but do not inflate the active count.
This is a diagnostic correction, not permission to overwrite competing financial records or report unresolved uploads
as successful. The specific 75 records in a customer screenshot were not inspected on a shop database.

This preserves competing records for administrator reconciliation; it does not choose a financial winner from a
name, amount or timestamp. There is no automatic historical repair. Mannar Metals was reported as a cloud-only
staff-PC/admin-laptop case, including differences after reinstall. The failure paths were reproduced on isolated
databases; the shop's own records and installed versions were not inspected. Preserve the remaining staff database
and any pre-reset backup before reconciling that shop.

## Verification and rollout

Regression coverage: `accountConcurrency.test.ts`, server PostgreSQL integration and
`ledgerIntegrity.embedded.cjs`; POS `accountSequencePull.test.ts`, `accountMetadata.test.ts`,
`partyPhoneSyncProtection.test.ts`, `partyLedgerSync.test.ts`, `ledgerIntegrity.test.ts`,
`outboxLedgerConflict.test.ts`, `syncOutcome.test.ts`, and migration/restart characterization.

Run both app gates and the relevant IPC, SQL, migration, startup, cloud login/no-login, outbox and LAN harnesses.
Sync golden changes include the negotiated sequence request and financial metadata; generated terminal/stock origins
are normalized without changing payload semantics. Stock-operation statement fixtures use valid canonical inputs,
and outbox batch/retry fixtures count actual queued operations and select the newest queue row deterministically.

Deploy the coordinated server before distributing the new POS. Update every terminal of a multi-computer shop;
older renderers still have their own account-merging behavior. HTTP endpoint names and existing response members
remain available, with additive revision receipts/query parameters. REST changes continue to publish revisions via
migration107. An imported browser renderer needs its separate reviewed import/adapter update. No hosting/account/API
URL changes are required. Complete the final-installer gate before publication; retain the immutable v2.2.81 assets.

## Exact retry representation (20 November 2026)

`accountConcurrency` compares empty optional text as NULL only for fields whose writers already persist that representation: parties phone/address/GSTIN/custom category/notes/pricing tier; ledger payment method/reference. This fixes false conflicts on unchanged SQLite retries after PostgreSQL normalization. A matching retry returns a receipt without rewriting cloud content, amount, timestamp or revision. Never trim substantive text, merge IDs, ignore amounts/classifications/categories or authorize a different existing value without its captured baseline.

No payload, schema, endpoint URL or desktop build input changes. Existing POS clients benefit on their next ordinary retry; this backward-compatible server fix requires no new installer. Actual distinct pending local edits still require scoped reconciliation. The owner's choice of the affected shop POS as the correct source is repair intent, not a global replacement rule or proof that the reported records have been repaired.

## Authorized source-terminal recovery

The owner may explicitly choose one active shop POS as the correct source for a bounded set of pending identities. This does not change normal conflict rules. Follow [account-recovery.md](account-recovery.md) for platform-only staging/activation, cloud and immutable source backups, current-cloud/parent/totals guards, canonical transactional application, retained historical operations and conditional acknowledgements. The job cannot silently expand or erase unlisted identities. Source capability and verified installer rollout are required; publication/activation is not proof of remote completion.
