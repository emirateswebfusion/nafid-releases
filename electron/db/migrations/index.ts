import { runMigrations, type Migration } from './runner.js';
import type Database from 'better-sqlite3';
import { clearSyncApplyGuard, pruneOutbox } from '../statements/outbox.js';
import { m001ReturnsIndexes } from './001-returns-indexes.js';
import { m002SyncOutbox } from './002-sync-outbox.js';
import { m003SyncOutboxTriggers } from './003-sync-outbox-triggers.js';
import { m004ResyncRecalibratedReturns } from './004-resync-recalibrated-returns.js';
import { m005OutboxChangeOnlyTriggers } from './005-outbox-change-only-triggers.js';

/**
 * Every versioned migration, in order. To change the schema or fix data: add `NNN-short-name.ts` exporting a
 * `Migration` with the next version, append it here, and cover it in tests/characterization/migrations.mts.
 * Never edit or renumber a released migration; write a new one.
 */
export const MIGRATIONS: readonly Migration[] = [
  m001ReturnsIndexes,
  m002SyncOutbox,
  m003SyncOutboxTriggers,
  m004ResyncRecalibratedReturns,
  m005OutboxChangeOnlyTriggers,
];

/** Startup step after the baseline schema: apply pending migrations, then remove a sync apply guard row left by a
 * crash mid-pull (it would stop every local write from being recorded in the outbox). */
export function runStartupMigrations(db: Database.Database): void {
  runMigrations(db, MIGRATIONS);
  clearSyncApplyGuard(db);
  pruneOutbox(db);
}
