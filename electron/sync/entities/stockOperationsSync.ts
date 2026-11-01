import { getDb } from '../../db/localDb.js';
import { pendingOperations, acknowledgeOperation } from '../../db/statements/stockOperations.js';
import { pushBatch } from '../syncTransport.js';

export async function syncStockOperations(token: string, tenant: string): Promise<void> {
  const db = getDb();
  for (;;) {
    const operations = pendingOperations(db, tenant);
    if (!operations.length) return;
    const synced = await pushBatch('/api/sync/stock_operations', token, operations, 'stock_operations', 'Stock document changes');
    db.transaction(() => { for (const op of operations) if (synced.includes(op.operation_id)) acknowledgeOperation(db, op.operation_id); })();
    if (operations.some(op => !synced.includes(op.operation_id))) {
      throw new Error('Stock change could not sync. The local quantity is preserved; reconcile competing bill changes or retry after earlier changes sync.');
    }
  }
}
