import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { ensureSchemaColumns } from '../../electron/db/schemaColumns';
import { runColumnMigrations } from '../../electron/db/migrationsColumns';
import { MIGRATIONS } from '../../electron/db/migrations';

export function stockDatabase(afterMigration?: (version:number,db:Database.Database)=>void) {
  const raw = new DatabaseSync(':memory:');
  let serial=0;
  const db=Object.assign(raw,{
    pragma:(sql:string)=>raw.prepare(`PRAGMA ${sql}`).all(),
    transaction:<T>(fn:(...args: unknown[])=>T)=>(...args:unknown[])=>{
      const name=`stock_test_${++serial}`;raw.exec(`SAVEPOINT ${name}`);
      try {const result=fn(...args);raw.exec(`RELEASE ${name}`);return result;}
      catch(error){raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);throw error;}
    },
  }) as unknown as Database.Database;
  createCoreTables(db);createExtendedTables(db);ensureSchemaColumns(db);runColumnMigrations(db);
  for(const migration of MIGRATIONS) { migration.up(db); afterMigration?.(migration.version,db); }
  return {raw,db};
}
