# IPC equivalence harness (main process)

Behaviour-preservation check for refactors of `electron/ipc`, `electron/services` and `electron/db`.
The renderer never sees anything but IPC results, so if every channel returns the same thing for the same
inputs on the same data, a main-process refactor is behaviour-preserving.

- `run.mts` boots a checkout's `initDb()` + `registerAllIpcHandlers()` under a stub `electron` module, replays
  `scenario.mts` (a seeded sales/credit/hold/quotation/cashier flow, then **every** registered channel with
  seven argument shapes) and writes normalised results (uuids, timestamps).
- `compare.mjs` diffs two result files (random terminal codes normalised; unordered rows compared as sets).
- `check-statements.mts` prepares every factory in `electron/db/statements` against a fresh schema.

Network/updater/sync-worker channels are skipped (see `SKIP` in `scenario.mts`).

## Run (Linux/macOS/WSL; needs a Node build of better-sqlite3, not the Electron one)

```bash
H=$(pwd)/tests/characterization      # run from the nafid-pos repo root
mkdir -p /tmp/eq && cd /tmp/eq
npm init -y >/dev/null && npm i better-sqlite3@12.11.1 tsx@4
mkdir -p node_modules/electron && cp $H/electron-stub.cjs node_modules/electron/index.js \
  && echo '{"name":"electron","main":"index.js"}' > node_modules/electron/package.json
mkdir base cand
git -C <pos repo> archive HEAD electron src/utils | tar x -C base      # baseline
cp -r <pos repo>/electron <pos repo>/src cand/                          # working tree
EQ_USERDATA=/tmp/eq/db-base npx tsx $H/run.mts base base.json
EQ_USERDATA=/tmp/eq/db-cand npx tsx $H/run.mts cand cand.json
node $H/compare.mjs base.json cand.json
EQ_USERDATA=/tmp/eq/db-chk npx tsx $H/check-statements.mts cand
```

### Windows (Git Bash)

The scripts import trees through `pathToFileURL`, so they run on Windows as they are. Use the same workdir as above
under `%TEMP%` (only `tsx` and the `electron` stub are needed there) and point `NODE_PATH` at both `node_modules`
folders so main-process dependencies resolve. The repo's better-sqlite3 must be the **Node** build: after
`npm run rebuild` (Electron build, used by `npm run dev`) the harnesses fail with `NODE_MODULE_VERSION`; reinstall the
Node build before running them (`cd node_modules/better-sqlite3 && npx prebuild-install`, or keep a copy of the Node
`build/Release/better_sqlite3.node` and copy it back), and run `npm run rebuild` again before `npm run dev`.

```bash
H="C:/<path>/nafid-pos/tests/characterization"; EQ="$TEMP/nafid-eq"; cd "$EQ"
export NODE_PATH="$EQ/node_modules;C:/<path>/nafid-pos/node_modules"
EQ_USERDATA="$EQ/u1" npx tsx "$H/run.mts" cand cand.json
```

### Which harness for which change

| Change | Run |
|---|---|
| `electron/ipc`, `electron/services`, `electron/db/statements` | `run.mts` (base vs cand) and `check-statements.mts` |
| `electron/sync/*`, server sync routes | `sync-run.mts` (login and `EQ_NO_LOGIN=1`), `lan-run.mts` |
| Online source database backup | `source-backup.mts` with a fresh isolated `EQ_USERDATA`; verifies concurrent foreground writes, retained rows, SQLite integrity and replay digest without touching the live app profile |
| `electron/db/localDb.ts`, `migrations*.ts`, startup repairs | `startup-idempotency.mts`, `migrations.mts` |
| A new migration | `migrations.mts`, then regenerate row types: `EQ_USERDATA=<empty> npx tsx $H/gen-row-types.mts cand <pos repo>/src/data/dbRows.ts` |
| Cash drawer rules | `drawer-session.mts` |
| Emergency purge | `emergency-run.mts` |

Use a fresh `EQ_USERDATA` directory per run, and run baseline and candidate back to back: a few handlers have
time-window guards (e.g. duplicate-request blocking), so a much slower run can differ for timing reasons only. Last result (22 Oct 2026, refactor branch vs `HEAD`): 1,527 calls over 224 handlers, 0 differences. On 23 Oct (sync placeholder fix): 1,519 calls over 223 handlers; 13 intended differences in
`sync:getProgress`, `sync:getCloudAccessState` and party `sync_status` (no cloud push without a login), plus
`shopClosing:getPreview` counter order, which depends on the random terminal code (digits sort before `GST`). Statement check:
all prepare except the two that write `staff_ledger.updated_at` (column missing — pre-existing defect, see
`docs/architecture/06-change-guide.md` §6.6).

## Sync characterization (`sync-run.mts`)

Pins the desktop↔cloud sync contract before anyone changes `electron/sync/*` (outbox, LAN auth, conflict rules):

- **Phase 1 (push):** seeds the terminal, runs `sync:runInitial` against a recording fake cloud that accepts every
  record, and records each HTTP request (method, path, normalised body) plus `sync_status` counts before/after.
- **Phase 2 (pull + conflict):** edits a product locally, makes the fake cloud reject product pushes, serves remote
  products/parties/settings and runs another cycle. It records which remote rows were applied — e.g. the PENDING local
  product edit must survive the remote version, a SYNCED row takes the remote version, a new remote row is inserted.

```bash
EQ_USERDATA=/tmp/eq/sy-cand npx tsx $H/sync-run.mts cand sync-cand.json
node $H/compare.mjs $H/sync-golden.json sync-cand.json     # 0 differences = sync behaviour unchanged
# no cloud login on disk (offline login / signed out): cloud sync must send nothing
EQ_NO_LOGIN=1 EQ_USERDATA=/tmp/eq/sy-nl npx tsx $H/sync-run.mts cand sync-nl.json
node $H/compare.mjs $H/sync-nologin-golden.json sync-nl.json
```

How many times an identical read (`GET /health`, `GET /api/sync/quotations?limit=500&offset=0`) repeats depends on
machine timing (the urgent syncs run concurrently): the golden file was recorded with 53 requests, Windows runs
produce 49 on the same code. `compare.mjs` therefore compares repeated identical GET requests once per phase, while
every push and delta-pull keeps its exact count and order (pass `--strict` for the raw comparison).

`sync-nologin-golden.json` (23 Oct 2026) pins the fix for the `lan-local-token` placeholder: with no cloud login the
worker makes no cloud request (before the fix: 49 requests, 41 with `Bearer lan-local-token`).

`sync-golden.json` is the current contract (53 HTTP requests, recorded in canonical order because the main cycle and
the "urgent" syncs run concurrently). It was first recorded from the pre-refactor `HEAD`; the only intended change
since then is the emergency-command poll (`GET /api/sync/emergency-commands`). A sync change that is *meant* to alter
behaviour must update the golden file in the same change; the diff is the reviewable contract change (update
`nafid-server` and both architecture docs with it).

## LAN pairing (`lan-run.mts`)

Starts a PRIMARY terminal (LAN server) in one process and a SECONDARY in another, then checks: `/health` is open;
every other endpoint answers 401 without the shop pairing key or with a wrong key; the right key works in any
case/format; the connection test reports a rejected key; a sync cycle runs; saving network settings keeps the key.

```bash
EQ_USERDATA=/tmp/eq/lan-a npx tsx $H/lan-run.mts primary cand 38991 /tmp/eq/lan.key &
EQ_USERDATA=/tmp/eq/lan-b npx tsx $H/lan-run.mts secondary cand 38991 "$(cat /tmp/eq/lan.key)" lan.json
```

Stop the PRIMARY process before the next pair of runs (and wait until the port is free): a primary left running from
the previous run keeps the port, the new one cannot listen, and the secondary then talks to the old primary with the
new key, so every keyed endpoint answers 401 in both runs and the comparison proves nothing. A good run shows the
`/api/sync/*` GETs answering 200.

## Emergency wipe guard (`emergency-run.mts`)

Checks that a local wipe is refused without credentials, with a wrong password and with a staff account; succeeds
for an administrator and writes `emergency-purge-audit.jsonl`; that a legacy `emergency_wipe_command` setting is
ignored; and that a server-issued command is acknowledged, audited and executed.


## Drawer sessions (`drawer-session.mts`)

Pins the cash drawer rules (04-business-rules, §Cash drawer sessions): a bill after midnight counts in the drawer that
is still open; today's drawer cannot open while an earlier one is open; a bill after a close goes to the next session;
history drawers keep their totals; a drawer left open when sessions are installed closes at the end of its own day; auto
close status, snooze, close now and the 15-minute backstop. Dates are relative to today, so it runs at any time of day.

```bash
EQ_USERDATA=/tmp/eq/ds npx tsx $H/drawer-session.mts cand     # "drawer sessions: ok"
```

## Versioned migrations (`migrations.mts`)

Every released migration applies on a fresh database (recorded in `schema_migrations`, `user_version` = latest), a
second run applies nothing, a failing migration rolls back without being recorded and the chain resumes on the next
run, and duplicate versions are rejected. Also apply new migrations to a copy of a real shop database.

```bash
EQ_USERDATA=/tmp/eq/mig npx tsx $H/migrations.mts cand     # "migrations: ok (latest N)"
```

## Startup idempotency (`startup-idempotency.mts`)

`initDb()` runs inline repair migrations on every start. Once they have run, another start must change no rows,
otherwise records look edited (and are re-synced) or drift a little more on each launch. The script seeds the shapes
that used to be rewritten (customer backfill, discounted-invoice returns, paper prices on REAL products), starts three
times and fails when the third start writes anything. Run it for every change to `electron/db/localDb.ts`,
`migrations*.ts`, `customerDedupe.ts` or `customerIdentity.ts`, and also do two consecutive starts on a copy of a
real shop database.

```bash
EQ_USERDATA=/tmp/eq/idem npx tsx $H/startup-idempotency.mts cand     # "startup idempotency: ok"
```

Extend `scenario.mts` when you add a channel with a non-trivial payload.

## Outbox characterization (`outbox-run.mts`)

Uses the same IPC seed as `sync-run.mts`, explicitly selects CLOUD mode and the device-local `sync_engine = outbox`.
The fake cloud acknowledges applied/duplicate ops, returns one conflict with the server row, and provides two sequence
pages including a soft delete. Asserts tenant outbox drained, retained conflict, server copy, pulled row/delete,
cursor 102, and no push on the second cycle. An extra phase checks two bounded batches, outgoing DELETE,
pending local edits, and three terminal error statuses stopping at ten attempts. Runs under the Electron stub; never launches Electron.

Windows workdir for step 4: `C:/nafid-wt2/outbox4/eq`; use its existing tools (do not install dependencies).
Copy `electron` and `src` under `eq/cand`; archive HEAD into `eq/base` for comparisons.

```powershell
$env:NODE_PATH='C:/nafid-wt2/outbox4/eq/node_modules;C:/EMIRATES WEBFUSION WORKS/nafid/nafid-pos/node_modules'
$env:EQ_USERDATA='C:/nafid-wt2/outbox4/eq/outbox-fresh'
.\node_modules\.bin\tsx.cmd ..\nafid-pos\tests\characterization\outbox-run.mts cand outbox.json
```

Legacy goldens currently predate one extra LOCAL settings row in HEAD. Compare baseline and candidate back-to-back
when checking that drift; do not update legacy goldens for the opt-in engine. IPC results include random `origin`
values since migration 003: normalize these values in temporary comparison outputs (leave harness/goldens unchanged).
The statement checker supplies representative inputs for the new column-filtered helpers.

## Windows thermal-driver gate

`thermal-driver.cjs` tests the actual compiled USB print helpers and real receipt text/HTML generators with a
Windows spooler queue pointing at local emupos. It does not open the shop database or change printer settings.
Build Electron first. Start emupos with a thermal profile matching the driver's resolution/printable dots, and
configure a separate Windows thermal queue using the correct roll width. Do not use a generic text-only or PDF
driver: those do not reproduce native thermal driver sizing/clipping.

Example (PowerShell, repo root; emulator and Epson test queue must already be installed):

```powershell
npm run build:electron
node_modules/electron/dist/electron.exe tests/characterization/thermal-driver.cjs --printer="Nafid Thermal Lab (Epson)" --width=80 --dpi=180 --device=thermal --api=http://127.0.0.1:8765 --output=C:/Users/Public/nafid-thermal-results
```

Use an absolute output directory outside the repository. The harness asserts native driver roll form (no custom
receipt page size), one print submission and one cut per 2-item/60-item bill, leading blank <= 8 mm, and ink bounds
strictly inside the printable width. It saves PNGs and measured JSON results there. It requires the same local
`emupos` API and `pngjs` already provided transitively by `qrcode`. It is optional in CI because CI has no Windows
thermal queue. Automated unit tests retain coverage for A4/barcode sizes, readiness recovery and PDF geometry.

Also run the 58 mm queue with `--width=80`: this intentional app/driver width mismatch must retain both borders and all amounts. The harness uses the real Windows capability query, never a mocked printable width. Failures exit nonzero.

### Receipt text inside borders (no printer required)

After `npm run build:electron`, run Electron with `tests/characterization/receipt-layout.cjs --output=ABS_DIR_OUTSIDE_REPO`.
This uses real Chromium text ranges, no database or physical printer, and disables canvas. It verifies every row in
nine receipt styles / three fonts / 58 and 80 mm, after load, after narrowing the container, and before printing.
For the native thermal gate also run `--no-canvas=true --font=lucida` and `--no-inline-script=true` separately.
Both exercise production preparation; the latter must recover through the main-process preflight before spooling.

### UAE e-invoicing branch (3 Nov 2026)

`sync-run.mts` HEAD vs candidate (login): 47 calls. The one intended difference is that `POST /api/sync/customers` now carries `einvoice_profile`. Terminal ids, stock-counter keys and party order vary from run to run (base vs base shows the same).

No-login run: 6 calls, 0 differences.

`migrations.mts`: the 017 checks pass. The 7 product-outbox failures also occur on unmodified HEAD.

## Bahrain shop flow (`bahrain-run.mts`)

Same bootstrap as `run.mts`, but it asserts instead of recording: a new shop chooses Bahrain, sells a BHD 0.185
product by cash, split and credit, takes a payment, returns an item and closes the drawer 5 fils over. Every amount
is checked to the fils against hand-worked values. Run it after any change to money rounding in the main process:

```bash
EQ_USERDATA=/tmp/eq/db-bh npx tsx $H/bahrain-run.mts cand   # exit code 1 when a check fails
```
