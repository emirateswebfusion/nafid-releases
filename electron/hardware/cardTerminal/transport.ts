import net from 'node:net';
import type { TerminalConnection } from './types.js';

/** Physical link to the card machine (USB/serial COM port or LAN socket), shared by the acquirer adapters. */

export interface SerialPortInfo { path: string; manufacturer?: string }

/** COM ports Windows reports, for the settings picker. Empty when the native serialport module is unavailable. */
export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  try {
    const { SerialPort } = (await import('serialport')) as typeof import('serialport');
    const ports = await SerialPort.list();
    return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer || undefined }));
  } catch {
    return [];
  }
}

/** Opens and closes the configured link once: proves the cable / IP is right before any payment is sent. */
export async function checkConnection(connection: TerminalConnection, timeoutMs = 5000): Promise<{ ok: boolean; message: string }> {
  if (connection.type === 'TCP') {
    return new Promise(resolve => {
      const socket = net.createConnection({ host: connection.host, port: connection.port });
      const done = (ok: boolean, message: string) => { socket.destroy(); resolve({ ok, message }); };
      socket.setTimeout(timeoutMs, () => done(false, `No answer from ${connection.host}:${connection.port}`));
      socket.once('connect', () => done(true, `Connected to ${connection.host}:${connection.port}`));
      socket.once('error', err => done(false, err.message));
    });
  }
  try {
    const { SerialPort } = (await import('serialport')) as typeof import('serialport');
    const port = new SerialPort({ path: connection.path, baudRate: connection.baudRate || 9600, autoOpen: false });
    await new Promise<void>((resolve, reject) => port.open(err => (err ? reject(err) : resolve())));
    await new Promise<void>(resolve => port.close(() => resolve()));
    return { ok: true, message: `${connection.path} opened` };
  } catch (err) {
    return { ok: false, message: (err as Error).message || 'Serial port unavailable' };
  }
}
