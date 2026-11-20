import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, fetch: vi.fn() }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));
import { queueAccountRecovery, runAccountRecovery } from '../../electron/sync/accountRecovery';
import * as recoverySql from '../../electron/db/statements/sync/accountRecovery';
const tenant='11111111-1111-4111-8111-111111111111', party='22222222-2222-4222-8222-222222222222', job='33333333-3333-4333-8333-333333333333';
const command={job_id:job,tenant_id:tenant,terminal_id:'pc01',permit:'a'.repeat(64),expires_at:'2099-01-01T00:00:00Z',targets:[{entity:'parties',id:party}]};
let db: DatabaseSync;
const value=(key:string)=>db.prepare('SELECT value FROM sync_meta WHERE key=?').get(key) as {value:string}|undefined;
const receipt={job_id:job,receipts:[{entity:'parties',id:party,base:'8:pc01',row_version:8,origin:'pc01',server_seq:'42'}]};
beforeEach(()=>{
 db=new DatabaseSync(':memory:');
 state.db=Object.assign(db,{transaction:(fn:()=>unknown)=>()=>{db.exec('SAVEPOINT recovery');try{const v=fn();db.exec('RELEASE recovery');return v;}catch(e){db.exec('ROLLBACK TO recovery; RELEASE recovery');throw e;}}}) as unknown as Database.Database;
 db.exec(`CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO sync_meta VALUES('origin','pc01');
 CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY);
 CREATE TABLE settings(tenant_id TEXT,key TEXT,value TEXT);
 CREATE TABLE parties(party_id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,balance REAL,gst_balance REAL,estimate_balance REAL,sync_status TEXT,row_version INTEGER,origin TEXT,updated_at TEXT);
 CREATE TABLE party_ledger(ledger_id TEXT PRIMARY KEY,tenant_id TEXT,sync_status TEXT,row_version INTEGER,origin TEXT,updated_at TEXT);
 CREATE TABLE sync_outbox(op_id TEXT PRIMARY KEY,tenant_id TEXT,entity TEXT,entity_id TEXT,row_version INTEGER,payload TEXT,sent_at TEXT,last_error TEXT);`);
 db.prepare("INSERT INTO parties VALUES(?,?,'Correct local name',10,10,0,'PENDING',5,'pc01','original')").run(party,tenant);
 db.prepare("INSERT INTO sync_outbox VALUES('old',?,'parties',?,5,'historical',NULL,'stopped')").run(tenant,party);
 vi.stubEnv('VENDORA_CLOUD_API','https://approved.example');vi.stubGlobal('fetch',state.fetch);state.fetch.mockReset();
 state.fetch.mockResolvedValue({ok:true,json:async()=>receipt});
});
afterEach(()=>{db.close();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('never runs an arbitrary command or a command for another source/shop',async()=>{
 queueAccountRecovery(tenant,'pc01',{...command,terminal_id:'other'});
 queueAccountRecovery(tenant,'pc01',{...command,tenant_id:'foreign'});
 queueAccountRecovery(tenant,'pc01',{...command,targets:[{entity:'users',id:party}]});
 await runAccountRecovery(tenant,'token');expect(state.fetch).not.toHaveBeenCalled();
});
it('backs up the exact local values and stopped operations before HTTP and acknowledges only complete receipts',async()=>{
 state.fetch.mockImplementation(async()=>{
   const backup=JSON.parse(value(`account_recovery_backup:${tenant}:${job}`)!.value);
   expect(backup.rows[0].row.name).toBe('Correct local name');expect(backup.operations[0].payload).toBe('historical');
   expect(db.prepare('SELECT sync_status FROM parties').get()).toMatchObject({sync_status:'PENDING'});
   return {ok:true,json:async()=>receipt};
 });
 queueAccountRecovery(tenant,'pc01',command);await runAccountRecovery(tenant,'token');
 expect(db.prepare('SELECT name,balance,row_version,sync_status FROM parties').get()).toMatchObject({name:'Correct local name',balance:10,row_version:8,sync_status:'SYNCED'});
 expect(db.prepare('SELECT sent_at FROM sync_outbox').get()).toMatchObject({sent_at:expect.any(String)});
 expect(value(`account_recovery_complete:${tenant}:${job}`)).toBeDefined();
 expect(value(`account_recovery_backup:${tenant}:${job}`)).toBeDefined();
});
it('retains newer edits and operations made while the upload was in flight',async()=>{
 state.fetch.mockImplementation(async()=>{
   db.exec("UPDATE parties SET name='Newer local edit',row_version=6,updated_at='newer'");
   db.prepare("INSERT INTO sync_outbox VALUES('newer',?,'parties',?,6,'newer',NULL,NULL)").run(tenant,party);
   return {ok:true,json:async()=>receipt};
 });
 queueAccountRecovery(tenant,'pc01',command);await runAccountRecovery(tenant,'token');
 expect(db.prepare('SELECT name,row_version,sync_status FROM parties').get()).toMatchObject({name:'Newer local edit',row_version:6,sync_status:'PENDING'});
 expect(db.prepare("SELECT sent_at FROM sync_outbox WHERE op_id='newer'").get()).toMatchObject({sent_at:null});
 expect(value(`account_base:${tenant}:parties:${party}`)?.value).toBe('8:pc01');
});
it('a lost response retries the immutable saved snapshot instead of sending intervening edits as the same recovery',async()=>{
 let count=0;const bodies:string[]=[];
 state.fetch.mockImplementation(async(_url:string,init:RequestInit)=>{
   bodies.push(String(init.body));count++;
   if(count===1){db.exec("UPDATE parties SET name='Later edit',row_version=6,updated_at='later'");throw new Error('response lost');}
   return {ok:true,json:async()=>receipt};
 });
 queueAccountRecovery(tenant,'pc01',command);await runAccountRecovery(tenant,'token');await runAccountRecovery(tenant,'token');
 expect(bodies[1]).toBe(bodies[0]);expect(db.prepare('SELECT name,sync_status FROM parties').get()).toMatchObject({name:'Later edit',sync_status:'PENDING'});
});
it.each([{job_id:job,receipts:[]},{...receipt,receipts:[{...receipt.receipts[0],base:'wrong'}]}])('does not clear local pending state on incomplete or invalid receipts',async reply=>{
 state.fetch.mockResolvedValue({ok:true,json:async()=>reply});queueAccountRecovery(tenant,'pc01',command);await runAccountRecovery(tenant,'token');
 expect(db.prepare('SELECT sync_status FROM parties').get()).toMatchObject({sync_status:'PENDING'});
 expect(db.prepare('SELECT sent_at FROM sync_outbox').get()).toMatchObject({sent_at:null});
 expect(value(`account_recovery_complete:${tenant}:${job}`)).toBeUndefined();
});
it('does not start a write without a readable complete source or when queue history is newer',async()=>{
 db.exec('UPDATE sync_outbox SET row_version=99');queueAccountRecovery(tenant,'pc01',command);await runAccountRecovery(tenant,'token');expect(state.fetch).not.toHaveBeenCalled();
 expect(db.prepare('SELECT sync_status FROM parties').get()).toMatchObject({sync_status:'PENDING'});
});
it('a source-backup storage failure prevents the network request and retains every financial value',async()=>{
 db.exec("CREATE TRIGGER reject_backup BEFORE INSERT ON sync_meta WHEN NEW.key LIKE 'account_recovery_backup:%' BEGIN SELECT RAISE(ABORT,'storage unavailable'); END;");
 queueAccountRecovery(tenant,'pc01',command);await runAccountRecovery(tenant,'token');
 expect(state.fetch).not.toHaveBeenCalled();expect(db.prepare('SELECT name,balance,sync_status FROM parties').get()).toMatchObject({name:'Correct local name',balance:10,sync_status:'PENDING'});
});
it('an acknowledgement failure rolls back receipts and queue changes, and the retained snapshot can retry',async()=>{
 vi.spyOn(recoverySql,'finishCoveredOperations').mockImplementationOnce(()=>{throw new Error('ack storage failure');});
 queueAccountRecovery(tenant,'pc01',command);await runAccountRecovery(tenant,'token');
 expect(db.prepare('SELECT sync_status FROM parties').get()).toMatchObject({sync_status:'PENDING'});expect(value(`account_base:${tenant}:parties:${party}`)).toBeUndefined();
 expect(db.prepare('SELECT sent_at FROM sync_outbox').get()).toMatchObject({sent_at:null});
 await runAccountRecovery(tenant,'token');expect(db.prepare('SELECT sync_status FROM parties').get()).toMatchObject({sync_status:'SYNCED'});
});
it('an expired command with no immutable source snapshot cannot start recovery',async()=>{
 queueAccountRecovery(tenant,'pc01',{...command,expires_at:'2000-01-01T00:00:00Z'});await runAccountRecovery(tenant,'token');expect(state.fetch).not.toHaveBeenCalled();
});
