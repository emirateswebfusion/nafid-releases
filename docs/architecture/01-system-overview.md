# 1. System overview

`nafid-pos` is an **offline-first desktop point of sale** for Indian retail (GST / Bill of Supply,
scrap buy-back, returns, credit customers, cashier settlement). It is an Electron app with a local
SQLite database that synchronises with the cloud API (`nafid-server`) in the background.

## Processes

```text
┌──────────────────────────── Electron app (one per terminal) ────────────────────────────┐
│                                                                                          │
│  Renderer process (React 19, Vite)          Main process (Node, Electron 42)             │
│  ┌──────────────────────────────┐   IPC     ┌─────────────────────────────────────────┐  │
│  │ components / hooks / stores  │──────────▶│ electron/ipc/*Handlers  (validate)      │  │
│  │            │                 │  invoke   │        │                                │  │
│  │            ▼                 │           │        ▼                                │  │
│  │ src/data/<domain>.ts ──────────preload──▶│ electron/services/* (rules)             │  │
│  │ (the ONLY bridge users)      │  bridge   │        │                                │  │
│  │                              │◀──────────│ electron/db/localDb.ts (SQLite)         │  │
│  │ src/data/events.ts  ◀──── push events ───│ electron/sync/syncWorker.ts ───────────────┼──▶ nafid-server
│  │ src/data/cloud/* (cloud REST) ───────────────────────────────────────────────────────┼──▶ /auth, /api/*
│  └──────────────────────────────┘           │ electron/sync/localHostServer.ts ◀─────────┼── other terminals (LAN)
│                                             │ electron/hardware, electron/whatsapp    │  │
│                                             └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| Process | Code | Responsibility | Must not |
|---|---|---|---|
| Renderer | `src/` | Screens, interaction, client-side state, pure business rules | Import `electron`, read `window.electronAPI` outside `src/data/client.ts`, run SQL |
| Preload | `electron/preload.ts` | Exposes the typed bridge `window.electronAPI` (one function per IPC channel) | Contain logic |
| Main | `electron/` | SQLite, transactions, numbering, sync, printing, scale/scanner, WhatsApp, auto-update | Render UI, block on network during checkout |

## How the parts communicate

| From → To | Mechanism | Where it is defined |
|---|---|---|
| UI → local data | `ipcRenderer.invoke` through the preload bridge | `src/data/<domain>.ts` → `electron/preload.ts` → `electron/ipc/*Handlers.ts` → `electron/services/*` |
| Main → UI (push) | `webContents.send` events (`onSyncDataUpdated`, `onBarcodeScanned`, `onScaleWeight`, …) | `src/data/events.ts` (`bridgeEvents`) |
| UI → cloud | HTTPS + Bearer JWT | `src/data/cloud/*` repositories over `src/data/cloud/client.ts` (`cloudFetch`, `cloudRequest`; the only `fetch` caller) |
| Main → cloud | Background sync worker (HTTPS, JWT saved by `authApi.saveToken`) | `electron/sync/syncWorker.ts` ↔ `nafid-server` `/api/sync/*` |
| Terminal ↔ terminal | LAN HTTP server on the primary terminal | `electron/sync/localHostServer.ts` |
| Main → devices | ESC/POS printer, cash drawer kick, serial scale, keyboard-wedge scanner | `electron/hardware/*` |

## Offline-first write path (checkout)

1. `BillingPage` gathers cart state and builds lines with the pure builders in `src/utils/pricing/checkoutLines.ts`.
2. It calls `invoicesApi.checkout(payload)` (`src/data/invoices.ts`).
3. `electron/ipc/invoiceHandlers.ts` routes `db:checkout` to `invoiceCheckoutService.checkout`, which deduplicates,
   numbers the invoice (`electron/services/invoiceNumberService.ts`) and writes invoice, items, stock and ledger rows in **one SQLite transaction**, marking rows `sync_status = 'PENDING'`.
4. The sync worker later pushes `PENDING` rows to `POST /api/sync/<entity>` and pulls changes with
   `POST /api/sync/delta-pull`. Checkout never waits for the network.

## Read path

`component → src/data/<domain>.ts → window.electronAPI.<channel> → electron/ipc (registration) → electron/services/<domain>Service → electron/db/statements → SQLite`.
After a sync pull the main process emits `onSyncDataUpdated`; screens subscribe through `bridgeEvents` and refetch.

## Tenancy and identity

- One shop = one tenant. Every business row carries `tenant_id` locally, in sync payloads and in Postgres.
- Row ids are UUIDs created on the terminal (`uuid`), or deterministic UUIDs for derived rows
  (`electron/utils/ids.ts`, mirrored by `nafid-server/src/utils/ids.ts` — they must stay identical).
- Human document numbers (GST, BOS, estimate, quotation, return, scrap, purchase) are issued per series by
  `electron/services/invoiceNumberService.ts` and formatted by `src/utils/pricing/invoiceNumberHelper.ts`.
