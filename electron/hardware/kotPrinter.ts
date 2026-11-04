import { ESC_BOLD_OFF, ESC_BOLD_ON, ESC_CUT, ESC_DENSITY, ESC_FEED_4, ESC_POS_HEADER, sanitizeForEscPos, sendToNetworkPrinter } from './escPos.js';
import { printTextOnSystemPrinter } from './printer.js';
import type { KitchenPrinterTarget } from '../services/kitchenPrinterConfig.js';

/** ESC GS ! 0x01: double height for the ticket text, so the kitchen can read it from a distance. */
const DOUBLE_HEIGHT_ON = Buffer.from([0x1D, 0x21, 0x01]);
const DOUBLE_HEIGHT_OFF = Buffer.from([0x1D, 0x21, 0x00]);

/** Sends one kitchen ticket to a LAN (ESC/POS, port 9100) or Windows printer. Throws when the printer fails. */
export async function printKitchenTicket(target: KitchenPrinterTarget, text: string, widthMm: number, tenantId: string): Promise<void> {
  if (target.type === 'network') {
    const body = Buffer.from(sanitizeForEscPos(`${text}\n\n`), 'ascii');
    await sendToNetworkPrinter(target.ip, target.port, Buffer.concat([
      ESC_POS_HEADER, ESC_DENSITY, ESC_BOLD_ON, DOUBLE_HEIGHT_ON, body, DOUBLE_HEIGHT_OFF, ESC_BOLD_OFF, ESC_FEED_4, ESC_CUT,
    ]));
    return;
  }
  if (target.type === 'usb') {
    await printTextOnSystemPrinter(target.deviceName, text, widthMm, tenantId);
    return;
  }
  throw new Error('No kitchen printer is set for this station on this terminal');
}
