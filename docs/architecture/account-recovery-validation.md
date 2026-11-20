# Account recovery validation — 20 November 2026

## Source verification

Version under preparation: 2.2.87. No recovery-capable installer has been published or remote repair confirmed by this record.

- POS verification: 284 files / 2,756 tests passed; renderer and Electron TypeScript and architecture guard passed.
- POS lint ratchet passed with zero errors and zero warnings.
- Source recovery SQLite tests cover durable backup before HTTP, immutable retry after lost response, exact receipts, newer edits and queue history, backup failure, acknowledgement rollback and expiry.
- Main-process equivalence: 2,092 IPC calls, 298 handlers; zero differences after operational terminal-ID normalization. SQL harness prepared 984 statements without failure.
- Cloud fixture: 48 ordinary calls equivalent, with only the expected additive recovery-capability metadata. No-login fixture: six calls equivalent and no HTTP requests. LAN pairing, key preservation, HTTP trace and downloaded products equivalent.
- Server verification: TypeScript, deployment TypeScript, architecture guard and 393 tests passed. A subsequently added source-backup-failure service regression passed in its six-test focused suite.
- Native PostgreSQL-compatible fixture passed source/before-image retention, canonical creator/totals, exact replay without writes, changed replay rejection, full rollback after total mismatch, intervening-cloud guard and tenant RLS isolation. Real PostgreSQL CI integration remains a delivery gate.
- Portal: 26 Node tests and 204 browser/POS tests passed; production build passed. Synthetic running UI exercised prepare, disabled activation until exact terminal confirmation, activation and truthful waiting status. No actual shop data was used.

## Backend client-release review

The API host, embedded API URL, installed-client authentication and ordinary sync endpoints remain unchanged. Central migration098 and tenant migration108 add private operational recovery storage. Deploy these additive server changes before distributing the new capable client. Old clients continue ordinary reports/sync and receive no recovery directive. The independent GitHub update feed remains unchanged. No database deletion or forced restart is part of rollout.

## Remaining delivery evidence

Record final lint, CI integration, reviewed source revisions, deployment, final installer/configuration/native-runtime/upgrade/hash gates and publication before describing release delivery as complete. Actual repair requires a fresh capable source report, immutable source snapshot, committed tenant audit/receipts and fresh source acknowledgement. A staged or active job alone is not success.

The owner-confirmed affected source cannot be accessed remotely. Its current financial payload has not yet arrived through the new protocol. Existing metadata and bounded cloud existence/version inspection are insufficient to assert that its 75 pending records have been recovered.
