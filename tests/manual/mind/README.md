# Isolated Mind UI acceptance

Run from this POS worktree:

```powershell
npm exec vite -- --config tests/manual/mind/vite.config.mts
```

Open `http://localhost:5187/tests/manual/mind/index.html` in a dedicated tab.
The current development session overrides the port to 5188.
This mounts the production AiAssistant, composer, message renderer, chat storage,
conversation resolver and local handlers. Only identity and the typed data
transport are replaced. The production Vite configuration never loads these
fixtures. No shop database, account, backend or LLM is used.

## Current sample records (UAE / AED)

- Today: two invoices, cash 1,000 + card 500; VAT 71.43; discounts 25.
- Expenses: Tea 30 + Travel 20. Customer-labelled cash receipt 100; owner deposit
  90. Drawer: opening 200 + cash sales 1,000 + cash-in 190 - cash-out 50 = 1,340.
- Products: Rice stock 2 / price 50 / cost 30, Tea stock 0 / price 25 / cost 15,
  Cable stock 3 / price 40 / cost 50. Rice expires today; Cable yesterday.
- Product sales: Rice 20 units / 1,000, Tea 20 / 500, only in today's period.
- Customer Ravi: receivable 300, overdue 300, loyalty 25. Supplier debt 500,
  supplier advance 200, dual supplier/customer payable 50.
- Purchase credit bill 150, card return 50, deleted invoice 75.
- Previous closed drawer: expected 1,200, counted 1,190. Today's cash uncounted.
- Yesterday's invoice query returns a genuine empty array.

## Acceptance protocol

Use the real composer: type each question, send, and inspect the displayed answer,
its date/scope, totals, tables, chart units and follow-up options. Do not count
parser calls, script results, retries or duplicated questions toward UI coverage.
The independent corpus `tests/unit/fixtures/mindMerchantScenarios.ts` contains
504 full merchant questions: English, Malayalam and Manglish variants across
84 scenarios. Automated parser tests supplement these UI checks.

1. Ask `ഇന്ന് എത്ര കിട്ടി?` or `today collection?`. Require metric clarification.
   Select `2` or `രണ്ടാമത്തേത്`: cash sales 1,000, not drawer cash 1,340.
2. Reload, then ask `ഇന്നലെ`: retain cash sales, change period, show zero.
3. Ask `how much did we get`, select cash, then give a period: require the
   missing period before querying. A new chat must not reuse that context.
4. Ask `Show price of Demo`, `Show stock of Demo`, `Show barcode of Demo`.
   Require product choices; `2` after the barcode question selects Tea / 629000000002.
5. Ask supplier payable/receivable and customer payable/receivable directions.
   Verify 550 / 200 / 50 / 300 separately; never net advances into debt.
6. Ask overdue customers and Ravi loyalty: 300 overdue and 25 points.
7. Ask reconciliation: no counted cash means unknown difference, not a shortage.
   History must read actual drawer rows, not say it checked them without data.
8. Ask customer payments: only labelled receipts 100, not cash-in 190. Check
   the explicit limitation concerning linked party-ledger/other-method receipts.
9. Toggle **Simulate data read failure**, ask sales/stock/balances/loyalty.
   Require a read error, never a successful zero. Disable it and retry.
10. Toggle **Simulate missing drawer**, ask current cash: no confirmed balance
    and no invented open drawer. Disable after the check.
11. Ask UAE VAT/TRN/FAF/e-invoice, product/customer/supplier, billing, printer,
    settings, update and LAN workflow questions. Verify correct screen guidance
    without claims to have saved, filed, refunded, connected or updated anything.

UI attempts and replies for this development session are stored outside the repo
in `mind-ui-transcript.json` under the session's visualization directory. The
fixture evolved during testing; earlier attempts have earlier expected amounts.
Failures and retries remain in the transcript rather than being hidden.

These checks cover the actual renderer with sample transport. Installed Electron,
real-shop permissions, sync freshness and real SQLite data remain separate desktop
acceptance; this page must never be presented as live-shop verification.
