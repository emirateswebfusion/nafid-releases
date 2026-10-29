import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../electron/db/statements/types';
import { toEpochMs, toIsoTimestamp } from '../../electron/utils/timestamps';
import { findOneSettingByKey } from '../../electron/db/statements/storeTime';
import { holdExpiryInstant } from '../../electron/db/statements/invoiceDates';
import { findInvoicesByInvoiceType, findInvoicesByInvoiceTypeAndIsHeld } from '../../electron/db/statements/invoices';
import { selectInvoices } from '../../electron/db/statements/main';
describe('UTC timestamp and timezone persistence contracts', () => {
  it('parses bare database UTC text independently of the computer timezone', () => {
    expect(toIsoTimestamp('2026-10-28 19:30:00.123')).toBe('2026-10-28T19:30:00.123Z');
    expect(toIsoTimestamp('2026-10-28T23:30:00.123+04:00')).toBe('2026-10-28T19:30:00.123Z');
    expect(toEpochMs('bad')).toBeNull();
  });
  it('prefers the shop timezone over a global fallback inserted first', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE settings(tenant_id TEXT,key TEXT,value TEXT);
      INSERT INTO settings VALUES ('global','store_timezone','"Asia/Kolkata"'),('shop','store_timezone','"Asia/Dubai"');`);
      expect(findOneSettingByKey(db as unknown as Db).get('shop')).toEqual({value:'"Asia/Dubai"'});
      expect(findOneSettingByKey(db as unknown as Db).get('other')).toEqual({value:'"Asia/Kolkata"'});
    } finally { db.close(); }
  });
  it('keeps legacy local expiry instants while new UTC holds expire consistently in both scanners', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE invoices(invoice_id TEXT,tenant_id TEXT,invoice_type TEXT,is_held INTEGER,held_until TEXT,created_at TEXT);
        INSERT INTO invoices VALUES ('legacy','shop','HOLD',1,datetime('now','+24 hours','localtime'),'2026-10-28'),
        ('utc','shop','HOLD',1,strftime('%Y-%m-%dT%H:%M:%fZ','now','+24 hours'),'2026-10-28'),
        ('expired','shop','HOLD',1,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour'),'2026-10-28');`);
      const typed = db as unknown as Db;
      expect(findInvoicesByInvoiceTypeAndIsHeld(typed).all('shop')).toHaveLength(2);
      expect(findInvoicesByInvoiceType(typed).all('shop')).toEqual([{invoice_id:'expired'}]);
      expect(selectInvoices(typed).all()).toEqual([{invoice_id:'expired',tenant_id:'shop'}]);
      const spread = db.prepare(`SELECT MAX(${holdExpiryInstant()})-MIN(${holdExpiryInstant()}) days FROM invoices WHERE invoice_id IN ('legacy','utc')`).get() as {days:number};
      expect(Math.abs(spread.days)).toBeLessThan(1/86400);
    } finally { db.close(); }
  });
});