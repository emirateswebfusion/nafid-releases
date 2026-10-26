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

On Windows, `await import()` of an absolute `C:\...` path fails (`ERR_UNSUPPORTED_ESM_URL_SCHEME`): run under WSL, or in a
scratch copy wrap the three `path.join(...)` imports in `pathToFileURL(...).href`, and set
`NODE_PATH=<eq>/node_modules;<pos repo>/node_modules` so main-process dependencies resolve.

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
