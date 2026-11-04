import type { Database } from 'better-sqlite3';
type Db = Pick<Database, 'prepare' | 'transaction'>;
import * as sql from '../db/statements/settings.js';

export function getStoreCountrySetting(db: Pick<Database, 'prepare'>, tenantId: string): 'IN' | 'AE' {
  const row = sql.findSettingsByKeyValue(db).get(tenantId, 'store_country') as { value?: string } | undefined;
  let country: unknown = row?.value;
  try { if (typeof country === 'string') country = JSON.parse(country); } catch { /* Plain settings are supported. */ }
  return country === 'AE' ? 'AE' : 'IN';
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
