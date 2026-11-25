# 0009 — Shop-confirmed background account recovery

Status: accepted for bounded pending-account implementation; unshipped. Full database replacement is not implemented.

The owner identifies the correct shop computer but remote desktop is unavailable. Permit the native shop administrator
to explicitly confirm that source and enqueue a durable request, rather than awaiting HTTP/financial repair in billing UI.
Require an online local file backup, immutable selected source/queue backup and durable cloud before-images. Reuse existing
canonical account recovery and exact receipts, with strict tenant/role checks and per-tenant source-request serialization.

This extends ADR0008's platform-only source-selection restriction for this explicit own-shop request only. Platform jobs
and all developer diagnostics remain in Super Admin. It does not introduce whole-shop SQL overwrite, inferred deletion,
unbounded scope, automatic acceptance of later cloud edits or a perpetual sync guarantee. See the
[canonical flow](../source-confirmed-recovery.md) for operational limits, retention, review and release requirements.
