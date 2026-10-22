import { getDb } from '../db/localDb.js';
import { triggerUrgentWarrantySync } from '../sync/syncWorker.js';
import * as warrantiesSql from '../db/statements/warranties.js';
/** warranties use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:saveWarranty` */
export function saveWarranty(w: any) {
  try {
    const db = getDb();
    warrantiesSql.insertWarranty(db).run(w.warranty_id, w.tenant_id, w.invoice_id || null, w.invoice_item_id || null, w.bill_number || null, w.brand || null, w.customer_name, w.customer_phone || null, w.product_name, w.product_details || null, w.purchase_date, w.warranty_period_days, w.expiry_date, w.notes || null);
    triggerUrgentWarrantySync().catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:saveWarranty]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getWarranties` */
export function getWarranties({ tenant_id, search }: { tenant_id: string; search?: string }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    const { statement, params } = warrantiesSql.getWarrantiesStatement(db, { tenant_id, search });
    return statement.all(...params);
  } catch (error: any) {
    console.error('[db:getWarranties]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:deleteWarranty` */
export function deleteWarranty(warrantyId: string) {
  try {
    const db = getDb();
    warrantiesSql.deleteWarrantyByWarrantyId(db).run(warrantyId);
    triggerUrgentWarrantySync().catch(() => {});
    return { success: true };
  } catch (error: any) {
    console.error('[db:deleteWarranty]', error);
    return { success: false, error: 'Operation failed' };
  }
}
