import type { Db } from './types.js';

/** SQL statements used by services/ecommerceService.ts. Each factory prepares its statement on the given connection. */

export const findEcommerceSettings = (db: Db) => db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?');

export const insertEcommerceSetting = (db: Db) => db.prepare(`
        INSERT INTO ecommerce_settings (tenant_id, fusioncart_url, registration_status)
        VALUES (?, 'http://localhost:5050/api', 'NOT_REQUESTED')
      `);

export const upsertEcommerceSetting = (db: Db) => db.prepare(`
      INSERT INTO ecommerce_settings (
        tenant_id, fusioncart_url, store_name, store_slug, store_description,
        contact_email, contact_phone, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id) DO UPDATE SET
        fusioncart_url = excluded.fusioncart_url,
        store_name = excluded.store_name,
        store_slug = excluded.store_slug,
        store_description = excluded.store_description,
        contact_email = excluded.contact_email,
        contact_phone = excluded.contact_phone,
        updated_at = CURRENT_TIMESTAMP
    `);

export const insertEcommerceSyncLog = (db: Db) => db.prepare(`
        INSERT INTO ecommerce_sync_logs (log_id, tenant_id, event_type, status, details)
        VALUES (?, ?, 'REGISTER', 'FAILED', ?)
      `);

export const updateEcommerceSettingLastSyncStatusAndLastSyncAt = (db: Db) => db.prepare(`
        UPDATE ecommerce_settings 
        SET last_sync_status = 'FAILED', last_sync_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
      `);

export const updateEcommerceSetting = (db: Db) => db.prepare(`
      UPDATE ecommerce_settings SET
        store_id = ?,
        vendor_id = ?,
        store_name = ?,
        store_slug = ?,
        registration_status = ?,
        last_sync_status = 'SUCCESS',
        last_sync_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `);

export const insertEcommerceSyncLog2 = (db: Db) => db.prepare(`
      INSERT INTO ecommerce_sync_logs (log_id, tenant_id, event_type, status, details)
      VALUES (?, ?, 'REGISTER', 'SUCCESS', ?)
    `);

export const updateEcommerceSetting2 = (db: Db) => db.prepare(`
        UPDATE ecommerce_settings SET
          registration_status = 'CONNECTION_ERROR',
          last_sync_status = 'FAILED',
          last_sync_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
      `);

export const findEcommerceProductMappingsByProductId = (db: Db) => db.prepare('SELECT * FROM ecommerce_product_mappings WHERE tenant_id = ? AND product_id = ?');

export const insertEcommerceProductMapping = (db: Db) => db.prepare(`
        INSERT INTO ecommerce_product_mappings (
          id, tenant_id, product_id, is_online_enabled,
          online_title_override, online_description_override, online_price_override,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `);

export const findEcommerceProductMappingsById = (db: Db) => db.prepare('SELECT * FROM ecommerce_product_mappings WHERE id = ?');

export const updateEcommerceProductMappingByProductId = (db: Db) => db.prepare(`
        UPDATE ecommerce_product_mappings SET
          is_online_enabled = ?,
          online_title_override = ?,
          online_description_override = ?,
          online_price_override = ?,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND product_id = ?
      `);

export const findProductsByProductId = (db: Db) => db.prepare('SELECT * FROM products WHERE product_id = ? AND (tenant_id = ? OR tenant_id IS NULL)');

export const upsertEcommerceProductMapping = (db: Db) => db.prepare(`
        INSERT INTO ecommerce_product_mappings (
          id, tenant_id, product_id, sync_status, last_error, updated_at
        ) VALUES (?, ?, ?, 'FAILED', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, product_id) DO UPDATE SET
          sync_status = 'FAILED',
          last_error = excluded.last_error,
          updated_at = CURRENT_TIMESTAMP
      `);

export const upsertEcommerceProductMapping2 = (db: Db) => db.prepare(`
      INSERT INTO ecommerce_product_mappings (
        id, tenant_id, product_id, fusioncart_product_id, is_online_enabled,
        sync_status, last_error, last_synced_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'SYNCED', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, product_id) DO UPDATE SET
        fusioncart_product_id = excluded.fusioncart_product_id,
        is_online_enabled = excluded.is_online_enabled,
        sync_status = 'SYNCED',
        last_error = NULL,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);

export const updateEcommerceProductMappingIsOnlineEnabled = (db: Db) => db.prepare(`
      UPDATE ecommerce_product_mappings SET
        is_online_enabled = 0,
        sync_status = 'SYNCED',
        updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND product_id = ?
    `);

/** Builds and prepares the dynamic query of `getProducts` (filters appended in code; user values are bound). */
export function getProductsStatement(db: Db, args: { tid: string; search: string | undefined; filter: string | undefined }) {
  const { tid, search, filter } = args;
  let query = `
    SELECT 
      p.product_id,
      p.tenant_id,
      p.name,
      p.sku_barcode,
      p.category,
      p.base_price,
      p.current_stock,
      p.uom,
      m.id as mapping_id,
      m.fusioncart_product_id,
      COALESCE(m.is_online_enabled, 0) as is_online_enabled,
      m.online_title_override,
      m.online_description_override,
      m.online_price_override,
      COALESCE(m.sync_status, 'UNSYNCED') as sync_status,
      m.last_error,
      m.last_synced_at
    FROM products p
    LEFT JOIN ecommerce_product_mappings m 
      ON p.product_id = m.product_id AND m.tenant_id = p.tenant_id
    WHERE (p.tenant_id = ? OR p.tenant_id IS NULL)
      AND p.is_deleted = 0
  `;
  const params: any[] = [tid];
  if (search && search.trim()) {
    query += ` AND (p.name LIKE ? OR p.sku_barcode LIKE ? OR p.category LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }
  if (filter === 'online') {
    query += ` AND m.is_online_enabled = 1`;
  } else if (filter === 'offline') {
    query += ` AND (m.is_online_enabled = 0 OR m.is_online_enabled IS NULL)`;
  } else if (filter === 'failed') {
    query += ` AND m.sync_status = 'FAILED'`;
  }
  query += ` ORDER BY m.is_online_enabled DESC, p.name ASC LIMIT 300`;
  return { statement: db.prepare(query), params };
}
