import fs from 'fs';
import path from 'path';

/**
 * Kitchen printers of this terminal, by kitchen station. Device-local by construction (a JSON file in the app's
 * user-data folder): a Windows printer name or a LAN printer address only means something on this PC, and the file
 * never enters the settings table, so no sync path can carry it to another terminal.
 */

export type KitchenPrinterTarget =
  | { type: 'none' }
  | { type: 'network'; ip: string; port: number }
  | { type: 'usb'; deviceName: string };

export interface KitchenPrinterConfig {
  /** Roll width in mm: 80 (42 characters) or 58 (32 characters). */
  widthMm: 58 | 80;
  stations: Record<string, KitchenPrinterTarget>;
}

export const DEFAULT_KITCHEN_PRINTER_CONFIG: KitchenPrinterConfig = { widthMm: 80, stations: {} };

let configDir: string | null = null;

/** Folder of the config file; main.ts code paths use Electron's userData, tests set a temp folder. */
export function setKitchenPrinterConfigDir(dir: string): void {
  configDir = dir;
}

async function resolveDir(): Promise<string> {
  if (configDir) return configDir;
  const { app } = await import('electron');
  configDir = app.getPath('userData');
  return configDir;
}

export function normalizeTarget(value: unknown): KitchenPrinterTarget {
  if (!value || typeof value !== 'object') return { type: 'none' };
  const v = value as Record<string, unknown>;
  if (v.type === 'network' && typeof v.ip === 'string' && v.ip.trim()) {
    const port = Number(v.port);
    return { type: 'network', ip: v.ip.trim(), port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 9100 };
  }
  if (v.type === 'usb' && typeof v.deviceName === 'string' && v.deviceName.trim()) return { type: 'usb', deviceName: v.deviceName.trim() };
  return { type: 'none' };
}

export function normalizeConfig(value: unknown): KitchenPrinterConfig {
  if (!value || typeof value !== 'object') return { ...DEFAULT_KITCHEN_PRINTER_CONFIG, stations: {} };
  const v = value as Record<string, unknown>;
  const stations: Record<string, KitchenPrinterTarget> = {};
  if (v.stations && typeof v.stations === 'object') {
    for (const [id, target] of Object.entries(v.stations as Record<string, unknown>)) stations[id] = normalizeTarget(target);
  }
  return { widthMm: Number(v.widthMm) === 58 ? 58 : 80, stations };
}

export async function readKitchenPrinterConfig(): Promise<KitchenPrinterConfig> {
  try {
    const raw = await fs.promises.readFile(path.join(await resolveDir(), 'kitchen-printers.json'), 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_KITCHEN_PRINTER_CONFIG, stations: {} };
  }
}

export async function writeKitchenPrinterConfig(value: unknown): Promise<{ success: true; config: KitchenPrinterConfig }> {
  const config = normalizeConfig(value);
  await fs.promises.writeFile(path.join(await resolveDir(), 'kitchen-printers.json'), JSON.stringify(config, null, 2), 'utf8');
  return { success: true, config };
}
