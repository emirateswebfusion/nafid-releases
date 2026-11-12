import type { AuthPayload } from './typesB.js';
import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/** Encrypted on-disk persistence of the auth token and offline session. */
export const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
export const getEncryptedPath = () => path.join(app.getPath('userData'), 'auth.enc');
export const getOfflineSessionPath = () => path.join(app.getPath('userData'), 'offline-auth.enc');
export const getTerminalLockPath = () => path.join(app.getPath('userData'), 'terminal.lock');

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

/** Persists the cloud auth payload; omits plaintext config.json whenever OS encryption is available. */
export function writeAuthPayload(plaintext: string): boolean {
  const encrypted = encrypt(plaintext);
  if (safeStorage.isEncryptionAvailable()) {
    if (!encrypted) return false;
    fs.writeFileSync(getEncryptedPath(), encrypted);
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    return true;
  }
  fs.writeFileSync(getConfigPath(), plaintext, 'utf-8');
  if (encrypted) fs.writeFileSync(getEncryptedPath(), encrypted);
  return true;
}

/** Tracks an explicit Lock / Switch User screen so startup does not auto-restore a preserved cloud session. */
export function setTerminalLocked(locked: boolean): void {
  const lockPath = getTerminalLockPath();
  if (locked) {
    fs.writeFileSync(lockPath, '1', 'utf-8');
  } else if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

export function isTerminalLocked(): boolean {
  try {
    return fs.existsSync(getTerminalLockPath());
  } catch {
    return false;
  }
}
