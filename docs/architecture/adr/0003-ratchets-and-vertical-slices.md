# ADR 0003 — Ratchet guards and verified vertical slices instead of a rewrite

- Status: accepted (21–22 Oct 2026)
- Scope: all apps

## Context

The code base (≈100k lines in the POS renderer alone) encodes years of shop-floor business rules that are not written
down anywhere else. A rewrite would lose them; unguided edits keep adding debt.

## Decision

- Refactor in vertical slices that each build, pass tests and can be reverted alone.
- Freeze legacy debt with baselines that may only shrink: direct bridge references (now zero), oversized files
  (`sizeCaps`), lint errors (`lint-baseline.json`), and on the server, SQL outside `src/db/`.
- Mechanical moves are allowed when a check proves equivalence: typecheck for renames, golden-master snapshots for
  server routes, equivalence tests for consolidated rules.
- `npm run verify` is the gate in every app until CI runs it.

## Consequences

- Progress is measurable (baseline numbers go down) and regressions are blocked at the source.
- Baselines are re-recorded only in deliberate maintenance changes after debt went down.
