# 0007 — Source-terminal recovery without remote desktop

Status: implementation, validation and rollout in progress. See the [shared recovery contract](../account-recovery.md) and paired server ADR0004.

Owner-confirmed source authority is represented by an explicit tenant/terminal/identity job rather than global local-wins synchronization. Keep both cloud and source snapshots and use canonical server writers with exact receipts; never repair by deleting a shop database, force restarting billing, accepting stale timestamps as authority or replacing newer local edits.

Directives travel through the existing background metadata report response and execute in the serialized CLOUD cycle of a validated new desktop release. Only the platform console manages lifecycle. Normal sync contracts, shop permissions, renderer behavior and update consent/installation behavior stay unchanged. Failed safety checks retain data and developer-visible status instead of claiming success.
