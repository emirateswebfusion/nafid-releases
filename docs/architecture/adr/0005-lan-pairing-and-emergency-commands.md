# ADR 0005: LAN pairing key and owner-issued emergency commands

Status: accepted

## Context
- The LAN sync host (`electron/sync/localHostServer.ts`) answered every request on the shop network without authentication, so any device on the Wi-Fi could read or write sales data.
- The emergency wipe could be triggered from a quick PIN and from a synced setting (`emergency_wipe_command`), so anyone able to write that setting could wipe a terminal.

## Decision
1. **LAN pairing key.** The primary terminal generates a 16-character shop key (`XXXX-XXXX-XXXX-XXXX`), stored only in the device-local `network_sync_config` setting (never synced to the cloud). Every LAN request carries `X-Nafid-Lan-Key`; the host compares in constant time and answers 401 otherwise (`/health` stays open). Secondary terminals enter the key in Settings -> Network. Code: `services/lanPairing.ts`, `db/statements/lanPairing.ts`.
   Paired terminals may pull every shared table but push only the tables they really send (`sync/lanTables.ts`, `LAN_PUSH_TABLES`, pinned by `tests/unit/lanTables.test.ts`); staff accounts, roles, salaries and sync metadata are read-only over the LAN (403). A live check with two terminals is pending: see `07-sync-outbox-design.md` §7.6.
2. **Emergency wipe requires an admin.** Local wipe needs the email and password of an ADMIN/SUPER_ADMIN, verified through `localAuthenticateUser`, and writes a local JSONL audit entry before wiping (`services/emergencyAudit.ts`).
3. **Remote wipe via server commands only.** The owner issues a command (`POST /api/emergency/wipe-commands`, owner role + password re-entry, migration 094). Terminals poll `emergencyCommands.ts`, acknowledge first, then wipe. The synced setting key is no longer accepted.

## Consequences
- All terminals in a shop must be updated together; secondaries need the key entered once.
- Regenerating the key disconnects every terminal until the new key is entered.
- Verified by `tests/characterization/lan-run.mts` (baseline answered 200 unauthenticated, new code 401), `emergency-run.mts`, and server `tests/emergency.test.ts`.
