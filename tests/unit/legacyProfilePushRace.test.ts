import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({db:null as unknown as Database.Database,request:vi.fn()}));
vi.mock('electron',()=>({BrowserWindow:{getAllWindows:()=>[]}}));
vi.mock('../../electron/db/localDb',()=>({getDb:()=>state.db}));
vi.mock('../../electron/sync/syncTransport',()=>({fetchWithFallback:state.request,syncPushBody:JSON.stringify}));
import { pushCustomers,pushLoyaltyTransactions } from '../../electron/sync/entities/partiesSync';
import { insertLoyaltyTransactions } from '../../electron/db/statements/sync/partiesSync';
let raw:DatabaseSync;
beforeEach(()=>{
 raw=new DatabaseSync(':memory:');state.db=Object.assign(raw,{transaction:(fn:(...args:unknown[])=>unknown)=>fn}) as unknown as Database.Database;
 raw.exec(`CREATE TABLE customers(customer_id TEXT PRIMARY KEY,tenant_id TEXT,row_version INTEGER,updated_at TEXT,sync_status TEXT,name TEXT);
 CREATE TABLE loyalty_transactions(transaction_id TEXT PRIMARY KEY,tenant_id TEXT,row_version INTEGER,updated_at TEXT,sync_status TEXT,points REAL);
 INSERT INTO customers VALUES('record','shop',1,'same-second','PENDING','Original');
 INSERT INTO loyalty_transactions VALUES('record','shop',1,'same-second','PENDING',10)`);
 state.request.mockReset();
});
afterEach(()=>raw.close());
it.each(['PENDING','FAILED'])('a loyalty download cannot replace unacknowledged points: %s',status=>{
 for(const column of ['customer_id TEXT','invoice_id TEXT','transaction_type TEXT','points_balance_before REAL','points_balance_after REAL','reference_number TEXT','description TEXT','created_by TEXT','created_at TEXT'])raw.exec(`ALTER TABLE loyalty_transactions ADD COLUMN ${column}`);
 raw.prepare('UPDATE loyalty_transactions SET sync_status=?').run(status);
 insertLoyaltyTransactions(state.db).run({transaction_id:'record',tenant_id:'shop',customer_id:'customer',invoice_id:null,transaction_type:'EARN',points:1,points_balance_before:0,points_balance_after:1,reference_number:null,description:'Older cloud copy',created_by:null,created_at:'2099-01-01'});
 expect(raw.prepare('SELECT points,sync_status FROM loyalty_transactions').get()).toEqual({points:10,sync_status:status});
});
it.each(['customers','loyalty_transactions'] as const)('a delayed %s success/failure cannot clear a newer same-second edit',async table=>{
 const id=table==='customers'?'customer_id':'transaction_id';
 for(const accepted of [true,false]){
   raw.exec(`UPDATE ${table} SET row_version=1,sync_status='PENDING'`);
   state.request.mockImplementationOnce(async()=>{
     raw.exec(`UPDATE ${table} SET row_version=2,${table==='customers'?"name='Newer'":"points=20"}`);
     return {response:{ok:true,json:async()=>accepted?{synced:['record']}:{failed:[{[id]:'record'}]}}};
   });
   await (table==='customers'?pushCustomers:pushLoyaltyTransactions)('token','shop');
   expect(raw.prepare(`SELECT row_version,updated_at,sync_status FROM ${table}`).get()).toEqual({row_version:2,updated_at:'same-second',sync_status:'PENDING'});
 }
});
