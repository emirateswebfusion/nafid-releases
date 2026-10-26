import type { ComboRow } from './typesB.js';
import { getDb } from '../db/localDb.js';
import crypto from 'node:crypto';
import * as combosSql from '../db/statements/combos.js';
/** combos use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:getComboOffers` */
export function getComboOffers({ tenant_id, search, only_active }: { tenant_id: string; search?: string; only_active?: boolean }) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    
    const { statement, params } = combosSql.getComboOffersStatement(db, { tenant_id, only_active, search });
    const rows = statement.all(...params) as ComboRow[];

    return rows.map(r => {
      let items = [];
      try { items = JSON.parse(r.items_json || '[]'); } catch { /* ignore */ }
      return { ...r, items };
    });
  } catch (error) {
    console.error('[db:getComboOffers]', error);
    return [];
  }
}

/** IPC `db:getComboOfferDetails` */
export function getComboOfferDetails({ combo_id }: { combo_id: string }) {
  try {
    const db = getDb();
    if (!combo_id) return null;
    const combo = combosSql.findComboOffersByComboId(db).get(combo_id) as ComboRow;
    if (!combo) return null;

    const items = combosSql.findComboItemsByComboId(db).all(combo_id) as Record<string, unknown>[];

    return { ...combo, items };
  } catch (error) {
    console.error('[db:getComboOfferDetails]', error);
    return null;
  }
}

/** IPC `db:saveComboOffer` */
export function saveComboOffer(payload: {
  combo_id?: string;
  tenant_id: string;
  name: string;
  sku_barcode?: string;
  combo_price: number;
  is_active?: number;
  description?: string;
  items: Array<{ product_id: string; quantity: number }>;
}) {
  try {
    const db = getDb();
    const { combo_id: reqComboId, tenant_id, name, sku_barcode, combo_price, is_active, description, items } = payload;
    if (!tenant_id || !name || !items || items.length === 0) {
      return { success: false, error: 'Name and items are required' };
    }

    const cleanBarcode = (sku_barcode || '').trim() || null;
    const combo_id = reqComboId || crypto.randomUUID();

    const tx = db.transaction(() => {
      combosSql.upsertComboOffer(db).run(
        combo_id,
        tenant_id,
        name.trim(),
        cleanBarcode,
        Number(combo_price) || 0,
        is_active ?? 1,
        description?.trim() || null
      );

      combosSql.deleteComboItemByComboId(db).run(combo_id);
      const insertItem = combosSql.insertComboItem(db);
      for (const item of items) {
        insertItem.run(
          crypto.randomUUID(),
          combo_id,
          tenant_id,
          item.product_id,
          Number(item.quantity) || 1
        );
      }
    });

    tx();
    return { success: true, combo_id };
  } catch (error) {
    console.error('[db:saveComboOffer]', error);
    return { success: false, error: (error as Error).message || 'Operation failed' };
  }
}

/** IPC `db:deleteComboOffer` */
export function deleteComboOffer({ combo_id }: { combo_id: string }) {
  try {
    const db = getDb();
    if (!combo_id) return { success: false, error: 'Missing combo ID' };
    combosSql.updateComboOfferIsDeleted(db).run(combo_id);
    return { success: true };
  } catch (error) {
    console.error('[db:deleteComboOffer]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:toggleComboOfferActive` */
export function toggleComboOfferActive({ combo_id, is_active }: { combo_id: string; is_active: number }) {
  try {
    const db = getDb();
    if (!combo_id) return { success: false, error: 'Missing combo ID' };
    combosSql.updateComboOfferIsActive(db).run(is_active ? 1 : 0, combo_id);
    return { success: true };
  } catch (error) {
    console.error('[db:toggleComboOfferActive]', error);
    return { success: false, error: 'Operation failed' };
  }
}
