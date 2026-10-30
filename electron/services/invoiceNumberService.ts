import { profileInvoicePrefix } from '../utils/invoiceNumberPrefix.js';
import { getStoreCountrySetting } from './storeCountryService.js';
import type { ServiceDb, SettingRow } from './typesB.js';
import { readAuthPayload } from './authStorage.js';
import * as invoiceNumberSql from '../db/statements/invoiceNumber.js';

export function getOrInitTerminalCode(db: ServiceDb): string {
  const row: SettingRow = invoiceNumberSql.findOneSettingByKey(db).get('terminal_code') as SettingRow;
  if (row && row.value) {
    try {
      let code = row.value;
      if (typeof code === 'string') {
        code = code.trim().replace(/^["']|["']$/g, '');
        if ((code.startsWith('"') && code.endsWith('"')) || (code.startsWith("'") && code.endsWith("'"))) {
          try { code = JSON.parse(code); } catch { /* ignore */ }
        }
      }
      const clean = String(code).trim().replace(/^["']|["']$/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (clean.length > 0) {
        return clean;
      }
    } catch {
      const raw = String(row.value).trim().replace(/^["']|["']$/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (raw.length > 0) {
        return raw;
      }
    }
  }
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  invoiceNumberSql.upsertSetting(db).run('global', 'terminal_code', JSON.stringify(code));
  return code;
}

export async function requestServerInvoiceNumber(
  db: ServiceDb,
  tenantId: string,
  series: string | undefined,
  configKey: string,
  start?: number,
  timeoutMs: number = 3000
): Promise<{ success: true; invoiceNumber: string } | { success: false; error: string; offline: boolean }> {
  try {
    const terminalCode = getOrInitTerminalCode(db);

    let prefix = getStoreCountrySetting(db, tenantId) === 'AE' && configKey === 'gst_invoice_counter_config' ? 'VAT-' : `${terminalCode}-`;
    if (configKey !== 'invoice_counter_config') {
      const prefixRow: SettingRow = invoiceNumberSql.findSettingsByKey(db).get('global', configKey) as SettingRow;
      if (prefixRow) {
        try {
          const parsed = JSON.parse(prefixRow.value);
          if (parsed?.prefix && /[A-Z0-9]/i.test(parsed.prefix)) {
            prefix = String(parsed.prefix).endsWith('-') ? String(parsed.prefix) : `${parsed.prefix}-`;
          }
        } catch { /* ignore */ }
      }
    }

    prefix = profileInvoicePrefix(getStoreCountrySetting(db, tenantId), configKey, prefix);
    if (series === 'gst_b2b' || series === 'gst_b2c') {
      const tripleSeriesRow: SettingRow = invoiceNumberSql.findSettingsByKey(db).get('global', 'three_invoice_series') as SettingRow;
      const tripleSeries = tripleSeriesRow ? JSON.parse(tripleSeriesRow.value) : null;
      if (tripleSeries && tripleSeries.enabled) {
        const code = series === 'gst_b2b' ? tripleSeries.b2bPrefix : tripleSeries.b2cPrefix;
        if (code) prefix = `${code}-`;
      }
    }

    const config = readAuthPayload();
    const { getSyncEndpoints } = await import('../sync/syncWorker.js');
    const endpoints = getSyncEndpoints();
    const isLan = endpoints.primaryRoute === 'LAN';
    const token = config?.jwt_token || (isLan ? 'lan-local-token' : '');
    if (!token) return { success: false, error: 'No auth token', offline: true };

    const apiUrl = (endpoints.primaryUrl || process.env.VENDORA_CLOUD_API || '').replace(/\/$/, '');
    const search = new URLSearchParams({ terminal_code: terminalCode, prefix });
    if (series) search.set('series', series);
    if (typeof start === 'number' && Number.isFinite(start) && start >= 1) {
      search.set('start', String(Math.floor(start)));
    }
    const url = `${apiUrl}/api/invoices/next-number?${search.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return { success: false, error: `Server returned ${response.status}`, offline: true };
    const data = await response.json();
    if (!data?.invoiceNumber) return { success: false, error: 'Server returned no invoice number', offline: false };

    // Sync local counter to server value so peek and header badge show the correct next number
    const countMatch = String(data.invoiceNumber).match(/(\d+)$/);
    if (countMatch) {
      const serverCounter = parseInt(countMatch[1], 10);
      if (!isNaN(serverCounter)) {
        const row: SettingRow = invoiceNumberSql.findSettingsByKey(db).get('global', configKey) as SettingRow;
        let localCounter = 1;
        if (row) {
          try { localCounter = JSON.parse(row.value).counter || 1; } catch { localCounter = 1; }
        }
        if (serverCounter >= localCounter) {
          const newConfig = { prefix, counter: serverCounter + 1 };
          invoiceNumberSql.upsertSetting2(db).run('global', configKey, JSON.stringify(newConfig));
        }
      }
    }

    return { success: true, invoiceNumber: data.invoiceNumber };
  } catch (error) {
    console.error('[requestServerInvoiceNumber]', error);
    return { success: false, error: 'Operation failed', offline: true };
  }
}


export function getGuaranteedNextInvoiceNumber(
  db: ServiceDb,
  tenantId: string,
  configKey: string = 'invoice_counter_config',
  overrideDefaultPrefix?: string
): { invoiceNumber: string; counter: number; prefix: string } {
  const terminalCode = getOrInitTerminalCode(db);
  const fallbackPrefix = (
    configKey === 'gst_b2b_invoice_counter_config' ? 'B2B-' :
    configKey === 'gst_b2c_invoice_counter_config' ? 'B2C-' :
    configKey === 'gst_invoice_counter_config' ? 'GST-' :
    `${terminalCode}-`
  );
  const defaultPrefix = overrideDefaultPrefix || fallbackPrefix;

  const row: SettingRow = invoiceNumberSql.findSettingsByKey(db).get('global', configKey) as SettingRow;
  let counter = 1;
  let prefix = defaultPrefix;

  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      counter = typeof parsed.counter === 'number' && parsed.counter > 0 ? parsed.counter : 1;
      if (configKey === 'invoice_counter_config') {
        prefix = defaultPrefix;
      } else if (parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix)) {
        prefix = parsed.prefix.endsWith('-') ? parsed.prefix : `${parsed.prefix}-`;
      }
    } catch {
      counter = 1;
    }
  }

  prefix = profileInvoicePrefix(getStoreCountrySetting(db, tenantId), configKey, prefix);
  const checkStmt = invoiceNumberSql.findOneInvoiceByInvoiceNumber(db);
  let candidate = `${prefix}${String(counter).padStart(3, '0')}`;

  while (checkStmt.get(tenantId || 'global', candidate)) {
    counter++;
    candidate = `${prefix}${String(counter).padStart(3, '0')}`;
  }

  const nextConfig = { prefix, counter: counter + 1 };
  invoiceNumberSql.upsertSetting3(db).run(configKey, JSON.stringify(nextConfig));

  return { invoiceNumber: candidate, counter, prefix };
}

export function peekGuaranteedNextInvoiceNumber(
  db: ServiceDb,
  tenantId: string,
  configKey: string = 'invoice_counter_config',
  overrideDefaultPrefix?: string
): { invoiceNumber: string; counter: number; prefix: string } {
  const terminalCode = getOrInitTerminalCode(db);
  const fallbackPrefix = (
    configKey === 'gst_b2b_invoice_counter_config' ? 'B2B-' :
    configKey === 'gst_b2c_invoice_counter_config' ? 'B2C-' :
    configKey === 'gst_invoice_counter_config' ? 'GST-' :
    `${terminalCode}-`
  );
  const defaultPrefix = overrideDefaultPrefix || fallbackPrefix;

  const row: SettingRow = invoiceNumberSql.findSettingsByKey(db).get('global', configKey) as SettingRow;
  let counter = 1;
  let prefix = defaultPrefix;

  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      counter = typeof parsed.counter === 'number' && parsed.counter > 0 ? parsed.counter : 1;
      if (configKey === 'invoice_counter_config') {
        prefix = defaultPrefix;
      } else if (parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix)) {
        prefix = parsed.prefix.endsWith('-') ? parsed.prefix : `${parsed.prefix}-`;
      }
    } catch {
      counter = 1;
    }
  }

  prefix = profileInvoicePrefix(getStoreCountrySetting(db, tenantId), configKey, prefix);
  const checkStmt = invoiceNumberSql.findOneInvoiceByInvoiceNumber(db);
  let candidate = `${prefix}${String(counter).padStart(3, '0')}`;

  while (checkStmt.get(tenantId || 'global', candidate)) {
    counter++;
    candidate = `${prefix}${String(counter).padStart(3, '0')}`;
  }

  return { invoiceNumber: candidate, counter, prefix };
}


