# ADR 0004 — Main process: registration-only IPC, use-case services, statement modules

- Status: accepted (22 Oct 2026)
- Scope: `nafid-pos/electron`

## Context

The IPC handler files held ~580 inline `.prepare()` calls mixed with validation, business rules and transactions
(`invoiceHandlers.ts` alone was several thousand lines). The same query text was repeated across handlers, rules could
not be reused from other main-process code without importing `ipc/`, and nothing could be tested without Electron.

## Decision

- `electron/ipc/*` only registers channels: `handle('db:channel', domainService.fn)`. The helper in `ipc/common.ts`
  forwards the renderer's arguments unchanged (optionally through `safeHandler`). Only handlers that need the IPC
  `event` use `ipcMain.handle` directly.
- `electron/services/<domain>Service.ts` holds the use-cases, one exported function per channel, named after the preload
  method. Large domains are split by use-case (invoices: checkout, held bills, queries, edits, BOS conversion) behind a
  barrel module so callers do not change.
- `electron/db/statements/<domain>.ts` holds the SQL text as intent-named factories `(db: Db) => db.prepare(SQL)`.
  Passing the connection keeps transactions (`db.transaction`) and statement semantics exactly as before.
- The architecture guard enforces it (R8: no SQL in `ipc`; R9: no new inline SQL in services; R7: 800-line budget for
  services). Dynamic filter builders that existed before are capped per file and may only decrease.
- Moves are proven with `scripts/diagnostics/ipc-equivalence/`: every channel is replayed on a baseline checkout and on
  the working tree against identical data, and all statements are prepared against a fresh schema.

## Consequences

- A change has one obvious home: SQL → statements, rule → service, channel → one line in a handler file.
- Channel names, payloads and results are unchanged (verified: 1,527 calls over 224 handlers, 0 differences vs `HEAD`).
- Statement factories prepare on every call, as the inline code did; caching prepared statements is a possible later
  optimisation, not part of this change.
- `electron/sync/*` and `main.ts` still contain SQL; they follow the same pattern once characterization tests exist.
