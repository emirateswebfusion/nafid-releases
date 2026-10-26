import type { Migration } from './runner.js';

/** Returns of discounted invoices had their totals repaired at startup (startup-idempotency fix, 26 Oct 2026) without
 * being marked for sync, so the cloud kept the drifted totals. Re-push them once; the server's return upsert is a
 * plain overwrite (no stock side effects). Only `sync_status` changes, which the outbox triggers ignore. */
export const m004ResyncRecalibratedReturns: Migration = {
  version: 4,
  name: 'resync-recalibrated-returns',
  up: (db) => {
    db.exec(`
      UPDATE returns SET sync_status = 'PENDING'
      WHERE COALESCE(sync_status, 'SYNCED') = 'SYNCED'
        AND return_id IN (
          SELECT r.return_id FROM returns r JOIN invoices i ON r.invoice_id = i.invoice_id
          WHERE i.subtotal > 0 AND (COALESCE(i.discount_total, 0) + COALESCE(i.points_redeemed_discount, 0)) > 0
        );
    `);
  },
};
