import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
const state=vi.hoisted(()=>({db:null as unknown as Database.Database,rows:[] as Record<string,unknown>[]}));
vi.mock('electron',()=>({BrowserWindow:{getAllWindows:()=>[]}}));
vi.mock('../../electron/db/localDb',()=>({getDb:()=>state.db}));
vi.mock('../../electron/sync/syncProgress',()=>({notifyPullProgress:vi.fn()}));
vi.mock('../../electron/sync/syncTransport',()=>({pullPaginated:async(opts:{processPage:(rows:Record<string,unknown>[])=>unknown})=>{opts.processPage(state.rows);return {hasChanged:true,count:state.rows.length};}}));
import { pullCustomers } from '../../electron/sync/entities/partiesSync';
import { pullPricingTiers } from '../../electron/sync/entities/catalogSync';
let raw:DatabaseSync;
beforeEach(()=>{
 raw=new DatabaseSync(':memory:');state.db=Object.assign(raw,{transaction:(fn:(...args:unknown[])=>unknown)=>(...args:unknown[])=>{raw.exec('SAVEPOINT identity_pull');try{const result=fn(...args);raw.exec('RELEASE identity_pull');return result;}catch(error){raw.exec('ROLLBACK TO identity_pull; RELEASE identity_pull');throw error;}}}) as unknown as Database.Database;
 createCoreTables(state.db);createExtendedTables(state.db);ensureSchemaColumns(state.db);runColumnMigrations(state.db);
 const columns=raw.prepare('PRAGMA table_info(customers)').all() as {name:string}[];
 if(!columns.some(column=>column.name==='einvoice_profile'))raw.exec('ALTER TABLE customers ADD COLUMN einvoice_profile TEXT');
});
afterEach(()=>raw.close());
it.each(['PENDING','FAILED'])('a matching customer phone/name cannot delete an unsent source identity: %s',async status=>{
 for(const phone of ['12345',null]){
  raw.exec('DELETE FROM customers');
  raw.prepare('INSERT INTO customers(customer_id,tenant_id,name,phone,sync_status) VALUES(?,?,?,?,?)').run('source','shop','Local profile',phone,status);
  state.rows=[{customer_id:'cloud',tenant_id:'shop',name:'Local profile',phone}];
  await expect(pullCustomers('token','shop')).rejects.toThrow('Unacknowledged local identity');
  expect(raw.prepare('SELECT customer_id,sync_status,is_deleted FROM customers').all()).toEqual([{customer_id:'source',sync_status:status,is_deleted:0}]);
 }
});
it.each(['PENDING','FAILED'])('a matching pricing-tier name cannot remap or delete an unsent source: %s',async status=>{
 raw.prepare('INSERT INTO pricing_tiers(pricing_tier_id,tenant_id,name,sync_status) VALUES(?,?,?,?)').run('source','shop','Special',status);
 state.rows=[{pricing_tier_id:'cloud',tenant_id:'shop',name:'Special'}];
 await expect(pullPricingTiers('token','shop')).rejects.toThrow('Unacknowledged local identity');
 expect(raw.prepare('SELECT pricing_tier_id,sync_status FROM pricing_tiers').all()).toEqual([{pricing_tier_id:'source',sync_status:status}]);
});
