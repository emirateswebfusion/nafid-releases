# Contributing

This repository is one app of the Nafid workspace. Read `ARCHITECTURE.md` (and the workspace `../AGENTS.md`) before
changing code. This file is the version-control workflow.

## Branches

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Released / releasable code | Protected: changes only through pull requests with a green CI run; no force-push |
| `feat/<short-name>` | New feature | Branch from `main`, keep it small (one slice of work) |
| `fix/<short-name>` | Bug fix | Include a test that fails before the fix |
| `refactor/<short-name>` | Behaviour-preserving restructuring | Prove equivalence (tests, golden master, characterization harness) |
| `chore/<short-name>`, `docs/<short-name>` | Tooling, dependencies, documentation | — |
| `release/vX.Y.Z` (optional) | Stabilising a release | Only fixes; merge back to `main` and tag |

Delete a branch after it is merged. Long-lived branches drift: rebase on `main` at least weekly.
Always work strictly within the repository workspace. Never leave active development, dev servers, or orphaned directories in external worktree paths (e.g. `C:\nafid-wt\...`).

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary` in the imperative, ≤ 72 chars.

```text
feat(billing): add split payment to quotations
fix(sync): keep PENDING rows when the pull returns an older version
refactor(server): move invoice SQL into db/repositories/invoices
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`. Add a body when the *why* is not
obvious, and `BREAKING CHANGE:` when a contract (IPC channel, REST route, sync payload, schema) changes.

One logical change per commit. Never mix formatting or mass renames with behaviour changes.

## Pull requests

1. `npm run verify` passes locally (the CI runs it again on every push and pull request).
2. Fill in the pull-request template checklist.
3. Contract changes (sync payloads, permission keys, schema, REST routes) are reviewed together with the matching
   change in the other repository.
4. Squash-merge into `main` with a Conventional-Commit title.

## Releases

Bump the version (semantic versioning), update the release notes, merge to `main`, then tag: `git tag vX.Y.Z && git push --tags`.

**Mandatory release gate:** complete [release validation](docs/architecture/release-validation.md) against the final
installer, record the evidence, then publish the complete verified draft. A successful build/CI run is insufficient.
Missing `app-update.yml`, empty/invalid `app.env`, or mismatched installer/update metadata blocks publication.

**Auto-update feed (no secrets in the app).** Installers and `latest.yml` are published to the public, binaries-only
repo `UPDATES_REPO_URL` (e.g. `emirateswebfusion/nafid-releases`); installed apps read it without credentials.
`GH_TOKEN` stays on the build machine (`.env.production` or CI secret) and is used only to upload the release.
The installer ships `resources/app.env`, written by `scripts/runtime-env.cjs` from `.env.production` with an
allow-list of public keys (`tests/unit/runtimeEnv.test.ts` rejects secret-looking keys). Never add a token to that list.
During the transition set `LEGACY_PRIVATE_REPO_URL` so releases also reach installs made before this change; remove it
once every terminal runs a newer version, then revoke the old token.

## Never commit

`.env*` files (except `.env.example`), keystores and signing keys, tokens or passwords, database files, logs, build
output (`dist*/`, `release/`), `node_modules/`, WhatsApp session folders, editor settings. If a secret was committed,
treat it as leaked: rotate it first, then remove it from the repository.
