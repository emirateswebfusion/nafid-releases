# Scan & Go (customer carts)

Customers of a shop scan items on their phone (Nafid mobile app, customer role) and send the cart to the counter. The
cashier opens it in a normal bill and takes payment. Added 15–16 November 2026.

## Flow

```text
phone (customer)                    nafid-server                          POS cash register / staff phone
scan shop QR ──GET /scan-go/shops/:code/catalogue──▶ products + server prices
scan items, "Send to counter" ──POST /scan-go/shops/:code/carts──▶ PENDING cart, ticket code + QR
ticket screen polls ◀──GET …/carts/:id──                           ◀──GET /api/customer-carts── "Carts" (count)
                                                                   ──POST …/:id/claim──▶ CLAIMED (who has it)
                                                                   bill opens in its own tab (scanGoCartId)
                                                                   normal checkout: invoice, stock, cash, loyalty
                                                                   ──POST …/:id/complete {invoice_id}──▶ COMPLETED
```

Rules:

- **A cart is not a sale.** It lives only in the server table `scan_go_carts` (tenant migration 105). It moves no stock
  and no cash, has no invoice number and never appears in reports. Only the POS (or staff app) checkout creates the
  invoice, with the normal rules (pricing from local products, tax, offers, rounding, loyalty, cash drawer).
- **Statuses:** `PENDING → CLAIMED → COMPLETED | REJECTED`; `CLAIMED → PENDING` (Put back, restarts the timer);
  `PENDING → EXPIRED` after 30 minutes (`CART_TTL_MINUTES`); `PENDING → CANCELLED` by the customer. Claimed carts never
  expire on the timer. Every transition is conditional; a claimed cart can only be released, rejected or completed by its cashier.
- **Prices:** the server prices each line at sending (`offer_price` if set, else `base_price`, at the shop's money
  scale) so the phone shows a fair estimate; phone prices are ignored. The bill at the counter is final.
- **Loyalty:** the server links the cart to the shop's customer record by the last 10 phone digits. The POS puts that
  record's phone (else the sign-in number) and name on the bill, so the existing loyalty auto-match and checkout credit
  the points. No loyalty rule was added.
- **Online only.** Carts are read over HTTP (`src/data/cloud/scanGo.ts`), never synced to SQLite, so no sync or LAN
  payload changed. If completing the cart fails after a saved sale, the completion is kept in `localStorage`
  (`scanGoPendingCompletions:<tenant>`) before sending and retried on each queue refresh. Overlapping refreshes preserve new confirmations, and only server-confirmed work is removed; the sale is never undone.
- **Shop QR:** `nafid://scan-go?shop=<code>` where `<code>` is a random public code (central table `scan_go_shops`,
  migration 096), never the tenant id. Only a shop whose owner turned Scan & Go on answers customer requests. Turning it
  on/off is a draft in Settings → Scan & Go (`PUT /api/customer-carts/config`), persisted only by the main Save Changes action.
- **Ticket QR:** `nafid://scan-go-ticket?code=<4 chars>`; the panel's search box accepts the typed code or a scan.
- **Permission:** the counter endpoints need `sales.create` (existing key; no permission contract change).

Reopening a cart switches to its existing bill without replacing cashier edits. Handovers and completion queues are tenant-scoped.

## POS code

| Piece | File |
|---|---|
| Cloud calls | `src/data/cloud/scanGo.ts` |
| Rules (cart → bill lines from local products, loyalty phone, ticket input) | `src/components/scanGo/scanGoRules.ts` |
| Bill handover (own tab with `scanGoCartId`) and completion retry | `src/components/scanGo/scanGoBillHandover.ts` (mounted from `useIncomingDocuments`) |
| Queue state, polling every 20 s | `src/components/scanGo/useCustomerCarts.ts` |
| Header button + panel | `CustomerCartsButton.tsx`, `CustomerCartsPanel.tsx` (button in `BillingHeader`) |
| Checkout hook | `checkoutHandler.ts`: after a saved new sale, `completeScanGoCart(tab.scanGoCartId, invoice_id, number)` |

A cart line whose product is not on this PC (not synced yet, deleted) blocks opening the cart: the counter never
guesses a price or tax. Tests: `tests/unit/scanGoRules.test.ts` (POS), `nafid-server/tests/scanGo.test.ts` and the
`scanGo` / `customerCarts` golden masters (server).

## Release

Server: additive endpoints and migrations at the same API URL; installed POS versions are unaffected (backend checklist
step 1: backward-compatible). The Carts panel ships with the next validated POS release; mobile screens ship with the
next app build. Deploy the server first.
