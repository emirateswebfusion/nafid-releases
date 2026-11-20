# Platform-only sync support — 20 November 2026

## Customer versus platform roles

The shop ADMIN is the customer, not the developer. Removed the global warning toast and the temporary shop Settings
support panel. SUPER_ADMIN alone opens Super Dashboard > Shop sync support. Server GET role checks enforce the same
boundary. Normal billing/dashboard never prints raw conflict counts or technical progress labels; incomplete cycles
cannot show Sync Complete/100%. The neutral footer uses Last checked, not an upload guarantee.

## Diagnosed and fixed

A retained account_conflict marker inflated the active count even after its row synced or disappeared. Reproduced by a
failing unit regression and fixed with a tenant-scoped query joining only matching PENDING/FAILED account rows. Raw
markers stay retained. This does not prove the screenshot's 75 conflicts were all stale, and no financial winner is chosen.

## Reporting and developer page

POS reports a bounded latest snapshot per tenant/terminal after cycle completion, respecting cloud access and throttling.
The additive support endpoint derives tenant from JWT; SUPER_ADMIN reads authoritative central shop names with terminal,
version/platform, received/observed timestamps, route, pending/conflict/download counts and up to 100 record metadata rows.
Raw errors, financial values, customer/party names and credentials are excluded. Server migration097 stores operational
snapshots only. No repair/overwrite/delete operation is exposed. See ../sync-support.md for the canonical contract.

## Evidence and limits

- Server verify: 379 unit/golden tests, both typechecks and architecture guard passed.
- Native PostgreSQL/WASM: migration097, authoritative shop join, per-terminal replacement and tenant FK passed.
- POS verify passed 2,742 tests before adding the final two reporter tests; final full verification is recorded in CI.
- Focused reporter tests passed throttling, redaction and disabled cloud access; role/UI tests passed SUPER_ADMIN access,
  shop ADMIN/STAFF exclusion, shop identity and record details. SQL preparation: 977 factories, zero failures.
- Lint ratchet passed zero errors/warnings. Native Electron used an explicitly synthetic QA shop report to exercise the
  SUPER_ADMIN entry, refresh, terminal summary and expanded record table. No real shop conclusions were drawn from it.
- Earlier warning-removal cloud/offline characterization had zero differences; reporting adds an independent request,
  covered by the reporter contract tests and must not change business sync acknowledgements.

The report page cannot inspect older/offline installations before they run the reporting version. Missing or stale reports
are labelled as missing evidence, not healthy. Actual production shop conflicts require fresh terminal reports and
record-level comparison; no shop database has been deleted, overwritten or silently reconciled by this change.
