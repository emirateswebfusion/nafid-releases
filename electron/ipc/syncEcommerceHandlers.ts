import { ipcMain } from 'electron';
import { getDb } from '../db/localDb.js';
import { FusionCartBridge } from '../services/fusionCartBridge.js';
import {
  safeHandler,
  validateString,
  validateNumber,
  validateOptionalString,
  validateOptionalNumber,
  validateObject,
  validateArray
} from './common.js';

export function registerSyncEcommerceHandlers(): void {
ipcMain.handle('sync:clearPending', async (event, { tenant_id, type, records }: { tenant_id: string; type: 'invoices' | 'products' | 'all'; records?: string[] }) => {
  try {
    const db = getDb();
    
    if (type === 'invoices' || type === 'all') {
      if (records && records.length > 0) {
        const placeholders = records.map(() => '?').join(',');
        db.prepare(`UPDATE invoices SET sync_status = 'SYNCED' WHERE invoice_id IN (${placeholders}) AND tenant_id = ?`).run(...records, tenant_id);
        console.log(`[Sync] Force-cleared ${records.length} stuck invoice(s) from sync queue`);
      }
    }
    
    if (type === 'products' || type === 'all') {
      if (records && records.length > 0) {
        const placeholders = records.map(() => '?').join(',');
        db.prepare(`UPDATE products SET sync_status = 'SYNCED' WHERE product_id IN (${placeholders}) AND tenant_id = ?`).run(...records, tenant_id);
        console.log(`[Sync] Force-cleared ${records.length} stuck product(s) from sync queue`);
      }
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('[sync:clearPending]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

// â”€â”€ Diagnostic: Get stuck PENDING sync records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ipcMain.handle('sync:getPending', async (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const invoices = db.prepare(
      `SELECT invoice_id, invoice_number, invoice_type, balance_amount, received_amount, 
              grand_total, subtotal, sync_status, created_at 
       FROM invoices WHERE sync_status = 'PENDING' AND tenant_id = ?`
    ).all(tenant_id);
    const products = db.prepare(
      `SELECT product_id, name, print_status, sync_status, created_at 
       FROM products WHERE sync_status = 'PENDING' AND tenant_id = ?`
    ).all(tenant_id);
    return { success: true, pending: { invoices, products } };
  } catch (error: any) {
    console.error('[sync:getPending]', error);
    return { success: false, error: error.message || 'Operation failed' };
  }
});

ipcMain.handle('sync:runInitial', async (event) => {
  const { runInitialSync } = await import('../sync/syncWorker.js');
  return runInitialSync(event.sender);
});

ipcMain.handle('sync:getCloudAccessState', async (_event, tenantId?: string) => {
  try {
    const { calculateEffectiveCloudAccess } = await import('../sync/syncWorker.js');
    return calculateEffectiveCloudAccess(tenantId);
  } catch (err: any) {
    console.error('[Main] sync:getCloudAccessState error:', err.message);
    return null;
  }
});

ipcMain.handle('sync:updateCloudAccessConfig', async (_event, payload: { config: any; tenant_id?: string }) => {
  try {
    const { updateCloudAccessConfig } = await import('../sync/syncWorker.js');
    return updateCloudAccessConfig(payload.config, payload.tenant_id);
  } catch (err: any) {
    console.error('[Main] sync:updateCloudAccessConfig error:', err.message);
    return null;
  }
});

ipcMain.handle('sync:drainPendingCloudQueue', async (event) => {
  try {
    const { drainPendingCloudQueue } = await import('../sync/syncWorker.js');
    return drainPendingCloudQueue(event.sender);
  } catch (err: any) {
    console.error('[Main] sync:drainPendingCloudQueue error:', err.message);
    return { success: false, drainedCount: 0, message: err.message };
  }
});

ipcMain.handle('sync:setPageContext', async (_event, payload: { page: string; active: boolean }) => {
  try {
    const { setPageContext } = await import('../sync/syncWorker.js');
    setPageContext(payload?.page || null, !!payload?.active);
    return { success: true };
  } catch (err: any) {
    console.error('[Main] sync:setPageContext error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── E-Commerce / FusionCart Integration Handlers ─────────────────────────
const fusionCartBridge = new FusionCartBridge();

ipcMain.removeHandler('ecommerce:getSettings');
ipcMain.handle('ecommerce:getSettings', (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    let row = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid) as any;
    if (!row) {
      db.prepare(`
        INSERT INTO ecommerce_settings (tenant_id, fusioncart_url, registration_status)
        VALUES (?, 'http://localhost:5050/api', 'NOT_REQUESTED')
      `).run(tid);
      row = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid);
    }
    return { success: true, settings: row };
  } catch (err: any) {
    console.error('[ecommerce:getSettings]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.removeHandler('ecommerce:saveSettings');
ipcMain.handle('ecommerce:saveSettings', (event, { tenant_id, settings }: { tenant_id: string; settings: any }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    db.prepare(`
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
    `).run(
      tid,
      settings.fusioncart_url || 'http://localhost:5050/api',
      settings.store_name || null,
      settings.store_slug || null,
      settings.store_description || null,
      settings.contact_email || null,
      settings.contact_phone || null
    );

    fusionCartBridge.setBaseUrl(settings.fusioncart_url || 'http://localhost:5050/api');

    const updated = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid);
    return { success: true, settings: updated };
  } catch (err: any) {
    console.error('[ecommerce:saveSettings]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.removeHandler('ecommerce:testConnection');
ipcMain.handle('ecommerce:testConnection', async (event, { url }: { url?: string }) => {
  try {
    if (url) fusionCartBridge.setBaseUrl(url);
    const result = await fusionCartBridge.testConnection();
    return result;
  } catch (err: any) {
    return { connected: false, message: err.message };
  }
});

ipcMain.removeHandler('ecommerce:registerVendor');
ipcMain.handle('ecommerce:registerVendor', async (event, { tenant_id, data }: { tenant_id: string; data: any }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    // Verify shop ownership / tenant
    const currentSettings = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid) as any;
    if (currentSettings?.fusioncart_url) {
      fusionCartBridge.setBaseUrl(currentSettings.fusioncart_url);
    }

    const regResult = await fusionCartBridge.registerVendor({
      store_name: data.store_name,
      slug: data.store_slug,
      description: data.store_description,
      city: data.city,
      address: data.address,
      pincode: data.pincode,
      name: data.contact_name || data.name,
      email: data.contact_email || data.email,
      phone: data.contact_phone || data.phone,
    });

    if (!regResult.success) {
      // Record failure log
      db.prepare(`
        INSERT INTO ecommerce_sync_logs (log_id, tenant_id, event_type, status, details)
        VALUES (?, ?, 'REGISTER', 'FAILED', ?)
      `).run(crypto.randomUUID(), tid, JSON.stringify({ error: regResult.error }));

      db.prepare(`
        UPDATE ecommerce_settings 
        SET last_sync_status = 'FAILED', last_sync_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
      `).run(tid);

      return { success: false, error: regResult.error };
    }

    const store = regResult.store;
    const storeId = store.id || null;
    const vendorId = store.vendor_id || store.vendor?.id || null;
    const regStatus = store.is_approved === 1 ? 'APPROVED' : 'PENDING';

    db.prepare(`
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
    `).run(storeId, vendorId, store.store_name || data.store_name, store.slug || data.store_slug, regStatus, tid);

    db.prepare(`
      INSERT INTO ecommerce_sync_logs (log_id, tenant_id, event_type, status, details)
      VALUES (?, ?, 'REGISTER', 'SUCCESS', ?)
    `).run(crypto.randomUUID(), tid, JSON.stringify({ storeId, vendorId, regStatus }));

    const updatedSettings = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid);
    return { success: true, settings: updatedSettings };
  } catch (err: any) {
    console.error('[ecommerce:registerVendor]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.removeHandler('ecommerce:refreshStatus');
ipcMain.handle('ecommerce:refreshStatus', async (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    const settings = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid) as any;
    if (!settings || (!settings.store_id && !settings.store_slug)) {
      return { success: true, settings };
    }

    if (settings.fusioncart_url) {
      fusionCartBridge.setBaseUrl(settings.fusioncart_url);
    }

    const target = settings.store_id || settings.store_slug;
    const res = await fusionCartBridge.getStore(target);
    if (!res.success) {
      db.prepare(`
        UPDATE ecommerce_settings SET
          registration_status = 'CONNECTION_ERROR',
          last_sync_status = 'FAILED',
          last_sync_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
      `).run(tid);
      return { success: false, error: res.error, settings: db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid) };
    }

    const store = res.store;
    let newStatus = 'PENDING';
    if (store.status === 0) {
      newStatus = 'SUSPENDED';
    } else if (store.is_approved === 1) {
      newStatus = 'ACTIVE';
    } else if (store.is_approved === -1) {
      newStatus = 'REJECTED';
    }

    db.prepare(`
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
    `).run(
      store.id || settings.store_id,
      store.vendor_id || store.vendor?.id || settings.vendor_id,
      store.store_name || settings.store_name,
      store.slug || settings.store_slug,
      newStatus,
      tid
    );

    const updated = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid);
    return { success: true, settings: updated, store };
  } catch (err: any) {
    console.error('[ecommerce:refreshStatus]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.removeHandler('ecommerce:getProducts');
ipcMain.handle('ecommerce:getProducts', (event, { tenant_id, search, filter }: { tenant_id: string; search?: string; filter?: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

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

    const products = db.prepare(query).all(...params);
    return { success: true, products };
  } catch (err: any) {
    console.error('[ecommerce:getProducts]', err);
    return { success: false, error: err.message, products: [] };
  }
});

ipcMain.removeHandler('ecommerce:updateMapping');
ipcMain.handle('ecommerce:updateMapping', (event, {
  tenant_id,
  product_id,
  is_online_enabled,
  online_title_override,
  online_description_override,
  online_price_override,
}: {
  tenant_id: string;
  product_id: string;
  is_online_enabled?: boolean;
  online_title_override?: string | null;
  online_description_override?: string | null;
  online_price_override?: number | null;
}) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    let existing = db.prepare('SELECT * FROM ecommerce_product_mappings WHERE tenant_id = ? AND product_id = ?').get(tid, product_id) as any;
    if (!existing) {
      const mappingId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO ecommerce_product_mappings (
          id, tenant_id, product_id, is_online_enabled,
          online_title_override, online_description_override, online_price_override,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        mappingId,
        tid,
        product_id,
        is_online_enabled ? 1 : 0,
        online_title_override ?? null,
        online_description_override ?? null,
        online_price_override ?? null
      );
      existing = db.prepare('SELECT * FROM ecommerce_product_mappings WHERE id = ?').get(mappingId);
    } else {
      const newEnabled = is_online_enabled !== undefined ? (is_online_enabled ? 1 : 0) : existing.is_online_enabled;
      const newTitle = online_title_override !== undefined ? online_title_override : existing.online_title_override;
      const newDesc = online_description_override !== undefined ? online_description_override : existing.online_description_override;
      const newPrice = online_price_override !== undefined ? online_price_override : existing.online_price_override;

      db.prepare(`
        UPDATE ecommerce_product_mappings SET
          is_online_enabled = ?,
          online_title_override = ?,
          online_description_override = ?,
          online_price_override = ?,
          sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND product_id = ?
      `).run(newEnabled, newTitle, newDesc, newPrice, tid, product_id);

      existing = db.prepare('SELECT * FROM ecommerce_product_mappings WHERE tenant_id = ? AND product_id = ?').get(tid, product_id);
    }

    return { success: true, mapping: existing };
  } catch (err: any) {
    console.error('[ecommerce:updateMapping]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.removeHandler('ecommerce:syncProduct');
ipcMain.handle('ecommerce:syncProduct', async (event, { tenant_id, product_id }: { tenant_id: string; product_id: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    const settings = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid) as any;
    if (!settings || !settings.store_id) {
      return { success: false, error: 'Shop is not registered or approved on FusionCart yet.' };
    }

    if (settings.fusioncart_url) {
      fusionCartBridge.setBaseUrl(settings.fusioncart_url);
    }

    const prod = db.prepare('SELECT * FROM products WHERE product_id = ? AND (tenant_id = ? OR tenant_id IS NULL)').get(product_id, tid) as any;
    if (!prod) {
      return { success: false, error: 'Product not found in POS database.' };
    }

    const mapping = db.prepare('SELECT * FROM ecommerce_product_mappings WHERE tenant_id = ? AND product_id = ?').get(tid, product_id) as any;
    const isOnline = mapping ? Boolean(mapping.is_online_enabled) : true;
    const price = mapping?.online_price_override ? Number(mapping.online_price_override) : Number(prod.base_price);
    const title = mapping?.online_title_override?.trim() || prod.name;
    const desc = mapping?.online_description_override?.trim() || `<p>${prod.name}</p>`;

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + `-${prod.sku_barcode || prod.product_id.slice(0, 6)}`;

    const payload = {
      name: title,
      slug,
      short_description: title,
      description: desc,
      type: 'physical',
      price: price,
      sale_price: price,
      quantity: Math.max(0, Math.floor(prod.current_stock || 0)),
      sku: prod.sku_barcode || `SKU-${prod.product_id.slice(0, 8)}`,
      store_id: Number(settings.store_id),
      status: isOnline ? 1 : 0,
      is_approved: 1,
      stock_status: (prod.current_stock > 0 ? 'in_stock' : 'out_of_stock') as 'in_stock' | 'out_of_stock',
    };

    const res = await fusionCartBridge.syncProduct(mapping?.fusioncart_product_id || null, payload);

    if (!res.success) {
      db.prepare(`
        INSERT INTO ecommerce_product_mappings (
          id, tenant_id, product_id, sync_status, last_error, updated_at
        ) VALUES (?, ?, ?, 'FAILED', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, product_id) DO UPDATE SET
          sync_status = 'FAILED',
          last_error = excluded.last_error,
          updated_at = CURRENT_TIMESTAMP
      `).run(crypto.randomUUID(), tid, product_id, res.error);

      return { success: false, error: res.error };
    }

    const remoteProd = res.product;
    const remoteId = remoteProd?.id || mapping?.fusioncart_product_id;

    db.prepare(`
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
    `).run(crypto.randomUUID(), tid, product_id, remoteId, isOnline ? 1 : 0);

    return { success: true, remoteId };
  } catch (err: any) {
    console.error('[ecommerce:syncProduct]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.removeHandler('ecommerce:unpublishProduct');
ipcMain.handle('ecommerce:unpublishProduct', async (event, { tenant_id, product_id }: { tenant_id: string; product_id: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    const settings = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid) as any;
    if (settings?.fusioncart_url) {
      fusionCartBridge.setBaseUrl(settings.fusioncart_url);
    }

    const mapping = db.prepare('SELECT * FROM ecommerce_product_mappings WHERE tenant_id = ? AND product_id = ?').get(tid, product_id) as any;
    if (mapping?.fusioncart_product_id) {
      await fusionCartBridge.unpublishProduct(mapping.fusioncart_product_id);
    }

    db.prepare(`
      UPDATE ecommerce_product_mappings SET
        is_online_enabled = 0,
        sync_status = 'SYNCED',
        updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND product_id = ?
    `).run(tid, product_id);

    return { success: true };
  } catch (err: any) {
    console.error('[ecommerce:unpublishProduct]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.removeHandler('ecommerce:getOrders');
ipcMain.handle('ecommerce:getOrders', async (event, { tenant_id }: { tenant_id: string }) => {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    const settings = db.prepare('SELECT * FROM ecommerce_settings WHERE tenant_id = ?').get(tid) as any;
    if (!settings || !settings.store_id) {
      return { success: true, orders: [] };
    }

    if (settings.fusioncart_url) {
      fusionCartBridge.setBaseUrl(settings.fusioncart_url);
    }

    const res = await fusionCartBridge.getOrders(Number(settings.store_id));
    if (!res.success) {
      return { success: false, error: res.error, orders: [] };
    }

    return { success: true, orders: res.orders || [] };
  } catch (err: any) {
    console.error('[ecommerce:getOrders]', err);
    return { success: false, error: err.message, orders: [] };
  }
});


ipcMain.handle('sync:resetFastPollBackoff', async () => {
  try {
    const { resetFastPollBackoff } = await import('../sync/syncWorker.js');
    resetFastPollBackoff();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sync:forceResyncInvoices', async (event) => {
  const { forceResyncInvoices } = await import('../sync/syncWorker.js');
  return forceResyncInvoices(event.sender);
});

ipcMain.handle('sync:getProgress', async () => {
  const { getSyncProgress } = await import('../sync/syncWorker.js');
  return getSyncProgress();
});

ipcMain.handle('sync:testConnection', async (_event, payload: { syncMode?: string; lanRole?: string; lanHostIp?: string; lanPort?: number }) => {
  const syncMode = payload?.syncMode || 'HYBRID';
  const lanRole = payload?.lanRole || 'SECONDARY';
  const rawHost = payload?.lanHostIp || '';
  const port = Number(payload?.lanPort) || 3888;
  const cleanHost = String(rawHost).trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
  const defaultCloud = (process.env.VENDORA_CLOUD_API || process.env.NAFID_CLOUD_API || process.env.VITE_CLOUD_API || '').replace(/\/$/, '');

  if (syncMode === 'LAN' || syncMode === 'HYBRID') {
    if (lanRole === 'PRIMARY') {
      return {
        ok: true,
        route: 'LAN',
        message: `Wifi Sync Active â€” This PC is Primary Master Server (Port ${port})`
      };
    }

    const host = cleanHost || process.env.DEFAULT_LAN_IP || '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`http://${host}:${port}/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        return {
          ok: true,
          route: 'LAN',
          message: `Wifi Sync Active â€” Connected to Primary Master Server (${host}:${port})`
        };
      } else if (syncMode === 'HYBRID') {
        try {
          const cloudCtrl = new AbortController();
          const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
          const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
          clearTimeout(cloudTimeout);
          if (cloudRes.ok) {
            return {
              ok: true,
              route: 'CLOUD',
              fallback: true,
              message: `Cloud Sync Active (Hybrid Fallback) â€” LAN Master Server (${host}) returned status ${res.status}. Syncing via Cloud API.`
            };
          }
        } catch {}
        return {
          ok: false,
          error: `Sync Inactive â€” Master Server (${host}) returned status ${res.status}`
        };
      } else {
        return {
          ok: false,
          error: `Sync Inactive â€” Master Server (${host}) returned status ${res.status}`
        };
      }
    } catch {
      if (syncMode === 'HYBRID') {
        try {
          const cloudCtrl = new AbortController();
          const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
          const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
          clearTimeout(cloudTimeout);
          if (cloudRes.ok) {
            return {
              ok: true,
              route: 'CLOUD',
              fallback: true,
              message: `Cloud Sync Active (Hybrid Fallback) â€” LAN Master Server (${host}) unreachable. Automatically syncing via Cloud API!`
            };
          }
        } catch {}
      }
      return {
        ok: false,
        error: `Sync Inactive â€” Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
      };
    }
  } else {
    try {
      const cloudCtrl = new AbortController();
      const cloudTimeout = setTimeout(() => cloudCtrl.abort(), 3500);
      const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: cloudCtrl.signal });
      clearTimeout(cloudTimeout);
      if (cloudRes.ok) {
        return {
          ok: true,
          route: 'CLOUD',
          message: `Cloud Sync Active â€” Connected to Cloud API server`
        };
      }
    } catch {}
    return {
      ok: false,
      error: `Sync Inactive â€” Cloud API server (${defaultCloud}) is unreachable.`
    };
  }
});


}
