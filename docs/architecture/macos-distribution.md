# macOS distribution

Mac installers share the public `emirateswebfusion/nafid-releases` repository with Windows. Windows keeps its EXE/blockmap/`latest.yml`; macOS adds architecture-specific DMG and ZIP assets and one combined `latest-mac.yml`. A first public Mac release needs a new source version/tag and final-artifact validation, not additional unverified binaries under an already-published Windows tag.

## Builds and runtime

Use `.github/workflows/macos-installers.yml`: native `macos-15` (Apple Silicon/arm64) and `macos-15-intel` (Intel/x64) runners each have independent dependencies. `scripts/prepare-macos-runtime.cjs` installs the matching Electron runtime and rebuilds SQLite/serialport for Electron's ABI. Never run the Windows-only `fix-sqlite.js` to prepare a Mac package. `pnpm run package:mac` is for the current Mac architecture; use CI for the complete two-architecture set.

Assets use `Nafid-<version>-mac-<arch>.dmg` and `.zip`. ZIP is required for `electron-updater`; DMG is for initial installation. Separate names prevent the two jobs overwriting each other. `scripts/merge-macos-metadata.cjs` validates both asset sets and combines their entries into a single update feed. The installed updater prefers arm64 files on Apple Silicon (including Rosetta) and excludes arm64 files on Intel.

## Signing and public readiness

The default workflow mode produces **ad-hoc development/test artifacts only**, retained privately in CI. It does not publish a release or claim Gatekeeper acceptance. A local build without quarantine is not equivalent to a public signed/notarized download. Website Mac download links stay unavailable until approved public assets exist.

An individual Apple Developer Program membership can supply a Developer ID identity; a registered company is not required for individual enrollment. Account enrollment, identity checks and payment must be completed by the account owner. Never request private keys, passwords or identity documents in chat.

After enrollment, configure GitHub Actions secrets through the repository's secure settings:

- `MAC_CSC_LINK`: exported Developer ID Application certificate with its private key, in electron-builder's supported secure certificate format.
- `MAC_CSC_KEY_PASSWORD`: certificate export password.
- `MAC_APPLE_API_KEY`: notarization `.p8` key (supported base64 form), `MAC_APPLE_API_KEY_ID`, `MAC_APPLE_API_ISSUER`: App Store Connect API credentials authorized for notarization.

Run the workflow with `signed=true`. Missing credentials fail before packaging. The build requires signing and notarization; final verification checks `codesign`, stapled tickets, and `spctl`. The combined verification manifest must say `productionReady: true` before public publication. Ad-hoc artifacts must never be relabeled as signed or published as the production Mac installer.

## Final release gate

`tests/packaged/macos-installer.cjs` verifies the final DMG's checksums/mounted resources, public runtime/update configuration, packaged version, renderer endpoint, SQLite/serialport under the shipping Electron runtime, signature structure, and an actually visible initial renderer in a disposable profile. Signed mode also requires valid stapled tickets and Gatekeeper assessment. Preserve the per-architecture reports and the combined metadata report with the source/tree and asset hashes.

Before the first public Mac release, additionally test a clean downloaded install, signed ZIP auto-update from an installed Mac version, shop-data/settings preservation, and the shop's intended printer/scale hardware on a real Mac. CI startup is not proof that every physical peripheral works. Keep the minimum macOS requirement aligned with the shipping Electron version and packaged application metadata.

Publish approved DMG/ZIP files from both architecture artifacts with the **combined** `latest-mac.yml` only after every required check passes. Never upload the per-job feed twice or overwrite Windows `latest.yml`. Recheck anonymous Mac asset links and updater architecture selection, then enable the website's public Mac download choices.

References: [electron-builder macOS](https://www.electron.build/v26/docs/mac/), [GitHub native runner labels](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job), [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
