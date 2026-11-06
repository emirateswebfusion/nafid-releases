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
| R9 | `electron/services/**` contains no `.prepare(`; SQL goes to `electron/db/statements/<module>.ts` (dynamic queries as builders returning `{ statement, params }`) |

| R10 | The startup baseline (`localDb.ts`, `schema*.ts`, `migrations{Repairs,Columns}.ts`) may shrink, never grow; schema / data changes are numbered migrations in `electron/db/migrations/`, each listed in `migrations/index.ts` |
| R11 | Only `src/data/cloud/client.ts` calls `fetch`; cloud requests go through `src/data/cloud/*` repositories |
| R12 | `electron/sync/**` and `electron/main.ts` contain no `.prepare(`; SQL goes to `electron/db/statements/sync/<module>.ts` / `statements/main.ts` |
| R13 | Every `eslint-disable` states its reason (`// eslint-disable-next-line rule -- why`) and the total may only shrink (`lintSuppressions` in `arch-baseline.json`, 94 on 27 Oct, all React-hook effect exceptions). Remove them one screen at a time when that screen is changed and tested anyway | `check-architecture.mjs` |
| R14 | `src/components/` contains folders only: a screen lives in its feature folder next to its views and hooks (`components/<feature>/<Screen>.tsx`); app-wide pieces go to `app/`, `auth/`, `print/` or `ui/` | `check-architecture.mjs` |
| R15 | `src/utils/` contains folders only: `pricing/`, `print/`, `time/`, `security/`; a new helper goes into the matching group (add a group folder if none fits) | `check-architecture.mjs` |

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
- Format money with `formatCurrency` from `src/utils/pricing/money.ts` (billing screens use the compact
  `formatCurrency` re-exported by `components/billing/BillingConstants.ts`). Never hardcode ₹, `INR`, `en-IN` or an
  Indian sample barcode in UI text: use `localizeCurrencyText`, `getStoreProfile().currency`, `getSampleBarcode()` and
  `components/ui/CurrencyIcon` (not `IndianRupee`).
- Semantic icons only: use standard, purpose-fit Lucide icons. Do not use decorative or AI-styled icons like `Sparkles` for system actions, sync statuses, or notification badges.

## 5.4 State

- Cross-screen state → Zustand store in `src/store/`; screen-local state stays in the component.
- Stores call `src/data/*`, never the bridge, never components.
- Persisted state: namespace keys (`nafid-*`), exclude PII with `partialize`, clear carts/tabs on logout.
- Device-specific hardware/workflow flags with critical-path synchronous checkout reads (e.g. `auto_whatsapp_send`) are persisted in SQLite `settings` table as the durable source of truth, loaded into `localStorage` on initial app startup (`useSettingsLoader`), and auto-healed on cache miss.

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
## 5.9 Release notes and updates

- **Never hardcode release notes in source code:** Do not edit `whatsNew.ts` or add release-specific arrays for new version features.
- **Dynamic discovery:** Release notes originate from the GitHub Release description (HTML or Markdown) delivered via `electron-updater` (`updateInfo.releaseNotes`).
- **Rich UI transformation:** The renderer transforms release notes dynamically using `releaseNotesToCards()` (`src/components/settings/releaseNotesUtils.ts`), assigning category tags (Printing, Billing, Hardware, Settings, Checkout, Sync, Improvement, Resource), Tailwind accents, and link buttons.
- **Persistence:** When an update is detected, `releaseNotes` are cached in `localStorage` under `nafid_release_notes_<version>` and `nafid_cached_release_notes` so the user-facing cards remain active even after updating.
- **Fallback:** `whatsNew.ts` provides `getWhatsNewItems()`, resolving active notes -> version cache -> general cache -> evergreen baseline (`DEFAULT_WHATS_NEW`).
- **Semantic update icons:** App update triggers and notification banners must use purposeful, semantic icons — never decorative or AI-styled icons like `Sparkles`. Use `<Download className="..." />` when an update is available, spinning `<Loader2 className="animate-spin ..." />` during active download, and `<RotateCcw />` when ready to restart.
- **Guarded install contract:** `app:installUpdate` may run the installer only when `updaterState === 'downloaded'`. Never force-exit the app (`app.exit` / window destroy) when `quitAndInstall` fails: return `{ success: false, error }`, move the updater to `error`, and let the renderer (`updateStore`, `SettingsManager`) re-check and re-download. On success electron-updater quits the app itself and NSIS relaunches it.


## Settings draft and save convention

Settings preferences, feature switches and setup edits remain drafts until the single header Save Changes action. Register section-owned async saves with `useSettingsSectionSave` and `SettingsSaveSession`; do not write from input handlers or add section Save buttons. Keep visited sections and nested draft panes mounted across navigation. Await persistence, propagate errors, and keep failed drafts retryable. Runtime stores and caches update only after successful persistence. Existing API writes are not an atomic transaction across sections. Explicit operational actions remain separate. See AGENTS.md rule 18 and the change guide Settings section.

## Toast notifications

- All POS transient notifications use `src/components/ui/FloatToast.tsx`; do not create feature-specific toast markup, use browser `alert()`, or add another toast library. Feature adapters may only map state into FloatToast props.
- Use success/error/info/warning types and semantic icons from the shared component. Put simultaneous messages in one positioned stack with `stackItem`; retain dismiss callbacks, action buttons and existing state-owned lifetimes (`duration={0}`). Restaurant errors/warnings remain until dismissed.
- Inline field validation, persistent status/progress panels and confirmation dialogs remain contextual UI. Add shared visual or accessibility changes only in FloatToast.
