# nafid-pos — repository agent instructions

Read `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/architecture/README.md` and
`docs/architecture/06-change-guide.md` before changing this repository. When present, read the workspace
`../ARCHITECTURE.md` and `../AGENTS.md` first; their system and cross-app rules still apply.

## Mandatory documentation gate

For every change, identify and review the owning architecture sections before coding. Update all affected canonical
rules, flows, module ownership, contracts, schema, permissions, recovery/compatibility and verification/delivery status
in the same change. This includes bug fixes and refactors, even when no new layer is added. Coordinate counterpart app
docs for shared behavior; update maps/change guides, indexes and ADRs when affected. Correct stale statements directly.
A release note, chat summary or audit report alone does not satisfy this requirement.

Do not mark work complete, hand it off as complete, merge or release with required documentation outstanding.
Final handoffs and PRs must name updated files/sections and checks. Only a truly documentation-neutral change may omit
canonical edits: record exact sections reviewed and a specific reason their behavior/structure remains accurate.
Unexplained "N/A", "minor fix" and "docs unchanged" are not evidence. Follow the mandatory documentation review in
`CONTRIBUTING.md` and the repository PR template. This is an agent/review obligation, not semantic prose validation by CI.
Do not commit unless the user explicitly authorizes it; documentation work does not create that authorization.
