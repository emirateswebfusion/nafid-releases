# Sync integrity: upload receipts and protected local edits

## Ownership and invariants

Ordinary cloud/LAN downloads do not acknowledge outgoing work. A matching record ID or wall-clock timestamp is not
proof that the server accepted the local payload. Only an upload result for the captured local snapshot may clear
pending state. A failed SQL prepare/bind must never fall back to clearing by ID alone.

The former `syncTransport.reconcilePending` and its unconditional-clear fallback factories are removed. Legacy catalog,
cash, sales, stock-document, customer and loyalty pull callbacks no longer clear local pending flags after reading a
remote copy. Without this boundary a first download could clear PENDING and a second download could replace the local
edit. Same-second timestamps and missing/invalid timestamp columns cannot authorize acknowledgement.

Data-layer legacy upserts protect both PENDING and FAILED local rows. FAILED is unacknowledged work, not permission to
replace the source. Settings and pricing-tier timestamp comparisons additionally require a clean local row and compare
parsed instants with julianday; a future cloud clock cannot override an unsent preference or tier. Loyalty transaction
upserts now have the same unsent-row guard. Existing explicit drawer-close and stock-counter merge rules remain their own
policies; this change does not claim to replace or certify every such policy.

Customer phone/name and pricing-tier name normalization cannot reassign/delete an identity with PENDING/FAILED source
work. `sync/pendingIdentity.ts` owns that guard. A blocked match throws through the page transaction to the existing
pagination failure path, so the source is retained and the failed page cursor does not advance. Clean-row legacy
normalization otherwise retains its prior behavior; an identity conflict is not silently accepted as a cloud success.

Customer and loyalty push success/failure updates require the captured tenant, ID, row_version and updated_at.
A response received after another local edit must not clear that edit or mark it failed. Acknowledgement changes only
sync metadata; it does not manufacture a new customer business timestamp. Financial party/ledger captured-base and exact
receipt requirements remain stronger and unchanged. Original operation IDs, customer/ledger IDs and financial content are
not rewritten to work around rejected uploads.

## Implementation and contract ownership

- Pull callback ownership: `electron/sync/entities/{catalog,cash,salesDocs,stockDocs,parties}Sync.ts`.
- Protected upserts/receipt SQL: corresponding `electron/db/statements/sync/` modules; Settings uses `settingsSync.ts`.
- Transport owns HTTP, pagination and cursor persistence, not SQL acknowledgements inferred from downloads.
- Server response shapes and server financial writers are unchanged. The reviewed browser renderer does not run these
  Electron services; it does not acquire fixes merely by changing native source. Its typed adapters still require server
  acknowledgement for writes. No web renderer copy/import or production deployment is part of this change.

## Regression evidence and limits

The new cash, Settings and delayed customer/loyalty tests reproduce six failures against the HEAD baseline and pass on
the fixed code. `cashDrawerCloseSync.test.ts` downloads the same-timestamp cloud copy twice and retains the local money
and PENDING/FAILED state. `featureSettingsSync.test.ts` retains unsent ordinary preferences despite a future cloud clock.
`legacyProfilePushRace.test.ts` checks edits made during HTTP and protects pending/failed loyalty points from downloads.
`pendingIdentityPull.test.ts` protects unsent customer phone/name matches and pricing-tier matches from destructive remaps.

These are root-cause protections, not a repair of data previously acknowledged/replaced incorrectly. Existing affected
shops still require verified source/cloud comparison and the scoped backup/receipt recovery protocol. No shop database
was read or changed in these tests. Source validation does not establish installer delivery or future absence of bugs.

Validation on 22 November 2026: final full POS suite passed 294 files / 2,814 tests; the affected suite passed 19 tests
including loyalty-download and pending-identity cases. Against the HEAD baseline, six selected root-cause regressions failed;
those cases pass after the fixes. IPC equivalence preserved 2,085 existing calls after separately checking the previously
intentional clear-pending/manual-channel changes. Cloud login/no-login comparisons preserved 48/6 observations, and
989 statement factories prepared successfully. Native build and architecture guard passed; lint retained zero errors and
warnings. LAN authentication/connectivity/cash-route/pairing-key checks matched baseline; that fixture does not establish
catalog hydration. Owned test servers and isolated profiles were cleaned up. This is uncommitted/unreleased source work,
not proof of shop repair or a validated installer.

## Download completion and independent financial ownership

Collaboration integration (25 November 2026): the working branch incorporates `origin/main` through `d280f198`, retaining
purchase payment synchronization, barcode printing, return metrics and the collaborator's backend/runtime configuration
changes alongside these sync fixes. The business-rules append conflict was resolved by retaining both feature/recovery
and purchase-payment sections. Combined verification passed: 297 files / 2,842 tests, renderer/Electron type checks,
architecture guard and zero-error/zero-warning lint. The two whitespace-only purchase-test edits change no behavior;
the reviewed purchase-payment section in `04-business-rules.md` and data-access contract remain accurate. No installer,
deployment or release was produced by this integration.

Invoice downloads never delete or restore party-ledger rows using invoice-number, reference-prefix or description
matching. That legacy inference was unscoped and could mutate unrelated entries or another cached shop. Ledger rows
must arrive through their own tenant/identity/version-checked account channel. Local user-requested invoice deletion
continues to use its canonical business service; removing this download-side inference does not remove that operation.

The generic legacy pull validates recognized array envelopes, object rows and parseable timestamps before applying a
page. Row/child/remap write failures propagate out of the owning SQLite transaction instead of being logged and skipped.
Exhausted invoice/product identity-collision retries fail the page too. Product-pricing downloads no longer contain a
separate timestamp/ID-based pending acknowledgement. A failed page cannot advance the timestamp cursor.

Only a short/empty page proves legacy completion. Hitting the 50-page budget or receiving an oversized unpaged response
is incomplete, not success; the previous cursor is retained. Generic legacy offset downloads do not yet resume a capped
scan across cycles. Such a backlog requires operator review/protocol or budget remediation; do not claim every row was
downloaded or advance past it to hide the limit. Financial account sequence downloads retain their existing bounded,
resumable protocol. Timestamp maxima and replay use the canonical UTC epoch parser, including negative offsets.

The historical `account_pull_pending:<tenant>:<table>` marker namespace now also represents incomplete generic legacy
downloads. Markers are cleared only with a successfully committed final cursor (including a valid empty page); failures
set the cycle-failed flag and retain the marker. Existing Super Admin `downloads` counts therefore cover incomplete table
downloads beyond financial accounts, without adding personal/financial data or exposing diagnostics to shop users.
The count is tables/markers, not missing-record count. A blocked metadata write is a failed cycle, never confirmed success.

Content notification caches use tenant/table keys and streaming SHA-256, rather than retaining raw row JSON. A hash is
published only after successful metadata commit; it is only a UI-notification optimization, never upload evidence.

Recheck tests: `legacyPullCompletion.test.ts`, the invoice-ledger/collision cases in `stockSnapshotSync.test.ts`, and the
rollback case in `cashDrawerCloseSync.test.ts`. Eleven selected cases fail against the HEAD baseline and pass after the
fixes. This does not prove that the same paths caused any specific production-shop incident without comparing its data.

### Recheck verification (22 November 2026)

- Full unit/UI run: 295 files / 2,826 tests passed. Two additional collision cases added after that run began are covered
  by the final focused run: three files / 28 tests passed. Eleven selected regressions failed against the HEAD baseline.
- Final renderer/Electron build and architecture guard passed. All 986 remaining SQL factories prepare successfully.
- Final lint ratchet passed with zero errors and zero warnings; whitespace checks passed in all three app repositories.
- Native IPC comparison: 2,085 comparable observations, no differences after the already documented manual-sync and
  unsafe-clear intentional changes. Cloud harness: 48 logged-in and six signed-out observations, no differences.
- Paired LAN fixture: baseline/candidate outputs equal, unauthorized/wrong-key reads rejected and paired sync succeeds.
  This fixture exercises pairing/cash routes; product counts are zero on both sides, so it is not catalog hydration proof.
- Isolated fixture databases and baseline source archive were removed; the fixture listener was stopped. No production
  shop records were changed. Source fixes remain unshipped; historical repair and installer validation are separate work.

Documentation counterparts reviewed/updated: workspace maintenance invariants; POS codebase map, data access, business
rules, change guide, multi-terminal accounts, manual sync and support reports; server sync API/support reports; Central
Portal administration. These enforce existing preservation/ownership contracts without a new wire protocol or ADR.

### Legacy cycle quotation push and warranty pull (26 November 2026)

`runSyncCycle` (`electron/sync/syncCycle.ts`) now pushes pending `quotations` (`syncQuotations`) during normal background
cycles rather than relying solely on urgent quotation triggers, and `unifiedDeltaPull` includes `warranties` in its
`since` table map while calling `pullWarranties` once when the server delta response omits `warranties`. Covered by
`tests/unit/syncCycleQuotations.test.ts`.

### Multi-page sync audit hardening (26 November 2026)

- `pullComboOffers`, `pullPurchaseBills`, `pullCashDrawer`, `pullInvoices`, and `pullLightweightPendingBills` protect both
  `PENDING` and `FAILED` local rows (and skip child-item replacement when the parent upsert is skipped).
- `insertScrapTransaction2` marks newly inserted scrap lines `PENDING`, `updatePurchaseBillByPurchaseBillId` persists
  edited `bill_number` values, `pullUsers` records the `users` pull cursor, `SalesHistory` clears `invoiceDetailsCache` on
  `onSyncDataUpdated`, and `pullSettings` / `LOCAL_DEVICE_SETTING_KEYS` align shared Cash Register & feature keys vs
  device-local UI/printer keys.
- Outbox `applyRow`, `canApplyConflict`, and `markLegacySynced` (`electron/db/statements/sync/outboxSync.ts`) preserve
  boolean JSON text for `settings.value` and strip `<tenant_id>:` prefixes on `settings` `DELETE` ops.
- Covered by `tests/unit/syncAuditFixes.test.ts`.
- Additional page/outbox hardening (26 November 2026): `pullRestaurant` wraps page upserts in `withSyncApplyGuard`;
  `StaffManager` `handleToggleStatus` preserves all staff fields and `staff.ts` `updateCashDrawerByDrawerId` marks
  `sync_status = 'PENDING'`; `useStockReportData` invalidates cache on `onSyncDataUpdated`; `deleteCustomer` nulls `phone`
  on soft delete; `pullReturns` syncs `is_deleted`, `reason_code`, `credit_note_number`, and `combo_details`; migration
  `028-rebuild-outbox-triggers.ts` rebuilds outbox triggers for `ALL_SYNCED_TABLES`; `processSourceRecoveryRequest`
  failures no longer block normal cloud sync cycles; and `ManualSyncPanel` retries safe exhausted outbox ops and shows
  live queue/conflict summary counts.
