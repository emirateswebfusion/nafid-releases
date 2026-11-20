export const PLATFORM_LOGIN_ERROR = 'Super Admin login is restricted to the Central Web Portal.';
/** Rejection only: decoding does not authenticate a token or grant any shop permission. */
export function isPlatformSession(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (String(row.role ?? '').trim().toUpperCase() === 'SUPER_ADMIN' || row.tenant_id === 'SYSTEM') return true;
  if (typeof row.jwt_token === 'string') {
    try {
      const claims: unknown = JSON.parse(Buffer.from(row.jwt_token.split('.')[1], 'base64url').toString('utf8'));
      return Boolean(claims && typeof claims === 'object'
        && (String((claims as Record<string, unknown>).role ?? '').trim().toUpperCase() === 'SUPER_ADMIN'
          || (claims as Record<string, unknown>).tenant_id === 'SYSTEM'));
    } catch { /* Existing shop token validation remains with its normal authentication owner. */ }
  }
  return false;
}
