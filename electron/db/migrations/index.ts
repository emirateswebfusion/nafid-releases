import type { Migration } from './runner.js';
import { m001ReturnsIndexes } from './001-returns-indexes.js';
import { m002SyncOutbox } from './002-sync-outbox.js';

/**
 * Every versioned migration, in order. To change the schema or fix data: add `NNN-short-name.ts` exporting a
 * `Migration` with the next version, append it here, and cover it in tests/characterization/migrations.mts.
 * Never edit or renumber a released migration; write a new one.
 */
export const MIGRATIONS: readonly Migration[] = [
  m001ReturnsIndexes,
  m002SyncOutbox,
];
