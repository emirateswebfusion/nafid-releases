# Shop-confirmed background account recovery

## Scope and authority

The native Settings Sync now button requires an explicit checkbox confirming that this computer contains the complete,
correct shop data. Only an unlocked matching shop ADMIN/OWNER with usable cloud credentials, saved cloud permission and
CLOUD primary route may enqueue it. The existing `manualCloudSync({confirm_complete:true})` bridge persists a UUID-bound
intent and returns QUEUED without awaiting network. Settings drafts and billing remain usable; there is no forced restart,
database removal, cart reset or modal held open until the job finishes. Small local metadata writes and online backup IO
still consume resources; zero latency under all disk/hardware conditions cannot be guaranteed.

**Implemented scope is selected pending/failed parties and party_ledger, at most 100 identities.** It is not full-shop
database replacement, historical all-row comparison or a guarantee that every future sync succeeds. Unlisted/cloud-only
rows are never inferred to be deletions. Scopes over the cap, missing source context, changed cloud rows, missing
dependencies or differing totals are retained for platform review, not silently split or overwritten. Do not tell shops
that this button replaces all invoices, products, staff, settings or other domains in the cloud.

## Background execution and backups

`sync/sourceRecoveryRequest.ts` runs inside the existing serialized CLOUD cycle before ordinary push/pull. It keeps the
request tenant/terminal/UUID and exact source target list fixed across retries. The request does no network work in the
IPC handler. A pending request prevents ordinary cloud pulls/pushes from racing ahead of authoritative account recovery;
local billing remains available. This cloud pause is deliberate while review is needed, not a claim that billing stops.

Before the first server request, `services/sourceDatabaseBackup.ts` makes an online whole-SQLite backup under the private
userData/source-recovery-backups directory, yielding in 128-page batches. It never closes the live database. A completed
file is atomically renamed and retained with size/SHA-256 metadata. Retrying verifies the saved digest; a missing,
incomplete or uncertain retained file blocks activation. Partial files are never trusted. The whole database file is not
uploaded or exposed through support reports. Existing immutable selected-row/parent-total/outbox-boundary backups remain
mandatory and represent the exact later source payload, including edits made during the online file backup.

Server `/support/account-recovery/source-confirmed` accepts only own-shop ADMIN/OWNER. JWT determines tenant and actor;
body fields cannot select either. It validates exact 1–100 IDs, takes a per-tenant source-request lock, rejects another
open source job, and commits cloud before-images before publishing/activating the UUID-bound job. The actual tenant
source payload is durably captured before the canonical apply transaction. Existing scoped recovery performs all writes,
cloud-current checks, ledger recalculation/total validation and exact immutable receipts. Cloud changes after staging
remain conflicts; user confirmation does not waive those protections.

A replay may not alter shop, actor, terminal or targets. A durable cloud audit left before central publication is reused
only for the same scope. A lost response reuses the same saved local snapshot and job ID. Newer edits and outgoing
operations remain pending under the existing account acknowledgement guards. Completion removes only the request marker;
source/file/cloud backups remain. Expired/cancelled/blocked jobs require operator review; the shop is never instructed to
delete its database or overwrite a saved source snapshot.

## Reporting and compatibility

The shop sees only confirmation, a neutral request acknowledgement or a local submission failure. It sees no pending
counts, conflict tables, raw errors or developer completion report. QUEUED means durable intent, not recovered cloud data.
Super Admin receives allow-listed `source_confirmation` metadata (request ID, local confirmed-by/time, PENDING_ACCOUNTS
scope) and existing PENDING/RETRY/COMPLETE recovery status/code through support reports. These are reported terminal
metadata; server job audit actors remain the authoritative JWT-derived authorization record. The portal shows shop,
terminal, scope and status and its copy export contains no permit, financial snapshot or private backup path.

Backend must be deployed before a validated new desktop installer. A 404/old backend retains the intent/source and
requires developer attention; it must not trigger arbitrary fallback writes. Existing clients and ordinary no-argument
manual retries remain compatible. Source tests do not prove production deployment, installed-client upgrade or a repaired
shop. No production recovery has been performed by this implementation.

## Verification owners

POS: `sourceRecoveryRequest.test.ts`, `sourceDatabaseBackup.test.ts`, `manualSyncService.test.ts`,
`manualSyncPanel.ui.test.tsx`, existing `accountRecovery.test.ts` and full IPC/cloud/LAN characterization.
Server: `sourceRecoveryRequest.test.ts`, account recovery policy/service/integration tests, support allow-list and golden
master. Portal: source confirmation presentation/copy tests, browser/POS suite, production build and synthetic UI checks.
Release gates and actual source acknowledgement are separately required before announcing successful shop recovery.

## Local implementation evidence — 22 November 2026

POS full suite: 292 files / 2,801 tests passed before the last retained-backup retry guard; the final affected suite
passed 45 tests, including that guard, source confirmation, immutable replay, backup failure and receipt preservation.
Native online-backup characterization continued billing-like writes while retaining 200 rows, passed SQLite quick_check
and verified the retained backup digest on replay. IPC comparison preserved 2,085 existing calls after separately checking
intentional legacy-clear denial/new manual-channel guards; cloud login/signed-out comparisons preserved 48/6 observations.
991 statement factories prepared. These tests used isolated canonical-workspace profiles, not shop data.

Server final full verification passed 412 tests; targeted authorization/recovery/support/connection tests passed 20. The reviewed
golden change adds only two 400/no-query cases for the new static endpoint (other pre-existing feature changes remain
separate). Portal passed 26 Node tests and 214 browser/POS tests; synthetic running UI confirmed the required checkbox,
neutral shop receipt and separate developer-only report card. Builds and architecture/lint checks are recorded separately.
Final POS lint passed with zero errors/warnings; POS/server architecture guards and TypeScript/build gates passed.
LAN authentication, connectivity, cash-route sync and pairing-key results matched baseline; catalog hydration is not
established by that fixture (both sides contain zero catalog products). Owned preview/test servers and isolated profiles
were cleaned up. The source-request central transaction reuses one connection, with context-isolation regression coverage.
No installer was packaged, release published, backend deployed or real shop recovered in this change.
