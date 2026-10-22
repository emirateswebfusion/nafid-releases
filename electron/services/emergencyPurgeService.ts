import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { getDb } from '../db/localDb.js';
import * as emergencyPurgeSql from '../db/statements/emergencyPurge.js';

/** Emergency local data purge (ALL_DATA or SALES_AND_CASH_ONLY). Destructive; see risk R2 in the workspace ARCHITECTURE.md. */

export function dbEmergencyPurgeLocalData(wipeMode: 'ALL_DATA' | 'SALES_AND_CASH_ONLY' = 'ALL_DATA'): { success: boolean; clearedTables: string[]; error?: string } {
  const d = getDb();
  if (!d) return { success: false, clearedTables: [], error: 'Database not initialized' };

  const salesAndCashTables = [
    'invoices',
    'invoice_items',
    'returns',
    'return_items',
    'quotations',
    'quotation_items',
    'purchase_bills',
    'purchase_bill_items',
    'parties',
    'party_ledger',
    'cash_drawer',
    'cash_transactions',
    'cashier_audit_log',
    'cash_categories',
    'scrap_transactions',
    'scrap_categories',
    'warranties',
    'customers',
    'loyalty_transactions',
    'payment_source_transactions',
    'staff_salaries',
    'staff_transactions',
    'staff_ledger',
    'shop_closing_reports',
    'ecommerce_sync_logs',
  ];

  const fullWipeExtraTables = [
    'products',
    'product_grades',
    'pricing_tiers',
    'product_pricing',
    'combo_offers',
    'combo_items',
    'staff',
    'staff_attendance',
    'payment_sources',
    'ecommerce_settings',
    'ecommerce_product_mappings',
    'sync_meta',
    'users',
    'settings',
  ];

  const targetTables = wipeMode === 'SALES_AND_CASH_ONLY'
    ? salesAndCashTables
    : [...salesAndCashTables, ...fullWipeExtraTables];

  const cleared: string[] = [];

  const purgeTx = d.transaction(() => {
    d.pragma('foreign_keys = OFF');
    for (const table of targetTables) {
      try {
        const tableCheck = emergencyPurgeSql.findSqliteMasterByTypeAndName(d).get(table);
        if (tableCheck) {
          d.exec(`DELETE FROM ${table};`);
          cleared.push(table);
        }
      } catch (err) {
        console.warn(`[EmergencyPurge] Table delete warning for ${table}:`, err);
      }
    }
    try {
      d.exec("DELETE FROM sqlite_sequence WHERE name IN ('" + targetTables.join("','") + "');");
    } catch {}
    d.pragma('foreign_keys = ON');
  });

  try {
    purgeTx();
    console.log(`[EmergencyPurge] Purged ${cleared.length} tables in mode: ${wipeMode}`);

    try {
      d.pragma('wal_checkpoint(TRUNCATE)');
      d.exec('VACUUM;');
    } catch (vacErr) {
      console.warn('[EmergencyPurge] VACUUM warning:', vacErr);
    }

    try {
      const appData = app.getPath('appData');
      const candidates = [
        path.join(appData, 'nafid', 'vendora_v2.db'),
        path.join(appData, 'nafid', 'vendora.db'),
        path.join(appData, 'com.nafid', 'vendora_v2.db'),
        path.join(appData, 'vendora', 'vendora_v2.db'),
        path.join(appData, 'Vendora', 'vendora_v2.db'),
        path.join(appData, 'Nafid', 'vendora.db'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try { fs.unlinkSync(cand); } catch {}
          if (fs.existsSync(`${cand}-wal`)) try { fs.unlinkSync(`${cand}-wal`); } catch {}
          if (fs.existsSync(`${cand}-shm`)) try { fs.unlinkSync(`${cand}-shm`); } catch {}
        }
      }
    } catch (candErr) {
      console.warn('[EmergencyPurge] Candidate cleanup warning:', candErr);
    }

    return { success: true, clearedTables: cleared };
  } catch (err: any) {
    console.error('[EmergencyPurge] Fatal error purging local DB:', err);
    return { success: false, clearedTables: cleared, error: err?.message || 'Purge failed' };
  }
}
