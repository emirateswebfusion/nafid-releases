import { runMigrations, type Migration } from './runner.js';
import type Database from 'better-sqlite3';
import { clearSyncApplyGuard, pruneOutbox } from '../statements/outbox.js';
import { m001ReturnsIndexes } from './001-returns-indexes.js';
import { m002SyncOutbox } from './002-sync-outbox.js';
import { m003SyncOutboxTriggers } from './003-sync-outbox-triggers.js';
import { m004ResyncRecalibratedReturns } from './004-resync-recalibrated-returns.js';
import { m005OutboxChangeOnlyTriggers } from './005-outbox-change-only-triggers.js';
import { m006FilingOnly } from './006-filing-only.js';
import { m007TrialAccessRegistry } from './007-trial-access-registry.js';
import { m008ReturnStockSnapshots } from './008-return-stock-snapshots.js';
import { m009StockCountersReturnTombstones } from './009-stock-counters-return-tombstones.js';
import { m010StockEffectsIdempotency } from './010-stock-effects-idempotency.js';
import { m011StockOperationStream } from './011-stock-operation-stream.js';
import { m012GstReturnsAndCreditNotes } from './012-gst-returns-and-credit-notes.js';
import { m013GstPhase2aLocalFilings } from './013-gst-phase2a-local-filings.js';
import { m014VatLocalFilings } from './014-vat-local-filings.js';
import { m015CardTerminalTransactions } from './015-card-terminal-transactions.js';
import { m016Restaurant } from './016-restaurant.js';
import { m017UaeEinvoicing } from './017-uae-einvoicing.js';
import { m018ReconcileFeatureMigrations } from './018-reconcile-feature-migrations.js';
import { m017HistoricalCreditNotes } from './017-historical-credit-notes.js';

import { m015DedupeScrapCashTransactions } from './015-dedupe-scrap-cash-transactions.js';
import { m016PurgeDuplicateScrapCashTransactions } from './016-purge-duplicate-scrap-cash-transactions.js';
import { m023ReconcileCustomerLoyaltyPoints } from './023-reconcile-customer-loyalty-points.js';
import { m025PreservePartyIdentities } from './025-preserve-party-identities.js';
import { m026FinancialOutboxOrder } from './026-financial-outbox-order.js';
import { m024PurchaseInterstate } from './024-purchase-interstate.js';

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
  m006FilingOnly,
  m007TrialAccessRegistry,
  m008ReturnStockSnapshots,
  m009StockCountersReturnTombstones,
  m010StockEffectsIdempotency,
  m011StockOperationStream,
  m012GstReturnsAndCreditNotes,
  m013GstPhase2aLocalFilings,
  m014VatLocalFilings,
  m015CardTerminalTransactions,
  m016Restaurant,
  m017UaeEinvoicing,
  m018ReconcileFeatureMigrations,
  { version: 19, name: 'scrap-dedupe-compatibility', up: m015DedupeScrapCashTransactions.up },
  { version: 20, name: 'scrap-purge-compatibility', up: m016PurgeDuplicateScrapCashTransactions.up },
  { version: 21, name: 'historical-credit-notes-compatibility', up: m017HistoricalCreditNotes.up },
  { version: 22, name: 'uae-einvoicing-compatibility', up: m017UaeEinvoicing.up },
  m023ReconcileCustomerLoyaltyPoints,
  m024PurchaseInterstate,
  m025PreservePartyIdentities,
  m026FinancialOutboxOrder,
];

/** Startup step after the baseline schema: apply pending migrations, then remove a sync apply guard row left by a
 * crash mid-pull (it would stop every local write from being recorded in the outbox). */
export function runStartupMigrations(db: Database.Database): void {
  runMigrations(db, MIGRATIONS);
  clearSyncApplyGuard(db);
  pruneOutbox(db);
}
