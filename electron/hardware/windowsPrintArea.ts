import { execFile } from 'node:child_process';

export interface ReceiptPrintArea {
  paperWidthMm: number;
  printableWidthMm: number;
  leftMm: number;
}

// Query the selected queue's current DEVMODE through GDI, not a model/roll-width lookup table.
// GetDeviceCaps: HORZRES=8, LOGPIXELSX=88, PHYSICALWIDTH=110, PHYSICALOFFSETX=112.
const query = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NafidPrintCaps {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateDC(string driver, string device, string output, IntPtr mode);
  [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr dc, int index);
  [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr dc);
}
'@
$name = $env:NAFID_PRINT_DEVICE
if (!$name) { $name = (New-Object System.Drawing.Printing.PrinterSettings).PrinterName }
$dc = [NafidPrintCaps]::CreateDC('WINSPOOL', $name, $null, [IntPtr]::Zero)
if ($dc -eq [IntPtr]::Zero) { throw 'Cannot read thermal printer capabilities' }
try {
  @{ dpi = [NafidPrintCaps]::GetDeviceCaps($dc, 88);
     paper = [NafidPrintCaps]::GetDeviceCaps($dc, 110);
     width = [NafidPrintCaps]::GetDeviceCaps($dc, 8);
     left = [NafidPrintCaps]::GetDeviceCaps($dc, 112) } | ConvertTo-Json -Compress
} finally { [void][NafidPrintCaps]::DeleteDC($dc) }
`;

export function parseReceiptPrintArea(output: string): ReceiptPrintArea {
  const caps: unknown = JSON.parse(output.trim().replace(/^\uFEFF/, ''));
  if (!caps || typeof caps !== 'object') throw new Error('Invalid thermal printer capabilities');
  const values = caps as Record<string, unknown>;
  const { dpi, paper, width, left } = values;
  if (typeof dpi !== 'number' || typeof paper !== 'number' || typeof width !== 'number' || typeof left !== 'number'
    || ![dpi, paper, width, left].every(Number.isFinite) || dpi <= 0 || width <= 0 || left < 0 || paper < width + left) {
    throw new Error('Invalid thermal printer capabilities');
  }
  const area = { paperWidthMm: paper * 25.4 / dpi, printableWidthMm: width * 25.4 / dpi, leftMm: left * 25.4 / dpi };
  if (area.paperWidthMm < 30 || area.paperWidthMm > 120 || area.printableWidthMm < 20) {
    throw new Error('Select a thermal roll paper size in Windows printer preferences, then retry the saved bill.');
  }
  return area;
}

/** Reads current settings for every job so changing the roll/driver preferences takes effect immediately. */
export function getReceiptPrintArea(deviceName?: string): Promise<ReceiptPrintArea | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(query, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: 6000, maxBuffer: 65536,
      env: { ...process.env, NAFID_PRINT_DEVICE: deviceName || '' },
    }, (error, stdout) => {
      if (error) return reject(new Error('Could not read the thermal printer printable area. Check Windows printer preferences and retry the saved bill.'));
      try { resolve(parseReceiptPrintArea(stdout)); } catch (cause) { reject(cause); }
    });
  });
}
