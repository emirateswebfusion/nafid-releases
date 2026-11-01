import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { readAuthPayload, readOfflineSession } from './authStorage.js';
import { readTrialClaims, trialAccessError } from '../utils/trialAccess.js';
import { getOpenDb } from '../db/localDb.js';
import * as trialSql from '../db/statements/trialAccess.js';

interface TrialCache { token: string; lastSeen: number; blocked?: boolean }
let cache: Record<string, TrialCache> | undefined;
const file = () => path.join(app.getPath('userData'), 'trial-access.enc');
function records(recover = false): Record<string, TrialCache> {
  if (cache) return cache;
  if (!fs.existsSync(file())) return cache = {};
  try {
    const bytes = fs.readFileSync(file());
    const parsed: unknown = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(bytes) : bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid trial cache');
    for (const [tenantId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') throw new Error('Invalid trial cache');
      const record = value as Record<string, unknown>;
      if (typeof record.token !== 'string' || typeof record.lastSeen !== 'number' || !Number.isFinite(record.lastSeen) || readTrialClaims(record.token)?.tenant_id !== tenantId) throw new Error('Invalid trial cache');
    }
    return cache = parsed as Record<string, TrialCache>;
  } catch {
    if (recover) return cache = {};
    throw new Error('Unable to read trial access. Please sign in online.');
  }
}
function persist() {
  const text = JSON.stringify(records());
  const target = file();
  fs.writeFileSync(`${target}.tmp`, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text));
  fs.renameSync(`${target}.tmp`, target);
}

export function rememberTrialToken(token: string) {
  const claims = readTrialClaims(token);
  if (!claims) return;
  const db = getOpenDb();
  if (db) trialSql.rememberTrial(db).run(claims.tenant_id);
  records(true)[claims.tenant_id] = { token, lastSeen: Date.now() };
  persist();
}

export function getTrialAccess(input: { tenant_id: string }) {
  const db = getOpenDb();
  const known = Boolean(db && trialSql.findTrial(db).get(input.tenant_id));
  const auth = readAuthPayload();
  const storedTrial = auth?.jwt_token && readTrialClaims(auth.jwt_token)?.tenant_id === input.tenant_id;
  let record: TrialCache | undefined;
  try { record = records()[input.tenant_id]; }
  catch (error) { if (known || storedTrial) throw error; return { is_trial: false, allowed: true }; }
  if (known || storedTrial || record) {
    if (db && !known) trialSql.rememberTrial(db).run(input.tenant_id);
    if (!record) return { is_trial: true, allowed: false, error: 'Trial access must be verified online. Please sign in again.', token: storedTrial ? auth?.jwt_token : undefined };
  } else return { is_trial: false, allowed: true };
  const claims = readTrialClaims(record.token);
  const now = Date.now();
  const error = record.blocked ? 'Your trial has expired. Contact Nafid to extend or activate your account.' : !claims ? 'Connect to the internet and sign in to verify trial access.' : trialAccessError(claims, now, record.lastSeen);
  if (!error && now - record.lastSeen > 60000) { record.lastSeen = now; persist(); }
  return { is_trial: true, allowed: !error, error: error || undefined, token: record.token, expires_at: claims?.trial_expires_at };
}

export function blockTrialAccess(input: { tenant_id: string }) {
  const record = records()[input.tenant_id];
  if (record) { record.blocked = true; persist(); }
  return { success: true };
}

export function assertTrialAccess(tenantId: string) {
  const result = getTrialAccess({ tenant_id: tenantId });
  if (!result.allowed) throw new Error(result.error);
}

export function assertCurrentTrialAccess() {
  const auth = readAuthPayload();
  const offline = readOfflineSession() as { tenant_id?: string } | null;
  const tenantId = auth?.tenant_id || offline?.tenant_id;
  if (tenantId) assertTrialAccess(tenantId);
}
