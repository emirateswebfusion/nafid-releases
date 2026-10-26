/**
 * Placeholder "token" used when there is no cloud login: a LAN peer terminal (which authenticates to the LAN host
 * with the pairing key) or an offline login. The cloud never accepts it.
 */
export const LAN_PLACEHOLDER_TOKEN = 'lan-local-token';

/**
 * True when `token` cannot be used for the cloud: missing, the LAN placeholder, or a JWT whose `exp` has passed.
 * Callers decide LAN separately (the LAN route never needs a cloud token).
 *
 * Until 2026-10-23 the placeholder counted as usable, so a terminal with no cloud login (offline login, or no login
 * at all with a tenant id taken from the local database) ran cloud sync with a fake bearer token.
 * A token that is not a parseable JWT is still treated as usable, as before.
 */
export function cloudTokenUnusable(token: string): boolean {
  if (!token) return true;
  if (token === LAN_PLACEHOLDER_TOKEN) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return payload.exp ? payload.exp * 1000 < Date.now() : false;
  } catch {
    return false;
  }
}
