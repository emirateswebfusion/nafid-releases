import { BrowserWindow } from 'electron';

const BARCODE_MAX_INTERVAL_MS = 50; // Milliseconds between keystrokes to be considered a scanner
const BARCODE_MIN_LENGTH = 2; // Supports short barcodes, e.g. service charge '99', 3-digit barcodes '001', etc.

let buffer = '';
let lastTimestamp = 0;

export function initBarcodeScanner(mainWindow: BrowserWindow) {
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Only capture keydown events to prevent double counting
    if (input.type !== 'keyDown') return;

    const currentTimestamp = Date.now();
    const timeSinceLastKey = currentTimestamp - lastTimestamp;

    // Reset buffer if typing is too slow (it's a human, not a scanner)
    if (timeSinceLastKey > BARCODE_MAX_INTERVAL_MS && buffer.length > 0) {
      buffer = '';
    }

    lastTimestamp = currentTimestamp;

    if (input.key === 'Enter') {
      if (buffer.length >= BARCODE_MIN_LENGTH) {
        // It's a valid barcode scan!
        const scannedCode = buffer;
        console.log(`[Hardware] Barcode Scanned: ${scannedCode}`);
        
        // Broadcast to React
        mainWindow.webContents.send('hardware:barcode', scannedCode);
        
        // Prevent default 'Enter' behavior (like submitting a form prematurely)
        event.preventDefault();
      }
      // Always clear buffer on Enter
      buffer = '';
    } else if (input.key.length === 1) {
      // Append printable characters
      buffer += input.key;
    }
  });

  console.log('[Hardware] Barcode Scanner listener initialized');
}
