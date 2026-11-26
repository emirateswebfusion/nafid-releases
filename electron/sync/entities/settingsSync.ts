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
  'sync_engine',
  'billing_ui_config',
  'card_terminal_config',
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
  } catch { /* ignore */ }

  const pending = (settingsSyncSql.selectSettings(db).all(tenantId) as Record<string, unknown>[])
    .filter((row: Record<string, unknown>) => !LOCAL_DEVICE_SETTING_KEYS.includes((row.key as string)));

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
    const tx = db.transaction((keys: string[]) => {
      for (const key of keys) {
        if (key === 'feature_flags') {
          for (const sent of pending.filter(row => row.key === key)) {
            settingsSyncSql.acknowledgeFeatureFlags(db).run(sent.tenant_id, sent.value, sent.updated_at);
          }
        } else for (const sent of pending.filter(row => row.key === key)) {
          settingsSyncSql.acknowledgeSettingSnapshot(db).run(sent.tenant_id, key, sent.value, sent.updated_at, sent.row_version);
        }
      }
    });
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
    'enable_party_gst_balance', 'enable_party_estimate_balance',
    'enable_real_paper_stock', 'show_paper_stock_in_gst', 'show_paper_stock_in_estimate',
    'show_zero_paper_stock', 'show_paper_only_products', 'show_price_tiers_in_inventory',
    'show_fully_paid_cash_in_ledger', 'enable_convert_to_gst', 'gst_conversion_tax_inclusive',
    'show_product_gst_badge', 'quotation_gst_enabled', 'business_category',
    'store_country', 'vat_price_inclusive', 'time_format', 'store_timezone', 'bank_name', 'bank_account_number',
    'bank_ifsc', 'bank_branch', 'feature_flags', 'show_cash_register',
    'cash_register_include_scrap_sales', 'cash_register_deduct_returns', 'cash_register_ledger_mode',
    'cash_register_payment_methods', 'auto_open_cash_drawer', 'cash_drawer_auto_close',
    'cash_drawer_auto_close_time', 'default_opening_balance', 'shop_closing_config',
    'auto_whatsapp_send', 'staff_data_masking_config', 'emergency_panic_config',
    // UAE e-invoicing seller identity (src/utils/einvoice/sellerSettings.ts)
    'uae_legal_name', 'uae_tin', 'uae_trade_license_no', 'uae_trade_license_authority',
    'uae_address_street', 'uae_address_city'
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
      const validSettings = rows.filter((s: Record<string, unknown>) => allowedKeys.includes((s.key as string)));
      if (validSettings.length === 0) return 0;

      const tx = db.transaction((settings: Record<string, unknown>[]) => {
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
            updated_at: toSqliteDate((s.updated_at as string | number | Date | null | undefined))
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
