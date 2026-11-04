# ADR 0006: Silent differential auto-updates (delta updates)

Status: accepted

## Context
- In previous releases, updating the POS for small bug fixes or features forced users to re-run the full installer (`Nafid-Setup-*.exe`, ~120MB).
- `electron-builder.config.js` was configured with `oneClick: false` and `allowToChangeInstallationDirectory: true`, which caused the NSIS installer wizard (Welcome, Destination, Install, Finish) to pop up on user screens.
- `updaterService.ts` was calling `autoUpdater.quitAndInstall(false, true)`, explicitly disabling silent mode and launching the interactive NSIS wizard.
- On compact POS touchscreens, update banner text ("Update Ready to Install - Restart to apply the latest update") was wordy and truncated with ellipses.

## Decision
1. **One-click silent packaging (`electron-builder.config.js`).**
   - Configured NSIS target with `oneClick: true` and `differentialPackage: true`.
   - Generates `.exe.blockmap` with every release to enable HTTP byte-range delta downloads.
   - Removed `allowToChangeInstallationDirectory: true` so the installer updates the existing installation directory seamlessly without manual prompts.
2. **Differential download and silent restart (`electron/services/updaterService.ts`).**
   - Explicitly enabled differential downloading (`autoUpdater.disableDifferentialDownload = false`).
   - Routed updater diagnostics to `log` via `autoUpdater.logger = log`.
   - Changed IPC handler to `autoUpdater.quitAndInstall(true, true)` (`isSilent = true`, `isForceRunAfter = true`). NSIS executes with `/S` in the background, updating changed files and relaunching the POS. **Superseded, see Amendment below.**
   - The handler only installs when an update is actually downloaded (`updaterState === 'downloaded'`). A synchronous install failure (e.g. missing installer filepath) is returned to the renderer as `{ success: false, error }` and moves the updater to `error`; the app never force-exits, so the UI can re-download instead of closing with nothing installed.
3. **Compact, non-intrusive UI messaging (`UpdateBanner.tsx`, `SettingsManager.tsx`, `SystemPreferencesTab.tsx`, `DashboardHeader.tsx`).**
   - Title shortened from `"Update Ready to Install"` to `"Update Ready"`.
   - Subtitle shortened from `"Restart to apply the latest update"` to `"Restart to update"`.
   - Action button updated from `"Install Now"` to `"Update →"` with `<RotateCcw>` icon.
   - Settings tab button updated to `"Restart to Update"`.
   - Dashboard header dynamically surfaces the glowing `"Restart to Update"` action with smooth entry transition when an update is ready, removing cluttered static buttons like "Reorder Cards" (relocated to profile menu).
4. **Dynamic "What's New" card generation (`releaseNotesUtils.ts`, `whatsNew.ts`, `SystemPreferencesTab.tsx`).**
   - Banned hardcoding release notes and feature bullet lists in source code.
   - Release notes from GitHub Releases (`updateInfo.releaseNotes`) are dynamically parsed, sanitized (entities decoded, HTML tags stripped), and transformed into the standard "What's New" bento cards with accent dots, bilingual category tags, and external link pills.
   - Notes are persisted in `localStorage` under `nafid_release_notes_<version>` so feature highlights stay visible after the update restarts.

## Consequences
- For routine bug fixes and frontend/service changes, client POS terminals download only the differential byte blocks (~2–5 MB) instead of 120 MB.
- Users no longer experience full reinstallations or wizard prompts; clicking `"Update →"` restarts the app into the new version.
- When native Node modules or Electron runtimes change, full fallback download and silent binary replacement still happen safely without bricking or lock collisions.
- Developers publish release notes only once (in the GitHub Release description); the client app discovers, parses, and styles them automatically without code edits or app recompilations.

## Amendment (2026-11): installer progress banner on restart
- Measured on packaged test builds, the `/S` install takes about 30-45 s from click to relaunch (not ~2 s) with nothing on screen, so it reads as "the app closed and did not restart". A failed `/S` install also exits unseen without relaunching.
- The handler now calls `autoUpdater.quitAndInstall(false, true)`. With `oneClick: true` there is still no wizard and no prompt (the license page is skipped for `--updated`): the user sees the installer's progress banner, then the app relaunches.
- Unsigned builds can still be refused by Windows Smart App Control, on relaunch as well as on a manual start (error 4551). Only code signing addresses that.

## Amendment (4 November 2026): await Windows installer creation

`electron-updater` 6.8 returns success from NSIS `doInstall` before its asynchronous process launch resolves.
A delayed `spawn UNKNOWN` can therefore arrive after `quitAndInstall` has scheduled app shutdown.
Windows uses `windowsUpdateInstaller.ts` to recheck the downloaded EXE's SHA-512 against updater metadata,
then waits for the child process `spawn` event before quitting. The installer retains its progress UI and
`--updated --force-run` relaunch flags. Automatic install on ordinary Windows exit is disabled so that
closing the POS cannot repeat a failed installer launch. Other platforms retain the native updater path.
Launch failures keep the app open, report an actionable error and preserve a verified installer for retry;
missing/corrupt downloads require a fresh check. Concurrent install clicks are guarded. No OS policy is bypassed.
Already-installed older updater code cannot be repaired remotely before it installs a newer release. Shops
whose Windows policy rejects an unsigned installer need an accepted signed release; a new app version alone
cannot override that policy. Recovery instructions must accompany the release for affected older terminals.

## Release 2.2.41: installation visibility

All update actions, including Settings, use the shared store action. `UpdateInstallProgress` displays an indeterminate preparation screen while the Windows installer is being verified/started, including when the announcement banner was dismissed. On success it stays visible until exit; the non-silent NSIS installer shows its own progress and relaunches Nafid. Failures dismiss preparation and retain the retry/error state. No fabricated installation percentage is shown.
