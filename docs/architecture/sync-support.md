# Platform sync support reports

## Ownership and access

Shop ADMIN belongs to the customer. Only platform SUPER_ADMIN reads developer diagnostics in the Central Web Portal at `/super-dashboard/sync-support`.
The desktop POS contains no platform administration pages or platform configuration clients. Shop Settings has no support panel and billing/dashboard has no unsolicited conflict-count toast.
The normal footer says Last checked, not a guarantee that every upload succeeded. Unresolved cycles never show success.

`POST /support/sync-reports` accepts authenticated ADMIN/OWNER/STAFF terminal reports. The server derives tenant identity
from the JWT, never from the request body. `GET /support/sync-reports` requires SUPER_ADMIN and joins the shop name from
central tenants, returning at most 500 latest terminal snapshots. POST does not grant access to any reports.

Central migration097 stores one snapshot per tenant/terminal with server received_at. The snapshot contains POS version,
platform, observed timestamp, active route, pending-account/active-conflict/incomplete-download counts and up to 100
pending/failed account metadata rows: entity, record ID, status, logical version, captured base and updated timestamp.
No customer/party names, amounts, credentials, arbitrary log text or raw errors are uploaded. Codes are BASE_REQUIRED,
PARENT_UNAVAILABLE, CLOUD_REVISION_CONFLICT, WAITING_UPLOAD and UPLOAD_FAILED. Missing captured base is not proof that a user's edit is wrong; preserve it.

POS `electron/sync/supportReport.ts` reads data-layer queries after cycle completion, respects effective cloud access,
limits attempts to once per minute and one request at a time, times out after ten seconds, and never blocks or changes
business sync acknowledgement. Failed report requests are retried by later cycles. No report from an old/offline client
is not evidence of health. Received time is server-assigned; observed time is untrusted client metadata. A new snapshot
with zero counts shows the terminal's latest observation, not a repair action or proof that old missing data was recovered.

## Diagnosis and correction

The developer page groups reports by authoritative shop/terminal identity and offers shop/terminal search and explicit
refresh. Record metadata is read-only. No force overwrite, delete, conflict acknowledgement or financial repair button
exists. Compare identified records and captured baselines with actual scoped cloud data before choosing a resolution.
Old support markers for synced/absent rows no longer count as active conflicts, but remain retained for investigation.
Do not choose winners by time, phone, equal amount or a larger counter. There is no automatic historical repair.

## Implementation and deployment

Server: routes/syncSupport -> services/syncSupport validation -> db/repositories/syncSupport central queries.
POS: sync/supportReport -> db/statements/sync/supportReport (background reporting only).
Web: PortalApp SUPER_ADMIN route -> SyncSupportPage -> lib/syncSupport -> existing server GET.
The web portal owns tenant administration, managed GSP and platform card-provider configuration; shops retain their own setup screens.
Deploy migration097 and server routes before distributing an updated validated POS installer. Existing clients continue
business sync but cannot populate this new page until updated. No existing sync wire fields/schema or endpoint URL change.
A blank report list must say no reports received, not no problems. No live shop conclusions can be drawn before reports arrive.

Coverage: server syncSupport role/tenant/sanitization/bounds tests and route golden; web syncSupport role/identity UI; POS native password/PIN/session rejection,
syncSupportReport upload/throttle/cloud-access/privacy, active-account conflict and footer regression tests.
