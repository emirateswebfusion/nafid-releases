# Nafid POS — Architecture Documentation

This folder is the **standard reference** for how `nafid-pos` is built and how to change it.
Read it before writing code. If the code and these documents disagree, fix one of them in the same change.

| # | Document | Read it when you need to know… |
|---|---|---|
| 1 | [System overview](01-system-overview.md) | what the processes are and how the UI, main process, cloud and LAN talk |
| 2 | [Codebase map](02-codebase-map.md) | what every folder is for and which way dependencies may point |
| 3 | [Data access](03-data-access.md) | how the UI reads/writes data (IPC repositories, events, cloud REST, sync) |
| 4 | [Business rules](04-business-rules.md) | where money, pricing, tax, numbering, permissions and auth live |
| 5 | [Conventions](05-conventions.md) | coding standards and the rules the guard scripts enforce |
| 6 | [Change guide](06-change-guide.md) | where to put a new feature, how to modify one safely, definition of done |
| — | [Authentication lifecycle](auth-session-lifecycle.md) | password/PIN entry, separate cloud credentials, reconnect, logout and truthful connection status |
| — | [Release validation](release-validation.md) | mandatory final-installer, production configuration, upgrade and publication checks |
| — | [macOS distribution](macos-distribution.md) | native Intel/Apple Silicon builds, signing, notarization, combined update feed and Mac release gates |
| — | [Decision records](adr/) | why the architecture is the way it is (0001 bridge repositories, 0002 one rule one module, 0003 ratchets, 0004 main-process layering, 0005 LAN pairing, 0006 silent updates) |
| — | [GST Phase 2A Integration](gst-phase2a-integration.md) | India GST multi-mode integration architecture (Managed GSP, Shop GSP, Offline) |
| — | [UAE VAT 201 & FTA Audit](vat-uae-integration.md) | UAE Form VAT 201 return, FTA Audit File (FAF), and filing lifecycle |
| — | [Card terminal (ECR)](card-terminal-design.md) | sending card amounts to the bank card machine: UAE acquirer research, `PaymentTerminal` interface, journal, flows, how to add an acquirer |
| — | [UAE e-invoicing (PINT AE)](uae-einvoicing-design.md) | Peppol PINT AE e-invoices built and sent by the server after sync; read-only status mirror on terminals; ASP adapters |
| — | [Restaurant mode](restaurant-mode-design.md) | tables, kitchen stations, add-ons, orders and KOT, kitchen display, settlement through checkout, India and UAE rules |
| — | [Scan & Go](scan-go-design.md) | customer carts sent from the phone, the Carts panel at the cash register, claim/complete with the normal checkout |

Related:

- Workspace overview (all apps, cross-app contracts): `../../../ARCHITECTURE.md`
- Agent/developer operating rules and commands: `../../../AGENTS.md`
- Cloud API counterpart: `../../../nafid-server/docs/architecture/`
- Setup, hardware and packaging how-to: `../../DEVELOPER_ONBOARDING.md`

## The rules in one screen

1. **UI never touches the bridge.** Components, stores, hooks and services call `src/data/<domain>.ts`. Only `src/data/client.ts` reads `window.electronAPI`. *(enforced)*
2. **One rule, one module.** Money, pricing, tax, numbering and permission rules live in `src/utils/*` with unit tests. Never re-implement them inline. *(see [04](04-business-rules.md))*
3. **Thin handlers.** `electron/ipc/*` only registers channels (`handle(channel, service.fn)`); use-cases live in
   `electron/services/`, SQL in `electron/db/statements/`. *(enforced)*
4. **Dependencies point down:** `components → hooks/store → data/utils`; `ipc → services → db/statements`. Never upward. *(enforced)*
5. **Files stay small.** Component budget is 800 lines; oversized legacy files are capped at their current size and may only shrink. *(enforced)*
6. **No new `any`, no copy-paste.** Extract and reuse; type new code.
7. **Verify every change:** `npm run verify` (typecheck app + electron, unit tests, architecture guard).
