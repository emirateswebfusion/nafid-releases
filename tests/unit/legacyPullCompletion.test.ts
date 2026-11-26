import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { beforeEach,afterEach,expect,it,vi } from 'vitest';
const fixture=vi.hoisted(()=>({db:null as unknown as Database.Database,pages:[] as unknown[],fetch:vi.fn(),tenant:'shop'}));
vi.mock('electron',()=>({BrowserWindow:{getAllWindows:()=>[]}}));
vi.mock('../../electron/db/localDb',()=>({getDb:()=>fixture.db}));
vi.mock('../../electron/sync/syncConfig',()=>({CURSOR_REPLAY_SECONDS:5,FETCH_TIMEOUT_MS:1000,PULL_MAX_PAGES:2,PULL_MAX_RETRIES:1,PULL_PAGE_SIZE:2,getAuthConfig:()=>({tenant_id:fixture.tenant,jwt_token:'token'})}));
vi.mock('../../electron/services/lanPairing',()=>({LAN_KEY_HEADER:'x-nafid-lan-key',getLanPairingKey:()=>''}));
vi.mock('../../electron/sync/cloudAccess',()=>({calculateEffectiveCloudAccess:()=>({isCloudAllowed:true})}));
vi.mock('../../electron/sync/syncProgress',()=>({notifyOnlineStatus:vi.fn()}));
import { pullPaginated,replaySince,tableContentHashes } from '../../electron/sync/syncTransport';
import { syncState } from '../../electron/sync/syncState';
let raw:DatabaseSync;
const value=(key:string)=>(raw.prepare('SELECT value FROM sync_meta WHERE key=?').get(key) as {value:string}|undefined)?.value;
beforeEach(()=>{
 raw=new DatabaseSync(':memory:');fixture.db=Object.assign(raw,{transaction:(fn:()=>unknown)=>()=>{
  raw.exec('SAVEPOINT pull');try{const result=fn();raw.exec('RELEASE pull');return result;}catch(error){raw.exec('ROLLBACK TO pull; RELEASE pull');throw error;}
 }}) as unknown as Database.Database;
 raw.exec(`CREATE TABLE sync_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE sync_apply_guard(id INTEGER PRIMARY KEY);
 CREATE TABLE settings(key TEXT,value TEXT,tenant_id TEXT);CREATE TABLE received(tenant TEXT,id TEXT,PRIMARY KEY(tenant,id));`);
 fixture.tenant='shop';fixture.pages=[];fixture.fetch.mockReset();
 fixture.fetch.mockImplementation(async()=>new Response(JSON.stringify(fixture.pages.shift() ?? [])));
 syncState.isSyncActive=true;syncState.currentActiveRoute='CLOUD';syncState.lastCycleFailed=false;
 for(const key of Object.keys(tableContentHashes))delete tableContentHashes[key];
 vi.stubEnv('VENDORA_CLOUD_API','https://cloud.test');vi.stubGlobal('fetch',fixture.fetch);
});
afterEach(()=>{raw.close();vi.unstubAllGlobals();vi.unstubAllEnvs();syncState.isSyncActive=false;});
const row=(id:string,updated_at='2026-11-22T06:00:00Z')=>({id,updated_at});
const pull=()=>pullPaginated({token:'token',tenantId:fixture.tenant,table:'products',urlPath:'/api/sync/products',label:'products',processPage:rows=>{
 fixture.db.transaction(()=>{for(const record of rows)raw.prepare('INSERT OR REPLACE INTO received VALUES(?,?)').run(fixture.tenant,record.id);})();return 0;
}});
it('reaching the page budget retains the old cursor and reports an incomplete download',async()=>{
 raw.exec("INSERT INTO sync_meta VALUES('pull_cursor:shop:products','2025-01-01T00:00:00Z')");
 fixture.pages=[[row('1'),row('2')],[row('3'),row('4')]];
 expect(await pull()).toMatchObject({count:4,failed:true,hasChanged:false});
 expect(value('pull_cursor:shop:products')).toBe('2025-01-01T00:00:00Z');
 expect(value('account_pull_pending:shop:products')).toBe('1');
 expect(syncState.lastCycleFailed).toBe(true);
});
it.each([{}, {products:'invalid'}, [null], [row('invalid','not-a-date')]])('an invalid success body cannot be treated as a completed empty page: %j',async body=>{
 fixture.pages=[body];expect((await pull()).failed).toBe(true);
 expect(value('pull_cursor:shop:products')).toBeUndefined();expect(value('account_pull_pending:shop:products')).toBe('1');
 expect(raw.prepare('SELECT * FROM received').all()).toEqual([]);
});
it('commits a valid completed cursor and clears only this table/shop incomplete marker',async()=>{
 raw.exec("INSERT INTO sync_meta VALUES('account_pull_pending:shop:products','1'),('account_pull_pending:other:products','1')");
 fixture.pages=[[row('1')]];expect((await pull()).failed).toBe(false);
 expect(value('pull_cursor:shop:products')).toBe('2026-11-22T06:00:00.000Z');
 expect(value('account_pull_pending:shop:products')).toBeUndefined();expect(value('account_pull_pending:other:products')).toBe('1');
});
it('does not share content-hash notification suppression between shops',async()=>{
 fixture.pages=[[row('same')]];expect((await pull()).hasChanged).toBe(true);
 fixture.tenant='other';fixture.pages=[[row('same')]];expect((await pull()).hasChanged).toBe(true);
});
it('compares actual instants across offsets and replays a negative-offset cursor correctly',async()=>{
 fixture.pages=[[row('1','2026-11-22T10:30:00+05:30'),row('2','2026-11-22T06:00:00Z')],[]];
 expect((await pull()).failed).toBe(false);expect(value('pull_cursor:shop:products')).toBe('2026-11-22T06:00:00.000Z');
 expect(replaySince('2026-11-22T01:00:00-05:00')).toBe('2026-11-22T05:59:55.000Z');
});
it('cursor-storage failure is not reported as successful completion',async()=>{
 raw.exec("CREATE TRIGGER reject_cursor BEFORE INSERT ON sync_meta WHEN NEW.key LIKE 'pull_cursor:%' BEGIN SELECT RAISE(ABORT,'test disk failure');END");
 fixture.pages=[[row('1')]];expect((await pull()).failed).toBe(true);
 expect(value('pull_cursor:shop:products')).toBeUndefined();expect(value('account_pull_pending:shop:products')).toBe('1');
});
