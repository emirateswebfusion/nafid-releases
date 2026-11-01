import { createHash } from 'node:crypto';

export type StockGroup = 'invoice' | 'return' | 'purchase_bill';
export interface StockOperation {
  operation_id: string; tenant_id: string; document_id: string; document_type: StockGroup;
  revision: number; action: string; deltas: { product_id: string; quantity: number }[];
  origin: string; created_at: string; before: StockOperation['deltas']; after: StockOperation['deltas'];
}
const compareParts=(a:{product_id:string},b:{product_id:string})=>a.product_id<b.product_id?-1:a.product_id>b.product_id?1:0;
export function operationId(op: Pick<StockOperation, 'tenant_id' | 'document_id' | 'document_type' | 'revision' | 'action' | 'deltas' | 'before' | 'after'>): string {
  const deltas = [...op.deltas].sort((a, b) => a.product_id<b.product_id?-1:a.product_id>b.product_id?1:0);
  return createHash('sha256').update(JSON.stringify([op.tenant_id, op.document_type, op.document_id, op.revision, op.action, deltas, [...op.before].sort(compareParts), [...op.after].sort(compareParts)])).digest('hex');
}
export function parseStockOperation(input: unknown): StockOperation {
  if (!input || typeof input !== 'object') throw new Error('Invalid stock operation');
  const op = input as StockOperation;
  if (!['operation_id','tenant_id','document_id','document_type','action','origin','created_at'].every(key=>typeof (input as Record<string,unknown>)[key]==='string' && String((input as Record<string,unknown>)[key]).length>0 && String((input as Record<string,unknown>)[key]).length<=512)) throw new Error('Invalid stock operation fields');
  if (!['invoice', 'return', 'purchase_bill'].includes(op.document_type) || !op.document_id || !op.tenant_id
    || !Number.isSafeInteger(op.revision) || op.revision < 1 || !op.action || !op.origin
    || !Array.isArray(op.deltas) || op.deltas.length === 0 || op.deltas.length > 2000
    || !Number.isFinite(Date.parse(op.created_at))) throw new Error('Invalid stock operation');
  const ids = new Set<string>();
  for (const delta of op.deltas) {
    if (typeof delta.product_id !== 'string' || !delta.product_id || ids.has(delta.product_id)
      || typeof delta.quantity !== 'number' || !Number.isFinite(delta.quantity) || delta.quantity === 0) throw new Error('Invalid stock movement');
    ids.add(delta.product_id);
  }
  for (const vector of [op.before,op.after]) {
    if(!Array.isArray(vector) || vector.length>2000 || new Set(vector.map(p=>p.product_id)).size!==vector.length || vector.some(p=>!p || typeof p.product_id!=='string' || !p.product_id || typeof p.quantity!=='number' || !Number.isFinite(p.quantity))) throw new Error('Invalid stock document state');
  }
  if(!vectorsEqual(op.deltas,movementBetween(op.before,op.after))) throw new Error('Stock movement does not match document state');
  if (operationId(op) !== op.operation_id) throw new Error('Invalid stock operation identity');
  return op;
}

export function vectorsEqual(a:StockOperation['deltas'],b:StockOperation['deltas']):boolean {
  const left=[...a].filter(p=>Math.abs(p.quantity)>1e-10).sort(compareParts),right=[...b].filter(p=>Math.abs(p.quantity)>1e-10).sort(compareParts);
  return left.length===right.length && left.every((p,i)=>p.product_id===right[i].product_id && Math.abs(p.quantity-right[i].quantity)<1e-8);
}
export function movementBetween(before:StockOperation['deltas'],after:StockOperation['deltas']):StockOperation['deltas'] {
  const quantities=new Map<string,number>();
  for(const [rows,sign] of [[before,-1],[after,1]] as const)for(const row of rows)quantities.set(row.product_id,(quantities.get(row.product_id)??0)+sign*row.quantity);
  return [...quantities].filter(([,q])=>Math.abs(q)>1e-10).map(([product_id,quantity])=>({product_id,quantity})).sort(compareParts);
}
