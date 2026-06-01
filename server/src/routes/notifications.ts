import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { withTenantContext } from '../db/pg';

const router = Router();
router.use(requireAuth);

// ── GET /api/notifications ────────────────────────────────────────────────────
// Fetch unread notifications for the current tenant
router.get('/', async (req: Request, res: Response) => {
  try {
    const notifications = await withTenantContext(req.auth!.tenant_id, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM notifications
         WHERE tenant_id = $1
         ORDER BY created_at DESC, notification_id ASC
         LIMIT 50`,
        [req.auth!.tenant_id]
      );
      return rows;
    });
    return res.json(notifications);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    await withTenantContext(req.auth!.tenant_id, async (client) => {
      await client.query(
        `UPDATE notifications SET is_read = true WHERE notification_id = $1 AND tenant_id = $2`,
        [req.params.id, req.auth!.tenant_id]
      );
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    await withTenantContext(req.auth!.tenant_id, async (client) => {
      await client.query(
        `UPDATE notifications SET is_read = true WHERE tenant_id = $1`,
        [req.auth!.tenant_id]
      );
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
