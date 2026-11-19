# Mandatory POS release validation

This is the canonical release gate for Nafid POS. It applies to every agent, developer, build machine and CI release path. Passing source tests, CI, or `electron-builder` is necessary but does not prove that the installer is complete. Record the artifact checks below before publication; this document does not claim that existing source guards automate them.

## 1. Release identity and build environment

- Build a clean, reviewed source tree that passed `verify` and `lint:ratchet`. Record its commit and version. Exclude unrelated uncommitted work. The source tag must identify the exact shipped tree; rebuild if source or build settings change after validation.
- Each release worktree must have its own writable `node_modules`. Share the package-manager download store, not a dependency-directory junction: package-manager/packager operations can rewrite links to an ephemeral worktree and break the original checkout when it is removed.
- Supply the approved production settings before both renderer compilation and packaging. Do not package with missing, blank, development, localhost, or placeholder cloud URLs. Renderer build-time settings and main-process runtime settings must agree.
- The approved backend is `https://nafid.vercel.app`, owned by `PRODUCTION_CLOUD_API` in `scripts/runtime-env.cjs`.
  `validateProductionCloudEnv` blocks packaging and final Windows/Mac artifact validation when either cloud key differs.
  Both release workflows must supply this address (`runtimeEnv.test.ts` checks them). A backend-account migration must
  update the renderer build environment, packaged `resources/app.env`, workflows and this approval together; changing
  only backend hosting settings cannot change an already-installed app. Before release, probe the approved `/health`
  and verify login availability without customer credentials. A healthy unrelated hostname is not release evidence.
- Keep credentials on the build machine. `scripts/runtime-env.cjs` owns the public runtime allow-list; do not expand it to include tokens or signing secrets. Preserve configured signing credentials instead of erasing them.

## Platform scope

The EXE/blockmap/`latest.yml` checks below are the Windows gate. Mac releases additionally follow [macOS distribution](macos-distribution.md): native Intel and Apple Silicon DMG/ZIP validation, trusted Developer ID signing, notarization/Gatekeeper checks, same-source reports and one combined `latest-mac.yml`. Ad-hoc CI artifacts are test-only and must not become public production downloads. Neither a GitHub Verified badge nor Marketplace publisher verification replaces OS code signing.

## Backend changes and endpoint migrations

This checklist is mandatory after a backend deployment/account/URL change and before releasing a POS update.

1. **Classify the change.** A backward-compatible server-only fix at the same URL does not require reinstalling POS.
   Keep deployed API/schema contracts compatible with installed clients. A changed client contract or embedded API
   URL requires a newly versioned POS build; changing hosting/dashboard settings cannot rewrite installed clients.
2. **Confirm the destination.** Record the approved production hostname and verify that it serves the intended
   central/tenant databases, account identities and authentication configuration. A 200 health response alone does
   not prove that this is the same shop's backend. Never switch hosts just because an unrelated host is healthy.
   Never delete a shop's local database as an endpoint-migration procedure.
3. **Update every build input together.** Change `PRODUCTION_CLOUD_API` / its validation in `scripts/runtime-env.cjs`,
   both platform workflows' `VITE_CLOUD_API` and `VENDORA_CLOUD_API`, the build machine's private production env,
   and endpoint regression tests. Verify renderer compilation, packaged `resources/app.env` and any network-origin
   allow-list/CORS configuration agree. Do not commit env files or credentials. Changing only a developer's local
   production env is insufficient when CI supplies its own environment.
4. **Probe before packaging.** Test the approved health route and credential-free login validation, then use an
   authorized synthetic test account/tenant for authentication and representative sync checks when needed. Record
   statuses without customer passwords/tokens. Treat HTTP 401 authorization separately from HTTP 402 /
   `DEPLOYMENT_DISABLED` hosting failures; repeated password entry cannot restore a disabled deployment.
5. **Keep update discovery independent.** Cloud login/sync use the API URL; app updates use the public GitHub feed
   in `app-update.yml` / `UPDATES_REPO_URL`. An API-host migration does not by itself require changing that feed.
   Verify installed older clients can discover the new version even when their old cloud API is unavailable. Check
   Settings > Updates as well as the downloaded-update action; document the full-installer fallback if discovery or
   installation fails. Normal update must replace code and packaged settings while preserving local data.
6. **Validate the exact installer and publish a new version.** Apply the final-artifact and installed-upgrade gates
   below, including compiled renderer/runtime endpoint checks, same-source identity, data/settings preservation,
   native runtime and matching EXE/blockmap/feed hashes. Record the tested starting version and any legacy failure.
   Source changes, login success and green unit tests alone are not evidence of a working installed update.
7. **Check public delivery and recovery.** Publish only the verified draft asset set under a new version; never
   replace old published assets. Verify anonymous latest-feed and installer downloads against the tested hashes,
   confirm the installed version/new endpoint on a disposable profile, and provide affected older releases with a
   recovery notice. Prefer normal update; if it fails, close Nafid normally and run the full installer once without
   uninstalling or deleting shop data. Keep the old endpoint available during a migration when feasible; any redirect
   strategy must be compatible with the desktop login transport's no-redirect policy.

## 2. Inspect the final installer

Extract and inspect the exact final EXE that will be uploaded, as well as its unpacked output. A development app, a copied `app.asar`, or the unpacked directory alone is not release proof.

| Required artifact | Required evidence |
|---|---|
| `resources/app-update.yml` | Exists and parses; GitHub owner/repo match the approved `UPDATES_REPO_URL`; the release feed is public and does not require a token |
| `resources/app.env` | Exists, is non-empty, contains only the canonical public allow-list, and has valid production `VITE_CLOUD_API`, `VENDORA_CLOUD_API`, and `UPDATES_REPO_URL` values |
| Renderer and main-process code | Packaged files match the final tested build; the renderer contains the intended production cloud endpoint |
| Packaged `package.json` | Version matches the intended release tag and installer filename |
| SQLite native module | Present in the unpacked native-module path and loads under the shipping Electron runtime without an ABI error |
| Installer signature | Record actual signature status and any Windows-policy restriction; do not claim that an unsigned build fixes a signing/policy block |

**A missing updater file, empty runtime settings, wrong endpoint, mismatched version, or failed artifact check blocks publication.** Do not work around the failure by telling users to retry their network or by copying only `app.asar` into an installation. Rebuild the complete installer and repeat validation.

## 3. Exercise the installed update flow

Use a disposable Windows profile or test machine, never a live shop database, to exercise an installed older version updating to the candidate. Record what was actually exercised; renderer mocks do not prove a full installed-version upgrade.

An already-shipped broken updater needs a documented recovery path: record the exact legacy version and failure, prove that the full candidate installer upgrades that installation while preserving its data/settings, then independently prove the candidate's own automatic install and failure/retry paths. This does not waive any candidate failure. Publish explicit one-time recovery instructions instead of reporting the legacy automatic path as passed. In the Windows acceptance test, v2.2.41's reproduced pre-spawn checksum-stream stall is recorded separately from a full-installer recovery; the candidate worker handoff has no such fallback.

- Confirm update discovery and download against the intended feed, and check the resulting installed version after relaunch.
- Verify visible preparation, installer progress, and automatic relaunch. Keep the application responsive during verification and Windows process creation; keep installer status visible until the new main renderer is visible and ready. Exercise a slow launch and startup failure: show an actionable retry instead of an unexplained blank gap. Do not display a fabricated installation percentage. Older updater code may still pass silent-install flags; test or explicitly document that transition limitation.
- Verify asynchronous installer-launch failure leaves Nafid open with an actionable error and a verified download available for retry. Missing/corrupt downloads require a fresh download; launch rejection alone must not create a download loop.
- Verify repeated clicks do not start multiple installers. Confirm existing shop data/settings are preserved.
- If Windows refuses an unsigned installer, retain the actual error and state the signing/recovery requirement. Do not disable application-control protections or report the upgrade as successful.

## 4. Publish one verified asset set

1. Prepare a draft GitHub Release with notes describing the actual shipped changes and any older-updater recovery requirement. Release notes remain dynamic; do not hardcode them in `whatsNew.ts`.
2. Upload the final installer, its matching `.exe.blockmap`, and `latest.yml` together. Confirm all uploads completed. `latest.yml` version, filename, size and SHA-512 must match the exact EXE bytes; the blockmap must come from that same build.
3. Compare uploaded asset digests with local verified digests. Publish and mark the release latest only after this complete draft passes every check.
4. Verify the public latest-release endpoint and anonymously download its `latest.yml`; confirm the announced version and asset links. A GitHub-authenticated API read alone does not prove that installed shops can access the feed.
5. Never replace binaries or metadata under an already-published version. Use a new version for a corrected build. If an old release is defective, add a factual recovery notice and direct users to the verified replacement.

## 5. Evidence and cleanup

Record the source commit/tree, version, CI result, packaged configuration checks, artifact hashes/sizes, native-runtime result, installed-upgrade test result and signature status in the PR/release verification record. Do not record credentials, customer data or raw authentication logs. Keep generated installers and investigation helpers outside tracked source.

Merge and remove temporary release branches/worktrees after publication. Before removing a worktree, verify its absolute path, preserve required artifacts, and ensure dependency links in the main checkout do not point into it. A local repair does not establish that other shops have upgraded; provide older-version recovery instructions when necessary.

Historical completed example: [v2.2.81 ledger integrity verification](verification/2026-11-19-ledger-integrity.md) records source/tree identity, coordinated backend review, automated checks, final installer digests and recovery limits. It is evidence for that release only; a later release must run its own gate.

## Incident that motivated this gate

On 6 November 2026, customer logs contained repeated HTTP 402 / `DEPLOYMENT_DISABLED` on cloud pushes and pulls.
The v2.2.49 Windows/Mac workflow environments still selected `nafid-eta.vercel.app`, while the local production env
selected the confirmed replacement `nafid.vercel.app`. Public probes reproduced 402 on the former and 200 on the
latter. The release workflow defaults were corrected and endpoint validation added. This is a source correction;
affected installed apps still need a newly built, fully validated installer. Do not overwrite v2.2.49 release assets.

Endpoint correction verification: app/Electron typechecks, architecture guard, zero-error/zero-warning lint and all
eight runtime-env tests passed. Full unit run: 1,224 passed, six trial-storage failures from restricted temp-file
rename permissions; all nine trial-storage tests passed in the unrestricted rerun, alongside the eight endpoint
tests. Packaged-check scripts passed syntax validation; no new installer was built or published in this correction.

On 4 November 2026, the published v2.2.40 installer was confirmed to omit `app-update.yml` and ship an empty `app.env`. The installed app reported a generic download failure before it could read its update feed, and cloud sync lacked its base URL. v2.2.41's final installer configuration and public feed were verified, and v2.2.40 received a recovery notice. Future releases must validate the packaged configuration, not infer correctness from a successful build or source tests.

## Smart App Control publisher blocks

If an affected shop reports Smart App Control blocking the installed Nafid.exe because its publisher cannot be verified, record the incident separately from download/install success. A progress-only release does not resolve that incident. Obtain a trusted code-signing identity, sign the installed app executable and installer (and other executable components as required), and verify the final build with Smart App Control enforced. Ordinary Windows CI with the policy absent is not evidence that this block is fixed. Do not disable the policy or use a locally trusted/self-signed certificate as a fleet-wide fix. Identity validation and provider eligibility must be completed before claiming a signed release is available.

## Multi-terminal account release review

For the [captured-revision account contract](multi-terminal-account-sync.md), deploy the compatible server before publishing the client. Existing endpoint names/row fields remain available, but unverifiable changes to existing financial records are failed conflicts rather than blind overwrites. Old installers retain their local changes and can still create identities/retry identical data; update every terminal so new edits capture revisions. No endpoint or hosting migration is required. Preserve local databases and pre-reset backups for shop reconciliation. Installer/upgrade/feed validation still applies, and published v2.2.81 assets remain immutable.
