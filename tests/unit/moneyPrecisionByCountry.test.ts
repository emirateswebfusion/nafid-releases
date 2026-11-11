/**
 * Bahrain adds a third decimal; India and UAE must keep their two-decimal rounding and one-paisa tolerances.
 * These tests fail if a tolerance or a SQL ROUND() is hardcoded to three decimals for every shop.
 */
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { moneyDecimalsSql } from '../../electron/db/statements/moneyPrecision';
import { roundStoreMoney, storeMoneyMinorUnit } from '../../electron/utils/moneyRounding';
import { moneyMinorUnit } from '../../src/utils/pricing/moneyRounding';
import { setStoreCountry } from '../../src/utils/localization/storeProfile';

afterEach(() => setStoreCountry('IN'));

describe('money tolerances follow the currency', () => {
  it('main process: one paisa for India and UAE, one fils for Bahrain', () => {
    expect(storeMoneyMinorUnit('IN')).toBe(0.01);
    expect(storeMoneyMinorUnit('AE')).toBe(0.01);
    expect(storeMoneyMinorUnit('BH')).toBe(0.001);
    expect(storeMoneyMinorUnit('IN') / 2).toBe(0.005);
    expect(storeMoneyMinorUnit(undefined)).toBe(0.01);
    expect(roundStoreMoney(1.2345, 'IN')).toBe(1.23);
    expect(roundStoreMoney(1.2345, 'BH')).toBe(1.235);
  });

  it('main process: the loyalty discount tolerance is a tenth of the minor unit, 0.001 for India as before', () => {
    expect(storeMoneyMinorUnit('IN') / 10).toBe(0.001);
    expect(storeMoneyMinorUnit('BH') / 10).toBe(0.0001);
  });

  it('main process: a missing amount stays NaN, so an uncounted cash drawer is stored as NULL and not as 0 short', () => {
    expect(roundStoreMoney(Number(undefined), 'IN')).toBeNaN();
    expect(roundStoreMoney(NaN, 'BH')).toBeNaN();
    expect(roundStoreMoney(0, 'IN')).toBe(0);
  });

  it('renderer: one paisa for India and UAE, one fils for Bahrain', () => {
    expect(moneyMinorUnit()).toBe(0.01);
    setStoreCountry('AE');
    expect(moneyMinorUnit()).toBe(0.01);
    setStoreCountry('BH');
    expect(moneyMinorUnit()).toBe(0.001);
  });
});

describe('SQL money rounding follows the shop country', () => {
  const open = () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE settings (tenant_id TEXT, key TEXT, value TEXT);
             CREATE TABLE ledger (tenant_id TEXT, amount REAL);
             INSERT INTO ledger VALUES ('india', 10.004), ('india', 0.0012), ('uae', 10.004), ('uae', 0.0012),
               ('bahrain', 10.004), ('bahrain', 0.0012), ('bahrain-json', 10.004), ('bahrain-json', 0.0012), ('unset', 10.004), ('unset', 0.0012);
             INSERT INTO settings VALUES ('india', 'store_country', 'IN'), ('uae', 'store_country', '"AE"'),
               ('bahrain', 'store_country', 'BH'), ('bahrain-json', 'store_country', '"BH"'), ('uae', 'shop_name', 'BH');`);
    return db;
  };
  const total = (db: DatabaseSync, tenant: string) => (db.prepare(
    `SELECT ROUND(SUM(l.amount), ${moneyDecimalsSql('l.tenant_id')}) AS total FROM ledger l WHERE l.tenant_id = ?`,
  ).get(tenant) as { total: number }).total;

  it('keeps two decimals for India, UAE and shops without a country setting', () => {
    const db = open();
    expect(total(db, 'india')).toBe(10.01);
    expect(total(db, 'uae')).toBe(10.01);
    expect(total(db, 'unset')).toBe(10.01);
    db.close();
  });

  it('keeps fils for a Bahrain shop, whether the setting is plain or JSON-quoted', () => {
    const db = open();
    expect(total(db, 'bahrain')).toBe(10.005);
    expect(total(db, 'bahrain-json')).toBe(10.005);
    db.close();
  });

  it('works inside an UPDATE that compares a stored balance', () => {
    const db = open();
    db.exec(`CREATE TABLE parties (party_id TEXT, tenant_id TEXT, balance REAL);
             INSERT INTO parties VALUES ('p-in', 'india', 100.004), ('p-bh', 'bahrain', 100.004);`);
    const update = db.prepare(`UPDATE parties SET balance = ? WHERE party_id = ? AND ROUND(COALESCE(balance, 0), ${moneyDecimalsSql('parties.tenant_id')}) <> ?`);
    // India: 100.004 is 100.00 at two decimals, so a recalculated 100 is not a change.
    expect(update.run(100, 'p-in', 100).changes).toBe(0);
    // Bahrain: 100.004 is a real 4 fils, so a recalculated 100 is a change.
    expect(update.run(100, 'p-bh', 100).changes).toBe(1);
    db.close();
  });
});
