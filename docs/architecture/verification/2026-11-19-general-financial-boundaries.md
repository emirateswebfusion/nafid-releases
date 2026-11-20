# General financial boundary audit — 19 November 2026

Scope: product-wide POS/server review, rather than a single shop or party. Focused execution covers returns, invoice edits,
stock ownership, cancellation/recovery, payment accounts and cloud compatibility. Existing full-suite checks also exercise
authentication, permissions, tax/pricing, printing, settings, cash/party ledgers, loyalty, migration and sync paths.

## Confirmed regressions corrected

- Returned quantities could exceed the original sale, including a stale second return or repeated lines. Source validation
  now runs inside the transaction, scopes the original shop and shares conversion-family allowance.
- Cancelling a credit return could restore its full value instead of only the invoice's original unpaid portion. A cash
  refund could reduce credit outstanding. Recalculate from canonical payment terms and active account credits.
- Repeated bill delete/restore could repeat stock effects. A partly returned sale could restore all sold stock again;
  cancelling its return while its sale was deleted could deduct goods. Use one outstanding physical projection.
- Combo returns and bill edits could lose constituent recipes. Preserve snapshots and move physical constituent quantities.
  Invoice edits cannot remove quantities already returned. Conversion copies share their original physical stock owner.
- Deleted return rows could remain offered/consumed as account credit. Active-only lookup, consumption and quantity totals.
- Billing cash-return save posted a second raw refund row after the main process already saved the refund. Remove that
  extra UI posting. Drawer totals already derive returns separately; this was duplicate raw/history data, not proof of a
  doubled drawer total.
- PostgreSQL payment-source SQL compared INTEGER migration-055 flags with booleans, producing native SQL errors. Use 0/1.
  Serialize source balance reads/writes and tenant default-account setup; reject invalid local opening balances.
- Missing settings values could fail as a server error. Return 400; explicit null remains a stored reset.
- Legacy cloud return uploads populated payment_method but left refund_method empty. Sequence download filters out the
  alias, so cash/card refunds could lose their method. Populate both existing server columns and normalize the alias on POS.

## Verification

- POS verify: 281 files, 2,735 tests passed; app/Electron typechecks and architecture guard passed.
- POS lint ratchet: zero errors and zero warnings.
- Server verify: 373 tests passed, both typechecks and architecture guard passed; intentional SQL golden diffs reviewed.
- Native PostgreSQL/WASM: migration-055 payment create/list/summary/update/post/tenant/delete; return source, tenant,
  aggregation, stale quantities, tombstone and conversion-family validation passed.
- Native Electron UI: disposable shop, sale of two units, return one unit for cash, click Save; visible success and normal
  empty cart after completion. Read-only database assertions: one return, one raw RETURN_REFUND, stock restored once.
- IPC replay: 2,092 calls across 298 handlers. Nine raw comparison differences were inspected: random origin/terminal IDs
  and their stock-counter keys only; quantities, money, responses and handler coverage were unchanged.
- SQL preparation: 975 factories prepared, zero failures against fully migrated SQLite.
- Legacy cloud characterization: 54 calls, zero differences after existing repeated-GET normalization; offline: six calls,
  zero differences. Outbox replay passed retry/conflict/pending-edit checks. Isolated primary/secondary LAN replay passed.
- Added CI PostgreSQL coverage for 20 concurrent account postings, concurrent default creation and refund-method round trips.

## Limits and delivery

These checks do not prove there are no other defects. No production shop database was inspected or repaired, and previously
missing records were not reconstructed. Physical printers, weighing scales, external card terminals, disaster recovery and
real customer multi-device acceptance remain separate checks. Windows 2.2.84 passed the final packaged-artifact/upgrade gate and was published to nafid-releases;
the completed delivery evidence and remaining limitations are recorded below.


## Completed delivery (19 November 2026; documentation reconciled 20 November)

[Windows v2.2.84](https://github.com/emirateswebfusion/nafid-releases/releases/tag/v2.2.84) was published after
[source CI](https://github.com/emirateswebfusion/nafid-pos/actions/runs/44581120805) and
[packaged upgrade validation](https://github.com/emirateswebfusion/nafid-pos/actions/runs/44581117036) passed.
Source commit `7d895fff07bf109bea0951c24e187a8f16627a6d` has the same tree as tested build commit
`3dccd9bd2e4faa77a094b5738023df41b2860603`. Backend `9e1756a` was deployed at the existing approved endpoint;
[backend CI](https://github.com/sabeersaluk-creator/nafid/actions/runs/44580831302) passed 373 unit/golden tests
and 13 PostgreSQL integration tests, with one unrelated skip.

Final EXE configuration/native runtime, data-preserving full-installer recovery, candidate update handoff and
launch-failure retention checks passed. The EXE, blockmap and latest.yml draft upload digests matched the verified
build. Anonymous public latest-release discovery and latest.yml download/hash were verified after publication.
Installer size: 114724350 bytes; SHA-256: `edd973937b951be2d1aa8181204729914aebf2cd9e0d09024d836630ea73f3b0`.
Signature status was `NotSigned`; trusted-publisher/Smart App Control acceptance is not established. The legacy
v2.2.41 automatic path reproduced its pre-spawn checksum stall; full-installer recovery passed instead. These
results do not establish recovery of previously missing production records or acceptance on every shop device.
