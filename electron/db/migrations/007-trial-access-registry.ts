import type { Migration } from './runner.js';

/** Device-local licensing metadata, excluded from business sync. */
export const m007TrialAccessRegistry: Migration = {
  version: 7, name: 'trial-access-registry',
  up: db => db.exec('CREATE TABLE trial_access_registry (tenant_id TEXT PRIMARY KEY NOT NULL)'),
};
