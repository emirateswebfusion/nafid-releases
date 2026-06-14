import { Router, Request, Response } from 'express';
import { requireAuth, requireOwner } from '../middleware/auth';
import { withTenantContext } from '../db/pg';

const router = Router();
router.use(requireAuth);

router.post('/discount', requireOwner, async (req: Request, res: Response) => {
  try {
    const { invoice_id, discount_type, discount_value } = req.body;
    
    if (!invoice_id || !discount_type || discount_value === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await withTenantContext(req.auth!.tenant_id, async (client) => {
      // 1. Fetch invoice to ensure it belongs to this tenant and get totals
      const invResult = await client.query(
        'SELECT subtotal, tax_total FROM invoices WHERE invoice_id = $1 AND tenant_id = $2',
        [invoice_id, req.auth!.tenant_id]
      );
      
      if (invResult.rows.length === 0) {
        throw new Error('Invoice not found');
      }

      const invoice = invResult.rows[0];

      let discount_total = 0;
      if (discount_type === 'PERCENTAGE') {
        discount_total = Number(invoice.subtotal) * (Number(discount_value) / 100);
      } else {
        discount_total = Number(discount_value);
      }

      const grand_total = Number(invoice.subtotal) + Number(invoice.tax_total) - discount_total;

      // 2. Update the invoice
      await client.query(`
        UPDATE invoices 
        SET discount_total = $1, discount_type = $2, discount_value = $3, grand_total = $4
        WHERE invoice_id = $5 AND tenant_id = $6
      `, [discount_total, discount_type, discount_value, grand_total, invoice_id, req.auth!.tenant_id]);
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Invoices API] discount error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
