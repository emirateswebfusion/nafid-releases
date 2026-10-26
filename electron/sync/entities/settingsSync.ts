import { getDb } from '../../db/localDb.js';
import { toSqliteDate } from '../syncConfig.js';
import { notifyPullProgress } from '../syncProgress.js';
import { getSyncTargetLabel, pullPaginated, pushBatch } from '../syncTransport.js';
import * as settingsSyncSql from '../../db/statements/sync/settingsSync.js';

/** Settings sync: push and pull of shared settings; device-local keys never leave the terminal. */
export const LOCAL_DEVICE_SETTING_KEYS = [
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
  'auto_print_barcode',
  'print_format',
  'label_code_type',
  'label_show_shop_name'
];

// ── Settings Sync (Edge → Cloud / LAN) ─────────────────────────────────────────────
export async function syncSettings(token: string, tenantId: string) {
  const db = getDb();
  try {
    const placeholders = LOCAL_DEVICE_SETTING_KEYS.map(() => '?').join(',');
    settingsSyncSql.markDeviceSettingsLocal(db, placeholders).run(tenantId, ...LOCAL_DEVICE_SETTING_KEYS);
  } catch (e) {}

  const pending = (settingsSyncSql.selectSettings(db).all(tenantId) as any[])
    .filter((row: any) => !LOCAL_DEVICE_SETTING_KEYS.includes(row.key));

  if (pending.length === 0) return;
  console.log(`[SyncWorker] Pushing ${pending.length} settings to ${getSyncTargetLabel()}...`);

  const synced = await pushBatch(
    '/api/sync/settings',
    token,
    pending,
    'settings',
    'Settings',
  );
  if (synced.length > 0) {
    const updateStmt = settingsSyncSql.updateSettings2(db);
    const tx = db.transaction((keys: string[]) => { for (const key of keys) updateStmt.run(key, tenantId); });
    tx(synced);
  }
}

// ── Remote Emergency Wipe Handler ─────────────────────────────────────────────
// ── Pull Settings (Cloud → Edge) ─────────────────────────────────────────────
export async function pullSettings(token: string, tenantId: string): Promise<boolean> {
  const db = getDb();

  const allowedKeys = [
    'shop_name', 'shop_phone', 'shop_address', 'shop_gstin', 'shop_state',
    'shop_email', 'shop_website', 'upi_id', 'show_upi_qr', 'show_product_offers',
    'enable_scrap', 'gst_profit_percentage', 'loyalty_config',
    'price_coding', 'three_invoice_series', 'isDomainConfirmed',
    'billing_ui_config', 'enable_party_gst_balance', 'enable_party_estimate_balance',
    'enable_real_paper_stock', 'show_paper_stock_in_gst', 'show_paper_stock_in_estimate',
    'show_zero_paper_stock', 'enable_convert_to_gst', 'show_product_gst_badge',
    'time_format', 'store_timezone', 'bank_name', 'bank_account_number',
    'bank_ifsc', 'bank_branch', 'feature_flags', 'print_format', 'label_code_type',
    'label_show_shop_name', 'auto_print_barcode', 'show_cash_register', 'staff_data_masking_config',
    'emergency_panic_config'
  ];

  const upsert = settingsSyncSql.insertSettings(db);

  const result = await pullPaginated({
    token,
    tenantId,
    table: 'tenant_settings',
    urlPath: '/api/sync/settings',
    label: 'settings',
    onProgress: (fetched) => notifyPullProgress('settings', fetched),
    processPage: (rows) => {
      const validSettings = rows.filter((s: any) => allowedKeys.includes(s.key));
      if (validSettings.length === 0) return 0;

      const tx = db.transaction((settings: any[]) => {
        for (const s of settings) {
          let valueToSave = s.value;

          if (typeof valueToSave === 'object') {
            valueToSave = JSON.stringify(valueToSave);
          } else if (s.key === 'label_code_type' && (valueToSave === 'barcode' || valueToSave === 'qrcode')) {
            valueToSave = JSON.stringify(valueToSave);
          }

          if (typeof valueToSave !== 'string') valueToSave = String(valueToSave);

          upsert.run({
            tenant_id: s.tenant_id || tenantId,
            key: s.key,
            value: valueToSave,
            updated_at: toSqliteDate(s.updated_at)
          });

        }
      });

      tx(validSettings);
      return validSettings.length;
    },
  });

  if (result.hasChanged && result.count > 0) {
    console.log(`[SyncWorker] Pulled ${result.count} settings from cloud.`);
  } else if (result.failed) {
    console.error('[SyncWorker] Pull settings failed.');
  }
  return result.hasChanged && result.count > 0;
}
