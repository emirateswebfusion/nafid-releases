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
The outbox engine ignores timestamp-engine download markers. The dashboard preserves this outcome instead of replacing it with a green generic completion
badge or hiding it after four seconds. `syncOutcome.ts` owns that display decision. The authenticated shell also exposes the notice through the canonical FloatToast, including staff billing screens; no new toast library or immediate settings save is introduced.

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
