# ADR 0001 — Domain repositories are the only door to the Electron bridge

- Status: accepted (22 Oct 2026)
- Scope: `nafid-pos` renderer

## Context

807 references to `window.electronAPI` were spread across 52 components, stores and services. Any change to a channel
silently broke unrelated screens, web builds crashed on `undefined.method`, and the old guard missed `electronAPI!.x()`
and `?.` forms, so extracted views re-introduced direct calls.

## Decision

- `src/data/client.ts` is the single reader of `window.electronAPI`.
- Each domain has a module `src/data/<domain>.ts` exporting a channel catalog `<domain>Api = bindBridge({ alias: 'channel' })`.
  Aliases drop the `db`/domain prefix; signatures come from `src/global.d.ts`, so there is no hand-written boilerplate per call.
- Hand-written, typed functions (mapping, defaults, `ensureSuccess`) live next to the catalog when needed.
- Subscriptions go through `bridgeEvents` (`bindEvents`), which is a no-op outside Electron.
- `scripts/check-architecture.mjs` counts every bridge reference form; the baseline is zero.

## Consequences

- Call sites read `scrapApi.getScrapInvoiceList(...)`; a channel change is made in one module.
- UI code can be unit-tested by mocking `src/data/<domain>`.
- Calls made outside the desktop runtime now throw `IpcUnavailableError` instead of silently returning `undefined`;
  code that must degrade gracefully checks `hasBridge()` / `isDesktopRuntime()`.
- The catalog mirrors the IPC surface; long-term the preload, `global.d.ts` and catalogs should be generated from one manifest.
