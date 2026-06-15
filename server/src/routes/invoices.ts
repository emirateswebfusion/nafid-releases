import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db/pg';

const router = Router();
router.use(requireAuth);

// ── GET /api/invoices ────────────────────────────────────────────────────────
// Fetches paginated invoices for the tenant.
router.get('/', async (req: Request, res: Response) => {
  const { limit = '30', offset = '0', search = '' } = req.query;
  const tenant_id = req.auth!.tenant_id;
  const role = req.auth!.role;
  const user_id = req.auth!.user_id;

  try {
    let q = `
      SELECT i.*, u.name as cashier_name 
      FROM invoices i
      LEFT JOIN users u ON i.user_id = u.user_id
      WHERE i.tenant_id = $1
    `;
    const params: any[] = [tenant_id];

    if (role === 'CASHIER') {
      q += ` AND i.user_id = $2`;
      params.push(user_id);
    }

    if (search && typeof search === 'string') {
      q += ` AND (i.invoice_number LIKE $${params.length + 1} OR i.invoice_id LIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    q += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10));
    params.push(parseInt(offset as string, 10));

    const invoices = await query(q, params);
    return res.json(invoices);
  } catch (err: any) {
    console.error('[Invoices] GET / error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/invoices/:id/items ──────────────────────────────────────────────
// Fetches items for a specific invoice.
router.get('/:id/items', async (req: Request, res: Response) => {
  const tenant_id = req.auth!.tenant_id;
  const { id } = req.params;

  try {
    const items = await query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 AND tenant_id = $2`,
      [id, tenant_id]
    );
    return res.json(items);
  } catch (err: any) {
    console.error('[Invoices] GET /items error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/invoices/:id/discount ───────────────────────────────────────────
// Updates an invoice discount directly in the cloud DB.
router.put('/:id/discount', async (req: Request, res: Response) => {
  const tenant_id = req.auth!.tenant_id;
  const { id } = req.params;
  const { discount_type, discount_value } = req.body;

  if (req.auth!.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only owners can apply retroactive discounts' });
  }

  if (!discount_type || discount_value === undefined) {
    return res.status(400).json({ error: 'discount_type and discount_value are required' });
  }

  try {
    const invoices = await query(
      'SELECT subtotal, tax_total FROM invoices WHERE invoice_id = $1 AND tenant_id = $2',
      [id, tenant_id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoices[0];
    let discount_total = 0;
    
    if (discount_type === 'PERCENTAGE') {
      discount_total = Number(invoice.subtotal) * (Number(discount_value) / 100);
    } else {
      discount_total = Number(discount_value);
    }

    const grand_total = Number(invoice.subtotal) + Number(invoice.tax_total) - discount_total;

    await query(
      `UPDATE invoices 
       SET discount_total = $1, discount_type = $2, discount_value = $3, grand_total = $4
       WHERE invoice_id = $5 AND tenant_id = $6`,
      [discount_total, discount_type, discount_value, grand_total, id, tenant_id]
    );

    return res.json({ success: true, grand_total, discount_total });
  } catch (err: any) {
    console.error('[Invoices] PUT /discount error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
