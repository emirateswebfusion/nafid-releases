# 5. Conventions

## 5.1 Enforced by `npm run check:arch` (`scripts/check-architecture.mjs`)

| ID | Rule |
|---|---|
| R1 | Only `src/data/**` may reference `window.electronAPI` (any form: `.x()`, `!.x()`, `?.x`, `(window as any).electronAPI`). The baseline is **zero** — any new reference fails |
| R2 | The renderer never imports the `electron` package |
| R3 | `src/data/**` contains no `any` |
| R4 | `src/data/**` (except `client.ts`) never reads `window` |
| R5 | `src/store/**` never imports `components/` |
| R6 | `electron/services|db|sync/**` never import `electron/ipc/**` |
| R7 | Files in `src/components/**` and `electron/**` over 800 lines are capped at their baseline size; new files may not exceed the budget |
| R8 | `electron/ipc/**` contains no `.prepare(` and does not import `electron/db/statements` — handlers only register channels |
| R9 | `electron/services/**` may not add inline `.prepare(`; SQL goes to `electron/db/statements/<module>.ts` (legacy dynamic filter builders are capped per file) |

Advisory (printed, never fails): SQL still inside `electron/sync/**` and `electron/main.ts`.

`arch-baseline.json` and `lint-baseline.json` may shrink, never grow. Re-record them (`--update`, `npm run lint:baseline`)
only in a deliberate maintenance change after debt went **down**.

## 5.2 TypeScript

- No new `any`. Use `unknown` + narrowing, or a precise type. Existing `any` is debt, not precedent.
- The bridge contract is `src/global.d.ts`; give new channels real parameter/return types.
- `electron/` compiles with `strict`. The renderer is not strict yet; new modules should compile under strict rules anyway.
- `import type` for types (`verbatimModuleSyntax` is on). Named exports for utilities and repositories.
- `noUnusedLocals` is on in both projects (renderer and main process; also in `nafid-server`): an unused import,
  variable or function fails the typecheck. Delete dead code instead of commenting it out — git keeps the history.
- Export only what another module imports; keep helpers module-private.

## 5.3 React

- Budgets per component: 800 lines, 20 `useState`, 20 props. Past that: extract a hook → a view → a modal.
- Subscribe to stores with selectors: `useCartStore(s => s.items)`, or `useShallow` for several fields. No bare `useStore()`.
- Effects return their cleanup (subscriptions from `bridgeEvents.*` return an unsubscribe — return it).
- Derive values instead of mirroring them in state.
- Interactive elements are real `<button>`/`<a>`. Dialogs use `components/ui/Modal` plus `hooks/useCloseOnEscape`, and new
  dialogs add `role="dialog"` + `aria-modal`.
- Shared UI primitives come from `components/ui/`. Do not restyle a new button/input from scratch.
- Format money with `formatCurrency` from `src/utils/money.ts` (billing screens use the compact
  `formatCurrency` re-exported by `components/billing/BillingConstants.ts`).

## 5.4 State

- Cross-screen state → Zustand store in `src/store/`; screen-local state stays in the component.
- Stores call `src/data/*`, never the bridge, never components.
- Persisted state: namespace keys (`nafid-*`), exclude PII with `partialize`, clear carts/tabs on logout.

## 5.5 Naming

| Thing | Convention | Example |
|---|---|---|
| Component | PascalCase file = component name | `DeductionEditor.tsx` |
| Hook | `use` + camelCase | `useKeyboardShortcuts.ts` |
| Store | `<name>Store.ts`, hook `use<Name>Store` | `cartStore.ts` |
| Data module | domain noun, export `<domain>Api` | `data/scrap.ts` → `scrapApi` |
| Repository method | channel name minus `db`/domain prefix, lowerCamel | `dbGetScrapInvoiceList` → `getScrapInvoiceList` |
| IPC channel | `db:verbNoun` (`db:checkout`), preload name `dbVerbNoun` | `db:getScrapInvoiceList` |
| Main-process service | `electron/services/<domain>Service.ts`, function = preload name minus `db` | `returnsService.getReturns` |
| SQL statement | `electron/db/statements/<domain>.ts`, intent-named factory | `returnsSql.listReturns(db)` |
| Pure rule | verb-first function in `src/utils/<topic>.ts` | `resolveLinePrice`, `buildCheckoutLines` |
| Test | `tests/unit/<module>.test.ts` | `linePricing.test.ts` |
| SQL table / column | `snake_case`, plural tables | `invoice_items.tax_amount` |

## 5.6 Errors and logging

- Main-process services catch expected failures and return `{ success: false, error }`; register with
  `handle(channel, fn, { safe: true })` when the use-case may throw and the renderer expects a result object.
- Renderer logs to the main log file with `logError(message, err)` from `src/data/app.ts`.
- Never swallow errors silently in new code; show a toast or log.

## 5.7 Testing

- Unit tests: Vitest, `tests/unit/**/*.test.ts`, run by `npm test` (node environment).
- Every new or changed pure rule (money, pricing, tax, numbering, permissions) gets a test.
- Data-calling helpers are tested by mocking the `src/data/<domain>` module (`vi.mock`) — see `deductionLookup.test.ts`.
- Main-process refactors (moving SQL, splitting services, renaming statements) are proven with the IPC equivalence
  harness in `tests/characterization/` (0 differences required).
- Before touching `electron/sync/*` or checkout persistence, add a characterization test that pins current behaviour.

## 5.8 Text and encoding

Source files are UTF-8; keep the file's existing line endings (most are CRLF). Never round-trip a file through a
Windows-1252 decoder — it produced mojibake such as `Â·` and `â†’` in shipped UI text before. If you script edits in
Python, open files with `encoding='utf8', newline=''`.
