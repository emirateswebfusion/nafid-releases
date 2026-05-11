import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb';

function getScaleConfig() {
  try {
    const db = getDb();
    const row: any = db.prepare("SELECT value FROM settings WHERE key = 'scale_config'").get();
    return row ? JSON.parse(row.value) : { path: 'COM3', baudRate: 9600 };
  } catch {
    return { path: 'COM3', baudRate: 9600 };
  }
}

export async function initWeighingScale(mainWindow: BrowserWindow) {
  const config = getScaleConfig();
  try {
    const { SerialPort, ReadlineParser } = await import('serialport');
    
    const port = new SerialPort({ path: config.path, baudRate: config.baudRate || 9600 });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (data: string) => {
      const weightMatch = data.match(/\+?\s*(\d+\.\d+)\s*g?/i);
      if (weightMatch && weightMatch[1]) {
        mainWindow.webContents.send('hardware:scaleWeight', parseFloat(weightMatch[1]));
      }
    });

    port.on('error', (err) => {
      console.error('[Hardware] Weighing Scale SerialPort Error:', err.message);
    });

    console.log(`[Hardware] Weighing Scale listener initialized on ${config.path}`);
  } catch (error: any) {
    console.warn('[Hardware] Native serialport not available. Starting MOCK weighing scale for development.');
    
    // Fallback: Random weight simulation for development
    setInterval(() => {
      const mockWeight = (Math.random() * 500).toFixed(2);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hardware:scaleWeight', parseFloat(mockWeight));
      }
    }, 5000);
  }
}
