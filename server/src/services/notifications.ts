import nodemailer from 'nodemailer';
import { pool, withTenantContext } from '../db/pg';
import { v4 as uuidv4 } from 'uuid';

// ── Mailer transport ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Internal helper: persist notification to DB ───────────────────────────────
async function createNotification(tenantId: string, type: string, title: string, body: string) {
  try {
    await withTenantContext(tenantId, async (client) => {
      await client.query(
        `INSERT INTO notifications (notification_id, tenant_id, type, title, body)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), tenantId, type, title, body]
      );
    });
  } catch (err: any) {
    console.error('[Notifications] Failed to persist notification:', err.message);
  }
}

// ── Low Stock Alert ───────────────────────────────────────────────────────────
export async function sendLowStockAlert(tenantId: string, product: any) {
  const title = `⚠ Low Stock: ${product.name}`;
  const body = `Stock for "${product.name}" (${product.sku_barcode}) has dropped to ${product.current_stock} ${product.uom}. Reorder level is ${product.reorder_level}.`;

  // 1. Persist in-app notification
  await createNotification(tenantId, 'LOW_STOCK', title, body);

  // 2. Send email if SMTP is configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      // Fetch tenant owner email
      const result = await pool.query(
        `SELECT email FROM users WHERE tenant_id = $1 AND role = 'OWNER' LIMIT 1`,
        [tenantId]
      );
      if (result.rows.length > 0) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'Vendora POS <no-reply@vendora.app>',
          to: result.rows[0].email,
          subject: title,
          html: `
            <div style="font-family: sans-serif; max-width: 600px;">
              <h2 style="color: #f59e0b;">⚠ Low Stock Alert</h2>
              <p>${body}</p>
              <p style="color: #6b7280; font-size: 12px;">
                This alert was generated automatically by Vendora POS.
              </p>
            </div>
          `,
        });
        console.log(`[Notifications] Low stock email sent for product: ${product.name}`);
      }
    } catch (err: any) {
      console.error('[Notifications] Email send failed:', err.message);
    }
  }
}

// ── Sync Error Alert ──────────────────────────────────────────────────────────
export async function sendSyncErrorAlert(tenantId: string, failedCount: number) {
  const title = `Sync Warning: ${failedCount} record(s) failed to sync`;
  const body = `During the last sync cycle, ${failedCount} invoice(s) failed to upload to the cloud. Please check your connection and try again.`;
  await createNotification(tenantId, 'SYNC_ERROR', title, body);
}
