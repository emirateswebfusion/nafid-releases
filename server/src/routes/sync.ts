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
    try {
      await withTenantContext(req.auth!.tenant_id, async (client) => {
        // 1. Upsert invoice header — idempotent on (tenant_id, invoice_number)
        const { rowCount } = await client.query(
          `INSERT INTO invoices (
            invoice_id, tenant_id, invoice_number, invoice_type,
            customer_name, customer_phone, subtotal, tax_total,
            discount_total, grand_total, user_id, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (tenant_id, invoice_number) DO NOTHING`,
          [
            inv.invoice_id, req.auth!.tenant_id, inv.invoice_number,
            inv.invoice_type, inv.customer_name, inv.customer_phone,
            inv.subtotal, inv.tax_total, inv.discount_total ?? 0,
            inv.grand_total, inv.user_id, inv.created_at ?? new Date()
          ]
        );

        // Only insert items if this is a new invoice (not a duplicate)
        if (rowCount && rowCount > 0 && Array.isArray(inv.items)) {
          for (const item of inv.items) {
            // 2. Insert invoice line item
            await client.query(
              `INSERT INTO invoice_items (
                item_id, invoice_id, tenant_id, product_id,
                quantity, unit_price, tax_amount, total
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT (item_id) DO NOTHING`,
              [
                item.item_id, inv.invoice_id, req.auth!.tenant_id,
                item.product_id, item.quantity, item.unit_price,
                item.tax_amount, item.total
              ]
            );
          }
        }
      });
      synced.push(inv.invoice_id);
    } catch (err: any) {
      failed.push({ invoice_id: inv.invoice_id, error: err.message });
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
    const invoices = await withTenantContext(req.auth!.tenant_id, async (client) => {
      // 1. Fetch invoices
      const invResult = await client.query(
        `SELECT * FROM invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1000`,
        [req.auth!.tenant_id]
      );
      
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
    try {
      await withTenantContext(req.auth!.tenant_id, async (client) => {
        await client.query(
          `INSERT INTO products (
            product_id, tenant_id, name, sku_barcode, category, hsn_sac_code,
            purchase_price, base_price, tax_rate_percent, uom,
            brand_manufacturer, current_stock, reorder_level, domain_attributes, is_deleted
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (product_id) DO UPDATE SET
            name = EXCLUDED.name,
            sku_barcode = EXCLUDED.sku_barcode,
            category = EXCLUDED.category,
            hsn_sac_code = EXCLUDED.hsn_sac_code,
            purchase_price = EXCLUDED.purchase_price,
            base_price = EXCLUDED.base_price,
            tax_rate_percent = EXCLUDED.tax_rate_percent,
            uom = EXCLUDED.uom,
            brand_manufacturer = EXCLUDED.brand_manufacturer,
            current_stock = EXCLUDED.current_stock,
            reorder_level = EXCLUDED.reorder_level,
            domain_attributes = EXCLUDED.domain_attributes,
            is_deleted = EXCLUDED.is_deleted,
            updated_at = NOW()`,
          [
            p.product_id, req.auth!.tenant_id, p.name, p.sku_barcode, p.category,
            p.hsn_sac_code, p.purchase_price ?? 0, p.base_price, p.tax_rate_percent ?? 0,
            p.uom ?? 'Pcs', p.brand_manufacturer, p.current_stock ?? 0,
            p.reorder_level ?? 0,
            p.domain_attributes ? JSON.stringify(p.domain_attributes) : null,
            p.is_deleted ?? false
          ]
        );

        // Check for low stock — send alert if at or below reorder level
        if ((p.current_stock ?? 0) <= (p.reorder_level ?? 0) && (p.reorder_level ?? 0) > 0) {
          await sendLowStockAlert(req.auth!.tenant_id, p);
        }
      });
      synced.push(p.product_id);
    } catch (err: any) {
      failed.push({ product_id: p.product_id, error: err.message });
    }
  }

  return res.json({ synced_count: synced.length, failed_count: failed.length, synced, failed });
});

export default router;
