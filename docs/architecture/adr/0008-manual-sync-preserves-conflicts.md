# 0008 — Manual sync preserves financial conflicts

Status: accepted for implementation; installed-client delivery requires release validation.

Users need a bounded explicit retry when automatic sync leaves work pending. A second upload engine or unconditional
local-wins could overwrite another terminal's financial changes; clearing queue flags could conceal missing cloud data.

Use one native ADMIN/OWNER operation that joins the existing serialized engine, checks the active cloud session and
saved routing policy, and preserves every original outbox identity/payload/base. Permit one extra attempt for recognized
transport failures and unchanged strict account probes. Financial writers remain responsible for exact duplicate receipts
and conflict rejection. Real divergence uses scoped source recovery with durable backups; [ADR0009](0009-shop-confirmed-background-account-recovery.md)
adds an explicit own-shop source-confirmation path without granting platform lifecycle access.

Guard legacy acknowledgements against edits made during upload; deny arbitrary pending clears. Report waiting/review
honestly. A completed local queue check is not proof of complete cloud equality. See [manual-sync.md](../manual-sync.md)
for ownership, compatibility, verification and delivery boundaries.
