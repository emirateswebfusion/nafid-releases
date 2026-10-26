import { api, ensureSuccess, bindBridge } from './client';

export interface SettingKeyPayload {
  tenant_id: string;
  key: string;
}

/**
 * Settings values are stored as strings, but a few are written as JSON
 * objects (`receipt_printer_config`, `print_format`). Use the generic
 * parameter to describe the expected shape at the call site.
 */
export interface ReceiptPrinterConfig {
  receiptWidthCm?: number | string | null;
}

export interface PrintFormatSettings {
  width?: number | string | null;
  receiptFont?: string | null;
  style?: string | null;
  format?: string | null;
  billSettings?: Record<string, unknown> | null;
  scrapBillSettings?: Record<string, unknown> | null;
  showProductOffers?: boolean | null;
  showPriceOverrideMrp?: boolean | null;
  openCashDrawerOnPending?: boolean | null;
}

export async function getSetting<T = unknown>(payload: SettingKeyPayload): Promise<T | null> {
  return (await api().settingsGet(payload)) as T | null;
}

export interface SettingValuePayload {
  tenant_id: string;
  key: string;
  value: unknown;
}

export async function setSetting(payload: SettingValuePayload): Promise<void> {
  ensureSuccess(await api().settingsSet(payload), `setSetting(${payload.key})`);
}

/** Settings whose stored shape is known. Other keys read as `unknown`. */
export interface KnownSettings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  shop_email: string;
  shop_gstin: string;
  shop_state: string;
  shop_website: string;
  bank_name: string;
  bank_account: string;
  bank_ifsc: string;
  bank_branch: string;
  upi_id: string;
  show_upi_qr: boolean | string;
  quotation_gst_enabled: boolean | string;
  print_format: PrintFormatSettings;
  receipt_printer_config: ReceiptPrinterConfig;
  bank_account_number: string;
  nafid_terminology_preset: string;
  nafid_terminology_custom: Record<string, string>;
  price_coding: Record<string, string>;
  loyalty_config: { enabled?: boolean; [key: string]: unknown };
  feature_flags: Record<string, boolean>;
  network_sync_config: { syncMode?: 'CLOUD' | 'LAN' | 'HYBRID'; lanRole?: 'PRIMARY' | 'SECONDARY'; lanHostIp?: string; lanPort?: number; syncFrequency?: string; lanPairingKey?: string };
  upi_page_config: { billing?: boolean; settlement?: boolean; sales_history?: boolean; scrap?: boolean; mobile_billing?: boolean };
}

/** The value `settingsApi.get` resolves to for a key: its known shape (or null when unset), else unknown. */
export type SettingValue<K extends string> = K extends keyof KnownSettings ? KnownSettings[K] | null : unknown;

/** Every setting of a tenant, by key. */
export type SettingsSnapshot = Partial<KnownSettings> & Record<string, unknown>;

const bridge = bindBridge({
  get: 'settingsGet',
  getAll: 'settingsGetAll',
  set: 'settingsSet',
});

/** Key/value settings (per tenant). Channel catalog — the only way UI code reaches these IPC channels. */
export const settingsApi = {
  get: <K extends string>(payload: { tenant_id: string; key: K }) => bridge.get(payload) as Promise<SettingValue<K>>,
  getAll: (payload: { tenant_id: string }) => bridge.getAll(payload) as Promise<SettingsSnapshot>,
  set: bridge.set,
};
