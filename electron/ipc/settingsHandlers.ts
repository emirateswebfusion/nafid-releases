import { ipcMain, BrowserWindow, session } from 'electron';
import fs from 'node:fs';
import {
  getDb,
  dbGetStaff,
  dbSaveStaff,
  dbVerifyBillerPin,
  dbGetStaffLedger,
  dbAddStaffTransaction,
  dbGetStaffAttendance,
  dbSaveStaffAttendance,
  dbEmergencyPurgeLocalData
} from '../db/localDb.js';
import { syncInvoiceCreditLedger, recalcPartyBalances } from '../services/partyLedgerService.js';
import { setSyncActive } from '../sync/syncWorker.js';
import {
  getCashAmountFromInvoice,
  adjustCashDrawerForInvoice,
  adjustPaymentSourcesForInvoice
} from '../services/cashDrawerService.js';
import {
  safeHandler,
  getEncryptedPath,
  getConfigPath,
  clearOfflineSession,
  validateString,
  validateNumber,
  validateOptionalString,
  validateOptionalNumber,
  validateObject,
  validateArray
} from './common.js';

export function registerSettingsHandlers(): void {
ipcMain.handle('emergency:purgeLocal', async (_event, payload: { wipe_mode?: 'ALL_DATA' | 'SALES_AND_CASH_ONLY'; reason?: string }) => {
  try {
    const wipeMode = payload?.wipe_mode === 'SALES_AND_CASH_ONLY' ? 'SALES_AND_CASH_ONLY' : 'ALL_DATA';
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
    } catch {}

    try {
      await session.defaultSession.clearStorageData();
    } catch (sessErr) {
      console.warn('[EmergencyWipe] Clear storage data warning:', sessErr);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send('emergency:purged', { wipeMode, reason: payload?.reason });
        } catch {}
      }
    }

    return { success: true, clearedTables: purgeResult.clearedTables };
  } catch (error: any) {
    console.error('[EmergencyWipe] Purge failed:', error);
    return { success: false, error: error?.message || 'Emergency purge failed' };
  }
});

ipcMain.removeHandler('log:error');

ipcMain.handle('settings:getAll', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    const rows = db.prepare(`
      SELECT tenant_id, key, value FROM settings 
      WHERE tenant_id = 'global' OR tenant_id = ?
    `).all(tid) as any[];

    const resultMap: Record<string, any> = {};
    const parseVal = (rawVal: any) => {
      if (rawVal === undefined || rawVal === null) return null;
      try {
        let parsed = JSON.parse(rawVal);
        if (typeof parsed === 'string') parsed = parsed.trim().replace(/^["']|["']$/g, '');
        if (parsed && typeof parsed === 'object' && (parsed.error === 'Operation failed' || parsed.success === false)) return null;
        return parsed;
      } catch {
        return String(rawVal).trim().replace(/^["']|["']$/g, '');
      }
    };

    for (const r of rows) {
      if (r.tenant_id === 'global') {
        resultMap[r.key] = parseVal(r.value);
      }
    }
    for (const r of rows) {
      if (r.tenant_id === tid && tid !== 'global') {
        const isLocal = LOCAL_DEVICE_SETTING_KEYS.includes(r.key);
        if (!isLocal || resultMap[r.key] === undefined) {
          resultMap[r.key] = parseVal(r.value);
        }
      }
    }
    return resultMap;
  } catch (error: any) {
    console.error('[settings:getAll]', error);
    return {};
  }
});

ipcMain.removeHandler('settings:get');
ipcMain.handle('settings:get', (event, { tenant_id, key }: { tenant_id: string; key: string }) => {
  try {
    const db = getDb();
    const isLocalDeviceKey = LOCAL_DEVICE_SETTING_KEYS.includes(key);

    let row: any = null;
    if (isLocalDeviceKey) {
      row = db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = ?").get(key);
      if (!row && tenant_id && tenant_id !== 'global') {
        row = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tenant_id, key);
      }
      if (!row) {
        row = db.prepare("SELECT value FROM settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1").get(key);
      }
    } else {
      const tid = tenant_id || 'global';
      row = db.prepare('SELECT value FROM settings WHERE tenant_id = ? AND key = ?').get(tid, key);
      if (!row && tid !== 'global') {
        row = db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = ?").get(key);
      }
      if (!row) {
        row = db.prepare("SELECT value FROM settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1").get(key);
      }
    }

    if (row && row.value !== undefined) {
      try {
        let parsed = JSON.parse(row.value);
        if (typeof parsed === 'string') {
          parsed = parsed.trim().replace(/^["']|["']$/g, '');
        }
        if (parsed && typeof parsed === 'object' && (parsed.error === 'Operation failed' || parsed.success === false)) {
          return null;
        }
        return parsed;
      } catch {
        return String(row.value).trim().replace(/^["']|["']$/g, '');
      }
    }
    return null;
  } catch (error: any) {
    console.error('[settings:get]', error);
    return null;
  }
});

const LOCAL_DEVICE_SETTING_KEYS = [
  'terminal_code',
  'invoice_counter_config',
  'gst_b2b_invoice_counter_config',
  'gst_b2c_invoice_counter_config',
  'gst_invoice_counter_config',
  'return_counter',
  'scrap_invoice_counter',
  'quotation_counter',
  'barcode_printer_config',
  'receipt_printer_config',
  'a4_printer_config',
  'scale_config',
  'printer_config',
  'network_sync_config',
  'auto_print_barcode',
  'print_format',
  'label_code_type',
  'label_show_shop_name',
  'billing_ui_config'
];

ipcMain.removeHandler('settings:set');
ipcMain.handle('settings:set', async (event, { tenant_id, key, value }: { tenant_id: string; key: string; value: any }) => {
  try {
    const db = getDb();
    const isLocalDeviceKey = LOCAL_DEVICE_SETTING_KEYS.includes(key);
    const syncStatus = isLocalDeviceKey ? 'LOCAL' : 'PENDING';
    const tid = tenant_id || 'global';
    const valString = typeof value === 'string' ? value : JSON.stringify(value);

    const upsertStmt = db.prepare(`
      INSERT INTO settings (tenant_id, key, value, sync_status, updated_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) 
      ON CONFLICT(tenant_id, key) DO UPDATE SET 
        value = EXCLUDED.value, 
        sync_status = EXCLUDED.sync_status,
        updated_at = CURRENT_TIMESTAMP
    `);

    upsertStmt.run(tid, key, valString, syncStatus);

    // For local device hardware keys, also mirror to 'global' so any tenant or startup cycle on this terminal machine retains access
    if (isLocalDeviceKey && tid !== 'global') {
      upsertStmt.run('global', key, valString, syncStatus);
    }

    if (key === 'network_sync_config' && value && typeof value === 'object') {
      const { startLocalHostServer, stopLocalHostServer } = await import('../sync/localHostServer.js');
      const { reloadSyncConfig } = await import('../sync/syncWorker.js');
      if ((value.syncMode === 'LAN' || value.syncMode === 'HYBRID') && value.lanRole === 'PRIMARY') {
        startLocalHostServer(Number(value.lanPort) || 3888);
      } else {
        stopLocalHostServer();
      }
      reloadSyncConfig();
    }
    return { success: true };
  } catch (error: any) {
    console.error('[settings:set]', error);
    return { success: false, error: 'Operation failed' };
  }
});


// db:getDeletedInvoices
ipcMain.handle('db:getDeletedInvoices', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    const cols = db.prepare('PRAGMA table_info(invoices)').all() as any[];
    const hasDeletedAt = cols.some(c => c.name === 'deleted_at');
    const orderClause = hasDeletedAt ? 'ORDER BY COALESCE(deleted_at, updated_at) DESC' : 'ORDER BY updated_at DESC';
    const deletedAtCol = hasDeletedAt ? ', deleted_at' : ', updated_at AS deleted_at';
    return db.prepare(`
      SELECT invoice_id, invoice_number, customer_name, customer_phone, grand_total,
             payment_method, invoice_type, created_at, updated_at${deletedAtCol}
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
      ${orderClause}
      LIMIT 500
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getDeletedInvoices]', error);
    return [];
  }
});

// db:restoreInvoice - reverses soft-delete and restores stock
ipcMain.handle('db:restoreInvoice', (event, invoice_id: string) => {
  try {
    const db = getDb();
    let restoredInv: any = null;
    let oldCash = 0;

    db.transaction(() => {
      const inv = db.prepare('SELECT * FROM invoices WHERE invoice_id = ?').get(invoice_id) as any;
      if (!inv) throw new Error('Invoice not found');
      restoredInv = inv;
      oldCash = getCashAmountFromInvoice(inv);

      const isConversionCopy = !!(inv && (inv.converted_from_invoice_id || inv.converted_from_invoice_number));

      if (!isConversionCopy) {
        const items = db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?').all(invoice_id) as any[];
        for (const item of items) {
          // Deduct stock back (re-apply the sale)
          db.prepare("UPDATE products SET current_stock = current_stock - ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?")
            .run(item.quantity, item.product_id, inv.tenant_id);
        }
      }

      try { db.prepare("UPDATE invoice_items SET is_deleted = 0, sync_status = 'PENDING' WHERE invoice_id = ?").run(invoice_id); } catch (e) {}
      
      const invCols = db.prepare('PRAGMA table_info(invoices)').all() as any[];
      const hasDeletedAt = invCols.some(c => c.name === 'deleted_at');
      if (hasDeletedAt) {
        db.prepare("UPDATE invoices SET is_deleted = 0, deleted_at = NULL, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(invoice_id);
      } else {
        db.prepare("UPDATE invoices SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(invoice_id);
      }

      // Re-link converted copy if applicable
      if (isConversionCopy && inv.converted_from_invoice_id) {
        db.prepare(`
          UPDATE invoices SET
            converted_to_invoice_id = ?,
            converted_to_invoice_number = ?,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `).run(inv.invoice_id, inv.invoice_number, inv.converted_from_invoice_id);
      }

      // Restore related party_ledger entries
      if (inv.invoice_number) {
        const invNum = String(inv.invoice_number).trim();
        db.prepare(`
          UPDATE party_ledger
          SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP
          WHERE (reference_number = ? OR reference_number = ? OR reference_number LIKE ? OR description LIKE ?)
            AND is_deleted = 1
        `).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
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
  } catch (error: any) {
    console.error('[db:restoreInvoice]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

// db:getDeletedProducts
ipcMain.handle('db:getDeletedProducts', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return db.prepare(`
      SELECT product_id, name, COALESCE(sku_barcode, '') AS barcode, category, current_stock, base_price, updated_at
      FROM products
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
      ORDER BY updated_at DESC
      LIMIT 500
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getDeletedProducts]', error);
    return [];
  }
});

// db:restoreProduct
ipcMain.handle('db:restoreProduct', (event, product_id: string) => {
  try {
    const db = getDb();
    db.prepare("UPDATE products SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").run(product_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:restoreProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// db:getDeletedCustomers
ipcMain.handle('db:getDeletedCustomers', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return db.prepare(`
      SELECT customer_id, name, phone, '' AS email, current_points_balance, updated_at
      FROM customers
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
      ORDER BY updated_at DESC
      LIMIT 500
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getDeletedCustomers]', error);
    return [];
  }
});

// db:restoreCustomer
ipcMain.handle('db:restoreCustomer', (event, { customer_id, tenant_id }: { customer_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare("UPDATE customers SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND (tenant_id = ? OR tenant_id = 'global')").run(customer_id, tenant_id);
      db.prepare("UPDATE parties SET is_deleted = 0, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE party_id = ? AND (tenant_id = ? OR tenant_id = 'global')").run(customer_id, tenant_id);
    })();
    return { success: true };
  } catch (error: any) {
    console.error('[db:restoreCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// db:getDeletedParties
ipcMain.handle('db:getDeletedParties', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';
    return db.prepare(`
      SELECT party_id, name, phone, address, balance, balance_type, party_type, updated_at
      FROM parties
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND (party_type IS NULL OR party_type != 'CUSTOMER')
      ORDER BY updated_at DESC
      LIMIT 500
    `).all(tid);
  } catch (error: any) {
    console.error('[db:getDeletedParties]', error);
    return [];
  }
});

// db:hardDeleteInvoice - permanent delete (already soft-deleted)
ipcMain.handle('db:hardDeleteInvoice', (event, invoice_id: string) => {
  try {
    const db = getDb();
    db.transaction(() => {
      try { db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoice_id); } catch (e) {}
      db.prepare('DELETE FROM invoices WHERE invoice_id = ? AND is_deleted = 1').run(invoice_id);
    })();
    return { success: true };
  } catch (error: any) {
    console.error('[db:hardDeleteInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// db:hardDeleteProduct - permanent delete (already soft-deleted)
ipcMain.handle('db:hardDeleteProduct', (event, product_id: string) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM products WHERE product_id = ? AND is_deleted = 1').run(product_id);
    return { success: true };
  } catch (error: any) {
    console.error('[db:hardDeleteProduct]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// db:hardDeleteCustomer - permanent delete (already soft-deleted)
ipcMain.handle('db:hardDeleteCustomer', (event, { customer_id, tenant_id }: { customer_id: string; tenant_id: string }) => {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare("DELETE FROM customers WHERE customer_id = ? AND (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1").run(customer_id, tenant_id);
      db.prepare("DELETE FROM parties WHERE party_id = ? AND (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1").run(customer_id, tenant_id);
    })();
    return { success: true };
  } catch (error: any) {
    console.error('[db:hardDeleteCustomer]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// db:hardDeleteParty - permanent delete (already soft-deleted)
ipcMain.handle('db:hardDeleteParty', (event, party_id: string) => {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM party_ledger WHERE party_id = ? AND is_deleted = 1').run(party_id);
      db.prepare('DELETE FROM parties WHERE party_id = ? AND is_deleted = 1').run(party_id);
    })();
    return { success: true };
  } catch (error: any) {
    console.error('[db:hardDeleteParty]', error);
    return { success: false, error: 'Operation failed' };
  }
});

// db:getRecycleBinSummary
ipcMain.handle('db:getRecycleBinSummary', (event, tenantId: string) => {
  try {
    const db = getDb();
    const tid = tenantId || 'global';

    const invRow = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS total
      FROM invoices
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD')
    `).get(tid) as any;

    const prodRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM products
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
    `).get(tid) as any;

    const custRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM customers
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
    `).get(tid) as any;

    const partyRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM parties
      WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        AND (party_type IS NULL OR party_type != 'CUSTOMER')
    `).get(tid) as any;

    return {
      invoices: invRow?.count || 0,
      invoicesValue: invRow?.total || 0,
      products: prodRow?.count || 0,
      customers: custRow?.count || 0,
      parties: partyRow?.count || 0,
    };
  } catch (error: any) {
    console.error('[db:getRecycleBinSummary]', error);
    return { invoices: 0, invoicesValue: 0, products: 0, customers: 0, parties: 0 };
  }
});

// db:emptyRecycleBin
ipcMain.handle('db:emptyRecycleBin', (event, payload: { category: string; tenant_id: string }) => {
  try {
    const db = getDb();
    const tid = payload?.tenant_id || 'global';
    const cat = payload?.category || 'ALL';

    db.transaction(() => {
      if (cat === 'SALES_BILLS' || cat === 'ALL') {
        const delInvs = db.prepare(`
          SELECT invoice_id FROM invoices 
          WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1
        `).all(tid) as any[];
        for (const row of delInvs) {
          try { db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(row.invoice_id); } catch (e) {}
          db.prepare('DELETE FROM invoices WHERE invoice_id = ?').run(row.invoice_id);
        }
      }

      if (cat === 'PRODUCTS' || cat === 'ALL') {
        db.prepare(`DELETE FROM products WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1`).run(tid);
      }

      if (cat === 'CUSTOMERS' || cat === 'ALL') {
        db.prepare(`DELETE FROM customers WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1`).run(tid);
        db.prepare(`DELETE FROM parties WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1 AND party_type = 'CUSTOMER'`).run(tid);
      }

      if (cat === 'PARTIES' || cat === 'ALL') {
        db.prepare(`DELETE FROM parties WHERE (tenant_id = ? OR tenant_id = 'global') AND is_deleted = 1 AND (party_type IS NULL OR party_type != 'CUSTOMER')`).run(tid);
      }
    })();

    return { success: true };
  } catch (error: any) {
    console.error('[db:emptyRecycleBin]', error);
    return { success: false, error: 'Operation failed' };
  }
});

ipcMain.handle('db:deleteInvoice', (event, invoice_id: string) => {
  try {
    const db = getDb();
    const existingInv = db.prepare(`SELECT * FROM invoices WHERE invoice_id = ?`).get(invoice_id) as any;
    const oldCash = existingInv ? getCashAmountFromInvoice(existingInv) : 0;

    db.transaction(() => {
      const inv = db.prepare('SELECT tenant_id, converted_from_invoice_id, converted_to_invoice_id FROM invoices WHERE invoice_id = ?').get(invoice_id) as any;

      // A conversion copy never moved stock — do NOT restore it (would double stock).
      // The superseded BoS owns the deduction.
      const isConversionCopy = !!(inv && inv.converted_from_invoice_id);

      const items = db.prepare('SELECT product_id, quantity, qty_from_paper_stock FROM invoice_items WHERE invoice_id = ?').all(invoice_id) as any[];
      const restoreStockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');
      const deductStockStmt = db.prepare('UPDATE products SET current_stock = current_stock - ?, sync_status = \'PENDING\', updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?');
      if (!isConversionCopy) {
        for (const item of items) {
          restoreStockStmt.run(item.quantity, item.product_id, inv.tenant_id);
        }
      }
      try { db.prepare("UPDATE invoice_items SET is_deleted = 1, sync_status = 'PENDING' WHERE invoice_id = ?").run(invoice_id); } catch (e) {}

      // If a copy was deleted, un-supersede its BoS so it can be converted again
      if (isConversionCopy && inv) {
        db.prepare(`
          UPDATE invoices SET
            converted_to_invoice_id = NULL,
            converted_to_invoice_number = NULL,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `).run(inv.converted_from_invoice_id);
      }

      // If a BoS was deleted, unlink its GST copy
      if (!isConversionCopy && inv && inv.converted_to_invoice_id) {
        db.prepare(`
          UPDATE invoices SET
            converted_from_invoice_id = NULL,
            converted_from_invoice_number = NULL,
            sync_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
          WHERE invoice_id = ?
        `).run(inv.converted_to_invoice_id);
      }

      db.prepare("UPDATE invoices SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE invoice_id = ?").run(invoice_id);

      // Soft-delete party_ledger entries immediately within transaction
      if (existingInv && existingInv.invoice_number) {
        const invNum = String(existingInv.invoice_number).trim();
        db.prepare(`
          UPDATE party_ledger 
          SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
          WHERE (reference_number = ? OR reference_number = ? OR reference_number LIKE ? OR description LIKE ?)
            AND (is_deleted IS NULL OR is_deleted = 0)
        `).run(invNum, `${invNum}-PAY`, `${invNum}%`, `%${invNum}%`);
      }
    })();

    if (existingInv) {
      syncInvoiceCreditLedger(db, existingInv, true);
    }

    if (existingInv) {
      adjustPaymentSourcesForInvoice(db, existingInv.tenant_id, existingInv, true);
    }

    if (existingInv && oldCash > 0) {
      adjustCashDrawerForInvoice(db, existingInv.tenant_id, existingInv.created_at, oldCash, 0);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteInvoice]', error);
    return { success: false, error: 'Operation failed' };
  }
});


ipcMain.handle('db:getStaff', safeHandler((event, params: any) => {
  return dbGetStaff(params);
}));

ipcMain.handle('db:saveStaff', safeHandler((event, params: any) => {
  return dbSaveStaff(params);
}));

ipcMain.handle('db:verifyBillerPin', safeHandler((event, params: any) => {
  return dbVerifyBillerPin(params);
}));

ipcMain.handle('db:getStaffLedger', safeHandler((event, params: any) => {
  return dbGetStaffLedger(params);
}));

ipcMain.handle('db:addStaffTransaction', safeHandler((event, params: any) => {
  return dbAddStaffTransaction(params);
}));

ipcMain.handle('db:getStaffAttendance', safeHandler((event, params: any) => {
  return dbGetStaffAttendance(params);
}));

ipcMain.handle('db:saveStaffAttendance', safeHandler((event, params: any) => {
  return dbSaveStaffAttendance(params);
}));

}
