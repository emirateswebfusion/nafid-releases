import { Router, Request, Response } from 'express';
import { requireAuth, requireOwner } from '../middleware/auth';
import { withTenantContext } from '../db/pg';

const router = Router();

// All product routes require authentication
router.use(requireAuth);

// ── GET /api/products ─────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const products = await withTenantContext(req.auth!.tenant_id, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM products WHERE is_deleted = false ORDER BY name ASC`
      );
      return rows;
    });
    return res.json(products);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/products/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const products = await withTenantContext(req.auth!.tenant_id, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM products WHERE product_id = $1`,
        [req.params.id]
      );
      return rows;
    });
    if (!products.length) return res.status(404).json({ error: 'Product not found' });
    return res.json(products[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/products (Owner only) ──────────────────────────────────────────
router.post('/', requireOwner, async (req: Request, res: Response) => {
  const {
    product_id, name, sku_barcode, item_code, category, hsn_sac_code,
    purchase_price, base_price, is_gst_applicable, tax_rate_percent,
    uom, brand_manufacturer, current_stock, reorder_level, domain_attributes
  } = req.body;

  if (!name || !base_price) {
    return res.status(400).json({ error: 'name and base_price are required' });
  }

  try {
    const result = await withTenantContext(req.auth!.tenant_id, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO products (
          product_id, tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
          purchase_price, base_price, is_gst_applicable, tax_rate_percent,
          uom, brand_manufacturer, current_stock, reorder_level, domain_attributes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *`,
        [
          product_id, req.auth!.tenant_id, name, sku_barcode, item_code, category, hsn_sac_code,
          purchase_price ?? 0, base_price, is_gst_applicable ?? true, tax_rate_percent ?? 0,
          uom ?? 'Pcs', brand_manufacturer, current_stock ?? 0, reorder_level ?? 0,
          domain_attributes ? JSON.stringify(domain_attributes) : null
        ]
      );
      return rows[0];
    });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/products/:id (Owner only) ────────────────────────────────────────
router.put('/:id', requireOwner, async (req: Request, res: Response) => {
  const {
    name, sku_barcode, item_code, category, hsn_sac_code,
    purchase_price, base_price, is_gst_applicable, tax_rate_percent,
    uom, brand_manufacturer, current_stock, reorder_level, domain_attributes
  } = req.body;

  try {
    const result = await withTenantContext(req.auth!.tenant_id, async (client) => {
      const { rows } = await client.query(
        `UPDATE products SET
          name=$1, sku_barcode=$2, item_code=$15, category=$3, hsn_sac_code=$4,
          purchase_price=$5, base_price=$6, is_gst_applicable=$7, tax_rate_percent=$8,
          uom=$9, brand_manufacturer=$10, current_stock=$11, reorder_level=$12,
          domain_attributes=$13, updated_at=NOW()
        WHERE product_id=$14
        RETURNING *`,
        [
          name, sku_barcode, category, hsn_sac_code,
          purchase_price, base_price, is_gst_applicable, tax_rate_percent,
          uom, brand_manufacturer, current_stock, reorder_level,
          domain_attributes ? JSON.stringify(domain_attributes) : null,
          req.params.id, item_code
        ]
      );
      return rows[0];
    });
    if (!result) return res.status(404).json({ error: 'Product not found' });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/products/:id (Owner only) ─────────────────────────────────────
router.delete('/:id', requireOwner, async (req: Request, res: Response) => {
  try {
    await withTenantContext(req.auth!.tenant_id, async (client) => {
      await client.query('UPDATE products SET is_deleted = true, updated_at = NOW() WHERE product_id = $1', [req.params.id]);
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
