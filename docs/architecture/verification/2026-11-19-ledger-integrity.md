# Party ledger and cash register verification — 19 November 2026

This records the shipped v2.2.81 change, rather than a claim that every older terminal or historical record is repaired.

## Ownership and contracts

| Concern | Implementation / canonical reference |
|---|---|
| Atomic linked payment and retryable form | `cashierService.addTransaction`, `useCashDrawerActions`; [IPC contract](../03-data-access.md#linked-register-payment-ipc) |
| Explicit-link deletion and guarded restore | `cashierService`, `partiesService`; [business rules](../04-business-rules.md#cash-register-and-party-ledger-integrity-19-november-2026) |
| Current amount/date, original register direction | `cashRegisterLedgerService.ledgerCashMovement`, consumed by live drawer and history |
| Customer-only matching and transactional cleanup | POS customer statements / `customerDedupe`; server customer and party-sync repositories |
| Distinct recurring payment identities | Server `partyLedger.recalcLedgerBalances`; never delete by amount/description similarity |
| LAN ordering / in-flight conflict replies | `statements/sync/lanUpsert`, `statements/sync/outboxSync.canApplyConflict`; [concurrency contract](../03-data-access.md#ledger-concurrency-and-stable-identity-19-november-2026) |
| Legacy/API sequence-feed publication | Server [tenant migration 107](../../../../nafid-server/docs/architecture/04-database.md#tenant-107-publish-party-and-ledger-mutations) |

The IPC change is additive; the HTTP payloads, permission keys, deterministic IDs, settlement math and synced columns
are unchanged. Preload and renderer declarations agree; `cashierApi` derives its signature through `bindBridge`.
No generated row refresh, SQLite migration or new channel registration was required. Server migration 107 adds
triggers to existing columns. Existing browser renderer snapshots require their own reviewed import to acquire
desktop behavior changes; this release did not upgrade that snapshot or change mobile HTTP contracts.

## Regression and architecture checks

- Final POS CI: **273 files / 2,691 tests**, app/Electron typechecks, architecture guard and zero-error/zero-warning lint.
  [CI run](https://github.com/emirateswebfusion/nafid-pos/actions/runs/44466165345).
- New POS suites: `ledgerIntegrity.test.ts` (17 cases), `cashRegisterAtomicSave.ui.test.tsx` (3), and
  `outboxLedgerConflict.test.ts` (2). They cover cash/ledger/outbox rollback, identity and delete/restore guards,
  cleanup failures including balance recalculation, history projection, bucket corrections and stale sync replies.
- Server: **352 tests**, reviewed changes to four SQL golden snapshots; real PostgreSQL integration included the
  full tenant migration chain and recurring-payment/restore/feed regression. Eight integration tests passed, one skipped.
  [Server CI](https://github.com/sabeersaluk-creator/nafid/actions/runs/44465918115).
- Seven additional native PostgreSQL/PGlite regression groups passed using
  `tests/integration/ledgerIntegrity.embedded.cjs` with a separately supplied runtime. This supplements the CI database test.
- Isolated Electron UI: saved one CUSTOM/chitty payment of INR500; register showed cash-out500, drawer2000 →1500,
  and the party statement showed one Cash Register / Cash paid500 entry. No live shop data was used.
- Drawer sessions and repeated-startup idempotency passed. Two-process LAN checks verified health200,
  absent/wrong key401, correct key200, successful sync and key retention. Signed-out cloud characterization sent no requests.

Characterization replayed 2,092 calls across 298 handlers against the pre-fix baseline. Twelve invalid delete/restore
calls intentionally changed from false success to failure; other reviewed differences involved generated device/counter
metadata, report ordering and stricter customer matching. Existing statement-harness argument failures for four stock
operation helpers and an outbox extra-batch count assertion (3 versus2) reproduced on the unchanged baseline.
Historical sync goldens also predate LOCAL/stock metadata. These limitations were recorded, not hidden by updating
goldens or claimed as clean equivalence. Controlled outbox concurrency regressions passed; real-shop beta rollout
remains separate under [outbox field checks](../07-sync-outbox-design.md#76-pending-field-checks-owner-recorded-28-oct-2026).

## Release and backend review

- [POS PR119](https://github.com/emirateswebfusion/nafid-pos/pull/119), merged source
  `7c5673235cb7d1d9091fa8c22f94a4651aa26afd`; tag `v2.2.81` points to this commit.
- Validated candidate `99ec1c7e4273f8a7e8646b3bce174cb0263abe1d` and merged source share tree
  `681937e0611fbefcd8617e5086ae8b50dbaae78f`.
- [Server PR14](https://github.com/sabeersaluk-creator/nafid/pull/14), merged
  `a38a20bf4c8271c4a7966f0dbea182313f794ffa`, deployed before publication. Backend checklist: compatible change,
  unchanged approved API `https://nafid.vercel.app`; production deployment successful, health200 and empty login400.
  No hosting/account/endpoint migration, credential changes or customer-data rewrites were performed.
- [Windows artifact/installed-upgrade gate](https://github.com/emirateswebfusion/nafid-pos/actions/runs/44466208164)
  passed final EXE configuration/feed checks, native SQLite, full-installer recovery, measured verification progress,
  failed-launch retry, candidate handoff and data preservation. Mac production validation was not part of this release.
- [Published release](https://github.com/emirateswebfusion/nafid-releases/releases/tag/v2.2.81) contains only EXE,
  matching blockmap and `latest.yml`. Draft sizes/SHA-256 digests matched the validated files before publication;
  anonymous latest-feed, metadata/blockmap downloads and public EXE size were verified afterward.
- Installer: **114,720,358 bytes**, SHA-256
  `99a864625a7451687e066a90d4101d6ad516716ce7de3e913512d25dabe808a0`.
  Signature status **NotSigned**; this is not a trusted-publisher policy fix.

The legacy v2.2.41 pre-launch checksum-stream stall was reproduced. Its documented recovery is to close Nafid
normally and run the full installer once, preserving the existing installation/data. Candidate handoff/retry passed
independently. No published assets were replaced. Both canonical repositories were synchronized to main and temporary
branches/test processes removed after delivery.

## Historical recovery boundary

The fixes prevent the confirmed failure paths. They do not automatically restore previously missing entries or merge
accounts. Reconcile an affected shop using the original ledger/cash identities and available records before any
targeted recovery. Equal amounts or names are insufficient evidence. Never ask a shop to delete its database.
