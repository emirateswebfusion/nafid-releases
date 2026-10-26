import { getDb } from '../db/localDb.js';
import { FusionCartBridge } from './fusionCartBridge.js';
import * as ecommerceSql from '../db/statements/ecommerce.js';
/** ecommerce use-cases for the main process (called by electron/ipc handlers). */

const fusionCartBridge = new FusionCartBridge();

/** IPC `ecommerce:getSettings` */
export function getSettings({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    let row = ecommerceSql.findEcommerceSettings(db).get(tid) as any;
    if (!row) {
      ecommerceSql.insertEcommerceSetting(db).run(tid);
      row = ecommerceSql.findEcommerceSettings(db).get(tid);
    }
    return { success: true, settings: row };
  } catch (err) {
    console.error('[ecommerce:getSettings]', err);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `ecommerce:saveSettings` */
export function saveSettings({ tenant_id, settings }: { tenant_id: string; settings: any }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    ecommerceSql.upsertEcommerceSetting(db).run(
      tid,
      settings.fusioncart_url || 'http://localhost:5050/api',
      settings.store_name || null,
      settings.store_slug || null,
      settings.store_description || null,
      settings.contact_email || null,
      settings.contact_phone || null
    );

    fusionCartBridge.setBaseUrl(settings.fusioncart_url || 'http://localhost:5050/api');

    const updated = ecommerceSql.findEcommerceSettings(db).get(tid);
    return { success: true, settings: updated };
  } catch (err) {
    console.error('[ecommerce:saveSettings]', err);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `ecommerce:testConnection` */
export async function testConnection({ url }: { url?: string }) {
  try {
    if (url) fusionCartBridge.setBaseUrl(url);
    const result = await fusionCartBridge.testConnection();
    return result;
  } catch (err) {
    return { connected: false, message: (err as Error).message };
  }
}

/** IPC `ecommerce:registerVendor` */
export async function registerVendor({ tenant_id, data }: { tenant_id: string; data: any }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    // Verify shop ownership / tenant
    const currentSettings = ecommerceSql.findEcommerceSettings(db).get(tid) as any;
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
      ecommerceSql.insertEcommerceSyncLog(db).run(crypto.randomUUID(), tid, JSON.stringify({ error: regResult.error }));

      ecommerceSql.updateEcommerceSettingLastSyncStatusAndLastSyncAt(db).run(tid);

      return { success: false, error: regResult.error };
    }

    const store = regResult.store;
    const storeId = store.id || null;
    const vendorId = store.vendor_id || store.vendor?.id || null;
    const regStatus = store.is_approved === 1 ? 'APPROVED' : 'PENDING';

    ecommerceSql.updateEcommerceSetting(db).run(storeId, vendorId, store.store_name || data.store_name, store.slug || data.store_slug, regStatus, tid);

    ecommerceSql.insertEcommerceSyncLog2(db).run(crypto.randomUUID(), tid, JSON.stringify({ storeId, vendorId, regStatus }));

    const updatedSettings = ecommerceSql.findEcommerceSettings(db).get(tid);
    return { success: true, settings: updatedSettings };
  } catch (err) {
    console.error('[ecommerce:registerVendor]', err);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `ecommerce:refreshStatus` */
export async function refreshStatus({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    const settings = ecommerceSql.findEcommerceSettings(db).get(tid) as any;
    if (!settings || (!settings.store_id && !settings.store_slug)) {
      return { success: true, settings };
    }

    if (settings.fusioncart_url) {
      fusionCartBridge.setBaseUrl(settings.fusioncart_url);
    }

    const target = settings.store_id || settings.store_slug;
    const res = await fusionCartBridge.getStore(target);
    if (!res.success) {
      ecommerceSql.updateEcommerceSetting2(db).run(tid);
      return { success: false, error: res.error, settings: ecommerceSql.findEcommerceSettings(db).get(tid) };
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

    ecommerceSql.updateEcommerceSetting(db).run(
      store.id || settings.store_id,
      store.vendor_id || store.vendor?.id || settings.vendor_id,
      store.store_name || settings.store_name,
      store.slug || settings.store_slug,
      newStatus,
      tid
    );

    const updated = ecommerceSql.findEcommerceSettings(db).get(tid);
    return { success: true, settings: updated, store };
  } catch (err) {
    console.error('[ecommerce:refreshStatus]', err);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `ecommerce:getProducts` */
export function getProducts({ tenant_id, search, filter }: { tenant_id: string; search?: string; filter?: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    const { statement, params } = ecommerceSql.getProductsStatement(db, { tid, search, filter });

    const products = statement.all(...params);
    return { success: true, products };
  } catch (err) {
    console.error('[ecommerce:getProducts]', err);
    return { success: false, error: (err as Error).message, products: [] };
  }
}

/** IPC `ecommerce:updateMapping` */
export function updateMapping({
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
}) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    let existing = ecommerceSql.findEcommerceProductMappingsByProductId(db).get(tid, product_id) as any;
    if (!existing) {
      const mappingId = crypto.randomUUID();
      ecommerceSql.insertEcommerceProductMapping(db).run(
        mappingId,
        tid,
        product_id,
        is_online_enabled ? 1 : 0,
        online_title_override ?? null,
        online_description_override ?? null,
        online_price_override ?? null
      );
      existing = ecommerceSql.findEcommerceProductMappingsById(db).get(mappingId);
    } else {
      const newEnabled = is_online_enabled !== undefined ? (is_online_enabled ? 1 : 0) : existing.is_online_enabled;
      const newTitle = online_title_override !== undefined ? online_title_override : existing.online_title_override;
      const newDesc = online_description_override !== undefined ? online_description_override : existing.online_description_override;
      const newPrice = online_price_override !== undefined ? online_price_override : existing.online_price_override;

      ecommerceSql.updateEcommerceProductMappingByProductId(db).run(newEnabled, newTitle, newDesc, newPrice, tid, product_id);

      existing = ecommerceSql.findEcommerceProductMappingsByProductId(db).get(tid, product_id);
    }

    return { success: true, mapping: existing };
  } catch (err) {
    console.error('[ecommerce:updateMapping]', err);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `ecommerce:syncProduct` */
export async function syncProduct({ tenant_id, product_id }: { tenant_id: string; product_id: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    const settings = ecommerceSql.findEcommerceSettings(db).get(tid) as any;
    if (!settings || !settings.store_id) {
      return { success: false, error: 'Shop is not registered or approved on FusionCart yet.' };
    }

    if (settings.fusioncart_url) {
      fusionCartBridge.setBaseUrl(settings.fusioncart_url);
    }

    const prod = ecommerceSql.findProductsByProductId(db).get(product_id, tid) as any;
    if (!prod) {
      return { success: false, error: 'Product not found in POS database.' };
    }

    const mapping = ecommerceSql.findEcommerceProductMappingsByProductId(db).get(tid, product_id) as any;
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
      ecommerceSql.upsertEcommerceProductMapping(db).run(crypto.randomUUID(), tid, product_id, res.error);

      return { success: false, error: res.error };
    }

    const remoteProd = res.product;
    const remoteId = remoteProd?.id || mapping?.fusioncart_product_id;

    ecommerceSql.upsertEcommerceProductMapping2(db).run(crypto.randomUUID(), tid, product_id, remoteId, isOnline ? 1 : 0);

    return { success: true, remoteId };
  } catch (err) {
    console.error('[ecommerce:syncProduct]', err);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `ecommerce:unpublishProduct` */
export async function unpublishProduct({ tenant_id, product_id }: { tenant_id: string; product_id: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    const settings = ecommerceSql.findEcommerceSettings(db).get(tid) as any;
    if (settings?.fusioncart_url) {
      fusionCartBridge.setBaseUrl(settings.fusioncart_url);
    }

    const mapping = ecommerceSql.findEcommerceProductMappingsByProductId(db).get(tid, product_id) as any;
    if (mapping?.fusioncart_product_id) {
      await fusionCartBridge.unpublishProduct(mapping.fusioncart_product_id);
    }

    ecommerceSql.updateEcommerceProductMappingIsOnlineEnabled(db).run(tid, product_id);

    return { success: true };
  } catch (err) {
    console.error('[ecommerce:unpublishProduct]', err);
    return { success: false, error: (err as Error).message };
  }
}

/** IPC `ecommerce:getOrders` */
export async function getOrders({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';

    const settings = ecommerceSql.findEcommerceSettings(db).get(tid) as any;
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
  } catch (err) {
    console.error('[ecommerce:getOrders]', err);
    return { success: false, error: (err as Error).message, orders: [] };
  }
}
