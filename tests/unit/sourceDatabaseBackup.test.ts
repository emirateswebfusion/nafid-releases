import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(()=>({backup:vi.fn(),metadata:new Map<string,string>(),files:new Map<string,number>()}));
vi.mock('electron',()=>({app:{getPath:()=>'/private-profile'}}));
vi.mock('node:fs',()=>({createReadStream:(file:string)=>(async function*(){yield Buffer.alloc(fixture.files.get(file) || 0);})()}));
vi.mock('../../electron/db/localDb',()=>({getDb:()=>({backup:fixture.backup})}));
vi.mock('../../electron/db/statements/sync/accountMetadata',()=>({read:()=>({get:(key:string)=>fixture.metadata.has(key)?{value:fixture.metadata.get(key)}:undefined}),write:()=>({run:(key:string,value:string)=>fixture.metadata.set(key,value)})}));
vi.mock('node:fs/promises',()=>({mkdir:vi.fn(),stat:async(file:string)=>{if(!fixture.files.has(file))throw Object.assign(new Error('missing'),{code:'ENOENT'});return {size:fixture.files.get(file)};},rm:async(file:string)=>{fixture.files.delete(file);},rename:async(from:string,to:string)=>{fixture.files.set(to,fixture.files.get(from)!);fixture.files.delete(from);}}));
import { ensureSourceDatabaseBackup } from '../../electron/services/sourceDatabaseBackup';
const job='11111111-1111-4111-8111-111111111111';
afterEach(()=>{fixture.backup.mockReset();fixture.metadata.clear();fixture.files.clear();});
it('yields in bounded page batches and retains one immutable completed backup per request',async()=>{
 fixture.backup.mockImplementation(async(file:string,options:{progress:()=>number})=>{expect(options.progress()).toBe(128);fixture.files.set(file,4096);return {remainingPages:0,totalPages:1};});
 await ensureSourceDatabaseBackup('shop',job);await ensureSourceDatabaseBackup('shop',job);
 expect(fixture.backup).toHaveBeenCalledTimes(1);expect(JSON.parse(fixture.metadata.get(`source_recovery_db_backup:shop:${job}`)!)).toMatchObject({size:4096,sha256:expect.any(String)});
});
it('an incomplete backup never becomes a trusted backup marker',async()=>{
 fixture.backup.mockResolvedValue({remainingPages:1,totalPages:2});
 await expect(ensureSourceDatabaseBackup('shop',job)).rejects.toThrow('incomplete');
 expect(fixture.metadata.size).toBe(0);
});
it('cannot replace a missing retained backup or use a path supplied as job identity',async()=>{
 fixture.metadata.set(`source_recovery_db_backup:shop:${job}`,JSON.stringify({size:4096,sha256:'missing'}));
 await expect(ensureSourceDatabaseBackup('shop',job)).rejects.toThrow();
 await expect(ensureSourceDatabaseBackup('shop','../../database')).rejects.toThrow('identity');
 expect(fixture.backup).not.toHaveBeenCalled();
});
