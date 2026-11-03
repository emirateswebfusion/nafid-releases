# Card terminal integration (ECR) — design

**Status:** implemented 3 Nov 2026 on `feat/card-terminal`, off by default. Built: the interface, the training
(simulated) adapter, journal (migration 015), IPC, checkout step, cashier dialog, void on failed save / bill delete,
refund on card returns, the Hardware → Card Terminal settings panel and tests (`cardTerminalService.test.ts`,
`cardTerminalStep.test.ts`). **Not built:** a real acquirer adapter. No UAE acquirer publishes its ECR message format
(§2); the first one is added as `electron/hardware/cardTerminal/adapters/<provider>.ts` plus one line in `registry.ts`
and the `TerminalProvider` unions once the acquirer sends its spec and a test terminal. Until then only the training
terminal can be selected, so nothing can be charged by mistake.
**Goal:** the cashier sends the bill's card amount to the shop's bank card machine from the POS instead of typing it
on the machine. The result (approved / declined, auth code, masked card number, terminal reference) comes back and is
stored on the bill.

## 1. How card payments work today

| Where | What happens |
|---|---|
| `src/components/billing/views/BillingPaymentPanel.tsx` | Cashier picks **Card** (full amount) or types a Card part in SPLIT / CREDIT mode (`splitDetails.card`) |
| `src/components/billing/checkout/checkoutHandler.ts` (773 lines, near the 800 cap) | Builds the payload: `payment_method` `CARD` or `SPLIT`, `split_details.card`, `received_amount`; calls `invoicesApi.checkout` / `updateInvoice` |
| `electron/services/partyLedgerService.ts` | `invoiceCreditTerms` / `checkoutPaymentRows`: a card part of a credit/split bill posts `<bill>-CARD`; a full CARD bill posts no ledger rows; returns refunded by CARD post `<return>-REFUND` |
| `invoices.split_details` (TEXT JSON, synced) | Server treats it as opaque JSON (`nafid-server` `customerCredit.ts`, `cashier.ts` only read the known amount keys) |
| Payment sources (`src/components/payment-methods/`) | A "Card Portal" source is bookkeeping only; nothing talks to a device |

Nothing connects to the card machine; the cashier types the amount twice, which is where the typos come from.

## 2. UAE market research (Nov 2026)

There is **no public ECR specification from any UAE acquirer**. Every acquirer gives its ECR protocol to the POS vendor
under NDA, after the merchant asks for an integrated terminal, and tests the integration itself before switching the
terminal to ECR mode. What can be confirmed publicly:

| Acquirer | Terminals | Integration offered | Public docs | Notes |
|---|---|---|---|---|
| **Network International (N-Genius)** | Android N-Genius POS (PAX / Ingenico class) | "Standard EPOS integration": till wired to the terminal; also cloud APIs | None for in-store (N-Genius Online docs are e-commerce only) | Largest UAE acquirer; spec and test terminal via the merchant's Network relationship manager |
| **Magnati** (FAB) | White-label Android PCI PTS 5.x (OMA Emirates) | Press: "easily integrable with the merchant's cash register" | None | Ask Magnati integration team for the ECR spec |
| **Geidea** | PAX A920, Verifone, Spectra | "Web ECR": a Windows service on the POS PC with a local API; terminal over USB; ECR mode enabled on the terminal | Only via third-party connectors (Odoo modules, Saudi) | Connector vendors report no Geidea permission needed beyond enabling ECR mode; refunds not supported by those connectors. UAE availability to confirm |
| **Mashreq / NEOPAY** | Bank terminals | "Retail Integration Solution": payment component inside the ECR, PCI DSS | Marketing page only (+971 4 424 4763) | Ownership changed in 2024 (65 % sold); confirm current offer |
| Ingenico / PAX / Verifone directly | — | Device ECR modes (serial/USB-CDC 9600-8N1, TCP sockets, RNDIS) exist, but the message format is the **acquirer's payment app**, not the device maker's | Vendor-specific, NDA | We integrate with the acquirer app on the device, never the device firmware |

Common shape across all of them, which the design relies on:

- **Transport:** serial / USB virtual COM (9600 or 115200, 8N1), or TCP to the terminal's LAN IP, or a local HTTP service
  (Geidea Web ECR). Node `serialport` (already a dependency, used by the weighing scale) and `net` cover all three.
- **Messages:** sale (amount in minor units + ECR reference), void / reversal, refund, last-transaction inquiry, status /
  ping, and sometimes settlement. Response: result code, auth code, RRN / STAN, terminal id, masked PAN, card scheme.
- **Semi-integrated:** the card is read and authorised by the terminal; the POS never sees full card data, so the POS
  stays out of PCI DSS card-data scope (only the masked PAN and references pass through).
- **Certification:** the acquirer tests our integration (sale, decline, timeout, void, refund, duplicate) on a test
  terminal before enabling it per merchant. No separate scheme certification for semi-integrated ECR. Cost is usually
  free for the vendor; acquirers may charge the merchant for an integrated terminal or a monthly fee. Exact figures
  are not published and must come from each acquirer.

**What we need from the owner per provider:** the ECR spec document, a test (demo) terminal or test mode on a live
terminal, the acquirer contact for certification, and the merchant id / terminal id of a pilot shop.

## 3. Design

### 3.1 Principles

1. **Provider-neutral core.** Checkout, storage and UI depend on one `PaymentTerminal` interface; each acquirer is an
   adapter. Adding an acquirer touches only `electron/hardware/cardTerminal/adapters/<provider>.ts` and a settings
   option.
2. **Never block billing.** The feature is off by default and per terminal. If the device is unreachable the cashier
   can fall back to today's manual card entry (setting, default allowed), and the bill records that it was manual.
3. **Never lose or double charge.** Every request is journaled locally **before** it is sent; an unknown outcome is
   resolved by an inquiry, never by sending the sale again.
4. **No card data, no secrets in code or logs.** Only the last 4 digits and scheme are stored; credentials (if an
   adapter needs keys) are encrypted with Electron `safeStorage` in a device-local setting.
5. **Architecture rules:** bridge only in `src/data/cardTerminal.ts`; IPC one-line registrations; SQL in
   `electron/db/statements/cardTerminal.ts`; files ≤ 800 lines; no `any`; checkout gets a small hook-in, the logic
   lives in new modules.

### 3.2 Main process

```text
electron/hardware/cardTerminal/
  types.ts            PaymentTerminal interface, request/result types, error codes
  registry.ts         createTerminal(config) → adapter by provider id
  transport.ts        link check (open/close the COM port or TCP socket) and COM port listing; an acquirer
                      adapter adds its own framing / LRC on top of serialport / net
  adapters/mock.ts    deterministic mock: approve / decline / timeout / slow by amount (tests + demo)
  adapters/<provider>.ts   first real acquirer, from its ECR spec
electron/services/cardTerminalService.ts   use-cases: sale, cancel, void, refund, inquiry, test, journal, recovery
electron/db/statements/cardTerminal.ts     journal SQL
electron/db/migrations/NNN-card-terminal-transactions.ts
electron/ipc/cardTerminalHandlers.ts       handle('cardTerminal:sale', cardTerminalService.sale) …
```

```ts
export type TerminalProvider = 'MOCK' | 'NETWORK' | 'MAGNATI' | 'GEIDEA' | 'NEOPAY';
export type TerminalOutcome = 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'TIMEOUT' | 'ERROR' | 'UNKNOWN';

export interface TerminalSaleRequest {
  ecrRef: string;          // unique per attempt: `${invoice_id}-${attempt}` (≤ 20 chars after mapping if the spec limits it)
  amountMinor: number;     // integer fils; never a float
  currency: 'AED';
}

export interface TerminalResult {
  outcome: TerminalOutcome;
  ecrRef: string;
  amountMinor: number;
  authCode?: string;
  rrn?: string;            // retrieval reference number
  terminalId?: string;
  maskedPan?: string;      // normalised to '************1234'; anything else is rejected before storage
  scheme?: string;         // VISA, MASTERCARD, AMEX, UNIONPAY, MADA…
  responseCode?: string;
  message?: string;        // terminal's display text for the cashier
}

export interface PaymentTerminal {
  readonly provider: TerminalProvider;
  ping(): Promise<{ ok: boolean; message?: string }>;
  sale(req: TerminalSaleRequest, signal: AbortSignal, onStatus: (s: string) => void): Promise<TerminalResult>;
  voidSale(original: TerminalResult, signal: AbortSignal): Promise<TerminalResult>;
  refund(req: TerminalSaleRequest & { original?: TerminalResult }, signal: AbortSignal): Promise<TerminalResult>;
  inquire(ecrRef: string): Promise<TerminalResult>;   // last/specific transaction status; UNKNOWN if unsupported
  cancel(): Promise<void>;                            // ask the device to abort the current prompt
  close(): Promise<void>;
}
```

The service holds one adapter per process (one physical terminal per POS PC) and serialises requests: a second sale
while one is running is rejected with `BUSY`.

### 3.3 Local journal (migration)

`card_terminal_transactions` — device-local (never synced; `sync_status = 'LOCAL'`), the audit trail and crash
recovery:

| Column | Note |
|---|---|
| `id`, `tenant_id`, `invoice_id`, `ecr_ref` (unique), `kind` (`SALE`/`VOID`/`REFUND`/`INQUIRY`) | |
| `amount_minor`, `currency`, `provider`, `terminal_id` | |
| `status` (`SENT`, then the outcome), `auth_code`, `rrn`, `masked_pan`, `scheme`, `response_code`, `message` | masked PAN only |
| `original_ecr_ref` | for void/refund |
| `created_at`, `updated_at`, `resolved_by` (`DEVICE`/`INQUIRY`/`CASHIER`) | |

The row is inserted with `SENT` before the first byte is written to the device and updated when the answer arrives.

### 3.4 Bill data (no schema change, no sync contract change)

On approval the renderer adds one key to the bill's existing `split_details` JSON:

```json
"card_terminal": { "provider": "NETWORK", "ecr_ref": "…", "auth_code": "123456", "rrn": "…",
                   "terminal_id": "…", "masked_pan": "************1234", "scheme": "VISA",
                   "amount": 105.00, "approved_at": "2026-11-03T10:15:00Z", "manual": false }
```

`split_details` is already synced as opaque text (server `customerCredit.ts` / `cashier.ts` read only the amount keys),
so this is additive: older terminals and the server keep it unchanged. Ledger rules (`-CARD` rows) do not change: the
terminal only *proves* the card part; the amounts posted are the same as today.

### 3.5 Renderer

```text
src/data/cardTerminal.ts                 cardTerminalApi = bindBridge({ sale: 'cardTerminalSale', … }); bridgeEvents.onCardTerminalStatus
src/store/cardTerminalStore.ts           the dialog prompt + the promise the step awaits for the cashier's choice
src/components/app/cardTerminalStep.ts   app-wide flows (checkout charge, void on failed save / delete, refund on
                                         return); used by billing checkout, billing returns and Sales History
src/components/app/CardTerminalDialog.tsx  "Card payment · amount · status · [Cancel on terminal]" + result choices;
                                         mounted once in App.tsx
src/components/settings/tabs/CardTerminalSettings.tsx  "Card Terminal" sub-tab of HardwareSettingsTab
```

Checkout hook-in (7 lines in `checkoutHandler.ts`, after validation and before `invoicesApi.checkout` / `updateInvoice`):

```ts
const cardStep = await runCardTerminalStep({ tenantId, invoiceId: invoice_id, isEditing,
  skip: isQuotationMode || isReturnMode || isFilingOnly, paymentMethod, cardAmount: cardAmountOf(…) });
if (!cardStep.ok) { setHardwareError(cardStep.message); return; }
if (cardStep.details) Object.assign(splitDetailsForSave, { card_terminal: cardStep.details });
…
await settleCardTerminalStep(result.success);   // after the save; also settleCardTerminalStep(false) in the catch
```

`runCardTerminalStep` returns `{ ok: true, details: null }` without contacting the machine when the setting is off, the
card part is 0, or the bill is a quotation, return or filing-only copy. **Save** (without printing) is a sale and is
charged like Print. An edit keeps the bill's earlier `card_terminal` when the card amount is unchanged (no second
charge).

### 3.6 Flows

**Sale**
1. Cashier presses Pay with Card (or a split with a Card part). Modal opens; main journals `SENT`, sends the sale.
2. Status events ("Insert / tap card", "PIN entry", "Authorising") stream to the modal.
3. `APPROVED` → modal closes, checkout continues with `card_terminal` details; receipt prints as usual.
   `DECLINED` / `CANCELLED` → message shown, bill stays open, cashier can retry (new `ecr_ref`) or change method.
4. Bill save fails after an approval → the step automatically sends **void** for that `ecr_ref` and tells the cashier;
   if the void cannot be confirmed, the journal row stays visible under "Unresolved" (§3.8).

**Timeout and cancel**
- Default overall timeout 120 s (setting, 30–300). Cancel button sends `cancel()` to the device and aborts the request.
- A timeout, lost connection or app crash leaves the outcome **UNKNOWN**: the service sends `inquire(ecr_ref)`. If the
  terminal says approved/declined, that wins. If inquiry is unsupported or fails, the modal asks the cashier to read the
  terminal slip: **"Approved — enter auth code"** (saved with `resolved_by = CASHIER`, `manual: true`) or
  **"Not charged"**. The POS never re-sends the same sale automatically.

**Offline / device unreachable**
- The card machine does its own bank connectivity; POS internet is irrelevant.
- If the POS cannot reach the device (ping/connect fails), the modal offers **"Enter card payment manually"** when
  `allowManualFallback` is on (default), recording `card_terminal: { manual: true }` with an optional auth code — exactly
  today's behaviour. Off → the cashier must choose another method.

**Voids and refunds**
- Delete of a same-day bill paid through the terminal → offer **void** on the terminal (before the terminal's batch
  settlement). Return refunded by CARD → offer **refund** of the return amount linked to the original `ecr_ref`.
- Both are offered, never forced: the existing ledger/return rules run regardless, and the cashier may decline
  (e.g. the refund was done on the terminal directly). Built: void on a failed save, void offer after a Sales History
  delete (`offerCardTerminalVoid`), refund offer after a return refunded by CARD (`offerCardTerminalRefund`).

### 3.7 Settings (Hardware tab, device-local)

Key `card_terminal_config`, added to `LOCAL_DEVICE_SETTING_KEYS` (never synced; each PC has its own machine):

| Field | Default |
|---|---|
| `enabled` | `false` |
| `provider` | `MOCK` (training terminal, every build; nothing is charged) / an installed acquirer adapter |
| `connection` | `{ type: 'SERIAL', path: 'COM3', baudRate: 9600 }` or `{ type: 'TCP', host, port }` |
| `timeoutSeconds` | 120 |
| `allowManualFallback` | `true` |
| `merchantRef` / adapter keys | not built; add only if an acquirer spec needs them, stored through `safeStorage`, never echoed back to the renderer |

UI: enable toggle, provider, connection (COM port list via `serialport.list()`), timeout, manual fallback, **Save** and
**Save and test connection** (link check + adapter ping), plus the last 20 journal rows and the unresolved list. Permission: hardware settings already require settings access; the void/refund actions use the
existing delete/return permissions.

### 3.8 Recovery

Rows still `SENT` / `UNKNOWN` (a crash or a timeout the inquiry could not settle) are listed under Hardware → Card
Terminal, where the cashier records each from the slip (Approved + auth code / Not charged). Not built yet: a banner on
the billing screen pointing to them.

### 3.9 Tests

- `tests/unit/cardTerminalService.test.ts` with the mock adapter: approve, decline, cancel, timeout → inquiry,
  BUSY, void after failed save, journal written before send, masked-PAN validation (rejects anything with > 4 digits
  visible), amounts in minor units (e.g. 0.1 + 0.2).
- `tests/unit/cardTerminalStep.test.ts`: skip rules (off, zero, quotation, edit already approved), split card part
  amount, `split_details.card_terminal` shape.
- Adapter tests per provider: frame encode/decode against spec examples (golden byte strings), checksum/LRC, partial
  frames, garbage bytes.
- Log redaction test: no adapter log line contains a 12+ digit number.

### 3.10 Implementation notes

- Edits: the earlier payment is read from the saved bill (`cardTerminal:billSplitDetails`), so it is kept on any terminal
  while the card amount is unchanged. A changed amount asks to void the earlier payment (possible only on the PC whose
  journal holds it) and charge the new amount. If that new charge's save then fails, the new charge is voided; the
  earlier one stays voided and the bill keeps its old record, so check the terminal report in that rare case.
- Training terminal amounts: `.51` declines, `.52` never answers (cancel / timeout), `.53` device error, `.54` approved
  but the answer is lost (found by the inquiry).

### 3.11 Out of scope here

- Receipt line "Card ****1234 · Auth 123456" — the print documents are being changed by the Arabic bill work; add the
  line after that merges (data is already in `split_details.card_terminal`).
- Terminal batch settlement / end-of-day from the POS, tips, pre-auth, multiple terminals per PC, cloud (terminal-API)
  integrations.
- Server-side reporting of card references (the data already syncs inside `split_details`).
