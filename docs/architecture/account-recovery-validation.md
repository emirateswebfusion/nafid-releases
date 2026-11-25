# Account recovery validation — 20 November 2026

## Source verification

Windows 2.2.87 is published in [nafid-releases](https://github.com/emirateswebfusion/nafid-releases/releases/tag/v2.2.87). Remote repair is not confirmed by this record.

- POS verification: 284 files / 2,756 tests passed; renderer and Electron TypeScript and architecture guard passed.
- POS lint ratchet passed with zero errors and zero warnings.
- Source recovery SQLite tests cover durable backup before HTTP, immutable retry after lost response, exact receipts, newer edits and queue history, backup failure, acknowledgement rollback and expiry.
- Main-process equivalence: 2,092 IPC calls, 298 handlers; zero differences after operational terminal-ID normalization. SQL harness prepared 984 statements without failure.
- Cloud fixture: 48 ordinary calls equivalent, with only the expected additive recovery-capability metadata. No-login fixture: six calls equivalent and no HTTP requests. LAN pairing, key preservation, HTTP trace and downloaded products equivalent.
- Server verification: TypeScript, deployment TypeScript, architecture guard and 393 tests passed. A subsequently added source-backup-failure service regression passed in its six-test focused suite.
- Native PostgreSQL-compatible fixture passed source/before-image retention, canonical creator/totals, exact replay without writes, changed replay rejection, full rollback after total mismatch, intervening-cloud guard and tenant RLS isolation. Server CI run44731030936 subsequently passed the complete 394-test suite and 15 real PostgreSQL integration tests, including recovery.
- Portal: 26 Node tests and 204 browser/POS tests passed; production build passed. Synthetic running UI exercised prepare, disabled activation until exact terminal confirmation, activation and truthful waiting status. No actual shop data was used.

## Backend client-release review

The API host, embedded API URL, installed-client authentication and ordinary sync endpoints remain unchanged. Central migration098 and tenant migration108 add private operational recovery storage. Deploy these additive server changes before distributing the new capable client. Old clients continue ordinary reports/sync and receive no recovery directive. The independent GitHub update feed remains unchanged. No database deletion or forced restart is part of rollout.

## Release delivery

POS PR131 merged at f85e569dcfd6ac2ef1a3ac0af399b6539b97f1cf, tree d9b91be04db7f769bd91ea69fc3586eb070c5178, identical to tested branch add9d80a. CI verify passed. Server PR24 and portal PR10 deployed successfully before client publication.

[Installer acceptance run44730909924](https://github.com/emirateswebfusion/nafid-pos/actions/runs/44730909924) passed final EXE/configuration/updater-feed inspection, packaged SQLite native runtime, installed full-installer recovery upgrade, measured verification events, failed-launch/download retention, candidate updater-worker handoff and data/settings preservation. Signature is NotSigned. Legacy 2.2.41 automatic update reproduced its checksum-stream stall; normal close plus full-installer upgrade preserved data. Candidate handoff passed separately. No Mac assets/feed are part of this release.

EXE: 114,714,489 bytes; SHA-256 `9c7c21b8c73ac4d084b706d7e68081b8d027843cee02cd5cc369db57c415d7c9`. Installer, blockmap and latest.yml uploaded as a draft and matched validated sizes/digests before publication. Anonymous public release/feed hashes verified after publication. Never replace these published assets.

## Remaining remote evidence

Actual repair requires an authenticated platform operator to stage/activate the exact source, then a fresh capable source report, immutable source snapshot, committed tenant audit/receipts and fresh source acknowledgement. A staged or active job alone is not success. Do not fabricate an audit actor or bypass platform login using database credentials.

The owner-confirmed affected source cannot be accessed remotely. At the 21 November 2026 portal inspection, its latest report showed 81 pending identities and 16 conflicts on recovery-capable POS 2.2.87. A second multi-terminal shop reported 95 pending identities and 76 conflicts; its authoritative source still requires explicit owner confirmation. Both affected reports were older than the ten-minute staging limit.

An authenticated platform attempt to prepare the confirmed source backup was rejected with "A fresh source-terminal report is required". No backup job, activation, source financial payload or successful recovery was established. The next required evidence is a fresh online report from the correct source POS, followed by backup/activation and exact application/acknowledgement receipts. Do not clear conflicts, treat old report counts as current, weaken freshness checks or overwrite cloud records from these metadata alone.
