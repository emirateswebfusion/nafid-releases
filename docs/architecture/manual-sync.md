# Manual cloud sync

## Ownership and flow

Settings → Network sync exposes **Sync now** on native clients advertising `manualCloudSync`. The visible button now requires the correct-source confirmation and enqueues background recovery; it does not display developer diagnostics or await network completion. See [source-confirmed recovery](source-confirmed-recovery.md). The no-argument compatibility call retains ordinary retry semantics below. This is an explicit
operation, independent of Settings' draft Save Changes. `ManualSyncPanel → syncApi → preload sync:manualCloud →
syncEcommerceHandlers → manualSyncService` is the only new entry point. The result types live in
`src/data/manualSyncTypes.d.ts`; SQL lives in `electron/db/statements/sync/manualSync.ts`.

An unlocked ADMIN/OWNER session, matching tenant/user/cloud credential, allowed saved cloud access and CLOUD primary
route are required. A supplied shop ID is never accepted. Concurrent requests share the operation, an existing cycle
is joined first, and the session is checked again after asynchronous boundaries. Authenticated cloud preflight must
succeed before retrying work. The action enables and runs the existing serialized cycle, not `runInitialSync`:
it does not reset cash cursors, change LAN routing or launch a second upload engine.

Support reporting is refreshed before and after the attempt (`reportSyncSupport(true)` bypasses only the normal
throttle). Reporting still requires normal cloud authorization and respects an in-flight report. Receiving a recovery
directive uses the existing authorized recovery protocol; the ordinary retry call does not create or approve a recovery job. Explicit confirmed source requests use the separate bounded protocol documented above.

## Retry and acknowledgement invariants

The ordinary pull path also follows [sync integrity](sync-integrity.md): downloads do not clear pending state and failed
local uploads remain protected. Manual retry does not replace these root-cause guards or repair previously lost values.
Incomplete-download totals count table markers, including capped/failed generic legacy pulls, not missing records.
Queued source confirmation does not prove download/upload completion; the existing financial sequence path resumes,
whereas capped legacy offset scans remain incomplete pending protocol/budget remediation.

At most 200 exhausted outbox candidates are inspected per action. Recognized transient transport errors and strict
`parties`/`party_ledger` conflict probes receive one additional attempt (attempts becomes 9). The original operation ID,
payload, captured base, revision, origin and queue ordering remain unchanged. The existing server writer may acknowledge
an identical previously accepted retry. A different financial record remains rejected. Validation errors are not
generically retried; this operation never fabricates a base or chooses local-wins.

Legacy acknowledgement in catalog, cash, sales and stock-document uploaders checks the captured row version and owner
inside the acknowledgement transaction through `legacyAcknowledgement.ts`. A receipt for an older in-flight upload
cannot clear a newer local edit. Purchase bill, return and quotation acknowledgements also compare the exact captured
child-key/revision set before clearing document items. Missing/unverifiable snapshots remain pending. Trigger suppression
prevents acknowledgement metadata itself from generating a new outgoing operation. Products retain their existing
timestamp/stock snapshot guard; parties/ledger retain their existing strict account receipt guards.
Non-feature settings receipts compare the exact owner/key/value/timestamp/revision instead of clearing both shop and
global rows by key. Feature selections retain their existing exact value/timestamp guard. Inspection conservatively
includes legacy global/unset/unowned pending rows so orphaned work cannot produce a false clean result.
Pricing acknowledgements target the captured pricing ID, owner and revision, never another row sharing a product/tier.

The compatibility `sync:clearPending` channel now denies clearing: cloud acknowledgement is mandatory. The legacy
drain channel delegates to this same service; its `drainedCount: 0` is an unmeasured compatibility placeholder, never
an uploaded-record count. The duplicate Drain Queue UI is removed. No data, outbox payload or conflict marker is deleted
to make a queue appear empty.

## Truthful results and recovery

`CHECKED` means only that the inspected local upload queues have no pending work. It is not a complete local/cloud
reconciliation proof. `PENDING` retains waiting uploads/download markers; `REVIEW` retains active conflicts or exhausted
operations; `FAILED` covers unavailable cloud, failed cycles or failed inspection; `BLOCKED` covers session/policy/route
requirements. Source rows and outbox operations are different counts and must not be added together as unique records.
Missing expected source tables fail inspection rather than being treated as empty. Session changes suppress stale UI results. The visible shop action reports only neutral request acknowledgement; developer statuses and counts belong to the Super Admin portal.

Real financial divergence uses [scoped account recovery](account-recovery.md), either explicitly confirmed by the shop administrator or selected by the platform operator: confirmed source terminal,
durable backups of both sides, exact receipts and rollback. The shop's local records are preserved pending that decision.
SUPER_ADMIN review remains exclusively in the Central Web Portal. Older clients and the browser renderer without this
native capability hide the button; do not add a browser adapter that reports fake native success.

## Verification and delivery

Regression coverage: `manualSyncService.test.ts`, `manualSyncSql.test.ts`, `manualSyncPanel.ui.test.tsx`,
`pendingAcknowledgementGuard.test.ts`, `legacyAcknowledgement.test.ts` and `outboxLedgerConflict.test.ts`.
`tests/fixtures/manualSyncWorkspace.html` exercises the actual button with synthetic CHECKED/PENDING/REVIEW/FAILED
results without touching a shop database. A new validated desktop installer is required for installed terminals;
source tests and synthetic UI checks do not establish that any reported shop has been repaired or updated.

Implementation verification (21 November 2026): the full POS suite passed 290 files / 2,790 tests before the final
settings/pricing guards; the final affected suite passed 47 tests, including those guards. Baseline/current IPC comparison
preserved 2,085 existing calls after separately asserting the new BLOCKED manual channel and intentional clear-pending
denials. Cloud characterization preserved 48 logged-in and 6 signed-out observations. LAN authentication, connectivity,
cash-route sync and saved pairing-key results matched baseline; both fixtures had zero catalog products, so that run
does not establish catalog hydration. Statement preparation passed 991 factories. Synthetic UI exercised all four result
states and disabled the button during the attempt. Temporary profiles and owned test servers were cleaned up.

Decision: [ADR 0008](adr/0008-manual-sync-preserves-conflicts.md). Delivery remains uncommitted/unreleased; actual shop
recovery is unconfirmed. Do not translate these local checks into a claim that pending shop conflicts have disappeared.
