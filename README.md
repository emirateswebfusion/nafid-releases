# Nafid POS (desktop)

Offline-first retail point of sale for Indian shops: GST / Bill of Supply billing, inventory, parties and credit,
scrap buy-back, returns, quotations, cashier settlement, WhatsApp bills and an offline AI assistant.
Electron 42 + React 19 + Vite + better-sqlite3 + Zustand + Tailwind 4.

- **Architecture (read first):** [`ARCHITECTURE.md`](ARCHITECTURE.md) → [`docs/architecture/`](docs/architecture/README.md)
- **Setup, hardware, packaging:** [`DEVELOPER_ONBOARDING.md`](DEVELOPER_ONBOARDING.md)
- **Workspace rules for agents/developers:** `../AGENTS.md`
- **Git workflow (branches, commits, PRs):** [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Commands

```bash
pnpm install           # then: pnpm run rebuild (Electron build of better-sqlite3)
npm run dev            # Vite + Electron
npm run verify         # typecheck (app + electron) + unit tests + architecture guard — must pass
npm test               # unit tests only (Vitest)
npm run lint:ratchet   # lint debt must not grow
npm run build          # production build
npm run package:win    # Windows installer (electron-builder)
```

Environment: `.env` / `.env.production` (`VITE_CLOUD_API`, sync interval, GitHub release settings). Never commit them.
