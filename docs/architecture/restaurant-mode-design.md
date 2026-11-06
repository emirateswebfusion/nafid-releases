# Restaurant / cafeteria mode — design (proposal)

Status: **approved 3 Nov 2026; owner chose the full scope (§13)**.
Audience: developers and agents working on `nafid-pos` and `nafid-server`. Read `ARCHITECTURE.md` §2 (contracts),
[03 data access](03-data-access.md), [04 business rules](04-business-rules.md), [06 change guide](06-change-guide.md)
and [07 sync outbox](07-sync-outbox-design.md) first.

## 1. Goal and non-goals

UAE cafeterias and small restaurants (Abu Dhabi first) need: orders held per table, kitchen order tickets (KOT)
printed per kitchen station, add-ons, takeaway / delivery, and a normal VAT tax invoice at the end. Nafid today has
billing tabs (renderer-local), held bills (terminal-local `HOLD` invoices) and service lines, but no tables, KOT or
kitchen printing.

Goals for v1:

- A **restaurant mode** behind a feature flag. Retail shops see no change: no new menu, no new billing behaviour,
  no change to invoices, receipts, sync payloads of existing tables, or reports.
- Money, VAT, numbering, stock and ledger stay in their canonical modules: **a restaurant order becomes an ordinary
  invoice through the existing checkout**. The restaurant module never computes tax or allocates invoice numbers.
- Works offline and on one terminal; works across several terminals of a shop over the existing LAN / cloud sync.

Non-goals for v1 (candidates for later): recipes / ingredient stock, live API connections to delivery apps
(Talabat, Deliveroo, Noon Food, Careem; channels are recorded, §13), online ordering / QR menus, reservations,
tips, course timing, happy-hour pricing.

## 2. What exists and what we reuse

| Existing piece | Where | How restaurant mode uses it |
|---|---|---|
| Billing tabs | `src/store/tabStore.ts` (renderer state in `localStorage`) | Settling an order opens a billing tab filled from the order. Tabs are **not** used to store open orders: they are per-PC and lost on another terminal. |
| Held bills | `electron/services/heldBillsService.ts`, `invoices.invoice_type = 'HOLD'` | **Not reused for open orders.** Held bills are inserted `SYNCED` (never pushed), excluded from LAN pulls (`localHostServer.ts:279`), expire after 24 h, deduct stock on hold and are recalled destructively (`is_deleted = 1`). Open table orders must be visible on every terminal, live for a whole service, and accept additions; bending `HOLD` invoices to that would change the invoice sync contract and retail behaviour. Held bills stay as they are for retail. |
| Cart + checkout | `src/store/cartStore.ts`, `src/components/billing/checkout/`, `electron/services/invoiceCheckoutService.ts` | The only path that creates the invoice, computes VAT (`utils/pricing/vat.ts`, `taxEngine.ts`), allocates the number, moves stock and posts the ledger. |
| Service lines | `CartItem.isServiceItem`, `CartServiceRow`, service totals in `cartStore.ts` | Service charge and (if chosen) add-ons are billed as service lines with the standard VAT rate, so VAT 201, receipts and the UAE invoice need no change. |
| Document hand-over | `billing/hooks/useIncomingDocuments.ts` (localStorage + window event) | Same mechanism opens "Bill table 5" in Billing. |
| Network ESC/POS printing | `electron/hardware/escPos.ts` (`sendToNetworkPrinter`, `sanitizeForEscPos`), `printer.ts` | KOT bytes go to kitchen printers (Ethernet thermal printers are the norm in UAE kitchens). |
| Feature flags | `src/config/featureFlags.ts`, `featureFlagsStore.ts` (`feature_flags` setting, synced) | New flag `restaurant_mode`, default **off**. |
| Products / categories | `products.category` | Kitchen stations route by category; menu grid groups by category. |
| Urgent sync | `syncWorker.ts` `triggerUrgent*Sync` | A `triggerUrgentRestaurantSync` after each order write so other terminals see tables within seconds. |

## 3. Order types and lifecycle

| Type | Needs | Notes |
|---|---|---|
| `DINE_IN` | a table, covers (guests), optional waiter | Table shows *occupied* while the order is open |
| `TAKEAWAY` | optional customer name / phone, a token number | Token printed on KOT and bill ("Token 17") |
| `DELIVERY` | customer phone + address, optional rider, delivery fee | Delivery fee is a service line; channel tag (`OWN`, later `TALABAT` …) recorded but not integrated |

```text
OPEN ──(send KOT, add items, void items)──► OPEN ──(Bill)──► BILLING ──(checkout ok)──► SETTLED
  │                                                │
  └──(cancel, only if no active lines or with permission + reason)──► CANCELLED      └──(back)──► OPEN
```

- `OPEN`: lines can be added; unsent lines are a draft on the terminal until **Send** (KOT). Sent lines are frozen;
  changing them is a void (§5).
- `BILLING`: a terminal has opened the order in a billing tab. Other terminals show it as "being billed" and block
  adding lines (soft lock: the terminal id and time are stored; any terminal can take it over after a confirmation).
- `SETTLED`: the checkout saved an invoice. The order stores `invoice_id`; the table becomes free.
- A printed **pro-forma / guest check** (bill preview before payment) is allowed while `OPEN`; it is not a tax
  invoice and carries no invoice number (UAE: the tax invoice is issued at payment).

## 4. Data model (new tables only)

Both SQLite (POS migration `016-restaurant.ts`) and Postgres (server tenant migration `102_restaurant.sql`).
Every table carries `tenant_id`, `created_at`, `updated_at`, `sync_status`, `is_deleted`, `row_version`, `origin`
like other synced tables (07 §7.3), and is added to `SYNCED_TABLES` with re-created outbox triggers.
Migration numbers may collide with other in-flight branches (e-invoicing); renumber at merge time.

| Table | Key columns | Written by |
|---|---|---|
| `dining_tables` | `table_id`, `label` ("T5"), `area` ("Indoor", "Terrace"), `seats`, `sort_order`, `is_active` | setup screen (`restaurant.manage`) |
| `kitchen_stations` | `station_id`, `name` ("Grill", "Juice bar"), `categories` (JSON array of `products.category`), `print_copies`, `is_default` | setup screen |
| `modifier_groups` | `group_id`, `name` ("Spice level"), `min_select`, `max_select`, `categories` / `product_ids` (JSON) | setup screen |
| `modifiers` | `modifier_id`, `group_id`, `name` ("Extra cheese"), `price` (AED, same price basis as products), `tax_rate`, `sort_order` | setup screen |
| `restaurant_orders` | `order_id`, `order_no` (§7), `order_type`, `table_id`, `covers`, `waiter_user_id`, `customer_name`, `customer_phone`, `delivery_address`, `channel`, `status`, `billing_terminal`, `billing_since`, `invoice_id`, `parent_order_id` (split), `merged_into_order_id`, `note`, `opened_by`, `opened_at`, `closed_at` | order screen |
| `restaurant_order_lines` | `line_id`, `order_id`, `product_id`, `name`, `quantity`, `unit_price`, `modifiers` (JSON `[{modifier_id,name,price}]`), `note` ("no onion"), `seat`, `kot_id`, `status` (`ACTIVE` / `VOIDED`), `void_kot_id`, `void_reason`, `voided_by`, `created_by` | order screen |
| `kot_tickets` | `kot_id`, `order_id`, `kot_no`, `kind` (`NEW` / `VOID`), `station_id`, `printed_at`, `print_error`, `kds_status` (`NEW` / `PREPARING` / `READY` / `SERVED`, forward-only), `kds_updated_at`, `created_by` | order screen, KDS |

Rules that keep multi-terminal edits safe:

- **Lines are append-only.** Sending items inserts new line rows with new ids; a quantity change is a void of the old
  line plus a new line. Two terminals adding to the same table therefore never edit the same row. The only line
  update is `ACTIVE → VOIDED` (one-way; a repeat is a no-op).
- The order header changes rarely (status, table move, waiter). Conflicts there follow the sync engine's rule
  (legacy: last push wins; outbox: version rule). Status only moves forward (`OPEN → BILLING → SETTLED`, or
  back from `BILLING` to `OPEN`); `SETTLED` / `CANCELLED` are final and win over any concurrent edit — enforced in
  the service on pull/apply as well as on local writes.
- Nothing existing gets new columns. Invoices are linked by `restaurant_orders.invoice_id`, so the **invoice sync
  payload does not change**. Reports by order type / table / waiter join through that column.

Printer targets are **device-local** (`kitchen_printer_config` setting, never synced, like `receipt_printer_config`):
`{ [station_id]: { kind: 'network', host, port } | { kind: 'system', printerName } }`, because a Windows printer
name exists only on one PC.

## 5. KOT printing

- **Send** prints one KOT per station that has lines in the batch (lines are routed by product category →
  station; unmatched categories go to the default station; a station with no printer configured on this terminal
  shows an error and the KOT stays `print_error` with a Reprint button — the order is still saved).
- KOT content (80 mm or 58 mm, large font, no prices): station, KOT no., order type, table / token, covers, waiter,
  time, then `qty × item`, modifiers indented, line note, order note. Arabic item names print when the product has
  one (coordinate with the Arabic print session; KOT text uses ESC/POS, so Arabic needs the raster path that
  session builds — v1 falls back to the Latin name).
- **Void KOT**: voiding a sent line requires `restaurant.void` (or a manager PIN through the existing biller PIN
  modal) and a reason; it prints a `VOID` ticket ("*** VOID *** 1 × Chicken shawarma") to the line's station.
  Voiding an unsent line just deletes the draft.
- **Reprint** prints `REPRINT` on the ticket.
- KOT builder is a pure function (`src/components/restaurant/kot/kotText.ts` or `electron/services/restaurantKot.ts`)
  with unit tests; printing goes through a new `printer:printKot` channel in `electron/hardware/` using
  `sendToNetworkPrinter` / the system-printer path. It never touches receipt layout code.
- Which terminal prints: the terminal that pressed Send. Network printers are reachable from every terminal.
  A USB kitchen printer is reachable only from its own PC; v1 documents "use a network printer for the kitchen"
  (a LAN print relay through the primary is a later contract change).

## 6. Modifiers / add-ons

- Groups attach to categories or products; `min_select` / `max_select` make a group required ("Spice level: pick 1")
  or optional ("Extras: up to 3"). Free modifiers (price 0) are kitchen instructions only.
- The order line stores a **snapshot** of chosen modifiers (name and price at order time).
- On billing, the cart is keyed by `product_id` (`cartStore.addItem` merges equal product ids), so lines with
  different modifier sets cannot be separate cart rows of the same product. Mapping (pure, tested,
  `restaurant/orderToCart.ts`):
  - base products: one cart line per product with the summed quantity and the order-time unit price;
  - priced modifiers: one service line per modifier (`+ Extra cheese × 3`), price and VAT rate from the modifier;
  - free modifiers and notes: not billed (they are on the KOT).
  If an order has the same product at two different order-time prices (price changed mid-service), the later price
  wins and the difference is shown before billing. This keeps checkout, receipts and VAT untouched.

## 7. Numbering

- Order / token numbers and KOT numbers are **operational, not tax documents**: per business day (store timezone,
  `storeTime.ts`), per terminal, `<terminal letter>-<n>` (e.g. `A-17`), stored in `sync_meta`/a local counter so
  terminals never collide and no network is needed. Gaps are allowed.
- The **tax invoice number** comes only from the existing allocator at checkout.

## 8. Split / merge / move / waiter

- **Move table**: changes `table_id` on an `OPEN` order (target table must be free, or the user chooses merge).
- **Merge**: lines of order B are re-parented to order A by inserting copies with new ids in A and voiding B's lines
  without a kitchen ticket (`void_reason = 'MERGED'`, no VOID KOT); B becomes `CANCELLED` with
  `merged_into_order_id = A`. Append-only rule preserved.
- **Split bill** (two ways, both produce separate invoices through normal checkout):
  - *by items*: choose lines (or part quantities) → a child order with `parent_order_id`, lines moved as above;
  - *equal split by N*: not an item split; the one invoice is paid with the existing SPLIT payment, or N invoices
    each carrying a service line "Share 1/3 of order A-17" — **needs a decision** (§13): UAE invoices should list
    the supplies, so item split is the compliant default and equal split is payment-only.
- **Waiter**: `waiter_user_id` from `users` (staff with the restaurant permission); set on open, changeable with
  `restaurant.transfer`. Settled invoices keep the waiter through the order for reports; the existing
  `sales_staff` handler field is set to the waiter at billing so current staff reports work unchanged.

## 9. Service charge and VAT (UAE)

- Under UAE VAT (Federal Decree-Law No. 8 of 2017), a service charge the restaurant adds is part of the
  consideration for the supply and is **standard-rated at 5%**. VAT is therefore computed on items + service charge.
  Prices shown to customers must include VAT; the existing `vat_price_inclusive` setting decides the basis.
- Abu Dhabi hotel / tourist outlets may also add municipality / tourism fees; small cafeterias usually charge
  none. v1 supports one configurable service charge (`restaurant_service_charge`: `{ enabled, percent, appliesTo:
  ['DINE_IN'] }`, default off) and leaves other fees for later.
- Implementation: at billing, `orderToCart` adds a service line "Service charge 10%" whose price is
  `percent × items subtotal` (on the same price basis as the items, so inclusive shops get an inclusive charge),
  VAT rate 5%. It is a normal service line: removable by a user with `sales.discount`, visible in VAT 201 as
  standard-rated supply, printed by the existing UAE invoice. The percentage rule is one pure function with tests
  (`restaurant/serviceCharge.ts`); it calls `utils/pricing/vat.ts`, it does not round VAT itself.
- India shops (`store_country = 'IN'`) can enable the mode too; the service line then uses the product GST rate
  rules already in checkout. Not a v1 target; behaviour follows existing service lines.

## 10. Multi-terminal behaviour

- All restaurant tables sync like other business tables: cloud push/pull and LAN (`LAN_PULL_TABLES`,
  `LAN_PUSH_TABLES` in `electron/sync/lanTables.ts`; `restaurant_order_lines` and `kot_tickets` are pushed with
  their order, matching the "child rows through the parent" rule there, or as their own entities — decided in the
  characterization test).
- Latency: an order write calls `triggerUrgentRestaurantSync()` (same pattern as invoices). With a LAN primary,
  secondaries see a new KOT in a few seconds; with cloud only, within the next pull (10–60 s fast poll on the
  restaurant screen, reusing the fast-pull backoff the cashier screen uses).
- Correctness does not depend on latency: lines are append-only, statuses only move forward, the billing soft lock
  is advisory, and the invoice is created once by the terminal that checks out. Two terminals billing the same
  order at the same moment is possible offline; the second checkout finds the order `SETTLED` after sync and the
  service refuses to settle twice locally (`SETTLE_CONFLICT` toast; the second invoice remains a normal invoice that
  a manager can cancel). This is the one residual risk of offline multi-terminal use and is documented in the UI.
- **Billing claim on the LAN primary.** Before a secondary opens an order for billing it calls
  `POST /api/restaurant/claim` on the primary (`localHostServer.ts`, pairing key as for every LAN route) with
  `{ order_id, terminal }`. The primary applies the claim in its own database in one transaction (only `OPEN` →
  `BILLING`, or a `BILLING` claim held by the same terminal or older than 10 minutes) and answers `{ ok }` or
  `{ ok: false, holder }`. The primary itself claims locally through the same service function. When the primary is
  unreachable the terminal claims locally and shows "offline: another terminal may bill this table". This is a new
  LAN contract: all terminals of a restaurant shop must run the same version.
- **Kitchen display (KDS)**: a full-screen view per station on any terminal (or a spare PC / TV with the POS signed
  in). It lists `kot_tickets` with their lines, oldest first, and bumps `NEW → PREPARING → READY`; the order screen
  shows ready tickets and the waiter marks them `SERVED`. Status is forward-only, so concurrent bumps from two
  screens merge. The KDS refreshes on sync events and a 5-second local poll.
- All terminals of a shop must run a restaurant-capable version before the flag is turned on (older terminals ignore
  unknown tables on pull but cannot show orders).

## 11. Permissions (POS + server, same change)

New group "Restaurant" in `src/utils/security/permissions.ts` and the same keys in
`nafid-server/src/services/permissions.ts` (`ARCHITECTURE.md` §2):

| Key | Allows |
|---|---|
| `restaurant.orders` | Open orders, add items, send KOT, print guest check |
| `restaurant.void` | Void items already sent to the kitchen, cancel an order with sent items |
| `restaurant.transfer` | Move / merge tables, split orders, change waiter |
| `restaurant.manage` | Tables, kitchen stations, modifiers, service charge settings |

Billing an order still requires the existing `sales.create*` keys; discounts `sales.discount`. Admin/owner bypass
as today. The server enforces nothing new on routes in v1 (sync routes are already authenticated per tenant); the
keys exist on the server so the user editor and JWT carry them.

## 12. Code layout and change footprint

POS (`nafid-pos`), all new unless marked:

```text
src/config/featureFlags.ts                      (edit) + restaurant_mode flag, default false
src/utils/security/permissions.ts               (edit) + Restaurant group
src/data/restaurant.ts                          restaurantApi catalog (bindBridge)
src/components/Restaurant.tsx                   screen: floor / takeaway / delivery tabs
src/components/restaurant/views/                FloorView, TableCard, OrderPanel, MenuGrid, ModifierPicker,
                                                KotHistory, SplitDialog, MoveMergeDialog
src/components/restaurant/settings/             TablesSetup, StationsSetup, ModifiersSetup, ServiceChargeSetup
src/components/restaurant/hooks/                useRestaurantOrders, useOrderDraft, useKitchenPrinters
src/components/restaurant/orderToCart.ts        order → TabSnapshot (pure, tested)
src/components/restaurant/serviceCharge.ts      service charge line (pure, tested)
src/components/restaurant/kot/kotTicket.ts      KOT lines per station (pure, tested)
src/App.tsx / navigation                        (edit, few lines) menu entry when flag + permission
billing/hooks/useIncomingDocuments.ts           (edit, small) accept a "restaurant order" hand-over
billing/checkout/*                              (edit, small) pass restaurant_order_id in the payload when the tab has one
electron/services/invoiceCheckoutService.ts     (edit, small) in the same transaction call restaurantService.markSettled
electron/db/migrations/016-restaurant.ts        tables + outbox triggers
electron/db/statements/restaurant.ts            all SQL
electron/services/restaurantService.ts          orders, lines, void, move/merge/split, settle (≤ 800 lines; split
electron/services/restaurantSetupService.ts       into setup / orders files as needed)
electron/ipc/restaurantHandlers.ts              one-line registrations; + index.ts
electron/hardware/kotPrinter.ts                 printer:printKot (ESC/POS network / system)
electron/preload.ts, src/global.d.ts            (edit) channels
electron/sync/entities/restaurantSync.ts        push/pull; syncCycle.ts (edit) calls it; lanTables.ts (edit)
tests/unit/restaurant*.test.ts                  rules + service against in-memory SQLite
tests/characterization/                         sync/LAN goldens extended in a reviewed diff
```

`BillingPage.tsx`, `views/cart/*`, `CartItemRow.tsx`, `CreateProductModal.tsx`, `quick-product/types.ts`: **no
edits planned** (another session is changing currency text there).

Server (`nafid-server`, branch `feat/restaurant-mode` in its own worktree): `src/db/migrations/tenant/102_restaurant.sql`,
`src/db/repositories/sync/restaurant.ts`, `src/routes/sync/restaurant.ts` (`pushRoute`/`pullRoute`) mounted in
`routes/sync/index.ts`, delta-pull / `changes` table lists, `services/permissions.ts`, golden master updated with
`UPDATE_GOLDEN=1` and the diff reviewed, `docs/architecture/03-sync-api.md`.

Feature flag behaviour: with `restaurant_mode` off the menu entry is hidden, the billing hand-over listener ignores
nothing because nothing sends it, checkout payloads carry no new field, and the new tables stay empty, so retail
sync bodies are byte-identical (characterization goldens prove it).

## 13. Owner decisions (3 Nov 2026)

The owner asked for the feature to be completed fully in one go. Recorded as:

| Question | Decision |
|---|---|
| v1 scope | Everything: core + modifiers, split / merge / move, waiter assignment, delivery orders |
| Kitchen output | Printed KOT **and** a kitchen display screen (KDS: tickets per station, bump to *ready*) |
| Delivery apps | Channels (`OWN`, `TALABAT`, `DELIVEROO`, `NOON`, `CAREEM`, `OTHER`) with app order reference and per-channel reporting in v1. A live API connection to an app needs that app's partner onboarding and merchant credentials, which Nafid does not hold; orders from the apps are keyed in on the POS until then |
| Terminals | Several terminals sharing tables is a requirement: append-only lines + forward-only status (§4, §10), urgent sync after every write, and a billing claim taken on the LAN primary when it is reachable (§10) |
| Equal split | Payment split on one invoice (existing SPLIT payment); item split creates separate invoices |
| Kitchen printers | Network and Windows (USB) printers, configured per terminal |

Original questions, kept for reference:

1. **v1 scope.** Proposed core: dine-in with tables, takeaway with token, KOT send / void / reprint, service charge,
   settle through normal checkout. Optional in v1: modifiers, split / merge / move + waiter, delivery orders.
2. **Kitchen output.** Print only (recommended for v1) or also a kitchen display screen.
3. **Delivery apps.** Later (record channel only) or integrate now (needs partner API access per app).
4. **Terminals per shop.** Mostly one terminal (multi-terminal works via sync, small offline double-billing risk), or
   several terminals sharing tables as a core requirement (then the LAN primary should own open orders live,
   which is a new LAN contract and more work).
5. **Equal split** (§8): payment split on one invoice (recommended, compliant) or N invoices.
6. **Kitchen printer hardware** in target shops: network (Ethernet/Wi-Fi) printers assumed; say if USB is common.

## 14. Implementation notes (v1, 3 Nov 2026)

Built as designed, with these specifics:

- **Turning it on:** Settings → Features & Modules (owner) → *Restaurant / Cafeteria Mode* (`feature_flags.restaurant_mode`, default off).
  Billing then shows a **Tables** button; the screen is `src/components/restaurant/RestaurantPage.tsx` (Tables,
  Takeaway & Delivery, Kitchen display, Reports, Setup). With the flag off nothing is shown and no restaurant sync
  request is made.
- **Order → bill:** `restaurantRules.orderToCartItems` sums each product into one cart line at the quantity-weighted
  order-time price (exact money, no "later price wins"), priced add-ons become service lines `rst-mod-<id>`, then the
  service charge (`rst-service-charge`) and delivery fee (`rst-delivery-fee`). These ids have no product row; invoice
  lines allow that (temp items). The billing tab carries `restaurantOrderId`; `db:checkout` closes the order in its own
  transaction (`restaurantOrderService.settleInTransaction`) and refuses a second bill with "Order … is already billed".
  The checkout de-duplication key includes the order id, so two identical small orders paid within 4 s both save.
- **Waiter** = a staff member (`staff_id`); it is set as the bill's sales staff, so existing staff reports include it.
- **Part voids and moves** never edit a line: the original is voided as `MOVED` (hidden, not reported as a void) and
  copies carry `moved_from_line_id`. Merge re-points the source's tickets to the target, so the kitchen display shows the
  target table.
- **Kitchen printers** are stored in `userData/kitchen-printers.json` (`electron/services/kitchenPrinterConfig.ts`), not
  in settings, so no sync path can carry a PC's printer to another PC. Network printers get ESC/POS (double height);
  Windows printers use the receipt print path (`printTextOnSystemPrinter`).
- **Numbers:** order / token and KOT numbers are `<terminal code>-<n>` per business day from the local, unsynced
  `restaurant_counters` table.
- **Sync paths** are `/api/sync/<table>` with underscores (server convention); the LAN primary serves them through its
  generic table routes (`LAN_PULL_TABLES` / `LAN_PUSH_TABLES`) plus `POST /api/restaurant/claim`.
- **Guest check** (pro-forma) prints on the receipt printer with totals from the checkout line rule; it says "This is
  not a tax invoice".
- **Arabic item names on KOT**: not in v1 (ESC/POS text is ASCII); the Arabic print work is a separate track.
- **Bill remarks:** billing retitles tabs with the reserved invoice number, so the table / token ("Table T1 · POS1-3")
  goes into the bill description and is saved as the invoice notes.
- **App test (3 Nov 2026, on a copy of a shop database, UAE / VAT-inclusive, cloud and LAN cut off):** flag on,
  tables / stations / add-ons / service charge set up, dine-in with add-on and note, routing to two stations, print
  failure kept as "Not printed", part void with VOID ticket, kitchen display to Ready (floor badge), move, merge,
  split, billing claim and reopen, settlement through checkout (VAT-010, VAT-011; report totals match), Talabat
  delivery, guest check failure message, cancel. It found one defect, fixed with a UI test
  (`restaurantBilling.ui.test.tsx`): `tabStore.updateActiveTab` filters fields by an allow-list and dropped
  `restaurantOrderId`, so checkout saved the invoice but left the order open.
- **Not done here:** live delivery-app APIs (§13), and a check on real kitchen printers / two real terminals.

## 15. India (3 Nov 2026)

Restaurant mode is not country-specific (same flag). India-specific behaviour, from a review after the UAE build:

- **GST on everything billed.** Add-ons, the service charge and the delivery fee were service lines, and service lines
  carry no tax for India shops (`checkoutLines` taxes them only in the UAE), so they were billed without GST. They are
  now ordinary taxed lines without a product row (no stock), so checkout applies CGST / SGST / IGST (or UAE VAT) like
  food. Add-on choices default to 5%; the service charge setting has its own rate (default 5%), also used for the
  delivery fee. Bill-of-Supply invoices stay untaxed as before.
- **Service charge is opt-in per bill in India.** The Central Consumer Protection Authority guidelines of 4 July 2022
  bar adding a service charge by default; the order screen shows "Add service charge (guest agreed)", unticked.
  UAE: added automatically (`restaurantRules.serviceChargeMode`).
- **Delivery apps by country:** India offers Swiggy / Zomato, the UAE Talabat / Deliveroo / Noon / Careem; both have
  Own delivery and Other (`restaurantRules.deliveryChannels`; the main process accepts all).
- Not app-tested on an India shop; covered by `restaurantRules.test.ts` (CGST / SGST amounts per line).

## 16. Screen design (3 Nov 2026, redesign)

- **Entry points:** owner dashboard card **Restaurant** (shown only with the flag; placed right after Billing when the
  shop's saved card order predates it) and the **Tables** button in the billing header. "Bill & take payment" always
  switches to Billing (`open-billing-page`), whichever way the screen was opened.
- **Layout** (`RestaurantPage.tsx`, `views/RestaurantChrome.tsx`): left navigation rail with count badges (open dine-in
  orders, takeaway / delivery orders, tickets in the kitchen), a top bar with live figures (tables free, open orders,
  ready to serve, running value) and quick Takeaway / Delivery buttons, floating status messages.
- **Floor:** area tabs, legend with counts, tiles coloured by state (free dashed, occupied blue, billing amber, food
  ready green with a pulsing badge, "Unsent" when items were added but not sent); time seated turns amber after 45 min
  and red after 90.
- **Order screen:** menu with a category rail, large tiles (price, add-on marker, count already on the order), ticket
  grouped by kitchen ticket with kitchen status chips, totals (items, service charge, delivery fee, total, tax note),
  one primary action (Send to kitchen / Bill & take payment) and labelled secondary actions (Guest check, Void, Split,
  Move or Merge, Cancel). Split bills of one table appear as Bill 1 / Bill 2 tabs.
- **Unsent items** live in `src/store/restaurantDraftStore.ts` for the app session, so leaving the order, switching
  screens or opening Billing does not drop them.
- **Takeaway & Delivery:** two-column board; cards show token, delivery-app badge in the app's colour, customer, address,
  value and kitchen progress (in the kitchen / ready for pickup).
- **Kitchen display:** dark high-contrast columns New / Preparing / Ready, large item text, one-tap action per ticket,
  ticket border amber after 10 min and red after 20, full-screen toggle for a kitchen screen.
- **Setup** has a side menu (Tables, Kitchen & printers, Add-ons, Service charge); **Reports** show summary tiles
  (sales, bills, guests, per guest, voided), quick ranges and bars per order type / app and waiter.
- Checked in the app on a data copy in dark and light themes (floor, order screen, board, kitchen display, setup,
  reports, dashboard card, bill hand-over).

### Shared reporting navigation (5 November 2026)

The restaurant rail opens the existing Sales History and Financial Report screens, respecting their permissions
and the sales-history feature flag. The restaurant workspace keeps tables, orders, kitchen and setup.
Financial Report includes the restaurant breakdown (order type/channel, waiter and voids) when restaurant mode
and reports.view are enabled, using the parent financial date range. Settled orders already use normal checkout
and invoices, so shared sales totals and Sales History include them without a second sales ledger.

### Dashboard-based workspace (5 November 2026)

The nested Restaurant workspace/rail is removed. Tables & Orders, Takeaway & Delivery and Kitchen Display
open directly from the main dashboard, with independent `dining_tables`, `takeaway_delivery`, and
`kitchen_display` module choices under the existing `restaurant_mode` capability. Existing shops with
restaurant mode enabled inherit the child pages only when those new keys are absent; explicit false wins.
Configuration lives in Settings > Tables, Kitchen & Food Orders and requires restaurant.manage.
Billing uses the existing Billing page and order handover; sales remain ordinary invoices in Sales History,
Financial Report and tax reports. No invoice, order or payment contract changes.


### Settings setup save contract

Settings setup now uses a responsive summary and four retained panes: Tables, Kitchen & printers, Add-ons and Service charge. Edits, additions, removals, active switches and printer targets remain drafts until the main Settings Save Changes action. There are no pane Save buttons or writes on blur. `useRestaurantSettingsDraft` stages stable row IDs and invokes existing `restaurantApi` methods only during the awaited save. Service charge registers separately with the same save session. Existing service validation, restaurant.manage permission, schema and sync contracts remain authoritative and unchanged. Test printing remains an explicit operation. See Settings PR #64 and the change guide for retry and partial-write semantics.


### Kitchen hardware placement

Kitchen ticket connection targets, paper width and sample printing belong in Settings > Printers & Devices > Kitchen Printers (`KitchenPrinterSettings`). Food Orders retains shared preparation-area/category routing, item extras/choices and the optional bill service charge. Device-local printer configuration registers with the main Settings save session. Test print is an explicit operation using the selected target. Save newly created kitchen stations before assigning their device printers. No schema, IPC or sync contract changes.


### Operational restaurant management

Tables > Add / Edit Tables owns table management with explicit Save tables. Kitchen > Manage Stations owns preparation-area/category routing. These entity editors are outside Settings, reuse the draft persistence hook and existing restaurant.manage permission/data APIs. The legacy setup event opens Tables. Settings no longer lists restaurant setup. New order items, including extras, come from Inventory with their own product, price and tax identity. Item selection opens quantity/note options without legacy modifier groups; existing order modifiers are preserved. A configured service charge is opt-in per order rather than selected automatically. Printer connections remain in Printers & Devices. No schema or sync contract changes.


Tables navigation now separates Orders & seating from the Tables entity page. `restaurant/views/TablesManager.tsx` owns searchable rows, Add Table/Edit forms and confirmed deletion through restaurantApi. It refreshes saved rows without navigating away. No batch setup form or page-wide Save tables action is used on this page. The main-process occupied-table deletion check remains authoritative. These entity actions are outside Settings; the Settings single-save rule remains unchanged. Regression: tablesManager.ui.test.tsx.


Tables entity list uses the full available content width with responsive page padding. Bulk Add Tables remains available alongside Add Table regardless of row count. `BulkTablesDialog` creates at most 200 numbered tables, skips existing names, and retains successful IDs/names across partial-failure retries. It refreshes the list after attempted writes and reports partial failures; batch creation is not atomic. Tests: tablesManager.ui.test.tsx.


OrderDetailsDialog awaits create/update results, locks duplicate submission and dismissal while saving, and retains entered fields on failure. Parent screens close only on confirmed success and refresh order rows. Customer identity is editable for dine-in as well as takeaway/delivery. Previously assigned staff names survive unavailable staff-directory entries. Billing-claimed orders require reopening before editing. Existing update API and persistence contracts are unchanged. Regression: orderDetailsDialog.ui.test.tsx.
