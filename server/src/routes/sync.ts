import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { withTenantContext } from '../db/pg';
import { sendLowStockAlert, sendSyncErrorAlert } from '../services/notifications';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/sync/invoices
 * Called by the Edge Sync Worker when internet is available.
 * Accepts a batch of offline invoices (each with its line items) and upserts them idempotently.
 * Also deducts stock from the cloud products table to keep it in sync.
 */
router.post('/invoices', async (req: Request, res: Response) => {
  const invoices: any[] = req.body.invoices;

  if (!Array.isArray(invoices) || invoices.length === 0) {
    return res.status(400).json({ error: 'invoices array is required' });
  }

  const synced: string[] = [];
  const failed: { invoice_id: string; error: string }[] = [];

  for (const inv of invoices) {
    let currentInv = { ...inv };
    let retryCount = 0;
    let success = false;

    while (retryCount < 2 && !success) {
      try {
        await withTenantContext(req.auth!.tenant_id, async (client) => {
          // 1. Upsert invoice header — idempotent on invoice_id
          const { rowCount } = await client.query(
            `INSERT INTO invoices (
              invoice_id, tenant_id, invoice_number, invoice_type,
              customer_name, customer_phone, subtotal, tax_total,
              discount_total, discount_type, discount_value, grand_total, payment_method, user_id, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (invoice_id) DO UPDATE SET
              customer_name = EXCLUDED.customer_name,
              customer_phone = EXCLUDED.customer_phone,
              subtotal = EXCLUDED.subtotal,
              tax_total = EXCLUDED.tax_total,
              discount_total = EXCLUDED.discount_total,
              discount_type = EXCLUDED.discount_type,
              discount_value = EXCLUDED.discount_value,
              grand_total = EXCLUDED.grand_total,
              payment_method = EXCLUDED.payment_method,
              invoice_type = EXCLUDED.invoice_type
            WHERE invoices.tenant_id = EXCLUDED.tenant_id`,
            [
              currentInv.invoice_id, req.auth!.tenant_id, currentInv.invoice_number,
              currentInv.invoice_type, currentInv.customer_name, currentInv.customer_phone,
              currentInv.subtotal, currentInv.tax_total, currentInv.discount_total ?? 0,
              currentInv.discount_type || 'FIXED', currentInv.discount_value ?? 0,
              currentInv.grand_total, currentInv.payment_method ?? 'CASH', currentInv.user_id, currentInv.created_at ?? new Date()
            ]
          );

          if (Array.isArray(currentInv.items)) {
            for (const item of currentInv.items) {
              // 2. Insert invoice line item
              await client.query(
                `INSERT INTO invoice_items (
                  item_id, invoice_id, tenant_id, product_id,
                  name, quantity, unit_price, tax_amount, total
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (item_id) DO UPDATE SET
                  name = EXCLUDED.name,
                  quantity = EXCLUDED.quantity,
                  unit_price = EXCLUDED.unit_price,
                  tax_amount = EXCLUDED.tax_amount,
                  total = EXCLUDED.total
                WHERE invoice_items.tenant_id = EXCLUDED.tenant_id`,
                [
                  item.item_id, currentInv.invoice_id, req.auth!.tenant_id,
                  item.product_id, item.name, item.quantity, item.unit_price,
                  item.tax_amount, item.total
                ]
              );
            }
          }
        });
        synced.push(currentInv.invoice_id);
        success = true;
      } catch (err: any) {
        if (err.code === '23505' && err.constraint === 'uq_invoice_number_tenant') {
          // Auto-resolve invoice number collision
          const suffix = currentInv.invoice_id.substring(0, 4).toUpperCase();
          currentInv.invoice_number = `${currentInv.invoice_number}-${suffix}`;
          retryCount++;
        } else {
          failed.push({ invoice_id: currentInv.invoice_id, error: err.message });
          break; // Stop retrying on non-unique constraint errors
        }
      }
    }
    if (!success && retryCount >= 2) {
      failed.push({ invoice_id: currentInv.invoice_id, error: 'Max retries reached for unique constraint resolution' });
    }
  }

  // Send a sync error notification if any invoices failed
  if (failed.length > 0) {
    await sendSyncErrorAlert(req.auth!.tenant_id, failed.length).catch(() => {});
  }

  return res.json({
    synced_count: synced.length,
    failed_count: failed.length,
    synced,
    failed,
  });
});

/**
 * GET /api/sync/invoices
 * Called by Edge devices to pull historical invoices from the cloud.
 */
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const { search, limit, offset } = req.query;
    const parsedLimit = parseInt(limit as string) || 1000;
    const parsedOffset = parseInt(offset as string) || 0;

    const invoices = await withTenantContext(req.auth!.tenant_id, async (client) => {
      // 1. Fetch invoices
      let queryStr = `SELECT * FROM invoices WHERE tenant_id = $1`;
      const queryParams: any[] = [req.auth!.tenant_id];

      if (search && typeof search === 'string') {
        const lowerSearch = search.toLowerCase();
        queryStr += ` AND (LOWER(invoice_number) LIKE $2 OR LOWER(customer_phone) LIKE $2)`;
        queryParams.push(`%${lowerSearch}%`);
      }

      queryStr += ` ORDER BY created_at DESC, invoice_id ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(parsedLimit, parsedOffset);

      const invResult = await client.query(queryStr, queryParams);
      
      const invoices = invResult.rows;
      if (invoices.length === 0) return [];

      // 2. Fetch all items for these invoices
      const invIds = invoices.map(i => i.invoice_id);
      const itemsResult = await client.query(
        `SELECT * FROM invoice_items WHERE invoice_id = ANY($1)`,
        [invIds]
      );
      
      // 3. Group items by invoice_id
      const itemsMap: Record<string, any[]> = {};
      itemsResult.rows.forEach(item => {
        if (!itemsMap[item.invoice_id]) itemsMap[item.invoice_id] = [];
        itemsMap[item.invoice_id].push(item);
      });

      return invoices.map(inv => ({
        ...inv,
        items: itemsMap[inv.invoice_id] || []
      }));
    });

    return res.json(invoices);
  } catch (err: any) {
    console.error('[Sync] GET invoices error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sync/products
 * Batch upsert products from Edge (initial seed, edits, or stock adjustments).
 * Triggers low-stock notifications when current_stock drops to or below reorder_level.
 */
router.post('/products', async (req: Request, res: Response) => {
  const products: any[] = req.body.products;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'products array is required' });
  }

  const synced: string[] = [];
  const failed: { product_id: string; error: string }[] = [];

  for (const p of products) {
    let currentP = { ...p };
    let retryCount = 0;
    let success = false;

    while (retryCount < 2 && !success) {
      try {
        await withTenantContext(req.auth!.tenant_id, async (client) => {
          await client.query(
            `INSERT INTO products (
              product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
              purchase_price, base_price, is_gst_applicable, tax_rate_percent, uom,
              brand_manufacturer, current_stock, reorder_level, domain_attributes,
              discount_percent, discount_flat, offer_price, is_deleted,
              billing_type, grade_id, pricing_mode, average_weight_per_piece, weight_override_allowed,
              print_status, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
            ON CONFLICT (product_id) DO UPDATE SET
              name = EXCLUDED.name,
              sku_barcode = EXCLUDED.sku_barcode,
              item_code = EXCLUDED.item_code,
              category = EXCLUDED.category,
              hsn_sac_code = EXCLUDED.hsn_sac_code,
              purchase_price = EXCLUDED.purchase_price,
              base_price = EXCLUDED.base_price,
              is_gst_applicable = EXCLUDED.is_gst_applicable,
              tax_rate_percent = EXCLUDED.tax_rate_percent,
              uom = EXCLUDED.uom,
              brand_manufacturer = EXCLUDED.brand_manufacturer,
              current_stock = EXCLUDED.current_stock,
              reorder_level = EXCLUDED.reorder_level,
              domain_attributes = EXCLUDED.domain_attributes,
              discount_percent = EXCLUDED.discount_percent,
              discount_flat = EXCLUDED.discount_flat,
              offer_price = EXCLUDED.offer_price,
              is_deleted = EXCLUDED.is_deleted,
              billing_type = EXCLUDED.billing_type,
              grade_id = EXCLUDED.grade_id,
              pricing_mode = EXCLUDED.pricing_mode,
              average_weight_per_piece = EXCLUDED.average_weight_per_piece,
              weight_override_allowed = EXCLUDED.weight_override_allowed,
              print_status = EXCLUDED.print_status,
              created_at = COALESCE(products.created_at, EXCLUDED.created_at),
              updated_at = EXCLUDED.updated_at
            WHERE products.tenant_id = EXCLUDED.tenant_id`,
            [
              currentP.product_id, req.auth!.tenant_id, currentP.name, currentP.sku_barcode, currentP.item_code, currentP.category,
              currentP.hsn_sac_code, currentP.purchase_price ?? 0, currentP.base_price, currentP.is_gst_applicable ?? true, currentP.tax_rate_percent ?? 0,
              currentP.uom ?? 'Pcs', currentP.brand_manufacturer, currentP.current_stock ?? 0,
              currentP.reorder_level ?? 0,
              currentP.domain_attributes ? JSON.stringify(currentP.domain_attributes) : null,
              currentP.discount_percent ?? null, currentP.discount_flat ?? null, currentP.offer_price ?? null,
              currentP.is_deleted ?? false,
              currentP.billing_type || 'PIECE', currentP.grade_id || null, currentP.pricing_mode || 'FIXED_PRICE',
              currentP.average_weight_per_piece ?? null, !!currentP.weight_override_allowed,
              currentP.print_status || 'PENDING',
              currentP.created_at ?? new Date(),
              currentP.updated_at ?? new Date()
            ]
          );

          // Check for low stock — send alert if at or below reorder level
          if ((currentP.current_stock ?? 0) <= (currentP.reorder_level ?? 0) && (currentP.reorder_level ?? 0) > 0) {
            await sendLowStockAlert(req.auth!.tenant_id, currentP);
          }
        });
        synced.push(currentP.product_id);
        success = true;
      } catch (err: any) {
        if (err.code === '23505' && (err.constraint === 'uq_product_name_tenant' || err.constraint === 'uq_product_sku_tenant' || err.constraint === 'uq_product_item_code_tenant')) {
          const suffix = currentP.product_id.substring(0, 4).toUpperCase();
          if (err.constraint === 'uq_product_name_tenant') currentP.name = `${currentP.name} (${suffix})`;
          if (err.constraint === 'uq_product_sku_tenant') currentP.sku_barcode = `${currentP.sku_barcode}-${suffix}`;
          if (err.constraint === 'uq_product_item_code_tenant') currentP.item_code = `${currentP.item_code}-${suffix}`;
          retryCount++;
        } else {
          failed.push({ product_id: currentP.product_id, error: err.message });
          break;
        }
      }
    }
    if (!success && retryCount >= 2) {
      failed.push({ product_id: currentP.product_id, error: 'Max retries reached for unique constraint resolution' });
    }
  }

  return res.json({ synced_count: synced.length, failed_count: failed.length, synced, failed });
});

/**
 * GET /api/sync/product_grades
 */
router.get('/product_grades', async (req: Request, res: Response) => {
  try {
    const grades = await withTenantContext(req.auth!.tenant_id, async (client) => {
      const result = await client.query(
        `SELECT * FROM product_grades WHERE tenant_id = $1 ORDER BY updated_at DESC`,
        [req.auth!.tenant_id]
      );
      return result.rows;
    });
    return res.json(grades);
  } catch (err: any) {
    console.error('[Sync] GET product_grades error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sync/product_grades
 */
router.post('/product_grades', async (req: Request, res: Response) => {
  const grades: any[] = req.body.product_grades;
  if (!Array.isArray(grades) || grades.length === 0) {
    return res.status(400).json({ error: 'product_grades array is required' });
  }

  const synced: string[] = [];
  const failed: { grade_id: string; error: string }[] = [];

  for (const g of grades) {
    try {
      await withTenantContext(req.auth!.tenant_id, async (client) => {
        await client.query(
          `INSERT INTO product_grades (
            grade_id, tenant_id, category, grade_name, rate, is_deleted, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (grade_id) DO UPDATE SET
            category = EXCLUDED.category,
            grade_name = EXCLUDED.grade_name,
            rate = EXCLUDED.rate,
            is_deleted = EXCLUDED.is_deleted,
            updated_at = EXCLUDED.updated_at
          WHERE product_grades.tenant_id = EXCLUDED.tenant_id`,
          [
            g.grade_id, req.auth!.tenant_id, g.category, g.grade_name, g.rate, g.is_deleted ?? false,
            g.created_at ?? new Date(), g.updated_at ?? new Date()
          ]
        );
      });
      synced.push(g.grade_id);
    } catch (err: any) {
      failed.push({ grade_id: g.grade_id, error: err.message });
    }
  }

  return res.json({ synced_count: synced.length, failed_count: failed.length, synced, failed });
});

/**
 * GET /api/sync/settings
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await withTenantContext(req.auth!.tenant_id, async (client) => {
      const result = await client.query(
        `SELECT * FROM tenant_settings WHERE tenant_id = $1 ORDER BY updated_at DESC`,
        [req.auth!.tenant_id]
      );
      return result.rows;
    });
    return res.json(settings);
  } catch (err: any) {
    console.error('[Sync] GET settings error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sync/settings
 */
router.post('/settings', async (req: Request, res: Response) => {
  const settings: any[] = req.body.settings;
  if (!Array.isArray(settings) || settings.length === 0) {
    return res.status(400).json({ error: 'settings array is required' });
  }

  const synced: string[] = [];
  const failed: { key: string; error: string }[] = [];

  for (const s of settings) {
    try {
      await withTenantContext(req.auth!.tenant_id, async (client) => {
        await client.query(
          `INSERT INTO tenant_settings (
            tenant_id, key, value, updated_at
          ) VALUES ($1,$2,$3,$4)
          ON CONFLICT (tenant_id, key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = EXCLUDED.updated_at`,
          [
            req.auth!.tenant_id, s.key, s.value, s.updated_at ?? new Date()
          ]
        );
      });
      synced.push(s.key);
    } catch (err: any) {
      failed.push({ key: s.key, error: err.message });
    }
  }

  return res.json({ synced_count: synced.length, failed_count: failed.length, synced, failed });
});

export default router;
