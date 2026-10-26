# ADR 0002 — One tested implementation per business rule

- Status: accepted (22 Oct 2026)
- Scope: `nafid-pos` (renderer rules), cross-app rules shared with `nafid-server`

## Context

The line-pricing rule (grade rate → catalog offer → ad-hoc discount, inverted for scrap) was copy-pasted about eleven times
across `BillingPage`, `BillingCartView` and `cartStore`, with small variations. `formatCurrency` had fourteen local copies,
the scrap/return credit lookup existed three times, and a 357-line deduction editor was duplicated in two panels.
Fixing a bug in one copy left the others wrong — the root cause of "a fix here breaks something there".

## Decision

- Money, pricing, tax, numbering and permission rules live in `src/utils/<topic>.ts` (or a feature use-case module) with
  unit tests: `linePricing.ts`, `checkoutLines.ts`, `money.ts`, `invoiceNumberHelper.ts`, `components/billing/deductionLookup.ts`.
- Consolidations must prove equivalence: `linePricing.test.ts` compares the new rule with the legacy expression on 5,000
  random inputs bit-for-bit.
- Intentional behaviour changes are called out in the change description and tested:
  money formatting now places the sign before the symbol (`-₹50.00`), and a deduction search without digits no longer
  matches an arbitrary pending scrap credit.

## Consequences

- New code must import the canonical module; reviews reject inline re-implementations.
- Remaining inline copies (display-only tax splits in some screens) are listed in `04-business-rules.md` and are
  consolidated when touched.
