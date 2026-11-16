import type { Db } from './types.js';

/** SQL statements used by services/combosService.ts. Each factory prepares its statement on the given connection. */

export const findComboOffersByComboId = (db: Db) => db.prepare(`SELECT * FROM combo_offers WHERE combo_id = ? AND is_deleted = 0`);

export const findComboItemsByComboId = (db: Db) => db.prepare(`
      SELECT ci.*, p.name as product_name, p.base_price as product_price, p.current_stock as product_stock, p.sku_barcode, p.uom,
             p.tax_rate_percent, p.is_gst_applicable, p.hsn_sac_code
      FROM combo_items ci
      JOIN products p ON ci.product_id = p.product_id
      WHERE ci.combo_id = ? AND p.is_deleted = 0
    `);

export const upsertComboOffer = (db: Db) => db.prepare(`
        INSERT INTO combo_offers (combo_id, tenant_id, name, sku_barcode, combo_price, is_active, is_deleted, description, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(combo_id) DO UPDATE SET
          name = excluded.name,
          sku_barcode = excluded.sku_barcode,
          combo_price = excluded.combo_price,
          is_active = excluded.is_active,
          description = excluded.description,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
      `);

export const deleteComboItemByComboId = (db: Db) => db.prepare(`DELETE FROM combo_items WHERE combo_id = ?`);

export const insertComboItem = (db: Db) => db.prepare(`
        INSERT INTO combo_items (combo_item_id, combo_id, tenant_id, product_id, quantity, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

export const updateComboOfferIsDeleted = (db: Db) => db.prepare(`UPDATE combo_offers SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE combo_id = ?`);

export const updateComboOfferIsActive = (db: Db) => db.prepare(`UPDATE combo_offers SET is_active = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE combo_id = ?`);

/** Builds and prepares the dynamic query of `getComboOffers` (filters appended in code; user values are bound). */
export function getComboOffersStatement(db: Db, args: { tenant_id: string; only_active: boolean | undefined; search: string | undefined }) {
  const { tenant_id, only_active, search } = args;
  let query = `
    SELECT co.*, 
      (
        SELECT json_group_array(json_object(
          'combo_item_id', ci.combo_item_id,
          'product_id', ci.product_id,
          'quantity', ci.quantity,
          'product_name', p.name,
          'product_price', p.base_price,
          'product_stock', p.current_stock,
          'sku_barcode', p.sku_barcode,
          'uom', p.uom,
          'tax_rate_percent', p.tax_rate_percent,
          'is_gst_applicable', p.is_gst_applicable,
          'hsn_sac_code', p.hsn_sac_code
        ))
        FROM combo_items ci
        JOIN products p ON ci.product_id = p.product_id
        WHERE ci.combo_id = co.combo_id AND p.is_deleted = 0
      ) as items_json
    FROM combo_offers co
    WHERE co.tenant_id = ? AND co.is_deleted = 0
  `;
  const params: unknown[] = [tenant_id];
  if (only_active) {
    query += ` AND co.is_active = 1`;
  }
  if (search) {
    const cleanS = String(search).trim();
    const s = `%${cleanS}%`;
    const sClean = cleanS.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const cleanPattern = sClean.length > 0 ? `%${sClean}%` : s;
    query += ` AND (co.name LIKE ? OR co.sku_barcode LIKE ? OR co.description LIKE ? OR CLEAN_STR(co.name) LIKE ? OR CLEAN_STR(co.sku_barcode) LIKE ? OR CLEAN_STR(co.description) LIKE ?)`;
    params.push(s, s, s, cleanPattern, cleanPattern, cleanPattern);
  }
  query += ` ORDER BY co.name COLLATE NOCASE ASC`;
  return { statement: db.prepare(query), params };
}
