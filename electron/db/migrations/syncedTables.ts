import { SYNCED_TABLES } from './002-sync-outbox.js';
import { RESTAURANT_SYNCED_TABLES } from './016-restaurant.js';

/** Every table the outbox engine records and applies. `SYNCED_TABLES` stays frozen with migration 002 (its tables
 * must exist when that migration runs); tables created by later migrations are appended here. */
export const ALL_SYNCED_TABLES: readonly string[] = [...SYNCED_TABLES, ...RESTAURANT_SYNCED_TABLES];
