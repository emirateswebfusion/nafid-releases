# Nafid POS — Architecture

Offline-first Electron desktop point of sale (React 19 renderer + Node main process + SQLite), synchronised with
`nafid-server`. This file is the entry point; the full reference is **[`docs/architecture/`](docs/architecture/README.md)**.

```text
Renderer (src/)                         Main process (electron/)                  Cloud
components → hooks/store → data ──IPC──▶ ipc (register) → services → db/statements
                 │            ▲ events          │
                 └── data/cloud/* ──────────────┼──────── HTTPS ───────────────▶ nafid-server
                                         sync/ (legacy engine, or outbox ── /api/sync/* ────▶ nafid-server
                                                engine behind "Sync engine (beta)")
```

| Need | Go to |
|---|---|
| Processes and how they talk | [01-system-overview](docs/architecture/01-system-overview.md) |
| Folder responsibilities and dependency rules | [02-codebase-map](docs/architecture/02-codebase-map.md) |
| Reading/writing data, adding an IPC channel, sync | [03-data-access](docs/architecture/03-data-access.md) |
| Money, pricing, tax, numbering, permissions, auth | [04-business-rules](docs/architecture/04-business-rules.md) |
| Coding standards and enforced rules | [05-conventions](docs/architecture/05-conventions.md) |
| Where to implement or modify a feature, definition of done | [06-change-guide](docs/architecture/06-change-guide.md) |
| Why it is built this way | [adr/](docs/architecture/adr/) |

Non-negotiables: UI reaches data only through `src/data/*`; business rules have one tested implementation in
`src/utils/*`; handlers stay thin; files only shrink; `npm run verify` passes before anything is merged.
