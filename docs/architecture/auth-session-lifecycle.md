# Authentication and cloud-session lifecycle

POS access, a terminal cloud credential, a network connection and completed data synchronization are separate states.
The main process owns stored credentials and sync activation; renderer state must not infer cloud readiness from a
successful PIN/password check or from `navigator.onLine`.

## Platform administration boundary

Desktop POS permits shop sessions only. Central SUPER_ADMIN login and administration belong to the web portal.
`electron/utils/desktopSessionPolicy.ts` rejects platform roles, SYSTEM tenancy and central JWT claims before token/offline-session writes.
`localAuthService` rejects cached platform passwords and platform staff PINs before persisting access; never downgrade SUPER_ADMIN to shop ADMIN.
Renderer online/offline/startup checks remain a second boundary. JWT decoding here only rejects sessions and never grants permission.
Regression coverage: `quickPinLogin` platform password/PIN/persistence cases; portal route and report role tests.

## Ownership and transitions

| Action | Local access | Cloud behavior |
|---|---|---|
| Online email/password login | Server identity and permissions after token save succeeds | Desktop `authCloud.login` → `authApi.loginCloud` → `auth:loginCloud` → `cloudLoginService`; main calls the configured `/auth/login` |
| Cached password or Quick PIN login | Validated local identity, persisted in `offline-auth.enc` | Preserve a usable same-tenant terminal token; otherwise remain paused. Both return `cloud_sync_ready`; local success alone is insufficient |
| Logout | Clear persisted sessions before clearing the cart/UI identity | Stop sync before attempting file cleanup; failure preserves work and shows the shared `AuthErrorToast` for retry |
| Cloud reconnect | Keep local identity, permissions and open bills | Closable `SessionExpiredModal` → `cloudSyncRecovery` → `auth:resumeCloudSession`; reject another shop or stale local identity |
| Restart | Restore local identity independently | Check the same tenant's terminal credential without adopting an owner's JWT into the cashier session |
| Cloud rejection | Keep offline access | Match 401 to the request token before pausing; stale responses cannot reject replacement credentials |

The renderer login generation invalidates older online/PIN/startup results after logout or another login starts.
Late results must not save credentials, restore a signed-out session or reset the current user's cart. IPC persistence
remains synchronous in main; cloud reconnect separately checks the expected current local user/tenant. The check uses
the persisted offline session, falling back to the cloud auth record, just as startup does. The remembered terminal
session is display context only: missing or stale context must not block recovery, and context alone after logout
must never authorize it. Regression coverage: `quickPinLogin` (restored sessions and signed-out recovery).

## Desktop login transport

Only the email/password pair crosses `auth:loginCloud`. The renderer cannot choose a destination: main uses the
same configured API precedence as sync (`VENDORA_CLOUD_API`, then `NAFID_CLOUD_API`, then `VITE_CLOUD_API`). The
service allows HTTPS and loopback HTTP development endpoints, rejects embedded credentials and follows no
redirects. Requests time out after 15 seconds. It returns an HTTP status and parsed JSON body, or a sanitized network
error. Its `success` flag means transport completed, not that the password was accepted; renderer `Response.ok` and
the login response validation still decide authentication. Browser/older-bridge surfaces keep the existing HTTP path.
Server CORS settings are not weakened and no generic URL-fetch proxy is exposed. Passwords/tokens are not logged.

## Credential persistence and truthful status

`authStorage` is the canonical auth-file reader for services and sync. Both try the encrypted representation and
the existing `config.json` fallback consistently; malformed/unreadable files cannot make the UI and worker select
different sessions. No new credential format or database migration is introduced.

Quick PIN must never rewrite cloud-account metadata with the cashier identity or feed that mixed record back to
`localSaveUser`: its email lookup can otherwise replace the owner's cached user ID, role and permissions. Keep the
cloud record byte-for-byte unchanged; write the cashier's local session separately. Cached-password entry uses the
same preservation/activation decision as PIN entry. A worker-rejected credential stays paused until online recovery.

The dashboard starts with an unknown/offline route. Its badges say **Cloud Connected** / **Wi-Fi Connected**, not
**Synced**: a connection event is not proof that every pending record uploaded. Dashboard event subscriptions are
released on session changes/unmount. `runInitialSync` reports disabled access, rejected authorization and unavailable
routes as failures; a successful cycle result still does not guarantee an empty pending queue or conflict resolution.

The Re-Login Needed action uses the shared native Button so keyboard users can focus and activate recovery;
passive connection statuses disable the action. Regression: `dashboardConnection.ui`.

Architecture recheck: corrected the former clickable-div recovery action and stale offline-login/PIN recovery
ownership descriptions. All 225 test files / 1,295 tests passed with two workers; app/Electron typechecks,
architecture guard and zero-warning lint passed. The default-concurrency run had five timeouts, all passing on
controlled reruns without relaxing thresholds. BrowserOS isolated-fixture acceptance focused the header button and
opened cloud recovery with Enter. No main-process, IPC or cloud/LAN wire contract changed in this recheck.

The authenticated shell (`useSyncStatus`) owns the online-status subscription and updates the in-memory
`syncConnectionStore`. Dashboard reads this state rather than starting Offline on each mount. Leaving for Sales
History must retain the last worker-reported route; events received while Dashboard is closed still update it.
Logout clears the route and unsubscribes. No route is persisted across sessions and no connection is inferred from
login success. `dashboardConnectionNavigation.ui` covers reopening, background disconnection and logout cleanup.
Navigation-fix verification: 209 test files / 1,232 tests passed, app/Electron typechecks, architecture guard and
zero-warning lint passed. The running isolated Electron fixture retained Cloud Connected after leaving/returning,
and showed Offline after a connection-loss event received while Dashboard was unmounted. This renderer fix does
not change the sync transport or establish that every pending upload is complete.

## Reproduced findings and limits

Regression tests reproduced the mixed owner/cashier credential rewrite, false-ready PIN state with no cloud token,
cached-password entry stopping a valid terminal cloud session, late login results undoing logout, ignored sign-out
storage failures, inconsistent malformed-auth fallback and leaked dashboard listeners. These are code defects,
not a claim that every defect occurred on the reported customer's PC.

Public production probes on 6 November 2026 (no customer credentials) distinguished a literal `Origin: null`
request rejected by the deployed API from a request with no Origin header. An isolated Electron file-window here
successfully reached the empty-login validation route, so the customer's original network failure was not reproduced
exactly. The dedicated main login path removes that renderer-origin dependency; it does not establish that CORS was
the customer's sole cause. A previous **Cloud Synced** badge likewise was not proof of completed uploads.

Subsequent customer logs and the reconnect screenshot established a separate, concrete hosting failure: repeated
HTTP 402 / `DEPLOYMENT_DISABLED`. The v2.2.49 release workflows selected the retired `nafid-eta.vercel.app`
endpoint, which reproduced that response; the owner confirmed `nafid.vercel.app` as the replacement production
backend, whose health probe returned 200. Changing backend hosting does not rewrite renderer build-time URLs or
the installed `resources/app.env`. See [release validation](release-validation.md) for the corrected configuration,
mandatory endpoint checks and the need for a new validated installer. Earlier session fixes cannot restore a disabled
cloud deployment by themselves.

## Verification

Relevant suites: `quickPinLogin`, `pinSessionReadiness.ui`, `cloudLoginService`, `cloudLoginBridge.ui`,
`authStorageConsistency`, `authSessionRace.ui`, `authErrorToast.ui`, `dashboardConnection.ui`, `cloudRelogin.ui`,
`cloudSyncRecovery.ui`, `cloudSyncDialog.ui`, `restoredCloudSession.ui`, `sessionUnauthorized.ui`,
`syncReauthentication` and `syncResumeTimer`. Main-process changes also use IPC equivalence and the sync login,
no-login and LAN characterization harnesses. UI acceptance uses the isolated `tests/fixtures/cloudRecovery.html`
fixture with synthetic accounts and no external network. Source verification is not installer/release validation.

6 November 2026 verification: 204 unit/UI test files, 1,185 tests passed; app/Electron typechecks, architecture
guard and lint ratchet passed (zero errors/warnings). The main IPC replay compared 2,005 existing calls with no
unexplained differences: the additive offline-session `cloud_sync_ready` result is intentional and the new login
channel adds eight validation calls. Two customer `row_version` differences were also reproduced between unchanged
baseline replays (6/10 versus 5/9); only those counters and checkout/device randomness were normalized. Cloud sync
characterization compared 47 calls and no-login compared six, both without differences. The paired LAN check
retained its key, accepted valid credentials, rejected missing/wrong keys and completed a sync cycle.

The running Electron fixture also exercised unavailable-cloud error display, closing to continue offline, successful
reconnect through the desktop login adapter, unchanged cashier/open-bill display, Offline before a connection event,
Cloud Connected after that event and the shared sign-out-error toast. Its cloud responses and credentials are synthetic.
