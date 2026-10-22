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
H=$(pwd)/tests/characterization
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

Use a fresh `EQ_USERDATA` directory per run, and run baseline and candidate back to back: a few handlers have
time-window guards (e.g. duplicate-request blocking), so a much slower run can differ for timing reasons only. Last result (22 Oct 2026, refactor branch vs `HEAD`): 1,527 calls over 224 handlers, 0 differences. Statement check: all
594 statements prepare (the check found three pre-existing SQL defects, fixed on 22 Oct — see
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
```

`sync-golden.json` was recorded from `HEAD` on 22 Oct 2026 (51 HTTP requests). A sync change that is *meant* to
alter behaviour must update the golden file in the same change, and the diff is the reviewable contract change
(update `nafid-server` and both architecture docs with it).

Extend `scenario.mts` when you add a channel with a non-trivial payload.
