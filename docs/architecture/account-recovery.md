# Scoped source-terminal account recovery

See [validation and delivery status](account-recovery-validation.md) for verified checks and outstanding rollout evidence.

## Purpose and authority

Recover selected pending party/ledger identities without remote desktop access, deleting local databases, or blocking billing. Ordinary cloud/LAN/outbox conflict rules remain unchanged. Only an explicitly selected shop POS is authoritative for an authorized job; never introduce a global local-wins policy. The owner must have confirmed that source. SUPER_ADMIN manages platform jobs only in the Central Web Portal. A confirmed shop ADMIN/OWNER can additionally enqueue a bounded source request through the dedicated source-confirmed endpoint; this cannot list/cancel platform jobs or read cross-shop jobs. See [shop-confirmed source requests](source-confirmed-recovery.md).

Recovery preserves distinct IDs, original source contents, original creators, both prior cloud and source snapshots, and newer local edits. It never matches names/phone/amounts, infers deletion of unlisted rows, reassigns an existing ledger to another party, clears a shop database, or force-restarts a terminal. Ledger totals must match the source context before commit; missing history/dependencies cause rollback, not invented balances.

## Server state and backups

- Central migration098 `account_recovery_jobs` contains operational pointers, scope count, cloud-backup count, reason, requester/activation/cancellation actors, status and a 72-hour expiry. It contains no financial snapshots or permit secrets.
- Tenant migration108 `account_recovery_audit` retains exact targets, staged cloud before-images (including explicit absent identities), immutable source rows/totals, current affected party/ledger before-images and successful receipts. It is tenant-filtered and RLS-protected. Backups are retained; cancellation does not delete them.
- `READY`: a fresh report (received within ten minutes, complete pending list, 1–100 unique party/ledger IDs) selected the source. A tenant transaction committed complete cloud before-images before publishing the central job. If either write fails, there is no active repair; an inert backup may remain.
- `ACTIVE`: a platform operator confirmed the exact terminal and source authority after seeing scope/backup counts. Expired/cancelled jobs cannot start financial writes. Central job-row locking serializes activation/cancellation/application across API instances.
- `APPLIED`: one tenant transaction committed every selected source write and the immutable receipts. This tenant audit is authoritative; a failed central status cache update heals on replay or the next report. An exact replay returns stored receipts without applying again. A changed replay is rejected.

Source receipt is backed up in its own tenant transaction BEFORE financial mutation, so even an attempted repair that rolls back remains diagnosable without accessing the shop PC. Financial before-images, canonical writes, balance validation and APPLIED receipts commit atomically. A later cloud edit, changed ledger parent, missing source/creator/pricing tier/parent, invalid data, lock/write failure or source-total mismatch blocks the entire job. Unselected financial fields are not overwritten by raw SQL. Source/cloud snapshots are private operational financial records, not ordinary report/export payloads.

## HTTP contract and permissions

Existing base URL remains approved; no auth/sync endpoints move. `/support/account-recovery` is additive:

| Method/path | Role | Behavior |
|---|---|---|
| GET `/` | SUPER_ADMIN | At most 100 operational job summaries; no snapshots/permits |
| POST `/stage` | SUPER_ADMIN | Validated tenant UUID, source terminal and reason; backs up exact report identities |
| POST `/source-confirmed` | Own-shop ADMIN/OWNER | Explicit confirmed terminal, UUID request ID, exact bounded pending account targets; backs up before activation; no platform privileges |
| POST `/:id/activate` | SUPER_ADMIN | `confirm_terminal` must exactly match; `accept_local_as_source: true` |
| POST `/:id/cancel` | SUPER_ADMIN | Stops a pending job; preserves audit; cannot cancel a committed application |
| POST `/apply` | Authenticated shop ADMIN/OWNER/STAFF | Tenant derives from JWT; job, exact terminal, HMAC permit, exact complete source IDs and parent balance context must match |

Support POST accepts `recovery_capable: true` and allow-listed `recovery_status: {job_id,state,code}` metadata. Response adds `recovery: null | {job_id,tenant_id,terminal_id,permit,expires_at,targets:[{entity,id}]}`. Existing clients ignore this additive response and receive no directive without capability. Ordinary reports still contain no money, source payload, arbitrary errors or credentials. Copy/export never includes a permit or snapshots.

The permit is HMAC-SHA256 under existing server JWT signing configuration and bound to job/shop/terminal. It supplements tenant JWT authorization and operator approval. Terminal origin is an operational identity, not hardware attestation or a substitute for credentials; the existing shop sync trust boundary remains. Never grant cross-tenant repair from a body tenant ID or implement an arbitrary SQL/command channel.

## POS execution and acknowledgement

`electron/sync/supportReport.ts` only queues a validated, allow-listed directive through `accountRecovery.ts`. Execution occurs inside the existing serialized main CLOUD cycle, before ordinary pushes, respecting cloud-access policy. LAN cycles do not apply recovery. The existing manualCloudSync bridge also accepts explicit source confirmation to enqueue background intent. There is no new Settings persistence switch, customer diagnostics toast or recovery-completion wait in the billing UI.

Before networking, one SQLite transaction captures all selected current rows, parent balance context and covered outstanding queue operations through the current queue boundary. It stores an immutable backup under `sync_meta/account_recovery_backup:<tenant>:<job>`. An unreadable/missing record, newer queued history, invalid totals, storage failure, more than 5,000 queue operations, queue payload history over 8 MB, complete backup over 12 MB or a source payload over 2 MB prevents upload. Byte limits use UTF-8 bytes. The job covers at most 100 identities. Omitted source records are never treated as deletions.

Parent context includes the canonical local currency precision (`money_decimals`). The server checks this against the shop's canonical cloud country profile before financial writes, and compares all totals using the existing money helpers. A precision mismatch blocks the transaction; recovery must never silently discard three-decimal currency differences.

The worker sends only the selected source rows and parent totals, not queue histories, to the dedicated authenticated endpoint. It reuses the exact saved snapshot on retry, including after an uncertain/lost response; newer local edits must never become a different replay of the same job. Network failure retains everything. A response must contain one valid exact-identity/version/base receipt per source record before local acknowledgement.

Acknowledgement reuses `accountPushResult` row-version/time guards. It never replaces local financial fields. Covered old outbox operations are marked sent only for the selected shop/identity, through the captured queue boundary and no newer than the saved source revision; operation history remains in the backup and outbox. Edits/operations created during HTTP remain pending and use the accepted baseline normally. Receipt/queue/completion writes are one SQLite transaction; failure rolls them all back while retaining the immutable snapshot for replay.

Developer-only status is PENDING/RETRY/COMPLETE with a bounded HTTP/retry code, not raw errors or data. COMPLETE describes this job's acknowledgement, not every historical record in the shop. No job is silently broadened after failure; retain the evidence and review/re-stage an explicit scope if the source or cloud changed.

## Ownership, rollout and proof

Server: `routes/accountRecovery → services/accountRecovery → db/repositories/accountRecovery` (central lifecycle) and `sync/accountRecovery{,Policy}` (tenant backup/validation/canonical application). Existing `sync/parties` and `partyLedger` own writes and calculations. POS: `sync/accountRecovery → db/statements/sync/accountRecovery`, plus the existing account metadata owner. Web: `AccountRecoveryControls → lib/accountRecovery`, inside the SUPER_ADMIN support page.

Deploy server migrations/routes before distributing a fully validated recovery-capable POS installer. Existing 2.2.86 clients keep normal sync/reporting but cannot execute a recovery directive. Publish the new version through the independent approved update feed; use normal update/exit behavior. Never force restart during billing, bypass OS prompts or claim the remote shop installed an update merely because it was published. Cloud/client source payloads and current totals must be observed before actual success can be asserted.

Required proof: tenant/role/permit/identity guards; durable backup failure; exact immutable replay after response loss; source and before-image retention; canonical creator/dependency/balance behavior; concurrent local-edit and cloud-edit protection; rollback; RLS; ordinary no-job characterization; final packaged installer/upgrade and public hashes. Delivery evidence must distinguish source validation, publication, remote installation, staged backup, activation, committed cloud recovery and fresh source acknowledgement.

## Manual sync boundary

[Sync now](manual-sync.md) refreshes diagnostics and retries unchanged eligible operations through normal writers. The ordinary retry call cannot authorize source recovery. The native source-confirmation UI can explicitly designate this terminal for the bounded pending account scope through [source-confirmed recovery](source-confirmed-recovery.md); it still cannot bypass backups, cloud-change guards or exact receipts.
