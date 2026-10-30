import { saveStoreCountry, saveVatPriceBasis } from './storeCountryService.js';
import type { SettingRow } from './typesB.js';
import { getDb } from '../db/localDb.js';
import * as settingsSql from '../db/statements/settings.js';
import { withPreservedLanKey } from './lanPairing.js';
/** settings use-cases for the main process (called by electron/ipc handlers). */

const LOCAL_DEVICE_SETTING_KEYS = [
  'terminal_code',
  'invoice_counter_config',
  'gst_b2b_invoice_counter_config',
  'gst_b2c_invoice_counter_config',
  'gst_invoice_counter_config',
  'return_counter',
  'scrap_invoice_counter',
  'quotation_counter',
  'barcode_printer_config',
  'receipt_printer_config',
  'a4_printer_config',
  'scale_config',
  'printer_config',
  'network_sync_config',
  'sync_engine',
  'auto_print_barcode',
  'print_format',
  'label_code_type',
  'label_show_shop_name',
  'billing_ui_config'
];

/** IPC `settings:getAll` */
export function getAll({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    const rows = settingsSql.findSettings(db).all(tid) as SettingRow[];

    const resultMap: Record<string, unknown> = {};
    const parseVal = (rawVal: string | null | undefined, key: string) => {
      if (rawVal === undefined || rawVal === null) return null;
      if (key === 'shop_gstin') return rawVal.trim().replace(/^"|"$/g, '');
      try {
        let parsed = JSON.parse(rawVal);
        if (typeof parsed === 'string') parsed = parsed.trim().replace(/^["']|["']$/g, '');
        if (parsed && typeof parsed === 'object' && (parsed.error === 'Operation failed' || parsed.success === false)) return null;
        return parsed;
      } catch {
        return String(rawVal).trim().replace(/^["']|["']$/g, '');
      }
    };

    for (const r of rows) {
      if (r.tenant_id === 'global') {
        resultMap[r.key] = parseVal(r.value, r.key);
      }
    }
    for (const r of rows) {
      if (r.tenant_id === tid && tid !== 'global') {
        const isLocal = LOCAL_DEVICE_SETTING_KEYS.includes(r.key);
        if (!isLocal || resultMap[r.key] === undefined) {
          resultMap[r.key] = parseVal(r.value, r.key);
        }
      }
    }
    return resultMap;
  } catch (error) {
    console.error('[settings:getAll]', error);
    return {};
  }
}

/** IPC `settings:get` */
export function get({ tenant_id, key }: { tenant_id: string; key: string }) {
  try {
    const db = getDb();
    const isLocalDeviceKey = LOCAL_DEVICE_SETTING_KEYS.includes(key);

    let row: SettingRow | null | undefined = null;
    if (isLocalDeviceKey) {
      row = settingsSql.findSettingsByKey(db).get(key) as SettingRow | null | undefined;
      if (!row && tenant_id && tenant_id !== 'global') {
        row = settingsSql.findSettingsByKeyValue(db).get(tenant_id, key) as SettingRow | null | undefined;
      }
      if (!row) {
        row = settingsSql.findOneSettingByKey(db).get(key) as SettingRow | null | undefined;
      }
    } else {
      const tid = tenant_id || 'global';
      row = settingsSql.findSettingsByKeyValue(db).get(tid, key) as SettingRow | null | undefined;
      if (!row && tid !== 'global') {
        row = settingsSql.findSettingsByKey(db).get(key) as SettingRow | null | undefined;
      }
      if (!row) {
        row = settingsSql.findOneSettingByKey(db).get(key) as SettingRow | null | undefined;
      }
    }

    if (row && row.value !== undefined) {
      if (key === 'shop_gstin') return row.value.trim().replace(/^"|"$/g, '');
      try {
        let parsed = JSON.parse(row.value);
        if (typeof parsed === 'string') {
          parsed = parsed.trim().replace(/^["']|["']$/g, '');
        }
        if (parsed && typeof parsed === 'object' && (parsed.error === 'Operation failed' || parsed.success === false)) {
          return null;
        }
        return parsed;
      } catch {
        return String(row.value).trim().replace(/^["']|["']$/g, '');
      }
    }
    return null;
  } catch (error) {
    console.error('[settings:get]', error);
    return null;
  }
}

/** IPC `settings:set` */
export async function set({ tenant_id, key, value }: { tenant_id: string; key: string; value: unknown }) {
  try {
    const db = getDb();
    const isLocalDeviceKey = LOCAL_DEVICE_SETTING_KEYS.includes(key);
    const syncStatus = isLocalDeviceKey ? 'LOCAL' : 'PENDING';
    const tid = tenant_id || 'global';
    if (key === 'store_country') return saveStoreCountry(db, tid, value);
    if (key === 'vat_price_inclusive') return saveVatPriceBasis(db, tid, value);
    if (key === 'network_sync_config' && value && typeof value === 'object') value = withPreservedLanKey(value as Record<string, unknown>);
    const valString = typeof value === 'string' ? value : JSON.stringify(value);

    const upsertStmt = settingsSql.upsertSetting(db);

    upsertStmt.run(tid, key, valString, syncStatus);

    // For local device hardware keys, also mirror to 'global' so any tenant or startup cycle on this terminal machine retains access
    if (isLocalDeviceKey && tid !== 'global') {
      upsertStmt.run('global', key, valString, syncStatus);
    }

    if (key === 'network_sync_config' && value && typeof value === 'object') {
      const { startLocalHostServer, stopLocalHostServer } = await import('../sync/localHostServer.js');
      const { reloadSyncConfig } = await import('../sync/syncWorker.js');
      if (((value as Record<string, unknown>).syncMode === 'LAN' || (value as Record<string, unknown>).syncMode === 'HYBRID') && (value as Record<string, unknown>).lanRole === 'PRIMARY') {
        startLocalHostServer(Number((value as Record<string, unknown>).lanPort) || 3888);
      } else {
        stopLocalHostServer();
      }
      reloadSyncConfig();
    }
    return { success: true };
  } catch (error) {
    console.error('[settings:set]', error);
    return { success: false, error: 'Operation failed' };
  }
}
