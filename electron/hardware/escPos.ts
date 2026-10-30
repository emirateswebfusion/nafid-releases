import net from 'net';

/** ESC/POS building blocks for network receipt printers: command bytes, text sanitising and the raw TCP send. */
// Generic ESC/POS Hex Commands
export const ESC_INIT = Buffer.from([0x1B, 0x40]); // Initialize Printer
export const ESC_FONT_A = Buffer.from([0x1B, 0x4D, 0x00]); // Select Font A (12 CPI, standard)
export const ESC_DEFAULT_LINE_SPACING = Buffer.from([0x1B, 0x32]); // Set default line spacing
export const ESC_BOLD_ON = Buffer.from([0x1B, 0x45, 0x01]); // ESC E 1 — Emphasized (bold) mode ON
export const ESC_BOLD_OFF = Buffer.from([0x1B, 0x45, 0x00]); // ESC E 0 — Emphasized (bold) mode OFF
export const ESC_DENSITY = Buffer.from([0x1D, 0x28, 0x41, 0x02, 0x00, 0x08, 0x00]); // GS ( A — Max print density (+50%)
export const ESC_CUT = Buffer.from([0x1D, 0x56, 0x00]); // Full Cut
export const ESC_FEED_4 = Buffer.from([0x1B, 0x64, 0x04]); // ESC d 4 — feed 4 lines (clears print head past cutter)
export const ESC_DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]); // Open RJ11 Drawer

export const ESC_POS_HEADER = Buffer.concat([ESC_INIT, ESC_FONT_A, ESC_DEFAULT_LINE_SPACING]);

// For ESC/POS network printers: strip non-ASCII chars that would print as garbage
export function sanitizeForEscPos(text: string): string {
  const withoutQrMarkers = text.replace(/\[\[QR:[^\]]+\]\]\s*/g, '');
  const withoutProminent = withoutQrMarkers.replace(/\[\[PROMINENT:([^\]]+)\]\]/g, '$1');
  return withoutProminent.replace(/[\u{0080}-\u{FFFF}]/gu, (ch) => {
    if (ch === '₹') return 'Rs ';
    if (ch === '\u2588') return '#';  // █ full block
    if (ch === '\u2580') return '^';  // ▀ upper half
    if (ch === '\u2584') return ',';  // ▄ lower half
    return '?';
  });
}

export function sendToNetworkPrinter(host: string, port: number, data: Buffer): Promise<void> {
  // Network printers are always on local networks (192.168.x.x, 10.x.x.x, etc.)
  // We skip the isPrivateIp check here because this is a printer connection, not an outbound HTTP request
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(3000);

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Printer connection timed out'));
    });

    client.connect(port, host, () => {
      client.write(data, () => {
        client.destroy();
        resolve();
      });
    });
  });
}
