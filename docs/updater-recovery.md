# Update installation recovery

An update can finish downloading while its installer fails to start. This is distinct from a network or download failure. Check `nafid/logs/main.log` for the installed version, downloaded version, and installer launch error. Repeated `spawn UNKNOWN` followed by an unchanged installed version means the update did not install.

The shared updater fix validates the cached installer against its SHA-512, waits for Windows process creation before closing Nafid, preserves a verified download for retry, reports installation failures, and prevents duplicate installation attempts. Ordinary Windows app exit no longer starts an unchecked installer. Download errors and installation errors remain separate.

## Shops still running an older updater

New source code cannot repair an updater already installed on another PC until that PC installs a newer build. If the old updater repeatedly closes Nafid without updating it, use the installer from the official public Nafid Releases page once, after saving active work. Verify its version and published checksum. Do not uninstall Nafid or remove the shop data folder to recover an update. Confirm the app version after installation before retrying updates.

If Windows refuses to run the installer, record the Windows error and contact support. Do not disable Smart App Control, antivirus or application-control rules. A code-signed installer accepted by that machine's Windows policy is needed for policy blocks; republishing an unsigned installer is not a guaranteed fix. This build no longer erases configured signing credentials. The release operator must configure an appropriate code-signing certificate or signing service and verify the resulting EXE signature before claiming signed rollout support.

## Release validation

- Run the POS verify gate, lint ratchet and production build.
- Exercise asynchronous launch failure, checksum mismatch, missing files, repeated clicks and verified-cache retry tests.
- Smoke-test the packaged updater on an isolated Windows profile: download, start installation, check that blocked launch leaves Nafid open, and verify the installed version after successful relaunch.
- Publish matching installer, blockmap and `latest.yml` together, with release notes that include recovery instructions for older affected terminals.
- Existing shop databases, settings and credentials must remain in their current data folder.
