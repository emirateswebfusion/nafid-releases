import { getDb } from '../db/localDb.js';
import { dbEmergencyPurgeLocalData } from './emergencyPurgeService.js';
import { localAuthenticateUser } from './localAuthService.js';
import { appendEmergencyAudit } from './emergencyAudit.js';
import { getEncryptedPath, getConfigPath, clearOfflineSession } from './authStorage.js';
import fs from 'node:fs';
import { setSyncActive } from '../sync/syncWorker.js';
import { session, BrowserWindow } from 'electron';
import { getCashAmountFromInvoice, adjustPaymentSourcesForInvoice, adjustCashDrawerForInvoice } from './cashDrawerService.js';
import { syncInvoiceCreditLedger } from './partyLedgerService.js';
import * as recycleBinSql from '../db/statements/recycleBin.js';
/** recycleBin use-cases for the main process (called by electron/ipc handlers). */

/**
 * IPC `emergency:purgeLocal`. Requires the credentials of an administrator cached on this terminal (re-entered
 * every time) and records the wipe in the local audit file before any data is removed.
 */
export async function emergencyPurge(payload: { wipe_mode?: 'ALL_DATA' | 'SALES_AND_CASH_ONLY'; reason?: string; email?: string; password?: string }) {
  try {
    const wipeMode = payload?.wipe_mode === 'SALES_AND_CASH_ONLY' ? 'SALES_AND_CASH_ONLY' : 'ALL_DATA';
    const auth = payload?.email && payload?.password ? localAuthenticateUser(payload.email, payload.password) : { success: false as const };
    const role = String(auth.success && auth.user ? auth.user.role : '').toUpperCase();
    if (!auth.success || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return { success: false, error: 'An administrator password is required to wipe this terminal.' };
    }
    appendEmergencyAudit({ source: 'LOCAL', wipe_mode: wipeMode, reason: payload?.reason || 'USER_TRIGGERED', user_email: auth.user?.email, user_id: auth.user?.user_id });
    console.warn(`[EmergencyWipe] 🚨 Initiating emergency local purge! Mode: ${wipeMode}, Reason: ${payload?.reason || 'USER_TRIGGERED'}`);

    const purgeResult = dbEmergencyPurgeLocalData(wipeMode);

    try {
      const encPath = getEncryptedPath();
      if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
      const p = getConfigPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      clearOfflineSession();
    } catch (e) {
      console.warn('[EmergencyWipe] Credential file unlink warning:', e);
    }

    try {
      setSyncActive(false);
    } catch { /* ignore */ }

    try {
      await session.defaultSession.clearStorageData();
    } catch (sessErr) {
      console.warn('[EmergencyWipe] Clear storage data warning:', sessErr);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send('emergency:purged', { wipeMode, reason: payload?.reason });
        } catch { /* ignore */ }
      }
    }

    return { success: true, clearedTables: purgeResult.clearedTables };
  } catch (error) {
    console.error('[EmergencyWipe] Purge failed:', error);
    return { success: false, error: (error as Error)?.message || 'Emergency purge failed' };
  }
}

/** IPC `db:getDeletedInvoices` */
export function getDeletedInvoices(tenantId: string) {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    const cols = recycleBinSql.pragmaTableInfo(db).all() as any[];
    const hasDeletedAt = cols.some(c => c.name === 'deleted_at');
    const orderClause = hasDeletedAt ? 'ORDER BY COALESCE(deleted_at, updated_at) DESC' : 'ORDER BY updated_at DESC';
    const deletedAtCol = hasDeletedAt ? ', deleted_at' : ', updated_at AS deleted_at';
    return recycleBinSql.listDeletedInvoices(db, deletedAtCol, orderClause).all(tid);
  } catch (error) {
    console.error('[db:getDeletedInvoices]', error);
    return [];
  }
}

/** IPC `db:restoreInvoice` */
export function restoreInvoice(invoice_id: string) {
  try {
    const db = getDb();
    let restoredInv: any = null;
    let oldCash = 0;

    db.transaction(() => {
      const inv = recycleBinSql.findInvoicesByInvoiceId(db).get(invoice_id) as any;
      if (!inv) throw new Error('Invoice not found');
      restoredInv = inv;
      oldCash = getCashAmountFromInvoice(inv);

      const isConversionCopy = !!(inv && (inv.converted_from_invoice_id || inv.converted_from_invoice_number));

      if (!isConversionCopy) {
        const items = recycleBinSql.findInvoiceItemsByInvoiceId(db).all(invoice_id) as any[];
        for (const item of items) {
          // Deduct stock back (re-apply the sale)
          recycleBinSql.updateProductCurrentStock(db)
            .run(item.quantity, item.product_id, inv.tenant_id);
        }
      }

      try { recycleBinSql.updateInvoiceItemIsDeleted(db).run(invoice_id); } catch (e) { /* ignore */ }
      
      const invCols = recycleBinSql.pragmaTableInfo(db).all() as any[];
      const hasDeletedAt = invCols.some(c => c.name === 'deleted_at');
      if (hasDeletedAt) {
        recycleBinSql.updateInvoiceIsDeletedAndDeletedAt(db).run(invoice_id);
      } else {
        recycleBinSql.updateInvoiceIsDeleted(db).run(invoice_id);
      }

      // Re-link converted copy if applicable
      if (isConversionCopy && inv.converted_from_invoice_id) {
        recycleBinSql.updateInvoiceConvertedToInvoiceIdAndConvertedToInvoiceNumber(db).run(inv.invoice_id, inv.invoice_number, inv.converted_from_invoice_id);
      }

      // Restore related party_ledger entries
      if (inv.invoice_number) {
        const invNum = String(inv.invoice_number).trim();
        recycleBinSql.updatePartyLedgerIsDeleted(db).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
      }
    })();

    if (restoredInv) {
      syncInvoiceCreditLedger(db, restoredInv, false);
      adjustPaymentSourcesForInvoice(db, restoredInv.tenant_id, restoredInv, false);
      if (oldCash > 0) {
        adjustCashDrawerForInvoice(db, restoredInv.tenant_id, restoredInv.created_at, 0, oldCash);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[db:restoreInvoice]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:getDeletedProducts` */
export function getDeletedProducts(tenantId: string) {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return recycleBinSql.findProducts(db).all(tid);
  } catch (error) {
    console.error('[db:getDeletedProducts]', error);
    return [];
  }
}

/** IPC `db:restoreProduct` */
export function restoreProduct(product_id: string) {
  try {
    const db = getDb();
    recycleBinSql.updateProductIsDeleted(db).run(product_id);
    return { success: true };
  } catch (error) {
    console.error('[db:restoreProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getDeletedCustomers` */
export function getDeletedCustomers(tenantId: string) {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return recycleBinSql.findCustomers(db).all(tid);
  } catch (error) {
    console.error('[db:getDeletedCustomers]', error);
    return [];
  }
}

/** IPC `db:restoreCustomer` */
export function restoreCustomer({ customer_id, tenant_id }: { customer_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    db.transaction(() => {
      recycleBinSql.updateCustomerIsDeleted(db).run(customer_id, tenant_id);
      recycleBinSql.updatePartyIsDeleted(db).run(customer_id, tenant_id);
    })();
    return { success: true };
  } catch (error) {
    console.error('[db:restoreCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getDeletedParties` */
export function getDeletedParties(tenantId: string) {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return recycleBinSql.findParties(db).all(tid);
  } catch (error) {
    console.error('[db:getDeletedParties]', error);
    return [];
  }
}

/** IPC `db:hardDeleteInvoice` */
export function hardDeleteInvoice(invoice_id: string) {
  try {
    const db = getDb();
    db.transaction(() => {
      try { recycleBinSql.deleteInvoiceItemByInvoiceId(db).run(invoice_id); } catch (e) { /* ignore */ }
      recycleBinSql.deleteInvoiceByInvoiceId(db).run(invoice_id);
    })();
    return { success: true };
  } catch (error) {
    console.error('[db:hardDeleteInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:hardDeleteProduct` */
export function hardDeleteProduct(product_id: string) {
  try {
    const db = getDb();
    recycleBinSql.deleteProductByProductId(db).run(product_id);
    return { success: true };
  } catch (error) {
    console.error('[db:hardDeleteProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:hardDeleteCustomer` */
export function hardDeleteCustomer({ customer_id, tenant_id }: { customer_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    db.transaction(() => {
      recycleBinSql.deleteCustomerByCustomerId(db).run(customer_id, tenant_id);
      recycleBinSql.deletePartyByPartyId(db).run(customer_id, tenant_id);
    })();
    return { success: true };
  } catch (error) {
    console.error('[db:hardDeleteCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:hardDeleteParty` */
export function hardDeleteParty(party_id: string) {
  try {
    const db = getDb();
    db.transaction(() => {
      recycleBinSql.deletePartyLedgerByPartyId(db).run(party_id);
      recycleBinSql.deletePartyByPartyId2(db).run(party_id);
    })();
    return { success: true };
  } catch (error) {
    console.error('[db:hardDeleteParty]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getRecycleBinSummary` */
export function getRecycleBinSummary(tenantId: string) {
  try {
    const db = getDb();
    const tid = tenantId || 'global';

    const invRow = recycleBinSql.countInvoices(db).get(tid) as any;

    const prodRow = recycleBinSql.countProducts(db).get(tid) as any;

    const custRow = recycleBinSql.countCustomers(db).get(tid) as any;

    const partyRow = recycleBinSql.countParties(db).get(tid) as any;

    return {
      invoices: invRow?.count || 0,
      invoicesValue: invRow?.total || 0,
      products: prodRow?.count || 0,
      customers: custRow?.count || 0,
      parties: partyRow?.count || 0,
    };
  } catch (error) {
    console.error('[db:getRecycleBinSummary]', error);
    return { invoices: 0, invoicesValue: 0, products: 0, customers: 0, parties: 0 };
  }
}

/** IPC `db:emptyRecycleBin` */
export function emptyRecycleBin(payload: { category: string; tenant_id: string }) {
  try {
    const db = getDb();
    const tid = payload?.tenant_id || 'global';
    const cat = payload?.category || 'ALL';

    db.transaction(() => {
      if (cat === 'SALES_BILLS' || cat === 'ALL') {
        const delInvs = recycleBinSql.findInvoices(db).all(tid) as any[];
        for (const row of delInvs) {
          try { recycleBinSql.deleteInvoiceItemByInvoiceId(db).run(row.invoice_id); } catch (e) { /* ignore */ }
          recycleBinSql.deleteInvoiceByInvoiceId2(db).run(row.invoice_id);
        }
      }

      if (cat === 'PRODUCTS' || cat === 'ALL') {
        recycleBinSql.deleteProduct(db).run(tid);
      }

      if (cat === 'CUSTOMERS' || cat === 'ALL') {
        recycleBinSql.deleteCustomer(db).run(tid);
        recycleBinSql.deletePartyByPartyType(db).run(tid);
      }

      if (cat === 'PARTIES' || cat === 'ALL') {
        recycleBinSql.deleteParty(db).run(tid);
      }
    })();

    return { success: true };
  } catch (error) {
    console.error('[db:emptyRecycleBin]', error);
    return { success: false, error: 'Operation failed' };
  }
}
