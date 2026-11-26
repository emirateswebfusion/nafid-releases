/** Native online-backup check. Run with the isolated Electron/Node preload and fresh EQ_USERDATA. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
const tree = path.resolve(process.argv[2] || '.');
const { initDb, getDb } = await import(pathToFileURL(path.join(tree, 'electron/db/localDb.ts')).href);
const { ensureSourceDatabaseBackup } = await import(pathToFileURL(path.join(tree, 'electron/services/sourceDatabaseBackup.ts')).href);
initDb();
const db = getDb();
db.exec('CREATE TABLE backup_runtime_probe(id INTEGER PRIMARY KEY,note TEXT,data BLOB)');
const insert = db.prepare('INSERT INTO backup_runtime_probe VALUES(?,?,?)');
db.transaction(() => { for (let id=0;id<200;id++) insert.run(id,'original',Buffer.alloc(32_768,id%256)); })();
let edits=0,finished=false;
function keepWorking() {
  if (finished || edits>=3) return;
  edits++; db.prepare('UPDATE backup_runtime_probe SET note=? WHERE id=0').run(`working-${edits}`);
  setImmediate(keepWorking);
}
const job='11111111-1111-4111-8111-111111111111';
const pending=ensureSourceDatabaseBackup('test-shop',job);
setImmediate(keepWorking);
await pending;finished=true;
assert(edits>0,'foreground event loop must progress during online backup');
assert.equal((db.prepare('SELECT COUNT(*) n FROM backup_runtime_probe').get() as {n:number}).n,200);
assert.equal((db.prepare('SELECT note FROM backup_runtime_probe WHERE id=0').get() as {note:string}).note,`working-${edits}`);
const copy = new Database(path.join(process.env.EQ_USERDATA!,'source-recovery-backups',`${job}.sqlite`),{readonly:true,fileMustExist:true});
assert.equal(copy.pragma('quick_check',{simple:true}),'ok');
assert.equal((copy.prepare('SELECT COUNT(*) n FROM backup_runtime_probe').get() as {n:number}).n,200);
copy.close();
await ensureSourceDatabaseBackup('test-shop',job); // Verify immutable-file digest on replay.
db.close();
console.error('Online source backup passed: billing-like writes continued, 200 rows retained, SQLite quick_check and replay digest valid.');
process.exit(0);
