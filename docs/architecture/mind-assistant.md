# Desktop Mind conversation ownership

Desktop queries use `processOfflineAiQuery` directly through `useAiChatActions`.
There is no cloud fallback, LLM, API key or paid inference dependency in this flow.
The existing cloud adapter remains available to its independent callers; server
and browser contracts are unchanged. Local records describe this terminal's
available data, not a guaranteed up-to-date aggregate of every shop terminal.

`offlineAi/conversation.ts` owns conversational clarification before the existing
intent rules and data handlers. It resolves only the immediately preceding
assistant's `parsedIntent` metadata in the current, tenant/user-scoped chat.
The metadata and ordered choice queries persist with messages. Old saved chats
without metadata ask for clarification instead of deriving context from prose.
Changing chats or tenants cannot supply another conversation's context.

Ambiguous money requests ask which metric is intended. Cash sales, collections
of old debts and current drawer cash are distinct; the resolver never equates
them. Missing periods can be asked in a second turn. Bare period follow-ups
retain a known report instead of becoming sales comparisons. Unknown questions
and isolated dates do not default to today's sales. Names/barcodes can complete
pending stock, party-ledger and product-invoice questions. Complete new questions
replace pending clarification. This is bounded rule-based language support,
not unrestricted natural-language understanding or automatic model training.

Data-fetch exceptions propagate to the service's error response rather than
becoming a successful empty result. The summary adapter may still recover from
a failed aggregate query by reading actual invoices. An empty successful query
remains a genuine zero. Existing calculation modules and IPC contracts are used.

Validation: `mindConversation.test.ts`, `mindDataAvailability.test.ts`, the 613-query
offline characterization snapshot, and `tests/manual/mind/README.md` for the
isolated production-renderer UI. Snapshot changes intentionally replace unknown
and keyword-only sales fallbacks with clarification, and correct period precedence.

## Report ownership and safeguards

- `merchantLanguage.ts` owns shared multilingual vocabulary and name/period slots;
  `merchantRules.ts` composes them with specific financial meanings first.
  `workflowGuides.ts` owns read-only screen instructions, not write operations.
- `productSelection.ts` asks for a product when partial matches are ambiguous.
  Choices carry full ordinary questions in persisted parsedIntent metadata.
- `catalogPrice.ts` adapts catalog fields to canonical listRate/resolveLinePrice.
  Charts use `chartValues.ts` to distinguish money from counts and quantities.
- `handlers/productExpiry.ts` reads domain_attributes expiry dates, validates
  date-only labels and compares them against the shop calendar day. Today and
  day 30 are included; expired items are separate; zero-stock items are excluded.
- Supplier/customer balance projections use canonical hasPartyRole and signed
  current_balance, including dual roles. Advances do not become supplier debt.
  Overdue reports use customer overdue metadata rather than all receivables.
- Cancelled invoices read the recycle-bin adapter (soft-deleted POS invoices only).
  Non-selling stock reads product movement for the requested period and reports
  current stock. Credit purchase bills show saved bill values, not invented
  remaining invoice allocations. Drawer history reads the latest ten records.
- Missing counted cash or a missing drawer never fabricates a reconciliation or
  opening balance. Daily business totals do not claim cashflow or profit.
- Customer collections currently report only cash-in records explicitly labelled
  Customer Payment. The response discloses that linked party-ledger receipts and
  other payment methods are not a complete part of that total.

## Acceptance evidence — 10 November 2026

The production renderer was exercised through its actual composer and displayed
answers in a dedicated BrowserOS tab. The independently authored 504-question
merchant corpus was completed in English, Malayalam and Manglish; extra questions
covered errors, directional debt, ambiguous products and dates. More than 500
unique UI questions were inspected. Failed attempts and corrected UI retries are
retained in the external session transcript; retries and automated tests are not
counted as unique UI questions. The sample transport evolved during the session.
See `tests/manual/mind/README.md` for the current fixture and repeatable protocol.

Regression coverage includes `mindMerchantAcceptance`, `mindConversation`,
`mindDataAvailability`, `mindReportCorrectness`, loyalty feature gates and the
613-query legacy characterization snapshot. Snapshot differences intentionally
replace unknown/default-sales answers with clarification, correct report periods,
read real report data and remove fabricated zero/placeholder conclusions.

No installed shop account/database, source checkout's existing edits, backend,
installer, release or update feed was modified. Installed Electron and live-shop
acceptance remain distinct from this sample-data renderer test. Work remains
uncommitted on `feat/mind-language-rules` in the separate `nafid-pos-mind` worktree.

Final session verification: 527 unique UI questions / 614 attempts. The full suite
passed 1,901 tests (zero failures) before the final small loyalty-name follow-up
rule. The subsequent final focused run passed 580 tests, including that follow-up,
the 504-question corpus and the updated 613-query characterization. Renderer and
Electron typechecks and the architecture guard passed. The external transcript
records the exact sequence, fixture changes, failures, retries and limitations.
Lint ratchet passed with zero errors and zero warnings; no baselines were raised.
