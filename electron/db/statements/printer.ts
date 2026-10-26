import type { Db } from './types.js';

/** SQL statements used by hardware/printer.ts. Each factory prepares its statement on the given connection. */

export const findSettingsByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = ?");

export const findSettingsByKeyValue = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = ?");

export const findOneSettingByKey = (db: Db) => db.prepare("SELECT value FROM settings WHERE key = ? ORDER BY updated_at DESC LIMIT 1");

export const findSettingsByKeyPrinterConfig = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'printer_config'");

export const findSettingsByKeyPrinterConfig2 = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'printer_config'");

export const findOneSettingByKeyPrinterConfig = (db: Db) => db.prepare("SELECT value FROM settings WHERE key = 'printer_config' ORDER BY updated_at DESC LIMIT 1");

export const findSettingsByKeyPrintFormat = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'print_format'");

export const findSettingsByKeyLabelCodeType = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'label_code_type'");

export const findSettingsByKeyA4PrinterConfig = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = 'a4_printer_config'");

export const findSettingsByKeyA4PrinterConfig2 = (db: Db) => db.prepare("SELECT value FROM settings WHERE tenant_id = 'global' AND key = 'a4_printer_config'");

export const findOneSettingByKeyA4PrinterConfig = (db: Db) => db.prepare("SELECT value FROM settings WHERE key = 'a4_printer_config' ORDER BY updated_at DESC LIMIT 1");
