import type { Database } from 'better-sqlite3';
type Db = Pick<Database, 'prepare' | 'transaction'>;
import * as sql from '../db/statements/settings.js';

export function getStoreCountrySetting(db: Pick<Database, 'prepare'>, tenantId: string): 'IN' | 'AE' {
  const row = sql.findSettingsByKeyValue(db).get(tenantId, 'store_country') as { value?: string } | undefined;
  let country: unknown = row?.value;
  try { if (typeof country === 'string') country = JSON.parse(country); } catch { /* Plain settings are supported. */ }
  return country === 'AE' ? 'AE' : 'IN';
}

/** Main-process money text, mirroring the renderer's src/utils/pricing/money.ts profile (prefix, locale). */
export function storeMoneyProfile(country: 'IN' | 'AE'): { prefix: string; locale: string } {
  return country === 'AE' ? { prefix: 'AED ', locale: 'en-AE' } : { prefix: '₹', locale: 'en-IN' };
}

/** `1234.5` → `₹1,234.50` (India) or `AED 1,234.50` (UAE); the sign goes before the prefix. */
export function formatStoreMoney(amount: number | null | undefined, country: 'IN' | 'AE'): string {
  const num = Number(amount) || 0;
  const { prefix, locale } = storeMoneyProfile(country);
  const abs = Math.abs(num).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${num < 0 ? '-' : ''}${prefix}${abs}`;
}

/** A currency change must never reinterpret prices, balances or historical documents. */
export function saveStoreCountry(db: Db, tenantId: string, value: unknown) {
  if (value !== 'IN' && value !== 'AE') return { success: false, error: 'Choose India or United Arab Emirates.' };
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
    if (getStoreCountrySetting(db, tenantId) === 'AE' && value !== (row?.value === 'true')) {
      const data = sql.findCountryChangeBlockers(db).get({ tenant_id: tenantId }) as { has_data: number };
      if (data.has_data) return { success: false, error: 'Choose the VAT price basis before entering prices or transactions. Existing prices need an explicit migration.' };
    }
    sql.upsertSetting(db).run(tenantId, 'vat_price_inclusive', JSON.stringify(value), 'PENDING');
    return { success: true };
  })();
}
