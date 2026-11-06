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

export const decrypt = (data: Buffer): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf-8');
  try {
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
};

/** Both UI and sync use this reader; malformed/unreadable encrypted storage may use the valid legacy fallback. */
export function readAuthPayload(): AuthPayload | null {
  for (const [file, encrypted] of [[getEncryptedPath(), true], [getConfigPath(), false]] as const) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file);
      const text = encrypted ? decrypt(raw) : raw.toString('utf-8');
      if (!text) continue;
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as AuthPayload;
    } catch { /* Try the other stored representation, without exposing credentials. */ }
  }
  return null;
}

export function clearOfflineSession() {
  const offlinePath = getOfflineSessionPath();
  if (fs.existsSync(offlinePath)) fs.unlinkSync(offlinePath);
}

export function readOfflineSession(): unknown {
  try {
    const offlinePath = getOfflineSessionPath();
    if (!fs.existsSync(offlinePath)) return null;
    const decrypted = decrypt(fs.readFileSync(offlinePath));
    return decrypted ? JSON.parse(decrypted) as unknown : null;
  } catch { return null; }
}
