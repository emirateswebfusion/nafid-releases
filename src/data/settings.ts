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

/** Key/value settings (per tenant). Channel catalog — the only way UI code reaches these IPC channels. */
export const settingsApi = bindBridge({
  get: 'settingsGet',
  getAll: 'settingsGetAll',
  set: 'settingsSet',
});
