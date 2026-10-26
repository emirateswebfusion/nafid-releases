import type { AuthPayload } from './typesB.js';
import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/** Encrypted on-disk persistence of the auth token and offline session. */
export const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
export const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');
export const getOfflineSessionPath = () => path.join(app.getPath('userData'), 'offline-auth.enc');

export const encrypt = (text: string): Buffer | null => {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Auth] safeStorage unavailable — token will be stored in plaintext on disk');
    return Buffer.from(text);
  }
  return safeStorage.encryptString(text);
};

const decrypt = (data: Buffer): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf-8');
  try {
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
};

export function readAuthPayload(): AuthPayload | null {
  const encPath = getEncryptedPath();
  if (fs.existsSync(encPath)) {
    const raw = fs.readFileSync(encPath);
    const decrypted = decrypt(raw);
    if (decrypted) {
      try { return JSON.parse(decrypted); } catch { /* ignore */ }
    }
  }
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function clearOfflineSession() {
  const offlinePath = getOfflineSessionPath();
  if (fs.existsSync(offlinePath)) fs.unlinkSync(offlinePath);
}

export function readOfflineSession(): unknown {
  const offlinePath = getOfflineSessionPath();
  if (!fs.existsSync(offlinePath)) return null;
  const decrypted = decrypt(fs.readFileSync(offlinePath));
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}
