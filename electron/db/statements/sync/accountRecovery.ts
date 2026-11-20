import type { Db } from '../types.js';
import { moneyDecimalsSql } from '../moneyPrecision.js';
export type RecoveryEntity = 'parties' | 'party_ledger';
export interface RecoveryTarget { entity: RecoveryEntity; id: string }
export interface RecoverySource { entity: RecoveryEntity; row: Record<string, unknown> }
export const readParty = (db: Db) => db.prepare('SELECT * FROM parties WHERE tenant_id=? AND party_id=?');
export const readLedger = (db: Db) => db.prepare('SELECT * FROM party_ledger WHERE tenant_id=? AND ledger_id=?');
export const readParent = (db: Db) => db.prepare(`SELECT party_id,balance,gst_balance,estimate_balance,${moneyDecimalsSql('parties.tenant_id')} AS money_decimals FROM parties WHERE tenant_id=? AND party_id=?`);
export const queueBoundary = (db: Db) => db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM sync_outbox');
export const historySize = (db: Db) => db.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS bytes
  FROM sync_outbox WHERE tenant_id=? AND entity=? AND entity_id=? AND sent_at IS NULL AND rowid<=?`);
export const coveredOperations = (db: Db) => db.prepare(`SELECT rowid AS queue_id,* FROM sync_outbox
  WHERE tenant_id=? AND entity=? AND entity_id=? AND sent_at IS NULL AND rowid<=? ORDER BY rowid LIMIT 5001`);
export const finishCoveredOperations = (db: Db) => db.prepare(`UPDATE sync_outbox SET sent_at=?,last_error=?
  WHERE tenant_id=? AND entity=? AND entity_id=? AND sent_at IS NULL AND rowid<=? AND row_version<=?`);
