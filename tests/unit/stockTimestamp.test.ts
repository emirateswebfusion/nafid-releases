import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import type { Db } from '../../electron/db/statements/types';
import { updateProductCurrentStock, updateProductCurrentStockCurrentStock4, updateProductDomainAttributes } from '../../electron/db/statements/invoices';
import { updateProductCurrentStock as restore } from '../../electron/db/statements/recycleBin';

it('rapid sale, metadata, delete and restore produce strictly newer stock snapshots', () => {
  const raw = new DatabaseSync(':memory:');
  try {
    raw.exec(`CREATE TABLE products(product_id TEXT, tenant_id TEXT, current_stock REAL,
      is_service_item INTEGER, sync_status TEXT, updated_at TEXT, domain_attributes TEXT);
      INSERT INTO products VALUES ('p','t',10,0,'SYNCED','2099-01-01T00:00:00.123Z','{}');`);
    const db = raw as unknown as Db;
    const stamp = () => String(raw.prepare('SELECT updated_at FROM products').get()?.updated_at);
    let previous = stamp();
    const actions = [() => updateProductCurrentStock(db).run(2, 'p'),
      () => updateProductDomainAttributes(db).run('{}', 'p'),
      () => updateProductCurrentStockCurrentStock4(db).run(2, 'p', 't'),
      () => restore(db).run(2, 'p', 't')];
    for (let n = 0; n < 20; n++) {
      for (const action of actions) {
        action();
        expect(stamp() > previous).toBe(true);
        previous = stamp();
      }
    }
  } finally { raw.close(); }
});
