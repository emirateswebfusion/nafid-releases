import { documentStockVector } from './stockVector.js';
import type Database from 'better-sqlite3';
import type { Db } from './types.js';
import { stockTimestampSql } from './stockTimestamp.js';
import { withSyncApplyGuard } from './outbox.js';
import { operationId, parseStockOperation, vectorsEqual, movementBetween, type StockGroup, type StockOperation } from '../../utils/stockOperation.js';

type TransactionDb=Db & Pick<Database.Database,'transaction'>;
const groups = { invoice: ['invoices', 'invoice_id'], return: ['returns', 'return_id'], purchase_bill: ['purchase_bills', 'purchase_bill_id'] } as const;
export function getStockOrigin(db: Db): string {
  try { return String((db.prepare("SELECT value FROM sync_meta WHERE key='stock_origin'").get() as { value: string } | undefined)?.value ?? 'legacy'); }
  catch { return 'legacy'; }
}
/** Called inside the business transaction. Only this scope suppresses per-installation counters. */
export function withStockOperation<T>(db: Db, type: StockGroup, id: string, action: string, fn: () => T): T {
  const [table, key] = groups[type];
  const before = db.prepare(`SELECT stock_revision,tenant_id FROM ${table} WHERE ${key}=?`).get(id) as { stock_revision: number; tenant_id: string } | undefined;
  const beforeVector=documentStockVector(db,type,id);
  db.prepare('INSERT INTO stock_operation_context VALUES(?,?)').run(id, type);
  try {
    const result = fn();
    const deltas = db.prepare('SELECT product_id,quantity FROM stock_operation_deltas WHERE quantity<>0 ORDER BY product_id').all() as StockOperation['deltas'];
    const afterVector=documentStockVector(db,type,id);
    if(!vectorsEqual(deltas,movementBetween(beforeVector,afterVector))) throw new Error('Stock movement differs from document state');
    if (deltas.length) {
      const header = db.prepare(`SELECT tenant_id FROM ${table} WHERE ${key}=?`).get(id) as { tenant_id: string } | undefined;
      const tenant = header?.tenant_id ?? before?.tenant_id;
      if (!tenant) throw new Error('Stock document is missing');
      const op: StockOperation = { operation_id: '', tenant_id: tenant, document_id: id, document_type: type,
        revision: Number(before?.stock_revision ?? 0) + 1, action, deltas, before:beforeVector,after:afterVector, origin: getStockOrigin(db), created_at: new Date().toISOString() };
      op.operation_id = operationId(op);
      db.prepare(`INSERT INTO stock_operations(operation_id,tenant_id,document_id,document_type,revision,action,payload,origin,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(op.operation_id, op.tenant_id, id, type, op.revision, action, JSON.stringify(op), op.origin, op.created_at);
      db.prepare(`INSERT INTO stock_operation_heads VALUES(?,?,?,?) ON CONFLICT(tenant_id,document_type,document_id) DO UPDATE SET revision=EXCLUDED.revision`).run(tenant,type,id,op.revision);
      db.prepare(`UPDATE ${table} SET stock_revision=?,sync_status='PENDING' WHERE ${key}=?`).run(op.revision, id);
    }
    return result;
  } finally {
    db.prepare('DELETE FROM stock_operation_context').run();
    db.prepare('DELETE FROM stock_operation_deltas').run();
  }
}
/** Compatibility adapter for the unfinished per-line effect calls; the transaction scope records one operation. */
export function applyStockEffect(db: Db, effect: { productId: string; quantity: number; direction: 'in' | 'out'; documentId?: string; documentType?: string; origin?: string }): void {
  db.prepare(`UPDATE products SET current_stock=current_stock+?,sync_status='PENDING',updated_at=${stockTimestampSql}
    WHERE product_id=? AND COALESCE(is_service_item,0)=0`).run(effect.quantity * (effect.direction === 'in' ? 1 : -1), effect.productId);
}
export function pendingOperations(db: Db, tenant: string): StockOperation[] {
  return (db.prepare("SELECT payload FROM stock_operations WHERE tenant_id=? AND sync_status='PENDING' ORDER BY revision,created_at LIMIT 200").all(tenant) as { payload: string }[]).map(row => parseStockOperation(JSON.parse(row.payload)));
}
export function acknowledgeOperation(db: Db, id: string): void {
  db.prepare("UPDATE stock_operations SET sync_status='SYNCED',last_error=NULL WHERE operation_id=?").run(id);
}
export function documentReady(db: Db, tenant: string, type: StockGroup, id: string): boolean {
  return !db.prepare("SELECT 1 FROM stock_operations WHERE tenant_id=? AND document_type=? AND document_id=? AND sync_status='PENDING' LIMIT 1").get(tenant, type, id);
}
export function applyIncomingOperation(db: TransactionDb, input: unknown, tenant: string): string {
  const op = parseStockOperation(input);
  if (op.tenant_id !== tenant) throw new Error('Foreign stock operation');
  return db.transaction(() => withSyncApplyGuard(db, () => {
    const slot=db.prepare('SELECT operation_id,payload FROM stock_operations WHERE tenant_id=? AND document_type=? AND document_id=? AND revision=?').get(tenant,op.document_type,op.document_id,op.revision) as {operation_id:string;payload:string}|undefined;
    if(slot) {
      const saved=parseStockOperation(JSON.parse(slot.payload));
      if(slot.operation_id===op.operation_id || (saved.action===op.action && vectorsEqual(saved.before,op.before) && vectorsEqual(saved.after,op.after))) return op.operation_id;
      throw new Error('Stock document changed on another PC; keep pending for reconciliation');
    }
    const head = db.prepare('SELECT revision FROM stock_operation_heads WHERE tenant_id=? AND document_type=? AND document_id=?').get(tenant, op.document_type, op.document_id) as { revision: number } | undefined;
    if (op.revision !== Number(head?.revision ?? 0) + 1) throw new Error('Stock document changed on another PC; keep pending for reconciliation');
    const last=head ? db.prepare('SELECT payload FROM stock_operations WHERE tenant_id=? AND document_type=? AND document_id=? AND revision=?').get(tenant,op.document_type,op.document_id,head.revision) as {payload:string}|undefined : undefined;
    const expected=last?parseStockOperation(JSON.parse(last.payload)).after:documentStockVector(db,op.document_type,op.document_id);
    if(!vectorsEqual(expected,op.before)) throw new Error('Stock document baseline differs; pull the complete bill and returns before reconciling');
    for (const part of op.deltas) {
      const result = db.prepare(`UPDATE products SET current_stock=current_stock+?,sync_status='PENDING',updated_at=${stockTimestampSql}
        WHERE product_id=? AND tenant_id=? AND COALESCE(is_service_item,0)=0`).run(part.quantity, part.product_id, tenant);
      if (result.changes !== 1) throw new Error('Stock product is missing or changed');
    }
    db.prepare(`INSERT INTO stock_operations(operation_id,tenant_id,document_id,document_type,revision,action,payload,origin,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(op.operation_id, tenant, op.document_id, op.document_type, op.revision, op.action, JSON.stringify(op), op.origin, op.created_at);
    db.prepare(`INSERT INTO stock_operation_heads VALUES(?,?,?,?) ON CONFLICT(tenant_id,document_type,document_id)
      DO UPDATE SET revision=EXCLUDED.revision`).run(tenant, op.document_type, op.document_id, op.revision);
    return op.operation_id;
  }))();
}

export function stockTransaction<T>(db: TransactionDb, type: StockGroup, id: string, action: string, fn: () => T) {
  return db.transaction(() => withStockOperation(db, type, id, action, fn));
}
export function returnGroup(db: Db, id: string): { type: StockGroup; id: string } {
  const row = db.prepare('SELECT invoice_id FROM returns WHERE return_id=?').get(id) as { invoice_id: string | null } | undefined;
  return row?.invoice_id ? { type: 'invoice', id: row.invoice_id } : { type: 'return', id };
}

export function groupRevision(db: Db, type: StockGroup, id: string): number {
  const [table,key]=groups[type];
  const row=db.prepare(`SELECT stock_revision FROM ${table} WHERE ${key}=?`).get(id) as { stock_revision: number } | undefined;
  return Number(row?.stock_revision ?? 0);
}
export function acceptDocumentRevision(db: Db, type: StockGroup, id: string, revision: unknown, tenant: string) {
  const head=db.prepare('SELECT revision FROM stock_operation_heads WHERE tenant_id=? AND document_type=? AND document_id=?').get(tenant,type,id) as { revision: number } | undefined;
  if (Number(revision ?? 0)!==Number(head?.revision ?? 0)) throw new Error('Stock document revision conflict');
}
export function saveRevision(db: Db, type: StockGroup, id: string, revision: unknown) {
  const [table,key]=groups[type];
  db.prepare(`UPDATE ${table} SET stock_revision=? WHERE ${key}=?`).run(Number(revision ?? 0),id);
}
