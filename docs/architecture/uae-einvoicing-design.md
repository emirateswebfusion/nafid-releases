# UAE Electronic Invoicing (Peppol PINT AE) — Design

**Status:** implemented on `feat/uae-einvoice` (both repos, 3 Nov 2026); see §9. Owner decision: full scope now.
**Date:** 3 Nov 2026. **Branch:** `feat/uae-einvoice` in `nafid-pos` and `nafid-server`.
**Related:** `vat-uae-integration.md` (VAT 201 / FAF), `gst-phase2a-integration.md` (same provider-adapter pattern for India).

---

## 1. What the law requires (verified 3 Nov 2026)

Primary sources: MoF *UAE Electronic Invoicing Guidelines* **v2.0, 26 Oct 2026** (58 pp.), Peppol **PINT AE Billing 1.0.4**
(schematrons and code lists from `docs.peppol.eu/poac/ae/pint-ae/resources.zip`, dated 29 Jul 2026), Ministerial
Decision 66/2026 (amends MD 244/2025), MoF press release of 30 Oct 2026 on Cabinet Decision 173/2026.

| Topic | Rule | Source |
|---|---|---|
| Legal basis | MD 243/2025 (system), MD 244/2025 (timeline), amended by MD 197/2026 and MD 66/2026; ASP accreditation MD 64/2025 → MD 56/2026, 168/2026 | MoF e-invoicing page |
| Model | Peppol 5-corner: supplier → supplier's ASP (C2) → buyer's ASP (C3) → buyer; C2 also reports Tax Data to the FTA (C5). XML only, **no QR code** | Guidelines §5.3 |
| Format | UBL 2.1 Invoice / CreditNote, `CustomizationID = urn:peppol:pint:billing-1@ae-1`, `ProfileID = urn:peppol:bis:billing` | PINT AE 1.0.4 |
| **Scope** | B2B, B2G (and G2B/G2G). **B2C is out of scope**: "no obligation … to issue an Electronic Invoice in relation to a supply that is made to a consumer" until a later Ministerial Decision | Guidelines §6.2 |
| Who | Every Person doing Business in the UAE **regardless of VAT registration** (non-VAT shops issue *Commercial Invoices*) | Guidelines §6.1 |
| One ASP | A Person appoints **exactly one ASP** for both sending and receiving | Guidelines §6.1 |
| Timeline | Revenue ≥ AED 50M: appoint ASP by **30 Oct 2026** (was 31 Jul), live **1 Jan 2027**. Revenue < AED 50M: appoint by **31 Mar 2027**, live **1 Jul 2027**. Voluntary from 1 Jul 2026 | Guidelines §8.3, MD 66/2026 |
| VAT groups | Intra-group transactions get a 24-month grace from 1 Jan 2027 | Guidelines §6.3.2.1 |
| Tax invoice | Under VAT Art. 65(5) an in-scope Person issues its Tax Invoice / Tax Credit Note **as** the e-invoice. If the buyer is not on Peppol yet, send to predefined endpoint `0235:9900000098` **and** give a normal (PDF/paper) Tax Invoice too | Guidelines §6.2, §10.2.2 |
| Exports | Buyer without Peppol ID → `0235:9900000099` with transaction type `XXXXXXX1` | Guidelines §18.3.3 |
| Identity | Participant ID = `0235:` + **TIN** = first 10 digits of the TRN | Guidelines p.6, §13.2 |
| Credit notes | Type 381; must reference the preceding invoice(s) (one CN may cover several invoices; partial CNs allowed) and carry reason code BTAE-03 (`DL8.61.1.A`–`E`, or `VD` volume discount, which needs no reference) | PINT AE `ibr-055-ae`, `ibr-158-ae`, CreditReason code list |
| Issue time | Within **14 days** of the transaction (secondary source: Andersen summary of MD 243; confirm with the ASP) | MD 243 Art. (per Andersen) |
| Retention | 5 years after the tax period (+4 on audit/dispute); data stored in the UAE | Guidelines §5.4 |
| Penalties | Cabinet Decision 173/2026 replaces 106/2025: **AED 5,000** first violation + AED 5,000 per month continuing, **cap AED 50,000** per 12 months; failure-to-notify-system-failure penalty removed; voluntary adopters exempt; penalties apply only from the Person's mandatory date | MoF release 30 Oct 2026, Guidelines §8.2 |

What this means for Nafid's customers (Abu Dhabi retail/trade shops, almost all < AED 50M): **mandatory from 1 Jul 2027
for every sale to a business or government buyer**, plus credit notes on those sales. Walk-in consumer sales stay as
today (paper/thermal Tax Invoice). Shops also *receive* purchase invoices through the same ASP.

## 2. Nafid today vs PINT AE

Today a UAE invoice is a row in `invoices` + `invoice_items` (SQLite, synced to Postgres), printed by
`src/utils/print/uaeInvoice.ts`. Credit notes are `returns` + `return_items` (migration 012 added
`credit_note_number`, `original_invoice_number/date`, `reason_code`). Shop TRN is stored in the shop GSTIN field;
**the emirate is not stored** (the VAT screen keeps it in component state, `useVatReport.ts`).

### 2.1 Field map (Tax Invoice, type 380)

| PINT AE (IBT/BTAE) | Required | Nafid source | Gap |
|---|---|---|---|
| IBT-001 Invoice number | M | `invoices.invoice_number` | — |
| BTAE-07 UUID | M | `invoices.invoice_id` (UUID) | — |
| IBT-002 Issue date | M | `invoices.created_at` (UTC!) | Convert to Asia/Dubai date (see the 26 Oct UTC-date defect) |
| IBT-003 Type code | M | `invoice_type`, returns → 381 | Mapping only |
| BTAE-02 Transaction type (8 flags) | M | — | Derive: export flag from buyer country; others `0` for v1 |
| IBT-005 Currency | M | AED | — |
| IBT-009 Due date | O | `due_date` | — |
| Seller endpoint `0235:<TIN>` | M | shop TRN | Derive TIN = TRN[0..10] |
| IBT-031 Seller TRN | M (tax inv.) | shop TRN | — |
| IBT-027 Seller legal name, IBT-030 + BTAE-15/12 trade licence no. / type / authority | M | shop name | **Missing: legal name, trade licence no., issuing authority** |
| IBT-035/037/039 Seller street, city, emirate code (AUH, DXB, SHJ, AJM, UAQ, RAK, FUJ) | M (`ibr-143-ae`) | free-text `shopAddress` | **Missing: structured address + stored emirate** |
| Buyer endpoint (IBT-049) | M | — | **Missing: buyer Peppol ID**; fallback `0235:9900000098` (default = buyer TIN) |
| IBT-048 Buyer TRN | M if registered | `invoices.customer_gstin`, `customers.gstin`, `parties.gstin` | Validate with `trnValidator.ts` (`ibr-132-ae`: 15 digits, starts 1, ends 03 — stricter than our `100…` rule) |
| IBT-044 Buyer legal name, IBT-047 + BTAE-16/11 licence | M if no TRN (`ibr-135-ae`) | `customer_name` | **Missing: buyer trade licence/ID + type** |
| IBT-050/052/054 Buyer street, city, emirate | M (`ibr-144-ae`) | free-text `customer_address` | **Missing: structured buyer address** |
| IBT-081 Payment means code | O (used) | `payment_method`, `split_details` | Map CASH→10, CARD→48/54/55, BANK→30/42 |
| Line IBT-129 quantity + **unitCode** (UN/ECE Rec 20) | M | `quantity`, `uom` ('Pcs', 'Kgs' …) | **Map uom → H87, KGM, LTR, MTR, …** |
| Line IBT-131 net amount, IBT-146 price | M | `total`, `unit_price` | Verify tax-inclusive vs exclusive per pricing mode |
| Line IBT-151/152 VAT category + rate | M | product `tax_rate_percent`, `is_gst_applicable` | Map 5→S, 0→Z; **exempt (E) / out of scope (O) not distinguishable** |
| BTAE-13 Item type G/S/B | M | `is_service_item` | — |
| IBT-158 Item classification (HS) for goods (`ibr-184-ae`) | M | `products.hsn_sac_code` | Indian HSN/SAC is reused; UAE needs **HS code** for goods, **service accounting code** BTAE-17 for services |
| BTAE-08 / BTAE-10 line VAT and line total in AED | M | `tax_amount`, `total` | — |
| IBG-20 Document allowance | when used | `discount_total`, points discount, scrap/return deduction | **Rule needed:** points discount = allowance; scrap/return credit is *payment*, not price reduction (→ `PrepaidAmount`), confirm with the shop's tax adviser |
| IBG-23 VAT breakdown, IBT-106…115 totals | M | computed | Generated from lines; rounding only at document total |

### 2.2 Credit note (type 381)

| PINT AE | Nafid source | Gap |
|---|---|---|
| IBG-03 Preceding invoice ref + date | `returns.original_invoice_number/date`, `invoice_id` | — |
| BTAE-03 Reason | `returns.reason_code` (Indian `01-Sales Return` default) | **Map to `DL8.61.1.D` for returns; UI choice for cancellation (A) / price change (C) / error (E)** |
| Lines | `return_items` | Same gaps as invoice lines |

### 2.3 Data to add (both schemas, synced)

- **Settings (shop):** `uae_legal_name`, `uae_trade_license_no`, `uae_trade_license_authority`, `uae_emirate`
  (code), `uae_address_street`, `uae_address_city`, `einvoice_enabled`, `einvoice_mode` (OFF / VOLUNTARY / MANDATORY).
- **customers / parties:** `uae_tin` (or derive from TRN), `peppol_endpoint_id`, `legal_id`, `legal_id_type`
  (TL/EID/PAS/CD), `legal_id_authority`, `emirate`, `city`, `street`, `country_code`.
- **products:** `uae_item_classification` (HS code, goods) and `uae_service_code` (services); unit code mapping table.
- **Invoice snapshot:** buyer identity is copied onto `invoices` at checkout (as `customer_gstin` already is), so a later
  customer edit never changes an issued e-invoice: `buyer_endpoint_id`, `buyer_legal_id`, `buyer_emirate`.
- **E-invoice status** — a *new server-owned table*, not columns on `invoices` (§3.3).

## 3. Architecture

### 3.1 Where the XML is generated: the server

```text
 POS terminal (offline-first)            nafid-server                         ASP (C2)          Peppol / FTA
 checkout ─► SQLite invoice (PENDING) ─sync─► invoices (Postgres)
                                              └► einvoice queue job ─► PINT AE XML ─► ASP API ─► buyer C3 / FTA C5
 status column ◄─pull einvoice_documents ◄─── einvoice_documents (status, ASP id, errors) ◄─ webhook / poll
```

Why the server and not the terminal:

1. **Checkout never waits (D2).** The ASP is an online service with latency, outages and validation failures. A sale must
   complete offline; the legal clock is days (14), not seconds. The terminal only records the sale; submission is
   asynchronous after sync.
2. **One ASP per Person, one credential.** A shop has several terminals but one ASP appointment. Credentials live once,
   in the server credential vault (reuse `services/gst/credentialVault.ts` AES-256-GCM), never on cashier PCs.
3. **One generator.** Every terminal version would otherwise need the same generator; a spec update (PINT AE 1.0.x) or ASP
   change would need a coordinated terminal upgrade (cf. the stock-stream rollout). On the server it is one deploy.
4. **Retries, idempotency and audit** need a durable queue that survives the terminal being switched off.
5. **Inbound invoices** (purchases sent to the shop) arrive at the ASP and must be fetched with no terminal running.
6. **Business rules stay in the POS (D1).** The server does not recompute prices or tax; it *serialises* the stored,
   synced amounts. Validation errors come back as status, never as silent corrections.

Trade-off: an e-invoice cannot be issued until the terminal has synced. Mitigations: the status column shows
`NOT_SYNCED`; the dashboard warns when an in-scope invoice is older than 3 days without `ACCEPTED`.

### 3.2 Server components (mirrors GST Phase 2A)

| Module | Responsibility |
|---|---|
| `src/services/einvoice/pintAe/` | Pure functions: `buildInvoiceXml(doc)`, `buildCreditNoteXml(doc)`, unit/tax-category/payment-means/emirate maps. No I/O |
| `src/services/einvoice/pintAe/validate.ts` | Local pre-validation of the UAE rules we can hit (`ibr-132/135/143/144/158/184-ae`, totals), so most errors show before the ASP |
| `src/services/einvoice/aspAdapter.ts` | `IEinvoiceAspAdapter`: `submit(xml, meta)`, `getStatus(ref)`, `lookupParticipant(tin)`, `fetchInbound(since)`, `checkConnection()` |
| `src/services/einvoice/adapters/sandboxAdapter.ts` | Deterministic mock (accepts, rejects on a marker, delays) for tests and demos |
| `src/services/einvoice/adapters/<asp>Adapter.ts` | The chosen ASP's REST client (v1 only one) |
| `src/services/einvoice/einvoiceService.ts` | Scope decision, enqueue on invoice/return sync, worker loop with backoff, status transitions |
| `src/db/repositories/einvoice.ts` | All SQL (rule 4) |
| `src/routes/einvoice.ts` | `route()`-wrapped, tenant-scoped: settings, connection test, list/retry/status, ASP webhook (signature-verified) |
| Migration `102_einvoice.sql` | `einvoice_settings`, `einvoice_documents`, `einvoice_events` |

Scope decision per document (`einvoiceService.inScope`): shop `einvoice_mode ≠ OFF` **and** buyer is a business or
government (TRN, TIN, trade licence or Peppol ID present) **and** document is a sale invoice / credit note that counts as
a supply (not quotation, estimate, held bill, filing-only, purchase). Walk-in B2C → `NOT_REQUIRED`.

### 3.3 Status contract (both repos, per `ARCHITECTURE.md` §2)

`einvoice_documents` (Postgres, server-owned; mirrored read-only in SQLite by a pull endpoint):

| Column | Notes |
|---|---|
| `document_id` | = `invoices.invoice_id` or `returns.return_id` |
| `document_kind` | `INVOICE` / `CREDIT_NOTE` |
| `status` | `NOT_REQUIRED`, `QUEUED`, `VALIDATION_FAILED`, `SUBMITTED`, `ACCEPTED`, `REJECTED`, `DELIVERED_FALLBACK` (buyer not on Peppol → `9900000098`), `REPORTED` (FTA ack) |
| `asp_reference`, `fta_reference` | ASP message id / FTA acknowledgement |
| `errors` | JSON array of `{rule, message}` |
| `xml_sha256`, `xml` | Exact payload sent (retention: 5 years) |
| `attempts`, `next_attempt_at`, `updated_at`, `server_seq` | Retry and pull cursor |

Why a separate table, not columns on `invoices`: the invoice row is written by terminals and synced last-write-wins
(R4). Server-written status columns on the same row would be overwritten by the next terminal push or would force a
conflict rule. A server-owned table pulled with `server_seq` keeps one writer per row.

POS side: SQLite migration `017-uae-einvoicing.ts`, `electron/db/statements/einvoice.ts`, sync pull step,
`src/data/einvoice.ts` (`einvoiceApi.listStatuses(ids)`), and a **UAE-only "E-invoice" column** in Sales History and the
returns list (badge + error tooltip + "Retry" for owners). Hidden when `country !== 'AE'` or mode `OFF`.

### 3.4 Credit notes and corrections

A posted e-invoice is immutable. Edits after `SUBMITTED` are blocked for in-scope invoices (same idea as filed GST
periods); corrections go through a return/credit note (381, `DL8.61.1.E` for errors, `.A` for cancellation). Deleting
an in-scope submitted invoice is refused with a message that a credit note is required.

## 4. ASP shortlist

The MoF register (`mof.gov.ae` → eInvoicing → service providers) lists 65–83 providers depending on date; its page
was unreachable on 3 Nov 2026, so **confirm accreditation on the register before signing**. None of the large ASPs
publish prices; market ranges seen: AED 0.15–0.75 per invoice at low volume, entry subscriptions AED 200–500/month,
enterprise AED 5k–20k+/year. What matters for Nafid is a **partner/reseller API** (onboard many small shops under
Nafid, each shop still appointing the ASP in its own name), a sandbox on the Peppol test network, webhooks, inbound
fetch, and per-invoice pricing that fits small shops.

| ASP | Status (reported) | API | Pricing | Fit |
|---|---|---|---|---|
| **ClearTax** (Defmacro Software DMCC) | Accredited (aggregator listing no. 163162) | Unified e-invoicing REST API; docs behind sales | Not public | Strong: same vendor family as our India GSP registry (`providerRegistry.ts` already lists ClearTax), India/UAE ops team, SME focus |
| **Avalara** (Avalara Gulf Technologies LLC) | Listed (no. 134809) | Mature "E-Invoicing and Live Reporting" API (UBL in/out, used by Zuora etc.) | Enterprise, not public | Robust, global, likely expensive for small shops |
| **Pagero** (Pagero Gulf FZ-LLC, Thomson Reuters) / **Comarch** (Comarch Middle East FZ LLC) | Listed | REST APIs, Peppol access point | Not public | Enterprise-grade; partner programmes exist |
| **TronStride** (aigentrix platform) | Claims "officially approved" — **unverified** on the register | Public REST docs: API key, `createFull`/`validate`/status timeline, webhooks, `SANDBOX`/`LIVE` | Plans page, prices not listed | Easiest to integrate and prototype; accreditation must be proven |

Recommendation: **ClearTax** as v1 partner (SME pricing likely, existing relationship surface, regional support),
with the adapter interface keeping Avalara/others as a later drop-in. Build against the sandbox adapter first so work
does not wait on a contract.

## 5. v1 scope options

| Option | Contents | Effort (rough) |
|---|---|---|
| **A. Outbound B2B/B2G** (recommended) | Tax invoices + credit notes to business buyers; buyer fallback endpoint; status column; retry; settings + master-data fields; sandbox + one ASP adapter | ~3–4 weeks incl. tests |
| B. A + inbound | Fetch purchase e-invoices from the ASP into a review queue that creates purchase bills | +2 weeks |
| C. A + Commercial invoices for non-VAT shops | Same pipeline, no TRN, `O`/`E` categories | +3–5 days |

Out of v1 regardless: self-billing, summary/continuous/margin/agent/FTZ transaction types, multi-currency (BTAE-04).

## 6. Testing

- **Generator:** golden XML per scenario (standard, zero-rated, mixed, discount, credit note, fallback endpoint, export),
  checked for well-formedness and against the UAE rules re-implemented in `validate.ts`.
- **Official schematron:** PINT AE ships XSLT 2.0 (needs Saxon). Plan: a dev-only test that runs the official
  `PINT-UBL-validation-preprocessed.xslt` and `PINT-jurisdiction-aligned-rules.xslt` through `saxon-js`/`xslt3` when
  available, skipped otherwise; decide in Phase 2 whether that dependency is acceptable.
- **Adapter:** contract tests against the sandbox adapter; the real adapter against the ASP sandbox, behind an env flag.
- **Sync contract:** characterization test for the new pull step on both sides (rule 8); server golden master updated
  with `UPDATE_GOLDEN=1` and the diff reviewed.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Master data incomplete (HS codes, buyer licence, emirate) | Pre-validation + a readiness checklist screen; block nothing at checkout, flag the invoice instead |
| Terminal offline for days → 14-day limit | Dashboard ageing warning; owner alert at 7 days |
| Price inclusive/exclusive rounding vs PINT totals rules | Generator uses stored line totals; golden tests on inclusive-priced items |
| Late edits/deletes of submitted invoices | Block and require a credit note (§3.4) |
| ASP lock-in | Adapter interface; XML is the standard, so switching ASP needs only a new adapter |
| Spec churn (PINT AE 1.0.x) | Generator versioned; spec id in each stored document |

## 8. Decisions needed from the owner

1. Which ASP to integrate first (and whether Nafid signs as a partner/reseller).
2. v1 scope: A, A+B, or A+C.
3. Whether a dev-only Saxon/`xslt3` dependency is acceptable for running the official schematron in tests.

## 9. Decisions and implementation (3 Nov 2026)

The owner asked for the full feature at once. That means outbound B2B/B2G **and** inbound **and** commercial invoices for shops without a TRN. No new dependency was added (`pnpm install` is not allowed in the worktrees), so the UAE schematron rules are ported into `validate.ts` with their official ids. The output was compared with the element order of the official PINT AE 1.0.4 examples. Running the official XSLT (Saxon) is still a manual check to do.

**ASP:** a built-in deterministic **sandbox** ASP is active. ClearTax (recommended first partner), Avalara and TronStride are registered as `CONTRACT_REQUIRED`: their APIs are released only with an agreement, so each needs one adapter file in `services/einvoice/adapters/` once credentials and documentation exist. Before signing, confirm accreditation on the MoF register.

| Piece | Server (`nafid-server`) | POS (`nafid-pos`) |
|---|---|---|
| Schema | tenant migration `103_uae_einvoicing.sql` | migration `017-uae-einvoicing.ts` (015 is the card-terminal journal, 016 restaurant mode) |
| Generator | `services/einvoice/pintAe/{buildXml,validate,codes,parseInbound}.ts`, `mapDocument.ts` | — |
| ASP | `aspAdapter.ts`, `aspRegistry.ts`, `adapters/sandboxAdapter.ts` | — |
| Use-cases | `einvoiceService.ts` (build → validate → Peppol lookup → submit → status → inbound; backoff 2 min … 6 h, 10 attempts) | `electron/services/einvoiceService.ts` (status mirror reads, customer profile) |
| HTTP / IPC | `/api/einvoice/*` (owner-only settings, credentials, retry), `GET /api/sync/einvoice-documents` | `db:getEinvoiceStatuses`, `db:getEinvoiceSummary`, `db:get/saveCustomerEinvoiceProfile`; `src/data/einvoice.ts`, `src/data/cloud/einvoiceCloud.ts` |
| Sync | stores `invoice_items.uom`, `returns.reason_code` / `credit_note_number`, `customers.einvoice_profile` | `electron/sync/einvoiceSync.ts` runs after each cloud cycle (UAE only): `POST /api/einvoice/process`, then pulls statuses; customer pull keeps the profile (`COALESCE`); settings pull carries `uae_*` seller keys |
| UI (UAE only) | — | Settings → **UAE E-Invoicing** (seller identity, mode / ASP / start date / credentials, *Send now*, status counts, received supplier invoices); customer detail **E-invoicing (UAE)** panel; Sales History **E-invoice** column with error and paper-copy tooltip |
| Tests | `tests/einvoicePintAe.test.ts` (12), `syncInvoices.test.ts` (uom), golden snapshot | `tests/unit/uaeEinvoice.test.ts` (6), `migrations.mts` checks for 017 |

Seller keys: `uae_legal_name`, `uae_tin` (only without a TRN), `uae_trade_license_no`, `uae_trade_license_authority`, `uae_address_street`, `uae_address_city`. The TRN is `shop_gstin` and the emirate is `shop_state`.

**Known limits:**
- A discount applied after VAT, or a manual total override, fails validation with an explanation. The stored amounts are never rewritten; the POS checkout rule would have to change for those bills.
- Loyalty points, scrap and return credits are sent as `PrepaidAmount`. Confirm this treatment with the shop's tax adviser.
- Processing is single-flight per server instance only.
- Inbound documents are listed and marked; they are not yet turned into purchase bills automatically.

