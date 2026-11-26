import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as unknown as Database.Database, databaseBackup:vi.fn(), backup: vi.fn(), queue: vi.fn(), apply: vi.fn(), fetch: vi.fn(), issues: [] as {entity:string;entity_id:string}[] }));
vi.mock('../../electron/db/localDb',()=>({getDb:()=>state.db}));
vi.mock('../../electron/services/sourceDatabaseBackup',()=>({ensureSourceDatabaseBackup:state.databaseBackup}));
vi.mock('../../electron/db/statements/sync/supportReport',()=>({accountIssues:()=>({all:()=>state.issues})}));
vi.mock('../../electron/sync/accountRecovery',()=>({prepareAccountRecoverySnapshot:state.backup,queueAccountRecovery:state.queue,runAccountRecovery:state.apply}));
import { enqueueSourceRecovery, processSourceRecoveryRequest } from '../../electron/sync/sourceRecoveryRequest';
let raw: DatabaseSync;
const read=(key:string)=>(raw.prepare('SELECT value FROM sync_meta WHERE key=?').get(key) as {value:string}|undefined)?.value;
beforeEach(()=>{
  raw=new DatabaseSync(':memory:'); state.db=Object.assign(raw,{transaction:(fn:()=>unknown)=>()=>{
    raw.exec('SAVEPOINT source_request');try{const result=fn();raw.exec('RELEASE source_request');return result;}
    catch(error){raw.exec('ROLLBACK TO source_request; RELEASE source_request');throw error;}
  }}) as unknown as Database.Database;
  raw.exec(`CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO sync_meta VALUES('origin','pc01');
    CREATE TABLE parties(tenant_id TEXT,sync_status TEXT); CREATE TABLE party_ledger(tenant_id TEXT,sync_status TEXT);
    INSERT INTO parties VALUES('shop','PENDING')`);
  state.issues=[{entity:'parties',entity_id:'11111111-1111-4111-8111-111111111111'}];
  vi.stubEnv('VENDORA_CLOUD_API','https://approved.example');vi.stubGlobal('fetch',state.fetch);
  state.backup.mockReset();state.queue.mockReset();state.apply.mockReset();state.fetch.mockReset();
  state.databaseBackup.mockReset();state.databaseBackup.mockResolvedValue(undefined);
});
afterEach(()=>{raw.close();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('click intent is durable, idempotent and does not wait for network or touch financial records',()=>{
  enqueueSourceRecovery('shop','admin');const saved=read('source_recovery_request:shop');
  enqueueSourceRecovery('shop','admin');expect(read('source_recovery_request:shop')).toBe(saved);
  expect(state.fetch).not.toHaveBeenCalled();expect(state.backup).not.toHaveBeenCalled();
  expect(raw.prepare('SELECT sync_status FROM parties').get()).toEqual({sync_status:'PENDING'});
});
it('local backup failure prevents every server request and preserves the intent for developer review',async()=>{
  enqueueSourceRecovery('shop','admin');state.backup.mockImplementation(()=>{throw new Error('disk full');});
  expect(await processSourceRecoveryRequest('shop','token')).toBe(false);
  expect(state.fetch).not.toHaveBeenCalled();expect(read('source_recovery_request:shop')).toBeDefined();
  const request=JSON.parse(read('source_recovery_request:shop')!);
  expect(read(`account_recovery_error:shop:${request.job_id}`)).toBe('RETRY_RETAINED');
});
it('retries the same scope/id after a lost request response; no new financial values or job identity are invented',async()=>{
  enqueueSourceRecovery('shop','admin');const bodies:string[]=[];
  state.fetch.mockImplementation(async (_url,init:RequestInit)=>{expect(state.backup).toHaveBeenCalledTimes(1);bodies.push(String(init.body));throw new Error('offline');});
  expect(await processSourceRecoveryRequest('shop','token')).toBe(false);
  expect(await processSourceRecoveryRequest('shop','token')).toBe(false);
  expect(bodies[1]).toBe(bodies[0]);expect(state.apply).not.toHaveBeenCalled();
});
it('does not drop or split a scope over the safe limit to claim success',async()=>{
  enqueueSourceRecovery('shop','admin');for(let i=0;i<100;i++)raw.exec("INSERT INTO parties VALUES('shop','PENDING')");
  expect(await processSourceRecoveryRequest('shop','token')).toBe(false);
  expect(state.backup).not.toHaveBeenCalled();expect(state.fetch).not.toHaveBeenCalled();
});
it('rechecks the retained database backup before retrying an uncertain server request',async()=>{
  enqueueSourceRecovery('shop','admin');state.fetch.mockRejectedValue(new Error('offline'));
  await processSourceRecoveryRequest('shop','token');expect(state.fetch).toHaveBeenCalledTimes(1);
  state.databaseBackup.mockRejectedValue(new Error('retained file missing'));
  expect(await processSourceRecoveryRequest('shop','token')).toBe(false);
  expect(state.fetch).toHaveBeenCalledTimes(1);expect(state.apply).not.toHaveBeenCalled();
});
it('clears only the request after exact existing recovery acknowledgement, retaining the original confirmation',async()=>{
  enqueueSourceRecovery('shop','admin');const request=JSON.parse(read('source_recovery_request:shop')!);
  state.fetch.mockResolvedValue({ok:true,json:async()=>({recovery:{job_id:request.job_id}})});
  state.apply.mockImplementation(async()=>{raw.prepare('INSERT INTO sync_meta VALUES(?,?)').run(`account_recovery_complete:shop:${request.job_id}`,'done');});
  expect(await processSourceRecoveryRequest('shop','token')).toBe(true);
  expect(read('source_recovery_request:shop')).toBeUndefined();expect(read('source_recovery_confirmation:shop')).toBeDefined();
});
