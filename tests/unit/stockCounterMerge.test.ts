import { expect,it } from 'vitest';
import { stockDatabase } from '../support/stockDatabase';
import { withSyncApplyGuard } from '../../electron/db/statements/outbox';
import { withStockOperation,pendingOperations,applyIncomingOperation } from '../../electron/db/statements/stockOperations';
import { normalizeStockCounters } from '../../electron/utils/stockCounters';
import { upsertTableRows } from '../../electron/sync/lanUpsert';
import { returnedStock } from '../../electron/db/statements/invoiceStock';
function terminal(origin:string) {
  const t=stockDatabase();
  t.raw.prepare("UPDATE sync_meta SET value=? WHERE key='stock_origin'").run(origin);
  withSyncApplyGuard(t.db,()=>t.raw.exec(`INSERT INTO products(product_id,tenant_id,name,base_price,current_stock,sync_status,updated_at)
    VALUES('p','t','Product',10,10,'SYNCED','2026-10-01T00:00:00Z');
    INSERT INTO invoices(invoice_id,tenant_id,invoice_number,invoice_type,subtotal,grand_total) VALUES('i','t','I','GST',2,2);
    INSERT INTO invoice_items(item_id,invoice_id,tenant_id,product_id,name,quantity,unit_price,total) VALUES('line','i','t','p','Product',2,1,2);`));
  return {...t,row:()=>t.raw.prepare('SELECT * FROM products').get()!,qty:()=>t.raw.prepare('SELECT current_stock FROM products').get()?.current_stock,
    move:(qty:number)=>t.raw.prepare('UPDATE products SET current_stock=current_stock+?').run(qty)};
}
it('same invoice deleted/restored on two offline PCs changes stock once, including late retries',()=>{
  const a=terminal('a'),b=terminal('b'),hub=terminal('hub');
  try {
    for(const t of [a,b]) t.db.transaction(()=>withStockOperation(t.db,'invoice','i','invoice:delete',()=>{t.move(2);t.raw.exec('UPDATE invoices SET is_deleted=1');}))();
    const first=pendingOperations(a.db,'t')[0],second=pendingOperations(b.db,'t')[0];
    expect(first.operation_id).toBe(second.operation_id);
    for(const op of [first,second,first]) applyIncomingOperation(hub.db,op,'t');
    expect(hub.qty()).toBe(12);
    for(const t of [a,b]) t.db.transaction(()=>withStockOperation(t.db,'invoice','i','invoice:restore',()=>{t.move(-2);t.raw.exec('UPDATE invoices SET is_deleted=0');}))();
    const restoreA=pendingOperations(a.db,'t')[1],restoreB=pendingOperations(b.db,'t')[1];
    for(const op of [restoreB,restoreA,first]) applyIncomingOperation(hub.db,op,'t');
    expect(hub.qty()).toBe(10);
    expect(JSON.parse(String(a.row().stock_counters))).toEqual({});
  }finally{for(const t of [a,b,hub])t.raw.close();}
});
it('competing edits stay pending instead of double-applying, and later revisions wait for predecessors',()=>{
  const a=terminal('a'),b=terminal('b'),hub=terminal('hub');
  try {
    a.db.transaction(()=>withStockOperation(a.db,'invoice','i','invoice:edit',()=>{a.move(-1);a.raw.exec('UPDATE invoice_items SET quantity=3');}))();
    b.db.transaction(()=>withStockOperation(b.db,'invoice','i','invoice:edit',()=>{b.move(-2);b.raw.exec('UPDATE invoice_items SET quantity=4');}))();
    a.db.transaction(()=>withStockOperation(a.db,'invoice','i','invoice:edit',()=>{a.move(-0.5);a.raw.exec('UPDATE invoice_items SET quantity=3.5');}))();
    const [one,two]=pendingOperations(a.db,'t');
    expect(()=>applyIncomingOperation(hub.db,two,'t')).toThrow();expect(hub.qty()).toBe(10);
    applyIncomingOperation(hub.db,one,'t');
    expect(()=>applyIncomingOperation(hub.db,pendingOperations(b.db,'t')[0],'t')).toThrow();
    expect(pendingOperations(b.db,'t')).toHaveLength(1);expect(b.qty()).toBe(8);
    applyIncomingOperation(hub.db,two,'t');expect(hub.qty()).toBe(8.5);
  }finally{for(const t of [a,b,hub])t.raw.close();}
});
it('a multi-product operation rolls back every movement if one product is missing',()=>{
  const a=terminal('a'),hub=terminal('hub');
  try {
    a.raw.exec("INSERT INTO products(product_id,tenant_id,name,base_price,current_stock) VALUES('q','t','Q',1,5)");
    a.db.transaction(()=>withStockOperation(a.db,'invoice','i','invoice:edit',()=>a.raw.exec("UPDATE products SET current_stock=current_stock-1; UPDATE invoice_items SET quantity=3; INSERT INTO invoice_items(item_id,invoice_id,tenant_id,product_id,name,quantity,unit_price,total) VALUES('qline','i','t','q','Q',1,1,1)")))();
    expect(()=>applyIncomingOperation(hub.db,pendingOperations(a.db,'t')[0],'t')).toThrow();
    expect(hub.qty()).toBe(10);expect(hub.raw.prepare('SELECT COUNT(*) AS n FROM stock_operations').get()?.n).toBe(0);
  }finally{a.raw.close();hub.raw.close();}
});
it('pre-upgrade pending stock is bootstrapped once and retry never erases a later change',()=>{
  const source=stockDatabase((version,db)=>{if(version===8)db.exec(`INSERT INTO products(product_id,tenant_id,name,base_price,current_stock,sync_status,updated_at)
    VALUES('p','t','Product',10,8,'PENDING','2026-10-31T10:00:00Z')`);});
  const hub=terminal('hub');
  try {
    const row=source.raw.prepare('SELECT * FROM products').get()!;
    const payload={...row,current_stock:8,stock_counters:'{}',stock_protocol:'OPERATIONS_V1',stock_bootstrap:JSON.parse(String(row.stock_bootstrap))};
    expect(()=>upsertTableRows(hub.db,'products',[payload])).toThrow(/pre-upgrade/);
    expect(hub.qty()).toBe(10);
    expect(source.raw.prepare('SELECT current_stock,sync_status FROM products').get()).toMatchObject({current_stock:8,sync_status:'PENDING'});
    // An explicitly reconciled matching hub balance may be activated, without replaying it later.
    withSyncApplyGuard(hub.db,()=>hub.raw.exec('UPDATE products SET current_stock=8'));
    expect(upsertTableRows(hub.db,'products',[payload])).toEqual(['p']);expect(hub.qty()).toBe(8);
    const next={...payload,current_stock:7,stock_counters:'{"source:r":1}'};
    upsertTableRows(hub.db,'products',[next,payload,next]);expect(hub.qty()).toBe(7);
    const conflict={...payload,stock_bootstrap:{...payload.stock_bootstrap,origin:'another',balance:9}};
    expect(()=>upsertTableRows(hub.db,'products',[conflict])).toThrow(/pre-upgrade/);expect(hub.qty()).toBe(7);
    expect(source.raw.prepare('SELECT sync_status,current_stock FROM products').get()).toMatchObject({sync_status:'PENDING',current_stock:8});
  }finally{source.raw.close();hub.raw.close();}
});
it('independent manual changes retain per-installation retry safety',()=>{
  const a=terminal('a'),b=terminal('b'),hub=terminal('hub');
  try {
    a.move(-1);const old=a.row();a.move(-2);b.move(2.5);
    for(const row of [a.row(),b.row(),old,a.row()])upsertTableRows(hub.db,'products',[row]);
    expect(hub.qty()).toBe(9.5);
  }finally{for(const t of [a,b,hub])t.raw.close();}
});
it('cancelled returns remain excluded after an older active LAN retry',()=>{
  const t=terminal('return');
  try {
    t.raw.exec(`INSERT INTO returns(return_id,invoice_id,tenant_id,return_number,subtotal,grand_total) VALUES('r','i','t','R',1,1);
      INSERT INTO return_items(return_item_id,return_id,tenant_id,product_id,name,quantity,unit_price,total) VALUES('ri','r','t','p','Product',1,1,1)`);
    const active=t.raw.prepare('SELECT * FROM returns').get()!;
    upsertTableRows(t.db,'returns',[{...active,is_deleted:1},active]);
    expect(returnedStock(t.db).all('i','t')).toEqual([]);
  }finally{t.raw.close();}
});
it('validates the counter wire contract',()=>{
  expect(normalizeStockCounters('{"device:r":2.5,"server:a":0}')).toBe('{"device:r":2.5,"server:a":0}');
  for(const bad of [[],{bad:1},{'x:r':-1},{'x:a':Infinity}])expect(()=>normalizeStockCounters(bad)).toThrow();
});
