import type { Db } from './types.js';
export function prepareProductBootstrap(db: Db, row: Record<string, unknown>) {
  if (row.stock_protocol !== 'OPERATIONS_V1' || row.stock_bootstrap == null) return;
  const boot = (typeof row.stock_bootstrap === 'string' ? JSON.parse(row.stock_bootstrap) : row.stock_bootstrap) as { origin: string; balance: number; updated_at: string };
  if (!boot || typeof boot.origin !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(boot.origin)
    || typeof boot.balance !== 'number' || !Number.isFinite(boot.balance) || !Number.isFinite(Date.parse(boot.updated_at))) throw new Error('Invalid stock upgrade baseline');
  const applied = db.prepare('SELECT balance FROM product_stock_bootstraps WHERE tenant_id=? AND product_id=? AND origin=?').get(row.tenant_id, row.product_id, boot.origin) as { balance: number } | undefined;
  if (applied) {
    if (applied.balance !== boot.balance) throw new Error('Stock upgrade baseline changed');
    return;
  }
  const old = db.prepare('SELECT current_stock,stock_counters,stock_protocol,stock_bootstrap,updated_at FROM products WHERE product_id=? AND tenant_id=?').get(row.product_id,row.tenant_id) as Record<string, unknown> | undefined;
  if (old && Number(old.current_stock) !== boot.balance) {
    throw new Error('Unreconciled pre-upgrade stock balance; local quantity remains pending');
  }
  db.prepare('INSERT INTO product_stock_bootstraps VALUES(?,?,?,?)').run(row.tenant_id,row.product_id,boot.origin,boot.balance);
}
export function acknowledgeProduct(db: Db, sent: Record<string, unknown>, tenant: string) {
  // Bootstrap is an immutable upgrade assertion. An in-flight new sale must not keep resubmitting it.
  db.prepare(`UPDATE products SET stock_opening=CASE WHEN stock_bootstrap IS NOT NULL THEN json_extract(stock_bootstrap,'$.balance') ELSE stock_opening END,
    stock_bootstrap=NULL,stock_protocol='OPERATIONS_V1' WHERE product_id=? AND tenant_id=? AND stock_bootstrap IS ?`)
    .run(sent.product_id,tenant,sent.stock_bootstrap ?? null);
  db.prepare(`UPDATE products SET sync_status='SYNCED' WHERE product_id=? AND tenant_id=? AND updated_at IS ? AND current_stock IS ?
    AND NOT EXISTS(SELECT 1 FROM stock_operations WHERE tenant_id=? AND sync_status='PENDING')`)
    .run(sent.product_id,tenant,sent.updated_at ?? null,sent.current_stock ?? null,tenant);
}
