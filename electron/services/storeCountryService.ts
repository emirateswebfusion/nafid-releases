import type { Database } from 'better-sqlite3';
type Db = Pick<Database, 'prepare' | 'transaction'>;
import * as sql from '../db/statements/settings.js';

/** Mirrors the renderer's `StoreCountry` (src/utils/localization/storeProfile.ts); change both together. */
export type StoreCountry = 'IN' | 'AE' | 'BH';

import { parseStoreCountry } from '../utils/moneyRounding.js';

export function getStoreCountrySetting(db: Pick<Database, 'prepare'>, tenantId: string): StoreCountry {
  const row = sql.findSettingsByKeyValue(db).get(tenantId, 'store_country') as { value?: string } | undefined;
  return parseStoreCountry(row?.value);
}

/** Single-rate VAT countries (UAE, Bahrain); India is GST. Mirrors the renderer's `isVatStore`. */
export function isVatCountry(country: StoreCountry): boolean { return country !== 'IN'; }

/** Default shop timezone of a country, used only when the shop has not saved one. */
export function storeCountryTimezone(country: StoreCountry): string {
  return country === 'AE' ? 'Asia/Dubai' : country === 'BH' ? 'Asia/Bahrain' : 'Asia/Kolkata';
}

/** Main-process money text, mirroring the renderer's src/utils/pricing/money.ts profile (prefix, locale). */
export function storeMoneyProfile(country: StoreCountry): { prefix: string; locale: string } {
  if (country === 'AE') return { prefix: 'AED ', locale: 'en-AE' };
  if (country === 'BH') return { prefix: 'BHD ', locale: 'en-BH' };
  return { prefix: '₹', locale: 'en-IN' };
}

/** Fraction digits of the shop currency: 2, or 3 for BHD (1000 fils). */
export { parseStoreCountry, roundStoreMoney, storeMoneyDecimals, storeMoneyFixed, storeMoneyMinorUnit } from '../utils/moneyRounding.js';
import { storeMoneyDecimals } from '../utils/moneyRounding.js';

/** `1234.5` → `₹1,234.50` (India), `AED 1,234.50` (UAE) or `BHD 1,234.500` (Bahrain); the sign goes before the prefix. */
export function formatStoreMoney(amount: number | null | undefined, country: StoreCountry): string {
  const num = Number(amount) || 0;
  const { prefix, locale } = storeMoneyProfile(country);
  const decimals = storeMoneyDecimals(country);
  const abs = Math.abs(num).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${num < 0 ? '-' : ''}${prefix}${abs}`;
}

/**
 * A currency change must never reinterpret prices, balances or historical documents.
 * Bahrain is recognised when read but cannot be chosen yet: it is accepted here only once three-decimal money,
 * its documents and its VAT return are complete (renderer list: `SELECTABLE_STORE_COUNTRIES`).
 */
export function saveStoreCountry(db: Db, tenantId: string, value: unknown) {
  if (value !== 'IN' && value !== 'AE' && value !== 'BH') return { success: false, error: 'Choose India, United Arab Emirates, or Bahrain.' };
  return db.transaction(() => {
    const country = getStoreCountrySetting(db, tenantId);
    if (value !== country) {
      const data = sql.findCountryChangeBlockers(db).get({ tenant_id: tenantId }) as { has_data: number };
      if (data.has_data) return { success: false, error: 'This shop already has prices, balances or transactions. Create a new shop for a different currency; changing country does not convert money.' };
    }
    sql.upsertSetting(db).run(tenantId, 'store_country', value, 'PENDING');
    return { success: true };
  })();
}

export function saveVatPriceBasis(db: Db, tenantId: string, value: unknown) {
  if (typeof value !== 'boolean') return { success: false, error: 'VAT price basis must be a boolean.' };
  return db.transaction(() => {
    const row = sql.findSettingsByKeyValue(db).get(tenantId, 'vat_price_inclusive') as { value?: string } | undefined;
    if (isVatCountry(getStoreCountrySetting(db, tenantId)) && value !== (row?.value === 'true')) {
      const data = sql.findCountryChangeBlockers(db).get({ tenant_id: tenantId }) as { has_data: number };
      if (data.has_data) return { success: false, error: 'Choose the VAT price basis before entering prices or transactions. Existing prices need an explicit migration.' };
    }
    sql.upsertSetting(db).run(tenantId, 'vat_price_inclusive', JSON.stringify(value), 'PENDING');
    return { success: true };
  })();
}
