# Mandatory POS release validation

This is the canonical release gate for Nafid POS. It applies to every agent, developer, build machine and CI release path. Passing source tests, CI, or `electron-builder` is necessary but does not prove that the installer is complete. Record the artifact checks below before publication; this document does not claim that existing source guards automate them.

## 1. Release identity and build environment

- Build a clean, reviewed source tree that passed `verify` and `lint:ratchet`. Record its commit and version. Exclude unrelated uncommitted work. The source tag must identify the exact shipped tree; rebuild if source or build settings change after validation.
- Each release worktree must have its own writable `node_modules`. Share the package-manager download store, not a dependency-directory junction: package-manager/packager operations can rewrite links to an ephemeral worktree and break the original checkout when it is removed.
- Supply the approved production settings before both renderer compilation and packaging. Do not package with missing, blank, development, localhost, or placeholder cloud URLs. Renderer build-time settings and main-process runtime settings must agree.
- Keep credentials on the build machine. `scripts/runtime-env.cjs` owns the public runtime allow-list; do not expand it to include tokens or signing secrets. Preserve configured signing credentials instead of erasing them.

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

## Incident that motivated this gate

On 4 November 2026, the published v2.2.40 installer was confirmed to omit `app-update.yml` and ship an empty `app.env`. The installed app reported a generic download failure before it could read its update feed, and cloud sync lacked its base URL. v2.2.41's final installer configuration and public feed were verified, and v2.2.40 received a recovery notice. Future releases must validate the packaged configuration, not infer correctness from a successful build or source tests.
