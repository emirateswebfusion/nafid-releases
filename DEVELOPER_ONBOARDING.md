# Nafid POS — Developer Setup

How to install, run, test, package and troubleshoot the desktop POS. For *how the code is organised and where a change
goes*, read [`ARCHITECTURE.md`](ARCHITECTURE.md) → [`docs/architecture/`](docs/architecture/README.md) first.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Windows 10/11 x64 | — | Primary target (macOS builds are possible, not routinely tested) |
| Node.js | ≥ 18 (20 LTS recommended) | Build tooling |
| pnpm | 9+ | Package manager (the repo is installed with pnpm; `pnpm-lock.yaml` is the only lockfile) |
| Visual Studio Build Tools ("Desktop development with C++") | 2022 | Native modules (`better-sqlite3`, `serialport`) |
| Git | 2.40+ | Version control (see `CONTRIBUTING.md`) |

A local `nafid-server` (see `../nafid-server/README.md`) is only needed for online features (login, sync, AI, ads).
The POS works offline without it.

## 2. Install and run

```bash
pnpm install
pnpm run rebuild          # downloads the Electron build of better-sqlite3 (scripts/fix-sqlite.js)
cp .env.example .env      # then fill in the values (see §3)
pnpm run dev              # Vite on :5173 + Electron
```

`npm run <script>` works the same way; just do not create a `package-lock.json` (use `pnpm install` for dependencies).

## 3. Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `VITE_CLOUD_API` | renderer, sync | Base URL of `nafid-server`, e.g. `https://api.example.com` |
| `VENDORA_CLOUD_API` / `NAFID_CLOUD_API` | sync worker | Overrides the cloud URL for the main process (falls back to `VITE_CLOUD_API`) |
| `VENDORA_SYNC_INTERVAL_MINUTES` | sync worker | Fallback sync interval (default 2) |
| `DEFAULT_LAN_IP`, `DEFAULT_DNS` | network settings | Fallback IP/DNS shown when the OS cannot report them (also the LAN host fallback) |
| `GH_TOKEN` / `GITHUB_TOKEN`, `GITHUB_REPO_URL` | packaging, updater | GitHub release publishing — **never** put these in a file that ships (see risk R5) |
| `MOCK_SCALE` | weighing scale | `true` simulates a scale in development (ignored in packaged builds) |

`.env*` files are git-ignored. Never commit them; `.env.example` lists the names only.

## 4. Everyday commands

| Command | What it does |
|---|---|
| `pnpm run verify` | Typecheck renderer + main process, unit tests, architecture guard — **must pass before every commit** |
| `pnpm test` | Vitest unit tests (`tests/unit/`) |
| `pnpm run lint:ratchet` | ESLint; fails only if lint debt grows |
| `pnpm run check:arch` | Architecture guard only |
| `pnpm run build` | Production build (renderer + main process) |

Main-process refactors and sync changes are additionally proven with the Node harnesses in
[`tests/characterization/`](tests/characterization/README.md) (IPC equivalence, statement check, sync golden file).

## 5. Hardware

The main process talks to devices through `electron/hardware/*`.

- **Thermal printer (ESC/POS):** raw TCP on port 9100 (`electron/hardware/printer.ts`); barcodes use the `GS k` command.
  Without a thermal printer, add a Windows "Generic / Text Only" printer or map port 9100 with a raw-TCP redirector.
  A normal inkjet/laser printer prints raw bytes unless it has a thermal-emulation driver.
- **Weighing scale:** serial/COM port, usually 9600 baud (`electron/hardware/weighingScale.ts`). Simulate with a
  virtual COM pair (e.g. com0com) sending lines like `ST,GS,+  1.250kg`, or set `MOCK_SCALE=true` (development only).
- **Barcode scanner:** keyboard wedge — rapid keystrokes ending in Enter (`electron/hardware/barcodeScanner.ts`).
  Typing quickly and pressing Enter triggers the same path.

## 6. Packaging and releases

1. Bump `version` in `package.json` (semantic versioning) and add an entry to `RELEASE_NOTES.md`.
2. `pnpm run package:win` builds the Windows installer into `release/`.
3. `pnpm run package` additionally publishes to GitHub Releases (needs `GH_TOKEN`); `scripts/upload-release.js`
   uploads an existing build. Installed apps pick the update up through `electron-updater`.
4. Tag the release commit `vX.Y.Z` on `main` (see `CONTRIBUTING.md`).

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `better-sqlite3` / `serialport` fails to load, "was compiled against a different Node.js version" | `pnpm run rebuild` (or `npx @electron/rebuild`) |
| "Electron failed to install correctly" / `node_modules/electron/dist` missing | `node node_modules/electron/install.js` (a fresh `pnpm install` runs it: `electron` is in `allowBuilds` in `pnpm-workspace.yaml`) |
| Blank Electron window | Vite is not running on port 5173; start with `pnpm run dev` |
| Data does not reach the cloud | Check `sync_status` of the rows (`PENDING` = not pushed yet) and the server URL/token |
| `npm run build` prints a large-chunk warning on Windows PowerShell as `NativeCommandError` | Harmless; check the exit code |
