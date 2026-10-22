import crypto from 'node:crypto';
import { getDb } from '../db/localDb.js';
import * as lanSql from '../db/statements/lanPairing.js';

/**
 * LAN pairing key: the shared secret that authenticates terminals on the shop network.
 *
 * The primary terminal owns the key (generated on first start of its LAN server) and shows it in
 * Settings → Network; each secondary terminal stores the same key. Every LAN request except `/health`
 * must carry it in the `X-Nafid-Lan-Key` header. The key lives inside the device-local
 * `network_sync_config` setting, which is never synced to the cloud or to other terminals.
 */
export const LAN_KEY_HEADER = 'x-nafid-lan-key';

type NetworkConfig = Record<string, unknown> & { lanPairingKey?: unknown };

function parse(value: unknown): NetworkConfig | null {
  try {
    const v = typeof value === 'string' ? JSON.parse(value) : value;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as NetworkConfig) : null;
  } catch {
    return null;
  }
}

/** Upper-case letters and digits only, so `abcd-efgh` and `ABCDEFGH` are the same key. */
export function normalizeLanKey(key: unknown): string {
  return typeof key === 'string' ? key.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

/** A new human-readable key, e.g. `K7QM-4XTD-9PWA-LC2E` (80 bits, no ambiguous characters). */
export function generateLanKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

/** The key stored on this terminal (primary: the shop key; secondary: the key entered by the user). */
export function getLanPairingKey(): string {
  const rows = lanSql.listNetworkSyncConfigRows(getDb()).all() as { tenant_id: string; value: string }[];
  for (const row of rows) {
    const key = normalizeLanKey(parse(row.value)?.lanPairingKey);
    if (key) return key;
  }
  return '';
}

/** Returns the existing key, or generates one and stores it in every network_sync_config row. */
export function ensureLanPairingKey(): string {
  const existing = getLanPairingKey();
  if (existing) return existing;
  const key = generateLanKey();
  const db = getDb();
  const rows = lanSql.listNetworkSyncConfigRows(db).all() as { tenant_id: string; value: string }[];
  if (rows.length === 0) {
    lanSql.insertNetworkSyncConfig(db).run(JSON.stringify({ lanPairingKey: key }));
  }
  for (const row of rows) {
    const config = parse(row.value) || {};
    lanSql.updateNetworkSyncConfigRow(db).run(JSON.stringify({ ...config, lanPairingKey: key }), row.tenant_id);
  }
  return key;
}

/** Constant-time comparison of a presented key with this terminal's key. */
export function isValidLanKey(presented: unknown): boolean {
  const expected = getLanPairingKey();
  const given = normalizeLanKey(Array.isArray(presented) ? presented[0] : presented);
  if (!expected || !given || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Saving network settings from the UI must not drop the key: when the incoming config has no key,
 * the stored one is kept.
 */
export function withPreservedLanKey<T extends Record<string, unknown>>(incoming: T): T {
  if (normalizeLanKey(incoming.lanPairingKey)) return { ...incoming, lanPairingKey: normalizeLanKey(incoming.lanPairingKey).match(/.{1,4}/g)!.join('-') };
  const stored = getLanPairingKey();
  return stored ? { ...incoming, lanPairingKey: stored.match(/.{1,4}/g)!.join('-') } : incoming;
}
