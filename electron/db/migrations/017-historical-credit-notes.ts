import type { Migration } from './runner.js';

/** Preserve existing returns, items, indexes and outbox triggers while allowing an absent original invoice. */
export const m017HistoricalCreditNotes: Migration = {
  version: 17, name: 'historical-credit-notes',
  up: db => {
    const columns = db.prepare('PRAGMA table_info(returns)').all() as { name: string; notnull: number }[];
    if (!columns.find(column => column.name === 'invoice_id')?.notnull) return;
    const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='returns'").get() as { sql: string };
    const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='returns' AND type IN ('index','trigger') AND sql IS NOT NULL").all() as { sql: string }[];
    const ddl = table.sql.replace(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:"returns"|returns)(?=\s*\()/i, 'CREATE TABLE returns_historical')
      .replace(/(invoice_id\s+TEXT)\s+NOT NULL/i, '$1');
    if (ddl === table.sql || /invoice_id\s+TEXT\s+NOT NULL/i.test(ddl)) throw new Error('Cannot migrate return invoice reference');
    const itemTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='return_items'").get() as { sql: string };
    const itemObjects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='return_items' AND type IN ('index','trigger') AND sql IS NOT NULL").all() as { sql: string }[];
    db.exec('CREATE TEMP TABLE historical_return_items AS SELECT * FROM return_items');
    db.exec('DROP TABLE return_items');
    db.exec(ddl);
    const fields = columns.map(column => '"' + column.name.replace(/"/g, '""') + '"').join(',');
    db.exec('INSERT INTO returns_historical (' + fields + ') SELECT ' + fields + ' FROM returns');
    db.exec('DROP TABLE returns');
    db.exec('ALTER TABLE returns_historical RENAME TO returns');
    for (const object of objects) db.exec(object.sql);
    db.exec(itemTable.sql);
    db.exec('INSERT INTO return_items SELECT * FROM historical_return_items');
    db.exec('DROP TABLE historical_return_items');
    for (const object of itemObjects) db.exec(object.sql);
  },
};
