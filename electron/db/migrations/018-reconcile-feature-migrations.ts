import type { Migration } from './runner.js';
import { m015CardTerminalTransactions } from './015-card-terminal-transactions.js';
import { m016Restaurant } from './016-restaurant.js';

/** Releases 2.2.35–37 used 15/16 for scrap repairs; local feature previews used them for schema.
 * Keep both historical definitions intact and reconcile at new versions without rewriting applied records. */
export const m018ReconcileFeatureMigrations: Migration = {
  version: 18,
  name: 'reconcile-feature-migrations',
  up: db => {
    m015CardTerminalTransactions.up(db);
    m016Restaurant.up(db);
  },
};
